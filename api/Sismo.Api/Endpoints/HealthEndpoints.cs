using Microsoft.EntityFrameworkCore;
using Sismo.Api.Data;
using Sismo.Api.Sync;

namespace Sismo.Api.Endpoints;

public sealed record HealthDto(
    string Status,
    DateTime? LastSyncUtc,
    DateTime? LastAttemptUtc,
    string? LastError,
    int EarthquakeCount);

public static class HealthEndpoints
{
    public static IEndpointRouteBuilder MapHealthEndpoints(this IEndpointRouteBuilder app)
    {
        app.MapGet("/health", async (AppDbContext db, SyncState sync, TimeProvider time, CancellationToken ct) =>
            {
                var count = await db.Earthquakes.CountAsync(ct);
                var now = time.GetUtcNow().UtcDateTime;
                var fresh = sync.LastSuccessUtc is { } t && now - t < TimeSpan.FromMinutes(5);
                return TypedResults.Ok(new HealthDto(fresh ? "ok" : "degraded",
                    sync.LastSuccessUtc, sync.LastAttemptUtc, sync.LastError, count));
            })
            .WithName("Health")
            .WithSummary("Service status, last successful AFAD sync and record count")
            .Produces<HealthDto>();
        return app;
    }
}
