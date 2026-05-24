export interface OpcoInfo {
  code: string;
  nom: string;
}

export type OpcoMapping = Map<string, OpcoInfo>;

const PREFIX_REGEX = /^[0-9]{3}$/;

export function extractDecaPrefix(
  deca: string | null | undefined,
): string | null {
  if (!deca) return null;
  const trimmed = deca.trim();
  if (trimmed.length < 3) return null;
  const prefix = trimmed.slice(0, 3);
  return PREFIX_REGEX.test(prefix) ? prefix : null;
}

export function resolveOpcoFromDeca(
  deca: string | null | undefined,
  mapping: OpcoMapping,
): OpcoInfo | null {
  const prefix = extractDecaPrefix(deca);
  if (!prefix) return null;
  return mapping.get(prefix) ?? null;
}
