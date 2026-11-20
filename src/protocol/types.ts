export interface Logger {
    log(...args: any[]): void;
    info(...args: any[]): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
}

export const nullLogger: Logger = {
    log() { },
    info() { },
    warn() { },
    error() { },
};

/** Provider-wide protocol settings, supplied by the host rather than loaded from disk. */
export interface ProtocolConfig {
    wifiCountryCode: string;
    videoAntiFlickerRate: number;
    videoQualityDefault: string;
    notifyOnAudioAlert: boolean;
    notifyOnButtonPressAlert: boolean;
    notifyOnMotionAlert: boolean;
    notifyOnMotionTimeoutAlert: boolean;
    notifyRegisteredAndStatusUpdate: boolean;
}

export const defaultProtocolConfig: ProtocolConfig = {
    wifiCountryCode: 'US',
    videoAntiFlickerRate: 60,
    videoQualityDefault: 'default',
    notifyOnAudioAlert: false,
    notifyOnButtonPressAlert: true,
    notifyOnMotionAlert: true,
    notifyOnMotionTimeoutAlert: false,
    notifyRegisteredAndStatusUpdate: true,
};

/** Per-camera configuration values, keyed by the constants in consts.ts. */
export type DeviceConfig = Record<string, string | number | boolean>;

/** Serializable device state. */
export interface DeviceRecord {
    serialNumber: string;
    ip: string;
    hostname: string;
    friendlyName: string;
    registration: Record<string, unknown>;
    status: Record<string, unknown>;
    config: DeviceConfig;
}

/** Persistence supplied by the host (Scrypted storage in the plugin). */
export interface DeviceStore {
    getBySerial(serial: string): DeviceRecord | undefined;
    getByIp(ip: string): DeviceRecord | undefined;
    getAll(): DeviceRecord[];
    save(record: DeviceRecord): void;
    delete(serial: string): void;
}

/** Callbacks raised by the protocol layer. */
export interface ProtocolEvents {
    registered?(device: import('./device').Device): void;
    statusUpdated?(device: import('./device').Device): void;
    motionDetected?(device: import('./device').Device, zones: unknown[]): void;
    motionTimeout?(device: import('./device').Device): void;
    buttonPressed?(device: import('./device').Device, triggered: boolean): void;
    audioAlert?(device: import('./device').Device): void;
    deviceLog?(device: import('./device').Device, logString: string): void;
}
