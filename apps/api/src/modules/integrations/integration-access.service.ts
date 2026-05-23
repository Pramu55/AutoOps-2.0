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

import { UnauthorizedError } from '@autoops/utils';
import { INVENTORY_ACCESS_ROLES } from '@autoops/types';

/** Roles that may view provider inventory data. */
const ALLOWED_INVENTORY_ROLES: readonly string[] = INVENTORY_ACCESS_ROLES;

/**
 * Checks if a role is authorized to view provider inventory data.
 */
export function canViewProviderInventory(role?: string): boolean {
  if (!role) return false;
  return ALLOWED_INVENTORY_ROLES.includes(role);
}

/**
 * Throws UnauthorizedError if the caller's role is not OWNER or ADMIN.
 * Use as a defense-in-depth guard inside controllers, behind route-level requireRole.
 */
export function requireProviderInventoryAccess(auth: { role?: string } | undefined): void {
  if (!auth || !canViewProviderInventory(auth.role)) {
    throw new UnauthorizedError(
      'Provider inventory access requires OWNER or ADMIN role. Contact your organization admin.',
    );
  }
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
