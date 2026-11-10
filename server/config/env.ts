function parseCorsOrigin(raw?: string): string | string[] {
  const value = (raw || 'https://cozy.hardbug.mx').trim();
  if (value === '*') return '*';
  const list = value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  if (list.length === 0) return 'https://cozy.hardbug.mx';
  return list.length === 1 ? list[0] : list;
}

export const CONFIG = {
  PORT: Number(process.env.PORT) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET || 'cozy-leap-online-super-secret-jwt-key-2026',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_DAYS: 7,
  CORS_ORIGIN: parseCorsOrigin(process.env.CORS_ORIGIN),
  MONGODB_URI: process.env.MONGODB_URI || '',
  REDIS_URL: process.env.REDIS_URL || '',
  // xAI (Grok): directs the Skinwalker's copies. Without a key the game uses its own rules.
  XAI_API_KEY: process.env.XAI_API_KEY || '',
  XAI_MODEL: process.env.XAI_MODEL || 'grok-4.7',
  XAI_BASE_URL: (process.env.XAI_BASE_URL || 'https://api.x.ai/v1').replace(/\/+$/, ''),
  XAI_TIMEOUT_MS: Number(process.env.XAI_TIMEOUT_MS) || 8000,
  /** Seconds between two decisions for the same player */
  XAI_MIN_INTERVAL_S: Number(process.env.XAI_MIN_INTERVAL_S) || 4,
  /** Max requests per minute for the whole server */
  XAI_MAX_PER_MIN: Number(process.env.XAI_MAX_PER_MIN) || 240,
  MIN_LEVEL_PHYSICAL_SECONDS: {
    1: 4.5, // Isla Verde minimum feasible run time
    2: 7.0, // Cumbres Nubladas minimum feasible run time
    3: 10.0, // Templo Astral minimum feasible run time
    4: 14.0, // Caverna Cristal
    5: 18.0, // Cumbre del Viento
  } as Record<number, number>,
};
