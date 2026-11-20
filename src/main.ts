import { Device, DeviceProvider, ScryptedDeviceBase, ScryptedDeviceType, ScryptedInterface, Setting, Settings, SettingValue } from '@scrypted/sdk';
import sdk from '@scrypted/sdk';
import { DeviceSummary, DeviceStatus, DeviceRegistration } from './arlo-types';
import { ArloDeviceBase } from './arlo-device-base';
import { ArloDoorbellDevice } from './doorbell';
import { ArloCameraDevice } from './camera';
import { LocalArloService, StorageDeviceStore } from './local-service';
import { Device as ProtocolDevice } from './protocol';

const { deviceManager } = sdk;

class ArloDeviceProvider extends ScryptedDeviceBase implements DeviceProvider, Settings {
    private arloRawDevices = new Map<string, ArloRawDevice>();
    private arloDevices = new Map<string, ArloDeviceBase>();
    private localService?: LocalArloService;

    constructor(nativeId?: string) {
        super(nativeId);
        this.discoverDevices();
    }

    /** Settings */

    // implement
    async getSettings(): Promise<Setting[]> {
        return [
            {
                key: 'localBindAddress',
                title: 'Local Bind Address',
                description: 'Address the camera listeners bind to.',
                type: 'string',
                placeholder: '0.0.0.0',
                value: this.storage.getItem('localBindAddress') || '0.0.0.0',
            }, {
                key: 'localHost',
                title: 'Local Host Address',
                description: 'IP address of this Scrypted host as seen by the cameras; used for snapshot uploads.',
                type: 'string',
                placeholder: '192.168.1.10',
                value: this.storage.getItem('localHost'),
            }, {
                key: 'localSnapshotPort',
                title: 'Local Snapshot Port',
                description: 'Port of the snapshot server. A random port between 5001 and 64999 is chosen by default.',
                type: 'integer',
                value: this.getLocalSnapshotPort(),
            }, {
                key: 'useHostnames',
                title: 'Use Hostnames For Devices',
                description: 'Enable this setting to use device hostnames instead of IP addresses when communicating with devices.',
                type: 'boolean',
                value: this.storage.getItem('useHostnames') === 'true',
            }
        ];
    }

    private getLocalBindAddress(): string {
        return this.storage.getItem('localBindAddress') || '0.0.0.0';
    }

    private getLocalSnapshotPort(): number {
        const stored = parseInt(this.storage.getItem('localSnapshotPort') || '');
        if (stored)
            return stored;
        const port = 5001 + Math.floor(Math.random() * 59999);
        this.storage.setItem('localSnapshotPort', port.toString());
        return port;
    }

    public getUseHostnames(): boolean {
        return this.storage.getItem('useHostnames') === 'true';
    }

    // implement
    async putSetting(key: string, value: SettingValue) {
        if (value != null) {
            this.storage.setItem(key, value.toString());
            await this.discoverDevices();
        }
    }

    async discoverDevices() {
        this.localService?.stop();
        this.localService = undefined;
        await this.startLocalService();
    }

