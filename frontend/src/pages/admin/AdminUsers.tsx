import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge, Button, Card, Field, Input, Modal, Pagination, Select, Spinner, Table } from '@/components/ui';
import { useToast } from '@/contexts/ToastContext';
import { adminService } from '@/services/admin.service';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatDate } from '@/utils/format';
import { useAuth } from '@/contexts/AuthContext';
import type { AdminUser } from '@/types';

/** Gestão de usuários: criar, editar, bloquear, trocar perfil e remover. */
export default function AdminUsers() {
  const toast = useToast();
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [blockReason, setBlockReason] = useState('');
  const [blocking, setBlocking] = useState<AdminUser | null>(null);
  const [form, setForm] = useState({ name: '', email: '', role: 'ALUNO', password: '' });
  const [creating, setCreating] = useState(false);

  const debounced = useDebouncedValue(search, 400);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', page, debounced, role],
    queryFn: () => adminService.users({ page, limit: 20, search: debounced || undefined, role: role || undefined }),
  });

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    queryClient.invalidateQueries({ queryKey: ['admin-dashboard'] });
  };

  const blockMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => adminService.blockUser(id, reason),
    onSuccess: () => {
      setBlocking(null);
      setBlockReason('');
      invalidate();
      toast('Usuário bloqueado.');
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  const unblockMutation = useMutation({
    mutationFn: (id: string) => adminService.unblockUser(id),
    onSuccess: () => {
      invalidate();
      toast('Usuário desbloqueado.');
    },
  });

  const roleMutation = useMutation({
    mutationFn: ({ id, newRole }: { id: string; newRole: string }) => adminService.changeRole(id, newRole),
    onSuccess: () => {
      invalidate();
      toast('Perfil atualizado.');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Record<string, unknown> }) =>
      adminService.updateUser(id, payload),
    onSuccess: () => {
      setEditing(null);
      invalidate();
      toast('Usuário atualizado.');
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => adminService.deleteUser(id),
    onSuccess: () => {
      invalidate();
      toast('Usuário removido.');
    },
  });

  const createMutation = useMutation({
    mutationFn: () => {
      // Passa pelo cliente http (que já anexa o token e resolve o endereço
      // da API), em vez de um fetch direto em '/api'.
      return adminService.createUser(form);
    },
    onSuccess: () => {
      setCreating(false);
      setForm({ name: '', email: '', role: 'ALUNO', password: '' });
      invalidate();
      toast('Usuário criado.');
    },
    onError: (err: Error) => toast(err.message, 'error'),
  });

  return (
    <div className="wrap">
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h1 className="page-title">👥 Usuários</h1>
        <Button variant="primary" onClick={() => setCreating(true)}>
          + Novo usuário
        </Button>
      </div>

      <Card>
        <div className="grid c2">
          <Field label="Buscar">
            <Input
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="nome ou e-mail"
            />
          </Field>
          <Field label="Perfil">
            <Select
              value={role}
              onChange={(event) => {
                setRole(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              <option value="ADMIN">ADMIN</option>
              <option value="EDITOR">EDITOR</option>
              <option value="ALUNO">ALUNO</option>
            </Select>
          </Field>
        </div>
      </Card>

      {isLoading ? (
        <Spinner label="Carregando usuários..." />
      ) : (
        <Card>
          <Table head={['Usuário', 'Perfil', 'Situação', 'Atividade', 'Cadastro', 'Ações']}>
            {data?.data.map((item) => (
              <tr key={item.id}>
                <td>
                  <b>{item.name}</b>
                  <div className="tiny muted">{item.email}</div>
                </td>
                <td>
                  <Select
                    value={item.role}
                    disabled={item.id === currentUser?.id}
                    onChange={(event) => roleMutation.mutate({ id: item.id, newRole: event.target.value })}
                    style={{ maxWidth: 130 }}
                  >
                    <option value="ADMIN">ADMIN</option>
                    <option value="EDITOR">EDITOR</option>
                    <option value="ALUNO">ALUNO</option>
                  </Select>
                </td>
                <td>
                  {item.blockedAt ? (
                    <Badge tone="err">bloqueado</Badge>
                  ) : item.isActive ? (
                    <Badge tone="ok">ativo</Badge>
                  ) : (
                    <Badge tone="warn">inativo</Badge>
                  )}
                </td>
                <td className="tiny muted">
                  {item.answers} respostas · {item.simulados} simulados
                  <div>{item.lastLoginAt ? `último acesso ${formatDate(item.lastLoginAt)}` : 'nunca acessou'}</div>
                </td>
                <td className="tiny muted">{formatDate(item.createdAt)}</td>
                <td>
                  <div className="row gap-6">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(item)}>
                      Editar
                    </Button>
                    {item.blockedAt ? (
                      <Button size="sm" variant="ok" onClick={() => unblockMutation.mutate(item.id)}>
                        Desbloquear
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={item.id === currentUser?.id}
                        onClick={() => setBlocking(item)}
                      >
                        Bloquear
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={item.id === currentUser?.id}
                      onClick={() => {
                        if (window.confirm(`Remover ${item.name}? O histórico é preservado.`)) {
                          deleteMutation.mutate(item.id);
                        }
                      }}
                    >
                      Remover
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} totalPages={data?.meta.totalPages ?? 1} onChange={setPage} />
        </Card>
      )}

      {/* --------------------------------------------------------- modais ---- */}
      <Modal
        open={Boolean(editing)}
        title="Editar usuário"
        onClose={() => setEditing(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={updateMutation.isPending}
              onClick={() =>
                editing &&
                updateMutation.mutate({
                  id: editing.id,
                  payload: { name: editing.name, email: editing.email, role: editing.role },
                })
              }
            >
              Salvar
            </Button>
          </>
        }
      >
        {editing && (
          <div className="grid c2">
            <Field label="Nome">
              <Input
                value={editing.name}
                onChange={(event) => setEditing({ ...editing, name: event.target.value })}
              />
            </Field>
            <Field label="E-mail">
              <Input
                value={editing.email}
                onChange={(event) => setEditing({ ...editing, email: event.target.value })}
              />
            </Field>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(blocking)}
        title={`Bloquear ${blocking?.name ?? ''}`}
        onClose={() => setBlocking(null)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setBlocking(null)}>
              Cancelar
            </Button>
            <Button
              variant="danger"
              loading={blockMutation.isPending}
              onClick={() => blocking && blockMutation.mutate({ id: blocking.id, reason: blockReason })}
            >
              Bloquear
            </Button>
          </>
        }
      >
        <Field label="Motivo (visível para o usuário)">
          <Input
            value={blockReason}
            onChange={(event) => setBlockReason(event.target.value)}
            placeholder="Ex.: uso indevido da plataforma"
          />
        </Field>
      </Modal>

      <Modal
        open={creating}
        title="Novo usuário"
        onClose={() => setCreating(false)}
        footer={
          <>
            <Button variant="ghost" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button variant="primary" loading={createMutation.isPending} onClick={() => createMutation.mutate()}>
              Criar
            </Button>
          </>
        }
      >
        <div className="grid c2">
          <Field label="Nome">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="E-mail">
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
            />
          </Field>
          <Field label="Perfil">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              <option value="ALUNO">ALUNO</option>
              <option value="EDITOR">EDITOR</option>
              <option value="ADMIN">ADMIN</option>
            </Select>
          </Field>
          <Field label="Senha provisória" hint="Mínimo 8 caracteres, com letra e número.">
            <Input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
