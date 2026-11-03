import React, { useState, useEffect } from 'react';
import { Navbar } from './components/Navbar';
import { MultiplayerArena } from './components/MultiplayerArena';
import { ApiExplorer } from './components/ApiExplorer';
import { CharacterStudio } from './components/CharacterStudio';
import { LevelAntiCheatSandbox } from './components/LevelAntiCheatSandbox';
import { RedisInspector } from './components/RedisInspector';
import { CharacterAppearance, InventoryStatus, PlayerProgress, User } from './types';
import { GameApiClient } from './api';

interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
}

const DEFAULT_APP: CharacterAppearance = {
  bodyType: 'chico',
  skinColor: '#f8d5b8',
  hairStyle: 'cozy_messy',
  hairColor: '#4a2e18',
  eyesStyle: 'bright_round',
  eyesColor: '#2b5c8f',
  shirtStyle: 'hoodie',
  shirtColor: '#4f46e5',
  pantsStyle: 'joggers',
  pantsColor: '#1e293b',
  shoesColor: '#f97316',
  hat: 'beanie_cozy',
  glasses: 'none',
  backpack: 'explorer_pack',
  companion: 'nube',
};

const DEFAULT_INV: InventoryStatus = {
  slots: ['baya', 'nuez', null, null, 'llave'],
};

const DEFAULT_PROG: PlayerProgress = {
  maxUnlockedLevel: 1,
  completedLevels: [],
  totalCollectiblesFound: 0,
  unlockedCompanions: ['nube'],
};

export default function App() {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userToken, setUserToken] = useState<string | null>(GameApiClient.getToken());
  const [activeTab, setActiveTab] = useState<string>('arena');
  const [serverHealth, setServerHealth] = useState<any>(null);
  const [appearance, setAppearance] = useState<CharacterAppearance>(DEFAULT_APP);
  const [inventory, setInventory] = useState<InventoryStatus>(DEFAULT_INV);
  const [progress, setProgress] = useState<PlayerProgress>(DEFAULT_PROG);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const fetchProfile = async () => {
    const res = await GameApiClient.request('/api/v1/player/me');
    if (res.ok && res.data.data) {
      setCurrentUser(res.data.data.user);
      setAppearance(res.data.data.appearance);
      setInventory(res.data.data.inventory);
      setProgress(res.data.data.progress);
    }
  };

  const fetchHealth = async () => {
    const res = await GameApiClient.request('/api/v1/system/health');
    if (res.ok) {
      setServerHealth(res.data);
    }
  };

  // Initial bootstrap: check health and auto-login as demo account if no session
  useEffect(() => {
    fetchHealth();

    const initAuth = async () => {
      const token = GameApiClient.getToken();
      if (token) {
        const res = await GameApiClient.request('/api/v1/player/me');
        if (res.ok && res.data.data) {
          setCurrentUser(res.data.data.user);
          setAppearance(res.data.data.appearance);
          setInventory(res.data.data.inventory);
          setProgress(res.data.data.progress);
          setUserToken(token);
          return;
        }
      }

      // Auto login with default demo account: pionero@cozyleap.com
      const loginRes = await GameApiClient.request('/api/v1/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email: 'pionero@cozyleap.com', password: 'CozyLeap123!' }),
      });
      if (loginRes.ok && loginRes.data.data) {
        GameApiClient.setToken(loginRes.data.data.accessToken);
        GameApiClient.setRefreshToken(loginRes.data.data.refreshToken);
        setUserToken(loginRes.data.data.accessToken);
        setCurrentUser(loginRes.data.data.user);
        await fetchProfile();
      }
    };

    initAuth();
  }, []);

  const handleUserChange = (user: User | null, token: string | null) => {
    setCurrentUser(user);
    setUserToken(token);
    if (user && token) {
      fetchProfile();
    } else {
      setAppearance(DEFAULT_APP);
      setInventory(DEFAULT_INV);
      setProgress(DEFAULT_PROG);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-500 selection:text-white">
      {/* Navigation & Header */}
      <Navbar
        currentUser={currentUser}
        onUserChange={handleUserChange}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        serverHealth={serverHealth}
        showToast={showToast}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {activeTab === 'arena' && (
          <MultiplayerArena
            currentUser={currentUser}
            userToken={userToken}
            userAppearance={appearance}
            showToast={showToast}
          />
        )}

        {activeTab === 'api' && <ApiExplorer showToast={showToast} />}

        {activeTab === 'character' && (
          <CharacterStudio
            currentUser={currentUser}
            appearance={appearance}
            inventory={inventory}
            onUpdateAppearance={setAppearance}
            onUpdateInventory={setInventory}
            showToast={showToast}
          />
        )}

        {activeTab === 'anti-cheat' && (
          <LevelAntiCheatSandbox
            currentUser={currentUser}
            progress={progress}
            onRefreshProgress={fetchProfile}
            showToast={showToast}
          />
        )}

        {activeTab === 'redis' && <RedisInspector showToast={showToast} />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950 py-4 px-6 text-center text-xs text-slate-500">
        <p>
          Cozy Leap Online Backend • Node.js (LTS) & TypeScript • Express REST API • Socket.io 25Hz • Redis Session & Leaderboards • JWT Argon2/bcrypt
        </p>
      </footer>

      {/* Toast Notification Container */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col space-y-2 pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto px-4 py-3 rounded-xl shadow-2xl border text-xs font-semibold flex items-center space-x-2 animate-in slide-in-from-bottom-2 ${
              toast.type === 'success'
                ? 'bg-emerald-950/90 text-emerald-300 border-emerald-500/40 shadow-emerald-950/50'
                : toast.type === 'error'
                ? 'bg-red-950/90 text-red-300 border-red-500/40 shadow-red-950/50'
                : 'bg-slate-900/90 text-indigo-300 border-indigo-500/40 shadow-indigo-950/50'
            }`}
          >
            <span>{toast.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
