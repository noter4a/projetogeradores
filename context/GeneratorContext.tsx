import React, { createContext, useContext, useState, useEffect, useCallback, PropsWithChildren } from 'react';
import { Generator } from '../types';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

let socket: Socket | null = null;

export const getSocket = () => socket;

interface GeneratorContextType {
  generators: Generator[];
  isLoading: boolean;
  isSocketConnected: boolean;
  fetchGenerators: () => Promise<void>;
  addGenerator: (gen: Generator) => void;
  removeGenerator: (id: string) => void;
  updateGenerator: (gen: Generator) => void;
}

const GeneratorContext = createContext<GeneratorContextType | undefined>(undefined);

export const useGenerators = () => {
  const context = useContext(GeneratorContext);
  if (!context) {
    throw new Error('useGenerators must be used within a GeneratorProvider');
  }
  return context;
};

export const GeneratorProvider = ({ children }: PropsWithChildren<{}>) => {
  const { token } = useAuth();
  const [generators, setGenerators] = useState<Generator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSocketConnected, setIsSocketConnected] = useState(true);

  const fetchGenerators = useCallback(async () => {
    if (!token) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch('/api/generators', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setGenerators(data);
      } else {
        console.error('Failed to fetch generators');
      }
    } catch (error) {
      console.error('Error connecting to API:', error);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchGenerators();
  }, [fetchGenerators]);

  useEffect(() => {
    if (!token) return;

    socket = io({
      auth: { token },
    });

    const onConnect = () => setIsSocketConnected(true);
    const onDisconnect = () => setIsSocketConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    setIsSocketConnected(socket.connected);

    socket.on('generator:update', (data: any) => {
      setGenerators(prevGenerators =>
        prevGenerators.map(gen => {
          if (data.id === gen.id || data.id === gen.ip || data.id === gen.connectionName) {
            return {
              ...gen,
              ...data.data,
              lastDataReceived: Date.now(),
            };
          }
          return gen;
        })
      );
    });

    socket.on('generator:gps', (data: any) => {
      setGenerators(prevGenerators =>
        prevGenerators.map(gen => {
          if (data.id === gen.id || data.id === gen.ip || data.id === gen.connectionName) {
            return { ...gen, latitude: data.latitude, longitude: data.longitude, gpsUpdatedAt: data.gpsUpdatedAt };
          }
          return gen;
        })
      );
    });

    socket.on('generator:list_changed', () => {
      console.log('[SOCKET] Generator list changed, reloading from server...');
      fetchGenerators();
    });

    return () => {
      socket?.off('connect', onConnect);
      socket?.off('disconnect', onDisconnect);
      socket?.off('generator:update');
      socket?.off('generator:gps');
      socket?.off('generator:list_changed');
      socket?.disconnect();
      socket = null;
      setIsSocketConnected(false);
    };
  }, [token, fetchGenerators]);

  const addGenerator = useCallback(
    async (gen: Generator) => {
      if (!token) return;
      setGenerators(prev => [...prev, gen]);
      try {
        const res = await fetch('/api/generators', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(gen),
        });
        if (!res.ok) {
          console.error('Failed to save generator on server');
        }
      } catch (error) {
        console.error('Failed to save generator:', error);
      }
    },
    [token]
  );

  const removeGenerator = useCallback(
    async (id: string) => {
      if (!token) return;
      setGenerators(prev => prev.filter(g => g.id !== id));
      try {
        await fetch(`/api/generators/${id}`, {
          method: 'DELETE',
          headers: { Authorization: `Bearer ${token}` },
        });
      } catch (error) {
        console.error('Failed to delete generator:', error);
      }
    },
    [token]
  );

  const updateGenerator = useCallback(
    async (updatedGen: Generator) => {
      if (!token) return;
      setGenerators(prev => prev.map(g => (g.id === updatedGen.id ? updatedGen : g)));
      try {
        await fetch(`/api/generators/${updatedGen.id}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(updatedGen),
        });
      } catch (error) {
        console.error('Failed to update generator:', error);
      }
    },
    [token]
  );

  return (
    <GeneratorContext.Provider
      value={{
        generators,
        isLoading,
        isSocketConnected,
        fetchGenerators,
        addGenerator,
        removeGenerator,
        updateGenerator,
      }}
    >
      {children}
    </GeneratorContext.Provider>
  );
};
