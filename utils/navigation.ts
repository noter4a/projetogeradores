import { UserRole } from '../types';

export function getPostLoginPath(role: UserRole): string {
  if (role === UserRole.ORCAMENTOS) return '/sales/clients';
  return '/dashboard';
}
