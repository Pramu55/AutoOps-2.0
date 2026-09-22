using System.Diagnostics;

namespace AutoOpsRotationAuthority;

// Candidate image provenance is an admission prerequisite, not a requester
// preflight hint. The service runs the maintained gate from its protected
// payload against a protected, provisioned source checkout and supplies every
// image/builder value from the canonical plan it already owns.
internal sealed class AuthorityProvenanceValidator : IProvenanceValidator
{
    private const string Builder = "desktop-linux";
    private readonly AuthorityInstalledPayloadSet _payloads;
    private readonly string _repositoryRoot;
    private readonly string _dockerConfigRoot;
    private readonly string _requesterSid;

    internal AuthorityProvenanceValidator(AuthoritySettings settings)
    {
        _payloads = AuthorityPathSecurity.RequireTrustedInstalledPayloadSet(
            "scripts", "validate-file-mode-image-provenance.ps1", ProvenancePayloadContract(), settings.RequesterSid);
        _repositoryRoot = AuthorityPathSecurity.RequireTrustedInstalledDirectory("provenance-repository", settings.RequesterSid);
        _dockerConfigRoot = Path.GetFullPath(settings.DockerCliConfigDirectory);
        _requesterSid = settings.RequesterSid;
    }

    public bool ValidateCandidateProvenance(CanonicalPlan plan, CancellationToken cancellationToken)
    {
        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            // Buildx metadata is authority only after every existing node in
            // the protected Docker CLI tree has been revalidated. Startup
            // validation alone would leave a time-of-use gap.
            AuthorityPathSecurity.AssertTrustedDirectoryTree(_dockerConfigRoot, _requesterSid);
            cancellationToken.ThrowIfCancellationRequested();
            using var dockerProxy = AuthenticatedDockerPipeProxy.StartForAuthority(cancellationToken);
            var powershell = AuthorityPathSecurity.RequireTrustedWindowsPowerShell(_requesterSid);
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
            psi.ArgumentList.Add(_payloads.EntryPoint);
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
            return AuthorityProcessRunner.Run(psi, cancellationToken, () =>
            {
                AuthorityPathSecurity.RequireTrustedInstalledPayloadSet(
                    "scripts", "validate-file-mode-image-provenance.ps1", ProvenancePayloadContract(), _requesterSid);
                var currentPowerShell = AuthorityPathSecurity.RequireTrustedWindowsPowerShell(_requesterSid);
                if (!string.Equals(currentPowerShell, powershell, StringComparison.OrdinalIgnoreCase))
                    throw new AuthorityException("AUTHORITY_POWERSHELL_IDENTITY_CHANGED");
            }).ExitCode == 0;
        }
        catch (OperationCanceledException) { throw; }
        catch { return false; }
    }

    private static IReadOnlyDictionary<string, IReadOnlyCollection<string>> ProvenancePayloadContract() =>
        new Dictionary<string, IReadOnlyCollection<string>>(StringComparer.OrdinalIgnoreCase)
        {
            ["validate-file-mode-image-provenance.ps1"] = Array.Empty<string>()
        };

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

}
