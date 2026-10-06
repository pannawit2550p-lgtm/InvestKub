const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f-\u009f]/g;

export function sanitizeDisplayName(value: string): string {
  return value.replace(CONTROL_CHARACTERS, '').trim();
}

export function isValidDisplayName(value: string): boolean {
  const name = sanitizeDisplayName(value);
  const characterCount = Array.from(name).length;
  return characterCount >= 3 && characterCount <= 20 && !name.includes('@');
}

export function fallbackPlayerName(publicId: string): string {
  const digits = publicId.replace(/\D/g, '').slice(-4).padStart(4, '0');
  return `ผู้เล่น ${digits}`;
}

export function resolveDisplayName(value: string, isCustom: boolean, publicId: string): string {
  const name = sanitizeDisplayName(value);
  return isCustom && isValidDisplayName(name) ? name : fallbackPlayerName(publicId);
}
