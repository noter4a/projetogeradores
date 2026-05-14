import React, { useState, useEffect, useRef, useMemo } from 'react';
import { BookOpen, Plus, Pencil, Trash2, X, Search, Zap, Settings, Shield, Cpu, Box, ImagePlus, XCircle, Copy, Cable, ChevronLeft, ChevronRight } from 'lucide-react';
import CurrencyInput from '../../components/CurrencyInput';
import { 
  QmCatalogGenerator, 
  QmCatalogMotor, 
  QmCatalogAlternator, 
  QmCatalogModule, 
  QmCatalogAccessory,
  QmCatalogDimension
} from '../../types';

type TabType = 'geradores' | 'tensoes_cat' | 'motores' | 'alternadores' | 'modulos' | 'acessorios' | 'dimensoes';

const Catalog: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('geradores');
  const [data, setData] = useState<any[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  // Pagination
  const ITEMS_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState(1);
  
  const [formData, setFormData] = useState<any>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { alert('Selecione uma imagem válida.'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => setFormData((prev: any) => ({ ...prev, imagem_base64: ev.target?.result as string }));
    reader.readAsDataURL(file);
  };

  const formatCurrency = (val: any) => {
    if (!val) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val));
  };

  const tabs = [
    { id: 'geradores', label: 'Geradores', icon: Zap },
    { id: 'tensoes_cat', label: 'Tensões', icon: Cable },
    { id: 'motores', label: 'Motores', icon: Settings },
    { id: 'alternadores', label: 'Alternadores', icon: Shield },
    { id: 'modulos', label: 'Módulos', icon: Cpu },
    { id: 'acessorios', label: 'Acessórios', icon: Box },
    { id: 'dimensoes', label: 'Dimensionamento', icon: Box },
  ] as const;

  const fetchData = async () => {
    try {
      const token = localStorage.getItem('ciklo_auth_token');
      const tabRoute = activeTab === 'tensoes_cat' ? 'tensoes' : activeTab;
      const res = await fetch(`/api/catalog/${tabRoute}`, {
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
    setCurrentPage(1);
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
      const tabRoute = activeTab === 'tensoes_cat' ? 'tensoes' : activeTab;
      const res = await fetch(`/api/catalog/${tabRoute}/${id}`, {
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

  const handleDuplicate = async (item: any) => {
    try {
      const token = localStorage.getItem('ciklo_auth_token');
      const tabRoute = activeTab === 'tensoes_cat' ? 'tensoes' : activeTab;
      const { id, created_at, updated_at, ...payload } = item;
      const res = await fetch(`/api/catalog/${tabRoute}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        fetchData();
      } else {
        const err = await res.json();
        alert(`Erro ao duplicar: ${err.message || err.error}`);
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
      const tabRoute = activeTab === 'tensoes_cat' ? 'tensoes' : activeTab;
      const url = editingId ? `/api/catalog/${tabRoute}/${editingId}` : `/api/catalog/${tabRoute}`;
      
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
    if (activeTab === 'dimensoes') {
      return item.id_dimensionamento?.toLowerCase().includes(term) || item.dimensoes?.toLowerCase().includes(term);
    }
    return item.modelo?.toLowerCase().includes(term) || item.descricao?.toLowerCase().includes(term);
  });

  // Pagination computed values
  const totalPages = Math.max(1, Math.ceil(filteredData.length / ITEMS_PER_PAGE));
  const paginatedData = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredData.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredData, currentPage]);

  // Reset page when search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [search]);

  // Clamp page if data shrinks
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [filteredData.length, totalPages]);

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
                activeTab === 'tensoes_cat' ? 'Tensão' :
                activeTab === 'motores' ? 'Motor' :
                activeTab === 'alternadores' ? 'Alternador' :
                activeTab === 'modulos' ? 'Módulo' : 
                activeTab === 'dimensoes' ? 'Dimensionamento' : 'Acessório'}
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
                    <label className="block text-sm text-gray-400 mb-1">Grupo de Acessórios *</label>
                    <input type="text" required value={formData.grupo || ''} onChange={e => setFormData({...formData, grupo: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-ciklo-orange" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">Acessórios Incluídos</label>
                    <textarea rows={3} value={formData.itens_incluidos || ''} onChange={e => setFormData({...formData, itens_incluidos: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-ciklo-orange" />
                  </div>
                </>
              ) : activeTab === 'dimensoes' ? (
                <>
                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">ID Dimensionamento *</label>
                    <input type="text" required value={formData.id_dimensionamento || ''} onChange={e => setFormData({...formData, id_dimensionamento: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-ciklo-orange" placeholder="Ex: 20 KVA CARENADO IVECO" />
                  </div>
                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">Dimensões (Texto Livre)</label>
                    <textarea rows={3} value={formData.dimensoes || ''} onChange={e => setFormData({...formData, dimensoes: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-ciklo-orange" placeholder="Ex: comprimento 1800 x largura 880..." />
                  </div>
                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">Anexo em Imagem</label>
                    <div className="flex items-start gap-4">
                      <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 hover:border-ciklo-orange hover:text-white transition-colors">
                        <ImagePlus size={18} /> Selecionar Imagem
                      </button>
                      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                      {formData.imagem_base64 && (
                        <div className="relative">
                          <img src={formData.imagem_base64} alt="preview" className="h-20 w-auto rounded-lg border border-gray-700 object-contain" />
                          <button type="button" onClick={() => setFormData((p: any) => ({ ...p, imagem_base64: null }))} className="absolute -top-2 -right-2 text-red-400 hover:text-red-300">
                            <XCircle size={18} />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </>
              ) : activeTab === 'tensoes_cat' ? (
                <>
                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">Tensão *</label>
                    <input type="text" required value={formData.descricao || ''} onChange={e => setFormData({...formData, descricao: e.target.value})} placeholder="TRIFÁSICO,380/220V" className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-ciklo-orange placeholder-gray-600" />
                  </div>
                </>
              ) : (
                <>
                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">{activeTab === 'motores' ? 'ESP 2' : activeTab === 'alternadores' ? 'ESP 1' : activeTab === 'modulos' ? 'ESP 3' : 'Modelo'} *</label>
                    <input type="text" required value={formData.modelo || ''} onChange={e => setFormData({...formData, modelo: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-ciklo-orange" />
                  </div>
                  <div className="col-span-1 md:col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">{activeTab === 'motores' ? 'ESP 2.1' : activeTab === 'alternadores' ? 'ESP 1.1' : activeTab === 'modulos' ? 'ESP 3.1' : 'Descrição'}</label>
                    <textarea rows={2} value={formData.descricao || ''} onChange={e => setFormData({...formData, descricao: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-ciklo-orange" />
                  </div>

                  {activeTab === 'modulos' && (
                    <div className="col-span-1 md:col-span-2">
                      <label className="block text-sm text-gray-400 mb-1">Anexo em Imagem</label>
                      <div className="flex items-start gap-4">
                        <button type="button" onClick={() => fileInputRef.current?.click()} className="flex items-center gap-2 px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-300 hover:border-ciklo-orange hover:text-white transition-colors">
                          <ImagePlus size={18} /> Selecionar Imagem
                        </button>
                        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageUpload} />
                        {formData.imagem_base64 && (
                          <div className="relative">
                            <img src={formData.imagem_base64} alt="preview" className="h-20 w-auto rounded-lg border border-gray-700 object-contain" />
                            <button type="button" onClick={() => setFormData((p: any) => ({ ...p, imagem_base64: null }))} className="absolute -top-2 -right-2 text-red-400 hover:text-red-300">
                              <XCircle size={18} />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {(activeTab === 'geradores' || activeTab === 'motores') && (
                    <div className="col-span-1">
                      <label className="block text-sm text-gray-400 mb-1">{activeTab === 'motores' ? 'PROTEÇÃO 2' : 'Proteção/Carenagem'}</label>
                      <input type="text" value={formData.protecao || ''} onChange={e => setFormData({...formData, protecao: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-ciklo-orange" />
                    </div>
                  )}

                  {activeTab === 'geradores' && (
                    <>
                      <div className="col-span-1">
                        <label className="block text-sm text-gray-400 mb-1">Unidade (Ex: UN)</label>
                        <input type="text" value={formData.unidade || 'UN'} onChange={e => setFormData({...formData, unidade: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-ciklo-orange" />
                      </div>
                      <div className="col-span-1">
                        <label className="block text-sm text-gray-400 mb-1">Valor Unitário Base (R$)</label>
                        <CurrencyInput
                          value={formData.valor_unitario}
                          onChange={(val) => setFormData({...formData, valor_unitario: val})}
                          className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none focus:border-ciklo-orange"
                        />
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
                      <th className="p-4 font-medium w-1/3">Grupo de Acessórios</th>
                      <th className="p-4 font-medium">Acessórios Incluídos</th>
                    </>
                  ) : activeTab === 'dimensoes' ? (
                    <>
                      <th className="p-4 font-medium min-w-[200px]">ID Dimensionamento</th>
                      <th className="p-4 font-medium">Dimensões</th>
                      <th className="p-4 font-medium hidden lg:table-cell">Imagem</th>
                    </>
                  ) : activeTab === 'tensoes_cat' ? (
                    <>
                      <th className="p-4 font-medium">Tensão</th>
                    </>
                  ) : (
                    <>
                      <th className="p-4 font-medium min-w-[200px]">{activeTab === 'motores' ? 'ESP 2' : activeTab === 'alternadores' ? 'ESP 1' : activeTab === 'modulos' ? 'ESP 3' : 'Modelo'}</th>
                      <th className="p-4 font-medium hidden md:table-cell">{activeTab === 'motores' ? 'ESP 2.1' : activeTab === 'alternadores' ? 'ESP 1.1' : activeTab === 'modulos' ? 'ESP 3.1' : 'Descrição'}</th>
                      {activeTab === 'modulos' && <th className="p-4 font-medium hidden lg:table-cell">Imagem</th>}
                      {(activeTab === 'geradores' || activeTab === 'motores') && <th className="p-4 font-medium hidden lg:table-cell">{activeTab === 'motores' ? 'PROTEÇÃO 2' : 'Proteção'}</th>}
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
                  paginatedData.map((item) => (
                    <tr key={item.id} className="hover:bg-gray-800/30 transition-colors">
                      {activeTab === 'acessorios' ? (
                        <>
                          <td className="p-4 font-semibold text-white">{item.grupo}</td>
                          <td className="p-4 text-gray-400 text-sm line-clamp-2">{item.itens_incluidos || '-'}</td>
                        </>
                      ) : activeTab === 'dimensoes' ? (
                        <>
                          <td className="p-4 font-semibold text-white">{item.id_dimensionamento}</td>
                          <td className="p-4 text-gray-400 text-sm whitespace-pre-wrap">{item.dimensoes || '-'}</td>
                          <td className="p-4 hidden lg:table-cell">
                            {item.imagem_base64
                              ? <img src={item.imagem_base64} alt="img" className="h-12 w-auto rounded border border-gray-700 object-contain cursor-pointer" onClick={() => window.open(item.imagem_base64)} />
                              : <span className="text-gray-600 text-xs">Sem imagem</span>
                            }
                          </td>
                        </>
                      ) : activeTab === 'tensoes_cat' ? (
                        <>
                          <td className="p-4 font-semibold text-white">{item.descricao}</td>
                        </>
                      ) : (
                        <>
                          <td className="p-4 font-semibold text-white">{item.modelo}</td>
                          <td className="p-4 text-gray-400 text-sm hidden md:table-cell truncate max-w-xs" title={item.descricao}>{item.descricao || '-'}</td>
                          {activeTab === 'modulos' && (
                            <td className="p-4 hidden lg:table-cell">
                              {item.imagem_base64
                                ? <img src={item.imagem_base64} alt="img" className="h-12 w-auto rounded border border-gray-700 object-contain cursor-pointer" onClick={() => window.open(item.imagem_base64)} />
                                : <span className="text-gray-600 text-xs">Sem imagem</span>
                              }
                            </td>
                          )}
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
                          <button onClick={() => handleDuplicate(item)} title="Duplicar" className="p-2 text-gray-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors">
                            <Copy size={18} />
                          </button>
                          <button onClick={() => handleEdit(item)} title="Editar" className="p-2 text-gray-400 hover:text-ciklo-yellow hover:bg-yellow-500/10 rounded-lg transition-colors">
                            <Pencil size={18} />
                          </button>
                          <button onClick={() => handleDelete(item.id)} title="Excluir" className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">
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

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800 bg-[#1a1a1a]">
              <span className="text-xs text-gray-500">
                Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredData.length)} de {filteredData.length} itens
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
      )}
    </div>
  );
};

export default Catalog;
