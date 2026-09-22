using System.Diagnostics;

namespace AutoOpsRotationAuthority;

// Recovery advice is computed inside the authority process from its canonical
// plan and the maintained recovery inspector. The requester receives only a
// classification and cannot supply Docker observations or an alternate plan.
internal sealed class AuthorityRecoveryClassifier(AuthoritySettings settings, string storeRoot) : IRecoveryClassifier
{
    private static readonly HashSet<string> AllowedClassifications = new(StringComparer.Ordinal)
    {
        "SAFE_TO_RESUME_PREFLIGHT", "ACTIVATION_IN_PROGRESS", "ROLLBACK_REQUIRED", "NO_ACTION_REQUIRED", "MANUAL_INTERVENTION_REQUIRED"
    };
    private readonly string _secretRoot = settings.SecretRoot;
    private readonly string _planRoot = Path.Combine(storeRoot, "plans");
    private readonly AuthorityInstalledPayloadSet _payloads = AuthorityPathSecurity.RequireTrustedInstalledPayloadSet(
        "scripts", "invoke-authority-recovery-classification.ps1", RecoveryPayloadContract(), settings.RequesterSid);
    private readonly string _dockerConfigRoot = Path.GetFullPath(settings.DockerCliConfigDirectory);
    private readonly string _requesterSid = settings.RequesterSid;

    public string Classify(CanonicalPlan plan, string operationState, CancellationToken cancellationToken)
    {
        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            AuthorityPathSecurity.AssertTrustedDirectoryTree(_dockerConfigRoot, _requesterSid);
            cancellationToken.ThrowIfCancellationRequested();
            using var dockerProxy = AuthenticatedDockerPipeProxy.StartForAuthority(cancellationToken);
            var planPath = Path.Combine(_planRoot, plan.OperationId + ".json");
            if (!File.Exists(planPath)) return "MANUAL_INTERVENTION_REQUIRED";
            var powershell = AuthorityPathSecurity.RequireTrustedWindowsPowerShell(_requesterSid);
            var psi = new ProcessStartInfo(powershell)
            {
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Path.GetDirectoryName(_payloads.EntryPoint)!
            };
            ConfigureMinimalEnvironment(psi, dockerProxy.Endpoint);
            foreach (var argument in new[]
            {
                "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", _payloads.EntryPoint,
                "-TargetRoot", _secretRoot, "-OperationId", plan.OperationId,
                "-AuthorityPlanPath", planPath, "-AuthorityOperationState", operationState
            }) psi.ArgumentList.Add(argument);
            var result = AuthorityProcessRunner.Run(psi, cancellationToken, () =>
            {
                AuthorityPathSecurity.RequireTrustedInstalledPayloadSet(
                    "scripts", "invoke-authority-recovery-classification.ps1", RecoveryPayloadContract(), _requesterSid);
                var currentPowerShell = AuthorityPathSecurity.RequireTrustedWindowsPowerShell(_requesterSid);
                if (!string.Equals(currentPowerShell, powershell, StringComparison.OrdinalIgnoreCase))
                    throw new AuthorityException("AUTHORITY_POWERSHELL_IDENTITY_CHANGED");
            });
            if (result.ExitCode != 0) return "MANUAL_INTERVENTION_REQUIRED";
            var output = result.StandardOutput;
            var values = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                .Where(line => line.StartsWith("RECOVERY_CLASSIFICATION ", StringComparison.Ordinal))
                .Select(line => line["RECOVERY_CLASSIFICATION ".Length..])
                .ToArray();
            return values.Length == 1 && AllowedClassifications.Contains(values[0]) ? values[0] : "MANUAL_INTERVENTION_REQUIRED";
        }
        catch (OperationCanceledException) { throw; }
        catch { return "MANUAL_INTERVENTION_REQUIRED"; }
    }

    private static IReadOnlyDictionary<string, IReadOnlyCollection<string>> RecoveryPayloadContract() =>
        new Dictionary<string, IReadOnlyCollection<string>>(StringComparer.OrdinalIgnoreCase)
        {
            ["invoke-authority-recovery-classification.ps1"] = new[] { "secret-rotation-common.ps1" },
            ["secret-rotation-common.ps1"] = Array.Empty<string>(),
            ["validate-secret-rotation-runtime.ps1"] = new[] { "secret-rotation-common.ps1" }
        };

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
