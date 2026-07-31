import React from 'react';
import { formatVoltage, formatCurrent } from '../../utils/formatters';

interface PhaseRow {
  label: string;
  voltage: number | null | undefined;
  current: number | null | undefined;
}

interface PhaseTableProps {
  /** Text color class for the voltage column (constant across PN/PP for a given source). */
  voltageColor: string;
  /** Text color class for the current column in phase-neutral view. */
  currentColorPN: string;
  /** Text color class for the current column in phase-phase view. */
  currentColorPP: string;
  viewMode: 'PN' | 'PP';
  pnRows: [PhaseRow, PhaseRow, PhaseRow];
  ppRows: [PhaseRow, PhaseRow, PhaseRow];
}

const PhaseTable: React.FC<PhaseTableProps> = ({ voltageColor, currentColorPN, currentColorPP, viewMode, pnRows, ppRows }) => {
  const rows = viewMode === 'PN' ? pnRows : ppRows;
  const currentColor = viewMode === 'PN' ? currentColorPN : currentColorPP;

  return (
    <table className="w-full text-left">
      <thead className="text-[10px] text-gray-500 uppercase">
        <tr>
          <th className="pb-2">Fase</th>
          <th className="pb-2 text-right">Tensão</th>
          <th className="pb-2 text-right">Corrente</th>
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-800 text-sm">
        {rows.map(row => (
          <tr key={row.label}>
            <td className="py-2 text-gray-300 font-bold">{row.label}</td>
            <td className={`py-2 text-right ${voltageColor}`}>{formatVoltage(row.voltage)}</td>
            <td className={`py-2 text-right ${currentColor}`}>{formatCurrent(row.current)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};

export default PhaseTable;
