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
 * Lowercase and strip accents for search comparisons, so typing "jose"
 * matches "José" and "conceicao" matches "Conceição".
 */
export const normalizeSearch = (value: string): string =>
  value.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();

/**
 * Format an ISO date string to pt-BR locale (dd/mm/yyyy).
 */
export const formatDate = (dateStr?: string): string => {
  if (!dateStr) return '-';
  return new Date(dateStr).toLocaleDateString('pt-BR');
};

/**
 * Brazilian states (UF) — 2-letter codes for select inputs.
 */
export const UF_LIST = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA',
  'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN',
  'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

/**
 * Mask a CPF (000.000.000-00) or CNPJ (00.000.000/0000-00) as the user types.
 * Auto-detects by digit count.
 */
export const maskCpfCnpj = (value: string): string => {
  const digits = (value || '').replace(/\D/g, '').slice(0, 14);
  if (digits.length <= 11) {
    return digits
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }
  return digits
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
};

/**
 * Mask a Brazilian phone number as the user types.
 * Supports landline (00) 0000-0000 and mobile (00) 00000-0000.
 */
export const maskPhone = (value: string): string => {
  const digits = (value || '').replace(/\D/g, '').slice(0, 11);
  if (digits.length === 0) return '';
  if (digits.length <= 2) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
};

/**
 * Mask a Brazilian CEP (00000-000) as the user types.
 */
export const maskCep = (value: string): string => {
  const digits = (value || '').replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
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
