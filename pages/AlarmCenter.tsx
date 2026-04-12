import React, { useEffect, useState } from 'react';
import { Bell, CheckCircle, Trash2, Search, ShieldAlert, AlertTriangle, RefreshCw } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

interface Alarm {
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

const AlarmCenter: React.FC = () => {
    const { user, token } = useAuth();
    const navigate = useNavigate();
    const [alarms, setAlarms] = useState<Alarm[]>([]);
    const [filter, setFilter] = useState<'all' | 'active' | 'history'>('all');
    const [loading, setLoading] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

    const fetchHistory = () => {
        setLoading(true);
        let url = '/api/alarms';
        if (filter === 'active') url += '?activeOnly=true';

        fetch(url, {
            headers: { 'Authorization': `Bearer ${token}` }
        })
            .then(res => res.json())
            .then(data => {
                setAlarms(Array.isArray(data) ? data : []);
                setLastRefresh(new Date());
                setLoading(false);
            })
            .catch(() => setLoading(false));
    };

    useEffect(() => {
        fetchHistory();
        const interval = setInterval(fetchHistory, 10000);
        return () => clearInterval(interval);
    }, [filter]);

    const handleClearResolved = async () => {
        if (!confirm("Limpar todos os alarmes RESOLVIDOS do histórico?")) return;
        await fetch('/api/alarms/clear', {
            method: 'POST',
            body: JSON.stringify({}),
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });
        fetchHistory();
    };

    const handleClearAll = async () => {
        if (!confirm("⚠️ Isso irá APAGAR TODOS os alarmes, incluindo os ativos. Tem certeza?")) return;
        await fetch('/api/alarms/clear', {
            method: 'POST',
            body: JSON.stringify({ clearAll: true }),
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });
        fetchHistory();
    };

    const handleDelete = async (id: number) => {
        await fetch(`/api/alarms/${id}`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${token}` }
        });
        setAlarms(prev => prev.filter(a => a.id !== id));
    };

    const handleAck = async (id: number) => {
        await fetch(`/api/alarms/${id}/ack`, {
            method: 'POST',
            body: JSON.stringify({ userId: user?.name }),
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });
        fetchHistory();
    };

    const activeCount = alarms.filter(a => !a.end_time).length;
    const resolvedCount = alarms.filter(a => !!a.end_time).length;

    const formatDuration = (alarm: Alarm) => {
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

            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <ShieldAlert className="text-red-500" /> Central de Alarmes
                    </h1>
                    <p className="text-gray-400 text-sm">
                        Histórico e gestão de ocorrências — Atualizado às {lastRefresh.toLocaleTimeString('pt-BR')}
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={fetchHistory}
                        className="px-3 py-2 bg-gray-800 text-gray-300 border border-gray-700 rounded-lg hover:bg-gray-700 flex items-center gap-2 text-sm"
                    >
                        <RefreshCw size={16} /> Atualizar
                    </button>
                    <button
                        onClick={handleClearResolved}
                        className="px-3 py-2 bg-gray-800 text-gray-400 border border-gray-700 rounded-lg hover:bg-gray-700 flex items-center gap-2 text-sm"
                    >
                        <Trash2 size={16} /> Limpar Resolvidos
                    </button>
                    <button
                        onClick={handleClearAll}
                        className="px-3 py-2 bg-red-900/40 text-red-400 border border-red-900/60 rounded-lg hover:bg-red-900 hover:text-white flex items-center gap-2 text-sm"
                    >
                        <Trash2 size={16} /> Limpar Tudo
                    </button>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-red-900/20 border border-red-900/40 rounded-xl p-4 flex items-center gap-3">
                    <AlertTriangle className="text-red-400" size={28} />
                    <div>
                        <div className="text-2xl font-bold text-red-400">{activeCount}</div>
                        <div className="text-xs text-gray-400">Alarmes Ativos</div>
                    </div>
                </div>
                <div className="bg-green-900/20 border border-green-900/40 rounded-xl p-4 flex items-center gap-3">
                    <CheckCircle className="text-green-400" size={28} />
                    <div>
                        <div className="text-2xl font-bold text-green-400">{resolvedCount}</div>
                        <div className="text-xs text-gray-400">Resolvidos</div>
                    </div>
                </div>
                <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 flex items-center gap-3">
                    <Bell className="text-gray-400" size={28} />
                    <div>
                        <div className="text-2xl font-bold text-white">{alarms.length}</div>
                        <div className="text-xs text-gray-400">Total no Histórico</div>
                    </div>
                </div>
            </div>

            {/* Filter Tabs */}
            <div className="flex gap-2 border-b border-gray-800 pb-1">
                {[
                    { key: 'all', label: 'Todos', count: alarms.length },
                    { key: 'active', label: 'Ativos Agora', count: activeCount },
                ].map(tab => (
                    <button
                        key={tab.key}
                        onClick={() => setFilter(tab.key as any)}
                        className={`px-4 py-2 rounded-t-lg font-medium text-sm transition-colors flex items-center gap-2 ${
                            filter === tab.key
                                ? tab.key === 'active' ? 'bg-red-600 text-white' : 'bg-ciklo-orange text-black'
                                : 'text-gray-400 hover:text-white hover:bg-gray-800'
                        }`}
                    >
                        {tab.label}
                        <span className={`text-xs px-1.5 py-0.5 rounded-full ${filter === tab.key ? 'bg-black/20' : 'bg-gray-700'}`}>
                            {tab.count}
                        </span>
                    </button>
                ))}
            </div>

            {/* Table */}
            <div className="bg-ciklo-card rounded-xl border border-gray-800 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-gray-900 text-gray-400 text-xs uppercase font-bold border-b border-gray-800">
                            <tr>
                                <th className="p-4">Data/Hora</th>
                                <th className="p-4">Gerador</th>
                                <th className="p-4">Mensagem</th>
                                <th className="p-4 hidden md:table-cell">Duração</th>
                                <th className="p-4">Status</th>
                                <th className="p-4 text-right">Ações</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {loading && (
                                <tr><td colSpan={6} className="p-8 text-center text-gray-500">Carregando...</td></tr>
                            )}
                            {!loading && alarms.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-10 text-center">
                                        <CheckCircle className="mx-auto text-green-500 mb-2" size={36} />
                                        <p className="text-gray-400">Nenhum registro de alarme encontrado.</p>
                                    </td>
                                </tr>
                            )}
                            {alarms.map(alarm => {
                                const isActive = !alarm.end_time;
                                const duration = formatDuration(alarm);
                                return (
                                    <tr
                                        key={alarm.id}
                                        className={`hover:bg-gray-800/50 transition-colors ${isActive ? 'bg-red-900/10 border-l-2 border-red-600' : ''}`}
                                    >
                                        <td className="p-4 text-gray-300 font-mono text-sm whitespace-nowrap">
                                            {new Date(alarm.start_time).toLocaleString('pt-BR')}
                                        </td>
                                        <td className="p-4 text-white font-bold">
                                            {alarm.generator_name || alarm.generator_id}
                                        </td>
                                        <td className="p-4 text-red-300 text-sm max-w-xs">
                                            {alarm.alarm_message}
                                        </td>
                                        <td className="p-4 text-gray-500 text-sm hidden md:table-cell">
                                            {isActive
                                                ? <span className="text-red-400 animate-pulse font-medium">⚡ Ativo</span>
                                                : duration || '-'
                                            }
                                        </td>
                                        <td className="p-4">
                                            {alarm.acknowledged ? (
                                                <span className="flex items-center gap-1 text-green-400 text-xs bg-green-900/20 px-2 py-1 rounded border border-green-900 whitespace-nowrap">
                                                    <CheckCircle size={12} /> Ack por {alarm.acknowledged_by || '?'}
                                                </span>
                                            ) : isActive ? (
                                                <span className="text-red-400 text-xs bg-red-900/20 px-2 py-1 rounded border border-red-900 whitespace-nowrap">
                                                    🔴 Ativo
                                                </span>
                                            ) : (
                                                <span className="text-orange-400 text-xs bg-orange-900/20 px-2 py-1 rounded border border-orange-900 whitespace-nowrap">
                                                    Pendente
                                                </span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right">
                                            <div className="flex items-center justify-end gap-2">
                                                {!alarm.acknowledged && (
                                                    <button
                                                        onClick={() => handleAck(alarm.id)}
                                                        title="Reconhecer alarme"
                                                        className="px-2 py-1 bg-gray-800 hover:bg-gray-700 text-white text-xs rounded border border-gray-600 whitespace-nowrap"
                                                    >
                                                        Reconhecer
                                                    </button>
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

export default AlarmCenter;
