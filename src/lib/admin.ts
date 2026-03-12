/**
 * Check if a given email is a platform superadmin.
 * Reads from the ADMIN_EMAILS environment variable (comma-separated).
 */
export function isSuperAdmin(email: string | undefined): boolean {
    if (!email) return false;
    const adminEmails = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map(e => e.trim().toLowerCase());
    return adminEmails.includes(email.toLowerCase());
}
