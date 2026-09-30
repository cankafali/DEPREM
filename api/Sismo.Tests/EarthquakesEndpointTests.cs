using System.Net;
using System.Net.Http.Json;
using System.Text.Json;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Time.Testing;
using Sismo.Api.Afad;
using Sismo.Api.Data;
using Sismo.Api.Domain;
using Sismo.Api.Endpoints;
using Sismo.Api.Realtime;

namespace Sismo.Tests;

public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public static readonly DateTime Now = new(2026, 9, 30, 12, 0, 0, DateTimeKind.Utc);
    private readonly TestDatabase _db = new();

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        builder.UseEnvironment("Testing");
        builder.UseSetting("Sync:Enabled", "false");
        builder.UseSetting("RateLimit:PermitPerMinute", "100000");
        builder.ConfigureServices(services =>
        {
            services.RemoveAll<DbContextOptions<AppDbContext>>();
            services.RemoveAll<IDbContextOptionsConfiguration<AppDbContext>>();
            services.AddDbContext<AppDbContext>(o => o.UseSqlite(_db.Connection));
            services.AddSingleton<TimeProvider>(new FakeTimeProvider(new DateTimeOffset(Now)));
            services.AddSingleton<IAfadClient, FakeAfadClient>();
            services.AddSingleton<IQuakeNotifier, RecordingNotifier>();
        });
    }

    public void Seed(params Earthquake[] quakes)
    {
        using var db = _db.CreateContext();
        db.Earthquakes.AddRange(quakes);
        db.SaveChanges();
    }

    protected override void Dispose(bool disposing)
    {
        base.Dispose(disposing);
        if (disposing) _db.Dispose();
    }
}

public sealed class EarthquakesEndpointTests : IClassFixture<EarthquakesEndpointTests.Fixture>
{
    public sealed class Fixture : IDisposable
    {
        public ApiFactory Factory { get; } = new();
        public HttpClient Client { get; }

        public Fixture()
        {
            Client = Factory.CreateClient();
            var n = ApiFactory.Now;
            Factory.Seed(
                // İzmir (38.42, 27.14) area
                Quakes.Make("izmir-1", n.AddHours(-1), 2.4, 38.40, 27.10, "İzmir"),
                Quakes.Make("izmir-2", n.AddHours(-5), 4.1, 38.60, 26.80, "İzmir"),
                // Malatya, far away
                Quakes.Make("malatya-1", n.AddHours(-2), 3.2, 38.35, 38.31, "Malatya"),
                Quakes.Make("malatya-2", n.AddDays(-3), 5.0, 38.20, 38.50, "Malatya"),
                // older than a week
                Quakes.Make("old-1", n.AddDays(-20), 1.1, 40.0, 29.0, "Bursa"),
                // older than 30 days (still in DB until cleanup)
                Quakes.Make("ancient", n.AddDays(-31), 6.0, 40.0, 29.0, "Bursa"));
        }

