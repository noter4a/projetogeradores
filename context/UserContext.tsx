import React, { createContext, useContext, useState, useEffect, useCallback, PropsWithChildren } from 'react';
import { User, UserRole } from '../types';
import { useAuth } from './AuthContext';

interface UserContextType {
  users: User[];
  loading: boolean;
  error: string | null;
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
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchUsers = useCallback(async () => {
    if (currentUser?.role !== UserRole.ADMIN) {
      setUsers([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      // Cookie httpOnly autentica sozinho — sem token manual.
      const response = await fetch('/api/users');
      if (response.ok) {
        const data = await response.json();
        console.log('Users fetched:', data); // Debug log
        setUsers(data);
      } else {
        const errText = await response.text();
        setError(`Failed: ${response.status} ${response.statusText} - ${errText}`);
        console.error('Failed to fetch users:', response.status, errText);
      }
    } catch (error) {
      setError(`Network Error: ${String(error)}`);
      console.error('Error fetching users:', error);
    } finally {
      setLoading(false);
    }
  }, [currentUser]);

  // Initial Fetch
  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const addUser = useCallback(async (user: User) => {
    if (!currentUser) return;
    try {
      await fetch('/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: user.name,
          email: user.email,
          password: user.password,
          role: user.role,
          assigned_generators: user.assignedGeneratorIds,
          companyId: user.companyId,
          phone: user.phone || null,
          whatsappAlerts: user.whatsappAlerts || false,
          emailAlerts: user.emailAlerts !== undefined ? user.emailAlerts : true
        })
      });
      await fetchUsers();
    } catch (error) {
      console.error('Error adding user:', error);
    }
  }, [currentUser, fetchUsers]);

  const removeUser = useCallback(async (id: string) => {
    if (!currentUser) return;
    try {
      await fetch(`/api/users/${id}`, { method: 'DELETE' });
      await fetchUsers(); // Refresh list
    } catch (error) {
      console.error('Error removing user:', error);
    }
  }, [currentUser, fetchUsers]);

  const updateUser = useCallback(async (updatedUser: User) => {
    if (!currentUser) return;
    try {
      await fetch(`/api/users/${updatedUser.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: updatedUser.name,
          email: updatedUser.email,
          role: updatedUser.role,
          assignedGeneratorIds: updatedUser.assignedGeneratorIds,
          companyId: updatedUser.companyId,
          phone: updatedUser.phone || null,
          whatsappAlerts: updatedUser.whatsappAlerts || false,
          emailAlerts: updatedUser.emailAlerts !== undefined ? updatedUser.emailAlerts : true,
          // Só manda a senha se o admin realmente digitou algo novo — nunca usar
          // um valor mágico como "não mudou" (era exatamente isso que causava a
          // VUL-01/03 do pentest: '123456' virava senha real sempre que o campo
          // ficava vazio). Renomeado de credentials_password -> newPassword: o
          // nome antigo levou o pentest a achar que eram credenciais de
          // dispositivo/Modbus — é só a senha de login do próprio usuário.
          newPassword: updatedUser.password ? updatedUser.password : undefined
        })
      });
      await fetchUsers(); // Refresh list
    } catch (error) {
      console.error('Error updating user:', error);
    }
  }, [currentUser, fetchUsers]);

  return (
    <UserContext.Provider value={{
      users,
      loading,
      error,
      refreshUsers: fetchUsers,
      addUser,
      removeUser,
      updateUser
    }}>
      {children}
    </UserContext.Provider>
  );
};
