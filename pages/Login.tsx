import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useUsers } from '../context/UserContext';
import { Zap, Lock, Mail, MessageCircle } from 'lucide-react';

const Login: React.FC = () => {
  const { login } = useAuth();
  const { users } = useUsers();
  const navigate = useNavigate();
  
  // Form states
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    // Find user in the actual database (context) instead of using mock constants
    const foundUser = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    
    if (foundUser) {
      // Check password
      // For existing users without password in storage, fallback to default '123456'
      const storedPassword = foundUser.password || '123456';
      
      if (storedPassword === password) {
        // Pass the full user object with assignments to the auth context
        login(foundUser);
        navigate('/');
      } else {
        setError('Senha incorreta.');
      }
    } else {
      setError('Usuário não encontrado. Verifique o e-mail.');
    }
  };

  return (
    <div className="min-h-screen bg-ciklo-black flex flex-col items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-ciklo-yellow via-ciklo-orange to-ciklo-yellow" />
      <div className="absolute -top-40 -right-40 w-96 h-96 bg-ciklo-orange opacity-5 rounded-full blur-3xl" />
      <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-ciklo-yellow opacity-5 rounded-full blur-3xl" />

      <div className="w-full max-w-md z-10">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-gradient-to-br from-ciklo-yellow to-ciklo-orange mb-6 shadow-xl shadow-orange-500/20">
            <Zap size={32} className="text-black fill-black" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">CIKLO GERADORES</h1>
          <p className="text-gray-400 text-sm">Monitoramento Inteligente & Controle Remoto</p>
        </div>

        <div className="bg-ciklo-card border border-gray-800 rounded-2xl p-8 shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-500">
            <h2 className="text-xl font-bold text-white mb-1">Acesso ao Sistema</h2>
            <p className="text-gray-500 text-sm mb-6">Entre com suas credenciais para continuar.</p>

            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">E-mail</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <input 
                    type="email" 
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoComplete="off"
                    className="w-full bg-ciklo-black border border-gray-700 rounded-lg py-3 pl-10 pr-4 text-white placeholder-gray-600 focus:border-ciklo-orange focus:ring-1 focus:ring-ciklo-orange outline-none transition-all"
                    placeholder="Digite seu e-mail"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-400 mb-1.5">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <input 
                    type="password" 
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    autoComplete="off"
                    className="w-full bg-ciklo-black border border-gray-700 rounded-lg py-3 pl-10 pr-4 text-white placeholder-gray-600 focus:border-ciklo-orange focus:ring-1 focus:ring-ciklo-orange outline-none transition-all"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              {error && (
                <p className="text-red-500 text-sm text-center bg-red-500/10 py-2 rounded-lg border border-red-500/20">
                  {error}
                </p>
              )}

              <button 
                type="submit"
                className="w-full bg-gradient-to-r from-ciklo-orange to-orange-600 hover:from-orange-500 hover:to-orange-600 text-white font-bold py-3.5 rounded-lg shadow-lg shadow-orange-900/20 hover:shadow-orange-900/40 transform hover:-translate-y-0.5 transition-all duration-200 mt-2"
              >
                Entrar no Painel
              </button>
            </form>

            <div className="mt-6 text-center">
              <a 
                href="https://wa.me/555432931095" 
                target="_blank" 
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-green-500 transition-colors"
              >
                <MessageCircle size={16} />
                Precisa de ajuda? Suporte WhatsApp
              </a>
            </div>
        </div>
        
        <p className="text-center text-gray-600 mt-12 text-xs">
          &copy; 2024 Ciklo Geradores. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
};

export default Login;