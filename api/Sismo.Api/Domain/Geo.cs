namespace Sismo.Api.Domain;

public static class Geo
{
    public const double EarthRadiusKm = 6371.0088;

    /// <summary>Great-circle distance in kilometres.</summary>
    public static double HaversineKm(double lat1, double lon1, double lat2, double lon2)
    {
        var dLat = ToRad(lat2 - lat1);
        var dLon = ToRad(lon2 - lon1);
        var a = Math.Sin(dLat / 2) * Math.Sin(dLat / 2)
              + Math.Cos(ToRad(lat1)) * Math.Cos(ToRad(lat2)) * Math.Sin(dLon / 2) * Math.Sin(dLon / 2);
        return 2 * EarthRadiusKm * Math.Asin(Math.Min(1, Math.Sqrt(a)));
    }

    /// <summary>
    /// A lat/lon box that is guaranteed to contain every point within <paramref name="radiusKm"/>.
    /// Used to narrow the SQL query before the exact Haversine check.
    /// </summary>
    public static (double MinLat, double MaxLat, double MinLon, double MaxLon) BoundingBox(
        double lat, double lon, double radiusKm)
    {
        var dLat = radiusKm / 111.0;
        var cos = Math.Cos(ToRad(Math.Min(89, Math.Abs(lat) + dLat)));
        var dLon = radiusKm / (111.0 * Math.Max(cos, 0.01));
        return (lat - dLat, lat + dLat, lon - dLon, lon + dLon);
    }

    private static double ToRad(double deg) => deg * Math.PI / 180.0;
}
