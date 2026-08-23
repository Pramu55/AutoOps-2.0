using System.Diagnostics;

namespace AutoOpsRotationAuthority;

// Runtime acceptance remains the maintained PowerShell contract.  The service
// launches only the protected script payload installed beside its executable;
// callers cannot select a script, executable, environment, plan path, or
// target root.  A non-zero validator result is deliberately indistinguishable
// from any other failed acceptance gate to the IPC client.
internal sealed class AuthorityRuntimeValidator(AuthoritySettings settings, string storeRoot) : IRuntimeValidator
{
    private readonly string _secretRoot = settings.SecretRoot;
    private readonly string _planRoot = Path.Combine(storeRoot, "plans");
    private readonly string _script = GetInstalledValidatorPath();

    public bool ValidateRollbackBaseline(CanonicalPlan plan) => Validate(plan, "Rollback");
    public bool ValidateCandidateAcceptance(CanonicalPlan plan) => Validate(plan, "Candidate");

    private bool Validate(CanonicalPlan plan, string mode)
    {
        try
        {
            using var dockerProxy = AuthenticatedDockerPipeProxy.StartForAuthority();
            var powershell = GetWindowsPowerShellPath();
            var planPath = Path.Combine(_planRoot, plan.OperationId + ".json");
            if (!File.Exists(planPath) || (File.GetAttributes(planPath) & FileAttributes.ReparsePoint) != 0) return false;
            var psi = new ProcessStartInfo(powershell)
            {
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true,
                WorkingDirectory = Path.GetDirectoryName(_script)!
            };
            psi.Environment.Clear();
            var windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
            var system = Environment.SystemDirectory;
            if (string.IsNullOrWhiteSpace(windows) || string.IsNullOrWhiteSpace(system)) return false;
            psi.Environment["SystemRoot"] = windows;
            psi.Environment["WINDIR"] = windows;
            psi.Environment["ComSpec"] = Path.Combine(system, "cmd.exe");
            psi.Environment["TEMP"] = Path.GetTempPath();
            psi.Environment["TMP"] = Path.GetTempPath();
            psi.Environment["AUTOOPS_AUTHORITY_DOCKER_ENDPOINT"] = dockerProxy.Endpoint;
            psi.ArgumentList.Add("-NoProfile");
            psi.ArgumentList.Add("-ExecutionPolicy");
            psi.ArgumentList.Add("Bypass");
            psi.ArgumentList.Add("-File");
            psi.ArgumentList.Add(_script);
            psi.ArgumentList.Add("-TargetRoot");
            psi.ArgumentList.Add(_secretRoot);
            psi.ArgumentList.Add("-OperationId");
            psi.ArgumentList.Add(plan.OperationId);
            psi.ArgumentList.Add("-Mode");
            psi.ArgumentList.Add(mode);
            psi.ArgumentList.Add("-AuthorityPlanPath");
            psi.ArgumentList.Add(planPath);
            using var process = Process.Start(psi);
            if (process is null) return false;
            _ = process.StandardOutput.ReadToEnd();
            _ = process.StandardError.ReadToEnd();
            process.WaitForExit();
            return process.ExitCode == 0;
        }
        catch { return false; }
    }

    private static string GetInstalledValidatorPath()
    {
        var path = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "scripts", "validate-secret-rotation-runtime.ps1"));
        var payloadRoot = Path.GetFullPath(Path.Combine(AppContext.BaseDirectory, "scripts"));
        if (!path.StartsWith(payloadRoot + Path.DirectorySeparatorChar, StringComparison.OrdinalIgnoreCase) || !File.Exists(path) || (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
            throw new AuthorityException("AUTHORITY_VALIDATOR_PAYLOAD_UNAVAILABLE");
        return path;
    }

    private static string GetWindowsPowerShellPath()
    {
        var windows = Environment.GetFolderPath(Environment.SpecialFolder.Windows);
        var path = Path.Combine(windows, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
        if (string.IsNullOrWhiteSpace(windows) || !File.Exists(path) || (File.GetAttributes(path) & FileAttributes.ReparsePoint) != 0)
            throw new AuthorityException("AUTHORITY_POWERSHELL_UNAVAILABLE");
        return Path.GetFullPath(path);
    }
}
