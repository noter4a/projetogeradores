import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getPostLoginPath } from '../utils/navigation';
import { Zap, Lock, Mail, MessageCircle, ShieldCheck, ArrowLeft, KeyRound } from 'lucide-react';

type Step = 'login' | '2fa' | 'forgot' | 'reset';

const Login: React.FC = () => {
  const { login, verifyTwoFactor } = useAuth();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [challengeId, setChallengeId] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const resetMessages = () => { setError(''); setInfo(''); };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);
    try {
      const result = await login(email, password);
      if ('requires2FA' in result && result.requires2FA) {
        setChallengeId(result.challengeId);
        setMaskedEmail(result.email);
        setCode('');
        setStep('2fa');
        setInfo(`Enviamos um código de verificação para ${result.email}.`);
      } else if ('user' in result) {
        navigate(getPostLoginPath(result.user.role));
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao realizar login');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify2fa = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);
    try {
      const user = await verifyTwoFactor(challengeId, code.trim());
      navigate(getPostLoginPath(user.role));
    } catch (err: any) {
      setError(err.message || 'Código inválido');
    } finally {
      setLoading(false);
    }
  };

  const handleResend2fa = async () => {
    resetMessages();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/resend-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId }),
      });
      const data = await res.json();
      if (res.ok) {
        setChallengeId(data.challengeId);
        setInfo('Enviamos um novo código para o seu e-mail.');
      } else {
        setError(data.message || 'Não foi possível reenviar.');
      }
    } catch {
      setError('Erro de conexão.');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      setChallengeId(data.challengeId);
      setCode('');
      setNewPassword('');
      setStep('reset');
      setInfo('Se o e-mail estiver cadastrado, enviamos um código de verificação.');
    } catch {
      setError('Erro de conexão.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    resetMessages();
    if (newPassword.length < 6) { setError('A nova senha deve ter pelo menos 6 caracteres.'); return; }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ challengeId, code: code.trim(), newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        setStep('login');
        setPassword('');
        setInfo('Senha redefinida com sucesso. Faça login com a nova senha.');
      } else {
        setError(data.message || 'Não foi possível redefinir a senha.');
      }
    } catch {
      setError('Erro de conexão.');
    } finally {
      setLoading(false);
    }
  };

  const inputCls = 'w-full bg-ciklo-black border border-gray-700 rounded-lg py-3 pl-10 pr-4 text-white placeholder-gray-600 focus:border-ciklo-orange focus:ring-1 focus:ring-ciklo-orange outline-none transition-all';
  const codeInputCls = 'w-full bg-ciklo-black border border-gray-700 rounded-lg py-3 px-4 text-center text-2xl font-bold tracking-[0.5em] text-white placeholder-gray-700 focus:border-ciklo-orange outline-none [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none';
  const primaryBtn = 'w-full bg-ciklo-orange hover:bg-orange-600 text-white font-bold py-3.5 rounded-lg transition-colors duration-200 disabled:opacity-50';

  const messages = (
    <>
      {error && <p className="text-red-500 text-sm text-center bg-red-500/10 py-2 rounded-lg border border-red-500/20">{error}</p>}
      {info && !error && <p className="text-blue-300 text-sm text-center bg-blue-500/10 py-2 rounded-lg border border-blue-500/20">{info}</p>}
    </>
  );

  return (
    <div className="min-h-screen bg-ciklo-black flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-xl bg-ciklo-orange mb-6">
            <Zap size={32} className="text-black fill-black" />
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight">CIKLO GERADORES</h1>
          <p className="text-gray-400 text-sm">Monitoramento Inteligente & Controle Remoto</p>
        </div>

        <div className="bg-ciklo-card border border-gray-800 rounded-2xl p-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
          {/* ===== LOGIN ===== */}
          {step === 'login' && (
            <>
              <h2 className="text-xl font-bold text-white mb-1">Acesso ao Sistema</h2>
              <p className="text-gray-500 text-sm mb-6">Entre com suas credenciais para continuar.</p>
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">E-mail</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="off" className={inputCls} placeholder="Digite seu e-mail" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">Senha</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="off" className={inputCls} placeholder="••••••••" />
                  </div>
                </div>
                {messages}
                <button type="submit" disabled={loading} className={primaryBtn}>{loading ? 'Entrando...' : 'Entrar no Painel'}</button>
              </form>
              <div className="mt-4 text-center">
                <button onClick={() => { resetMessages(); setStep('forgot'); }} className="text-sm text-gray-400 hover:text-ciklo-orange transition-colors">
                  Esqueci minha senha
                </button>
              </div>
            </>
          )}

          {/* ===== 2FA ===== */}
          {step === '2fa' && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck size={22} className="text-ciklo-orange" />
                <h2 className="text-xl font-bold text-white">Verificação em duas etapas</h2>
              </div>
              <p className="text-gray-500 text-sm mb-6">Digite o código de 6 dígitos enviado para <span className="text-gray-300">{maskedEmail}</span>.</p>
              <form onSubmit={handleVerify2fa} className="space-y-4">
                <input inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} autoFocus className={codeInputCls} placeholder="______" />
                {messages}
                <button type="submit" disabled={loading || code.length !== 6} className={primaryBtn}>{loading ? 'Verificando...' : 'Verificar e Entrar'}</button>
              </form>
              <div className="mt-4 flex items-center justify-between">
                <button onClick={() => { resetMessages(); setStep('login'); }} className="text-sm text-gray-400 hover:text-white flex items-center gap-1"><ArrowLeft size={14} /> Voltar</button>
                <button onClick={handleResend2fa} disabled={loading} className="text-sm text-ciklo-orange hover:underline disabled:opacity-50">Reenviar código</button>
              </div>
            </>
          )}

          {/* ===== ESQUECI A SENHA (pedir e-mail) ===== */}
          {step === 'forgot' && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <KeyRound size={22} className="text-ciklo-orange" />
                <h2 className="text-xl font-bold text-white">Redefinir senha</h2>
              </div>
              <p className="text-gray-500 text-sm mb-6">Informe seu e-mail e enviaremos um código para redefinir a senha.</p>
              <form onSubmit={handleForgotSubmit} className="space-y-4">
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                  <input type="email" value={email} onChange={e => setEmail(e.target.value)} required autoComplete="off" className={inputCls} placeholder="Digite seu e-mail" />
                </div>
                {messages}
                <button type="submit" disabled={loading} className={primaryBtn}>{loading ? 'Enviando...' : 'Enviar código'}</button>
              </form>
              <div className="mt-4 text-center">
                <button onClick={() => { resetMessages(); setStep('login'); }} className="text-sm text-gray-400 hover:text-white flex items-center gap-1 justify-center mx-auto"><ArrowLeft size={14} /> Voltar ao login</button>
              </div>
            </>
          )}

          {/* ===== REDEFINIR (código + nova senha) ===== */}
          {step === 'reset' && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <KeyRound size={22} className="text-ciklo-orange" />
                <h2 className="text-xl font-bold text-white">Nova senha</h2>
              </div>
              <p className="text-gray-500 text-sm mb-6">Digite o código recebido por e-mail e escolha uma nova senha.</p>
              <form onSubmit={handleResetSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">Código</label>
                  <input inputMode="numeric" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} className={codeInputCls} placeholder="______" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-400 mb-1.5">Nova senha</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" size={18} />
                    <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} required autoComplete="new-password" className={inputCls} placeholder="Mínimo 6 caracteres" />
                  </div>
                </div>
                {messages}
                <button type="submit" disabled={loading || code.length !== 6} className={primaryBtn}>{loading ? 'Redefinindo...' : 'Redefinir senha'}</button>
              </form>
              <div className="mt-4 text-center">
                <button onClick={() => { resetMessages(); setStep('login'); }} className="text-sm text-gray-400 hover:text-white flex items-center gap-1 justify-center mx-auto"><ArrowLeft size={14} /> Voltar ao login</button>
              </div>
            </>
          )}

          {step === 'login' && (
            <div className="mt-6 text-center border-t border-gray-800 pt-4">
              <a href="https://wa.me/555432931095" target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-green-500 transition-colors">
                <MessageCircle size={16} /> Precisa de ajuda? Suporte WhatsApp
              </a>
            </div>
          )}
        </div>

        <p className="text-center text-gray-600 mt-12 text-xs">
          &copy; 2024 Ciklo Geradores. Todos os direitos reservados.
        </p>
      </div>
    </div>
  );
};

export default Login;
