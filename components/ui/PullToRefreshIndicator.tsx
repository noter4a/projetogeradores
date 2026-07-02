import React from 'react';
import { RefreshCw } from 'lucide-react';

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  refreshing: boolean;
  statusText: string;
}

const PullToRefreshIndicator: React.FC<PullToRefreshIndicatorProps> = ({
  pullDistance,
  refreshing,
  statusText,
}) => {
  if (pullDistance <= 0 && !refreshing && !statusText) return null;

  const progress = Math.min(pullDistance / 72, 1);

  return (
    <div
      className="flex flex-col items-center justify-center overflow-hidden transition-all duration-200 md:hidden"
      style={{ height: refreshing ? 56 : pullDistance, minHeight: refreshing ? 56 : 0 }}
    >
      <RefreshCw
        size={22}
        className={`text-ciklo-orange mb-1 ${refreshing ? 'animate-spin' : ''}`}
        style={{
          transform: refreshing ? undefined : `rotate(${progress * 360}deg)`,
          opacity: Math.max(0.35, progress),
        }}
      />
      <p className="text-[10px] font-mono uppercase tracking-wider text-gray-500">
        {statusText || 'Puxe para atualizar'}
      </p>
    </div>
  );
};

export default PullToRefreshIndicator;
