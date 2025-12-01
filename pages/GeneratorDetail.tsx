import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { MOCK_ALARMS } from '../constants';
import { Generator, GeneratorStatus, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { useGenerators } from '../context/GeneratorContext';
import { 
  Power, AlertOctagon, RotateCcw, Settings, Gauge, 
  Thermometer, Droplets, Battery, Zap, Timer, ChevronLeft, Lock 
} from 'lucide-react';

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

const GeneratorDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { generators, updateGenerator } = useGenerators();
  
  // Find generator from context
  const foundGen = generators.find(g => g.id === id);
  const [gen, setGen] = useState<Generator | undefined>(foundGen);
  const [controlLoading, setControlLoading] = useState<string | null>(null);

  // Access check
  const hasAccess = user?.role === UserRole.ADMIN || (user?.assignedGeneratorIds?.includes(id || ''));

  // Sync with context if context updates (e.g. status change from elsewhere)
  useEffect(() => {
    if (foundGen) {
      setGen(foundGen);
    }
  }, [foundGen]);

  // Simulate real-time fluctuations
  useEffect(() => {
    if (!gen || gen.status !== GeneratorStatus.RUNNING) return;

    const interval = setInterval(() => {
      setGen(prev => {
        if (!prev) return prev;
        const jitter = (base: number, amount: number) => base + (Math.random() * amount * 2 - amount);
        return {
          ...prev,
          voltageL1: jitter(220, 2),
          voltageL2: jitter(220, 2),
          voltageL3: jitter(220, 2),
          frequency: jitter(60, 0.1),
          rpm: jitter(1800, 5),
          oilPressure: jitter(4.5, 0.1),
          activePower: jitter(prev.activePower, 2),
        };
      });
    }, 2000);

    return () => clearInterval(interval);
  }, [gen?.status]);

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

  const canControl = user?.role === UserRole.ADMIN || user?.role === UserRole.TECHNICIAN;

  const handleControl = (action: string) => {
    if (!canControl) return;
    setControlLoading(action);
    setTimeout(() => {
      if (action === 'start') {
        const updatedGen = { ...gen, status: GeneratorStatus.RUNNING, rpm: 1800, voltageL1: 220, voltageL2: 220, voltageL3: 220, activePower: 380 };
        setGen(updatedGen);
        updateGenerator(updatedGen);
      } else if (action === 'stop') {
        const updatedGen = { ...gen, status: GeneratorStatus.STOPPED, rpm: 0, voltageL1: 0, voltageL2: 0, voltageL3: 0, activePower: 0 };
        setGen(updatedGen);
        updateGenerator(updatedGen);
      }
      setControlLoading(null);
    }, 1500);
  };

  const alarms = MOCK_ALARMS.filter(a => a.generatorId === gen.id);

  return (
    <div className="space-y-6 relative">
       {/* Full Screen Loading Overlay */}
       {controlLoading && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-ciklo-orange border-t-transparent rounded-full animate-spin mb-4"></div>
          <h2 className="text-2xl font-bold text-white tracking-wide animate-pulse">
            {controlLoading === 'start' ? 'Iniciando Grupo Gerador...' : 'Parando Grupo Gerador...'}
          </h2>
          <p className="text-gray-400 mt-2">Aguarde a confirmação do comando remoto</p>
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
            <button 
               disabled={gen.status === GeneratorStatus.RUNNING || !!controlLoading}
               onClick={() => handleControl('start')}
               className={`px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-all ${
                 gen.status === GeneratorStatus.RUNNING 
                   ? 'bg-gray-800 text-gray-500 cursor-not-allowed opacity-50' 
                   : 'bg-green-600 hover:bg-green-500 text-white shadow-lg shadow-green-900/20'
               }`}
            >
              <Power size={18} /> START
            </button>
            <button 
               disabled={gen.status === GeneratorStatus.STOPPED || !!controlLoading}
               onClick={() => handleControl('stop')}
               className={`px-6 py-2 rounded-lg font-bold flex items-center gap-2 transition-all ${
                 gen.status === GeneratorStatus.STOPPED 
                   ? 'bg-gray-800 text-gray-500 cursor-not-allowed opacity-50' 
                   : 'bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-900/20'
               }`}
            >
               <Power size={18} /> STOP
            </button>
            <button className="p-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg border border-gray-700" title="Reset de Falhas">
              <RotateCcw size={20} />
            </button>
            {user?.role === UserRole.ADMIN && (
              <button className="p-2 bg-red-900/50 hover:bg-red-900 text-red-500 border border-red-900 rounded-lg" title="Parada de Emergência">
                <AlertOctagon size={20} />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Alarms Banner */}
      {alarms.length > 0 && (
        <div className="bg-red-900/20 border border-red-900/50 rounded-lg p-4 flex items-start gap-3">
          <AlertOctagon className="text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="text-red-500 font-bold">Alarmes Ativos</h3>
            <ul className="mt-1 space-y-1">
              {alarms.map(a => (
                <li key={a.id} className="text-sm text-red-300 flex justify-between">
                  <span>{a.message}</span>
                  <span className="text-xs opacity-75">{a.timestamp}</span>
                </li>
              ))}
            </ul>
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

        {/* Center Col: Electrical Table */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-ciklo-card rounded-xl border border-gray-800 p-6 h-full">
            <h3 className="text-white font-bold mb-4 flex items-center gap-2">
              <Zap size={18} className="text-ciklo-yellow" /> Parâmetros Elétricos
            </h3>

            {/* Big Power Display */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-ciklo-dark rounded-lg p-4 border-l-4 border-ciklo-orange">
                <p className="text-gray-400 text-xs uppercase font-bold">Potência Ativa</p>
                <p className="text-3xl font-bold text-white mt-1">{gen.activePower.toFixed(1)} <span className="text-base font-normal text-gray-500">kW</span></p>
              </div>
              <div className="bg-ciklo-dark rounded-lg p-4 border-l-4 border-blue-500">
                <p className="text-gray-400 text-xs uppercase font-bold">Fator de Potência</p>
                <p className="text-3xl font-bold text-white mt-1">{gen.powerFactor} <span className="text-base font-normal text-gray-500">cos φ</span></p>
              </div>
              <div className="bg-ciklo-dark rounded-lg p-4 border-l-4 border-purple-500">
                <p className="text-gray-400 text-xs uppercase font-bold">Frequência</p>
                <p className="text-3xl font-bold text-white mt-1">{gen.frequency.toFixed(1)} <span className="text-base font-normal text-gray-500">Hz</span></p>
              </div>
            </div>

            {/* Phase Table */}
            <div className="overflow-hidden rounded-lg border border-gray-700">
              <table className="w-full text-left">
                <thead className="bg-gray-800">
                  <tr>
                    <th className="p-3 text-xs font-semibold text-gray-400 uppercase">Fase</th>
                    <th className="p-3 text-xs font-semibold text-gray-400 uppercase text-right">Tensão (V)</th>
                    <th className="p-3 text-xs font-semibold text-gray-400 uppercase text-right">Corrente (A)</th>
                    <th className="p-3 text-xs font-semibold text-gray-400 uppercase text-right">Barra</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-800">
                  <tr>
                    <td className="p-3 text-white font-bold">L1</td>
                    <td className="p-3 text-right text-ciklo-yellow font-mono text-lg">{gen.voltageL1.toFixed(0)}</td>
                    <td className="p-3 text-right text-blue-400 font-mono text-lg">{gen.currentL1.toFixed(1)}</td>
                    <td className="p-3">
                      <div className="w-full bg-gray-700 h-1.5 rounded-full">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(gen.currentL1 / 200) * 100}%` }}></div>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 text-white font-bold">L2</td>
                    <td className="p-3 text-right text-ciklo-yellow font-mono text-lg">{gen.voltageL2.toFixed(0)}</td>
                    <td className="p-3 text-right text-blue-400 font-mono text-lg">{gen.currentL2.toFixed(1)}</td>
                    <td className="p-3">
                      <div className="w-full bg-gray-700 h-1.5 rounded-full">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(gen.currentL2 / 200) * 100}%` }}></div>
                      </div>
                    </td>
                  </tr>
                  <tr>
                    <td className="p-3 text-white font-bold">L3</td>
                    <td className="p-3 text-right text-ciklo-yellow font-mono text-lg">{gen.voltageL3.toFixed(0)}</td>
                    <td className="p-3 text-right text-blue-400 font-mono text-lg">{gen.currentL3.toFixed(1)}</td>
                    <td className="p-3">
                      <div className="w-full bg-gray-700 h-1.5 rounded-full">
                        <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(gen.currentL3 / 200) * 100}%` }}></div>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
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
    </div>
  );
};

export default GeneratorDetail;