
import { MaintenanceLog } from './types';

export const MOCK_LOGS: MaintenanceLog[] = [
  { id: 'LOG-1', generatorId: 'GEN-001', date: '2023-10-15', technician: 'Carlos Silva', type: 'PREVENTIVE', description: 'Troca de óleo e filtros', completed: true },
  { id: 'LOG-2', generatorId: 'GEN-003', date: '2024-02-01', technician: 'João Souza', type: 'CORRECTIVE', description: 'Ajuste de correia do alternador', completed: false },
];
