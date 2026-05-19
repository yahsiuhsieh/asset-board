export const SITE_AUTH_COOKIE_NAME = "assetboard_site_auth";
export const SITE_AUTH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24;

const SITE_AUTH_PAYLOAD = "assetboard-site-access:v1";
const textEncoder = new TextEncoder();

function getSitePassword(): string {
  return process.env.ASSETBOARD_SITE_PASSWORD?.trim() ?? "";
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

function hexToBytes(value: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) {
    return null;
  }

  const bytes = new Uint8Array(value.length / 2);

  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(value.slice(index * 2, index * 2 + 2), 16);
  }

  return bytes;
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) {
    return false;
  }

  let difference = 0;

  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }

  return difference === 0;
}

function toArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);

  new Uint8Array(buffer).set(bytes);

  return buffer;
}

async function getHmacKey(password: string, keyUsages: KeyUsage[]): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    textEncoder.encode(password),
    {
      hash: "SHA-256",
      name: "HMAC"
    },
    false,
    keyUsages
  );
}

async function digestText(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest("SHA-256", textEncoder.encode(value));

  return new Uint8Array(digest);
}

export function isSitePasswordConfigured(): boolean {
  return getSitePassword().length > 0;
}

export function getSafeSiteAuthRedirectPath(value: string | null | undefined): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

export async function verifySitePassword(value: string): Promise<boolean> {
  const sitePassword = getSitePassword();

  if (!sitePassword) {
    return false;
  }

  const [submittedDigest, expectedDigest] = await Promise.all([
    digestText(value.trim()),
    digestText(sitePassword)
  ]);

  return constantTimeEqual(submittedDigest, expectedDigest);
}

export async function createSiteAuthCookieValue(): Promise<string | null> {
  const sitePassword = getSitePassword();

  if (!sitePassword) {
    return null;
  }

  const key = await getHmacKey(sitePassword, ["sign"]);
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    textEncoder.encode(SITE_AUTH_PAYLOAD)
  );

  return `${SITE_AUTH_PAYLOAD}.${bytesToHex(new Uint8Array(signature))}`;
}

export async function verifySiteAuthCookie(
  cookieValue: string | null | undefined
): Promise<boolean> {
  const sitePassword = getSitePassword();

  if (!sitePassword || !cookieValue) {
    return false;
  }

  const [payload, signatureHex] = cookieValue.split(".");

  if (payload !== SITE_AUTH_PAYLOAD || !signatureHex) {
    return false;
  }

  const signature = hexToBytes(signatureHex);

  if (!signature) {
    return false;
  }

  const key = await getHmacKey(sitePassword, ["verify"]);

  return crypto.subtle.verify("HMAC", key, toArrayBuffer(signature), textEncoder.encode(payload));
}
