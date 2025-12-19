# ApiClient (api-fetch)

Cliente HTTP leve em TypeScript para browsers e ambiente server (com `fetch` provido).  
Fornece interceptors, retry/backoff, timeout, refresh de token com fila e tratamento de erros estruturado.

---

## Visão geral

- Classe principal: `ApiClient`
- Export padrão: `new ApiClient()` instanciado (`export const api = new ApiClient();`)
- Suporta: `get`, `post`, `put`, `patch`, `delete`, `request`
- Interceptors:
  - Request interceptors (async)
  - Response interceptors (async)
  - Response error interceptors (async)
- Recursos:
  - Timeout por requisição
  - Retries exponenciais com jitter para métodos idempotentes (`GET`, `PUT`, `DELETE`, `HEAD`, `OPTIONS`)
  - Flow de refresh de token que enfileira requisições enquanto ocorre refresh
  - Auto-redirect para `/login` se refresh falhar (no browser)
  - Compatível com `FormData`/`Blob` (remove `Content-Type` automático)
  - Merge de headers com `Headers` ou objeto plain

---

## Tipos principais (resumo)

```ts
type HeadersObj = Record<string, string>;

export interface RequestOptions extends Omit<RequestInit, "headers"> {
  headers?: HeadersObj | Headers;
  _retry?: boolean;
  timeoutMs?: number;
  signal?: AbortSignal;
}

export interface ApiError {
  message: string;
  status?: number;
  data?: any;
}

export type RequestInterceptor = (
  endpoint: string,
  options: RequestOptions
) => Promise<[string, RequestOptions]> | [string, RequestOptions];

export type ResponseInterceptor = (response: Response) => Promise<Response> | Response;
export type ResponseErrorInterceptor = (error: any) => Promise<any> | any;

export interface ApiClientOptions {
  baseURL?: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
  logger?: { debug?: (...args:any[])=>void; error?: (...args:any[])=>void; };
}
```

---

## Configuração / Instalação

```ts
import ApiClient from "@/services/api-fetch/src/api-fetch";

export const api = new ApiClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeoutMs: 10000,
  maxRetries: 3,
  logger: {
    debug: (...args:any[]) => console.debug("[API]", ...args),
    error: (...args:any[]) => console.error("[API]", ...args),
  },
});
```

---

## Uso

### GET

```ts
const data = await api.get("/students");
```

### POST

```ts
await api.post("/students", { name: "Ana" });
```

### POST com FormData

```ts
const fd = new FormData();
fd.append("file", file);
await api.post("/upload", fd);
```

### Cancelamento e Timeout

```ts
const controller = new AbortController();
await api.get("/slow", { timeoutMs: 5000, signal: controller.signal });
```

---

## Interceptors

### Request Interceptor (exemplo XSRF)

```ts
api.addRequestInterceptor(async (endpoint, options) => {
  const headers = { ...((options.headers as Record<string,string>)||{}) };
  if (typeof window !== "undefined") {
    const match = document.cookie.match("(^|;)\s*XSRF-TOKEN\s*=\s*([^;]+)");
    if (match) headers["X-XSRF-TOKEN"] = decodeURIComponent(match[2]);
  }
  return [endpoint, { ...options, headers }];
});
```

### Response Error Interceptor

```ts
api.addResponseErrorInterceptor(async (err) => {
  throw err;
});
```

---

## Refresh de Token (401)

- Ao receber `401`:
  - Uma requisição `POST /auth/refresh` é feita automaticamente.
  - Requisições paralelas aguardam até o refresh terminar.
  - Se falhar → limpa fila e redireciona para `/login`.

---

## Retry & Backoff

- `maxRetries` tentativas (padrão: 3)
- Retry para:
  - Falhas de rede
  - Status `>=500` ou `429`
- Apenas métodos idempotentes sofrem retry (`GET`, `PUT`, `DELETE`, `HEAD`, `OPTIONS`)

---

## Tratamento de Erros

```ts
try {
  await api.post("/users", data);
} catch (err: any) {
  console.log(err.status, err.message, err.data);
}
```

---

## Exemplo completo

```ts
import ApiClient from "@/services/api-fetch/src/api-fetch";

export const api = new ApiClient({
  baseURL: process.env.NEXT_PUBLIC_API_URL,
  timeoutMs: 10000,
  maxRetries: 3,
});

api.addRequestInterceptor(async (endpoint, options) => {
  const headers = { ...((options.headers as Record<string,string>) || {}) };
  if (typeof window !== "undefined") {
    const match = document.cookie.match("(^|;)\s*XSRF-TOKEN\s*=\s*([^;]+)");
    if (match) headers["X-XSRF-TOKEN"] = decodeURIComponent(match[2]);
  }
  return [endpoint, { ...options, headers }];
});

api.addResponseErrorInterceptor(async (err) => {
  throw err;
});
```

---

## Licença

Livre uso. Sem garantias.
