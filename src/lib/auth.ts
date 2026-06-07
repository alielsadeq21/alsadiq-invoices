/**
 * Password hashing utility using Web Crypto API (SHA-256)
 * Since this is a client-side app with Supabase (no custom backend),
 * we use SHA-256 with a salt for basic password security.
 * This is NOT as secure as bcrypt/scrypt but is the best we can do client-side.
 */

const SALT = 'alsadeq-invoice-system-2026';

/**
 * Hash a password using SHA-256 with salt
 */
export async function hashPassword(password: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + SALT);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

/**
 * Verify a password against a stored hash.
 * Also supports plain text comparison for backwards compatibility
 * (auto-upgrades plain text passwords to hashed format).
 */
export async function verifyPassword(password: string, storedHash: string): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  // Try hashed comparison first
  const hashedInput = await hashPassword(password);
  if (hashedInput === storedHash) {
    return { valid: true, needsUpgrade: false };
  }

  // Fallback: plain text comparison (for backwards compatibility)
  if (password === storedHash) {
    return { valid: true, needsUpgrade: true };
  }

  return { valid: false, needsUpgrade: false };
}
