import * as net from "net";
import { ConnectionHandler, ConnectionHandlerContext } from "./connection-handler";
import { Logger, nullLogger } from "./types";

export const CAMERA_PORTS = [4000, 4100];

export interface ListenerOptions {
  bindAddress: string;
  ports?: number[];
}

/** Owns the TCP listeners that cameras connect to for registration, status and alerts. */
export class CameraListener {
  private servers: net.Server[] = [];
  private logger: Logger;

  constructor(private ctx: ConnectionHandlerContext) {
    this.logger = ctx.logger ?? nullLogger;
  }

  async start(options: ListenerOptions): Promise<void> {
    const ports = options.ports ?? CAMERA_PORTS;
    try {
      for (const port of ports)
        this.servers.push(await this.listen(port, options.bindAddress));
    }
    catch (e) {
      this.stop();
      throw e;
    }
  }

  private listen(port: number, bindAddress: string): Promise<net.Server> {
    return new Promise((resolve, reject) => {
      const server = net.createServer(socket => {
        new ConnectionHandler(socket, this.ctx).handle()
          .catch(err => this.logger.error(`Handler error: ${err}`));
      });
      server.once("error", err => reject(new Error(`Unable to listen on ${bindAddress}:${port}: ${err.message}`)));
      server.listen(port, bindAddress, () => {
        server.removeAllListeners("error");
        server.on("error", err => this.logger.error(`Server error on port ${port}: ${err.message}`));
        this.logger.log(`Listening for cameras on ${bindAddress}:${port}`);
        resolve(server);
      });
    });
  }

  stop() {
    for (const server of this.servers)
      server.close();
    this.servers = [];
  }
}
