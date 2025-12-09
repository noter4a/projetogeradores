
import React, { useEffect, useState } from 'react';
import { useAlarms } from '../context/AlarmContext';
import { AlertTriangle, BellOff, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

const AlarmPopup: React.FC = () => {
  const { activeCriticalAlarms, ackAlarm } = useAlarms();
  const [visible, setVisible] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    if (activeCriticalAlarms.length > 0) {
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [activeCriticalAlarms]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-300">
      <div className="bg-ciklo-card max-w-lg w-full rounded-2xl border-2 border-red-500 shadow-[0_0_50px_rgba(239,68,68,0.5)] overflow-hidden">
        {/* Header flashing */}
        <div className="bg-red-600 p-4 flex items-center justify-between animate-pulse">
          <div className="flex items-center gap-3">
            <div className="bg-white/20 p-2 rounded-full">
               <AlertTriangle size={32} className="text-white fill-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white uppercase tracking-wider">Emergência Detectada</h2>
              <p className="text-red-100 text-xs font-semibold">AÇÃO IMEDIATA NECESSÁRIA</p>
            </div>
          </div>
        </div>

        <div className="p-6 max-h-[60vh] overflow-y-auto">
          <p className="text-gray-300 mb-4 text-sm">Os seguintes alarmes críticos estão ativos no sistema:</p>
          
          <div className="space-y-3">
            {activeCriticalAlarms.map((alarm) => (
              <div key={alarm.id} className="bg-red-950/30 border border-red-500/30 rounded-lg p-4 flex justify-between items-start gap-3">
                <div className="flex-1">
                   <h3 className="text-red-400 font-bold text-lg">{alarm.message}</h3>
                   <p className="text-gray-500 text-xs mt-1 font-mono">ID: {alarm.generatorId} | {alarm.timestamp}</p>
                </div>
                <button 
                  onClick={() => ackAlarm(alarm.id)}
                  className="p-2 text-red-400 hover:bg-red-500/20 rounded-lg transition-colors"
                  title="Reconhecer Alarme"
                >
                  <BellOff size={20} />
                </button>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 bg-gray-900/50 border-t border-gray-800 flex gap-3">
          <button 
            onClick={() => {
              setVisible(false);
              navigate('/alarms');
            }}
            className="flex-1 py-3 bg-gray-800 hover:bg-gray-700 text-white rounded-xl font-bold transition-colors"
          >
            Ver Central de Alarmes
          </button>
          <button 
             onClick={() => setVisible(false)}
             className="px-6 py-3 border border-red-500/30 text-red-500 hover:bg-red-950/30 rounded-xl font-bold transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlarmPopup;
