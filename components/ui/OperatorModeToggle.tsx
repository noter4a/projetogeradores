import React from 'react';
import { HardHat } from 'lucide-react';
import { useOperatorMode } from '../../context/OperatorModeContext';

const OperatorModeToggle: React.FC = () => {
  const { operatorMode, toggleOperatorMode } = useOperatorMode();

  return (
    <button
      type="button"
      role="switch"
      aria-checked={operatorMode}
      onClick={toggleOperatorMode}
      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border text-xs font-bold transition-all active:scale-[0.98] ${
        operatorMode
          ? 'bg-ciklo-orange/15 border-ciklo-orange text-ciklo-orange shadow-sm shadow-ciklo-orange/20'
          : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-600'
      }`}
    >
      <HardHat size={16} className={operatorMode ? 'text-ciklo-orange' : 'text-gray-500'} />
      <span className="flex flex-col items-start leading-tight">
        <span>Modo Simplificado</span>
        <span className={`text-[9px] font-normal uppercase tracking-wider ${operatorMode ? 'text-ciklo-orange/80' : 'text-gray-600'}`}>
          {operatorMode ? 'Ligado' : 'Desligado'}
        </span>
      </span>
      <span
        aria-hidden
        className={`relative ml-auto w-11 h-6 rounded-full shrink-0 transition-colors duration-200 ${
          operatorMode ? 'bg-ciklo-orange' : 'bg-gray-600'
        }`}
      >
        <span
          className={`absolute top-1 h-4 w-4 rounded-full bg-white shadow-md transition-all duration-200 ${
            operatorMode ? 'left-[calc(100%-1.125rem)]' : 'left-1'
          }`}
        />
      </span>
    </button>
  );
};

export default OperatorModeToggle;
