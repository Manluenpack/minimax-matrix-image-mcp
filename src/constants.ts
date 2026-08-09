export const DEFAULT_BASE_URL = "https://agent.minimaxi.com";

/** Files <= 600 KiB go through the inline base64 `upload_to_cdn` endpoint. */
export const INLINE_LIMIT_BYTES = 600 * 1024;

/** Hard cap for large-file (presigned PUT) uploads. */
export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

/** Image synthesis can legitimately take minutes (main.ts used 50 min). */
export const DEFAULT_TIMEOUT_MS = 3_000_000;

export const DEFAULT_ASPECT_RATIO = "1:1";
export const DEFAULT_RESOLUTION = "2K";

/** Env var carrying the MiniMax bearer token. */
export const TOKEN_ENV = "MINIMAX_TOKEN";

/** Env var override for the API base URL. */
export const BASE_URL_ENV = "MINIMAX_BASE_URL";

/** Env var to opt out of the mavis daemon token dump (pure env mode). */
export const DISABLE_MAVIS_DUMP_ENV = "MINIMAX_DISABLE_MAVIS_DUMP";
