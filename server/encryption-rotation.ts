import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT = "table-salt-encryption-v1";

export function deriveKey(rawKey: string): Buffer {
  return scryptSync(rawKey, SALT, 32);
}

export function encryptWithKey(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `enc:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decryptWithKey(ciphertext: string, key: Buffer): string {
  if (!ciphertext.startsWith("enc:")) return ciphertext;
  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 4) return ciphertext;
    const ivHex = parts[1];
    const authTagHex = parts[2];
    const encryptedHex = parts[3];
    if (ivHex.length !== IV_LENGTH * 2 || authTagHex.length !== AUTH_TAG_LENGTH * 2) {
      return ciphertext;
    }
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch {
    return ciphertext;
  }
}

export function isEncryptedCipher(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("enc:");
}

export function rotateField(ciphertext: string | null | undefined, oldKey: Buffer, newKey: Buffer): {
  result: string | null | undefined;
  rotated: boolean;
  skipped: boolean;
} {
  if (!ciphertext || !isEncryptedCipher(ciphertext)) {
    return { result: ciphertext, rotated: false, skipped: false };
  }
  const plain = decryptWithKey(ciphertext, oldKey);
  if (isEncryptedCipher(plain)) {
    return { result: ciphertext, rotated: false, skipped: true };
  }
  return { result: encryptWithKey(plain, newKey), rotated: true, skipped: false };
}
