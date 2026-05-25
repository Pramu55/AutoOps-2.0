/**
 * Core service for enforcing enterprise data boundaries.
 * 
 * Centralizes data classification and access policy enforcement for all integrations.
 * 
 * Rules:
 * - TENANT_DATA is always organization-scoped.
 * - PROVIDER_STATUS must never expose secrets or credentials.
 * - PROVIDER_INVENTORY is restricted to OWNER/ADMIN roles.
 * 
 * All enforcement happens at the API layer. UI hiding is not security.
 */

import { prisma } from '@autoops/database';
import { UnauthorizedError } from '@autoops/utils';
import { INVENTORY_ACCESS_ROLES, type IntegrationProviderType } from '@autoops/types';

/** Roles that may view provider inventory data. */
const ALLOWED_INVENTORY_ROLES: readonly string[] = INVENTORY_ACCESS_ROLES;

/**
 * Checks if a role is authorized to view provider inventory data.
 */
export function canViewProviderInventory(role?: string): boolean {
  if (!role) return false;
  return ALLOWED_INVENTORY_ROLES.includes(role);
}

type AuthContext = {
  orgId?: string;
  role?: string;
};

/**
 * Throws UnauthorizedError if the caller's role/org is not allowed to view shared provider inventory.
 *
 * This is intentionally stricter than role checks. A newly registered user is OWNER of their own
 * organization, but that must not grant visibility into shared local Jenkins, Docker, Kubernetes,
 * cloud, or observability inventory. Local/demo deployments should explicitly allow the seeded
 * demo organization with PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS or
 * PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS.
 */
export async function requireProviderInventoryAccess(
  auth: AuthContext | undefined,
  _provider?: IntegrationProviderType,
): Promise<void> {
  if (!auth || !canViewProviderInventory(auth.role)) {
    throw new UnauthorizedError(
      'Provider inventory access requires OWNER or ADMIN role. Contact your organization admin.',
    );
  }

  if (!auth.orgId) {
    throw new UnauthorizedError('Organization context is required for provider inventory access.');
  }

  const organization = await prisma.organization.findUnique({
    where: { id: auth.orgId },
    select: { id: true, slug: true },
  });

  if (!organization || !isProviderInventoryOrgAllowed(organization.slug, organization.id)) {
    throw new UnauthorizedError(
      'Provider inventory is not enabled for this organization. Enable it for this org using PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS or PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS.',
    );
  }
}

export function isProviderInventoryOrgAllowed(slug: string, organizationId?: string): boolean {
  const allowlist = providerInventoryAllowlist();
  if (allowlist.slugAllowlist.includes('*') || allowlist.idAllowlist.includes('*')) return true;
  return (
    allowlist.slugAllowlist.includes(slug) ||
    (organizationId ? allowlist.idAllowlist.includes(organizationId) : false)
  );
}

export async function isProviderInventoryAccessEnabledForOrg(organizationId: string): Promise<boolean> {
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, slug: true },
  });

  return organization ? isProviderInventoryOrgAllowed(organization.slug, organization.id) : false;
}

function providerInventoryAllowlist(): { slugAllowlist: string[]; idAllowlist: string[] } {
  return {
    slugAllowlist: [
      ...listEnv(process.env.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS),
      // Backward-compatible env name used by the first provider-boundary pass.
      ...listEnv(process.env.PROVIDER_INVENTORY_ALLOWED_ORG_SLUGS),
    ],
    idAllowlist: listEnv(process.env.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS),
  };
}

function listEnv(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/**
 * Sanitizes provider status to remove sensitive credentials.
 * Used defensively before returning PROVIDER_STATUS to clients.
 */
export function sanitizeProviderStatus<T extends object>(status: T, sensitiveKeys: string[]): T {
  const safe = { ...status } as Record<string, unknown>;
  for (const key of sensitiveKeys) {
    delete safe[key];
  }
  return safe as T;
}
