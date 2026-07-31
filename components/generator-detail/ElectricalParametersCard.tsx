import React from 'react';
import { Zap, Power, UtilityPole } from 'lucide-react';
import { Generator } from '../../types';
import { formatFrequency, formatPowerFactor } from '../../utils/formatters';
import PhaseTable from './PhaseTable';

type VoltageViewMode = 'PN' | 'PP';

interface ElectricalParametersCardProps {
  gen: Generator;
  voltageViewMode: VoltageViewMode;
  onVoltageViewModeChange: (mode: VoltageViewMode) => void;
  mainsVoltageViewMode: VoltageViewMode;
  onMainsVoltageViewModeChange: (mode: VoltageViewMode) => void;
}

const ElectricalParametersCard: React.FC<ElectricalParametersCardProps> = ({
  gen,
  voltageViewMode,
  onVoltageViewModeChange,
  mainsVoltageViewMode,
  onMainsVoltageViewModeChange,
}) => {
  return (
    <div className="bg-ciklo-card rounded-xl border border-gray-800 p-6 h-full flex flex-col">
      <h3 className="text-white font-bold mb-4 flex items-center gap-2">
        <Zap size={18} className="text-ciklo-yellow" /> Parâmetros Elétricos
      </h3>

      {/* Big Power Display */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
        <div className="bg-ciklo-dark rounded-lg p-4 border-l-4 border-ciklo-orange">
          <p className="text-gray-400 text-xs font-medium">Potência Ativa Total</p>
          <p className="text-3xl font-bold text-white mt-1">
            {gen.activePowerTotal === null || gen.activePowerTotal === undefined || gen.activePowerTotal === 65535 ? '-' : Number(gen.activePowerTotal).toFixed(1)}{' '}
            {gen.activePowerTotal !== null && gen.activePowerTotal !== undefined && gen.activePowerTotal !== 65535 && (
              <span className="text-base font-normal text-gray-500">kW</span>
            )}
          </p>
          {gen.apparentPower != null && gen.apparentPower > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              Aparente: <span className="text-gray-300">{Number(gen.apparentPower).toFixed(1)} kVA</span>
            </p>
          )}
        </div>
        <div className="bg-ciklo-dark rounded-lg p-4 border-l-4 border-blue-500">
          <p className="text-gray-400 text-xs font-medium">Fator de Potência</p>
          <p className="text-3xl font-bold text-white mt-1">
            {formatPowerFactor(gen.powerFactor)}{' '}
            {gen.powerFactor !== null && gen.powerFactor !== undefined && gen.powerFactor !== 655.35 && gen.powerFactor !== 6553.5 && gen.powerFactor !== 65535 && (
              <span className="text-base font-normal text-gray-500">cos φ</span>
            )}
          </p>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* GENERATOR COLUMN */}
        <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
            <div className="flex items-center gap-2 text-green-500">
              <Power size={18} />
              <span className="font-bold text-sm">Gerador</span>
            </div>
            <div className="flex items-center gap-3">
              {/* Toggle Phase-Neutral / Phase-Phase */}
              <div className="flex bg-gray-800 rounded-lg p-0.5">
                <button
                  onClick={() => onVoltageViewModeChange('PP')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${voltageViewMode === 'PP' ? 'bg-gray-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  F-F
                </button>
                <button
                  onClick={() => onVoltageViewModeChange('PN')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${voltageViewMode === 'PN' ? 'bg-gray-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  F-N
                </button>
              </div>
              <div className="text-right">
                <span className="text-xs text-gray-400 block">Frequência</span>
                <span className="text-lg font-bold text-white">{formatFrequency(gen.frequency)}</span>
              </div>
            </div>
          </div>
          <PhaseTable
            voltageColor="text-ciklo-yellow"
            currentColorPN="text-blue-400"
            currentColorPP="text-blue-400"
            viewMode={voltageViewMode}
            pnRows={[
              { label: 'L1', voltage: gen.voltageL1, current: gen.currentL1 },
              { label: 'L2', voltage: gen.voltageL2, current: gen.currentL2 },
              { label: 'L3', voltage: gen.voltageL3, current: gen.currentL3 },
            ]}
            ppRows={[
              { label: 'L1-L2', voltage: gen.voltageL12, current: gen.currentL1 },
              { label: 'L2-L3', voltage: gen.voltageL23, current: gen.currentL2 },
              { label: 'L3-L1', voltage: gen.voltageL31, current: gen.currentL3 },
            ]}
          />
        </div>

        {/* MAINS COLUMN */}
        <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
          <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
            <div className="flex items-center gap-2 text-gray-400">
              <UtilityPole size={18} />
              <span className="font-bold text-sm">Rede</span>
              {(gen.mainsFailure || gen.mainsFeedingLoad === false || gen.mainsBreakerClosed === false) && (
                <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-red-900/40 text-red-400 border border-red-800">
                  {gen.mainsFailure ? 'Falha de rede' : 'Sem alimentação'}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {/* Toggle Phase-Neutral / Phase-Phase */}
              <div className="flex bg-gray-800 rounded-lg p-0.5">
                <button
                  onClick={() => onMainsVoltageViewModeChange('PP')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${mainsVoltageViewMode === 'PP' ? 'bg-gray-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  F-F
                </button>
                <button
                  onClick={() => onMainsVoltageViewModeChange('PN')}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${mainsVoltageViewMode === 'PN' ? 'bg-gray-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                >
                  F-N
                </button>
              </div>
              <div className="text-right">
                <span className="text-xs text-gray-400 block">Frequência</span>
                <span className="text-lg font-bold text-white">{formatFrequency(gen.mainsFrequency)}</span>
              </div>
            </div>
          </div>
          <PhaseTable
            voltageColor="text-gray-400"
            currentColorPN="text-gray-500"
            currentColorPP="text-blue-400"
            viewMode={mainsVoltageViewMode}
            pnRows={[
              { label: 'L1', voltage: gen.mainsVoltageL1, current: gen.mainsCurrentL1 },
              { label: 'L2', voltage: gen.mainsVoltageL2, current: gen.mainsCurrentL2 },
              { label: 'L3', voltage: gen.mainsVoltageL3, current: gen.mainsCurrentL3 },
            ]}
            ppRows={[
              { label: 'L1-L2', voltage: gen.mainsVoltageL12, current: gen.mainsCurrentL1 },
              { label: 'L2-L3', voltage: gen.mainsVoltageL23, current: gen.mainsCurrentL2 },
              { label: 'L3-L1', voltage: gen.mainsVoltageL31, current: gen.mainsCurrentL3 },
            ]}
          />
        </div>
      </div>
    </div>
  );
};

export default ElectricalParametersCard;
