import { HeadersObj } from "./types";

export const IDEMPOTENT_METHODS = new Set<string>([
  "GET",
  "PUT",
  "DELETE",
  "HEAD",
  "OPTIONS",
]);

export function mergeHeaders(
  defaults: HeadersObj,
  incoming?: HeadersObj | Headers
): HeadersObj {
  const result: HeadersObj = { ...defaults };
  if (!incoming) return result;

  const apply = (key: string, value: string) => {
    if (value.includes("\n") || value.includes("\r")) {
      throw new Error(`Invalid header value for "${key}"`);
    }
    result[key] = value;
  };

  if (incoming instanceof Headers) {
    incoming.forEach((value, key) => apply(key, value));
    return result;
  }

  Object.entries(incoming).forEach(([key, value]) =>
    apply(key, value)
  );

  return result;
}

export function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
