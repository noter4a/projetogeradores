import React from 'react';

const GeneratorCardSkeleton: React.FC = () => (
  <div className="bg-ciklo-card rounded-xl border border-gray-800 overflow-hidden animate-pulse">
    <div className="p-6 space-y-6">
      <div className="flex justify-between gap-4">
        <div className="flex-1 space-y-2">
          <div className="h-6 bg-gray-800 rounded w-2/5" />
          <div className="h-4 bg-gray-800/70 rounded w-3/5" />
        </div>
        <div className="flex gap-2">
          <div className="h-7 w-20 bg-gray-800 rounded-full" />
          <div className="h-7 w-24 bg-gray-800 rounded-full" />
        </div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="bg-ciklo-dark p-3 rounded-lg border border-gray-700/50 space-y-2">
            <div className="h-3 bg-gray-800 rounded w-1/2" />
            <div className="h-6 bg-gray-800 rounded w-2/3" />
          </div>
        ))}
      </div>
      <div className="flex justify-between pt-4 border-t border-gray-800">
        <div className="h-4 bg-gray-800 rounded w-1/3" />
        <div className="h-4 bg-gray-800 rounded w-1/4" />
      </div>
    </div>
  </div>
);

export default GeneratorCardSkeleton;
