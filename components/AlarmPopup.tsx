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
  generatorId: string;
}

const AlarmPopup: React.FC<AlarmPopupProps> = ({ generatorId }) => {
  const { user } = useAuth();
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [acknowledgedLocal, setAcknowledgedLocal] = useState<boolean>(false);

  const fetchAlarms = () => {
    // Fetch only UNACKNOWLEDGED active alarms
    fetch(`/api/alarms?generatorId=${generatorId}&activeOnly=unacknowledged`)
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
    const interval = setInterval(fetchAlarms, 5000); // Poll every 5s for new alarms
    return () => clearInterval(interval);
  }, [generatorId]);

  const handleAcknowledge = async (alarmId: number) => {
    try {
      await fetch(`/api/alarms/${alarmId}/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user?.name || 'User' })
      });
      // Update local state immediately to hide it
      setAlarms(prev => prev.filter(a => a.id !== alarmId));
    } catch (err) {
      console.error("Failed to ack alarm", err);
    }
  };

  const handleAcknowledgeAll = async () => {
    // Ack all displayed
    for (const alarm of alarms) {
      await handleAcknowledge(alarm.id);
    }
  };

  if (alarms.length === 0) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="w-full max-w-md bg-gray-900 border border-red-900/50 rounded-2xl shadow-2xl overflow-hidden scale-100 animate-in zoom-in-95 duration-300">

        {/* Header */}
        <div className="bg-gradient-to-r from-red-950 to-gray-900 p-6 border-b border-red-900/30 flex items-center gap-4">
          <div className="p-3 bg-red-500/10 rounded-full animate-pulse">
            <AlertOctagon className="text-red-500 w-8 h-8" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white tracking-wide">ALARME DETECTADO</h3>
            <p className="text-red-400 text-xs uppercase font-bold tracking-wider">Ação Necessária</p>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 max-h-[60vh] overflow-y-auto space-y-4">
          {alarms.map(alarm => (
            <div key={alarm.id} className="bg-red-500/5 p-4 rounded-xl border border-red-500/10 flex flex-col gap-2">
              <div className="flex justify-between items-start">
                <span className="text-red-200 font-medium text-lg leading-tight">{alarm.alarm_message}</span>
                <span className="text-[10px] text-gray-500 bg-gray-800 px-2 py-1 rounded border border-gray-700 font-mono">
                  {new Date(alarm.start_time).toLocaleTimeString()}
                </span>
              </div>
              <p className="text-xs text-gray-500">Código do Evento: <span font-mono text-gray-400>{alarm.alarm_code}</span></p>

              <button
                onClick={() => handleAcknowledge(alarm.id)}
                className="mt-3 w-full py-3 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-all shadow-lg shadow-red-900/20 active:scale-95 flex items-center justify-center gap-2"
              >
                <CheckCircle size={18} />
                RECONHECER ALARME
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
