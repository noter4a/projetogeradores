
import React from 'react';
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Zap, LogOut, Settings2, Users, MessageCircle, Wallet, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { UserRole } from '../types';

const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();

  const navItems = [
    { icon: LayoutDashboard, label: 'Painel', path: '/' },
    { icon: AlertTriangle, label: 'Central de Alarmes', path: '/alarms' },
  ];

  return (
    <div className="flex flex-col h-full text-gray-300">
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
        
        {/* Credit Balance for Clients */}
        {user?.role === UserRole.CLIENT && (
          <div className="mt-3 px-3 py-2 bg-gray-800/50 rounded-lg border border-gray-700 flex items-center justify-between">
             <div className="flex items-center gap-2 text-gray-400">
                <Wallet size={14} />
                <span className="text-xs font-medium">Dias Restantes</span>
             </div>
             <span className={`text-sm font-bold ${ (user.credits || 0) > 0 ? 'text-green-400' : 'text-red-400'}`}>
                {user.credits || 0} dias
             </span>
          </div>
        )}
      </div>

      <nav className="flex-1 p-4 space-y-2 overflow-y-auto">
        <p className="px-4 text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">Menu Principal</p>
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
  );
};

export default Sidebar;
