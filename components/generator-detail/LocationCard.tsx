import React from 'react';
import { MapPin } from 'lucide-react';
import { Generator } from '../../types';
import LocationHistoryMap from '../LocationHistoryMap';

interface LocationCardProps {
  gen: Generator;
}

const LocationCard: React.FC<LocationCardProps> = ({ gen }) => {
  if (!gen.gpsUpdatedAt) return null;

  return (
    <div className="bg-ciklo-card rounded-xl border border-gray-800 p-6">
      <h3 className="text-white font-bold mb-4 flex items-center gap-2">
        <MapPin size={18} className="text-ciklo-orange" /> Localização
      </h3>

      <LocationHistoryMap
        generatorId={gen.id}
        currentLat={gen.gpsHasFix ? gen.latitude : null}
        currentLon={gen.gpsHasFix ? gen.longitude : null}
      />

      <p className="text-[10px] text-gray-600 mt-3">
        Atualizado: {new Date(gen.gpsUpdatedAt).toLocaleString('pt-BR')}
      </p>
    </div>
  );
};

export default LocationCard;
