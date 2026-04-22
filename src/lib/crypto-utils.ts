import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const DEFAULT_KEY_WARNED = Symbol('crypto-default-key-warned');
if (typeof globalThis === 'object' && !(globalThis as any)[DEFAULT_KEY_WARNED]) {
  if (!process.env.MC_API_TOKEN) {
    console.warn('[SECURITY WARNING] MC_API_TOKEN not set — encryption uses a default key. Set MC_API_TOKEN in production for proper key derivation.');
    (globalThis as any)[DEFAULT_KEY_WARNED] = true;
  }
}
const IV_LENGTH = 16;
const HMAC_LENGTH = 32; // SHA-256 = 32 bytes
const HMAC_ALGO = 'sha256';
const VERSION_BYTE = 0x02; // v2 = HMAC-protected format

function getDerivedKey(token?: string): Buffer {
  const secret = token || process.env.MC_API_TOKEN || 'mission-control-default-key-do-not-use-in-prod';
  return crypto.createHash('sha256').update(secret).digest();
}

function getHmacKey(): Buffer {
  const base = process.env.MC_API_TOKEN || 'mission-control-default-key-do-not-use-in-prod';
  return crypto.createHash('sha256').update(base + ':hmac').digest();
}

/**
 * Encrypt with HMAC integrity protection.
 * Format: [version(1)] [iv(16)] [encrypted(N)] [hmac(32)]
 * HMAC covers: version + iv + encrypted
 */
export function encrypt(data: Buffer): Buffer {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);

  const versionBuf = Buffer.from([VERSION_BYTE]);
  const hmacPayload = Buffer.concat([versionBuf, iv, encrypted]);
  const hmac = crypto.createHmac(HMAC_ALGO, getHmacKey()).update(hmacPayload).digest();

  return Buffer.concat([versionBuf, iv, encrypted, hmac]);
}

/**
 * Decrypt with HMAC integrity verification.
 * Supports both v1 (no version byte, no HMAC) and v2 (HMAC-protected).
 * Throws on integrity failure.
 */
export function decrypt(data: Buffer): Buffer {
  // Detect version: if first byte is VERSION_BYTE, it's v2
  if (data[0] === VERSION_BYTE && data.length > 1 + IV_LENGTH + HMAC_LENGTH) {
    return decryptV2(data);
  }
  // Legacy v1 format: [iv(16)] [encrypted(N)]
  return decryptV1(data);
}

function decryptV1(data: Buffer): Buffer {
  const key = getDerivedKey();
  const iv = data.subarray(0, IV_LENGTH);
  const encrypted = data.subarray(IV_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

function decryptV2(data: Buffer): Buffer {
  const key = getDerivedKey();
  const version = data.subarray(0, 1);
  const iv = data.subarray(1, 1 + IV_LENGTH);
  const encrypted = data.subarray(1 + IV_LENGTH, data.length - HMAC_LENGTH);
  const providedHmac = data.subarray(data.length - HMAC_LENGTH);

  // Verify HMAC
  const hmacPayload = Buffer.concat([version, iv, encrypted]);
  const expectedHmac = crypto.createHmac(HMAC_ALGO, getHmacKey()).update(hmacPayload).digest();

  if (!crypto.timingSafeEqual(providedHmac, expectedHmac)) {
    throw new Error('Integrity check failed: HMAC mismatch. Data may be corrupted or tampered with.');
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}

/**
 * Rotate encryption key: re-encrypt data with a new token.
 * Decrypts with old token, then re-encrypts with new token.
 * Returns re-encrypted buffer in v2 format.
 */
export function rotateKey(encryptedData: Buffer, oldToken: string, newToken: string): Buffer {
  // Decrypt with old token
  const oldKey = getDerivedKey(oldToken);
  const version = encryptedData[0];

  let plaintext: Buffer;

  if (version === VERSION_BYTE && encryptedData.length > 1 + IV_LENGTH + HMAC_LENGTH) {
    // v2 format
    const iv = encryptedData.subarray(1, 1 + IV_LENGTH);
    const enc = encryptedData.subarray(1 + IV_LENGTH, encryptedData.length - HMAC_LENGTH);
    const providedHmac = encryptedData.subarray(encryptedData.length - HMAC_LENGTH);

    // Verify with old HMAC key
    const oldHmacKey = crypto.createHash('sha256').update(oldToken + ':hmac').digest();
    const hmacPayload = Buffer.concat([encryptedData.subarray(0, 1), iv, enc]);
    const expectedHmac = crypto.createHmac(HMAC_ALGO, oldHmacKey).update(hmacPayload).digest();
    if (!crypto.timingSafeEqual(providedHmac, expectedHmac)) {
      throw new Error('Integrity check failed during key rotation: HMAC mismatch.');
    }

    const decipher = crypto.createDecipheriv(ALGORITHM, oldKey, iv);
    plaintext = Buffer.concat([decipher.update(enc), decipher.final()]);
  } else {
    // v1 format
    const iv = encryptedData.subarray(0, IV_LENGTH);
    const enc = encryptedData.subarray(IV_LENGTH);
    const decipher = crypto.createDecipheriv(ALGORITHM, oldKey, iv);
    plaintext = Buffer.concat([decipher.update(enc), decipher.final()]);
  }

  // Re-encrypt with new token (v2 format)
  const newKey = getDerivedKey(newToken);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, newKey, iv);
  const newEncrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);

  const versionBuf = Buffer.from([VERSION_BYTE]);
  const newHmacKey = crypto.createHash('sha256').update(newToken + ':hmac').digest();
  const hmacPayload = Buffer.concat([versionBuf, iv, newEncrypted]);
  const hmac = crypto.createHmac(HMAC_ALGO, newHmacKey).update(hmacPayload).digest();

  return Buffer.concat([versionBuf, iv, newEncrypted, hmac]);
}

/**
 * Check if encrypted data uses the v2 (HMAC-protected) format.
 */
export function isHmacProtected(data: Buffer): boolean {
  return data[0] === VERSION_BYTE && data.length > 1 + IV_LENGTH + HMAC_LENGTH;
}