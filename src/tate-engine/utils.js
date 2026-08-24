export function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export function parseTimeToSeconds(value) {
  if (typeof value === 'number') return value;
  const clean = String(value || '').trim();
  if (!clean) return null;
  if (/^\d+(?:\.\d+)?$/.test(clean)) return Number(clean);
  const parts = clean.split(':').map(Number);
  if (parts.some(Number.isNaN)) return null;
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
  return null;
}

export function secondsToClock(seconds) {
  const s = Math.round(seconds);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${String(rem).padStart(2, '0')}`;
}

export function stableHash(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
