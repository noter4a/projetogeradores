
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { UserRole } from './types';
import Login from './pages/Login.tsx';
import Dashboard from './pages/Dashboard';
import GeneratorDetail from './pages/GeneratorDetail.tsx';
import AlarmCenter from './pages/AlarmCenter'; // NEW
import FleetManagement from './pages/FleetManagement';
import AddGenerator from './pages/AddGenerator';
import UserManagement from './pages/UserManagement';
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
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  // Close sidebar on route change on mobile
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location]);

  return (
    <div className="flex h-screen print:h-auto bg-ciklo-black print:bg-white overflow-hidden print:overflow-visible">
      {/* Global Alarm Popup */}
      <AlarmPopup />

      {/* Mobile Sidebar Overlay */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 md:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition duration-200 ease-in-out z-30 md:flex md:flex-col w-64 bg-ciklo-card border-r border-gray-800 print:hidden`}>
        <Sidebar />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden print:overflow-visible w-full">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 bg-ciklo-card border-b border-gray-800 print:hidden">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-ciklo-yellow to-ciklo-orange flex items-center justify-center font-bold text-black">
              C
            </div>
            <span className="font-bold text-white tracking-wider">CIKLO</span>
          </div>
          <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-white">
            {isSidebarOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto print:overflow-visible bg-ciklo-black print:bg-white p-4 md:p-6 print:p-0">
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

      </Routes>
    </HashRouter>
  );
};

const App: React.FC = () => {
  return (
    <AuthProvider>
      <UserProvider>
        <GeneratorProvider>
          <AlarmProvider>
            <AppContent />
          </AlarmProvider>
        </GeneratorProvider>
      </UserProvider>
    </AuthProvider>
  );
};

export default App;
