/** One downsampled bucket from /readings. `power` is the bucket average (what the
 *  line plots); powerMax/powerMin are the true extremes inside that bucket. */
export interface PowerPoint {
  time: string;
  power: number;
  /** Potência ativa da rede (mains) no mesmo bucket — null quando o controlador
   *  não reporta separadamente (só AGC-150 hoje). Ausente em buckets antigos. */
  mainsPower: number | null;
  powerMax: number;
  powerMin: number;
  samples: number;
  activeSamples: number;
  bucketSeconds: number;
}

export interface LoadStats {
  peak: number;         // kW — true peak across the window
  peakTime: string;     // label of the bucket containing the peak
  avg: number;          // kW — sample-weighted average
  loadFactor: number | null; // % of nominal, null when nominal is unknown
  energyKwh: number;    // kWh over the window
  runningHours: number; // hours with load > 0
}

/** Stats over the currently-visible buckets. Averages are weighted by each
 *  bucket's sample count so partially-filled buckets don't skew the result. */
export function computeLoadStats(points: PowerPoint[], nominalKva?: number): LoadStats | null {
  if (points.length === 0) return null;

  let peak = -Infinity;
  let peakTime = '';
  let weightedSum = 0;
  let totalSamples = 0;
  let energyKwh = 0;
  let runningSeconds = 0;

  for (const p of points) {
    if (p.powerMax > peak) {
      peak = p.powerMax;
      peakTime = p.time;
    }
    const samples = p.samples > 0 ? p.samples : 1;
    weightedSum += p.power * samples;
    totalSamples += samples;

    // Energy: average power over the bucket's duration.
    energyKwh += (p.power * p.bucketSeconds) / 3600;

    // Running time: proportion of the bucket's samples that had load.
    const activeRatio = p.samples > 0 ? p.activeSamples / p.samples : 0;
    runningSeconds += p.bucketSeconds * activeRatio;
  }

  const avg = totalSamples > 0 ? weightedSum / totalSamples : 0;
  // powerKVA is apparent power; comparing kW to it is an approximation, but it's
  // the only nominal rating stored and is what operators size against.
  const loadFactor = nominalKva && nominalKva > 0 ? (avg / nominalKva) * 100 : null;

  return {
    peak: peak === -Infinity ? 0 : peak,
    peakTime,
    avg,
    loadFactor,
    energyKwh,
    runningHours: runningSeconds / 3600,
  };
}
