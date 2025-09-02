# Codebase Overview: Screenshare Application

This document provides an overview of the key components and their interconnections within the screenshare application, focusing on WebRTC, session management, and user interaction.

## Core Modules (`lib/` directory)

### `lib/signaling.ts`
- **Purpose**: Manages WebSocket-based signaling for WebRTC connections. It facilitates the exchange of WebRTC-specific messages (offers, answers, ICE candidates) and custom application-level signals (e.g., viewer join, host ready, cursor updates).
- **Key Functions/Classes**:
  - `SignalingClient`: Establishes and maintains a WebSocket connection to the signaling server (`ws://localhost:9000`).
  - `send(msg: SignalPayload)`: Sends a signaling message to the connected server.
  - `onMessage`: Callback for handling incoming signaling messages.
- **Accountable for**: Establishing communication channels between host and viewer, exchanging WebRTC negotiation data, and relaying real-time application events.

### `lib/webrtc.ts`
- **Purpose**: Provides foundational WebRTC utility functions for creating and configuring `RTCPeerConnection` objects.
- **Key Functions/Classes**:
  - `createPeer()`: Initializes an `RTCPeerConnection` with STUN servers and optimized configurations.
  - `attachMediaTracks(pc: RTCPeerConnection, stream: MediaStream)`: Adds media tracks from a `MediaStream` to a peer connection, with optimizations for video.
  - `makeOffer(pc: RTCPeerConnection)`: Creates a WebRTC offer and sets it as the local description.
  - `applyAnswer(pc: RTCPeerConnection, answer: RTCSessionDescriptionInit)`: Sets a received WebRTC answer as the remote description.
  - `optimizeForLowLatency(pc: RTCPeerConnection)`: Applies additional optimizations for low-latency streaming.
- **Accountable for**: Core WebRTC peer connection setup and media handling.

### `lib/webrtc-manager.ts` (Host-side WebRTC)
- **Purpose**: Manages WebRTC connections specifically for the host, handling multiple viewer connections and stream configuration.
- **Key Functions/Classes**:
  - `AdvancedWebRTCManager`: Manages peer connections for each connected viewer.
  - `initializeWebSocket()`: Connects to the signaling server and handles incoming messages (viewer joined, ICE candidates, answers).
  - `handleViewerJoined(viewerId: string)`: Creates a new `RTCPeerConnection` for a joining viewer, adds local stream tracks, and initiates the offer/answer process.
  - `monitorPeerConnection()`: Periodically collects and reports performance statistics for each peer connection.
  - `initializeStream(stream: MediaStream, config: StreamConfig)`: Sets the local media stream and configures video encoding parameters.
- **Accountable for**: Managing host-side WebRTC connections, handling viewer connections, and reporting performance metrics.

### `lib/webrtc-viewer.ts` (Viewer-side WebRTC)
- **Purpose**: Manages WebRTC connections specifically for the viewer, receiving the remote stream from the host.
- **Key Functions/Classes**:
  - `AdvancedWebRTCViewer`: Manages the single peer connection to the host.
  - `connect()`: Initiates connection to the signaling server and sends a `viewer-join` signal.
  - `handleOffer(offer: RTCSessionDescription)`: Receives an offer from the host, sets it as remote description, creates an answer, and sends it back.
  - `ontrack`: Callback for when a remote media stream is received.
  - `startStatsMonitoring()`: Periodically collects and reports connection statistics (latency, bitrate, FPS, packet loss).
- **Accountable for**: Receiving and displaying the host's screen share, and reporting viewer-side connection quality.

### `lib/interaction-manager.ts`
- **Purpose**: Facilitates sending user interaction events (mouse, keyboard, touch) from the viewer to the host via a dedicated WebSocket.
- **Key Functions/Classes**:
  - `InteractionManager`: Manages the WebSocket connection for interaction data.
  - `sendMouseMove()`, `sendMouseClick()`, `sendKeyDown()`, etc.: Methods for sending various interaction events.
