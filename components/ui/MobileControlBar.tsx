import React, { useRef, useState, useCallback } from 'react';
import { GeneratorStatus } from '../../types';
import { RefreshCw, Settings, Play, Square } from 'lucide-react';

const STOP_HOLD_MS = 3000;

interface MobileControlBarProps {
  status: GeneratorStatus;
  operationMode?: string;
  controlLoading: string | null;
  canStart: boolean;
  canStop: boolean;
  onControl: (action: string) => void;
}

const MobileControlBar: React.FC<MobileControlBarProps> = ({
  status,
  operationMode,
  controlLoading,
  canStart,
  canStop,
  onControl,
}) => {
  const [stopProgress, setStopProgress] = useState(0);
  const holdTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const holdStart = useRef(0);

  const clearHold = useCallback(() => {
    if (holdTimer.current) {
      clearInterval(holdTimer.current);
      holdTimer.current = null;
    }
    holdStart.current = 0;
    setStopProgress(0);
  }, []);

  const startStopHold = useCallback(() => {
    if (!canStop || controlLoading) return;
    clearHold();
    holdStart.current = Date.now();
    holdTimer.current = setInterval(() => {
      const elapsed = Date.now() - holdStart.current;
      const pct = Math.min(100, (elapsed / STOP_HOLD_MS) * 100);
      setStopProgress(pct);
      if (pct >= 100) {
        clearHold();
        if (navigator.vibrate) navigator.vibrate([30, 20, 30]);
        onControl('stop');
      }
    }, 50);
  }, [canStop, controlLoading, clearHold, onControl]);

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 md:hidden print:hidden">
      <div className="mx-2 mb-2 rounded-2xl border border-gray-700/80 bg-ciklo-card/95 backdrop-blur-xl shadow-2xl shadow-black/50 p-2">
        <div className="grid grid-cols-4 gap-1.5 mb-1.5">
          <button
            disabled={operationMode === 'AUTO' || !!controlLoading}
            onClick={() => onControl('auto')}
            className={`py-2.5 rounded-xl text-[10px] font-bold flex flex-col items-center gap-0.5 transition-all ${
              operationMode === 'AUTO'
                ? 'bg-green-600 text-white'
                : 'bg-gray-800 text-gray-400 active:bg-gray-700'
            }`}
          >
            <RefreshCw size={14} className={operationMode === 'AUTO' ? 'animate-spin-slow' : ''} />
            AUTO
          </button>
          <button
            disabled={operationMode === 'MANUAL' || !!controlLoading}
            onClick={() => onControl('manual')}
            className={`py-2.5 rounded-xl text-[10px] font-bold flex flex-col items-center gap-0.5 transition-all ${
              operationMode === 'MANUAL'
                ? 'bg-green-600 text-white'
                : 'bg-gray-800 text-gray-400 active:bg-gray-700'
            }`}
          >
            <Settings size={14} />
            MANUAL
          </button>
          <button
            disabled={!canStart || !!controlLoading}
            onClick={() => onControl('start')}
            className={`py-2.5 rounded-xl text-[10px] font-bold flex flex-col items-center gap-0.5 transition-all ${
              canStart
                ? 'bg-green-600/90 text-white active:bg-green-500'
                : 'bg-green-900/20 text-green-700 opacity-50'
            }`}
          >
            <Play size={14} fill="currentColor" />
            START
          </button>
          <button
            disabled={!canStop || !!controlLoading}
            onPointerDown={startStopHold}
            onPointerUp={clearHold}
            onPointerLeave={clearHold}
            onPointerCancel={clearHold}
            className={`relative py-2.5 rounded-xl text-[10px] font-bold flex flex-col items-center gap-0.5 transition-all overflow-hidden select-none touch-none ${
              canStop
                ? 'bg-red-600/90 text-white'
                : 'bg-red-900/20 text-red-700 opacity-50'
            }`}
          >
            {stopProgress > 0 && (
              <span
                className="absolute inset-0 bg-red-400/40 origin-left transition-transform"
                style={{ transform: `scaleX(${stopProgress / 100})` }}
              />
            )}
            <Square size={14} fill="currentColor" className="relative z-10" />
            <span className="relative z-10">{stopProgress > 0 ? `${Math.ceil((STOP_HOLD_MS - (stopProgress / 100) * STOP_HOLD_MS) / 1000)}s` : 'STOP'}</span>
          </button>
        </div>
        <p className="text-center text-[9px] text-gray-500 font-mono uppercase tracking-widest">
          {stopProgress > 0
            ? 'Segure para confirmar parada'
            : status === GeneratorStatus.RUNNING
              ? '● Motor em operação • STOP: segure 3s'
              : '○ Motor parado'}
        </p>
      </div>
    </div>
  );
};

export default MobileControlBar;