    private async startLocalService() {
        const publicHost = this.storage.getItem('localHost');
        if (!publicHost) {
            this.console.error('Set the Local Host Address so cameras can upload snapshots.');
            return;
        }

        this.arloRawDevices.clear();
        this.arloDevices.clear();

        const service = new LocalArloService(this.console, new StorageDeviceStore(this.storage), {
            registered: device => this.onLocalDeviceUpdated(device, true),
            statusUpdated: device => this.onLocalDeviceUpdated(device, false),
            deviceLog: (device, logString) => {
                const arloDevice = this.arloDevices.get(device.serialNumber);
                if (!(arloDevice instanceof ArloCameraDevice) || arloDevice.ignoreCameraLogs())
                    return;
                for (const line of logString.split(/\r?\n/).filter(l => l.trim()))
                    arloDevice.console.log(line);
            },
            motionDetected: device => this.arloDevices.get(device.serialNumber)?.onMotionDetected(),
            buttonPressed: (device, triggered) => {
                const arloDevice = this.arloDevices.get(device.serialNumber);
                if (arloDevice instanceof ArloDoorbellDevice)
                    arloDevice.onButtonPressed(triggered);
            },
        });

        for (const record of service.store.getAll()) {
            this.arloRawDevices.set(record.serialNumber, ArloDeviceProvider.rawDeviceFromProtocol(record.registration, record.status, {
                friendly_name: record.friendlyName,
                hostname: record.hostname,
                ip: record.ip,
                serial_number: record.serialNumber,
            }));
        }

        try {
            await service.start({
                bindAddress: this.getLocalBindAddress(),
                snapshot: { port: this.getLocalSnapshotPort(), publicHost },
            });
        }
        catch (e) {
            this.console.error(`Arlo camera service failed to start: ${e}`);
            return;
        }

        this.localService = service;
        await this.syncLocalDevices();
        this.console.log(`Arlo camera service started with ${this.arloRawDevices.size} known devices.`);
    }

    private static rawDeviceFromProtocol(registration: Record<string, unknown>, status: Record<string, unknown>, deviceSummary: DeviceSummary): ArloRawDevice {
        return {
            deviceSummary,
            deviceRegistration: registration as unknown as DeviceRegistration,
            deviceStatus: Object.keys(status).length ? status as unknown as DeviceStatus : undefined,
        };
    }

    private async syncLocalDevices() {
        await deviceManager.onDevicesChanged({
            providerNativeId: this.nativeId,
            devices: [...this.arloRawDevices.values()].map(raw => this.createScryptedDevice(raw)),
        });
        for (const serial of this.arloRawDevices.keys()) {
            await deviceManager.onDevicesChanged({
                providerNativeId: serial,
                devices: [],
            });
        }
    }

    private async onLocalDeviceUpdated(device: ProtocolDevice, registered: boolean) {
        const serial = device.serialNumber;
        const previous = this.arloRawDevices.get(serial);
        const raw = ArloDeviceProvider.rawDeviceFromProtocol(device.registration, device.status, {
            friendly_name: device.friendlyName,
            hostname: device.hostname,
            ip: device.ip,
            serial_number: serial,
        });
        this.arloRawDevices.set(serial, raw);

        const interfacesChanged = !previous ||
            ArloDeviceProvider.getDeviceInterfaces(previous.deviceRegistration, previous.deviceStatus).join() !==
            ArloDeviceProvider.getDeviceInterfaces(raw.deviceRegistration, raw.deviceStatus).join();
        if (interfacesChanged) {
            this.arloDevices.delete(serial);
            await this.syncLocalDevices();
            return;
        }

        const arloDevice = this.arloDevices.get(serial);
        if (!arloDevice)
            return;
        arloDevice.deviceSummary = raw.deviceSummary;
        if (registered)
            arloDevice.onRegistrationUpdated(raw.deviceRegistration!);
        else if (raw.deviceStatus)
            arloDevice.onStatusUpdated(raw.deviceStatus);
    }

    /** Stores a camera setting in the protocol record and pushes the updated config to the camera. */
    async applyLocalCameraSetting(serial: string, key: string, value: string): Promise<void> {
        const store = this.localService?.store;
        const record = store?.getBySerial(serial);
        if (!store || !record)
            return;
        record.config = { ...record.config, [key]: value };
        store.save(record);
        const camera = this.localService!.getCamera(serial);
        if (camera && !await camera.sendMessage(camera.buildConfig()))
            this.console.error(`${serial}: failed to apply ${key}; the camera may be asleep and will receive it when it next registers.`);
    }

    /** Requests a snapshot through the in-process service. */
    async requestLocalSnapshot(serial: string): Promise<Buffer | undefined> {
        return this.localService?.requestSnapshot(serial);
    }