- **Accountable for**: Enabling remote control/interaction from the viewer.

### `lib/interaction-tracker.ts`
- **Purpose**: Tracks user interactions (mouse, keyboard, touch) on the viewer side and logs them using a `Logger` instance.
- **Key Functions/Classes**:
  - `InteractionTracker`: Captures and processes raw user input events.
  - `onMouseMove()`, `onMouseDown()`, `onMouseUp()`, `onEnterKey()`, `onKeyPress()`, `onTouchStart()`, etc.: Event handlers for different interaction types.
- **Accountable for**: Capturing and categorizing viewer-side user input.

### `lib/logger.ts`
- **Purpose**: Provides a generic logging mechanism for recording time-stamped events, particularly user interactions.
- **Key Functions/Classes**:
  - `Logger`: Stores `LoggedFrame` objects.
  - `record()`: Adds a new frame to the log.
  - `seek()`, `getFramesInRange()`, `export()`, `importFromJSON()`: Methods for querying and managing logged data.
- **Accountable for**: Storing and managing historical interaction data for session playback or analysis.

### `lib/session-recorder.ts`
- **Purpose**: Records screen sharing sessions, capturing both video streams and user interactions, and persists them to IndexedDB.
- **Key Functions/Classes**:
  - `SessionRecorder`: Manages the recording process.
  - `start(stream?: MediaStream)`: Initiates video recording using `MediaRecorder` and starts logging interactions.
  - `stop()`: Stops recording and triggers saving the session.
  - `recordInteraction()`, `recordCursor()`: Methods for logging interaction and cursor events.
  - `saveRecording()`: Combines video chunks and interaction logs into a single session object and saves it to IndexedDB.
- **Accountable for**: Capturing and storing complete screen sharing sessions for later playback.

### `lib/session-player.ts`
- **Purpose**: Handles the playback of recorded sessions, including synchronized video and interaction data, loaded from IndexedDB.
- **Key Functions/Classes**:
  - `SessionPlayer`: Manages the playback state.
  - `loadSession()`: Retrieves a recorded session from IndexedDB.
  - `play()`, `pause()`, `stop()`, `seek()`: Playback control methods.
  - `onProgressUpdate`, `onFrameUpdate`: Callbacks for updating playback progress and delivering individual frames.
- **Accountable for**: Replaying previously recorded screen sharing sessions.

### `lib/performance-monitor.ts`
- **Purpose**: Monitors and reports system performance metrics such as CPU usage, memory usage, network latency, frame rate, and bandwidth.
- **Key Functions/Classes**:
  - `PerformanceMonitor`: Collects and calculates performance statistics.
  - `start(callback: (stats: SystemStats) => void)`: Begins monitoring and calls the callback with updated stats periodically.
  - `stop()`: Halts monitoring.
  - `estimateCPUUsage()`, `getMemoryUsage()`, `measureNetworkLatency()`, `calculateFrameRate()`, `calculateBandwidth()`: Internal methods for gathering specific metrics.
- **Accountable for**: Providing real-time performance insights for the host.

### `lib/overlay.tsx`
- **Purpose**: A simple React component for displaying temporary, dismissible messages (e.g., connection status, notifications) as an overlay.
- **Key Functions/Classes**:
  - `Overlay` (React Component): Renders a message with optional styling and a timeout.
- **Accountable for**: Providing non-intrusive user feedback.

## Application Pages

