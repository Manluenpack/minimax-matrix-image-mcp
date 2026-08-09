export type AspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4" | "21:9";
export type Resolution = "1K" | "2K" | "4K";

/** Accepts http(s) URL or local filesystem path (auto-uploaded). */
export type Input = string | string[];

export interface GenerateImageOptions {
  prompt: string;
  input?: Input | null;
  aspectRatio?: AspectRatio;
  resolution?: Resolution;
}

export interface BatchItem {
  prompt: string;
  input?: Input;
  aspectRatio?: AspectRatio;
  resolution?: Resolution;
}

export interface UploadOptions {
  ttl?: number;
  category?: string;
}

export interface MatrixOptions {
  token?: string;
  baseUrl?: string;
}

export interface ImageSynthesizeRequest {
  prompt: string;
  input_urls?: string[];
  aspect_ratio: AspectRatio;
  resolution: Resolution;
}

export interface ImageSynthesizeResponse {
  success_items: { output_url: string }[];
}

export interface PresignedUploadResponse {
  code?: number;
  put_url: string;
  cdn_url: string;
  oss_key?: string;
  content_type?: string;
  message?: string;
  error?: string;
}

export interface UploadCdnResponse {
  code?: number;
  cdn_url: string;
  message?: string;
  error?: string;
}
