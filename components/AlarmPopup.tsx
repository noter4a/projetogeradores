import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertOctagon, CheckCircle, ChevronDown, ChevronUp, ExternalLink, X } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useGenerators } from '../context/GeneratorContext';
import { useIsMobile } from '../hooks/useIsMobile';

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
  generatorId?: string;
}

const AlarmPopup: React.FC<AlarmPopupProps> = ({ generatorId }) => {
  const { token } = useAuth();
  const { generators } = useGenerators();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [alarms, setAlarms] = useState<Alarm[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [minimized, setMinimized] = useState(false);

  const fetchAlarms = useCallback(() => {
    if (!token) return;
    const url = generatorId
      ? `/api/alarms?generatorId=${generatorId}&activeOnly=unacknowledged`
      : `/api/alarms?activeOnly=unacknowledged`;

    fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setAlarms(data);
          if (data.length > 0) setMinimized(false);
        }
      })
      .catch(err => console.error('Failed to fetch alarms', err));
  }, [generatorId, token]);

  useEffect(() => {
    fetchAlarms();
    const interval = setInterval(fetchAlarms, 5000);
    return () => clearInterval(interval);
  }, [fetchAlarms]);

  const resolveGeneratorName = (generatorIdValue: string) => {
    const match = generators.find(
      g => g.id === generatorIdValue || g.ip === generatorIdValue || g.connectionName === generatorIdValue
    );
    return match?.name ?? generatorIdValue;
  };

  const resolveGeneratorRouteId = (generatorIdValue: string) => {
    const match = generators.find(
      g => g.id === generatorIdValue || g.ip === generatorIdValue || g.connectionName === generatorIdValue
    );
    return match?.id ?? generatorIdValue;
  };

  const handleAcknowledge = async (alarmId: number) => {
    try {
      await fetch(`/api/alarms/${alarmId}/ack`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      });
      setAlarms(prev => prev.filter(a => a.id !== alarmId));
    } catch (err) {
      console.error('Failed to ack alarm', err);
    }
  };

  const handleAcknowledgeAll = async () => {
    for (const alarm of alarms) {
      await handleAcknowledge(alarm.id);
    }
  };

  if (alarms.length === 0) return null;

  const topOffset = isMobile ? 'top-14' : 'top-0';

  if (minimized) {
    return (
      <button
        type="button"
        onClick={() => setMinimized(false)}
        className={`fixed ${topOffset} left-4 right-4 z-40 flex items-center justify-center gap-2 rounded-b-xl border border-red-500/40 bg-red-950/95 px-4 py-2 text-xs font-bold uppercase tracking-wide text-red-100 shadow-lg backdrop-blur-sm`}
      >
        <AlertOctagon size={14} className="animate-pulse" />
        {alarms.length} alarme(s) ativo(s) — toque para ver
      </button>
    );
  }

  return (
    <div className={`fixed ${topOffset} left-0 right-0 z-40 px-3 pt-2 pointer-events-none`}>
      <div className="mx-auto max-w-2xl pointer-events-auto rounded-xl border border-red-500/35 bg-gray-950/95 shadow-2xl shadow-red-900/20 backdrop-blur-md overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3 border-b border-red-500/20 bg-red-950/40">
          <div className="p-2 bg-red-500/15 rounded-full shrink-0">
            <AlertOctagon className="text-red-400 w-5 h-5 animate-pulse" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-white">
              {alarms.length === 1 ? 'Alarme detectado' : `${alarms.length} alarmes ativos`}
            </p>
            <p className="text-[10px] text-gray-400 uppercase tracking-wider">Você pode continuar navegando</p>
          </div>
          <button
            type="button"
            onClick={() => setExpanded(v => !v)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800"
            aria-label={expanded ? 'Recolher alarmes' : 'Expandir alarmes'}
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          <button
            type="button"
            onClick={() => setMinimized(true)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800"
            aria-label="Minimizar"
          >
            <X size={18} />
          </button>
        </div>

        {expanded && (
          <div className="max-h-[40vh] overflow-y-auto p-3 space-y-2">
            {alarms.map(alarm => (
              <div
                key={alarm.id}
                className="rounded-lg border border-gray-800 bg-gray-900/80 p-3 flex flex-col gap-2"
              >
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] text-ciklo-orange font-bold uppercase tracking-wider">
                      {resolveGeneratorName(alarm.generator_id)}
                    </p>
                    <p className="text-sm text-white font-medium leading-snug">{alarm.alarm_message}</p>
                    <p className="text-[10px] text-gray-500 mt-1">
                      Código {alarm.alarm_code} • {new Date(alarm.start_time).toLocaleTimeString('pt-BR')}
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/generator/${resolveGeneratorRouteId(alarm.generator_id)}`)}
                    className="flex-1 min-w-[120px] py-2 px-3 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-bold text-white flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink size={14} />
                    Ver gerador
                  </button>
                  <button
                    type="button"
                    onClick={() => handleAcknowledge(alarm.id)}
                    className="flex-1 min-w-[120px] py-2 px-3 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-bold text-white flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle size={14} />
                    Reconhecer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="flex flex-wrap gap-2 p-3 border-t border-gray-800 bg-gray-950/80">
          <button
            type="button"
            onClick={() => navigate('/alarms')}
            className="flex-1 py-2.5 rounded-lg bg-gray-800 hover:bg-gray-700 text-xs font-bold text-gray-200"
          >
            Central de Alarmes
          </button>
          {alarms.length > 1 && (
            <button
              type="button"
              onClick={handleAcknowledgeAll}
              className="flex-1 py-2.5 rounded-lg bg-red-900/60 hover:bg-red-900 text-xs font-bold text-red-200"
            >
              Reconhecer todos ({alarms.length})
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AlarmPopup;
