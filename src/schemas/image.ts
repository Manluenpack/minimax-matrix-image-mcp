import { z } from "zod";

export const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3", "3:4", "21:9"] as const;
export const RESOLUTIONS = ["1K", "2K", "4K"] as const;

const aspectRatioSchema = z
  .enum(ASPECT_RATIOS)
  .default("1:1")
  .describe("Output aspect ratio. One of: 1:1, 16:9, 9:16, 4:3, 3:4, 21:9");

const resolutionSchema = z
  .enum(RESOLUTIONS)
  .default("2K")
  .describe("Output resolution. One of: 1K, 2K, 4K");

const inputSchema = z
  .union([
    z.string().describe("An http(s) URL or a local file path to a reference image"),
    z
      .array(z.string())
      .describe("Multiple reference images: http(s) URLs or local file paths"),
  ])
  .optional()
  .describe(
    "Reference image(s) for image-to-image generation. Local file paths are uploaded automatically. Omit for text-to-image."
  );

export const TextToImageSchema = z
  .object({
    prompt: z
      .string()
      .min(1, "prompt is required")
      .describe("Text description of the image to generate"),
    aspect_ratio: aspectRatioSchema,
    resolution: resolutionSchema,
  })
  .strict();

export const ImageToImageSchema = z
  .object({
    prompt: z
      .string()
      .min(1, "prompt is required")
      .describe("Text description of the desired transformation of the reference image"),
    image: inputSchema.unwrap().describe(
      "Reference image: an http(s) URL or a local file path (auto-uploaded)"
    ),
    aspect_ratio: aspectRatioSchema,
    resolution: resolutionSchema,
  })
  .strict();

export const GenerateImageSchema = z
  .object({
    prompt: z.string().min(1, "prompt is required").describe("Text description of the image to generate"),
    input: inputSchema,
    aspect_ratio: aspectRatioSchema,
    resolution: resolutionSchema,
  })
  .strict();

export const BatchItemSchema = z
  .object({
    prompt: z.string().min(1, "prompt is required").describe("Text description of the image to generate"),
    input: inputSchema,
    aspect_ratio: aspectRatioSchema,
    resolution: resolutionSchema,
  })
  .strict();

export const GenerateBatchSchema = z
  .object({
    items: z
      .array(
        z.union([
          z.string().describe("A plain prompt (uses defaults for aspect ratio and resolution)"),
          BatchItemSchema,
        ])
      )
      .min(1, "at least one item is required")
      .max(10, "batch size is capped at 10")
      .describe("List of generation requests, executed in parallel by the backend"),
  })
  .strict();

export const UploadSchema = z
  .object({
    file_path: z
      .string()
      .min(1, "file_path is required")
      .describe("Absolute path to a local file to upload (images, video, audio, pdf)"),
    ttl: z
      .number()
      .int()
      .min(60)
      .max(7 * 24 * 3600)
      .default(3600)
      .optional()
      .describe("CDN URL time-to-live in seconds (default 3600)"),
    category: z
      .string()
      .default("user_upload")
      .optional()
      .describe("Upload category (default 'user_upload')"),
  })
  .strict();

export type TextToImageInput = z.infer<typeof TextToImageSchema>;
export type ImageToImageInput = z.infer<typeof ImageToImageSchema>;
export type GenerateImageInput = z.infer<typeof GenerateImageSchema>;
export type GenerateBatchInput = z.infer<typeof GenerateBatchSchema>;
export type UploadInput = z.infer<typeof UploadSchema>;
