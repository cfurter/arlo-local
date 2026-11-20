# Arlo Local for Scrypted

Arlo Local connects compatible Arlo cameras and doorbells directly to Scrypted over the local network. The camera protocol listeners and snapshot receiver run inside the plugin; no separate `arlo-cam-api` service or Arlo cloud connection is required.

The plugin has been tested with Arlo Pro 2 cameras, Arlo Audio Doorbells, and a VMB4000r3 base station. Other devices that connect to a local base station may work. Devices configured to connect directly to Wi-Fi through Arlo's configuration wizard are not supported.

## Features

- Local motion and doorbell button events
- Battery and charging state
- On-demand snapshots
- Live video streaming and live audio, including audio muting
- Camera settings for power management, charge LED, field of view, and spotlight
- Optional RTCP receiver reports for UDP cameras

## Setup

1. Install the plugin from the Scrypted interface.
2. Stop any separate Arlo camera API service. It conflicts with this plugin on camera protocol ports 4000 and 4100.
3. In the plugin settings, set **Local Host Address** to the Scrypted host's LAN address reachable by the cameras.
4. Keep **Local Bind Address** at `0.0.0.0` unless the host needs to bind to a specific interface.
5. Allow TCP connections from the cameras to ports 4000 and 4100 and to the configured **Local Snapshot Port**. The snapshot port defaults to a random value from 5001 to 64999 and remains saved across restarts.
6. Restart the plugin. Registered devices are added to Scrypted automatically.

The cameras and Scrypted host must be able to communicate directly on the LAN. Snapshots require the camera to reach the configured Local Host Address and snapshot port.

## Camera settings

Camera-specific settings are available on each device. Changes to supported settings are saved by the plugin and sent to the camera. A camera that is asleep may not acknowledge the change immediately; it will receive the saved configuration when it next registers.

**Ignore Camera Logs** is enabled by default. Disable it to forward camera log messages to that camera's Scrypted device console.

## Troubleshooting

- If the plugin cannot start its listeners, check whether another process is already using port 4000 or 4100.
- If snapshots fail, verify that the camera can connect to the Scrypted host on the configured snapshot port and that the Local Host Address is correct.
- For UDP stream errors or streams that do not stop correctly, enable **Prevent Infinite Streaming on UDP** and restart the camera.
- Camera streams are unauthenticated and unencrypted on the local network. Use this plugin only on a network you own and trust.
