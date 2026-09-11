import React, { useState, useEffect } from 'react';
import { useGenerators } from '../context/GeneratorContext';
import {
  FileText,
  Printer,
  ChevronLeft,
  ChevronRight,
  Clock,
  ZapOff,
  Fuel,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  Building,
  Cpu,
  UserCheck,
  RotateCcw,
  Info
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';

interface MonthlyReportResponse {
  reportPeriod: {
    month: string;
    year: number;
    monthNum: number;
    startDate: string;
    endDate: string;
    daysInMonth: number;
  };
  generator: {
    id: string;
    name: string;
    model: string;
    location: string;
    powerKva: number;
    serialNumber: string;
    companyName: string;
  } | null;
  generatorsList: Array<{
    id: string;
    name: string;
    model: string;
    powerKva: number;
    serialNumber: string;
  }>;
  kpis: {
    totalOperatingHours: number;
    totalEnergyKwh: number;
    avgOperatingPowerKw: number;
    maxPeakPowerKw: number;
    mainsOutagesCount: number;
    mainsBackupDurationSeconds: number;
    estimatedDieselLiters: number;
    avgConsumptionPerHour: number;
    totalAlarmsCount: number;
    totalFaultsCount: number;
    totalWarningsCount: number;
    availabilityPercent: number;
  };
  dailyOperation: Array<{
    day: number;
    date: string;
    hours: number;
    kwh: number;
    peakKw: number;
    avgKw: number;
  }>;
  mainsOutages: Array<{
    id: number;
    generatorId: string;
    generatorName: string;
    startTime: string;
    endTime: string | null;
    durationSeconds: number;
    description: string;
    status: string;
  }>;
  alarms: Array<{
    id: number;
    generatorId: string;
    generatorName: string;
    alarmCode: number;
    alarmMessage: string;
    alarmType: string;
    startTime: string;
    endTime: string | null;
    durationSeconds: number;
    acknowledged: boolean;
    acknowledgedBy: string | null;
    acknowledgedAt: string | null;
  }>;
}

const MONTH_NAMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];

