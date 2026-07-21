import React from 'react';
import { AlertTriangle, MessageCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const WARNING_THRESHOLD = 7;

const CreditsWarningBanner: React.FC = () => {
  const { user } = useAuth();
  const credits = user?.companyCredits;

  if (credits === null || credits === undefined) return null;
  if (credits <= 0 || credits > WARNING_THRESHOLD) return null;

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-2.5 mb-4 bg-orange-500/10 border border-orange-500/30 rounded-lg text-orange-300 text-sm print:hidden">
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} className="shrink-0" />
        <span>
          Restam <strong>{credits}</strong> {credits === 1 ? 'crédito' : 'créditos'}. Renove o plano para evitar a suspensão do acesso.
        </span>
      </div>
      <a
        href="https://wa.me/555432931095?text=Ol%C3%A1%2C%20quero%20renovar%20os%20cr%C3%A9ditos%20do%20meu%20plano%20no%20sistema%20Ciklo."
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-1.5 shrink-0 bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
      >
        <MessageCircle size={14} /> Renovar
      </a>
    </div>
  );
};

export default CreditsWarningBanner;
