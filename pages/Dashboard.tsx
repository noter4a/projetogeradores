import React, { useCallback, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { GeneratorStatus, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { useGenerators } from '../context/GeneratorContext';
import { useOperatorMode } from '../context/OperatorModeContext';
import { useIsMobile } from '../hooks/useIsMobile';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { Zap, Fuel, Activity, MapPin, ChevronRight, Clock, AlertTriangle, Radio, Search, X, Building, ArrowLeft, Layers } from 'lucide-react';
import OperatorModeToggle from '../components/ui/OperatorModeToggle';
import OperatorDashboardCard from '../components/OperatorDashboardCard';
import PullToRefreshIndicator from '../components/ui/PullToRefreshIndicator';
import GeneratorCardSkeleton from '../components/ui/GeneratorCardSkeleton';
import { isGeneratorConnected, cardStatusGlow, formatLastUpdate } from '../utils/generatorHealth';

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

// Chave usada para o grupo "sem empresa" — valor que nenhum nome real pode ter.
const NO_COMPANY_KEY = '__none__';

type CompanySummary = {
  key: string;            // companyName ou NO_COMPANY_KEY
  name: string;           // displayName
  total: number;
  running: number;
  alarms: number;
  warnings: number;
  connected: number;
  offline: number;
  activePowerKw: number;  // soma de activePower dos geradores rodando
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { generators: allGenerators, isLoading, fetchGenerators } = useGenerators();
  const { operatorMode } = useOperatorMode();
  const isMobile = useIsMobile();

  const onRefresh = useCallback(async () => {
    await fetchGenerators();
  }, [fetchGenerators]);

  const { pullDistance, refreshing, statusText } = usePullToRefresh(onRefresh, !isMobile);

  const generators = user?.role === UserRole.ADMIN
    ? allGenerators
    : allGenerators.filter(g => g.companyId === user?.companyId);

  const runningGens = generators.filter(g => g.status === GeneratorStatus.RUNNING).length;
  const alarmGens = generators.filter(g => g.alarmCode && g.alarmCode > 0).length;
  const warningGens = generators.filter(g => g.warningCode && g.warningCode > 0).length;
  const connectedGens = generators.filter(g => isGeneratorConnected(g.lastDataReceived)).length;
  const offlineGens = generators.filter(g => !isGeneratorConnected(g.lastDataReceived)).length;

  // Empresa selecionada no modo "por empresa". null = visão geral com cards de empresa.
  // Não-admin sempre fica travado na própria empresa, então nunca entra nesse modo.
  const [selectedCompany, setSelectedCompany] = useState<string | null>(null);

  // Só faz sentido mostrar a visão por empresa quando o admin tem geradores de
  // mais de uma empresa (ou geradores sem empresa misturados). Caso contrário,
  // cair direto na lista evita um clique inútil.
  const companySummaries = useMemo<CompanySummary[]>(() => {
    if (user?.role !== UserRole.ADMIN) return [];
    const map = new Map<string, CompanySummary>();
    for (const g of generators) {
      const key = g.companyName || NO_COMPANY_KEY;
      const name = g.companyName || 'Sem Empresa';
      let entry = map.get(key);
      if (!entry) {
        entry = { key, name, total: 0, running: 0, alarms: 0, warnings: 0, connected: 0, offline: 0, activePowerKw: 0 };
        map.set(key, entry);
      }
      entry.total += 1;
      if (g.status === GeneratorStatus.RUNNING) entry.running += 1;
      if (g.alarmCode && g.alarmCode > 0) entry.alarms += 1;
      if (g.warningCode && g.warningCode > 0) entry.warnings += 1;
      const connected = isGeneratorConnected(g.lastDataReceived);
      if (connected) entry.connected += 1; else entry.offline += 1;
      if (g.status === GeneratorStatus.RUNNING && typeof g.activePower === 'number') {
        entry.activePowerKw += g.activePower;
      }
    }
    // Empresas com alarme primeiro, depois por quantidade de geradores.
    return Array.from(map.values()).sort((a, b) => {
      if (a.alarms !== b.alarms) return b.alarms - a.alarms;
      if (a.warnings !== b.warnings) return b.warnings - a.warnings;
      return b.total - a.total;
    });
  }, [generators, user?.role]);

  const showCompanyOverview = user?.role === UserRole.ADMIN && companySummaries.length > 1 && selectedCompany === null;

  // Filtro do painel (usado na lista de geradores, após escolher uma empresa).
  const [search, setSearch] = useState('');
  const [connFilter, setConnFilter] = useState<'all' | 'connected' | 'disconnected'>('all');

  const filteredGenerators = useMemo(() => {
    let base = generators;
    if (selectedCompany !== null) {
      base = selectedCompany === NO_COMPANY_KEY
        ? generators.filter(g => !g.companyName)
        : generators.filter(g => g.companyName === selectedCompany);
    }
    const q = search.trim().toLowerCase();
    return base.filter(g => {
      const matchesSearch = !q
        || g.name?.toLowerCase().includes(q)
        || g.companyName?.toLowerCase().includes(q)
        || g.location?.toLowerCase().includes(q);
      const connected = isGeneratorConnected(g.lastDataReceived);
      const matchesConn = connFilter === 'all'
        || (connFilter === 'connected' ? connected : !connected);
      return matchesSearch && matchesConn;
    });
  }, [generators, search, connFilter, selectedCompany]);

  const isFiltering = search.trim() !== '' || connFilter !== 'all';

  const clearFilters = () => {
    setSearch('');
    setConnFilter('all');
  };

  const connFilterOptions: { value: typeof connFilter; label: string }[] = [
    { value: 'all', label: 'Todos' },
    { value: 'connected', label: 'Conectados' },
    { value: 'disconnected', label: 'Desconectados' },
  ];

  const showOperatorUi = operatorMode;

  const selectedSummary = selectedCompany !== null
    ? companySummaries.find(c => c.key === selectedCompany)
    : null;

  return (
    <div className="space-y-6">
      <PullToRefreshIndicator pullDistance={pullDistance} refreshing={refreshing} statusText={statusText} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <OperatorModeToggle />
        {showOperatorUi && (
          <span className="text-xs text-ciklo-orange font-semibold bg-ciklo-orange/10 border border-ciklo-orange/30 px-2 py-1 rounded-lg">
            Interface de Visualização Simplificada
          </span>
        )}
      </div>

      {!showOperatorUi && (
        <div className="rounded-xl border border-gray-800 bg-ciklo-card p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Radio size={20} className="text-ciklo-orange" />
              <div>
                <p className="text-xs text-gray-500 font-medium">Centro de Operações</p>
                <h2 className="text-lg font-bold text-white">Monitoramento em tempo real</h2>
              </div>
            </div>
            <div className="flex flex-wrap gap-3">
              <div className="px-3 py-2 rounded-lg bg-green-500/10 border border-green-500/20 min-w-[100px]">
                <p className="text-xs text-green-400/80 font-medium">Rodando</p>
                <p className="text-xl font-mono font-bold text-green-400">{runningGens}</p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 min-w-[100px]">
                <p className="text-xs text-red-400/80 font-medium">Alarmes</p>
                <p className="text-xl font-mono font-bold text-red-400">{alarmGens}</p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 min-w-[100px]">
                <p className="text-xs text-amber-400/80 font-medium">Avisos</p>
                <p className="text-xl font-mono font-bold text-amber-400">{warningGens}</p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-blue-500/10 border border-blue-500/20 min-w-[100px]">
                <p className="text-xs text-blue-400/80 font-medium">Conectados</p>
                <p className="text-xl font-mono font-bold text-blue-400">{connectedGens}</p>
              </div>
              <div className="px-3 py-2 rounded-lg bg-gray-800 border border-gray-700 min-w-[100px]">
                <p className="text-xs text-gray-500 font-medium">Offline</p>
                <p className="text-xl font-mono font-bold text-gray-400">{offlineGens}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {showOperatorUi && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
          <div className="rounded-xl bg-green-500/10 border border-green-500/30 p-3 text-center">
            <p className="text-2xl font-mono font-bold text-green-400">{runningGens}</p>
            <p className="text-[10px] text-green-400/80 font-medium">Rodando</p>
          </div>
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-center">
            <p className="text-2xl font-mono font-bold text-red-400">{alarmGens}</p>
            <p className="text-[10px] text-red-400/80 font-medium">Alarmes</p>
          </div>
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-center">
            <p className="text-2xl font-mono font-bold text-amber-400">{warningGens}</p>
            <p className="text-[10px] text-amber-400/80 font-medium">Avisos</p>
          </div>
          <div className="rounded-xl bg-blue-500/10 border border-blue-500/30 p-3 text-center">
            <p className="text-2xl font-mono font-bold text-blue-400">{connectedGens}</p>
            <p className="text-[10px] text-blue-400/80 font-medium">Conectados</p>
          </div>
          <div className="rounded-xl bg-gray-800 border border-gray-700 p-3 text-center">
            <p className="text-2xl font-mono font-bold text-gray-300">{offlineGens}</p>
            <p className="text-[10px] text-gray-500 font-medium">Offline</p>
          </div>
        </div>
      )}

      <div className="space-y-4">
        {/* Cabeçalho da seção — muda conforme o modo (visão geral vs. empresa selecionada) */}
        <div className="flex items-center justify-between gap-3 pl-1">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <div className="w-1 h-5 bg-ciklo-orange rounded-full"></div>
            {showCompanyOverview
              ? 'Empresas Monitoradas'
              : showOperatorUi
                ? 'Painel de Visualização Simplificada'
                : selectedSummary
                  ? selectedSummary.name
                  : 'Visão Geral do Painel'}
            {!isLoading && !showCompanyOverview && isFiltering && (
              <span className="ml-1 text-xs font-medium text-gray-500">
                ({filteredGenerators.length} de {selectedSummary ? selectedSummary.total : generators.length})
              </span>
            )}
          </h3>
          {selectedCompany !== null && user?.role === UserRole.ADMIN && (
            <button
              onClick={() => { setSelectedCompany(null); clearFilters(); }}
              className="flex items-center gap-1.5 text-xs font-bold text-gray-400 hover:text-white transition-colors"
            >
              <ArrowLeft size={14} />
              Todas as empresas
            </button>
          )}
        </div>

        {/* Visão geral por empresa — só aparece para ADMIN com >1 empresa e nenhuma selecionada */}
        {showCompanyOverview && !isLoading && (
          <>
            <p className="text-sm text-gray-500 pl-1">
              Selecione uma empresa para ver os geradores. Ordenado por alarmes ativos.
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {companySummaries.map((c) => {
                const healthPct = c.total > 0 ? Math.round((c.connected / c.total) * 100) : 0;
                const hasAlarm = c.alarms > 0;
                return (
                  <button
                    key={c.key}
                    onClick={() => setSelectedCompany(c.key)}
                    className={`text-left bg-ciklo-card rounded-xl border overflow-hidden hover:border-ciklo-orange transition-all duration-200 group relative ${
                      hasAlarm ? 'border-red-500/40' : 'border-gray-800'
                    }`}
                  >
                    {hasAlarm && (
                      <span className="absolute top-3 right-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 border border-red-500/30">
                        <AlertTriangle size={11} className="animate-pulse" />
                        {c.alarms} ALARME{c.alarms > 1 ? 'S' : ''}
                      </span>
                    )}
                    <div className="p-5">
                      <div className="flex items-start gap-3 mb-4">
                        <div className="w-10 h-10 rounded-lg bg-ciklo-orange/10 border border-ciklo-orange/30 flex items-center justify-center shrink-0">
                          <Building size={18} className="text-ciklo-orange" />
                        </div>
                        <div className="min-w-0 flex-1 pr-16">
                          <h4 className="text-base font-bold text-white group-hover:text-ciklo-orange transition-colors truncate">
                            {c.name}
                          </h4>
                          <p className="text-xs text-gray-500 mt-0.5">
                            {c.total} gerador{c.total !== 1 ? 'es' : ''} · {healthPct}% conectados
                          </p>
                        </div>
                      </div>

                      <div className="grid grid-cols-4 gap-2 mb-3">
                        <div className="bg-ciklo-dark rounded-lg p-2 border border-gray-700/50">
                          <p className="text-[10px] text-green-400/80 font-medium">Rodando</p>
                          <p className="text-base font-mono font-bold text-green-400">{c.running}</p>
                        </div>
                        <div className="bg-ciklo-dark rounded-lg p-2 border border-gray-700/50">
                          <p className="text-[10px] text-red-400/80 font-medium">Alarmes</p>
                          <p className="text-base font-mono font-bold text-red-400">{c.alarms}</p>
                        </div>
                        <div className="bg-ciklo-dark rounded-lg p-2 border border-gray-700/50">
                          <p className="text-[10px] text-amber-400/80 font-medium">Avisos</p>
                          <p className="text-base font-mono font-bold text-amber-400">{c.warnings}</p>
                        </div>
                        <div className="bg-ciklo-dark rounded-lg p-2 border border-gray-700/50">
                          <p className="text-[10px] text-gray-500 font-medium">Offline</p>
                          <p className="text-base font-mono font-bold text-gray-400">{c.offline}</p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                        <span className="text-xs text-gray-500">
                          Potência ativa:{' '}
                          <span className="text-gray-300 font-mono font-medium">
                            {c.activePowerKw.toFixed(1)} kW
                          </span>
                        </span>
                        <span className="text-xs text-ciklo-orange font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                          Abrir <ChevronRight size={14} />
                        </span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}

        {/* Filtro + lista de geradores — escondidos na visão geral por empresa */}
        {!showCompanyOverview && (
          <>
            {/* Filtro do painel */}
            {!isLoading && generators.length > 0 && (
              <div className="flex flex-col gap-3">
                <div className="relative">
                  <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar por gerador, empresa ou local..."
                    className="w-full bg-ciklo-card border border-gray-700 rounded-xl pl-10 pr-9 py-2.5 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-ciklo-orange focus:ring-1 focus:ring-ciklo-orange transition-colors"
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white transition-colors"
                      aria-label="Limpar busca"
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex bg-ciklo-card border border-gray-700 rounded-xl p-1 shrink-0">
                    {connFilterOptions.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => setConnFilter(opt.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors ${
                          connFilter === opt.value
                            ? 'bg-ciklo-orange text-black shadow'
                            : 'text-gray-400 hover:text-white'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  {isFiltering && (
                    <button
                      onClick={clearFilters}
                      className="text-xs font-medium text-gray-500 hover:text-white transition-colors"
                    >
                      Limpar filtros
                    </button>
                  )}
                </div>
              </div>
            )}

            {isLoading ? (
              showOperatorUi ? (
                <div className="grid grid-cols-1 gap-4">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <GeneratorCardSkeleton key={i} />
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <GeneratorCardSkeleton key={i} />
                  ))}
                </div>
              )
            ) : generators.length === 0 ? (
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
            ) : filteredGenerators.length === 0 ? (
              <div className="text-center py-16 bg-ciklo-card rounded-xl border border-gray-800 border-dashed">
                <p className="text-gray-400 text-lg">Nenhum gerador corresponde ao filtro.</p>
                <button
                  onClick={clearFilters}
                  className="mt-4 text-ciklo-orange font-medium hover:underline"
                >
                  Limpar filtros
                </button>
              </div>
            ) : showOperatorUi ? (
              <div className="grid grid-cols-1 gap-4">
                {filteredGenerators.map((gen) => (
                  <OperatorDashboardCard key={gen.id} gen={gen} />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {filteredGenerators.map((gen) => (
                  <div
                    key={gen.id}
                    onClick={() => navigate(`/generator/${gen.id}`)}
                    className={`bg-ciklo-card rounded-xl border border-gray-800 overflow-hidden hover:border-ciklo-orange transition-all duration-300 cursor-pointer group relative ${cardStatusGlow(gen.status)}`}
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
                            {gen.warningCode && gen.warningCode > 0 && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/alarms?generatorId=${encodeURIComponent(gen.id)}`);
                                }}
                                className="inline-flex items-center flex-shrink-0 hover:scale-125 transition-transform cursor-pointer"
                                title={`Aviso Ativo (Código ${gen.warningCode}) — Clique para ver alarmes`}
                              >
                                <AlertTriangle size={20} className="text-amber-400 drop-shadow-[0_0_6px_rgba(251,191,36,0.6)]" />
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
                          <p className="text-[11px] text-gray-500 font-medium flex items-center gap-1 mb-1">
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
                          <p className="text-[11px] text-gray-500 font-medium flex items-center gap-1 mb-1">
                            <Zap size={10} /> Carga
                          </p>
                          <span className="text-lg font-bold text-white">{gen.activePower}</span>
                          <span className="text-xs text-gray-500 ml-1">kW</span>
                        </div>

                        <div className="bg-ciklo-dark p-3 rounded-lg border border-gray-700/50">
                          <p className="text-[11px] text-gray-500 font-medium flex items-center gap-1 mb-1">
                            <Activity size={10} /> Tensão
                          </p>
                          <span className="text-lg font-bold text-white">
                            {gen.status === GeneratorStatus.RUNNING ? Math.round(((gen.voltageL1 || 0) + (gen.voltageL2 || 0) + (gen.voltageL3 || 0)) / 3) : 0}
                          </span>
                          <span className="text-xs text-gray-500 ml-1">V</span>
                        </div>

                        <div className="bg-ciklo-dark p-3 rounded-lg border border-gray-700/50">
                          <p className="text-[11px] text-gray-500 font-medium flex items-center gap-1 mb-1">
                            <Clock size={10} /> Horas
                          </p>
                          <span className="text-lg font-bold text-white">{Number(gen.totalHours || 0).toFixed(2)}</span>
                          <span className="text-xs text-gray-500 ml-1">h</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between pt-4 border-t border-gray-800">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs text-gray-500">
                            Modelo: <span className="text-gray-300 font-medium">{gen.model}</span>
                          </span>
                          <span className="text-[10px] text-gray-500">
                            Atualizado: <span className="text-gray-400 font-mono">{formatLastUpdate(gen.lastDataReceived)}</span>
                          </span>
                        </div>
                        <span className="text-xs text-ciklo-orange font-bold flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                          Monitoramento Completo <ChevronRight size={14} />
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
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

        {warningGens > 0 && (
          <button
            onClick={() => navigate('/alarms')}
            className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-bold transition-colors ${
              showOperatorUi
                ? 'py-4 rounded-2xl bg-amber-500 text-black border-amber-500 active:bg-amber-400'
                : 'border-amber-500/30 bg-amber-500/5 text-amber-400 hover:bg-amber-500/10'
            }`}
          >
            <AlertTriangle size={16} />
            {showOperatorUi
              ? `⚠ ${warningGens} AVISO(S) ATIVO(S) — ABRIR`
              : `${warningGens} gerador(es) com aviso — abrir Central de Alarmes`}
          </button>
        )}
      </div>
    </div>
  );
};

export default Dashboard;