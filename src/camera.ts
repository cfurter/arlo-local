import { Camera, FFmpegInput, MediaObject, PictureOptions, ResponseMediaStreamOptions, VideoCamera, ScryptedMimeTypes, Setting, SettingValue } from '@scrypted/sdk';
import sdk from '@scrypted/sdk';
import { RtspUdpProxy } from './rtsp-proxy';

import { DeviceRegistration, DeviceStatus } from './arlo-types';
import { ArloDeviceBase } from './arlo-device-base';
import { sleep } from './sleep';
import * as consts from './protocol/consts';

const { mediaManager } = sdk;

const REFRESH_TIMEOUT = 40000; // milliseconds (rebroadcast refreshes 30 seconds before the specified refreshAt time)
const STREAM_TIMEOUT = 10200; // milliseconds (leave a small buffer for rebroadcast to call back)
const DEVICE_INFO_SETTING_PREFIX = 'deviceInfo:';

const CAMERA_CONFIG_KEYS = [
    consts.POWER_MANAGEMENT,
    consts.INDICATOR_LED,
    consts.FIELD_OF_VIEW,
    consts.SPOTLIGHT,
    consts.LOCAL_4K_STREAMING,
    consts.VIDEO_FLIP,
    consts.VIDEO_MIRROR,
    consts.HDR_CONTROL,
    consts.EXPOSURE_COMPENSATION,
    consts.AUTO_ZOOM_TRACKING,
];
export class ArloCameraDevice extends ArloDeviceBase implements Camera, VideoCamera {
    private refreshTimeout?: NodeJS.Timeout;
    private originalMedia?: FFmpegInput;
    private isSnapshotEligible: boolean = true;
    private cachedSnapshot?: Buffer;
    private snapshotInProgress: boolean = false;
    private rtspUdpProxy?: RtspUdpProxy;

    // override
    onRegistrationUpdated(deviceRegistration: DeviceRegistration) {
        super.onRegistrationUpdated(deviceRegistration);
        this.isSnapshotEligible = true;
    }

    // override
    onStatusUpdated(deviceStatus: DeviceStatus) {
        super.onStatusUpdated(deviceStatus);
        this.isSnapshotEligible = true;
    }

    onMotionDetected() {
        if (this.isDeviceDisabled()) {
            return;
        }
        this.isSnapshotEligible = true;
        this.takePicture();
        super.onMotionDetected();
    }

    /** Camera */

    // implement
    async takePicture(option?: PictureOptions): Promise<MediaObject> {
        // skip all processing if the camera is disabled or we are in the process of taking a snapshot
        if (this.isDeviceDisabled()) {
            return { mimeType: '' };
        }

        while (this.snapshotInProgress) {
            await sleep(1000);
        }

        this.snapshotInProgress = true;
        this.console.debug(`${this.nativeId}: requesting snapshot`);

        // request a snapshot from the camera, if it's eligible
        if ((this.isSnapshotEligible || this.externallyPowered) && this.nativeId != null) {
            const buffer = await this.fetchSnapshot();
            this.snapshotInProgress = false;
            if (buffer) {
                this.isSnapshotEligible = false;
                this.cachedSnapshot = buffer;
                return this.createMediaObject(buffer, 'image/jpeg');
            }
            this.console.error(`${this.nativeId}: snapshot request failed`);
        } else {
            this.snapshotInProgress = false;
            this.console.info(`${this.nativeId}: skipping snapshot because camera is on battery and motion hasn\'t been detected or status hasn\'t been sent recently`)
            return this.createMediaObject(this.cachedSnapshot, 'image/jpeg');
        }

        if (this.cachedSnapshot?.length)
            return this.createMediaObject(this.cachedSnapshot, 'image/jpeg');
        throw new Error(`${this.nativeId}: snapshot request failed and no cached snapshot is available`);
    }

    private async fetchSnapshot(): Promise<Buffer | undefined> {
        return this.provider.requestLocalSnapshot(this.nativeId!);
    }

    // implement
    async getPictureOptions(): Promise<PictureOptions[]> {
        return [];
    }

    /** VideoCamera */

