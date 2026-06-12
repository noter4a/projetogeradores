import React, { useState, useEffect } from 'react';
import { LayoutDashboard, Save, X, ArrowRight, User as UserIcon, ListPlus, Box, DollarSign, PlusCircle } from 'lucide-react';
import CurrencyInput from '../../components/CurrencyInput';
import { useNavigate, useParams } from 'react-router-dom';
import { 
  QmClient, QmCatalogGenerator, QmCatalogMotor, QmCatalogAlternator, 
  QmCatalogModule, QmCatalogAccessory, QmCatalogDimension 
} from '../../types';
import { formatCurrency as formatCurrencyBase } from '../../utils/formatters';

const NewProposal: React.FC = () => {
  const navigate = useNavigate();
  const { id: editId } = useParams<{ id: string }>();
  const isEditMode = !!editId;
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Catalogs
  const [clients, setClients] = useState<QmClient[]>([]);
  const [generators, setGenerators] = useState<QmCatalogGenerator[]>([]);
  const [motors, setMotors] = useState<QmCatalogMotor[]>([]);
  const [alternators, setAlternators] = useState<QmCatalogAlternator[]>([]);
  const [modules, setModules] = useState<QmCatalogModule[]>([]);
  const [accessories, setAccessories] = useState<QmCatalogAccessory[]>([]);
  const [dimensions, setDimensions] = useState<QmCatalogDimension[]>([]);
  const [tensoes, setTensoes] = useState<any[]>([]);

  // Items (multiple generators)
  type ItemProposta = { geradorId: string; quantidade: number; valorUnit: number; modeloCustom?: string; };
  const [itens, setItens] = useState<ItemProposta[]>([{ geradorId: '', quantidade: 1, valorUnit: 0 }]);

  // Form State
  const [clientId, setClientId] = useState('');
  const [motorId, setMotorId] = useState('');
  const [alternadorId, setAlternadorId] = useState('');
  const [moduloId, setModuloId] = useState('');
  const [acessorioId, setAcessorioId] = useState('');
  const [dimensaoId, setDimensaoId] = useState('');
  const [tensaoId, setTensaoId] = useState('');
  const [outrosAcessorios, setOutrosAcessorios] = useState('');
  const [isNewGerador, setIsNewGerador] = useState(false);
  const [newGerador, setNewGerador] = useState({ modelo: '', descricao: '', valor_unitario: 0, unidade: 'UN' });
  const [savingGerador, setSavingGerador] = useState(false);

  // Config State
  const [frete, setFrete] = useState('');
  const [ipi, setIpi] = useState('');
  const [icms, setIcms] = useState('');
  const [formaPagamento, setFormaPagamento] = useState('');
  const [prazoEntrega, setPrazoEntrega] = useState('');
  const [validadeDias, setValidadeDias] = useState(10);
  const [moeda, setMoeda] = useState<'BRL' | 'USD'>('BRL');

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const token = localStorage.getItem('ciklo_auth_token');
        const headers = { 'Authorization': `Bearer ${token}` };

        const [resClients, resGen, resMot, resAlt, resMod, resAcc, resDim, resTen] = await Promise.all([
          fetch('/api/crm', { headers }),
          fetch('/api/catalog/geradores', { headers }),
          fetch('/api/catalog/motores', { headers }),
          fetch('/api/catalog/alternadores', { headers }),
          fetch('/api/catalog/modulos', { headers }),
          fetch('/api/catalog/acessorios', { headers }),
          fetch('/api/catalog/dimensoes', { headers }),
          fetch('/api/catalog/tensoes', { headers })
        ]);

        if (resClients.ok) setClients(await resClients.json());
        if (resGen.ok) setGenerators(await resGen.json());
        if (resMot.ok) setMotors(await resMot.json());
        if (resAlt.ok) setAlternators(await resAlt.json());
        if (resMod.ok) setModules(await resMod.json());
        if (resAcc.ok) setAccessories(await resAcc.json());
        if (resDim.ok) setDimensions(await resDim.json());
        if (resTen.ok) setTensoes(await resTen.json());

        // Load existing proposal for edit mode
        if (editId) {
          const resProp = await fetch(`/api/proposals/${editId}`, { headers });
          if (resProp.ok) {
            const prop = await resProp.json();
            setClientId(prop.cliente_id ? String(prop.cliente_id) : '');
            setMotorId(prop.motor_id ? String(prop.motor_id) : '');
            setAlternadorId(prop.alternador_id ? String(prop.alternador_id) : '');
            setModuloId(prop.modulo_id ? String(prop.modulo_id) : '');
            setAcessorioId(prop.acessorio_id ? String(prop.acessorio_id) : '');
            setDimensaoId(prop.dimensao_id ? String(prop.dimensao_id) : '');
            setTensaoId(prop.tensao_id ? String(prop.tensao_id) : '');
            setOutrosAcessorios(prop.outros_acessorios || '');
            setFrete(prop.frete || '');
            setIpi(prop.ipi || '');
            setIcms(prop.icms || '');
            setFormaPagamento(prop.forma_pagamento || '');
            setPrazoEntrega(prop.prazo_entrega || '');
            setMoeda(prop.moeda === 'USD' ? 'USD' : 'BRL');

            // Calculate validity days from valido_ate
            if (prop.valido_ate) {
              const validDate = new Date(prop.valido_ate);
              const today = new Date();
              const diffDays = Math.max(1, Math.ceil((validDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24)));
              setValidadeDias(diffDays);
            }

            // Load items
            if (prop.itens && prop.itens.length > 0) {
              setItens(prop.itens.map((item: any) => ({
                geradorId: item.gerador_id ? String(item.gerador_id) : (item.modelo_custom ? `temp_${Date.now()}_${Math.random()}` : ''),
                quantidade: item.quantidade || 1,
                valorUnit: Number(item.valor_unitario) || 0,
                modeloCustom: item.modelo_custom || undefined
              })));
            } else if (prop.gerador_id) {
              // Backward compat: single generator
              setItens([{
                geradorId: String(prop.gerador_id),
                quantidade: prop.quantidade || 1,
                valorUnit: prop.valor_total ? Number(prop.valor_total) / (prop.quantidade || 1) : 0
              }]);
            }
          }
        }

      } catch (err) {
        console.error('Error fetching data for form:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchAll();
  }, [editId]);

  // Calculate total from all items
  const valorTotal = itens.reduce((sum, item) => sum + (item.valorUnit * item.quantidade), 0);

  // Helper to update a single item
  const updateItem = (index: number, field: keyof ItemProposta, value: any) => {
    setItens(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };

      return updated;
    });
  };
  const addItem = () => setItens(prev => [...prev, { geradorId: '', quantidade: 1, valorUnit: 0, modeloCustom: undefined }]);
  const removeItem = (index: number) => { if (itens.length > 1) setItens(prev => prev.filter((_, i) => i !== index)); };

  const handleSave = async (status: string) => {
    if (!clientId || itens.every(i => !i.geradorId && !i.modeloCustom)) {
      alert("Por favor selecione pelo menos o Cliente e um Gerador.");
      return;
    }

    setSaving(true);
    try {
      const token = localStorage.getItem('ciklo_auth_token');
      
      const hoje = new Date();
      hoje.setDate(hoje.getDate() + validadeDias);

      const validItens = itens.filter(i => i.geradorId || i.modeloCustom);
      const payload = {
        cliente_id: Number(clientId),
        gerador_id: validItens.length > 0 ? Number(validItens[0].geradorId) : null,
        quantidade: validItens.length > 0 ? validItens[0].quantidade : 1,
        motor_id: motorId ? Number(motorId) : null,
        alternador_id: alternadorId ? Number(alternadorId) : null,
        modulo_id: moduloId ? Number(moduloId) : null,
        acessorio_id: acessorioId ? Number(acessorioId) : null,
        dimensao_id: dimensaoId ? Number(dimensaoId) : null,
        tensao_id: tensaoId ? Number(tensaoId) : null,
        outros_acessorios: outrosAcessorios,
        frete, ipi, icms, forma_pagamento: formaPagamento, prazo_entrega: prazoEntrega,
        valido_ate: hoje.toISOString(),
        valor_total: valorTotal,
        status: status,
        itens: validItens.map(i => ({ gerador_id: i.geradorId.startsWith('temp_') ? null : Number(i.geradorId), quantidade: i.quantidade, valor_unitario: i.valorUnit, modelo_custom: i.modeloCustom || null })),
        moeda: moeda
      };

      const url = isEditMode ? `/api/proposals/${editId}` : '/api/proposals';
      const method = isEditMode ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(payload)
      });

      if (res.ok) {
        // Success
        navigate('/sales/proposals');
      } else {
        const err = await res.json();
        alert('Erro ao salvar proposta: ' + (err.message || err.error));
      }
    } catch (err) {
      console.error(err);
      alert('Erro inesperado ao salvar.');
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (val: number) => formatCurrencyBase(val, moeda);

  if (loading) {
    return <div className="text-white text-center py-10">Carregando módulos...</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-10">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <LayoutDashboard className="text-ciklo-orange" />
            {isEditMode ? 'Editar Proposta' : 'Nova Proposta Comercial'}
          </h2>
          <p className="text-gray-400 text-sm">{isEditMode ? 'Modifique os dados e salve as alterações.' : 'Preencha os dados abaixo para compor o orçamento.'}</p>
        </div>
        <button onClick={() => navigate('/sales/proposals')} className="text-gray-400 hover:text-white p-2">
          <X size={24} />
        </button>
      </div>

      {/* Grid of panels */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Col: Main Form */}
        <div className="lg:col-span-2 space-y-6">
          
          {/* Card: Cliente */}
          <div className="bg-ciklo-card border border-gray-800 rounded-xl p-6 shadow-lg">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4 border-b border-gray-800 pb-2">
              <UserIcon className="text-ciklo-yellow" size={20} />
              1. Cliente
            </h3>
            <select
              value={clientId}
              onChange={e => setClientId(e.target.value)}
              className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-3 text-white focus:border-ciklo-orange outline-none"
            >
              <option value="">-- Selecione o Cliente (CRM) --</option>
              {clients.map(c => (
                <option key={c.id} value={c.id}>{c.razao_social} {c.cnpj_cpf ? `(${c.cnpj_cpf})` : ''}</option>
              ))}
            </select>
          </div>

          {/* Card: Gerador */}
          <div className="bg-ciklo-card border border-gray-800 rounded-xl p-6 shadow-lg">
            <div className="flex justify-between items-center mb-4 border-b border-gray-800 pb-2">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Box className="text-ciklo-yellow" size={20} />
                2. Composição do Produto
              </h3>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-400">Moeda:</label>
                <select
                  value={moeda}
                  onChange={e => setMoeda(e.target.value as 'BRL' | 'USD')}
                  className="bg-ciklo-black border border-gray-700 rounded-lg px-3 py-1 text-white focus:border-ciklo-orange outline-none text-sm font-semibold"
                >
                  <option value="BRL">R$ (Real)</option>
                  <option value="USD">US$ (Dólar)</option>
                </select>
              </div>
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Geradores *</label>
                {itens.map((item, idx) => (
                  <div key={idx} className="mb-3 bg-gray-800/30 border border-gray-700 rounded-lg p-3">
                    {item.modeloCustom ? (
                      <div className="flex gap-2 mb-2">
                        <input type="text" value={item.modeloCustom}
                          onChange={e => updateItem(idx, 'modeloCustom', e.target.value)}
                          className="flex-1 bg-ciklo-black border border-ciklo-yellow/50 rounded-lg p-2.5 text-ciklo-yellow font-semibold outline-none text-sm"
                          placeholder="Nome do gerador" />
                        <span className="text-xs text-gray-500 self-center whitespace-nowrap">Temporário</span>
                      </div>
                    ) : (
                      <select
                        value={item.geradorId}
                        onChange={e => { if (e.target.value === '__new__') { setIsNewGerador(true); } else { updateItem(idx, 'geradorId', e.target.value); } }}
                        className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none text-sm mb-2"
                      >
                        <option value="">-- Selecione o Gerador --</option>
                        {[...generators].sort((a, b) => {
                          const numA = parseFloat((a.modelo || '').match(/[\d.\/]+/)?.[0]?.split('/')[0] || '0');
                          const numB = parseFloat((b.modelo || '').match(/[\d.\/]+/)?.[0]?.split('/')[0] || '0');
                          return numA - numB;
                        }).map(g => (
                          <option key={g.id} value={g.id}>{g.modelo}</option>
                        ))}
                        <option value="__new__">{String.fromCodePoint(10133)} Cadastrar Novo Gerador</option>
                      </select>
                    )}
                    <div className="flex gap-2 items-center">
                      <div className="flex-shrink-0">
                        <label className="block text-xs text-gray-500 mb-0.5">Qtd</label>
                        <input type="number" min="1" value={item.quantidade}
                          onChange={e => updateItem(idx, 'quantidade', parseInt(e.target.value) || 1)}
                          className="w-16 bg-ciklo-black border border-gray-700 rounded-lg p-2 text-white text-center outline-none text-sm" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <label className="block text-xs text-gray-500 mb-0.5">Valor Unitário</label>
                        <CurrencyInput value={item.valorUnit}
                          onChange={(val) => updateItem(idx, 'valorUnit', val)}
                          moeda={moeda}
                          className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2 text-white text-right outline-none text-sm" />
                      </div>
                      {itens.length > 1 && (
                        <button type="button" onClick={() => removeItem(idx)} className="text-red-400 hover:text-red-300 p-1.5 mt-4 flex-shrink-0" title="Remover"><X size={16} /></button>
                      )}
                    </div>
                  </div>
                ))}
                <button type="button" onClick={addItem} className="flex items-center gap-1 text-ciklo-yellow hover:text-ciklo-orange text-sm mt-1">
                  <PlusCircle size={14} /> Adicionar outro gerador
                </button>

                {isNewGerador && (
                  <div className="mt-3 bg-gray-800/50 border border-gray-700 rounded-lg p-4 space-y-3">
                    <div className="text-sm text-ciklo-yellow font-semibold flex items-center gap-1 mb-2">
                      <PlusCircle size={16} /> Cadastrar Novo Gerador
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Modelo *</label>
                        <input type="text" value={newGerador.modelo} onChange={e => setNewGerador({...newGerador, modelo: e.target.value})} placeholder="Ex: GG-100/90KVA" className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2 text-white text-sm outline-none focus:border-ciklo-orange placeholder-gray-600" />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-400 mb-1">Valor Unitário ({moeda === 'USD' ? 'US$' : 'R$'})</label>
                        <CurrencyInput value={newGerador.valor_unitario} onChange={(val) => setNewGerador({...newGerador, valor_unitario: val})} moeda={moeda} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2 text-white text-sm outline-none focus:border-ciklo-orange" />
                      </div>
                      <div className="col-span-1 md:col-span-2">
                        <label className="block text-xs text-gray-400 mb-1">Descrição</label>
                        <textarea rows={2} value={newGerador.descricao} onChange={e => setNewGerador({...newGerador, descricao: e.target.value})} placeholder="Descrição completa do gerador" className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2 text-white text-sm outline-none focus:border-ciklo-orange placeholder-gray-600" />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={savingGerador || !newGerador.modelo}
                        onClick={() => {
                          if (!newGerador.modelo) return;
                          // Adiciona como item temporário local (não salva no catálogo)
                          const tempId = `temp_${Date.now()}`;
                          setItens(prev => [...prev, {
                            geradorId: tempId,
                            quantidade: 1,
                            valorUnit: newGerador.valor_unitario || 0,
                            modeloCustom: newGerador.modelo
                          }]);
                          setIsNewGerador(false);
                          setNewGerador({ modelo: '', descricao: '', valor_unitario: 0, unidade: 'UN' });
                        }}
                        className="bg-ciklo-orange hover:bg-orange-600 text-black font-bold px-4 py-1.5 rounded-lg text-sm disabled:opacity-50 transition-colors"
                      >
                        'Adicionar'
                      </button>
                      <button type="button" onClick={() => { setIsNewGerador(false); }} className="text-gray-400 hover:text-white text-sm px-3 py-1.5">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>


              <div className="mb-4">
                <label className="block text-sm text-gray-400 mb-1">Tensão</label>
                <select value={tensaoId} onChange={e => setTensaoId(e.target.value)} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none">
                  <option value="">-- Nenhum Selecionado --</option>
                  {tensoes.map(t => <option key={t.id} value={t.id}>{t.descricao}</option>)}
                </select>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Motor</label>
                  <select value={motorId} onChange={e => setMotorId(e.target.value)} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none">
                    <option value="">-- Nenhum Selecionado --</option>
                    {motors.map(m => <option key={m.id} value={m.id}>{m.modelo}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Alternador</label>
                  <select value={alternadorId} onChange={e => setAlternadorId(e.target.value)} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none">
                    <option value="">-- Nenhum Selecionado --</option>
                    {alternators.map(a => <option key={a.id} value={a.id}>{a.modelo}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Módulo Controlador</label>
                  <select value={moduloId} onChange={e => setModuloId(e.target.value)} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none">
                    <option value="">-- Nenhum Selecionado --</option>
                    {modules.map(mod => <option key={mod.id} value={mod.id}>{mod.modelo}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Dimensionamento e Peso</label>
                  <select value={dimensaoId} onChange={e => setDimensaoId(e.target.value)} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none">
                    <option value="">-- Nenhum Selecionado --</option>
                    {dimensions.map(d => <option key={d.id} value={d.id}>{d.id_dimensionamento}</option>)}
                  </select>
                </div>
                <div className="col-span-1 md:col-span-2">
                  <label className="block text-sm text-gray-400 mb-1">Pacote de Acessórios Base</label>
                  <select value={acessorioId} onChange={e => setAcessorioId(e.target.value)} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none">
                    <option value="">-- Nenhum Selecionado --</option>
                    {accessories.map(acc => <option key={acc.id} value={acc.id}>{acc.grupo}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Observações</label>
                <textarea 
                  rows={2} 
                  placeholder="Ex: Informações adicionais para a proposta"
                  value={outrosAcessorios}
                  onChange={e => setOutrosAcessorios(e.target.value)}
                  className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none" 
                />
              </div>

            </div>
          </div>

        </div>

        {/* Right Col: Configs & Submit */}
        <div className="space-y-6">
          <div className="bg-ciklo-card border border-gray-800 rounded-xl p-6 shadow-lg space-y-4">
            <h3 className="text-lg font-bold text-white flex items-center gap-2 mb-4 border-b border-gray-800 pb-2">
              <ListPlus className="text-ciklo-yellow" size={20} />
              3. Parâmetros Comerciais
            </h3>

            <div>
              <label className="block text-sm text-gray-400 mb-1">Validade (Dias)</label>
              <input type="number" value={validadeDias} onChange={e => setValidadeDias(parseInt(e.target.value))} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Prazo de Entrega</label>
              <input type="text" value={prazoEntrega} onChange={e => setPrazoEntrega(e.target.value)} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none" />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Forma de Pagamento</label>
              <input type="text" value={formaPagamento} onChange={e => setFormaPagamento(e.target.value)} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none" />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Frete</label>
                <input type="text" value={frete} onChange={e => setFrete(e.target.value)} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">IPI</label>
                <input type="text" value={ipi} onChange={e => setIpi(e.target.value)} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white outline-none" />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">ICMS (%)</label>
                <div className="relative">
                  <input
                    type="number"
                    min="0" max="100" step="0.01"
                    placeholder="0,00"
                    value={icms}
                    onChange={e => setIcms(e.target.value)}
                    className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 pr-8 text-white outline-none"
                  />
                  <span className="absolute right-3 top-2.5 text-gray-400 text-sm">%</span>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-gray-800/40 border border-gray-700 rounded-xl p-6 shadow-lg">
            <div className="mb-4 flex justify-between items-center bg-gray-900/60 border border-gray-700 rounded-xl p-4">
              <span className="text-sm text-gray-400">Valor Total da Proposta</span>
              <span className="text-xl font-bold text-ciklo-orange">{formatCurrency(valorTotal)}</span>
            </div>
            <button 
              onClick={() => handleSave('ENVIADA')}
              disabled={saving}
              className="w-full bg-gradient-to-r from-ciklo-yellow to-ciklo-orange hover:from-orange-500 hover:to-orange-600 text-black font-bold py-3 rounded-lg shadow-lg flex items-center justify-center gap-2 transition-transform transform hover:-translate-y-0.5 disabled:opacity-50"
            >
              <Save size={20} />
              {saving ? 'Salvando...' : (isEditMode ? 'Salvar Alterações' : 'Salvar Proposta')}
            </button>

          </div>
        </div>
      </div>
    </div>
  );
};

export default NewProposal;
