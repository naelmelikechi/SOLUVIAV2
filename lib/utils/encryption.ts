import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { logger } from '@/lib/utils/logger';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Get the encryption key from environment.
 * Returns null if not configured (graceful degradation).
 */
function getEncryptionKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 32) {
    logger.warn(
      'encryption',
      'ENCRYPTION_KEY non configurée ou trop courte (min 32 caractères). Le chiffrement est désactivé.',
    );
    return null;
  }
  // Use first 32 bytes as key (256 bits)
  return Buffer.from(raw.slice(0, 32), 'utf-8');
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns format: `iv:authTag:ciphertext` (all hex-encoded).
 *
 * @throws if ENCRYPTION_KEY is not set or invalid
 */
export function encryptApiKey(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY est requise pour chiffrer les clés API. Définissez une variable d'environnement ENCRYPTION_KEY d'au moins 32 caractères.",
    );
  }

  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });

  let encrypted = cipher.update(plaintext, 'utf-8', 'hex');
  encrypted += cipher.final('hex');

  const authTag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

/**
 * Decrypt a string encrypted with `encryptApiKey`.
 * Expects format: `iv:authTag:ciphertext` (all hex-encoded).
 *
 * @throws if ENCRYPTION_KEY is not set, or data is tampered/invalid
 */
export function decryptApiKey(encrypted: string): string {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY est requise pour déchiffrer les clés API. Définissez une variable d'environnement ENCRYPTION_KEY d'au moins 32 caractères.",
    );
  }

  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error(
      'Format de clé chiffrée invalide. Attendu: iv:authTag:ciphertext',
    );
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex!, 'hex');
  const authTag = Buffer.from(authTagHex!, 'hex');

  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext!, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');

  return decrypted;
}
