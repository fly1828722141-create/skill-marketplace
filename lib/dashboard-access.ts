export const DASHBOARD_OWNER_EMAIL = 'fly1828722141@gmail.com';

export function isDashboardOwnerEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === DASHBOARD_OWNER_EMAIL;
}

export function isSuperAdminEmail(email?: string | null): boolean {
  return isDashboardOwnerEmail(email);
}

export function canManageSkill(
  email: string | null | undefined,
  currentUserId: string | null | undefined,
  authorId: string
): boolean {
  if (isSuperAdminEmail(email)) return true;
  if (!currentUserId) return false;
  return currentUserId === authorId;
}
