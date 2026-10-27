const ALPHABET_OFFSET = 'a'.charCodeAt(0);

function base64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

export async function extensionIdFromKey(base64Spki: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', base64ToBytes(base64Spki));
  let id = '';
  for (const byte of new Uint8Array(digest).subarray(0, 16)) {
    id += String.fromCharCode(ALPHABET_OFFSET + (byte >> 4));
    id += String.fromCharCode(ALPHABET_OFFSET + (byte & 0x0f));
  }
  return id;
}

export async function generateExtensionKey(): Promise<{ id: string; key: string }> {
  const { publicKey } = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const spki = await crypto.subtle.exportKey('spki', publicKey);
  const key = bytesToBase64(new Uint8Array(spki));
  return { id: await extensionIdFromKey(key), key };
}
