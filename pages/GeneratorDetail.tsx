
import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Generator, GeneratorStatus, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { useGenerators, getSocket } from '../context/GeneratorContext';

import { useIsMobile } from '../hooks/useIsMobile';
import {
  Power, AlertOctagon, RotateCcw, Settings, Gauge,
  Thermometer, Droplets, Battery, Zap, Timer, ChevronLeft, ChevronDown, ChevronUp, Lock,
  RefreshCw, UtilityPole, Cable, TrendingUp, BarChart3, Play, Square,
  Radio, LayoutDashboard, Sliders, Plus, Save, Send, Trash2, Ban, AlertTriangle
} from 'lucide-react';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, ReferenceArea } from 'recharts';

const CircularGauge = ({ value, max, label, unit, color = "text-ciklo-yellow", size = 120 }: any) => {
  const radius = 40;
  const circumference = 2 * Math.PI * radius;
  
  // Safe check for null, undefined, or KVA not-present values (65535 and its scaled variants)
  const isInvalid = value === null || value === undefined || value === 65535 || value === 655.35 || value === 6553.5 || value < 0;
  const numericValue = isInvalid ? 0 : Number(value);
  const strokeDashoffset = circumference - (Math.min(numericValue, max) / max) * circumference;

  return (
    <div className="relative flex flex-col items-center justify-center p-4 bg-ciklo-dark rounded-xl border border-gray-700/50">
      <div className="relative" style={{ width: size, height: size }}>
        <svg className="transform -rotate-90 w-full h-full">
          <circle
            className="text-gray-700"
            strokeWidth="8"
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx="50%"
            cy="50%"
          />
          <circle
            className={`${color} transition-all duration-1000 ease-out`}
            strokeWidth="8"
            strokeDasharray={circumference}
            strokeDashoffset={isInvalid ? circumference : strokeDashoffset}
            strokeLinecap="round"
            stroke="currentColor"
            fill="transparent"
            r={radius}
            cx="50%"
            cy="50%"
          />
        </svg>
        <div className="absolute top-0 left-0 w-full h-full flex flex-col items-center justify-center">
          <span className="text-2xl font-bold text-white">{isInvalid ? '-' : numericValue.toFixed(unit === 'rpm' ? 0 : 1)}</span>
          <span className="text-xs text-gray-400">{unit}</span>
        </div>
      </div>
      <span className="text-sm font-semibold text-gray-400 mt-2">{label}</span>
    </div>
  );
};

const formatVoltage = (val: any) => (val === null || val === undefined || val === 65535 ? '-' : `${Number(val).toFixed(0)} V`);
const formatCurrent = (val: any) => (val === null || val === undefined || val === 65535 ? '-' : `${Number(val).toFixed(0)} A`);
const formatFrequency = (val: any) => (val === null || val === undefined || val === 6553.5 || val === 65535 ? '-' : `${Number(val).toFixed(1)} Hz`);
const formatPowerFactor = (val: any) => (val === null || val === undefined || val === 655.35 || val === 6553.5 || val === 65535 ? '-' : `${Number(val).toFixed(2)}`);
const formatPower = (val: any) => (val === null || val === undefined || val === 65535 ? '-' : `${Number(val).toFixed(1)} kW`);

interface ModbusRegister {
  id: string;
  address: string;
  name: string;
  value: string;
  unit: string;
  type: 'READ' | 'WRITE';
}

const GeneratorDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { generators, updateGenerator } = useGenerators();


  // Permissions checks
  const canControl = user?.role === UserRole.ADMIN || user?.role === UserRole.TECHNICIAN || user?.role === UserRole.CLIENT;
  const canAccessAdvanced = user?.role === UserRole.ADMIN || user?.role === UserRole.TECHNICIAN;

  // Mobile responsive state
  const isMobile = useIsMobile();

  // Mobile accordion state - which sections are expanded
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() => {
    const initial = new Set<string>();
    if (canControl) initial.add('remote_control');
    initial.add('mechanical');
    initial.add('electrical');
    initial.add('load_curve');
    return initial;
  });

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      return next;
    });
  };

  // Find generator from context
  const foundGen = generators.find(g => g.id === id);
  const [gen, setGen] = useState<Generator | undefined>(foundGen);
  const [controlLoading, setControlLoading] = useState<string | null>(null);

  // Connection status: check if data was received in the last 60 seconds
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const checkConnection = () => {
      if (gen?.lastDataReceived) {
        const elapsed = Date.now() - gen.lastDataReceived;
        setIsConnected(elapsed < 60_000); // 60 seconds threshold
      } else {
        setIsConnected(false);
      }
    };
    checkConnection();
    const interval = setInterval(checkConnection, 5_000); // Check every 5s
    return () => clearInterval(interval);
  }, [gen?.lastDataReceived]);

  // Tab State
  const [activeTab, setActiveTab] = useState<'operational' | 'modbus'>('operational');

  // Modbus State (Starts Empty/Zero)
  const [modbusRegisters, setModbusRegisters] = useState<ModbusRegister[]>([
    { id: '1', address: '40001', name: 'Rotação do Motor', value: '0', unit: 'RPM', type: 'READ' },
    { id: '2', address: '40002', name: 'Pressão de Óleo', value: '0', unit: 'Bar', type: 'READ' },
    { id: '3', address: '40003', name: 'Temperatura Água', value: '0', unit: '°C', type: 'READ' },
    { id: '4', address: '40100', name: 'Comando Partida', value: '0', unit: 'Bool', type: 'WRITE' },
    { id: '5', address: '40101', name: 'Set Point Carga', value: '0', unit: 'kW', type: 'WRITE' },
  ]);

  // Inputs for adding new READ registers
  const [readAddress, setReadAddress] = useState('');
  const [readName, setReadName] = useState('');
  const [readUnit, setReadUnit] = useState('');

  // Inputs for adding new WRITE registers
  const [writeAddress, setWriteAddress] = useState('');
  const [writeName, setWriteName] = useState('');

  // View Mode for Voltages (Phase-Neutral vs Phase-Phase)
  const [voltageViewMode, setVoltageViewMode] = useState<'PN' | 'PP'>('PP');
  const [mainsVoltageViewMode, setMainsVoltageViewMode] = useState<'PN' | 'PP'>('PP');

  // Local Alarm Acknowledgment State
  const [acknowledgedAlarms, setAcknowledgedAlarms] = useState<Set<string>>(new Set());

  // Reset acknowledgment if alarm clears
  useEffect(() => {
    if (!gen?.alarms?.startFailure) {
      setAcknowledgedAlarms(prev => {
        const next = new Set(prev);
        next.delete('startFailure');
        return next;
      });
    }
  }, [gen?.alarms?.startFailure]);

  // Access check (Admins see all, others see if their company matches generator's company)
  const hasAccess = user?.role === UserRole.ADMIN || (user?.companyId !== undefined && gen?.companyId === user?.companyId);

  // Sync with context if context updates (e.g. status change from elsewhere)
  useEffect(() => {
    if (foundGen) {
      setGen(foundGen);
    }
  }, [foundGen]);

  // Socket.io Listener moved to GeneratorContext.tsx
  // This ensures Dashboard and Detail views are always in sync.

  // --- Historical Power Chart (DB-backed) ---
  const [chartRange, setChartRange] = useState<'24h' | '7d' | '30d'>('24h');
  const [powerHistory, setPowerHistory] = useState<{ time: string; power: number }[]>([]);
  const [chartLoading, setChartLoading] = useState(false);
  const [chartZoomRange, setChartZoomRange] = useState<{ startIndex: number; endIndex: number } | null>(null);
  const [dragStartIndex, setDragStartIndex] = useState<number | null>(null);
  const [dragEndIndex, setDragEndIndex] = useState<number | null>(null);
  const [isDraggingChart, setIsDraggingChart] = useState(false);
  const [chartSelectMode, setChartSelectMode] = useState(false);
  const [chartTooltipVisible, setChartTooltipVisible] = useState(false);
  const [plotInset, setPlotInset] = useState({ left: 65, right: 10 });
  const chartContainerRef = useRef<HTMLDivElement>(null);

  const chartZoomStart = chartZoomRange?.startIndex ?? 0;
  const chartZoomEnd = chartZoomRange?.endIndex ?? Math.max(0, powerHistory.length - 1);

  const visiblePowerHistory = useMemo(() => {
    if (powerHistory.length === 0) return [];
    const end = Math.min(chartZoomEnd, powerHistory.length - 1);
    const start = Math.min(chartZoomStart, end);
    return powerHistory.slice(start, end + 1);
  }, [powerHistory, chartZoomStart, chartZoomEnd]);

  const isChartZoomed = powerHistory.length > 1 && (
    chartZoomStart > 0 || chartZoomEnd < powerHistory.length - 1
  );

  const chartDisplayData = isChartZoomed ? visiblePowerHistory : powerHistory;

  useEffect(() => {
    setChartZoomRange(null);
    setDragStartIndex(null);
    setDragEndIndex(null);
    setIsDraggingChart(false);
    setChartSelectMode(false);
    setChartTooltipVisible(false);
  }, [chartRange]);

  useEffect(() => {
    setChartZoomRange(null);
    setDragStartIndex(null);
    setDragEndIndex(null);
    setIsDraggingChart(false);
    setChartSelectMode(false);
    setChartTooltipVisible(false);
  }, [powerHistory.length, id]);

  useEffect(() => {
    if (chartSelectMode || isDraggingChart) setChartTooltipVisible(false);
  }, [chartSelectMode, isDraggingChart]);

  useEffect(() => {
    const dismissTooltip = (ev: PointerEvent) => {
      const container = chartContainerRef.current;
      if (container && !container.contains(ev.target as Node)) {
        setChartTooltipVisible(false);
      }
    };
    document.addEventListener('pointerdown', dismissTooltip);
    return () => document.removeEventListener('pointerdown', dismissTooltip);
  }, []);

  const measurePlotInset = useCallback(() => {
    const container = chartContainerRef.current;
    if (!container) return;
    const gridEl = container.querySelector('.recharts-cartesian-grid');
    const gridRect = gridEl?.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    if (gridRect && gridRect.width > 0) {
      setPlotInset({
        left: Math.max(0, gridRect.left - containerRect.left),
        right: Math.max(0, containerRect.right - gridRect.right),
      });
    } else {
      setPlotInset({ left: isMobile ? 48 : 65, right: isMobile ? 6 : 10 });
    }
  }, [isMobile]);

  useLayoutEffect(() => {
    measurePlotInset();
  }, [measurePlotInset, chartDisplayData, chartLoading, isMobile, isChartZoomed]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => measurePlotInset());
    observer.observe(container);
    return () => observer.disconnect();
  }, [measurePlotInset]);

  // Fetch historical readings from DB
  const fetchReadings = useCallback(async () => {
    if (!id) return;
    setChartLoading(true);
    try {
      const token = localStorage.getItem('ciklo_auth_token');
      const res = await fetch(`/api/generators/${id}/readings?range=${chartRange}`, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        const formatted = data.map((row: any) => {
          const date = new Date(row.time);
          let timeLabel: string;
          if (chartRange === '24h') {
            timeLabel = date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          } else {
            timeLabel = date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' +
                        date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
          }
          return { time: timeLabel, power: Number(row.power) || 0 };
        });
        setPowerHistory(formatted);
      }
    } catch (err) {
      console.error('Failed to fetch readings:', err);
    } finally {
      setChartLoading(false);
    }
  }, [id, chartRange]);

  // Fetch on mount, range change, and periodically
  useEffect(() => {
    fetchReadings();
    const interval = setInterval(fetchReadings, 30_000); // refresh every 30s
    return () => clearInterval(interval);
  }, [fetchReadings]);

  // Calculate chart Y-axis max for better visualization
  const chartMaxPower = useMemo(() => {
    if (visiblePowerHistory.length === 0) return 10;
    const maxVal = Math.max(...visiblePowerHistory.map(p => p.power));
    return maxVal < 10 ? 10 : Math.ceil(maxVal * 1.2); // 20% headroom
  }, [visiblePowerHistory]);

  const getIndexFromClientX = useCallback((clientX: number) => {
    const el = chartContainerRef.current;
    if (!el || powerHistory.length === 0) return null;
    const rect = el.getBoundingClientRect();
    const plotLeft = rect.left + plotInset.left;
    const plotWidth = Math.max(1, rect.width - plotInset.left - plotInset.right);
    const ratio = Math.max(0, Math.min(1, (clientX - plotLeft) / plotWidth));
    return Math.round(ratio * (powerHistory.length - 1));
  }, [powerHistory.length, plotInset]);

  const commitChartSelection = useCallback(() => {
    if (dragStartIndex == null || dragEndIndex == null) {
      setIsDraggingChart(false);
      return;
    }
    const start = Math.min(dragStartIndex, dragEndIndex);
    const end = Math.max(dragStartIndex, dragEndIndex);
    if (end > start) {
      setChartZoomRange({ startIndex: start, endIndex: end });
    }
    setDragStartIndex(null);
    setDragEndIndex(null);
    setIsDraggingChart(false);
    setChartSelectMode(false);
  }, [dragStartIndex, dragEndIndex]);

  const chartInteractionEnabled = !isMobile || chartSelectMode;

  const handleChartHover = (state: { activeTooltipIndex?: number } | null) => {
    if (isMobile || isDraggingChart || chartSelectMode) return;
    if (state?.activeTooltipIndex != null) setChartTooltipVisible(true);
  };

  const handleChartTap = (state: { activeTooltipIndex?: number } | null) => {
    if (isDraggingChart || chartSelectMode) return;
    if (state?.activeTooltipIndex != null) setChartTooltipVisible(true);
  };

  const handleChartPointerDown = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (isChartZoomed || powerHistory.length < 2 || !chartInteractionEnabled) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;

    const idx = getIndexFromClientX(ev.clientX);
    if (idx == null) return;

    ev.preventDefault();
    setChartTooltipVisible(false);
    ev.currentTarget.setPointerCapture(ev.pointerId);
    setIsDraggingChart(true);
    setDragStartIndex(idx);
    setDragEndIndex(idx);
  };

  const handleChartPointerMove = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingChart) return;
    ev.preventDefault();
    const idx = getIndexFromClientX(ev.clientX);
    if (idx != null) setDragEndIndex(idx);
  };

  const handleChartPointerUp = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingChart) return;
    if (ev.currentTarget.hasPointerCapture(ev.pointerId)) {
      ev.currentTarget.releasePointerCapture(ev.pointerId);
    }
    commitChartSelection();
  };

  const handleChartPointerCancel = (ev: React.PointerEvent<HTMLDivElement>) => {
    if (ev.currentTarget.hasPointerCapture(ev.pointerId)) {
      ev.currentTarget.releasePointerCapture(ev.pointerId);
    }
    setDragStartIndex(null);
    setDragEndIndex(null);
    setIsDraggingChart(false);
  };

  const selectionStartIndex = dragStartIndex != null && dragEndIndex != null
    ? Math.min(dragStartIndex, dragEndIndex)
    : null;
  const selectionEndIndex = dragStartIndex != null && dragEndIndex != null
    ? Math.max(dragStartIndex, dragEndIndex)
    : null;
  const selectionX1 = selectionStartIndex != null ? powerHistory[selectionStartIndex]?.time : undefined;
  const selectionX2 = selectionEndIndex != null ? powerHistory[selectionEndIndex]?.time : undefined;



  if (!hasAccess) {
    return (
      <div className="flex flex-col items-center justify-center h-[60vh] text-center p-6">
        <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mb-4">
          <Lock size={32} className="text-red-500" />
        </div>
        <h2 className="text-xl font-bold text-white mb-2">Acesso Negado</h2>
        <p className="text-gray-400 mb-6">Você não tem permissão para visualizar este gerador.</p>
        <button
          onClick={() => navigate('/')}
          className="px-6 py-2 bg-gray-800 hover:bg-gray-700 text-white rounded-lg transition-colors"
        >
          Voltar ao Painel
        </button>
      </div>
    );
  }

  if (!gen) return <div className="text-white p-6">Gerador não encontrado ou foi removido.</div>;

  // Permissions are declared at the component scope level

  const handleControl = (action: string) => {
    if (!canControl) return;
    setControlLoading(action);

    // Emit Socket.IO Command
    // Assuming we have access to the 'socket' instance here.
    // If socket is not available via prop or context, we might need to use a request or import the socket instance if it's global.
    // Ideally, GeneratorContext provides the socket or a method.
    // For now, let's assume standard fetch or if socket is global.
    // Actually, looking at imports, there is no socket instance.
    // I should use a simple POST endpoint if socket is not easily accessible, OR use the existing socket connection if available.
    // Let's use a simple fetch to a new endpoint `/api/control` which calls the MQTT service, OR better,
    // assuming the `socket` is available from `useContext`.
    // GeneratorContext.tsx likely has the socket.
    // Since I cannot change Context easily right now, I will use a POST request to a new API endpoint, calling the command.
    // BUT I didn't create an endpoint.
    // I added a socket listener in index.js.
    // So I need to use the socket.

    // Check if 'socket' is available in window or imports.
    // Previous files showed `import { socket } from '../context/GeneratorContext'`.
    // Let's check imports.
    // If not, I will add `import { socket } from '../context/GeneratorContext';`

    // Use gen.ip (which maps to MQTT Device ID e.g., "Ciklo1") if available.
    // Fallback to gen.id only if IP is missing.
    const targetId = gen.ip || gen.id;

    // Use HTTP API (Relative path works for both Dev Proxy and Nginx Prod)
    const token = localStorage.getItem('ciklo_auth_token');
    fetch('/api/control', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ generatorId: targetId, action })
    })
      .then(res => {
        if (res.status === 401 || res.status === 403) {
          alert('Sessão expirada ou sem permissão. Faça login novamente.');
          // Optional: Redirect to login
          return { success: false, message: 'Não autorizado' };
        }
        return res.json();
      })
      .then(data => {
        if (!data.success) {
          console.error('Command Failed:', data.message);
          alert(`Falha ao enviar comando: ${data.message}`);
        } else {
          console.log('Command Sent:', data.message);
        }
      })
      .catch(err => {
        console.error('Network Error:', err);
        alert('Erro de conexão ao enviar comando.');
      })
      .finally(() => {
        // Minimum loading time for UX
        setTimeout(() => {
          setControlLoading(null);
        }, 500);
      });
  }



  const handleAddReadParameter = () => {
    if (!readAddress || !readName) return;

    const newRegister: ModbusRegister = {
      id: Date.now().toString(),
      address: readAddress,
      name: readName,
      unit: readUnit,
      type: 'READ',
      value: '0' // Initial value
    };

    setModbusRegisters([...modbusRegisters, newRegister]);
    setReadAddress('');
    setReadName('');
    setReadUnit('');
  };

  const handleAddWriteCommand = () => {
    if (!writeAddress || !writeName) return;

    const newRegister: ModbusRegister = {
      id: Date.now().toString(),
      address: writeAddress,
      name: writeName,
      unit: '',
      type: 'WRITE',
      value: '0'
    };

    setModbusRegisters([...modbusRegisters, newRegister]);
    setWriteAddress('');
    setWriteName('');
  };

  const handleRemoveRegister = (id: string) => {
    setModbusRegisters(modbusRegisters.filter(r => r.id !== id));
  };

  const handleWriteRegister = (id: string, newValue: string) => {
    // TODO: Implement Real Modbus Write Command
    console.log(`[Real Write] Register ${id} -> ${newValue}`);
  };



  const renderRemoteControl = () => {
    if (!canControl) return null;
    return (
      <div className="bg-ciklo-card rounded-xl border border-gray-800 p-5">
        <div className="flex items-center justify-between mb-4 border-b border-gray-800 pb-2">
          <h3 className="text-white font-bold flex items-center gap-2 text-sm uppercase tracking-wider">
            <Radio size={18} className="text-ciklo-orange" /> Painel de Controle Remoto
          </h3>
          <div className="flex items-center gap-2">
            <div className={`px-2 py-1 rounded bg-gray-900 border ${isConnected ? 'border-gray-700' : 'border-red-900'} text-[10px] font-mono ${isConnected ? 'text-ciklo-yellow' : 'text-red-500'} flex items-center gap-1`}>
              <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`}></div>
              {isConnected ? 'CONECTADO' : 'DESCONECTADO'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Operation Mode & Remote Command (Left side - 5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="text-[10px] text-gray-500 uppercase font-bold">Modo de Operação</label>
                <button
                  onClick={() => handleControl('reset')}
                  className="text-[10px] flex items-center gap-1 text-gray-400 hover:text-white bg-gray-800 hover:bg-gray-700 px-2 py-0.5 rounded border border-gray-700 transition-colors"
                >
                  <RotateCcw size={10} /> RESET FALHAS
                </button>
              </div>
              <div className="flex bg-gray-900/50 p-1.5 rounded-lg border border-gray-800 relative">
                <div className="flex-1 flex gap-2">
                  {/* AUTO BUTTON */}
                  <button
                    disabled={gen.operationMode === 'AUTO'}
                    onClick={() => handleControl('auto')}
                    className={`flex-1 py-3 rounded-md font-bold text-xs flex items-center justify-center gap-2 transition-all ${gen.operationMode === 'AUTO'
                      ? 'bg-green-600 text-white shadow-lg shadow-green-900/20 cursor-default opacity-100'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                  >
                    <RefreshCw size={14} className={gen.operationMode === 'AUTO' ? 'animate-spin-slow' : ''} /> AUTOMÁTICO
                  </button>

                  {/* MANUAL BUTTON */}
                  <button
                    disabled={gen.operationMode === 'MANUAL'}
                    onClick={() => handleControl('manual')}
                    className={`flex-1 py-3 rounded-md font-bold text-xs flex items-center justify-center gap-2 transition-all ${gen.operationMode === 'MANUAL'
                      ? 'bg-green-600 text-white shadow-lg shadow-green-900/20 cursor-default opacity-100'
                      : 'text-gray-400 hover:text-white hover:bg-white/5'
                      }`}
                  >
                    <Settings size={14} className={gen.operationMode === 'MANUAL' ? 'animate-spin-slow' : ''} /> MANUAL
                  </button>

                  {/* INIBIDO BUTTON (KVA only) */}
                  {(gen.controller?.toLowerCase() === 'kva' || gen.controller?.toLowerCase() === 'kvar') && (
                    <button
                      disabled={gen.operationMode === 'INHIBITED'}
                      onClick={() => handleControl('inhibit')}
                      className={`flex-1 py-3 rounded-md font-bold text-xs flex items-center justify-center gap-2 transition-all ${gen.operationMode === 'INHIBITED'
                        ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/20 cursor-default opacity-100'
                        : 'text-gray-400 hover:text-white hover:bg-white/5'
                        }`}
                    >
                      <Ban size={14} /> INIBIDO
                    </button>
                  )}
                </div>
              </div>

              <div className="p-4 bg-gray-900/50 rounded-lg border border-gray-800 mt-4 relative">
                <label className="text-[10px] text-gray-500 uppercase font-bold mb-3 block text-center">Comando Remoto</label>
                <div className="flex gap-3">
                  <button
                    disabled={gen.status === GeneratorStatus.RUNNING || gen.operationMode === 'AUTO' || gen.operationMode === 'INHIBITED'}
                    onClick={() => handleControl('start')}
                    className={`flex-1 py-4 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all border shadow-lg ${gen.status === GeneratorStatus.RUNNING || gen.operationMode === 'AUTO' || gen.operationMode === 'INHIBITED'
                      ? 'bg-green-900/20 text-green-600 border-green-900/50 opacity-50 cursor-not-allowed'
                      : 'bg-green-600 hover:bg-green-500 text-white border-green-500 hover:shadow-green-900/20'
                      }`}
                  >
                    <Play size={18} fill="currentColor" /> PARTIDA
                  </button>
                  <button
                    disabled={gen.status === GeneratorStatus.STOPPED || gen.operationMode === 'AUTO' || gen.operationMode === 'INHIBITED'}
                    onClick={() => handleControl('stop')}
                    className={`flex-1 py-4 rounded-lg font-bold text-sm flex items-center justify-center gap-2 transition-all border shadow-lg ${gen.status === GeneratorStatus.STOPPED || gen.operationMode === 'AUTO' || gen.operationMode === 'INHIBITED'
                      ? 'bg-red-900/20 text-red-600 border-red-900/50 opacity-50 cursor-not-allowed'
                      : 'bg-red-600 hover:bg-red-500 text-white border-red-500 hover:shadow-red-900/20'
                      }`}
                  >
                    <Square size={18} fill="currentColor" /> PARAR
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Divider for mobile/desktop */}
          <div className="hidden lg:block lg:col-span-1 border-l border-gray-800 mx-auto h-full w-px"></div>

          {/* QTA (Right side - 6 cols) */}
          <div className="lg:col-span-6 flex flex-col justify-center">
            <div className="text-center mb-6">
              <label className="text-[10px] text-gray-500 uppercase font-bold block">Status da Transferência (QTA)</label>
              <span className="text-xs font-mono text-gray-400">
                {gen.operationMode === 'AUTO' ? 'Controle Automático Ativo' : gen.operationMode === 'INHIBITED' ? 'Modo Inibido Ativo' : 'Controle Manual Habilitado'}
              </span>
            </div>

            <div className="flex flex-col items-center justify-center relative px-2 md:px-4 py-8 bg-gray-900/30 rounded-xl border border-dashed border-gray-800">
              {/* SVG Single Line Diagram */}
              <div className="w-full max-w-[500px] h-[120px] relative">
                <svg viewBox="0 0 500 120" className="w-full h-full drop-shadow-lg">
                  {/* DEFS for Glows */}
                  <defs>
                    <filter id="glow-green" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="4" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                    <filter id="glow-red" x="-50%" y="-50%" width="200%" height="200%">
                      <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                      <feMerge>
                        <feMergeNode in="coloredBlur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>

                  {/* --- STATIC LINES --- */}
                  <line x1="50" y1="80" x2="130" y2="80" stroke={gen.mainsBreakerClosed ? "#22c55e" : "#ef4444"} strokeWidth="4" className="transition-colors duration-500" />
                  <line x1="170" y1="80" x2="200" y2="80" stroke={gen.mainsBreakerClosed ? "#22c55e" : "#374151"} strokeWidth="4" className="transition-colors duration-500" />
                  <line x1="300" y1="80" x2="330" y2="80" stroke={gen.genBreakerClosed ? "#22c55e" : "#374151"} strokeWidth="4" className="transition-colors duration-500" />
                  <line x1="370" y1="80" x2="450" y2="80" stroke={gen.genBreakerClosed ? "#22c55e" : "#ef4444"} strokeWidth="4" className="transition-colors duration-500" />

                  {/* --- ICONS --- */}
                  {(() => {
                    const isMainsPresent = (gen.mainsVoltageL1 && gen.mainsVoltageL1 > 10) || (gen.avgVoltage && gen.avgVoltage > 10);
                    return (
                      <g transform="translate(10, 50)" className={isMainsPresent ? "text-green-500" : "text-gray-500"}>
                        <circle cx="20" cy="20" r="22" fill="none" stroke={isMainsPresent ? "#22c55e" : "#6b7280"} strokeWidth="3" />
                        <UtilityPole size={24} x={8} y={8} className="text-current" strokeWidth={1.5} />
                        {gen.mainsBreakerClosed && (
                          <circle cx="20" cy="20" r="28" fill="none" stroke="#22c55e" strokeWidth="2" strokeDasharray="10 10" className="animate-spin-slow origin-[20px_20px] opacity-50" />
                        )}
                        <text x="20" y="-10" textAnchor="middle" fill="currentColor" fontSize="12" fontWeight="bold">REDE</text>
                      </g>
                    );
                  })()}

                  <g transform="translate(450, 55)">
                    <circle cx="20" cy="20" r="22" fill="none" stroke={gen.status === GeneratorStatus.RUNNING ? "#22c55e" : "#6b7280"} strokeWidth="3" />
                    <text x="20" y="26" textAnchor="middle" fill={gen.status === GeneratorStatus.RUNNING ? "#22c55e" : "#6b7280"} fontSize="20" fontWeight="bold">G</text>
                    {gen.status === GeneratorStatus.RUNNING && (
                      <circle cx="20" cy="20" r="28" fill="none" stroke="#22c55e" strokeWidth="2" strokeDasharray="10 10" className="animate-spin-slow origin-[20px_20px] opacity-50" />
                    )}
                    <text x="20" y="-15" textAnchor="middle" fill="currentColor" className="text-gray-400" fontSize="12" fontWeight="bold">GERADOR</text>
                  </g>

                  <g transform="translate(200, 55)">
                    <rect x="0" y="0" width="100" height="50" rx="4" fill="#1f2937" stroke={gen.mainsBreakerClosed || gen.genBreakerClosed ? "#f97316" : "#374151"} strokeWidth="3" />
                    <text x="50" y="30" textAnchor="middle" fill={gen.mainsBreakerClosed || gen.genBreakerClosed ? "#f97316" : "#6b7280"} fontSize="14" fontWeight="bold" letterSpacing="2">CARGA</text>
                  </g>

                  <g
                    className={`cursor-pointer group hover:opacity-80 transition-all ${gen.operationMode === 'AUTO' || gen.operationMode === 'INHIBITED' ? 'cursor-not-allowed opacity-50' : ''}`}
                    onClick={() => { if (gen.operationMode !== 'AUTO' && gen.operationMode !== 'INHIBITED') handleControl('toggleMains'); }}
                  >
                    <rect x="120" y="30" width="60" height="60" fill="transparent" />
                    <line
                      x1="130" y1="80" x2="170" y2="80"
                      stroke={gen.mainsBreakerClosed ? "#22c55e" : "#ef4444"}
                      strokeWidth="6"
                      strokeLinecap="round"
                      className="transition-all duration-500 ease-in-out"
                      transform={gen.mainsBreakerClosed ? "rotate(0 130 80)" : "rotate(-35 130 80)"}
                    />
                    <circle cx="130" cy="80" r="4" fill="#fff" />
                    <circle cx="170" cy="80" r="4" fill="#fff" />
                    <text x="150" y="110" textAnchor="middle" fontSize="10" fill={gen.mainsBreakerClosed ? "#22c55e" : "#ef4444"} fontWeight="bold">
                      {gen.mainsBreakerClosed ? 'FECHADO' : 'ABERTO'}
                    </text>
                  </g>

                  <g
                    className={`cursor-pointer group hover:opacity-80 transition-all ${gen.operationMode === 'AUTO' || gen.operationMode === 'INHIBITED' ? 'cursor-not-allowed opacity-50' : ''}`}
                    onClick={() => { if (gen.operationMode !== 'AUTO' && gen.operationMode !== 'INHIBITED') handleControl('toggleGen'); }}
                  >
                    <rect x="320" y="30" width="60" height="60" fill="transparent" />
                    <line
                      x1="370" y1="80" x2="330" y2="80"
                      stroke={gen.genBreakerClosed ? "#22c55e" : "#ef4444"}
                      strokeWidth="6"
                      strokeLinecap="round"
                      className="transition-all duration-500 ease-in-out"
                      transform={gen.genBreakerClosed ? "rotate(0 370 80)" : "rotate(35 370 80)"}
                    />
                    <circle cx="370" cy="80" r="4" fill="#fff" />
                    <circle cx="330" cy="80" r="4" fill="#fff" />
                    <text x="350" y="110" textAnchor="middle" fontSize="10" fill={gen.genBreakerClosed ? "#22c55e" : "#ef4444"} fontWeight="bold">
                      {gen.genBreakerClosed ? 'FECHADO' : 'ABERTO'}
                    </text>
                  </g>
                </svg>

                <div className="absolute top-0 right-0">
                  {gen.operationMode === 'AUTO' && (
                    <span className="text-[10px] bg-blue-500/20 text-blue-400 px-2 py-1 rounded border border-blue-500/30">
                      Controle Automático (Chaves Bloqueadas)
                    </span>
                  )}
                  {gen.operationMode === 'INHIBITED' && (
                    <span className="text-[10px] bg-amber-500/20 text-amber-400 px-2 py-1 rounded border border-amber-500/30">
                      Modo Inibido (Controles Bloqueados)
                    </span>
                  )}
                </div>
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  };

  const renderMechanicalParameters = () => {
    return (
      <div className="bg-ciklo-card rounded-xl border border-gray-800 p-6">
        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
          <Settings size={18} className="text-ciklo-orange" /> Parâmetros Mecânicos
        </h3>
        <div className="grid grid-cols-2 gap-4">
          <CircularGauge value={gen.rpm} max={2500} label="RPM Motor" unit="rpm" color="text-blue-500" />
          <CircularGauge value={gen.oilPressure} max={10} label="Pressão Óleo" unit="bar" color="text-red-500" />
        </div>
        <div className="mt-4 space-y-3">
          <div className="bg-ciklo-dark p-3 rounded-lg flex items-center justify-between border border-gray-700/50">
            <div className="flex items-center gap-2 text-gray-400">
              <Thermometer size={18} /> Temp. Motor
            </div>
            <span className="text-xl font-bold text-white">
              {gen.engineTemp === null || gen.engineTemp === undefined || gen.engineTemp === 65535 ? '-' : `${gen.engineTemp}°C`}
            </span>
          </div>
          <div className="bg-ciklo-dark p-3 rounded-lg flex items-center justify-between border border-gray-700/50">
            <div className="flex items-center gap-2 text-gray-400">
              <Droplets size={18} /> Nível Combustível
            </div>
            <span className={`text-xl font-bold ${gen.fuelLevel === null || gen.fuelLevel === undefined || gen.fuelLevel === 65535 ? 'text-gray-400' : gen.fuelLevel < 20 ? 'text-red-500' : 'text-green-500'}`}>
              {gen.fuelLevel === null || gen.fuelLevel === undefined || gen.fuelLevel === 65535 ? '-' : `${gen.fuelLevel}%`}
            </span>
          </div>
          <div className="bg-ciklo-dark p-3 rounded-lg flex items-center justify-between border border-gray-700/50">
            <div className="flex items-center gap-2 text-gray-400">
              <Battery size={18} /> Tensão Bateria
            </div>
            <span className="text-xl font-bold text-white">
              {gen.batteryVoltage === null || gen.batteryVoltage === undefined || gen.batteryVoltage === 6553.5 ? '-' : `${gen.batteryVoltage} V`}
            </span>
          </div>
        </div>
      </div>
    );
  };

  const renderElectricalParameters = () => {
    return (
      <div className="bg-ciklo-card rounded-xl border border-gray-800 p-6 h-full flex flex-col">
        <h3 className="text-white font-bold mb-4 flex items-center gap-2">
          <Zap size={18} className="text-ciklo-yellow" /> Parâmetros Elétricos
        </h3>

        {/* Big Power Display */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="bg-ciklo-dark rounded-lg p-4 border-l-4 border-ciklo-orange">
            <p className="text-gray-400 text-xs uppercase font-bold">Potência Ativa Total</p>
            <p className="text-3xl font-bold text-white mt-1">
              {gen.activePowerTotal === null || gen.activePowerTotal === undefined || gen.activePowerTotal === 65535 ? '-' : Number(gen.activePowerTotal).toFixed(1)}{' '}
              {gen.activePowerTotal !== null && gen.activePowerTotal !== undefined && gen.activePowerTotal !== 65535 && (
                <span className="text-base font-normal text-gray-500">kW</span>
              )}
            </p>
          </div>
          <div className="bg-ciklo-dark rounded-lg p-4 border-l-4 border-blue-500">
            <p className="text-gray-400 text-xs uppercase font-bold">Fator de Potência</p>
            <p className="text-3xl font-bold text-white mt-1">
              {formatPowerFactor(gen.powerFactor)}{' '}
              {gen.powerFactor !== null && gen.powerFactor !== undefined && gen.powerFactor !== 655.35 && gen.powerFactor !== 6553.5 && gen.powerFactor !== 65535 && (
                <span className="text-base font-normal text-gray-500">cos φ</span>
              )}
            </p>
          </div>
        </div>

        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* GENERATOR COLUMN */}
          <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
              <div className="flex items-center gap-2 text-green-500">
                <Power size={18} />
                <span className="font-bold uppercase tracking-wider text-sm">Gerador</span>
              </div>
              <div className="flex items-center gap-3">
                {/* Toggle Phase-Neutral / Phase-Phase */}
                <div className="flex bg-gray-800 rounded-lg p-0.5">
                  <button
                    onClick={() => setVoltageViewMode('PP')}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${voltageViewMode === 'PP' ? 'bg-gray-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    F-F
                  </button>
                  <button
                    onClick={() => setVoltageViewMode('PN')}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${voltageViewMode === 'PN' ? 'bg-gray-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    F-N
                  </button>
                </div>
                <div className="text-right">
                  <span className="text-xs text-gray-400 block">Frequência</span>
                  <span className="text-lg font-bold text-white">{formatFrequency(gen.frequency)}</span>
                </div>
              </div>
            </div>
            <table className="w-full text-left">
              <thead className="text-[10px] text-gray-500 uppercase">
                <tr>
                  <th className="pb-2">Fase</th>
                  <th className="pb-2 text-right">Tensão</th>
                  <th className="pb-2 text-right">Corrente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-sm">
                {voltageViewMode === 'PN' ? (
                  <>
                    <tr>
                      <td className="py-2 text-gray-300 font-bold">L1</td>
                      <td className="py-2 text-right text-ciklo-yellow">{formatVoltage(gen.voltageL1)}</td>
                      <td className="py-2 text-right text-blue-400">{formatCurrent(gen.currentL1)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-gray-300 font-bold">L2</td>
                      <td className="py-2 text-right text-ciklo-yellow">{formatVoltage(gen.voltageL2)}</td>
                      <td className="py-2 text-right text-blue-400">{formatCurrent(gen.currentL2)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-gray-300 font-bold">L3</td>
                      <td className="py-2 text-right text-ciklo-yellow">{formatVoltage(gen.voltageL3)}</td>
                      <td className="py-2 text-right text-blue-400">{formatCurrent(gen.currentL3)}</td>
                    </tr>
                  </>
                ) : (
                  <>
                    <tr>
                      <td className="py-2 text-gray-300 font-bold">L1-L2</td>
                      <td className="py-2 text-right text-ciklo-yellow">{formatVoltage(gen.voltageL12)}</td>
                      <td className="py-2 text-right text-blue-400">{formatCurrent(gen.currentL1)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-gray-300 font-bold">L2-L3</td>
                      <td className="py-2 text-right text-ciklo-yellow">{formatVoltage(gen.voltageL23)}</td>
                      <td className="py-2 text-right text-blue-400">{formatCurrent(gen.currentL2)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-gray-300 font-bold">L3-L1</td>
                      <td className="py-2 text-right text-ciklo-yellow">{formatVoltage(gen.voltageL31)}</td>
                      <td className="py-2 text-right text-blue-400">{formatCurrent(gen.currentL3)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>

          {/* MAINS COLUMN */}
          <div className="bg-gray-900/50 rounded-lg p-4 border border-gray-700/50">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-gray-700">
              <div className="flex items-center gap-2 text-gray-400">
                <UtilityPole size={18} />
                <span className="font-bold uppercase tracking-wider text-sm">Rede</span>
              </div>
              <div className="flex items-center gap-3">
                {/* Toggle Phase-Neutral / Phase-Phase */}
                <div className="flex bg-gray-800 rounded-lg p-0.5">
                  <button
                    onClick={() => setMainsVoltageViewMode('PP')}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${mainsVoltageViewMode === 'PP' ? 'bg-gray-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    F-F
                  </button>
                  <button
                    onClick={() => setMainsVoltageViewMode('PN')}
                    className={`px-2 py-0.5 text-[10px] font-bold rounded-md transition-all ${mainsVoltageViewMode === 'PN' ? 'bg-gray-600 text-white shadow' : 'text-gray-500 hover:text-gray-300'}`}
                  >
                    F-N
                  </button>
                </div>
                <div className="text-right">
                  <span className="text-xs text-gray-400 block">Frequência</span>
                  <span className="text-lg font-bold text-white">{formatFrequency(gen.mainsFrequency)}</span>
                </div>
              </div>
            </div>
            <table className="w-full text-left">
              <thead className="text-[10px] text-gray-500 uppercase">
                <tr>
                  <th className="pb-2">Fase</th>
                  <th className="pb-2 text-right">Tensão</th>
                  <th className="pb-2 text-right">Corrente</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 text-sm">
                {mainsVoltageViewMode === 'PN' ? (
                  <>
                    <tr>
                      <td className="py-2 text-gray-300 font-bold">L1</td>
                      <td className="py-2 text-right text-gray-400">{formatVoltage(gen.mainsVoltageL1)}</td>
                      <td className="py-2 text-right text-gray-500">{formatCurrent(gen.mainsCurrentL1)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-gray-300 font-bold">L2</td>
                      <td className="py-2 text-right text-gray-400">{formatVoltage(gen.mainsVoltageL2)}</td>
                      <td className="py-2 text-right text-gray-500">{formatCurrent(gen.mainsCurrentL2)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-gray-300 font-bold">L3</td>
                      <td className="py-2 text-right text-gray-400">{formatVoltage(gen.mainsVoltageL3)}</td>
                      <td className="py-2 text-right text-gray-500">{formatCurrent(gen.mainsCurrentL3)}</td>
                    </tr>
                  </>
                ) : (
                  <>
                    <tr>
                      <td className="py-2 text-gray-300 font-bold">L1-L2</td>
                      <td className="py-2 text-right text-gray-400">{formatVoltage(gen.mainsVoltageL12)}</td>
                      <td className="py-2 text-right text-blue-400">{formatCurrent(gen.mainsCurrentL1)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-gray-300 font-bold">L2-L3</td>
                      <td className="py-2 text-right text-gray-400">{formatVoltage(gen.mainsVoltageL23)}</td>
                      <td className="py-2 text-right text-blue-400">{formatCurrent(gen.mainsCurrentL2)}</td>
                    </tr>
                    <tr>
                      <td className="py-2 text-gray-300 font-bold">L3-L1</td>
                      <td className="py-2 text-right text-gray-400">{formatVoltage(gen.mainsVoltageL31)}</td>
                      <td className="py-2 text-right text-blue-400">{formatCurrent(gen.mainsCurrentL3)}</td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="mt-6 p-4 bg-gray-800/50 rounded-lg border border-dashed border-gray-700 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <Timer className="text-gray-400" />
            <div>
              <p className="text-xs text-gray-500">Horímetro Total</p>
              <p className="text-xl font-mono text-white">{Number(gen.totalHours || 0).toFixed(2)} h</p>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderLoadCurve = () => {
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
                  onClick={() => setChartRange(value)}
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
                  onClick={() => setChartZoomRange(null)}
                  className="text-xs font-bold text-ciklo-orange hover:text-orange-400 transition-colors"
                >
                  Ver período completo
                </button>
              )}
            </div>

            {isMobile && isChartZoomed && (
              <button
                type="button"
                onClick={() => setChartZoomRange(null)}
                className="w-full py-3 rounded-xl bg-ciklo-orange/15 border border-ciklo-orange/50 text-ciklo-orange font-bold text-sm active:scale-[0.98] transition-transform"
              >
                Ver período completo
              </button>
            )}

            {isMobile && canSelectOnChart && (
              <button
                type="button"
                onClick={() => setChartSelectMode((on) => !on)}
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
          onPointerDown={chartInteractionEnabled ? handleChartPointerDown : undefined}
          onPointerMove={chartInteractionEnabled ? handleChartPointerMove : undefined}
          onPointerUp={chartInteractionEnabled ? handleChartPointerUp : undefined}
          onPointerCancel={chartInteractionEnabled ? handleChartPointerCancel : undefined}
          onMouseLeave={() => { if (!isMobile) setChartTooltipVisible(false); }}
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
                onMouseMove={handleChartHover}
                onMouseLeave={() => setChartTooltipVisible(false)}
                onClick={handleChartTap}
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
      </div>
    );
  };

  return (
    <div className="space-y-6 relative pb-10">
      {/* Full Screen Loading Overlay */}
      {controlLoading && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="w-16 h-16 border-4 border-ciklo-orange border-t-transparent rounded-full animate-spin mb-4"></div>
          <h2 className="text-2xl font-bold text-white tracking-wide animate-pulse">
            Processando Comando...
          </h2>
          <p className="text-gray-400 mt-2">Aguardando confirmação remota</p>
        </div>
      )}

      {/* Top Bar - Full on desktop, hidden on mobile (sidebar handles navigation) */}
      {!isMobile && (
        <div className="flex flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 hover:text-white transition-colors"
            >
              <ChevronLeft size={24} />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-white">{gen.name}</h1>
              <p className="text-gray-400 flex items-center gap-2 text-sm">
                <span className={`w-2 h-2 rounded-full ${gen.status === GeneratorStatus.RUNNING ? 'bg-green-500' : 'bg-red-500'}`}></span>
                Status: {gen.status} | {gen.model}
              </p>
            </div>
          </div>

          {canControl && (
            <div className="flex items-center gap-2">
              {user?.role === UserRole.ADMIN && (
                <button className="p-2 bg-red-900/50 hover:bg-red-900 text-red-500 border border-red-900 rounded-lg" title="Parada de Emergência">
                  <AlertOctagon size={20} />
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* Tabs Navigation - hidden on mobile */}
      <div className="border-b border-gray-800 hidden md:block">
        <nav className="flex space-x-8" aria-label="Tabs">
          <button
            onClick={() => setActiveTab('operational')}
            className={`
              group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-all
              ${activeTab === 'operational'
                ? 'border-ciklo-orange text-ciklo-orange'
                : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-300'}
            `}
          >
            <LayoutDashboard className={`mr-2 h-5 w-5 ${activeTab === 'operational' ? 'text-ciklo-orange' : 'text-gray-500'}`} />
            Painel Operacional
          </button>

          {canAccessAdvanced && (
            <button
              onClick={() => setActiveTab('modbus')}
              className={`
                group inline-flex items-center py-4 px-1 border-b-2 font-medium text-sm transition-all
                ${activeTab === 'modbus'
                  ? 'border-ciklo-orange text-ciklo-orange'
                  : 'border-transparent text-gray-500 hover:text-gray-300 hover:border-gray-300'}
              `}
            >
              <Sliders className={`mr-2 h-5 w-5 ${activeTab === 'modbus' ? 'text-ciklo-orange' : 'text-gray-500'}`} />
              Controle Avançado (Modbus)
            </button>
          )}
        </nav>
      </div>



      {/* OPERATIONAL TAB */}
      {activeTab === 'operational' && (
        <div className="space-y-6 animate-in fade-in duration-300">
          {isMobile ? (
            <div className="space-y-3">
              {/* Alarm Alert Banner (Mobile) */}
              {gen.alarmCode && gen.alarmCode > 0 && (
                <button
                  onClick={() => navigate(`/alarms?generatorId=${encodeURIComponent(gen.id)}`)}
                  className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl border border-red-600/60 bg-red-900/30 hover:bg-red-900/50 active:bg-red-900/60 transition-colors shadow-lg shadow-red-900/20 animate-pulse"
                >
                  <div className="w-10 h-10 rounded-xl bg-red-600 flex items-center justify-center shrink-0 shadow-md shadow-red-900/40">
                    <AlertTriangle size={22} className="text-white" />
                  </div>
                  <div className="text-left flex-1 min-w-0">
                    <span className="text-red-300 font-bold text-sm block">⚠ Alarme Ativo (Código {gen.alarmCode})</span>
                    <span className="text-red-400/70 text-xs">Toque para ver na Central de Alarmes →</span>
                  </div>
                </button>
              )}
              {/* Accordion: Controle Remoto */}
              {canControl && (
                <div className="rounded-2xl border border-gray-700/60 overflow-hidden bg-ciklo-card shadow-lg shadow-black/20">
                  <button
                    onClick={() => toggleSection('remote_control')}
                    className="w-full flex items-center justify-between px-5 py-5 hover:bg-white/5 transition-colors active:bg-white/10"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${expandedSections.has('remote_control') ? 'bg-ciklo-orange shadow-md shadow-orange-900/30' : 'bg-gray-800 border border-gray-700'}`}>
                        <Radio size={22} className={expandedSections.has('remote_control') ? 'text-black' : 'text-ciklo-orange'} />
                      </div>
                      <div className="text-left">
                        <span className="text-white font-bold text-base block">Controle Remoto</span>
                        <span className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                          <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                          {isConnected ? 'Conectado' : 'Desconectado'} • {gen.operationMode || 'AUTO'}
                        </span>
                      </div>
                    </div>
                    {expandedSections.has('remote_control') ? <ChevronUp size={24} className="text-gray-400" /> : <ChevronDown size={24} className="text-gray-400" />}
                  </button>
                  {expandedSections.has('remote_control') && (
                    <div className="px-3 pb-4 animate-in fade-in duration-200">
                      {renderRemoteControl()}
                    </div>
                  )}
                </div>
              )}

              {/* Accordion: Parâmetros Mecânicos */}
              <div className="rounded-2xl border border-gray-700/60 overflow-hidden bg-ciklo-card shadow-lg shadow-black/20">
                <button
                  onClick={() => toggleSection('mechanical')}
                  className="w-full flex items-center justify-between px-5 py-5 hover:bg-white/5 transition-colors active:bg-white/10"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${expandedSections.has('mechanical') ? 'bg-ciklo-orange shadow-md shadow-orange-900/30' : 'bg-gray-800 border border-gray-700'}`}>
                      <Settings size={22} className={expandedSections.has('mechanical') ? 'text-black' : 'text-ciklo-orange'} />
                    </div>
                    <div className="text-left">
                      <span className="text-white font-bold text-base block">Parâmetros Mecânicos</span>
                      <span className="text-xs text-gray-400 mt-0.5 block">
                        RPM: {gen.rpm === null || gen.rpm === undefined || gen.rpm === 65535 ? '-' : gen.rpm} • Temp: {gen.engineTemp === null || gen.engineTemp === undefined || gen.engineTemp === 65535 ? '-' : `${gen.engineTemp}°C`} • Comb: {gen.fuelLevel === null || gen.fuelLevel === undefined || gen.fuelLevel === 65535 ? '-' : `${gen.fuelLevel}%`}
                      </span>
                    </div>
                  </div>
                  {expandedSections.has('mechanical') ? <ChevronUp size={24} className="text-gray-400" /> : <ChevronDown size={24} className="text-gray-400" />}
                </button>
                {expandedSections.has('mechanical') && (
                  <div className="px-3 pb-4 animate-in fade-in duration-200">
                    {renderMechanicalParameters()}
                  </div>
                )}
              </div>

              {/* Accordion: Parâmetros Elétricos */}
              <div className="rounded-2xl border border-gray-700/60 overflow-hidden bg-ciklo-card shadow-lg shadow-black/20">
                <button
                  onClick={() => toggleSection('electrical')}
                  className="w-full flex items-center justify-between px-5 py-5 hover:bg-white/5 transition-colors active:bg-white/10"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${expandedSections.has('electrical') ? 'bg-ciklo-orange shadow-md shadow-orange-900/30' : 'bg-gray-800 border border-gray-700'}`}>
                      <Zap size={22} className={expandedSections.has('electrical') ? 'text-black' : 'text-ciklo-yellow'} />
                    </div>
                    <div className="text-left">
                      <span className="text-white font-bold text-base block">Parâmetros Elétricos</span>
                      <span className="text-xs text-gray-400 mt-0.5 block">
                        Potência: {gen.activePowerTotal === null || gen.activePowerTotal === undefined || gen.activePowerTotal === 65535 ? '-' : `${Number(gen.activePowerTotal).toFixed(1)} kW`} • FP: {formatPowerFactor(gen.powerFactor)}
                      </span>
                    </div>
                  </div>
                  {expandedSections.has('electrical') ? <ChevronUp size={24} className="text-gray-400" /> : <ChevronDown size={24} className="text-gray-400" />}
                </button>
                {expandedSections.has('electrical') && (
                  <div className="px-3 pb-4 animate-in fade-in duration-200">
                    {renderElectricalParameters()}
                  </div>
                )}
              </div>

              {/* Accordion: Curva de Carga */}
              <div className="rounded-2xl border border-gray-700/60 overflow-hidden bg-ciklo-card shadow-lg shadow-black/20">
                <button
                  onClick={() => toggleSection('load_curve')}
                  className="w-full flex items-center justify-between px-5 py-5 hover:bg-white/5 transition-colors active:bg-white/10"
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center ${expandedSections.has('load_curve') ? 'bg-ciklo-orange shadow-md shadow-orange-900/30' : 'bg-gray-800 border border-gray-700'}`}>
                      <TrendingUp size={22} className={expandedSections.has('load_curve') ? 'text-black' : 'text-ciklo-orange'} />
                    </div>
                    <div className="text-left">
                      <span className="text-white font-bold text-base block">Curva de Carga</span>
                      <span className="text-xs text-gray-400 mt-0.5 block">
                        Período: {chartRange === '24h' ? '24 horas' : chartRange === '7d' ? '7 dias' : '1 mês'} • Potência: {Number(gen.activePowerTotal || 0).toFixed(1)} kW
                      </span>
                    </div>
                  </div>
                  {expandedSections.has('load_curve') ? <ChevronUp size={24} className="text-gray-400" /> : <ChevronDown size={24} className="text-gray-400" />}
                </button>
                {expandedSections.has('load_curve') && (
                  <div className="px-1 pb-4 sm:px-3 animate-in fade-in duration-200">
                    {renderLoadCurve()}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
              {/* Desktop Layout */}
              {renderRemoteControl()}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-6">
                  {renderMechanicalParameters()}
                </div>
                <div className="lg:col-span-2 space-y-6">
                  {renderElectricalParameters()}
                </div>
              </div>
              {renderLoadCurve()}
            </>
          )}
        </div>
      )
      }

      {/* MODBUS CONTROL TAB */}
      {
        activeTab === 'modbus' && canAccessAdvanced && (
          <div className="space-y-6 animate-in fade-in duration-300">
            {/* Header Info */}
            <div className="bg-ciklo-card p-6 rounded-xl border border-gray-800">
              <h2 className="text-lg font-bold text-white mb-2">Comunicação Modbus</h2>
              <p className="text-sm text-gray-400">Protocolo: <span className="text-white font-mono">{gen.protocol || 'modbus_tcp'}</span> | IP: <span className="text-white font-mono">{gen.ip || '192.168.1.100'}</span> | Porta: <span className="text-white font-mono">{gen.port || '502'}</span> | ID: <span className="text-white font-mono">{gen.slaveId || '1'}</span></p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* READ SECTION */}
              <div className="bg-ciklo-card p-6 rounded-xl border border-gray-800 flex flex-col h-full">
                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                  <LayoutDashboard size={18} className="text-blue-500" /> Monitoramento (Leitura)
                </h3>

                {/* Add Register Form */}
                <div className="bg-ciklo-dark p-4 rounded-lg border border-gray-700 mb-6">
                  <p className="text-xs text-gray-500 font-bold uppercase mb-3">Adicionar Parâmetro</p>
                  <div className="grid grid-cols-12 gap-2">
                    <input
                      type="text"
                      placeholder="Endereço (Ex: 40001)"
                      value={readAddress}
                      onChange={(e) => setReadAddress(e.target.value)}
                      className="col-span-3 bg-gray-800 border border-gray-600 rounded p-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      placeholder="Nome do Parâmetro"
                      value={readName}
                      onChange={(e) => setReadName(e.target.value)}
                      className="col-span-4 bg-gray-800 border border-gray-600 rounded p-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      placeholder="Un."
                      value={readUnit}
                      onChange={(e) => setReadUnit(e.target.value)}
                      className="col-span-2 bg-gray-800 border border-gray-600 rounded p-2 text-xs text-white"
                    />
                    <button
                      onClick={handleAddReadParameter}
                      className="col-span-3 bg-blue-600 hover:bg-blue-500 text-white rounded p-2 text-xs font-bold flex items-center justify-center gap-1"
                    >
                      <Plus size={12} /> Adicionar
                    </button>
                  </div>
                </div>

                {/* Register List - UPDATED TO SHOW ALL REGISTERS */}
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left">
                    <thead className="bg-gray-800 text-gray-500 text-[10px] uppercase">
                      <tr>
                        <th className="p-3">Endereço</th>
                        <th className="p-3">Nome</th>
                        <th className="p-3 text-right">Valor</th>
                        <th className="p-3 text-right">Ação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 text-sm">
                      {modbusRegisters.map(reg => (
                        <tr key={reg.id} className="hover:bg-gray-800/30">
                          <td className="p-3 font-mono text-gray-400">{reg.address}</td>
                          <td className="p-3 text-white">{reg.name}</td>
                          <td className="p-3 text-right font-mono font-bold text-ciklo-yellow">
                            {reg.value} <span className="text-gray-600 text-xs font-normal">{reg.unit}</span>
                          </td>
                          <td className="p-3 text-right">
                            <button onClick={() => handleRemoveRegister(reg.id)} className="text-gray-600 hover:text-red-500">
                              <Trash2 size={14} />
                            </button>
                          </td>
                        </tr>
                      ))}
                      {modbusRegisters.length === 0 && (
                        <tr><td colSpan={4} className="p-4 text-center text-gray-600 text-xs">Nenhum parâmetro monitorado</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* WRITE SECTION - UPDATED TO TABLE & ALL REGISTERS */}
              <div className="bg-ciklo-card p-6 rounded-xl border border-gray-800 flex flex-col h-full">
                <h3 className="text-white font-bold mb-4 flex items-center gap-2">
                  <Sliders size={18} className="text-ciklo-orange" /> Comando (Escrita)
                </h3>

                {/* Add Control Form */}
                <div className="bg-ciklo-dark p-4 rounded-lg border border-gray-700 mb-6">
                  <p className="text-xs text-gray-500 font-bold uppercase mb-3">Configurar Novo Comando</p>
                  <div className="grid grid-cols-12 gap-2">
                    <input
                      type="text"
                      placeholder="Endereço"
                      value={writeAddress}
                      onChange={(e) => setWriteAddress(e.target.value)}
                      className="col-span-3 bg-gray-800 border border-gray-600 rounded p-2 text-xs text-white"
                    />
                    <input
                      type="text"
                      placeholder="Nome do Comando"
                      value={writeName}
                      onChange={(e) => setWriteName(e.target.value)}
                      className="col-span-6 bg-gray-800 border border-gray-600 rounded p-2 text-xs text-white"
                    />
                    <button
                      onClick={handleAddWriteCommand}
                      className="col-span-3 bg-ciklo-orange hover:bg-orange-500 text-black rounded p-2 text-xs font-bold flex items-center justify-center gap-1"
                    >
                      <Plus size={12} /> Configurar
                    </button>
                  </div>
                </div>

                {/* Updated Table Layout for Write Commands (Showing ALL registers) */}
                <div className="flex-1 overflow-auto">
                  <table className="w-full text-left">
                    <thead className="bg-gray-800 text-gray-500 text-[10px] uppercase">
                      <tr>
                        <th className="p-3">Endereço</th>
                        <th className="p-3">Nome</th>
                        <th className="p-3 text-right">Valor Atual</th>
                        <th className="p-3 text-right">Definir</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-800 text-sm">
                      {modbusRegisters.map(reg => (
                        <tr key={reg.id} className="hover:bg-gray-800/30">
                          <td className="p-3 font-mono text-gray-400">{reg.address}</td>
                          <td className="p-3 text-white">{reg.name}</td>
                          <td className="p-3 text-right font-mono font-bold text-ciklo-yellow">
                            {reg.value} <span className="text-gray-600 text-xs font-normal">{reg.unit}</span>
                          </td>
                          <td className="p-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <input
                                type="text"
                                className="w-16 bg-black border border-gray-600 rounded p-1 text-xs text-white text-right"
                                placeholder="Novo"
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') {
                                    handleWriteRegister(reg.id, (e.target as HTMLInputElement).value);
                                    (e.target as HTMLInputElement).value = '';
                                  }
                                }}
                              />
                              <button
                                className="p-1.5 bg-green-600 hover:bg-green-500 text-white rounded"
                                onClick={(e) => {
                                  const input = (e.currentTarget.previousElementSibling as HTMLInputElement);
                                  if (input) {
                                    handleWriteRegister(reg.id, input.value);
                                    input.value = '';
                                  }
                                }}
                              >
                                <Send size={14} />
                              </button>
                              <button onClick={() => handleRemoveRegister(reg.id)} className="text-gray-600 hover:text-red-500 ml-1">
                                <Trash2 size={14} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                      {modbusRegisters.length === 0 && (
                        <tr><td colSpan={4} className="p-4 text-center text-gray-600 text-xs">Nenhum comando disponível</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        )
      }
    </div >
  );
};

export default GeneratorDetail;
