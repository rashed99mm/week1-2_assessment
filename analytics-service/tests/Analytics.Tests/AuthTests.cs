using System.IdentityModel.Tokens.Jwt;
using System.Net;
using System.Security.Claims;
using System.Security.Cryptography;
using FluentAssertions;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc.Testing;
using Microsoft.Extensions.Configuration;
using Microsoft.IdentityModel.Tokens;
using Xunit;

namespace Analytics.Tests;

/// <summary>
/// Hosts the API with a known RSA key pair and no broker.
/// </summary>
public sealed class ApiFactory : WebApplicationFactory<Program>
{
    public RSA SigningKey { get; } = RSA.Create(2048);

    protected override void ConfigureWebHost(IWebHostBuilder builder)
    {
        var publicKeyPem = SigningKey.ExportSubjectPublicKeyInfoPem();

        builder.UseSetting("Jwt:PublicKey", publicKeyPem);
        builder.UseSetting("Jwt:PublicKeyPath", string.Empty);

        // No broker in these tests: they are about who may call the API, not
        // about consuming events.
        builder.UseSetting("RabbitMq:Enabled", "false");
        builder.UseSetting("Mongo:ConnectionString", "mongodb://127.0.0.1:27099");
        builder.UseSetting("Mongo:Database", "analytics_auth_test");
    }

    /// <summary>Mint a token this API will accept, with the given role.</summary>
    public string TokenFor(int userId, string role, TimeSpan? lifetime = null)
    {
        var credentials = new SigningCredentials(
            new RsaSecurityKey(SigningKey),
            SecurityAlgorithms.RsaSha256);

        var expires = DateTime.UtcNow.Add(lifetime ?? TimeSpan.FromHours(1));

        var token = new JwtSecurityToken(
            claims:
            [
                // A string, per JWT convention — the service parses it to an int.
                new Claim("sub", userId.ToString()),
                new Claim("role", role),
            ],
            // Anchored to the expiry rather than to now, so a negative
            // lifetime produces a token that expired an hour ago rather than
            // one the library refuses to construct.
            notBefore: expires.AddHours(-1),
            expires: expires,
            signingCredentials: credentials);

        return new JwtSecurityTokenHandler().WriteToken(token);
    }
}

/// <summary>
/// Who may read the dashboard.
/// </summary>
/// <remarks>
/// These exist mostly to catch the .NET-specific failure mode: with inbound
/// claim mapping left on, <c>sub</c> is rewritten to a schemas.xmlsoap.org URI
/// and <c>RequireClaim("role", ...)</c> never matches. The token validates,
/// the claim is there, and every request 403s — which reads as an
/// authorization bug rather than a serializer setting.
/// </remarks>
public sealed class AuthTests(ApiFactory factory) : IClassFixture<ApiFactory>
{
    private const string AnyEndpoint = "/api/v1/analytics/kpis";

    private HttpClient ClientWith(string? token)
    {
        var client = factory.CreateClient();

        if (token is not null)
        {
            client.DefaultRequestHeaders.Authorization = new("Bearer", token);
        }

        return client;
    }

    [Fact]
    public async Task Health_is_reachable_without_a_token()
    {
        // The container healthcheck runs before any credential exists.
        var response = await ClientWith(null).GetAsync("/health");

        // Mongo is deliberately unreachable here, so 503 is the expected
        // answer — the point is that it answers at all, unauthenticated.
        response.StatusCode.Should().BeOneOf(HttpStatusCode.OK, HttpStatusCode.ServiceUnavailable);
    }

    [Fact]
    public async Task A_request_with_no_token_is_rejected_in_the_shared_envelope()
    {
        var response = await ClientWith(null).GetAsync(AnyEndpoint);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);

        var body = await response.Content.ReadAsStringAsync();

        // ASP.NET's default 401 has an empty body, which no client in this
        // system can parse.
        body.Should().Contain("\"success\":false");
        body.Should().Contain("\"status_code\":401");
    }

    [Fact]
    public async Task A_non_admin_is_forbidden_in_the_shared_envelope()
    {
        var response = await ClientWith(factory.TokenFor(12, "user")).GetAsync(AnyEndpoint);

        response.StatusCode.Should().Be(HttpStatusCode.Forbidden);

        var body = await response.Content.ReadAsStringAsync();
        body.Should().Contain("\"success\":false");
        body.Should().Contain("\"status_code\":403");
    }

    [Fact]
    public async Task An_admin_token_is_accepted()
    {
        var response = await ClientWith(factory.TokenFor(12, "admin")).GetAsync(AnyEndpoint);

        // Not 401 or 403. Whether it then succeeds depends on Mongo, which is
        // not what this test is about.
        response.StatusCode.Should().NotBe(HttpStatusCode.Unauthorized);
        response.StatusCode.Should().NotBe(HttpStatusCode.Forbidden);
    }

    [Fact]
    public async Task An_expired_token_is_rejected()
    {
        var token = factory.TokenFor(12, "admin", lifetime: TimeSpan.FromMinutes(-10));

        var response = await ClientWith(token).GetAsync(AnyEndpoint);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task A_token_signed_with_another_key_is_rejected()
    {
        using var foreign = RSA.Create(2048);

        var token = new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
            claims: [new Claim("sub", "12"), new Claim("role", "admin")],
            expires: DateTime.UtcNow.AddHours(1),
            signingCredentials: new SigningCredentials(
                new RsaSecurityKey(foreign),
                SecurityAlgorithms.RsaSha256)));

        var response = await ClientWith(token).GetAsync(AnyEndpoint);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task An_unsigned_token_is_rejected()
    {
        // alg: none. Blocked because ValidAlgorithms pins RS256 rather than
        // trusting the header the attacker controls.
        var unsigned = new JwtSecurityTokenHandler().WriteToken(new JwtSecurityToken(
            claims: [new Claim("sub", "12"), new Claim("role", "admin")],
            expires: DateTime.UtcNow.AddHours(1)));

        var response = await ClientWith(unsigned).GetAsync(AnyEndpoint);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }

    [Fact]
    public async Task A_garbage_token_is_rejected()
    {
        var response = await ClientWith("not-a-token").GetAsync(AnyEndpoint);

        response.StatusCode.Should().Be(HttpStatusCode.Unauthorized);
    }
}
