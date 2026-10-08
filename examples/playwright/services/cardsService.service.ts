import { APIRequestContext, APIResponse } from '@playwright/test';
import { cardsServiceEndpoints } from '../endpoints/cardsService.endpoints';
import type {
  AnyBody,
  Card,
  CardInput,
  CardSearchParams,
  RequestOptions,
} from '../types';
import { BaseService } from './baseService.service';

export class CardsService extends BaseService {
  // Ids of the cards this service created, so cleanup() can delete them.
  private readonly createdIds: string[] = [];

  constructor(request: APIRequestContext, token?: string) {
    super(request, token);
  }

  async getAll(options?: RequestOptions): Promise<APIResponse> {
    return this.request.get(
      cardsServiceEndpoints.cards,
      this.withAuth(options)
    );
  }

  async getById(id: string, options?: RequestOptions): Promise<APIResponse> {
    return this.request.get(cardsServiceEndpoints.cards, {
      ...this.withAuth(options),
      params: { id },
    });
  }

  async search(
    params: CardSearchParams | Record<string, string | number> = {},
    options?: RequestOptions
  ): Promise<APIResponse> {
    return this.request.get(cardsServiceEndpoints.search, {
      ...this.withAuth(options),
      params,
    });
  }

  async create(
    data: CardInput | AnyBody,
    options?: RequestOptions
  ): Promise<APIResponse> {
    const response = await this.request.post(cardsServiceEndpoints.cards, {
      ...this.withAuth(options),
      data,
    });
    if (response.status() === 201) {
      this.createdIds.push(((await response.json()) as Card).id);
    }
    return response;
  }

  async replace(
    id: string,
    data: CardInput | AnyBody,
    options?: RequestOptions
  ): Promise<APIResponse> {
    return this.request.put(cardsServiceEndpoints.cards, {
      ...this.withAuth(options),
      params: { id },
      data,
    });
  }

  async deleteById(id: string, options?: RequestOptions): Promise<APIResponse> {
    return this.request.delete(cardsServiceEndpoints.cards, {
      ...this.withAuth(options),
      params: { id },
    });
  }

  // Deletes every card this service created (call it in afterEach, AFTER deleting decks that use them).
  async cleanup(): Promise<void> {
    for (const id of this.createdIds.splice(0)) {
      await this.retryOnChaos(() => this.deleteById(id), [204, 404]);
    }
  }
}
