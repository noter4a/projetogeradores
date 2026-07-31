import React from 'react';
import { TrendingUp, AlertTriangle } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts';
import { Generator } from '../../types';
import { PowerPoint, LoadStats } from '../../utils/loadStats';

type ChartRange = '24h' | '7d' | '30d';

interface LoadCurveCardProps {
  gen: Generator;
  isMobile: boolean;
  chartRange: ChartRange;
  onChartRangeChange: (range: ChartRange) => void;
  powerHistory: PowerPoint[];
  chartLoading: boolean;
  chartDisplayData: PowerPoint[];
  visiblePowerHistory: PowerPoint[];
  isChartZoomed: boolean;
  chartZoomStart: number;
  chartZoomEnd: number;
  onClearZoom: () => void;
  chartSelectMode: boolean;
  onToggleChartSelectMode: () => void;
  isDraggingChart: boolean;
  chartContainerRef: React.RefObject<HTMLDivElement>;
  chartInteractionEnabled: boolean;
  onChartPointerDown: (ev: React.PointerEvent<HTMLDivElement>) => void;
  onChartPointerMove: (ev: React.PointerEvent<HTMLDivElement>) => void;
  onChartPointerUp: (ev: React.PointerEvent<HTMLDivElement>) => void;
  onChartPointerCancel: (ev: React.PointerEvent<HTMLDivElement>) => void;
  chartTooltipVisible: boolean;
  onHideTooltip: () => void;
  onChartHover: (state: { activeTooltipIndex?: number } | null) => void;
  onChartTap: (state: { activeTooltipIndex?: number } | null) => void;
  chartMaxPower: number;
  selectionX1: string | undefined;
  selectionX2: string | undefined;
  loadStats: LoadStats | null;
}

