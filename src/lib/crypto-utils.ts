import crypto from 'crypto';

const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

function getDerivedKey(): Buffer {
  const token = process.env.MC_API_TOKEN || 'mission-control-default-key-do-not-use-in-prod';
  return crypto.createHash('sha256').update(token).digest();
}

export function encrypt(data: Buffer): Buffer {
  const key = getDerivedKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
  return Buffer.concat([iv, encrypted]);
}

export function decrypt(data: Buffer): Buffer {
  const key = getDerivedKey();
  const iv = data.subarray(0, IV_LENGTH);
  const encrypted = data.subarray(IV_LENGTH);
  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]);
}
