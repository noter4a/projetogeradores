import { GeneratorStatus, Generator } from '../types';

export const CONNECTION_THRESHOLD_MS = 120_000; // 2× DR164 poll interval (30s) + full cycle margin

export function isGeneratorConnected(lastDataReceived?: number): boolean {
  return !!lastDataReceived && Date.now() - lastDataReceived < CONNECTION_THRESHOLD_MS;
}

// Instantaneous telemetry that must read 0 when the unit isn't reporting — a
// disconnected generator has no live voltage/current/power/etc. Cumulative
// counters (totalHours, energies), GPS, breaker state, status and identity are
// intentionally left as their last known value (they aren't instantaneous
// readings, and e.g. run hours don't reset just because comms dropped).
const OFFLINE_ZERO_FIELDS: (keyof Generator)[] = [
  'voltageL1', 'voltageL2', 'voltageL3', 'voltageL12', 'voltageL23', 'voltageL31',
  'currentL1', 'currentL2', 'currentL3', 'avgCurrent',
  'frequency', 'powerFactor', 'activePower', 'apparentPower', 'reactivePower',
  'loadPercent', 'loadPercentL1', 'loadPercentL2', 'loadPercentL3',
  'rpm', 'oilPressure', 'engineTemp', 'fuelLevel', 'batteryVoltage',
  'mainsVoltageL1', 'mainsVoltageL2', 'mainsVoltageL3',
  'mainsVoltageL12', 'mainsVoltageL23', 'mainsVoltageL31',
  'mainsFrequency', 'mainsCurrentL1', 'mainsCurrentL2', 'mainsCurrentL3',
];

/**
 * Display transform: when a generator is disconnected, present its instantaneous
 * values as 0 instead of the last frozen reading. Non-destructive — this only
 * shapes what the UI shows; the backend/DB keep the last value, so the moment
 * data resumes the real numbers reappear. Returns the same object untouched when
 * connected, so React refs stay stable and connected units aren't re-created.
 */
export function withOfflineZeroing(gen: Generator): Generator {
  if (isGeneratorConnected(gen.lastDataReceived)) return gen;
  const out: Generator = { ...gen };
  for (const f of OFFLINE_ZERO_FIELDS) {
    if (typeof out[f] === 'number') (out[f] as number) = 0;
  }
  return out;
}

export function cardStatusGlow(status: GeneratorStatus): string {
  switch (status) {
    case GeneratorStatus.RUNNING:
      return 'border-green-500/35 shadow-lg shadow-green-500/10 ring-1 ring-green-500/15';
    case GeneratorStatus.ALARM:
      return 'border-red-500/45 shadow-lg shadow-red-500/15 ring-1 ring-red-500/25';
    case GeneratorStatus.OFFLINE:
      return 'border-gray-700/80 border-dashed opacity-80';
    default:
      return 'border-gray-700';
  }
}

export function formatLastUpdate(lastDataReceived?: number): string {
  if (!lastDataReceived) return 'Sem dados';
  const sec = Math.floor((Date.now() - lastDataReceived) / 1000);
  if (sec < 5) return 'agora';
  if (sec < 60) return `há ${sec}s`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h}h`;
}
