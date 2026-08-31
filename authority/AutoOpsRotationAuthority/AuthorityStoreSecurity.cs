using System.Security.AccessControl;
using System.Security.Principal;

namespace AutoOpsRotationAuthority;

internal static class AuthorityStoreSecurity
{
    private static readonly SecurityIdentifier TrustedInstallerSid = new("S-1-5-80-956008885-3418522649-1831038044-1853292631-2271478464");

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

    internal static bool RequesterCannotWrite(FileSystemSecurity security, SecurityIdentifier requesterSid)
    {
        if (!security.AreAccessRulesProtected) return false;
        foreach (FileSystemAccessRule rule in security.GetAccessRules(includeExplicit: true, includeInherited: false, typeof(SecurityIdentifier)))
        {
            if (rule.IdentityReference.Value == requesterSid.Value && rule.AccessControlType == AccessControlType.Allow && (rule.FileSystemRights & RequesterWriteRights) != 0) return false;
        }
        return true;
    }

    internal static bool RequesterHasDangerousRight(FileSystemSecurity security, SecurityIdentifier requesterSid, FileSystemRights right)
    {
        if ((right & RequesterWriteRights) == 0) throw new ArgumentOutOfRangeException(nameof(right));
        return security.GetAccessRules(includeExplicit: true, includeInherited: false, typeof(SecurityIdentifier))
            .OfType<FileSystemAccessRule>()
            .Any(rule => rule.IdentityReference.Value == requesterSid.Value && rule.AccessControlType == AccessControlType.Allow && (rule.FileSystemRights & right) != 0);
    }

    internal static bool RequesterHasAnyDangerousRight(DirectorySecurity security, SecurityIdentifier requesterSid) =>
        RequesterHasDangerousRight(security, requesterSid, RequesterWriteRights);

    internal static bool RequesterIdentityHasWritableAuthorityGroup(FileSystemSecurity security, IEnumerable<string> requesterTokenSids)
    {
        var identities = new HashSet<string>(requesterTokenSids, StringComparer.Ordinal);
        return security.GetAccessRules(includeExplicit: true, includeInherited: false, typeof(SecurityIdentifier))
            .OfType<FileSystemAccessRule>()
            .Any(rule => rule.AccessControlType == AccessControlType.Allow && identities.Contains(rule.IdentityReference.Value) && (rule.FileSystemRights & RequesterWriteRights) != 0);
    }

    internal static bool RequesterTokenOwnsBoundary(FileSystemSecurity security, IEnumerable<string> requesterTokenSids)
    {
        var owner = security.GetOwner(typeof(SecurityIdentifier)) as SecurityIdentifier;
        return owner is not null && new HashSet<string>(requesterTokenSids, StringComparer.Ordinal).Contains(owner.Value);
    }

    // An owner can rewrite a DACL without an explicit ChangePermissions ACE.
    // The service therefore treats every owner other than the authority, SYSTEM,
    // or Administrators as untrusted, rather than merely excluding the requester.
    internal static bool HasTrustedBoundaryOwner(FileSystemSecurity security, SecurityIdentifier authoritySid)
    {
        var owner = security.GetOwner(typeof(SecurityIdentifier)) as SecurityIdentifier;
        if (owner is null) return false;
        var administratorsSid = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
        var systemSid = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
        return owner == authoritySid || owner == administratorsSid || owner == systemSid;
    }

