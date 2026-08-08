// Canonical role model — mirrors the `company_member_role` enum in
// supabase/migrations/20260730_multitenant_platform.sql. Platform-wide
// super-admin is intentionally NOT a role here: it is cross-tenant by
// definition (see `users.is_platform_admin`), so it doesn't belong in a
// per-company role list. Role order below is significant: index = rank.
export type UserRole = "OWNER" | "ADMIN" | "MANAGER" | "EMPLOYEE" | "VIEWER";

export const ROLE_RANK: Record<UserRole, number> = {
  VIEWER: 0,
  EMPLOYEE: 1,
  MANAGER: 2,
  ADMIN: 3,
  OWNER: 4,
};

export function roleAtLeast(role: UserRole, minRole: UserRole): boolean {
  return ROLE_RANK[role] >= ROLE_RANK[minRole];
}

export type Permission =
  | "read:leads"
  | "write:leads"
  | "delete:leads"
  | "read:agents"
  | "write:agents"
  | "delete:agents"
  | "read:knowledge"
  | "write:knowledge"
  | "delete:knowledge"
  | "read:prompts"
  | "write:prompts"
  | "read:appointments"
  | "write:appointments"
  | "read:products"
  | "write:products"
  | "delete:products"
  | "read:services"
  | "write:services"
  | "delete:services"
  | "read:employees"
  | "write:employees"
  | "delete:employees"
  | "read:settings"
  | "manage:settings"
  | "manage:api_keys"
  | "manage:members"
  | "manage:branding"
  | "read:cms"
  | "write:cms";

const rolePermissions: Record<UserRole, Permission[]> = {
  OWNER: [
    "read:leads", "write:leads", "delete:leads",
    "read:agents", "write:agents", "delete:agents",
    "read:knowledge", "write:knowledge", "delete:knowledge",
    "read:prompts", "write:prompts",
    "read:appointments", "write:appointments",
    "read:products", "write:products", "delete:products",
    "read:services", "write:services", "delete:services",
    "read:employees", "write:employees", "delete:employees",
    "read:settings", "manage:settings", "manage:api_keys", "manage:members", "manage:branding",
    "read:cms", "write:cms",
  ],
  ADMIN: [
    "read:leads", "write:leads", "delete:leads",
    "read:agents", "write:agents", "delete:agents",
    "read:knowledge", "write:knowledge", "delete:knowledge",
    "read:prompts", "write:prompts",
    "read:appointments", "write:appointments",
    "read:products", "write:products", "delete:products",
    "read:services", "write:services", "delete:services",
    "read:employees", "write:employees", "delete:employees",
    "read:settings", "manage:settings", "manage:api_keys", "manage:members", "manage:branding",
    "read:cms", "write:cms",
  ],
  MANAGER: [
    "read:leads", "write:leads",
    "read:agents", "write:agents",
    "read:knowledge", "write:knowledge",
    "read:prompts", "write:prompts",
    "read:appointments", "write:appointments",
    "read:products", "write:products",
    "read:services", "write:services",
    // Write but not delete, the same tier split the catalog modules use: a
    // manager curates the roster, only OWNER/ADMIN can remove someone from it.
    "read:employees", "write:employees",
    "read:settings",
    "read:cms", "write:cms",
  ],
  EMPLOYEE: [
    "read:leads", "write:leads",
    "read:agents",
    "read:knowledge",
    "read:prompts",
    "read:appointments", "write:appointments",
    "read:products",
    "read:services",
    "read:employees",
    "read:settings",
    "read:cms",
  ],
  VIEWER: [
    "read:leads",
    "read:agents",
    "read:knowledge",
    "read:prompts",
    "read:appointments",
    "read:products",
    "read:services",
    "read:employees",
    "read:settings",
    "read:cms",
  ],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  const permissions = rolePermissions[role] || [];
  return permissions.includes(permission);
}
