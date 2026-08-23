using System.Text.Json;
using System.Text.RegularExpressions;

namespace AutoOpsRotationAuthority;

internal sealed record AuthoritySettings(string RequesterSid, string SecretRoot, string DockerCliConfigDirectory)
{
    private static readonly Regex Sid = new("^S-1-5-21-[0-9]+-[0-9]+-[0-9]+-[0-9]+$", RegexOptions.CultureInvariant);

    public static AuthoritySettings Load(string storeRoot)
    {
        var path = Path.Combine(storeRoot, "authority-settings.json");
        if (!File.Exists(path)) throw new AuthorityException("AUTHORITY_SETTINGS_UNAVAILABLE");
        try
        {
            using var document = JsonDocument.Parse(File.ReadAllBytes(path));
            AuthorityRequest.AssertNoDuplicateProperties(document.RootElement, "AUTHORITY_SETTINGS_INVALID");
            var root = document.RootElement;
            AuthorityRequest.RequireExactNames(AuthorityRequest.PropertyNames(root, "AUTHORITY_SETTINGS_INVALID"), new[] { "schemaVersion", "requesterSid", "secretRoot", "dockerCliConfigDirectory" }, "AUTHORITY_SETTINGS_INVALID");
            if (root.GetProperty("schemaVersion").GetInt32() != 1) throw new AuthorityException("AUTHORITY_SETTINGS_INVALID");
            var requesterSid = AuthorityRequest.RequiredString(root, "requesterSid", "AUTHORITY_SETTINGS_INVALID");
            var secretRoot = AuthorityRequest.RequiredString(root, "secretRoot", "AUTHORITY_SETTINGS_INVALID");
            var dockerConfig = AuthorityRequest.RequiredString(root, "dockerCliConfigDirectory", "AUTHORITY_SETTINGS_INVALID");
            if (!Sid.IsMatch(requesterSid) || !Path.IsPathFullyQualified(secretRoot) || !Path.IsPathFullyQualified(dockerConfig)) throw new AuthorityException("AUTHORITY_SETTINGS_INVALID");
            return new AuthoritySettings(requesterSid, secretRoot, dockerConfig);
        }
        catch (AuthorityException) { throw; }
        catch { throw new AuthorityException("AUTHORITY_SETTINGS_INVALID"); }
    }
}
