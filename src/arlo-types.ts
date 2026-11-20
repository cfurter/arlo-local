export interface DeviceSummary {
    friendly_name: string;
    hostname: string;
    ip: string;
    serial_number: string;
}

export interface DeviceStatus {
    BatPercent?: number;
    BatteryPercentage?: number;
    ButtonEvents?: number;
    ChargerTech?: ChargerTech;
    HardwareRevision?: string;
    SignalStrengthIndicator?: number;
    SystemFirmwareVersion?: string;
    SystemSerialNumber?: string;
}

export interface DeviceRegistration {
    BatPercent?: number;
    BatteryPercentage?: number;
    Capabilities?: string[];
    SystemModelNumber?: string;
}

export enum ChargerTech {
    None = "None",
    QuickCharger = "QuickCharger",
    Regular = "Regular",
    VacCharger = "VAC Charger",
    Solar = "Solar",
    FaultCharger = "Faulty Charger"
}
