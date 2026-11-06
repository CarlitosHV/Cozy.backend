/**
 * How a player looks and is called inside a party room.
 *
 * The game sends its own character (the one made in "Personalizar") when it joins a room and
 * whenever it changes. The server keeps a cleaned-up copy and shares it with the rest of the
 * party, so everybody sees each other exactly as they dressed up — even guests and players
 * whose profile was never saved.
 */

/** Plain values only, short strings, a limited set of keys. */
export type ClientAppearance = Record<string, string | number | boolean>;

const MAX_KEYS = 40;
const MAX_KEY_LEN = 32;
const MAX_STR_LEN = 48;
const NAME_MAX = 24;

/** Default character names of the game: they don't identify anybody. */
const GENERIC_NAMES = new Set(['viajero', 'viajera', 'explorador', 'exploradora', 'sin nombre', '']);

function cleanText(v: string, max: number): string {
  // Drop control characters and angle brackets, collapse spaces
  return v
    .replace(/[\u0000-\u001f\u007f<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function sanitizeClientAppearance(raw: unknown): ClientAppearance | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: ClientAppearance = {};
  let n = 0;
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_KEYS) break;
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(key) || key.length > MAX_KEY_LEN) continue;
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;
    if (typeof value === 'string') {
      out[key] = cleanText(value, MAX_STR_LEN);
    } else if (typeof value === 'number') {
      if (!Number.isFinite(value)) continue;
      out[key] = Math.max(-1000, Math.min(1000, value));
    } else if (typeof value === 'boolean') {
      out[key] = value;
    } else {
      continue;
    }
    n++;
  }
  return n > 0 ? out : null;
}

/** The character name the player typed in "Personalizar", if any. */
export function characterNameOf(appearance: unknown, explicit?: unknown): string {
  const fromExplicit = typeof explicit === 'string' ? cleanText(explicit, NAME_MAX) : '';
  if (fromExplicit) return fromExplicit;
  const a = appearance && typeof appearance === 'object' ? (appearance as Record<string, unknown>) : {};
  return typeof a.name === 'string' ? cleanText(a.name, NAME_MAX) : '';
}

/**
 * Name shown above the player's head: the character's name, the same one the player sees on
 * their own screen. A default name ("Viajero") falls back to the account name so two friends
 * never show up as the same "Viajero".
 */
export function shownName(characterName: string, accountName: string): string {
  const c = cleanText(characterName || '', NAME_MAX);
  if (c && !GENERIC_NAMES.has(c.toLowerCase())) return c;
  return cleanText(accountName || '', NAME_MAX) || c || 'Explorador';
}
