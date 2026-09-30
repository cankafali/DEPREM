using Microsoft.AspNetCore.OutputCaching;
using Microsoft.AspNetCore.SignalR;
using Sismo.Api.Domain;

namespace Sismo.Api.Realtime;

/// <summary>
/// Server → client only. Events: <c>QuakeAdded(EarthquakeDto)</c>, <c>QuakeUpdated(EarthquakeDto)</c>.
/// Clients filter locally; the data set is small.
/// </summary>
public sealed class QuakesHub : Hub;

public interface IQuakeNotifier
{
    Task PublishAsync(IReadOnlyList<Earthquake> added, IReadOnlyList<Earthquake> updated, CancellationToken ct);
}

public sealed class HubQuakeNotifier(IHubContext<QuakesHub> hub, IOutputCacheStore cache) : IQuakeNotifier
{
    public const string CacheTag = "quakes";

    public async Task PublishAsync(IReadOnlyList<Earthquake> added, IReadOnlyList<Earthquake> updated, CancellationToken ct)
    {
        await cache.EvictByTagAsync(CacheTag, ct);

        foreach (var e in added.OrderBy(e => e.OccurredAtUtc))
            await hub.Clients.All.SendAsync("QuakeAdded", EarthquakeDto.From(e), ct);
        foreach (var e in updated)
            await hub.Clients.All.SendAsync("QuakeUpdated", EarthquakeDto.From(e), ct);
    }
}
