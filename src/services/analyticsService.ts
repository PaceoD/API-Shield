import { request } from './apiClient';
import {
  AnalyticsOverview,
  TimeseriesPoint,
  EndpointStat,
  StatusCodeDistribution,
  RequestLog,
} from '../types/api';

export interface AnalyticsFilterParams {
  range?: '1h' | '24h' | '7d' | '30d';
  apiId?: string;
  traffic?: 'all' | 'allowed' | 'blocked';
  status?: string;
  limit?: number;
  offset?: number;
}

export const analyticsService = {
  async getOverview(params: { range?: string; apiId?: string } = {}): Promise<AnalyticsOverview> {
    const query = new URLSearchParams();
    if (params.range) query.set('range', params.range);
    if (params.apiId && params.apiId !== 'all') query.set('apiId', params.apiId);

    const res = await request<{ data: AnalyticsOverview }>(`/analytics/overview?${query.toString()}`);
    return res.data;
  },

  async getTimeseries(params: AnalyticsFilterParams = {}): Promise<TimeseriesPoint[]> {
    const query = new URLSearchParams();
    if (params.range) query.set('range', params.range);
    if (params.apiId && params.apiId !== 'all') query.set('apiId', params.apiId);
    if (params.traffic && params.traffic !== 'all') query.set('traffic', params.traffic);
    if (params.status && params.status !== 'all') query.set('status', params.status);

    const res = await request<{ data: TimeseriesPoint[] }>(`/analytics/timeseries?${query.toString()}`);
    return res.data;
  },

  async getEndpoints(params: { range?: string; apiId?: string } = {}): Promise<EndpointStat[]> {
    const query = new URLSearchParams();
    if (params.range) query.set('range', params.range);
    if (params.apiId && params.apiId !== 'all') query.set('apiId', params.apiId);

    const res = await request<{ data: EndpointStat[] }>(`/analytics/endpoints?${query.toString()}`);
    return res.data;
  },

  async getStatusCodes(params: { range?: string; apiId?: string } = {}): Promise<StatusCodeDistribution[]> {
    const query = new URLSearchParams();
    if (params.range) query.set('range', params.range);
    if (params.apiId && params.apiId !== 'all') query.set('apiId', params.apiId);

    const res = await request<{ data: StatusCodeDistribution[] }>(`/analytics/status-codes?${query.toString()}`);
    return res.data;
  },

  async getLogs(params: AnalyticsFilterParams = {}): Promise<{ logs: RequestLog[]; total: number }> {
    const query = new URLSearchParams();
    if (params.range) query.set('range', params.range);
    if (params.apiId && params.apiId !== 'all') query.set('apiId', params.apiId);
    if (params.traffic && params.traffic !== 'all') query.set('traffic', params.traffic);
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.limit) query.set('limit', params.limit.toString());
    if (params.offset) query.set('offset', params.offset.toString());

    const res = await request<{ data: RequestLog[]; pagination: { total: number } }>(`/analytics/logs?${query.toString()}`);
    return { logs: res.data, total: res.pagination.total };
  },
};
