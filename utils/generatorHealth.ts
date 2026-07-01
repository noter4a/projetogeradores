import { Generator, GeneratorStatus } from '../types';

export function computeHealthScore(gen: Generator): number {
  if (gen.status === GeneratorStatus.OFFLINE) return 0;

  let score = 100;

  if (gen.status === GeneratorStatus.ALARM || (gen.alarmCode && gen.alarmCode > 0)) {
    score -= 35;
  }

  const fuel = gen.fuelLevel;
  if (fuel != null && fuel !== 65535) {
    if (fuel < 10) score -= 25;
    else if (fuel < 20) score -= 12;
  }

  if (gen.status === GeneratorStatus.RUNNING) {
    if (gen.engineTemp > 98) score -= 15;
    else if (gen.engineTemp > 90) score -= 8;
    if (gen.oilPressure > 0 && gen.oilPressure < 1.5) score -= 18;
  }

  const stale = !gen.lastDataReceived || Date.now() - gen.lastDataReceived > 60_000;
  if (stale) score -= 30;

  if (gen.status === GeneratorStatus.STOPPED && !stale) {
    score = Math.min(score, 88);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function healthColor(score: number): string {
  if (score >= 80) return 'text-green-400';
  if (score >= 60) return 'text-amber-400';
  if (score >= 30) return 'text-orange-400';
  return 'text-red-400';
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
