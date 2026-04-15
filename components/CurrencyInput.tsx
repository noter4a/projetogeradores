import React, { useState, useEffect } from 'react';

interface CurrencyInputProps {
  value: number | undefined | null;
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
}

const formatBRL = (num: number): string =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(num);

const parseBRL = (str: string): number => {
  // Remove tudo exceto dígitos e vírgula
  const clean = str.replace(/[^\d,]/g, '').replace(',', '.');
  return parseFloat(clean) || 0;
};

const CurrencyInput: React.FC<CurrencyInputProps> = ({ value, onChange, className, placeholder }) => {
  const [displayValue, setDisplayValue] = useState('');
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setDisplayValue(value ? formatBRL(Number(value)) : '');
    }
  }, [value, focused]);

  const handleFocus = () => {
    setFocused(true);
    // Mostrar apenas o número ao editar
    setDisplayValue(value ? String(Number(value)).replace('.', ',') : '');
  };

  const handleBlur = () => {
    setFocused(false);
    const parsed = parseBRL(displayValue);
    onChange(parsed);
    setDisplayValue(parsed ? formatBRL(parsed) : '');
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    // Permite apenas números e vírgula enquanto digita
    const raw = e.target.value.replace(/[^\d,]/g, '');
    setDisplayValue(raw);
  };

  return (
    <input
      type="text"
      inputMode="decimal"
      value={displayValue}
      placeholder={placeholder || 'R$ 0,00'}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
      className={className}
    />
  );
};

export default CurrencyInput;
