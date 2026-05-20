import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { Company } from '../types';
import { Building, Plus, Trash2, Edit, Check, X, FolderPlus } from 'lucide-react';

const CompanyManagement: React.FC = () => {
  const { token } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form State
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [companyName, setCompanyName] = useState('');

  const fetchCompanies = async () => {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/companies', {
        headers: { Authorization: `Bearer ${token}` },
      });
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
  }, [token]);

  const handleOpenAdd = () => {
    setEditingId(null);
    setCompanyName('');
    setIsFormOpen(true);
  };

  const handleOpenEdit = (company: Company) => {
    setEditingId(company.id);
    setCompanyName(company.name);
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim() || !token) return;

    setLoading(true);
    setError(null);
    try {
      const url = editingId ? `/api/companies/${editingId}` : '/api/companies';
      const method = editingId ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: companyName.trim() }),
      });

      if (res.ok) {
        setIsFormOpen(false);
        setCompanyName('');
        setEditingId(null);
        await fetchCompanies();
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

  const handleDelete = async (id: number) => {
    if (!confirm('Deseja realmente remover esta empresa? Isso removerá o vínculo de todos os usuários e geradores associados a ela.') || !token) return;

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/companies/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        await fetchCompanies();
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
              className="bg-gradient-to-r from-ciklo-yellow to-ciklo-orange hover:from-orange-500 hover:to-orange-600 text-black font-bold px-6 py-3 rounded-lg shadow-lg shadow-orange-900/20 flex items-center gap-2 transition-all transform hover:-translate-y-0.5"
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
      <div className="bg-ciklo-card rounded-xl border border-gray-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#1a1a1a] text-gray-500 text-[11px] uppercase tracking-wider font-bold border-b border-gray-800">
              <tr>
                <th className="p-4 pl-6">ID</th>
                <th className="p-4">Nome da Empresa</th>
                <th className="p-4">Data de Criação</th>
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
                  <td colSpan={4} className="p-8 text-center text-gray-500 text-sm">
                    Nenhuma empresa cadastrada. Clique em "Nova Empresa" para começar.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default CompanyManagement;
