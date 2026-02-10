import React, { createContext, useContext, useState, useEffect, useCallback, PropsWithChildren } from 'react';
import { User, UserRole } from '../types';
import { useAuth } from './AuthContext';

interface UserContextType {
  users: User[];
  loading: boolean;
  refreshUsers: () => void;
  addUser: (user: User) => Promise<void>;
  removeUser: (id: string) => Promise<void>;
  updateUser: (user: User) => Promise<void>;
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
  const { token, user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    if (!token || currentUser?.role !== UserRole.ADMIN) {
      setUsers([]);
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/users', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setUsers(data);
      } else {
        console.error('Failed to fetch users');
      }
    } catch (error) {
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  }, [token, currentUser]);

  // Initial Fetch
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const addUser = useCallback(async (user: User) => {
    if (!token) return;
    try {
      await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: user.name,
          email: user.email,
          password: user.password,
          role: user.role,
          assigned_generators: user.assignedGeneratorIds
        })
      });
      await fetchUsers();
    } catch (error) {
      console.error('Error adding user:', error);
    }
  }, [token, fetchUsers]);

  const removeUser = useCallback(async (id: string) => {
    if (!token) return;
    try {
      await fetch(`/api/users/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      await fetchUsers(); // Refresh list
    } catch (error) {
      console.error('Error removing user:', error);
    }
  }, [token, fetchUsers]);

  const updateUser = useCallback(async (updatedUser: User) => {
    if (!token) return;
    try {
      await fetch(`/api/users/${updatedUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
          assignedGeneratorIds: updatedUser.assignedGeneratorIds,
          credits: updatedUser.credits,
          // Only send password if it's meant to be changed (handled by backend check)
          credentials_password: updatedUser.password === '123456' ? undefined : updatedUser.password
        })
      });
      await fetchUsers(); // Refresh list
    } catch (error) {
      console.error('Error updating user:', error);
    }
  }, [token, fetchUsers]);

  return (
    <UserContext.Provider value={{ users, loading, refreshUsers: fetchUsers, addUser, removeUser, updateUser }}>
      {children}
    </UserContext.Provider>
  );
};
