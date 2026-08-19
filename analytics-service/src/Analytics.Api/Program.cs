using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using Analytics.Api.Common;
using Analytics.Api.Infrastructure;
using Analytics.Api.Messaging;
using Analytics.Api.Messaging.Projectors;
using Analytics.Api.Repositories;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.JsonWebTokens;
using Microsoft.IdentityModel.Tokens;

// This line is not optional, and it must run before AddAuthentication.
//
// The handler otherwise rewrites `sub` to
// http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier, so
// User.FindFirst("sub") returns null. The token validates, the claim is
// present, and authorization fails anyway — which is why "works in Postman,
// 403s in .NET" is the most-reported symptom of this setup.
JsonWebTokenHandler.DefaultInboundClaimTypeMap.Clear();

var builder = WebApplication.CreateBuilder(args);

// ---------------------------------------------------------------------------
// Serialization
// ---------------------------------------------------------------------------
builder.Services.ConfigureHttpJsonOptions(options =>
{
    options.SerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
    options.SerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
});

builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
    {
        // Without this the envelope goes out as `statusCode` while every other
        // service emits `status_code`, and clients silently read null.
        options.JsonSerializerOptions.PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower;
        options.JsonSerializerOptions.DefaultIgnoreCondition = JsonIgnoreCondition.Never;
    });

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------
builder.Services.Configure<MongoOptions>(
    builder.Configuration.GetSection(MongoOptions.SectionName));
builder.Services.Configure<RabbitMqOptions>(
    builder.Configuration.GetSection(RabbitMqOptions.SectionName));

builder.Services.AddSingleton<MongoContext>();
builder.Services.AddScoped<IAnalyticsRepository, MongoAnalyticsRepository>();
builder.Services.AddScoped<OrderProjector>();
builder.Services.AddScoped<DimensionProjector>();
builder.Services.AddScoped<EventProcessor>();

builder.Services.AddHostedService<MongoIndexInitializer>();
builder.Services.AddSingleton<EventConsumerService>();
builder.Services.AddHostedService(sp => sp.GetRequiredService<EventConsumerService>());

// ---------------------------------------------------------------------------
// Authentication
// ---------------------------------------------------------------------------
var publicKeyPath = builder.Configuration["Jwt:PublicKeyPath"];
var publicKeyPem = !string.IsNullOrWhiteSpace(publicKeyPath) && File.Exists(publicKeyPath)
    ? File.ReadAllText(publicKeyPath)
    : builder.Configuration["Jwt:PublicKey"];

if (string.IsNullOrWhiteSpace(publicKeyPem))
{
    throw new InvalidOperationException(
        "A JWT public key is required. Set Jwt:PublicKeyPath (preferred) or Jwt:PublicKey. " +
        "See docs/contracts/auth-jwt.md.");
}

var rsa = RSA.Create();
rsa.ImportFromPem(publicKeyPem);

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.MapInboundClaims = false;

        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuerSigningKey = true,
            IssuerSigningKey = new RsaSecurityKey(rsa),

            // Pinned rather than taken from the token header. A verifier that
            // honours the token's own `alg` can be handed `alg: none`, or an
            // HS256 token signed with this public key treated as a shared
            // secret. Both are standard forgeries; both are blocked here.
            ValidAlgorithms = [SecurityAlgorithms.RsaSha256],

            // The issuer is the login URL and therefore differs per
            // environment, and the library emits no `aud` at all — enabling
            // audience validation would reject every token.
            ValidateIssuer = false,
            ValidateAudience = false,

            ValidateLifetime = true,
            ClockSkew = TimeSpan.FromSeconds(30),

            NameClaimType = "sub",
            RoleClaimType = "role",
        };

        // ASP.NET's default 401 and 403 have empty bodies, which no client in
        // this system can parse. Render them through the shared envelope.
        options.Events = new JwtBearerEvents
        {
            OnChallenge = async ctx =>
            {
                ctx.HandleResponse();
                ctx.Response.StatusCode = StatusCodes.Status401Unauthorized;
                ctx.Response.ContentType = "application/json";

                await ctx.Response.WriteAsJsonAsync(
                    ApiResponse.Fail("Unauthenticated.", 401),
                    SnakeCase());
            },
            OnForbidden = async ctx =>
            {
                ctx.Response.StatusCode = StatusCodes.Status403Forbidden;
                ctx.Response.ContentType = "application/json";

                await ctx.Response.WriteAsJsonAsync(
                    ApiResponse.Fail("This action requires administrator privileges.", 403),
                    SnakeCase());
            },
        };
    });

builder.Services.AddAuthorization(options =>
{
    // RequireClaim, not RequireRole: RequireRole depends on claim-type mapping,
    // which the line at the top of this file deliberately disables.
    options.AddPolicy("AdminOnly", policy => policy
        .RequireAuthenticatedUser()
        .RequireClaim("role", "admin"));
});

var app = builder.Build();

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// ---------------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------------
// Unauthenticated: the container healthcheck runs before any credential
// exists. Reports degraded rather than unhealthy when only the broker is down
// — events queue up, but this service is serving, and restarting it would not
// help.
app.MapGet("/health", async (MongoContext mongo, EventConsumerService consumer) =>
{
    var mongoUp = await PingAsync(mongo);

    return Results.Json(new
    {
        status = mongoUp ? (consumer.Connected ? "ok" : "degraded") : "unhealthy",
        mongo = mongoUp ? "up" : "down",
        broker = consumer.Connected ? "up" : "down",
    }, statusCode: mongoUp ? 200 : 503);
});

app.Run();

static async Task<bool> PingAsync(MongoContext mongo)
{
    try
    {
        await mongo.Database.RunCommandAsync<MongoDB.Bson.BsonDocument>(
            new MongoDB.Bson.BsonDocument("ping", 1));
        return true;
    }
    catch
    {
        return false;
    }
}

// A local function, not a property: a top-level program's compilation unit
// cannot declare members, only local functions.
static JsonSerializerOptions SnakeCase() => new()
{
    PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    DefaultIgnoreCondition = JsonIgnoreCondition.Never,
};

/// <summary>Exposed so WebApplicationFactory can host this app in tests.</summary>
public partial class Program;
