import { Chat, Message, MessageEncryptionProtocol } from "./chats";

const PRIVATE_KEY_STORAGE = "family_messenger_private_key";
const PUBLIC_KEY_STORAGE = "family_messenger_public_key";
const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function base64ToBytes(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function importRawKey(rawKey: string) {
  return crypto.subtle.importKey(
    "raw",
    base64ToBytes(rawKey),
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function importPublicKey(publicKey: string) {
  return crypto.subtle.importKey(
    "spki",
    base64ToBytes(publicKey),
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["wrapKey"]
  );
}

async function importPrivateKey(privateKey: JsonWebKey) {
  return crypto.subtle.importKey(
    "jwk",
    privateKey,
    { name: "RSA-OAEP", hash: "SHA-256" },
    false,
    ["unwrapKey"]
  );
}

async function localPrivateKey() {
  const stored = window.localStorage.getItem(PRIVATE_KEY_STORAGE);
  if (!stored) {
    return null;
  }
  return importPrivateKey(JSON.parse(stored) as JsonWebKey);
}

export async function ensureLocalEncryptionIdentity() {
  const existingPublic = window.localStorage.getItem(PUBLIC_KEY_STORAGE);
  const existingPrivate = window.localStorage.getItem(PRIVATE_KEY_STORAGE);
  if (existingPublic && existingPrivate) {
    return existingPublic;
  }
  const pair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["wrapKey", "unwrapKey"]
  );
  const publicKey = bytesToBase64(new Uint8Array(await crypto.subtle.exportKey("spki", pair.publicKey)));
  const privateKey = await crypto.subtle.exportKey("jwk", pair.privateKey);
  window.localStorage.setItem(PUBLIC_KEY_STORAGE, publicKey);
  window.localStorage.setItem(PRIVATE_KEY_STORAGE, JSON.stringify(privateKey));
  return publicKey;
}

export function encryptionProtocolLabel(protocol: MessageEncryptionProtocol) {
  if (protocol === "server_at_rest") {
    return "Server encrypted";
  }
  if (protocol === "legacy_plaintext") {
    return "Legacy plaintext";
  }
  return "End-to-end";
}

export async function encryptMessageContent(chat: Chat, content: string | null, senderUserId?: string) {
  if (chat.encryptionProtocol !== "end_to_end" || !content) {
    return {
      content,
      encryption: {
        encryptionProtocol: chat.encryptionProtocol
      }
    };
  }

  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const key = await crypto.subtle.importKey("raw", rawKey, { name: "AES-GCM" }, true, [
    "encrypt",
    "decrypt"
  ]);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: nonce },
    key,
    textEncoder.encode(content)
  );
  const wrappedKeys: Record<string, string> = {};
  await Promise.all(
    chat.members
      .filter((member) => member.publicKey)
      .map(async (member) => {
        const wrappingKey = await importPublicKey(member.publicKey as string);
        const wrapped = await crypto.subtle.wrapKey("raw", key, wrappingKey, "RSA-OAEP");
        wrappedKeys[member.id] = bytesToBase64(new Uint8Array(wrapped));
      })
  );
  if (senderUserId && !wrappedKeys[senderUserId]) {
    const localPublicKey = window.localStorage.getItem(PUBLIC_KEY_STORAGE);
    if (localPublicKey) {
      const wrappingKey = await importPublicKey(localPublicKey);
      const wrapped = await crypto.subtle.wrapKey("raw", key, wrappingKey, "RSA-OAEP");
      wrappedKeys[senderUserId] = bytesToBase64(new Uint8Array(wrapped));
    }
  }
  return {
    content: null,
    encryption: {
      encryptionProtocol: "end_to_end" as const,
      ciphertext: bytesToBase64(new Uint8Array(encrypted)),
      nonce: bytesToBase64(nonce),
      keyVersion: 1,
      encryptionMetadata: JSON.stringify({
        algorithm: "AES-GCM",
        keyWrap: "RSA-OAEP-2048-SHA-256",
        wrappedKeys,
        version: 1
      })
    }
  };
}

export async function decryptMessage(chatId: string, message: Message, userId?: string): Promise<Message> {
  if (message.encryptionProtocol !== "end_to_end" || !message.ciphertext || !message.nonce) {
    return message;
  }
  try {
    const privateKey = await localPrivateKey();
    if (!privateKey || !message.encryptionMetadata) {
      throw new Error("missing local encryption identity");
    }
    const metadata = JSON.parse(message.encryptionMetadata) as {
      wrappedKeys?: Record<string, string>;
    };
    const wrappedKeys = metadata.wrappedKeys ?? {};
    const preferredWrappedKey = userId ? wrappedKeys[userId] : undefined;
    const wrappedKeyCandidates = preferredWrappedKey
      ? [preferredWrappedKey]
      : Object.values(wrappedKeys);
    if (wrappedKeyCandidates.length === 0) {
      throw new Error("missing wrapped message key");
    }
    let decrypted: ArrayBuffer | null = null;
    for (const wrappedKey of wrappedKeyCandidates) {
      try {
        const key = await crypto.subtle.unwrapKey(
          "raw",
          base64ToBytes(wrappedKey),
          privateKey,
          "RSA-OAEP",
          { name: "AES-GCM" },
          false,
          ["decrypt"]
        );
        decrypted = await crypto.subtle.decrypt(
          { name: "AES-GCM", iv: base64ToBytes(message.nonce) },
          key,
          base64ToBytes(message.ciphertext)
        );
        break;
      } catch {
        // Try next wrapped key.
      }
    }
    if (!decrypted) {
      throw new Error("unable to decrypt message");
    }
    return {
      ...message,
      content: textDecoder.decode(decrypted)
    };
  } catch {
    return {
      ...message,
      content: null,
      deliveryError: "Encrypted message unavailable on this browser"
    };
  }
}

export async function decryptMessages(chatId: string, messages: Message[], userId?: string) {
  return Promise.all(messages.map((message) => decryptMessage(chatId, message, userId)));
}
