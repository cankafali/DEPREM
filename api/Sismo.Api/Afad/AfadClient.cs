using System.Globalization;
using Sismo.Api.Domain;

namespace Sismo.Api.Afad;

public interface IAfadClient
{
    /// <summary>Events that occurred in [startUtc, endUtc].</summary>
    Task<IReadOnlyList<Earthquake>> GetEventsAsync(DateTime startUtc, DateTime endUtc, CancellationToken ct);
}

public sealed class AfadClient(HttpClient http) : IAfadClient
{
    public async Task<IReadOnlyList<Earthquake>> GetEventsAsync(DateTime startUtc, DateTime endUtc, CancellationToken ct)
    {
        // No `limit`: AFAD applies it before `orderby`, so it would return the oldest rows.
        var url = $"event/filter?start={Format(startUtc)}&end={Format(endUtc)}&orderby=timedesc";
        var dtos = await http.GetFromJsonAsync<List<AfadEventDto>>(url, ct) ?? [];
        return AfadMapper.MapAll(dtos);
    }

    private static string Format(DateTime utc) =>
        utc.ToUniversalTime().ToString("yyyy-MM-dd'T'HH:mm:ss", CultureInfo.InvariantCulture);
}
