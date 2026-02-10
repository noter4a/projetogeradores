
import React, { useState } from 'react';
import { UserPlus, Save, X, Shield, Lock, Mail, CheckCircle, AlertTriangle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

const AdminUserCreate = () => {
    const { user, token } = useAuth();
    const navigate = useNavigate();

    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        role: 'CLIENT', // Default
        assigned_generators: []
    });

    const [status, setStatus] = useState({ type: '', message: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Redirect if not admin
    if (!user || user.role !== 'ADMIN') {
        return (
            <div className="flex h-screen items-center justify-center bg-gray-900 text-white">
                <div className="text-center p-8 bg-gray-800 rounded-xl border border-red-500/30">
                    <Shield size={48} className="text-red-500 mx-auto mb-4" />
                    <h2 className="text-2xl font-bold mb-2">Acesso Negado</h2>
                    <p className="text-gray-400">Apenas administradores podem acessar esta página.</p>
                    <button
                        onClick={() => navigate('/')}
                        className="mt-6 px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded-lg transition-colors"
                    >
                        Voltar ao Início
                    </button>
                </div>
            </div>
        );
    }

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleGeneratorChange = (e) => {
        // Simple comma-separated string to array
        const value = e.target.value;
        const array = value.split(',').map(s => s.trim()).filter(s => s.length > 0);
        setFormData(prev => ({
            ...prev,
            assigned_generators: array
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setStatus({ type: '', message: '' });

        try {
            // Updated to use relative path (proxied by Vite or Nginx)
            const response = await fetch('/api/auth/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify(formData)
            });

            const data = await response.json();

            if (response.ok) {
                setStatus({ type: 'success', message: 'Usuário criado com sucesso!' });
                setFormData({
                    name: '',
                    email: '',
                    password: '',
                    role: 'CLIENT',
                    assigned_generators: []
                });
            } else {
                setStatus({ type: 'error', message: data.message || 'Erro ao criar usuário.' });
            }

        } catch (error) {
            console.error('Network error:', error);
            setStatus({ type: 'error', message: 'Erro de conexão com o servidor.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-ciklo-dark text-white p-6">
            <div className="max-w-2xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div className="flex items-center gap-3">
                        <div className="p-3 bg-blue-500/20 rounded-xl border border-blue-500/30">
                            <UserPlus className="text-blue-400" size={24} />
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold">Novo Usuário</h1>
                            <p className="text-gray-400 text-sm">Cadastrar acesso ao sistema</p>
                        </div>
                    </div>
                    <button
                        onClick={() => navigate('/dashboard')}
                        className="p-2 hover:bg-gray-800 rounded-lg text-gray-400 transition-colors"
                    >
                        <X size={24} />
                    </button>
                </div>

                {/* Form Card */}
                <div className="bg-ciklo-card rounded-xl border border-gray-800 p-6 shadow-xl">

                    {/* Status Message */}
                    {status.message && (
                        <div className={`mb-6 p-4 rounded-lg flex items-start gap-3 border ${status.type === 'success'
                            ? 'bg-green-500/10 border-green-500/30 text-green-400'
                            : 'bg-red-500/10 border-red-500/30 text-red-400'
                            }`}>
                            {status.type === 'success' ? <CheckCircle size={20} /> : <AlertTriangle size={20} />}
                            <p className="text-sm font-medium">{status.message}</p>
                        </div>
                    )}

                    <form onSubmit={handleSubmit} className="space-y-6">

                        {/* Name Input */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Nome Completo</label>
                            <input
                                type="text"
                                name="name"
                                value={formData.name}
                                onChange={handleChange}
                                required
                                className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-ciklo-orange focus:ring-1 focus:ring-ciklo-orange transition-all placeholder-gray-600"
                                placeholder="Ex: João da Silva"
                            />
                        </div>

                        {/* Email & Role Grid */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Email de Acesso</label>
                                <div className="relative">
                                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                    <input
                                        type="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        required
                                        className="w-full bg-gray-900/50 border border-gray-700 rounded-lg pl-10 pr-4 py-3 text-white focus:outline-none focus:border-ciklo-orange focus:ring-1 focus:ring-ciklo-orange transition-all placeholder-gray-600"
                                        placeholder="usuario@email.com"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-gray-400 mb-2">Permissão</label>
                                <div className="relative">
                                    <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                    <select
                                        name="role"
                                        value={formData.role}
                                        onChange={handleChange}
                                        className="w-full bg-gray-900/50 border border-gray-700 rounded-lg pl-10 pr-4 py-3 text-white focus:outline-none focus:border-ciklo-orange focus:ring-1 focus:ring-ciklo-orange transition-all appearance-none cursor-pointer"
                                    >
                                        <option value="CLIENT">Cliente (Visualização)</option>
                                        <option value="TECHNICIAN">Técnico (Operação)</option>
                                        <option value="ADMIN">Administrador (Total)</option>
                                    </select>
                                </div>
                            </div>
                        </div>

                        {/* Password Input */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Senha Inicial</label>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                                <input
                                    type="password"
                                    name="password"
                                    value={formData.password}
                                    onChange={handleChange}
                                    required
                                    minLength={6}
                                    className="w-full bg-gray-900/50 border border-gray-700 rounded-lg pl-10 pr-4 py-3 text-white focus:outline-none focus:border-ciklo-orange focus:ring-1 focus:ring-ciklo-orange transition-all placeholder-gray-600"
                                    placeholder="Mínimo 6 caracteres"
                                />
                            </div>
                            <p className="text-xs text-gray-500 mt-1 ml-1">A senha será criptografada antes de ser salva.</p>
                        </div>

                        {/* Assigned Generators (Optional) */}
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">
                                Geradores Atribuídos <span className="text-gray-600 font-normal">(IDs separados por vírgula)</span>
                            </label>
                            <input
                                type="text"
                                name="assigned_generators"
                                onChange={handleGeneratorChange}
                                className="w-full bg-gray-900/50 border border-gray-700 rounded-lg px-4 py-3 text-white focus:outline-none focus:border-ciklo-orange focus:ring-1 focus:ring-ciklo-orange transition-all placeholder-gray-600"
                                placeholder="Ex: GEN-001, GEN-002 (Deixe vazio para todos se Admin)"
                            />
                        </div>

                        {/* Submit Button */}
                        <div className="pt-4 flex justify-end gap-3">
                            <button
                                type="button"
                                onClick={() => navigate(-1)}
                                className="px-6 py-3 rounded-lg border border-gray-700 hover:bg-gray-800 text-gray-300 transition-all font-medium"
                            >
                                Cancelar
                            </button>
                            <button
                                type="submit"
                                disabled={isSubmitting}
                                className="px-6 py-3 rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white font-bold shadow-lg shadow-blue-500/20 active:scale-95 transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                                {isSubmitting ? (
                                    <>
                                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                        Criando...
                                    </>
                                ) : (
                                    <>
                                        <Save size={18} />
                                        Criar Usuário
                                    </>
                                )}
                            </button>
                        </div>

                    </form>
                </div>
            </div>
        </div>
    );
};

export default AdminUserCreate;