    // implement
    async getVideoStreamOptions(): Promise<ResponseMediaStreamOptions[]> {
        return [{
            id: 'channel0',
            name: 'Stream 1',
            container: 'rtsp',
            tool: 'scrypted',
            video: {
                codec: 'h264'
            },
            audio: this.isAudioDisabled() ? {} : {
                codec: 'aac'
            },
            allowBatteryPrebuffer: this.allowBatteryPrebuffer() && this.externallyPowered
        }];
    }

    // implement
    async getVideoStream(options?: ResponseMediaStreamOptions): Promise<MediaObject> {
        // skip all processing if the camera is disabled
        if (this.isDeviceDisabled()) {
            return { mimeType: '' };
        }

        // check if this is a refresh call
        if (options?.refreshAt) {
            if (!this.originalMedia) {
                throw new Error("no stream to refresh");
            }

            // get the previously constructed media object
            const newMedia = this.originalMedia;

            // set a new refresh date
            if (newMedia.mediaStreamOptions != null) {
                newMedia.mediaStreamOptions.refreshAt = Date.now() + REFRESH_TIMEOUT;
                newMedia.mediaStreamOptions.metadata = {
                    refreshAt: newMedia.mediaStreamOptions.refreshAt
                };
            }

            // reset the timeout and return the new media object
            this.resetStreamTimeout();
            return mediaManager.createMediaObject(newMedia, ScryptedMimeTypes.MediaStreamUrl);
        }

        // reset the timeout and return the new media object
        this.resetStreamTimeout();

        this.originalMedia = {
            url: await this.buildRtspUrl(),
            mediaStreamOptions: {
                id: 'channel0',
                refreshAt: Date.now() + REFRESH_TIMEOUT,
                ...options,
            },
        };

        return mediaManager.createFFmpegMediaObject(this.originalMedia);
    }

    async buildRtspUrl(): Promise<string> {
        const preferredUrl = this.provider.getUseHostnames() ? this.deviceSummary.hostname : this.deviceSummary.ip;

        // TODO: use port 555 for 4k cameras
        if (this.sendRtcpRr()) {
            this.console.info('About to create proxy');
            this.rtspUdpProxy = new RtspUdpProxy(`rtsp://${preferredUrl}:555/live`);
            let proxyPort = await this.rtspUdpProxy.proxyUdpWithRtcp();
            return `rtsp://127.0.0.1:${proxyPort}`;
        } else {
            return `rtsp://${preferredUrl}/live`;
        }
    }

    resetStreamTimeout(): void {
        clearTimeout(this.refreshTimeout);
        this.refreshTimeout = setTimeout(() => {
            this.console.debug('stopping stream')
            this.rtspUdpProxy?.teardown();
            this.originalMedia = undefined;
        }, STREAM_TIMEOUT);
    }

    /** Settings */

