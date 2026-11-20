import {
    Logger, Camera, CameraListener, DeviceRecord, DeviceStore, ProtocolConfig, ProtocolEvents,
    SnapshotServer, defaultProtocolConfig, DeviceFactory,
} from './protocol';

const DEVICES_KEY = 'localDevices';

/** Persists protocol device records as JSON in a Scrypted storage object. */
export class StorageDeviceStore implements DeviceStore {
    constructor(private storage: Storage) { }

    private load(): Record<string, DeviceRecord> {
        try {
            return JSON.parse(this.storage.getItem(DEVICES_KEY) || '{}');
        }
        catch {
            return {};
        }
    }

    getBySerial(serial: string) {
        return this.load()[serial];
    }

    getByIp(ip: string) {
        return Object.values(this.load()).find(d => d.ip === ip);
    }

    getAll() {
        return Object.values(this.load());
    }

    save(record: DeviceRecord) {
        const devices = this.load();
        devices[record.serialNumber] = record;
        this.storage.setItem(DEVICES_KEY, JSON.stringify(devices));
    }

    delete(serial: string) {
        const devices = this.load();
        delete devices[serial];
        this.storage.setItem(DEVICES_KEY, JSON.stringify(devices));
    }
}

export interface LocalServiceOptions {
    bindAddress: string;
    snapshot: { port: number, publicHost: string };
}

/** Runs the camera-facing listeners inside the plugin, replacing the external arlo-cam-api. */
export class LocalArloService {
    private listener: CameraListener;
    private snapshotServer: SnapshotServer;
    private options?: LocalServiceOptions;

    constructor(
        private logger: Logger,
        readonly store: DeviceStore,
        events: ProtocolEvents,
        private getConfig: () => ProtocolConfig = () => defaultProtocolConfig,
    ) {
        this.listener = new CameraListener({ logger, store, events, getConfig });
        this.snapshotServer = new SnapshotServer(logger);
    }

    async start(options: LocalServiceOptions) {
        this.options = options;
        await this.listener.start({ bindAddress: options.bindAddress });
        try {
            await this.snapshotServer.start(options.snapshot.port, options.bindAddress);
        }
        catch (e) {
            this.listener.stop();
            throw e;
        }
    }

    stop() {
        this.listener.stop();
        this.snapshotServer.stop();
    }

    getCamera(serial: string): Camera | undefined {
        const record = this.store.getBySerial(serial);
        return record ? DeviceFactory.fromRecord(record, this.logger) : undefined;
    }

    async requestSnapshot(serial: string): Promise<Buffer | undefined> {
        const camera = this.getCamera(serial);
        if (!camera || !this.options)
            return undefined;

        const { publicHost, port } = this.options.snapshot;
        const url = `http://${publicHost}:${port}/snapshot/${serial}/${serial}.jpg`;
        // register the wait first so a fast upload isn't missed
        const wait = this.snapshotServer.waitForSnapshot(serial);
        if (!await camera.snapshotRequest(url)) {
            this.snapshotServer.cancelWait(serial);
            return undefined;
        }
        return wait;
    }
}
