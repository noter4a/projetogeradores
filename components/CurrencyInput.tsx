import React, { useState, useEffect, useRef } from 'react';

interface CurrencyInputProps {
  value: number | undefined | null;
  onChange: (value: number) => void;
  className?: string;
  placeholder?: string;
}

const formatBRL = (cents: number): string => {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
  }).format(cents / 100);
};

const CurrencyInput: React.FC<CurrencyInputProps> = ({ value, onChange, className, placeholder }) => {
  // Work in cents internally to avoid floating point issues
  const [cents, setCents] = useState<number>(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // Sync from external prop
  useEffect(() => {
    const inCents = Math.round((Number(value) || 0) * 100);
    setCents(inCents);
  }, [value]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.preventDefault();

    if (e.key >= '0' && e.key <= '9') {
      const digit = parseInt(e.key, 10);
      const newCents = cents * 10 + digit;
      setCents(newCents);
      onChange(newCents / 100);
    } else if (e.key === 'Backspace') {
      const newCents = Math.floor(cents / 10);
      setCents(newCents);
      onChange(newCents / 100);
    } else if (e.key === 'Delete') {
      setCents(0);
      onChange(0);
    }
    // Ignore all other keys
  };

  return (
    <input
      ref={inputRef}
      type="text"
      inputMode="numeric"
      value={formatBRL(cents)}
      placeholder={placeholder || 'R$ 0,00'}
      onKeyDown={handleKeyDown}
      onChange={() => {}} // controlled via keydown
      className={className}
      style={{ caretColor: 'transparent' }}
    />
  );
};

export default CurrencyInput;
