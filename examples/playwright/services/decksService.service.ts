import { APIRequestContext, APIResponse } from '@playwright/test';
import { decksServiceEndpoints } from '../endpoints/decksService.endpoints';
import type {
  AnyBody,
  Deck,
  DeckInput,
  DeckSearchParams,
  RequestOptions,
} from '../types';
import { BaseService } from './baseService.service';

export class DecksService extends BaseService {
  // Ids of the decks this service created, so cleanup() can delete them.
  private readonly createdIds: string[] = [];

  constructor(request: APIRequestContext, token?: string) {
    super(request, token);
  }

  async getAll(options?: RequestOptions): Promise<APIResponse> {
    return this.request.get(
      decksServiceEndpoints.decks,
      this.withAuth(options)
    );
  }

  async getById(id: string, options?: RequestOptions): Promise<APIResponse> {
    return this.request.get(decksServiceEndpoints.decks, {
      ...this.withAuth(options),
      params: { id },
    });
  }

  async search(
    params: DeckSearchParams | Record<string, string | number> = {},
    options?: RequestOptions
  ): Promise<APIResponse> {
    return this.request.get(decksServiceEndpoints.search, {
      ...this.withAuth(options),
      params,
    });
  }

  async create(
    data: DeckInput | AnyBody,
    options?: RequestOptions
  ): Promise<APIResponse> {
    const response = await this.request.post(decksServiceEndpoints.decks, {
      ...this.withAuth(options),
      data,
    });
    if (response.status() === 201) {
      this.createdIds.push(((await response.json()) as Deck).id);
    }
    return response;
  }

  async replace(
    id: string,
    data: DeckInput | AnyBody,
    options?: RequestOptions
  ): Promise<APIResponse> {
    return this.request.put(decksServiceEndpoints.decks, {
      ...this.withAuth(options),
      params: { id },
      data,
    });
  }

  async deleteById(id: string, options?: RequestOptions): Promise<APIResponse> {
    return this.request.delete(decksServiceEndpoints.decks, {
      ...this.withAuth(options),
      params: { id },
    });
  }

  // Deletes every deck this service created (call it BEFORE CardsService.cleanup()).
  async cleanup(): Promise<void> {
    for (const id of this.createdIds.splice(0)) {
      await this.retryOnChaos(() => this.deleteById(id), [204, 404]);
    }
  }
}
