/**
 * The master permission catalog — the fixed set of all powers in the system.
 * Roles are DATA (a name + a chosen subset of these); backend guards check
 * permissions, never role names, so adding a role never needs a code change.
 * See CLAUDE.md §10.
 *
 * Note: `tenant:manage` (provisioning tenants) is intentionally NOT here — it is
 * a platform-level power held by PlatformAdmins, not part of any tenant role.
 */
export const PERMISSIONS = [
  'article:create',
  'article:edit',
  'article:publish',
  'article:delete',
  'article:viewAll',
  'taxonomy:manage',
  'media:upload',
  'media:manage',
  'comment:moderate',
  'edition:manage',
  'epaper:manage',
  'user:view',
  'user:manage',
  'role:manage',
  'subscriber:manage',
  'ad:manage',
  'plan:manage',
  'analytics:view',
  'settings:edit',
  'message:send',
  'seo:manage',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** The seeded, locked role that holds every permission (one per tenant). */
export const SUPER_ADMIN_ROLE_NAME = 'Super Admin';
