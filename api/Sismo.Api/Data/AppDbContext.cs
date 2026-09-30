using Microsoft.EntityFrameworkCore;
using Sismo.Api.Domain;

namespace Sismo.Api.Data;

public class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Earthquake> Earthquakes => Set<Earthquake>();

    protected override void OnModelCreating(ModelBuilder b)
    {
        var e = b.Entity<Earthquake>();
        e.HasKey(x => x.Id);
        e.Property(x => x.Id).HasMaxLength(32);
        e.Property(x => x.MagnitudeType).HasMaxLength(8);
        e.Property(x => x.Province).HasMaxLength(64);
        e.Property(x => x.District).HasMaxLength(64);
        e.Property(x => x.Location).HasMaxLength(256);
        e.HasIndex(x => x.OccurredAtUtc);
        e.HasIndex(x => x.Magnitude);
        e.HasIndex(x => x.Province);
    }

    protected override void ConfigureConventions(ModelConfigurationBuilder c)
    {
        // SQLite has no DateTime type; everything we store is UTC, so mark it as such on the way out.
        c.Properties<DateTime>().HaveConversion<UtcDateTimeConverter>();
    }

    private sealed class UtcDateTimeConverter()
        : Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<DateTime, DateTime>(
            v => v.Kind == DateTimeKind.Utc ? v : v.ToUniversalTime(),
            v => DateTime.SpecifyKind(v, DateTimeKind.Utc));
}
