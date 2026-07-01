import React from 'react';
import { useNavigate } from 'react-router-dom';
import { GeneratorStatus, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { useGenerators } from '../context/GeneratorContext';
import { useOperatorMode } from '../context/OperatorModeContext';
import { Zap, Fuel, Activity, MapPin, ChevronRight, Clock, AlertTriangle, Radio } from 'lucide-react';
import OperatorModeToggle from '../components/ui/OperatorModeToggle';
import OperatorDashboardCard from '../components/OperatorDashboardCard';
import { isGeneratorConnected } from '../utils/generatorHealth';

const StatusBadge = ({ status }: { status: GeneratorStatus }) => {
  const styles = {
    [GeneratorStatus.RUNNING]: 'bg-green-500/20 text-green-400 border-green-500/30',
    [GeneratorStatus.STOPPED]: 'bg-gray-700/50 text-gray-400 border-gray-600',
    [GeneratorStatus.ALARM]: 'bg-red-500/20 text-red-400 border-red-500/30',
    [GeneratorStatus.OFFLINE]: 'bg-gray-800 text-gray-500 border-gray-700',
  };

  const labels = {
    [GeneratorStatus.RUNNING]: 'EM OPERAÇÃO',
    [GeneratorStatus.STOPPED]: 'PARADO',
    [GeneratorStatus.ALARM]: 'ALERTA',
    [GeneratorStatus.OFFLINE]: 'OFFLINE',
  };

  return (
    <span
      title={labels[status]}
      className={`px-2 py-1 sm:px-3 sm:py-1 rounded-full text-xs font-bold border ${styles[status]} flex items-center gap-1.5 shadow-sm whitespace-nowrap`}
    >
      <span className={`w-2 h-2 rounded-full ${status === GeneratorStatus.RUNNING ? 'animate-pulse bg-current' : 'bg-current'}`}></span>
      <span className="hidden sm:inline">{labels[status]}</span>
    </span>
  );
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { generators: allGenerators } = useGenerators();
  const { operatorMode } = useOperatorMode();

  const generators = user?.role === UserRole.ADMIN
    ? allGenerators
    : allGenerators.filter(g => g.companyId === user?.companyId);

  const runningGens = generators.filter(g => g.status === GeneratorStatus.RUNNING).length;
  const alarmGens = generators.filter(g => g.alarmCode && g.alarmCode > 0).length;
  const connectedGens = generators.filter(g => isGeneratorConnected(g.lastDataReceived)).length;
  const offlineGens = generators.filter(g => !isGeneratorConnected(g.lastDataReceived)).length;

  const showOperatorUi = operatorMode;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <OperatorModeToggle />
        {showOperatorUi && (
          <span className="text-[10px] uppercase tracking-wider text-ciklo-orange font-bold bg-ciklo-orange/10 border border-ciklo-orange/30 px-2 py-1 rounded-lg">
            Interface de Visualização Simplificada
          </span>
        )}
      </div>

      {!showOperatorUi && (
        <div className="relative overflow-hidden rounded-xl border border-gray-800 bg-gradient-to-r from-ciklo-card via-gray-900 to-ciklo-card p-4 shadow-lg">
          <div className="relative flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-ciklo-orange/20 border border-ciklo-orange/30 flex items-center justify-center">
                <Radio size={20} className="text-ciklo-orange" />
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold">Centro de Operações</p>
                <h2 className="text-lg font-bold text-white">Monitoramento em tempo real</h2>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/25 min-w-[100px]">
                <p className="text-[10px] text-green-400/80 uppercase font-bold">Rodando</p>
                <p className="text-xl font-mono font-bold text-green-400">{runningGens}</p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/25 min-w-[100px]">
                <p className="text-[10px] text-red-400/80 uppercase font-bold">Alarmes</p>
                <p className="text-xl font-mono font-bold text-red-400">{alarmGens}</p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/25 min-w-[100px]">
                <p className="text-[10px] text-blue-400/80 uppercase font-bold">Conectados</p>
                <p className="text-xl font-mono font-bold text-blue-400">{connectedGens}</p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 min-w-[100px]">
                <p className="text-[10px] text-gray-500 uppercase font-bold">Offline</p>
                <p className="text-xl font-mono font-bold text-gray-400">{offlineGens}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showOperatorUi && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-3 text-center">
            <p className="text-2xl font-mono font-bold text-green-400">{runningGens}</p>
            <p className="text-[10px] text-green-400/80 uppercase font-bold">Rodando</p>
          </div>
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-center">
            <p className="text-2xl font-mono font-bold text-red-400">{alarmGens}</p>
            <p className="text-[10px] text-red-400/80 uppercase font-bold">Alarmes</p>
          </div>
          <div className="rounded-xl bg-blue-500/10 border border-blue-500/30 p-3 text-center">
            <p className="text-2xl font-mono font-bold text-blue-400">{connectedGens}</p>
            <p className="text-[10px] text-blue-400/80 uppercase font-bold">Conectados</p>
          </div>
          <div className="rounded-xl bg-gray-800 border border-gray-700 p-3 text-center">
            <p className="text-2xl font-mono font-bold text-gray-300">{offlineGens}</p>
            <p className="text-[10px] text-gray-500 uppercase font-bold">Offline</p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2 pl-1">
          <div className="w-1 h-5 bg-ciklo-orange rounded-full"></div>
          {showOperatorUi ? 'Painel de Visualização Simplificada' : 'Visão Geral do Painel'}
        </h3>

        {generators.length === 0 ? (
          <div className="text-center py-16 bg-ciklo-card rounded-xl border border-gray-800 border-dashed">
            <p className="text-gray-400 text-lg">Nenhum gerador monitorado ou atribuído.</p>
            {user?.role === UserRole.ADMIN && (
              <button
                onClick={() => navigate('/add-generator')}
                className="mt-4 text-ciklo-orange font-medium hover:underline"
              >
                Adicionar primeiro gerador
              </button>
            )}
          </div>
        ) : showOperatorUi ? (
          <div className="grid grid-cols-1 gap-4">
            {generators.map((gen) => (
              <OperatorDashboardCard key={gen.id} gen={gen} />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {generators.map((gen) => (
              <div
                key={gen.id}
                onClick={() => navigate(`/generator/${gen.id}`)}
                className="bg-ciklo-card rounded-xl border border-gray-800 overflow-hidden hover:border-ciklo-orange transition-all duration-300 cursor-pointer group hover:shadow-xl hover:shadow-orange-900/10 relative"
              >
                <div className="p-6">
                  <div className="flex justify-between items-start mb-6 gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 min-w-0">
                        <h3 className="text-xl font-bold text-white group-hover:text-ciklo-orange transition-colors tracking-tight truncate">
                          {gen.name}
                        </h3>
                        {gen.alarmCode && gen.alarmCode > 0 && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/alarms?generatorId=${encodeURIComponent(gen.id)}`);
                            }}
                            className="inline-flex items-center flex-shrink-0 hover:scale-125 transition-transform cursor-pointer"
                            title={`Alarme Ativo (Código ${gen.alarmCode}) — Clique para ver alarmes`}
                          >
                            <AlertTriangle size={20} className="text-red-500 animate-pulse drop-shadow-[0_0_6px_rgba(239,68,68,0.7)]" />
                          </button>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-gray-400 text-sm mt-1.5 truncate">
                        <MapPin size={14} className="text-gray-500 shrink-0" />
                        <span className="truncate">{gen.location}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={gen.status} />
                        {(() => {
                          const isConnected = isGeneratorConnected(gen.lastDataReceived);
                          const label = isConnected ? 'CONECTADO' : 'DESCONECTADO';
                          return (
                            <span
                              title={label}
                              className={`px-2 py-1 rounded-full text-[10px] font-bold border flex items-center gap-1 whitespace-nowrap ${
                                isConnected
                                  ? 'bg-green-500/10 text-green-400 border-green-500/30'
                                  : 'bg-red-500/10 text-red-400 border-red-500/30'
                              }`}
                            >
                              <span className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`}></span>
                              <span className="hidden sm:inline">{label}</span>
                            </span>
                          );
                        })()}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-ciklo-dark p-3 rounded-lg border border-gray-700/50">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold flex items-center gap-1 mb-1">
                        <Fuel size={10} /> Combustível
                      </p>
                      <div className="flex items-end gap-1">
                        <span className={`text-lg font-bold ${gen.fuelLevel === 65535 || gen.fuelLevel === null || gen.fuelLevel === undefined ? 'text-gray-500' : gen.fuelLevel < 20 ? 'text-red-500' : 'text-white'}`}>
                          {gen.fuelLevel === 65535 || gen.fuelLevel === null || gen.fuelLevel === undefined ? '-' : `${gen.fuelLevel}%`}
                        </span>
                      </div>
                      <div className="w-full bg-gray-800 h-1.5 rounded-full mt-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${gen.fuelLevel === 65535 || gen.fuelLevel === null || gen.fuelLevel === undefined ? 'bg-gray-700' : gen.fuelLevel < 20 ? 'bg-red-500' : 'bg-ciklo-yellow'}`}
                          style={{ width: `${gen.fuelLevel === 65535 || gen.fuelLevel === null || gen.fuelLevel === undefined ? 0 : gen.fuelLevel}%` }}
                        ></div>
                      </div>
                    </div>

                    <div className="bg-ciklo-dark p-3 rounded-lg border border-gray-700/50">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold flex items-center gap-1 mb-1">
                        <Zap size={10} /> Carga
                      </p>
                      <span className="text-lg font-bold text-white">{gen.activePower}</span>
                      <span className="text-xs text-gray-500 ml-1">kW</span>
                    </div>

                    <div className="bg-ciklo-dark p-3 rounded-lg border border-gray-700/50">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold flex items-center gap-1 mb-1">
                        <Activity size={10} /> Tensão
                      </p>
                      <span className="text-lg font-bold text-white">
                        {gen.status === GeneratorStatus.RUNNING ? Math.round(((gen.voltageL1 || 0) + (gen.voltageL2 || 0) + (gen.voltageL3 || 0)) / 3) : 0}
                      </span>
                      <span className="text-xs text-gray-500 ml-1">V</span>
                    </div>

                    <div className="bg-ciklo-dark p-3 rounded-lg border border-gray-700/50">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold flex items-center gap-1 mb-1">
                        <Clock size={10} /> Horas
                      </p>
                      <span className="text-lg font-bold text-white">{Number(gen.totalHours || 0).toFixed(2)}</span>
                      <span className="text-xs text-gray-500 ml-1">h</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                    <span className="text-xs text-gray-500">
                      Modelo: <span className="text-gray-300 font-medium">{gen.model}</span>
                    </span>
                    <span className="text-xs text-ciklo-orange font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                      Monitoramento Completo <ChevronRight size={14} />
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {alarmGens > 0 && (
          <button
            onClick={() => navigate('/alarms')}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-bold transition-colors ${
              showOperatorUi
                ? 'py-4 rounded-2xl bg-red-600 text-white border-red-600 active:bg-red-500'
                : 'border-red-500/30 bg-red-500/5 text-red-400 hover:bg-red-500/10'
            }`}
          >
            <AlertTriangle size={16} />
            {showOperatorUi
              ? `⚠ ${alarmGens} ALARME(S) ATIVO(S) — ABRIR`
              : `${alarmGens} gerador(es) com alarme — abrir Central de Alarmes`}
          </button>
        )}
      </div>
    </div>
  );
};

export default Dashboard;
