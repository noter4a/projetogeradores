import React from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface AccordionSectionProps {
  icon: React.ReactNode;
  title: string;
  summary: React.ReactNode;
  expanded: boolean;
  onToggle: () => void;
  contentClassName?: string;
  children: React.ReactNode;
}

const AccordionSection: React.FC<AccordionSectionProps> = ({
  icon,
  title,
  summary,
  expanded,
  onToggle,
  contentClassName = 'px-3 pb-4 animate-in fade-in duration-200',
  children,
}) => {
  return (
    <div className="rounded-2xl border border-gray-700/60 overflow-hidden bg-ciklo-card shadow-lg shadow-black/20">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-5 py-5 hover:bg-white/5 transition-colors active:bg-white/10"
      >
        <div className="flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${expanded ? 'bg-ciklo-orange shadow-md shadow-orange-900/30' : 'bg-gray-800 border border-gray-700'}`}>
            {icon}
          </div>
          <div className="text-left">
            <span className="text-white font-bold text-base block">{title}</span>
            {summary}
          </div>
        </div>
        {expanded ? <ChevronUp size={24} className="text-gray-400" /> : <ChevronDown size={24} className="text-gray-400" />}
      </button>
      {expanded && (
        <div className={contentClassName}>
          {children}
        </div>
      )}
    </div>
  );
};

export default AccordionSection;
