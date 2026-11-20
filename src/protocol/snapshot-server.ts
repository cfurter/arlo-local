import * as http from "http";
import { Logger, nullLogger } from "./types";

const MAX_BODY = 50 * 1024 * 1024;

export function extractMultipartFile(body: Buffer, contentType: string): Buffer | undefined {
  const boundary = /boundary=(?:"([^"]+)"|([^;]+))/i.exec(contentType);
  if (!boundary)
    return undefined;
  const delimiter = Buffer.from(`--${boundary[1] ?? boundary[2]}`);
  const start = body.indexOf(delimiter);
  if (start < 0)
    return undefined;
  const headerEnd = body.indexOf("\r\n\r\n", start);
  if (headerEnd < 0)
    return undefined;
  const dataStart = headerEnd + 4;
  const end = body.indexOf(Buffer.concat([Buffer.from("\r\n"), delimiter]), dataStart);
  return body.subarray(dataStart, end < 0 ? body.length : end);
}

/** Receives snapshot uploads from cameras and hands them to whoever requested them. */
export class SnapshotServer {
  private server?: http.Server;
  private pending = new Map<string, { resolve(buffer: Buffer | undefined): void, timer: NodeJS.Timeout }>();

  constructor(private logger: Logger = nullLogger) { }

  start(port: number, bindAddress: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => this.handle(req, res));
      server.once('error', reject);
      server.listen(port, bindAddress, () => {
        server.off('error', reject);
        server.on('error', err => this.logger.error(`Snapshot server error: ${err.message}`));
        this.server = server;
        this.logger.log(`Snapshot server listening on ${bindAddress}:${port}`);
        resolve();
      });
    });
  }

  stop() {
    this.server?.close();
    this.server = undefined;
    for (const { resolve, timer } of this.pending.values()) {
      clearTimeout(timer);
      resolve(undefined);
    }
    this.pending.clear();
  }

  /** Resolves with the next snapshot uploaded for the identifier, or undefined on timeout. */
  waitForSnapshot(identifier: string, timeoutMs = 15000): Promise<Buffer | undefined> {
    return new Promise(resolve => {
      this.pending.get(identifier)?.resolve(undefined);
      const timer = setTimeout(() => {
        this.pending.delete(identifier);
        resolve(undefined);
      }, timeoutMs);
      this.pending.set(identifier, {
        timer,
        resolve: buffer => {
          clearTimeout(timer);
          this.pending.delete(identifier);
          resolve(buffer);
        },
      });
    });
  }

  /** Hands an uploaded image to whoever is waiting for it. */
  deliver(identifier: string, image: Buffer) {
    this.pending.get(identifier)?.resolve(image);
  }

  cancelWait(identifier: string) {
    this.pending.get(identifier)?.resolve(undefined);
  }

  private handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url || "/", "http://localhost");
    const match = /^\/snapshot\/([^/]+)(?:\/[^/]*)?$/.exec(url.pathname);

    if (req.method === "GET" && url.pathname === "/generate_204") {
      res.writeHead(204).end();
      return;
    }
    if (req.method !== "POST" || !match) {
      res.writeHead(404).end();
      return;
    }

    const identifier = decodeURIComponent(match[1]);
    const chunks: Buffer[] = [];
    let size = 0;
    req.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY) {
        res.writeHead(413).end();
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      let image: Buffer | undefined = Buffer.concat(chunks);
      const contentType = req.headers["content-type"] || "";
      if (/multipart\/form-data/i.test(contentType))
        image = extractMultipartFile(image, contentType);

      if (!image?.length) {
        res.writeHead(400).end("Invalid image data");
        return;
      }
      this.logger.log(`Snapshot received for ${identifier} (${image.length} bytes)`);
      this.deliver(identifier, image);
      res.writeHead(200).end();
    });
  }
}
