import * as net from 'net';
import { Message } from './message';
import { Logger, nullLogger } from './types';

/** Wraps a socket with the Arlo "L:<length> <json>" framing. */
export class ArloSocket {
    private buffer = Buffer.alloc(0);
    private waiter?: () => void;
    private closed = false;
    private error?: Error;

    constructor(private sock: net.Socket = new net.Socket(), private logger: Logger = nullLogger) {
        sock.on('data', chunk => {
            this.buffer = Buffer.concat([this.buffer, Buffer.from(chunk)]);
            this.waiter?.();
        });
        sock.on('close', () => {
            this.closed = true;
            this.waiter?.();
        });
        sock.on('error', err => {
            this.error = err;
            this.logger.error('[ArloSocket] socket error:', err.message);
            this.waiter?.();
        });
    }

    connect(host: string, port: number): Promise<void> {
        return new Promise((resolve, reject) => {
            this.sock.once('error', reject);
            this.sock.connect(port, host, () => {
                this.sock.off('error', reject);
                resolve();
            });
        });
    }

    send(message: Message): void {
        this.sock.write(message.toNetworkBytes());
    }

    private tryParse(): { message: Message | null } | undefined {
        if (!this.buffer.length)
            return undefined;
        if (this.buffer.length >= 2 && this.buffer.toString('utf-8', 0, 2) !== 'L:')
            return { message: null };

        const delimiter = this.buffer.indexOf(0x20);
        if (delimiter < 0)
            return undefined;
        const length = parseInt(this.buffer.toString('utf-8', 2, delimiter), 10);
        if (isNaN(length))
            return { message: null };
        if (this.buffer.length < delimiter + 1 + length)
            return undefined;

        const json = this.buffer.toString('utf-8', delimiter + 1, delimiter + 1 + length);
        this.buffer = this.buffer.subarray(delimiter + 1 + length);
        return { message: Message.fromJSON(json) };
    }

    /** Resolves with the next message, or null on close/garbage. */
    receive(): Promise<Message | null> {
        return new Promise((resolve, reject) => {
            const check = () => {
                const parsed = this.tryParse();
                if (parsed) {
                    this.waiter = undefined;
                    resolve(parsed.message);
                }
                else if (this.error) {
                    this.waiter = undefined;
                    reject(this.error);
                }
                else if (this.closed) {
                    this.waiter = undefined;
                    resolve(null);
                }
            };
            this.waiter = check;
            check();
        });
    }

    close(): void {
        this.sock.end();
    }

    getSocket(): net.Socket {
        return this.sock;
    }
}
