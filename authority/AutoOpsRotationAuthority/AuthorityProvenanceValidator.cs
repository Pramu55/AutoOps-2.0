using System.Diagnostics;

namespace AutoOpsRotationAuthority;

// Candidate image provenance is an admission prerequisite, not a requester
// preflight hint. The service runs the maintained gate from its protected
// payload against a protected, provisioned source checkout and supplies every
// image/builder value from the canonical plan it already owns.
internal sealed class AuthorityProvenanceValidator : IProvenanceValidator
{
    private const string Builder = "desktop-linux";
    private readonly string _script;
    private readonly string _repositoryRoot;

    internal AuthorityProvenanceValidator(string requesterSid)
    {
        _script = AuthorityPathSecurity.RequireTrustedInstalledFile("scripts", "validate-file-mode-image-provenance.ps1", requesterSid);
        _repositoryRoot = AuthorityPathSecurity.RequireTrustedInstalledDirectory("provenance-repository", requesterSid);
    }

    public bool ValidateCandidateProvenance(CanonicalPlan plan, CancellationToken cancellationToken)
    {
        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            using var dockerProxy = AuthenticatedDockerPipeProxy.StartForAuthority(cancellationToken);
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
            return AuthorityProcessRunner.Run(psi, cancellationToken).ExitCode == 0;
        }
        catch (OperationCanceledException) { throw; }
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

    private static string GetWindowsPowerShellPath()
    {
        var windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        var path = Path.Combine(windows, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
        if (string.IsNullOrWhiteSpace(windows) || !File.Exists(path)) throw new AuthorityException("AUTHORITY_POWERSHELL_UNAVAILABLE");
        AuthorityPathSecurity.AssertNoReparseComponents(path);
        return Path.GetFullPath(path);
    }
}
