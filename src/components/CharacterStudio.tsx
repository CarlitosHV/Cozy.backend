import React, { useState, useEffect } from 'react';
import { Sparkles, Backpack, Save, CheckCircle, RefreshCw, Shirt, UserCheck } from 'lucide-react';
import { CharacterAppearance, CompanionType, InventoryItemType, InventoryStatus, User } from '../types';
import { GameApiClient } from '../api';

interface CharacterStudioProps {
  currentUser: User | null;
  appearance: CharacterAppearance;
  inventory: InventoryStatus;
  onUpdateAppearance: (app: CharacterAppearance) => void;
  onUpdateInventory: (inv: InventoryStatus) => void;
  showToast: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const COMPANIONS: Array<{ id: CompanionType; name: string; color: string; desc: string }> = [
  { id: 'nube', name: 'Nube Esponjosa', color: '#93c5fd', desc: 'Flota suavemente y reduce caídas.' },
  { id: 'estrella', name: 'Estrella Fugaz', color: '#facc15', desc: 'Destella impulsando saltos dobles.' },
  { id: 'luciernaga', name: 'Luciérnaga Solar', color: '#4ade80', desc: 'Ilumina cuevas oscuras y caminos.' },
  { id: 'catarina', name: 'Catarina de la Suerte', color: '#f87171', desc: 'Aumenta aparición de bayas doradas.' },
  { id: 'hada', name: 'Hada de Bosque', color: '#c084fc', desc: 'Otorga planeo mágico por 2 segundos.' },
  { id: 'serpiente', name: 'Serpiente Alada', color: '#2dd4bf', desc: 'Acelera la velocidad de carrera.' },
];

export const CharacterStudio: React.FC<CharacterStudioProps> = ({
  currentUser,
  appearance,
  inventory,
  onUpdateAppearance,
  onUpdateInventory,
  showToast,
}) => {
  const [localApp, setLocalApp] = useState<CharacterAppearance>(appearance);
  const [localInv, setLocalInv] = useState<InventoryStatus>(inventory);
  const [isSavingApp, setIsSavingApp] = useState(false);
  const [isSavingInv, setIsSavingInv] = useState(false);

  useEffect(() => {
    setLocalApp(appearance);
  }, [appearance]);

  useEffect(() => {
    setLocalInv(inventory);
  }, [inventory]);

  const handleSaveAppearance = async () => {
    if (!currentUser) {
      showToast('Debes iniciar sesión para guardar en la base de datos', 'error');
      return;
    }
    setIsSavingApp(true);
    const res = await GameApiClient.request('/api/v1/player/appearance', {
      method: 'PUT',
      body: JSON.stringify(localApp),
    });
    setIsSavingApp(false);

    if (res.ok && res.data.data?.appearance) {
      onUpdateAppearance(res.data.data.appearance);
      showToast('¡Apariencia sincronizada y guardada en MongoDB backend!', 'success');
    } else {
      showToast(res.data.message || 'Error al guardar apariencia', 'error');
    }
  };

  const handleSaveInventory = async () => {
    if (!currentUser) {
      showToast('Debes iniciar sesión para guardar en la base de datos', 'error');
      return;
    }
    setIsSavingInv(true);
    const res = await GameApiClient.request('/api/v1/player/inventory', {
      method: 'PUT',
      body: JSON.stringify(localInv),
    });
    setIsSavingInv(false);

    if (res.ok && res.data.data?.inventory) {
      onUpdateInventory(res.data.data.inventory);
      showToast('¡Mochila de 5 slots actualizada en la base de datos!', 'success');
    } else {
      showToast(res.data.message || 'Error al guardar inventario', 'error');
    }
  };

  const cycleSlot = (index: number) => {
    const cycle: InventoryItemType[] = ['baya', 'nuez', 'llave', null];
    const current = localInv.slots[index];
    const currentIdx = cycle.indexOf(current);
    const nextItem = cycle[(currentIdx + 1) % cycle.length];

    const newSlots = [...localInv.slots] as InventoryStatus['slots'];
    newSlots[index] = nextItem;
    setLocalInv({ slots: newSlots });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
        <h2 className="text-xl font-bold text-white flex items-center space-x-2">
          <Shirt className="w-5 h-5 text-indigo-400" />
          <span>Personalización de Personaje & Mochila</span>
        </h2>
        <p className="text-xs sm:text-sm text-slate-400 mt-1">
          Modifica tu avatar 3D y los 5 espacios de inventario. Los cambios se persisten de forma segura en la colección MongoDB <code>player_profiles</code>.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: 2D Live Preview Avatar Card */}
        <div className="lg:col-span-4 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl flex flex-col items-center justify-between text-center">
          <div className="w-full">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-4">
              Vista Previa de Render
            </span>

            {/* Visual Avatar SVG/Canvas box */}
            <div className="w-56 h-64 mx-auto relative rounded-2xl bg-gradient-to-b from-slate-800 to-slate-950 border border-slate-700 shadow-inner flex items-center justify-center overflow-hidden">
              {/* Floor Shadow */}
              <div className="absolute bottom-6 w-32 h-6 bg-black/40 rounded-full blur-xs"></div>

              {/* Character Illustration SVG */}
              <div className="relative z-10 flex flex-col items-center">
                {/* Hat */}
                {localApp.hat !== 'none' && (
                  <div
                    className="w-16 h-5 rounded-t-full -mb-2 z-20 shadow-md border-t border-white/20"
                    style={{ backgroundColor: localApp.shirtColor }}
                  ></div>
                )}

                {/* Hair */}
                <div
                  className="w-18 h-10 rounded-t-2xl z-10 shadow-sm"
                  style={{ backgroundColor: localApp.hairColor }}
                ></div>

                {/* Head */}
                <div
                  className="w-14 h-12 rounded-xl -mt-4 flex items-center justify-center space-x-2 relative shadow-md"
                  style={{ backgroundColor: localApp.skinColor }}
                >
                  {/* Eyes */}
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: localApp.eyesColor }}></div>
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: localApp.eyesColor }}></div>
                </div>

                {/* Shirt & Body */}
                <div
                  className="w-16 h-14 rounded-xl mt-1 shadow-md flex items-center justify-center border-t border-white/20"
                  style={{ backgroundColor: localApp.shirtColor }}
                >
                  <span className="text-[10px] text-white/70 font-bold uppercase">{localApp.bodyType}</span>
                </div>

                {/* Pants */}
                <div
                  className="w-14 h-10 rounded-b-lg flex justify-between px-1"
                  style={{ backgroundColor: localApp.pantsColor }}
                >
                  <div className="w-5 h-full border-r border-black/20"></div>
                  <div className="w-5 h-full"></div>
                </div>

                {/* Shoes */}
                <div className="w-16 flex justify-between px-0.5 mt-0.5">
                  <div className="w-6 h-3 rounded-full" style={{ backgroundColor: localApp.shoesColor }}></div>
                  <div className="w-6 h-3 rounded-full" style={{ backgroundColor: localApp.shoesColor }}></div>
                </div>
              </div>

              {/* Floating Companion Orb */}
              <div className="absolute top-8 right-6 flex flex-col items-center animate-bounce">
                <div
                  className="w-9 h-9 rounded-full shadow-lg shadow-sky-500/30 flex items-center justify-center text-xs text-white font-bold border border-white/40"
                  style={{
                    backgroundColor:
                      COMPANIONS.find((c) => c.id === localApp.companion)?.color || '#38bdf8',
                  }}
                >
                  ✨
                </div>
                <span className="text-[9px] font-bold text-white bg-slate-900/80 px-1.5 py-0.5 rounded-full mt-1 capitalize">
                  {localApp.companion}
                </span>
              </div>
            </div>

            <div className="mt-4">
              <h3 className="text-base font-bold text-white">
                {currentUser?.displayName || 'Explorador Cozy'}
              </h3>
              <p className="text-xs text-slate-400 capitalize">
                {localApp.bodyType} • Estilo: {localApp.hairStyle}
              </p>
            </div>
          </div>

          <button
            onClick={handleSaveAppearance}
            disabled={isSavingApp}
            className="w-full mt-6 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-indigo-600/30 flex items-center justify-center space-x-2 transition"
          >
            {isSavingApp ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>Guardar Apariencia en Backend</span>
          </button>
        </div>

        {/* Right: Appearance Customizer & Inventory Controls */}
        <div className="lg:col-span-8 space-y-6">
          {/* Appearance Customizer Form */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-5">
            <h3 className="text-sm font-bold text-white flex items-center space-x-2 border-b border-slate-800 pb-3">
              <Sparkles className="w-4 h-4 text-indigo-400" />
              <span>Personalización Visual (CharacterAppearance)</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
              {/* Body Type */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Tipo de Cuerpo</label>
                <select
                  value={localApp.bodyType}
                  onChange={(e) => setLocalApp({ ...localApp, bodyType: e.target.value as any })}
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-indigo-500"
                >
                  <option value="chico">Chico</option>
                  <option value="chica">Chica</option>
                </select>
              </div>

              {/* Skin Color */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Tono de Piel</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={localApp.skinColor}
                    onChange={(e) => setLocalApp({ ...localApp, skinColor: e.target.value })}
                    className="w-8 h-8 rounded border-0 cursor-pointer bg-transparent"
                  />
                  <input
                    type="text"
                    value={localApp.skinColor}
                    onChange={(e) => setLocalApp({ ...localApp, skinColor: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              </div>

              {/* Hair Color */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Color de Cabello</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={localApp.hairColor}
                    onChange={(e) => setLocalApp({ ...localApp, hairColor: e.target.value })}
                    className="w-8 h-8 rounded border-0 cursor-pointer bg-transparent"
                  />
                  <input
                    type="text"
                    value={localApp.hairColor}
                    onChange={(e) => setLocalApp({ ...localApp, hairColor: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              </div>

              {/* Shirt Color */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Color de Camisa / Sudadera</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={localApp.shirtColor}
                    onChange={(e) => setLocalApp({ ...localApp, shirtColor: e.target.value })}
                    className="w-8 h-8 rounded border-0 cursor-pointer bg-transparent"
                  />
                  <input
                    type="text"
                    value={localApp.shirtColor}
                    onChange={(e) => setLocalApp({ ...localApp, shirtColor: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              </div>

              {/* Pants Color */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Color de Pantalón</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={localApp.pantsColor}
                    onChange={(e) => setLocalApp({ ...localApp, pantsColor: e.target.value })}
                    className="w-8 h-8 rounded border-0 cursor-pointer bg-transparent"
                  />
                  <input
                    type="text"
                    value={localApp.pantsColor}
                    onChange={(e) => setLocalApp({ ...localApp, pantsColor: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              </div>

              {/* Shoes Color */}
              <div>
                <label className="text-xs font-semibold text-slate-300 block mb-1">Color de Zapatos</label>
                <div className="flex items-center space-x-2">
                  <input
                    type="color"
                    value={localApp.shoesColor}
                    onChange={(e) => setLocalApp({ ...localApp, shoesColor: e.target.value })}
                    className="w-8 h-8 rounded border-0 cursor-pointer bg-transparent"
                  />
                  <input
                    type="text"
                    value={localApp.shoesColor}
                    onChange={(e) => setLocalApp({ ...localApp, shoesColor: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-white font-mono"
                  />
                </div>
              </div>
            </div>

            {/* Companion Selector */}
            <div className="pt-2">
              <label className="text-xs font-bold text-slate-300 block mb-2">
                Seleccionar Compañero Mágico (6 Criaturas Disponibles)
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {COMPANIONS.map((comp) => {
                  const isSelected = localApp.companion === comp.id;
                  return (
                    <button
                      key={comp.id}
                      type="button"
                      onClick={() => setLocalApp({ ...localApp, companion: comp.id })}
                      className={`p-3 rounded-xl border text-left transition flex items-center space-x-3 ${
                        isSelected
                          ? 'bg-indigo-950/60 border-indigo-500 shadow-md ring-1 ring-indigo-500'
                          : 'bg-slate-800/60 border-slate-700 hover:bg-slate-800'
                      }`}
                    >
                      <div
                        className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-sm shadow-sm"
                        style={{ backgroundColor: comp.color }}
                      >
                        ✨
                      </div>
                      <div className="truncate">
                        <p className="text-xs font-bold text-white truncate">{comp.name}</p>
                        <p className="text-[10px] text-slate-400 truncate">{comp.desc}</p>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Backpack (5 Slots) Manager */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center space-x-2">
                  <Backpack className="w-4 h-4 text-amber-400" />
                  <span>Mochila del Jugador (Exactamente 5 Espacios)</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Haz clic sobre cualquier ranura para alternar entre Baya, Nuez, Llave o Vacío.
                </p>
              </div>

              <button
                onClick={handleSaveInventory}
                disabled={isSavingInv}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold shadow-md shadow-amber-600/30 flex items-center space-x-1.5 transition self-start sm:self-auto"
              >
                {isSavingInv ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
                <span>Guardar Mochila</span>
              </button>
            </div>

            {/* 5 Slots Grid */}
            <div className="grid grid-cols-5 gap-3">
              {localInv.slots.map((item, idx) => (
                <button
                  key={idx}
                  onClick={() => cycleSlot(idx)}
                  className="group relative aspect-square rounded-2xl bg-slate-800/80 hover:bg-slate-700/80 border-2 border-dashed border-slate-600 hover:border-indigo-400 flex flex-col items-center justify-center p-2 transition shadow-inner"
                >
                  <span className="absolute top-1.5 left-2 text-[10px] font-bold text-slate-500">
                    #{idx + 1}
                  </span>
                  {item === 'baya' && (
                    <>
                      <span className="text-2xl animate-pulse">🍒</span>
                      <span className="text-[10px] font-bold text-pink-400 mt-1">Baya</span>
                    </>
                  )}
                  {item === 'nuez' && (
                    <>
                      <span className="text-2xl">🌰</span>
                      <span className="text-[10px] font-bold text-amber-400 mt-1">Nuez</span>
                    </>
                  )}
                  {item === 'llave' && (
                    <>
                      <span className="text-2xl">🗝️</span>
                      <span className="text-[10px] font-bold text-yellow-300 mt-1">Llave</span>
                    </>
                  )}
                  {item === null && (
                    <span className="text-xs text-slate-600 font-semibold italic">Vacío</span>
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
