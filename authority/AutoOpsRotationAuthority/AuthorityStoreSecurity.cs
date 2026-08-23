using System.Security.AccessControl;
using System.Security.Principal;

namespace AutoOpsRotationAuthority;

internal static class AuthorityStoreSecurity
{
    private const FileSystemRights RequesterWriteRights =
        FileSystemRights.WriteData | FileSystemRights.AppendData | FileSystemRights.WriteAttributes |
        FileSystemRights.WriteExtendedAttributes | FileSystemRights.Delete | FileSystemRights.DeleteSubdirectoriesAndFiles |
        FileSystemRights.ChangePermissions | FileSystemRights.TakeOwnership;

    internal static DirectorySecurity CreateExpectedDescriptor(SecurityIdentifier authoritySid, SecurityIdentifier requesterSid)
    {
        if (authoritySid == requesterSid) throw new AuthorityException("AUTHORITY_REQUESTER_IDENTITY_CONFLICT");
        var security = new DirectorySecurity();
        security.SetAccessRuleProtection(isProtected: true, preserveInheritance: false);
        var inheritance = InheritanceFlags.ContainerInherit | InheritanceFlags.ObjectInherit;
        security.AddAccessRule(new FileSystemAccessRule(authoritySid, FileSystemRights.FullControl, inheritance, PropagationFlags.None, AccessControlType.Allow));
        security.AddAccessRule(new FileSystemAccessRule(new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null), FileSystemRights.FullControl, inheritance, PropagationFlags.None, AccessControlType.Allow));
        security.AddAccessRule(new FileSystemAccessRule(requesterSid, FileSystemRights.ReadAndExecute | FileSystemRights.Synchronize, inheritance, PropagationFlags.None, AccessControlType.Allow));
        return security;
    }

    internal static bool RequesterCannotWrite(DirectorySecurity security, SecurityIdentifier requesterSid)
    {
        if (!security.AreAccessRulesProtected) return false;
        foreach (FileSystemAccessRule rule in security.GetAccessRules(includeExplicit: true, includeInherited: false, typeof(SecurityIdentifier)))
        {
            if (rule.IdentityReference.Value == requesterSid.Value && rule.AccessControlType == AccessControlType.Allow && (rule.FileSystemRights & RequesterWriteRights) != 0) return false;
        }
        return true;
    }

    internal static bool RequesterHasDangerousRight(DirectorySecurity security, SecurityIdentifier requesterSid, FileSystemRights right)
    {
        if ((right & RequesterWriteRights) == 0) throw new ArgumentOutOfRangeException(nameof(right));
        return security.GetAccessRules(includeExplicit: true, includeInherited: false, typeof(SecurityIdentifier))
            .OfType<FileSystemAccessRule>()
            .Any(rule => rule.IdentityReference.Value == requesterSid.Value && rule.AccessControlType == AccessControlType.Allow && (rule.FileSystemRights & right) != 0);
    }

    internal static bool RequesterHasAnyDangerousRight(DirectorySecurity security, SecurityIdentifier requesterSid) =>
        RequesterHasDangerousRight(security, requesterSid, RequesterWriteRights);

    internal static bool RequesterIdentityHasWritableAuthorityGroup(DirectorySecurity security, IEnumerable<string> requesterTokenSids)
    {
        var identities = new HashSet<string>(requesterTokenSids, StringComparer.Ordinal);
        return security.GetAccessRules(includeExplicit: true, includeInherited: false, typeof(SecurityIdentifier))
            .OfType<FileSystemAccessRule>()
            .Any(rule => rule.AccessControlType == AccessControlType.Allow && identities.Contains(rule.IdentityReference.Value) && (rule.FileSystemRights & RequesterWriteRights) != 0);
    }

    internal static void AssertProvisionedDescriptor(string path, SecurityIdentifier authoritySid, SecurityIdentifier requesterSid)
    {
        if (authoritySid == requesterSid) throw new AuthorityException("AUTHORITY_REQUESTER_IDENTITY_CONFLICT");
        var descriptor = new DirectoryInfo(path).GetAccessControl(AccessControlSections.Access);
        if (!descriptor.AreAccessRulesProtected || !RequesterCannotWrite(descriptor, requesterSid))
        {
            throw new AuthorityException("AUTHORITY_STORE_ACL_INVALID");
        }
        var rules = descriptor.GetAccessRules(includeExplicit: true, includeInherited: false, typeof(SecurityIdentifier)).OfType<FileSystemAccessRule>().ToArray();
        var authorityFullControl = rules.Any(rule => rule.IdentityReference.Value == authoritySid.Value && rule.AccessControlType == AccessControlType.Allow && (rule.FileSystemRights & FileSystemRights.FullControl) == FileSystemRights.FullControl);
        var administratorsSid = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null).Value;
        var administratorsFullControl = rules.Any(rule => rule.IdentityReference.Value == administratorsSid && rule.AccessControlType == AccessControlType.Allow && (rule.FileSystemRights & FileSystemRights.FullControl) == FileSystemRights.FullControl);
        if (!authorityFullControl || !administratorsFullControl) throw new AuthorityException("AUTHORITY_STORE_ACL_INVALID");
        var systemSid = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null).Value;
        foreach (var rule in rules.Where(rule => rule.AccessControlType == AccessControlType.Allow && (rule.FileSystemRights & RequesterWriteRights) != 0))
        {
            var identity = rule.IdentityReference.Value;
            if (identity != authoritySid.Value && identity != administratorsSid && identity != systemSid)
            {
                throw new AuthorityException("AUTHORITY_STORE_ACL_INVALID");
            }
        }
    }

    internal static void AssertAuthorityStoreParentDescriptor(string path, SecurityIdentifier authoritySid, SecurityIdentifier requesterSid)
    {
        var descriptor = new DirectoryInfo(path).GetAccessControl(AccessControlSections.Access);
        if (!descriptor.AreAccessRulesProtected || RequesterHasAnyDangerousRight(descriptor, requesterSid))
        {
            throw new AuthorityException("AUTHORITY_STORE_PARENT_ACL_INVALID");
        }
        var administratorsSid = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null).Value;
        var systemSid = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null).Value;
        foreach (FileSystemAccessRule rule in descriptor.GetAccessRules(includeExplicit: true, includeInherited: false, typeof(SecurityIdentifier)))
        {
            if (rule.AccessControlType != AccessControlType.Allow || (rule.FileSystemRights & RequesterWriteRights) == 0) continue;
            var identity = rule.IdentityReference.Value;
            if (identity != authoritySid.Value && identity != administratorsSid && identity != systemSid)
            {
                throw new AuthorityException("AUTHORITY_STORE_PARENT_ACL_INVALID");
            }
        }
    }
}
