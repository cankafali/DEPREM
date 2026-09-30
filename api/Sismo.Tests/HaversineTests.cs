using Sismo.Api.Domain;

namespace Sismo.Tests;

public class HaversineTests
{
    [Theory]
    [InlineData(51.5074, -0.1278, 48.8566, 2.3522, 343.5)]   // London – Paris
    [InlineData(41.0082, 28.9784, 39.9334, 32.8597, 350.0)]  // İstanbul – Ankara (air distance)
    public void Known_city_pairs_are_within_one_km(double lat1, double lon1, double lat2, double lon2, double expectedKm)
    {
        Assert.InRange(Geo.HaversineKm(lat1, lon1, lat2, lon2), expectedKm - 1, expectedKm + 1);
    }

    [Fact]
    public void Same_point_is_zero_and_distance_is_symmetric()
    {
        Assert.Equal(0, Geo.HaversineKm(38.4, 27.1, 38.4, 27.1), 6);
        Assert.Equal(Geo.HaversineKm(38.4, 27.1, 39.9, 32.8), Geo.HaversineKm(39.9, 32.8, 38.4, 27.1), 6);
    }

    [Theory]
    [InlineData(38.42, 27.14, 50)]
    [InlineData(41.0, 29.0, 500)]
    [InlineData(36.2, 36.1, 5)]
    public void Bounding_box_contains_every_point_on_the_circle(double lat, double lon, double radiusKm)
    {
        var (minLat, maxLat, minLon, maxLon) = Geo.BoundingBox(lat, lon, radiusKm);
        for (var bearing = 0; bearing < 360; bearing += 5)
        {
            var (pLat, pLon) = Destination(lat, lon, bearing, radiusKm * 0.999);
            Assert.InRange(pLat, minLat, maxLat);
            Assert.InRange(pLon, minLon, maxLon);
        }
    }

    private static (double Lat, double Lon) Destination(double lat, double lon, double bearingDeg, double km)
    {
        var d = km / Geo.EarthRadiusKm;
        var b = bearingDeg * Math.PI / 180;
        var φ1 = lat * Math.PI / 180;
        var λ1 = lon * Math.PI / 180;
        var φ2 = Math.Asin(Math.Sin(φ1) * Math.Cos(d) + Math.Cos(φ1) * Math.Sin(d) * Math.Cos(b));
        var λ2 = λ1 + Math.Atan2(Math.Sin(b) * Math.Sin(d) * Math.Cos(φ1), Math.Cos(d) - Math.Sin(φ1) * Math.Sin(φ2));
        return (φ2 * 180 / Math.PI, λ2 * 180 / Math.PI);
    }
}
