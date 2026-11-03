import React, { useState } from 'react';
import { Send, CheckCircle2, XCircle, Clock, PlayCircle, Code, Copy, RefreshCw } from 'lucide-react';
import { GameApiClient } from '../api';

interface ApiExplorerProps {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface EndpointDef {
  id: string;
  name: string;
  method: 'GET' | 'POST' | 'PUT';
  path: string;
  requiresAuth: boolean;
  description: string;
  defaultBody?: any;
}

const ENDPOINTS: EndpointDef[] = [
  {
    id: 'health',
    name: 'Estado del Sistema',
    method: 'GET',
    path: '/api/v1/system/health',
    requiresAuth: false,
    description: 'Verifica la salud del servidor Express, MongoDB in-memory y Redis.',
  },
  {
    id: 'register',
    name: 'Registro de Usuario',
    method: 'POST',
    path: '/api/v1/auth/register',
    requiresAuth: false,
    description: 'Crea una nueva cuenta con contraseña hasheada (Argon2/bcrypt) y sesión Redis.',
    defaultBody: {
      username: 'explorador_' + Math.floor(Math.random() * 900 + 100),
      displayName: 'Explorador Novato',
      email: `explorador_${Math.floor(Math.random() * 900 + 100)}@cozyleap.com`,
      password: 'CozyLeap123!',
    },
  },
  {
    id: 'login',
    name: 'Inicio de Sesión',
    method: 'POST',
    path: '/api/v1/auth/login',
    requiresAuth: false,
    description: 'Valida credenciales, emite Access Token JWT (15m) y Refresh Token HttpOnly.',
    defaultBody: {
      email: 'pionero@cozyleap.com',
      password: 'CozyLeap123!',
      deviceId: 'web-browser',
    },
  },
  {
    id: 'refresh',
    name: 'Renovación de Token (Refresh)',
    method: 'POST',
    path: '/api/v1/auth/refresh',
    requiresAuth: false,
    description: 'Usa el Refresh Token para rotar la sesión y emitir un nuevo Access Token.',
    defaultBody: {
      refreshToken: '',
    },
  },
  {
    id: 'me',
    name: 'Obtener Perfil y Progreso (/me)',
    method: 'GET',
    path: '/api/v1/player/me',
    requiresAuth: true,
    description: 'Devuelve datos del usuario, apariencia 3D, inventario y niveles completados.',
  },
  {
    id: 'appearance',
    name: 'Guardar Apariencia de Personaje',
    method: 'PUT',
    path: '/api/v1/player/appearance',
    requiresAuth: true,
    description: 'Persiste colores de ropa, cabello, ojos, tipo de cuerpo y compañero en la base de datos.',
    defaultBody: {
      bodyType: 'chico',
      skinColor: '#f8d5b8',
      hairStyle: 'cozy_messy',
      hairColor: '#3b82f6',
      eyesStyle: 'bright_round',
      eyesColor: '#10b981',
      shirtStyle: 'hoodie',
      shirtColor: '#8b5cf6',
      pantsStyle: 'joggers',
      pantsColor: '#1e293b',
      shoesColor: '#f59e0b',
      hat: 'gorro_explorador',
      glasses: 'none',
      backpack: 'explorer_pack',
      companion: 'estrella',
    },
  },
  {
    id: 'inventory',
    name: 'Actualizar Mochila (5 Slots)',
    method: 'PUT',
    path: '/api/v1/player/inventory',
    requiresAuth: true,
    description: 'Sincroniza el contenido exacto de los 5 espacios de almacenamiento.',
    defaultBody: {
      slots: ['baya', 'llave', 'nuez', 'baya', null],
    },
  },
  {
    id: 'complete-level',
    name: 'Validar y Registrar Nivel',
    method: 'POST',
    path: '/api/v1/player/complete-level',
    requiresAuth: true,
    description: 'Valida con reglas de física en el backend y desbloquea el siguiente nivel.',
    defaultBody: {
      levelId: 1,
      timeSeconds: 16.45,
      relicsFound: 4,
      mode: 'time_trial',
    },
  },
  {
    id: 'leaderboard',
    name: 'Tabla de Clasificación (Top 50)',
    method: 'GET',
    path: '/api/v1/leaderboard/1?mode=time_trial',
    requiresAuth: false,
    description: 'Consulta los mejores récords usando Redis Sorted Sets (ZRANGE).',
  },
];

export const ApiExplorer: React.FC<ApiExplorerProps> = ({ showToast }) => {
  const [selectedEndpoint, setSelectedEndpoint] = useState<EndpointDef>(ENDPOINTS[0]);
  const [requestBodyText, setRequestBodyText] = useState<string>(
    selectedEndpoint.defaultBody ? JSON.stringify(selectedEndpoint.defaultBody, null, 2) : ''
  );
  const [responseStatus, setResponseStatus] = useState<number | null>(null);
  const [responseDuration, setResponseDuration] = useState<number | null>(null);
  const [responseData, setResponseData] = useState<any>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [suiteResults, setSuiteResults] = useState<Array<{ name: string; status: number; duration: number; ok: boolean }>>([]);
  const [isSuiteRunning, setIsSuiteRunning] = useState<boolean>(false);

  const handleSelectEndpoint = (ep: EndpointDef) => {
    setSelectedEndpoint(ep);
    if (ep.id === 'refresh') {
      const currentRefreshToken = GameApiClient.getRefreshToken() || '';
      setRequestBodyText(JSON.stringify({ refreshToken: currentRefreshToken }, null, 2));
    } else {
      setRequestBodyText(ep.defaultBody ? JSON.stringify(ep.defaultBody, null, 2) : '');
    }
    setResponseData(null);
    setResponseStatus(null);
  };

  const handleSend = async () => {
    setIsLoading(true);
    let body: any = undefined;

    if (selectedEndpoint.method !== 'GET' && requestBodyText.trim()) {
      try {
        body = JSON.parse(requestBodyText);
      } catch {
        setIsLoading(false);
        showToast('JSON inválido en el cuerpo de la petición', 'error');
        return;
      }
    }

    const res = await GameApiClient.request(selectedEndpoint.path, {
      method: selectedEndpoint.method,
      body: body ? JSON.stringify(body) : undefined,
    });

    setIsLoading(false);
    setResponseStatus(res.status);
    setResponseDuration(res.durationMs);
    setResponseData(res.data);

    // If login or register was successful, update client tokens
    if (res.ok && res.data?.data?.accessToken) {
      GameApiClient.setToken(res.data.data.accessToken);
      if (res.data.data.refreshToken) {
        GameApiClient.setRefreshToken(res.data.data.refreshToken);
      }
      showToast('Tokens de sesión actualizados en el cliente', 'info');
    }
  };

  const runAutomatedSuite = async () => {
    setIsSuiteRunning(true);
    setSuiteResults([]);
    showToast('Iniciando prueba automatizada E2E de todos los endpoints...', 'info');

    const results: Array<{ name: string; status: number; duration: number; ok: boolean }> = [];

    // 1. Health
    const r1 = await GameApiClient.request('/api/v1/system/health', { method: 'GET' });
    results.push({ name: 'GET /api/v1/system/health', status: r1.status, duration: r1.durationMs, ok: r1.ok });
    setSuiteResults([...results]);

    // 2. Login as pionero
    const r2 = await GameApiClient.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: 'pionero@cozyleap.com', password: 'CozyLeap123!' }),
    });
    if (r2.ok && r2.data?.data?.accessToken) {
      GameApiClient.setToken(r2.data.data.accessToken);
      GameApiClient.setRefreshToken(r2.data.data.refreshToken);
    }
    results.push({ name: 'POST /api/v1/auth/login (JWT Issue)', status: r2.status, duration: r2.durationMs, ok: r2.ok });
    setSuiteResults([...results]);

    // 3. /me
    const r3 = await GameApiClient.request('/api/v1/player/me', { method: 'GET' });
    results.push({ name: 'GET /api/v1/player/me (Auth Check)', status: r3.status, duration: r3.durationMs, ok: r3.ok });
    setSuiteResults([...results]);

    // 4. Update appearance
    const r4 = await GameApiClient.request('/api/v1/player/appearance', {
      method: 'PUT',
      body: JSON.stringify(ENDPOINTS.find((e) => e.id === 'appearance')?.defaultBody),
    });
    results.push({ name: 'PUT /api/v1/player/appearance', status: r4.status, duration: r4.durationMs, ok: r4.ok });
    setSuiteResults([...results]);

    // 5. Update inventory
    const r5 = await GameApiClient.request('/api/v1/player/inventory', {
      method: 'PUT',
      body: JSON.stringify({ slots: ['baya', 'nuez', 'llave', null, null] }),
    });
    results.push({ name: 'PUT /api/v1/player/inventory', status: r5.status, duration: r5.durationMs, ok: r5.ok });
    setSuiteResults([...results]);

    // 6. Complete level
    const r6 = await GameApiClient.request('/api/v1/player/complete-level', {
      method: 'POST',
      body: JSON.stringify({ levelId: 1, timeSeconds: 15.3, relicsFound: 3, mode: 'time_trial' }),
    });
    results.push({ name: 'POST /api/v1/player/complete-level', status: r6.status, duration: r6.durationMs, ok: r6.ok });
    setSuiteResults([...results]);

    // 7. Leaderboard
    const r7 = await GameApiClient.request('/api/v1/leaderboard/1?mode=time_trial', { method: 'GET' });
    results.push({ name: 'GET /api/v1/leaderboard/1 (Redis ZSET)', status: r7.status, duration: r7.durationMs, ok: r7.ok });
    setSuiteResults([...results]);

    // 8. Refresh Token
    const refreshToken = GameApiClient.getRefreshToken();
    const r8 = await GameApiClient.request('/api/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });
    results.push({ name: 'POST /api/v1/auth/refresh (Token Rotation)', status: r8.status, duration: r8.durationMs, ok: r8.ok });
    setSuiteResults([...results]);

    setIsSuiteRunning(false);
    showToast('¡Prueba E2E completada con éxito!', 'success');
  };

  const copyCurl = () => {
    const token = GameApiClient.getToken();
    let curl = `curl -X ${selectedEndpoint.method} "http://localhost:3000${selectedEndpoint.path}" \\\n  -H "Content-Type: application/json"`;
    if (selectedEndpoint.requiresAuth && token) {
      curl += ` \\\n  -H "Authorization: Bearer ${token}"`;
    }
    if (selectedEndpoint.method !== 'GET' && requestBodyText.trim()) {
      curl += ` \\\n  -d '${requestBodyText.replace(/\n/g, '')}'`;
    }
    navigator.clipboard.writeText(curl);
    showToast('Comando cURL copiado al portapapeles', 'info');
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Code className="w-5 h-5 text-indigo-400" />
            <span>REST API Explorer & Validador de Endpoints</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Prueba en vivo los 8 endpoints REST especificados en la arquitectura con JWT, cookies y validación Zod.
          </p>
        </div>

        <button
          onClick={runAutomatedSuite}
          disabled={isSuiteRunning}
          className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs sm:text-sm font-bold px-4 py-2.5 rounded-xl shadow-lg shadow-emerald-600/30 flex items-center space-x-2 transition"
        >
          <PlayCircle className="w-4 h-4" />
          <span>{isSuiteRunning ? 'Ejecutando Suite...' : 'Ejecutar Suite E2E Completa'}</span>
        </button>
      </div>

      {/* Automated Suite Results Panel */}
      {suiteResults.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <h3 className="text-sm font-bold text-white mb-3 flex items-center justify-between">
            <span>Resultados de la Suite E2E ({suiteResults.filter((r) => r.ok).length}/{suiteResults.length} Pasadas)</span>
            {isSuiteRunning && <RefreshCw className="w-4 h-4 text-emerald-400 animate-spin" />}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
            {suiteResults.map((res, i) => (
              <div
                key={i}
                className={`p-2.5 rounded-xl border flex items-center justify-between text-xs ${
                  res.ok
                    ? 'bg-emerald-950/30 border-emerald-500/30 text-emerald-300'
                    : 'bg-red-950/30 border-red-500/30 text-red-300'
                }`}
              >
                <div className="flex items-center space-x-2 truncate">
                  {res.ok ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> : <XCircle className="w-4 h-4 text-red-400 shrink-0" />}
                  <span className="font-semibold truncate">{res.name}</span>
                </div>
                <span className="text-[10px] text-slate-400 font-mono shrink-0 ml-1">
                  {res.status} ({res.duration}ms)
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Two Columns: Endpoints List + Request/Response Console */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Endpoints Nav List */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-4 shadow-xl space-y-2">
          <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider px-2 mb-3">
            Catálogo de Endpoints
          </h3>
          <div className="space-y-1.5 max-h-[600px] overflow-y-auto pr-1">
            {ENDPOINTS.map((ep) => {
              const isSelected = selectedEndpoint.id === ep.id;
              const methodColor =
                ep.method === 'GET'
                  ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                  : ep.method === 'POST'
                  ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                  : 'bg-amber-500/20 text-amber-400 border-amber-500/30';

              return (
                <button
                  key={ep.id}
                  onClick={() => handleSelectEndpoint(ep)}
                  className={`w-full text-left p-2.5 rounded-xl transition flex flex-col space-y-1 ${
                    isSelected
                      ? 'bg-indigo-950/60 border border-indigo-500/50 shadow-md'
                      : 'hover:bg-slate-800/80 border border-transparent'
                  }`}
                >
                  <div className="flex items-center space-x-2">
                    <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded border ${methodColor}`}>
                      {ep.method}
                    </span>
                    <span className="text-xs font-bold text-white truncate">{ep.name}</span>
                  </div>
                  <span className="text-[11px] text-slate-400 font-mono truncate">{ep.path}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Request & Response Workspace */}
        <div className="lg:col-span-8 space-y-4">
          {/* Header of selected endpoint */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center space-x-2">
                  <span
                    className={`text-xs font-bold px-2 py-0.5 rounded border ${
                      selectedEndpoint.method === 'GET'
                        ? 'bg-blue-500/20 text-blue-400 border-blue-500/30'
                        : selectedEndpoint.method === 'POST'
                        ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                        : 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                    }`}
                  >
                    {selectedEndpoint.method}
                  </span>
                  <span className="font-mono text-sm text-white font-bold">{selectedEndpoint.path}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">{selectedEndpoint.description}</p>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={copyCurl}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold border border-slate-700 flex items-center space-x-1 transition"
                  title="Copiar comando cURL"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>cURL</span>
                </button>

                <button
                  onClick={handleSend}
                  disabled={isLoading}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold shadow-md shadow-indigo-600/30 flex items-center space-x-1.5 transition"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isLoading ? 'Enviando...' : 'Enviar Request'}</span>
                </button>
              </div>
            </div>

            {/* Body Editor if POST/PUT */}
            {selectedEndpoint.method !== 'GET' && (
              <div className="mt-4 pt-4 border-t border-slate-800">
                <label className="text-xs font-bold text-slate-300 block mb-1.5">
                  Cuerpo de la Petición (JSON):
                </label>
                <textarea
                  value={requestBodyText}
                  onChange={(e) => setRequestBodyText(e.target.value)}
                  rows={6}
                  className="w-full bg-slate-950 font-mono text-xs text-indigo-300 border border-slate-700 rounded-xl p-3 focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}
          </div>

          {/* Response Console */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Respuesta del Servidor
              </h4>
              {responseStatus !== null && (
                <div className="flex items-center space-x-3 text-xs">
                  <span
                    className={`font-bold px-2 py-0.5 rounded ${
                      responseStatus >= 200 && responseStatus < 300
                        ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                        : 'bg-red-500/20 text-red-400 border border-red-500/30'
                    }`}
                  >
                    HTTP {responseStatus}
                  </span>
                  {responseDuration !== null && (
                    <span className="text-slate-400 flex items-center space-x-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>{responseDuration} ms</span>
                    </span>
                  )}
                </div>
              )}
            </div>

            <div className="bg-slate-950 border border-slate-800 rounded-xl p-4 max-h-80 overflow-y-auto">
              {responseData ? (
                <pre className="font-mono text-xs text-emerald-400 whitespace-pre-wrap">
                  {JSON.stringify(responseData, null, 2)}
                </pre>
              ) : (
                <p className="text-xs text-slate-600 font-mono text-center py-8">
                  Presiona "Enviar Request" o selecciona otro endpoint para ver la respuesta JSON.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
