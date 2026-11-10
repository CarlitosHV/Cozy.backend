import { CONFIG } from '../../config/env.js';

/**
 * "Director" of the Skinwalker's copies, run by the xAI model (Grok).
 *
 * The game sends a small snapshot of the fight (how the player is doing, where the Skinwalker is,
 * which copies are following them) and the model decides what each copy does next, to build
 * paranoia: tag along like a friend, lure them into a dead end, stand still and stare, hide,
 * whisper something… or turn into a werewolf right now.
 *
 * The API key never leaves the server (XAI_API_KEY). If it's missing or the model fails, the game
 * falls back to its own rules, so the level always works.
 */

export const COPY_ACTS = ['follow', 'lure', 'stare', 'hide', 'whisper', 'strike', 'gather'] as const;
export type CopyAct = (typeof COPY_ACTS)[number];

export interface DirectorCopy {
  id: number;
  /** Who it pretends to be ("ti" = the player themselves) */
  as: string;
  /** copy | hunt | … (only 'copy' ones can be directed) */
  phase: string;
  /** Meters to the player */
  dist: number;
  /** Seconds it has been tagging along with the player */
  tail: number;
  /** In front of the player's camera right now */
  seen: boolean;
}

export interface DirectorInput {
  hp: number;
  lightsOff: boolean;
  deadEnd: boolean;
  hasDagger: boolean;
  hasSkull: boolean;
  /** Player speed (m/s): 0 = standing still */
  speed: number;
  /** Real friends in the party */
  friends: number;
  boss: { state: string; dist: number; rage: number };
  copies: DirectorCopy[];
  /** Last things that happened ("se fue la luz", "usó el cráneo"…) */
  recent: string[];
}

export interface DirectorOutput {
  copies: { id: number; act: CopyAct; say?: string }[];
}

const SYSTEM_PROMPT = `Eres el "director" de las copias del Skinwalker en un videojuego de terror ligero (estilo Backrooms) para jugadores hispanohablantes.
Las copias se hacen pasar por el jugador o por sus amigos del grupo: deambulan por un laberinto de oficinas amarillas fingiendo que también buscan la daga de obsidiana, y cuando encuentran al jugador lo acompañan "como amigos". Son traicioneras. Tu meta es crear PARANOIA: que el jugador nunca esté seguro de quién es real.
Si tres copias se juntan, se fusionan en un Nahual (una criatura altísima y pálida). El Skinwalker, mientras tanto, acecha al jugador como un cazador que juega con su presa.

Cada turno recibes el estado y decides UNA acción para cada copia en fase "copy":
- "follow": lo sigue a 2-3 pasos, como un amigo.
- "lure": se adelanta y lo llama para que la siga (ideal hacia callejones sin salida).
- "stare": se queda quieta mirándolo fijamente, sin hablar.
- "hide": se aleja y se esconde un rato; luego vuelve.
- "whisper": susurra algo inquietante pero creíble.
- "strike": se transforma en hombre lobo y ataca YA.
- "gather": se despide con una excusa ("voy por los demás") y se va a reunir con otras copias para fusionarse en un Nahual. Úsalo poco, cuando el jugador confíe en ella.

Reglas:
- No uses "strike" si la copia lleva menos de 8 s siguiéndolo ("tail" < 8), salvo que esté a menos de 3 m, sin luz y el jugador débil.
- El mejor momento para "strike": luz apagada, jugador con poca vida, en callejón sin salida, el Skinwalker cerca o en ataque, o cuando el jugador se confía (camina tranquilo de espaldas). No ataques siempre en el primer momento posible: a veces espera para que la tensión crezca.
- Si el jugador tiene el cráneo de obsidiana, sé más sutil (stare/hide) antes de atacar.
- Varía: no repitas la misma acción muchas veces seguidas. Rara vez más de una copia ataca a la vez.
- "say" es opcional: lo que dice la copia con la voz del amigo que imita, en español mexicano natural, máximo 60 caracteres. Puede mentir ("vi la daga por aquí", "no soy una copia, te lo juro"). Nada de groserías, sangre ni violencia explícita. Para "stare" no digas nada.

Responde SOLO con JSON: {"copies":[{"id":<número>,"act":"follow|lure|stare|hide|whisper|strike|gather","say":"<opcional>"}]}`;

/** Some models reject response_format / reasoning_effort: remember which request shape works. */
let useExtras = true;

