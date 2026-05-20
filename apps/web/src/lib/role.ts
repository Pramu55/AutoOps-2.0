import { ORGANIZATIONS_KEY } from '@/lib/auth-session';

export type ConsoleRole = 'OWNER' | 'ADMIN' | 'MEMBER' | 'VIEWER' | string;

type StoredOrganization = {
  id: string;
  name: string;
  slug: string;
  role: ConsoleRole;
};

export function getStoredOrganizations(): StoredOrganization[] {
  if (typeof window === 'undefined') return [];

  const raw = window.sessionStorage.getItem(ORGANIZATIONS_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is StoredOrganization => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Partial<StoredOrganization>;
      return (
        typeof candidate.id === 'string' &&
        typeof candidate.name === 'string' &&
        typeof candidate.slug === 'string' &&
        typeof candidate.role === 'string'
      );
    });
  } catch {
    return [];
  }
}

export function getPrimaryOrganizationRole(): ConsoleRole | null {
  return getStoredOrganizations()[0]?.role ?? null;
}

export function isAdminConsoleRole(role: ConsoleRole | null | undefined): boolean {
  // The local requester account is currently the organization OWNER so it can
  // bootstrap the demo workspace. Keep the separate admin console reserved for
  // the real approver account role.
  return role === 'ADMIN';
}
