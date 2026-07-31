import React from 'react';

interface CircularGaugeProps {
  value: number | null | undefined;
  max: number;
  label: string;
  unit: string;
  color?: string;
  size?: number;
}

const CircularGauge: React.FC<CircularGaugeProps> = ({ value, max, label, unit, color = "text-ciklo-yellow", size = 120 }) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;

  // Safe check for null, undefined, or KVA not-present values (65535 and its scaled variants)
  const isInvalid = value === null || value === undefined || value === 65535 || value === 655.35 || value === 6553.5 || value < 0;
  const numericValue = isInvalid ? 0 : Number(value);
  const strokeDashoffset = circumference - (Math.min(numericValue, max) / max) * circumference;

  return (
    <div className="relative flex flex-col items-center justify-center p-4 bg-ciklo-dark rounded-xl border border-gray-700/50">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90 w-full h-full">
          <circle
            className="text-gray-700"
            strokeWidth="8"
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx="50%"
            cy="50%"
          />
          <circle
            className={`${color} transition-all duration-1000 ease-out`}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={isInvalid ? circumference : strokeDashoffset}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx="50%"
            cy="50%"
          />
        </svg>
        <div className="absolute top-0 left-0 w-full h-full flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white">{isInvalid ? '-' : numericValue.toFixed(unit === 'rpm' ? 0 : 1)}</span>
          <span className="text-xs text-gray-400">{unit}</span>
        </div>
      </div>
      <span className="text-sm font-semibold text-gray-400 mt-2">{label}</span>
    </div>
  );
};

export default CircularGauge;
