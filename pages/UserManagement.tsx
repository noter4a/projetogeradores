
import React, { useState } from 'react';
import { useUsers } from '../context/UserContext';
import { useGenerators } from '../context/GeneratorContext';
import { UserRole, User } from '../types';
import { Trash2, UserPlus, Mail, Shield, User as UserIcon, Check, Pencil, Server, Lock, Wallet, Plus, Minus, Calendar, Eye } from 'lucide-react';

const UserManagement: React.FC = () => {
  const { users, addUser, removeUser, updateUser } = useUsers();
  const { generators } = useGenerators();
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isRechargeOpen, setIsRechargeOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [rechargeUserId, setRechargeUserId] = useState<string | null>(null);
  const [rechargeAmount, setRechargeAmount] = useState<number>(0);
  
  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: UserRole.TECHNICIAN,
    assignedGeneratorIds: [] as string[],
    credits: 0
  });

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({ name: '', email: '', password: '', role: UserRole.TECHNICIAN, assignedGeneratorIds: [], credits: 0 });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (user: User) => {
    setEditingId(user.id);
    setFormData({ 
      name: user.name, 
      email: user.email, 
      password: '', // Don't show existing password
      role: user.role,
      assignedGeneratorIds: user.assignedGeneratorIds || [],
      credits: user.credits || 0
    });
    setIsFormOpen(true);
  };

  const handleOpenRecharge = (user: User) => {
    setRechargeUserId(user.id);
    setRechargeAmount(user.credits || 0); // Start with current amount or 0
    setIsRechargeOpen(true);
  };

  const toggleGeneratorAssignment = (genId: string) => {
    setFormData(prev => {
      const current = prev.assignedGeneratorIds;
      if (current.includes(genId)) {
        return { ...prev, assignedGeneratorIds: current.filter(id => id !== genId) };
      } else {
        return { ...prev, assignedGeneratorIds: [...current, genId] };
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (editingId) {
      // Update existing user
      const existingUser = users.find(u => u.id === editingId);
      updateUser({
        id: editingId,
        name: formData.name,
        email: formData.email,
        // Only update password if provided, otherwise keep existing
        password: formData.password || existingUser?.password || '123456',
        role: formData.role as UserRole,
        assignedGeneratorIds: formData.role === UserRole.ADMIN ? [] : formData.assignedGeneratorIds,
        credits: existingUser?.credits // Preserve existing credits during standard edit
      });
    } else {
      // Add new user
      const user: User = {
        id: `USR-${Date.now()}`,
        name: formData.name,
        email: formData.email,
        password: formData.password || '123456',
        role: formData.role as UserRole,
        assignedGeneratorIds: formData.role === UserRole.ADMIN ? [] : formData.assignedGeneratorIds,
        credits: formData.role === UserRole.CLIENT ? 0 : undefined // Initialize credits for clients
      };
      addUser(user);
    }

    setIsFormOpen(false);
    setFormData({ name: '', email: '', password: '', role: UserRole.TECHNICIAN, assignedGeneratorIds: [], credits: 0 });
    setEditingId(null);
  };

  const handleRechargeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (rechargeUserId) {
        const user = users.find(u => u.id === rechargeUserId);
        if (user) {
            updateUser({
                ...user,
                credits: rechargeAmount
            });
        }
    }
    setIsRechargeOpen(false);
    setRechargeUserId(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Controle de Contas</h2>
          <p className="text-gray-400 text-sm">Gerencie o acesso, permissões e créditos dos usuários</p>
        </div>
        {!isFormOpen && (
          <button 
            onClick={handleOpenAdd}
            className="bg-gradient-to-r from-ciklo-yellow to-ciklo-orange hover:from-orange-500 hover:to-orange-600 text-black font-bold px-6 py-3 rounded-lg shadow-lg shadow-orange-900/20 flex items-center gap-2 transition-all transform hover:-translate-y-0.5"
          >
            <UserPlus size={20} />
            Novo Usuário
          </button>
        )}
      </div>

      {/* Add/Edit User Form */}
      {isFormOpen && (
        <div className="bg-ciklo-card border border-gray-800 rounded-xl p-6 animate-in fade-in slide-in-from-top-4">
          <h3 className="text-lg font-bold text-white mb-4">
            {editingId ? 'Editar Usuário' : 'Cadastrar Novo Usuário'}
          </h3>
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Nome Completo</label>
                <input 
                  type="text" 
                  required
                  value={formData.name}
                  onChange={e => setFormData({...formData, name: e.target.value})}
                  className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none"
                  placeholder="Ex: João da Silva"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">E-mail</label>
                <input 
                  type="email" 
                  required
                  value={formData.email}
                  onChange={e => setFormData({...formData, email: e.target.value})}
                  className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none"
                  placeholder="Ex: joao@empresa.com"
                />
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Senha {editingId && <span className="text-gray-500 font-normal">(Opcional)</span>}
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-2.5 text-gray-500" size={18} />
                  <input 
                    type="password" 
                    required={!editingId}
                    value={formData.password}
                    onChange={e => setFormData({...formData, password: e.target.value})}
                    className="w-full bg-ciklo-black border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-white focus:border-ciklo-orange outline-none"
                    placeholder={editingId ? "Deixe em branco para manter a atual" : "••••••••"}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Perfil de Acesso</label>
                <select 
                  value={formData.role}
                  onChange={e => setFormData({...formData, role: e.target.value as UserRole})}
                  className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none"
                >
                  <option value={UserRole.ADMIN}>Administrador</option>
                  <option value={UserRole.TECHNICIAN}>Técnico</option>
                  <option value={UserRole.CLIENT}>Cliente</option>
                  <option value={UserRole.MONITOR}>Monitoramento</option>
                </select>
              </div>
            </div>

            {/* Generator Assignment Section - Hide for Admins */}
            {formData.role !== UserRole.ADMIN && (
              <div className="border-t border-gray-800 pt-4">
                <h4 className="text-sm font-bold text-gray-300 mb-3 flex items-center gap-2">
                  <Server size={16} className="text-ciklo-orange" />
                  Atribuir Geradores
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {generators.map(gen => (
                    <label 
                      key={gen.id} 
                      className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        formData.assignedGeneratorIds.includes(gen.id) 
                          ? 'bg-ciklo-orange/10 border-ciklo-orange' 
                          : 'bg-ciklo-black border-gray-700 hover:border-gray-600'
                      }`}
                    >
                      <input 
                        type="checkbox"
                        checked={formData.assignedGeneratorIds.includes(gen.id)}
                        onChange={() => toggleGeneratorAssignment(gen.id)}
                        className="w-4 h-4 rounded border-gray-600 text-ciklo-orange focus:ring-ciklo-orange bg-gray-800"
                      />
                      <div className="flex-1 min-w-0">
                        <p className={`text-sm font-medium truncate ${formData.assignedGeneratorIds.includes(gen.id) ? 'text-ciklo-yellow' : 'text-gray-300'}`}>
                          {gen.name}
                        </p>
                        <p className="text-xs text-gray-500 truncate">{gen.location}</p>
                      </div>
                    </label>
                  ))}
                  {generators.length === 0 && (
                     <p className="text-sm text-gray-500 col-span-3">Nenhum gerador disponível para atribuição.</p>
                  )}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-3 pt-2">
              <button 
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="px-4 py-2 text-gray-400 hover:text-white hover:bg-gray-800 rounded-lg transition-colors"
              >
                Cancelar
              </button>
              <button 
                type="submit"
                className="px-6 py-2 bg-green-600 hover:bg-green-500 text-white font-bold rounded-lg flex items-center gap-2"
              >
                <Check size={18} /> {editingId ? 'Atualizar' : 'Salvar'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Recharge Modal */}
      {isRechargeOpen && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
            <div className="bg-ciklo-card w-full max-w-sm rounded-xl border border-gray-700 shadow-2xl overflow-hidden animate-in zoom-in duration-200">
               <div className="p-6 bg-gradient-to-r from-ciklo-dark to-gray-900 border-b border-gray-800">
                  <h3 className="text-lg font-bold text-white flex items-center gap-2">
                    <Calendar className="text-green-500" /> Recarga de Dias
                  </h3>
                  <p className="text-sm text-gray-400 mt-1">
                    Atualizar saldo para <span className="text-white font-medium">{users.find(u => u.id === rechargeUserId)?.name}</span>
                  </p>
               </div>
               
               <form onSubmit={handleRechargeSubmit} className="p-6 space-y-6">
                  <div className="flex flex-col items-center gap-4">
                     <span className="text-xs font-bold text-gray-500 uppercase tracking-widest">Dias Restantes</span>
                     <div className="flex items-center gap-4">
                       <button 
                         type="button" 
                         onClick={() => setRechargeAmount(prev => Math.max(0, prev - 1))}
                         className="p-3 rounded-full bg-gray-800 hover:bg-gray-700 text-white transition-colors"
                       >
                         <Minus size={20} />
                       </button>
                       <div className="w-32 text-center">
                          <input 
                            type="number" 
                            min="0"
                            value={rechargeAmount}
                            onChange={(e) => setRechargeAmount(Number(e.target.value))}
                            className="w-full bg-transparent text-4xl font-bold text-white text-center outline-none border-b border-gray-700 focus:border-ciklo-orange pb-2"
                          />
                          <p className="text-xs text-gray-500 mt-1">dias</p>
                       </div>
                       <button 
                         type="button" 
                         onClick={() => setRechargeAmount(prev => prev + 1)}
                         className="p-3 rounded-full bg-ciklo-orange hover:bg-orange-500 text-black transition-colors"
                       >
                         <Plus size={20} />
                       </button>
                     </div>
                  </div>

                  <div className="flex gap-3">
                     <button 
                       type="button" 
                       onClick={() => { setIsRechargeOpen(false); setRechargeUserId(null); }}
                       className="flex-1 py-3 text-gray-400 hover:bg-gray-800 rounded-lg transition-colors font-medium"
                     >
                       Cancelar
                     </button>
                     <button 
                       type="submit" 
                       className="flex-1 py-3 bg-green-600 hover:bg-green-500 text-white rounded-lg font-bold transition-colors"
                     >
                       Confirmar
                     </button>
                  </div>
               </form>
            </div>
         </div>
      )}

      {/* Users List */}
      <div className="bg-ciklo-card rounded-xl border border-gray-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#1a1a1a] text-gray-500 text-[11px] uppercase tracking-wider font-bold border-b border-gray-800">
              <tr>
                <th className="p-4 pl-6">Usuário</th>
                <th className="p-4">Contato</th>
                <th className="p-4">Perfil</th>
                <th className="p-4">Acesso / Saldo</th>
                <th className="p-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {users.map((u) => (
                <tr key={u.id} className="hover:bg-gray-800/30 transition-colors group">
                  <td className="p-4 pl-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-ciklo-orange font-bold border border-gray-700">
                        {u.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <p className="font-bold text-white text-sm">{u.name}</p>
                        <p className="text-[10px] text-gray-500 font-mono mt-0.5">{u.id}</p>
                      </div>
                    </div>
                  </td>
                  <td className="p-4">
                    <div className="flex items-center gap-2 text-gray-400 text-sm">
                      <Mail size={14} className="text-gray-600" />
                      {u.email}
                    </div>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
                      u.role === UserRole.ADMIN ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                      u.role === UserRole.TECHNICIAN ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                      u.role === UserRole.CLIENT ? 'bg-gray-700/30 text-gray-400 border-gray-700' :
                      'bg-teal-500/10 text-teal-400 border-teal-500/20'
                    }`}>
                      {u.role === UserRole.MONITOR ? <Eye size={10} /> : <Shield size={10} />}
                      {u.role === UserRole.ADMIN ? 'Administrador' : 
                       u.role === UserRole.TECHNICIAN ? 'Técnico' : 
                       u.role === UserRole.CLIENT ? 'Cliente' : 'Monitoramento'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      {u.role === UserRole.ADMIN ? (
                        <span className="text-xs text-green-500 font-medium">Acesso Total</span>
                      ) : (
                        <span className="text-xs text-gray-400">
                          {u.assignedGeneratorIds && u.assignedGeneratorIds.length > 0 
                            ? `${u.assignedGeneratorIds.length} Gerador(es)` 
                            : 'Nenhum gerador atribuído'}
                        </span>
                      )}
                      
                      {/* Credit Display for Clients */}
                      {u.role === UserRole.CLIENT && (
                         <div className="flex items-center gap-2 mt-1">
                            <span className={`text-xs font-bold px-2 py-0.5 rounded border ${
                               (u.credits || 0) > 0 
                               ? 'bg-green-500/10 text-green-400 border-green-500/20' 
                               : 'bg-red-500/10 text-red-400 border-red-500/20'
                            }`}>
                               Saldo: {u.credits || 0} dias
                            </span>
                         </div>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1">
                      {/* Recharge Button for Clients */}
                      {u.role === UserRole.CLIENT && (
                        <button 
                          type="button"
                          onClick={(e) => {
                             e.stopPropagation();
                             handleOpenRecharge(u);
                          }}
                          className="p-2 text-green-500 hover:bg-green-500/10 rounded-lg transition-all"
                          title="Recarregar Dias"
                        >
                          <Wallet size={18} />
                        </button>
                      )}
                      
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenEdit(u);
                        }}
                        className="p-2 text-gray-500 hover:text-ciklo-orange hover:bg-orange-500/10 rounded-lg transition-all"
                        title="Editar Usuário"
                      >
                        <Pencil size={18} />
                      </button>
                      <button 
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeUser(u.id);
                        }}
                        className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-500/10 rounded-lg transition-all"
                        title="Remover Usuário"
                      >
                        <Trash2 size={18} className="pointer-events-none" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default UserManagement;