const Reports: React.FC = () => {
  const { generators, isLoading: isGensLoading } = useGenerators();

  // Inicializa com o mês atual
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  });

  const [selectedGenId, setSelectedGenId] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<MonthlyReportResponse | null>(null);

  // Auto-seleciona o primeiro gerador do contexto se ainda não houver seleção
  useEffect(() => {
    if (!selectedGenId && generators.length > 0) {
      setSelectedGenId(generators[0].id);
    }
  }, [generators, selectedGenId]);

  // Campos de Responsável Técnico persistidos no localStorage
  const [techName, setTechName] = useState(() => localStorage.getItem('ciklo_report_tech_name') || '');
  const [techCrea, setTechCrea] = useState(() => localStorage.getItem('ciklo_report_tech_crea') || '');
  const [techRole, setTechRole] = useState(() => localStorage.getItem('ciklo_report_tech_role') || 'Responsável Técnico / Engenheiro Operacional');
  const [techNotes, setTechNotes] = useState(() => {
    return 'Grupo gerador operou de acordo com os parâmetros nominais especificados pelo fabricante. As rotinas automáticas de contingência responderam dentro do tempo regulamentar. Recomenda-se manter o plano preventivo de troca de filtros e lubrificantes conforme o horímetro.';
  });

  // Salva dados do responsável técnico
  const handleSaveTechInfo = (name: string, crea: string, role: string) => {
    setTechName(name);
    setTechCrea(crea);
    setTechRole(role);
    localStorage.setItem('ciklo_report_tech_name', name);
    localStorage.setItem('ciklo_report_tech_crea', crea);
    localStorage.setItem('ciklo_report_tech_role', role);
  };

  // Carrega relatório da API
  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedGenId) params.set('generatorId', selectedGenId);
      if (selectedMonth) params.set('month', selectedMonth);

      const res = await fetch(`/api/reports/monthly?${params.toString()}`);
      if (!res.ok) {
        let errorMsg = `Erro na API (${res.status} ${res.statusText})`;
        try {
          const errData = await res.json();
          if (errData.message) errorMsg = errData.message;
        } catch {}
        throw new Error(errorMsg);
      }

      const data: MonthlyReportResponse = await res.json();
      setReport(data);

      // Sincroniza gerador selecionado se ainda vazio
      if (!selectedGenId && data.generator) {
        setSelectedGenId(data.generator.id);
      }
    } catch (err: any) {
      console.error('Falha ao carregar relatório mensal:', err);
      setError(err?.message || 'Erro ao conectar à API de relatórios.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [selectedMonth, selectedGenId]);

  // Navegação rápida de meses
  const handlePrevMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    setSelectedMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [y, m] = selectedMonth.split('-').map(Number);
    const next = new Date(y, m, 1);
    setSelectedMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };

  // Formatação amigável de durações em segundos
  const formatDuration = (seconds: number) => {
    if (!seconds || seconds <= 0) return '0 min';
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    if (hrs > 0) {
      return `${hrs}h ${mins > 0 ? `${mins}min` : ''}`;
    }
    return `${mins} min`;
  };

  // Formatação de data/hora
  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return dateStr;
    }
  };

  const [yearStr, monthStr] = selectedMonth.split('-');
  const monthIndex = parseInt(monthStr, 10) - 1;
  const monthDisplay = `${MONTH_NAMES[monthIndex]} de ${yearStr}`;

  return (
    <div className="space-y-6">
      {/* =========================================================
          PAINEL DE CONTROLE DE FILTROS & AÇÕES (Oculto na Impressão)
         ========================================================= */}
      <div className="print:hidden space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-ciklo-card p-4 rounded-xl border border-gray-800">
          <div>
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
              <FileText className="text-ciklo-orange" size={24} /> Relatórios Operacionais
            </h2>
            <p className="text-gray-400 text-sm">
              Geração de laudos mensais de disponibilidade, quedas de rede e consumo
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => window.print()}
              disabled={loading || !report}
              className="flex items-center gap-2 bg-ciklo-orange hover:bg-orange-600 disabled:opacity-50 text-white px-5 py-2.5 rounded-lg font-bold transition-all shadow-lg shadow-orange-500/10 cursor-pointer"
            >
              <Printer size={18} /> Imprimir / Salvar PDF
            </button>
          </div>
        </div>

        {/* Barra de Filtros & Configuração */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-ciklo-card p-4 rounded-xl border border-gray-800">
          {/* Seletor de Gerador */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">
              Gerador Analisado
            </label>
            <select
              value={selectedGenId}
              onChange={(e) => setSelectedGenId(e.target.value)}
              className="w-full bg-ciklo-black border border-gray-700 text-white rounded-lg px-3 py-2 text-sm focus:border-ciklo-orange outline-none"
            >
              {report?.generatorsList && report.generatorsList.length > 0 ? (
                <>
                  {report.generatorsList.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.model || 'GMG'} - {g.powerKva} kVA)
                    </option>
                  ))}
                  {report.generatorsList.length > 1 && (
                    <option value="all">Todos os Geradores (Frota Consolidada)</option>
                  )}
                </>
              ) : generators.length > 0 ? (
                <>
                  {generators.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.name} ({g.model || 'GMG'} - {g.powerKVA} kVA)
                    </option>
                  ))}
                  {generators.length > 1 && (
                    <option value="all">Todos os Geradores (Frota Consolidada)</option>
                  )}
                </>
              ) : (
                <option value="">Nenhum gerador disponível</option>
              )}
            </select>
          </div>

          {/* Seletor de Mês */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">
              Mês de Referência
            </label>
            <div className="flex items-center gap-1">
              <button
                onClick={handlePrevMonth}
                className="p-2 bg-ciklo-black border border-gray-700 hover:border-gray-600 text-gray-300 rounded-lg"
                title="Mês Anterior"
              >
                <ChevronLeft size={16} />
              </button>
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="flex-1 bg-ciklo-black border border-gray-700 text-white rounded-lg px-3 py-1.5 text-sm text-center focus:border-ciklo-orange outline-none"
              />
              <button
                onClick={handleNextMonth}
                className="p-2 bg-ciklo-black border border-gray-700 hover:border-gray-600 text-gray-300 rounded-lg"
                title="Mês Seguinte"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>

          {/* Dados do Responsável Técnico */}
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1">
              Responsável Técnico (Nome / CREA-CFT)
            </label>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="Nome do Técnico"
                value={techName}
                onChange={(e) => handleSaveTechInfo(e.target.value, techCrea, techRole)}
                className="bg-ciklo-black border border-gray-700 text-white rounded-lg px-2.5 py-2 text-xs focus:border-ciklo-orange outline-none"
              />
              <input
                type="text"
                placeholder="CREA / CFT"
                value={techCrea}
                onChange={(e) => handleSaveTechInfo(techName, e.target.value, techRole)}
                className="bg-ciklo-black border border-gray-700 text-white rounded-lg px-2.5 py-2 text-xs focus:border-ciklo-orange outline-none"
              />
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================
          DOCUMENTO OFICIAL DO LAUDO (Visível na Tela e na Impressão)
         ========================================================= */}
      {loading ? (
        <div className="p-12 text-center text-gray-400 bg-ciklo-card rounded-xl border border-gray-800">
          <div className="w-8 h-8 border-2 border-ciklo-orange border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          Carregando dados operacionais e calculando métricas do mês...
        </div>
      ) : error ? (
        <div className="p-8 text-center bg-ciklo-card rounded-xl border border-red-800/60 max-w-xl mx-auto space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 flex items-center justify-center mx-auto">
            <AlertTriangle size={24} />
          </div>
          <div>
            <h3 className="text-white font-bold text-base mb-1">Não foi possível gerar o relatório</h3>
            <p className="text-gray-400 text-sm">{error}</p>
          </div>
          <button
            onClick={fetchReport}
            className="px-4 py-2 bg-ciklo-orange hover:bg-orange-600 text-white rounded-lg font-medium text-sm transition-colors inline-flex items-center gap-2 cursor-pointer"
          >
            <RotateCcw size={16} /> Tentar Novamente
          </button>
        </div>
      ) : report ? (
        <div className="report-container max-w-[210mm] mx-auto bg-white text-gray-900 rounded-xl shadow-2xl overflow-hidden border border-gray-200 print:border-none print:shadow-none print:rounded-none">
          {/* Cabeçalho Timbrado Ciklo Oficial */}
          <div className="letterhead-header border-b border-gray-200">
            <img
              src="/timbrada_header.png"
              alt="Ciklo Geradores"
              className="w-full block"
              onError={(e) => {
                // Fallback elegante caso a imagem não carregue
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>

          <div className="p-6 md:p-8 space-y-6">
            {/* Título do Documento */}
            <div className="text-center border-b border-gray-300 pb-4">
              <div className="inline-block bg-orange-100 text-orange-800 text-xs font-bold px-3 py-1 rounded-full uppercase tracking-wider mb-1">
                Laudo Técnico Mensal
              </div>
              <h1 className="text-2xl font-black text-gray-900 tracking-tight">
                RELATÓRIO DE OPERAÇÃO E CONFIABILIDADE
              </h1>
              <p className="text-sm font-semibold text-gray-600 uppercase">
                Período de Apuração: <span className="text-orange-600 font-bold">{monthDisplay}</span>
              </p>
            </div>

            {/* Identificação do Equipamento e Cliente */}
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200 grid grid-cols-2 md:grid-cols-3 gap-3 text-xs">
              <div>
                <span className="font-bold text-gray-500 uppercase block">Grupo Gerador:</span>
                <span className="font-bold text-gray-900 text-sm">{report.generator?.name || 'Não identificado'}</span>
              </div>
              <div>
                <span className="font-bold text-gray-500 uppercase block">Modelo / Fabricante:</span>
                <span className="font-semibold text-gray-800">{report.generator?.model}</span>
              </div>
              <div>
                <span className="font-bold text-gray-500 uppercase block">Potência Nominal:</span>
                <span className="font-bold text-orange-600">{report.generator?.powerKva} kVA</span>
              </div>
              <div>
                <span className="font-bold text-gray-500 uppercase block">Nº de Série do Controlador:</span>
                <span className="font-mono font-bold text-gray-800">{report.generator?.serialNumber}</span>
              </div>
              <div>
                <span className="font-bold text-gray-500 uppercase block">Localização / Unidade:</span>
                <span className="font-semibold text-gray-800">{report.generator?.location}</span>
              </div>
              <div>
                <span className="font-bold text-gray-500 uppercase block">Cliente / Empresa:</span>
                <span className="font-bold text-gray-900">{report.generator?.companyName}</span>
              </div>
            </div>

            {/* =========================================================
                CARDS DOS 4 INDICADORES CHAVE (KPIs EXECUTIVOS)
               ========================================================= */}
            <div>
              <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
                1. Indicadores Chave de Desempenho (Mês de Referência)
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {/* 1. Horas Operadas */}
                <div className="bg-gradient-to-br from-yellow-50 to-white p-4 rounded-xl border border-yellow-200">
                  <div className="flex items-center gap-2 text-yellow-700 text-xs font-bold mb-1">
                    <Clock size={16} /> Horas Operadas
                  </div>
                  <div className="text-2xl font-black text-gray-900">
                    {report.kpis.totalOperatingHours}h
                  </div>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Energia: <strong>{report.kpis.totalEnergyKwh.toLocaleString('pt-BR')} kWh</strong>
                  </p>
                  <div className="mt-2 text-[10px] inline-flex items-center gap-1 font-bold text-green-700 bg-green-100 px-1.5 py-0.5 rounded">
                    <CheckCircle2 size={10} /> Disp: {report.kpis.availabilityPercent}%
                  </div>
                </div>

                {/* 2. Quedas de Concessionária */}
                <div className="bg-gradient-to-br from-red-50 to-white p-4 rounded-xl border border-red-200">
                  <div className="flex items-center gap-2 text-red-700 text-xs font-bold mb-1">
                    <ZapOff size={16} /> Quedas de Rede
                  </div>
                  <div className="text-2xl font-black text-gray-900">
                    {report.kpis.mainsOutagesCount}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Tempo em backup:
                  </p>
                  <p className="text-[11px] font-bold text-red-700">
                    {formatDuration(report.kpis.mainsBackupDurationSeconds)}
                  </p>
                </div>

                {/* 3. Consumo Estimado de Diesel */}
                <div className="bg-gradient-to-br from-orange-50 to-white p-4 rounded-xl border border-orange-200">
                  <div className="flex items-center gap-2 text-orange-700 text-xs font-bold mb-1">
                    <Fuel size={16} /> Diesel Estimado
                  </div>
                  <div className="text-2xl font-black text-gray-900">
                    {report.kpis.estimatedDieselLiters.toLocaleString('pt-BR')} L
                  </div>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Média operacional:
                  </p>
                  <p className="text-[11px] font-bold text-orange-700">
                    {report.kpis.avgConsumptionPerHour} L/hora
                  </p>
                </div>

                {/* 4. Falhas e Alarmes */}
                <div className="bg-gradient-to-br from-gray-50 to-white p-4 rounded-xl border border-gray-200">
                  <div className="flex items-center gap-2 text-gray-700 text-xs font-bold mb-1">
                    <AlertTriangle size={16} /> Ocorrências
                  </div>
                  <div className="text-2xl font-black text-gray-900">
                    {report.kpis.totalAlarmsCount}
                  </div>
                  <p className="text-[10px] text-gray-500 mt-0.5">
                    Falhas críticas: <strong>{report.kpis.totalFaultsCount}</strong>
                  </p>
                  <p className="text-[10px] text-gray-500">
                    Avisos preventivos: <strong>{report.kpis.totalWarningsCount}</strong>
                  </p>
                </div>
              </div>
            </div>

            {/* =========================================================
                GRÁFICO DE OPERAÇÃO DIÁRIA (HORAS NO MÊS)
               ========================================================= */}
            <div className="border border-gray-200 rounded-xl p-4 bg-gray-50/50">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                  2. Gráfico de Operação Diária do Grupo Gerador (Horas / Dia)
                </h3>
                <span className="text-[10px] text-gray-500 font-semibold">
                  Mês de {monthDisplay}
                </span>
              </div>
              <div className="h-44 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={report.dailyOperation} margin={{ top: 5, right: 10, left: -25, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="day" tickLine={false} stroke="#9ca3af" fontSize={10} />
                    <YAxis tickLine={false} stroke="#9ca3af" fontSize={10} unit="h" />
                    <Tooltip
                      formatter={(val: any) => [`${val} horas`, 'Horas de Operação']}
                      labelFormatter={(label) => `Dia ${label} de ${monthDisplay}`}
                      contentStyle={{ backgroundColor: '#fff', borderColor: '#e5e7eb', fontSize: '11px' }}
                    />
                    <Bar dataKey="hours" fill="#F97316" radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* =========================================================
                TABELA DE QUEDAS DE CONCESSIONÁRIA & TEMPO EM BACKUP
               ========================================================= */}
            <div>
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                3. Interrupções da Concessionária de Energia no Período
              </h3>
              {report.mainsOutages.length === 0 ? (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
                  <span>
                    Nenhuma interrupção da rede elétrica da concessionária registrada neste gerador durante o mês de {monthDisplay}.
                  </span>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-gray-100 text-gray-600 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="p-2 border-b border-gray-200">Início da Falha</th>
                        <th className="p-2 border-b border-gray-200">Normalização</th>
                        <th className="p-2 border-b border-gray-200 text-center">Tempo em Gerador</th>
                        <th className="p-2 border-b border-gray-200">Situação</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-800">
                      {report.mainsOutages.map((outage) => (
                        <tr key={outage.id}>
                          <td className="p-2 font-mono">{formatDateTime(outage.startTime)}</td>
                          <td className="p-2 font-mono">{formatDateTime(outage.endTime)}</td>
                          <td className="p-2 text-center font-bold text-orange-600">
                            {formatDuration(outage.durationSeconds)}
                          </td>
                          <td className="p-2">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              outage.status === 'NORMALIZADO' 
                                ? 'bg-green-100 text-green-800' 
                                : 'bg-red-100 text-red-800 animate-pulse'
                            }`}>
                              {outage.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {/* =========================================================
                TABELA DE FALHAS E ALARMES REGISTRADOS
               ========================================================= */}
            <div>
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                4. Ocorrências, Falhas e Avisos do Controlador
              </h3>
              {report.alarms.length === 0 ? (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-800 flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-green-600 flex-shrink-0" />
                  <span>
                    Nenhum alarme de falha crítica ou aviso registrado no controlador durante este período de operação.
                  </span>
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-gray-100 text-gray-600 font-bold uppercase text-[10px]">
                      <tr>
                        <th className="p-2 border-b border-gray-200">Data / Hora</th>
                        <th className="p-2 border-b border-gray-200 text-center">Tipo</th>
                        <th className="p-2 border-b border-gray-200">Descrição do Evento</th>
                        <th className="p-2 border-b border-gray-200 text-center">Duração</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 text-gray-800">
                      {report.alarms.slice(0, 10).map((alarm) => (
                        <tr key={alarm.id}>
                          <td className="p-2 font-mono whitespace-nowrap">{formatDateTime(alarm.startTime)}</td>
                          <td className="p-2 text-center">
                            <span className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${
                              alarm.alarmType === 'FALHA'
                                ? 'bg-red-100 text-red-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {alarm.alarmType}
                            </span>
                          </td>
                          <td className="p-2 font-medium">{alarm.alarmMessage}</td>
                          <td className="p-2 text-center font-mono text-gray-600">
                            {formatDuration(alarm.durationSeconds)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {report.alarms.length > 10 && (
                    <div className="p-1.5 bg-gray-50 text-center text-[10px] text-gray-500 font-semibold border-t border-gray-200">
                      Exibindo as 10 ocorrências mais relevantes de um total de {report.alarms.length}.
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* =========================================================
                PARECER TÉCNICO & ASSINATURA FORMAL
               ========================================================= */}
            <div className="pt-2 border-t border-gray-300 page-break-inside-avoid">
              <h3 className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                5. Parecer Técnico & Assinatura do Responsável
              </h3>

              {/* Caixa de Parecer Técnico */}
              <div className="mb-8">
                <label className="block text-[10px] text-gray-500 font-bold uppercase mb-1">
                  Parecer Conclusivo da Engenharia / Operação:
                </label>
                <div className="print:hidden">
                  <textarea
                    rows={3}
                    value={techNotes}
                    onChange={(e) => setTechNotes(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-gray-300 focus:border-orange-500 outline-none text-gray-800 leading-relaxed"
                  />
                </div>
                {/* Visualização de Impressão */}
                <div className="hidden print:block text-xs text-gray-800 p-2.5 bg-gray-50 border border-gray-200 rounded leading-relaxed text-justify">
                  {techNotes || 'Equipamento revisado e em plena condição de operação.'}
                </div>
              </div>

              {/* Campo Formal de Assinatura */}
              <div className="grid grid-cols-2 gap-8 pt-6">
                <div className="text-center">
                  <div className="border-b border-gray-800 w-4/5 mx-auto mb-1.5" />
                  <p className="font-bold text-xs text-gray-900">
                    {techName || 'Nome do Responsável Técnico'}
                  </p>
                  <p className="text-[10px] text-gray-600">
                    {techRole}
                  </p>
                  <p className="text-[10px] text-gray-500 font-mono">
                    {techCrea ? `Registro: ${techCrea}` : 'CREA / CFT: _______________'}
                  </p>
                </div>

                <div className="text-center">
                  <div className="border-b border-gray-800 w-4/5 mx-auto mb-1.5" />
                  <p className="font-bold text-xs text-gray-900">
                    {report.generator?.companyName || 'Gestor da Instalação / Cliente'}
                  </p>
                  <p className="text-[10px] text-gray-600">
                    Ciência da Operação e Fiscalização
                  </p>
                  <p className="text-[10px] text-gray-500">
                    Emissão: {new Date().toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Rodapé Timbrado Ciklo Oficial */}
          <div className="letterhead-footer border-t border-gray-200 mt-6">
            <img
              src="/timbrada_footer.png"
              alt=""
              className="w-full block"
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
        </div>
      ) : (
        <div className="p-8 text-center text-gray-400 bg-ciklo-card rounded-xl border border-gray-800">
          Nenhum gerador encontrado para geração de relatórios.
        </div>
      )}
    </div>
  );
};

export default Reports;