    static displayName(summary: DeviceSummary): string {
        const { friendly_name, serial_number } = summary;
        return friendly_name && friendly_name !== serial_number ? `${friendly_name} (${serial_number})` : serial_number;
    }

    createScryptedDevice(arloRawDevice: ArloRawDevice): Device {
        const interfaces = ArloDeviceProvider.getDeviceInterfaces(arloRawDevice.deviceRegistration, arloRawDevice.deviceStatus);

        return {
            name: ArloDeviceProvider.displayName(arloRawDevice.deviceSummary),
            nativeId: arloRawDevice.deviceSummary.serial_number,
            type: interfaces.includes(ScryptedInterface.VideoCamera) ? ScryptedDeviceType.Camera : ScryptedDeviceType.Sensor,
            interfaces: interfaces,
            info: {
                firmware: arloRawDevice.deviceStatus?.SystemFirmwareVersion,
                manufacturer: 'Arlo Technologies, Inc.',
                model: arloRawDevice.deviceRegistration?.SystemModelNumber,
                serialNumber: arloRawDevice.deviceStatus?.SystemSerialNumber,
                version: arloRawDevice.deviceStatus?.HardwareRevision,
            },
            providerNativeId: this.nativeId,
        };
    }

    /** DeviceProvider */

    // implement
    async releaseDevice(id: string, nativeId: string): Promise<void> {
        // Does nothing.
    }

    // implement
    async getDevice(nativeId: string): Promise<ArloDeviceBase | undefined> {
        if (this.arloDevices.has(nativeId))
            return this.arloDevices.get(nativeId);
        const arloRawDevice = this.arloRawDevices.get(nativeId);
        if (!arloRawDevice)
            throw new Error('device not found?');

        const deviceSummary = arloRawDevice.deviceSummary;
        const deviceRegistration = arloRawDevice.deviceRegistration;
        const deviceStatus = arloRawDevice.deviceStatus;

        const interfaces = ArloDeviceProvider.getDeviceInterfaces(deviceRegistration, deviceStatus);
        let retDevice: ArloDeviceBase;
        if (interfaces.includes(ScryptedInterface.BinarySensor)) {
            retDevice = new ArloDoorbellDevice(this, nativeId, deviceSummary, deviceRegistration, deviceStatus);
        } else if (interfaces.includes(ScryptedInterface.VideoCamera)) {
            retDevice = new ArloCameraDevice(this, nativeId, deviceSummary, deviceRegistration, deviceStatus);
        } else {
            throw new Error('unknown device type');
        }

        this.arloDevices.set(nativeId, retDevice);
        return retDevice;
    }

    private static getDeviceInterfaces(deviceRegistration: DeviceRegistration | undefined, deviceStatus: DeviceStatus | undefined): string[] {
        let interfaces = [
            ScryptedInterface.Settings
        ];

        for (const capability of deviceRegistration?.Capabilities ?? []) {
            switch (capability.toLowerCase()) {
                case 'h.264streaming':
                    interfaces.push(ScryptedInterface.VideoCamera);
                    break;
                case 'batterylevel':
                    interfaces.push(ScryptedInterface.Battery, ScryptedInterface.Charger);
                    break;
                case 'pirmotion':
                    interfaces.push(ScryptedInterface.MotionSensor);
                    break;
                case 'jpegsnapshot':
                    interfaces.push(ScryptedInterface.Camera);
                    break;
                default:
                    break;
            }
        }

        // sadly, Arlo doesn't report a specific capability for doorbells, so we check if the status includes a count of button press events
        if (deviceStatus?.ButtonEvents !== undefined) {
            interfaces.push(ScryptedInterface.BinarySensor);
        }

        return interfaces;
    }
}

class ArloRawDevice {
    deviceSummary: DeviceSummary;
    deviceRegistration?: DeviceRegistration;
    deviceStatus?: DeviceStatus;
}

export { ArloDeviceProvider };

export default new ArloDeviceProvider();
