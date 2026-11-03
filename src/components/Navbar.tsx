import React, { useState } from 'react';
import { ShieldCheck, UserCheck, RefreshCw, LogOut, KeyRound, Sparkles, Server, Activity } from 'lucide-react';
import { User } from '../types';
import { GameApiClient } from '../api';

interface NavbarProps {
  currentUser: User | null;
  onUserChange: (user: User | null, token: string | null) => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  serverHealth: any;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentUser,
  onUserChange,
  activeTab,
  setActiveTab,
  serverHealth,
  showToast,
}) => {
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('CozyLeap123!');
  const [username, setUsername] = useState('');
  const [loading, setLoading] = useState(false);

  const handleQuickLogin = async (presetEmail: string) => {
    setLoading(true);
    const res = await GameApiClient.request('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email: presetEmail, password: 'CozyLeap123!' }),
    });
    setLoading(false);

    if (res.ok && res.data.data) {
      GameApiClient.setToken(res.data.data.accessToken);
      GameApiClient.setRefreshToken(res.data.data.refreshToken);
      onUserChange(res.data.data.user, res.data.data.accessToken);
      showToast(`¡Conectado como ${res.data.data.user.displayName}!`, 'success');
      setShowLoginModal(false);
    } else {
      showToast(res.data.message || 'Error al iniciar sesión', 'error');
    }
  };

  const handleSubmitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const endpoint = isRegistering ? '/api/v1/auth/register' : '/api/v1/auth/login';
    const payload = isRegistering
      ? { username, email, password }
      : { email, password };

    const res = await GameApiClient.request(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setLoading(false);

    if (res.ok && res.data.data) {
      GameApiClient.setToken(res.data.data.accessToken);
      GameApiClient.setRefreshToken(res.data.data.refreshToken);
      onUserChange(res.data.data.user, res.data.data.accessToken);
      showToast(isRegistering ? '¡Cuenta creada y sesión iniciada!' : '¡Inicio de sesión exitoso!', 'success');
      setShowLoginModal(false);
    } else {
      showToast(res.data.message || 'Error en la autenticación', 'error');
    }
  };

  const handleRefreshToken = async () => {
    const refreshToken = GameApiClient.getRefreshToken();
    const res = await GameApiClient.request('/api/v1/auth/refresh', {
      method: 'POST',
      body: JSON.stringify({ refreshToken }),
    });

    if (res.ok && res.data.data) {
      GameApiClient.setToken(res.data.data.accessToken);
      GameApiClient.setRefreshToken(res.data.data.refreshToken);
      showToast('JWT Access Token renovado silenciosamente en Redis (15 min)', 'success');
    } else {
      showToast(res.data.message || 'No se pudo renovar token', 'error');
    }
  };

  const handleLogout = async () => {
    const refreshToken = GameApiClient.getRefreshToken();
    await GameApiClient.request('/api/v1/auth/logout', {
      method: 'POST',
      body: JSON.stringify({ refreshToken, userId: currentUser?._id }),
    });
    GameApiClient.setToken(null);
    GameApiClient.setRefreshToken(null);
    onUserChange(null, null);
    showToast('Sesión cerrada y revocada en Redis', 'info');
  };

  const navItems = [
    { id: 'arena', label: 'Mundo Online 3D/2D' },
    { id: 'api', label: 'REST API Explorer' },
    { id: 'character', label: 'Personaje & Mochila' },
    { id: 'anti-cheat', label: 'Anti-Cheat & Récords' },
    { id: 'redis', label: 'Inspector Redis & Eventos' },
  ];

  return (
    <header className="bg-slate-900 border-b border-slate-800 sticky top-0 z-50 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Status */}
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 via-teal-500 to-indigo-600 flex items-center justify-center shadow-md shadow-emerald-500/20 text-white font-bold text-xl">
              CL
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="font-extrabold text-white text-lg tracking-tight">Cozy Leap</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400 font-medium border border-emerald-500/30">
                  Backend Online
                </span>
              </div>
              <div className="flex items-center space-x-2 text-xs text-slate-400">
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>WS 25Hz</span>
                <span>•</span>
                <span>Express + Mongo & Redis Store</span>
              </div>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex space-x-1">
            {navItems.map((item) => {
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={`px-3 py-2 text-sm font-semibold rounded-lg transition-all ${
                    active
                      ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* User Auth Section */}
          <div className="flex items-center space-x-2">
            {currentUser ? (
              <div className="flex items-center space-x-2">
                <div className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 flex items-center space-x-2">
                  <div className="w-6 h-6 rounded-full bg-indigo-500 text-white flex items-center justify-center text-xs font-bold">
                    {currentUser.displayName.charAt(0)}
                  </div>
                  <div className="text-left hidden sm:block">
                    <p className="text-xs font-semibold text-white leading-none">{currentUser.displayName}</p>
                    <p className="text-[10px] text-emerald-400 leading-none mt-1 capitalize">{currentUser.role}</p>
                  </div>
                </div>

                <button
                  onClick={handleRefreshToken}
                  title="Renovar token JWT silenciosamente (Refresh Token)"
                  className="p-2 text-slate-400 hover:text-indigo-400 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>

                <button
                  onClick={handleLogout}
                  title="Cerrar sesión"
                  className="p-2 text-slate-400 hover:text-red-400 bg-slate-800 hover:bg-slate-700 rounded-lg border border-slate-700 transition"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowLoginModal(true)}
                className="bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow-md shadow-indigo-600/30 flex items-center space-x-2 transition"
              >
                <KeyRound className="w-4 h-4" />
                <span>Iniciar Sesión</span>
              </button>
            )}
          </div>
        </div>

        {/* Mobile Navigation */}
        <div className="md:hidden flex space-x-1 pb-3 overflow-x-auto">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg whitespace-nowrap ${
                activeTab === item.id ? 'bg-indigo-600 text-white' : 'text-slate-300 bg-slate-800'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      {/* Login / Switch Account Modal */}
      {showLoginModal && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl animate-in fade-in zoom-in-95">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white flex items-center space-x-2">
                <KeyRound className="w-5 h-5 text-indigo-400" />
                <span>{isRegistering ? 'Crear Cuenta de Jugador' : 'Autenticación de Jugador'}</span>
              </h3>
              <button
                onClick={() => setShowLoginModal(false)}
                className="text-slate-400 hover:text-white text-sm p-1"
              >
                ✕
              </button>
            </div>

            {/* Quick Demo Logins */}
            <div className="mb-4 bg-slate-800/80 rounded-xl p-3 border border-slate-700">
              <p className="text-xs font-semibold text-slate-300 mb-2 flex items-center space-x-1">
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                <span>Cuentas de Prueba Pre-configuradas:</span>
              </p>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleQuickLogin('pionero@cozyleap.com')}
                  disabled={loading}
                  className="bg-slate-700 hover:bg-slate-600 p-2 rounded-lg text-left border border-slate-600 transition"
                >
                  <p className="text-xs font-bold text-white truncate">Pionero Cozy</p>
                  <p className="text-[10px] text-emerald-400">Admin (Nivel 4)</p>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickLogin('saltarin@cozyleap.com')}
                  disabled={loading}
                  className="bg-slate-700 hover:bg-slate-600 p-2 rounded-lg text-left border border-slate-600 transition"
                >
                  <p className="text-xs font-bold text-white truncate">Saltarín 99</p>
                  <p className="text-[10px] text-indigo-400">Player (Nivel 3)</p>
                </button>
                <button
                  type="button"
                  onClick={() => handleQuickLogin('luna@cozyleap.com')}
                  disabled={loading}
                  className="bg-slate-700 hover:bg-slate-600 p-2 rounded-lg text-left border border-slate-600 transition"
                >
                  <p className="text-xs font-bold text-white truncate">Luna Gamer</p>
                  <p className="text-[10px] text-purple-400">Player (Nivel 2)</p>
                </button>
              </div>
            </div>

            {/* Custom Form */}
            <form onSubmit={handleSubmitAuth} className="space-y-3">
              {isRegistering && (
                <div>
                  <label className="text-xs font-medium text-slate-300 block mb-1">Nombre de Usuario</label>
                  <input
                    type="text"
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="ej. saltarin_pro"
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Correo Electrónico</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ej. jugador@cozyleap.com"
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-slate-300 block mb-1">Contraseña (Mín. 8 caracteres, Mayúscula, Minúscula, Número)</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-indigo-600 hover:bg-indigo-500 text-white font-semibold py-2.5 rounded-lg transition shadow-md shadow-indigo-600/30 text-sm mt-2 disabled:opacity-50"
              >
                {loading ? 'Procesando...' : isRegistering ? 'Crear Cuenta y Token' : 'Ingresar al Juego'}
              </button>

              <div className="text-center pt-2">
                <button
                  type="button"
                  onClick={() => setIsRegistering(!isRegistering)}
                  className="text-xs text-indigo-400 hover:text-indigo-300 underline"
                >
                  {isRegistering ? '¿Ya tienes cuenta? Inicia sesión aquí' : '¿No tienes cuenta? Regístrate aquí'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </header>
  );
};
