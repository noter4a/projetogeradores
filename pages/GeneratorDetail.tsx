
import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Generator, GeneratorStatus, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { useGenerators } from '../context/GeneratorContext';
import { useAlarms } from '../context/AlarmContext';
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

  // Modbus Mock State
  const [modbusRegisters, setModbusRegisters] = useState<ModbusRegister[]>([
    { id: '1', address: '40001', name: 'Rotação do Motor', value: '1800', unit: 'RPM', type: 'READ' },
    { id: '2', address: '40002', name: 'Pressão de Óleo', value: '4.5', unit: 'Bar', type: 'READ' },
    { id: '3', address: '40003', name: 'Temperatura Água', value: '88', unit: '°C', type: 'READ' },
    { id: '4', address: '40100', name: 'Comando Partida', value: '0', unit: 'Bool', type: 'WRITE' },
    { id: '5', address: '40101', name: 'Set Point Carga', value: '450', unit: 'kW', type: 'WRITE' },
  ]);

  // Inputs for adding new READ registers
  const [readAddress, setReadAddress] = useState('');
  const [readName, setReadName] = useState('');
  const [readUnit, setReadUnit] = useState('');

  // Inputs for adding new WRITE registers
  const [writeAddress, setWriteAddress] = useState('');
  const [writeName, setWriteName] = useState('');

  // Access check
  const hasAccess = user?.role === UserRole.ADMIN || (user?.assignedGeneratorIds?.includes(id || ''));

  // Sync with context if context updates (e.g. status change from elsewhere)
  useEffect(() => {
    if (foundGen) {
      setGen(foundGen);
    }
  }, [foundGen]);

  // Generate Mock History Data (Last 24 Hours) for Load Chart
  const historyData = useMemo(() => {
    const data = [];
    const now = new Date();
    for (let i = 24; i >= 0; i--) {
      const d = new Date(now.getTime() - i * 60 * 60 * 1000); // Hourly points
      
      // Simulate somewhat realistic load curve
      const basePower = gen?.powerKVA ? gen.powerKVA * 0.6 : 300;
      // Peak hours simulation (e.g., 18:00 - 21:00)
      const hour = d.getHours();
      let loadFactor = 1;
      if (hour >= 18 && hour <= 21) loadFactor = 1.3;
      if (hour >= 0 && hour <= 5) loadFactor = 0.4;

      const randomPower = Math.max(0, (basePower * loadFactor) + (Math.random() * 30 - 15));

      data.push({
        time: d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }),
        power: gen?.status === GeneratorStatus.RUNNING || i > 12 ? randomPower : 0, // Simulate running in past or present
      });
    }
    return data;
  }, [gen?.id]);

  // Simulate real-time fluctuations
  useEffect(() => {
    // Both gen and mains jitter
    const interval = setInterval(() => {
      setGen(prev => {
        if (!prev) return prev;
        const jitter = (base: number, amount: number) => base > 0 ? base + (Math.random() * amount * 2 - amount) : 0;
        
        return {
          ...prev,
          voltageL1: prev.status === GeneratorStatus.RUNNING ? jitter(220, 2) : 0,
          voltageL2: prev.status === GeneratorStatus.RUNNING ? jitter(220, 2) : 0,
          voltageL3: prev.status === GeneratorStatus.RUNNING ? jitter(220, 2) : 0,
          frequency: prev.status === GeneratorStatus.RUNNING ? jitter(60, 0.1) : 0,
          rpm: prev.status === GeneratorStatus.RUNNING ? jitter(1800, 5) : 0,
          oilPressure: prev.status === GeneratorStatus.RUNNING ? jitter(4.5, 0.1) : 0,
          activePower: prev.status === GeneratorStatus.RUNNING ? jitter(prev.activePower, 2) : 0,
          
          // Mains simulation (always present unless simulating failure)
          mainsVoltageL1: jitter(220, 1),
          mainsVoltageL2: jitter(220, 1),
          mainsVoltageL3: jitter(220, 1),
          mainsFrequency: jitter(60, 0.05),
          // Simulate mains current if mains breaker is closed (meaning mains is feeding load)
          mainsCurrentL1: prev.breakerMains === 'CLOSED' ? jitter(150, 5) : 0,
          mainsCurrentL2: prev.breakerMains === 'CLOSED' ? jitter(150, 5) : 0,
          mainsCurrentL3: prev.breakerMains === 'CLOSED' ? jitter(150, 5) : 0,
        };
      });
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Simulate Modbus Reading Fluctuations
  useEffect(() => {
    const interval = setInterval(() => {
      setModbusRegisters(prev => prev.map(reg => {
        if (reg.type === 'READ') {
          // Parse value, jitter it slightly if it's a number
          const val = parseFloat(reg.value);
          if (!isNaN(val)) {
            const noise = (Math.random() - 0.5) * (val * 0.02); // 2% noise
            return { ...reg, value: (val + noise).toFixed(reg.address === '40001' ? 0 : 1) };
          }
        }
        return reg;
      }));
    }, 2500);
    return () => clearInterval(interval);
  }, []);

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
    
    setTimeout(() => {
      let updatedGen = { ...gen };

      switch (action) {
        case 'start':
          if (gen.operationMode !== 'INHIBITED') {
            updatedGen = { ...updatedGen, status: GeneratorStatus.RUNNING, rpm: 1800, voltageL1: 220, voltageL2: 220, voltageL3: 220, activePower: 380 };
          }
          break;
        case 'stop':
          if (gen.operationMode !== 'INHIBITED') {
             updatedGen = { ...updatedGen, status: GeneratorStatus.STOPPED, rpm: 0, voltageL1: 0, voltageL2: 0, voltageL3: 0, activePower: 0 };
          }
          break;
        case 'auto':
          updatedGen = { ...updatedGen, operationMode: 'AUTO' };
          break;
        case 'manual':
          updatedGen = { ...updatedGen, operationMode: 'MANUAL' };
          break;
        case 'inhibited':
          updatedGen = { ...updatedGen, operationMode: 'INHIBITED', status: GeneratorStatus.STOPPED, rpm: 0, voltageL1: 0, voltageL2: 0, voltageL3: 0, activePower: 0 };
          break;
        case 'toggleMains':
           const newMainsState = gen.breakerMains === 'CLOSED' ? 'OPEN' : 'CLOSED';
           updatedGen = { 
             ...updatedGen, 
             breakerMains: newMainsState,
             breakerGen: newMainsState === 'CLOSED' ? 'OPEN' : updatedGen.breakerGen 
           };
           break;
        case 'toggleGen':
           const newGenState = gen.breakerGen === 'CLOSED' ? 'OPEN' : 'CLOSED';
           updatedGen = { 
             ...updatedGen, 
             breakerGen: newGenState,
             breakerMains: newGenState === 'CLOSED' ? 'OPEN' : updatedGen.breakerMains 
           };
           break;
        case 'reset':
           // Reset logic simulation
           break;
      }

      setGen(updatedGen);
      updateGenerator(updatedGen);
      setControlLoading(null);
    }, 1000);
  };

  const handleAddReadParameter = () => {
    if(!readAddress || !readName) return;
    
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
    if(!writeAddress || !writeName) return;

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
    // Simulate write delay
    setTimeout(() => {
      setModbusRegisters(prev => prev.map(r => r.id === id ? { ...r, value: newValue } : r));
    }, 500);
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

      {/* Alarms Banner */}
      {activeAlarms.length > 0 && (
        <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-4 flex items-start gap-3">
          <AlertOctagon className="text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-red-500 font-bold">Alarmes Ativos</h3>
            <ul className="mt-1 space-y-1">
              {activeAlarms.map(a => (
                <li key={a.id} className="text-sm text-red-300 flex justify-between">
                  <span>{a.message}</span>
                  <span className="text-xs opacity-75">{a.timestamp}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* OPERATIONAL TAB */}
      {activeTab === 'operational' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {/* Unified Control & QTA Section */}
          {canControl && (
            <div className="bg-ciklo-card rounded-xl border border-gray-800 p-5">
              <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-2">
                  <h3 className="text-white font-bold flex items-center gap-2 text-sm uppercase tracking-wider">
                    <Radio size={18} className="text-ciklo-orange" /> Painel de Controle Remoto
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
                        <div className="flex gap-2 p-1 bg-ciklo-dark rounded-lg border border-gray-700">
                            <button 
                              onClick={() => handleControl('auto')}
                              className={`flex-1 py-3 rounded-md font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                                gen.operationMode === 'AUTO'
                                  ? 'bg-ciklo-orange text-black shadow-lg' 
                                  : 'text-gray-400 hover:text-white'
                              }`}
                            >
                              <RefreshCw size={14} className={gen.operationMode === 'AUTO' ? 'animate-spin-slow' : ''} /> AUTOMÁTICO
                            </button>
                            <button 
                              onClick={() => handleControl('manual')}
                              className={`flex-1 py-3 rounded-md font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                                gen.operationMode === 'MANUAL' 
                                  ? 'bg-ciklo-orange text-black shadow-lg' 
                                  : 'text-gray-400 hover:text-white'
                              }`}
                            >
                              <Settings size={14} /> MANUAL
                            </button>
                            <button 
                              onClick={() => handleControl('inhibited')}
                              className={`flex-1 py-3 rounded-md font-bold text-xs flex items-center justify-center gap-2 transition-all ${
                                gen.operationMode === 'INHIBITED' 
                                  ? 'bg-red-500 text-white shadow-lg' 
                                  : 'text-gray-400 hover:text-white'
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
                              className={`flex-1 py-4 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all border shadow-lg ${
                                gen.status === GeneratorStatus.RUNNING
                                  ? 'bg-green-900/20 text-green-600 border-green-900/50 opacity-50 cursor-not-allowed' 
                                  : 'bg-green-600 hover:bg-green-500 text-white border-green-500 hover:shadow-green-900/20'
                              }`}
                          >
                            <Play size={18} fill="currentColor" /> PARTIDA
                          </button>
                          <button 
                              disabled={gen.status === GeneratorStatus.STOPPED || gen.operationMode === 'INHIBITED'}
                              onClick={() => handleControl('stop')}
                              className={`flex-1 py-4 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all border shadow-lg ${
                                gen.status === GeneratorStatus.STOPPED
                                  ? 'bg-red-900/20 text-red-600 border-red-900/50 opacity-50 cursor-not-allowed' 
                                  : 'bg-red-600 hover:bg-red-500 text-white border-red-500 hover:shadow-red-900/20'
                              }`}
                          >
                            <Square size={18} fill="currentColor" /> PARAR
                          </button>
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
                    
                    <div className="flex items-center justify-between relative px-4 py-8 bg-gray-900/30 rounded-xl border border-dashed border-gray-800">
                        {/* Grid Line */}
                        <div className="absolute top-1/2 left-0 w-full h-1 bg-gray-700 -z-0"></div>

                        {/* Mains Breaker */}
                        <div className="relative z-10 flex flex-col items-center gap-3 bg-ciklo-card p-3 rounded-xl border border-gray-800 shadow-lg">
                            <div className={`p-2 rounded-full ${gen.breakerMains === 'CLOSED' ? 'bg-green-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'bg-gray-700 text-gray-400'}`}>
                              <UtilityPole size={24} />
                            </div>
                            <button 
                              onClick={() => handleControl('toggleMains')}
                              disabled={gen.operationMode === 'AUTO' || gen.operationMode === 'INHIBITED'}
                              className={`px-3 py-1.5 rounded text-[10px] font-bold border transition-all w-28 text-center ${
                                gen.breakerMains === 'CLOSED' 
                                ? 'bg-green-900/30 text-green-400 border-green-500' 
                                : 'bg-gray-800 text-gray-500 border-gray-600 hover:border-gray-500'
                              } ${(gen.operationMode === 'AUTO' || gen.operationMode === 'INHIBITED') ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-700'}`}
                            >
                              {gen.breakerMains === 'CLOSED' ? 'REDE FECHADA' : 'REDE ABERTA'}
                            </button>
                        </div>

                        {/* Load Center */}
                        <div className="relative z-10 flex flex-col items-center">
                            <div className={`w-14 h-14 rounded-full flex items-center justify-center shadow-lg border-4 transition-all duration-500 ${
                              (gen.breakerMains === 'CLOSED' || gen.breakerGen === 'CLOSED')
                              ? 'bg-ciklo-orange border-ciklo-orange text-black shadow-orange-500/20'
                              : 'bg-gray-800 border-gray-700 text-gray-500'
                            }`}>
                              <Zap size={28} className={ (gen.breakerMains === 'CLOSED' || gen.breakerGen === 'CLOSED') ? 'fill-current' : '' } />
                            </div>
                            <span className="mt-2 text-[10px] font-bold text-gray-500 uppercase">Carga</span>
                        </div>

                        {/* Gen Breaker */}
                        <div className="relative z-10 flex flex-col items-center gap-3 bg-ciklo-card p-3 rounded-xl border border-gray-800 shadow-lg">
                            <div className={`p-2 rounded-full ${gen.breakerGen === 'CLOSED' ? 'bg-green-500 text-black shadow-[0_0_15px_rgba(34,197,94,0.5)]' : 'bg-gray-700 text-gray-400'}`}>
                              <Power size={24} />
                            </div>
                            <button 
                              onClick={() => handleControl('toggleGen')}
                              disabled={gen.operationMode === 'AUTO' || gen.operationMode === 'INHIBITED'}
                              className={`px-3 py-1.5 rounded text-[10px] font-bold border transition-all w-28 text-center ${
                                gen.breakerGen === 'CLOSED' 
                                ? 'bg-green-900/30 text-green-400 border-green-500' 
                                : 'bg-gray-800 text-gray-500 border-gray-600 hover:border-gray-500'
                              } ${(gen.operationMode === 'AUTO' || gen.operationMode === 'INHIBITED') ? 'opacity-50 cursor-not-allowed' : 'hover:bg-gray-700'}`}
                            >
                              {gen.breakerGen === 'CLOSED' ? 'GER. FECHADO' : 'GER. ABERTO'}
                            </button>
                        </div>
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
                    <p className="text-3xl font-bold text-white mt-1">{gen.activePower.toFixed(1)} <span className="text-base font-normal text-gray-500">kW</span></p>
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
                             <div className="text-right">
                                <span className="text-xs text-gray-400 block">Frequência</span>
                                <span className="text-lg font-bold text-white">{gen.frequency.toFixed(1)} Hz</span>
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
                                <tr>
                                    <td className="py-2 text-gray-300 font-bold">L1</td>
                                    <td className="py-2 text-right text-ciklo-yellow">{gen.voltageL1.toFixed(0)} V</td>
                                    <td className="py-2 text-right text-blue-400">{gen.currentL1.toFixed(0)} A</td>
                                </tr>
                                <tr>
                                    <td className="py-2 text-gray-300 font-bold">L2</td>
                                    <td className="py-2 text-right text-ciklo-yellow">{gen.voltageL2.toFixed(0)} V</td>
                                    <td className="py-2 text-right text-blue-400">{gen.currentL2.toFixed(0)} A</td>
                                </tr>
                                <tr>
                                    <td className="py-2 text-gray-300 font-bold">L3</td>
                                    <td className="py-2 text-right text-ciklo-yellow">{gen.voltageL3.toFixed(0)} V</td>
                                    <td className="py-2 text-right text-blue-400">{gen.currentL3.toFixed(0)} A</td>
                                </tr>
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
                             <div className="text-right">
                                <span className="text-xs text-gray-400 block">Frequência</span>
                                <span className="text-lg font-bold text-white">{(gen.mainsFrequency || 0).toFixed(1)} Hz</span>
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
                                <tr>
                                    <td className="py-2 text-gray-300 font-bold">L1</td>
                                    <td className="py-2 text-right text-white">{(gen.mainsVoltageL1 || 0).toFixed(0)} V</td>
                                    <td className="py-2 text-right text-blue-400">{(gen.mainsCurrentL1 || 0).toFixed(0)} A</td>
                                </tr>
                                <tr>
                                    <td className="py-2 text-gray-300 font-bold">L2</td>
                                    <td className="py-2 text-right text-white">{(gen.mainsVoltageL2 || 0).toFixed(0)} V</td>
                                    <td className="py-2 text-right text-blue-400">{(gen.mainsCurrentL2 || 0).toFixed(0)} A</td>
                                </tr>
                                <tr>
                                    <td className="py-2 text-gray-300 font-bold">L3</td>
                                    <td className="py-2 text-right text-white">{(gen.mainsVoltageL3 || 0).toFixed(0)} V</td>
                                    <td className="py-2 text-right text-blue-400">{(gen.mainsCurrentL3 || 0).toFixed(0)} A</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </div>

                <div className="mt-6 p-4 bg-gray-800/50 rounded-lg border border-dashed border-gray-700 flex justify-between items-center">
                  <div className="flex items-center gap-3">
                    <Timer className="text-gray-400" />
                    <div>
                      <p className="text-xs text-gray-500">Horímetro Total</p>
                      <p className="text-xl font-mono text-white">{gen.totalHours.toLocaleString()} h</p>
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
                      <stop offset="5%" stopColor="#FACC15" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#FACC15" stopOpacity={0}/>
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
      )}

      {/* MODBUS CONTROL TAB */}
      {activeTab === 'modbus' && canAccessAdvanced && (
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
                                            if(e.key === 'Enter') {
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
      )}
    </div>
  );
};

export default GeneratorDetail;
