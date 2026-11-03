import type { Transport } from './types';
export class ClientError extends Error {
  constructor(
    public code: string,
    public params: Record<string, string | number> = {},
    public status = 0,
  ) {
    super(code);
  }
}
export class HttpTransport implements Transport {
  demo = false;
  async request<T>(path: string, method = 'GET', data?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await fetch(path, {
        method,
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
        signal: AbortSignal.timeout(20000),
        headers: data ? { 'Content-Type': 'application/json' } : {},
        body: data ? JSON.stringify(data) : undefined,
      });
    } catch {
      throw new ClientError('NETWORK_UNAVAILABLE');
    }
    let value: unknown;
    try {
      value = await response.json();
    } catch {
      throw new ClientError('SERVICE_UNAVAILABLE', {}, response.status);
    }
    if (!response.ok) {
      const error = value as { code?: string; params?: Record<string, string | number> };
      throw new ClientError(
        error.code || 'SERVICE_UNAVAILABLE',
        error.params || {},
        response.status,
      );
    }
    return value as T;
  }
}
