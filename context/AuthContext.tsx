import React, { createContext, useContext, useState, PropsWithChildren, useEffect, useRef } from 'react';
import { User } from '../types';

/** login pode exigir 2FA: nesse caso não retorna User, e sim o desafio. */
type LoginResult =
  | { user: User; requires2FA?: false }
  | { requires2FA: true; challengeId: string; email: string };

interface AuthContextType {
  user: User | null;
  token: string | null;
  isSyncing: boolean;
  /** true até a primeira checagem de sessão (via cookie) terminar — evita um
   *  flash de redirect pro /login logo após F5, antes do cookie ser validado. */
  isBootstrapping: boolean;
  login: (email: string, password: string) => Promise<LoginResult>;
  verifyTwoFactor: (challengeId: string, code: string) => Promise<User>;
  logout: () => void;
  updateProfile: (data: { name?: string; phone?: string; currentPassword?: string; newPassword?: string; twoFactorEnabled?: boolean }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>(null!);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }: PropsWithChildren<{}>) => {
  // SECURITY FIX (pentest VUL-02): o token deixou de ser persistido em
  // localStorage — qualquer XSS na página conseguia ler e roubar a sessão
  // permanentemente de lá. Agora a sessão real vive num cookie httpOnly
  // (setado pelo backend no login/2FA), que o JS nem consegue ler. `user` e
  // `token` aqui existem só em memória (perdem-se ao recarregar a página de
  // propósito) — o efeito de sincronização abaixo restaura `user` a partir
  // do cookie via GET /api/auth/profile logo no mount, então um F5 não
  // desloga ninguém, só não expõe mais nada gravável em disco pelo navegador.
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);

  const [isSyncing, setIsSyncing] = useState(false);
  const [isBootstrapping, setIsBootstrapping] = useState(true);

  const login = async (email: string, password: string) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha ao fazer login');
      }

      const data = await response.json();

      // 2FA ativo: o servidor não devolve token, só o desafio.
      if (data.requires2FA) {
        return { requires2FA: true, challengeId: data.challengeId, email: data.email };
      }

      // O backend já setou o cookie httpOnly de sessão nesta mesma resposta
      // (Set-Cookie) — nada pra persistir manualmente aqui.
      const { user, token } = data;
      setUser(user);
      setToken(token);
      return { user };

    } catch (error) {
      console.error("Login failed", error);
      throw error;
    }
  };

  const verifyTwoFactor = async (challengeId: string, code: string) => {
    const response = await fetch('/api/auth/verify-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId, code }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.message || 'Código inválido');
    }
    // Cookie httpOnly já setado nesta resposta — nada pra persistir aqui.
    const { user, token } = await response.json();
    setUser(user);
    setToken(token);
    return user;
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    // Cookie é httpOnly — JS não consegue apagá-lo sozinho, precisa de um
    // endpoint dedicado no backend pra limpar. Fire-and-forget: mesmo que a
    // chamada falhe (rede fora do ar etc.), já limpamos o estado local acima.
    fetch('/api/auth/logout', { method: 'POST' }).catch(err => {
      console.error('Failed to clear session cookie on logout', err);
    });
  };

  const updateProfile = async (data: { name?: string; phone?: string; currentPassword?: string; newPassword?: string }) => {
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || 'Falha ao atualizar perfil');
      }

      const updatedUser = await response.json();
      setUser(updatedUser);
    } catch (error) {
      console.error('Profile update failed', error);
      throw error;
    }
  };

  // Keep a ref of current user to avoid stale closures in setInterval
  const currentUserRef = useRef<User | null>(user);
  useEffect(() => {
    currentUserRef.current = user;
  }, [user]);

  // Bootstrap da sessão + sincronização periódica. Roda incondicionalmente no
  // mount (não depende mais de `token` em memória, que começa null a cada F5)
  // — o cookie httpOnly é enviado automaticamente pelo navegador, então essa
  // mesma chamada já serve tanto para restaurar a sessão após recarregar a
  // página quanto para o polling de permissões que já existia. Se não houver
  // cookie válido, cai no 401 abaixo e `logout()` só confirma o estado
  // deslogado (idempotente).
  useEffect(() => {
    const syncProfile = async () => {
      try {
        const response = await fetch('/api/auth/profile');

        if (response.status === 401 || response.status === 403 || response.status === 404) {
          // Sem sessão válida, token expirado, ou usuário removido pelo admin
          logout();
          return;
        }

        if (response.ok) {
          const updatedUser = await response.json();

          const current = currentUserRef.current;
          // Verify if any permission or role changed
          const permissionChanged = !current ||
            current.id !== updatedUser.id ||
            current.name !== updatedUser.name ||
            current.role !== updatedUser.role ||
            current.companyId !== updatedUser.companyId ||
            current.phone !== updatedUser.phone ||
            current.whatsappAlerts !== updatedUser.whatsappAlerts ||
            current.emailAlerts !== updatedUser.emailAlerts ||
            JSON.stringify(current.assignedGeneratorIds || []) !== JSON.stringify(updatedUser.assignedGeneratorIds || []);

          // Credits change on their own daily, silently -> don't show the
          // "syncing permissions" overlay for a plain credit-count update.
          const creditsChanged = current && current.companyCredits !== updatedUser.companyCredits;

          if (permissionChanged) {
            if (!current) {
              // Primeira carga (bootstrap no mount, ou logo após login) — não
              // existe nada "mudando" da perspectiva do usuário, então nada de
              // atraso artificial aqui. O atraso de 800ms abaixo existe só pra
              // dar uma transição suave quando as permissões mudam ENQUANTO a
              // pessoa já está usando o app (overlay "Atualizando Conta").
              // Aplicá-lo também na carga inicial criava uma janela de ~800ms
              // com isBootstrapping=false e user=null — tempo suficiente pra
              // ProtectedRoute mandar pro /login mesmo com sessão válida.
              // Bug real, reportado como "atualiza a página e desloga sempre".
              setUser(updatedUser);
            } else {
              setIsSyncing(true);
              setTimeout(() => {
                setUser(updatedUser);
                setIsSyncing(false);
              }, 800);
            }
          } else if (creditsChanged) {
            setUser(updatedUser);
          }
        }
      } catch (err) {
        console.error('Failed to sync profile in background:', err);
      } finally {
        // Só importa na primeira chamada (mount) — nas seguintes já é false,
        // setar de novo é inofensivo.
        setIsBootstrapping(false);
      }
    };

    // Roda uma vez no mount (restaura a sessão a partir do cookie, se houver)
    syncProfile();

    // Poll every 60 seconds for real-time authorization changes
    const interval = setInterval(syncProfile, 60000);
    return () => clearInterval(interval);
  }, []);

  return (
    <AuthContext.Provider value={{ user, token, isSyncing, isBootstrapping, login, verifyTwoFactor, logout, updateProfile }}>
      {children}
    </AuthContext.Provider>
  );
};