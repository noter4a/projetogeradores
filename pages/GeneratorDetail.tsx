
import React, { useState, useEffect, useLayoutEffect, useMemo, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Generator, GeneratorStatus, UserRole } from '../types';
import { useAuth } from '../context/AuthContext';
import { useGenerators, getSocket } from '../context/GeneratorContext';

import { useIsMobile } from '../hooks/useIsMobile';
import { useOperatorMode } from '../context/OperatorModeContext';
import OperatorModeToggle from '../components/ui/OperatorModeToggle';
import OperatorGeneratorPanel from '../components/OperatorGeneratorPanel';
import MobileControlBar from '../components/ui/MobileControlBar';
import PullToRefreshIndicator from '../components/ui/PullToRefreshIndicator';
import { usePullToRefresh } from '../hooks/usePullToRefresh';
import { formatLastUpdate, isGeneratorConnected } from '../utils/generatorHealth';
import { formatPowerFactor } from '../utils/formatters';
import { computeLoadStats, PowerPoint, LoadStats } from '../utils/loadStats';
import {
  Settings, Gauge,
  Zap, ChevronLeft, Lock,
  Cable, TrendingUp, Play,
  Radio, LayoutDashboard, Sliders, Save, Ban, AlertTriangle, MapPin
} from 'lucide-react';
import { ModbusRegister } from '../components/generator-detail/ModbusRegisterTable';
import LocationCard from '../components/generator-detail/LocationCard';
import MechanicalParametersCard from '../components/generator-detail/MechanicalParametersCard';
import ElectricalParametersCard from '../components/generator-detail/ElectricalParametersCard';
import ModbusPanel, { ModbusRegisterRef } from '../components/generator-detail/ModbusPanel';
import RemoteControlPanel from '../components/generator-detail/RemoteControlPanel';
import LoadCurveCard from '../components/generator-detail/LoadCurveCard';
import AccordionSection from '../components/generator-detail/AccordionSection';

const GENERATOR_SECTION_IDS = ['remote_control', 'mechanical', 'electrical', 'location', 'load_curve'] as const;
type GeneratorSectionId = typeof GENERATOR_SECTION_IDS[number];

const generatorSectionsStorageKey = (generatorId: string) => `ciklo_gen_sections_${generatorId}`;

function loadExpandedSections(generatorId: string | undefined, canControl: boolean): Set<string> {
  const defaultExpanded = (): Set<string> => {
    const initial = new Set<string>();
    if (canControl) initial.add('remote_control');
    initial.add('mechanical');
    initial.add('electrical');
    initial.add('location');
    initial.add('load_curve');
    return initial;
  };

  if (!generatorId) return defaultExpanded();

  try {
    const raw = localStorage.getItem(generatorSectionsStorageKey(generatorId));
    if (raw != null) {
      const parsed = JSON.parse(raw) as string[];
      const next = new Set<string>();
      for (const sectionId of parsed) {
        if (!GENERATOR_SECTION_IDS.includes(sectionId as GeneratorSectionId)) continue;
        if (sectionId === 'remote_control' && !canControl) continue;
        next.add(sectionId);
      }
      return next;
    }
  } catch {
    // ignore corrupt storage
  }

  return defaultExpanded();
}

function saveExpandedSections(generatorId: string | undefined, sections: Set<string>) {
  if (!generatorId) return;
  localStorage.setItem(generatorSectionsStorageKey(generatorId), JSON.stringify([...sections]));
}

