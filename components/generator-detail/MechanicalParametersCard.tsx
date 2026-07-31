import React from 'react';
import { Settings, Thermometer, Droplets, Battery, Timer, Zap, BarChart3, RotateCcw } from 'lucide-react';
import { Generator } from '../../types';
import CircularGauge from '../CircularGauge';

interface MechanicalParametersCardProps {
  gen: Generator;
}

const MechanicalParametersCard: React.FC<MechanicalParametersCardProps> = ({ gen }) => {
  return (
    <div className="bg-ciklo-card rounded-xl border border-gray-800 p-6">
      <h3 className="text-white font-bold mb-4 flex items-center gap-2">
        <Settings size={18} className="text-ciklo-orange" /> Parâmetros Mecânicos
      </h3>
      <div className="grid grid-cols-2 gap-4">
        <CircularGauge value={gen.rpm} max={2500} label="RPM Motor" unit="rpm" color="text-blue-500" />
        <CircularGauge value={gen.oilPressure} max={10} label="Pressão Óleo" unit="bar" color="text-red-500" />
      </div>
      <div className="mt-4 space-y-3">
        <div className="bg-ciklo-dark p-3 rounded-lg flex items-center justify-between border border-gray-700/50">
          <div className="flex items-center gap-2 text-gray-400">
            <Thermometer size={18} /> Temp. Motor
          </div>
          <span className="text-xl font-bold text-white">
            {gen.engineTemp === null || gen.engineTemp === undefined || gen.engineTemp === 65535 ? '-' : `${gen.engineTemp}°C`}
          </span>
        </div>
        {gen.oilTemp != null && (
          <div className="bg-ciklo-dark p-3 rounded-lg flex items-center justify-between border border-gray-700/50">
            <div className="flex items-center gap-2 text-gray-400">
              <Thermometer size={18} /> Temp. Óleo
            </div>
            <span className="text-xl font-bold text-white">{gen.oilTemp}°C</span>
          </div>
        )}
        <div className="bg-ciklo-dark p-3 rounded-lg flex items-center justify-between border border-gray-700/50">
          <div className="flex items-center gap-2 text-gray-400">
            <Droplets size={18} /> Nível Combustível
          </div>
          <span className={`text-xl font-bold ${gen.fuelLevel === null || gen.fuelLevel === undefined || gen.fuelLevel === 65535 ? 'text-gray-400' : gen.fuelLevel < 20 ? 'text-red-500' : 'text-green-500'}`}>
            {gen.fuelLevel === null || gen.fuelLevel === undefined || gen.fuelLevel === 65535 ? '-' : `${gen.fuelLevel}%`}
          </span>
        </div>
        <div className="bg-ciklo-dark p-3 rounded-lg flex items-center justify-between border border-gray-700/50">
          <div className="flex items-center gap-2 text-gray-400">
            <Battery size={18} /> Tensão Bateria
          </div>
          <span className="text-xl font-bold text-white">
            {gen.batteryVoltage === null || gen.batteryVoltage === undefined || gen.batteryVoltage === 6553.5 ? '-' : `${gen.batteryVoltage} V`}
          </span>
        </div>
        <div className="bg-ciklo-dark p-3 rounded-lg flex items-center justify-between border border-gray-700/50">
          <div className="flex items-center gap-2 text-gray-400">
            <Timer size={18} /> Horímetro Total
          </div>
          <span className="text-xl font-bold text-white">
            {Number(gen.totalHours || 0).toFixed(2)} h
          </span>
        </div>
        {gen.activeEnergy != null && (
          <div className="bg-ciklo-dark p-3 rounded-lg flex items-center justify-between border border-gray-700/50">
            <div className="flex items-center gap-2 text-gray-400">
              <Zap size={18} /> Energia Total Gerada
            </div>
            <span className="text-xl font-bold text-white">{Number(gen.activeEnergy).toFixed(1)} kWh</span>
          </div>
        )}
        {gen.loadPercent != null && (
          <div className="bg-ciklo-dark p-3 rounded-lg flex items-center justify-between border border-gray-700/50">
            <div className="flex items-center gap-2 text-gray-400">
              <BarChart3 size={18} /> Carga
            </div>
            <span className={`text-xl font-bold ${gen.loadPercent >= 90 ? 'text-red-500' : gen.loadPercent >= 70 ? 'text-ciklo-orange' : 'text-green-500'}`}>
              {gen.loadPercent}%
            </span>
          </div>
        )}
        {gen.avgCurrent != null && (
          <div className="bg-ciklo-dark p-3 rounded-lg flex items-center justify-between border border-gray-700/50">
            <div className="flex items-center gap-2 text-gray-400">
              <Zap size={18} /> Corrente Média
            </div>
            <span className="text-xl font-bold text-white">{gen.avgCurrent} A</span>
          </div>
        )}
        {gen.startAttempts != null && (
          <div className="bg-ciklo-dark p-3 rounded-lg flex items-center justify-between border border-gray-700/50">
            <div className="flex items-center gap-2 text-gray-400">
              <RotateCcw size={18} /> Nº de Partidas
            </div>
            <span className="text-xl font-bold text-white">{gen.startAttempts}</span>
          </div>
        )}
      </div>
    </div>
  );
};

export default MechanicalParametersCard;
