using System.Threading.RateLimiting;
using Microsoft.AspNetCore.HttpOverrides;
using Microsoft.EntityFrameworkCore;
using Scalar.AspNetCore;
using Sismo.Api.Afad;
using Sismo.Api.Data;
using Sismo.Api.Endpoints;
using Sismo.Api.Realtime;
using Sismo.Api.Sync;

var builder = WebApplication.CreateBuilder(args);
var config = builder.Configuration;

builder.Services.AddSingleton(TimeProvider.System);
builder.Services.AddDbContext<AppDbContext>(o =>
    o.UseSqlite(config.GetConnectionString("Default") ?? "Data Source=sismo.db"));

// AFAD
builder.Services.AddHttpClient<IAfadClient, AfadClient>(http =>
    {
        http.BaseAddress = new Uri(config["Afad:BaseUrl"]!);
        http.DefaultRequestHeaders.UserAgent.ParseAdd(config["Afad:UserAgent"]);
        http.Timeout = Timeout.InfiniteTimeSpan; // the resilience pipeline owns timeouts
    })
    .AddStandardResilienceHandler(o =>
    {
        // The 30-day backfill is ~3 MB; give a single attempt room to finish.
        o.AttemptTimeout.Timeout = TimeSpan.FromSeconds(45);
        o.TotalRequestTimeout.Timeout = TimeSpan.FromSeconds(120);
        o.CircuitBreaker.SamplingDuration = TimeSpan.FromSeconds(120);
        o.Retry.MaxRetryAttempts = 2;
    });

// Sync
builder.Services.Configure<SyncOptions>(config.GetSection("Sync"));
builder.Services.AddSingleton<SyncState>();
builder.Services.AddSingleton<SyncService>();
if (config.GetValue("Sync:Enabled", true))
    builder.Services.AddHostedService(sp => sp.GetRequiredService<SyncService>());

// Realtime
builder.Services.AddSignalR();
builder.Services.AddSingleton<IQuakeNotifier, HubQuakeNotifier>();

// HTTP concerns
builder.Services.AddProblemDetails();
builder.Services.AddOpenApi();
builder.Services.AddOutputCache(o =>
    o.AddPolicy("quakes", p => p
        .Expire(TimeSpan.FromSeconds(30))
        .SetVaryByQuery("*")
        .SetVaryByHeader("Origin") // cached CORS headers must match the caller
        .Tag(HubQuakeNotifier.CacheTag)));

var permitPerMinute = config.GetValue("RateLimit:PermitPerMinute", 60);
builder.Services.AddRateLimiter(o =>
{
    o.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    o.AddPolicy("per-ip", ctx => RateLimitPartition.GetFixedWindowLimiter(
        ctx.Connection.RemoteIpAddress?.ToString() ?? "unknown",
        _ => new FixedWindowRateLimiterOptions { PermitLimit = permitPerMinute, Window = TimeSpan.FromMinutes(1) }));
});

var origins = config.GetSection("Cors:Origins").Get<string[]>() ?? [];
builder.Services.AddCors(o => o.AddDefaultPolicy(p => p
    .WithOrigins(origins)
    .AllowAnyHeader()
    .WithMethods("GET", "POST") // POST is only used by SignalR negotiate
    .AllowCredentials()));

builder.Services.Configure<ForwardedHeadersOptions>(o =>
{
    // Render / Fly.io terminate TLS in front of us; trust their X-Forwarded-For so rate limiting sees real IPs.
    o.ForwardedHeaders = ForwardedHeaders.XForwardedFor | ForwardedHeaders.XForwardedProto;
    o.KnownIPNetworks.Clear();
    o.KnownProxies.Clear();
});

var app = builder.Build();

using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();
    if (db.Database.IsRelational()) db.Database.Migrate();
}

app.UseForwardedHeaders();
app.UseExceptionHandler();
app.UseStatusCodePages();
app.UseCors();
app.UseRateLimiter();
app.UseOutputCache();

app.MapOpenApi();
app.MapScalarApiReference("/docs", o => o.WithTitle("Sismo API"));
app.MapGet("/", () => Results.Redirect("/docs")).ExcludeFromDescription();

app.MapGroup("/api")
    .RequireRateLimiting("per-ip")
    .CacheOutput("quakes")
    .WithTags("Earthquakes")
    .MapEarthquakeEndpoints()
    .MapStatsEndpoints();

app.MapHealthEndpoints();
app.MapHub<QuakesHub>("/hubs/quakes");

app.Run();

public partial class Program;
