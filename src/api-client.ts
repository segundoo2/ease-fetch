import {
  ApiClientOptions,
  ApiError,
  RequestInterceptor,
  ResponseInterceptor,
  ResponseErrorInterceptor,
  RequestOptions,
} from "./types";
import { IDEMPOTENT_METHODS, mergeHeaders, wait } from "./helpers";

export class ApiClient {
  private readonly baseURL: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly logger?: ApiClientOptions["logger"];

  private readonly requestInterceptors: RequestInterceptor[] = [];
  private readonly responseInterceptors: ResponseInterceptor[] = [];
  private readonly responseErrorInterceptors: ResponseErrorInterceptor[] = [];

  constructor(options: ApiClientOptions = {}) {
    this.baseURL = options.baseURL ?? "";
    this.fetchImpl =
      options.fetchImpl ??
      (typeof fetch !== "undefined"
        ? fetch.bind(globalThis)
        : () => {
            throw new Error("fetch is not available");
          });

    this.timeoutMs = options.timeoutMs ?? 10_000;
    this.maxRetries = options.maxRetries ?? 3;
    this.logger = options.logger;
  }

  addRequestInterceptor(interceptor: RequestInterceptor): void {
    this.requestInterceptors.push(interceptor);
  }

  addResponseInterceptor(interceptor: ResponseInterceptor): void {
    this.responseInterceptors.push(interceptor);
  }

  addResponseErrorInterceptor(
    interceptor: ResponseErrorInterceptor
  ): void {
    this.responseErrorInterceptors.push(interceptor);
  }

  private async applyRequestInterceptors(
    endpoint: string,
    options: RequestOptions
  ): Promise<[string, RequestOptions]> {
    let e = endpoint;
    let o = options;

    for (const interceptor of this.requestInterceptors) {
      [e, o] = await interceptor(e, o);
    }

    return [e, o];
  }

  private async applyResponseInterceptors(
    response: Response
  ): Promise<Response> {
    let r = response;

    for (const interceptor of this.responseInterceptors) {
      r = await interceptor(r);
    }

    return r;
  }

  private async applyErrorInterceptors(
    error: unknown
  ): Promise<never> {
    for (const interceptor of this.responseErrorInterceptors) {
      await interceptor(error);
    }

    throw error;
  }

  private async fetchWithRetry<T>(
    endpoint: string,
    options: RequestOptions,
    attempt = 0
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      options.timeoutMs ?? this.timeoutMs
    );

    const headers = mergeHeaders(
      { "Content-Type": "application/json" },
      options.headers
    );

    const [finalEndpoint, finalOptions] =
      await this.applyRequestInterceptors(endpoint, options);

    const init: RequestInit = {
      ...finalOptions,
      headers,
      signal: finalOptions.signal ?? controller.signal,
    };

    const url = `${this.baseURL}${finalEndpoint}`;

    try {
      this.logger?.debug?.("fetch", url, init);

      const response = await this.fetchImpl(url, init);

      if (!response.ok) {
        const method = (init.method ?? "GET").toUpperCase();
        const canRetry =
          IDEMPOTENT_METHODS.has(method) &&
          response.status >= 500 &&
          response.status < 600 &&
          attempt < this.maxRetries;

        if (canRetry) {
          await wait(2 ** attempt * 300);
          return this.fetchWithRetry<T>(
            endpoint,
            options,
            attempt + 1
          );
        }

        let data: unknown = null;
        const ct = response.headers.get("content-type") ?? "";

        try {
          data = ct.includes("application/json")
            ? await response.json()
            : await response.text();
        } catch {
          data = null;
        }

        const error: ApiError = {
          message: response.statusText,
          status: response.status,
          data,
        };

        throw error;
      }

      const intercepted = await this.applyResponseInterceptors(response);

      if (intercepted.status === 204) {
        return null as T;
      }

      const ct = intercepted.headers.get("content-type") ?? "";

      return ct.includes("application/json")
        ? ((await intercepted.json()) as T)
        : ((await intercepted.text()) as unknown as T);
    } catch (error) {
      return this.applyErrorInterceptors(error);
    } finally {
      clearTimeout(timeout);
    }
  }

  request<T>(
    endpoint: string,
    options: RequestOptions = {}
  ): Promise<T> {
    return this.fetchWithRetry<T>(endpoint, options);
  }

  get<T>(endpoint: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(endpoint, { ...options, method: "GET" });
  }

  post<T>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: "POST",
      body:
        body instanceof FormData || body instanceof Blob
          ? body
          : JSON.stringify(body),
    });
  }

  put<T>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: "PUT",
      body: JSON.stringify(body),
    });
  }

  patch<T>(
    endpoint: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: "PATCH",
      body: JSON.stringify(body),
    });
  }

  delete<T>(
    endpoint: string,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>(endpoint, {
      ...options,
      method: "DELETE",
    });
  }
}
