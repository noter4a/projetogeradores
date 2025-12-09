
import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Lock, LogOut, MessageCircle, Wallet } from 'lucide-react';

const NoCredits: React.FC = () => {
  const { logout, user } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-ciklo-black flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-ciklo-yellow via-ciklo-orange to-ciklo-yellow" />
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-red-500 opacity-5 rounded-full blur-3xl" />

      <div className="w-full max-w-md z-10 text-center">
        <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/10 mb-6 border border-red-500/20 shadow-xl shadow-red-900/10">
          <Wallet size={40} className="text-red-500" />
        </div>
        
        <h1 className="text-3xl font-bold text-white mb-2">Acesso Suspenso</h1>
        <p className="text-gray-400 mb-8">
          Olá <span className="text-white font-medium">{user?.name}</span>. Seus créditos de acesso se esgotaram. Para continuar monitorando seus geradores, por favor, realize uma recarga.
        </p>

        <div className="bg-ciklo-card border border-gray-800 rounded-2xl p-6 shadow-xl mb-8">
          <div className="flex items-center justify-center gap-2 text-2xl font-bold text-red-500 mb-2">
             <Lock size={24} />
             <span>Saldo: 0 créditos</span>
          </div>
          <p className="text-xs text-gray-500">
             O acesso ao painel é bloqueado automaticamente quando o saldo atinge zero.
          </p>
        </div>

        <div className="space-y-3">
          <a 
            href="https://wa.me/555432931095?text=Olá,%20preciso%20recarregar%20meus%20créditos%20no%20sistema%20Ciklo." 
            target="_blank" 
            rel="noopener noreferrer"
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-500 text-white font-bold py-3.5 rounded-lg shadow-lg shadow-green-900/20 transition-all duration-200"
          >
            <MessageCircle size={20} />
            Solicitar Recarga via WhatsApp
          </a>

          <button 
            onClick={handleLogout}
            className="w-full flex items-center justify-center gap-2 bg-gray-800 hover:bg-gray-700 text-gray-300 font-medium py-3.5 rounded-lg border border-gray-700 hover:border-gray-600 transition-all duration-200"
          >
            <LogOut size={20} />
            Sair da Conta
          </button>
        </div>
        
        <p className="mt-8 text-xs text-gray-600">
          Ciklo Geradores &copy; 2024. Suporte Financeiro.
        </p>
      </div>
    </div>
  );
};

export default NoCredits;
