
import React, { useEffect, useState } from 'react';
import { AlertTriangle, AlertCircle, CheckCircle, Trash2, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

interface AlarmRecord {
  id: number;
  generator_id: string;
  generator_name?: string;
  alarm_code: number;
  alarm_message: string;
  start_time: string;
  end_time: string | null;
  acknowledged: boolean;
  acknowledged_at: string | null;
  acknowledged_by: string | null;
}

const Alarms: React.FC = () => {
  const { user, token } = useAuth();
  const [alarms, setAlarms] = useState<AlarmRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchAlarms = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/alarms', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      setAlarms(Array.isArray(data) ? data : []);
      setLastRefresh(new Date());
    } catch (err) {
      console.error('Erro ao buscar alarmes:', err);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchAlarms();
    const interval = setInterval(fetchAlarms, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleAck = async (id: number) => {
    await fetch(`/api/alarms/${id}/ack`, {
      method: 'POST',
      body: JSON.stringify({ userId: user?.name }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    });
    fetchAlarms();
  };

  const handleDelete = async (id: number) => {
    await fetch(`/api/alarms/${id}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${token}` }
    });
    setAlarms(prev => prev.filter(a => a.id !== id));
  };

  const handleClearResolved = async () => {
    if (!confirm("Limpar todos os alarmes RESOLVIDOS do histórico?")) return;
    await fetch('/api/alarms/clear', {
      method: 'POST',
      body: JSON.stringify({}),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    });
    fetchAlarms();
  };

  const handleClearAll = async () => {
    if (!confirm("⚠️ Isso irá APAGAR TODOS os alarmes, incluindo os ativos. Tem certeza?")) return;
    await fetch('/api/alarms/clear', {
      method: 'POST',
      body: JSON.stringify({ clearAll: true }),
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
    });
    fetchAlarms();
  };

  const activeCount = alarms.filter(a => !a.end_time).length;
  const criticalCount = alarms.filter(a => !a.end_time).length; // All active alarms are critical
  const resolvedCount = alarms.filter(a => !!a.end_time).length;

  const formatDuration = (alarm: AlarmRecord) => {
    if (!alarm.end_time) return null;
    const ms = new Date(alarm.end_time).getTime() - new Date(alarm.start_time).getTime();
    const secs = Math.floor(ms / 1000);
    if (secs < 60) return `${secs}s`;
    const mins = Math.floor(secs / 60);
    if (mins < 60) return `${mins}m ${secs % 60}s`;
    return `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Central de Alarmes</h2>
          <p className="text-gray-400 text-sm">
            Monitoramento de eventos e falhas do sistema — Atualizado às {lastRefresh.toLocaleTimeString('pt-BR')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={fetchAlarms}
            className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors text-sm border border-gray-700"
          >
            <RefreshCw size={16} /> Atualizar
          </button>
          {resolvedCount > 0 && (
            <button
              onClick={handleClearResolved}
              className="flex items-center gap-2 px-3 py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg transition-colors text-sm border border-gray-700"
            >
              <Trash2 size={16} /> Limpar Resolvidos
            </button>
          )}
          {alarms.length > 0 && (
            <button
              onClick={handleClearAll}
              className="flex items-center gap-2 px-3 py-2 bg-red-900/40 text-red-400 border border-red-900/60 rounded-lg hover:bg-red-900 hover:text-white transition-colors text-sm"
            >
              <Trash2 size={16} /> Limpar Tudo
            </button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-ciklo-card border border-gray-800 p-4 rounded-xl flex items-center gap-4">
           <div className="w-12 h-12 rounded-full bg-red-500/10 flex items-center justify-center text-red-500">
             <AlertTriangle size={24} />
           </div>
           <div>
             <p className="text-2xl font-bold text-white">{criticalCount}</p>
             <p className="text-sm text-gray-400">Alarmes Ativos</p>
           </div>
        </div>
        <div className="bg-ciklo-card border border-gray-800 p-4 rounded-xl flex items-center gap-4">
           <div className="w-12 h-12 rounded-full bg-green-500/10 flex items-center justify-center text-green-500">
             <CheckCircle size={24} />
           </div>
           <div>
             <p className="text-2xl font-bold text-white">{resolvedCount}</p>
             <p className="text-sm text-gray-400">Resolvidos</p>
           </div>
        </div>
        <div className="bg-ciklo-card border border-gray-800 p-4 rounded-xl flex items-center gap-4">
           <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
             <AlertCircle size={24} />
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
                <th className="p-4">Gerador</th>
                <th className="p-4">Mensagem</th>
                <th className="p-4">Código</th>
                <th className="p-4">Data/Hora</th>
                <th className="p-4 hidden md:table-cell">Duração</th>
                <th className="p-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {loading && alarms.length === 0 && (
                <tr><td colSpan={7} className="p-12 text-center text-gray-500">Carregando...</td></tr>
              )}
              {!loading && alarms.length === 0 && (
                 <tr>
                   <td colSpan={7} className="p-12 text-center text-gray-500">
                     Nenhum alarme registrado.
                   </td>
                 </tr>
              )}
              {alarms.map((alarm) => {
                const isActive = !alarm.end_time;
                const duration = formatDuration(alarm);
                return (
                  <tr key={alarm.id} className={`transition-colors ${isActive ? 'bg-red-500/5 hover:bg-red-500/10 border-l-2 border-red-600' : 'hover:bg-gray-800/30'}`}>
                    <td className="p-4 pl-6">
                       {isActive ? (
                         <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-red-500 text-white text-[10px] font-bold animate-pulse">
                           🔴 ATIVO
                         </span>
                       ) : (
                         <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md bg-green-900/40 text-green-400 text-[10px] font-bold border border-green-900/60">
                           ✅ RESOLVIDO
                         </span>
                       )}
                    </td>
                    <td className="p-4 text-white font-medium">{alarm.generator_name || alarm.generator_id}</td>
                    <td className="p-4 text-gray-300 text-sm">{alarm.alarm_message}</td>
                    <td className="p-4 text-gray-500 text-sm font-mono">{alarm.alarm_code}</td>
                    <td className="p-4 text-gray-500 text-sm font-mono whitespace-nowrap">
                      {new Date(alarm.start_time).toLocaleString('pt-BR')}
                    </td>
                    <td className="p-4 text-gray-500 text-sm hidden md:table-cell">
                      {isActive
                        ? <span className="text-red-400 animate-pulse font-medium">⚡ Em andamento</span>
                        : duration || '-'
                      }
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        {isActive && !alarm.acknowledged && (
                          <button
                            onClick={() => handleAck(alarm.id)}
                            className="text-xs border border-gray-600 hover:bg-gray-700 text-gray-300 px-3 py-1.5 rounded transition-colors"
                          >
                            Reconhecer
                          </button>
                        )}
                        {alarm.acknowledged && (
                          <span className="text-xs text-green-400 bg-green-900/20 px-2 py-1 rounded border border-green-900">
                            Ack: {alarm.acknowledged_by || '?'}
                          </span>
                        )}
                        <button
                          onClick={() => handleDelete(alarm.id)}
                          title="Remover este registro"
                          className="p-1.5 text-gray-500 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Alarms;
