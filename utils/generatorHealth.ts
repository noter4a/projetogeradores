import { GeneratorStatus } from '../types';

export const CONNECTION_THRESHOLD_MS = 120_000; // 2× DR164 poll interval (30s) + full cycle margin

export function isGeneratorConnected(lastDataReceived?: number): boolean {
  return !!lastDataReceived && Date.now() - lastDataReceived < CONNECTION_THRESHOLD_MS;
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
