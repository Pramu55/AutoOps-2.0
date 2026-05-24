import { beforeEach, describe, expect, it, vi } from 'vitest';

const organizationFindUnique = vi.fn();

vi.mock('@autoops/database', () => ({
  prisma: {
    organization: {
      findUnique: organizationFindUnique,
    },
  },
}));

const {
  canViewProviderInventory,
  isProviderInventoryAccessEnabledForOrg,
  requireProviderInventoryAccess,
} = await import('./integration-access.service.js');

describe('integration provider data boundaries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS;
    delete process.env.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS;
    delete process.env.PROVIDER_INVENTORY_ALLOWED_ORG_SLUGS;
    process.env.NODE_ENV = 'test';
  });

  it('allows inventory roles only after the organization is explicitly enabled', async () => {
    process.env.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS = 'autoops-demo';
    organizationFindUnique.mockResolvedValue({
      id: 'org-demo',
      slug: 'autoops-demo',
    });

    await expect(
      requireProviderInventoryAccess({ orgId: 'org-demo', role: 'OWNER' }),
    ).resolves.toBeUndefined();

    expect(organizationFindUnique).toHaveBeenCalledWith({
      where: { id: 'org-demo' },
      select: { id: true, slug: true },
    });
  });

  it('blocks a new organization owner from shared provider inventory by default', async () => {
    organizationFindUnique.mockResolvedValue({
      id: 'org-new',
      slug: 'new-user-workspace',
    });

    await expect(
      requireProviderInventoryAccess({ orgId: 'org-new', role: 'OWNER' }),
    ).rejects.toThrow('Provider inventory is not enabled');
  });

  it('blocks non-inventory roles even when the organization is enabled', async () => {
    await expect(
      requireProviderInventoryAccess({ orgId: 'org-demo', role: 'MEMBER' }),
    ).rejects.toThrow('OWNER or ADMIN');

    expect(organizationFindUnique).not.toHaveBeenCalled();
  });

  it('supports an explicit provider inventory allowlist for company deployments', async () => {
    process.env.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_SLUGS = 'company-a';
    process.env.PROVIDER_INVENTORY_ALLOWED_ORGANIZATION_IDS = 'org-id-b';

    organizationFindUnique.mockResolvedValue({
      id: 'org-id-b',
      slug: 'company-b',
    });

    await expect(isProviderInventoryAccessEnabledForOrg('org-id-b')).resolves.toBe(true);
  });

  it('keeps the legacy slug allowlist supported without enabling every org', async () => {
    process.env.PROVIDER_INVENTORY_ALLOWED_ORG_SLUGS = 'legacy-demo';
    expect(canViewProviderInventory('OWNER')).toBe(true);
    expect(await isProviderInventoryAccessEnabledForOrg('org-legacy')).toBe(false);

    organizationFindUnique.mockResolvedValue({
      id: 'org-legacy',
      slug: 'legacy-demo',
    });

    await expect(isProviderInventoryAccessEnabledForOrg('org-legacy')).resolves.toBe(true);
  });

  it('keeps unknown roles denied by default', () => {
    expect(canViewProviderInventory()).toBe(false);
    expect(canViewProviderInventory('VIEWER')).toBe(false);
    expect(canViewProviderInventory('OWNER')).toBe(true);
    expect(canViewProviderInventory('ADMIN')).toBe(true);
  });
});