### `host/page.tsx`
- **Purpose**: The main user interface and logic for the screen sharing host.
- **Key Functionalities**:
  - **Stream Acquisition**: Uses `navigator.mediaDevices.getDisplayMedia()` to capture the host's screen and audio.
  - **WebRTC Host**: Initializes `RTCPeerConnection` (via `lib/webrtc.ts`) and manages the local stream.
  - **Signaling Integration**: Utilizes `SignalingClient` (`lib/signaling.ts`) to send offers, receive answers, and exchange ICE candidates with viewers. Also sends `host-ready` signals.
  - **Performance Monitoring**: Integrates `PerformanceMonitor` (`lib/performance-monitor.ts`) to display real-time FPS, bitrate, latency, and CPU/memory usage.
  - **Session Recording**: Uses `SessionRecorder` (`lib/session-recorder.ts`) to record the screen share session.
  - **UI Controls**: Provides buttons to start/stop streaming, toggle audio/video, start/stop recording, and displays session ID, connected users, and performance metrics.
- **Connections to other resources**:
  - `lib/signaling.ts`, `lib/webrtc.ts`, `lib/performance-monitor.ts`, `lib/session-recorder.ts`
  - `@/components/ui/card`, `@/components/ui/button`, `@/components/ui/badge`, `@/components/ui/progress`

### `viewer/page.tsx`
- **Purpose**: The main user interface and logic for the screen sharing viewer.
- **Key Functionalities**:
  - **Session Connection**: Allows users to enter a session ID to connect to a host.
  - **WebRTC Viewer**: Initializes `RTCPeerConnection` (via `lib/webrtc.ts`) to receive the remote stream from the host.
  - **Signaling Integration**: Utilizes `SignalingClient` (`lib/signaling.ts`) to send `viewer-join` signals, receive offers, send answers, and exchange ICE candidates. Also sends cursor position updates to the host.
  - **Interaction Tracking**: Employs `InteractionTracker` (`lib/interaction-tracker.ts`) and `Logger` (`lib/logger.ts`) to capture and log local mouse and keyboard interactions.
  - **Remote Cursor Display**: Renders remote cursors received via signaling, showing other viewers' interaction points.
  - **UI Controls**: Provides buttons to connect/disconnect, toggle audio, and enter/exit fullscreen mode. Displays connection statistics (latency, bitrate, FPS, packet loss).
  - **Overlay Messages**: Uses `Overlay` (`lib/overlay.tsx`) to display connection status and other temporary messages.
- **Connections to other resources**:
  - `lib/signaling.ts`, `lib/webrtc.ts`, `lib/interaction-tracker.ts`, `lib/logger.ts`, `lib/overlay.tsx`
  - `@/components/ui/card`, `@/components/ui/button`, `@/components/ui/badge`, `@/components/ui/input`

## Overall Program Flow

1.  **Host Initialization**: The `HostPage` component initializes `SignalingClient`, `PerformanceMonitor`, and `SessionRecorder`. It sends a `host-ready` signal.
2.  **Viewer Connection**: A `ViewerPage` user enters a session ID and connects. It initializes `SignalingClient`, `InteractionTracker`, and `Logger`, then sends a `viewer-join` signal.
3.  **WebRTC Signaling**: The `SignalingClient` instances on both host and viewer facilitate the WebRTC offer/answer exchange and ICE candidate negotiation. This sets up the direct peer-to-peer connection for media streaming.
4.  **Media Streaming**: The host captures their screen/audio (`getDisplayMedia`) and sends it via `RTCPeerConnection`. The viewer receives this stream and displays it in a `<video>` element.
5.  **Interaction & Control**: Viewers' mouse and keyboard inputs are captured by `InteractionTracker`, logged by `Logger`, and sent to the host via `SignalingClient` (as `cursor` signals). The host can then interpret these for remote control.
6.  **Performance Monitoring**: Both host and viewer continuously monitor their respective connection and system performance using `PerformanceMonitor` and internal `getStats()` calls on `RTCPeerConnection`.
7.  **Session Recording/Playback**: The host can record the entire session (video + interactions) using `SessionRecorder`, saving it to IndexedDB. Recorded sessions can later be played back using `SessionPlayer`.

This structure allows for a robust screen sharing application with real-time interaction and session recording capabilities.