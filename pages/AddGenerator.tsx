
import React, { useState, useEffect } from 'react';
import { Save, Server, Cpu, MapPin, Zap } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useGenerators } from '../context/GeneratorContext';
import { Generator, GeneratorStatus } from '../types';

const AddGenerator: React.FC = () => {
  const navigate = useNavigate();
  const { id } = useParams(); // Get ID from URL if editing
  const { addGenerator, updateGenerator, generators } = useGenerators();
  const [loading, setLoading] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    name: '',
    location: '',
    model: '',
    power: '',
    connectionName: '',
    controller: 'dse',
    protocol: 'modbus_tcp',
    ip: '',
    port: '',
    slaveId: '1'
  });

  // Load existing data if editing
  useEffect(() => {
    if (id) {
      const existingGen = generators.find(g => g.id === id);
      if (existingGen) {
        setFormData({
          name: existingGen.name,
          location: existingGen.location,
          model: existingGen.model,
          power: existingGen.powerKVA.toString(),
          connectionName: existingGen.connectionName || '',
          controller: existingGen.controller || 'dse',
          protocol: existingGen.protocol || 'modbus_tcp',
          ip: existingGen.ip || '',
          port: existingGen.port || '',
          slaveId: existingGen.slaveId || '1'
        });
      }
    }
  }, [id, generators]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
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
          slaveId: formData.slaveId
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
        slaveId: formData.slaveId
      };
      addGenerator(newGen);
    }

    // Simulate API delay for UX
    setTimeout(() => {
      setLoading(false);
      navigate(id ? '/fleet' : '/');
    }, 1000);
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
            <label className="block text-sm text-gray-400 mb-1">Tipo de Controlador</label>
            <select 
              name="controller"
              value={formData.controller}
              onChange={handleChange}
              className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none transition-colors"
            >
              <option value="dse">Deep Sea Electronics (DSE)</option>
              <option value="comap">ComAp</option>
              <option value="deif">DEIF</option>
              <option value="kvar">KVA</option>
            </select>
          </div>

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
              <label className="block text-sm text-gray-400 mb-1">Endereço IP / Host</label>
              <input 
                type="text" 
                name="ip"
                value={formData.ip}
                onChange={handleChange}
                className="w-full bg-ciklo-black border border-gray-700 rounded-lg p-2.5 text-white focus:border-ciklo-orange outline-none transition-colors"
                placeholder="192.168.1.100" 
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
    </div>
  );
};

export default AddGenerator;
