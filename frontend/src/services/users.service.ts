import http from './http';
import type { User } from '@/types';

export const usersService = {
  me: () => http.get<User>('/users/me'),
  updateMe: (name: string) => http.patch('/users/me', { name }),
  exportData: () => http.get('/users/me/export'),
};

export default usersService;
