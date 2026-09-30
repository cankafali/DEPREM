using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace Sismo.Api.Data.Migrations
{
    /// <inheritdoc />
    public partial class Initial : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "Earthquakes",
                columns: table => new
                {
                    Id = table.Column<string>(type: "TEXT", maxLength: 32, nullable: false),
                    OccurredAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Latitude = table.Column<double>(type: "REAL", nullable: false),
                    Longitude = table.Column<double>(type: "REAL", nullable: false),
                    DepthKm = table.Column<double>(type: "REAL", nullable: false),
                    Magnitude = table.Column<double>(type: "REAL", nullable: false),
                    MagnitudeType = table.Column<string>(type: "TEXT", maxLength: 8, nullable: false),
                    Province = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true),
                    District = table.Column<string>(type: "TEXT", maxLength: 64, nullable: true),
                    Location = table.Column<string>(type: "TEXT", maxLength: 256, nullable: false),
                    UpdatedAtUtc = table.Column<DateTime>(type: "TEXT", nullable: false),
                    Revision = table.Column<int>(type: "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_Earthquakes", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_Earthquakes_Magnitude",
                table: "Earthquakes",
                column: "Magnitude");

            migrationBuilder.CreateIndex(
                name: "IX_Earthquakes_OccurredAtUtc",
                table: "Earthquakes",
                column: "OccurredAtUtc");

            migrationBuilder.CreateIndex(
                name: "IX_Earthquakes_Province",
                table: "Earthquakes",
                column: "Province");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "Earthquakes");
        }
    }
}
