import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useGenerators } from '../context/GeneratorContext';
import { useUsers } from '../context/UserContext';
import { Company, User, UserRole } from '../types';
import { Building, Plus, Trash2, Edit, Check, X, Server, CreditCard, Search, Users as UsersIcon, Pencil } from 'lucide-react';
import { normalizeSearch as normalize } from '../utils/formatters';

const roleLabel = (role: UserRole) =>
  role === UserRole.ADMIN ? 'Administrador' :
  role === UserRole.TECHNICIAN ? 'Técnico' :
  role === UserRole.CLIENT ? 'Cliente' :
  role === UserRole.ORCAMENTOS ? 'Orçamentos' : 'Monitoramento';

const CompanyManagement: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { generators, fetchGenerators } = useGenerators();
  const { users, refreshUsers } = useUsers();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [companyName, setCompanyName] = useState('');
  const [selectedGeneratorIds, setSelectedGeneratorIds] = useState<string[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<User['id'][]>([]);

  // Seletor de geradores (dropdown pesquisável, substitui a grade de checkboxes)
  const [generatorPickerQuery, setGeneratorPickerQuery] = useState('');
  const [generatorPickerOpen, setGeneratorPickerOpen] = useState(false);
  const generatorPickerRef = useRef<HTMLDivElement>(null);

  // Seletor de usuários (mesmo padrão do de geradores)
  const [userPickerQuery, setUserPickerQuery] = useState('');
  const [userPickerOpen, setUserPickerOpen] = useState(false);
  const userPickerRef = useRef<HTMLDivElement>(null);

  // Credits management modal state
  const [creditsTarget, setCreditsTarget] = useState<Company | null>(null);
  const [creditsAmount, setCreditsAmount] = useState('30');
  const [creditsSaving, setCreditsSaving] = useState(false);

  const fetchCompanies = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      // Cookie httpOnly autentica sozinho — sem token manual.
      const res = await fetch('/api/companies');
      if (res.ok) {
        const data = await res.json();
        setCompanies(data);
      } else {
        const errData = await res.json();
        setError(errData.message || 'Falha ao buscar empresas.');
      }
    } catch (err) {
      console.error('Error fetching companies:', err);
      setError('Erro de conexão ao buscar empresas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompanies();
  }, [user]);

  // Fecha os dropdowns ao clicar fora deles
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (generatorPickerRef.current && !generatorPickerRef.current.contains(e.target as Node)) {
        setGeneratorPickerOpen(false);
      }
      if (userPickerRef.current && !userPickerRef.current.contains(e.target as Node)) {
        setUserPickerOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleOpenAdd = () => {
    setEditingId(null);
    setCompanyName('');
    setSelectedGeneratorIds([]);
    setSelectedUserIds([]);
    setGeneratorPickerQuery('');
    setUserPickerQuery('');
    setIsFormOpen(true);
  };

  const handleOpenEdit = (company: Company) => {
    setEditingId(company.id);
    setCompanyName(company.name);

    const associatedGeneratorIds = generators
      .filter(g => g.companyId === company.id)
      .map(g => g.id);
    setSelectedGeneratorIds(associatedGeneratorIds);

    const associatedUserIds = users
      .filter(u => u.companyId === company.id)
      .map(u => u.id);
    setSelectedUserIds(associatedUserIds);

    setGeneratorPickerQuery('');
    setUserPickerQuery('');
    setIsFormOpen(true);
  };

  const toggleGeneratorSelection = (genId: string) => {
    setSelectedGeneratorIds(prev =>
      prev.includes(genId) ? prev.filter(id => id !== genId) : [...prev, genId]
    );
  };

  const toggleUserSelection = (userId: User['id']) => {
    setSelectedUserIds(prev =>
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const filteredGeneratorOptions = useMemo(() => {
    const term = normalize(generatorPickerQuery.trim());
    return generators
      .filter(g => !selectedGeneratorIds.includes(g.id))
      .filter(g => !term || normalize(g.name).includes(term));
  }, [generators, generatorPickerQuery, selectedGeneratorIds]);

  const selectedGenerators = useMemo(
    () => selectedGeneratorIds
      .map(id => generators.find(g => g.id === id))
      .filter((g): g is NonNullable<typeof g> => !!g),
    [selectedGeneratorIds, generators]
  );

  const filteredUserOptions = useMemo(() => {
    const term = normalize(userPickerQuery.trim());
    return users
      .filter(u => !selectedUserIds.includes(u.id))
      .filter(u => !term || normalize(u.name).includes(term) || normalize(u.email).includes(term));
  }, [users, userPickerQuery, selectedUserIds]);

  const selectedUsers = useMemo(
    () => selectedUserIds
      .map(id => users.find(u => u.id === id))
      .filter((u): u is NonNullable<typeof u> => !!u),
    [selectedUserIds, users]
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !user) return;

    setLoading(true);
    setError(null);
    try {
      const url = editingId ? `/api/companies/${editingId}` : '/api/companies';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: companyName.trim(),
          generatorIds: selectedGeneratorIds,
          userIds: selectedUserIds,
        }),
      });

      if (res.ok) {
        setIsFormOpen(false);
        setCompanyName('');
        setSelectedGeneratorIds([]);
        setSelectedUserIds([]);
        setEditingId(null);
        // UserContext e GeneratorContext só buscam dados uma vez ao montar —
        // sem isso, o companyId de geradores/usuários que acabou de mudar aqui
        // fica desatualizado no resto do app até um F5 manual. Reabrir "editar"
        // nesta mesma empresa mostraria o estado ANTIGO (parecendo que salvar
        // não funcionou), mesmo o backend já tendo gravado certinho.
        await Promise.all([fetchCompanies(), fetchGenerators(), refreshUsers()]);
      } else {
        const errData = await res.json();
        setError(errData.message || 'Erro ao salvar empresa.');
      }
    } catch (err) {
      console.error('Error saving company:', err);
      setError('Erro de rede ao salvar empresa.');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenCredits = (company: Company) => {
    setCreditsTarget(company);
    setCreditsAmount('10');
  };

  // amount > 0 adiciona, amount < 0 remove. O modal permanece aberto e o saldo
  // é atualizado ao vivo com o retorno do servidor, para permitir vários ajustes.
  const handleAddCredits = async (amount: number) => {
    if (!creditsTarget || !user || !Number.isFinite(amount) || amount === 0) return;
    setCreditsSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${creditsTarget.id}/credits`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount }),
      });
      if (res.ok) {
        const updated = await res.json();
        setCreditsTarget(prev => (prev ? { ...prev, credits: updated.credits } : prev));
        await fetchCompanies();
      } else {
        const errData = await res.json();
        setError(errData.message || 'Erro ao atualizar créditos.');
      }
    } catch (err) {
      console.error('Error updating credits:', err);
      setError('Erro de rede ao atualizar créditos.');
    } finally {
      setCreditsSaving(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Deseja realmente remover esta empresa? Isso removerá o vínculo de todos os usuários e geradores associados a ela.') || !user) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${id}`, { method: 'DELETE' });
      if (res.ok) {
        // Excluir a empresa também desvincula geradores/usuários dela (ON
        // DELETE SET NULL) — mesma necessidade de atualizar os dois contextos.
        await Promise.all([fetchCompanies(), fetchGenerators(), refreshUsers()]);
      } else {
        const errData = await res.json();
        setError(errData.message || 'Erro ao excluir empresa.');
      }
    } catch (err) {
      console.error('Error deleting company:', err);
      setError('Erro de rede ao excluir empresa.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Loading Indicator */}
      {loading && (
        <div className="fixed top-4 right-4 z-50 bg-ciklo-orange text-black px-4 py-2 rounded-full font-bold shadow-lg animate-pulse flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
          Processando...
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Gestão de Empresas / Grupos</h2>
          <p className="text-gray-400 text-sm">Gerencie divisões de clientes e seus geradores</p>
        </div>
        <div className="flex gap-2">
          {!isFormOpen && (
            <button
              onClick={handleOpenAdd}
              className="bg-ciklo-orange hover:bg-orange-600 text-black font-bold px-6 py-3 rounded-lg flex items-center gap-2 transition-colors"
            >
              <Plus size={20} />
              Nova Empresa
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="bg-red-500/10 border border-red-500 text-red-400 p-4 rounded-lg text-sm">
          {error}
        </div>
      )}

      {/* Add/Edit Company Form */}
      {isFormOpen && (
        <div className="bg-ciklo-card border border-gray-800 rounded-xl p-6 animate-in fade-in slide-in-from-top-4">
          <h3 className="text-lg font-bold text-white mb-4">
            {editingId ? 'Editar Empresa' : 'Cadastrar Nova Empresa'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Nome da Empresa / Grupo</label>
              <input
                type="text"
                required
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none"
                placeholder="Ex: Companhia de Energia Alfa"
              />
            </div>

            {/* Seleção de Geradores — dropdown pesquisável */}
            <div ref={generatorPickerRef} className="border-t border-gray-800 pt-4">
              <h4 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
                <Server size={16} className="text-ciklo-orange" />
                Associar Geradores a esta Empresa
              </h4>
              <div className="relative">
                <Search className="absolute left-3 top-3.5 text-gray-500 pointer-events-none" size={16} />
                <input
                  type="text"
                  value={generatorPickerQuery}
                  onChange={(e) => { setGeneratorPickerQuery(e.target.value); setGeneratorPickerOpen(true); }}
                  onFocus={() => setGeneratorPickerOpen(true)}
                  className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 pl-10 text-white focus:border-ciklo-orange outline-none"
                  placeholder="Digite o nome do gerador pra adicionar..."
                />
                {generatorPickerOpen && (
                  <div className="absolute z-20 mt-1 w-full bg-ciklo-black border border-gray-700 rounded-lg shadow-xl max-h-56 overflow-y-auto">
                    {filteredGeneratorOptions.length > 0 ? filteredGeneratorOptions.map(gen => {
                      const isOwnedByAnother = gen.companyId !== undefined && gen.companyId !== editingId;
                      return (
                        <button
                          type="button"
                          key={gen.id}
                          onClick={() => {
                            toggleGeneratorSelection(gen.id);
                            setGeneratorPickerQuery('');
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-800 transition-colors flex items-center justify-between gap-2"
                        >
                          <span className="text-gray-200">{gen.name}</span>
                          <span className="text-xs text-gray-500 truncate">
                            {isOwnedByAnother ? `Grupo atual: ${gen.companyName}` : gen.location}
                          </span>
                        </button>
                      );
                    }) : (
                      <p className="px-3 py-2 text-sm text-gray-500">Nenhum gerador encontrado.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Geradores selecionados */}
              <div className="mt-3 space-y-2">
                {selectedGenerators.map(gen => (
                  <div
                    key={gen.id}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-lg border bg-ciklo-orange/10 border-ciklo-orange"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ciklo-yellow truncate">{gen.name}</p>
                      <p className="text-xs text-gray-500 truncate">{gen.location}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => toggleGeneratorSelection(gen.id)}
                      className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
                      title="Remover"
                    >
                      <X size={16} />
                    </button>
                  </div>
                ))}
                {selectedGenerators.length === 0 && (
                  <p className="text-sm text-gray-500">Nenhum gerador associado ainda.</p>
                )}
              </div>
            </div>

            {/* Seleção de Usuários — mesmo padrão de dropdown pesquisável */}
            <div ref={userPickerRef} className="border-t border-gray-800 pt-4">
              <h4 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
                <UsersIcon size={16} className="text-ciklo-orange" />
                Associar Usuários a esta Empresa
              </h4>
              <div className="relative">
                <Search className="absolute left-3 top-3.5 text-gray-500 pointer-events-none" size={16} />
                <input
                  type="text"
                  value={userPickerQuery}
                  onChange={(e) => { setUserPickerQuery(e.target.value); setUserPickerOpen(true); }}
                  onFocus={() => setUserPickerOpen(true)}
                  className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 pl-10 text-white focus:border-ciklo-orange outline-none"
                  placeholder="Digite o nome ou e-mail do usuário pra adicionar..."
                />
                {userPickerOpen && (
                  <div className="absolute z-20 mt-1 w-full bg-ciklo-black border border-gray-700 rounded-lg shadow-xl max-h-56 overflow-y-auto">
                    {filteredUserOptions.length > 0 ? filteredUserOptions.map(u => {
                      const isOwnedByAnother = u.companyId !== undefined && u.companyId !== editingId;
                      return (
                        <button
                          type="button"
                          key={u.id}
                          onClick={() => {
                            toggleUserSelection(u.id);
                            setUserPickerQuery('');
                          }}
                          className="w-full text-left px-3 py-2 text-sm hover:bg-gray-800 transition-colors flex items-center justify-between gap-2"
                        >
                          <span className="text-gray-200 truncate">{u.name} <span className="text-gray-500">({u.email})</span></span>
                          <span className="text-xs text-gray-500 truncate shrink-0">
                            {isOwnedByAnother ? `Empresa atual: ${u.companyName}` : roleLabel(u.role)}
                          </span>
                        </button>
                      );
                    }) : (
                      <p className="px-3 py-2 text-sm text-gray-500">Nenhum usuário encontrado.</p>
                    )}
                  </div>
                )}
              </div>

              {/* Usuários selecionados */}
              <div className="mt-3 space-y-2">
                {selectedUsers.map(u => (
                  <div
                    key={u.id}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-lg border bg-ciklo-orange/10 border-ciklo-orange"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-ciklo-yellow truncate">{u.name}</p>
                      <p className="text-xs text-gray-500 truncate">{u.email} · {roleLabel(u.role)}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => navigate('/users', { state: { editUserId: u.id } })}
                        className="p-1.5 text-gray-400 hover:text-ciklo-orange hover:bg-ciklo-orange/10 rounded-lg transition-colors"
                        title="Editar Usuário"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleUserSelection(u.id)}
                        className="p-1.5 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Remover"
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>
                ))}
                {selectedUsers.length === 0 && (
                  <p className="text-sm text-gray-500">Nenhum usuário associado ainda.</p>
                )}
              </div>
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg flex items-center gap-2"
              >
                <Check size={18} /> {editingId ? 'Atualizar' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Companies List */}
      <div className="bg-ciklo-card rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#1a1a1a] text-gray-500 text-[11px] uppercase tracking-wider font-bold border-b border-gray-800">
              <tr>
                <th className="p-4 pl-6">ID</th>
                <th className="p-4">Nome da Empresa</th>
                <th className="p-4">Data de Criação</th>
                <th className="p-4 text-center">Créditos</th>
                <th className="p-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {companies.map((c) => (
                <tr key={c.id} className="hover:bg-gray-800/30 transition-colors group">
                  <td className="p-4 pl-6 text-sm font-mono text-gray-500">#{c.id}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-ciklo-orange font-bold border border-gray-700">
                        <Building size={18} />
                      </div>
                      <div>
                        <p className="font-bold text-white text-sm">{c.name}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-gray-400">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString('pt-BR') : '-'}
                  </td>
                  <td className="p-4 text-center">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenCredits(c);
                      }}
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-bold transition-all hover:brightness-125 ${
                        (c.credits ?? 0) <= 0
                          ? 'bg-red-500/10 border-red-500/30 text-red-400'
                          : (c.credits ?? 0) <= 7
                          ? 'bg-orange-500/10 border-orange-500/30 text-orange-400'
                          : 'bg-green-500/10 border-green-500/30 text-green-400'
                      }`}
                      title="Gerenciar créditos"
                    >
                      <CreditCard size={14} /> {c.credits ?? 0}
                    </button>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEdit(c);
                        }}
                        className="p-2 text-gray-500 hover:text-ciklo-orange hover:bg-orange-500/10 rounded-lg transition-all"
                        title="Editar Empresa"
                      >
                        <Edit size={18} />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(c.id);
                        }}
                        className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                        title="Remover Empresa"
                      >
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {companies.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-gray-500 text-sm">
                    Nenhuma empresa cadastrada. Clique em "Nova Empresa" para começar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Credits Management Modal */}
      {creditsTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setCreditsTarget(null)}
        >
          <div
            className="bg-ciklo-card border border-gray-800 rounded-xl p-6 w-full max-w-sm animate-in fade-in slide-in-from-bottom-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold text-white mb-1">Créditos — {creditsTarget.name}</h3>
            <p className="text-sm text-gray-400 mb-5">
              Saldo atual: <span className="font-bold text-white">{creditsTarget.credits ?? 0}</span> créditos
            </p>

            {/* Quantidade + botões de adicionar / remover */}
            {(() => {
              const qty = Math.max(0, Math.floor(Math.abs(Number(creditsAmount) || 0)));
              const saldo = creditsTarget.credits ?? 0;
              return (
                <>
                  <label className="block text-sm text-gray-400 mb-1.5">Quantidade</label>
                  <div className="flex items-stretch gap-2 mb-3 h-12">
                    <button
                      type="button"
                      disabled={creditsSaving || qty === 0}
                      onClick={() => handleAddCredits(-qty)}
                      title="Remover créditos"
                      className="w-12 shrink-0 flex items-center justify-center bg-red-600 hover:bg-red-500 text-white text-2xl leading-none rounded-lg disabled:opacity-40 transition-colors"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min="1"
                      value={creditsAmount}
                      onChange={(e) => setCreditsAmount(e.target.value)}
                      className="flex-1 min-w-0 bg-ciklo-black border border-gray-700 rounded-lg text-center text-white text-xl font-bold focus:border-ciklo-orange outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    />
                    <button
                      type="button"
                      disabled={creditsSaving || qty === 0}
                      onClick={() => handleAddCredits(qty)}
                      title="Adicionar créditos"
                      className="w-12 shrink-0 flex items-center justify-center bg-green-600 hover:bg-green-500 text-white text-2xl leading-none rounded-lg disabled:opacity-40 transition-colors"
                    >
                      +
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 mb-4">
                    {qty > 0 ? (
                      <>Resultado: <span className="text-green-400 font-medium">{saldo + qty}</span> ao adicionar · <span className="text-red-400 font-medium">{Math.max(0, saldo - qty)}</span> ao remover</>
                    ) : (
                      'Informe uma quantidade e use + para adicionar ou − para remover.'
                    )}
                  </p>

                  {/* Atalhos rápidos */}
                  <div className="flex gap-2">
                    {[10, 30, 60].map(n => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setCreditsAmount(String(n))}
                        className="flex-1 py-1.5 text-xs font-bold rounded-lg border border-gray-700 text-gray-300 hover:border-ciklo-orange hover:text-ciklo-orange transition-colors"
                      >
                        {n}
                      </button>
                    ))}
                  </div>
                </>
              );
            })()}

            <div className="flex justify-end mt-5">
              <button
                type="button"
                onClick={() => setCreditsTarget(null)}
                className="px-4 py-2 text-gray-400 hover:text-white transition-colors"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CompanyManagement;
