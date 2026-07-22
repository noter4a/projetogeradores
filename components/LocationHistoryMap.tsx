import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Route, Navigation, MapPin, Loader2 } from 'lucide-react';

interface TrailPoint {
  latitude: number;
  longitude: number;
  recordedAt: string;
}

interface Props {
  generatorId: string;
  /** Live current position, appended as the final point so the map always shows "now". */
  currentLat?: number | null;
  currentLon?: number | null;
}

/** Great-circle distance in meters (haversine) — mirrors the backend gate. */
function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

const LocationHistoryMap: React.FC<Props> = ({ generatorId, currentLat, currentLon }) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const [points, setPoints] = useState<TrailPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch the recorded trail
  useEffect(() => {
    let cancelled = false;
    const fetchTrail = async () => {
      setLoading(true);
      setError(null);
      try {
        const token = localStorage.getItem('ciklo_auth_token');
        const res = await fetch(`/api/generators/${generatorId}/location-history`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) throw new Error('Falha ao carregar histórico');
        const data = await res.json();
        if (!cancelled) setPoints(data);
      } catch (err) {
        if (!cancelled) setError('Não foi possível carregar o histórico de localização.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    fetchTrail();
    return () => { cancelled = true; };
  }, [generatorId]);

  // Build the full path: recorded trail + live current position as the final point,
  // deduped when the current fix is within a few meters of the last recorded point.
  const path: [number, number][] = React.useMemo(() => {
    const pts: [number, number][] = points.map(p => [p.latitude, p.longitude]);
    if (currentLat != null && currentLon != null) {
      const last = pts[pts.length - 1];
      if (!last || haversineMeters(last[0], last[1], currentLat, currentLon) > 5) {
        pts.push([currentLat, currentLon]);
      }
    }
    return pts;
  }, [points, currentLat, currentLon]);

  const totalDistance = React.useMemo(() => {
    let d = 0;
    for (let i = 1; i < path.length; i++) {
      d += haversineMeters(path[i - 1][0], path[i - 1][1], path[i][0], path[i][1]);
    }
    return d;
  }, [path]);

  // Render / update the Leaflet map
  useEffect(() => {
    if (loading || error || path.length === 0 || !mapContainerRef.current) return;

    // Init once
    if (!mapRef.current) {
      mapRef.current = L.map(mapContainerRef.current, {
        zoomControl: true,
        attributionControl: true,
      });
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap',
      }).addTo(mapRef.current);
    }

    const map = mapRef.current;

    // Clear previous overlays (polyline/markers) but keep the tile layer
    map.eachLayer(layer => {
      if (!(layer instanceof L.TileLayer)) map.removeLayer(layer);
    });

    if (path.length === 1) {
      const [lat, lon] = path[0];
      map.setView([lat, lon], 15);
      L.circleMarker([lat, lon], {
        radius: 8, color: '#f97316', fillColor: '#f97316', fillOpacity: 0.9, weight: 2,
      }).addTo(map);
    } else {
      const line = L.polyline(path, { color: '#f97316', weight: 4, opacity: 0.85 }).addTo(map);
      // Origin (green)
      L.circleMarker(path[0], {
        radius: 7, color: '#22c55e', fillColor: '#22c55e', fillOpacity: 0.9, weight: 2,
      }).bindTooltip('Início do trajeto').addTo(map);
      // Current / latest (orange)
      L.circleMarker(path[path.length - 1], {
        radius: 8, color: '#f97316', fillColor: '#f97316', fillOpacity: 0.95, weight: 2,
      }).bindTooltip('Posição atual').addTo(map);
      map.fitBounds(line.getBounds(), { padding: [30, 30] });
    }

    // The container may have been hidden (accordion) when the map was created;
    // recompute its size once it's actually visible.
    setTimeout(() => map.invalidateSize(), 100);
  }, [path, loading, error]);

  // Tear down on unmount
  useEffect(() => {
    return () => {
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 text-gray-500 py-10">
        <Loader2 size={20} className="animate-spin" />
        <span className="text-sm">Carregando trajeto...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center gap-3 text-red-400 py-10">
        <MapPin size={20} />
        <span className="text-sm">{error}</span>
      </div>
    );
  }

  if (path.length === 0) {
    return (
      <div className="flex items-center justify-center gap-3 text-gray-500 py-10">
        <MapPin size={20} className="animate-pulse" />
        <span className="text-sm">Buscando sinal de GPS...</span>
      </div>
    );
  }

  const hasMoved = path.length > 1;
  const last = path[path.length - 1];

  return (
    <>
      <div
        ref={mapContainerRef}
        className="rounded-lg overflow-hidden border border-gray-700/50 mb-4 h-[300px] z-0"
      />

      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-4">
          <div>
            <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Posição Atual</p>
            <p className="text-sm font-mono text-white">{last[0].toFixed(5)}, {last[1].toFixed(5)}</p>
          </div>
          {hasMoved && (
            <div>
              <p className="text-[10px] text-gray-500 uppercase tracking-wider font-bold flex items-center gap-1">
                <Route size={11} /> Distância percorrida
              </p>
              <p className="text-sm font-mono text-ciklo-orange">{formatDistance(totalDistance)}</p>
            </div>
          )}
        </div>
        <a
          href={`https://www.google.com/maps?q=${last[0]},${last[1]}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1.5 text-xs font-bold text-ciklo-orange hover:underline"
        >
          <Navigation size={14} /> Abrir no Google Maps
        </a>
      </div>

      {hasMoved ? (
        <p className="text-[10px] text-gray-600 mt-3 flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-green-500" /> Início
          <span className="inline-block w-2 h-2 rounded-full bg-ciklo-orange ml-2" /> Posição atual
          <span className="ml-2">· {path.length} pontos registrados</span>
        </p>
      ) : (
        <p className="text-[10px] text-gray-600 mt-3">
          Nenhum deslocamento registrado ainda — o trajeto aparece após o equipamento se mover mais de 100m.
        </p>
      )}
    </>
  );
};

export default LocationHistoryMap;
