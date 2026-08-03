/**
 * Honor-system certificate tokens for the tutorial assessment.
 * Spoofing is expected — the passphrase is the joke.
 */
export const CERTIFICATE_PASSPHRASE =
  "if you spoofed this cert, you can have it";

const SALT = new TextEncoder().encode("reqlan-tutorial-cert-v1");
const PBKDF2_ITERATIONS = 100_000;
const IV_BYTES = 12;

export type CertificateClaims = {
  /** Display name */
  n: string;
  /** ISO-8601 completion date (UTC) */
  d: string;
};

function getCrypto(): Crypto {
  const cryptoRef = globalThis.crypto;
  if (!cryptoRef?.subtle) {
    throw new Error("Web Crypto is not available in this environment");
  }
  return cryptoRef;
}

async function deriveKey(passphrase: string): Promise<CryptoKey> {
  const crypto = getCrypto();
  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(passphrase),
    "PBKDF2",
    false,
    ["deriveKey"],
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: SALT,
      iterations: PBKDF2_ITERATIONS,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

async function compress(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof CompressionStream === "undefined") {
    throw new Error("CompressionStream is not available in this environment");
  }
  const copy = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const stream = new Blob([copy]).stream().pipeThrough(
    new CompressionStream("deflate-raw"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function decompress(bytes: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") {
    throw new Error("DecompressionStream is not available in this environment");
  }
  const copy = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const stream = new Blob([copy]).stream().pipeThrough(
    new DecompressionStream("deflate-raw"),
  );
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function bytesToBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(token: string): Uint8Array {
  const padded = token.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  const binary = atob(padded + "=".repeat(padLength));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export async function mintCertificateToken(input: {
  name: string;
  completedAt?: Date;
  passphrase?: string;
}): Promise<string> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("Name is required");
  }

  const claims: CertificateClaims = {
    n: name,
    d: (input.completedAt ?? new Date()).toISOString(),
  };

  const crypto = getCrypto();
  const plain = new TextEncoder().encode(JSON.stringify(claims));
  const compressed = await compress(plain);
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const key = await deriveKey(input.passphrase ?? CERTIFICATE_PASSPHRASE);
  const compressedCopy = compressed.buffer.slice(
    compressed.byteOffset,
    compressed.byteOffset + compressed.byteLength,
  ) as ArrayBuffer;
  const ciphertext = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv },
      key,
      compressedCopy,
    ),
  );

  const packed = new Uint8Array(iv.length + ciphertext.length);
  packed.set(iv, 0);
  packed.set(ciphertext, iv.length);
  return bytesToBase64Url(packed);
}

export async function parseCertificateToken(
  token: string,
  passphrase: string = CERTIFICATE_PASSPHRASE,
): Promise<CertificateClaims | null> {
  try {
    const packed = base64UrlToBytes(token.trim());
    if (packed.length <= IV_BYTES) return null;

    const iv = packed.slice(0, IV_BYTES);
    const ciphertext = packed.slice(IV_BYTES);
    const key = await deriveKey(passphrase);
    const crypto = getCrypto();
    const ivBuf = iv.buffer.slice(
      iv.byteOffset,
      iv.byteOffset + iv.byteLength,
    ) as ArrayBuffer;
    const cipherBuf = ciphertext.buffer.slice(
      ciphertext.byteOffset,
      ciphertext.byteOffset + ciphertext.byteLength,
    ) as ArrayBuffer;
    const decrypted = new Uint8Array(
      await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: ivBuf },
        key,
        cipherBuf,
      ),
    );
    const inflated = await decompress(decrypted);
    const claims = JSON.parse(
      new TextDecoder().decode(inflated),
    ) as Partial<CertificateClaims>;

    if (typeof claims.n !== "string" || typeof claims.d !== "string") {
      return null;
    }
    if (!claims.n.trim() || Number.isNaN(Date.parse(claims.d))) {
      return null;
    }
    return { n: claims.n, d: claims.d };
  } catch {
    return null;
  }
}
