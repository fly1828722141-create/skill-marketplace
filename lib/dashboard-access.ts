export const DASHBOARD_OWNER_EMAIL = 'fly1828722141@gmail.com';

export function isDashboardOwnerEmail(email?: string | null): boolean {
  if (!email) return false;
  return email.trim().toLowerCase() === DASHBOARD_OWNER_EMAIL;
}
