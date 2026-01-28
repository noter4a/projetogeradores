import React, { useEffect, useState } from 'react';
import { AlertOctagon, X, CheckCircle, Bell } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface Alarm {
  id: number;
  generator_id: string;
  alarm_code: number;
  alarm_message: string;
  start_time: string;
  end_time: string | null;
  acknowledged: boolean;
}

interface AlarmPopupProps {
  generatorId?: string; // Optional for Global/Dashboard use
}

const AlarmPopup: React.FC<AlarmPopupProps> = ({ generatorId }) => {
  const { user } = useAuth();
  const [alarms, setAlarms] = useState<Alarm[]>([]);

  const fetchAlarms = () => {
    // Fetch UNACKNOWLEDGED active alarms
    // If generatorId is missing, it fetches ALL generators (Global)
    const url = generatorId
      ? `/api/alarms?generatorId=${generatorId}&activeOnly=unacknowledged`
      : `/api/alarms?activeOnly=unacknowledged`;

    fetch(url)
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAlarms(data);
        }
      })
      .catch(err => console.error("Failed to fetch alarms", err));
  };

  useEffect(() => {
    fetchAlarms();
    const interval = setInterval(fetchAlarms, 5000);
    return () => clearInterval(interval);
  }, [generatorId]);

  const handleAcknowledge = async (alarmId: number) => {
    try {
      await fetch(`/api/alarms/${alarmId}/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.name || 'User' })
      });
      setAlarms(prev => prev.filter(a => a.id !== alarmId));
    } catch (err) {
      console.error("Failed to ack alarm", err);
    }
  };

  const handleAcknowledgeAll = async () => {
    for (const alarm of alarms) {
      await handleAcknowledge(alarm.id);
    }
  };

  if (alarms.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-gray-900 border border-gray-800 rounded-2xl shadow-2xl overflow-hidden scale-100 animate-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="bg-gray-900 p-6 border-b border-gray-800 flex items-center gap-4">
          <div className="p-3 bg-red-500/10 rounded-full animate-pulse">
            <AlertOctagon className="text-red-500 w-8 h-8" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white tracking-wide">ALARME DETECTADO</h3>
            <p className="text-gray-400 text-xs uppercase font-bold tracking-wider">Ação Necessária</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
          {alarms.map(alarm => (
            <div key={alarm.id} className="bg-gray-800/50 p-4 rounded-xl border border-gray-700 flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-xs text-ciklo-orange font-bold uppercase tracking-wider mb-1 block">
                    Gerador: {alarm.generator_id}
                  </span>
                  <span className="text-white font-medium text-lg leading-tight">{alarm.alarm_message}</span>
                </div>
                <span className="text-[10px] text-gray-500 whitespace-nowrap ml-2 mt-1">
                  {new Date(alarm.start_time).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Código: <span className="font-mono text-gray-400">{alarm.alarm_code}</span></p>

              <button
                onClick={() => handleAcknowledge(alarm.id)}
                className="mt-3 w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle size={18} />
                RECONHECER
              </button>
            </div>
          ))}
        </div>

        {/* Footer */}
        {alarms.length > 1 && (
          <div className="p-4 bg-gray-950 border-t border-gray-800">
            <button
              onClick={handleAcknowledgeAll}
              className="w-full py-3 bg-gray-800 text-gray-300 font-semibold rounded-lg hover:bg-gray-700 transition-colors"
            >
              Reconhecer Todos ({alarms.length})
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AlarmPopup;
