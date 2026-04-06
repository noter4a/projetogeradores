import React, { useState, useEffect } from 'react';
import { Users, Plus, Pencil, Trash2, X, Search, Building2, MapPin, Phone, Mail } from 'lucide-react';
import { QmClient } from '../../types';

const Clients: React.FC = () => {
  const [clients, setClients] = useState<QmClient[]>([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [search, setSearch] = useState('');

  const [formData, setFormData] = useState<Partial<QmClient>>({
    razao_social: '',
    cnpj_cpf: '',
    ie: '',
    endereco: '',
    bairro: '',
    cep: '',
    uf: '',
    municipio: '',
    contato: '',
    fones: '',
    email: '',
    representante: ''
  });

  const fetchClients = async () => {
    try {
      const token = localStorage.getItem('ciklo_auth_token');
      const res = await fetch('/api/crm', {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setClients(data);
      }
    } catch (err) {
      console.error('Error fetching clients:', err);
    }
  };

  useEffect(() => {
    fetchClients();
  }, []);

  const handleOpenAdd = () => {
    setEditingId(null);
    setFormData({
      razao_social: '', cnpj_cpf: '', ie: '', endereco: '', bairro: '', 
      cep: '', uf: '', municipio: '', contato: '', fones: '', email: '', representante: ''
    });
    setIsFormOpen(true);
  };

  const handleEdit = (client: QmClient) => {
    setEditingId(client.id);
    setFormData(client);
    setIsFormOpen(true);
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Tem certeza que deseja excluir este cliente?')) return;
    try {
      const token = localStorage.getItem('ciklo_auth_token');
      const res = await fetch(`/api/crm/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchClients();
      } else {
        const err = await res.json();
        alert(`Erro: ${err.message || err.error}`);
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
      const url = editingId ? `/api/crm/${editingId}` : '/api/crm';
      
      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(formData)
      });

      if (res.ok) {
        setIsFormOpen(false);
        fetchClients();
      } else {
        const err = await res.json();
        alert(`Erro: ${err.message || err.error}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const filteredClients = clients.filter(c => 
    c.razao_social.toLowerCase().includes(search.toLowerCase()) || 
    (c.cnpj_cpf && c.cnpj_cpf.includes(search))
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <Users className="text-ciklo-orange" />
            Clientes (CRM)
          </h2>
          <p className="text-gray-400 text-sm">Gerencie o cadastro de clientes para orçamentos</p>
        </div>
        {!isFormOpen && (
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-500" size={18} />
              <input
                type="text"
                placeholder="Buscar cliente..."
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="w-full sm:w-64 bg-ciklo-card border border-gray-800 rounded-lg py-2 pl-10 pr-4 text-white focus:border-ciklo-orange outline-none"
              />
            </div>
            <button
              onClick={handleOpenAdd}
              className="bg-gradient-to-r from-ciklo-yellow to-ciklo-orange hover:from-orange-500 hover:to-orange-600 text-black font-bold px-4 py-2 rounded-lg shadow-lg flex items-center justify-center gap-2 transition-transform hover:-translate-y-0.5"
            >
              <Plus size={20} />
              Novo Cliente
            </button>
          </div>
        )}
      </div>

      {/* Form */}
      {isFormOpen && (
        <div className="bg-ciklo-card border border-gray-800 rounded-xl p-6 animate-in fade-in">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-xl font-bold text-white flex items-center gap-2">
              <Building2 className="text-ciklo-yellow" />
              {editingId ? 'Editar Cliente' : 'Novo Cliente'}
            </h3>
            <button onClick={() => setIsFormOpen(false)} className="text-gray-400 hover:text-white">
              <X size={24} />
            </button>
          </div>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              
              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-ciklo-yellow uppercase tracking-wider border-b border-gray-800 pb-2">Dados Principais</h4>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Razão Social / Nome *</label>
                  <input type="text" required value={formData.razao_social} onChange={e => setFormData({...formData, razao_social: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none" placeholder="Ex: Empresa Ltda" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">CNPJ / CPF</label>
                  <input type="text" value={formData.cnpj_cpf} onChange={e => setFormData({...formData, cnpj_cpf: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none" />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Inscrição Estadual (IE)</label>
                  <input type="text" value={formData.ie} onChange={e => setFormData({...formData, ie: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none" />
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-ciklo-yellow uppercase tracking-wider border-b border-gray-800 pb-2">Contato</h4>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Nome do Contato</label>
                  <div className="relative"><input type="text" value={formData.contato} onChange={e => setFormData({...formData, contato: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none" /></div>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Telefones</label>
                  <div className="relative"><Phone className="absolute left-3 top-3 text-gray-500" size={16} /><input type="text" value={formData.fones} onChange={e => setFormData({...formData, fones: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 pl-10 text-white focus:border-ciklo-orange outline-none" /></div>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">E-mail</label>
                  <div className="relative"><Mail className="absolute left-3 top-3 text-gray-500" size={16} /><input type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 pl-10 text-white focus:border-ciklo-orange outline-none" /></div>
                </div>
              </div>

              <div className="space-y-4">
                <h4 className="text-sm font-semibold text-ciklo-yellow uppercase tracking-wider border-b border-gray-800 pb-2">Endereço</h4>
                <div className="grid grid-cols-2 gap-2">
                  <div className="col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">CEP</label>
                    <input type="text" value={formData.cep} onChange={e => setFormData({...formData, cep: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">Endereço</label>
                    <div className="relative"><MapPin className="absolute left-3 top-3 text-gray-500" size={16} /><input type="text" value={formData.endereco} onChange={e => setFormData({...formData, endereco: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 pl-10 text-white focus:border-ciklo-orange outline-none" /></div>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm text-gray-400 mb-1">Bairro</label>
                    <input type="text" value={formData.bairro} onChange={e => setFormData({...formData, bairro: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">Município</label>
                    <input type="text" value={formData.municipio} onChange={e => setFormData({...formData, municipio: e.target.value})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none" />
                  </div>
                  <div>
                    <label className="block text-sm text-gray-400 mb-1">UF</label>
                    <input type="text" maxLength={2} value={formData.uf} onChange={e => setFormData({...formData, uf: e.target.value.toUpperCase()})} className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none text-center" />
                  </div>
                </div>
              </div>

            </div>

            <div className="flex justify-end gap-3 pt-6 border-t border-gray-800">
              <button type="button" onClick={() => setIsFormOpen(false)} className="px-6 py-2 rounded-lg text-gray-300 hover:bg-gray-800 transition-colors">
                Cancelar
              </button>
              <button type="submit" className="bg-ciklo-orange hover:bg-orange-600 text-white font-bold px-8 py-2 rounded-lg shadow-lg transition-colors">
                {editingId ? 'Salvar Alterações' : 'Cadastrar Cliente'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Custom Table */}
      {!isFormOpen && (
        <div className="bg-ciklo-card rounded-xl border border-gray-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-gray-800/50 border-b border-gray-700 text-gray-400 text-sm uppercase tracking-wider">
                  <th className="p-4 font-medium">Razão Social</th>
                  <th className="p-4 font-medium">CNPJ/CPF</th>
                  <th className="p-4 font-medium hidden md:table-cell">Contato</th>
                  <th className="p-4 font-medium hidden lg:table-cell">Localidade</th>
                  <th className="p-4 font-medium text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800">
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="p-8 text-center text-gray-500">
                      Nenhum cliente encontrado.
                    </td>
                  </tr>
                ) : (
                  filteredClients.map((client) => (
                    <tr key={client.id} className="hover:bg-gray-800/30 transition-colors">
                      <td className="p-4">
                        <div className="font-semibold text-white">{client.razao_social}</div>
                        <div className="text-xs text-gray-500 hidden sm:block">{client.email}</div>
                      </td>
                      <td className="p-4 text-gray-300">
                        {client.cnpj_cpf || '-'}
                      </td>
                      <td className="p-4 hidden md:table-cell">
                        <div className="text-gray-300">{client.contato || '-'}</div>
                        <div className="text-xs text-gray-500">{client.fones}</div>
                      </td>
                      <td className="p-4 hidden lg:table-cell text-gray-300">
                        {client.municipio ? `${client.municipio} - ${client.uf}` : '-'}
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => handleEdit(client)}
                            className="p-2 text-gray-400 hover:text-ciklo-yellow hover:bg-yellow-500/10 rounded-lg transition-colors"
                            title="Editar"
                          >
                            <Pencil size={18} />
                          </button>
                          <button
                            onClick={() => handleDelete(client.id)}
                            className="p-2 text-gray-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                            title="Excluir"
                          >
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
        </div>
      )}
    </div>
  );
};

export default Clients;
