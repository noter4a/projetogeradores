
import { Generator, GeneratorStatus, MaintenanceLog, User, UserRole, Alarm } from './types';

export const MOCK_USERS: User[] = [
  { id: '1', name: 'Administrador Ciklo', role: UserRole.ADMIN, email: 'admin@ciklo.com', password: '123456', assignedGeneratorIds: [] },
  { id: '2', name: 'Técnico Operacional', role: UserRole.TECHNICIAN, email: 'tech@ciklo.com', password: '123456', assignedGeneratorIds: ['GEN-001', 'GEN-003'] },
  { id: '3', name: 'Cliente Final', role: UserRole.CLIENT, email: 'client@company.com', password: '123456', assignedGeneratorIds: ['GEN-002'], credits: 50 },
  { id: '4', name: 'Cliente Sem Saldo', role: UserRole.CLIENT, email: 'zerado@company.com', password: '123456', assignedGeneratorIds: ['GEN-002'], credits: 0 },
  { id: '5', name: 'Visitante Monitor', role: UserRole.MONITOR, email: 'monitor@ciklo.com', password: '123456', assignedGeneratorIds: ['GEN-001', 'GEN-002'] },
];

export const MOCK_GENERATORS: Generator[] = [];


export const MOCK_LOGS: MaintenanceLog[] = [
  { id: 'LOG-1', generatorId: 'GEN-001', date: '2023-10-15', technician: 'Carlos Silva', type: 'PREVENTIVE', description: 'Troca de óleo e filtros', completed: true },
  { id: 'LOG-2', generatorId: 'GEN-003', date: '2024-02-01', technician: 'João Souza', type: 'CORRECTIVE', description: 'Ajuste de correia do alternador', completed: false },
];

export const MOCK_ALARMS: Alarm[] = [
  { id: 'ALM-1', generatorId: 'GEN-003', message: 'Baixo Nível de Combustível', severity: 'WARNING', timestamp: '2024-05-20 14:30:00', active: true },
  { id: 'ALM-2', generatorId: 'GEN-003', message: 'Alta Temperatura do Motor', severity: 'CRITICAL', timestamp: '2024-05-20 15:00:00', active: true },
];
