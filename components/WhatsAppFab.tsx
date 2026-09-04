import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';

const WHATSAPP_URL = 'https://wa.me/555432931095';

const WhatsAppIcon: React.FC<{ size?: number; className?: string }> = ({ size = 24, className }) => (
  <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
    <path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946.003-6.556 5.338-11.891 11.893-11.891 3.181.001 6.167 1.24 8.413 3.488 2.245 2.248 3.481 5.236 3.48 8.414-.003 6.557-5.338 11.892-11.893 11.892-1.99-.001-3.951-.5-5.688-1.448l-6.305 1.654zm6.597-3.807c1.676.995 3.276 1.591 5.392 1.592 5.448 0 9.886-4.434 9.889-9.885.002-5.462-4.415-9.89-9.881-9.892-5.452 0-9.887 4.434-9.889 9.884-.001 2.225.651 3.891 1.746 5.634l-.999 3.648 3.742-.981zm11.387-5.464c-.074-.124-.272-.198-.57-.347-.297-.149-1.758-.868-2.031-.967-.272-.099-.47-.149-.669.149-.198.297-.768.967-.941 1.165-.173.198-.347.223-.644.074-.297-.149-1.255-.462-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.297-.347.446-.521.151-.172.2-.296.3-.495.099-.198.05-.372-.025-.521-.075-.148-.669-1.611-.916-2.206-.242-.579-.487-.501-.669-.51l-.57-.01c-.198 0-.52.074-.792.372s-1.04 1.016-1.04 2.479 1.065 2.876 1.213 3.074c.149.198 2.095 3.2 5.076 4.487.709.306 1.263.489 1.694.626.712.226 1.36.194 1.872.118.571-.085 1.758-.719 2.006-1.413.248-.695.248-1.29.173-1.414z"/>
  </svg>
);

const WhatsAppFab: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [showHint, setShowHint] = useState(false);

  // Show a small hint bubble a few seconds after mount, auto-dismiss.
  useEffect(() => {
    const seen = sessionStorage.getItem('wa_fab_hint_seen');
    if (seen) return;
    const t1 = setTimeout(() => setShowHint(true), 2500);
    const t2 = setTimeout(() => {
      setShowHint(false);
      sessionStorage.setItem('wa_fab_hint_seen', '1');
    }, 9000);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none">
      {/* Hint / mini card */}
      {(showHint || open) && (
        <div className="pointer-events-auto bg-ciklo-card border border-gray-800 rounded-2xl shadow-2xl shadow-black/40 px-4 py-3 max-w-[260px] animate-[fadeIn_0.2s_ease-out]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-sm font-bold text-white leading-tight">Precisa de ajuda?</p>
              <p className="text-xs text-gray-400 mt-1 leading-snug">
                Fale com nosso suporte pelo WhatsApp — respondemos rápido.
              </p>
            </div>
            <button
              onClick={() => { setOpen(false); setShowHint(false); sessionStorage.setItem('wa_fab_hint_seen', '1'); }}
              className="text-gray-500 hover:text-white transition-colors -mt-1 -mr-1"
              aria-label="Fechar"
            >
              <X size={14} />
            </button>
          </div>
          <a
            href={WHATSAPP_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex items-center justify-center gap-2 w-full py-2 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-bold text-white transition-colors"
          >
            <WhatsAppIcon size={16} />
            Abrir conversa
          </a>
        </div>
      )}

      {/* Floating button */}
      <button
        onClick={() => { setOpen(o => !o); setShowHint(false); sessionStorage.setItem('wa_fab_hint_seen', '1'); }}
        className="pointer-events-auto relative w-14 h-14 rounded-full bg-green-500 hover:bg-green-400 shadow-xl shadow-green-900/40 flex items-center justify-center text-white transition-all hover:scale-105 active:scale-95"
        aria-label="Suporte via WhatsApp"
        title="Suporte via WhatsApp"
      >
        {open ? <X size={24} /> : <WhatsAppIcon size={28} />}
      </button>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default WhatsAppFab;