        public void Dispose()
        {
            Client.Dispose();
            Factory.Dispose();
        }
    }

    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);
    private readonly HttpClient _client;

    public EarthquakesEndpointTests(Fixture f) => _client = f.Client;

    private async Task<List<EarthquakeDto>> ListAsync(string query)
    {
        var res = await _client.GetAsync($"/api/earthquakes{query}");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
        return (await res.Content.ReadFromJsonAsync<List<EarthquakeDto>>(Json))!;
    }

    [Fact]
    public async Task Default_range_is_24h_newest_first()
    {
        var list = await ListAsync("");
        Assert.Equal(["izmir-1", "malatya-1", "izmir-2"], list.Select(e => e.Id));
        Assert.All(list, e => Assert.Null(e.DistanceKm));
    }

    [Theory]
    [InlineData("?range=7d", 4)]
    [InlineData("?range=30d", 5)]
    [InlineData("?range=30D", 5)]
    public async Task Range_widens_the_window(string query, int expected)
    {
        Assert.Equal(expected, (await ListAsync(query)).Count);
    }

    [Fact]
    public async Task MinMag_is_inclusive()
    {
        var list = await ListAsync("?range=7d&minMag=4.1");
        Assert.Equal(["izmir-2", "malatya-2"], list.Select(e => e.Id));
    }

    [Theory]
    [InlineData("İzmir")]
    [InlineData("izmir")]
    [InlineData("İZMİR")]
    public async Task Province_matches_with_turkish_casing(string province)
    {
        var list = await ListAsync($"?province={Uri.EscapeDataString(province)}");
        Assert.Equal(2, list.Count);
        Assert.All(list, e => Assert.Equal("İzmir", e.Province));
    }

    [Fact]
    public async Task Radius_search_filters_precisely_and_adds_distance()
    {
        // izmir-1 is ~4 km away, izmir-2 is ~37 km away.
        var list = await ListAsync("?lat=38.42&lon=27.14&radiusKm=10");
        var only = Assert.Single(list);
        Assert.Equal("izmir-1", only.Id);
        Assert.NotNull(only.DistanceKm);
        Assert.InRange(only.DistanceKm!.Value, 3, 6);

        var wider = await ListAsync("?lat=38.42&lon=27.14&radiusKm=50");
        Assert.Equal(2, wider.Count);
    }

    [Fact]
    public async Task Sort_by_magnitude()
    {
        var list = await ListAsync("?range=7d&sort=magnitude");
        Assert.Equal([5.0, 4.1, 3.2, 2.4], list.Select(e => e.Magnitude));
    }

    [Theory]
    [InlineData("?range=30d&limit=1", 1)]
    [InlineData("?range=30d&limit=2000", 5)]
    public async Task Limit_bounds(string query, int expected)
    {
        Assert.Equal(expected, (await ListAsync(query)).Count);
    }

    [Theory]
    [InlineData("?range=1y", "range")]
    [InlineData("?minMag=-1", "minMag")]
    [InlineData("?minMag=9.5", "minMag")]
    [InlineData("?minMag=abc", "minMag")]
    [InlineData("?lat=38&lon=27&radiusKm=501", "radiusKm")]
    [InlineData("?lat=38&lon=27", "radius")]
    [InlineData("?lat=91&lon=27&radiusKm=10", "lat")]
    [InlineData("?sort=depth", "sort")]
    [InlineData("?limit=0", "limit")]
    [InlineData("?limit=2001", "limit")]
    [InlineData("?limit=ten", "limit")]
    public async Task Invalid_parameters_return_400_problem_details(string query, string field)
    {
        var res = await _client.GetAsync($"/api/earthquakes{query}");
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
        Assert.Equal("application/problem+json", res.Content.Headers.ContentType?.MediaType);
        var body = await res.Content.ReadFromJsonAsync<JsonElement>();
        Assert.True(body.GetProperty("errors").TryGetProperty(field, out _), $"expected error for '{field}'");
    }

    [Theory]
    [InlineData("?minMag=0")]
    [InlineData("?minMag=9")]
    [InlineData("?lat=38&lon=27&radiusKm=500")]
    public async Task Boundary_values_are_accepted(string query)
    {
        var res = await _client.GetAsync($"/api/earthquakes{query}");
        Assert.Equal(HttpStatusCode.OK, res.StatusCode);
    }

    [Fact]
    public async Task Get_by_id()
    {
        var e = await _client.GetFromJsonAsync<EarthquakeDto>("/api/earthquakes/malatya-1", Json);
        Assert.Equal(3.2, e!.Magnitude);
        Assert.Equal(DateTimeKind.Utc, e.OccurredAtUtc.Kind);
    }

    [Fact]
    public async Task Unknown_id_returns_404_problem()
    {
        var res = await _client.GetAsync("/api/earthquakes/does-not-exist");
        Assert.Equal(HttpStatusCode.NotFound, res.StatusCode);
        Assert.Equal("application/problem+json", res.Content.Headers.ContentType?.MediaType);
    }

    [Fact]
    public async Task Stats_summarise_the_range()
    {
        var s = await _client.GetFromJsonAsync<StatsDto>("/api/stats?range=7d", Json);
        Assert.Equal(4, s!.Total);
        Assert.Equal("malatya-2", s.Largest!.Id);
        Assert.Equal("day", s.SeriesUnit);
        Assert.Equal(7, s.Series.Count);
        Assert.Equal(4, s.Series.Sum(p => p.Count));
        Assert.Equal(4, s.ByMagnitude.Sum(b => b.Count));
        Assert.Equal(1, s.ByMagnitude.Single(b => b.Label == "5+").Count);
        Assert.Equal(["İzmir", "Malatya"], s.TopProvinces.Select(p => p.Province).Order());
    }

    [Fact]
    public async Task Stats_24h_are_hourly()
    {
        var s = await _client.GetFromJsonAsync<StatsDto>("/api/stats", Json);
        Assert.Equal("hour", s!.SeriesUnit);
        Assert.Equal(24, s.Series.Count);
        Assert.Equal(3, s.Series.Sum(p => p.Count));
    }

    [Fact]
    public async Task Stats_reject_invalid_range()
    {
        var res = await _client.GetAsync("/api/stats?range=5y");
        Assert.Equal(HttpStatusCode.BadRequest, res.StatusCode);
    }

    [Fact]
    public async Task Provinces_are_sorted_distinct()
    {
        var list = await _client.GetFromJsonAsync<List<string>>("/api/provinces");
        Assert.Equal(["Bursa", "İzmir", "Malatya"], list);
    }

    [Fact]
    public async Task Health_reports_count()
    {
        var body = await _client.GetFromJsonAsync<JsonElement>("/health");
        Assert.Equal(6, body.GetProperty("earthquakeCount").GetInt32());
        Assert.Equal("degraded", body.GetProperty("status").GetString()); // sync never ran in tests
    }

    [Fact]
    public async Task Cors_allows_only_configured_origin()
    {
        var ok = new HttpRequestMessage(HttpMethod.Get, "/api/provinces");
        ok.Headers.Add("Origin", "http://localhost:5173");
        var res = await _client.SendAsync(ok);
        Assert.Equal("http://localhost:5173", res.Headers.GetValues("Access-Control-Allow-Origin").Single());

        var bad = new HttpRequestMessage(HttpMethod.Get, "/api/provinces");
        bad.Headers.Add("Origin", "https://evil.example");
        res = await _client.SendAsync(bad);
        Assert.False(res.Headers.Contains("Access-Control-Allow-Origin"));
    }
}
