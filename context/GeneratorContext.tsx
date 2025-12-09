import React, { createContext, useContext, useState, useEffect, useCallback, PropsWithChildren } from 'react';
import { Generator } from '../types';
import { MOCK_GENERATORS } from '../constants';

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
  // Initialize state from localStorage if available, otherwise use MOCK_GENERATORS
  const [generators, setGenerators] = useState<Generator[]>(() => {
    try {
      const savedGenerators = localStorage.getItem('ciklo_generators');
      if (savedGenerators) {
          const parsed = JSON.parse(savedGenerators);
          if (Array.isArray(parsed)) return parsed;
      }
      return MOCK_GENERATORS;
    } catch (error) {
      console.error("Failed to load generators from storage", error);
      return MOCK_GENERATORS;
    }
  });

  // Save to localStorage whenever generators state changes
  useEffect(() => {
    try {
      localStorage.setItem('ciklo_generators', JSON.stringify(generators));
    } catch (error) {
      console.error("Failed to save generators to storage", error);
    }
  }, [generators]);

  const addGenerator = useCallback((gen: Generator) => {
    setGenerators(prev => [...prev, gen]);
  }, []);

  const removeGenerator = useCallback((id: string) => {
    console.log('Removing generator with ID:', id);
    setGenerators(prev => prev.filter(g => g.id !== id));
  }, []);

  const updateGenerator = useCallback((updatedGen: Generator) => {
    setGenerators(prev => prev.map(g => g.id === updatedGen.id ? updatedGen : g));
  }, []);

  return (
    <GeneratorContext.Provider value={{ generators, addGenerator, removeGenerator, updateGenerator }}>
      {children}
    </GeneratorContext.Provider>
  );
};