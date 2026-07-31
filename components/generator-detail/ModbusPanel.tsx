import React from 'react';
import { LayoutDashboard, Sliders, Plus } from 'lucide-react';
import { Generator } from '../../types';
import ModbusRegisterTable, { ModbusRegister } from './ModbusRegisterTable';

export interface ModbusRegisterRef {
  address: number;
  name: string;
  unit: string;
  access: string;
  notes?: string;
}

interface ModbusPanelProps {
  gen: Generator;
  modbusRegisters: ModbusRegister[];
  onSetModbusRegisters: React.Dispatch<React.SetStateAction<ModbusRegister[]>>;
  readAddress: string;
  onReadAddressChange: (value: string) => void;
  readName: string;
  onReadNameChange: (value: string) => void;
  readUnit: string;
  onReadUnitChange: (value: string) => void;
  writeAddress: string;
  onWriteAddressChange: (value: string) => void;
  writeName: string;
  onWriteNameChange: (value: string) => void;
  refRegisters: ModbusRegisterRef[];
  refLoading: boolean;
  refFilter: string;
  onRefFilterChange: (value: string) => void;
  onAddReadParameter: () => void;
  onAddWriteCommand: () => void;
  onReadRegister: (id: string, address: string) => void;
  onWriteRegister: (id: string, address: string) => void;
  onRemoveRegister: (id: string) => void;
}

