import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 12 bytes recommended for AES-GCM
const REQUIRED_KEY_MIN_LENGTH = 16; // Minimum raw key length in characters

/**
 * Resolves and validates the PIN encryption key.
 *
 * Phase 3.2 (K): FAIL-FAST — hardcoded fallback REMOVED.
 * If PIN_ENCRYPTION_KEY is absent or shorter than 16 characters:
 * - Application startup MUST fail with a clear, actionable error.
 * - This function throws immediately; it does NOT return a default key.
 */
function getEncryptionKey(): Buffer {
  const rawKey = process.env.PIN_ENCRYPTION_KEY;

  if (!rawKey || rawKey.trim().length < REQUIRED_KEY_MIN_LENGTH) {
    throw new Error(
      `FATAL: PIN_ENCRYPTION_KEY environment variable is missing or too short (minimum ${REQUIRED_KEY_MIN_LENGTH} characters). ` +
      `Application CANNOT safely encrypt or decrypt employee PINs without a valid key. ` +
      `Set PIN_ENCRYPTION_KEY in your .env file and restart the application.`,
    );
  }

  // Derive a 32-byte key using SHA-256 to ensure exact key length
  return crypto.createHash('sha256').update(rawKey).digest();
}

/**
 * Validates that PIN_ENCRYPTION_KEY is configured before the application starts.
 * Call this function during application bootstrap (e.g., in main.ts).
 *
 * Phase 3.2 (K): Fail-fast startup validation.
 */
export function validatePinEncryptionKeyOrDie(): void {
  try {
    getEncryptionKey();
  } catch (error: any) {
    console.error(`\n\n  ✖ ${error.message}\n`);
    process.exit(1);
  }
}

/**
 * Encrypts a plain PIN string using AES-256-GCM.
 * Output format: <iv_hex>:<auth_tag_hex>:<ciphertext_hex>
 */
export function encryptPin(pin: string): string {
  if (!pin) return '';
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(pin, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decrypts an AES-256-GCM encrypted PIN string.
 * Returns the decrypted PIN string or null if decryption fails or input is invalid.
 */
export function decryptPin(encryptedData: string | null | undefined): string | null {
  if (!encryptedData) return null;
  try {
    const parts = encryptedData.split(':');
    if (parts.length !== 3) return null;

    const [ivHex, authTagHex, ciphertextHex] = parts;
    const key = getEncryptionKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    return null;
  }
}
