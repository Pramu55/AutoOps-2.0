using System.Security.AccessControl;
using System.Security.Principal;

namespace AutoOpsRotationAuthority;

internal sealed record AuthorityPathEntry(bool IsDirectory, bool IsReparse, FileSystemSecurity Descriptor);

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
        var programFiles = Environment.GetFolderPath(Environment.SpecialFolder.ProgramFiles);
        if (string.IsNullOrWhiteSpace(programFiles))
            throw new AuthorityException("AUTHORITY_PAYLOAD_INSTALL_ROOT_UNTRUSTED");
        ValidatePathChainCore(
            trustedRoot,
            path,
            Path.GetFullPath(programFiles),
            new SecurityIdentifier(requesterSid),
            WindowsIdentity.GetCurrent().User ?? throw new AuthorityException("AUTHORITY_SERVICE_IDENTITY_UNAVAILABLE"),
            ReadEntry);
    }

    internal static void ValidateInstalledPathChainForSelfTest(
        string trustedRoot,
        string path,
        string programFiles,
        SecurityIdentifier requesterSid,
        SecurityIdentifier authoritySid,
        Func<string, AuthorityPathEntry> readEntry) =>
        ValidatePathChainCore(trustedRoot, path, programFiles, requesterSid, authoritySid, readEntry);

    private static void ValidatePathChainCore(
        string trustedRoot,
        string path,
        string programFiles,
        SecurityIdentifier requesterSid,
        SecurityIdentifier authoritySid,
        Func<string, AuthorityPathEntry> readEntry)
    {
        var root = Path.GetFullPath(trustedRoot).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var canonical = Path.GetFullPath(path);
        var boundary = Path.GetFullPath(programFiles).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (!IsSameOrChild(canonical, root) || !IsSameOrChild(root, boundary))
            throw new AuthorityException("AUTHORITY_PAYLOAD_PATH_INVALID");

        var current = canonical;
        var reachedBoundary = false;
        while (!string.IsNullOrWhiteSpace(current))
        {
            var entry = readEntry(current);
            if (entry.IsReparse)
                throw new AuthorityException("AUTHORITY_PAYLOAD_REPARSE_BLOCKED");

            if (IsSameOrChild(current, root))
                AuthorityStoreSecurity.AssertTrustedPayloadDescriptor(entry.Descriptor, authoritySid, requesterSid);
            else
                AuthorityStoreSecurity.AssertTrustedWindowsAncestorDescriptor(entry.Descriptor, requesterSid);

            if (string.Equals(current, boundary, StringComparison.OrdinalIgnoreCase))
            {
                reachedBoundary = true;
                break;
            }
            var parent = Path.GetDirectoryName(current);
            if (string.IsNullOrWhiteSpace(parent) || string.Equals(parent, current, StringComparison.OrdinalIgnoreCase)) break;
            current = parent;
        }
        if (!reachedBoundary) throw new AuthorityException("AUTHORITY_PAYLOAD_ANCESTOR_CHAIN_INVALID");
    }

    internal static void AssertTrustedDirectoryTree(string root, string requesterSid)
    {
        var authoritySid = WindowsIdentity.GetCurrent().User ?? throw new AuthorityException("AUTHORITY_SERVICE_IDENTITY_UNAVAILABLE");
        AssertTrustedDirectoryTreeCore(
            root,
            authoritySid,
            new SecurityIdentifier(requesterSid),
            ReadEntry,
            static path => Directory.EnumerateFileSystemEntries(path, "*", SearchOption.TopDirectoryOnly));
    }

    internal static void AssertTrustedDirectoryTreeForSelfTest(
        string root,
        SecurityIdentifier authoritySid,
        SecurityIdentifier requesterSid,
        Func<string, AuthorityPathEntry> readEntry,
        Func<string, IEnumerable<string>> enumerateChildren) =>
        AssertTrustedDirectoryTreeCore(root, authoritySid, requesterSid, readEntry, enumerateChildren);

    private static void AssertTrustedDirectoryTreeCore(
        string root,
        SecurityIdentifier authoritySid,
        SecurityIdentifier requesterSid,
        Func<string, AuthorityPathEntry> readEntry,
        Func<string, IEnumerable<string>> enumerateChildren)
    {
        var canonicalRoot = Path.GetFullPath(root).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var pending = new Stack<string>();
        pending.Push(canonicalRoot);
        while (pending.Count > 0)
        {
            var current = Path.GetFullPath(pending.Pop());
            if (!IsSameOrChild(current, canonicalRoot))
                throw new AuthorityException("AUTHORITY_DOCKER_CONFIG_PATH_INVALID");
            var entry = readEntry(current);
            if (entry.IsReparse) throw new AuthorityException("AUTHORITY_DOCKER_CONFIG_REPARSE_BLOCKED");
            AuthorityStoreSecurity.AssertTrustedPayloadDescriptor(entry.Descriptor, authoritySid, requesterSid);
            if (!entry.IsDirectory) continue;
            foreach (var child in enumerateChildren(current)) pending.Push(child);
        }
    }

    private static AuthorityPathEntry ReadEntry(string path)
    {
        var isDirectory = Directory.Exists(path);
        if (!isDirectory && !File.Exists(path)) throw new AuthorityException("AUTHORITY_PAYLOAD_UNAVAILABLE");
        var attributes = File.GetAttributes(path);
        // Reject the link itself before opening its security descriptor.  ACL
        // access on a junction/symlink path may resolve the target, which
        // would defeat the no-reparse trust walk even though the caller later
        // observes the ReparsePoint flag.
        if ((attributes & FileAttributes.ReparsePoint) != 0)
            throw new AuthorityException("AUTHORITY_PATH_REPARSE_BLOCKED");
        var descriptor = isDirectory
            ? (FileSystemSecurity)new DirectoryInfo(path).GetAccessControl(AccessControlSections.Access | AccessControlSections.Owner)
            : new FileInfo(path).GetAccessControl(AccessControlSections.Access | AccessControlSections.Owner);
        return new AuthorityPathEntry(isDirectory, false, descriptor);
    }

    private static bool IsSameOrChild(string path, string root) =>
        string.Equals(path, root, StringComparison.OrdinalIgnoreCase) ||
        path.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase);
}