const ModbusPanel: React.FC<ModbusPanelProps> = ({
  gen,
  modbusRegisters,
  onSetModbusRegisters,
  readAddress,
  onReadAddressChange,
  readName,
  onReadNameChange,
  readUnit,
  onReadUnitChange,
  writeAddress,
  onWriteAddressChange,
  writeName,
  onWriteNameChange,
  refRegisters,
  refLoading,
  refFilter,
  onRefFilterChange,
  onAddReadParameter,
  onAddWriteCommand,
  onReadRegister,
  onWriteRegister,
  onRemoveRegister,
}) => {
  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header Info */}
      <div className="bg-ciklo-card p-6 rounded-xl border border-gray-800">
        <h2 className="text-lg font-bold text-white mb-2">Comunicação Modbus</h2>
        <p className="text-sm text-gray-400">Protocolo: <span className="text-white font-mono">{gen.protocol || 'modbus_tcp'}</span> | IP: <span className="text-white font-mono">{gen.ip || '192.168.1.100'}</span> | Porta: <span className="text-white font-mono">{gen.port || '502'}</span> | ID: <span className="text-white font-mono">{gen.slaveId || '1'}</span></p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* READ SECTION */}
        <div className="bg-ciklo-card p-6 rounded-xl border border-gray-800 flex flex-col h-full">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2">
            <LayoutDashboard size={18} className="text-blue-500" /> Monitoramento (Leitura)
          </h3>

          {/* Add Register Form */}
          <div className="bg-ciklo-dark p-4 rounded-lg border border-gray-700 mb-4">
            <p className="text-xs text-gray-500 font-semibold mb-3">Adicionar Parâmetro</p>
            <div className="grid grid-cols-12 gap-2">
              <input
                type="text"
                placeholder="Endereço (Ex: 1024)"
                value={readAddress}
                onChange={(e) => onReadAddressChange(e.target.value)}
                className="col-span-3 bg-gray-800 border border-gray-600 rounded p-2 text-xs text-white"
              />
              <input
                type="text"
                placeholder="Nome do Parâmetro"
                value={readName}
                onChange={(e) => onReadNameChange(e.target.value)}
                className="col-span-4 bg-gray-800 border border-gray-600 rounded p-2 text-xs text-white"
              />
              <input
                type="text"
                placeholder="Un."
                value={readUnit}
                onChange={(e) => onReadUnitChange(e.target.value)}
                className="col-span-2 bg-gray-800 border border-gray-600 rounded p-2 text-xs text-white"
              />
              <button
                onClick={onAddReadParameter}
                className="col-span-3 bg-blue-600 hover:bg-blue-500 text-white rounded p-2 text-xs font-bold flex items-center justify-center gap-1"
              >
                <Plus size={12} /> Adicionar
              </button>
            </div>
          </div>

          {/* Reference table — known registers for THIS generator's controller,
              click a row to prefill the form above instead of guessing addresses. */}
          {(refLoading || refRegisters.length > 0) && (
            <div className="bg-ciklo-dark p-4 rounded-lg border border-gray-700 mb-6">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs text-gray-500 font-semibold">
                  Registradores conhecidos {gen.controller ? `(${gen.controller.toUpperCase()})` : ''}
                </p>
                {refLoading && <span className="text-[10px] text-gray-600">carregando...</span>}
              </div>
              {refRegisters.length > 0 && (
                <>
                  <input
                    type="text"
                    placeholder="Buscar por nome ou endereço..."
                    value={refFilter}
                    onChange={(e) => onRefFilterChange(e.target.value)}
                    className="w-full bg-gray-800 border border-gray-600 rounded p-2 text-xs text-white mb-2"
                  />
                  <div className="max-h-48 overflow-auto border border-gray-800 rounded">
                    <table className="w-full text-left text-xs">
                      <tbody className="divide-y divide-gray-800">
                        {refRegisters
                          .filter(r =>
                            !refFilter ||
                            r.name.toLowerCase().includes(refFilter.toLowerCase()) ||
                            String(r.address).includes(refFilter)
                          )
                          .map((r, i) => (
                            <tr
                              key={i}
                              onClick={() => {
                                onReadAddressChange(String(r.address));
                                onReadNameChange(r.name);
                                onReadUnitChange(r.unit === '-' ? '' : r.unit);
                              }}
                              className="hover:bg-gray-800/60 cursor-pointer"
                              title={r.notes || ''}
                            >
                              <td className="p-2 font-mono text-gray-400 whitespace-nowrap">{r.address}</td>
                              <td className="p-2 text-white">{r.name}</td>
                              <td className="p-2 text-gray-500 whitespace-nowrap">{r.unit}</td>
                              <td className="p-2 text-right whitespace-nowrap">
                                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${r.access.startsWith('ESCRITA') ? 'bg-orange-500/10 text-orange-400' : 'bg-blue-500/10 text-blue-400'}`}>
                                  {r.access === 'LEITURA/ESCRITA' ? 'R/W' : r.access.startsWith('ESCRITA') ? 'W' : 'R'}
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Register List */}
          <div className="flex-1 overflow-auto">
            <ModbusRegisterTable
              mode="READ"
              registers={modbusRegisters}
              onRead={onReadRegister}
              onRemove={onRemoveRegister}
            />
          </div>
        </div>

        {/* WRITE SECTION - UPDATED TO TABLE & ALL REGISTERS */}
        <div className="bg-ciklo-card p-6 rounded-xl border border-gray-800 flex flex-col h-full">
          <h3 className="text-white font-bold mb-4 flex items-center gap-2">
            <Sliders size={18} className="text-ciklo-orange" /> Comando (Escrita)
          </h3>

          {/* Add Control Form */}
          <div className="bg-ciklo-dark p-4 rounded-lg border border-gray-700 mb-6">
            <p className="text-xs text-gray-500 font-semibold mb-3">Configurar Novo Comando</p>
            <div className="grid grid-cols-12 gap-2">
              <input
                type="text"
                placeholder="Endereço"
                value={writeAddress}
                onChange={(e) => onWriteAddressChange(e.target.value)}
                className="col-span-3 bg-gray-800 border border-gray-600 rounded p-2 text-xs text-white"
              />
              <input
                type="text"
                placeholder="Nome do Comando"
                value={writeName}
                onChange={(e) => onWriteNameChange(e.target.value)}
                className="col-span-6 bg-gray-800 border border-gray-600 rounded p-2 text-xs text-white"
              />
              <button
                onClick={onAddWriteCommand}
                className="col-span-3 bg-ciklo-orange hover:bg-orange-500 text-black rounded p-2 text-xs font-bold flex items-center justify-center gap-1"
              >
                <Plus size={12} /> Configurar
              </button>
            </div>
          </div>

          {/* Updated Table Layout for Write Commands (Showing ALL registers) */}
          <div className="flex-1 overflow-auto">
            <ModbusRegisterTable
              mode="WRITE"
              registers={modbusRegisters}
              onRead={onReadRegister}
              onRemove={onRemoveRegister}
              onWrite={onWriteRegister}
              onValueChange={(id, value) => onSetModbusRegisters(prev => prev.map(r => r.id === id ? { ...r, newValue: value, writeError: undefined } : r))}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default ModbusPanel;
