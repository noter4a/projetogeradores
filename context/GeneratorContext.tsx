import React, { createContext, useContext, useState, useEffect, useCallback, PropsWithChildren } from 'react';
import { Generator } from '../types';

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
  const [generators, setGenerators] = useState<Generator[]>(() => {
    try {
      const savedGenerators = localStorage.getItem('ciklo_generators');
      if (savedGenerators) {
        const parsed = JSON.parse(savedGenerators);
        if (Array.isArray(parsed)) {
          // Hotfix: Filter out legacy mock data AND reset metrics to zero
          return parsed
            .filter(g => !['GEN-001', 'GEN-002', 'GEN-003'].includes(g.id))
            .map(g => ({
              ...g,
              // Resetting all real-time metrics to 0 so no "ghost" data appears
              rpm: 0,
              avgVoltage: 0,
              voltageL1: 0,
              voltageL2: 0,
              voltageL3: 0,
              totalCurrent: 0,
              currentL1: 0,
              currentL2: 0,
              currentL3: 0,
              frequency: 0,
              activePower: 0,
              powerFactor: 0,
              oilPressure: 0,
              engineTemp: 0,
              fuelLevel: 0,
              batteryVoltage: 0,
              runHours: 0,
              energyTotal: 0,
              status: 'STOPPED' // Assume stopped until told otherwise
            }));
        }
      }
      return [];
    } catch (error) {
      console.error("Failed to load generators from storage", error);
      return [];
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