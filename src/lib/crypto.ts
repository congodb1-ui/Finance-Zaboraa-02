/**
 * Shared client-side AES-256-GCM encryption helpers using Web Crypto API.
 * Mirrors the PBKDF2 + AES-GCM cipher envelope (`zbf:v1:salt:iv:ciphertext`)
 * used for sensitive vault fields (PAN, bank account numbers, IBANs).
 */

const CIPHER_PREFIX = 'zbf:v1:';
const PBKDF2_ITERATIONS = 100000;

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function getCryptoApi(): Crypto {
  const cryptoApi = typeof globalThis !== 'undefined' ? globalThis.crypto : undefined;
  if (!cryptoApi?.subtle) {
    throw new Error('Web Crypto API is required for AES-256-GCM encryption.');
  }
  return cryptoApi;
}

function getEncryptionKeyFromEnv(): string {
  const viteEnv =
    typeof import.meta !== 'undefined' && (import.meta as any).env
      ? (import.meta as any).env
      : undefined;
  const viteKey = viteEnv?.VITE_ENCRYPTION_KEY;
  if (typeof viteKey === 'string' && viteKey.trim().length > 0) {
    return viteKey.trim();
  }

  const procKey =
    typeof process !== 'undefined' && process.env
      ? process.env.VITE_ENCRYPTION_KEY
      : undefined;
  if (typeof procKey === 'string' && procKey.trim().length > 0) {
    return procKey.trim();
  }

  throw new Error(
    'Missing VITE_ENCRYPTION_KEY environment variable. Configure VITE_ENCRYPTION_KEY to encrypt or decrypt sensitive payment details.'
  );
}

async function deriveAesKey(
  secret: string,
  salt: Uint8Array,
  usage: 'encrypt' | 'decrypt'
): Promise<CryptoKey> {
  const cryptoApi = getCryptoApi();
  const enc = new TextEncoder();

  const keyMaterial = await cryptoApi.subtle.importKey(
    'raw',
    enc.encode(secret),
    'PBKDF2',
    false,
    ['deriveKey']
  );

  return cryptoApi.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: salt.buffer.slice(salt.byteOffset, salt.byteOffset + salt.byteLength) as ArrayBuffer,
      iterations: PBKDF2_ITERATIONS,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    [usage]
  );
}

export async function encryptWithSecret(plaintext: string, secret: string): Promise<string> {
  const cryptoApi = getCryptoApi();
  const enc = new TextEncoder();
  const salt = cryptoApi.getRandomValues(new Uint8Array(16));
  const iv = cryptoApi.getRandomValues(new Uint8Array(12));
  const aesKey = await deriveAesKey(secret, salt, 'encrypt');

  const ciphertext = await cryptoApi.subtle.encrypt(
    { name: 'AES-GCM', iv },
    aesKey,
    enc.encode(plaintext)
  );

  return `${CIPHER_PREFIX}${bytesToBase64(salt)}:${bytesToBase64(iv)}:${bytesToBase64(
    new Uint8Array(ciphertext)
  )}`;
}

export async function decryptWithSecret(ciphertextEnvelope: string, secret: string): Promise<string> {
  if (!ciphertextEnvelope.startsWith(CIPHER_PREFIX)) {
    throw new Error('Invalid encrypted payload format.');
  }

  const parts = ciphertextEnvelope.slice(CIPHER_PREFIX.length).split(':');
  if (parts.length !== 3) {
    throw new Error('Malformed encrypted payload.');
  }

  const cryptoApi = getCryptoApi();
  const salt = base64ToBytes(parts[0]);
  const iv = base64ToBytes(parts[1]);
  const data = base64ToBytes(parts[2]);

  const aesKey = await deriveAesKey(secret, salt, 'decrypt');

  try {
    const plaintextBuffer = await cryptoApi.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: iv.buffer.slice(iv.byteOffset, iv.byteOffset + iv.byteLength) as ArrayBuffer,
      },
      aesKey,
      data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer
    );
    return new TextDecoder().decode(plaintextBuffer);
  } catch {
    throw new Error('Failed to decrypt sensitive value. Check VITE_ENCRYPTION_KEY.');
  }
}

export async function encryptValue(plaintext: string): Promise<string> {
  const secret = getEncryptionKeyFromEnv();
  return encryptWithSecret(plaintext, secret);
}

export async function decryptValue(ciphertext: string): Promise<string> {
  const secret = getEncryptionKeyFromEnv();
  return decryptWithSecret(ciphertext, secret);
}
