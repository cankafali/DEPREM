using System.ComponentModel;
using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Sismo.Api.Data;
using Sismo.Api.Domain;

namespace Sismo.Api.Endpoints;

public static class EarthquakeEndpoints
{
    public const int DefaultLimit = 500;
    public const int MaxLimit = 2000;
    private static readonly CultureInfo Tr = CultureInfo.GetCultureInfo("tr-TR");

    public static RouteGroupBuilder MapEarthquakeEndpoints(this RouteGroupBuilder api)
    {
        api.MapGet("/earthquakes", ListAsync)
            .WithName("ListEarthquakes")
            .WithSummary("List earthquakes")
            .WithDescription("Newest first by default. Radius search adds `distanceKm` to every item.")
            .Produces<List<EarthquakeDto>>()
            .ProducesValidationProblem();

        api.MapGet("/earthquakes/{id}", GetAsync)
            .WithName("GetEarthquake")
            .WithSummary("Get one earthquake by AFAD event id")
            .Produces<EarthquakeDto>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        api.MapGet("/provinces", ProvincesAsync)
            .WithName("ListProvinces")
            .WithSummary("Provinces present in the stored data (last 30 days)")
            .Produces<List<string>>();

        return api;
    }

    private static async Task<IResult> ListAsync(
        AppDbContext db, TimeProvider time, CancellationToken ct,
        [Description("24h (default), 7d or 30d")] string? range = null,
        [Description("Minimum magnitude, 0–9")] string? minMag = null,
        [Description("Province name, case-insensitive (Turkish rules)")] string? province = null,
        [Description("Centre latitude for radius search")] string? lat = null,
        [Description("Centre longitude for radius search")] string? lon = null,
        [Description("Radius in km, at most 500")] string? radiusKm = null,
        [Description("time (default) or magnitude")] string? sort = null,
        [Description("Max items, default 500, at most 2000")] string? limit = null)
    {
        if (!EarthquakeFilter.TryParse(range, minMag, province, lat, lon, radiusKm, out var filter, out var errors))
            return TypedResults.ValidationProblem(errors);

        var bySize = false;
        switch (sort?.Trim().ToLowerInvariant())
        {
            case null or "" or "time": break;
            case "magnitude": bySize = true; break;
            default: errors["sort"] = ["sort must be one of: time, magnitude."]; break;
        }

        var take = DefaultLimit;
        if (!string.IsNullOrWhiteSpace(limit)
            && (!int.TryParse(limit, NumberStyles.None, CultureInfo.InvariantCulture, out take) || take is < 1 or > MaxLimit))
            errors["limit"] = [$"limit must be an integer between 1 and {MaxLimit}."];

        if (errors.Count > 0) return TypedResults.ValidationProblem(errors);

        var rows = await filter.ApplyAsync(db, time.GetUtcNow().UtcDateTime, ct);
        var ordered = bySize
            ? rows.OrderByDescending(x => x.Quake.Magnitude).ThenByDescending(x => x.Quake.OccurredAtUtc)
            : rows.OrderByDescending(x => x.Quake.OccurredAtUtc);

        return TypedResults.Ok(ordered.Take(take).Select(x => EarthquakeDto.From(x.Quake, x.DistanceKm)).ToList());
    }

    private static async Task<IResult> GetAsync(string id, AppDbContext db, CancellationToken ct)
    {
        var e = await db.Earthquakes.AsNoTracking().FirstOrDefaultAsync(x => x.Id == id, ct);
        return e is null
            ? TypedResults.Problem(statusCode: 404, title: "Earthquake not found", detail: $"No earthquake with id '{id}'.")
            : TypedResults.Ok(EarthquakeDto.From(e));
    }

    private static async Task<IResult> ProvincesAsync(AppDbContext db, CancellationToken ct)
    {
        var list = await db.Earthquakes.AsNoTracking()
            .Where(e => e.Province != null)
            .Select(e => e.Province!)
            .Distinct()
            .ToListAsync(ct);
        list.Sort(StringComparer.Create(Tr, ignoreCase: true));
        return TypedResults.Ok(list);
    }
}
