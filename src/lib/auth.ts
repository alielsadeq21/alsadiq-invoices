/**
 * Password hashing utility using Web Crypto API (SHA-256 with per-user salt + multiple iterations)
 * 
 * Security improvements:
 * - Per-user random salt (stored alongside the hash)
 * - Multiple iterations (1000 rounds) to slow down brute-force attacks
 * - No plaintext fallback (removed security vulnerability)
 * - Backwards compatible: can verify old fixed-salt hashes and auto-upgrade them
 */

const LEGACY_SALT = 'alsadeq-system-2026';
const ITERATIONS = 1000;

/**
 * Generate a cryptographically random salt (16 bytes = 32 hex chars)
 */
function generateSalt(): string {
  const saltBytes = new Uint8Array(16);
  crypto.getRandomValues(saltBytes);
  return Array.from(saltBytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Internal: hash password with a given salt using multiple SHA-256 iterations
 */
async function hashWithSalt(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  let data = encoder.encode(password + salt);
  for (let i = 0; i < ITERATIONS; i++) {
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    data = new Uint8Array(hashBuffer);
  }
  const hashArray = Array.from(new Uint8Array(data));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Hash a password with a new random salt.
 * Returns format: "salt$hash" for storage.
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = generateSalt();
  const hash = await hashWithSalt(password, salt);
  return `${salt}$${hash}`;
}

/**
 * Verify a password against a stored hash.
 * 
 * Supports two formats:
 * - New format: "salt$hash" (per-user random salt with iterations)
 * - Legacy format: 64-char hex hash (fixed salt, single iteration)
 * 
 * When a legacy hash is verified, needsUpgrade is set to true
 * so the caller can re-hash with the new format.
 */
export async function verifyPassword(password: string, storedHash: string): Promise<{ valid: boolean; needsUpgrade: boolean }> {
  // New format: salt$hash
  if (storedHash.includes('$')) {
    const [salt, hash] = storedHash.split('$');
    const computedHash = await hashWithSalt(password, salt);
    if (computedHash === hash) {
      return { valid: true, needsUpgrade: false };
    }
    return { valid: false, needsUpgrade: false };
  }

  // Legacy format: fixed salt, single SHA-256 iteration (64-char hex)
  if (storedHash.length === 64) {
    const encoder = new TextEncoder();
    const data = encoder.encode(password + LEGACY_SALT);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const legacyHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    if (legacyHash === storedHash) {
      // Valid but needs upgrade to new format
      return { valid: true, needsUpgrade: true };
    }
  }

  return { valid: false, needsUpgrade: false };
}

/**
 * Minimum password length requirement
 */
export const MIN_PASSWORD_LENGTH = 8;

/**
 * Validate password strength
 */
export function validatePasswordStrength(password: string): { valid: boolean; message: string } {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return { valid: false, message: `كلمة السر يجب أن تكون ${MIN_PASSWORD_LENGTH} أحرف على الأقل` };
  }
  return { valid: true, message: '' };
}
