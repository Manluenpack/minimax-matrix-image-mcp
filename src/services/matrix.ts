import { readFile, stat } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { basename, extname } from "node:path";
import {
  BASE_URL_ENV,
  DEFAULT_BASE_URL,
  DEFAULT_TIMEOUT_MS,
  DISABLE_MAVIS_DUMP_ENV,
  INLINE_LIMIT_BYTES,
  MAX_UPLOAD_BYTES,
  TOKEN_ENV,
} from "../constants.js";
import type {
  BatchItem,
  GenerateImageOptions,
  ImageSynthesizeRequest,
  ImageSynthesizeResponse,
  Input,
  MatrixOptions,
  PresignedUploadResponse,
  UploadCdnResponse,
  UploadOptions,
} from "../types.js";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".webm": "video/webm",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".pdf": "application/pdf",
};

const guessMime = (filename: string): string =>
  MIME_BY_EXT[extname(filename).toLowerCase()] ?? "application/octet-stream";

const buildHeaders = (token: string): Record<string, string> => ({
  Authorization: `Bearer ${token}`,
  "User-Agent": "MiniMaxAgent",
  "Content-Type": "application/json",
});

const isHttpUrl = (s: string): boolean =>
  s.startsWith("http://") || s.startsWith("https://");

function dumpTokenFromMavis(): string | undefined {
  if (process.env[DISABLE_MAVIS_DUMP_ENV]) return undefined;
  try {
    const pidFile = `${process.env.HOME}/.mavis/daemon.pid`;
    const pid = JSON.parse(readFileSync(pidFile, "utf8")).pid as number;
    const out = execSync(`ps eww -p ${pid}`, { encoding: "utf8" });
    for (const tok of out.split(/\s+/)) {
      if (tok.startsWith("__MAVIS_PARENT_ACCESS_TOKEN=")) {
        return tok.slice("__MAVIS_PARENT_ACCESS_TOKEN=".length);
      }
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function resolveToken(): string {
  const fromEnv = process.env[TOKEN_ENV];
  if (fromEnv) return fromEnv;
  const fromMavis = dumpTokenFromMavis();
  if (fromMavis) return fromMavis;
  throw new Error(
    `No MiniMax token found. Set ${TOKEN_ENV} env var (or disable mavis dump with ${DISABLE_MAVIS_DUMP_ENV}).`
  );
}

export class MatrixUploader {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(token: string, baseUrl: string = DEFAULT_BASE_URL) {
    this.token = token;
    this.baseUrl = baseUrl;
    this.headers = buildHeaders(token);
  }

  async upload(filePath: string, opts: UploadOptions = {}): Promise<string> {
    const size = (await stat(filePath)).size;
    const filename = basename(filePath);
    const mime = guessMime(filename);
    const { ttl = 3600, category = "user_upload" } = opts;

    if (size <= INLINE_LIMIT_BYTES) {
      return this.uploadInline(filePath, filename, mime);
    }
    if (size <= MAX_UPLOAD_BYTES) {
      return this.uploadLarge(filePath, filename, mime, size, ttl, category);
    }
    throw new Error(
      `file too large: ${(size / 1024 / 1024).toFixed(1)} MiB > 500 MiB cap`
    );
  }

  private async uploadInline(
    filePath: string,
    filename: string,
    mime: string
  ): Promise<string> {
    const buf = await readFile(filePath);
    const r = await fetch(`${this.baseUrl}/mavis/api/v1/mcp/upload_to_cdn`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        data: buf.toString("base64"),
        filename,
        mime_type: mime,
      }),
      signal: AbortSignal.timeout(60_000),
    });
    if (!r.ok) throw new Error(`upload_to_cdn ${r.status}: ${await r.text()}`);
    const json = (await r.json()) as UploadCdnResponse;
    if (json.code !== undefined && json.code !== 0) {
      throw new Error(`upload_to_cdn: ${json.message ?? json.error ?? "failed"}`);
    }
    return json.cdn_url;
  }

  private async uploadLarge(
    filePath: string,
    filename: string,
    mime: string,
    size: number,
    ttl: number,
    category: string
  ): Promise<string> {
    const r = await fetch(`${this.baseUrl}/mavis/api/v1/mcp/get_upload_url`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({
        filename,
        mime_type: mime,
        ttl_seconds: ttl,
        category,
        size_bytes: size,
      }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!r.ok) throw new Error(`get_upload_url ${r.status}: ${await r.text()}`);
    const presigned = (await r.json()) as PresignedUploadResponse;
    if ((presigned.code ?? 0) !== 0) {
      throw new Error(`get_upload_url failed: ${JSON.stringify(presigned)}`);
    }

    const buf = await readFile(filePath);
    const putRes = await fetch(presigned.put_url, {
      method: "PUT",
      headers: {
        "Content-Type": presigned.content_type ?? mime,
        "Content-Length": String(size),
      },
      body: buf,
      signal: AbortSignal.timeout(600_000),
    });
    if (!putRes.ok) {
      throw new Error(`OSS PUT ${putRes.status}: ${await putRes.text()}`);
    }
    return presigned.cdn_url;
  }
}

export class Matrix {
  private readonly token: string;
  private readonly baseUrl: string;
  private readonly headers: Record<string, string>;

  constructor(opts: MatrixOptions = {}) {
    this.token = opts.token ?? resolveToken();
    this.baseUrl = opts.baseUrl ?? process.env[BASE_URL_ENV] ?? DEFAULT_BASE_URL;
    this.headers = buildHeaders(this.token);
  }

  upload(filePath: string, opts?: UploadOptions): Promise<string> {
    return new MatrixUploader(this.token, this.baseUrl).upload(filePath, opts);
  }

  private async resolveInputs(input: Input | null | undefined): Promise<string[]> {
    if (!input) return [];
    const items = Array.isArray(input) ? input : [input];
    return Promise.all(
      items.map(async (i) => (isHttpUrl(i) ? i : this.upload(i)))
    );
  }

  private async synthesize(
    requests: ImageSynthesizeRequest[]
  ): Promise<string[]> {
    const r = await fetch(`${this.baseUrl}/mavis/api/v1/mcp/image_synthesize`, {
      method: "POST",
      headers: this.headers,
      body: JSON.stringify({ requests }),
      signal: AbortSignal.timeout(DEFAULT_TIMEOUT_MS),
    });
    if (!r.ok) throw new Error(`image_synthesize ${r.status}: ${await r.text()}`);
    const data = (await r.json()) as ImageSynthesizeResponse;
    if (!data.success_items?.length) {
      throw new Error(`no output: ${JSON.stringify(data)}`);
    }
    return data.success_items.map((it) => it.output_url);
  }

  async generateImage(opts: GenerateImageOptions): Promise<string> {
    const { prompt, input = null, aspectRatio = "1:1", resolution = "2K" } = opts;
    const req: ImageSynthesizeRequest = {
      prompt,
      aspect_ratio: aspectRatio,
      resolution,
    };
    const urls = await this.resolveInputs(input);
    if (urls.length) req.input_urls = urls;
    const [url] = await this.synthesize([req]);
    return url!;
  }

  imageToImage(
    opts: Omit<GenerateImageOptions, "input"> & { image: Input }
  ): Promise<string> {
    const { image, ...rest } = opts;
    return this.generateImage({ ...rest, input: image });
  }

  textToImage(
    prompt: string,
    opts: Pick<GenerateImageOptions, "aspectRatio" | "resolution"> = {}
  ): Promise<string> {
    return this.generateImage({ prompt, input: null, ...opts });
  }

  async generateBatch(items: Array<string | BatchItem>): Promise<string[]> {
    const requests = await Promise.all(
      items.map(async (item): Promise<ImageSynthesizeRequest> => {
        const opts: BatchItem = typeof item === "string" ? { prompt: item } : item;
        const req: ImageSynthesizeRequest = {
          prompt: opts.prompt,
          aspect_ratio: opts.aspectRatio ?? "1:1",
          resolution: opts.resolution ?? "2K",
        };
        const urls = await this.resolveInputs(opts.input);
        if (urls.length) req.input_urls = urls;
        return req;
      })
    );
    return this.synthesize(requests);
  }
}
