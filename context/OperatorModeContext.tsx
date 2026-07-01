import React, { createContext, useContext, useState, useEffect, PropsWithChildren } from 'react';

const STORAGE_KEY = 'ciklo_operator_mode';

interface OperatorModeContextType {
  operatorMode: boolean;
  setOperatorMode: (value: boolean) => void;
  toggleOperatorMode: () => void;
}

const OperatorModeContext = createContext<OperatorModeContextType | undefined>(undefined);

export const OperatorModeProvider = ({ children }: PropsWithChildren) => {
  const [operatorMode, setOperatorMode] = useState(
    () => localStorage.getItem(STORAGE_KEY) === 'true'
  );

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, String(operatorMode));
  }, [operatorMode]);

  return (
    <OperatorModeContext.Provider
      value={{
        operatorMode,
        setOperatorMode,
        toggleOperatorMode: () => setOperatorMode((v) => !v),
      }}
    >
      {children}
    </OperatorModeContext.Provider>
  );
};

export const useOperatorMode = () => {
  const ctx = useContext(OperatorModeContext);
  if (!ctx) throw new Error('useOperatorMode must be used within OperatorModeProvider');
  return ctx;
};
