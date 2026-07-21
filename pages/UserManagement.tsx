import React, { useState, useMemo, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useUsers } from '../context/UserContext';
import { useGenerators } from '../context/GeneratorContext';
import { UserRole, User, Company } from '../types';
import { Trash2, UserPlus, Mail, Shield, User as UserIcon, Check, Pencil, Lock, Eye, Wallet, ChevronLeft, ChevronRight, Building, Phone, MessageSquare, Search, X } from 'lucide-react';

// Accent-insensitive compare so "jose" also finds "José"
const normalize = (value: string) =>
  value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

const UserManagement: React.FC = () => {
  const { users, loading, error, refreshUsers, addUser, removeUser, updateUser } = useUsers();
  const { user: currentUser, token } = useAuth();
  const { generators } = useGenerators();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  // Fetch Companies list
  useEffect(() => {
    if (token) {
      fetch('/api/companies', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => setCompanies(data))
        .catch(err => console.error('Error fetching companies:', err));
    }
  }, [token]);

  // Filters
  const [search, setSearch] = useState('');
  // '' = todas as empresas, 'none' = usuários sem empresa vinculada
  const [companyFilter, setCompanyFilter] = useState<string>('');

  const filteredUsers = useMemo(() => {
    const term = normalize(search.trim());
    return users.filter(u => {
      const matchesSearch = !term ||
        normalize(u.name).includes(term) ||
        normalize(u.email).includes(term) ||
        normalize(u.companyName || '').includes(term);

      const matchesCompany =
        companyFilter === '' ||
        (companyFilter === 'none' ? !u.companyId : u.companyId === Number(companyFilter));

      return matchesSearch && matchesCompany;
    });
  }, [users, search, companyFilter]);

  const hasActiveFilters = search.trim() !== '' || companyFilter !== '';

  const clearFilters = () => {
    setSearch('');
    setCompanyFilter('');
  };

  // Pagination
  const ITEMS_PER_PAGE = 10;
  const [currentPage, setCurrentPage] = useState(1);
  const totalPages = Math.max(1, Math.ceil(filteredUsers.length / ITEMS_PER_PAGE));
  const paginatedUsers = useMemo(() => {
    const start = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredUsers.slice(start, start + ITEMS_PER_PAGE);
  }, [filteredUsers, currentPage]);

  // Back to page 1 whenever the filters change the result set
  useEffect(() => {
    setCurrentPage(1);
  }, [search, companyFilter]);

  // Keep the page in range when users are added/removed
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [filteredUsers.length, totalPages]);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    role: UserRole.TECHNICIAN,
    companyId: undefined as number | undefined,
    phone: '',
    whatsappAlerts: false,
    emailAlerts: true
  });

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({ name: '', email: '', password: '', role: UserRole.TECHNICIAN, companyId: undefined, phone: '', whatsappAlerts: false, emailAlerts: true });
    setIsFormOpen(true);
  };

  const handleOpenEdit = (user: User) => {
    setEditingId(user.id);
    setFormData({
      name: user.name,
      email: user.email,
      password: '', // Don't show existing password
      role: user.role,
      companyId: user.companyId,
      phone: user.phone || '',
      whatsappAlerts: user.whatsappAlerts || false,
      emailAlerts: user.emailAlerts !== undefined ? user.emailAlerts : true
    });
    setIsFormOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (editingId) {
      // Update existing user
      const existingUser = users.find(u => u.id === editingId);
      if (existingUser) {
        await updateUser({
          id: editingId,
          name: formData.name,
          email: formData.email,
          // Only update password if provided, otherwise keep existing
          password: formData.password || existingUser.password || '123456',
          role: formData.role as UserRole,
          assignedGeneratorIds: [],
          companyId: formData.companyId,
          phone: formData.phone ? formData.phone.replace(/\D/g, '') : undefined,
          whatsappAlerts: formData.whatsappAlerts,
          emailAlerts: formData.emailAlerts
        });
      }
    } else {
      // Add new user
      const user: User = {
        id: `USR-${Date.now()}`,
        name: formData.name,
        email: formData.email,
        password: formData.password || '123456',
        role: formData.role as UserRole,
        assignedGeneratorIds: [],
        companyId: formData.companyId,
        phone: formData.phone ? formData.phone.replace(/\D/g, '') : undefined,
        whatsappAlerts: formData.whatsappAlerts,
        emailAlerts: formData.emailAlerts
      };
      await addUser(user);
    }

    setIsFormOpen(false);
    setFormData({ name: '', email: '', password: '', role: UserRole.TECHNICIAN, companyId: undefined, phone: '', whatsappAlerts: false, emailAlerts: true });
    setEditingId(null);
  };

  return (
    <div className="space-y-6">
      {/* Loading Indicator */}
      {loading && (
        <div className="fixed top-4 right-4 z-50 bg-ciklo-orange text-black px-4 py-2 rounded-full font-bold shadow-lg animate-pulse flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
          Atualizando...
        </div>
      )}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white">Controle de Contas</h2>
          <p className="text-gray-400 text-sm">Gerencie o acesso e permissões dos usuários</p>
        </div>
        <div className="flex gap-2">
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
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
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
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
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
                    onChange={e => setFormData({ ...formData, password: e.target.value })}
                    className="w-full bg-ciklo-black border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-white focus:border-ciklo-orange outline-none"
                    placeholder={editingId ? "Deixe em branco para manter a atual" : "••••••••"}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Perfil de Acesso</label>
                <select
                  value={formData.role}
                  onChange={e => setFormData({ ...formData, role: e.target.value as UserRole })}
                  className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none"
                >
                  <option value={UserRole.ADMIN}>Administrador</option>
                  <option value={UserRole.ORCAMENTOS}>Orçamentos</option>
                  <option value={UserRole.TECHNICIAN}>Técnico</option>
                  <option value={UserRole.CLIENT}>Cliente</option>
                  <option value={UserRole.MONITOR}>Monitoramento</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-400 mb-1">Empresa / Grupo</label>
                <select
                  value={formData.companyId || ''}
                  onChange={e => setFormData({ ...formData, companyId: e.target.value ? Number(e.target.value) : undefined })}
                  className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none"
                >
                  <option value="">Nenhuma Empresa / Sem Grupo</option>
                  {companies.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Phone and WhatsApp Alerts */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Telefone (WhatsApp)</label>
                <div className="relative">
                  <Phone className="absolute left-3 top-2.5 text-gray-500" size={18} />
                  <input
                    type="tel"
                    value={formData.phone}
                    onChange={e => {
                      // Brazilian phone mask: (XX) XXXXX-XXXX
                      let value = e.target.value.replace(/\D/g, '');
                      if (value.length > 11) value = value.slice(0, 11);
                      if (value.length > 7) {
                        value = `(${value.slice(0, 2)}) ${value.slice(2, 7)}-${value.slice(7)}`;
                      } else if (value.length > 2) {
                        value = `(${value.slice(0, 2)}) ${value.slice(2)}`;
                      } else if (value.length > 0) {
                        value = `(${value}`;
                      }
                      setFormData({ ...formData, phone: value });
                    }}
                    className="w-full bg-ciklo-black border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-white focus:border-ciklo-orange outline-none"
                    placeholder="(54) 99688-5243"
                  />
                </div>
              </div>
              <div className="flex flex-col justify-end gap-2.5 p-2.5">
                {/* WhatsApp Alerts Toggle */}
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-11 h-6 rounded-full relative transition-colors duration-200 ${formData.whatsappAlerts ? 'bg-green-500' : 'bg-gray-700'}`}
                    onClick={() => setFormData({ ...formData, whatsappAlerts: !formData.whatsappAlerts })}>
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${formData.whatsappAlerts ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                  </div>
                  <div className="flex items-center gap-2" onClick={() => setFormData({ ...formData, whatsappAlerts: !formData.whatsappAlerts })}>
                    <MessageSquare size={18} className={formData.whatsappAlerts ? 'text-green-400' : 'text-gray-500'} />
                    <span className={`text-sm font-medium ${formData.whatsappAlerts ? 'text-green-400' : 'text-gray-500'}`}>
                      Receber Alertas via WhatsApp
                    </span>
                  </div>
                </label>

                {/* Email Alerts Toggle */}
                <label className="flex items-center gap-3 cursor-pointer group">
                  <div className={`w-11 h-6 rounded-full relative transition-colors duration-200 ${formData.emailAlerts ? 'bg-blue-500' : 'bg-gray-700'}`}
                    onClick={() => setFormData({ ...formData, emailAlerts: !formData.emailAlerts })}>
                    <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-200 ${formData.emailAlerts ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
                  </div>
                  <div className="flex items-center gap-2" onClick={() => setFormData({ ...formData, emailAlerts: !formData.emailAlerts })}>
                    <Mail size={18} className={formData.emailAlerts ? 'text-blue-400' : 'text-gray-500'} />
                    <span className={`text-sm font-medium ${formData.emailAlerts ? 'text-blue-400' : 'text-gray-500'}`}>
                      Receber Alertas via E-mail
                    </span>
                  </div>
                </label>
              </div>
            </div>



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

      {/* Filter Bar */}
      <div className="bg-ciklo-card border border-gray-800 rounded-xl p-4 flex flex-col md:flex-row md:items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-ciklo-black border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-white placeholder-gray-600 focus:border-ciklo-orange outline-none"
            placeholder="Buscar por nome, e-mail ou empresa..."
          />
        </div>

        <div className="relative md:w-64">
          <Building className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 pointer-events-none" size={18} />
          <select
            value={companyFilter}
            onChange={e => setCompanyFilter(e.target.value)}
            className="w-full bg-ciklo-black border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-white focus:border-ciklo-orange outline-none appearance-none"
          >
            <option value="">Todas as Empresas</option>
            <option value="none">Sem Empresa</option>
            {companies.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {hasActiveFilters && (
          <button
            type="button"
            onClick={clearFilters}
            className="flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 border border-gray-700 rounded-lg transition-colors whitespace-nowrap"
          >
            <X size={16} />
            Limpar
          </button>
        )}
      </div>

      {/* Users List */}
      <div className="bg-ciklo-card rounded-xl border border-gray-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-[#1a1a1a] text-gray-500 text-[11px] uppercase tracking-wider font-bold border-b border-gray-800">
              <tr>
                <th className="p-4 pl-6">Usuário</th>
                <th className="p-4">Contato</th>
                <th className="p-4">Empresa</th>
                <th className="p-4">Perfil</th>
                <th className="p-4">Acesso</th>
                <th className="p-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {paginatedUsers.map((u) => (
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
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2 text-gray-400 text-sm">
                        <Mail size={14} className="text-gray-600" />
                        {u.email}
                        {u.emailAlerts && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            <Mail size={9} />
                            EMAIL
                          </span>
                        )}
                      </div>
                      {u.phone && (
                        <div className="flex items-center gap-2 text-gray-400 text-sm">
                          <Phone size={14} className="text-green-600" />
                          {u.phone.replace(/(\d{2})(\d{5})(\d{4})/, '($1) $2-$3')}
                          {u.whatsappAlerts && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-bold bg-green-500/10 text-green-400 border border-green-500/20">
                              <MessageSquare size={9} />
                              WA
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-sm text-gray-300">
                    <span className="flex items-center gap-1.5 text-gray-400">
                      <Building size={14} className="text-gray-600" />
                      {u.companyName || <span className="text-gray-600 italic">Nenhuma</span>}
                    </span>
                  </td>
                  <td className="p-4">
                    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide border ${u.role === UserRole.ADMIN ? 'bg-purple-500/10 text-purple-400 border-purple-500/20' :
                      u.role === UserRole.TECHNICIAN ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' :
                        u.role === UserRole.CLIENT ? 'bg-gray-700/30 text-gray-400 border-gray-700' :
                          u.role === UserRole.ORCAMENTOS ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' :
                            'bg-teal-500/10 text-teal-400 border-teal-500/20'
                      }`}>
                      {u.role === UserRole.MONITOR ? <Eye size={10} /> : u.role === UserRole.ORCAMENTOS ? <Wallet size={10} /> : <Shield size={10} />}
                      {u.role === UserRole.ADMIN ? 'Administrador' :
                        u.role === UserRole.TECHNICIAN ? 'Técnico' :
                          u.role === UserRole.CLIENT ? 'Cliente' :
                            u.role === UserRole.ORCAMENTOS ? 'Orçamentos' : 'Monitoramento'}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-col gap-1">
                      {u.role === UserRole.ADMIN ? (
                        <span className="text-xs text-green-500 font-medium">Acesso Total</span>
                      ) : u.role === UserRole.ORCAMENTOS ? (
                        <span className="text-xs text-amber-400 font-medium">Vendas & Orçamentos</span>
                      ) : u.companyId ? (
                        <span className="text-xs text-blue-400 font-medium">Acesso por Empresa</span>
                      ) : (
                        <span className="text-xs text-gray-500 italic">Sem acesso (Sem Empresa)</span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-1">
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
              {filteredUsers.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-500 text-sm">
                    {hasActiveFilters
                      ? 'Nenhum usuário encontrado com os filtros aplicados.'
                      : 'Nenhum usuário cadastrado.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-6 py-4 border-t border-gray-800 bg-[#1a1a1a]">
            <span className="text-xs text-gray-500">
              Mostrando {((currentPage - 1) * ITEMS_PER_PAGE) + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredUsers.length)} de {filteredUsers.length} usuários
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
    </div>
  );
};

export default UserManagement;