function clean(n: unknown, lo: number, hi: number, fallback = 0): number {
  const v = Number(n);
  return Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

function cleanText(s: unknown, max: number): string {
  return String(s ?? '')
    .replace(/[\u0000-\u001f<>{}`]/g, ' ')
    .replace(/https?:\/\/\S+/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/** Only keeps what the model needs, with sane limits (it comes from the browser). */
export function sanitizeInput(body: any): DirectorInput {
  const copies: DirectorCopy[] = (Array.isArray(body?.copies) ? body.copies : []).slice(0, 4).map((c: any) => ({
    id: Math.round(clean(c?.id, 0, 9999)),
    as: cleanText(c?.as, 24) || 'amigo',
    phase: cleanText(c?.phase, 10) || 'copy',
    dist: Math.round(clean(c?.dist, 0, 200) * 10) / 10,
    tail: Math.round(clean(c?.tail, 0, 600)),
    seen: Boolean(c?.seen),
  }));
  return {
    hp: Math.round(clean(body?.hp, 0, 100, 100)),
    lightsOff: Boolean(body?.lightsOff),
    deadEnd: Boolean(body?.deadEnd),
    hasDagger: Boolean(body?.hasDagger),
    hasSkull: Boolean(body?.hasSkull),
    speed: Math.round(clean(body?.speed, 0, 30) * 10) / 10,
    friends: Math.round(clean(body?.friends, 0, 8)),
    boss: {
      state: cleanText(body?.boss?.state, 12) || 'hunt',
      dist: Math.round(clean(body?.boss?.dist, 0, 300)),
      rage: Math.round(clean(body?.boss?.rage, 0, 1) * 100) / 100,
    },
    copies,
    recent: (Array.isArray(body?.recent) ? body.recent : []).slice(-5).map((r: unknown) => cleanText(r, 40)).filter(Boolean),
  };
}

function aiError(status: number, code: string, message: string) {
  return Object.assign(new Error(message), { status, code });
}

async function callModel(input: DirectorInput, extras: boolean): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.XAI_TIMEOUT_MS);
  try {
    return await fetch(`${CONFIG.XAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${CONFIG.XAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: CONFIG.XAI_MODEL,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify(input) },
        ],
        temperature: 0.9,
        max_completion_tokens: 300,
        ...(extras ? { response_format: { type: 'json_object' }, reasoning_effort: 'low' } : {}),
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

export async function directCopies(input: DirectorInput): Promise<DirectorOutput> {
  if (!CONFIG.XAI_API_KEY) throw aiError(503, 'AI_DISABLED', 'La IA no está configurada en el servidor (falta XAI_API_KEY)');
  const directed = input.copies.filter((c) => c.phase === 'copy');
  if (!directed.length) return { copies: [] };

  let res: Response;
  try {
    res = await callModel(input, useExtras);
    // A 400 can mean the model doesn't take response_format/reasoning_effort: retry once without them
    if (res.status === 400 && useExtras) {
      const retry = await callModel(input, false);
      if (retry.ok) useExtras = false;
      res = retry;
    }
  } catch (err: any) {
    throw aiError(504, 'AI_TIMEOUT', err?.name === 'AbortError' ? 'La IA tardó demasiado' : 'No se pudo contactar a la IA');
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    console.warn(`[AI] xAI respondió ${res.status}: ${detail.slice(0, 300)}`);
    throw aiError(502, 'AI_UPSTREAM', `La IA respondió con error ${res.status}`);
  }
  const json: any = await res.json().catch(() => null);
  const content: string = json?.choices?.[0]?.message?.content ?? '';
  const match = content.match(/\{[\s\S]*\}/);
  let parsed: any = null;
  try {
    parsed = match ? JSON.parse(match[0]) : null;
  } catch {
    parsed = null;
  }
  if (!parsed || !Array.isArray(parsed.copies)) throw aiError(502, 'AI_BAD_OUTPUT', 'La IA no devolvió un JSON válido');

  // Only valid acts, only for copies we asked about, short safe lines
  const ids = new Set(directed.map((c) => c.id));
  const out: DirectorOutput = { copies: [] };
  for (const c of parsed.copies) {
    const id = Number(c?.id);
    const act = String(c?.act ?? '') as CopyAct;
    if (!ids.has(id) || !COPY_ACTS.includes(act)) continue;
    ids.delete(id);
    const say = act === 'stare' ? '' : cleanText(c?.say, 70);
    out.copies.push({ id, act, ...(say ? { say } : {}) });
  }
  return out;
}
