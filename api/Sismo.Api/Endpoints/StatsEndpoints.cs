using System.ComponentModel;
using Sismo.Api.Data;
using Sismo.Api.Domain;

namespace Sismo.Api.Endpoints;

public sealed record MagnitudeBucket(string Label, double Min, double? Max, int Count);
public sealed record SeriesPoint(DateTime StartUtc, int Count);
public sealed record ProvinceCount(string Province, int Count);

public sealed record StatsDto(
    string Range,
    int Total,
    EarthquakeDto? Largest,
    IReadOnlyList<MagnitudeBucket> ByMagnitude,
    string SeriesUnit,
    IReadOnlyList<SeriesPoint> Series,
    IReadOnlyList<ProvinceCount> TopProvinces);

public static class StatsEndpoints
{
    // Türkiye has been on fixed UTC+3 since 2016. Day buckets follow the local calendar day.
    private static readonly TimeSpan TurkeyOffset = TimeSpan.FromHours(3);

    private static readonly (string Label, double Min, double? Max)[] Buckets =
    [
        ("<2", 0, 2), ("2–2.9", 2, 3), ("3–3.9", 3, 4), ("4–4.9", 4, 5), ("5+", 5, null),
    ];

    public static RouteGroupBuilder MapStatsEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/stats", GetAsync)
            .WithName("GetStats")
            .WithSummary("Summary statistics")
            .WithDescription("Accepts the same filters as /api/earthquakes. Series is hourly for 24h, daily otherwise.")
            .Produces<StatsDto>()
            .ProducesValidationProblem();
        return api;
    }

    private static async Task<IResult> GetAsync(
        AppDbContext db, TimeProvider time, CancellationToken ct,
        [Description("24h (default), 7d or 30d")] string? range = null,
        [Description("Minimum magnitude, 0–9")] string? minMag = null,
        [Description("Province name")] string? province = null,
        [Description("Centre latitude for radius search")] string? lat = null,
        [Description("Centre longitude for radius search")] string? lon = null,
        [Description("Radius in km, at most 500")] string? radiusKm = null)
    {
        if (!EarthquakeFilter.TryParse(range, minMag, province, lat, lon, radiusKm, out var filter, out var errors))
            return TypedResults.ValidationProblem(errors);

        var now = time.GetUtcNow().UtcDateTime;
        var quakes = (await filter.ApplyAsync(db, now, ct)).Select(x => x.Quake).ToList();

        var largest = quakes.OrderByDescending(e => e.Magnitude).ThenByDescending(e => e.OccurredAtUtc).FirstOrDefault();

        var byMag = Buckets
            .Select(b => new MagnitudeBucket(b.Label, b.Min, b.Max,
                quakes.Count(e => e.Magnitude >= b.Min && (b.Max is null || e.Magnitude < b.Max))))
            .ToList();

        var hourly = filter.Range == QuakeRange.Day;
        var series = hourly ? HourlySeries(quakes, now) : DailySeries(quakes, now, (int)filter.Span.TotalDays);

        var top = quakes.Where(e => e.Province is not null)
            .GroupBy(e => e.Province!)
            .Select(g => new ProvinceCount(g.Key, g.Count()))
            .OrderByDescending(p => p.Count).ThenBy(p => p.Province, StringComparer.Ordinal)
            .Take(5)
            .ToList();

        var rangeKey = filter.Range switch { QuakeRange.Week => "7d", QuakeRange.Month => "30d", _ => "24h" };
        return TypedResults.Ok(new StatsDto(rangeKey, quakes.Count,
            largest is null ? null : EarthquakeDto.From(largest),
            byMag, hourly ? "hour" : "day", series, top));
    }

    /// <summary>24 buckets, the last one is the current (partial) hour.</summary>
    private static List<SeriesPoint> HourlySeries(List<Earthquake> quakes, DateTime now)
    {
        var currentHour = new DateTime(now.Year, now.Month, now.Day, now.Hour, 0, 0, DateTimeKind.Utc);
        var first = currentHour.AddHours(-23);
        var counts = quakes
            .Where(e => e.OccurredAtUtc >= first)
            .GroupBy(e => (int)(e.OccurredAtUtc - first).TotalHours)
            .ToDictionary(g => g.Key, g => g.Count());
        return Enumerable.Range(0, 24)
            .Select(i => new SeriesPoint(first.AddHours(i), counts.GetValueOrDefault(i)))
            .ToList();
    }

    /// <summary>One bucket per Türkiye calendar day; the last one is today.</summary>
    private static List<SeriesPoint> DailySeries(List<Earthquake> quakes, DateTime now, int days)
    {
        var todayLocal = (now + TurkeyOffset).Date;
        var firstLocal = todayLocal.AddDays(-(days - 1));
        var counts = quakes
            .GroupBy(e => (int)((e.OccurredAtUtc + TurkeyOffset).Date - firstLocal).TotalDays)
            .ToDictionary(g => g.Key, g => g.Count());
        return Enumerable.Range(0, days)
            .Select(i => new SeriesPoint(DateTime.SpecifyKind(firstLocal.AddDays(i) - TurkeyOffset, DateTimeKind.Utc),
                counts.GetValueOrDefault(i)))
            .ToList();
    }
}
