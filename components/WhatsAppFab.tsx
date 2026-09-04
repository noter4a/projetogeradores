import React, { useState, useEffect } from 'react';
import { MessageCircle, X } from 'lucide-react';

const WHATSAPP_URL = 'https://wa.me/555432931095';

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
            <MessageCircle size={16} />
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
        {open ? <X size={24} /> : <MessageCircle size={26} />}
        {!open && (
          <span className="absolute inset-0 rounded-full bg-green-400 animate-ping opacity-30" />
        )}
      </button>

      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default WhatsAppFab;