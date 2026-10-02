import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, Card, Field, Input, Select } from '@/components/ui';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/contexts/ToastContext';
import { authService } from '@/services/auth.service';
import { usersService } from '@/services/users.service';
import { storage } from '@/utils/storage';
import type { UserSetting } from '@/types';

/** Configurações da conta: perfil, metas, senha e sessões. */
export default function Settings() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();

  const [name, setName] = useState('');
  const [setting, setSetting] = useState<Partial<UserSetting>>({});
  const [password, setPassword] = useState({ current: '', next: '', confirm: '' });
  const [sessions, setSessions] = useState<
    Array<{ id: string; userAgent: string | null; ip: string | null; createdAt: string; current: boolean }>
  >([]);

  useEffect(() => {
    if (user) {
      setName(user.name);
      if (user.setting) setSetting(user.setting);
    }
  }, [user]);

  const loadSessions = async () => {
    try {
      setSessions(await authService.listSessions());
    } catch {
      /* silencioso: lista de sessões é informativa */
    }
  };

  useEffect(() => {
    void loadSessions();
  }, []);

  const profileMutation = useMutation({
    mutationFn: async () => {
      await authService.updateProfile(name);
      // As metas vivem em outra rota: enviamos só os campos editáveis.
      if (setting.dailyGoal || setting.totalGoal || setting.examDate) {
        await authService.updateSettings({
          dailyGoal: setting.dailyGoal,
          totalGoal: setting.totalGoal,
          examDate: setting.examDate,
          examTimeMinutes: setting.examTimeMinutes,
        });
      }
      return usersService.me();
    },
    onSuccess: (fresh) => {
      updateUser(fresh);
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      toast('Perfil atualizado.', 'success');
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  const passwordMutation = useMutation({
    mutationFn: () =>
      authService.changePassword({
        currentPassword: password.current,
        newPassword: password.next,
        confirmNewPassword: password.confirm,
      }),
    onSuccess: () => {
      setPassword({ current: '', next: '', confirm: '' });
      toast('Senha alterada. Por segurança, entre novamente.', 'success');
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  const revokeSession = async (id: string) => {
    try {
      await authService.revokeSession(id);
      await loadSessions();
      toast('Sessão encerrada.');
    } catch (err) {
      toast(err instanceof Error ? err.message : 'Não foi possível encerrar a sessão.', 'error');
    }
  };

  return (
    <div className="wrap">
      <Card title="👤 Meu perfil" subtitle="Como você aparece no app.">
        <div className="grid c2">
          <Field label="Nome">
            <Input value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <Field label="E-mail" hint="O e-mail não pode ser alterado por aqui.">
            <Input value={user?.email ?? ''} disabled />
          </Field>
        </div>
      </Card>

      <Card title="🎯 Metas de estudo">
        <div className="grid c3">
          <Field label="Meta diária (questões)">
            <Input
              type="number"
              min={1}
              max={500}
              value={setting.dailyGoal ?? 41}
              onChange={(event) => setSetting({ ...setting, dailyGoal: Number(event.target.value) })}
            />
          </Field>
          <Field label="Meta total até a prova">
            <Input
              type="number"
              min={1}
              value={setting.totalGoal ?? 3000}
              onChange={(event) => setSetting({ ...setting, totalGoal: Number(event.target.value) })}
            />
          </Field>
          <Field label="Data da prova">
            <Input
              type="date"
              value={setting.examDate ? String(setting.examDate).slice(0, 10) : ''}
              onChange={(event) => setSetting({ ...setting, examDate: event.target.value })}
            />
          </Field>
        </div>
        <div className="grid c2">
          <Field label="Tempo de prova (minutos)">
            <Input
              type="number"
              value={setting.examTimeMinutes ?? 240}
              onChange={(event) => setSetting({ ...setting, examTimeMinutes: Number(event.target.value) })}
            />
          </Field>
          <Field label="Tema">
            <Select
              value={setting.theme ?? 'dark'}
              onChange={(event) => setSetting({ ...setting, theme: event.target.value })}
            >
              <option value="dark">Escuro</option>
              <option value="light">Claro (em breve)</option>
            </Select>
          </Field>
        </div>

        <Button variant="primary" loading={profileMutation.isPending} onClick={() => profileMutation.mutate()}>
          Salvar alterações
        </Button>
      </Card>

      <Card title="🔒 Alterar senha">
        <div className="grid c3">
          <Field label="Senha atual">
            <Input
              type="password"
              value={password.current}
              onChange={(event) => setPassword({ ...password, current: event.target.value })}
            />
          </Field>
          <Field label="Nova senha">
            <Input
              type="password"
              value={password.next}
              onChange={(event) => setPassword({ ...password, next: event.target.value })}
            />
          </Field>
          <Field label="Confirmar nova senha">
            <Input
              type="password"
              value={password.confirm}
              onChange={(event) => setPassword({ ...password, confirm: event.target.value })}
            />
          </Field>
        </div>
        {password.next && password.next !== password.confirm && (
          <p className="tiny" style={{ color: 'var(--err)' }}>
            As senhas não coincidem.
          </p>
        )}
        <Button
          variant="primary"
          loading={passwordMutation.isPending}
          disabled={!password.current || password.next !== password.confirm || password.next.length < 8}
          onClick={() => passwordMutation.mutate()}
        >
          Alterar senha
        </Button>
      </Card>

      <Card title="💻 Sessões ativas" subtitle="Aparelhos onde sua conta está conectada.">
        {sessions.length ? (
          <div className="session-list">
            {sessions.map((session) => (
              <div key={session.id} className="session-item">
                <div>
                  <b className="small">{session.current ? 'Este aparelho' : 'Outro aparelho'}</b>
                  <div className="tiny muted">
                    {session.userAgent?.slice(0, 70) || 'navegador não identificado'} · IP {session.ip || '—'}
                  </div>
                  <div className="tiny muted">
                    Criada em {new Date(session.createdAt).toLocaleString('pt-BR')}
                  </div>
                </div>
                {!session.current && (
                  <Button size="sm" variant="ghost" onClick={() => revokeSession(session.id)}>
                    Encerrar
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="muted small">Nenhuma sessão ativa.</p>
        )}
      </Card>

      <Card title="📦 Dados e cache">
        <p className="muted small">
          O app guarda uma cópia de leitura no seu navegador para funcionar offline. Limpar o cache
          não apaga seu progresso — ele está salvo no servidor.
        </p>
        <div className="row gap-8">
          <Button
            variant="ghost"
            onClick={() => {
              storage.clearAll();
              toast('Cache local limpo.');
            }}
          >
            Limpar cache local
          </Button>
          <Button
            variant="ghost"
            onClick={async () => {
              try {
                const data = await usersService.exportData();
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const anchor = document.createElement('a');
                anchor.href = url;
                anchor.download = 'arena-estudos-meus-dados.json';
                anchor.click();
                URL.revokeObjectURL(url);
              } catch {
                toast('Não foi possível exportar seus dados.', 'error');
              }
            }}
          >
            Exportar meus dados
          </Button>
        </div>
      </Card>
    </div>
  );
}
