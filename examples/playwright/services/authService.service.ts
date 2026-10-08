import { APIRequestContext, APIResponse, expect } from '@playwright/test';
import { authServiceEndpoints } from '../endpoints/authService.endpoints';
import { CREDENTIALS } from '../data/testData';
import type { AnyBody, Credentials, LoginResponse, Role } from '../types';
import { BaseService } from './baseService.service';

export class AuthService extends BaseService {
  constructor(request: APIRequestContext, token?: string) {
    super(request, token);
  }

  async login(credentials: Credentials | AnyBody): Promise<APIResponse> {
    return this.request.post(authServiceEndpoints.login, {
      data: credentials,
    });
  }

  // Logs in as one of the built-in users, keeps the token in this service and returns it.
  async loginAs(role: Role): Promise<string> {
    const response = await this.login(CREDENTIALS[role]);
    if (response.status() === 401) {
      throw new Error(
        `The API rejected the ${role} credentials. If your instructor changed them, set ADMIN_*/VIEWER_* (the repo .env is read automatically).`
      );
    }
    await expect(response).toBeOK();
    const { token } = (await response.json()) as LoginResponse;
    this.setToken(token);
    return token;
  }

  async me(): Promise<APIResponse> {
    return this.request.get(authServiceEndpoints.me, this.withAuth());
  }

  async logout(): Promise<APIResponse> {
    return this.request.post(authServiceEndpoints.logout, this.withAuth());
  }
}
