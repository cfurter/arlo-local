import * as net from "net";
import { Device } from "./device";
import { DeviceFactory } from "./device-factory";
import { Message } from "./message";
import { ArloSocket } from "./socket";
import { DeviceStore, Logger, ProtocolConfig, ProtocolEvents } from "./types";

export interface ConnectionHandlerContext {
  logger: Logger;
  store: DeviceStore;
  events: ProtocolEvents;
  getConfig(): ProtocolConfig;
}

/** Handles one inbound message from a camera on the registration/alert ports. */
export class ConnectionHandler {
  private connection: ArloSocket;
  private ip: string;

  constructor(socket: net.Socket, private ctx: ConnectionHandlerContext) {
    this.ip = socket.remoteAddress || "unknown";
    this.connection = new ArloSocket(socket, ctx.logger);
  }

  private get logger() {
    return this.ctx.logger;
  }

  private deviceBySerial(serial: string): Device | undefined {
    const record = this.ctx.store.getBySerial(serial);
    return record && DeviceFactory.fromRecord(record, this.logger);
  }

  private deviceByIp(): Device | undefined {
    const record = this.ctx.store.getByIp(this.ip);
    return record && DeviceFactory.fromRecord(record, this.logger);
  }

  async handle(): Promise<void> {
    try {
      const msg = await this.connection.receive();
      if (!msg)
        return;

      const msgType = msg.get("Type") as string;
      const msgId = msg.get("ID");

      switch (msgType) {
        case "registration": await this.handleRegistration(msg); break;
        case "status": await this.handleStatus(msg); break;
        case "alert": await this.handleAlert(msg); break;
        case "logMessage": this.handleLogMessage(msg); break;
        default:
          this.logger.log(`RX [${this.ip}][${msgId}] Unknown message: ${msg.toNetworkMessage()}`);
      }

      this.connection.send(new Message({ Type: "response", ID: msgId, Response: "Ack" }));
      if (msgType !== "logMessage")
        this.logger.log(`TX [${this.ip}][${msgId}] Ack`);
    }
    catch (error) {
      this.logger.error(`[${this.ip}] Connection error: ${error instanceof Error ? error.message : String(error)}`);
    }
    finally {
      this.connection.close();
    }
  }

  private async handleRegistration(msg: Message) {
    const serial = msg.get("SystemSerialNumber") as string;
    this.logger.log(`RX [${serial}:${this.ip}][${msg.get("ID")}] - Registration`);
    this.logger.info(msg.toString());

    const device = this.deviceBySerial(serial) ?? DeviceFactory.build(this.ip, msg.getDict(), this.logger);
    device.ip = this.ip;

    const config = this.ctx.getConfig();
    await device.sendInitialRegisterSet(config.wifiCountryCode, config.videoAntiFlickerRate, config.videoQualityDefault);
    this.ctx.store.save(device.toRecord());

    if (config.notifyRegisteredAndStatusUpdate)
      this.ctx.events.registered?.(device);
  }

  private async handleStatus(msg: Message) {
    const serial = msg.get("SystemSerialNumber") as string;
    const device = this.deviceBySerial(serial);
    if (!device) {
      this.logger.log(`RX [${serial}:${this.ip}][${msg.get("ID")}] Status (unregistered): ${msg.toString()}`);
      return;
    }

    this.logger.log(`RX [${device.friendlyName}:${this.ip}][${msg.get("ID")}] Status: ${msg.toString()}`);
    device.ip = this.ip;
    device.status = msg.getDict();
    this.ctx.store.save(device.toRecord());

    if (this.ctx.getConfig().notifyRegisteredAndStatusUpdate)
      this.ctx.events.statusUpdated?.(device);

    await device.sendEpochBsTime();
  }

  private async handleAlert(msg: Message) {
    const device = this.deviceByIp();
    if (!device)
      return;

    const config = this.ctx.getConfig();
    const alertType = msg.get("AlertType") as string;
    const prefix = `RX [${device.friendlyName}:${this.ip}][${msg.get("ID")}] ${alertType}`;

    switch (alertType) {
      case "pirMotionAlert": {
        const pirMotion = msg.get("PIRMotion") as Record<string, unknown> | undefined;
        this.logger.log(`${prefix} - ${JSON.stringify(pirMotion)}`);
        if (config.notifyOnMotionAlert)
          this.ctx.events.motionDetected?.(device, (pirMotion?.zones as unknown[]) || []);
        break;
      }
      case "audioAlert":
        this.logger.log(`${prefix} - ${msg.toNetworkMessage()}`);
        if (config.notifyOnAudioAlert)
          this.ctx.events.audioAlert?.(device);
        break;
      case "buttonPressAlert": {
        this.logger.log(`${prefix} - ${msg.toNetworkMessage()}`);
        const buttonPress = msg.get("ButtonPress") as Record<string, unknown> | undefined;
        if (config.notifyOnButtonPressAlert)
          this.ctx.events.buttonPressed?.(device, !!buttonPress?.Triggered);
        break;
      }
      case "motionTimeoutAlert":
        this.logger.log(`${prefix} - ${msg.toNetworkMessage()}`);
        if (config.notifyOnMotionTimeoutAlert)
          this.ctx.events.motionTimeout?.(device);
        break;
      case "spotlightAlert":
        this.logger.log(`${prefix} - ${JSON.stringify(msg.get("SpotlightState"))}`);
        break;
      default:
        this.logger.log(`${prefix} - ${msg.toNetworkMessage()}`);
    }
  }

  private handleLogMessage(msg: Message) {
    const device = this.deviceByIp();
    if (device)
      this.ctx.events.deviceLog?.(device, msg.get("LogString") as string);
  }
}