    internal static bool HasTrustedWindowsAncestorOwner(FileSystemSecurity security)
    {
        var owner = security.GetOwner(typeof(SecurityIdentifier)) as SecurityIdentifier;
        if (owner is null) return false;
        var administratorsSid = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null);
        var systemSid = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null);
        return owner == administratorsSid || owner == systemSid || owner == TrustedInstallerSid;
    }

    // Installed authority payloads are executable trust boundaries.  Every
    // component in the installed chain is checked against the same owner and
    // dangerous-rights policy as the authority store.  A merely different
    // owner is not sufficient: any non-authority principal with write,
    // delete, ACL, or ownership rights invalidates the chain.
    internal static void AssertTrustedPayloadDescriptor(FileSystemSecurity security, SecurityIdentifier authoritySid, SecurityIdentifier requesterSid)
    {
        if (!HasTrustedBoundaryOwner(security, authoritySid))
            throw new AuthorityException("AUTHORITY_PAYLOAD_OWNER_UNTRUSTED");

        var administratorsSid = new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null).Value;
        var systemSid = new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null).Value;
        foreach (var rule in security.GetAccessRules(includeExplicit: true, includeInherited: true, typeof(SecurityIdentifier))
                     .OfType<FileSystemAccessRule>())
        {
            if (rule.AccessControlType != AccessControlType.Allow || (rule.FileSystemRights & RequesterWriteRights) == 0)
                continue;

            var identity = rule.IdentityReference.Value;
            if (identity != authoritySid.Value && identity != administratorsSid && identity != systemSid)
                throw new AuthorityException("AUTHORITY_PAYLOAD_ACL_INVALID");
        }

        if (RequesterHasDangerousRight(security, requesterSid, RequesterWriteRights))
            throw new AuthorityException("AUTHORITY_PAYLOAD_REQUESTER_WRITABLE");
    }

    // Program Files and its product parent are Windows-managed ancestors, not
    // authority-owned leaves. They may legitimately be owned by
    // TrustedInstaller, but no untrusted principal may have effective rights
    // to replace the AutoOps subtree or rewrite its security descriptor.
    internal static void AssertTrustedWindowsAncestorDescriptor(FileSystemSecurity security, SecurityIdentifier requesterSid)
    {
        if (!HasTrustedWindowsAncestorOwner(security))
            throw new AuthorityException("AUTHORITY_PAYLOAD_ANCESTOR_OWNER_UNTRUSTED");

        var trusted = new HashSet<string>(StringComparer.Ordinal)
        {
            new SecurityIdentifier(WellKnownSidType.BuiltinAdministratorsSid, null).Value,
            new SecurityIdentifier(WellKnownSidType.LocalSystemSid, null).Value,
            TrustedInstallerSid.Value
        };
        foreach (var rule in security.GetAccessRules(includeExplicit: true, includeInherited: true, typeof(SecurityIdentifier))
                     .OfType<FileSystemAccessRule>())
        {
            // Inherit-only ACEs do not grant replacement authority over this
            // ancestor itself. Creation on the ancestor is still evaluated by
            // the effective non-inherit-only ACEs below.
            if (rule.AccessControlType != AccessControlType.Allow ||
                (rule.PropagationFlags & PropagationFlags.InheritOnly) != 0 ||
                (rule.FileSystemRights & RequesterWriteRights) == 0)
                continue;
            if (!trusted.Contains(rule.IdentityReference.Value))
                throw new AuthorityException("AUTHORITY_PAYLOAD_ANCESTOR_ACL_INVALID");
        }

        if (RequesterHasDangerousRight(security, requesterSid, RequesterWriteRights))
            throw new AuthorityException("AUTHORITY_PAYLOAD_ANCESTOR_REQUESTER_WRITABLE");
    }

    internal static void AssertProvisionedDescriptor(string path, SecurityIdentifier authoritySid, SecurityIdentifier requesterSid)
    {
        if (authoritySid == requesterSid) throw new AuthorityException("AUTHORITY_REQUESTER_IDENTITY_CONFLICT");
        var descriptor = new DirectoryInfo(path).GetAccessControl(AccessControlSections.Access | AccessControlSections.Owner);
        if (!descriptor.AreAccessRulesProtected || !RequesterCannotWrite(descriptor, requesterSid) || RequesterTokenOwnsBoundary(descriptor, new[] { requesterSid.Value }) || !HasTrustedBoundaryOwner(descriptor, authoritySid))
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
        var descriptor = new DirectoryInfo(path).GetAccessControl(AccessControlSections.Access | AccessControlSections.Owner);
        if (!descriptor.AreAccessRulesProtected || RequesterHasAnyDangerousRight(descriptor, requesterSid) || RequesterTokenOwnsBoundary(descriptor, new[] { requesterSid.Value }) || !HasTrustedBoundaryOwner(descriptor, authoritySid))
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
