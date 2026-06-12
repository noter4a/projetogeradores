/**
 * Shared formatting utilities for the Ciklo Geradores application.
 */

/**
 * Format a numeric value as currency (BRL or USD).
 */
export const formatCurrency = (val: number | string | null | undefined, moeda?: string): string => {
  if (!val && val !== 0) return moeda === 'USD' ? 'US$ 0,00' : 'R$ 0,00';
  const isUSD = moeda === 'USD';
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: isUSD ? 'USD' : 'BRL',
  }).format(Number(val));
};

/**
 * Format an ISO date string to pt-BR locale (dd/mm/yyyy).
 */
export const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('pt-BR');
};

/**
 * Format alarm duration from start_time and end_time.
 */
export const formatDuration = (startTime: string, endTime: string | null): string | null => {
  if (!endTime) return null;
  const ms = new Date(endTime).getTime() - new Date(startTime).getTime();
  const secs = Math.floor(ms / 1000);
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ${secs % 60}s`;
  return `${Math.floor(mins / 60)}h ${mins % 60}m`;
};
