import { Camera } from "./camera";
import { DeviceRecord, Logger, nullLogger } from "./types";

export class DeviceFactory {
  static build(ip: string, registration: Record<string, unknown>, logger: Logger = nullLogger): Camera {
    // All known model prefixes (VMC, VML, ABC, FB) are currently cameras.
    return new Camera(ip, registration, logger);
  }

  static fromRecord(record: DeviceRecord, logger: Logger = nullLogger): Camera {
    const device = DeviceFactory.build(record.ip, record.registration, logger);
    device.applyRecord(record);
    return device;
  }
}
