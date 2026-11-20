import * as net from 'net';
import { Message } from './message';
import { ArloSocket } from './socket';
import { DeviceConfig, DeviceRecord, Logger, nullLogger } from './types';

export abstract class Device {
    registration: Record<string, unknown>;
    ip: string;
    protected id = 0;
    serialNumber: string;
    hostname: string;
    status: Record<string, unknown> = {};
    friendlyName: string;
    modelNumber: string;
    config: DeviceConfig = {};

    abstract get port(): number;

    constructor(ip: string, registration: Record<string, unknown>, protected logger: Logger = nullLogger) {
        this.registration = registration;
        this.ip = ip;
        this.serialNumber = (registration['SystemSerialNumber'] as string) || '';
        this.modelNumber = (registration['SystemModelNumber'] as string) || '';
        this.hostname = `${this.modelNumber}-${this.serialNumber.slice(-5)}`;
        this.friendlyName = this.serialNumber;
    }

    toRecord(): DeviceRecord {
        return {
            serialNumber: this.serialNumber,
            ip: this.ip,
            hostname: this.hostname,
            friendlyName: this.friendlyName,
            registration: this.registration,
            status: this.status,
            config: this.config,
        };
    }

    applyRecord(record: DeviceRecord) {
        this.ip = record.ip;
        this.hostname = record.hostname || this.hostname;
        this.friendlyName = record.friendlyName || this.friendlyName;
        this.status = record.status || {};
        this.config = record.config || {};
    }

    sendMessage(message: Message, port?: number): Promise<boolean> {
        const targetPort = port || this.port;

        return new Promise(resolve => {
            const sock = new net.Socket();
            sock.setTimeout(5000);
            const arloSock = new ArloSocket(sock, this.logger);
            let done = false;
            const finish = (result: boolean) => {
                if (done)
                    return;
                done = true;
                sock.destroy();
                resolve(result);
            };

            sock.on('timeout', () => finish(false));
            sock.on('error', err => {
                this.logger.error(`Connection to camera failed: ${err.message}`);
                finish(false);
            });
            sock.on('connect', async () => {
                try {
                    this.id += 1;
                    message.set('ID', this.id);
                    this.logger.log(`TX [${this.friendlyName}:${this.ip}][${this.id}] ${message.toNetworkMessage()}`);
                    arloSock.send(message);

                    const ack = await arloSock.receive();
                    if (!ack || ack.get('ID') !== message.get('ID'))
                        return finish(false);

                    this.logger.log(`RX [${this.friendlyName}:${this.ip}][${this.id}] ${ack.toNetworkMessage()}`);
                    finish(!ack.has('Response') || ack.get('Response') === 'Ack');
                }
                catch (e) {
                    this.logger.error(`Exception in sendMessage: ${e instanceof Error ? e.message : String(e)}`);
                    finish(false);
                }
            });

            sock.connect(targetPort, this.ip);
        });
    }

    abstract sendInitialRegisterSet(wifiCountryCode: string, videoAntiFlickerRate?: number, videoQualityDefault?: string): Promise<void>;
    abstract buildConfig(): Message;
    abstract arm(args: Record<string, unknown>): Promise<boolean>;

    statusRequest(delay?: number): Promise<boolean> {
        const req = new Message({ Type: 'statusRequest', ID: 0 });
        if (delay)
            req.set('Delay', delay);
        return this.sendMessage(req);
    }

    micRequest(enabled: boolean): Promise<boolean> {
        return this.registerSet({ AudioMicEnable: enabled });
    }

    speakerRequest(enabled: boolean): Promise<boolean> {
        return this.registerSet({ AudioSpkrEnable: enabled });
    }

    registerSet(setValues: Record<string, unknown>): Promise<boolean> {
        return this.sendMessage(new Message({ Type: 'registerSet', ID: 0, SetValues: setValues }));
    }

    sendMessageDict(messageDict: Record<string, unknown>): Promise<boolean> {
        return this.sendMessage(new Message(messageDict));
    }

    sendEpochBsTime(): Promise<boolean> {
        const registerSet = this.buildConfig();
        (registerSet.get('SetValues') as Record<string, unknown>)['EpochBsTime'] = Math.floor(Date.now() / 1000);
        return this.sendMessage(registerSet);
    }
}
