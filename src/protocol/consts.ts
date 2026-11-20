// Arming settings
export const ARM_VIDEO = "arm-video"; // default: true
export const ARM_VIDEO_OPTION_ARMED = "Armed";
export const ARM_VIDEO_OPTION_DISARMED = "Disarmed";
export const ARM_VIDEO_OPTIONS = [
  ARM_VIDEO_OPTION_ARMED,
  ARM_VIDEO_OPTION_DISARMED,
]
export const ARM_VIDEO_SENSITIVITY = "arm-video-sensitivity"; // default: 95 (range: 1 to 100)

export const ARM_AUDIO = "arm-audio"; // default: false
export const ARM_AUDIO_OPTION_ARMED = "Armed";
export const ARM_AUDIO_OPTION_DISARMED = "Disarmed";
export const ARM_AUDIO_OPTIONS = [
  ARM_AUDIO_OPTION_ARMED,
  ARM_AUDIO_OPTION_DISARMED,
]

// Audio settings
export const AUDIO_MICROPHONE = "microphone"; // default: true
export const AUDIO_SPEAKER = "speaker"; // default: true
export const AUDIO_SPEAKER_VOLUME = "speaker-volume"; // default: 4 (range: -20 to 4)

// Auto settings
export const AUTO_ZOOM_TRACKING = "auto-zoom-tracking"; // default: "off"

// Exposure
export const EXPOSURE_COMPENSATION = "exposure-compensation"; // default: 0 (range: -2 to 2)

// Field of view settings
export const FIELD_OF_VIEW = "field-of-view"; // default: full
export const FIELD_OF_VIEW_FULL = "full";
export const FIELD_OF_VIEW_WIDE = "wide";
export const FIELD_OF_VIEW_SUPER_WIDE = "superWide";
export const FIELD_OF_VIEW_OPTIONS = [
  FIELD_OF_VIEW_FULL,
  FIELD_OF_VIEW_WIDE,
  FIELD_OF_VIEW_SUPER_WIDE,
];

// HDR
export const HDR_CONTROL = "hdr-control"; // default: "auto"

// Indicator LED
export const INDICATOR_LED = "indicator-led"; // default: true

// Local 4K streaming
export const LOCAL_4K_STREAMING = "local-4k-streaming"; // default: true

// Night mode
export const NIGHT_MODE = "night-mode"; // default: enabled

// Power management settings
export const POWER_MANAGEMENT = "power-management";
export const POWER_MANAGEMENT_BATTERY = "battery";
export const POWER_MANAGEMENT_BEST = "best";
export const POWER_MANAGEMENT_OPTIMISED = "optimised";
export const POWER_MANAGEMENT_OPTIONS = [
  POWER_MANAGEMENT_BEST,
  POWER_MANAGEMENT_OPTIMISED,
  POWER_MANAGEMENT_BATTERY,
];

export const POWER_MANAGEMENT_VIDEO_BITRATES: Record<string, number> = {
  [POWER_MANAGEMENT_BATTERY]: 500,
  [POWER_MANAGEMENT_OPTIMISED]: 750, // default
  [POWER_MANAGEMENT_BEST]: 1000,
};

export const POWER_MANAGEMENT_HEVC_VIDEO_BITRATES: Record<string, number> = {
  [POWER_MANAGEMENT_BATTERY]: 1000,
  [POWER_MANAGEMENT_OPTIMISED]: 1500, // default
  [POWER_MANAGEMENT_BEST]: 3000,
};

// Spotlight settings
export const SPOTLIGHT = "spotlight";
export const SPOTLIGHT_BRIGHTNESS = "spotlight-brightness";
export const SPOTLIGHT_MODE = "spotlight-mode";
export const SPOTLIGHT_MODE_CONSTANT = "constant";
export const SPOTLIGHT_MODE_FLASH = "flash";
export const SPOTLIGHT_MODE_PULSE = "pulse";

export const SPOTLIGHT_MODES: Record<string, number> = {
  [SPOTLIGHT_MODE_CONSTANT]: 0, // default
  [SPOTLIGHT_MODE_FLASH]: 1,
  [SPOTLIGHT_MODE_PULSE]: 2,
};

// Video recording settings
export const VIDEO_RECORD = "video-record"; // default: true
export const VIDEO_RECORD_OPTION_STREAM = "Stream";
export const VIDEO_RECORD_OPTION_REPORT_ONLY = "Report Only";
export const VIDEO_RECORD_OPTIONS = [
  VIDEO_RECORD_OPTION_STREAM,
  VIDEO_RECORD_OPTION_REPORT_ONLY,
]

// Video settings
export const VIDEO_FLIP = "video-flip"; // default: false
export const VIDEO_MIRROR = "video-mirror"; // default: false

// Wind noise suppression
export const WIND_NOISE_SUPPRESSION = "wind-noise-suppression"; // default: false
