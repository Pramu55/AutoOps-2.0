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
    private readonly string _script = GetInstalledClassifierPath();

    public string Classify(CanonicalPlan plan, string operationState)
    {
        try
        {
            using var dockerProxy = AuthenticatedDockerPipeProxy.StartForAuthority();
            var planPath = Path.Combine(_planRoot, plan.OperationId + ".json");
            if (!File.Exists(planPath) || IsReparsePoint(planPath)) return "MANUAL_INTERVENTION_REQUIRED";
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
            using var process = Process.Start(psi);
            if (process is null) return "MANUAL_INTERVENTION_REQUIRED";
            var output = process.StandardOutput.ReadToEnd();
            _ = process.StandardError.ReadToEnd();
            process.WaitForExit();
            if (process.ExitCode != 0) return "MANUAL_INTERVENTION_REQUIRED";
            var values = output.Split(new[] { '\r', '\n' }, StringSplitOptions.RemoveEmptyEntries)
                .Where(line => line.StartsWith("RECOVERY_CLASSIFICATION ", StringComparison.Ordinal))
                .Select(line => line["RECOVERY_CLASSIFICATION ".Length..])
                .ToArray();
            return values.Length == 1 && AllowedClassifications.Contains(values[0]) ? values[0] : "MANUAL_INTERVENTION_REQUIRED";
        }
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

    private static string GetInstalledClassifierPath()
    {
        var root = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "scripts"));
        var path = Path.GetFullPath(Path.Combine(root, "invoke-authority-recovery-classification.ps1"));
        if (!Directory.Exists(root) || IsReparsePoint(root) || !path.StartsWith(root + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !File.Exists(path) || IsReparsePoint(path))
            throw new AuthorityException("AUTHORITY_RECOVERY_PAYLOAD_UNAVAILABLE");
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
