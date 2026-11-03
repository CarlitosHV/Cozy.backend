import React, { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { Users, Wifi, Radio, Play, Bot, Compass, Sparkles, Zap, Shield, ArrowUp, ArrowDown, ArrowLeft, ArrowRight } from 'lucide-react';
import { CharacterAppearance, PlayerRemoteState, User } from '../types';

interface MultiplayerArenaProps {
  currentUser: User | null;
  userToken: string | null;
  userAppearance?: CharacterAppearance;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const MultiplayerArena: React.FC<MultiplayerArenaProps> = ({
  currentUser,
  userToken,
  userAppearance,
  showToast,
}) => {
  const [levelId, setLevelId] = useState<number>(1);
  const [isConnected, setIsConnected] = useState<boolean>(false);
  const [ping, setPing] = useState<number>(0);
  const [remotePlayers, setRemotePlayers] = useState<Map<string, PlayerRemoteState>>(new Map());
  const [myPos, setMyPos] = useState<{ x: number; y: number; z: number; yaw: number; anim: string }>({
    x: 0,
    y: 1.0,
    z: 0,
    yaw: 0,
    anim: 'idle',
  });
  const [simulatedBots, setSimulatedBots] = useState<Socket[]>([]);
  const [powersLog, setPowersLog] = useState<Array<{ id: string; user: string; power: string; time: string }>>([]);
  const [packetsSent, setPacketsSent] = useState(0);
  const [packetsReceived, setPacketsReceived] = useState(0);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const socketRef = useRef<Socket | null>(null);
  const keysPressed = useRef<Record<string, boolean>>({});
  const positionRef = useRef({ x: 0, y: 1.0, z: 0, yaw: 0, anim: 'idle' });

  // Initialize Socket connection
  useEffect(() => {
    if (!userToken) return;

    const socket = io({
      auth: { token: userToken },
      transports: ['websocket', 'polling'],
    });
    socketRef.current = socket;

    socket.on('connect', () => {
      setIsConnected(true);
      showToast(`Conectado al servidor WebSocket (ID: ${socket.id?.substring(0, 8)})`, 'success');
      // Join selected level room
      socket.emit('room:join', { levelId });
    });

    socket.on('disconnect', () => {
      setIsConnected(false);
      setRemotePlayers(new Map());
    });

    socket.on('connect_error', (err) => {
      setIsConnected(false);
      showToast(`Error WS: ${err.message}`, 'error');
    });

    // Room initial state
    socket.on('room:state', (data: { levelId: number; players: PlayerRemoteState[]; yourSpawn?: any }) => {
      setPacketsReceived((p) => p + 1);
      const map = new Map<string, PlayerRemoteState>();
      for (const p of data.players) {
        if (p.userId !== currentUser?._id) {
          map.set(p.userId, p);
        }
      }
      setRemotePlayers(map);
      if (data.yourSpawn) {
        setMyPos((prev) => ({ ...prev, x: data.yourSpawn.x, y: data.yourSpawn.y, z: data.yourSpawn.z }));
        positionRef.current = { ...positionRef.current, x: data.yourSpawn.x, y: data.yourSpawn.y, z: data.yourSpawn.z };
      }
    });

    // Another player joined the room
    socket.on('player:joined', (player: any) => {
      setPacketsReceived((p) => p + 1);
      if (player.userId === currentUser?._id) return;
      setRemotePlayers((prev) => {
        const next = new Map(prev);
        next.set(player.userId, {
          userId: player.userId,
          username: player.username,
          appearance: player.appearance,
          x: player.position.x,
          y: player.position.y,
          z: player.position.z,
          yaw: player.position.yaw || 0,
          anim: 'idle',
          lastUpdate: Date.now(),
          socketId: '',
          levelId,
        });
        return next;
      });
      showToast(`Jugador ${player.username} entró a la isla`, 'info');
    });

    // Movement replication
    socket.on('player:moved', (data: any) => {
      setPacketsReceived((p) => p + 1);
      if (data.userId === currentUser?._id) return;
      setRemotePlayers((prev) => {
        const next = new Map(prev);
        const existing = next.get(data.userId);
        if (existing) {
          next.set(data.userId, {
            ...existing,
            x: data.x,
            y: data.y,
            z: data.z,
            yaw: data.yaw,
            anim: data.anim,
            action: data.action,
            lastUpdate: Date.now(),
          });
        }
        return next;
      });
    });

    // Player left
    socket.on('player:left', (data: { userId: string }) => {
      setPacketsReceived((p) => p + 1);
      setRemotePlayers((prev) => {
        const next = new Map(prev);
        next.delete(data.userId);
        return next;
      });
    });

    // Companion power effect broadcast
    socket.on('companion:power:broadcast', (data: any) => {
      setPacketsReceived((p) => p + 1);
      setPowersLog((prev) => [
        {
          id: Math.random().toString(36),
          user: data.username,
          power: data.powerType,
          time: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 15),
      ]);
    });

    // Ping check
    const pingInterval = setInterval(() => {
      const start = Date.now();
      socket.emit('ping', () => {
        setPing(Date.now() - start);
      });
    }, 3000);

    return () => {
      clearInterval(pingInterval);
      socket.disconnect();
    };
  }, [userToken, currentUser?._id]);

  // Level room switch
  const handleChangeLevel = (newLevelId: number) => {
    setLevelId(newLevelId);
    if (socketRef.current && socketRef.current.connected) {
      socketRef.current.emit('room:join', { levelId: newLevelId });
      showToast(`Cambiando a Sala Nivel ${newLevelId}...`, 'info');
    }
  };

  // Keyboard navigation & game loop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = true;
      if (e.key === ' ' && positionRef.current.anim !== 'jump') {
        positionRef.current.anim = 'jump';
        setTimeout(() => {
          if (positionRef.current.anim === 'jump') {
            positionRef.current.anim = 'idle';
          }
        }, 500);
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.key.toLowerCase()] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Movement and tick loop (25 Hz = 40ms interval)
    const tickInterval = setInterval(() => {
      const keys = keysPressed.current;
      let dx = 0;
      let dz = 0;
      const speed = 0.25;

      if (keys['w'] || keys['arrowup']) dz -= speed;
      if (keys['s'] || keys['arrowdown']) dz += speed;
      if (keys['a'] || keys['arrowleft']) dx -= speed;
      if (keys['d'] || keys['arrowright']) dx += speed;

      const isMoving = dx !== 0 || dz !== 0;
      let anim = positionRef.current.anim;
      if (anim !== 'jump') {
        anim = isMoving ? 'run' : 'idle';
      }

      if (isMoving || anim === 'jump') {
        let yaw = positionRef.current.yaw;
        if (isMoving) {
          yaw = Math.atan2(dx, dz);
        }

        // Bound to arena boundaries (-10 to 10)
        const nextX = Math.max(-9.5, Math.min(9.5, positionRef.current.x + dx));
        const nextZ = Math.max(-9.5, Math.min(9.5, positionRef.current.z + dz));

        positionRef.current = {
          x: Number(nextX.toFixed(2)),
          y: anim === 'jump' ? 2.2 : 1.0,
          z: Number(nextZ.toFixed(2)),
          yaw: Number(yaw.toFixed(2)),
          anim,
        };

        setMyPos({ ...positionRef.current });

        // Emit player:sync to Socket.io server
        if (socketRef.current && socketRef.current.connected) {
          socketRef.current.emit('player:sync', {
            x: positionRef.current.x,
            y: positionRef.current.y,
            z: positionRef.current.z,
            yaw: positionRef.current.yaw,
            anim: positionRef.current.anim,
          });
          setPacketsSent((p) => p + 1);
        }
      }
    }, 40);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      clearInterval(tickInterval);
    };
  }, []);

  // Trigger Companion Power
  const triggerCompanionPower = (powerName: string) => {
    if (!socketRef.current || !socketRef.current.connected) {
      showToast('No estás conectado al WebSocket', 'error');
      return;
    }
    socketRef.current.emit('companion:power', { powerType: powerName });
    showToast(`Habilidad de Compañero activada: ${powerName}`, 'success');
  };

  // Spawn Simulated Bot Player
  const spawnSimulatedBot = async () => {
    try {
      const botName = `Bot_Cozy_${Math.floor(Math.random() * 900 + 100)}`;
      // Register temporary bot account
      const regRes = await fetch('/api/v1/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: botName.toLowerCase(),
          displayName: botName,
          email: `${botName.toLowerCase()}@bot.cozyleap.com`,
          password: 'CozyLeap123!',
        }),
      });
      const regData = await regRes.json();
      const botToken = regData?.data?.accessToken;
      if (!botToken) {
        showToast('No se pudo registrar bot', 'error');
        return;
      }

      // Connect separate bot socket
      const botSocket = io({
        auth: { token: botToken },
        transports: ['websocket', 'polling'],
      });

      botSocket.on('connect', () => {
        botSocket.emit('room:join', { levelId });
        showToast(`Bot ${botName} conectado e ingresado a Sala ${levelId}`, 'success');
      });

      // Bot movement loop
      let botX = (Math.random() - 0.5) * 8;
      let botZ = (Math.random() - 0.5) * 8;
      let angle = Math.random() * Math.PI * 2;

      const botInterval = setInterval(() => {
        if (!botSocket.connected) {
          clearInterval(botInterval);
          return;
        }
        angle += (Math.random() - 0.5) * 0.4;
        botX += Math.cos(angle) * 0.15;
        botZ += Math.sin(angle) * 0.15;
        if (Math.abs(botX) > 8) botX = Math.sign(botX) * 7.5;
        if (Math.abs(botZ) > 8) botZ = Math.sign(botZ) * 7.5;

        botSocket.emit('player:sync', {
          x: Number(botX.toFixed(2)),
          y: 1.0,
          z: Number(botZ.toFixed(2)),
          yaw: angle,
          anim: 'run',
        });
      }, 50);

      // Periodically trigger bot power
      const botPowerInterval = setInterval(() => {
        if (!botSocket.connected) {
          clearInterval(botPowerInterval);
          return;
        }
        botSocket.emit('companion:power', { powerType: 'Destello Estelar Bot' });
      }, 12000);

      setSimulatedBots((prev) => [...prev, botSocket]);
    } catch (err: any) {
      showToast(`Error al crear bot: ${err.message}`, 'error');
    }
  };

  const removeAllBots = () => {
    simulatedBots.forEach((b) => b.disconnect());
    setSimulatedBots([]);
    showToast('Bots desconectados', 'info');
  };

  // Render 2D/2.5D Canvas of the Arena
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;

    const render = () => {
      const width = canvas.width;
      const height = canvas.height;

      // Clear Canvas
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(0, 0, width, height);

      // Draw Island Ground with level theme
      const centerX = width / 2;
      const centerY = height / 2;
      const arenaRadius = Math.min(width, height) * 0.42;

      // Island Glow
      const grad = ctx.createRadialGradient(centerX, centerY, arenaRadius * 0.2, centerX, centerY, arenaRadius);
      if (levelId === 1) {
        grad.addColorStop(0, '#10b981');
        grad.addColorStop(0.7, '#047857');
        grad.addColorStop(1, '#064e3b');
      } else if (levelId === 2) {
        grad.addColorStop(0, '#38bdf8');
        grad.addColorStop(0.7, '#0284c7');
        grad.addColorStop(1, '#0369a1');
      } else {
        grad.addColorStop(0, '#a855f7');
        grad.addColorStop(0.7, '#7e22ce');
        grad.addColorStop(1, '#581c87');
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(centerX, centerY, arenaRadius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#ffffff33';
      ctx.stroke();

      // Draw Grid Lines on island
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.lineWidth = 1;
      for (let i = -arenaRadius; i <= arenaRadius; i += 30) {
        ctx.beginPath();
        ctx.moveTo(centerX + i, centerY - Math.sqrt(Math.max(0, arenaRadius * arenaRadius - i * i)));
        ctx.lineTo(centerX + i, centerY + Math.sqrt(Math.max(0, arenaRadius * arenaRadius - i * i)));
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(centerX - Math.sqrt(Math.max(0, arenaRadius * arenaRadius - i * i)), centerY + i);
        ctx.lineTo(centerX + Math.sqrt(Math.max(0, arenaRadius * arenaRadius - i * i)), centerY + i);
        ctx.stroke();
      }

      // Helper to map 3D world coords (X: -10..10, Z: -10..10) to 2D canvas pixels
      const worldToCanvas = (wx: number, wz: number) => {
        const scale = (arenaRadius * 0.85) / 10;
        return {
          cx: centerX + wx * scale,
          cy: centerY + wz * scale,
        };
      };

      // Draw Goal / Portal in center
      ctx.beginPath();
      ctx.arc(centerX, centerY, 16, 0, Math.PI * 2);
      ctx.fillStyle = '#fbbf24';
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = '#1e293b';
      ctx.font = 'bold 9px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('META', centerX, centerY + 3);

      // Draw Remote Players
      remotePlayers.forEach((player) => {
        const { cx, cy } = worldToCanvas(player.x, player.z);

        // Player shadow
        ctx.beginPath();
        ctx.ellipse(cx, cy + 10, 12, 6, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fill();

        // Player Avatar Body
        const shirtColor = player.appearance?.shirtColor || '#ec4899';
        ctx.beginPath();
        ctx.arc(cx, cy, 11, 0, Math.PI * 2);
        ctx.fillStyle = shirtColor;
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Companion floating orb
        const companionColor = '#38bdf8';
        const bob = Math.sin(Date.now() / 250) * 3;
        ctx.beginPath();
        ctx.arc(cx + 14, cy - 8 + bob, 5, 0, Math.PI * 2);
        ctx.fillStyle = companionColor;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Player Name Tag
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(player.username, cx, cy - 16);

        // State indicator
        if (player.anim === 'jump') {
          ctx.fillStyle = '#fbbf24';
          ctx.fillText('⚡ ¡Salto!', cx, cy - 28);
        }
      });

      // Draw Local Player
      if (currentUser) {
        const { cx, cy } = worldToCanvas(myPos.x, myPos.z);

        // Shadow
        ctx.beginPath();
        ctx.ellipse(cx, cy + (myPos.anim === 'jump' ? 18 : 10), 14, 7, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.4)';
        ctx.fill();

        // Glow ring for self
        ctx.beginPath();
        ctx.arc(cx, cy - (myPos.anim === 'jump' ? 10 : 0), 16, 0, Math.PI * 2);
        ctx.strokeStyle = '#4f46e5';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Body
        const shirtColor = userAppearance?.shirtColor || '#4f46e5';
        ctx.beginPath();
        ctx.arc(cx, cy - (myPos.anim === 'jump' ? 10 : 0), 12, 0, Math.PI * 2);
        ctx.fillStyle = shirtColor;
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Companion
        const companionBob = Math.sin(Date.now() / 200) * 4;
        ctx.beginPath();
        ctx.arc(cx + 16, cy - 10 + companionBob - (myPos.anim === 'jump' ? 10 : 0), 6, 0, Math.PI * 2);
        ctx.fillStyle = '#a855f7';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Name tag
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 12px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(`★ ${currentUser.displayName} (Tú)`, cx, cy - 22 - (myPos.anim === 'jump' ? 10 : 0));

        if (myPos.anim === 'jump') {
          ctx.fillStyle = '#f59e0b';
          ctx.fillText('SALTO', cx, cy - 36);
        }
      }

      ctx.restore();
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [remotePlayers, myPos, currentUser, levelId, userAppearance]);

  return (
    <div className="space-y-6">
      {/* Top Banner / Controls */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
                <Radio className="w-6 h-6 animate-pulse" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight flex items-center space-x-2">
                  <span>Sala Multijugador en Tiempo Real</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-semibold border border-emerald-500/30">
                    WebSocket Activo
                  </span>
                </h2>
                <p className="text-xs sm:text-sm text-slate-400">
                  Sincronización bidireccional a 25Hz mediante Socket.io (Handshake con JWT + Broadcast por Sala de Nivel).
                </p>
              </div>
            </div>
          </div>

          {/* Level Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-semibold text-slate-400 mr-1">Seleccionar Isla:</span>
            {[
              { id: 1, name: 'Isla Verde' },
              { id: 2, name: 'Cumbres Nubladas' },
              { id: 3, name: 'Templo Astral' },
            ].map((lvl) => (
              <button
                key={lvl.id}
                onClick={() => handleChangeLevel(lvl.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
                  levelId === lvl.id
                    ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700 hover:text-white border border-slate-700'
                }`}
              >
                <span>Nivel {lvl.id}:</span>
                <span>{lvl.name}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Telemetry bar */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-800/80">
          <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
            <p className="text-[10px] text-slate-400 font-medium">Estado Conexión</p>
            <p className="text-sm font-bold text-white flex items-center space-x-1.5">
              <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400' : 'bg-red-400'}`}></span>
              <span>{isConnected ? 'Sincronizado' : 'Desconectado'}</span>
            </p>
          </div>
          <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
            <p className="text-[10px] text-slate-400 font-medium">Jugadores en la Isla</p>
            <p className="text-sm font-bold text-indigo-400 flex items-center space-x-1">
              <Users className="w-4 h-4" />
              <span>{(currentUser ? 1 : 0) + remotePlayers.size} Jugadores</span>
            </p>
          </div>
          <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
            <p className="text-[10px] text-slate-400 font-medium">Latencia WS (Ping)</p>
            <p className="text-sm font-bold text-emerald-400 flex items-center space-x-1">
              <Wifi className="w-4 h-4" />
              <span>{ping > 0 ? `${ping} ms` : '< 5 ms'}</span>
            </p>
          </div>
          <div className="bg-slate-800/60 p-2.5 rounded-xl border border-slate-700/60">
            <p className="text-[10px] text-slate-400 font-medium">Paquetes Enviados / Recibidos</p>
            <p className="text-sm font-bold text-amber-400">
              {packetsSent} ↑ / {packetsReceived} ↓
            </p>
          </div>
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: 2D Radar Canvas & Controls */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-4 sm:p-6 shadow-xl flex flex-col items-center">
          <div className="w-full flex justify-between items-center mb-3">
            <div className="flex items-center space-x-2">
              <Compass className="w-4 h-4 text-indigo-400" />
              <span className="text-xs font-bold text-slate-300">
                Radar de Sala: level_{levelId} (Usa W, A, S, D / Flechas y Espacio)
              </span>
            </div>
            <div className="text-xs text-slate-400">
              Coordenadas: ({myPos.x.toFixed(1)}, {myPos.y.toFixed(1)}, {myPos.z.toFixed(1)})
            </div>
          </div>

          {/* Canvas Area */}
          <div className="relative w-full max-w-[540px] aspect-square rounded-2xl overflow-hidden border border-slate-700 bg-slate-950 shadow-inner flex items-center justify-center">
            <canvas
              ref={canvasRef}
              width={540}
              height={540}
              className="w-full h-full cursor-crosshair"
            />
            {!currentUser && (
              <div className="absolute inset-0 bg-black/75 backdrop-blur-xs flex flex-col items-center justify-center p-6 text-center">
                <Shield className="w-10 h-10 text-indigo-400 mb-2" />
                <h4 className="text-white font-bold text-base mb-1">Acceso Requiere Autenticación</h4>
                <p className="text-xs text-slate-400 mb-4 max-w-xs">
                  Inicia sesión o selecciona una cuenta demo en la barra superior para unirte a la sala multijugador.
                </p>
              </div>
            )}
          </div>

          {/* On-screen Movement & Companion Power Bar */}
          <div className="w-full mt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* Companion Powers */}
            <div className="flex items-center space-x-2">
              <span className="text-xs font-semibold text-slate-400">Poder de Compañero:</span>
              <button
                onClick={() => triggerCompanionPower('Pulso de Luz')}
                className="px-2.5 py-1.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-lg text-xs font-bold transition flex items-center space-x-1"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>Pulso</span>
              </button>
              <button
                onClick={() => triggerCompanionPower('Ráfaga Estelar')}
                className="px-2.5 py-1.5 bg-purple-500/20 hover:bg-purple-500/30 text-purple-300 border border-purple-500/40 rounded-lg text-xs font-bold transition flex items-center space-x-1"
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Estelar</span>
              </button>
              <button
                onClick={() => triggerCompanionPower('Escudo Floral')}
                className="px-2.5 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 rounded-lg text-xs font-bold transition flex items-center space-x-1"
              >
                <Shield className="w-3.5 h-3.5" />
                <span>Escudo</span>
              </button>
            </div>

            {/* Test Bot Spawner */}
            <div className="flex items-center space-x-2">
              <button
                onClick={spawnSimulatedBot}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold shadow-md shadow-indigo-600/30 transition flex items-center space-x-1"
              >
                <Bot className="w-3.5 h-3.5" />
                <span>+ Generar Bot de Prueba</span>
              </button>
              {simulatedBots.length > 0 && (
                <button
                  onClick={removeAllBots}
                  className="px-2.5 py-1.5 bg-slate-800 hover:bg-red-900/40 text-red-400 border border-slate-700 rounded-lg text-xs font-semibold transition"
                >
                  Limpiar ({simulatedBots.length})
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Right Col: Live Players List & Event Log */}
        <div className="space-y-6">
          {/* Active Players in Room */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center justify-between">
              <span className="flex items-center space-x-2">
                <Users className="w-4 h-4 text-indigo-400" />
                <span>Jugadores en la Sala ({remotePlayers.size + (currentUser ? 1 : 0)})</span>
              </span>
              <span className="text-[11px] text-slate-500 font-mono">level_{levelId}</span>
            </h3>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
              {currentUser && (
                <div className="p-2.5 bg-indigo-950/40 border border-indigo-500/40 rounded-xl flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: userAppearance?.shirtColor || '#4f46e5' }}
                    >
                      {currentUser.displayName.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">{currentUser.displayName} (Tú)</p>
                      <p className="text-[10px] text-indigo-300 font-mono">
                        X: {myPos.x.toFixed(1)} Z: {myPos.z.toFixed(1)} | {myPos.anim}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/30 text-indigo-300 font-bold">
                    Local
                  </span>
                </div>
              )}

              {Array.from(remotePlayers.values()).map((p) => (
                <div key={p.userId} className="p-2.5 bg-slate-800/80 border border-slate-700 rounded-xl flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
                      style={{ backgroundColor: p.appearance?.shirtColor || '#ec4899' }}
                    >
                      {p.username.charAt(0)}
                    </div>
                    <div>
                      <p className="text-xs font-bold text-white">{p.username}</p>
                      <p className="text-[10px] text-slate-400 font-mono">
                        X: {p.x.toFixed(1)} Z: {p.z.toFixed(1)} | {p.anim}
                      </p>
                    </div>
                  </div>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 font-medium">
                    Remoto
                  </span>
                </div>
              ))}

              {!currentUser && remotePlayers.size === 0 && (
                <p className="text-xs text-slate-500 text-center py-4">No hay jugadores conectados en esta sala.</p>
              )}
            </div>
          </div>

          {/* Real-time Companion Powers Stream */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl">
            <h3 className="text-sm font-bold text-white mb-3 flex items-center space-x-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>Habilidades de Compañero Emitidas</span>
            </h3>

            <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
              {powersLog.length === 0 ? (
                <p className="text-xs text-slate-500 text-center py-4">
                  Presiona los botones de poderes para emitir eventos a la sala.
                </p>
              ) : (
                powersLog.map((log) => (
                  <div key={log.id} className="p-2 bg-slate-800/50 border border-slate-700/60 rounded-lg flex items-center justify-between text-xs">
                    <span className="text-slate-300 font-medium">
                      <span className="text-amber-400 font-bold">{log.user}</span> usó{' '}
                      <span className="text-indigo-300">{log.power}</span>
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">{log.time}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
