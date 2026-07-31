import React from 'react';
import { RefreshCw, Send, Trash2 } from 'lucide-react';

export interface ModbusRegister {
  id: string;
  address: string;
  name: string;
  value: string;
  unit: string;
  type: 'READ' | 'WRITE';
  reading?: boolean;
  error?: string;
  newValue?: string;
  writing?: boolean;
  writeError?: string;
}

interface ModbusRegisterTableProps {
  mode: 'READ' | 'WRITE';
  registers: ModbusRegister[];
  onRead: (id: string, address: string) => void;
  onRemove: (id: string) => void;
  onValueChange?: (id: string, value: string) => void;
  onWrite?: (id: string, address: string) => void;
}

const ModbusRegisterTable: React.FC<ModbusRegisterTableProps> = ({ mode, registers, onRead, onRemove, onValueChange, onWrite }) => {
  const rows = registers.filter(r => r.type === mode);
  // The WRITE panel's original empty-state check used the length of ALL registers
  // (not just WRITE ones) — preserved as-is even though it looks like a pre-existing
  // quirk, since this refactor isn't meant to change behavior.
  const isEmpty = mode === 'READ' ? rows.length === 0 : registers.length === 0;

  return (
    <table className="w-full text-left">
      <thead className="bg-gray-800 text-gray-500 text-[10px] uppercase">
        <tr>
          <th className="p-3">Endereço</th>
          <th className="p-3">Nome</th>
          <th className="p-3 text-right">{mode === 'READ' ? 'Valor' : 'Valor Atual'}</th>
          <th className="p-3 text-right">{mode === 'READ' ? 'Ação' : 'Definir'}</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-800 text-sm">
        {rows.map(reg => (
          <tr key={reg.id} className="hover:bg-gray-800/30">
            <td className="p-3 font-mono text-gray-400">{reg.address}</td>
            <td className="p-3 text-white">{reg.name}</td>
            <td className="p-3 text-right font-mono font-bold text-ciklo-yellow">
              {reg.reading ? (
                <span className="text-gray-500 font-normal text-xs">lendo...</span>
              ) : reg.error ? (
                <span className="text-red-400 font-normal text-xs" title={reg.error}>{reg.error}</span>
              ) : (
                <>{reg.value} <span className="text-gray-600 text-xs font-normal">{reg.unit}</span></>
              )}
            </td>
            <td className="p-3 text-right">
              <div className="flex items-center justify-end gap-2">
                <button
                  onClick={() => onRead(reg.id, reg.address)}
                  disabled={reg.reading}
                  className="text-gray-500 hover:text-blue-400 disabled:opacity-40"
                  title="Ler novamente"
                >
                  <RefreshCw size={13} className={reg.reading ? 'animate-spin' : ''} />
                </button>
                {mode === 'WRITE' && (
                  <>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={reg.newValue ?? ''}
                      onChange={(e) => onValueChange?.(reg.id, e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') onWrite?.(reg.id, reg.address); }}
                      disabled={reg.writing}
                      className="w-16 bg-black border border-gray-700 rounded p-1 text-xs text-white text-right disabled:opacity-40"
                      placeholder="Novo"
                      title={reg.writeError || 'Valor a escrever (0-65535)'}
                    />
                    <button
                      onClick={() => onWrite?.(reg.id, reg.address)}
                      disabled={reg.writing || !reg.newValue}
                      className="p-1.5 bg-ciklo-orange hover:bg-orange-500 text-black rounded disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed"
                      title="Enviar valor pro equipamento"
                    >
                      <Send size={14} className={reg.writing ? 'animate-pulse' : ''} />
                    </button>
                  </>
                )}
                <button onClick={() => onRemove(reg.id)} className={`text-gray-600 hover:text-red-500 ${mode === 'WRITE' ? 'ml-1' : ''}`}>
                  <Trash2 size={14} />
                </button>
              </div>
              {mode === 'WRITE' && reg.writeError && (
                <div className="text-red-400 text-[10px] mt-1">{reg.writeError}</div>
              )}
            </td>
          </tr>
        ))}
        {isEmpty && (
          <tr><td colSpan={4} className="p-4 text-center text-gray-600 text-xs">{mode === 'READ' ? 'Nenhum parâmetro monitorado' : 'Nenhum comando disponível'}</td></tr>
        )}
      </tbody>
    </table>
  );
};

export default ModbusRegisterTable;
