
import React, { useState, useEffect, useRef } from 'react';
import { Save, Server, Cpu, MapPin, Zap, Building, AlertTriangle, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGenerators } from '../context/GeneratorContext';
import { useAuth } from '../context/AuthContext';
import { Generator, GeneratorStatus, Company } from '../types';

type GeneratorFormData = {
  name: string;
  location: string;
  model: string;
  power: string;
  connectionName: string;
  controller: string;
  protocol: string;
  ip: string;
  port: string;
  slaveId: string;
  deviceType: string;
  companyId: string;
  agc150Profile: string;
};

const AddGenerator: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams(); // Get ID from URL if editing
  const { addGenerator, updateGenerator, generators } = useGenerators();
  const { token } = useAuth();
  const [loading, setLoading] = useState(false);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [showConfirm, setShowConfirm] = useState(false);

  // Form State
  const [formData, setFormData] = useState<GeneratorFormData>({
    name: '',
    location: '',
    model: '',
    power: '',
    connectionName: '',
    controller: 'dse',
    protocol: 'modbus_tcp',
    ip: '',
    port: '',
    slaveId: '1',
    deviceType: 'modem',
    companyId: '',
    agc150Profile: 'gen',
  });

  // Snapshot of the originally loaded values (for change detection)
  const initialDataRef = useRef<GeneratorFormData | null>(null);
  // Ensures the form is populated only once, so live Socket.IO telemetry
  // updates don't overwrite what the user is typing.
  const hydratedRef = useRef(false);

  // Fetch companies list
  useEffect(() => {
    if (token) {
      fetch('/api/companies', {
        headers: { Authorization: `Bearer ${token}` }
      })
        .then(res => res.json())
        .then(data => setCompanies(data))
        .catch(err => console.error('Error fetching companies in AddGenerator:', err));
    }
  }, [token]);

  // Reset hydration flag when switching to a different generator
  useEffect(() => {
    hydratedRef.current = false;
    initialDataRef.current = null;
  }, [id]);

  // Load existing data if editing — only once, to avoid live telemetry
  // updates (Socket.IO) from resetting the fields while the user edits.
  useEffect(() => {
    if (id && !hydratedRef.current) {
      const existingGen = generators.find(g => g.id === id);
      if (existingGen) {
        const loaded: GeneratorFormData = {
          name: existingGen.name,
          location: existingGen.location,
          model: existingGen.model,
          power: existingGen.powerKVA.toString(),
          connectionName: existingGen.connectionName || '',
          controller: existingGen.controller || 'dse',
          protocol: existingGen.protocol || 'modbus_tcp',
          ip: existingGen.ip || '',
          port: existingGen.port || '',
          slaveId: existingGen.slaveId || '1',
          deviceType: existingGen.deviceType || 'modem',
          companyId: existingGen.companyId ? existingGen.companyId.toString() : '',
          agc150Profile: existingGen.agc150Profile || 'gen',
        };
        setFormData(loaded);
        initialDataRef.current = loaded;
        hydratedRef.current = true;
      }
    }
  }, [id, generators]);

  const hasChanges = () => {
    if (!initialDataRef.current) return true;
    return (Object.keys(formData) as (keyof GeneratorFormData)[]).some(
      key => formData[key] !== initialDataRef.current![key]
    );
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => {
      const updated = { ...prev, [name]: value };
      // Auto-select deviceType when controller changes
      if (name === 'controller') {
        if (value === 'kvar' || value === 'dse' || value === 'sgc420' || value === 'agc150' || value === 'cummins') {
          updated.deviceType = 'dr164'; // KVA, DSE, SGC420, AGC150 e Cummins usam modo transparente (DR164/USR162)
        }
      }
      return updated;
    });
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    // Edit mode: ask for confirmation only when something actually changed
    if (id) {
      if (!hasChanges()) {
        navigate('/fleet');
        return;
      }
      setShowConfirm(true);
      return;
    }

    doSave();
  };

  const doSave = () => {
    setShowConfirm(false);
    setLoading(true);

    if (id) {
      // Edit Mode
      const existingGen = generators.find(g => g.id === id);
      if (existingGen) {
        const updatedGen: Generator = {
          ...existingGen,
          name: formData.name,
          location: formData.location,
          model: formData.model,
          powerKVA: Number(formData.power),
          connectionName: formData.connectionName,
          controller: formData.controller,
          protocol: formData.protocol,
          ip: formData.ip,
          port: formData.port,
          slaveId: formData.slaveId,
          deviceType: formData.deviceType,
          companyId: formData.companyId ? Number(formData.companyId) : undefined,
          agc150Profile: formData.controller === 'agc150' ? formData.agc150Profile : undefined,
        };
        updateGenerator(updatedGen);
      }
    } else {
      // Add Mode
      const newGen: Generator = {
        id: `GEN-${Date.now()}`,
        name: formData.name,
        location: formData.location,
        model: formData.model,
        powerKVA: Number(formData.power),
        status: GeneratorStatus.STOPPED, // Default to stopped
        fuelLevel: 100, // Default full tank
        engineTemp: 25, // Ambient temp
        oilPressure: 0,
        batteryVoltage: 24, // Standard battery
        rpm: 0,
        totalHours: 0,
        lastMaintenance: new Date().toISOString().split('T')[0],
        voltageL1: 0,
        voltageL2: 0,
        voltageL3: 0,
        currentL1: 0,
        currentL2: 0,
        currentL3: 0,
        frequency: 0,
        powerFactor: 0,
        activePower: 0,
        connectionName: formData.connectionName,
        controller: formData.controller,
        protocol: formData.protocol,
        ip: formData.ip,
        port: formData.port,
        slaveId: formData.slaveId,
        deviceType: formData.deviceType,
        companyId: formData.companyId ? Number(formData.companyId) : undefined,
        agc150Profile: formData.controller === 'agc150' ? formData.agc150Profile : undefined,
      };
      addGenerator(newGen);
    }

    // TODO: Wait for real API success response
    setLoading(false);
    navigate(id ? '/fleet' : '/');
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h2 className="text-2xl font-bold text-white">{id ? 'Editar Gerador' : 'Adicionar Novo Gerador'}</h2>
        <p className="text-gray-400 text-sm">Cadastro e configuração de comunicação</p>
      </div>

      <form onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* General Info Card */}
        <div className="bg-ciklo-card p-6 rounded-xl border border-gray-800 space-y-4">
          <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
            <Cpu className="text-ciklo-yellow" size={20} /> Informações Gerais
          </h3>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Nome do Gerador</label>
            <input
              type="text"
              name="name"
              value={formData.name}
              onChange={handleChange}
              required
              className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none transition-colors"
              placeholder="Ex: Gerador Principal - Sede"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Localização</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-2.5 text-gray-600" size={18} />
              <input
                type="text"
                name="location"
                value={formData.location}
                onChange={handleChange}
                required
                className="w-full bg-ciklo-black border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-white focus:border-ciklo-orange outline-none transition-colors"
                placeholder="Ex: São Paulo, SP"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Modelo / Fabricante</label>
              <input
                type="text"
                name="model"
                value={formData.model}
                onChange={handleChange}
                required
                className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none transition-colors"
                placeholder="Ex: Ciklo Power 500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Potência (kVA)</label>
              <div className="relative">
                <Zap className="absolute left-3 top-2.5 text-gray-600" size={18} />
                <input
                  type="number"
                  name="power"
                  value={formData.power}
                  onChange={handleChange}
                  required
                  className="w-full bg-ciklo-black border border-gray-700 rounded-lg py-2.5 pl-10 pr-4 text-white focus:border-ciklo-orange outline-none transition-colors"
                  placeholder="500"
                />
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1 flex items-center gap-1.5">
              <Building size={16} className="text-gray-500" /> Empresa / Grupo Responsável
            </label>
            <select
              name="companyId"
              value={formData.companyId}
              onChange={handleChange}
              className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none transition-colors"
            >
              <option value="">Nenhuma Empresa / Sem Grupo</option>
              {companies.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Connectivity Card */}
        <div className="bg-ciklo-card p-6 rounded-xl border border-gray-800 space-y-4">
          <h3 className="text-lg font-bold text-white mb-2 flex items-center gap-2">
            <Server className="text-blue-500" size={20} /> Conectividade
          </h3>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Nome da Conectividade</label>
            <input
              type="text"
              name="connectionName"
              value={formData.connectionName}
              onChange={handleChange}
              className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none transition-colors"
              placeholder="Ex: Modbus Local"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Dispositivo de Telemetria</label>
            <select
              name="deviceType"
              value={formData.deviceType}
              onChange={handleChange}
              className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none transition-colors"
            >
              <option value="modem">Modem Telemetria (JSON/4G)</option>
              <option value="dr164">USR-DR164 / USR-162 (Transparente)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">Tipo de Controlador</label>
            <select
              name="controller"
              value={formData.controller}
              onChange={handleChange}
              className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none transition-colors"
            >
              <option value="dse">Deep Sea DSE4501 (GenComm)</option>
              <option value="comap">ComAp</option>
              <option value="deif">DEIF SGC 120</option>
              <option value="sgc420">DEIF SGC 420</option>
              <option value="agc150">DEIF AGC 150</option>
              <option value="kvar">KVA</option>
              <option value="cummins">Cummins PowerCommand (PCC 1301)</option>
            </select>
          </div>

          {formData.controller === 'agc150' && (
            <div>
              <label className="block text-sm text-gray-400 mb-1">Perfil de barramento AGC 150</label>
              <select
                name="agc150Profile"
                value={formData.agc150Profile}
                onChange={handleChange}
                className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none transition-colors"
              >
                <option value="gen">Gerador (501 = GMG — padrão)</option>
                <option value="btb">BTB (501 = Rede, 539 = GMG)</option>
                <option value="mains">Rede (501 = Rede)</option>
              </select>
              <p className="text-xs text-gray-500 mt-1">
                No AGC 150 os endereços Modbus 501–519 representam Gerador ou Rede conforme a aplicação do controlador.
              </p>
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-1">Protocolo de Comunicação</label>
            <select
              name="protocol"
              value={formData.protocol}
              onChange={handleChange}
              className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none transition-colors"
            >
              <option value="modbus_tcp">Modbus TCP/IP</option>
              <option value="modbus_rtu">Modbus RTU (Serial)</option>
              <option value="mqtt">MQTT (IoT)</option>
              <option value="snmp">SNMP</option>
            </select>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="col-span-2">
              <label className="block text-sm text-gray-400 mb-1">
                {formData.protocol === 'mqtt' ? 'ID do Dispositivo (Tópico)' : 'Endereço IP / Host'}
              </label>
              <input
                type="text"
                name="ip"
                value={formData.ip}
                onChange={handleChange}
                className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none transition-colors"
                placeholder={formData.protocol === 'mqtt' ? "Ex: Ciklo0" : "192.168.1.100"}
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Porta</label>
              <input
                type="number"
                name="port"
                value={formData.port}
                onChange={handleChange}
                className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none transition-colors"
                placeholder="502"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-1">ID Escravo (Slave ID)</label>
            <input
              type="number"
              name="slaveId"
              value={formData.slaveId}
              onChange={handleChange}
              className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none transition-colors"
              placeholder="1"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="lg:col-span-2 flex justify-end pt-4">
          <button
            type="button"
            onClick={() => navigate('/fleet')}
            className="mr-4 px-6 py-3 rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-8 py-3 bg-gradient-to-r from-ciklo-yellow to-ciklo-orange hover:from-orange-500 hover:to-orange-600 text-black font-bold rounded-lg shadow-lg shadow-orange-900/20 transform hover:-translate-y-0.5 transition-all flex items-center gap-2"
          >
            {loading ? (
              <div className="w-5 h-5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
            ) : (
              <>
                <Save size={20} /> {id ? 'Atualizar Gerador' : 'Salvar Gerador'}
              </>
            )}
          </button>
        </div>
      </form>

      {/* Confirmation modal — shown only when editing and there are changes */}
      {showConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-ciklo-card border border-gray-700 rounded-2xl shadow-2xl shadow-black/50 max-w-md w-full p-6 space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-12 h-12 rounded-xl bg-ciklo-orange/15 border border-ciklo-orange/30 flex items-center justify-center shrink-0">
                <AlertTriangle className="text-ciklo-orange" size={24} />
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-white">Confirmar atualização</h3>
                <p className="text-sm text-gray-400 mt-1">
                  Você está prestes a alterar as informações de
                  <span className="text-white font-semibold"> {formData.name || 'este gerador'}</span>.
                  Deseja realmente salvar as alterações?
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="text-gray-500 hover:text-white p-1"
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="px-5 py-2.5 rounded-lg text-gray-300 hover:text-white hover:bg-gray-800 transition-colors font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={doSave}
                disabled={loading}
                className="px-6 py-2.5 bg-gradient-to-r from-ciklo-yellow to-ciklo-orange hover:from-orange-500 hover:to-orange-600 text-black font-bold rounded-lg shadow-lg flex items-center gap-2 disabled:opacity-50 transition-all"
              >
                <Save size={18} /> Sim, atualizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AddGenerator;
