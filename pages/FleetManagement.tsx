import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useGenerators } from '../context/GeneratorContext';
import { useUsers } from '../context/UserContext';
import { GeneratorStatus } from '../types';
import { Trash2, PlusCircle, MapPin, Zap, Server, Pencil } from 'lucide-react';

const FleetManagement: React.FC = () => {
  const navigate = useNavigate();
  const { generators, removeGenerator } = useGenerators();
  const { users, updateUser } = useUsers();

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

      <div className="bg-ciklo-card rounded-xl border border-gray-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#1a1a1a] text-gray-500 text-[11px] uppercase tracking-wider font-bold border-b border-gray-800">
              <tr>
                <th className="p-4 pl-6">Identificação</th>
                <th className="p-4">Localização</th>
                <th className="p-4">Modelo</th>
                <th className="p-4">Potência</th>
                <th className="p-4">Status</th>
                <th className="p-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {generators.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-12 text-center text-gray-500">
                    Nenhum gerador registrado no momento.
                  </td>
                </tr>
              ) : (
                generators.map((gen) => (
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
      </div>
    </div>
  );
};

export default FleetManagement;