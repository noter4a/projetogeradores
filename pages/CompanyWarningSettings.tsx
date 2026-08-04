import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Building, Save, CheckSquare, Square } from 'lucide-react';
import { Company, UserRole, WarningCatalogCategory } from '../types';
import AccordionSection from '../components/generator-detail/AccordionSection';
import { useAuth } from '../context/AuthContext';

const CompanyWarningSettings: React.FC = () => {
  const { user } = useAuth();
  const isAdmin = user?.role === UserRole.ADMIN;

  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(isAdmin ? null : user?.companyId ?? null);
  const [categories, setCategories] = useState<WarningCatalogCategory[]>([]);
  const [installedControllers, setInstalledControllers] = useState<Set<string> | null>(null);
  const [enabledKeys, setEnabledKeys] = useState<Set<string>>(new Set());
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Cookie httpOnly autentica sozinho — sem token manual, em todas as chamadas abaixo.

  useEffect(() => {
    // Só ADMIN escolhe entre empresas — usuário de empresa fica travado na própria.
    if (isAdmin) {
      fetch('/api/companies')
        .then(res => res.json())
        .then((data: Company[]) => {
          setCompanies(data);
          if (data.length > 0) setSelectedCompanyId(data[0].id);
        })
        .catch(() => setCompanies([]));
    }

    fetch('/api/company-warnings/catalog')
      .then(res => res.json())
      .then(data => setCategories(data.categories || []))
      .catch(() => setCategories([]));
  }, [isAdmin]);

  useEffect(() => {
    if (selectedCompanyId == null) return;
    setLoading(true);
    setMessage(null);
    fetch(`/api/company-warnings/${selectedCompanyId}`)
      .then(res => res.json())
      .then(data => {
        setEnabledKeys(new Set(data.enabledWarnings || []));
        setInstalledControllers(new Set(data.installedControllers || []));
        setDirty(false);
      })
      .catch(() => {
        setEnabledKeys(new Set());
        setInstalledControllers(new Set());
      })
      .finally(() => setLoading(false));
  }, [selectedCompanyId]);

  // Só os avisos dos controladores que essa empresa de fato tem cadastrado —
  // não adianta mostrar aviso de KVA pra empresa que só tem SGC120.
  const visibleCategories = useMemo(() => {
    if (installedControllers == null) return categories;
    return categories
      .map(cat => ({ ...cat, items: cat.items.filter(item => installedControllers.has(item.controller)) }))
      .filter(cat => cat.items.length > 0);
  }, [categories, installedControllers]);

  const totalItems = useMemo(() => visibleCategories.reduce((sum, cat) => sum + cat.items.length, 0), [visibleCategories]);

  const toggleCategory = (id: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleKey = (key: string) => {
    setEnabledKeys(prev => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
    setDirty(true);
  };

  const setAllInCategory = (category: WarningCatalogCategory, enable: boolean) => {
    setEnabledKeys(prev => {
      const next = new Set(prev);
      for (const item of category.items) {
        enable ? next.add(item.key) : next.delete(item.key);
      }
      return next;
    });
    setDirty(true);
  };

  const handleSave = async () => {
    if (selectedCompanyId == null) return;
    setSaving(true);
    setMessage(null);
    try {
      const res = await fetch(`/api/company-warnings/${selectedCompanyId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabledWarnings: [...enabledKeys] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Falha ao salvar.');
      setEnabledKeys(new Set(data.enabledWarnings || []));
      setDirty(false);
      setMessage({ type: 'success', text: 'Configuração salva. Pode levar até 1 minuto pra valer em campo.' });
    } catch (err: any) {
      setMessage({ type: 'error', text: err.message || 'Erro de conexão ao salvar.' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Bell className="text-ciklo-orange" /> Configurações de Avisos
          </h1>
          <p className="text-gray-400 text-sm">
            Escolha quais Avisos (severidade separada de Falha/ALARME) cada empresa quer receber — notificação por
            WhatsApp/e-mail e badge amarelo no painel. Nada vem ativo por padrão: só o que for marcado aqui dispara.
          </p>
        </div>
        <button
          onClick={handleSave}
          disabled={saving || !dirty || selectedCompanyId == null}
          className="px-4 py-2.5 bg-ciklo-orange hover:bg-orange-500 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-black font-bold rounded-lg flex items-center justify-center gap-2 text-sm shrink-0"
        >
          <Save size={16} /> {saving ? 'Salvando...' : 'Salvar Alterações'}
        </button>
      </div>

      {message && (
        <div className={`rounded-xl border px-4 py-3 text-sm ${
          message.type === 'success'
            ? 'bg-green-900/20 border-green-900/40 text-green-300'
            : 'bg-red-900/20 border-red-900/40 text-red-300'
        }`}>
          {message.text}
        </div>
      )}

      <div className="bg-ciklo-card rounded-xl border border-gray-800 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        {isAdmin ? (
          <>
            <label className="flex items-center gap-2 text-gray-400 text-sm font-semibold shrink-0">
              <Building size={16} /> Empresa
            </label>
            <select
              value={selectedCompanyId ?? ''}
              onChange={(e) => setSelectedCompanyId(e.target.value ? Number(e.target.value) : null)}
              className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-white text-sm"
            >
              {companies.length === 0 && <option value="">Nenhuma empresa cadastrada</option>}
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </>
        ) : (
          <span className="flex items-center gap-2 text-gray-300 text-sm font-semibold">
            <Building size={16} className="text-ciklo-orange" /> {user?.companyName || 'Sua empresa'}
          </span>
        )}
        <span className="text-xs text-gray-500 whitespace-nowrap sm:ml-auto">
          {enabledKeys.size} de {totalItems} avisos habilitados
        </span>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-500">Carregando...</div>
      ) : selectedCompanyId == null ? (
        <div className="text-center py-16 bg-ciklo-card rounded-xl border border-gray-800 border-dashed text-gray-400">
          {isAdmin ? 'Cadastre uma empresa primeiro em Gerenciar Empresas.' : 'Sua conta não está vinculada a nenhuma empresa.'}
        </div>
      ) : visibleCategories.length === 0 ? (
        <div className="text-center py-16 bg-ciklo-card rounded-xl border border-gray-800 border-dashed text-gray-400">
          Nenhum controlador com Avisos suportados cadastrado nesta empresa ainda.
        </div>
      ) : (
        <div className="space-y-3">
          {visibleCategories.map(category => {
            const enabledInCategory = category.items.filter(item => enabledKeys.has(item.key)).length;
            const allEnabled = enabledInCategory === category.items.length;
            return (
              <AccordionSection
                key={category.id}
                icon={<Bell size={20} className={expandedCategories.has(category.id) ? 'text-black' : 'text-ciklo-orange'} />}
                title={category.label}
                summary={
                  <span className="text-xs text-gray-400 mt-0.5 block">
                    {enabledInCategory} de {category.items.length} habilitados
                  </span>
                }
                expanded={expandedCategories.has(category.id)}
                onToggle={() => toggleCategory(category.id)}
              >
                <div className="flex justify-end mb-3">
                  <button
                    onClick={() => setAllInCategory(category, !allEnabled)}
                    className="text-xs flex items-center gap-1.5 text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-2.5 py-1.5 rounded border border-gray-700 transition-colors"
                  >
                    {allEnabled ? <Square size={12} /> : <CheckSquare size={12} />}
                    {allEnabled ? 'Desmarcar todos' : 'Marcar todos'}
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {category.items.map(item => (
                    <label
                      key={item.key}
                      className="flex items-center gap-2.5 bg-ciklo-dark px-3 py-2 rounded-lg border border-gray-700/50 text-sm text-gray-300 cursor-pointer hover:border-gray-600"
                    >
                      <input
                        type="checkbox"
                        checked={enabledKeys.has(item.key)}
                        onChange={() => toggleKey(item.key)}
                        className="accent-ciklo-orange"
                      />
                      <span className="text-[10px] font-mono text-gray-500 shrink-0">[{item.controller}]</span>
                      <span className="truncate">{item.name}</span>
                    </label>
                  ))}
                </div>
              </AccordionSection>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default CompanyWarningSettings;
