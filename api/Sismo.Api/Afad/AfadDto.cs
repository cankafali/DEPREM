using System.Text.Json.Serialization;

namespace Sismo.Api.Afad;

/// <summary>
/// One record from <c>apiv2/event/filter</c>. Shape taken from a real response (see docs/afad-sample.json):
/// numbers arrive as strings, dates are UTC without an offset, e.g. "2026-09-30T09:37:06".
/// Everything is nullable so a missing field never throws during deserialisation.
/// </summary>
public sealed class AfadEventDto
{
    [JsonPropertyName("eventID")] public string? EventId { get; set; }
    [JsonPropertyName("location")] public string? Location { get; set; }
    [JsonPropertyName("latitude")] public string? Latitude { get; set; }
    [JsonPropertyName("longitude")] public string? Longitude { get; set; }
    [JsonPropertyName("depth")] public string? Depth { get; set; }
    [JsonPropertyName("type")] public string? Type { get; set; }
    [JsonPropertyName("magnitude")] public string? Magnitude { get; set; }
    [JsonPropertyName("country")] public string? Country { get; set; }
    [JsonPropertyName("province")] public string? Province { get; set; }
    [JsonPropertyName("district")] public string? District { get; set; }
    [JsonPropertyName("neighborhood")] public string? Neighborhood { get; set; }
    [JsonPropertyName("date")] public string? Date { get; set; }
    [JsonPropertyName("isEventUpdate")] public bool? IsEventUpdate { get; set; }
    [JsonPropertyName("lastUpdateDate")] public string? LastUpdateDate { get; set; }
}
