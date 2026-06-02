
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { UserRole } from './types';
import Login from './pages/Login.tsx';
import Dashboard from './pages/Dashboard';
import GeneratorDetail from './pages/GeneratorDetail.tsx';
import AlarmCenter from './pages/AlarmCenter'; // NEW
import FleetManagement from './pages/FleetManagement';
import AddGenerator from './pages/AddGenerator';
import UserManagement from './pages/UserManagement';
import ProfileSettings from './pages/ProfileSettings';
import CompanyManagement from './pages/CompanyManagement';
import Reports from './pages/Reports';
import Maintenance from './pages/Maintenance';
import Alarms from './pages/Alarms';

// Quotation Module Pages
import Clients from './pages/sales/Clients';
import Catalog from './pages/sales/Catalog';
import NewProposal from './pages/sales/NewProposal';
import Proposals from './pages/sales/Proposals';
import ProposalView from './pages/sales/ProposalView';

import Sidebar from './components/Sidebar';
import AlarmPopup from './components/AlarmPopup';
import { GeneratorProvider } from './context/GeneratorContext';
import { UserProvider } from './context/UserContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AlarmProvider } from './context/AlarmContext';
import { ThemeProvider } from './context/ThemeContext';
import { Menu, X } from 'lucide-react';

const ProtectedRoute = ({ children }: { children?: React.ReactNode }) => {
  const { user } = useAuth();
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Credit check removed

  return <>{children}</>;
};

const AdminRoute = ({ children }: { children?: React.ReactNode }) => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== UserRole.ADMIN) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const SalesRoute = ({ children }: { children?: React.ReactNode }) => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== UserRole.ADMIN && user.role !== UserRole.ORCAMENTOS) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};

const MonitoringRoute = ({ children }: { children?: React.ReactNode }) => {
  const { user } = useAuth();

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role === UserRole.ORCAMENTOS) {
    return <Navigate to="/sales/clients" replace />;
  }

  return <>{children}</>;
};

