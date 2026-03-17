import React, { createContext, useContext, useState, useEffect, useCallback, useRef, PropsWithChildren } from 'react';
import { Generator } from '../types';
import { io, Socket } from 'socket.io-client';
import { useAuth } from './AuthContext';

// Socket will be created inside the provider with auth token
let socket: Socket | null = null;

export const getSocket = () => socket;

interface GeneratorContextType {
  generators: Generator[];
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

  // Initialize state from localStorage if available
  // Force-Reset to a single clean state (Removes all past localStorage ghosts)
  const [generators, setGenerators] = useState<Generator[]>([]);

  // Load generators from Backend API
  useEffect(() => {
    if (!token) return;
    const fetchGenerators = async () => {
      try {
        const res = await fetch('/api/generators', {
          headers: { 'Authorization': `Bearer ${token}` }
        });
        if (res.ok) {
          const data = await res.json();
          setGenerators(data);
        } else {
          console.error("Failed to fetch generators");
        }
      } catch (error) {
        console.error("Error connecting to API:", error);
      }
    };
    fetchGenerators();
  }, [token]);

  // Socket.IO Real-Time Updates (with auth)
  useEffect(() => {
    if (!token) return;

    // Create socket with auth token
    socket = io({
      auth: { token }
    });

    socket.on('generator:update', (data: any) => {
      setGenerators(prevGenerators => prevGenerators.map(gen => {
        if (data.id === gen.id || data.id === gen.ip || data.id === gen.connectionName) {
          return {
            ...gen,
            ...data.data,
          };
        }
        return gen;
      }));
    });

    return () => {
      socket?.disconnect();
      socket = null;
    };
  }, [token]);

  const addGenerator = useCallback(async (gen: Generator) => {
    if (!token) return;
    // Optimistic Update
    setGenerators(prev => [...prev, gen]);
    try {
      const res = await fetch('/api/generators', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(gen)
      });
      if (!res.ok) {
        console.error("Failed to save generator on server");
      }
    } catch (error) {
      console.error("Failed to save generator:", error);
      // Rollback? simplified for now
    }
  }, [token]);

  const removeGenerator = useCallback(async (id: string) => {
    if (!token) return;
    // Optimistic Update
    setGenerators(prev => prev.filter(g => g.id !== id));
    try {
      await fetch(`/api/generators/${id}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });
    } catch (error) {
      console.error("Failed to delete generator:", error);
    }
  }, [token]);

  const updateGenerator = useCallback(async (updatedGen: Generator) => {
    if (!token) return;
    // Optimistic Update
    setGenerators(prev => prev.map(g => g.id === updatedGen.id ? updatedGen : g));
    try {
      await fetch(`/api/generators/${updatedGen.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updatedGen)
      });
    } catch (error) {
      console.error("Failed to update generator:", error);
    }
  }, [token]);

  return (
    <GeneratorContext.Provider value={{ generators, addGenerator, removeGenerator, updateGenerator }}>
      {children}
    </GeneratorContext.Provider>
  );
};