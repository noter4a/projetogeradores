import React, { createContext, useContext, useState, useEffect, useCallback, PropsWithChildren } from 'react';
import { Generator } from '../types';
import { io } from 'socket.io-client';

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
    // Optimistic Update
    setGenerators(prev => [...prev, gen]);
    try {
      await fetch('/api/generators', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(gen)
      });
    } catch (error) {
      console.error("Failed to save generator:", error);
      // Rollback? simplified for now
    }
  }, []);

  const removeGenerator = useCallback(async (id: string) => {
    // Optimistic Update
    setGenerators(prev => prev.filter(g => g.id !== id));
    try {
      await fetch(`/api/generators/${id}`, { method: 'DELETE' });
    } catch (error) {
      console.error("Failed to delete generator:", error);
    }
  }, []);

  const updateGenerator = useCallback(async (updatedGen: Generator) => {
    // Optimistic Update
    setGenerators(prev => prev.map(g => g.id === updatedGen.id ? updatedGen : g));
    try {
      await fetch(`/api/generators/${updatedGen.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedGen)
      });
    } catch (error) {
      console.error("Failed to update generator:", error);
    }
  }, []);

  return (
    <GeneratorContext.Provider value={{ generators, addGenerator, removeGenerator, updateGenerator }}>
      {children}
    </GeneratorContext.Provider>
  );
};