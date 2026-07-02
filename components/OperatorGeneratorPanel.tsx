import React from 'react';
import { Generator, GeneratorStatus } from '../types';
import { Zap, Activity, Fuel, Gauge, Radio } from 'lucide-react';
import { formatLastUpdate, CONNECTION_THRESHOLD_MS } from '../utils/generatorHealth';

interface OperatorGeneratorPanelProps {
  gen: Generator;
}

const statusLabel: Record<GeneratorStatus, string> = {
  [GeneratorStatus.RUNNING]: 'RODANDO',
  [GeneratorStatus.STOPPED]: 'PARADO',
  [GeneratorStatus.ALARM]: 'ALARME',
  [GeneratorStatus.OFFLINE]: 'OFFLINE',
};

const statusColor: Record<GeneratorStatus, string> = {
  [GeneratorStatus.RUNNING]: 'text-green-400 border-green-500/40 bg-green-500/10',
  [GeneratorStatus.STOPPED]: 'text-gray-300 border-gray-600 bg-gray-800',
  [GeneratorStatus.ALARM]: 'text-red-400 border-red-500/40 bg-red-500/10',
  [GeneratorStatus.OFFLINE]: 'text-gray-500 border-gray-700 bg-gray-900',
};

const OperatorGeneratorPanel: React.FC<OperatorGeneratorPanelProps> = ({ gen }) => {
  const avgV =
    gen.status === GeneratorStatus.RUNNING
      ? Math.round(((gen.voltageL1 || 0) + (gen.voltageL2 || 0) + (gen.voltageL3 || 0)) / 3)
      : 0;
  const isLive = gen.lastDataReceived && Date.now() - gen.lastDataReceived < CONNECTION_THRESHOLD_MS;

  return (
    <div className="space-y-3">
      <div className={`rounded-2xl border p-5 text-center ${statusColor[gen.status]}`}>
        <p className="text-[10px] uppercase tracking-[0.25em] font-bold opacity-70 mb-1">Status</p>
        <p className="text-3xl font-black font-mono tracking-tight">{statusLabel[gen.status]}</p>
        <p className="text-sm mt-1 opacity-80">{gen.operationMode || 'AUTO'}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-ciklo-card border border-gray-800 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Gauge size={14} />
            <span className="text-[10px] font-bold uppercase">RPM</span>
          </div>
          <p className="text-2xl font-mono font-bold text-white">
            {gen.rpm == null || gen.rpm === 65535 ? '—' : gen.rpm}
          </p>
        </div>
        <div className="rounded-xl bg-ciklo-card border border-gray-800 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Zap size={14} />
            <span className="text-[10px] font-bold uppercase">Carga</span>
          </div>
          <p className="text-2xl font-mono font-bold text-white">
            {gen.activePower ?? '—'}<span className="text-sm text-gray-500"> kW</span>
          </p>
        </div>
        <div className="rounded-xl bg-ciklo-card border border-gray-800 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Activity size={14} />
            <span className="text-[10px] font-bold uppercase">Tensão</span>
          </div>
          <p className="text-2xl font-mono font-bold text-white">
            {avgV || '—'}<span className="text-sm text-gray-500"> V</span>
          </p>
        </div>
        <div className="rounded-xl bg-ciklo-card border border-gray-800 p-4">
          <div className="flex items-center gap-2 text-gray-500 mb-1">
            <Fuel size={14} />
            <span className="text-[10px] font-bold uppercase">Combustível</span>
          </div>
          <p className="text-2xl font-mono font-bold text-white">
            {gen.fuelLevel == null || gen.fuelLevel === 65535 ? '—' : `${gen.fuelLevel}%`}
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-ciklo-card border border-gray-800 p-3 flex items-center justify-end">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-gray-500">
          <Radio size={10} className={isLive ? 'text-green-400' : 'text-gray-500'} />
          <span className={isLive ? 'text-green-400/90' : 'text-gray-500'}>
            {formatLastUpdate(gen.lastDataReceived)}
          </span>
        </span>
      </div>
    </div>
  );
};

export default OperatorGeneratorPanel;
