import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, Field, Input, Pagination, Spinner, Table } from '@/components/ui';
import { adminService } from '@/services/admin.service';
import { formatDateTime } from '@/utils/format';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

/** Trilha de auditoria: quem fez o quê e quando. */
export default function AdminLogs() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState('');
  const [entity, setEntity] = useState('');
  const debouncedAction = useDebouncedValue(action, 400);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-logs', page, debouncedAction, entity],
    queryFn: () =>
      adminService.logs({
        page,
        limit: 30,
        action: debouncedAction || undefined,
        entity: entity || undefined,
      }),
  });

  return (
    <div className="wrap">
      <h1 className="page-title">🧾 Logs de auditoria</h1>

      <Card>
        <div className="grid c2">
          <Field label="Filtrar por ação">
            <Input
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setPage(1);
              }}
              placeholder="Ex.: user.blocked, question.created"
            />
          </Field>
          <Field label="Filtrar por entidade">
            <Input
              value={entity}
              onChange={(event) => {
                setEntity(event.target.value);
                setPage(1);
              }}
              placeholder="user, question, subject..."
            />
          </Field>
        </div>
      </Card>

      {isLoading ? (
        <Spinner label="Carregando logs..." />
      ) : (
        <Card>
          <Table head={['Data', 'Ação', 'Entidade', 'Autor', 'IP']}>
            {data?.data.map((log) => (
              <tr key={log.id}>
                <td className="tiny muted">{formatDateTime(log.createdAt)}</td>
                <td>
                  <code className="tiny">{log.action}</code>
                </td>
                <td className="tiny muted">
                  {log.entity}
                  {log.entityId ? ` · ${String(log.entityId).slice(0, 8)}` : ''}
                </td>
                <td className="small">{log.actor?.name ?? '—'}</td>
                <td className="tiny muted">{/* IP não é exposto ao frontend */}—</td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} totalPages={data?.meta.totalPages ?? 1} onChange={setPage} />
        </Card>
      )}
    </div>
  );
}
