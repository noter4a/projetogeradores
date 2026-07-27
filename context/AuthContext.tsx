import React, { createContext, useContext, useState, PropsWithChildren, useEffect, useRef } from 'react';
import { User } from '../types';

/** login pode exigir 2FA: nesse caso não retorna User, e sim o desafio. */
type LoginResult =
  | { user: User; requires2FA?: false }
  | { requires2FA: true; challengeId: string; email: string };

interface AuthContextType {
  user: User | null;
  token: string | null;
  isSyncing: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyTwoFactor: (challengeId: string, code: string) => Promise<User>;
  logout: () => void;
  updateProfile: (data: { name?: string; phone?: string; currentPassword?: string; newPassword?: string; twoFactorEnabled?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>(null!);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: PropsWithChildren<{}>) => {
  // Initialize state from localStorage if available
  const [user, setUser] = useState<User | null>(() => {
    try {
      const savedUser = localStorage.getItem('ciklo_auth_user');
      return savedUser ? JSON.parse(savedUser) : null;
    } catch (error) {
      console.error("Failed to restore auth session", error);
      return null;
    }
  });

  const [token, setToken] = useState<string | null>(() => {
    return localStorage.getItem('ciklo_auth_token');
  });

  const [isSyncing, setIsSyncing] = useState(false);

  const login = async (email: string, password: string) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha ao fazer login');
      }

      const data = await response.json();

      // 2FA ativo: o servidor não devolve token, só o desafio.
      if (data.requires2FA) {
        return { requires2FA: true, challengeId: data.challengeId, email: data.email };
      }

      const { user, token } = data;
      setUser(user);
      setToken(token);
      localStorage.setItem('ciklo_auth_user', JSON.stringify(user));
      localStorage.setItem('ciklo_auth_token', token);
      return { user };

    } catch (error) {
      console.error("Login failed", error);
      throw error;
    }
  };

  const verifyTwoFactor = async (challengeId: string, code: string) => {
    const response = await fetch('/api/auth/verify-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId, code }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Código inválido');
    }
    const { user, token } = await response.json();
    setUser(user);
    setToken(token);
    localStorage.setItem('ciklo_auth_user', JSON.stringify(user));
    localStorage.setItem('ciklo_auth_token', token);
    return user;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    try {
      localStorage.removeItem('ciklo_auth_user');
      localStorage.removeItem('ciklo_auth_token');
    } catch (error) {
      console.error("Failed to clear auth session", error);
    }
  };

  const updateProfile = async (data: { name?: string; phone?: string; currentPassword?: string; newPassword?: string }) => {
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha ao atualizar perfil');
      }

      const updatedUser = await response.json();
      setUser(updatedUser);
      localStorage.setItem('ciklo_auth_user', JSON.stringify(updatedUser));
    } catch (error) {
      console.error('Profile update failed', error);
      throw error;
    }
  };

  // Keep a ref of current user to avoid stale closures in setInterval
  const currentUserRef = useRef<User | null>(user);
  useEffect(() => {
    currentUserRef.current = user;
  }, [user]);

  // Synchronize current profile in the background dynamically
  useEffect(() => {
    if (!token) return;

    const syncProfile = async () => {
      try {
        const response = await fetch('/api/auth/profile', {
          headers: {
            'Authorization': `Bearer ${token}`,
          },
        });

        if (response.status === 401 || response.status === 403 || response.status === 404) {
          // Token expired or invalid, or user was deleted by admin -> logout
          logout();
          return;
        }

        if (response.ok) {
          const updatedUser = await response.json();
          
          const current = currentUserRef.current;
          // Verify if any permission or role changed
          const permissionChanged = !current ||
            current.id !== updatedUser.id ||
            current.name !== updatedUser.name ||
            current.role !== updatedUser.role ||
            current.companyId !== updatedUser.companyId ||
            current.phone !== updatedUser.phone ||
            current.whatsappAlerts !== updatedUser.whatsappAlerts ||
            current.emailAlerts !== updatedUser.emailAlerts ||
            JSON.stringify(current.assignedGeneratorIds || []) !== JSON.stringify(updatedUser.assignedGeneratorIds || []);

          // Credits change on their own daily, silently -> don't show the
          // "syncing permissions" overlay for a plain credit-count update.
          const creditsChanged = current && current.companyCredits !== updatedUser.companyCredits;

          if (permissionChanged) {
            setIsSyncing(true);
            setTimeout(() => {
              setUser(updatedUser);
              localStorage.setItem('ciklo_auth_user', JSON.stringify(updatedUser));
              setIsSyncing(false);
            }, 800);
          } else if (creditsChanged) {
            setUser(updatedUser);
            localStorage.setItem('ciklo_auth_user', JSON.stringify(updatedUser));
          }
        }
      } catch (err) {
        console.error('Failed to sync profile in background:', err);
      }
    };

    // Run once on mount / token change
    syncProfile();

    // Poll every 60 seconds for real-time authorization changes
    const interval = setInterval(syncProfile, 60000);
    return () => clearInterval(interval);
  }, [token]);

  return (
    <AuthContext.Provider value={{ user, token, isSyncing, login, verifyTwoFactor, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};