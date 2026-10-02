import http from './http';
import type { AdminUser, AuditLog } from '@/types';

export const adminService = {
  dashboard: () =>
    http.get<{
      users: {
        total: number;
        active: number;
        blocked: number;
        newLast7Days: number;
        newLast30Days: number;
        byRole: Array<{ role: string; total: number }>;
      };
      content: { questions: number; questionsByOrigin: Record<string, number>; subjects: number; topics: number };
      activity: {
        answers: number;
        accuracy: number;
        simulados: number;
        simuladosFinished: number;
        openErrors: number;
        aiConversations: number;
        last30Days: Array<{ date: string; questions: number; correct: number }>;
      };
      recentAudit: AuditLog[];
    }>('/admin/dashboard'),

  users: (params: { page?: number; limit?: number; search?: string; role?: string } = {}) =>
    http.paged<AdminUser>('/admin/users', params),

  user: (id: string) => http.get<AdminUser>(`/admin/users/${id}`),
  updateUser: (id: string, payload: Record<string, unknown>) =>
    http.patch<AdminUser>(`/admin/users/${id}`, payload),
  blockUser: (id: string, reason?: string) => http.post(`/admin/users/${id}/block`, { reason }),
  unblockUser: (id: string) => http.post(`/admin/users/${id}/unblock`),
  changeRole: (id: string, role: string) => http.patch(`/admin/users/${id}/role`, { role }),
  createUser: (payload: Record<string, unknown>) => http.post<AdminUser>('/users', payload),
  deleteUser: (id: string) => http.delete(`/admin/users/${id}`),

  logs: (params: { page?: number; limit?: number; action?: string; entity?: string } = {}) =>
    http.paged<AuditLog>('/admin/logs', params),

  roles: () => http.get('/admin/roles'),
  contentStats: () =>
    http.get<
      Array<{
        subjectId: string;
        code: string;
        name: string;
        questions: number;
        answers: number;
        correct: number;
        accuracy: number;
      }>
    >('/admin/content-stats'),
  hardestQuestions: (limit = 20) =>
    http.get<
      Array<{
        questionId: string;
        subject: { code: string; name: string };
        prompt: string;
        attempts: number;
        wrongCount: number;
        accuracy: number;
      }>
    >('/admin/hardest-questions', { limit }),
};

export default adminService;
