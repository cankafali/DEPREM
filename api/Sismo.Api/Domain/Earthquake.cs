namespace Sismo.Api.Domain;

public class Earthquake
{
    public required string Id { get; set; }            // AFAD eventID
    public DateTime OccurredAtUtc { get; set; }
    public double Latitude { get; set; }
    public double Longitude { get; set; }
    public double DepthKm { get; set; }
    public double Magnitude { get; set; }
    public required string MagnitudeType { get; set; } // ML, Mw ...
    public string? Province { get; set; }
    public string? District { get; set; }
    public required string Location { get; set; }      // AFAD's location text
    public DateTime UpdatedAtUtc { get; set; }
    public int Revision { get; set; }

    /// <summary>True when magnitude or location differs meaningfully from <paramref name="other"/>.</summary>
    public bool DiffersFrom(Earthquake other) =>
        Math.Abs(Magnitude - other.Magnitude) > 0.001
        || MagnitudeType != other.MagnitudeType
        || Math.Abs(Latitude - other.Latitude) > 0.00001
        || Math.Abs(Longitude - other.Longitude) > 0.00001
        || Math.Abs(DepthKm - other.DepthKm) > 0.001
        || Location != other.Location
        || Province != other.Province
        || District != other.District;

    public void CopyValuesFrom(Earthquake other)
    {
        OccurredAtUtc = other.OccurredAtUtc;
        Latitude = other.Latitude;
        Longitude = other.Longitude;
        DepthKm = other.DepthKm;
        Magnitude = other.Magnitude;
        MagnitudeType = other.MagnitudeType;
        Province = other.Province;
        District = other.District;
        Location = other.Location;
        UpdatedAtUtc = other.UpdatedAtUtc;
    }
}

public record EarthquakeDto(
    string Id,
    DateTime OccurredAtUtc,
    double Latitude,
    double Longitude,
    double DepthKm,
    double Magnitude,
    string MagnitudeType,
    string? Province,
    string? District,
    string Location,
    DateTime UpdatedAtUtc,
    int Revision,
    double? DistanceKm = null)
{
    public static EarthquakeDto From(Earthquake e, double? distanceKm = null) => new(
        e.Id, e.OccurredAtUtc, e.Latitude, e.Longitude, e.DepthKm, e.Magnitude, e.MagnitudeType,
        e.Province, e.District, e.Location, e.UpdatedAtUtc, e.Revision,
        distanceKm is null ? null : Math.Round(distanceKm.Value, 1));
}
