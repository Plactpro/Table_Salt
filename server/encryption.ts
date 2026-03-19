import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SALT = "table-salt-encryption-v1";

let derivedKey: Buffer | null = null;

function getKey(): Buffer {
  if (derivedKey) return derivedKey;
  const rawKey = process.env.ENCRYPTION_KEY;
  if (!rawKey) {
    throw new Error("ENCRYPTION_KEY environment variable is not set");
  }
  derivedKey = scryptSync(rawKey, SALT, 32);
  return derivedKey;
}

export function encryptField(plaintext: string): string {
  if (!plaintext) return plaintext;
  const key = getKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");
  const authTag = cipher.getAuthTag();
  return `enc:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decryptField(ciphertext: string): string {
  if (!ciphertext || !ciphertext.startsWith("enc:")) return ciphertext;
  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 4) return ciphertext;
    const ivHex = parts[1];
    const authTagHex = parts[2];
    const encryptedHex = parts[3];
    if (ivHex.length !== IV_LENGTH * 2 || authTagHex.length !== AUTH_TAG_LENGTH * 2) {
      console.warn("decryptField: malformed ciphertext — invalid IV or auth tag length");
      return ciphertext;
    }
    const key = getKey();
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (err) {
    console.error("decryptField: decryption failed — returning ciphertext as-is", err instanceof Error ? err.message : String(err));
    return ciphertext;
  }
}

export function isEncrypted(value: string | null | undefined): boolean {
  return typeof value === "string" && value.startsWith("enc:");
}