const GeneratorDetail: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { generators, updateGenerator, fetchGenerators } = useGenerators();


  // Permissions checks
  const canControl = user?.role === UserRole.ADMIN || user?.role === UserRole.TECHNICIAN || user?.role === UserRole.CLIENT;
  const canAccessAdvanced = user?.role === UserRole.ADMIN || user?.role === UserRole.TECHNICIAN;

  // Mobile responsive state
  const isMobile = useIsMobile();
  const { operatorMode } = useOperatorMode();
  const showOperatorUi = operatorMode && isMobile;

  // Mobile accordion state - which sections are expanded (persisted per generator)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(() =>
    loadExpandedSections(id, canControl)
  );

  useEffect(() => {
    setExpandedSections(loadExpandedSections(id, canControl));
  }, [id, canControl]);

  const toggleSection = (sectionId: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(sectionId)) {
        next.delete(sectionId);
      } else {
        next.add(sectionId);
      }
      saveExpandedSections(id, next);
      return next;
    });
  };

  // Find generator from context
  const foundGen = generators.find(g => g.id === id);
  const [gen, setGen] = useState<Generator | undefined>(foundGen);
  const [controlLoading, setControlLoading] = useState<string | null>(null);
  const [pauseLoading, setPauseLoading] = useState(false);

  // Connection status: check if data was received in the last 60 seconds
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    const checkConnection = () => setIsConnected(isGeneratorConnected(gen?.lastDataReceived));
    checkConnection();
    const interval = setInterval(checkConnection, 5_000); // Check every 5s
    return () => clearInterval(interval);
  }, [gen?.lastDataReceived]);

  // Tab State
  const [activeTab, setActiveTab] = useState<'operational' | 'modbus'>('operational');

  // Modbus State — começa vazio; cada linha é lida de verdade do equipamento
  // ao ser adicionada (ver readRegisterValue), sem valores de exemplo fixos.
  const [modbusRegisters, setModbusRegisters] = useState<ModbusRegister[]>([]);

  // Inputs for adding new READ registers
  const [readAddress, setReadAddress] = useState('');
  const [readName, setReadName] = useState('');
  const [readUnit, setReadUnit] = useState('');

  // Inputs for adding new WRITE registers
  const [writeAddress, setWriteAddress] = useState('');
  const [writeName, setWriteName] = useState('');

  // Tabela de referência de registradores conhecidos para o controlador deste
  // gerador (busca uma vez ao abrir a aba avançada).
  const [refRegisters, setRefRegisters] = useState<ModbusRegisterRef[]>([]);
  const [refLoading, setRefLoading] = useState(false);
  const [refFilter, setRefFilter] = useState('');

  useEffect(() => {
    if (activeTab !== 'modbus' || !id || refRegisters.length > 0) return;
    setRefLoading(true);
    // Cookie httpOnly autentica sozinho — sem token manual.
    fetch(`/api/generators/${id}/modbus-registers`)
      .then(res => res.json())
      .then(data => setRefRegisters(data.registers || []))
      .catch(() => setRefRegisters([]))
      .finally(() => setRefLoading(false));
  }, [activeTab, id]);

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
  const [powerHistory, setPowerHistory] = useState<PowerPoint[]>([]);
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

  // Stats follow whatever the chart is currently showing — zoom into a window
  // and the numbers describe exactly that window.
  const loadStats = useMemo(
    () => computeLoadStats(chartDisplayData, gen?.powerKVA),
    [chartDisplayData, gen?.powerKVA]
  );

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
      // Cookie httpOnly autentica sozinho — sem token manual.
      const res = await fetch(`/api/generators/${id}/readings?range=${chartRange}`);
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
          const power = Number(row.power) || 0;
          return {
            time: timeLabel,
            power,
            // Fall back to the average when a bucket predates the max/min columns.
            powerMax: row.power_max != null ? Number(row.power_max) : power,
            powerMin: row.power_min != null ? Number(row.power_min) : power,
            samples: Number(row.samples) || 1,
            activeSamples: Number(row.active_samples) || 0,
            bucketSeconds: Number(row.bucketSeconds) || 60,
          } as PowerPoint;
        });
        setPowerHistory(formatted);
      }
    } catch (err) {
      console.error('Failed to fetch readings:', err);
    } finally {
      setChartLoading(false);
    }
  }, [id, chartRange]);

  const onRefresh = useCallback(async () => {
    await fetchGenerators();
    await fetchReadings();
  }, [fetchGenerators, fetchReadings]);

  const { pullDistance, refreshing, statusText } = usePullToRefresh(onRefresh, !isMobile);

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

  // DSE: GenComm tem uma chave dedicada — "Telemetry start/cancel if in auto
  // mode" (35732/35733, TELEMETRY_START/TELEMETRY_STOP em mqtt.js) — feita
  // exatamente pra dar partida/parada sob demanda SEM sair do modo Automático.
  // É o caminho certo pra "quero só apertar Partida, sem trocar de modo",
  // já que trocar pra Manual sempre dá partida (é a definição do modo, não
  // um bug — ver dse4501-map.js). Por isso o AUTO não desabilita Partida/
  // Parar para este controlador, ao contrário dos demais.
  const isDseGen = gen.controller?.toLowerCase() === 'dse';
  const canStartMobile =
    gen.status !== GeneratorStatus.RUNNING &&
    (isDseGen || gen.operationMode !== 'AUTO') &&
    gen.operationMode !== 'INHIBITED';
  const canStopMobile =
    gen.status !== GeneratorStatus.STOPPED &&
    (isDseGen || gen.operationMode !== 'AUTO') &&
    gen.operationMode !== 'INHIBITED';

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
    // Cookie httpOnly autentica sozinho — sem token manual.
    fetch('/api/control', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
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

  // Pause / resume MQTT reads for this generator (stops it occupying the shared bus)
  const handleTogglePolling = async () => {
    if (!gen || !canControl || pauseLoading) return;
    const nextPaused = !gen.pollingPaused;

    if (nextPaused && !window.confirm(
      `Pausar as leituras de "${gen.name}"?\n\nO sistema deixará de buscar dados deste gerador até você retomar. Útil para geradores com problema que estejam travando a comunicação dos demais.`
    )) return;

    setPauseLoading(true);
    // Optimistic UI update
    setGen(prev => (prev ? { ...prev, pollingPaused: nextPaused } : prev));

    try {
      const res = await fetch(`/api/generators/${encodeURIComponent(gen.id)}/polling`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paused: nextPaused }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.success) {
        // Revert on failure
        setGen(prev => (prev ? { ...prev, pollingPaused: !nextPaused } : prev));
        alert(`Falha ao alterar leituras: ${data.message || res.statusText}`);
      } else {
        fetchGenerators();
      }
    } catch (err) {
      setGen(prev => (prev ? { ...prev, pollingPaused: !nextPaused } : prev));
      alert('Erro de conexão ao alterar o estado de leitura.');
    } finally {
      setPauseLoading(false);
    }
  };



  // Lê um registrador de verdade no gerador (pausa o polling normal por um
  // instante, faz UMA leitura Modbus e retoma — mesmo mecanismo já usado pela
  // varredura de descoberta). Atualiza a linha correspondente com o valor real
  // ou o motivo da falha (timeout / exceção Modbus).
  const readRegisterValue = async (registerId: string, address: string) => {
    const addr = parseInt(address, 10);
    if (!Number.isInteger(addr)) {
      setModbusRegisters(prev => prev.map(r => r.id === registerId ? { ...r, reading: false, error: 'Endereço inválido' } : r));
      return;
    }
    setModbusRegisters(prev => prev.map(r => r.id === registerId ? { ...r, reading: true, error: undefined } : r));
    try {
      // Mesmo padrão do controle remoto: gen.ip é o identificador usado pelo
      // polling (ex: "Ciklo55"); gen.id (GEN-xxx) é só a chave do banco. O
      // backend já resolve os dois, mas mandar o certo evita ambiguidade.
      // Cookie httpOnly autentica sozinho — sem token manual.
      const targetId = gen!.ip || gen!.id;
      const res = await fetch(`/api/generators/${targetId}/modbus-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ startAddress: addr, quantity: 1, fn: 3 }),
      });
      const data = await res.json();
      const kind = data?.classification?.kind;
      if (res.ok && kind === 'data') {
        const raw = data.classification.registers?.[0];
        setModbusRegisters(prev => prev.map(r => r.id === registerId ? { ...r, reading: false, value: String(raw ?? '-'), error: undefined } : r));
      } else if (kind === 'exception') {
        setModbusRegisters(prev => prev.map(r => r.id === registerId ? { ...r, reading: false, error: `Exceção Modbus ${data.classification.exceptionCode}` } : r));
      } else if (kind === 'timeout') {
        setModbusRegisters(prev => prev.map(r => r.id === registerId ? { ...r, reading: false, error: 'Sem resposta (timeout)' } : r));
      } else if (kind === 'garbage' || kind === 'short') {
        setModbusRegisters(prev => prev.map(r => r.id === registerId ? { ...r, reading: false, error: data.classification.note || 'Resposta inválida/corrompida' } : r));
      } else {
        // Sem classification: falha do próprio backend (dispositivo não encontrado,
        // MQTT desconectado, endereço/quantidade inválidos etc.) — vem em `error`,
        // não em `message`. Checar os dois evita mascarar o motivo real.
        setModbusRegisters(prev => prev.map(r => r.id === registerId ? { ...r, reading: false, error: data?.error || data?.message || 'Falha na leitura' } : r));
      }
    } catch (err) {
      setModbusRegisters(prev => prev.map(r => r.id === registerId ? { ...r, reading: false, error: 'Erro de conexão' } : r));
    }
  };

  // Escreve um valor num registrador de verdade no gerador. Ao contrário da
  // leitura, isso envia um comando real ao equipamento (ex: simular falha de
  // rede no DSE) — por isso pede confirmação antes de mandar, e não tenta ler
  // de volta o valor escrito automaticamente (o backend não aguarda/valida a
  // resposta de escrita, só confirma que o comando foi enviado).
  const writeRegisterValue = async (registerId: string, address: string) => {
    const reg = modbusRegisters.find(r => r.id === registerId);
    const rawValue = reg?.newValue ?? '';
    const addr = parseInt(address, 10);
    const val = parseInt(rawValue, 10);
    if (!Number.isInteger(addr)) {
      setModbusRegisters(prev => prev.map(r => r.id === registerId ? { ...r, writeError: 'Endereço inválido' } : r));
      return;
    }
    if (!Number.isInteger(val) || val < 0 || val > 65535) {
      setModbusRegisters(prev => prev.map(r => r.id === registerId ? { ...r, writeError: 'Valor inválido (0-65535)' } : r));
      return;
    }
    if (!window.confirm(`Confirma o envio do valor ${val} pro endereço ${addr}? Isso manda um comando real pro equipamento.`)) {
      return;
    }
    setModbusRegisters(prev => prev.map(r => r.id === registerId ? { ...r, writing: true, writeError: undefined } : r));
    try {
      const targetId = gen!.ip || gen!.id;
      const res = await fetch(`/api/generators/${targetId}/modbus-write`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: addr, value: val }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setModbusRegisters(prev => prev.map(r => r.id === registerId ? { ...r, writing: false, writeError: undefined, newValue: '' } : r));
      } else {
        setModbusRegisters(prev => prev.map(r => r.id === registerId ? { ...r, writing: false, writeError: data?.message || data?.error || 'Falha na escrita' } : r));
      }
    } catch (err) {
      setModbusRegisters(prev => prev.map(r => r.id === registerId ? { ...r, writing: false, writeError: 'Erro de conexão' } : r));
    }
  };

  const handleAddReadParameter = () => {
    if (!readAddress || !readName) return;

    const newRegister: ModbusRegister = {
      id: Date.now().toString(),
      address: readAddress,
      name: readName,
      unit: readUnit,
      type: 'READ',
      value: '-',
    };

    setModbusRegisters(prev => [...prev, newRegister]);
    readRegisterValue(newRegister.id, newRegister.address);
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
      value: '-',
    };

    setModbusRegisters(prev => [...prev, newRegister]);
    readRegisterValue(newRegister.id, newRegister.address);
    setWriteAddress('');
    setWriteName('');
  };

  const handleRemoveRegister = (id: string) => {
    setModbusRegisters(modbusRegisters.filter(r => r.id !== id));
  };

  const loadCurveCard = (
    <LoadCurveCard
      gen={gen}
      isMobile={isMobile}
      chartRange={chartRange}
      onChartRangeChange={setChartRange}
      powerHistory={powerHistory}
      chartLoading={chartLoading}
      chartDisplayData={chartDisplayData}
      visiblePowerHistory={visiblePowerHistory}
      isChartZoomed={isChartZoomed}
      chartZoomStart={chartZoomStart}
      chartZoomEnd={chartZoomEnd}
      onClearZoom={() => setChartZoomRange(null)}
      chartSelectMode={chartSelectMode}
      onToggleChartSelectMode={() => setChartSelectMode((on) => !on)}
      isDraggingChart={isDraggingChart}
      chartContainerRef={chartContainerRef}
      chartInteractionEnabled={chartInteractionEnabled}
      onChartPointerDown={handleChartPointerDown}
      onChartPointerMove={handleChartPointerMove}
      onChartPointerUp={handleChartPointerUp}
      onChartPointerCancel={handleChartPointerCancel}
      chartTooltipVisible={chartTooltipVisible}
      onHideTooltip={() => setChartTooltipVisible(false)}
      onChartHover={handleChartHover}
      onChartTap={handleChartTap}
      chartMaxPower={chartMaxPower}
      selectionX1={selectionX1}
      selectionX2={selectionX2}
      loadStats={loadStats}
    />
  );

  return (
    <div className={`space-y-6 relative ${showOperatorUi && canControl ? 'pb-28' : 'pb-10'}`}>
      <PullToRefreshIndicator pullDistance={pullDistance} refreshing={refreshing} statusText={statusText} />
      {/* Small non-blocking corner toast while a command is in flight */}
      {controlLoading && (
        <div className="fixed top-4 right-4 z-50 pointer-events-none animate-in fade-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2.5 bg-ciklo-card/95 backdrop-blur-md border border-gray-700 rounded-full shadow-lg shadow-black/40 pl-3 pr-4 py-2">
            <div className="w-3.5 h-3.5 border-2 border-ciklo-orange border-t-transparent rounded-full animate-spin shrink-0"></div>
            <span className="text-xs font-semibold text-gray-200 whitespace-nowrap">Enviando comando...</span>
          </div>
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
            <button
              onClick={handleTogglePolling}
              disabled={pauseLoading}
              title={gen.pollingPaused ? 'Retomar a busca de dados deste gerador' : 'Parar de buscar dados deste gerador (libera o barramento)'}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-semibold text-sm transition-colors disabled:opacity-50 ${
                gen.pollingPaused
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30'
                  : 'bg-gray-800 text-gray-300 border border-gray-700 hover:bg-gray-700'
              }`}
            >
              {gen.pollingPaused ? <Play size={16} /> : <Ban size={16} />}
              {gen.pollingPaused ? 'Retomar leituras' : 'Pausar leituras'}
            </button>
          )}
        </div>
      )}

      {/* Paused banner — reads are disabled for this unit */}
      {gen.pollingPaused && (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-300">
          <Ban size={20} className="shrink-0" />
          <div className="text-sm">
            <span className="font-bold">Leituras pausadas.</span>{' '}
            O sistema não está buscando dados deste gerador. Os valores exibidos podem estar desatualizados.
          </div>
        </div>
      )}

      {isMobile && (
        <div className="rounded-2xl border border-gray-800 bg-ciklo-card p-4 space-y-3">
          <OperatorModeToggle />
          <div>
            <h1 className="text-lg font-bold text-white font-mono leading-tight">{gen.name}</h1>
            <p className="text-xs text-gray-400 mt-1">{gen.model} • {gen.operationMode || 'AUTO'}</p>
            <p className="text-[10px] text-gray-500 mt-2">{formatLastUpdate(gen.lastDataReceived)}</p>
          </div>
          {canControl && (
            <button
              onClick={handleTogglePolling}
              disabled={pauseLoading}
              className={`w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-colors disabled:opacity-50 ${
                gen.pollingPaused
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 active:bg-amber-500/30'
                  : 'bg-gray-800 text-gray-300 border border-gray-700 active:bg-gray-700'
              }`}
            >
              {gen.pollingPaused ? <Play size={16} /> : <Ban size={16} />}
              {gen.pollingPaused ? 'Retomar leituras' : 'Pausar leituras'}
            </button>
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

              {showOperatorUi ? (
                <OperatorGeneratorPanel gen={gen} />
              ) : (
                <>
              {/* Accordion: Controle Remoto */}
              {canControl && (
                <AccordionSection
                  icon={<Radio size={22} className={expandedSections.has('remote_control') ? 'text-black' : 'text-ciklo-orange'} />}
                  title="Controle Remoto"
                  summary={
                    <span className="text-xs text-gray-400 flex items-center gap-2 mt-0.5">
                      <span className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`}></span>
                      {isConnected ? 'Conectado' : 'Desconectado'} • {gen.operationMode || 'AUTO'}
                    </span>
                  }
                  expanded={expandedSections.has('remote_control')}
                  onToggle={() => toggleSection('remote_control')}
                >
                  <RemoteControlPanel gen={gen} isConnected={isConnected} onControl={handleControl} />
                </AccordionSection>
              )}

              {/* Accordion: Parâmetros Mecânicos */}
              <AccordionSection
                icon={<Settings size={22} className={expandedSections.has('mechanical') ? 'text-black' : 'text-ciklo-orange'} />}
                title="Parâmetros Mecânicos"
                summary={
                  <span className="text-xs text-gray-400 mt-0.5 block">
                    RPM: {gen.rpm === null || gen.rpm === undefined || gen.rpm === 65535 ? '-' : gen.rpm} • Temp: {gen.engineTemp === null || gen.engineTemp === undefined || gen.engineTemp === 65535 ? '-' : `${gen.engineTemp}°C`} • Comb: {gen.fuelLevel === null || gen.fuelLevel === undefined || gen.fuelLevel === 65535 ? '-' : `${gen.fuelLevel}%`}
                  </span>
                }
                expanded={expandedSections.has('mechanical')}
                onToggle={() => toggleSection('mechanical')}
              >
                <MechanicalParametersCard gen={gen} />
              </AccordionSection>

              {/* Accordion: Parâmetros Elétricos */}
              <AccordionSection
                icon={<Zap size={22} className={expandedSections.has('electrical') ? 'text-black' : 'text-ciklo-yellow'} />}
                title="Parâmetros Elétricos"
                summary={
                  <span className="text-xs text-gray-400 mt-0.5 block">
                    Potência: {gen.activePowerTotal === null || gen.activePowerTotal === undefined || gen.activePowerTotal === 65535 ? '-' : `${Number(gen.activePowerTotal).toFixed(1)} kW`} • FP: {formatPowerFactor(gen.powerFactor)}
                  </span>
                }
                expanded={expandedSections.has('electrical')}
                onToggle={() => toggleSection('electrical')}
              >
                <ElectricalParametersCard
                  gen={gen}
                  voltageViewMode={voltageViewMode}
                  onVoltageViewModeChange={setVoltageViewMode}
                  mainsVoltageViewMode={mainsVoltageViewMode}
                  onMainsVoltageViewModeChange={setMainsVoltageViewMode}
                />
              </AccordionSection>

              {/* Accordion: Curva de Carga */}
              <AccordionSection
                icon={<TrendingUp size={22} className={expandedSections.has('load_curve') ? 'text-black' : 'text-ciklo-orange'} />}
                title="Curva de Carga"
                summary={
                  <span className="text-xs text-gray-400 mt-0.5 block">
                    Período: {chartRange === '24h' ? '24 horas' : chartRange === '7d' ? '7 dias' : '1 mês'} • Potência: {Number(gen.activePowerTotal || 0).toFixed(1)} kW
                  </span>
                }
                expanded={expandedSections.has('load_curve')}
                onToggle={() => toggleSection('load_curve')}
                contentClassName="px-1 pb-4 sm:px-3 animate-in fade-in duration-200"
              >
                {loadCurveCard}
              </AccordionSection>

              {/* Accordion: Localização (só quando o gerador reporta GNSS) */}
              {gen.gpsUpdatedAt && (
                <AccordionSection
                  icon={<MapPin size={22} className={expandedSections.has('location') ? 'text-black' : 'text-ciklo-orange'} />}
                  title="Localização"
                  summary={
                    <span className="text-xs text-gray-400 mt-0.5 block">
                      {gen.gpsHasFix && gen.latitude != null ? `${gen.latitude.toFixed(4)}, ${gen.longitude!.toFixed(4)}` : 'Buscando sinal de GPS...'}
                    </span>
                  }
                  expanded={expandedSections.has('location')}
                  onToggle={() => toggleSection('location')}
                >
                  <LocationCard gen={gen} />
                </AccordionSection>
              )}
                </>
              )}
            </div>
          ) : (
            <>
              {/* Desktop Layout */}
              {canControl && <RemoteControlPanel gen={gen} isConnected={isConnected} onControl={handleControl} />}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="space-y-6">
                  <MechanicalParametersCard gen={gen} />
                </div>
                <div className="lg:col-span-2 space-y-6">
                  <ElectricalParametersCard
                      gen={gen}
                      voltageViewMode={voltageViewMode}
                      onVoltageViewModeChange={setVoltageViewMode}
                      mainsVoltageViewMode={mainsVoltageViewMode}
                      onMainsVoltageViewModeChange={setMainsVoltageViewMode}
                    />
                </div>
              </div>
              {loadCurveCard}
              <LocationCard gen={gen} />
            </>
          )}
        </div>
      )
      }

      {/* MODBUS CONTROL TAB */}
      {
        activeTab === 'modbus' && canAccessAdvanced && (
          <ModbusPanel
            gen={gen}
            modbusRegisters={modbusRegisters}
            onSetModbusRegisters={setModbusRegisters}
            readAddress={readAddress}
            onReadAddressChange={setReadAddress}
            readName={readName}
            onReadNameChange={setReadName}
            readUnit={readUnit}
            onReadUnitChange={setReadUnit}
            writeAddress={writeAddress}
            onWriteAddressChange={setWriteAddress}
            writeName={writeName}
            onWriteNameChange={setWriteName}
            refRegisters={refRegisters}
            refLoading={refLoading}
            refFilter={refFilter}
            onRefFilterChange={setRefFilter}
            onAddReadParameter={handleAddReadParameter}
            onAddWriteCommand={handleAddWriteCommand}
            onReadRegister={readRegisterValue}
            onWriteRegister={writeRegisterValue}
            onRemoveRegister={handleRemoveRegister}
          />
        )
      }

      {isMobile && canControl && activeTab === 'operational' && showOperatorUi && (
        <MobileControlBar
          status={gen.status}
          operationMode={gen.operationMode}
          controlLoading={controlLoading}
          canStart={canStartMobile}
          canStop={canStopMobile}
          onControl={handleControl}
        />
      )}
    </div>
  );
};

export default GeneratorDetail;
