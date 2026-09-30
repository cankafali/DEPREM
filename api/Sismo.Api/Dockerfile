# Build context: api/Sismo.Api   (docker build -t sismo-api api/Sismo.Api)
FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Sismo.Api.csproj .
RUN dotnet restore
COPY . .
RUN rm -rf bin obj && dotnet publish -c Release -o /app --no-restore

FROM mcr.microsoft.com/dotnet/aspnet:10.0
WORKDIR /app
COPY --from=build /app .

# SQLite lives on a mounted volume so a restart does not trigger a new 30-day backfill.
ENV ASPNETCORE_HTTP_PORTS=8080 \
    ConnectionStrings__Default="Data Source=/data/sismo.db"
RUN mkdir -p /data && chown app:app /data
VOLUME /data
USER app
EXPOSE 8080
ENTRYPOINT ["dotnet", "Sismo.Api.dll"]