    // override
    async getSettings(): Promise<Setting[]> {
        let settings = (await super.getSettings()).map(setting => ({
            ...setting,
            group: 'Arlo Camera Settings',
            subgroup: 'General',
        }));
        const batteryLevel =
            this.deviceStatus?.BatPercent ??
            this.deviceStatus?.BatteryPercentage ??
            this.deviceRegistration?.BatPercent ??
            this.deviceRegistration?.BatteryPercentage;
        return [
            {
                key: `${DEVICE_INFO_SETTING_PREFIX}ip`,
                title: 'IP Address',
                group: 'General',
                readonly: true,
                value: this.deviceSummary.ip || 'Unknown',
            },
            {
                key: `${DEVICE_INFO_SETTING_PREFIX}serialNumber`,
                title: 'Serial Number',
                group: 'General',
                readonly: true,
                value: this.deviceSummary.serial_number || 'Unknown',
            },
            {
                key: `${DEVICE_INFO_SETTING_PREFIX}hostname`,
                title: 'Hostname',
                group: 'General',
                readonly: true,
                value: this.deviceSummary.hostname || 'Unknown',
            },
            {
                key: `${DEVICE_INFO_SETTING_PREFIX}batteryLevel`,
                title: 'Battery Level',
                group: 'General',
                readonly: true,
                value: batteryLevel == null ? 'Unknown' : `${batteryLevel}%`,
            },
            {
                key: `${DEVICE_INFO_SETTING_PREFIX}chargingStatus`,
                title: 'Charging Status',
                group: 'General',
                readonly: true,
                value: this.deviceStatus?.ChargerTech == null
                    ? 'Unknown'
                    : this.externallyPowered ? 'Charging' : 'Not charging',
            },
            {
                key: `${DEVICE_INFO_SETTING_PREFIX}chargerType`,
                title: 'Charger Type',
                group: 'General',
                readonly: true,
                value: this.deviceStatus?.ChargerTech ?? 'Unknown',
            },
            {
                key: `${DEVICE_INFO_SETTING_PREFIX}wifiSignalIndicator`,
                title: 'Wi-Fi Signal Indicator',
                group: 'General',
                readonly: true,
                value: this.deviceStatus?.SignalStrengthIndicator == null
                    ? 'Unknown'
                    : `${this.deviceStatus.SignalStrengthIndicator} / 5`,
            },
            {
                key: `${DEVICE_INFO_SETTING_PREFIX}model`,
                title: 'Model',
                group: 'General',
                readonly: true,
                value: this.deviceRegistration?.SystemModelNumber ?? 'Unknown',
            },
            {
                key: `${DEVICE_INFO_SETTING_PREFIX}firmwareVersion`,
                title: 'Firmware Version',
                group: 'General',
                readonly: true,
                value: this.deviceStatus?.SystemFirmwareVersion ?? 'Unknown',
            },
            {
                key: `${DEVICE_INFO_SETTING_PREFIX}hardwareRevision`,
                title: 'Hardware Revision',
                group: 'General',
                readonly: true,
                value: this.deviceStatus?.HardwareRevision ?? 'Unknown',
            },
            ...settings,
            {
                key: 'allowBatteryPrebuffer',
                title: 'Allow Prebuffer When Charging',
                group: 'Arlo Camera Settings',
                subgroup: 'General',
                description: 'Enable this setting if you want to allow prebuffering when the camera is charging the battery.',
                type: 'boolean',
                value: (this.allowBatteryPrebuffer()).toString(),
            },
            {
                key: 'sendRtcpRr',
                title: 'Prevent Infinite Streaming on UDP',
                group: 'Arlo Camera Settings',
                subgroup: 'General',
                description: 'Enable this if your camera only supports UDP and you want to send RTCP Receiver Reports to it to avoid it streaming indefinitely. Not compatible with TCP.',
                type: 'boolean',
                value: (this.sendRtcpRr()).toString(),
            },
            {
                key: consts.POWER_MANAGEMENT,
                title: 'Power Management',
                group: 'Arlo Camera Settings',
                subgroup: 'General',
                description: '',
                type: 'string',
                choices: consts.POWER_MANAGEMENT_OPTIONS,
                value: this.storage.getItem(consts.POWER_MANAGEMENT) ?? consts.POWER_MANAGEMENT_OPTIMISED,
            },
            {
                key: consts.INDICATOR_LED,
                title: 'Charge LED',
                group: 'Arlo Camera Settings',
                subgroup: 'General',
                description: 'Enable this setting to turn on the LED when the device is fully charged.',
                type: 'boolean',
                value: (this.storage.getItem(consts.INDICATOR_LED) !== 'false').toString(),
            },
            {
                key: consts.FIELD_OF_VIEW,
                title: 'Field of View',
                group: 'Arlo Camera Settings',
                subgroup: 'Video',
                description: 'Note: Changing video mode might affect Activity Zones settings.',
                type: 'string',
                choices: consts.FIELD_OF_VIEW_OPTIONS,
                value: this.storage.getItem(consts.FIELD_OF_VIEW) ?? consts.FIELD_OF_VIEW_FULL,
            },
            {
                key: consts.LOCAL_4K_STREAMING,
                title: 'Local 4K Live Streaming',
                group: 'Arlo Camera Settings',
                subgroup: 'Video',
                description: 'Local 4K live video streaming is only available when your device is connected to your home network. Up to two cameras can stream higher quality live video simultaneously.',
                type: 'boolean',
                value: (this.storage.getItem(consts.LOCAL_4K_STREAMING) !== 'false').toString(),
            },
            {
                key: consts.VIDEO_FLIP,
                title: 'Video Flip',
                group: 'Arlo Camera Settings',
                subgroup: 'Video',
                description: '',
                type: 'boolean',
                value: (this.storage.getItem(consts.VIDEO_FLIP) === 'true').toString(),
            },
            {
                key: consts.VIDEO_MIRROR,
                title: 'Video Mirror',
                group: 'Arlo Camera Settings',
                subgroup: 'Video',
                description: '',
                type: 'boolean',
                value: (this.storage.getItem(consts.VIDEO_MIRROR) === 'true').toString(),
            },
            {
                key: consts.HDR_CONTROL,
                title: 'Auto HDR',
                group: 'Arlo Camera Settings',
                subgroup: 'Video',
                description: 'See detail in both the highlights and shadows.',
                type: 'boolean',
                value: (this.storage.getItem(consts.HDR_CONTROL) !== 'false').toString(),
            },
            {
                key: consts.EXPOSURE_COMPENSATION,
                title: 'Video Brightness',
                group: 'Arlo Camera Settings',
                subgroup: 'Video',
                description: 'Adjust exposure compensation from -2 to 2.',
                type: 'number',
                range: [-2, 2],
                value: this.getExposureCompensation(),
            },
            {
                key: consts.AUTO_ZOOM_TRACKING,
                title: 'Auto Zoom & Tracking',
                group: 'Arlo Camera Settings',
                subgroup: 'Video',
                description: 'Automatically zoom in on an object and track its movement. Pinch zoom to enhance the image during live streaming. This may affect Arlo Secure video analysis.',
                type: 'boolean',
                value: (this.storage.getItem(consts.AUTO_ZOOM_TRACKING) === 'true').toString(),
            },
            {
                key: consts.SPOTLIGHT,
                title: 'Spotlight',
                group: 'Arlo Camera Settings',
                subgroup: 'Light',
                description: 'Enable this setting to turn on the spotlight on motion detection at night.',
                type: 'boolean',
                value: (this.storage.getItem(consts.SPOTLIGHT) !== 'false').toString(),
            },
            {
                key: consts.SPOTLIGHT_BRIGHTNESS,
                title: 'Spotlight Brightness',
                group: 'Arlo Camera Settings',
                subgroup: 'Light',
                description: 'Customize how bright your light will be when you manually turn on your device.',
                type: 'number',
                range: [0, 100],
                value: Number(this.storage.getItem(consts.SPOTLIGHT_BRIGHTNESS) || 100),
            },
            {
                key: consts.SPOTLIGHT_MODE,
                title: 'Spotlight Mode',
                group: 'Arlo Camera Settings',
                subgroup: 'General',
                description: 'Select the mode for the spotlight.',
                type: 'string',
                choices: Object.keys(consts.SPOTLIGHT_MODES),
                value: this.storage.getItem(consts.SPOTLIGHT_MODE) ?? consts.SPOTLIGHT_MODE_CONSTANT,
            },
            {
                key: 'ignoreCameraLogs',
                title: 'Ignore Camera Logs',
                group: 'Arlo Camera Settings',
                subgroup: 'Extra',
                description: 'Disable this setting to write the camera\'s own log messages to this device\'s console.',
                type: 'boolean',
                value: this.ignoreCameraLogs().toString(),
            },
        ];
    }

