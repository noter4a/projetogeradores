import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Generator, GeneratorStatus } from '../types';
import { AlertTriangle } from 'lucide-react';
import { cardStatusGlow } from '../utils/generatorHealth';

interface OperatorDashboardCardProps {
  gen: Generator;
}

const statusLabel: Record<GeneratorStatus, string> = {
  [GeneratorStatus.RUNNING]: 'RODANDO',
  [GeneratorStatus.STOPPED]: 'PARADO',
  [GeneratorStatus.ALARM]: 'ALARME',
  [GeneratorStatus.OFFLINE]: 'OFFLINE',
};

const OperatorDashboardCard: React.FC<OperatorDashboardCardProps> = ({ gen }) => {
  const navigate = useNavigate();
  const avgVoltage =
    gen.status === GeneratorStatus.RUNNING
      ? Math.round(((gen.voltageL1 || 0) + (gen.voltageL2 || 0) + (gen.voltageL3 || 0)) / 3)
      : 0;

  return (
    <div
      onClick={() => navigate(`/generator/${gen.id}`)}
      className={`bg-ciklo-card rounded-2xl border p-4 active:scale-[0.99] transition-all cursor-pointer ${cardStatusGlow(gen.status)}`}
    >
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-white font-mono truncate">{gen.name}</h3>
          <p className="text-xs text-gray-500 truncate">{gen.location}</p>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 shrink-0">
          {statusLabel[gen.status]}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg bg-ciklo-dark border border-gray-800 py-2">
          <p className="text-[9px] text-gray-500 uppercase font-bold">Carga</p>
          <p className="text-sm font-mono font-bold text-white">{gen.activePower ?? '—'}<span className="text-[10px] text-gray-500"> kW</span></p>
        </div>
        <div className="rounded-lg bg-ciklo-dark border border-gray-800 py-2">
          <p className="text-[9px] text-gray-500 uppercase font-bold">Tensão</p>
          <p className="text-sm font-mono font-bold text-white">{avgVoltage || '—'}<span className="text-[10px] text-gray-500"> V</span></p>
        </div>
        <div className="rounded-lg bg-ciklo-dark border border-gray-800 py-2">
          <p className="text-[9px] text-gray-500 uppercase font-bold">Combustível</p>
          <p className="text-sm font-mono font-bold text-white">
            {gen.fuelLevel == null || gen.fuelLevel === 65535 ? '—' : `${gen.fuelLevel}%`}
          </p>
        </div>
      </div>
      {gen.alarmCode && gen.alarmCode > 0 && (
        <p className="mt-2 text-xs text-red-400 font-bold flex items-center gap-1">
          <AlertTriangle size={12} /> Alarme ativo — toque para abrir
        </p>
      )}
    </div>
  );
};

export default OperatorDashboardCard;
