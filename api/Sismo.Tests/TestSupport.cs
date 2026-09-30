using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Sismo.Api.Afad;
using Sismo.Api.Data;
using Sismo.Api.Domain;
using Sismo.Api.Realtime;

namespace Sismo.Tests;

public static class Quakes
{
    public static Earthquake Make(string id, DateTime occurredUtc, double mag = 2.0,
        double lat = 39.0, double lon = 35.0, string? province = "Kayseri", double depth = 7) => new()
    {
        Id = id,
        OccurredAtUtc = occurredUtc,
        Latitude = lat,
        Longitude = lon,
        DepthKm = depth,
        Magnitude = mag,
        MagnitudeType = "ML",
        Province = province,
        District = "Merkez",
        Location = $"Merkez ({province})",
        UpdatedAtUtc = occurredUtc,
    };
}

public sealed class FakeAfadClient : IAfadClient
{
    public List<Earthquake> Events { get; } = [];
    public Exception? Throw { get; set; }
    public List<(DateTime Start, DateTime End)> Calls { get; } = [];

    public Task<IReadOnlyList<Earthquake>> GetEventsAsync(DateTime startUtc, DateTime endUtc, CancellationToken ct)
    {
        Calls.Add((startUtc, endUtc));
        if (Throw is not null) throw Throw;
        // Return copies, like a fresh deserialisation would.
        IReadOnlyList<Earthquake> result = Events
            .Where(e => e.OccurredAtUtc >= startUtc && e.OccurredAtUtc <= endUtc)
            .Select(e => Quakes.Make(e.Id, e.OccurredAtUtc, e.Magnitude, e.Latitude, e.Longitude, e.Province, e.DepthKm))
            .ToList();
        return Task.FromResult(result);
    }
}

public sealed class RecordingNotifier : IQuakeNotifier
{
    public List<Earthquake> Added { get; } = [];
    public List<Earthquake> Updated { get; } = [];
    public int Calls { get; private set; }

    public Task PublishAsync(IReadOnlyList<Earthquake> added, IReadOnlyList<Earthquake> updated, CancellationToken ct)
    {
        Calls++;
        Added.AddRange(added);
        Updated.AddRange(updated);
        return Task.CompletedTask;
    }
}

/// <summary>An in-memory SQLite database that lives as long as this object.</summary>
public sealed class TestDatabase : IDisposable
{
    public SqliteConnection Connection { get; }
    public DbContextOptions<AppDbContext> Options { get; }

    public TestDatabase()
    {
        Connection = new SqliteConnection("Data Source=:memory:");
        Connection.Open();
        Options = new DbContextOptionsBuilder<AppDbContext>().UseSqlite(Connection).Options;
        using var db = new AppDbContext(Options);
        db.Database.Migrate();
    }

    public AppDbContext CreateContext() => new(Options);

    public void Dispose() => Connection.Dispose();
}
