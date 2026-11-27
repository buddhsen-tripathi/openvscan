import { generateKeyPairSync } from "node:crypto";
import { normalizePrivateKey } from "@openvscan/github";
import { describe, expect, it } from "vitest";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const pkcs1 = privateKey.export({ type: "pkcs1", format: "pem" }) as string;
const pkcs8 = privateKey.export({ type: "pkcs8", format: "pem" }) as string;

function der(pem: string) {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

describe("normalizePrivateKey", () => {
  it("converts GitHub's PKCS#1 key to the identical PKCS#8 key", () => {
    const out = normalizePrivateKey(pkcs1);
    expect(out).toContain("-----BEGIN PRIVATE KEY-----");
    expect(der(out)).toEqual(der(pkcs8));
  });

  it("produces a key WebCrypto can import", async () => {
    await expect(
      crypto.subtle.importKey(
        "pkcs8",
        der(normalizePrivateKey(pkcs1)),
        { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
        false,
        ["sign"],
      ),
    ).resolves.toBeDefined();
  });

  it("accepts escaped newlines and leaves PKCS#8 keys alone", () => {
    expect(der(normalizePrivateKey(pkcs1.replace(/\n/g, "\\n")))).toEqual(der(pkcs8));
    expect(der(normalizePrivateKey(pkcs8))).toEqual(der(pkcs8));
  });
});
