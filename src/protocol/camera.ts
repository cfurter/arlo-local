import { Device } from "./device";
import { Message } from "./message";
import * as consts from "./consts";

/**
 * Camera device implementation
 */
export class Camera extends Device {
  get port(): number {
    return 4000;
  }

  async sendInitialRegisterSet(
    wifiCountryCode: string,
    videoAntiFlickerRate: number = 60,
    videoQualityDefault: string = "default"
  ): Promise<void> {
    const registerSet = this.buildConfig();
    const setValues = registerSet.get("SetValues") as Record<string, unknown>;
    setValues["WifiCountryCode"] = wifiCountryCode;
    setValues["VideoAntiFlickerRate"] = videoAntiFlickerRate;

    await this.sendMessage(registerSet);

    const quality = videoQualityDefault === "default" ? "insane" : videoQualityDefault;
    await this.setQuality(quality);
    await this.statusRequest(120);
  }

  private configValue(key: string): unknown {
    const value = this.config[key];
    return value === "" ? undefined : value;
  }

  private configStr(key: string, defaultValue: string): string {
    return String(this.configValue(key) ?? defaultValue);
  }

  private configInt(key: string, defaultValue: number): number {
    const value = parseInt(String(this.configValue(key) ?? defaultValue), 10);
    return isNaN(value) ? defaultValue : value;
  }

  private configBool(key: string, defaultValue: boolean): boolean {
    const value = this.configValue(key);
    if (value === undefined)
      return defaultValue;
    return value === true || value === 1 || value === "1" || value === "true";
  }

  private configBoolInt(key: string, defaultValue: boolean): number {
    return this.configBool(key, defaultValue) ? 1 : 0;
  }

  buildConfig(): Message {
    this.logger.info(`${this.friendlyName} buildConfig(): ${JSON.stringify(this.config)}`);
    return new Message({
      Type: "registerSet",
      ID: 0,
      SetValues: {
        AlertBackoffTime: 0,
        ArloSmart: false,
        Audio0EncodeFormat: 0,
        Audio1EncodeFormat: 1,
        AudioMicEnable: this.configBool(consts.AUDIO_MICROPHONE, true),
        AudioMicAGC: 0,
        AudioMicVolume: 4,
        AudioMicWNS: this.configBoolInt(consts.WIND_NOISE_SUPPRESSION, false),
        AudioSpkrEnable: this.configBool(consts.AUDIO_SPEAKER, true),
        AudioSpkrVolume: this.configInt(consts.AUDIO_SPEAKER_VOLUME, 4),
        AudioTargetState: "Disarmed",
        ChargeNotificationLed: this.configBoolInt(consts.INDICATOR_LED, true),
        CvrModeEnabled: false,
        DefaultMotionStreamTimeLimit: 28,
        DuskToDawnThrshVal: 26,
        EpochBsTime: Math.floor(Date.now() / 1000),
        HdrControl: this.configBool(consts.HDR_CONTROL, true) ? "auto" : "off",
        HEVCVideoOutputResolution: "2160p",
        HEVCVideoTargetBitrate: consts.POWER_MANAGEMENT_HEVC_VIDEO_BITRATES[this.configStr(consts.POWER_MANAGEMENT, consts.POWER_MANAGEMENT_OPTIMISED)] || consts.POWER_MANAGEMENT_HEVC_VIDEO_BITRATES[consts.POWER_MANAGEMENT_OPTIMISED],
        IRCutState: "engaged",
        IRLedState: "off",
        JPEGOutputResolution: "",
        MaxMissedBeaconTime: 30,
        MaxMotionStreamTimeLimit: 120,
        MaxSensorRequired: this.configBool(consts.LOCAL_4K_STREAMING, true),
        MaxStreamTimeLimit: 1800,
        MaxUserStreamTimeLimit: 1800,
        NightModeGrey: this.configBool(consts.NIGHT_MODE, true) && !this.configBool(consts.SPOTLIGHT, true) ? 1 : 0,
        NightModeLightSourceAlert: this.configBool(consts.SPOTLIGHT, true) ? 1 : 0,
        NightVisionMode: this.configBool(consts.NIGHT_MODE, true),
        PIRAction: this.configBool(consts.VIDEO_RECORD, true) ? consts.VIDEO_RECORD_OPTION_STREAM : consts.VIDEO_RECORD_OPTION_REPORT_ONLY,
        PIRStartSensitivity: this.configInt(consts.ARM_VIDEO_SENSITIVITY, 95),
        PrivacyActive: this.configBool(consts.ARM_VIDEO, true) || this.configBool(consts.ARM_AUDIO, true),
        PIRTargetState: this.configBool(consts.ARM_VIDEO, true) ? consts.ARM_VIDEO_OPTION_ARMED : consts.ARM_VIDEO_OPTION_DISARMED,
        // SpotlightDurationManual: 300,
        SpotlightIntensityAlert: this.configInt(consts.SPOTLIGHT_BRIGHTNESS, 100),
        // SpotlightIntensityManual: 100,
        SpotlightModeAlert: consts.SPOTLIGHT_MODES[this.configStr(consts.SPOTLIGHT_MODE, consts.SPOTLIGHT_MODE_CONSTANT)] || 0,
        // SpotlightModeManual: 0,
        VideoExposureCompensation: this.configInt(consts.EXPOSURE_COMPENSATION, 0),
        VideoFlip: this.configBool(consts.VIDEO_FLIP, false),
        VideoMirror: this.configBool(consts.VIDEO_MIRROR, false),
        VideoMode: this.configStr(consts.FIELD_OF_VIEW, consts.FIELD_OF_VIEW_OPTIONS[0]),
        VideoMotionEstimationEnable: true,
        VideoMotionSensitivity: 95,
        VideoOutputResolution: "1080p",
        VideoSmartZoom: this.configBool(consts.AUTO_ZOOM_TRACKING, false) ? "on" : "off",
        VideoTargetBitrate: consts.POWER_MANAGEMENT_VIDEO_BITRATES[this.configStr(consts.POWER_MANAGEMENT, consts.POWER_MANAGEMENT_OPTIMISED)] || consts.POWER_MANAGEMENT_VIDEO_BITRATES[consts.POWER_MANAGEMENT_OPTIMISED],
        // VideoWindowEndX: 1280, // 3840 x
        // VideoWindowEndY: 720, // 2160 y
        // VideoWindowStartX: 0,
        // VideoWindowStartY: 0,
      },
    });
  }

