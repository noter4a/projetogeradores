import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useGenerators } from '../context/GeneratorContext';
import { useUsers } from '../context/UserContext';
import { GeneratorStatus } from '../types';
import { Trash2, PlusCircle, MapPin, Zap, Server, Pencil, Building, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { normalizeSearch as normalize } from '../utils/formatters';

const FleetManagement: React.FC = () => {
  const navigate = useNavigate();
  const { generators, removeGenerator } = useGenerators();
  const { users, updateUser } = useUsers();

  // Filters
  const [search, setSearch] = useState('');
  // '' = todas as empresas, 'none' = geradores sem empresa vinculada
  const [companyFilter, setCompanyFilter] = useState<string>('');

  // Company options come from the generators themselves rather than a
  // /api/companies fetch: filtering by a company with no generators would
  // only ever produce an empty list.
  const companyOptions = useMemo(() => {
    const seen = new Map<number, string>();
    generators.forEach(g => {
      if (g.companyId && g.companyName) seen.set(g.companyId, g.companyName);
    });
    return Array.from(seen, ([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  }, [generators]);

  const filteredGenerators = useMemo(() => {
    const term = normalize(search.trim());
    return generators.filter(g => {
      const matchesSearch = !term ||
        normalize(g.name || '').includes(term) ||
        normalize(g.id || '').includes(term) ||
        normalize(g.model || '').includes(term) ||
        normalize(g.location || '').includes(term) ||
        normalize(g.companyName || '').includes(term);

      const matchesCompany =
        companyFilter === '' ||
        (companyFilter === 'none' ? !g.companyId : g.companyId === Number(companyFilter));

      return matchesSearch && matchesCompany;
    });
  }, [generators, search, companyFilter]);

  const hasActiveFilters = search.trim() !== '' || companyFilter !== '';

  const clearFilters = () => {
    setSearch('');
    setCompanyFilter('');
  };

  // Pagination
  const ITEMS_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filteredGenerators.length / ITEMS_PER_PAGE));
  const paginatedGenerators = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredGenerators.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredGenerators, currentPage]);

  // Back to page 1 whenever the filters change the result set
  useEffect(() => {
    setCurrentPage(1);
  }, [search, companyFilter]);

  // Keep the page in range when generators are added/removed
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [filteredGenerators.length, totalPages]);

  const handleDelete = (id: string) => {
    // 1. Remove the generator from the generator list
    removeGenerator(id);

    // 2. Referential Integrity (Simulation):
    // Remove this generator ID from all users who have it assigned.
    // This prevents "phantom" references in the User Management screen.
    users.forEach(user => {
      if (user.assignedGeneratorIds?.includes(id)) {
        updateUser({
          ...user,
          assignedGeneratorIds: user.assignedGeneratorIds.filter(gId => gId !== id)
        });
      }
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Gerenciar Grupos Geradores</h2>
          <p className="text-gray-400 text-sm">Adicione, edite ou remova grupos geradores do sistema</p>
        </div>
        <button 
          onClick={() => navigate('/add-generator')}
          className="bg-gradient-to-r from-ciklo-yellow to-ciklo-orange hover:from-orange-500 hover:to-orange-600 text-black font-bold px-6 py-3 rounded-lg shadow-lg shadow-orange-900/20 flex items-center gap-2 transition-all transform hover:-translate-y-0.5"
        >
          <PlusCircle size={20} />
          Novo Gerador
        </button>
      </div>

      {/* Filter Bar */}
      <div className="bg-ciklo-card border border-gray-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-ciklo-black border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-white placeholder-gray-600 focus:border-ciklo-orange outline-none"
            placeholder="Buscar por nome, ID, modelo, local ou empresa..."
          />
        </div>

        <div className="relative md:w-64">
          <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={18} />
          <select
            value={companyFilter}
            onChange={e => setCompanyFilter(e.target.value)}
            className="w-full bg-ciklo-black border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-white focus:border-ciklo-orange outline-none appearance-none"
          >
            <option value="">Todas as Empresas</option>
            <option value="none">Sem Empresa</option>
            {companyOptions.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 border border-gray-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <X size={16} />
            Limpar
          </button>
        )}
      </div>

      <div className="bg-ciklo-card rounded-xl border border-gray-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#1a1a1a] text-gray-500 text-[11px] uppercase tracking-wider font-bold border-b border-gray-800">
              <tr>
                <th className="p-4 pl-6">Identificação</th>
                <th className="p-4">Empresa</th>
                <th className="p-4">Localização</th>
                <th className="p-4">Modelo</th>
                <th className="p-4">Potência</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredGenerators.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-12 text-center text-gray-500">
                    {hasActiveFilters
                      ? 'Nenhum gerador encontrado com os filtros aplicados.'
                      : 'Nenhum gerador registrado no momento.'}
                  </td>
                </tr>
              ) : (
                paginatedGenerators.map((gen) => (
                  <tr key={gen.id} className="hover:bg-gray-800/30 transition-colors group">
                    <td className="p-4 pl-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-gray-800/50 border border-gray-700 flex items-center justify-center text-ciklo-orange group-hover:border-ciklo-orange/50 transition-colors">
                          <Server size={20} />
                        </div>
                        <div>
                          <p className="font-bold text-white text-sm">{gen.name}</p>
                          <p className="text-[10px] text-gray-500 font-mono mt-0.5">{gen.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="p-4 text-gray-400 text-sm">
                      <div className="flex items-center gap-2">
                        <Building size={14} className="text-gray-600" />
                        {gen.companyName || <span className="text-gray-600 italic">Nenhuma</span>}
                      </div>
                    </td>
                    <td className="p-4 text-gray-400 text-sm">
                      <div className="flex items-center gap-2">
                        <MapPin size={14} className="text-gray-600" />
                        {gen.location}
                      </div>
                    </td>
                    <td className="p-4 text-gray-300 text-sm font-medium">{gen.model}</td>
                    <td className="p-4">
                      <div className="flex items-center gap-1.5 font-mono text-ciklo-yellow text-sm font-bold">
                        <Zap size={14} />
                        {gen.powerKVA} kVA
                      </div>
                    </td>
                    <td className="p-4">
                       <span className={`px-2.5 py-1 rounded text-[10px] font-bold uppercase tracking-wide border ${
                         gen.status === GeneratorStatus.RUNNING ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                         gen.status === GeneratorStatus.ALARM ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                         'bg-gray-700/30 text-gray-400 border-gray-700'
                       }`}>
                         {gen.status === GeneratorStatus.RUNNING ? 'Ligado' : 
                          gen.status === GeneratorStatus.ALARM ? 'Alerta' : 'Parado'}
                       </span>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-2">
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            navigate(`/edit-generator/${gen.id}`);
                          }}
                          className="p-2.5 text-gray-500 hover:text-ciklo-orange hover:bg-orange-500/10 rounded-lg transition-all cursor-pointer z-10 relative"
                          title="Editar Gerador"
                        >
                          <Pencil size={18} className="pointer-events-none" />
                        </button>
                        <button 
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleDelete(gen.id);
                          }}
                          className="p-2.5 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all cursor-pointer z-10 relative"
                          title="Remover Gerador"
                        >
                          <Trash2 size={18} className="pointer-events-none" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800 bg-[#1a1a1a]">
            <span className="text-xs text-gray-500">
              Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredGenerators.length)} de {filteredGenerators.length} geradores
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-gray-700 text-gray-400 hover:bg-gray-800 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
              >
                <ChevronLeft size={16} />
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                <button
                  key={page}
                  onClick={() => setCurrentPage(page)}
                  className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors ${
                    page === currentPage
                      ? 'bg-ciklo-orange text-black'
                      : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                  }`}
                >
                  {page}
                </button>
              ))}
              <button
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages}
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

export default FleetManagement;