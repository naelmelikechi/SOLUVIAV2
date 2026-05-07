import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { logger } from '@/lib/utils/logger';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits recommended for GCM
const AUTH_TAG_LENGTH = 16; // 128 bits

/**
 * Cle d'encryption courante : 32 octets decodes depuis 64 chars hex.
 * Donne 256 bits effectifs (vs ~128 bits avec la logique utf-8 tronquee
 * d'origine, voir getLegacyEncryptionKey ci-dessous).
 */
function getEncryptionKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 64) {
    logger.warn(
      'encryption',
      'ENCRYPTION_KEY non configurée ou trop courte (64 caractères hex requis = 256 bits). Le chiffrement est désactivé.',
    );
    return null;
  }
  return Buffer.from(raw.slice(0, 64), 'hex');
}

/**
 * Cle legacy : 32 premiers chars utf-8 de ENCRYPTION_KEY.
 * Si la valeur est en hex (cas typique), donne ~128 bits effectifs au lieu
 * de 256. Garde uniquement en fallback de decryption pour les secrets deja
 * chiffres avec l'ancienne logique. A retirer une fois tous les clients
 * re-encryptes (voir docs/SECURITY.md).
 */
function getLegacyEncryptionKey(): Buffer | null {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw || raw.length < 32) return null;
  return Buffer.from(raw.slice(0, 32), 'utf-8');
}

function tryDecrypt(
  ivHex: string,
  authTagHex: string,
  ciphertext: string,
  key: Buffer,
): string {
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  const decipher = createDecipheriv(ALGORITHM, key, iv, {
    authTagLength: AUTH_TAG_LENGTH,
  });
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(ciphertext, 'hex', 'utf-8');
  decrypted += decipher.final('utf-8');
  return decrypted;
}

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns format: `iv:authTag:ciphertext` (all hex-encoded).
 *
 * Utilise toujours la cle hex courante (256 bits). Tout nouveau write
 * progressivement re-encrypte les anciens secrets en cle legacy.
 *
 * @throws if ENCRYPTION_KEY is not set or invalid
 */
export function encryptApiKey(plaintext: string): string {
  const key = getEncryptionKey();
  if (!key) {
    throw new Error(
      "ENCRYPTION_KEY est requise pour chiffrer les clés API. Définissez une variable d'environnement ENCRYPTION_KEY de 64 caractères hex (256 bits).",
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
 * Strategie dual-read : essaie d'abord la cle hex courante, fallback sur
 * la cle utf-8 tronquee si l'authTag echoue. Permet de migrer le parc
 * progressivement sans downtime. Voir docs/SECURITY.md.
 *
 * @throws if neither key works or data is tampered
 */
export function decryptApiKey(encrypted: string): string {
  const currentKey = getEncryptionKey();
  const legacyKey = getLegacyEncryptionKey();

  if (!currentKey && !legacyKey) {
    throw new Error(
      "ENCRYPTION_KEY est requise pour déchiffrer les clés API. Définissez une variable d'environnement ENCRYPTION_KEY de 64 caractères hex.",
    );
  }

  // Validation format en amont : un payload mal forme echoue clairement
  // sans passer par la cascade de fallback de cles.
  const parts = encrypted.split(':');
  if (parts.length !== 3) {
    throw new Error(
      'Format de clé chiffrée invalide. Attendu: iv:authTag:ciphertext',
    );
  }
  const [ivHex, authTagHex, ciphertext] = parts as [string, string, string];

  // 1. Cle hex courante (post-fix C2)
  if (currentKey) {
    try {
      return tryDecrypt(ivHex, authTagHex, ciphertext, currentKey);
    } catch {
      // authTag verification a echoue : essai cle legacy.
    }
  }

  // 2. Cle utf-8 tronquee (heritage). A retirer apres migration totale.
  if (legacyKey) {
    try {
      const plaintext = tryDecrypt(ivHex, authTagHex, ciphertext, legacyKey);
      logger.warn(
        'encryption',
        'Decryption via cle legacy. Re-encrypter en re-saisissant la cle dans /admin/parametres pour migrer.',
      );
      return plaintext;
    } catch {
      throw new Error(
        'Impossible de déchiffrer : clé corrompue ou ENCRYPTION_KEY incorrecte.',
      );
    }
  }

  throw new Error('Impossible de déchiffrer : aucune clé disponible.');
}
