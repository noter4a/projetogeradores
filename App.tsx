
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { UserRole } from './types';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import GeneratorDetail from './pages/GeneratorDetail';
import FleetManagement from './pages/FleetManagement';
import AddGenerator from './pages/AddGenerator';
import UserManagement from './pages/UserManagement';
import Reports from './pages/Reports';
import Maintenance from './pages/Maintenance';
import Alarms from './pages/Alarms';
import Sidebar from './components/Sidebar';
import NoCredits from './pages/NoCredits';
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

  // Check for credits if user is a CLIENT
  if (user.role === UserRole.CLIENT) {
     const credits = user.credits ?? 0;
     if (credits <= 0) {
       return <Navigate to="/no-credits" replace />;
     }
  }

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

const Layout = ({ children }: { children?: React.ReactNode }) => {
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const location = useLocation();

  // Close sidebar on route change on mobile
  useEffect(() => {
    setIsSidebarOpen(false);
  }, [location]);

  return (
    <div className="flex h-screen bg-ciklo-black overflow-hidden">
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
      <div className={`fixed inset-y-0 left-0 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} md:relative md:translate-x-0 transition duration-200 ease-in-out z-30 md:flex md:flex-col w-64 bg-ciklo-card border-r border-gray-800`}>
        <Sidebar />
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden w-full">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between p-4 bg-ciklo-card border-b border-gray-800">
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

        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-ciklo-black p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
};

const AppContent: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route path="/no-credits" element={
            <NoCredits />
        } />

        <Route path="/" element={
          <ProtectedRoute>
            <Layout><Dashboard /></Layout>
          </ProtectedRoute>
        } />
        
        <Route path="/generator/:id" element={
          <ProtectedRoute>
            <Layout><GeneratorDetail /></Layout>
          </ProtectedRoute>
        } />
        
        <Route path="/maintenance" element={
          <ProtectedRoute>
            <Layout><Maintenance /></Layout>
          </ProtectedRoute>
        } />

        <Route path="/reports" element={
          <ProtectedRoute>
            <Layout><Reports /></Layout>
          </ProtectedRoute>
        } />

        <Route path="/alarms" element={
          <ProtectedRoute>
            <Layout><Alarms /></Layout>
          </ProtectedRoute>
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
