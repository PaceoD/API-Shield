import { request } from './apiClient';
import { ApiKey } from '../types/api';

export interface CreateKeyInput {
  name: string;
  apiId: string;
}

export const keysService = {
  async getAll(apiId?: string): Promise<ApiKey[]> {
    const url = apiId ? `/keys?apiId=${encodeURIComponent(apiId)}` : '/keys';
    const res = await request<{ data: ApiKey[] }>(url);
    return res.data;
  },

  async create(input: CreateKeyInput): Promise<ApiKey> {
    const res = await request<{ data: ApiKey }>('/keys', {
      method: 'POST',
      body: JSON.stringify(input),
    });
    return res.data;
  },

  async revoke(id: string): Promise<ApiKey> {
    const res = await request<{ data: ApiKey }>(`/keys/${id}/revoke`, {
      method: 'POST',
    });
    return res.data;
  },

  async delete(id: string): Promise<{ success: boolean; id: string }> {
    return await request<{ success: boolean; id: string }>(`/keys/${id}`, {
      method: 'DELETE',
    });
  },
};
