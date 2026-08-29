import { request } from './apiClient';
import { SystemInfo, SystemSettings } from '../types/api';

export const systemService = {
  async getSystemInfo(): Promise<SystemInfo> {
    const res = await request<{ data: SystemInfo }>('/system');
    return res.data;
  },

  async getSettings(): Promise<SystemSettings> {
    const res = await request<{ data: SystemSettings }>('/settings');
    return res.data;
  },

  async saveSettings(settings: Partial<SystemSettings>): Promise<{ data: SystemSettings; message: string }> {
    return await request<{ data: SystemSettings; message: string }>('/settings', {
      method: 'POST',
      body: JSON.stringify(settings),
    });
  },
};
