import React, { useState, useEffect } from 'react';
import { FileText, Plus, Eye, Trash2, Search, ArrowRight } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { QmProposal } from '../../types';

const Proposals: React.FC = () => {
  const [proposals, setProposals] = useState<QmProposal[]>([]);
  const [search, setSearch] = useState('');
  const navigate = useNavigate();

  const fetchProposals = async () => {
    try {
      const token = localStorage.getItem('ciklo_auth_token');
      const res = await fetch('/api/proposals', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setProposals(data);
      }
    } catch (err) {
      console.error('Error fetching proposals:', err);
    }
  };

  useEffect(() => {
    fetchProposals();
  }, []);

  const handleDelete = async (id: number) => {
    if (!window.confirm('Tem certeza que deseja excluir esta proposta?')) return;
    try {
      const token = localStorage.getItem('ciklo_auth_token');
      const res = await fetch(`/api/proposals/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        fetchProposals();
      } else {
        const err = await res.json();
        alert(`Erro: ${err.error || err.message}`);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const getStatusColor = (status: string) => {
    switch(status?.toUpperCase()) {
      case 'ENVIADA': return 'bg-blue-500/20 text-blue-400 border-blue-500/30';
      case 'APROVADA': return 'bg-green-500/20 text-green-400 border-green-500/30';
      case 'REJEITADA': return 'bg-red-500/20 text-red-400 border-red-500/30';
      default: return 'bg-gray-500/20 text-gray-400 border-gray-500/30'; // RASCUNHO
    }
  };

  const formatCurrency = (val: any) => {
    if (!val) return 'R$ 0,00';
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(val));
  };

  const formatDate = (dateStr: string) => {
    if (!dateStr) return '-';
    return new Date(dateStr).toLocaleDateString('pt-BR');
  };

  const filteredProposals = proposals.filter(p => 
    p.numero_proposta?.toLowerCase().includes(search.toLowerCase()) || 
    p.cliente_nome?.toLowerCase().includes(search.toLowerCase()) ||
    p.gerador_modelo?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-white flex items-center gap-2">
            <FileText className="text-ciklo-orange" />
            Caixa de Propostas
          </h2>
          <p className="text-gray-400 text-sm">Histórico de orçamentos e propostas comerciais geradas</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-gray-500" size={18} />
            <input
              type="text"
              placeholder="Buscar (Nº, Cliente...)"
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full sm:w-64 bg-ciklo-card border border-gray-800 rounded-lg py-2 pl-10 pr-4 text-white focus:border-ciklo-orange outline-none"
            />
          </div>
          <button
            onClick={() => navigate('/sales/new-proposal')}
            className="bg-gradient-to-r from-ciklo-yellow to-ciklo-orange hover:from-orange-500 hover:to-orange-600 text-black font-bold px-4 py-2 rounded-lg shadow-lg flex items-center justify-center gap-2 transition-transform hover:-translate-y-0.5"
          >
            <Plus size={20} />
            Nova Proposta
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-ciklo-card rounded-xl border border-gray-800 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-gray-800/50 border-b border-gray-700 text-gray-400 text-sm uppercase tracking-wider">
                <th className="p-4 font-medium w-32">Nº Proposta</th>
                <th className="p-4 font-medium">Cliente</th>
                <th className="p-4 font-medium hidden md:table-cell">Emissão</th>
                <th className="p-4 font-medium hidden lg:table-cell">Modelo Gerador</th>
                <th className="p-4 font-medium text-right">Valor Total</th>
                <th className="p-4 font-medium text-center">Status</th>
                <th className="p-4 font-medium text-right min-w-[120px]">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800">
              {filteredProposals.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-gray-500">
                    Nenhuma proposta encontrada.
                  </td>
                </tr>
              ) : (
                filteredProposals.map((prop) => (
                  <tr key={prop.id} className="hover:bg-gray-800/30 transition-colors">
                    <td className="p-4 font-mono font-medium text-white">{prop.numero_proposta}</td>
                    <td className="p-4">
                      <div className="font-semibold text-gray-200">{prop.cliente_nome || '-'}</div>
                    </td>
                    <td className="p-4 text-gray-400 text-sm hidden md:table-cell">
                      {formatDate(prop.data_emissao)}
                    </td>
                    <td className="p-4 text-gray-400 text-sm hidden lg:table-cell truncate max-w-[200px]" title={prop.gerador_modelo}>
                      {prop.gerador_modelo || 'Nenhum'}
                    </td>
                    <td className="p-4 text-right text-ciklo-yellow font-medium">
                      {formatCurrency(prop.valor_total)}
                    </td>
                    <td className="p-4 text-center">
                      <span className={`px-2.5 py-1 text-xs font-semibold rounded-full border ${getStatusColor(prop.status)}`}>
                        {prop.status || 'RASCUNHO'}
                      </span>
                    </td>
                    <td className="p-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {/* 
                         TODO: View Proposal
                         The View button should probably open ProposalView.tsx
                        */}
                        <button
                          onClick={() => navigate(`/sales/proposals/${prop.id}`)}
                          className="p-2 text-gray-400 hover:text-white hover:bg-gray-700/50 rounded-lg transition-colors"
                          title="Visualizar Proposta / Imprimir"
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          onClick={() => handleDelete(prop.id)}
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
    </div>
  );
};

export default Proposals;
