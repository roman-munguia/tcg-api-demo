import { APIRequestContext, APIResponse, expect } from '@playwright/test';
import { baseServiceEndpoints } from '../endpoints/baseService.endpoints';
import type { RequestOptions } from '../types';

export class BaseService {
  readonly request: APIRequestContext;
  protected token?: string;

  constructor(request: APIRequestContext, token?: string) {
    this.request = request;
    this.token = token;
  }

  setToken(token?: string) {
    this.token = token;
  }

  // Adds 'Authorization: Bearer <token>' (when this service has a token) to the call's own options.
  protected withAuth(options: RequestOptions = {}): RequestOptions {
    const auth: Record<string, string> = this.token
      ? { Authorization: `Bearer ${this.token}` }
      : {};
    return { ...options, headers: { ...auth, ...options.headers } };
  }

  // Runs a call again while it fails with a simulated chaos error (500 CHAOS_INJECTED).
  protected async retryOnChaos(
    call: () => Promise<APIResponse>,
    expectedStatuses: number[]
  ): Promise<void> {
    await expect(async () => {
      const response = await call();
      expect(expectedStatuses).toContain(response.status());
    }).toPass({ intervals: [100, 250, 500], timeout: 5_000 });
  }

  async getHealth(): Promise<APIResponse> {
    return this.request.get(baseServiceEndpoints.health);
  }

  async resetData(): Promise<APIResponse> {
    return this.request.post(baseServiceEndpoints.reset, this.withAuth());
  }

  async getSchema(name: string): Promise<APIResponse> {
    return this.request.get(`${baseServiceEndpoints.schemas}/${name}.json`);
  }
}
