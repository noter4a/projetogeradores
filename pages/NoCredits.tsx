import React from 'react';
import { Zap, MessageCircle, LogOut } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const NoCredits: React.FC = () => {
  const { logout } = useAuth();

  return (
    <div className="min-h-screen bg-ciklo-black flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-ciklo-yellow via-ciklo-orange to-ciklo-yellow" />
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-ciklo-orange opacity-5 rounded-full blur-3xl" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-ciklo-yellow opacity-5 rounded-full blur-3xl" />

      <div className="w-full max-w-md z-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br from-ciklo-yellow to-ciklo-orange mb-6 shadow-xl shadow-orange-500/20">
            <Zap size={32} className="text-black fill-black" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">CIKLO GERADORES</h1>
        </div>

        <div className="bg-ciklo-card border border-gray-800 rounded-2xl p-8 shadow-2xl text-center animate-in fade-in slide-in-from-bottom-4 duration-500">
          <h2 className="text-xl font-bold text-white mb-2">Créditos Esgotados</h2>
          <p className="text-gray-400 text-sm mb-6">
            Os créditos da sua empresa acabaram e o acesso ao painel foi suspenso.
            Entre em contato para renovar o plano e continuar monitorando seus geradores.
          </p>

          <a
            href="https://wa.me/555432931095?text=Ol%C3%A1%2C%20preciso%20renovar%20os%20cr%C3%A9ditos%20do%20meu%20plano%20no%20sistema%20Ciklo."
            target="_blank"
            rel="noopener noreferrer"
            className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-600 text-white font-bold py-3.5 rounded-lg shadow-lg shadow-green-900/20 hover:shadow-green-900/40 transform hover:-translate-y-0.5 transition-all duration-200"
          >
            <MessageCircle size={20} />
            Entrar em Contato pelo WhatsApp
          </a>

          <button
            onClick={logout}
            className="w-full mt-4 inline-flex items-center justify-center gap-2 text-sm text-gray-500 hover:text-white transition-colors py-2"
          >
            <LogOut size={16} />
            Sair da conta
          </button>
        </div>

        <p className="text-center text-gray-600 mt-12 text-xs">
          &copy; 2024 Ciklo Geradores. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
};

export default NoCredits;
