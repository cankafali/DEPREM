using System.Text.Json;
using Sismo.Api.Afad;

namespace Sismo.Tests;

public class AfadMapperTests
{
    private static List<AfadEventDto> LoadSample() =>
        JsonSerializer.Deserialize<List<AfadEventDto>>(File.ReadAllText("afad-sample.json"))!;

    [Fact]
    public void Maps_every_record_in_the_real_sample()
    {
        var dtos = LoadSample();
        var mapped = AfadMapper.MapAll(dtos);
        Assert.Equal(dtos.Count, mapped.Count);
    }

    [Fact]
    public void Maps_fields_of_first_sample_record()
    {
        var e = AfadMapper.Map(LoadSample()[0])!;

        Assert.Equal("730010", e.Id);
        Assert.Equal(new DateTime(2026, 9, 30, 9, 37, 6, DateTimeKind.Utc), e.OccurredAtUtc);
        Assert.Equal(DateTimeKind.Utc, e.OccurredAtUtc.Kind);
        Assert.Equal(37.557, e.Latitude, 5);
        Assert.Equal(35.6355, e.Longitude, 5);
        Assert.Equal(7.04, e.DepthKm, 3);
        Assert.Equal(1.6, e.Magnitude, 3);
        Assert.Equal("ML", e.MagnitudeType);
        Assert.Equal("Adana", e.Province);
        Assert.Equal("Kozan", e.District);
        Assert.Equal("Kozan (Adana)", e.Location);
        Assert.Equal(1, e.Revision); // isEventUpdate: true
        Assert.Equal(new DateTime(2026, 9, 30, 10, 18, 27, 146, DateTimeKind.Utc).AddTicks(7130), e.UpdatedAtUtc);
    }

    [Fact]
    public void Unrevised_record_uses_event_time_as_update_time()
    {
        var e = AfadMapper.Map(LoadSample()[1])!;
        Assert.Equal(0, e.Revision);
        Assert.Equal(e.OccurredAtUtc, e.UpdatedAtUtc);
    }

    [Fact]
    public void Normalizes_moment_magnitude_type()
    {
        var mw = AfadMapper.MapAll(LoadSample()).Where(e => e.MagnitudeType != "ML").ToList();
        Assert.NotEmpty(mw);
        Assert.All(mw, e => Assert.Equal("Mw", e.MagnitudeType));
    }

    [Fact]
    public void Dates_are_treated_as_utc_not_turkey_time()
    {
        var dt = AfadMapper.ParseUtc("2026-09-30T09:37:06")!.Value;
        Assert.Equal(DateTimeKind.Utc, dt.Kind);
        Assert.Equal(9, dt.Hour);
    }

    [Fact]
    public void Missing_optional_fields_do_not_crash()
    {
        var e = AfadMapper.Map(new AfadEventDto
        {
            EventId = "1", Date = "2026-09-30T00:00:00", Latitude = "39", Longitude = "35", Magnitude = "2.1",
        });

        Assert.NotNull(e);
        Assert.Equal(0, e.DepthKm);
        Assert.Equal("M", e.MagnitudeType);
        Assert.Null(e.Province);
        Assert.Equal("Bilinmeyen konum", e.Location);
    }

    [Fact]
    public void Location_falls_back_to_district_and_province()
    {
        var e = AfadMapper.Map(new AfadEventDto
        {
            EventId = "1", Date = "2026-09-30T00:00:00", Latitude = "39", Longitude = "35", Magnitude = "2.1",
            Province = "Malatya", District = "Pütürge",
        })!;
        Assert.Equal("Pütürge (Malatya)", e.Location);
    }

    [Theory]
    [InlineData(null, "2026-09-30T00:00:00", "39", "35", "2")]
    [InlineData("1", null, "39", "35", "2")]
    [InlineData("1", "not a date", "39", "35", "2")]
    [InlineData("1", "2026-09-30T00:00:00", "abc", "35", "2")]
    [InlineData("1", "2026-09-30T00:00:00", "95", "35", "2")]
    [InlineData("1", "2026-09-30T00:00:00", "39", null, "2")]
    [InlineData("1", "2026-09-30T00:00:00", "39", "35", "")]
    public void Records_without_essential_fields_are_skipped(string? id, string? date, string? lat, string? lon, string? mag)
    {
        var e = AfadMapper.Map(new AfadEventDto { EventId = id, Date = date, Latitude = lat, Longitude = lon, Magnitude = mag });
        Assert.Null(e);
    }

    [Fact]
    public void Deserializes_record_with_missing_json_properties()
    {
        var dtos = JsonSerializer.Deserialize<List<AfadEventDto>>(
            """[{"eventID":"9","date":"2026-09-30T01:02:03","latitude":"40.1","longitude":"29.2","magnitude":"3.3"}]""")!;
        var e = Assert.Single(AfadMapper.MapAll(dtos));
        Assert.Equal(3.3, e.Magnitude, 3);
    }

    [Fact]
    public void Duplicate_ids_keep_the_latest_update()
    {
        var older = new AfadEventDto { EventId = "7", Date = "2026-09-30T00:00:00", Latitude = "39", Longitude = "35", Magnitude = "2.0" };
        var newer = new AfadEventDto
        {
            EventId = "7", Date = "2026-09-30T00:00:00", Latitude = "39", Longitude = "35", Magnitude = "2.4",
            IsEventUpdate = true, LastUpdateDate = "2026-09-30T00:10:00",
        };
        var e = Assert.Single(AfadMapper.MapAll([older, newer]));
        Assert.Equal(2.4, e.Magnitude, 3);
    }
}
