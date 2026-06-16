import React, { useEffect, useState } from 'react';
import { Bell, CheckCircle, Trash2, ShieldAlert, AlertTriangle, RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useGenerators } from '../context/GeneratorContext';
import { useSearchParams } from 'react-router-dom';
import { AlarmRecord } from '../types';
import { formatDuration } from '../utils/formatters';

const AlarmCenter: React.FC = () => {
    const { token } = useAuth();
    const { generators } = useGenerators();
    const [searchParams, setSearchParams] = useSearchParams();
    const generatorIdFilter = searchParams.get('generatorId');
    const filteredGeneratorName = generatorIdFilter
        ? generators.find(g => g.id === generatorIdFilter)?.name || generatorIdFilter
        : null;
    const [alarms, setAlarms] = useState<AlarmRecord[]>([]);
    const [filter, setFilter] = useState<'all' | 'active' | 'history'>('all');
    const [loading, setLoading] = useState(false);
    const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
    const [currentPage, setCurrentPage] = useState(1);
    const ITEMS_PER_PAGE = 15;

    const fetchHistory = () => {
        setLoading(true);
        let url = '/api/alarms';
        const params = new URLSearchParams();
        if (filter === 'active') params.set('activeOnly', 'true');
        if (generatorIdFilter) params.set('generatorId', generatorIdFilter);
        if (params.toString()) url += '?' + params.toString();

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
    }, [filter, generatorIdFilter]);

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
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` }
        });
        fetchHistory();
    };

    const activeCount = alarms.filter(a => !a.end_time).length;
    const resolvedCount = alarms.filter(a => !!a.end_time).length;

    // Pagination
    const totalPages = Math.max(1, Math.ceil(alarms.length / ITEMS_PER_PAGE));
    const safePage = Math.min(currentPage, totalPages);
    const pagedAlarms = alarms.slice((safePage - 1) * ITEMS_PER_PAGE, safePage * ITEMS_PER_PAGE);

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

            {/* Generator Filter Banner */}
            {generatorIdFilter && (
                <div className="flex items-center gap-3 bg-orange-900/20 border border-orange-900/40 rounded-xl px-4 py-3">
                    <AlertTriangle className="text-orange-400 shrink-0" size={20} />
                    <span className="text-orange-300 text-sm font-medium flex-1">
                        Filtro ativo: exibindo apenas alarmes do gerador <strong className="text-white">{filteredGeneratorName}</strong>
                    </span>
                    <button
                        onClick={() => { setSearchParams({}); }}
                        className="px-3 py-1.5 bg-gray-800 text-gray-300 border border-gray-700 rounded-lg hover:bg-gray-700 text-xs font-medium whitespace-nowrap"
                    >
                        Limpar Filtro
                    </button>
                </div>
            )}

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
                            {pagedAlarms.map(alarm => {
                                const isActive = !alarm.end_time;
                                const duration = formatDuration(alarm.start_time, alarm.end_time);
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

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between bg-ciklo-card rounded-xl border border-gray-800 px-4 py-3">
                    <span className="text-sm text-gray-400">
                        Página {safePage} de {totalPages} ({alarms.length} registros)
                    </span>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                            disabled={safePage <= 1}
                            className="p-2 rounded-lg border border-gray-700 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300"
                        >
                            <ChevronLeft size={16} />
                        </button>
                        <button
                            onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                            disabled={safePage >= totalPages}
                            className="p-2 rounded-lg border border-gray-700 hover:bg-gray-800 disabled:opacity-30 disabled:cursor-not-allowed text-gray-300"
                        >
                            <ChevronRight size={16} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AlarmCenter;
