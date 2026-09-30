using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using Microsoft.Extensions.Time.Testing;
using Sismo.Api.Data;
using Sismo.Api.Sync;

namespace Sismo.Tests;

public sealed class SyncServiceTests : IDisposable
{
    private static readonly DateTime Now = new(2026, 9, 30, 12, 0, 0, DateTimeKind.Utc);

    private readonly TestDatabase _db = new();
    private readonly FakeAfadClient _afad = new();
    private readonly RecordingNotifier _notifier = new();
    private readonly SyncState _state = new();
    private readonly FakeTimeProvider _time = new(new DateTimeOffset(Now));
    private readonly ServiceProvider _services;
    private readonly SyncService _sync;

    public SyncServiceTests()
    {
        var sc = new ServiceCollection();
        sc.AddScoped(_ => _db.CreateContext());
        _services = sc.BuildServiceProvider();
        _sync = new SyncService(_services.GetRequiredService<IServiceScopeFactory>(), _afad, _notifier, _state,
            _time, Options.Create(new SyncOptions()), NullLogger<SyncService>.Instance);
    }

    public void Dispose()
    {
        _services.Dispose();
        _db.Dispose();
    }

    private async Task SeedAsync(params Sismo.Api.Domain.Earthquake[] quakes)
    {
        await using var db = _db.CreateContext();
        db.Earthquakes.AddRange(quakes);
        await db.SaveChangesAsync();
    }

    [Fact]
    public async Task Empty_database_backfills_30_days_without_broadcasting()
    {
        _afad.Events.Add(Quakes.Make("a", Now.AddDays(-20)));
        _afad.Events.Add(Quakes.Make("b", Now.AddHours(-1)));

        var result = await _sync.RunOnceAsync(default);

        Assert.NotNull(result);
        Assert.True(result.Backfill);
        Assert.Equal(2, result.Added);
        var call = Assert.Single(_afad.Calls);
        Assert.Equal(Now.AddDays(-30), call.Start);
        Assert.Empty(_notifier.Added);
        await using var db = _db.CreateContext();
        Assert.Equal(2, db.Earthquakes.Count());
    }

    [Fact]
    public async Task New_record_is_added_and_broadcast()
    {
        await SeedAsync(Quakes.Make("old", Now.AddHours(-2)));
        _afad.Events.Add(Quakes.Make("old", Now.AddHours(-2)));
        _afad.Events.Add(Quakes.Make("new", Now.AddMinutes(-3), mag: 3.4));

        var result = await _sync.RunOnceAsync(default);

        Assert.Equal(1, result!.Added);
        Assert.Equal(0, result.Updated);
        Assert.Equal(1, result.Unchanged);
        Assert.Equal("new", Assert.Single(_notifier.Added).Id);
        Assert.Empty(_notifier.Updated);
    }

    [Fact]
    public async Task Periodic_round_asks_for_the_last_three_hours()
    {
        await SeedAsync(Quakes.Make("x", Now.AddDays(-1)));

        await _sync.RunOnceAsync(default);

        var call = Assert.Single(_afad.Calls);
        Assert.Equal(Now.AddHours(-3), call.Start);
        Assert.True(call.End >= Now);
    }

    [Fact]
    public async Task Revised_magnitude_updates_record_and_increments_revision()
    {
        await SeedAsync(Quakes.Make("q", Now.AddMinutes(-30), mag: 3.1));
        _afad.Events.Add(Quakes.Make("q", Now.AddMinutes(-30), mag: 3.4));

        var result = await _sync.RunOnceAsync(default);

        Assert.Equal(1, result!.Updated);
        var updated = Assert.Single(_notifier.Updated);
        Assert.Equal(3.4, updated.Magnitude);
        Assert.Equal(1, updated.Revision);

        await using var db = _db.CreateContext();
        var stored = db.Earthquakes.Single(e => e.Id == "q");
        Assert.Equal(3.4, stored.Magnitude);
        Assert.Equal(1, stored.Revision);
    }

    [Fact]
    public async Task Revised_location_counts_as_update()
    {
        await SeedAsync(Quakes.Make("q", Now.AddMinutes(-30), lat: 39.0));
        _afad.Events.Add(Quakes.Make("q", Now.AddMinutes(-30), lat: 39.05));

        var result = await _sync.RunOnceAsync(default);

        Assert.Equal(1, result!.Updated);
    }

    [Fact]
    public async Task Unchanged_record_is_left_alone()
    {
        await SeedAsync(Quakes.Make("q", Now.AddMinutes(-30), mag: 2.2));
        _afad.Events.Add(Quakes.Make("q", Now.AddMinutes(-30), mag: 2.2));

        var result = await _sync.RunOnceAsync(default);

        Assert.Equal(0, result!.Added);
        Assert.Equal(0, result.Updated);
        Assert.Equal(1, result.Unchanged);
        Assert.Equal(0, _notifier.Calls);
        await using var db = _db.CreateContext();
        Assert.Equal(0, db.Earthquakes.Single().Revision);
    }

    [Fact]
    public async Task Afad_failure_is_recorded_and_does_not_throw()
    {
        await SeedAsync(Quakes.Make("x", Now.AddHours(-1)));
        _afad.Throw = new HttpRequestException("AFAD down");

        var result = await _sync.RunOnceAsync(default);

        Assert.Null(result);
        Assert.Equal("AFAD down", _state.LastError);
        Assert.Null(_state.LastSuccessUtc);
        Assert.Equal(Now, _state.LastAttemptUtc);
    }

    [Fact]
    public async Task Success_after_failure_clears_error()
    {
        await SeedAsync(Quakes.Make("x", Now.AddHours(-1)));
        _afad.Throw = new HttpRequestException("AFAD down");
        await _sync.RunOnceAsync(default);

        _afad.Throw = null;
        _time.Advance(TimeSpan.FromMinutes(1));
        await _sync.RunOnceAsync(default);

        Assert.Null(_state.LastError);
        Assert.Equal(Now.AddMinutes(1), _state.LastSuccessUtc);
    }

    [Fact]
    public async Task Records_older_than_30_days_are_deleted()
    {
        await SeedAsync(Quakes.Make("ancient", Now.AddDays(-31)), Quakes.Make("recent", Now.AddDays(-2)));

        var result = await _sync.RunOnceAsync(default);

        Assert.Equal(1, result!.Deleted);
        await using var db = _db.CreateContext();
        Assert.Equal("recent", db.Earthquakes.Single().Id);
    }

    [Fact]
    public async Task Cleanup_runs_at_most_once_a_day()
    {
        await SeedAsync(Quakes.Make("recent", Now.AddDays(-2)));
        await _sync.RunOnceAsync(default);

        await SeedAsync(Quakes.Make("ancient", Now.AddDays(-40)));
        _time.Advance(TimeSpan.FromHours(1));
        var result = await _sync.RunOnceAsync(default);

        Assert.Equal(0, result!.Deleted);
    }
}
