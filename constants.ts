
import { Generator, GeneratorStatus, MaintenanceLog, User, UserRole, Alarm } from './types';

export const MOCK_USERS: User[] = [
  { id: '1', name: 'Administrador Ciklo', role: UserRole.ADMIN, email: 'admin@ciklo.com', password: '', assignedGeneratorIds: [] },
  { id: '2', name: 'Técnico Operacional', role: UserRole.TECHNICIAN, email: 'tech@ciklo.com', password: '', assignedGeneratorIds: [] },
  { id: '3', name: 'Cliente Final', role: UserRole.CLIENT, email: 'client@company.com', password: '', assignedGeneratorIds: [] },
  { id: '4', name: 'Cliente Teste', role: UserRole.CLIENT, email: 'teste@company.com', password: '', assignedGeneratorIds: [] },
  { id: '5', name: 'Visitante Monitor', role: UserRole.MONITOR, email: 'monitor@ciklo.com', password: '', assignedGeneratorIds: [] },
];

export const MOCK_GENERATORS: Generator[] = [];


export const MOCK_LOGS: MaintenanceLog[] = [
  { id: 'LOG-1', generatorId: 'GEN-001', date: '2023-10-15', technician: 'Carlos Silva', type: 'PREVENTIVE', description: 'Troca de óleo e filtros', completed: true },
  { id: 'LOG-2', generatorId: 'GEN-003', date: '2024-02-01', technician: 'João Souza', type: 'CORRECTIVE', description: 'Ajuste de correia do alternador', completed: false },
];

export const MOCK_ALARMS: Alarm[] = [];