    // override
    async putSetting(key: string, value: SettingValue) {
        if (key.startsWith(DEVICE_INFO_SETTING_PREFIX))
            throw new Error(`${key} is a read-only device information setting.`);

        if (key === consts.EXPOSURE_COMPENSATION && value != null) {
            const exposureCompensation =
                typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
            if (!Number.isInteger(exposureCompensation) || exposureCompensation < -2 || exposureCompensation > 2)
                throw new Error('Video Brightness must be an integer from -2 to 2.');
            value = exposureCompensation;
        }

        await super.putSetting(key, value);
        if (value != null && CAMERA_CONFIG_KEYS.includes(key))
            await this.provider.applyLocalCameraSetting(this.nativeId!, key, value.toString());
    }

    private getExposureCompensation(): number {
        const value = Number(this.storage.getItem(consts.EXPOSURE_COMPENSATION) ?? 0);
        return Number.isInteger(value) && value >= -2 && value <= 2 ? value : 0;
    }

    ignoreCameraLogs(): boolean {
        return this.storage.getItem('ignoreCameraLogs') !== 'false';
    }

    allowBatteryPrebuffer(): boolean {
        return this.storage.getItem('allowBatteryPrebuffer') === 'true';
    }

    sendRtcpRr(): boolean {
        return this.storage.getItem('sendRtcpRr') === 'true';
    }
}