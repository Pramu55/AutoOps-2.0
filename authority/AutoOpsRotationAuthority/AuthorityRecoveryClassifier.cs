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
    private readonly string _script = AuthorityPathSecurity.RequireTrustedInstalledFile("scripts", "invoke-authority-recovery-classification.ps1", settings.RequesterSid);

    public string Classify(CanonicalPlan plan, string operationState, CancellationToken cancellationToken)
    {
        try
        {
            cancellationToken.ThrowIfCancellationRequested();
            using var dockerProxy = AuthenticatedDockerPipeProxy.StartForAuthority(cancellationToken);
            var planPath = Path.Combine(_planRoot, plan.OperationId + ".json");
            if (!File.Exists(planPath)) return "MANUAL_INTERVENTION_REQUIRED";
            var powershell = GetWindowsPowerShellPath();
            var psi = new ProcessStartInfo(powershell)
            {
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Path.GetDirectoryName(_script)!
            };
            ConfigureMinimalEnvironment(psi, dockerProxy.Endpoint);
            foreach (var argument in new[]
            {
                "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", _script,
                "-TargetRoot", _secretRoot, "-OperationId", plan.OperationId,
                "-AuthorityPlanPath", planPath, "-AuthorityOperationState", operationState
            }) psi.ArgumentList.Add(argument);
            var result = AuthorityProcessRunner.Run(psi, cancellationToken);
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
