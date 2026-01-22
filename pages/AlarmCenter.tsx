import React, { useEffect, useState } from 'react';
import { Bell, CheckCircle, Trash2, Search, Filter, ShieldAlert } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

interface Alarm {
    id: number;
    generator_id: string;
    alarm_code: number;
    alarm_message: string;
    start_time: string;
    end_time: string | null;
    acknowledged: boolean;
    acknowledged_at: string | null;
    acknowledged_by: string | null;
}

const AlarmCenter: React.FC = () => {
    const { user } = useAuth();
    const navigate = useNavigate();
    const [alarms, setAlarms] = useState<Alarm[]>([]);
    const [filter, setFilter] = useState<'all' | 'active' | 'history'>('all'); // all, active, history
    const [loading, setLoading] = useState(false);

    const fetchHistory = () => {
        setLoading(true);
        // Build query params
        let url = '/api/alarms';
        if (filter === 'active') url += '?activeOnly=true';

        fetch(url)
            .then(res => res.json())
            .then(data => {
                setAlarms(data);
                setLoading(false);
            })
            .catch(err => setLoading(false));
    };

    useEffect(() => {
        fetchHistory();
        const interval = setInterval(fetchHistory, 10000); // 10s refresh
        return () => clearInterval(interval);
    }, [filter]);

    const handleClearHistory = async () => {
        if (!confirm("Tem certeza que deseja limpar todo o histórico de alarmes resolvidos?")) return;
        await fetch('/api/alarms/clear', { method: 'POST', body: JSON.stringify({}), headers: { 'Content-Type': 'application/json' } });
        fetchHistory();
    };

    const handleAck = async (id: number) => {
        await fetch(`/api/alarms/${id}/ack`, {
            method: 'POST',
            body: JSON.stringify({ userId: user?.name }),
            headers: { 'Content-Type': 'application/json' }
        });
        fetchHistory();
    };

    return (
        <div className="p-6 space-y-6 pb-20">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <ShieldAlert className="text-red-500" /> Central de Alarmes
                    </h1>
                    <p className="text-gray-400">Histórico e gestão de ocorrências</p>
                </div>
                <div className="flex gap-2">
                    <button
                        onClick={() => navigate('/')}
                        className="px-4 py-2 bg-gray-800 text-white rounded hover:bg-gray-700"
                    >
                        Voltar
                    </button>
                    <button
                        onClick={handleClearHistory}
                        className="px-4 py-2 bg-red-900/50 text-red-500 border border-red-900 rounded hover:bg-red-900 hover:text-white flex items-center gap-2"
                    >
                        <Trash2 size={18} /> Limpar Histórico
                    </button>
                </div>
            </div>

            {/* Filters */}
            <div className="flex gap-4 border-b border-gray-800 pb-4">
                <button
                    onClick={() => setFilter('all')}
                    className={`px-4 py-2 rounded font-medium transition-colors ${filter === 'all' ? 'bg-ciklo-orange text-black' : 'text-gray-400 hover:bg-gray-800'}`}
                >
                    Todos
                </button>
                <button
                    onClick={() => setFilter('active')}
                    className={`px-4 py-2 rounded font-medium transition-colors ${filter === 'active' ? 'bg-red-600 text-white' : 'text-gray-400 hover:bg-gray-800'}`}
                >
                    Ativos Agora
                </button>
            </div>

            {/* Table */}
            <div className="bg-ciklo-card rounded-xl border border-gray-800 overflow-hidden">
                <table className="w-full text-left">
                    <thead className="bg-gray-900 text-gray-400 text-xs uppercase font-bold">
                        <tr>
                            <th className="p-4">Data/Hora</th>
                            <th className="p-4">Gerador</th>
                            <th className="p-4">Mensagem</th>
                            <th className="p-4">Duração</th>
                            <th className="p-4">Status</th>
                            <th className="p-4 text-right">Ação</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800">
                        {loading && <tr><td colSpan={6} className="p-8 text-center text-gray-500">Carregando...</td></tr>}
                        {!loading && alarms.length === 0 && (
                            <tr><td colSpan={6} className="p-8 text-center text-gray-500">Nenhum registro encontrado.</td></tr>
                        )}
                        {alarms.map(alarm => {
                            const isActive = !alarm.end_time;
                            return (
                                <tr key={alarm.id} className={`hover:bg-gray-800/50 transition-colors ${isActive ? 'bg-red-900/10' : ''}`}>
                                    <td className="p-4 text-gray-300 font-mono text-sm">
                                        {new Date(alarm.start_time).toLocaleString()}
                                    </td>
                                    <td className="p-4 text-white font-bold">{alarm.generator_id}</td>
                                    <td className="p-4 text-red-300">{alarm.alarm_message}</td>
                                    <td className="p-4 text-gray-500 text-sm">
                                        {isActive ? <span className="text-green-500 animate-pulse">Ativo...</span> :
                                            alarm.end_time ? (((new Date(alarm.end_time).getTime() - new Date(alarm.start_time).getTime()) / 1000).toFixed(0) + 's') : '-'}
                                    </td>
                                    <td className="p-4">
                                        {alarm.acknowledged ? (
                                            <span className="flex items-center gap-1 text-green-500 text-xs bg-green-900/20 px-2 py-1 rounded border border-green-900">
                                                <CheckCircle size={12} /> Ack por {alarm.acknowledged_by || 'Unknown'}
                                            </span>
                                        ) : (
                                            <span className="text-orange-500 text-xs bg-orange-900/20 px-2 py-1 rounded border border-orange-900">
                                                Pendente
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4 text-right">
                                        {!alarm.acknowledged && (
                                            <button
                                                onClick={() => handleAck(alarm.id)}
                                                className="px-3 py-1 bg-gray-800 hover:bg-gray-700 text-white text-xs rounded border border-gray-600"
                                            >
                                                Reconhecer
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
};

export default AlarmCenter;
