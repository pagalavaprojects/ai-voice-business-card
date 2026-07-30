export type UserRole =
  | "SUPER_ADMIN"
  | "COMPANY_ADMIN"
  | "MANAGER"
  | "SALES"
  | "SUPPORT"
  | "VIEWER";

export type Permission =
  | "read:leads"
  | "write:leads"
  | "delete:leads"
  | "read:knowledge"
  | "write:knowledge"
  | "write:prompts"
  | "manage:settings"
  | "manage:users";

const rolePermissions: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: [
    "read:leads",
    "write:leads",
    "delete:leads",
    "read:knowledge",
    "write:knowledge",
    "write:prompts",
    "manage:settings",
    "manage:users",
  ],
  COMPANY_ADMIN: [
    "read:leads",
    "write:leads",
    "delete:leads",
    "read:knowledge",
    "write:knowledge",
    "write:prompts",
    "manage:settings",
  ],
  MANAGER: ["read:leads", "write:leads", "read:knowledge", "write:knowledge"],
  SALES: ["read:leads", "write:leads", "read:knowledge"],
  SUPPORT: ["read:leads", "read:knowledge"],
  VIEWER: ["read:leads", "read:knowledge"],
};

export function hasPermission(role: UserRole, permission: Permission): boolean {
  const permissions = rolePermissions[role] || [];
  return permissions.includes(permission);
}
