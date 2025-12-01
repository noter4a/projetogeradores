import React, { useState } from 'react';
import { MOCK_LOGS } from '../constants';
import { ClipboardList, CheckSquare, Clock, Plus, Upload, Save } from 'lucide-react';

const Maintenance: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'history' | 'checklist'>('history');

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Gestão de Manutenção</h2>
          <p className="text-gray-400 text-sm">Histórico e checklists operacionais</p>
        </div>
        <div className="flex gap-2 bg-ciklo-dark p-1 rounded-lg border border-gray-700">
          <button
            onClick={() => setActiveTab('history')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'history' ? 'bg-gray-700 text-white shadow' : 'text-gray-400 hover:text-white'}`}
          >
            Histórico
          </button>
          <button
            onClick={() => setActiveTab('checklist')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${activeTab === 'checklist' ? 'bg-ciklo-orange text-white shadow' : 'text-gray-400 hover:text-white'}`}
          >
            Novo Checklist
          </button>
        </div>
      </div>

      {activeTab === 'history' ? (
        <div className="bg-ciklo-card rounded-xl border border-gray-800 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-800 text-gray-400 text-xs uppercase">
              <tr>
                <th className="p-4">Data</th>
                <th className="p-4">Gerador</th>
                <th className="p-4">Tipo</th>
                <th className="p-4">Técnico</th>
                <th className="p-4">Descrição</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-sm text-gray-300">
              {MOCK_LOGS.map((log) => (
                <tr key={log.id} className="hover:bg-gray-800/50 transition-colors">
                  <td className="p-4 font-mono text-gray-400">{log.date}</td>
                  <td className="p-4 font-bold text-white">{log.generatorId}</td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded text-xs font-bold ${log.type === 'PREVENTIVE' ? 'bg-blue-500/20 text-blue-400' : 'bg-red-500/20 text-red-400'}`}>
                      {log.type === 'PREVENTIVE' ? 'PREVENTIVA' : 'CORRETIVA'}
                    </span>
                  </td>
                  <td className="p-4">{log.technician}</td>
                  <td className="p-4">{log.description}</td>
                  <td className="p-4">
                    {log.completed ? (
                      <span className="flex items-center gap-1 text-green-400"><CheckSquare size={14} /> Concluído</span>
                    ) : (
                      <span className="flex items-center gap-1 text-yellow-400"><Clock size={14} /> Pendente</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
             <div className="bg-ciklo-card p-6 rounded-xl border border-gray-800">
               <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                 <ClipboardList className="text-ciklo-yellow" /> Dados do Equipamento
               </h3>
               
               <div className="space-y-4">
                 <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                   <div>
                     <label className="block text-sm text-gray-400 mb-1">Localização</label>
                     <input type="text" className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2 text-white focus:border-ciklo-orange outline-none" placeholder="Ex: Sede - Térreo" />
                   </div>
                   <div>
                     <label className="block text-sm text-gray-400 mb-1">Modelo / Tipo de Gerador</label>
                     <input type="text" className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2 text-white focus:border-ciklo-orange outline-none" placeholder="Ex: Ciklo Power 500" />
                   </div>
                 </div>
                 
                 <div>
                    <label className="block text-sm text-gray-400 mb-1">Descrição</label>
                    <input type="text" className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2 text-white focus:border-ciklo-orange outline-none" placeholder="Descrição do equipamento ou serviço" />
                 </div>
                 
                 <div className="border-t border-gray-800 pt-4">
                   <label className="block text-sm text-gray-400 mb-1">Observações Adicionais</label>
                   <textarea className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2 text-white h-24 focus:border-ciklo-orange outline-none resize-none"></textarea>
                 </div>
               </div>
             </div>
          </div>

          <div className="space-y-6">
            <div className="bg-ciklo-card p-6 rounded-xl border border-gray-800">
               <h3 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
                 <Upload className="text-blue-500" /> Evidências
               </h3>
               <div className="border-2 border-dashed border-gray-700 rounded-xl p-8 flex flex-col items-center justify-center text-center hover:border-blue-500 hover:bg-blue-500/5 transition-all cursor-pointer">
                 <Plus size={32} className="text-gray-500 mb-2" />
                 <p className="text-sm text-gray-400">Clique para enviar fotos</p>
                 <span className="text-xs text-gray-600 mt-1">JPG, PNG (Max 5MB)</span>
               </div>
            </div>

            <button className="w-full py-4 bg-green-600 hover:bg-green-500 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-green-900/20">
              <Save size={20} /> SALVAR CHECKLIST
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Maintenance;