const Layout = ({ children }: { children?: React.ReactNode }) => {
  const location = useLocation();
  const { user } = useAuth();
  const [isMobile, setIsMobile] = useState(window.innerWidth < 768);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    return localStorage.getItem('ciklo_sidebar_collapsed') === 'true';
  });

  useEffect(() => {
    const handleResize = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  if (isMobile) {
    if (location.pathname === '/') {
      return (
        <div className="flex h-screen bg-ciklo-black overflow-hidden w-full">
          {user?.role !== UserRole.ORCAMENTOS && <AlarmPopup />}
          <div className="w-full h-full">
            <Sidebar />
          </div>
        </div>
      );
    }

    return (
      <div className="flex h-screen bg-ciklo-black overflow-hidden flex-col w-full">
        {user?.role !== UserRole.ORCAMENTOS && <AlarmPopup />}
        
        {/* Mobile Header with Back Button */}
        <header className="flex items-center justify-between p-4 bg-ciklo-card border-b border-gray-800 print:hidden">
          <Link to="/" className="flex items-center gap-2 text-white hover:text-ciklo-orange transition-colors">
            <ArrowLeft size={20} className="text-ciklo-orange" />
            <span className="font-bold text-sm">Voltar ao Menu</span>
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full bg-gradient-to-br from-ciklo-yellow to-ciklo-orange flex items-center justify-center font-bold text-[11px] text-black">
              C
            </div>
            <span className="font-bold text-xs text-gray-300 tracking-wider">CIKLO</span>
          </div>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto p-4 bg-ciklo-black">
          {children}
        </main>
      </div>
    );
  }

  // Desktop Layout
  return (
    <div className="flex h-screen print:h-auto bg-ciklo-black print:bg-white overflow-hidden print:overflow-visible">
      {user?.role !== UserRole.ORCAMENTOS && <AlarmPopup />}

      {/* Desktop Sidebar */}
      <div className={`flex flex-col ${sidebarCollapsed ? 'w-20' : 'w-64'} bg-ciklo-card border-r border-gray-800 print:hidden transition-all duration-300 ease-in-out`}>
        <Sidebar collapsed={sidebarCollapsed} onToggleCollapse={() => { const next = !sidebarCollapsed; setSidebarCollapsed(next); localStorage.setItem('ciklo_sidebar_collapsed', String(next)); }} />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden print:overflow-visible w-full">
        <main className="flex-1 overflow-x-hidden overflow-y-auto print:overflow-visible bg-ciklo-black print:bg-white p-6 print:p-0">
          {children}
        </main>
      </div>
    </div>
  );
};

const DashboardRedirect: React.FC = () => {
  const { user } = useAuth();
  if (user?.role === UserRole.ORCAMENTOS) {
    return <Navigate to="/sales/clients" replace />;
  }
  return <Dashboard />;
};

const AppContent: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* NoCredits route removed */}

        <Route path="/" element={
          <ProtectedRoute>
            <Layout>
              {window.innerWidth < 768 ? (
                <></>
              ) : (
                <Navigate to="/dashboard" replace />
              )}
            </Layout>
          </ProtectedRoute>
        } />

        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Layout><DashboardRedirect /></Layout>
          </ProtectedRoute>
        } />

        <Route path="/generator/:id" element={
          <MonitoringRoute>
            <Layout><GeneratorDetail /></Layout>
          </MonitoringRoute>
        } />

        <Route path="/alarm-center" element={
          <MonitoringRoute>
            <Layout><AlarmCenter /></Layout>
          </MonitoringRoute>
        } />

        <Route path="/maintenance" element={
          <MonitoringRoute>
            <Layout><Maintenance /></Layout>
          </MonitoringRoute>
        } />

        <Route path="/reports" element={
          <MonitoringRoute>
            <Layout><Reports /></Layout>
          </MonitoringRoute>
        } />

        <Route path="/alarms" element={
          <MonitoringRoute>
            <Layout><Alarms /></Layout>
          </MonitoringRoute>
        } />

        {/* Admin Only Routes */}
        <Route path="/fleet" element={
          <AdminRoute>
            <Layout><FleetManagement /></Layout>
          </AdminRoute>
        } />

        <Route path="/add-generator" element={
          <AdminRoute>
            <Layout><AddGenerator /></Layout>
          </AdminRoute>
        } />

        <Route path="/edit-generator/:id" element={
          <AdminRoute>
            <Layout><AddGenerator /></Layout>
          </AdminRoute>
        } />

        <Route path="/users" element={
          <AdminRoute>
            <Layout><UserManagement /></Layout>
          </AdminRoute>
        } />

        <Route path="/companies" element={
          <AdminRoute>
            <Layout><CompanyManagement /></Layout>
          </AdminRoute>
        } />

        {/* Quotation Module (Admin + Orcamentos) */}
        <Route path="/sales/clients" element={
          <SalesRoute>
            <Layout><Clients /></Layout>
          </SalesRoute>
        } />
        <Route path="/sales/catalog" element={
          <SalesRoute>
            <Layout><Catalog /></Layout>
          </SalesRoute>
        } />
        <Route path="/sales/new-proposal" element={
          <SalesRoute>
            <Layout><NewProposal /></Layout>
          </SalesRoute>
        } />
        <Route path="/sales/proposals" element={
          <SalesRoute>
            <Layout><Proposals /></Layout>
          </SalesRoute>
        } />
        <Route path="/sales/proposals/:id" element={
          <SalesRoute>
            <Layout><ProposalView /></Layout>
          </SalesRoute>
        } />

        {/* Profile/Settings (Any authenticated user) */}
        <Route path="/profile" element={
          <ProtectedRoute>
            <Layout><ProfileSettings /></Layout>
          </ProtectedRoute>
        } />

      </Routes>
    </HashRouter>
  );
};

const App: React.FC = () => {
  return (
    <ThemeProvider>
      <AuthProvider>
        <UserProvider>
          <GeneratorProvider>
            <AlarmProvider>
              <AppContent />
            </AlarmProvider>
          </GeneratorProvider>
        </UserProvider>
      </AuthProvider>
    </ThemeProvider>
  );
};

export default App;
