using System.Globalization;
using Microsoft.EntityFrameworkCore;
using Sismo.Api.Data;
using Sismo.Api.Domain;

namespace Sismo.Api.Endpoints;

public enum QuakeRange { Day, Week, Month }

/// <summary>Validated filter shared by the list and stats endpoints.</summary>
public sealed record EarthquakeFilter(
    QuakeRange Range,
    double? MinMag,
    string? Province,
    double? Lat,
    double? Lon,
    double? RadiusKm)
{
    public const double MaxRadiusKm = 500;
    private static readonly CultureInfo Tr = CultureInfo.GetCultureInfo("tr-TR");

    public TimeSpan Span => Range switch
    {
        QuakeRange.Week => TimeSpan.FromDays(7),
        QuakeRange.Month => TimeSpan.FromDays(30),
        _ => TimeSpan.FromHours(24),
    };

    public bool HasRadius => Lat is not null;

    public static bool TryParse(
        string? range, string? minMag, string? province, string? lat, string? lon, string? radiusKm,
        out EarthquakeFilter filter, out Dictionary<string, string[]> errors)
    {
        errors = [];
        filter = null!;

        var r = QuakeRange.Day;
        switch (range?.Trim().ToLowerInvariant())
        {
            case null or "" or "24h": break;
            case "7d": r = QuakeRange.Week; break;
            case "30d": r = QuakeRange.Month; break;
            default: errors["range"] = ["range must be one of: 24h, 7d, 30d."]; break;
        }

        var mag = ParseOptional(minMag, "minMag", 0, 9, errors, "minMag must be a number between 0 and 9.");
        var la = ParseOptional(lat, "lat", -90, 90, errors, "lat must be a number between -90 and 90.");
        var lo = ParseOptional(lon, "lon", -180, 180, errors, "lon must be a number between -180 and 180.");
        var rad = ParseOptional(radiusKm, "radiusKm", 0.1, MaxRadiusKm, errors,
            $"radiusKm must be a number between 0.1 and {MaxRadiusKm}.");

        var given = new[] { lat, lon, radiusKm }.Count(s => !string.IsNullOrWhiteSpace(s));
        if (given is > 0 and < 3)
            errors["radius"] = ["lat, lon and radiusKm must be provided together."];

        if (errors.Count > 0) return false;

        filter = new EarthquakeFilter(r, mag,
            string.IsNullOrWhiteSpace(province) ? null : province.Trim(),
            la, lo, rad);
        return true;
    }

    /// <summary>
    /// Runs the SQL part of the filter (time, magnitude, bounding box), then the precise
    /// Haversine and province checks in memory. Returns matches with their distance.
    /// </summary>
    public async Task<List<(Earthquake Quake, double? DistanceKm)>> ApplyAsync(
        AppDbContext db, DateTime nowUtc, CancellationToken ct)
    {
        var since = nowUtc - Span;
        var q = db.Earthquakes.AsNoTracking().Where(e => e.OccurredAtUtc >= since);
        if (MinMag is { } m) q = q.Where(e => e.Magnitude >= m - 1e-9);

        if (HasRadius)
        {
            var (minLat, maxLat, minLon, maxLon) = Geo.BoundingBox(Lat!.Value, Lon!.Value, RadiusKm!.Value);
            q = q.Where(e => e.Latitude >= minLat && e.Latitude <= maxLat
                          && e.Longitude >= minLon && e.Longitude <= maxLon);
        }

        var rows = await q.ToListAsync(ct);

        IEnumerable<Earthquake> matches = rows;
        if (Province is { } p)
        {
            // In memory so Turkish casing works ("izmir" == "İzmir"); SQLite's lower() is ASCII only.
            matches = matches.Where(e => e.Province is not null
                && string.Compare(e.Province, p, Tr, CompareOptions.IgnoreCase) == 0);
        }

        if (!HasRadius) return matches.Select(e => (e, (double?)null)).ToList();

        return matches
            .Select(e => (e, (double?)Geo.HaversineKm(Lat!.Value, Lon!.Value, e.Latitude, e.Longitude)))
            .Where(x => x.Item2 <= RadiusKm!.Value)
            .ToList();
    }

    private static double? ParseOptional(string? s, string key, double min, double max,
        Dictionary<string, string[]> errors, string message)
    {
        if (string.IsNullOrWhiteSpace(s)) return null;
        if (double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out var v)
            && double.IsFinite(v) && v >= min && v <= max)
            return v;
        errors[key] = [message];
        return null;
    }
}