const LoadCurveCard: React.FC<LoadCurveCardProps> = ({
  gen,
  isMobile,
  chartRange,
  onChartRangeChange,
  powerHistory,
  chartLoading,
  chartDisplayData,
  visiblePowerHistory,
  isChartZoomed,
  chartZoomStart,
  chartZoomEnd,
  onClearZoom,
  chartSelectMode,
  onToggleChartSelectMode,
  isDraggingChart,
  chartContainerRef,
  chartInteractionEnabled,
  onChartPointerDown,
  onChartPointerMove,
  onChartPointerUp,
  onChartPointerCancel,
  chartTooltipVisible,
  onHideTooltip,
  onChartHover,
  onChartTap,
  chartMaxPower,
  selectionX1,
  selectionX2,
  loadStats,
}) => {
  const canSelectOnChart = powerHistory.length > 1 && !isChartZoomed;

  return (
    <div className="bg-ciklo-card rounded-xl border border-gray-800 p-3 sm:p-6">
      <div className="mb-3 sm:mb-6 space-y-3">
        <h3 className="text-white font-bold flex items-center gap-2 text-sm sm:text-base">
          <TrendingUp size={18} className="text-ciklo-orange shrink-0" /> Curva de Carga (kW)
        </h3>

        <div className="flex flex-col gap-2">
          <div className="flex bg-gray-900 rounded-lg p-0.5 border border-gray-700 w-full">
            {([['24h', '24h'], ['7d', '7 dias'], ['30d', '1 mês']] as const).map(([value, label]) => (
              <button
                key={value}
                onClick={() => onChartRangeChange(value)}
                className={`flex-1 sm:flex-none px-2 sm:px-3 py-2 sm:py-1.5 text-xs font-bold rounded-md transition-all ${
                  chartRange === value
                    ? 'bg-ciklo-orange text-black shadow'
                    : 'text-gray-400 hover:text-white hover:bg-gray-800'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center justify-between gap-2 sm:hidden">
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <div className="w-2 h-2 rounded-full bg-ciklo-yellow shadow-sm shadow-yellow-500/50" />
              Potência Ativa
            </span>
            <span className="text-gray-600 font-mono text-xs">
              {chartLoading ? '...' : visiblePowerHistory.length > 0
                ? `${visiblePowerHistory.length}${isChartZoomed ? `/${powerHistory.length}` : ''} pts`
                : ''}
            </span>
          </div>

          <div className="hidden sm:flex sm:flex-wrap sm:items-center sm:gap-3">
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              <div className="w-2.5 h-2.5 rounded-full bg-ciklo-yellow shadow-sm shadow-yellow-500/50" />
              Potência Ativa
            </span>
            <span className="text-gray-600 font-mono text-xs">
              {chartLoading ? '...' : visiblePowerHistory.length > 0
                ? `${visiblePowerHistory.length}${isChartZoomed ? `/${powerHistory.length}` : ''} pts`
                : ''}
            </span>
            {isChartZoomed && (
              <button
                type="button"
                onClick={onClearZoom}
                className="text-xs font-bold text-ciklo-orange hover:text-orange-400 transition-colors"
              >
                Ver período completo
              </button>
            )}
          </div>

          {isMobile && isChartZoomed && (
            <button
              type="button"
              onClick={onClearZoom}
              className="w-full py-3 rounded-xl bg-ciklo-orange/15 border border-ciklo-orange/50 text-ciklo-orange font-bold text-sm active:scale-[0.98] transition-transform"
            >
              Ver período completo
            </button>
          )}

          {isMobile && canSelectOnChart && (
            <button
              type="button"
              onClick={onToggleChartSelectMode}
              className={`w-full py-3 rounded-xl font-bold text-sm active:scale-[0.98] transition-all ${
                chartSelectMode
                  ? 'bg-gray-800 border border-gray-600 text-gray-200'
                  : 'bg-ciklo-orange text-black shadow-md shadow-orange-900/30'
              }`}
            >
              {chartSelectMode ? 'Cancelar seleção' : 'Selecionar período no gráfico'}
            </button>
          )}

          {isMobile && chartSelectMode && (
            <p className="text-xs text-center text-ciklo-orange/90 px-1">
              Toque no início e arraste até o fim do intervalo desejado
            </p>
          )}
        </div>

        {!isMobile && powerHistory.length > 5 && !isChartZoomed && (
          <p className="text-[11px] text-gray-500">
            Clique no início do período e arraste até o fim no gráfico.
          </p>
        )}
        {isChartZoomed && (
          <p className="text-[11px] text-ciklo-orange/80 break-words">
            Período: {powerHistory[chartZoomStart]?.time} → {powerHistory[chartZoomEnd]?.time}
          </p>
        )}
      </div>

      <div
        ref={chartContainerRef}
        className={`relative h-[240px] sm:h-[350px] w-full select-none rounded-lg ${
          isMobile && chartSelectMode ? 'ring-2 ring-ciklo-orange/60 ring-offset-2 ring-offset-ciklo-card' : ''
        }`}
        style={{
          cursor: isChartZoomed ? 'default' : chartInteractionEnabled ? 'crosshair' : 'default',
          touchAction: isMobile && !chartSelectMode && !isDraggingChart ? 'pan-y' : 'none',
        }}
        onPointerDown={chartInteractionEnabled ? onChartPointerDown : undefined}
        onPointerMove={chartInteractionEnabled ? onChartPointerMove : undefined}
        onPointerUp={chartInteractionEnabled ? onChartPointerUp : undefined}
        onPointerCancel={chartInteractionEnabled ? onChartPointerCancel : undefined}
        onMouseLeave={() => { if (!isMobile) onHideTooltip(); }}
      >
        {isMobile && chartSelectMode && !isDraggingChart && (
          <div
            className="absolute inset-0 z-10 pointer-events-none rounded-lg border border-dashed border-ciklo-orange/30 bg-ciklo-orange/[0.03]"
            aria-hidden
          />
        )}
        {chartLoading && powerHistory.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-600">
            <TrendingUp size={48} className="mb-3 opacity-30 animate-pulse" />
            <p className="text-sm">Carregando dados históricos...</p>
          </div>
        ) : powerHistory.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-gray-600">
            <TrendingUp size={48} className="mb-3 opacity-30" />
            <p className="text-sm">Nenhum dado registrado para este período</p>
            <p className="text-xs text-gray-700 mt-1">Os dados serão coletados automaticamente</p>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={chartDisplayData}
              margin={{ top: 4, right: isMobile ? 4 : 10, left: 0, bottom: isMobile ? 16 : 5 }}
              onMouseMove={onChartHover}
              onMouseLeave={onHideTooltip}
              onClick={onChartTap}
            >
              <defs>
                <linearGradient id="colorPowerLive" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#FACC15" stopOpacity={0.4} />
                  <stop offset="50%" stopColor="#FACC15" stopOpacity={0.1} />
                  <stop offset="95%" stopColor="#FACC15" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#2a2a2a" />
              <XAxis
                dataKey="time"
                stroke="#555"
                tick={{ fontSize: isMobile ? 9 : 10, fill: '#666' }}
                minTickGap={isMobile ? 32 : 40}
                axisLine={{ stroke: '#333' }}
                interval={isMobile && chartDisplayData.length > 8 ? 'preserveStartEnd' : 'preserveEnd'}
              />
              <YAxis
                stroke="#555"
                tick={{ fontSize: isMobile ? 9 : 10, fill: '#666' }}
                domain={[0, chartMaxPower]}
                unit={isMobile ? 'kW' : ' kW'}
                axisLine={{ stroke: '#333' }}
                width={isMobile ? 48 : 65}
              />
              <Tooltip
                active={chartTooltipVisible && !isDraggingChart && !chartSelectMode}
                contentStyle={{
                  backgroundColor: '#111',
                  borderColor: '#444',
                  color: '#fff',
                  borderRadius: '10px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  padding: '12px 16px',
                }}
                labelStyle={{ color: '#999', fontSize: 11, marginBottom: 4 }}
                itemStyle={{ color: '#FACC15', fontWeight: 'bold', fontSize: 14 }}
                formatter={(value: number) => [`${value.toFixed(1)} kW`, 'Potência Ativa']}
              />
              <ReferenceLine y={0} stroke="#444" strokeDasharray="3 3" />
              {!isChartZoomed && selectionX1 && selectionX2 && selectionX1 !== selectionX2 && (
                <ReferenceArea
                  x1={selectionX1}
                  x2={selectionX2}
                  stroke="#FACC15"
                  strokeOpacity={0.9}
                  fill="#FACC15"
                  fillOpacity={0.2}
                />
              )}
              <Area
                type="monotone"
                dataKey="power"
                stroke="#FACC15"
                strokeWidth={2.5}
                fillOpacity={1}
                fill="url(#colorPowerLive)"
                dot={false}
                activeDot={chartTooltipVisible && !isDraggingChart ? { r: 5, fill: '#FACC15', stroke: '#000', strokeWidth: 2 } : false}
                animationDuration={500}
                isAnimationActive={chartDisplayData.length <= 2}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Mini-relatório do período (segue o zoom/seleção do gráfico) */}
      {!chartLoading && loadStats && chartDisplayData.length > 0 && (
        <div className="mt-4 pt-4 border-t border-gray-800">
          <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
            <h4 className="text-xs font-semibold text-gray-500">
              Resumo do período
            </h4>
            <span className="text-[10px] text-gray-600 font-mono">
              {isChartZoomed
                ? `trecho selecionado • ${chartDisplayData.length} pts`
                : chartRange === '24h' ? 'últimas 24 horas' : chartRange === '7d' ? 'últimos 7 dias' : 'últimos 30 dias'}
            </span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="bg-ciklo-dark p-3 rounded-lg border border-gray-700/50">
              <p className="text-[11px] text-gray-500 font-medium mb-1">Pico máximo</p>
              <p className="text-lg font-bold text-ciklo-yellow leading-tight">
                {loadStats.peak.toFixed(1)} <span className="text-xs text-gray-500 font-normal">kW</span>
              </p>
              {loadStats.peakTime && (
                <p className="text-[10px] text-gray-600 mt-0.5 truncate" title={loadStats.peakTime}>
                  em {loadStats.peakTime}
                </p>
              )}
            </div>

            <div className="bg-ciklo-dark p-3 rounded-lg border border-gray-700/50">
              <p className="text-[11px] text-gray-500 font-medium mb-1">Média</p>
              <p className="text-lg font-bold text-white leading-tight">
                {loadStats.avg.toFixed(1)} <span className="text-xs text-gray-500 font-normal">kW</span>
              </p>
            </div>

            <div className="bg-ciklo-dark p-3 rounded-lg border border-gray-700/50">
              <p className="text-[11px] text-gray-500 font-medium mb-1">Fator de carga</p>
              {loadStats.loadFactor != null ? (
                <>
                  <p className={`text-lg font-bold leading-tight ${
                    loadStats.loadFactor < 30 ? 'text-amber-400' : 'text-green-400'
                  }`}>
                    {loadStats.loadFactor.toFixed(0)}<span className="text-xs text-gray-500 font-normal">%</span>
                  </p>
                  <p className="text-[10px] text-gray-600 mt-0.5">
                    de {gen.powerKVA} kVA
                  </p>
                </>
              ) : (
                <p className="text-lg font-bold text-gray-600 leading-tight">–</p>
              )}
            </div>

            <div className="bg-ciklo-dark p-3 rounded-lg border border-gray-700/50">
              <p className="text-[11px] text-gray-500 font-medium mb-1">Energia</p>
              <p className="text-lg font-bold text-white leading-tight">
                {loadStats.energyKwh >= 1000
                  ? `${(loadStats.energyKwh / 1000).toFixed(2)} `
                  : `${loadStats.energyKwh.toFixed(1)} `}
                <span className="text-xs text-gray-500 font-normal">
                  {loadStats.energyKwh >= 1000 ? 'MWh' : 'kWh'}
                </span>
              </p>
            </div>

            <div className="bg-ciklo-dark p-3 rounded-lg border border-gray-700/50">
              <p className="text-[11px] text-gray-500 font-medium mb-1">Em operação</p>
              <p className="text-lg font-bold text-white leading-tight">
                {loadStats.runningHours.toFixed(1)} <span className="text-xs text-gray-500 font-normal">h</span>
              </p>
            </div>
          </div>

          {loadStats.loadFactor != null && loadStats.loadFactor < 30 && loadStats.runningHours > 0 && (
            <p className="text-[10px] text-amber-400/80 mt-3 flex items-start gap-1.5">
              <AlertTriangle size={12} className="shrink-0 mt-0.5" />
              Fator de carga baixo — o gerador está operando bem abaixo da capacidade nominal no período.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default LoadCurveCard;
