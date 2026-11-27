/**
 * AES-256-GCM envelope for bring-your-own credentials at rest in D1.
 *
 * The key is a Worker secret (`CREDENTIALS_KEY`, 32 random bytes, base64)
 * shared by the web Worker (encrypts on save) and the engine (decrypts at run
 * time, then injects at the sandbox egress). The row id is bound in as
 * additional authenticated data so a ciphertext can't be swapped between rows.
 */

const enc = new TextEncoder();
const dec = new TextDecoder();

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

async function importKey(secretB64: string): Promise<CryptoKey> {
  let raw: Uint8Array<ArrayBuffer>;
  try {
    raw = b64ToBytes(secretB64.trim());
  } catch {
    raw = new Uint8Array(0);
  }
  if (raw.byteLength !== 32) {
    throw new Error(
      "CREDENTIALS_KEY must be 32 bytes, base64-encoded (openssl rand -base64 32)",
    );
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

export interface SealedSecret {
  ciphertext: string; // base64
  iv: string; // base64, 12 bytes
}

export async function sealSecret(
  keyB64: string,
  plaintext: string,
  aad: string,
): Promise<SealedSecret> {
  const key = await importKey(keyB64);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: enc.encode(aad) },
    key,
    enc.encode(plaintext),
  );
  return { ciphertext: bytesToB64(new Uint8Array(ct)), iv: bytesToB64(iv) };
}

export async function openSecret(
  keyB64: string,
  sealed: SealedSecret,
  aad: string,
): Promise<string> {
  const key = await importKey(keyB64);
  const pt = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: b64ToBytes(sealed.iv),
      additionalData: enc.encode(aad),
    },
    key,
    b64ToBytes(sealed.ciphertext),
  );
  return dec.decode(pt);
}

/** "sk-ant-oat01-…AbCd" → "…AbCd" for display. */
export function secretHint(secret: string): string {
  const s = secret.trim();
  return s.length <= 4 ? "…" : `…${s.slice(-4)}`;
}
