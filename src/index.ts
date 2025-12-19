export { ApiClient } from "./api-client";
export * from "./types";
export * from "./helpers";

import { ApiClient } from "./api-client";
import { ApiClientOptions } from "./types";

export function createApiClient(
  options?: ApiClientOptions
): ApiClient {
  return new ApiClient(options);
}
