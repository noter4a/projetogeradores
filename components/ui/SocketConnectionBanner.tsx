import React, { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import { useGenerators } from '../../context/GeneratorContext';
import { useIsMobile } from '../../hooks/useIsMobile';

const RECONNECT_BANNER_DELAY_MS = 3000;

const SocketConnectionBanner: React.FC = () => {
  const { isSocketConnected } = useGenerators();
  const isMobile = useIsMobile();
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    if (isSocketConnected) {
      setShowBanner(false);
      return;
    }
    const timer = setTimeout(() => setShowBanner(true), RECONNECT_BANNER_DELAY_MS);
    return () => clearTimeout(timer);
  }, [isSocketConnected]);

  if (!showBanner) return null;

  return (
    <div
      className={`fixed left-0 right-0 z-[45] flex items-center justify-center gap-2 px-4 py-2 bg-amber-950/95 border-b border-amber-600/40 text-amber-100 text-xs font-medium backdrop-blur-sm ${
        isMobile ? 'top-14' : 'top-0'
      }`}
      role="status"
    >
      <WifiOff size={14} className="shrink-0 animate-pulse" />
      <span>Reconectando… os dados podem estar desatualizados</span>
    </div>
  );
};

export default SocketConnectionBanner;
