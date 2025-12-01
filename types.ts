
export enum UserRole {
  ADMIN = 'ADMIN',
  TECHNICIAN = 'TECHNICIAN',
  CLIENT = 'CLIENT',
}

export interface User {
  id: string;
  name: string;
  role: UserRole;
  email: string;
  password?: string;
  assignedGeneratorIds?: string[];
}

export enum GeneratorStatus {
  RUNNING = 'RUNNING',
  STOPPED = 'STOPPED',
  ALARM = 'ALARM',
  OFFLINE = 'OFFLINE',
}

export interface Generator {
  id: string;
  name: string;
  location: string;
  model: string;
  powerKVA: number;
  status: GeneratorStatus;
  fuelLevel: number;
  engineTemp: number; // Celsius
  oilPressure: number; // Bar
  batteryVoltage: number; // Volts
  rpm: number;
  totalHours: number;
  lastMaintenance: string;
  image?: string;
  voltageL1: number;
  voltageL2: number;
  voltageL3: number;
  currentL1: number;
  currentL2: number;
  currentL3: number;
  frequency: number;
  powerFactor: number;
  activePower: number; // kW
  
  // Connectivity Fields
  connectionName?: string;
  controller?: string;
  protocol?: string;
  ip?: string;
  port?: string;
  slaveId?: string;
}

export interface MaintenanceLog {
  id: string;
  generatorId: string;
  date: string;
  technician: string;
  type: 'PREVENTIVE' | 'CORRECTIVE';
  description: string;
  completed: boolean;
}

export interface Alarm {
  id: string;
  generatorId: string;
  message: string;
  severity: 'WARNING' | 'CRITICAL';
  timestamp: string;
  active: boolean;
}
