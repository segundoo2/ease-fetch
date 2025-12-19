export type HeadersObj = Record<string, string>;
export type FetchFn = typeof fetch;

export interface RuntimeExtensions {
  cache?: RequestCache;
  next?: {
    revalidate?: number;
    tags?: string[];
  };
}

export interface RequestOptions extends RuntimeExtensions {
  method?: string;
  body?: BodyInit | null;
  headers?: HeadersObj | Headers;
  credentials?: RequestCredentials;
  mode?: RequestMode;
  redirect?: RequestRedirect;
  referrer?: string;
  referrerPolicy?: ReferrerPolicy;
  integrity?: string;
  keepalive?: boolean;
  signal?: AbortSignal;

  timeoutMs?: number;
}

export interface ApiError {
  message: string;
  status?: number;
  data?: unknown;
}

export type RequestInterceptor = (
  endpoint: string,
  options: RequestOptions
) => Promise<[string, RequestOptions]> | [string, RequestOptions];

export type ResponseInterceptor = (
  response: Response
) => Promise<Response> | Response;

export type ResponseErrorInterceptor = (
  error: unknown
) => Promise<never> | never;

export interface ApiClientOptions {
  baseURL?: string;
  fetchImpl?: FetchFn;
  timeoutMs?: number;
  maxRetries?: number;
  logger?: {
    debug?: (...args: unknown[]) => void;
    error?: (...args: unknown[]) => void;
  };
}
