using System.Diagnostics;
using System.Security.AccessControl;
using System.Security.Principal;
using System.Text;
using System.Text.RegularExpressions;

namespace AutoOpsRotationAuthority;

internal sealed record AuthorityPathEntry(bool IsDirectory, bool IsReparse, FileSystemSecurity Descriptor);
internal sealed record AuthorityInstalledPayloadSet(string EntryPoint, IReadOnlyList<string> Files);

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

    internal static AuthorityInstalledPayloadSet RequireTrustedInstalledPayloadSet(
        string relativeDirectory,
        string entryPointFilename,
        IReadOnlyDictionary<string, IReadOnlyCollection<string>> payloadContract,
        string requesterSid)
    {
        entryPointFilename = RequireSimplePayloadFilename(entryPointFilename);
        var filenames = payloadContract.Keys.Select(RequireSimplePayloadFilename).ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (filenames.Count != payloadContract.Count || !filenames.Contains(entryPointFilename))
            throw new AuthorityException("AUTHORITY_PAYLOAD_SET_INVALID");
        var filesByName = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var filename in filenames.OrderBy(static name => name, StringComparer.OrdinalIgnoreCase))
            filesByName[filename] = RequireTrustedInstalledFile(relativeDirectory, filename, requesterSid);
        foreach (var (filename, directDotSources) in payloadContract)
        {
            var declared = directDotSources.Select(RequireSimplePayloadFilename).ToHashSet(StringComparer.OrdinalIgnoreCase);
            if (declared.Count != directDotSources.Count || declared.Any(dependency => !filenames.Contains(dependency)))
                throw new AuthorityException("AUTHORITY_PAYLOAD_SET_INVALID");
            ValidateDeclaredDotSources(filesByName[filename], declared, requesterSid);
        }
        var entryPoint = filesByName[entryPointFilename];
        var files = new List<string> { entryPoint };
        files.AddRange(filesByName.Where(pair => !string.Equals(pair.Key, entryPointFilename, StringComparison.OrdinalIgnoreCase))
            .OrderBy(static pair => pair.Key, StringComparer.OrdinalIgnoreCase).Select(static pair => pair.Value));
        return new AuthorityInstalledPayloadSet(entryPoint, files.AsReadOnly());
    }

    internal static string RequireTrustedWindowsPowerShell(string requesterSid)
    {
        _ = new SecurityIdentifier(requesterSid);
        var windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        if (string.IsNullOrWhiteSpace(windows)) throw new AuthorityException("AUTHORITY_POWERSHELL_UNAVAILABLE");
        var root = Path.GetFullPath(windows).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var path = Path.GetFullPath(Path.Combine(root, "System32", "WindowsPowerShell", "v1.0", "powershell.exe"));
        if (!File.Exists(path) || !IsSameOrChild(path, root)) throw new AuthorityException("AUTHORITY_POWERSHELL_UNAVAILABLE");
        ValidateWindowsPathChainCore(path, root, new SecurityIdentifier(requesterSid), ReadEntry);
        return path;
    }

    internal static void ValidateDeclaredDotSourcesForSelfTest(string source, IReadOnlyCollection<string> dependencies)
    {
        var path = Path.Combine(Path.GetTempPath(), $"autoops-payload-parser-{Guid.NewGuid():N}.ps1");
        try
        {
            File.WriteAllText(path, source, new UTF8Encoding(false));
            var requesterSid = WindowsIdentity.GetCurrent().User?.Value ?? throw new AuthorityException("AUTHORITY_REQUESTER_IDENTITY_UNAVAILABLE");
            ValidateDeclaredDotSources(path, dependencies.Select(RequireSimplePayloadFilename).ToHashSet(StringComparer.OrdinalIgnoreCase), requesterSid);
        }
        finally
        {
            try { File.Delete(path); } catch { }
        }
    }

    private static string RequireSimplePayloadFilename(string filename)
    {
        if (string.IsNullOrWhiteSpace(filename) || filename != Path.GetFileName(filename) ||
            filename.IndexOfAny(new[] { Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar }) >= 0)
            throw new AuthorityException("AUTHORITY_PAYLOAD_SET_INVALID");
        return filename;
    }

    private static void ValidateDeclaredDotSources(string sourcePath, IReadOnlySet<string> declared, string requesterSid)
    {
        var found = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        foreach (var extent in ReadDotSourceExtents(sourcePath, requesterSid))
        {
            var match = Regex.Match(extent.Trim(),
                @"^\.\s+\(\s*Join-Path\s+\$PSScriptRoot\s+(?:'(?<single>[^']+)'|""(?<double>[^""]+)"")\s*\)$",
                RegexOptions.CultureInvariant | RegexOptions.IgnoreCase);
            if (!match.Success) throw new AuthorityException("AUTHORITY_DYNAMIC_DOT_SOURCE_BLOCKED");
            var dependency = match.Groups["single"].Success ? match.Groups["single"].Value : match.Groups["double"].Value;
            dependency = RequireSimplePayloadFilename(dependency);
            if (!found.Add(dependency)) throw new AuthorityException("AUTHORITY_PAYLOAD_SET_INVALID");
        }
        if (!found.SetEquals(declared)) throw new AuthorityException("AUTHORITY_UNDECLARED_DOT_SOURCE_BLOCKED");
    }

    private static IReadOnlyList<string> ReadDotSourceExtents(string sourcePath, string requesterSid)
    {
        const string parserScript = """
$ErrorActionPreference = 'Stop'
$SourcePath = [Environment]::GetEnvironmentVariable('AUTOOPS_PAYLOAD_PARSE_PATH', 'Process')
if ([string]::IsNullOrWhiteSpace($SourcePath)) { exit 40 }
$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($SourcePath, [ref]$tokens, [ref]$parseErrors)
if ($null -eq $ast -or @($parseErrors).Count -ne 0) { exit 41 }
$dotSources = @($ast.FindAll({
  param($node)
  $node -is [System.Management.Automation.Language.CommandAst] -and
    $node.InvocationOperator -eq [System.Management.Automation.Language.TokenKind]::Dot
}, $true))
foreach ($dotSource in $dotSources) {
  [Console]::Out.WriteLine([Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($dotSource.Extent.Text)))
}
""";
        var powershell = RequireTrustedWindowsPowerShell(requesterSid);
        var windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        var psi = new ProcessStartInfo(powershell)
        {
            UseShellExecute = false,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            CreateNoWindow = true,
            WorkingDirectory = Path.GetDirectoryName(sourcePath) ?? throw new AuthorityException("AUTHORITY_PAYLOAD_SET_INVALID")
        };
        psi.Environment.Clear();
        psi.Environment["SystemRoot"] = windows;
        psi.Environment["WINDIR"] = windows;
        psi.Environment["AUTOOPS_PAYLOAD_PARSE_PATH"] = sourcePath;
        psi.Environment["PATH"] = string.Join(Path.PathSeparator,
            Path.Combine(windows, "System32"),
            Path.Combine(windows, "System32", "WindowsPowerShell", "v1.0"));
        psi.ArgumentList.Add("-NoProfile");
        psi.ArgumentList.Add("-NonInteractive");
        psi.ArgumentList.Add("-ExecutionPolicy");
        psi.ArgumentList.Add("Bypass");
        psi.ArgumentList.Add("-Command");
        psi.ArgumentList.Add(parserScript);

        using var process = new Process { StartInfo = psi };
        var currentPowerShell = RequireTrustedWindowsPowerShell(requesterSid);
        if (!string.Equals(currentPowerShell, powershell, StringComparison.OrdinalIgnoreCase) || !process.Start())
            throw new AuthorityException("AUTHORITY_PAYLOAD_PARSE_FAILED");
        var standardOutput = process.StandardOutput.ReadToEndAsync();
        var standardError = process.StandardError.ReadToEndAsync();
        if (!process.WaitForExit(5_000))
        {
            try { process.Kill(entireProcessTree: true); } catch { }
            throw new AuthorityException("AUTHORITY_PAYLOAD_PARSE_TIMEOUT");
        }
        var output = standardOutput.GetAwaiter().GetResult();
        _ = standardError.GetAwaiter().GetResult();
        if (process.ExitCode != 0 || output.Length > 1_048_576)
            throw new AuthorityException("AUTHORITY_PAYLOAD_PARSE_FAILED");
        var extents = new List<string>();
        foreach (var line in output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries))
        {
            if (extents.Count >= 128) throw new AuthorityException("AUTHORITY_PAYLOAD_PARSE_FAILED");
            try
            {
                extents.Add(Encoding.UTF8.GetString(Convert.FromBase64String(line)));
            }
            catch (FormatException)
            {
                throw new AuthorityException("AUTHORITY_PAYLOAD_PARSE_FAILED");
            }
        }
        return extents.AsReadOnly();
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

    internal static void ValidateWindowsPathChainForSelfTest(
        string path,
        string windowsRoot,
        SecurityIdentifier requesterSid,
        Func<string, AuthorityPathEntry> readEntry) =>
        ValidateWindowsPathChainCore(path, windowsRoot, requesterSid, readEntry);

    private static void ValidateWindowsPathChainCore(
        string path,
        string windowsRoot,
        SecurityIdentifier requesterSid,
        Func<string, AuthorityPathEntry> readEntry)
    {
        var canonical = Path.GetFullPath(path);
        var boundary = Path.GetFullPath(windowsRoot).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        if (!IsSameOrChild(canonical, boundary)) throw new AuthorityException("AUTHORITY_WINDOWS_EXECUTABLE_PATH_INVALID");
        var current = canonical;
        while (true)
        {
            var entry = readEntry(current);
            if (entry.IsReparse) throw new AuthorityException("AUTHORITY_WINDOWS_EXECUTABLE_REPARSE_BLOCKED");
            AuthorityStoreSecurity.AssertTrustedWindowsAncestorDescriptor(entry.Descriptor, requesterSid);
            if (string.Equals(current, boundary, StringComparison.OrdinalIgnoreCase)) break;
            current = Path.GetDirectoryName(current) ?? throw new AuthorityException("AUTHORITY_WINDOWS_EXECUTABLE_ANCESTRY_INVALID");
        }
    }

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
