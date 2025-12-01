import React from 'react';
import { useNavigate } from 'react-router-dom';
import { MOCK_ALARMS } from '../constants';
import { GeneratorStatus, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { useGenerators } from '../context/GeneratorContext';
import { Zap, Fuel, Activity, MapPin, ChevronRight, Clock } from 'lucide-react';

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
    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${styles[status]} flex items-center gap-1.5 shadow-sm whitespace-nowrap`}>
      <span className={`w-2 h-2 rounded-full ${status === GeneratorStatus.RUNNING ? 'animate-pulse bg-current' : 'bg-current'}`}></span>
      {labels[status]}
    </span>
  );
};

const Dashboard: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { generators: allGenerators } = useGenerators();

  // Filter generators based on user assignment (Admins see all)
  const generators = user?.role === UserRole.ADMIN 
    ? allGenerators 
    : allGenerators.filter(g => user?.assignedGeneratorIds?.includes(g.id));

  const runningGens = generators.filter(g => g.status === GeneratorStatus.RUNNING).length;

  return (
    <div className="space-y-6">
      {/* Header Stats */}
      <div className="grid grid-cols-1">
        <div className="bg-ciklo-card p-4 rounded-xl border border-gray-800 flex items-center justify-between shadow-lg">
          <div>
            <p className="text-gray-400 text-sm font-medium">Geradores Ativos</p>
            <h2 className="text-3xl font-bold text-white mt-1">{runningGens} <span className="text-lg font-normal text-gray-500">/ {generators.length}</span></h2>
          </div>
          <div className="w-12 h-12 rounded-xl bg-blue-500/10 flex items-center justify-center text-blue-500 border border-blue-500/20">
            <Activity size={24} />
          </div>
        </div>
      </div>

      {/* Main Grid */}
      <div className="space-y-4">
        <h3 className="text-lg font-bold text-white flex items-center gap-2 pl-1">
          <div className="w-1 h-5 bg-ciklo-orange rounded-full"></div>
          Visão Geral do Painel
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
                      <h3 className="text-xl font-bold text-white group-hover:text-ciklo-orange transition-colors tracking-tight truncate">{gen.name}</h3>
                      <div className="flex items-center gap-1.5 text-gray-400 text-sm mt-1.5 truncate">
                        <MapPin size={14} className="text-gray-500 shrink-0" />
                        <span className="truncate">{gen.location}</span>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 shrink-0">
                       <div className="flex items-center gap-2">
                         <StatusBadge status={gen.status} />
                       </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                    <div className="bg-ciklo-dark p-3 rounded-lg border border-gray-700/50">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold flex items-center gap-1 mb-1">
                        <Fuel size={10} /> Combustível
                      </p>
                      <div className="flex items-end gap-1">
                        <span className={`text-lg font-bold ${gen.fuelLevel < 20 ? 'text-red-500' : 'text-white'}`}>
                          {gen.fuelLevel}%
                        </span>
                      </div>
                      {/* Fuel Bar */}
                      <div className="w-full bg-gray-800 h-1.5 rounded-full mt-2 overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-500 ${gen.fuelLevel < 20 ? 'bg-red-500' : 'bg-ciklo-yellow'}`}
                          style={{ width: `${gen.fuelLevel}%` }}
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
                        {gen.status === GeneratorStatus.RUNNING ? Math.round((gen.voltageL1 + gen.voltageL2 + gen.voltageL3)/3) : 0}
                      </span>
                      <span className="text-xs text-gray-500 ml-1">V</span>
                    </div>

                    <div className="bg-ciklo-dark p-3 rounded-lg border border-gray-700/50">
                      <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold flex items-center gap-1 mb-1">
                        <Clock size={10} /> Horas
                      </p>
                      <span className="text-lg font-bold text-white">{gen.totalHours}</span>
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
      </div>
    </div>
  );
};

export default Dashboard;