using MongoDB.Bson.Serialization.Attributes;

namespace Analytics.Api.Models;

/// <summary>A registered account, for sign-up reporting.</summary>
public sealed class UserDim
{
    /// <summary>The Laravel user id.</summary>
    [BsonId]
    public int Id { get; set; }

    public string Name { get; set; } = string.Empty;

    public string Email { get; set; } = string.Empty;

    public string Role { get; set; } = "user";

    public DateTime RegisteredAt { get; set; }
}
