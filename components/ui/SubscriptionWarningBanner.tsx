import React from 'react';
import { AlertTriangle, MessageCircle } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';

const WARNING_DAYS = 7;

const SubscriptionWarningBanner: React.FC = () => {
  const { user } = useAuth();
  const expiresAt = user?.subscriptionExpiresAt;

  if (!expiresAt) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiresAt + 'T00:00:00');
  const diffMs = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  // Only show warning when ≤7 days remaining and still active
  if (diffDays < 0 || diffDays > WARNING_DAYS) return null;

  const formatDate = (d: Date) => d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-2.5 mb-4 bg-orange-500/10 border border-orange-500/30 rounded-lg text-orange-300 text-sm print:hidden">
      <div className="flex items-center gap-2">
        <AlertTriangle size={16} className="shrink-0" />
        <span>
          {diffDays === 0 ? (
            <>Sua assinatura expira <strong>hoje</strong>. Renove para evitar a suspensão do acesso.</>
          ) : diffDays === 1 ? (
            <>Sua assinatura expira <strong>amanhã</strong>. Renove para evitar a suspensão do acesso.</>
          ) : (
            <>Restam <strong>{diffDays}</strong> dias para a assinatura expirar ({formatDate(expiry)}). Renove para evitar a suspensão.</>
          )}
        </span>
      </div>
      <a
        href="https://wa.me/555432931095?text=Ol%C3%A1%2C%20quero%20renovar%20a%20assinatura%20do%20meu%20plano%20no%20sistema%20Ciklo."
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center justify-center gap-1.5 shrink-0 bg-green-600 hover:bg-green-500 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors"
      >
        <MessageCircle size={14} /> Renovar
      </a>
    </div>
  );
};

export default SubscriptionWarningBanner;