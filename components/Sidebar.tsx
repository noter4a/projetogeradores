import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { 
  LayoutDashboard, 
  Zap, 
  LogOut, 
  Settings2, 
  Users, 
  MessageCircle, 
  Wallet, 
  AlertTriangle, 
  BookOpen, 
  FileText, 
  FolderOpen, 
  Sun, 
  Moon, 
  Building,
  Server
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { UserRole } from '../types';

const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const location = useLocation();

  // Mobile navigation view state
  const [currentView, setCurrentView] = useState<'main' | 'generators' | 'sales' | 'admin'>(() => {
    const saved = sessionStorage.getItem('mobile_menu_view');
    return (saved as any) || 'main';
  });

  const changeView = (view: 'main' | 'generators' | 'sales' | 'admin') => {
    setCurrentView(view);
    sessionStorage.setItem('mobile_menu_view', view);
  };

  // Sync view on mobile home navigation
  useEffect(() => {
    if (location.pathname === '/') {
      const saved = sessionStorage.getItem('mobile_menu_view');
      setCurrentView((saved as any) || 'main');
    }
  }, [location]);

  const navItems = [
    { icon: LayoutDashboard, label: 'Painel', path: '/dashboard' },
    { icon: AlertTriangle, label: 'Central de Alarmes', path: '/alarms' },
  ];

  const salesItems = [
    { icon: Users, label: 'Clientes (CRM)', path: '/sales/clients' },
    { icon: BookOpen, label: 'Catálogo Base', path: '/sales/catalog' },
    { icon: FileText, label: 'Nova Proposta', path: '/sales/new-proposal' },
    { icon: FolderOpen, label: 'Histórico de Propostas', path: '/sales/proposals' },
  ];

  return (
    <div className="h-full">
      {/* DESKTOP VERSION (hidden on mobile, flex on md and above) */}
      <div className="hidden md:flex flex-col h-full text-gray-300">
        <div className="p-6 flex items-center gap-3 border-b border-gray-800">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-ciklo-yellow to-ciklo-orange flex items-center justify-center shadow-lg shadow-orange-500/20">
            <Zap className="text-black fill-black" size={24} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-wide">CIKLO</h1>
            <p className="text-[10px] text-ciklo-yellow uppercase tracking-widest font-semibold">Geradores</p>
          </div>
        </div>

        <div className="p-4 border-b border-gray-800">
          <div className="flex items-center gap-3 p-3 bg-ciklo-dark rounded-lg border border-gray-700">
            <div className="w-8 h-8 rounded-full bg-gray-600 flex items-center justify-center text-xs font-bold text-white">
              {user?.name.charAt(0)}
            </div>
            <div className="overflow-hidden flex-1">
              <p className="text-sm font-medium text-white truncate">{user?.name}</p>
              <p className="text-xs text-gray-400 truncate capitalize">{user?.role.toLowerCase()}</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
          {user?.role !== UserRole.ORCAMENTOS && (
            <div className="mb-6">
              <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Monitoramento</p>
              {navItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                      isActive
                        ? 'bg-ciklo-orange text-white shadow-lg shadow-orange-500/20'
                        : 'hover:bg-gray-800 hover:text-white'
                    }`
                  }
                >
                  <item.icon size={20} />
                  <span className="font-medium">{item.label}</span>
                </NavLink>
              ))}
            </div>
          )}

          {/* Sales & Quotation Module - Visible for Admin and Orcamentos */}
          {(user?.role === UserRole.ADMIN || user?.role === UserRole.ORCAMENTOS) && (
            <div className="mb-6">
              <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Vendas & Orçamentos</p>
              {salesItems.map((item) => (
                <NavLink
                  key={item.path}
                  to={item.path}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 mb-1 ${
                      isActive
                        ? 'bg-ciklo-orange text-white shadow-lg shadow-orange-500/20'
                        : 'hover:bg-gray-800 hover:text-white'
                    }`
                  }
                >
                  <item.icon size={20} />
                  <span className="font-medium">{item.label}</span>
                </NavLink>
              ))}
            </div>
          )}

          {user?.role === UserRole.ADMIN && (
            <div className="pt-4 mt-4 border-t border-gray-800">
              <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Administração</p>
              <NavLink
                to="/fleet"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-ciklo-orange text-white shadow-lg shadow-orange-500/20'
                      : 'hover:bg-gray-800 hover:text-white'
                  }`
                }
              >
                <Settings2 size={20} />
                <span className="font-medium">Gerenciar Grupos Geradores</span>
              </NavLink>
              <NavLink
                to="/companies"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 mb-1 ${
                    isActive
                      ? 'bg-ciklo-orange text-white shadow-lg shadow-orange-500/20'
                      : 'hover:bg-gray-800 hover:text-white'
                  }`
                }
              >
                <Building size={20} />
                <span className="font-medium">Gerenciar Empresas</span>
              </NavLink>
              <NavLink
                to="/users"
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 ${
                    isActive
                      ? 'bg-ciklo-orange text-white shadow-lg shadow-orange-500/20'
                      : 'hover:bg-gray-800 hover:text-white'
                  }`
                }
              >
                <Users size={20} />
                <span className="font-medium">Controle de Contas</span>
              </NavLink>
            </div>
          )}
        </nav>

        <div className="p-4 border-t border-gray-800 space-y-2">
          <button
            onClick={toggleTheme}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-gray-400 hover:bg-gray-800 hover:text-white transition-all duration-200 group"
            title={theme === 'dark' ? 'Ativar Modo Claro' : 'Ativar Modo Escuro'}
          >
            {theme === 'dark' ? (
              <Sun size={20} className="text-ciklo-yellow group-hover:rotate-45 transition-transform duration-300" />
            ) : (
              <Moon size={20} className="text-blue-400 group-hover:-rotate-12 transition-transform duration-300" />
            )}
            <span className="font-medium">{theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>
          </button>

          <a 
            href="https://wa.me/555432931095" 
            target="_blank" 
            rel="noopener noreferrer"
            className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-gray-400 hover:bg-green-500/10 hover:text-green-400 transition-all duration-200"
          >
            <MessageCircle size={20} />
            <span className="font-medium">Suporte WhatsApp</span>
          </a>
          <button
            onClick={logout}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-lg text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-all duration-200"
          >
            <LogOut size={20} />
            <span className="font-medium">Sair do Sistema</span>
          </button>
        </div>
      </div>

      {/* MOBILE VERSION: Card Menu (flex on mobile, hidden on md and above) */}
      <div className="flex md:hidden flex-col h-full bg-ciklo-black text-gray-300 overflow-y-auto">
        {/* Mobile Header Inside Sidebar */}
        <div className="p-6 flex items-center justify-between border-b border-gray-900">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-ciklo-yellow to-ciklo-orange flex items-center justify-center shadow-lg shadow-orange-500/20">
              <Zap className="text-black fill-black" size={24} />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white tracking-wide">CIKLO</h1>
              <p className="text-[10px] text-ciklo-yellow uppercase tracking-widest font-semibold">Geradores</p>
            </div>
          </div>
          <div className="text-xs text-gray-500 font-medium bg-gray-900 px-3 py-1.5 rounded-full capitalize">
            {user?.role.toLowerCase()}
          </div>
        </div>

        {/* Dynamic Navigation Content */}
        <div className="flex-1 p-6">
          {currentView === 'main' && (
            <div className="space-y-4">
              <div className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-2">
                Olá, {user?.name.split(' ')[0]}! Escolha uma opção:
              </div>
              <div className="grid grid-cols-2 gap-4">
                {user?.role !== UserRole.ORCAMENTOS && (
                  <button
                    onClick={() => changeView('generators')}
                    className="flex flex-col items-center justify-center p-6 bg-ciklo-card border border-gray-800 hover:border-gray-700 active:scale-95 transition-all rounded-2xl aspect-square shadow-xl text-center group"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-ciklo-orange/10 text-ciklo-orange flex items-center justify-center mb-3 group-hover:bg-ciklo-orange group-hover:text-black transition-all">
                      <Server size={28} className="fill-current" />
                    </div>
                    <span className="text-sm font-bold text-white leading-tight">Geradores</span>
                  </button>
                )}

                {(user?.role === UserRole.ADMIN || user?.role === UserRole.ORCAMENTOS) && (
                  <button
                    onClick={() => changeView('sales')}
                    className="flex flex-col items-center justify-center p-6 bg-ciklo-card border border-gray-800 hover:border-gray-700 active:scale-95 transition-all rounded-2xl aspect-square shadow-xl text-center group"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-ciklo-orange/10 text-ciklo-orange flex items-center justify-center mb-3 group-hover:bg-ciklo-orange group-hover:text-black transition-all">
                      <Wallet size={28} />
                    </div>
                    <span className="text-sm font-bold text-white leading-tight">Vendas & Orçamentos</span>
                  </button>
                )}

                {user?.role === UserRole.ADMIN && (
                  <button
                    onClick={() => changeView('admin')}
                    className="flex flex-col items-center justify-center p-6 bg-ciklo-card border border-gray-800 hover:border-gray-700 active:scale-95 transition-all rounded-2xl aspect-square shadow-xl text-center group"
                  >
                    <div className="w-14 h-14 rounded-2xl bg-ciklo-orange/10 text-ciklo-orange flex items-center justify-center mb-3 group-hover:bg-ciklo-orange group-hover:text-black transition-all">
                      <Settings2 size={28} />
                    </div>
                    <span className="text-sm font-bold text-white leading-tight">Administração</span>
                  </button>
                )}
              </div>
            </div>
          )}

          {currentView === 'generators' && (
            <div className="space-y-4">
              <button
                onClick={() => changeView('main')}
                className="flex items-center gap-2 text-sm text-ciklo-orange font-bold hover:underline mb-2"
              >
                ← Voltar ao Menu Principal
              </button>
              <div className="grid grid-cols-2 gap-4">
                <NavLink
                  to="/dashboard"
                  className="flex flex-col items-center justify-center p-6 bg-ciklo-card border border-gray-800 hover:border-gray-700 active:scale-95 transition-all rounded-2xl aspect-square shadow-xl text-center group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-ciklo-orange/10 text-ciklo-orange flex items-center justify-center mb-3 group-hover:bg-ciklo-orange group-hover:text-black transition-all">
                    <LayoutDashboard size={28} />
                  </div>
                  <span className="text-sm font-bold text-white leading-tight">Meus Geradores</span>
                </NavLink>

                <NavLink
                  to="/alarms"
                  className="flex flex-col items-center justify-center p-6 bg-ciklo-card border border-gray-800 hover:border-gray-700 active:scale-95 transition-all rounded-2xl aspect-square shadow-xl text-center group"
                >
                  <div className="w-14 h-14 rounded-2xl bg-ciklo-orange/10 text-ciklo-orange flex items-center justify-center mb-3 group-hover:bg-ciklo-orange group-hover:text-black transition-all">
                    <AlertTriangle size={28} />
                  </div>
                  <span className="text-sm font-bold text-white leading-tight">Central de Alarmes</span>
                </NavLink>
              </div>
            </div>
          )}

          {currentView === 'sales' && (
            <div className="space-y-4">
              <button
                onClick={() => changeView('main')}
                className="flex items-center gap-2 text-sm text-ciklo-orange font-bold hover:underline mb-2"
              >
                ← Voltar ao Menu Principal
              </button>
              <div className="grid grid-cols-2 gap-4">
                <NavLink
                  to="/sales/clients"
                  className="flex flex-col items-center justify-center p-4 bg-ciklo-card border border-gray-800 hover:border-gray-700 active:scale-95 transition-all rounded-2xl aspect-square shadow-xl text-center group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-ciklo-orange/10 text-ciklo-orange flex items-center justify-center mb-2 group-hover:bg-ciklo-orange group-hover:text-black transition-all">
                    <Users size={24} />
                  </div>
                  <span className="text-xs font-bold text-white leading-tight">Clientes (CRM)</span>
                </NavLink>

                <NavLink
                  to="/sales/catalog"
                  className="flex flex-col items-center justify-center p-4 bg-ciklo-card border border-gray-800 hover:border-gray-700 active:scale-95 transition-all rounded-2xl aspect-square shadow-xl text-center group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-ciklo-orange/10 text-ciklo-orange flex items-center justify-center mb-2 group-hover:bg-ciklo-orange group-hover:text-black transition-all">
                    <BookOpen size={24} />
                  </div>
                  <span className="text-xs font-bold text-white leading-tight">Catálogo Base</span>
                </NavLink>

                <NavLink
                  to="/sales/new-proposal"
                  className="flex flex-col items-center justify-center p-4 bg-ciklo-card border border-gray-800 hover:border-gray-700 active:scale-95 transition-all rounded-2xl aspect-square shadow-xl text-center group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-ciklo-orange/10 text-ciklo-orange flex items-center justify-center mb-2 group-hover:bg-ciklo-orange group-hover:text-black transition-all">
                    <FileText size={24} />
                  </div>
                  <span className="text-xs font-bold text-white leading-tight">Nova Proposta</span>
                </NavLink>

                <NavLink
                  to="/sales/proposals"
                  className="flex flex-col items-center justify-center p-4 bg-ciklo-card border border-gray-800 hover:border-gray-700 active:scale-95 transition-all rounded-2xl aspect-square shadow-xl text-center group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-ciklo-orange/10 text-ciklo-orange flex items-center justify-center mb-2 group-hover:bg-ciklo-orange group-hover:text-black transition-all">
                    <FolderOpen size={24} />
                  </div>
                  <span className="text-xs font-bold text-white leading-tight">Histórico</span>
                </NavLink>
              </div>
            </div>
          )}

          {currentView === 'admin' && (
            <div className="space-y-4">
              <button
                onClick={() => changeView('main')}
                className="flex items-center gap-2 text-sm text-ciklo-orange font-bold hover:underline mb-2"
              >
                ← Voltar ao Menu Principal
              </button>
              <div className="grid grid-cols-2 gap-4">
                <NavLink
                  to="/fleet"
                  className="flex flex-col items-center justify-center p-4 bg-ciklo-card border border-gray-800 hover:border-gray-700 active:scale-95 transition-all rounded-2xl aspect-square shadow-xl text-center group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-ciklo-orange/10 text-ciklo-orange flex items-center justify-center mb-2 group-hover:bg-ciklo-orange group-hover:text-black transition-all">
                    <Settings2 size={24} />
                  </div>
                  <span className="text-xs font-bold text-white leading-tight text-center">Grupos Geradores</span>
                </NavLink>

                <NavLink
                  to="/companies"
                  className="flex flex-col items-center justify-center p-4 bg-ciklo-card border border-gray-800 hover:border-gray-700 active:scale-95 transition-all rounded-2xl aspect-square shadow-xl text-center group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-ciklo-orange/10 text-ciklo-orange flex items-center justify-center mb-2 group-hover:bg-ciklo-orange group-hover:text-black transition-all">
                    <Building size={24} />
                  </div>
                  <span className="text-xs font-bold text-white leading-tight text-center">Gerenciar Empresas</span>
                </NavLink>

                <NavLink
                  to="/users"
                  className="flex flex-col items-center justify-center p-4 bg-ciklo-card border border-gray-800 hover:border-gray-700 active:scale-95 transition-all rounded-2xl aspect-square shadow-xl text-center group"
                >
                  <div className="w-12 h-12 rounded-2xl bg-ciklo-orange/10 text-ciklo-orange flex items-center justify-center mb-2 group-hover:bg-ciklo-orange group-hover:text-black transition-all">
                    <Users size={24} />
                  </div>
                  <span className="text-xs font-bold text-white leading-tight text-center">Controle Contas</span>
                </NavLink>
              </div>
            </div>
          )}
        </div>

        {/* Mobile Footer */}
        <div className="p-6 border-t border-gray-900 space-y-2 bg-[#0c0c0d]">
          <button
            onClick={toggleTheme}
            className="flex items-center justify-between w-full p-3 bg-ciklo-card border border-gray-800 rounded-xl text-sm font-medium text-gray-300 hover:text-white"
          >
            <div className="flex items-center gap-2">
              {theme === 'dark' ? <Sun size={18} className="text-ciklo-yellow" /> : <Moon size={18} className="text-blue-400" />}
              <span>{theme === 'dark' ? 'Modo Claro' : 'Modo Escuro'}</span>
            </div>
            <span className="text-[10px] text-gray-500 uppercase font-bold">Alternar</span>
          </button>

          <a
            href="https://wa.me/555432931095"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full p-3 bg-green-600/10 border border-green-500/20 rounded-xl text-sm font-bold text-green-400 hover:bg-green-600/20 active:scale-95 transition-all"
          >
            <MessageCircle size={18} />
            Suporte WhatsApp
          </a>

          <button
            onClick={logout}
            className="flex items-center justify-center gap-2 w-full p-3 bg-red-600/10 border border-red-500/20 rounded-xl text-sm font-bold text-red-400 hover:bg-red-600/20 active:scale-95 transition-all"
          >
            <LogOut size={18} />
            Sair do Sistema
          </button>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
