import { spawn } from "child_process";

export interface CurlResponse {
  ok: boolean;
  status: number;
  text: () => Promise<string>;
  json: <T = any>() => Promise<T>;
}

export function curlFetch(
  url: string,
  options?: {
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
  }
): Promise<CurlResponse> {
  return new Promise((resolve, reject) => {
    const timeoutSec = Math.ceil((options?.timeout ?? 25000) / 1000);
    const args = [
      "-s",
      "-S",
      "--max-time",
      String(timeoutSec),
      "-w",
      "\n__HTTP_STATUS__:%{http_code}",
    ];

    const method = options?.method?.toUpperCase() || "GET";
    if (method !== "GET") {
      args.push("-X", method);
    }

    if (options?.headers) {
      for (const [key, val] of Object.entries(options.headers)) {
        args.push("-H", `${key}: ${val}`);
      }
    }

    if (options?.body) {
      args.push("-d", options.body);
    }

    args.push(url);

    const proc = spawn("curl", args);
    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];

    proc.stdout.on("data", (c) => chunks.push(c));
    proc.stderr.on("data", (c) => errChunks.push(c));

    proc.on("error", (err) => reject(err));

    proc.on("close", (code) => {
      const output = Buffer.concat(chunks).toString("utf8");
      const errOutput = Buffer.concat(errChunks).toString("utf8");

      const marker = "\n__HTTP_STATUS__:";
      const markerIdx = output.lastIndexOf(marker);
      if (markerIdx === -1) {
        return reject(
          new Error(`curl request failed (${code}): ${errOutput || "No response received"}`)
        );
      }

      const bodyText = output.substring(0, markerIdx);
      const statusCodeStr = output.substring(markerIdx + marker.length).trim();
      const status = parseInt(statusCodeStr, 10) || 0;

      resolve({
        ok: status >= 200 && status < 300,
        status,
        text: async () => bodyText,
        json: async <T = any>(): Promise<T> => {
          try {
            return JSON.parse(bodyText) as T;
          } catch {
            throw new Error(
              `Failed to parse JSON (HTTP ${status}): ${bodyText.slice(0, 150)}`
            );
          }
        },
      });
    });
  });
}

