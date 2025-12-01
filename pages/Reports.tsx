import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from 'recharts';
import { FileDown } from 'lucide-react';

const dataPower = [
  { time: '00:00', kw: 120 },
  { time: '04:00', kw: 110 },
  { time: '08:00', kw: 350 },
  { time: '12:00', kw: 480 },
  { time: '16:00', kw: 420 },
  { time: '20:00', kw: 200 },
  { time: '23:59', kw: 150 },
];

const dataFuel = [
  { day: 'Seg', l: 40 },
  { day: 'Ter', l: 35 },
  { day: 'Qua', l: 50 },
  { day: 'Qui', l: 45 },
  { day: 'Sex', l: 60 },
  { day: 'Sab', l: 20 },
  { day: 'Dom', l: 15 },
];

const Reports: React.FC = () => {
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-2xl font-bold text-white">Relatórios Operacionais</h2>
          <p className="text-gray-400 text-sm">Análise de performance e consumo</p>
        </div>
        <button className="flex items-center gap-2 bg-ciklo-orange hover:bg-orange-600 text-white px-4 py-2 rounded-lg font-medium transition-colors">
          <FileDown size={18} /> Exportar PDF
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Power Chart */}
        <div className="bg-ciklo-card p-6 rounded-xl border border-gray-800">
          <h3 className="text-lg font-bold text-white mb-6">Curva de Carga (Últimas 24h)</h3>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={dataPower}>
                <defs>
                  <linearGradient id="colorKw" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FACC15" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#FACC15" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="time" stroke="#666" />
                <YAxis stroke="#666" />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1E1E1E', borderColor: '#333' }}
                  itemStyle={{ color: '#FACC15' }}
                />
                <Area type="monotone" dataKey="kw" stroke="#FACC15" fillOpacity={1} fill="url(#colorKw)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Fuel Consumption */}
        <div className="bg-ciklo-card p-6 rounded-xl border border-gray-800">
          <h3 className="text-lg font-bold text-white mb-6">Consumo Diário (Litros)</h3>
          <div className="h-[300px] w-full">
             <ResponsiveContainer width="100%" height="100%">
              <BarChart data={dataFuel}>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" />
                <XAxis dataKey="day" stroke="#666" />
                <YAxis stroke="#666" />
                <Tooltip 
                  cursor={{fill: 'transparent'}}
                  contentStyle={{ backgroundColor: '#1E1E1E', borderColor: '#333' }}
                />
                <Legend />
                <Bar dataKey="l" name="Litros" fill="#F97316" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Summary Table */}
      <div className="bg-ciklo-card rounded-xl border border-gray-800 overflow-hidden">
        <div className="p-6 border-b border-gray-800">
          <h3 className="text-lg font-bold text-white">Resumo Mensal</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-800 text-gray-400 text-xs uppercase">
              <tr>
                <th className="p-4">Gerador</th>
                <th className="p-4">Horas Operadas</th>
                <th className="p-4">Total KW Gerado</th>
                <th className="p-4">Consumo Médio (L/h)</th>
                <th className="p-4">Eficiência</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-800 text-sm text-gray-300">
              <tr>
                <td className="p-4 font-bold text-white">Gerador Principal - Sede</td>
                <td className="p-4">145h</td>
                <td className="p-4">42,500 kW</td>
                <td className="p-4">28.5 L/h</td>
                <td className="p-4 text-green-400">98%</td>
              </tr>
              <tr>
                <td className="p-4 font-bold text-white">Gerador Backup - Datacenter</td>
                <td className="p-4">12h</td>
                <td className="p-4">2,100 kW</td>
                <td className="p-4">22.1 L/h</td>
                <td className="p-4 text-green-400">100%</td>
              </tr>
               <tr>
                <td className="p-4 font-bold text-white">Unidade Móvel 04</td>
                <td className="p-4">210h</td>
                <td className="p-4">18,200 kW</td>
                <td className="p-4">15.4 L/h</td>
                <td className="p-4 text-yellow-400">92%</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Reports;