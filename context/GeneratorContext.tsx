import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, PropsWithChildren } from 'react';
import { Generator } from '../types';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';
import { withOfflineZeroing } from '../utils/generatorHealth';

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
  // "Estou logado?" agora se checa por `user` (restaurado do cookie httpOnly
  // no bootstrap do AuthContext), não por `token` — token só existe em
  // memória durante a aba atual, fica null de novo a cada F5, mesmo com a
  // sessão real ainda válida. Cookie autentica os fetches sozinho, sem
  // header manual.
  const { user } = useAuth();
  const [generators, setGenerators] = useState<Generator[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSocketConnected, setIsSocketConnected] = useState(true);
  // Ticks periodically so a generator flips to "offline" (and its live values
  // zero out) even when no new data arrives to trigger a re-render.
  const [connTick, setConnTick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setConnTick(v => v + 1), 20_000);
    return () => clearInterval(t);
  }, []);

  const fetchGenerators = useCallback(async () => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    try {
      const res = await fetch('/api/generators');
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
  }, [user]);

  useEffect(() => {
    fetchGenerators();
  }, [fetchGenerators]);

  useEffect(() => {
    if (!user) return;

    // Cookie httpOnly vai junto automaticamente no handshake (mesma origem) —
    // servidor lê e valida em io.use (server/src/index.js). Sem auth.token
    // manual, então nada de token pra vazar por aqui.
    socket = io({
      withCredentials: true,
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
            return { ...gen, gpsHasFix: data.gpsHasFix, latitude: data.latitude, longitude: data.longitude, gpsUpdatedAt: data.gpsUpdatedAt };
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
  }, [user, fetchGenerators]);

  const addGenerator = useCallback(
    async (gen: Generator) => {
      if (!user) return;
      setGenerators(prev => [...prev, gen]);
      try {
        const res = await fetch('/api/generators', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(gen),
        });
        if (!res.ok) {
          console.error('Failed to save generator on server');
        }
      } catch (error) {
        console.error('Failed to save generator:', error);
      }
    },
    [user]
  );

  const removeGenerator = useCallback(
    async (id: string) => {
      if (!user) return;
      setGenerators(prev => prev.filter(g => g.id !== id));
      try {
        await fetch(`/api/generators/${id}`, { method: 'DELETE' });
      } catch (error) {
        console.error('Failed to delete generator:', error);
      }
    },
    [user]
  );

  const updateGenerator = useCallback(
    async (updatedGen: Generator) => {
      if (!user) return;
      setGenerators(prev => prev.map(g => (g.id === updatedGen.id ? updatedGen : g)));
      try {
        await fetch(`/api/generators/${updatedGen.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedGen),
        });
      } catch (error) {
        console.error('Failed to update generator:', error);
      }
    },
    [user]
  );

  // Present disconnected units with zeroed instantaneous values (non-destructive;
  // raw `generators` state and the backend keep the last reading). Recomputed on
  // the connTick so the transition happens on a timer, not only on new data.
  const displayGenerators = useMemo(
    () => generators.map(withOfflineZeroing),
    [generators, connTick]
  );

  return (
    <GeneratorContext.Provider
      value={{
        generators: displayGenerators,
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
