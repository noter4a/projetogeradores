import React, { createContext, useContext, useState, useEffect, useCallback, PropsWithChildren } from 'react';
import { Generator } from '../types';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

export const socket = io(); // Exported singleton

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
    const fetchGenerators = async () => {
      try {
        const res = await fetch('/api/generators');
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
  }, []);

  // Socket.IO Real-Time Updates
  useEffect(() => {
    // Uses the exported singleton 'socket'
    socket.on('generator:update', (data: any) => {
      // console.log('Context Received Real-Time Data:', data.id);
      setGenerators(prevGenerators => prevGenerators.map(gen => {
        // Match against ID, IP, or Connection Name
        if (data.id === gen.id || data.id === gen.ip || data.id === gen.connectionName) {
          return {
            ...gen,
            ...data.data, // Merge new data
          };
        }
        return gen;
      }));
    });

    return () => {
      socket.disconnect();
    };
  }, []);

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