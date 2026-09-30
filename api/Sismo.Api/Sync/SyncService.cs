using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using Sismo.Api.Afad;
using Sismo.Api.Data;
using Sismo.Api.Domain;
using Sismo.Api.Realtime;

namespace Sismo.Api.Sync;

public sealed class SyncOptions
{
    public bool Enabled { get; set; } = true;
    public TimeSpan Interval { get; set; } = TimeSpan.FromSeconds(60);
    public TimeSpan Window { get; set; } = TimeSpan.FromHours(3);
    public int RetentionDays { get; set; } = 30;
}

/// <summary>In-memory status of the sync loop, surfaced on /health.</summary>
public sealed class SyncState
{
    private readonly Lock _gate = new();
    private readonly TaskCompletionSource _firstRound = new(TaskCreationOptions.RunContinuationsAsynchronously);

    /// <summary>Completes after the first sync round, successful or not.</summary>
    public Task FirstRound => _firstRound.Task;
    public DateTime? LastSuccessUtc { get; private set; }
    public DateTime? LastAttemptUtc { get; private set; }
    public string? LastError { get; private set; }

    public void MarkSuccess(DateTime nowUtc)
    {
        lock (_gate) { LastSuccessUtc = nowUtc; LastAttemptUtc = nowUtc; LastError = null; }
        _firstRound.TrySetResult();
    }

    public void MarkFailure(DateTime nowUtc, string error)
    {
        lock (_gate) { LastAttemptUtc = nowUtc; LastError = error; }
        _firstRound.TrySetResult();
    }
}

public sealed record SyncResult(int Added, int Updated, int Unchanged, int Deleted, bool Backfill);

public sealed class SyncService(
    IServiceScopeFactory scopes,
    IAfadClient afad,
    IQuakeNotifier notifier,
    SyncState state,
    TimeProvider time,
    IOptions<SyncOptions> options,
    ILogger<SyncService> log) : BackgroundService
{
    private readonly SyncOptions _opt = options.Value;
    private DateTime _lastCleanupUtc = DateTime.MinValue;

    protected override async Task ExecuteAsync(CancellationToken ct)
    {
        using var timer = new PeriodicTimer(_opt.Interval, time);
        do
        {
            await RunOnceAsync(ct);
        } while (await timer.WaitForNextTickAsync(ct));
    }

    /// <summary>One sync round. Never throws (except on cancellation).</summary>
    public async Task<SyncResult?> RunOnceAsync(CancellationToken ct)
    {
        var now = time.GetUtcNow().UtcDateTime;
        try
        {
            await using var scope = scopes.CreateAsyncScope();
            var db = scope.ServiceProvider.GetRequiredService<AppDbContext>();

            var backfill = !await db.Earthquakes.AnyAsync(ct);
            var incoming = backfill
                ? await BackfillAsync(now, ct)
                : await afad.GetEventsAsync(now - _opt.Window, now.AddMinutes(5), ct);

            var (added, updated, unchanged) = await UpsertAsync(db, incoming, ct);
            var deleted = await CleanupIfDueAsync(db, now, ct);

            state.MarkSuccess(now);
            if (added.Count + updated.Count + deleted > 0)
            {
                // A backfill would be thousands of messages; clients load it over REST instead.
                await notifier.PublishAsync(backfill ? [] : added, backfill ? [] : updated, ct);
            }

            var result = new SyncResult(added.Count, updated.Count, unchanged, deleted, backfill);
            if (added.Count + updated.Count > 0 || backfill)
                log.LogInformation("Sync done: {@Result}", result);
            return result;
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            log.LogWarning(ex, "Sync failed; will retry next round");
            state.MarkFailure(now, ex.Message);
            return null;
        }
    }

    private async Task<IReadOnlyList<Earthquake>> BackfillAsync(DateTime now, CancellationToken ct)
    {
        var start = now.AddDays(-_opt.RetentionDays);
        try
        {
            return await afad.GetEventsAsync(start, now.AddMinutes(5), ct);
        }
        catch (Exception ex) when (!ct.IsCancellationRequested)
        {
            log.LogWarning(ex, "Full backfill failed; falling back to daily chunks");
        }

        var all = new List<Earthquake>();
        for (var day = start; day < now; day = day.AddDays(1))
        {
            try
            {
                all.AddRange(await afad.GetEventsAsync(day, day.AddDays(1), ct));
            }
            catch (Exception ex) when (!ct.IsCancellationRequested)
            {
                log.LogWarning(ex, "Backfill chunk {Day:yyyy-MM-dd} failed", day);
            }
        }
        if (all.Count == 0) throw new InvalidOperationException("Backfill returned no data");
        return all;
    }

    private static async Task<(List<Earthquake> Added, List<Earthquake> Updated, int Unchanged)> UpsertAsync(
        AppDbContext db, IReadOnlyList<Earthquake> incoming, CancellationToken ct)
    {
        var byId = incoming.GroupBy(e => e.Id).ToDictionary(g => g.Key, g => g.Last());
        var ids = byId.Keys.ToList();

        var existing = new Dictionary<string, Earthquake>();
        foreach (var chunk in ids.Chunk(500)) // stay under SQLite's parameter limit
        {
            foreach (var e in await db.Earthquakes.Where(e => chunk.Contains(e.Id)).ToListAsync(ct))
                existing[e.Id] = e;
        }

        List<Earthquake> added = [], updated = [];
        var unchanged = 0;
        foreach (var fresh in byId.Values)
        {
            if (!existing.TryGetValue(fresh.Id, out var current))
            {
                db.Earthquakes.Add(fresh);
                added.Add(fresh);
            }
            else if (fresh.DiffersFrom(current))
            {
                current.CopyValuesFrom(fresh);
                current.Revision++;
                updated.Add(current);
            }
            else
            {
                unchanged++;
            }
        }

        await db.SaveChangesAsync(ct);
        return (added, updated, unchanged);
    }

    private async Task<int> CleanupIfDueAsync(AppDbContext db, DateTime now, CancellationToken ct)
    {
        if (now - _lastCleanupUtc < TimeSpan.FromDays(1)) return 0;
        var cutoff = now.AddDays(-_opt.RetentionDays);
        var deleted = await db.Earthquakes.Where(e => e.OccurredAtUtc < cutoff).ExecuteDeleteAsync(ct);
        _lastCleanupUtc = now;
        if (deleted > 0) log.LogInformation("Deleted {Count} earthquakes older than {Cutoff:u}", deleted, cutoff);
        return deleted;
    }
}
