import React, { useState, useEffect, useCallback } from 'react';
import { ScrollText, ChevronLeft, ChevronRight, Filter, Power, Square, RotateCcw, Wallet, Building, UserPlus, UserMinus, Settings2, LogIn, ShieldAlert } from 'lucide-react';

interface AuditEntry {
  id: number;
  user_email: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  target_label: string | null;
  details: any;
  ip: string | null;
  created_at: string;
}

// Verbos de comando de gerador -> pt-BR
const ACTION_VERB: Record<string, string> = {
  start: 'Partida', stop: 'Parada', auto: 'Modo Automático', manual: 'Modo Manual',
  reset: 'Reset de Falha', ack: 'Reconhecer Alarme',
  genBreakerOn: 'Fechar disj. gerador', genBreakerOff: 'Abrir disj. gerador',
  mainsBreakerOn: 'Fechar disj. rede', mainsBreakerOff: 'Abrir disj. rede',
  toggleGen: 'Alternar disj. gerador', toggleMains: 'Alternar disj. rede',
};

const ACTION_META: Record<string, { label: string; color: string; Icon: any }> = {
  'generator.control':      { label: 'Comando de Gerador', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20', Icon: Power },
  'company.credits.add':    { label: 'Créditos +',         color: 'bg-green-500/10 text-green-400 border-green-500/20', Icon: Wallet },
  'company.credits.remove': { label: 'Créditos −',         color: 'bg-red-500/10 text-red-400 border-red-500/20', Icon: Wallet },
  'company.create':         { label: 'Empresa criada',     color: 'bg-teal-500/10 text-teal-400 border-teal-500/20', Icon: Building },
  'company.delete':         { label: 'Empresa removida',   color: 'bg-red-500/10 text-red-400 border-red-500/20', Icon: Building },
  'user.create':            { label: 'Usuário criado',     color: 'bg-teal-500/10 text-teal-400 border-teal-500/20', Icon: UserPlus },
  'user.delete':            { label: 'Usuário removido',   color: 'bg-red-500/10 text-red-400 border-red-500/20', Icon: UserMinus },
  'auth.login':             { label: 'Login',              color: 'bg-gray-600/20 text-gray-300 border-gray-600/30', Icon: LogIn },
  'auth.login_failed':      { label: 'Login falhou',       color: 'bg-amber-500/10 text-amber-400 border-amber-500/20', Icon: ShieldAlert },
};

const FILTERS = [
  { value: '', label: 'Todas as ações' },
  { value: 'generator.control', label: 'Comandos de gerador' },
  { value: 'company.credits.add', label: 'Créditos adicionados' },
  { value: 'company.credits.remove', label: 'Créditos removidos' },
  { value: 'user.create', label: 'Usuários criados' },
  { value: 'user.delete', label: 'Usuários removidos' },
  { value: 'company.create', label: 'Empresas criadas' },
  { value: 'company.delete', label: 'Empresas removidas' },
  { value: 'auth.login', label: 'Logins' },
  { value: 'auth.login_failed', label: 'Logins falhos' },
];

const AuditLog: React.FC = () => {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [action, setAction] = useState('');
  const [loading, setLoading] = useState(false);

  const fetchLog = useCallback(async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('ciklo_auth_token');
      const res = await fetch(`/api/audit?page=${page}&limit=20${action ? `&action=${encodeURIComponent(action)}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setEntries(data.entries);
        setTotalPages(data.totalPages);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('Error fetching audit log:', err);
    } finally {
      setLoading(false);
    }
  }, [page, action]);

  useEffect(() => { fetchLog(); }, [fetchLog]);
  useEffect(() => { setPage(1); }, [action]);

  const describeDetails = (e: AuditEntry): string => {
    const d = e.details || {};
    if (e.action === 'generator.control') return ACTION_VERB[d.action] || d.action || '-';
    if (e.action.startsWith('company.credits')) {
      const amt = Math.abs(Number(d.amount ?? 0));
      return `${amt} crédito(s) · saldo: ${d.newBalance ?? '?'}`;
    }
    if (e.action === 'user.create') return `perfil: ${d.role || '-'}`;
    if (e.action === 'auth.login_failed') return d.reason || 'falha';
    if (e.action === 'auth.login') return d.role ? `perfil: ${d.role}` : '';
    return '';
  };

  const fmtDate = (iso: string) => new Date(iso).toLocaleString('pt-BR');

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <ScrollText className="text-ciklo-orange" />
            Trilha de Auditoria
          </h2>
          <p className="text-gray-400 text-sm">Registro de comandos e alterações feitas no sistema</p>
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={16} />
          <select
            value={action}
            onChange={e => setAction(e.target.value)}
            className="bg-ciklo-card border border-gray-800 rounded-lg py-2.5 pl-9 pr-4 text-white text-sm focus:border-ciklo-orange outline-none appearance-none"
          >
            {FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
          </select>
        </div>
      </div>

      <div className="bg-ciklo-card rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#1a1a1a] text-gray-500 text-[11px] uppercase tracking-wider font-bold border-b border-gray-800">
              <tr>
                <th className="p-4 pl-6">Data / Hora</th>
                <th className="p-4">Usuário</th>
                <th className="p-4">Ação</th>
                <th className="p-4">Alvo</th>
                <th className="p-4">Detalhes</th>
                <th className="p-4 hidden lg:table-cell">IP</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-sm">
              {entries.map(e => {
                const meta = ACTION_META[e.action] || { label: e.action, color: 'bg-gray-700/30 text-gray-400 border-gray-700', Icon: Settings2 };
                const Icon = meta.Icon;
                return (
                  <tr key={e.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="p-4 pl-6 text-gray-400 whitespace-nowrap font-mono text-xs">{fmtDate(e.created_at)}</td>
                    <td className="p-4 text-gray-200">{e.user_email || <span className="text-gray-600 italic">sistema</span>}</td>
                    <td className="p-4">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold border ${meta.color}`}>
                        <Icon size={11} /> {meta.label}
                      </span>
                    </td>
                    <td className="p-4 text-gray-300">
                      {e.target_label || e.target_id || '-'}
                      {e.target_type && <span className="text-gray-600 text-xs ml-1">({e.target_type === 'generator' ? 'gerador' : e.target_type === 'company' ? 'empresa' : e.target_type === 'user' ? 'usuário' : e.target_type})</span>}
                    </td>
                    <td className="p-4 text-gray-400">{describeDetails(e)}</td>
                    <td className="p-4 text-gray-500 font-mono text-xs hidden lg:table-cell">{e.ip || '-'}</td>
                  </tr>
                );
              })}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500">
                    {loading ? 'Carregando...' : 'Nenhum registro encontrado.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800 bg-[#1a1a1a]">
            <span className="text-xs text-gray-500">Página {page} de {totalPages} ({total} registros)</span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="p-2 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm text-gray-300 px-2">{page}</span>
              <button
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="p-2 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuditLog;