  async setQuality(quality: string): Promise<boolean> {
    // Quality setting logic
    // This would require more message templates from the original messages.py
    // For now, returning success
    return await this.sendMessage(new Message({
      Type: "raParams",
      ID: 0,
      Params: {
        "1080p": {
          minbps: 204800,
          maxbps: 2097152,
          minQP: 12,
          maxQP: 24,
          vbr: true,
          targetbps: 2048000,
          cbrbps: 2048000
        },
        "4K": {
          minbps: 614400,
          maxbps: 10240000,
          minQP: 1,
          maxQP: 1,
          vbr: false,
          targetbps: 10240000,
          cbrbps: 10240000
        },
        "360p": {
          minbps: 51200,
          maxbps: 512000,
          minQP: 24,
          maxQP: 38,
          vbr: true,
          targetbps: 409600,
          cbrbps: 409600
        },
        "480p": {
          minbps: 51200,
          maxbps: 614400,
          minQP: 24,
          maxQP: 38,
          vbr: true,
          targetbps: 512000,
          cbrbps: 512000
        },
        "720p": {
          minbps: 51200,
          maxbps: 1024000,
          minQP: 24,
          maxQP: 38,
          vbr: true,
          targetbps: 768000,
          cbrbps: 768000
        }
      }
    })) &&
      await this.sendMessage(new Message({
        Type: "registerSet",
        ID: 0,
        SetValues: {
          VideoOutputResolution: "1080p",
          VideoTargetBitrate: 2000,
          HEVCVideoOutputResolution: "2160p",
          HEVCVideoTargetBitrate: 8000,
        }
      }));
  }

  async arm(args: Record<string, unknown>): Promise<boolean> {
    const registerSet = this.buildConfig();
    const setValues = registerSet.get("SetValues") as Record<string, unknown>;

    setValues["PIRTargetState"] = args["PIRTargetState"] || "Armed";
    setValues["PIRStartSensitivity"] =
      (args["PIRStartSensitivity"] as number) || 80;
    setValues["PIRAction"] = (args["PIRAction"] as string) || "Stream";
    setValues["VideoMotionEstimationEnable"] =
      (args["VideoMotionEstimationEnable"] as boolean) || false;
    setValues["VideoMotionSensitivity"] = 80;
    setValues["AudioTargetState"] =
      (args["AudioTargetState"] as string) || "Disarmed";
    setValues["DefaultMotionStreamTimeLimit"] = 10;

    return this.sendMessage(registerSet);
  }

  async setUserStreamActive(active: boolean): Promise<boolean> {
    const registerSet = this.buildConfig();
    const setValues = registerSet.get("SetValues") as Record<string, unknown>;
    setValues["UserStreamActive"] = active ? 1 : 0;
    return this.sendMessage(registerSet);
  }

  async snapshotRequest(url: string): Promise<boolean> {
    return this.sendMessage(
      new Message({
        Type: "fullSnapshot",
        ID: 0,
        DestinationURL: url,
      })
    );
  }
}
