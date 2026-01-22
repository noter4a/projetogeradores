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
    <div className="fixed bottom-4 right-4 max-w-sm w-full z-50 animate-in slide-in-from-right duration-300">
      <div className="bg-red-900 border border-red-500 rounded-lg shadow-2xl overflow-hidden">
        <div className="p-4 bg-red-950 flex items-center justify-between border-b border-red-800">
          <h3 className="text-white font-bold flex items-center gap-2">
            <AlertOctagon className="text-red-500 animate-pulse" /> ALARME ATIVO
          </h3>
          <span className="bg-red-600 text-white text-xs px-2 py-0.5 rounded-full">{alarms.length}</span>
        </div>

        <div className="p-4 max-h-60 overflow-y-auto space-y-3">
          {alarms.map(alarm => (
            <div key={alarm.id} className="bg-red-950/50 p-3 rounded border border-red-800/50">
              <p className="text-red-200 text-sm font-mono">{alarm.alarm_message}</p>
              <p className="text-xs text-red-400 mt-1">{new Date(alarm.start_time).toLocaleTimeString()}</p>
              <button
                onClick={() => handleAcknowledge(alarm.id)}
                className="mt-2 w-full py-1 bg-red-800 hover:bg-red-700 text-white text-xs rounded transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle size={12} /> Reconhecer
              </button>
            </div>
          ))}
        </div>

        <div className="p-3 bg-red-950 border-t border-red-800">
          <button
            onClick={handleAcknowledgeAll}
            className="w-full py-2 bg-white text-red-900 font-bold text-sm rounded hover:bg-gray-100 transition-colors"
          >
            Reconhecer Todos
          </button>
        </div>
      </div>
    </div>
  );
};

export default AlarmPopup;
