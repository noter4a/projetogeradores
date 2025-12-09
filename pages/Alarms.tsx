
import React from 'react';
import { useAlarms } from '../context/AlarmContext';
import { AlertTriangle, AlertCircle, CheckCircle, Trash2 } from 'lucide-react';
import { format } from 'date-fns';

const Alarms: React.FC = () => {
  const { alarms, ackAlarm, clearAll } = useAlarms();

  const activeCount = alarms.filter(a => a.active).length;
  const criticalCount = alarms.filter(a => a.active && a.severity === 'CRITICAL').length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Central de Alarmes</h2>
          <p className="text-gray-400 text-sm">Monitoramento de eventos e falhas do sistema</p>
        </div>
        
        {alarms.length > 0 && (
          <button 
            onClick={clearAll}
            className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors text-sm"
          >
            <Trash2 size={16} /> Limpar Histórico
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-ciklo-card border border-gray-800 p-4 rounded-xl flex items-center gap-4">
           <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
             <AlertTriangle size={24} />
           </div>
           <div>
             <p className="text-2xl font-bold text-white">{criticalCount}</p>
             <p className="text-sm text-gray-400">Críticos Ativos</p>
           </div>
        </div>
        <div className="bg-ciklo-card border border-gray-800 p-4 rounded-xl flex items-center gap-4">
           <div className="w-12 h-12 rounded-full bg-yellow-500/10 flex items-center justify-center text-yellow-500">
             <AlertCircle size={24} />
           </div>
           <div>
             <p className="text-2xl font-bold text-white">{activeCount}</p>
             <p className="text-sm text-gray-400">Total Ativos</p>
           </div>
        </div>
        <div className="bg-ciklo-card border border-gray-800 p-4 rounded-xl flex items-center gap-4">
           <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
             <CheckCircle size={24} />
           </div>
           <div>
             <p className="text-2xl font-bold text-white">{alarms.length}</p>
             <p className="text-sm text-gray-400">Eventos Registrados</p>
           </div>
        </div>
      </div>

      <div className="bg-ciklo-card rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#1a1a1a] text-gray-500 text-[11px] uppercase tracking-wider font-bold border-b border-gray-800">
              <tr>
                <th className="p-4 pl-6">Status</th>
                <th className="p-4">Severidade</th>
                <th className="p-4">Gerador</th>
                <th className="p-4">Mensagem</th>
                <th className="p-4">Data/Hora</th>
                <th className="p-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {alarms.length === 0 ? (
                 <tr>
                   <td colSpan={6} className="p-12 text-center text-gray-500">
                     Nenhum alarme registrado.
                   </td>
                 </tr>
              ) : (
                alarms.map((alarm) => (
                  <tr key={alarm.id} className={`transition-colors ${alarm.active ? 'bg-red-500/5 hover:bg-red-500/10' : 'hover:bg-gray-800/30'}`}>
                    <td className="p-4 pl-6">
                       {alarm.active ? (
                         <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-500 text-white text-[10px] font-bold animate-pulse">
                           ATIVO
                         </span>
                       ) : (
                         <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-gray-700 text-gray-400 text-[10px] font-bold">
                           RESOLVIDO
                         </span>
                       )}
                    </td>
                    <td className="p-4">
                      <span className={`text-xs font-bold ${alarm.severity === 'CRITICAL' ? 'text-red-500' : 'text-yellow-500'}`}>
                        {alarm.severity === 'CRITICAL' ? 'CRÍTICO' : 'ALERTA'}
                      </span>
                    </td>
                    <td className="p-4 text-white font-medium">{alarm.generatorId}</td>
                    <td className="p-4 text-gray-300">{alarm.message}</td>
                    <td className="p-4 text-gray-500 text-sm font-mono">{alarm.timestamp}</td>
                    <td className="p-4 text-center">
                      {alarm.active && (
                        <button 
                          onClick={() => ackAlarm(alarm.id)}
                          className="text-xs border border-gray-600 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors"
                        >
                          Reconhecer
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Alarms;
