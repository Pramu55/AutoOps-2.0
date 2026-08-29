using System.Security.AccessControl;
using System.Security.Principal;

namespace AutoOpsRotationAuthority;

internal static class AuthorityPathSecurity
{
    internal static void AssertNoReparseComponents(string path)
    {
        var current = Path.GetFullPath(path);
        while (!string.IsNullOrWhiteSpace(current))
        {
            if (!File.Exists(current) && !Directory.Exists(current))
                throw new AuthorityException("AUTHORITY_PATH_UNAVAILABLE");
            if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                throw new AuthorityException("AUTHORITY_PATH_REPARSE_BLOCKED");
            var parent = Path.GetDirectoryName(current);
            if (string.IsNullOrWhiteSpace(parent) || string.Equals(parent, current, StringComparison.OrdinalIgnoreCase)) break;
            current = parent;
        }
    }

    internal static string RequireTrustedInstalledFile(string relativeDirectory, string filename, string requesterSid)
    {
        var installRoot = GetInstalledRoot();
        var directory = RequireTrustedInstalledDirectory(installRoot, relativeDirectory, requesterSid);
        var path = Path.GetFullPath(Path.Combine(directory, filename));
        if (!path.StartsWith(directory + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !File.Exists(path))
            throw new AuthorityException("AUTHORITY_PAYLOAD_UNAVAILABLE");
        ValidatePathChain(installRoot, path, requesterSid);
        return path;
    }

    internal static string RequireTrustedInstalledDirectory(string relativeDirectory, string requesterSid)
    {
        return RequireTrustedInstalledDirectory(GetInstalledRoot(), relativeDirectory, requesterSid);
    }

    private static string RequireTrustedInstalledDirectory(string installRoot, string relativeDirectory, string requesterSid)
    {
        if (string.IsNullOrWhiteSpace(relativeDirectory) || Path.IsPathFullyQualified(relativeDirectory))
            throw new AuthorityException("AUTHORITY_PAYLOAD_ROOT_INVALID");
        var path = Path.GetFullPath(Path.Combine(installRoot, relativeDirectory));
        if (!path.StartsWith(installRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !Directory.Exists(path))
            throw new AuthorityException("AUTHORITY_PAYLOAD_ROOT_UNAVAILABLE");
        ValidatePathChain(installRoot, path, requesterSid);
        return path;
    }

    private static string GetInstalledRoot()
    {
        var baseDirectory = Path.GetFullPath(AppContext.BaseDirectory)
            .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        var expected = string.IsNullOrWhiteSpace(programFiles)
            ? null
            : Path.GetFullPath(Path.Combine(programFiles, "AutoOps", "RotationAuthority"))
                .TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (expected is null || !string.Equals(baseDirectory, expected, StringComparison.OrdinalIgnoreCase))
            throw new AuthorityException("AUTHORITY_PAYLOAD_INSTALL_ROOT_UNTRUSTED");
        return baseDirectory;
    }

    private static void ValidatePathChain(string trustedRoot, string path, string requesterSid)
    {
        var root = Path.GetFullPath(trustedRoot).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var canonical = Path.GetFullPath(path);
        if (!canonical.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) &&
            !string.Equals(canonical, root, StringComparison.OrdinalIgnoreCase))
            throw new AuthorityException("AUTHORITY_PAYLOAD_PATH_INVALID");

        var authoritySid = WindowsIdentity.GetCurrent().User ?? throw new AuthorityException("AUTHORITY_SERVICE_IDENTITY_UNAVAILABLE");
        var current = canonical;
        while (!string.IsNullOrWhiteSpace(current))
        {
            if (!File.Exists(current) && !Directory.Exists(current))
                throw new AuthorityException("AUTHORITY_PAYLOAD_UNAVAILABLE");
            if ((File.GetAttributes(current) & FileAttributes.ReparsePoint) != 0)
                throw new AuthorityException("AUTHORITY_PAYLOAD_REPARSE_BLOCKED");

            // ACL/owner validation is required from the protected install
            // root through the payload leaf.  Reparse validation continues
            // above that root so a junctioned parent cannot redirect it.
            var withinTrustedRoot = string.Equals(current, root, StringComparison.OrdinalIgnoreCase) ||
                current.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
            if (withinTrustedRoot)
            {
                FileSystemSecurity descriptor = Directory.Exists(current)
                    ? new DirectoryInfo(current).GetAccessControl(AccessControlSections.Access | AccessControlSections.Owner)
                    : new FileInfo(current).GetAccessControl(AccessControlSections.Access | AccessControlSections.Owner);
                AuthorityStoreSecurity.AssertTrustedPayloadDescriptor(descriptor, authoritySid, new SecurityIdentifier(requesterSid));
            }

            if (string.Equals(current, root, StringComparison.OrdinalIgnoreCase)) break;
            var parent = Path.GetDirectoryName(current);
            if (string.IsNullOrWhiteSpace(parent) || string.Equals(parent, current, StringComparison.OrdinalIgnoreCase)) break;
            current = parent;
        }
    }
}
