import { request } from './apiClient';

export interface User {
  id: string;
  email: string;
  createdAt: string;
}

export const authService = {
  async register(email: string, password: string): Promise<User> {
    const res = await request<{ data: { user: User } }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return res.data.user;
  },

  async login(email: string, password: string): Promise<User> {
    const res = await request<{ data: { user: User } }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    return res.data.user;
  },

  async logout(): Promise<void> {
    await request<{ success: boolean }>('/auth/logout', {
      method: 'POST',
    });
  },

  async getMe(): Promise<User | null> {
    try {
      const res = await request<{ data: { user: User } }>('/auth/me');
      return res.data.user;
    } catch {
      return null;
    }
  },
};
