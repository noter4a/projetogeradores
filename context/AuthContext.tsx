import React, { createContext, useContext, useState, PropsWithChildren, useEffect } from 'react';
import { User } from '../types';

interface AuthContextType {
  user: User | null;
  login: (user: User) => void;
  logout: () => void;
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

  const login = (userData: User) => {
    setUser(userData);
    try {
      localStorage.setItem('ciklo_auth_user', JSON.stringify(userData));
    } catch (error) {
      console.error("Failed to save auth session", error);
    }
  };

  const logout = () => {
    setUser(null);
    try {
      localStorage.removeItem('ciklo_auth_user');
    } catch (error) {
      console.error("Failed to clear auth session", error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
};