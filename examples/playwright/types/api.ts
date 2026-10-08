// Shapes of the Glyphwild API's requests and responses (see /schemas on the API for the full JSON Schemas).

export type Role = 'admin' | 'viewer';

export interface Credentials {
  username: string;
  password: string;
}

export interface LoginResponse {
  token: string;
  tokenType: 'Bearer';
  expiresIn: number;
  expiresAt: string;
  user: { username: string; role: Role };
}

export interface Me {
  username: string;
  role: Role;
  expiresAt: string;
}

/** A string, number or boolean - or an array when there are several values. */
export type AttributeValue = string | number | boolean | (string | number)[];

export interface Card {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  attributes: Record<string, AttributeValue>;
  dropRate: number;
  createdAt: string;
  updatedAt: string;
}

/** Body of POST/PUT /cards. Read-only fields may be sent back and are ignored. */
export type CardInput = Pick<Card, 'name' | 'imageUrl' | 'dropRate'> &
  Partial<Omit<Card, 'name' | 'imageUrl' | 'dropRate'>>;

export type Difficulty = 'beginner' | 'intermediate' | 'advanced' | 'expert';

export interface DeckCard {
  cardId: string;
  quantity: number;
}

export interface Deck {
  id: string;
  name: string;
  theme: string;
  description: string;
  difficulty: Difficulty;
  cards: DeckCard[];
  totalCards: number;
  createdAt: string;
  updatedAt: string;
}

/** Body of POST/PUT /decks. Read-only fields may be sent back and are ignored. */
export type DeckInput = Pick<Deck, 'name' | 'theme' | 'difficulty'> &
  Partial<Omit<Deck, 'name' | 'theme' | 'difficulty'>>;

/** Lets negative tests send deliberately invalid bodies. */
export type AnyBody = Record<string, unknown> | unknown[];

export interface SearchPage<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// Search params are `type` aliases (not interfaces) so they fit Playwright's `params` option.
type PagingParams = {
  order?: 'asc' | 'desc';
  page?: number;
  pageSize?: number;
};

export type CardSearchParams = PagingParams & {
  name?: string;
  type?: string;
  element?: string;
  minDropRate?: number;
  maxDropRate?: number;
  minPoints?: number;
  maxPoints?: number;
  sortBy?: 'name' | 'dropRate' | 'createdAt';
};

export type DeckSearchParams = PagingParams & {
  name?: string;
  theme?: string;
  difficulty?: Difficulty;
  cardId?: string;
  sortBy?: 'name' | 'difficulty' | 'totalCards' | 'createdAt';
};

export interface ErrorDetail {
  field: string;
  rule: string;
  message: string;
}

export interface ErrorResponse {
  status: number;
  code: string;
  message: string;
  details: ErrorDetail[];
  requestId: string;
}

export interface Health {
  status: 'ok';
  name: string;
  version: string;
  startedAt: string;
  uptimeSeconds: number;
  data: { cards: number; decks: number };
  settings: {
    latencyMs: number;
    chaosRate: number;
    teachingHeaders: boolean;
    tokenTtlSeconds: number;
    resetOnStart: boolean;
  };
}

/** Extra options any service call accepts (e.g. the teaching headers X-Delay-Ms, X-Chaos-*). */
export interface RequestOptions {
  headers?: Record<string, string>;
  timeout?: number;
  maxRetries?: number;
}
