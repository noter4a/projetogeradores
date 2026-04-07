import React, { useState, useEffect } from 'react';
import { BookOpen, Plus, Pencil, Trash2, X, Search, Zap, Settings, Shield, Cpu, Box } from 'lucide-react';
import { 
  QmCatalogGenerator, 
  QmCatalogMotor, 
  QmCatalogAlternator, 
  QmCatalogModule, 
  QmCatalogAccessory 
} from '../../types';

type TabType = 'geradores' | 'motores' | 'alternadores' | 'modulos' | 'acessorios';

const Catalog: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('geradores');
  const [data, setData] = useState<any[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');
  
  const [formData, setFormData] = useState<any>({});

  const formatCurrency = (val: any) => {
    if (!val) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val));
  };

  const tabs = [
    { id: 'geradores', label: 'Geradores', icon: Zap },
    { id: 'motores', label: 'Motores', icon: Settings },
    { id: 'alternadores', label: 'Alternadores', icon: Shield },
    { id: 'modulos', label: 'Módulos', icon: Cpu },
    { id: 'acessorios', label: 'Acessórios', icon: Box },
  ] as const;

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('ciklo_auth_token');
      const res = await fetch(`/api/catalog/${activeTab}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error(`Error fetching ${activeTab}:`, err);
    }
  };

  useEffect(() => {
    fetchData();
    setIsFormOpen(false);
    setSearch('');
  }, [activeTab]);

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({});
    setIsFormOpen(true);
  };

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    setFormData(item);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm(`Tem certeza que deseja excluir?`)) return;
    try {
      const token = localStorage.getItem('ciklo_auth_token');
      const res = await fetch(`/api/catalog/${activeTab}/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchData();
      } else {
        const err = await res.json();
        alert(`Erro: ${err.message || err.error}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('ciklo_auth_token');
      const method = editingId ? 'PUT' : 'POST';
      const url = editingId ? `/api/catalog/${activeTab}/${editingId}` : `/api/catalog/${activeTab}`;
      
      const payload: any = { ...formData };
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        setIsFormOpen(false);
        fetchData();
      } else {
        const err = await res.json();
        alert(`Erro: ${err.message || err.error}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Dynamic filtering based on active tab properties
  const filteredData = data.filter(item => {
    const term = search.toLowerCase();
    if (activeTab === 'acessorios') {
      return item.grupo?.toLowerCase().includes(term) || item.itens_incluidos?.toLowerCase().includes(term);
    }
    return item.modelo?.toLowerCase().includes(term) || item.descricao?.toLowerCase().includes(term);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <BookOpen className="text-ciklo-orange" />
            Catálogo Base
          </h2>
          <p className="text-gray-400 text-sm">Gerencie os componentes para construção dos orçamentos</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex overflow-x-auto border-b border-gray-800 scrollbar-hide">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as TabType)}
            className={`flex items-center gap-2 px-6 py-3 border-b-2 whitespace-nowrap transition-colors ${
              activeTab === tab.id 
                ? 'border-ciklo-orange text-white bg-gray-800/50' 
                : 'border-transparent text-gray-400 hover:text-white hover:bg-gray-800/30'
            }`}
          >
            <tab.icon size={18} className={activeTab === tab.id ? "text-ciklo-yellow" : ""} />
            <span className="font-medium capitalize">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      {!isFormOpen && (
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative w-full sm:w-80">
            <Search className="absolute left-3 top-2.5 text-gray-500" size={18} />
            <input
              type="text"
              placeholder={`Buscar em ${activeTab}...`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-ciklo-card border border-gray-800 rounded-lg py-2 pl-10 pr-4 text-white focus:border-ciklo-orange outline-none"
            />
          </div>
          <button
            onClick={handleOpenAdd}
            className="whitespace-nowrap bg-gradient-to-r from-ciklo-yellow to-ciklo-orange hover:from-orange-500 hover:to-orange-600 text-black font-bold px-4 py-2 rounded-lg shadow-lg flex items-center gap-2 transition-transform hover:-translate-y-0.5"
          >
            <Plus size={20} />
            Adicionar Item
          </button>
        </div>
      )}

      {/* Form */}
      {isFormOpen && (
        <div className="bg-ciklo-card border border-gray-800 rounded-xl p-6 animate-in fade-in">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2 capitalize">
              <Plus className="text-ciklo-yellow" />
              {editingId ? 'Editar' : 'Novo'} {activeTab === 'geradores' ? 'Gerador' : 
                activeTab === 'motores' ? 'Motor' :
                activeTab === 'alternadores' ? 'Alternador' :
                activeTab === 'modulos' ? 'Módulo' : 'Acessório'}
            </h3>
            <button onClick={() => setIsFormOpen(false)} className="text-gray-400 hover:text-white">
              <X size={24} />
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              
              {activeTab === 'acessorios' ? (
                <>
                   <div className="col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">Grupo *</label>
                    <input type="text" required value={formData.grupo || ''} onChange={e => setFormData({...formData, grupo: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-ciklo-orange" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">Itens Incluídos</label>
                    <textarea rows={3} value={formData.itens_incluidos || ''} onChange={e => setFormData({...formData, itens_incluidos: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-ciklo-orange" />
                  </div>
                </>
              ) : (
                <>
                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">Modelo *</label>
                    <input type="text" required value={formData.modelo || ''} onChange={e => setFormData({...formData, modelo: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-ciklo-orange" />
                  </div>
                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">Descrição</label>
                    <textarea rows={2} value={formData.descricao || ''} onChange={e => setFormData({...formData, descricao: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-ciklo-orange" />
                  </div>
                  
                  {(activeTab === 'geradores' || activeTab === 'motores') && (
                    <div className="col-span-1">
                      <label className="block text-sm text-gray-400 mb-1">Proteção/Carenagem</label>
                      <input type="text" value={formData.protecao || ''} onChange={e => setFormData({...formData, protecao: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-ciklo-orange" />
                    </div>
                  )}

                  {activeTab === 'geradores' && (
                    <>
                      <div className="col-span-1">
                        <label className="block text-sm text-gray-400 mb-1">Tensões (Ex: 220/127V, 380/220V)</label>
                        <input type="text" value={formData.tensoes || ''} onChange={e => setFormData({...formData, tensoes: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-ciklo-orange" />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-sm text-gray-400 mb-1">Unidade (Ex: UN)</label>
                        <input type="text" value={formData.unidade || 'UN'} onChange={e => setFormData({...formData, unidade: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-ciklo-orange" />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-sm text-gray-400 mb-1">Valor Unitário Base (R$)</label>
                        <input type="number" step="0.01" value={formData.valor_unitario || ''} onChange={e => setFormData({...formData, valor_unitario: parseFloat(e.target.value)})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-ciklo-orange" />
                      </div>
                      <div className="col-span-1 border-t border-gray-800 pt-3 md:border-none md:pt-0 mt-2 md:mt-0">
                        <label className="block text-sm text-gray-400 mb-1">FINAME</label>
                        <input type="text" value={formData.finame || ''} onChange={e => setFormData({...formData, finame: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-ciklo-orange" placeholder="Código FINAME (opcional)" />
                      </div>
                      <div className="col-span-1 border-t border-gray-800 pt-3 md:border-none md:pt-0 mt-2 md:mt-0">
                        <label className="block text-sm text-gray-400 mb-1">MDA</label>
                        <input type="text" value={formData.mda || ''} onChange={e => setFormData({...formData, mda: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-ciklo-orange" placeholder="MDA (opcional)" />
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-gray-800">
              <button type="button" onClick={() => setIsFormOpen(false)} className="px-6 py-2 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
              <button type="submit" className="bg-ciklo-orange hover:bg-orange-600 text-white font-bold px-8 py-2 rounded-lg shadow-lg transition-colors">
                {editingId ? 'Salvar Alterações' : 'Adicionar Item'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Dynamic Table Content */}
      {!isFormOpen && (
        <div className="bg-ciklo-card rounded-xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-800/50 border-b border-gray-700 text-gray-400 text-sm uppercase tracking-wider">
                  {activeTab === 'acessorios' ? (
                    <>
                      <th className="p-4 font-medium w-1/3">Grupo</th>
                      <th className="p-4 font-medium">Itens Incluídos</th>
                    </>
                  ) : (
                    <>
                      <th className="p-4 font-medium min-w-[200px]">Modelo</th>
                      <th className="p-4 font-medium hidden md:table-cell">Descrição</th>
                      {(activeTab === 'geradores' || activeTab === 'motores') && <th className="p-4 font-medium hidden lg:table-cell">Proteção</th>}
                      {activeTab === 'geradores' && <th className="p-4 font-medium">Valor Base</th>}
                    </>
                  )}
                  <th className="p-4 font-medium text-right w-24">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredData.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-gray-500">
                      Nenhum item encontrado nesta categoria.
                    </td>
                  </tr>
                ) : (
                  filteredData.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-800/30 transition-colors">
                      {activeTab === 'acessorios' ? (
                        <>
                          <td className="p-4 font-semibold text-white">{item.grupo}</td>
                          <td className="p-4 text-gray-400 text-sm line-clamp-2">{item.itens_incluidos || '-'}</td>
                        </>
                      ) : (
                        <>
                          <td className="p-4 font-semibold text-white">{item.modelo}</td>
                          <td className="p-4 text-gray-400 text-sm hidden md:table-cell truncate max-w-xs" title={item.descricao}>{item.descricao || '-'}</td>
                          {(activeTab === 'geradores' || activeTab === 'motores') && (
                            <td className="p-4 text-gray-300 hidden lg:table-cell">{item.protecao || '-'}</td>
                          )}
                          {activeTab === 'geradores' && (
                            <td className="p-4 text-ciklo-yellow font-medium">{formatCurrency(item.valor_unitario)}</td>
                          )}
                        </>
                      )}
                      
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button onClick={() => handleEdit(item)} className="p-2 text-gray-400 hover:text-ciklo-yellow hover:bg-yellow-500/10 rounded-lg transition-colors">
                            <Pencil size={18} />
                          </button>
                          <button onClick={() => handleDelete(item.id)} className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
                            <Trash2 size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Catalog;
