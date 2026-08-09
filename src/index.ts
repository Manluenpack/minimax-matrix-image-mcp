#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { Matrix } from "./services/matrix.js";
import {
  GenerateBatchSchema,
  GenerateImageSchema,
  ImageToImageSchema,
  TextToImageSchema,
  UploadSchema,
  type GenerateBatchInput,
  type GenerateImageInput,
  type ImageToImageInput,
  type TextToImageInput,
  type UploadInput,
} from "./schemas/image.js";

const server = new McpServer({
  name: "minimax-matrix-image-mcp",
  version: "1.0.0",
});

let matrix: Matrix | null = null;
function getMatrix(): Matrix {
  matrix ??= new Matrix();
  return matrix;
}

const outputUrlSchema = z.object({
  output_url: z.string().describe("CDN URL of the generated image"),
});

function toError(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  return `Error: ${msg}. Check MINIMAX_TOKEN and input validity, then retry.`;
}

function ok(content: string, structuredContent: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: content }], structuredContent };
}

server.registerTool(
  "matrix_text_to_image",
  {
    title: "Text to Image (文生图)",
    description: `Generate an image from a text prompt using MiniMax Matrix image synthesis.

Args:
  - prompt (string, required): Text description of the image to generate
  - aspect_ratio ('1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9', default '1:1'): Output aspect ratio
  - resolution ('1K' | '2K' | '4K', default '2K'): Output resolution

Returns:
  {
    "output_url": string   // CDN URL of the generated image
  }

Examples:
  - "a cute cat on a windowsill" -> 1:1, 2K
  - "cyberpunk city at night, neon lights" -> 16:9, 4K

Note: generation can take from tens of seconds to minutes.`,
    inputSchema: TextToImageSchema,
    outputSchema: outputUrlSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async (params: TextToImageInput) => {
    try {
      const url = await getMatrix().textToImage(params.prompt, {
        aspectRatio: params.aspect_ratio,
        resolution: params.resolution,
      });
      return ok(`Generated image: ${url}`, { output_url: url });
    } catch (error) {
      return { isError: true, content: [{ type: "text" as const, text: toError(error) }] };
    }
  }
);

server.registerTool(
  "matrix_image_to_image",
  {
    title: "Image to Image (图生图)",
    description: `Transform a reference image using a text prompt (image-to-image) with MiniMax Matrix.

Args:
  - prompt (string, required): Text description of the desired transformation
  - image (string, required): Reference image as an http(s) URL or a local file path (local paths are auto-uploaded; supports png/jpg/webp/gif/bmp)
  - aspect_ratio ('1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9', default '1:1'): Output aspect ratio
  - resolution ('1K' | '2K' | '4K', default '2K'): Output resolution

Returns:
  {
    "output_url": string   // CDN URL of the generated image
  }

Examples:
  - image="/tmp/photo.png", prompt="make it a watercolor painting"
  - image="https://example.com/cat.jpg", prompt="replace the cat with a dog"

Note: generation can take from tens of seconds to minutes.`,
    inputSchema: ImageToImageSchema,
    outputSchema: outputUrlSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async (params: ImageToImageInput) => {
    try {
      const url = await getMatrix().imageToImage({
        image: params.image,
        prompt: params.prompt,
        aspectRatio: params.aspect_ratio,
        resolution: params.resolution,
      });
      return ok(`Generated image: ${url}`, { output_url: url });
    } catch (error) {
      return { isError: true, content: [{ type: "text" as const, text: toError(error) }] };
    }
  }
);

server.registerTool(
  "matrix_generate_image",
  {
    title: "Generate Image (智能生成)",
    description: `Smart image generation: text-to-image when no input is given, image-to-image when a reference image is provided.

Args:
  - prompt (string, required): Text description of the image to generate
  - input (string | string[], optional): Reference image(s) as http(s) URLs or local file paths (auto-uploaded). Omit for pure text-to-image.
  - aspect_ratio ('1:1' | '16:9' | '9:16' | '4:3' | '3:4' | '21:9', default '1:1'): Output aspect ratio
  - resolution ('1K' | '2K' | '4K', default '2K'): Output resolution

Returns:
  {
    "output_url": string   // CDN URL of the generated image
  }`,
    inputSchema: GenerateImageSchema,
    outputSchema: outputUrlSchema,
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async (params: GenerateImageInput) => {
    try {
      const url = await getMatrix().generateImage({
        prompt: params.prompt,
        input: params.input ?? null,
        aspectRatio: params.aspect_ratio,
        resolution: params.resolution,
      });
      return ok(`Generated image: ${url}`, { output_url: url });
    } catch (error) {
      return { isError: true, content: [{ type: "text" as const, text: toError(error) }] };
    }
  }
);

server.registerTool(
  "matrix_generate_batch",
  {
    title: "Generate Images in Batch (批量生成)",
    description: `Generate up to 10 images in one call. Each item is either a plain prompt string or an object with its own prompt/input/aspect_ratio/resolution. The backend executes all requests in parallel.

Args:
  - items (array, required, 1-10): list of generation requests, each:
      - string: plain prompt (uses default 1:1 / 2K)
      - object: { prompt (required), input (optional URL or local path), aspect_ratio, resolution }

Returns:
  {
    "output_urls": string[]   // CDN URLs aligned with the input items order
  }`,
    inputSchema: GenerateBatchSchema,
    outputSchema: z.object({
      output_urls: z.array(z.string()).describe("Generated image URLs, aligned with input item order"),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async (params: GenerateBatchInput) => {
    try {
      const urls = await getMatrix().generateBatch(params.items);
      return ok(
        urls.map((u, i) => `[${i}] ${u}`).join("\n"),
        { output_urls: urls }
      );
    } catch (error) {
      return { isError: true, content: [{ type: "text" as const, text: toError(error) }] };
    }
  }
);

server.registerTool(
  "matrix_upload_file",
  {
    title: "Upload File to CDN (上传文件)",
    description: `Upload a local file to MiniMax CDN and return its URL. Useful before image-to-image when the reference file is on disk (though local paths are also accepted directly by the image-to-image tools, which auto-upload).

Args:
  - file_path (string, required): Absolute path to a local file (png/jpg/webp/gif/bmp/mp4/mov/webm/mp3/wav/m4a/aac/pdf, up to 500 MiB)
  - ttl (int, 60-604800, default 3600): CDN URL time-to-live in seconds
  - category (string, default 'user_upload'): Upload category

Returns:
  {
    "cdn_url": string   // CDN URL of the uploaded file
  }`,
    inputSchema: UploadSchema,
    outputSchema: z.object({
      cdn_url: z.string().describe("CDN URL of the uploaded file"),
    }),
    annotations: {
      readOnlyHint: false,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  async (params: UploadInput) => {
    try {
      const cdnUrl = await getMatrix().upload(params.file_path, {
        ttl: params.ttl,
        category: params.category,
      });
      return ok(`Uploaded: ${cdnUrl}`, { cdn_url: cdnUrl });
    } catch (error) {
      return { isError: true, content: [{ type: "text" as const, text: toError(error) }] };
    }
  }
);

async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error: unknown) => {
  console.error("minimax-matrix-image-mcp server error:", error);
  process.exit(1);
});
