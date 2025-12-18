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
  // Force-Reset to a single clean state (Removes all past localStorage ghosts)
  const [generators, setGenerators] = useState<Generator[]>([
    {
      id: 'GEN-REAL-01',
      name: 'Gerador Conectado (Real)',
      location: 'Monitoramento Remoto',
      model: 'Ciklo Power',
      powerKVA: 500,
      status: 'OFFLINE', // Will turn RUNNING when socket receives data
      fuelLevel: 0,
      engineTemp: 0,
      oilPressure: 0,
      batteryVoltage: 0,
      rpm: 0,
      totalHours: 0,
      lastMaintenance: new Date().toISOString().split('T')[0],
      voltageL1: 0,
      voltageL2: 0,
      voltageL3: 0,
      currentL1: 0,
      currentL2: 0,
      currentL3: 0,
      frequency: 0,
      powerFactor: 0,
      activePower: 0,
      connectionName: 'Modbus TCP',
      controller: 'dse',
      protocol: 'modbus_tcp',
      ip: 'Ciklo0', // Matches the MQTT ID usually
      port: '502',
      slaveId: '1'
    }
  ]);

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