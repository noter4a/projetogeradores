
import React, { createContext, useContext, useState, useEffect, useCallback, PropsWithChildren } from 'react';
import { User, UserRole } from '../types';
import { MOCK_USERS } from '../constants';

interface UserContextType {
  users: User[];
  addUser: (user: User) => void;
  removeUser: (id: string) => void;
  updateUser: (user: User) => void;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const useUsers = () => {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error('useUsers must be used within a UserProvider');
  }
  return context;
};

export const UserProvider = ({ children }: PropsWithChildren<{}>) => {
  // Initialize state from localStorage if available, otherwise use MOCK_USERS
  const [users, setUsers] = useState<User[]>(() => {
    try {
      const savedUsers = localStorage.getItem('ciklo_users');
      if (savedUsers) {
        const parsed = JSON.parse(savedUsers);
        // Safety check: ensure parsed data is actually an array
        if (!Array.isArray(parsed)) {
            console.warn("Corrupt user data in storage, resetting to defaults.");
            return MOCK_USERS;
        }

        // Migration: ensure every user has a password, assignedGeneratorIds and credits
        return parsed.map((u: User) => ({
          ...u,
          password: u.password || '123456',
          assignedGeneratorIds: Array.isArray(u.assignedGeneratorIds) ? u.assignedGeneratorIds : [],
          credits: u.credits !== undefined ? u.credits : (u.role === UserRole.CLIENT ? 0 : undefined)
        }));
      }
      return MOCK_USERS;
    } catch (error) {
      console.error("Failed to load users from storage", error);
      return MOCK_USERS;
    }
  });

  // Save to localStorage whenever users state changes
  useEffect(() => {
    try {
      localStorage.setItem('ciklo_users', JSON.stringify(users));
    } catch (error) {
      console.error("Failed to save users to storage", error);
    }
  }, [users]);

  const addUser = useCallback((user: User) => {
    setUsers(prev => [...prev, user]);
  }, []);

  const removeUser = useCallback((id: string) => {
    setUsers(prev => prev.filter(u => u.id !== id));
  }, []);

  const updateUser = useCallback((updatedUser: User) => {
    setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
  }, []);

  return (
    <UserContext.Provider value={{ users, addUser, removeUser, updateUser }}>
      {children}
    </UserContext.Provider>
  );
};
