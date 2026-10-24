export interface PasskeyOptionsEnvelope {
  ceremonyId: string;
  publicKey: Record<string, unknown>;
}

/** Accepts both the raw WebAuthn options and Go's publicKey-wrapped options. */
export function normalizePasskeyOptions<T extends PasskeyOptionsEnvelope>(ceremony: T): T {
  const nestedOptions = ceremony.publicKey.publicKey;
  if (typeof nestedOptions !== "object" || nestedOptions === null || Array.isArray(nestedOptions)) {
    return ceremony;
  }
  return { ...ceremony, publicKey: nestedOptions as Record<string, unknown> };
}
