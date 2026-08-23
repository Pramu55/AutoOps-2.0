using System.Diagnostics;

namespace AutoOpsRotationAuthority;

// Candidate image provenance is an admission prerequisite, not a requester
// preflight hint. The service runs the maintained gate from its protected
// payload against a protected, provisioned source checkout and supplies every
// image/builder value from the canonical plan it already owns.
internal sealed class AuthorityProvenanceValidator : IProvenanceValidator
{
    private const string Builder = "desktop-linux";
    private readonly string _script = GetProtectedFile("scripts", "validate-file-mode-image-provenance.ps1");
    private readonly string _repositoryRoot = GetProtectedDirectory("provenance-repository");

    public bool ValidateCandidateProvenance(CanonicalPlan plan)
    {
        try
        {
            using var dockerProxy = AuthenticatedDockerPipeProxy.StartForAuthority();
            var powershell = GetWindowsPowerShellPath();
            var psi = new ProcessStartInfo(powershell)
            {
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = _repositoryRoot
            };
            ConfigureMinimalEnvironment(psi, dockerProxy.Endpoint);
            psi.ArgumentList.Add("-NoProfile");
            psi.ArgumentList.Add("-ExecutionPolicy");
            psi.ArgumentList.Add("Bypass");
            psi.ArgumentList.Add("-File");
            psi.ArgumentList.Add(_script);
            AddPlanArgument(psi, "-ExpectedRevision", plan, "repositoryRevision");
            AddPlanArgument(psi, "-ApiImage", plan, "candidateApiImage");
            AddPlanArgument(psi, "-WorkerImage", plan, "candidateWorkerImage");
            AddPlanArgument(psi, "-ApiBuildRecordRef", plan, "apiBuildRecordRef");
            AddPlanArgument(psi, "-WorkerBuildRecordRef", plan, "workerBuildRecordRef");
            psi.ArgumentList.Add("-BuildxBuilder");
            psi.ArgumentList.Add(Builder);
            AddPlanArgument(psi, "-ExpectedApiImageId", plan, "apiImageId");
            AddPlanArgument(psi, "-ExpectedWorkerImageId", plan, "workerImageId");
            psi.ArgumentList.Add("-RepositoryRoot");
            psi.ArgumentList.Add(_repositoryRoot);
            using var process = Process.Start(psi);
            if (process is null) return false;
            _ = process.StandardOutput.ReadToEnd();
            _ = process.StandardError.ReadToEnd();
            process.WaitForExit();
            return process.ExitCode == 0;
        }
        catch { return false; }
    }

    private static void AddPlanArgument(ProcessStartInfo psi, string name, CanonicalPlan plan, string property)
    {
        psi.ArgumentList.Add(name);
        psi.ArgumentList.Add(CanonicalPlan.ReadString(plan.Utf8, property));
    }

    private static void ConfigureMinimalEnvironment(ProcessStartInfo psi, string dockerEndpoint)
    {
        psi.Environment.Clear();
        var windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        var system = Environment.SystemDirectory;
        if (string.IsNullOrWhiteSpace(windows) || string.IsNullOrWhiteSpace(system)) throw new AuthorityException("AUTHORITY_POWERSHELL_UNAVAILABLE");
        psi.Environment["SystemRoot"] = windows;
        psi.Environment["WINDIR"] = windows;
        psi.Environment["ComSpec"] = Path.Combine(system, "cmd.exe");
        psi.Environment["TEMP"] = Path.GetTempPath();
        psi.Environment["TMP"] = Path.GetTempPath();
        psi.Environment["AUTOOPS_AUTHORITY_DOCKER_ENDPOINT"] = dockerEndpoint;
    }

    private static string GetProtectedFile(string directory, string filename)
    {
        var root = GetProtectedDirectory(directory);
        var path = Path.GetFullPath(Path.Combine(root, filename));
        if (!path.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !File.Exists(path) || IsReparsePoint(path))
            throw new AuthorityException("AUTHORITY_PROVENANCE_PAYLOAD_UNAVAILABLE");
        return path;
    }

    private static string GetProtectedDirectory(string relative)
    {
        var baseDirectory = Path.GetFullPath(AppContext.BaseDirectory).TrimEnd(Path.DirectorySeparatorChar, Path.AltDirectorySeparatorChar);
        var path = Path.GetFullPath(Path.Combine(baseDirectory, relative));
        if (!path.StartsWith(baseDirectory + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !Directory.Exists(path) || IsReparsePoint(path))
            throw new AuthorityException("AUTHORITY_PROVENANCE_PAYLOAD_UNAVAILABLE");
        return path;
    }

    private static bool IsReparsePoint(string path) => (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0;

    private static string GetWindowsPowerShellPath()
    {
        var windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        var path = Path.Combine(windows, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
        if (string.IsNullOrWhiteSpace(windows) || !File.Exists(path) || IsReparsePoint(path)) throw new AuthorityException("AUTHORITY_POWERSHELL_UNAVAILABLE");
        return Path.GetFullPath(path);
    }
}
