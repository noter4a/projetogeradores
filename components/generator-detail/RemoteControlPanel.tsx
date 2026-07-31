import React from 'react';
import {
  Radio, RotateCcw, RefreshCw, Settings, Ban, Play, Square, UtilityPole,
} from 'lucide-react';
import { Generator, GeneratorStatus } from '../../types';

interface RemoteControlPanelProps {
  gen: Generator;
  isConnected: boolean;
  onControl: (action: string) => void;
}

const RemoteControlPanel: React.FC<RemoteControlPanelProps> = ({ gen, isConnected, onControl }) => {
  // DSE: trocar de modo já deu partida no motor sozinho em campo (Ciklo55) —
  // não é bloqueado (decisão do usuário), mas handleControl pede confirmação
  // explícita antes de mandar auto/manual. Ver comentário lá e em mqtt.js.
  const isDseController = gen.controller?.toLowerCase() === 'dse';

  return (
    <div className="bg-ciklo-card rounded-xl border border-gray-800 p-5">
      <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-2">
        <h3 className="text-white font-bold flex items-center gap-2 text-sm">
          <Radio size={18} className="text-ciklo-orange" /> Painel de Controle Remoto
        </h3>
        <div className="flex items-center gap-2">
          <div className={`px-2 py-1 rounded bg-gray-900 border ${isConnected ? 'border-gray-700' : 'border-red-900'} text-[10px] font-mono ${isConnected ? 'text-ciklo-yellow' : 'text-red-500'} flex items-center gap-1`}>
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
            {isConnected ? 'CONECTADO' : 'DESCONECTADO'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Operation Mode & Remote Command (Left side - 5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-xs text-gray-500 font-semibold">Modo de Operação</label>
              <button
                onClick={() => onControl('reset')}
                className="text-[10px] flex items-center gap-1 text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-2 py-0.5 rounded border border-gray-700 transition-colors"
              >
                <RotateCcw size={10} /> Reset falhas
              </button>
            </div>
            <div className="flex bg-gray-900/50 p-1.5 rounded-lg border border-gray-800 relative">
              <div className="flex-1 flex gap-2">
                {/* AUTO BUTTON */}
                <button
                  disabled={gen.operationMode === 'AUTO'}
                  onClick={() => onControl('auto')}
                  className={`flex-1 py-3 rounded-md font-semibold text-xs flex items-center justify-center gap-2 transition-all ${gen.operationMode === 'AUTO'
                    ? 'bg-green-600 text-white cursor-default opacity-100'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                  <RefreshCw size={14} className={gen.operationMode === 'AUTO' ? 'animate-spin-slow' : ''} /> Automático
                </button>

                {/* MANUAL BUTTON */}
                <button
                  disabled={gen.operationMode === 'MANUAL'}
                  onClick={() => onControl('manual')}
                  className={`flex-1 py-3 rounded-md font-semibold text-xs flex items-center justify-center gap-2 transition-all ${gen.operationMode === 'MANUAL'
                    ? 'bg-green-600 text-white cursor-default opacity-100'
                    : 'text-gray-400 hover:text-white hover:bg-white/5'
                    }`}
                >
                  <Settings size={14} className={gen.operationMode === 'MANUAL' ? 'animate-spin-slow' : ''} /> Manual
                </button>

                {/* INIBIDO BUTTON (KVA only) */}
                {(gen.controller?.toLowerCase() === 'kva' || gen.controller?.toLowerCase() === 'kvar') && (
                  <button
                    disabled={gen.operationMode === 'INHIBITED'}
                    onClick={() => onControl('inhibit')}
                    className={`flex-1 py-3 rounded-md font-semibold text-xs flex items-center justify-center gap-2 transition-all ${gen.operationMode === 'INHIBITED'
                      ? 'bg-amber-600 text-white cursor-default opacity-100'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                  >
                    <Ban size={14} /> Inibido
                  </button>
                )}
              </div>
            </div>

            <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-800 mt-4 relative">
              <label className="text-xs text-gray-500 font-semibold mb-3 block text-center">Comando Remoto</label>
              <div className="flex gap-3">
                {(() => {
                  // DSE: "Telemetry start/cancel if in auto mode" (35732/35733)
                  // dá partida/parada sob demanda sem sair do modo Automático —
                  // por isso AUTO não desabilita Partida/Parar aqui, diferente
                  // dos demais controladores. Ver mesma lógica em canStartMobile.
                  const startDisabled = gen.status === GeneratorStatus.RUNNING
                    || (!isDseController && gen.operationMode === 'AUTO')
                    || gen.operationMode === 'INHIBITED';
                  const stopDisabled = gen.status === GeneratorStatus.STOPPED
                    || (!isDseController && gen.operationMode === 'AUTO')
                    || gen.operationMode === 'INHIBITED';
                  return (
                    <>
                      <button
                        disabled={startDisabled}
                        onClick={() => onControl('start')}
                        className={`flex-1 py-4 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all border ${startDisabled
                          ? 'bg-green-900/20 text-green-600 border-green-900/50 opacity-50 cursor-not-allowed'
                          : 'bg-green-600 hover:bg-green-500 text-white border-green-500'
                          }`}
                      >
                        <Play size={18} fill="currentColor" /> Partida
                      </button>
                      <button
                        disabled={stopDisabled}
                        onClick={() => onControl('stop')}
                        className={`flex-1 py-4 rounded-lg font-semibold text-sm flex items-center justify-center gap-2 transition-all border ${stopDisabled
                          ? 'bg-red-900/20 text-red-600 border-red-900/50 opacity-50 cursor-not-allowed'
                          : 'bg-red-600 hover:bg-red-500 text-white border-red-500'
                          }`}
                      >
                        <Square size={18} fill="currentColor" /> Parar
                      </button>
                    </>
                  );
                })()}
              </div>
            </div>
          </div>
        </div>

        {/* Divider for mobile/desktop */}
        <div className="hidden lg:block lg:col-span-1 border-l border-gray-800 mx-auto h-full w-px"></div>

        {/* QTA (Right side - 6 cols) */}
        <div className="lg:col-span-6 flex flex-col justify-center">
          <div className="text-center mb-6">
            <label className="text-xs text-gray-500 font-semibold block">Status da Transferência (QTA)</label>
            <span className="text-xs font-mono text-gray-400">
              {gen.operationMode === 'AUTO' ? 'Controle Automático Ativo' : gen.operationMode === 'INHIBITED' ? 'Modo Inibido Ativo' : 'Controle Manual Habilitado'}
            </span>
          </div>

          <div className="flex flex-col items-center justify-center relative px-2 md:px-4 py-8 bg-gray-900/30 rounded-xl border border-dashed border-gray-800">
            {/* SVG Single Line Diagram */}
            <div className="w-full max-w-[500px] h-[120px] relative">
              <svg viewBox="0 0 500 120" className="w-full h-full drop-shadow-lg">
                {/* DEFS for Glows */}
                <defs>
                  <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                  <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
                    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                    <feMerge>
                      <feMergeNode in="coloredBlur" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>

                {/* --- STATIC LINES --- */}
                <line x1="50" y1="80" x2="130" y2="80" stroke={gen.mainsBreakerClosed ? "#22c55e" : "#ef4444"} strokeWidth="4" className="transition-colors duration-500" />
                <line x1="170" y1="80" x2="200" y2="80" stroke={gen.mainsBreakerClosed ? "#22c55e" : "#374151"} strokeWidth="4" className="transition-colors duration-500" />
                <line x1="300" y1="80" x2="330" y2="80" stroke={gen.genBreakerClosed ? "#22c55e" : "#374151"} strokeWidth="4" className="transition-colors duration-500" />
                <line x1="370" y1="80" x2="450" y2="80" stroke={gen.genBreakerClosed ? "#22c55e" : "#ef4444"} strokeWidth="4" className="transition-colors duration-500" />

                {/* --- ICONS --- */}
                {(() => {
                  // Verde = rede energizada (tensão presente), mesmo com a chave aberta.
                  // Cinza somente quando realmente não há tensão medida na rede.
                  const isMainsPresent = [
                    gen.mainsVoltageL1, gen.mainsVoltageL2, gen.mainsVoltageL3,
                    gen.mainsVoltageL12, gen.mainsVoltageL23, gen.mainsVoltageL31,
                  ].some(v => (v ?? 0) > 10);
                  return (
                    <g transform="translate(10, 50)" className={isMainsPresent ? "text-green-500" : "text-gray-500"}>
                      <circle cx="20" cy="20" r="22" fill="none" stroke={isMainsPresent ? "#22c55e" : "#6b7280"} strokeWidth="3" />
                      <UtilityPole size={24} x={8} y={8} className="text-current" strokeWidth={1.5} />
                      {gen.mainsBreakerClosed && (
                        <circle cx="20" cy="20" r="28" fill="none" stroke="#22c55e" strokeWidth="2" strokeDasharray="10 10" className="animate-spin-slow origin-[20px_20px] opacity-50" />
                      )}
                      <text x="20" y="-10" textAnchor="middle" fill="currentColor" fontSize="12" fontWeight="bold">REDE</text>
                    </g>
                  );
                })()}

                <g transform="translate(450, 55)">
                  <circle cx="20" cy="20" r="22" fill="none" stroke={gen.status === GeneratorStatus.RUNNING ? "#22c55e" : "#6b7280"} strokeWidth="3" />
                  <text x="20" y="26" textAnchor="middle" fill={gen.status === GeneratorStatus.RUNNING ? "#22c55e" : "#6b7280"} fontSize="20" fontWeight="bold">G</text>
                  {gen.status === GeneratorStatus.RUNNING && (
                    <circle cx="20" cy="20" r="28" fill="none" stroke="#22c55e" strokeWidth="2" strokeDasharray="10 10" className="animate-spin-slow origin-[20px_20px] opacity-50" />
                  )}
                  <text x="20" y="-15" textAnchor="middle" fill="currentColor" className="text-gray-400" fontSize="12" fontWeight="bold">GERADOR</text>
                </g>

                <g transform="translate(200, 55)">
                  <rect x="0" y="0" width="100" height="50" rx="4" fill="#1f2937" stroke={gen.mainsBreakerClosed || gen.genBreakerClosed ? "#f97316" : "#374151"} strokeWidth="3" />
                  <text x="50" y="30" textAnchor="middle" fill={gen.mainsBreakerClosed || gen.genBreakerClosed ? "#f97316" : "#6b7280"} fontSize="14" fontWeight="bold" letterSpacing="2">CARGA</text>
                </g>

                {/* mainsBreakerClosed/genBreakerClosed vêm null quando o próprio
                    controlador não reporta o contator (ex: este DSE4501 devolve
                    "Unimplemented" pro relé de rede e de gerador via GenComm — não
                    é falha de leitura, o equipamento não expõe esse dado). Um
                    terceiro estado cinza "INDISPONÍVEL" evita mostrar ABERTO
                    (vermelho) quando na verdade é "não sei". */}
                {(() => {
                  const mainsUnknown = gen.mainsBreakerClosed == null;
                  const mainsColor = mainsUnknown ? '#6b7280' : gen.mainsBreakerClosed ? '#22c55e' : '#ef4444';
                  const mainsLabel = mainsUnknown ? 'INDISPONÍVEL' : gen.mainsBreakerClosed ? 'FECHADO' : 'ABERTO';
                  return (
                    <g
                      className={`cursor-pointer group hover:opacity-80 transition-all ${gen.operationMode === 'AUTO' || gen.operationMode === 'INHIBITED' ? 'cursor-not-allowed opacity-50' : ''}`}
                      onClick={() => { if (gen.operationMode !== 'AUTO' && gen.operationMode !== 'INHIBITED') onControl('toggleMains'); }}
                    >
                      <rect x="120" y="30" width="60" height="60" fill="transparent" />
                      <line
                        x1="130" y1="80" x2="170" y2="80"
                        stroke={mainsColor}
                        strokeWidth="6"
                        strokeLinecap="round"
                        className="transition-all duration-500 ease-in-out"
                        transform={gen.mainsBreakerClosed ? "rotate(0 130 80)" : "rotate(-35 130 80)"}
                      />
                      <circle cx="130" cy="80" r="4" fill="#fff" />
                      <circle cx="170" cy="80" r="4" fill="#fff" />
                      <text x="150" y="110" textAnchor="middle" fontSize="10" fill={mainsColor} fontWeight="bold">
                        {mainsLabel}
                      </text>
                    </g>
                  );
                })()}

                {(() => {
                  const genUnknown = gen.genBreakerClosed == null;
                  const genColor = genUnknown ? '#6b7280' : gen.genBreakerClosed ? '#22c55e' : '#ef4444';
                  const genLabel = genUnknown ? 'INDISPONÍVEL' : gen.genBreakerClosed ? 'FECHADO' : 'ABERTO';
                  return (
                    <g
                      className={`cursor-pointer group hover:opacity-80 transition-all ${gen.operationMode === 'AUTO' || gen.operationMode === 'INHIBITED' ? 'cursor-not-allowed opacity-50' : ''}`}
                      onClick={() => { if (gen.operationMode !== 'AUTO' && gen.operationMode !== 'INHIBITED') onControl('toggleGen'); }}
                    >
                      <rect x="320" y="30" width="60" height="60" fill="transparent" />
                      <line
                        x1="370" y1="80" x2="330" y2="80"
                        stroke={genColor}
                        strokeWidth="6"
                        strokeLinecap="round"
                        className="transition-all duration-500 ease-in-out"
                        transform={gen.genBreakerClosed ? "rotate(0 370 80)" : "rotate(35 370 80)"}
                      />
                      <circle cx="370" cy="80" r="4" fill="#fff" />
                      <circle cx="330" cy="80" r="4" fill="#fff" />
                      <text x="350" y="110" textAnchor="middle" fontSize="10" fill={genColor} fontWeight="bold">
                        {genLabel}
                      </text>
                    </g>
                  );
                })()}
              </svg>

              <div className="absolute top-0 right-0">
                {gen.operationMode === 'AUTO' && (
                  <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-1 rounded border border-blue-500/30">
                    Controle Automático (Chaves Bloqueadas)
                  </span>
                )}
                {gen.operationMode === 'INHIBITED' && (
                  <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-1 rounded border border-amber-500/30">
                    Modo Inibido (Controles Bloqueados)
                  </span>
                )}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
};

export default RemoteControlPanel;
