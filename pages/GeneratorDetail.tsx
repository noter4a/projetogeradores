
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Generator, GeneratorStatus, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { useGenerators, socket } from '../context/GeneratorContext'; // Import socket
import { useAlarms } from '../context/AlarmContext';
import AlarmPopup from '../components/AlarmPopup'; // NEW
import {
  Power, AlertOctagon, RotateCcw, Settings, Gauge,
  Thermometer, Droplets, Battery, Zap, Timer, ChevronLeft, Lock,
  RefreshCw, UtilityPole, Cable, TrendingUp, BarChart3, Play, Square,
  Radio, LayoutDashboard, Sliders, Plus, Save, Send, Trash2, Ban
} from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const CircularGauge = ({ value, max, label, unit, color = "text-ciklo-yellow", size = 120 }: any) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (value / max) * circumference;

  return (
    <div className="relative flex flex-col items-center justify-center p-4 bg-ciklo-dark rounded-xl border border-gray-700/50">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90 w-full h-full">
          <circle
            className="text-gray-700"
            strokeWidth="8"
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx="50%"
            cy="50%"
          />
          <circle
            className={`${color} transition-all duration-1000 ease-out`}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx="50%"
            cy="50%"
          />
        </svg>
        <div className="absolute top-0 left-0 w-full h-full flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white">{value.toFixed(1)}</span>
          <span className="text-xs text-gray-400">{unit}</span>
        </div>
      </div>
      <span className="mt-2 text-sm font-medium text-gray-400">{label}</span>
    </div>
  );
};

interface ModbusRegister {
  id: string;
  address: string;
  name: string;
  value: string;
  unit: string;
  type: 'READ' | 'WRITE';
}

const GeneratorDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { generators, updateGenerator } = useGenerators();
  const { alarms } = useAlarms();

  // Find generator from context
  const foundGen = generators.find(g => g.id === id);
  const [gen, setGen] = useState<Generator | undefined>(foundGen);
  const [controlLoading, setControlLoading] = useState<string | null>(null);

  // Tab State
  const [activeTab, setActiveTab] = useState<'operational' | 'modbus'>('operational');

  // Modbus State (Starts Empty/Zero)
  const [modbusRegisters, setModbusRegisters] = useState<ModbusRegister[]>([
    { id: '1', address: '40001', name: 'Rotação do Motor', value: '0', unit: 'RPM', type: 'READ' },
    { id: '2', address: '40002', name: 'Pressão de Óleo', value: '0', unit: 'Bar', type: 'READ' },
    { id: '3', address: '40003', name: 'Temperatura Água', value: '0', unit: '°C', type: 'READ' },
    { id: '4', address: '40100', name: 'Comando Partida', value: '0', unit: 'Bool', type: 'WRITE' },
    { id: '5', address: '40101', name: 'Set Point Carga', value: '0', unit: 'kW', type: 'WRITE' },
  ]);

  // Inputs for adding new READ registers
  const [readAddress, setReadAddress] = useState('');
  const [readName, setReadName] = useState('');
  const [readUnit, setReadUnit] = useState('');

  // Inputs for adding new WRITE registers
  const [writeAddress, setWriteAddress] = useState('');
  const [writeName, setWriteName] = useState('');

  // View Mode for Voltages (Phase-Neutral vs Phase-Phase)
  const [voltageViewMode, setVoltageViewMode] = useState<'PN' | 'PP'>('PN');
  const [mainsVoltageViewMode, setMainsVoltageViewMode] = useState<'PN' | 'PP'>('PN');

  // Local Alarm Acknowledgment State
  const [acknowledgedAlarms, setAcknowledgedAlarms] = useState<Set<string>>(new Set());

  // Reset acknowledgment if alarm clears
  useEffect(() => {
    if (!gen?.alarms?.startFailure) {
      setAcknowledgedAlarms(prev => {
        const next = new Set(prev);
        next.delete('startFailure');
        return next;
      });
    }
  }, [gen?.alarms?.startFailure]);

  // Access check
  const hasAccess = user?.role === UserRole.ADMIN || (user?.assignedGeneratorIds?.includes(id || ''));

  // Sync with context if context updates (e.g. status change from elsewhere)
  useEffect(() => {
    if (foundGen) {
      setGen(foundGen);
    }
  }, [foundGen]);

  // Socket.io Listener moved to GeneratorContext.tsx
  // This ensures Dashboard and Detail views are always in sync.

  // Generate Mock History Data (Last 24 Hours) for Load Chart
  // Placeholder for real history data (DB integration needed later)
  const historyData = useMemo(() => {
    return []; // No mock history displayed
  }, [gen?.id]);



  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center p-6">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
          <Lock size={32} className="text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Acesso Negado</h2>
        <p className="text-gray-400 mb-6">Você não tem permissão para visualizar este gerador.</p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
        >
          Voltar ao Painel
        </button>
      </div>
    );
  }

  if (!gen) return <div className="text-white p-6">Gerador não encontrado ou foi removido.</div>;

  // Allows Admin, Technician AND Client to control. Monitor is excluded.
  const canControl = user?.role === UserRole.ADMIN || user?.role === UserRole.TECHNICIAN || user?.role === UserRole.CLIENT;

  // Advanced control is RESTRICTED to Admin and Technician only. Client is excluded.
  const canAccessAdvanced = user?.role === UserRole.ADMIN || user?.role === UserRole.TECHNICIAN;

  const handleControl = (action: string) => {
    if (!canControl) return;
    setControlLoading(action);

    // Emit Socket.IO Command
    // Assuming we have access to the 'socket' instance here.
    // If socket is not available via prop or context, we might need to use a request or import the socket instance if it's global.
    // Ideally, GeneratorContext provides the socket or a method.
    // For now, let's assume standard fetch or if socket is global.
    // Actually, looking at imports, there is no socket instance.
    // I should use a simple POST endpoint if socket is not easily accessible, OR use the existing socket connection if available.
    // Let's use a simple fetch to a new endpoint `/api/control` which calls the MQTT service, OR better,
    // assuming the `socket` is available from `useContext`.
    // GeneratorContext.tsx likely has the socket.
    // Since I cannot change Context easily right now, I will use a POST request to a new API endpoint, calling the command.
    // BUT I didn't create an endpoint.
    // I added a socket listener in index.js.
    // So I need to use the socket.

    // Check if 'socket' is available in window or imports.
    // Previous files showed `import { socket } from '../context/GeneratorContext'`.
    // Let's check imports.
    // If not, I will add `import { socket } from '../context/GeneratorContext';`

    // Use gen.ip (which maps to MQTT Device ID e.g., "Ciklo1") if available.
    // Fallback to gen.id only if IP is missing.
    const targetId = gen.ip || gen.id;

    // Use HTTP API (Relative path works for both Dev Proxy and Nginx Prod)
    fetch('/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ generatorId: targetId, action })
    })
      .then(res => res.json())
      .then(data => {
        if (!data.success) {
          console.error('Command Failed:', data.message);
          alert(`Falha ao enviar comando: ${data.message}`);
        } else {
          console.log('Command Sent:', data.message);
        }
      })
      .catch(err => {
        console.error('Network Error:', err);
        alert('Erro de conexão ao enviar comando.');
      })
      .finally(() => {
        // Minimum loading time for UX
        setTimeout(() => {
          setControlLoading(null);
        }, 500);
      });
  }



  const handleAddReadParameter = () => {
    if (!readAddress || !readName) return;

    const newRegister: ModbusRegister = {
      id: Date.now().toString(),
      address: readAddress,
      name: readName,
      unit: readUnit,
      type: 'READ',
      value: '0' // Initial value
    };

    setModbusRegisters([...modbusRegisters, newRegister]);
    setReadAddress('');
    setReadName('');
    setReadUnit('');
  };

  const handleAddWriteCommand = () => {
    if (!writeAddress || !writeName) return;

    const newRegister: ModbusRegister = {
      id: Date.now().toString(),
      address: writeAddress,
      name: writeName,
      unit: '',
      type: 'WRITE',
      value: '0'
    };

    setModbusRegisters([...modbusRegisters, newRegister]);
    setWriteAddress('');
    setWriteName('');
  };

  const handleRemoveRegister = (id: string) => {
    setModbusRegisters(modbusRegisters.filter(r => r.id !== id));
  };

  const handleWriteRegister = (id: string, newValue: string) => {
    // TODO: Implement Real Modbus Write Command
    console.log(`[Real Write] Register ${id} -> ${newValue}`);
  };

  const activeAlarms = alarms.filter(a => a.generatorId === gen.id && a.active);

  return (
    <div className="space-y-6 relative pb-10">
      {/* Full Screen Loading Overlay */}
      {controlLoading && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-ciklo-orange border-t-transparent rounded-full animate-spin mb-4"></div>
          <h2 className="text-2xl font-bold text-white tracking-wide animate-pulse">
            Processando Comando...
          </h2>
          <p className="text-gray-400 mt-2">Aguardando confirmação remota</p>
        </div>
      )}

      {/* NEW ALARM POPUP */}
      <AlarmPopup generatorId={gen.ip || gen.id} />

      {/* Top Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigate('/')}
            className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <ChevronLeft size={24} />
          </button>
          <div>
            <h1 className="text-2xl font-bold text-white">{gen.name}</h1>
            <p className="text-gray-400 flex items-center gap-2 text-sm">
              <span className={`w-2 h-2 rounded-full ${gen.status === GeneratorStatus.RUNNING ? 'bg-green-500' : 'bg-red-500'}`}></span>
              Status: {gen.status} | {gen.model}
            </p>
          </div>
        </div>

        {canControl && (
          <div className="flex items-center gap-2">
            {user?.role === UserRole.ADMIN && (
              <button className="p-2 bg-red-900/50 hover:bg-red-900 text-red-500 border border-red-900 rounded-lg" title="Parada de Emergência">
                <AlertOctagon size={20} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-gray-800">
        <nav className="flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('operational')}
            className={`
              group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-all
              ${activeTab === 'operational'
                ? 'border-ciklo-orange text-ciklo-orange'
                : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-300'}
            `}
          >
            <LayoutDashboard className={`mr-2 h-5 w-5 ${activeTab === 'operational' ? 'text-ciklo-orange' : 'text-gray-500'}`} />
            Painel Operacional
          </button>

          {canAccessAdvanced && (
            <button
              onClick={() => setActiveTab('modbus')}
              className={`
                group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-all
                ${activeTab === 'modbus'
                  ? 'border-ciklo-orange text-ciklo-orange'
                  : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-300'}
              `}
            >
              <Sliders className={`mr-2 h-5 w-5 ${activeTab === 'modbus' ? 'text-ciklo-orange' : 'text-gray-500'}`} />
              Controle Avançado (Modbus)
            </button>
          )}
        </nav>
      </div>



      {/* OPERATIONAL TAB */}
      {activeTab === 'operational' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Unified Control & QTA Section */}
          {canControl && (
            <div className="bg-ciklo-card rounded-xl border border-gray-800 p-5">
              <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-2">
                <h3 className="text-white font-bold flex items-center gap-2 text-sm uppercase tracking-wider">
                  <Radio size={18} className="text-ciklo-orange" /> Painel de Controle Remoto
                  {gen.reg78_hex && <span className="text-[10px] text-yellow-500 font-mono ml-2">(DEBUG: Reg78=0x{gen.reg78_hex.toUpperCase()})</span>}
                </h3>
                <div className="flex items-center gap-2">
                  <div className="px-2 py-1 rounded bg-gray-900 border border-gray-700 text-[10px] font-mono text-ciklo-yellow flex items-center gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
                    CONECTADO
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                {/* Operation Mode & Remote Command (Left side - 5 cols) */}
                <div className="lg:col-span-5 space-y-6">
                  <div>
                    <div className="flex justify-between items-center mb-2">
                      <label className="text-[10px] text-gray-500 uppercase font-bold">Modo de Operação</label>
                      <button
                        onClick={() => handleControl('reset')}
                        className="text-[10px] flex items-center gap-1 text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-2 py-0.5 rounded border border-gray-700 transition-colors"
                      >
                        <RotateCcw size={10} /> RESET FALHAS
                      </button>
                    </div>
                    <div className="flex bg-gray-900/50 p-1.5 rounded-lg border border-gray-800 relative">
                      <div className="flex-1 flex gap-2">
                        {/* AUTO BUTTON */}
                        <button
                          onClick={() => handleControl('auto')}
                          className={`flex-1 py-3 rounded-md font-bold text-xs flex items-center justify-center gap-2 transition-all ${gen.operationMode === 'AUTO'
                            ? 'bg-green-600 text-white shadow-lg shadow-green-900/20'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                          <RefreshCw size={14} className={gen.operationMode === 'AUTO' ? 'animate-spin-slow' : ''} /> AUTOMÁTICO
                        </button>

                        {/* MANUAL BUTTON */}
                        <button
                          onClick={() => handleControl('manual')}
                          className={`flex-1 py-3 rounded-md font-bold text-xs flex items-center justify-center gap-2 transition-all ${gen.operationMode === 'MANUAL'
                            ? 'bg-green-600 text-white shadow-lg shadow-green-900/20'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                          <Settings size={14} className={gen.operationMode === 'MANUAL' ? 'animate-spin-slow' : ''} /> MANUAL
                        </button>

                        {/* INHIBIT BUTTON */}
                        <button
                          onClick={() => handleControl('inhibit')}
                          // Note: SGC 120 Stop is equiv to Inhibit in some contexts, but usually Inhibit is Mode.
                          className={`flex-1 py-3 rounded-md font-bold text-xs flex items-center justify-center gap-2 transition-all ${gen.operationMode === 'INHIBITED'
                            ? 'bg-red-600 text-white shadow-lg shadow-red-900/20'
                            : 'text-gray-400 hover:text-white hover:bg-white/5'
                            }`}
                        >
                          <Ban size={14} /> INIBIDO
                        </button>
                      </div>
                    </div>

                    <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-800 relative">
                      {gen.operationMode === 'INHIBITED' && (
                        <div className="absolute inset-0 bg-black/60 z-10 flex items-center justify-center rounded-lg backdrop-blur-[1px]">
                          <span className="bg-red-900/80 text-red-200 px-3 py-1 rounded border border-red-500/50 text-xs font-bold uppercase flex items-center gap-2">
                            <Lock size={12} /> Comandos Bloqueados
                          </span>
                        </div>
                      )}
                      <label className="text-[10px] text-gray-500 uppercase font-bold mb-3 block text-center">Comando Remoto</label>
                      <div className="flex gap-3">
                        <button
                          disabled={gen.status === GeneratorStatus.RUNNING || gen.operationMode === 'INHIBITED'}
                          onClick={() => handleControl('start')}
                          className={`flex-1 py-4 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all border shadow-lg ${gen.status === GeneratorStatus.RUNNING
                            ? 'bg-green-900/20 text-green-600 border-green-900/50 opacity-50 cursor-not-allowed'
                            : 'bg-green-600 hover:bg-green-500 text-white border-green-500 hover:shadow-green-900/20'
                            }`}
                        >
                          <Play size={18} fill="currentColor" /> PARTIDA
                        </button>
                        <button
                          disabled={gen.status === GeneratorStatus.STOPPED || gen.operationMode === 'INHIBITED'}
                          onClick={() => handleControl('stop')}
                          className={`flex-1 py-4 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all border shadow-lg ${gen.status === GeneratorStatus.STOPPED
                            ? 'bg-red-900/20 text-red-600 border-red-900/50 opacity-50 cursor-not-allowed'
                            : 'bg-red-600 hover:bg-red-500 text-white border-red-500 hover:shadow-red-900/20'
                            }`}
                        >
                          <Square size={18} fill="currentColor" /> PARAR
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Divider for mobile/desktop */}
                <div className="hidden lg:block lg:col-span-1 border-l border-gray-800 mx-auto h-full w-px"></div>

                {/* QTA (Right side - 6 cols) */}
                <div className="lg:col-span-6 flex flex-col justify-center">
                  <div className="text-center mb-6">
                    <label className="text-[10px] text-gray-500 uppercase font-bold block">Status da Transferência (QTA)</label>
                    <span className="text-xs font-mono text-gray-400">
                      {gen.operationMode === 'AUTO' ? 'Controle Automático Ativo' :
                        gen.operationMode === 'INHIBITED' ? 'Transferência Bloqueada' : 'Controle Manual Habilitado'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between relative px-2 md:px-4 py-8 bg-gray-900/30 rounded-xl border border-dashed border-gray-800">
                    {/* Grid Line */}
                    <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-700 -z-0"></div>

                    {/* Mains Breaker */}
                    <div className="relative z-10 flex flex-col items-center gap-2 md:gap-3 bg-ciklo-card p-2 md:p-3 rounded-xl border border-gray-800 shadow-lg">
                      <div className={`p-1.5 md:p-2 rounded-full ${gen.mainsBreakerClosed ? 'bg-green-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'bg-red-500/20 text-red-500'}`}>
                        <UtilityPole size={20} className="md:w-6 md:h-6" />
                      </div>
                      <button
                        onClick={() => handleControl('toggleMains')}
                        disabled={gen.operationMode === 'AUTO' || gen.operationMode === 'INHIBITED'}
                        className={`px-2 md:px-3 py-1.5 rounded text-[9px] md:text-[10px] font-bold border transition-all w-20 sm:w-24 md:w-28 text-center ${gen.mainsBreakerClosed
                          ? 'bg-green-900/30 text-green-400 border-green-500'
                          : 'bg-red-900/30 text-red-400 border-red-500 hover:border-red-400'
                          } ${(gen.operationMode === 'AUTO' || gen.operationMode === 'INHIBITED') ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-700'}`}
                      >
                        {gen.mainsBreakerClosed ? 'REDE FECHADA' : 'REDE ABERTA'}
                      </button>
                    </div>

                    {/* Load Center */}
                    <div className="relative z-10 flex flex-col items-center">
                      <div className={`w-10 h-10 md:w-14 md:h-14 rounded-full flex items-center justify-center shadow-lg border-4 transition-all duration-500 ${(gen.mainsBreakerClosed || gen.genBreakerClosed)
                        ? 'bg-ciklo-orange border-ciklo-orange text-black shadow-orange-500/20'
                        : 'bg-gray-800 border-gray-700 text-gray-500'
                        }`}>
                        <Zap size={20} className={`md:w-7 md:h-7 ${(gen.mainsBreakerClosed || gen.genBreakerClosed) ? 'fill-current' : ''}`} />
                      </div>
                      <span className="mt-2 text-[9px] md:text-[10px] font-bold text-gray-500 uppercase">Carga</span>
                    </div>

                    {/* Gen Breaker */}
                    <div className="relative z-10 flex flex-col items-center gap-2 md:gap-3 bg-ciklo-card p-2 md:p-3 rounded-xl border border-gray-800 shadow-lg">
                      <div className={`p-1.5 md:p-2 rounded-full ${gen.genBreakerClosed ? 'bg-green-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'bg-red-500/20 text-red-500'}`}>
                        <Power size={20} className="md:w-6 md:h-6" />
                      </div>
                      <button
                        onClick={() => handleControl('toggleGen')}
                        disabled={gen.operationMode === 'AUTO' || gen.operationMode === 'INHIBITED'}
                        className={`px-2 md:px-3 py-1.5 rounded text-[9px] md:text-[10px] font-bold border transition-all w-20 sm:w-24 md:w-28 text-center ${gen.genBreakerClosed
                          ? 'bg-green-900/30 text-green-400 border-green-500'
                          : 'bg-red-900/30 text-red-400 border-red-500 hover:border-red-400'
                          } ${(gen.operationMode === 'AUTO' || gen.operationMode === 'INHIBITED') ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-700'}`}
                      >
                        {gen.genBreakerClosed ? 'GER. FECHADO' : 'GER. ABERTO'}
                      </button>
                    </div>
                  </div>
                  {/* DEBUG BREAKER STATUS */}
                  <div className="mt-2 text-center">
                    <p className="text-[10px] text-gray-500 font-mono">
                      DEBUG: Reg23={gen.reg23} | Reg24={gen.reg24}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Main SCADA Dashboard Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

            {/* Left Col: Mechanical Gauges */}
            <div className="space-y-6">
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
                    <span className="text-xl font-bold text-white">{gen.engineTemp}°C</span>
                  </div>
                  <div className="bg-ciklo-dark p-3 rounded-lg flex items-center justify-between border border-gray-700/50">
                    <div className="flex items-center gap-2 text-gray-400">
                      <Droplets size={18} /> Nível Combustível
                    </div>
                    <span className={`text-xl font-bold ${gen.fuelLevel < 20 ? 'text-red-500' : 'text-green-500'}`}>{gen.fuelLevel}%</span>
                  </div>
                  <div className="bg-ciklo-dark p-3 rounded-lg flex items-center justify-between border border-gray-700/50">
                    <div className="flex items-center gap-2 text-gray-400">
                      <Battery size={18} /> Tensão Bateria
                    </div>
                    <span className="text-xl font-bold text-white">{gen.batteryVoltage} V</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Center Col: Electrical Table (Comparison) */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-ciklo-card rounded-xl border border-gray-800 p-6 h-full flex flex-col">
                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                  <Zap size={18} className="text-ciklo-yellow" /> Parâmetros Elétricos
                </h3>

                {/* Big Power Display */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="bg-ciklo-dark rounded-lg p-4 border-l-4 border-ciklo-orange">
                    <p className="text-gray-400 text-xs uppercase font-bold">Potência Ativa Total</p>
                    <p className="text-3xl font-bold text-white mt-1">{Number(gen.activePower || 0).toFixed(1)} <span className="text-base font-normal text-gray-500">kW</span></p>
                  </div>
                  <div className="bg-ciklo-dark rounded-lg p-4 border-l-4 border-blue-500">
                    <p className="text-gray-400 text-xs uppercase font-bold">Fator de Potência</p>
                    <p className="text-3xl font-bold text-white mt-1">{gen.powerFactor} <span className="text-base font-normal text-gray-500">cos φ</span></p>
                  </div>
                </div>

                <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* GENERATOR COLUMN */}
                  <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
                      <div className="flex items-center gap-2 text-green-500">
                        <Power size={18} />
                        <span className="font-bold uppercase tracking-wider text-sm">Gerador</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {/* Toggle Phase-Neutral / Phase-Phase */}
                        <div className="flex bg-gray-800 rounded-lg p-0.5">
                          <button
                            onClick={() => setVoltageViewMode('PN')}
                            className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${voltageViewMode === 'PN' ? 'bg-gray-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                          >
                            F-N
                          </button>
                          <button
                            onClick={() => setVoltageViewMode('PP')}
                            className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${voltageViewMode === 'PP' ? 'bg-gray-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                          >
                            F-F
                          </button>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-gray-400 block">Frequência</span>
                          <span className="text-lg font-bold text-white">{Number(gen.frequency || 0).toFixed(1)} Hz</span>
                        </div>
                      </div>
                    </div>
                    <table className="w-full text-left">
                      <thead className="text-[10px] text-gray-500 uppercase">
                        <tr>
                          <th className="pb-2">Fase</th>
                          <th className="pb-2 text-right">Tensão</th>
                          <th className="pb-2 text-right">Corrente</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800 text-sm">
                        {voltageViewMode === 'PN' ? (
                          <>
                            <tr>
                              <td className="py-2 text-gray-300 font-bold">L1</td>
                              <td className="py-2 text-right text-ciklo-yellow">{Number(gen.voltageL1 || 0).toFixed(0)} V</td>
                              <td className="py-2 text-right text-blue-400">{Number(gen.currentL1 || 0).toFixed(0)} A</td>
                            </tr>
                            <tr>
                              <td className="py-2 text-gray-300 font-bold">L2</td>
                              <td className="py-2 text-right text-ciklo-yellow">{Number(gen.voltageL2 || 0).toFixed(0)} V</td>
                              <td className="py-2 text-right text-blue-400">{Number(gen.currentL2 || 0).toFixed(0)} A</td>
                            </tr>
                            <tr>
                              <td className="py-2 text-gray-300 font-bold">L3</td>
                              <td className="py-2 text-right text-ciklo-yellow">{Number(gen.voltageL3 || 0).toFixed(0)} V</td>
                              <td className="py-2 text-right text-blue-400">{Number(gen.currentL3 || 0).toFixed(0)} A</td>
                            </tr>
                          </>
                        ) : (
                          <>
                            <tr>
                              <td className="py-2 text-gray-300 font-bold">L1-L2</td>
                              <td className="py-2 text-right text-ciklo-yellow">{Number(gen.voltageL12 || 0).toFixed(0)} V</td>
                              <td className="py-2 text-right text-blue-400">{Number(gen.currentL1 || 0).toFixed(0)} A</td>
                            </tr>
                            <tr>
                              <td className="py-2 text-gray-300 font-bold">L2-L3</td>
                              <td className="py-2 text-right text-ciklo-yellow">{Number(gen.voltageL23 || 0).toFixed(0)} V</td>
                              <td className="py-2 text-right text-blue-400">{Number(gen.currentL2 || 0).toFixed(0)} A</td>
                            </tr>
                            <tr>
                              <td className="py-2 text-gray-300 font-bold">L3-L1</td>
                              <td className="py-2 text-right text-ciklo-yellow">{Number(gen.voltageL31 || 0).toFixed(0)} V</td>
                              <td className="py-2 text-right text-blue-400">{Number(gen.currentL3 || 0).toFixed(0)} A</td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {/* MAINS COLUMN */}
                  <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
                      <div className="flex items-center gap-2 text-gray-400">
                        <UtilityPole size={18} />
                        <span className="font-bold uppercase tracking-wider text-sm">Rede</span>
                      </div>
                      <div className="flex items-center gap-3">
                        {/* Toggle Phase-Neutral / Phase-Phase */}
                        <div className="flex bg-gray-800 rounded-lg p-0.5">
                          <button
                            onClick={() => setMainsVoltageViewMode('PN')}
                            className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${mainsVoltageViewMode === 'PN' ? 'bg-gray-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                          >
                            F-N
                          </button>
                          <button
                            onClick={() => setMainsVoltageViewMode('PP')}
                            className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${mainsVoltageViewMode === 'PP' ? 'bg-gray-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                          >
                            F-F
                          </button>
                        </div>
                        <div className="text-right">
                          <span className="text-xs text-gray-400 block">Frequência</span>
                          <span className="text-lg font-bold text-white">{Number(gen.mainsFrequency || 0).toFixed(1)} Hz</span>
                        </div>
                      </div>
                    </div>
                    <table className="w-full text-left">
                      <thead className="text-[10px] text-gray-500 uppercase">
                        <tr>
                          <th className="pb-2">Fase</th>
                          <th className="pb-2 text-right">Tensão</th>
                          <th className="pb-2 text-right">Corrente</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800 text-sm">
                        {mainsVoltageViewMode === 'PN' ? (
                          <>
                            <tr>
                              <td className="py-2 text-gray-300 font-bold">L1</td>
                              <td className="py-2 text-right text-gray-400">{Number(gen.mainsVoltageL1 || 0).toFixed(0)} V</td>
                              <td className="py-2 text-right text-gray-500">{Number(gen.mainsCurrentL1 || 0).toFixed(0)} A</td>
                            </tr>
                            <tr>
                              <td className="py-2 text-gray-300 font-bold">L2</td>
                              <td className="py-2 text-right text-gray-400">{Number(gen.mainsVoltageL2 || 0).toFixed(0)} V</td>
                              <td className="py-2 text-right text-gray-500">{Number(gen.mainsCurrentL2 || 0).toFixed(0)} A</td>
                            </tr>
                            <tr>
                              <td className="py-2 text-gray-300 font-bold">L3</td>
                              <td className="py-2 text-right text-gray-400">{Number(gen.mainsVoltageL3 || 0).toFixed(0)} V</td>
                              <td className="py-2 text-right text-gray-500">{Number(gen.mainsCurrentL3 || 0).toFixed(0)} A</td>
                            </tr>
                          </>
                        ) : (
                          <>
                            <tr>
                              <td className="py-2 text-gray-300 font-bold">L1-L2</td>
                              <td className="py-2 text-right text-gray-400">{Number(gen.mainsVoltageL12 || 0).toFixed(0)} V</td>
                              <td className="py-2 text-right text-blue-400">{Number(gen.mainsCurrentL1 || 0).toFixed(0)} A</td>
                            </tr>
                            <tr>
                              <td className="py-2 text-gray-300 font-bold">L2-L3</td>
                              <td className="py-2 text-right text-gray-400">{Number(gen.mainsVoltageL23 || 0).toFixed(0)} V</td>
                              <td className="py-2 text-right text-blue-400">{Number(gen.mainsCurrentL2 || 0).toFixed(0)} A</td>
                            </tr>
                            <tr>
                              <td className="py-2 text-gray-300 font-bold">L3-L1</td>
                              <td className="py-2 text-right text-gray-400">{Number(gen.mainsVoltageL31 || 0).toFixed(0)} V</td>
                              <td className="py-2 text-right text-blue-400">{Number(gen.mainsCurrentL3 || 0).toFixed(0)} A</td>
                            </tr>
                          </>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="mt-6 p-4 bg-gray-800/50 rounded-lg border border-dashed border-gray-700 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Timer className="text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Horímetro Total</p>
                      <p className="text-xl font-mono text-white">{Number(gen.totalHours || 0).toFixed(2)} h</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">Próxima Manutenção</p>
                    <p className="text-sm text-ciklo-orange font-bold">Em 150h</p>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Load Chart Section */}
          <div className="bg-ciklo-card rounded-xl border border-gray-800 p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-white font-bold flex items-center gap-2">
                <TrendingUp size={18} className="text-ciklo-orange" /> Curva de Carga (kW)
              </h3>
              <div className="flex gap-2 text-xs text-gray-400">
                <span className="flex items-center gap-1"><div className="w-2 h-2 rounded-full bg-ciklo-yellow"></div> Potência Ativa</span>
              </div>
            </div>

            <div className="h-[350px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={historyData}>
                  <defs>
                    <linearGradient id="colorPower" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#FACC15" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#FACC15" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                  <XAxis
                    dataKey="time"
                    stroke="#666"
                    tick={{ fontSize: 11 }}
                    minTickGap={30}
                  />
                  <YAxis
                    stroke="#666"
                    tick={{ fontSize: 11 }}
                    unit=" kW"
                  />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#1E1E1E', borderColor: '#333', color: '#fff', borderRadius: '8px' }}
                    itemStyle={{ color: '#FACC15' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="power"
                    stroke="#FACC15"
                    strokeWidth={2}
                    fillOpacity={1}
                    fill="url(#colorPower)"
                    animationDuration={1500}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )
      }

      {/* MODBUS CONTROL TAB */}
      {
        activeTab === 'modbus' && canAccessAdvanced && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header Info */}
            <div className="bg-ciklo-card p-6 rounded-xl border border-gray-800">
              <h2 className="text-lg font-bold text-white mb-2">Comunicação Modbus</h2>
              <p className="text-sm text-gray-400">Protocolo: <span className="text-white font-mono">{gen.protocol || 'modbus_tcp'}</span> | IP: <span className="text-white font-mono">{gen.ip || '192.168.1.100'}</span> | Porta: <span className="text-white font-mono">{gen.port || '502'}</span> | ID: <span className="text-white font-mono">{gen.slaveId || '1'}</span></p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* READ SECTION */}
              <div className="bg-ciklo-card p-6 rounded-xl border border-gray-800 flex flex-col h-full">
                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                  <LayoutDashboard size={18} className="text-blue-500" /> Monitoramento (Leitura)
                </h3>

                {/* Add Register Form */}
                <div className="bg-ciklo-dark p-4 rounded-lg border border-gray-700 mb-6">
                  <p className="text-xs text-gray-500 font-bold uppercase mb-3">Adicionar Parâmetro</p>
                  <div className="grid grid-cols-12 gap-2">
                    <input
                      type="text"
                      placeholder="Endereço (Ex: 40001)"
                      value={readAddress}
                      onChange={(e) => setReadAddress(e.target.value)}
                      className="col-span-3 bg-gray-800 border border-gray-600 rounded p-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      placeholder="Nome do Parâmetro"
                      value={readName}
                      onChange={(e) => setReadName(e.target.value)}
                      className="col-span-4 bg-gray-800 border border-gray-600 rounded p-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      placeholder="Un."
                      value={readUnit}
                      onChange={(e) => setReadUnit(e.target.value)}
                      className="col-span-2 bg-gray-800 border border-gray-600 rounded p-2 text-xs text-white"
                    />
                    <button
                      onClick={handleAddReadParameter}
                      className="col-span-3 bg-blue-600 hover:bg-blue-500 text-white rounded p-2 text-xs font-bold flex items-center justify-center gap-1"
                    >
                      <Plus size={12} /> Adicionar
                    </button>
                  </div>
                </div>

                {/* Register List - UPDATED TO SHOW ALL REGISTERS */}
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left">
                    <thead className="bg-gray-800 text-gray-500 text-[10px] uppercase">
                      <tr>
                        <th className="p-3">Endereço</th>
                        <th className="p-3">Nome</th>
                        <th className="p-3 text-right">Valor</th>
                        <th className="p-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 text-sm">
                      {modbusRegisters.map(reg => (
                        <tr key={reg.id} className="hover:bg-gray-800/30">
                          <td className="p-3 font-mono text-gray-400">{reg.address}</td>
                          <td className="p-3 text-white">{reg.name}</td>
                          <td className="p-3 text-right font-mono font-bold text-ciklo-yellow">
                            {reg.value} <span className="text-gray-600 text-xs font-normal">{reg.unit}</span>
                          </td>
                          <td className="p-3 text-right">
                            <button onClick={() => handleRemoveRegister(reg.id)} className="text-gray-600 hover:text-red-500">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {modbusRegisters.length === 0 && (
                        <tr><td colSpan={4} className="p-4 text-center text-gray-600 text-xs">Nenhum parâmetro monitorado</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* WRITE SECTION - UPDATED TO TABLE & ALL REGISTERS */}
              <div className="bg-ciklo-card p-6 rounded-xl border border-gray-800 flex flex-col h-full">
                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                  <Sliders size={18} className="text-ciklo-orange" /> Comando (Escrita)
                </h3>

                {/* Add Control Form */}
                <div className="bg-ciklo-dark p-4 rounded-lg border border-gray-700 mb-6">
                  <p className="text-xs text-gray-500 font-bold uppercase mb-3">Configurar Novo Comando</p>
                  <div className="grid grid-cols-12 gap-2">
                    <input
                      type="text"
                      placeholder="Endereço"
                      value={writeAddress}
                      onChange={(e) => setWriteAddress(e.target.value)}
                      className="col-span-3 bg-gray-800 border border-gray-600 rounded p-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      placeholder="Nome do Comando"
                      value={writeName}
                      onChange={(e) => setWriteName(e.target.value)}
                      className="col-span-6 bg-gray-800 border border-gray-600 rounded p-2 text-xs text-white"
                    />
                    <button
                      onClick={handleAddWriteCommand}
                      className="col-span-3 bg-ciklo-orange hover:bg-orange-500 text-black rounded p-2 text-xs font-bold flex items-center justify-center gap-1"
                    >
                      <Plus size={12} /> Configurar
                    </button>
                  </div>
                </div>

                {/* Updated Table Layout for Write Commands (Showing ALL registers) */}
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left">
                    <thead className="bg-gray-800 text-gray-500 text-[10px] uppercase">
                      <tr>
                        <th className="p-3">Endereço</th>
                        <th className="p-3">Nome</th>
                        <th className="p-3 text-right">Valor Atual</th>
                        <th className="p-3 text-right">Definir</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 text-sm">
                      {modbusRegisters.map(reg => (
                        <tr key={reg.id} className="hover:bg-gray-800/30">
                          <td className="p-3 font-mono text-gray-400">{reg.address}</td>
                          <td className="p-3 text-white">{reg.name}</td>
                          <td className="p-3 text-right font-mono font-bold text-ciklo-yellow">
                            {reg.value} <span className="text-gray-600 text-xs font-normal">{reg.unit}</span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <input
                                type="text"
                                className="w-16 bg-black border border-gray-600 rounded p-1 text-xs text-white text-right"
                                placeholder="Novo"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleWriteRegister(reg.id, (e.target as HTMLInputElement).value);
                                    (e.target as HTMLInputElement).value = '';
                                  }
                                }}
                              />
                              <button
                                className="p-1.5 bg-green-600 hover:bg-green-500 text-white rounded"
                                onClick={(e) => {
                                  const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                                  if (input) {
                                    handleWriteRegister(reg.id, input.value);
                                    input.value = '';
                                  }
                                }}
                              >
                                <Send size={14} />
                              </button>
                              <button onClick={() => handleRemoveRegister(reg.id)} className="text-gray-600 hover:text-red-500 ml-1">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {modbusRegisters.length === 0 && (
                        <tr><td colSpan={4} className="p-4 text-center text-gray-600 text-xs">Nenhum comando disponível</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )
      }

      {/* CRITICAL ALARM POPUP */}
      {/* CRITICAL ALARM POPUP (Generic for any Reg 66 Code > 0) */}
      {gen?.alarmCode > 0 && !acknowledgedAlarms.has(`alarm_${gen.alarmCode}`) && (
        <div className="fixed inset-0 z-[100] bg-red-900/40 backdrop-blur-md flex items-center justify-center animate-in fade-in duration-300">
          <div className="bg-[#1a0f0f] border-2 border-red-500 rounded-2xl p-8 max-w-md w-full shadow-[0_0_50px_rgba(239,68,68,0.5)] relative overflow-hidden">
            {/* Background Pulse Effect */}
            <div className="absolute inset-0 bg-red-500/10 animate-pulse pointer-events-none"></div>

            <div className="relative z-10 flex flex-col items-center text-center">
              <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mb-6 animate-bounce">
                <AlertOctagon size={48} className="text-red-500" />
              </div>

              <h2 className="text-3xl font-black text-white mb-2 uppercase tracking-widest">
                {gen.alarmCode === 0x0131 ? "FALHA DE PARTIDA" : "ALARME DETECTADO"}
              </h2>

              <p className="text-red-200 mb-8 text-lg">
                {gen.alarmCode === 0x0131
                  ? "O gerador falhou ao tentar iniciar o motor. Verifique o equipamento imediatamente."
                  : "O gerador reportou um código de alarme. Verifique o código abaixo."}
              </p>

              <div className="w-full bg-red-900/30 rounded-lg p-4 border border-red-800 mb-6">
                <p className="text-red-400 text-xs uppercase font-bold mb-1">Código do Alarme</p>
                <p className="text-2xl font-mono font-bold text-white">0x{Number(gen.alarmCode).toString(16).toUpperCase().padStart(4, '0')}</p>
                <p className="text-xs text-gray-400 mt-1">Reg 66 (Modbus)</p>
              </div>

              <button
                onClick={() => {
                  setAcknowledgedAlarms(prev => new Set(prev).add(`alarm_${gen.alarmCode}`));
                }}
                className="w-full py-4 bg-red-600 hover:bg-red-500 text-white font-bold rounded-xl transition-all shadow-lg hover:shadow-red-500/30 uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Reconhecer Alarme
              </button>
            </div>
          </div>
        </div>
      )}
    </div >
  );
};

export default GeneratorDetail;
