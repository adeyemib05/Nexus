export const REDACTION_TOKEN = '[unsourced figure removed]';

export function hasRedactedFigures(text?: string | null): boolean {
  if (!text) return false;
  return text.includes(REDACTION_TOKEN);
}

export function countRedactedFigures(text?: string | null): number {
  if (!text) return 0;
  const matches = text.match(/\[unsourced figure removed\]/g);
  return matches ? matches.length : 0;
}
