import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { resolveStateDir } from "../config/paths.js";

const ENCRYPTED_PREFIX = "enc:v1:";
const KEY_BYTES = 32;
const IV_BYTES = 12;
const AUTH_TAG_BYTES = 16;
const KEY_FILE_NAME = "vault.key";

function resolveDefaultKeyPath(dbPath?: string): string {
  if (dbPath?.trim()) {
    return path.join(path.dirname(path.resolve(dbPath)), KEY_FILE_NAME);
  }
  return path.join(resolveStateDir(), "secrets", KEY_FILE_NAME);
}

function loadOrCreateKey(keyPath: string): Buffer {
  try {
    const existing = fs.readFileSync(keyPath, "utf8").trim();
    if (!existing) {
      throw new Error("empty key file");
    }
    const decoded = Buffer.from(existing, "base64");
    if (decoded.length !== KEY_BYTES) {
      throw new Error("invalid key length");
    }
    return decoded;
  } catch {
    const generated = randomBytes(KEY_BYTES);
    fs.mkdirSync(path.dirname(keyPath), { recursive: true, mode: 0o700 });
    fs.writeFileSync(keyPath, generated.toString("base64"), {
      encoding: "utf8",
      mode: 0o600,
    });
    try {
      fs.chmodSync(keyPath, 0o600);
    } catch {
      // Ignore chmod errors on filesystems that do not support POSIX modes.
    }
    return generated;
  }
}

export function createSecretsCrypto(opts?: { keyPath?: string; dbPath?: string }) {
  const keyPath =
    opts?.keyPath?.trim() && opts.keyPath.trim().length > 0
      ? path.resolve(opts.keyPath)
      : resolveDefaultKeyPath(opts?.dbPath);
  const key = loadOrCreateKey(keyPath);

  function encrypt(value: string): string {
    if (!value) {
      return value;
    }
    const iv = randomBytes(IV_BYTES);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${ENCRYPTED_PREFIX}${iv.toString("base64")}:${authTag.toString("base64")}:${ciphertext.toString("base64")}`;
  }

  function decrypt(value: string): string {
    if (!value) {
      return value;
    }
    if (!value.startsWith(ENCRYPTED_PREFIX)) {
      // Backward compatibility: legacy rows stored plaintext.
      return value;
    }
    const payload = value.slice(ENCRYPTED_PREFIX.length);
    const [ivB64, authTagB64, dataB64] = payload.split(":");
    if (!ivB64 || !authTagB64 || !dataB64) {
      throw new Error("invalid encrypted payload");
    }
    const iv = Buffer.from(ivB64, "base64");
    const authTag = Buffer.from(authTagB64, "base64");
    const data = Buffer.from(dataB64, "base64");
    if (iv.length !== IV_BYTES || authTag.length !== AUTH_TAG_BYTES) {
      throw new Error("invalid encryption metadata");
    }
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(authTag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
  }

  return { keyPath, encrypt, decrypt };
}
