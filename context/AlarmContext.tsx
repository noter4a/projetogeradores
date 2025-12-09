
import React, { createContext, useContext, useState, useEffect, PropsWithChildren } from 'react';
import { Alarm } from '../types';
import { MOCK_ALARMS } from '../constants';

interface AlarmContextType {
  alarms: Alarm[];
  addAlarm: (alarm: Alarm) => void;
  ackAlarm: (id: string) => void;
  activeCriticalAlarms: Alarm[];
  clearAll: () => void;
}

const AlarmContext = createContext<AlarmContextType | undefined>(undefined);

export const useAlarms = () => {
  const context = useContext(AlarmContext);
  if (!context) {
    throw new Error('useAlarms must be used within an AlarmProvider');
  }
  return context;
};

export const AlarmProvider = ({ children }: PropsWithChildren<{}>) => {
  const [alarms, setAlarms] = useState<Alarm[]>(MOCK_ALARMS);

  const addAlarm = (alarm: Alarm) => {
    setAlarms(prev => [alarm, ...prev]);
  };

  const ackAlarm = (id: string) => {
    // Deactivate the alarm (acknowledge it)
    setAlarms(prev => prev.map(a => a.id === id ? { ...a, active: false } : a));
  };

  const clearAll = () => {
    setAlarms([]);
  }

  const activeCriticalAlarms = alarms.filter(a => a.active && a.severity === 'CRITICAL');

  return (
    <AlarmContext.Provider value={{ alarms, addAlarm, ackAlarm, activeCriticalAlarms, clearAll }}>
      {children}
    </AlarmContext.Provider>
  );
};
