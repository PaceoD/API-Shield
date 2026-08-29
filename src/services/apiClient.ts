const BASE_URL = '/api';

export class ApiError extends Error {
  public statusCode: number;
  public data?: any;

  constructor(message: string, statusCode: number, data?: any) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.data = data;
  }
}

export async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = endpoint.startsWith('http') ? endpoint : `${BASE_URL}${endpoint}`;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  try {
    const response = await fetch(url, {
      credentials: 'include', // Automatically send signed session cookies
      ...options,
      headers,
    });

    let json: any = null;
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      json = await response.json();
    } else {
      const text = await response.text();
      try {
        json = JSON.parse(text);
      } catch {
        json = text;
      }
    }

    if (!response.ok) {
      const errorMessage = json?.error?.message || json?.message || `Request failed with status ${response.status}`;
      throw new ApiError(errorMessage, response.status, json);
    }

    return json as T;
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err;
    }
    throw new ApiError(err.message || 'Network error connecting to APIShield service', 0);
  }
}
