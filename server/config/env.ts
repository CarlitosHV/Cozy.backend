export const CONFIG = {
  PORT: Number(process.env.PORT) || 3000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  JWT_SECRET: process.env.JWT_SECRET || 'cozy-leap-online-super-secret-jwt-key-2026',
  JWT_ACCESS_EXPIRES_IN: '15m',
  JWT_REFRESH_EXPIRES_DAYS: 7,
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  MIN_LEVEL_PHYSICAL_SECONDS: {
    1: 4.5, // Isla Verde minimum feasible run time
    2: 7.0, // Cumbres Nubladas minimum feasible run time
    3: 10.0, // Templo Astral minimum feasible run time
    4: 14.0, // Caverna Cristal
    5: 18.0, // Cumbre del Viento
  } as Record<number, number>,
};
