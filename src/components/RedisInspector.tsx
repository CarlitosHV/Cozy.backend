import React, { useState, useEffect } from 'react';
import { Database, RefreshCw, Activity, Key, Users, Flame, Layers, Clock } from 'lucide-react';
import { GameApiClient } from '../api';

interface RedisInspectorProps {
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const RedisInspector: React.FC<RedisInspectorProps> = ({ showToast }) => {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  const fetchRedisData = async () => {
    setLoading(true);
    const res = await GameApiClient.request('/api/v1/system/redis-inspect');
    setLoading(false);
    if (res.ok && res.data.redis) {
      setStats(res.data.redis);
    }
  };

  useEffect(() => {
    fetchRedisData();
    if (!autoRefresh) return;
    const interval = setInterval(fetchRedisData, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <Flame className="w-5 h-5 text-red-500" />
            <span>Inspector de Memoria & Estructuras Redis</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Supervisa en vivo las llaves con TTL (Sesiones), Sets de presencia, Hashes de salas de juego y Sorted Sets de récords.
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <label className="flex items-center space-x-2 text-xs font-semibold text-slate-300 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="rounded bg-slate-800 border-slate-700 text-indigo-600 focus:ring-0"
            />
            <span>Auto-refresco (3s)</span>
          </label>

          <button
            onClick={fetchRedisData}
            disabled={loading}
            className="p-2.5 bg-slate-800 hover:bg-slate-700 text-white rounded-xl border border-slate-700 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-blue-500/20 text-blue-400 border border-blue-500/30">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Sesiones Activas</p>
              <p className="text-xl font-extrabold text-white">{stats?.activeSessions?.length || 0}</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-mono">session:userId:deviceId</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Presencia Online (Set)</p>
              <p className="text-xl font-extrabold text-white">{stats?.onlineUsers?.length || 0}</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-mono">presence:online_users (SADD)</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Salas de Niveles (Hash)</p>
              <p className="text-xl font-extrabold text-white">
                {stats?.rooms ? Object.keys(stats.rooms).length : 0}
              </p>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-mono">room:level_X:players (HSET)</p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
              <Activity className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-slate-400 font-medium">Sorted Sets (ZSET)</p>
              <p className="text-xl font-extrabold text-white">{stats?.sortedSetsCount || 0}</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 mt-2 font-mono">leaderboard:level:id (ZADD)</p>
        </div>
      </div>

      {/* Two Columns: Active Sessions & Rooms Hash */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Sessions List */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-3">
            <Key className="w-4 h-4 text-blue-400" />
            <span>Sesiones y Tokens de Refresco en Redis</span>
          </h3>

          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {!stats?.activeSessions || stats.activeSessions.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-6">No hay sesiones activas en este momento.</p>
            ) : (
              stats.activeSessions.map((s: any, idx: number) => {
                const remainingMinutes = s.expiresAt
                  ? Math.max(0, Math.round((s.expiresAt - Date.now()) / 60000))
                  : 'Sin TTL';

                return (
                  <div key={idx} className="p-3 bg-slate-800/80 border border-slate-700 rounded-xl space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-xs font-bold text-indigo-300 truncate max-w-xs">{s.key}</span>
                      <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full font-mono flex items-center space-x-1">
                        <Clock className="w-3 h-3" />
                        <span>TTL: {remainingMinutes} min</span>
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-400 font-mono truncate">
                      Hash SHA-256: {s.value?.refreshTokenHash?.substring(0, 24)}...
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Level Rooms Hashes & Presence */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <h3 className="text-sm font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-3">
            <Layers className="w-4 h-4 text-indigo-400" />
            <span>Salas de Juego en Tiempo Real (Hash Maps)</span>
          </h3>

          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {stats?.rooms && Object.keys(stats.rooms).length > 0 ? (
              Object.entries(stats.rooms).map(([roomKey, count]: any) => (
                <div key={roomKey} className="p-3 bg-slate-800/80 border border-slate-700 rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-white font-mono">{roomKey}</p>
                    <p className="text-[11px] text-slate-400">Coordenadas y rotación (yaw) en vivo</p>
                  </div>
                  <span className="text-xs font-extrabold px-2.5 py-1 rounded-lg bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    {count} Conectados
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 text-center py-6">
                No hay salas activas con jugadores en este momento. Ingresa al "Mundo Online" para crear una sala.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
