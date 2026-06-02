import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { User as UserIcon, Mail, Phone, Lock, Eye, EyeOff, Check, AlertCircle, Shield } from 'lucide-react';

const ProfileSettings: React.FC = () => {
  const { user, updateProfile } = useAuth();

  // Form state
  const [name, setName] = useState(user?.name || '');
  const [phone, setPhone] = useState(user?.phone || '');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // UI state
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Sync form if user changes
  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPhone(user.phone || '');
    }
  }, [user]);

  // Format phone as (XX) XXXXX-XXXX
  const formatPhone = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 11);
    if (digits.length <= 2) return digits;
    if (digits.length <= 7) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`;
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  };

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPhone(formatPhone(e.target.value));
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    if (type === 'success') {
      setSuccessMsg(message);
      setErrorMsg('');
    } else {
      setErrorMsg(message);
      setSuccessMsg('');
    }
    setTimeout(() => {
      setSuccessMsg('');
      setErrorMsg('');
    }, 5000);
  };

  // Save profile info (name + phone)
  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      showNotification('error', 'O nome é obrigatório.');
      return;
    }

    setSaving(true);
    try {
      await updateProfile({ name: name.trim(), phone: phone || '' });
      showNotification('success', 'Perfil atualizado com sucesso!');
    } catch (err: any) {
      showNotification('error', err.message || 'Erro ao atualizar perfil.');
    } finally {
      setSaving(false);
    }
  };

  // Save password
  const handleSavePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      showNotification('error', 'Informe a senha atual.');
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      showNotification('error', 'A nova senha deve ter pelo menos 6 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      showNotification('error', 'As senhas não coincidem.');
      return;
    }

    setSavingPassword(true);
    try {
      await updateProfile({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      showNotification('success', 'Senha alterada com sucesso!');
    } catch (err: any) {
      showNotification('error', err.message || 'Erro ao alterar senha.');
    } finally {
      setSavingPassword(false);
    }
  };

  const getRoleName = (role: string) => {
    const map: Record<string, string> = {
      ADMIN: 'Administrador',
      TECHNICIAN: 'Técnico',
      CLIENT: 'Cliente',
      MONITOR: 'Monitor',
      ORCAMENTOS: 'Orçamentos',
    };
    return map[role] || role;
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-ciklo-orange to-ciklo-yellow flex items-center justify-center text-2xl font-bold text-black shadow-lg shadow-orange-500/20">
          {user?.name?.charAt(0)?.toUpperCase() || '?'}
        </div>
        <div>
          <h1 className="text-2xl font-bold text-white">Meu Perfil</h1>
          <p className="text-sm text-gray-400">Gerencie suas informações pessoais e senha</p>
        </div>
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="flex items-center gap-3 p-4 bg-green-500/10 border border-green-500/30 rounded-xl text-green-400 text-sm font-medium animate-fade-in">
          <Check size={18} className="flex-shrink-0" />
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-sm font-medium animate-fade-in">
          <AlertCircle size={18} className="flex-shrink-0" />
          {errorMsg}
        </div>
      )}

      {/* Profile Info Card */}
      <form onSubmit={handleSaveProfile}>
        <div className="bg-ciklo-card border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800 flex items-center gap-3">
            <UserIcon size={20} className="text-ciklo-orange" />
            <h2 className="text-lg font-semibold text-white">Informações Pessoais</h2>
          </div>
          <div className="p-6 space-y-5">
            {/* Name */}
            <div>
              <label htmlFor="profile-name" className="block text-sm font-medium text-gray-300 mb-2">
                Nome Completo
              </label>
              <div className="relative">
                <UserIcon size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  id="profile-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full pl-11 pr-4 py-3 bg-ciklo-dark border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-ciklo-orange focus:ring-1 focus:ring-ciklo-orange/50 transition-all"
                  placeholder="Seu nome completo"
                  required
                />
              </div>
            </div>

            {/* Email (read-only) */}
            <div>
              <label htmlFor="profile-email" className="block text-sm font-medium text-gray-300 mb-2">
                E-mail
              </label>
              <div className="relative">
                <Mail size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  id="profile-email"
                  type="email"
                  value={user?.email || ''}
                  disabled
                  className="w-full pl-11 pr-4 py-3 bg-ciklo-dark/50 border border-gray-700/50 rounded-xl text-gray-500 cursor-not-allowed"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1.5">O e-mail não pode ser alterado. Contate o administrador.</p>
            </div>

            {/* Role (read-only) */}
            <div>
              <label htmlFor="profile-role" className="block text-sm font-medium text-gray-300 mb-2">
                Função
              </label>
              <div className="relative">
                <Shield size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  id="profile-role"
                  type="text"
                  value={getRoleName(user?.role || '')}
                  disabled
                  className="w-full pl-11 pr-4 py-3 bg-ciklo-dark/50 border border-gray-700/50 rounded-xl text-gray-500 cursor-not-allowed capitalize"
                />
              </div>
            </div>

            {/* Phone */}
            <div>
              <label htmlFor="profile-phone" className="block text-sm font-medium text-gray-300 mb-2">
                Telefone / WhatsApp
              </label>
              <div className="relative">
                <Phone size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  id="profile-phone"
                  type="tel"
                  value={phone}
                  onChange={handlePhoneChange}
                  className="w-full pl-11 pr-4 py-3 bg-ciklo-dark border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-ciklo-orange focus:ring-1 focus:ring-ciklo-orange/50 transition-all"
                  placeholder="(XX) XXXXX-XXXX"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1.5">Usado para receber notificações de alarme via WhatsApp.</p>
            </div>

            {/* Save Profile Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={saving}
                className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-ciklo-orange to-ciklo-yellow text-black font-bold rounded-xl hover:shadow-lg hover:shadow-orange-500/25 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {saving ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Salvando...
                  </>
                ) : (
                  <>
                    <Check size={18} />
                    Salvar Alterações
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* Password Change Card */}
      <form onSubmit={handleSavePassword}>
        <div className="bg-ciklo-card border border-gray-800 rounded-2xl overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-800 flex items-center gap-3">
            <Lock size={20} className="text-ciklo-orange" />
            <h2 className="text-lg font-semibold text-white">Alterar Senha</h2>
          </div>
          <div className="p-6 space-y-5">
            {/* Current Password */}
            <div>
              <label htmlFor="current-password" className="block text-sm font-medium text-gray-300 mb-2">
                Senha Atual
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  id="current-password"
                  type={showCurrentPassword ? 'text' : 'password'}
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3 bg-ciklo-dark border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-ciklo-orange focus:ring-1 focus:ring-ciklo-orange/50 transition-all"
                  placeholder="Digite sua senha atual"
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showCurrentPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {/* New Password */}
            <div>
              <label htmlFor="new-password" className="block text-sm font-medium text-gray-300 mb-2">
                Nova Senha
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  id="new-password"
                  type={showNewPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3 bg-ciklo-dark border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-ciklo-orange focus:ring-1 focus:ring-ciklo-orange/50 transition-all"
                  placeholder="Mínimo de 6 caracteres"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {newPassword && newPassword.length < 6 && (
                <p className="text-xs text-red-400 mt-1.5">A senha deve ter pelo menos 6 caracteres.</p>
              )}
            </div>

            {/* Confirm Password */}
            <div>
              <label htmlFor="confirm-password" className="block text-sm font-medium text-gray-300 mb-2">
                Confirmar Nova Senha
              </label>
              <div className="relative">
                <Lock size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" />
                <input
                  id="confirm-password"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full pl-11 pr-12 py-3 bg-ciklo-dark border border-gray-700 rounded-xl text-white placeholder-gray-500 focus:outline-none focus:border-ciklo-orange focus:ring-1 focus:ring-ciklo-orange/50 transition-all"
                  placeholder="Repita a nova senha"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-300 transition-colors"
                >
                  {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {confirmPassword && newPassword !== confirmPassword && (
                <p className="text-xs text-red-400 mt-1.5">As senhas não coincidem.</p>
              )}
            </div>

            {/* Save Password Button */}
            <div className="pt-2">
              <button
                type="submit"
                disabled={savingPassword || !currentPassword || !newPassword || newPassword !== confirmPassword || newPassword.length < 6}
                className="w-full sm:w-auto px-8 py-3 bg-gradient-to-r from-ciklo-orange to-ciklo-yellow text-black font-bold rounded-xl hover:shadow-lg hover:shadow-orange-500/25 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {savingPassword ? (
                  <>
                    <div className="w-4 h-4 border-2 border-black/30 border-t-black rounded-full animate-spin" />
                    Alterando...
                  </>
                ) : (
                  <>
                    <Lock size={18} />
                    Alterar Senha
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </form>
    </div>
  );
};

export default ProfileSettings;
