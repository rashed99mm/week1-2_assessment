# syntax=docker/dockerfile:1

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/sdk:9.0-alpine AS build

WORKDIR /src

# Project files first, so a code change does not invalidate the restore layer.
COPY src/Analytics.Api/Analytics.Api.csproj src/Analytics.Api/
RUN dotnet restore src/Analytics.Api/Analytics.Api.csproj

COPY src/ src/

RUN dotnet publish src/Analytics.Api/Analytics.Api.csproj \
    --configuration Release \
    --no-restore \
    --output /app/publish

# ---------------------------------------------------------------------------
# Runtime
# ---------------------------------------------------------------------------
FROM mcr.microsoft.com/dotnet/aspnet:9.0-alpine AS runtime

# curl for the compose healthcheck; icu so decimal parsing behaves the same
# everywhere. Without ICU, .NET falls back to invariant globalization, and
# while this service always parses money with InvariantCulture, relying on
# that fallback would make a future non-invariant parse behave differently in
# the container than in a test.
RUN apk add --no-cache curl icu-libs
ENV DOTNET_SYSTEM_GLOBALIZATION_INVARIANT=false

WORKDIR /app
COPY --from=build /app/publish .

# Non-root. This service holds the JWT public key and a projection of every
# order; it has no reason to run with more privilege than reading its own code.
RUN adduser --disabled-password --uid 10001 analytics \
    && chown -R analytics:analytics /app
USER analytics

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

# Reports degraded rather than unhealthy when only the broker is down: events
# queue up, but the API is serving, and a restart would not help.
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 \
    CMD curl --fail --silent http://127.0.0.1:8080/health || exit 1

ENTRYPOINT ["dotnet", "Analytics.Api.dll"]
