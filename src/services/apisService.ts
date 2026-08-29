import { request } from './apiClient';
import { ApiConfig } from '../types/api';

export interface CreateApiInput {
  name: string;
  description?: string;
  targetUrl: string;
  pathPrefix?: string;
  rateLimit: number;
  rateWindowSeconds: number;
  enabled?: boolean;
}

export const apisService = {
  async getAll(): Promise<ApiConfig[]> {
    const res = await request<{ data: ApiConfig[] }>('/apis');
    return res.data;
  },

  async getById(id: string): Promise<ApiConfig> {
    const res = await request<{ data: ApiConfig }>(`/apis/${id}`);
    return res.data;
  },

  async getStats(id: string, range = '24h'): Promise<any> {
    const res = await request<{ data: any }>(`/apis/${id}/stats?range=${encodeURIComponent(range)}`);
    return res.data;
  },

  async create(input: CreateApiInput): Promise<ApiConfig> {
    const res = await request<{ data: ApiConfig }>('/apis', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.data;
  },

  async update(id: string, updates: Partial<CreateApiInput>): Promise<ApiConfig> {
    const res = await request<{ data: ApiConfig }>(`/apis/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
    return res.data;
  },

  async delete(id: string): Promise<{ success: boolean; id: string }> {
    return await request<{ success: boolean; id: string }>(`/apis/${id}`, {
      method: 'DELETE',
    });
  },
};
