import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Search, ChevronDown, X, Check } from 'lucide-react';
import { QmClient } from '../types';

interface ClientSearchSelectProps {
  clients: QmClient[];
  value: string;
  onChange: (id: string) => void;
  placeholder?: string;
}

const normalize = (s: string) =>
  (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

const ClientSearchSelect: React.FC<ClientSearchSelectProps> = ({
  clients,
  value,
  onChange,
  placeholder = 'Buscar cliente por nome, CNPJ/CPF, contato...',
}) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selectedClient = useMemo(
    () => clients.find(c => String(c.id) === String(value)),
    [clients, value]
  );

  const filtered = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return clients;
    const terms = q.split(/\s+/);
    return clients.filter(c => {
      const haystack = normalize(
        [c.razao_social, c.cnpj_cpf, c.contato, c.municipio, c.uf, c.email]
          .filter(Boolean)
          .join(' ')
      );
      return terms.every(t => haystack.includes(t));
    });
  }, [clients, query]);

  useEffect(() => {
    setHighlight(0);
  }, [query, open]);

  useEffect(() => {
    const onClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery('');
      }
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const openDropdown = () => {
    setOpen(true);
    setQuery('');
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const selectClient = (c: QmClient) => {
    onChange(String(c.id));
    setOpen(false);
    setQuery('');
  };

  const clearSelection = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange('');
    setQuery('');
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlight(h => Math.min(h + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlight(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filtered[highlight]) selectClient(filtered[highlight]);
    } else if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger / selected value */}
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openDropdown())}
        className="w-full flex items-center justify-between gap-2 bg-ciklo-black border border-gray-700 rounded-lg p-3 text-left focus:border-ciklo-orange outline-none hover:border-gray-600 transition-colors"
      >
        <span className={`truncate ${selectedClient ? 'text-white' : 'text-gray-500'}`}>
          {selectedClient
            ? `${selectedClient.razao_social}${selectedClient.cnpj_cpf ? ` (${selectedClient.cnpj_cpf})` : ''}`
            : '-- Selecione o Cliente (CRM) --'}
        </span>
        <span className="flex items-center gap-1 shrink-0">
          {selectedClient && (
            <span
              role="button"
              tabIndex={0}
              onClick={clearSelection}
              className="text-gray-500 hover:text-red-400 p-0.5"
              title="Limpar seleção"
            >
              <X size={16} />
            </span>
          )}
          <ChevronDown size={18} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-50 mt-2 w-full bg-ciklo-card border border-gray-700 rounded-lg shadow-2xl shadow-black/50 overflow-hidden">
          <div className="p-2 border-b border-gray-800 sticky top-0 bg-ciklo-card">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={placeholder}
                className="w-full bg-ciklo-black border border-gray-700 rounded-lg pl-9 pr-3 py-2.5 text-sm text-white focus:border-ciklo-orange outline-none placeholder-gray-600"
              />
            </div>
          </div>

          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-sm text-gray-500">
                Nenhum cliente encontrado para "{query}".
              </div>
            ) : (
              filtered.map((c, idx) => {
                const isSelected = String(c.id) === String(value);
                const isHighlighted = idx === highlight;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => selectClient(c)}
                    onMouseEnter={() => setHighlight(idx)}
                    className={`w-full text-left px-4 py-2.5 flex items-center justify-between gap-3 transition-colors ${
                      isHighlighted ? 'bg-ciklo-orange/10' : ''
                    } ${isSelected ? 'bg-ciklo-orange/5' : ''}`}
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white truncate">{c.razao_social}</p>
                      <p className="text-xs text-gray-500 truncate">
                        {[c.cnpj_cpf, c.municipio && c.uf ? `${c.municipio}/${c.uf}` : c.municipio, c.contato]
                          .filter(Boolean)
                          .join(' • ')}
                      </p>
                    </div>
                    {isSelected && <Check size={16} className="text-ciklo-orange shrink-0" />}
                  </button>
                );
              })
            )}
          </div>

          <div className="px-3 py-2 border-t border-gray-800 text-[11px] text-gray-600 bg-ciklo-card">
            {filtered.length} de {clients.length} cliente(s)
          </div>
        </div>
      )}
    </div>
  );
};

export default ClientSearchSelect;
