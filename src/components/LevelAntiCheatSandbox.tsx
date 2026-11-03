import React, { useState, useEffect } from 'react';
import { Trophy, ShieldAlert, Award, Timer, CheckCircle, AlertTriangle, Play, RefreshCw, Zap } from 'lucide-react';
import { PlayerProgress, User } from '../types';
import { GameApiClient } from '../api';

interface LevelAntiCheatSandboxProps {
  currentUser: User | null;
  progress: PlayerProgress;
  onRefreshProgress: () => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

interface LeaderboardEntry {
  rank: number;
  userId: string;
  username: string;
  timeSeconds: number;
  collectiblesFound?: number;
}

export const LevelAntiCheatSandbox: React.FC<LevelAntiCheatSandboxProps> = ({
  currentUser,
  progress,
  onRefreshProgress,
  showToast,
}) => {
  const [selectedLevel, setSelectedLevel] = useState<number>(1);
  const [completionTime, setCompletionTime] = useState<number>(14.2);
  const [relicsFound, setRelicsFound] = useState<number>(4);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [isLoadingLb, setIsLoadingLb] = useState<boolean>(false);
  const [submissionResult, setSubmissionResult] = useState<any>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  const fetchLeaderboard = async (lvl: number) => {
    setIsLoadingLb(true);
    const res = await GameApiClient.request(`/api/v1/leaderboard/${lvl}?mode=time_trial`);
    setIsLoadingLb(false);
    if (res.ok && res.data.leaderboard) {
      setLeaderboard(res.data.leaderboard);
    }
  };

  useEffect(() => {
    fetchLeaderboard(selectedLevel);
  }, [selectedLevel]);

  const handleSubmitLevel = async (overrideTime?: number, overrideLevel?: number) => {
    if (!currentUser) {
      showToast('Debes iniciar sesión para registrar récords', 'error');
      return;
    }

    setIsSubmitting(true);
    setSubmissionResult(null);

    const targetLevel = overrideLevel !== undefined ? overrideLevel : selectedLevel;
    const targetTime = overrideTime !== undefined ? overrideTime : completionTime;

    const res = await GameApiClient.request('/api/v1/player/complete-level', {
      method: 'POST',
      body: JSON.stringify({
        levelId: targetLevel,
        timeSeconds: targetTime,
        relicsFound,
        mode: 'time_trial',
      }),
    });

    setIsSubmitting(false);
    setSubmissionResult({
      status: res.status,
      ok: res.ok,
      data: res.data,
    });

    if (res.ok) {
      showToast(`¡Nivel ${targetLevel} completado legítimamente! Récord en Redis guardado`, 'success');
      onRefreshProgress();
      fetchLeaderboard(targetLevel);
    } else {
      showToast(res.data.message || 'El servidor rechazó la partida', 'error');
    }
  };

  const levelThresholds: Record<number, number> = {
    1: 4.5,
    2: 7.0,
    3: 10.0,
    4: 14.0,
    5: 18.0,
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center space-x-2">
            <ShieldAlert className="w-5 h-5 text-indigo-400" />
            <span>Autoridad del Servidor & Motor Anti-Cheat</span>
          </h2>
          <p className="text-xs sm:text-sm text-slate-400 mt-1">
            Valida en el backend la física de carrera humana (rechazo de teletransporte o speedhack) y desbloqueo secuencial de niveles.
          </p>
        </div>

        <div className="bg-slate-800/80 border border-slate-700 rounded-xl px-4 py-2 text-right">
          <p className="text-[11px] text-slate-400 font-semibold">Progreso del Jugador</p>
          <p className="text-sm font-bold text-emerald-400">
            Nivel Máx. Desbloqueado: {progress.maxUnlockedLevel}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Col: Interactive Level Submission Simulator */}
        <div className="lg:col-span-6 space-y-6">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <h3 className="text-sm font-bold text-white flex items-center justify-between border-b border-slate-800 pb-3">
              <span className="flex items-center space-x-2">
                <Timer className="w-4 h-4 text-amber-400" />
                <span>Simulador de Llegada a la Meta</span>
              </span>
              <span className="text-xs text-slate-500 font-mono">POST /api/v1/player/complete-level</span>
            </h3>

            {/* Level Selector */}
            <div>
              <label className="text-xs font-semibold text-slate-300 block mb-2">
                Seleccionar Nivel a Enviar:
              </label>
              <div className="grid grid-cols-5 gap-2">
                {[1, 2, 3, 4, 5].map((lvl) => {
                  const isUnlocked = lvl <= progress.maxUnlockedLevel;
                  const isCompleted = progress.completedLevels.includes(lvl);
                  const isSelected = selectedLevel === lvl;

                  return (
                    <button
                      key={lvl}
                      onClick={() => setSelectedLevel(lvl)}
                      className={`p-2.5 rounded-xl border text-center transition flex flex-col items-center justify-center ${
                        isSelected
                          ? 'bg-indigo-600 border-indigo-400 text-white shadow-md'
                          : isUnlocked
                          ? 'bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-750'
                          : 'bg-slate-900 border-slate-800 text-slate-600 opacity-60'
                      }`}
                    >
                      <span className="text-xs font-bold">Nivel {lvl}</span>
                      <span className="text-[10px] mt-0.5 font-semibold">
                        {isCompleted ? '✓ Hecho' : isUnlocked ? '🔓 Abierto' : '🔒 Bloqueado'}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Completion Time & Relics Input */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Tiempo Registrado (Segundos)
                </label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  value={completionTime}
                  onChange={(e) => setCompletionTime(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  Umbral mínimo físico servidor: {levelThresholds[selectedLevel] || 4.5}s
                </p>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">
                  Reliquias / Coleccionables
                </label>
                <input
                  type="number"
                  min="0"
                  max="20"
                  value={relicsFound}
                  onChange={(e) => setRelicsFound(Number(e.target.value))}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white font-mono focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            {/* Quick Test Presets (Legit vs Hacks) */}
            <div>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">
                Pruebas Rápidas de Seguridad:
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleSubmitLevel(14.8, selectedLevel)}
                  className="p-2 bg-emerald-950/40 hover:bg-emerald-900/40 border border-emerald-500/40 rounded-xl text-left transition"
                >
                  <p className="text-xs font-bold text-emerald-400 flex items-center space-x-1">
                    <span>✓ Carrera Legítima</span>
                  </p>
                  <p className="text-[10px] text-slate-400">14.8 segundos (Aprobado)</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSubmitLevel(0.4, selectedLevel)}
                  className="p-2 bg-red-950/40 hover:bg-red-900/40 border border-red-500/40 rounded-xl text-left transition"
                >
                  <p className="text-xs font-bold text-red-400 flex items-center space-x-1">
                    <span>✗ Speed-Hack</span>
                  </p>
                  <p className="text-[10px] text-slate-400">0.4 segundos (Rechazado 400)</p>
                </button>

                <button
                  type="button"
                  onClick={() => handleSubmitLevel(19.2, 5)}
                  className="p-2 bg-amber-950/40 hover:bg-amber-900/40 border border-amber-500/40 rounded-xl text-left transition"
                >
                  <p className="text-xs font-bold text-amber-400 flex items-center space-x-1">
                    <span>🔒 Salto de Nivel</span>
                  </p>
                  <p className="text-[10px] text-slate-400">Nivel 5 bloqueado (403)</p>
                </button>
              </div>
            </div>

            <button
              onClick={() => handleSubmitLevel()}
              disabled={isSubmitting}
              className="w-full bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2 transition"
            >
              {isSubmitting ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              <span>Validar Partida en el Backend</span>
            </button>
          </div>

          {/* Result of the validation */}
          {submissionResult && (
            <div
              className={`p-5 rounded-2xl border shadow-xl animate-in fade-in ${
                submissionResult.ok
                  ? 'bg-emerald-950/40 border-emerald-500/40'
                  : 'bg-red-950/40 border-red-500/40'
              }`}
            >
              <div className="flex items-center space-x-2 mb-2">
                {submissionResult.ok ? (
                  <CheckCircle className="w-5 h-5 text-emerald-400" />
                ) : (
                  <AlertTriangle className="w-5 h-5 text-red-400" />
                )}
                <h4 className="font-bold text-sm text-white">
                  {submissionResult.ok ? 'Partida Aprobada y Guardada' : 'Fallo de Autoridad / Anti-Cheat'}
                </h4>
                <span className="text-xs font-mono text-slate-400 ml-auto">
                  HTTP {submissionResult.status}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                {submissionResult.data.message}
              </p>
              {submissionResult.ok && submissionResult.data.data && (
                <div className="mt-3 pt-3 border-t border-emerald-500/20 text-xs text-emerald-300 flex items-center justify-between">
                  <span>Posición en Redis Leaderboard: #{submissionResult.data.data.rank}</span>
                  <span>Próximo Nivel: {submissionResult.data.data.progress.maxUnlockedLevel}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Col: Live Leaderboard (Redis Sorted Set) */}
        <div className="lg:col-span-6 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <span>Tabla de Clasificación: Nivel {selectedLevel}</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Clasificación en tiempo real impulsada por Redis Sorted Sets (<code>ZSET</code>).
              </p>
            </div>

            <button
              onClick={() => fetchLeaderboard(selectedLevel)}
              disabled={isLoadingLb}
              className="p-2 text-slate-400 hover:text-white bg-slate-800 rounded-lg transition border border-slate-700"
            >
              <RefreshCw className={`w-4 h-4 ${isLoadingLb ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="space-y-2 max-h-[460px] overflow-y-auto pr-1">
            {leaderboard.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-10">
                No hay récords registrados aún para el Nivel {selectedLevel}.
              </p>
            ) : (
              leaderboard.map((entry) => {
                const isTop1 = entry.rank === 1;
                const isTop2 = entry.rank === 2;
                const isTop3 = entry.rank === 3;

                return (
                  <div
                    key={`${entry.userId}-${entry.rank}`}
                    className={`p-3 rounded-xl border flex items-center justify-between transition ${
                      isTop1
                        ? 'bg-amber-950/30 border-amber-500/40 text-amber-200'
                        : isTop2
                        ? 'bg-slate-800 border-slate-600 text-slate-200'
                        : isTop3
                        ? 'bg-amber-950/20 border-amber-800/40 text-amber-400'
                        : 'bg-slate-800/50 border-slate-700/60 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <div
                        className={`w-7 h-7 rounded-lg font-extrabold text-xs flex items-center justify-center ${
                          isTop1
                            ? 'bg-amber-500 text-slate-950'
                            : isTop2
                            ? 'bg-slate-300 text-slate-950'
                            : isTop3
                            ? 'bg-amber-700 text-white'
                            : 'bg-slate-700 text-slate-300'
                        }`}
                      >
                        {entry.rank}
                      </div>

                      <div>
                        <p className="text-xs font-bold text-white">{entry.username}</p>
                        <p className="text-[10px] text-slate-400">
                          {entry.collectiblesFound ? `${entry.collectiblesFound} reliquias` : 'Modo Contrarreloj'}
                        </p>
                      </div>
                    </div>

                    <div className="text-right">
                      <span className="font-mono text-sm font-extrabold text-emerald-400">
                        {entry.timeSeconds.toFixed(2)}s
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
