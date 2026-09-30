using System.Globalization;
using Sismo.Api.Domain;

namespace Sismo.Api.Afad;

public static class AfadMapper
{
    private static readonly string[] DateFormats =
    [
        "yyyy-MM-dd'T'HH:mm:ss",
        "yyyy-MM-dd'T'HH:mm:ss.FFFFFFF",
        "yyyy-MM-dd HH:mm:ss",
        "yyyy-MM-dd HH:mm:ss.FFFFFFF",
    ];

    /// <summary>
    /// Maps an AFAD record to the domain model. Returns null when an essential field
    /// (id, date, coordinates, magnitude) is missing or unparsable.
    /// </summary>
    public static Earthquake? Map(AfadEventDto dto)
    {
        if (string.IsNullOrWhiteSpace(dto.EventId)) return null;
        if (ParseUtc(dto.Date) is not { } occurred) return null;
        if (ParseDouble(dto.Latitude) is not { } lat || lat is < -90 or > 90) return null;
        if (ParseDouble(dto.Longitude) is not { } lon || lon is < -180 or > 180) return null;
        if (ParseDouble(dto.Magnitude) is not { } mag) return null;

        var province = Clean(dto.Province);
        var district = Clean(dto.District);

        return new Earthquake
        {
            Id = dto.EventId.Trim(),
            OccurredAtUtc = occurred,
            Latitude = lat,
            Longitude = lon,
            DepthKm = ParseDouble(dto.Depth) ?? 0,
            Magnitude = Math.Round(mag, 1),
            MagnitudeType = NormalizeType(dto.Type),
            Province = province,
            District = district,
            Location = Clean(dto.Location) ?? FallbackLocation(province, district),
            UpdatedAtUtc = ParseUtc(dto.LastUpdateDate) ?? occurred,
            // AFAD flags records it has already revised; count that as the first revision.
            Revision = dto.IsEventUpdate == true ? 1 : 0,
        };
    }

    public static IReadOnlyList<Earthquake> MapAll(IEnumerable<AfadEventDto> dtos) =>
        dtos.Select(Map).OfType<Earthquake>()
            .GroupBy(e => e.Id).Select(g => g.MaxBy(e => e.UpdatedAtUtc)!)
            .ToList();

    /// <summary>AFAD dates carry no offset but are UTC (verified against the live feed).</summary>
    public static DateTime? ParseUtc(string? value)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        return DateTime.TryParseExact(value.Trim(), DateFormats, CultureInfo.InvariantCulture,
            DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var dt)
            ? DateTime.SpecifyKind(dt, DateTimeKind.Utc)
            : null;
    }

    private static double? ParseDouble(string? value) =>
        double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out var d) && double.IsFinite(d)
            ? d
            : null;

    private static string NormalizeType(string? type) => type?.Trim().ToUpperInvariant() switch
    {
        null or "" => "M",
        "MW" => "Mw",
        "MB" => "mb",
        "MS" => "Ms",
        "MD" => "Md",
        var t => t,
    };

    private static string? Clean(string? s) => string.IsNullOrWhiteSpace(s) ? null : s.Trim();

    private static string FallbackLocation(string? province, string? district) =>
        (district, province) switch
        {
            ({ } d, { } p) => $"{d} ({p})",
            (null, { } p) => p,
            ({ } d, null) => d,
            _ => "Bilinmeyen konum",
        };
}
