export type SignalPayload =
  | { t: "offer"; s: string; d: RTCSessionDescriptionInit; targetViewerId?: string; hostId?: string } // Added targetViewerId for host->viewer offers
  | { t: "answer"; s: string; d: RTCSessionDescriptionInit; viewerId?: string } // Added viewerId for viewer->host answers
  | { t: "ice-candidate"; s: string; d: RTCIceCandidate; viewerId?: string; targetViewerId?: string; from?: "host" | "viewer" } // Added viewerId/targetViewerId for routing
  | { t: "viewer-join"; s: string; uid: string } // Viewer sends its desired sessionId and its unique uid
  | { t: "host-ready"; s: string }
  | { t: "viewer-joined"; viewerId: string; viewerCount: number } // Server notifies host about new viewer
  | { t: "host-disconnected"; s: string }
  | { t: "viewer-count-changed"; s: string; count: number }
  | { t: "cursor"; uid: string; pos: { x: number; y: number } }
  | { t: "stats"; s: string; d: any }
  | { t: "error"; message: string }
  | { t: "ping" }
  | { t: "pong" }
  | { t: "host-ready-ack"; s: string }
  | { t: "viewer-joined-ack"; s: string; uid: string }


export class SignalingClient {
  private socket: WebSocket
  private isConnected = false
  private reconnectAttempts = 0
  private maxReconnectAttempts = 5
  private reconnectDelay = 1000

  constructor(
    private url: string,
    private onMessage: (msg: SignalPayload) => void,
    private onError?: (err: Event) => void,
    private onOpenCallback?: () => void, // New optional callback
  ) {
    this.connect()
  }

  private connect() {
    try {
      this.socket = new WebSocket(this.url)

      this.socket.onopen = () => {
        this.isConnected = true
        this.reconnectAttempts = 0
        console.log("🛰️ WebSocket connected")
        this.onOpenCallback?.() // Call the new callback here
      }

      this.socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data) as SignalPayload
          this.onMessage(msg)
        } catch (err) {
          console.error("❌ Failed to parse signal:", err)
        }
      }

      this.socket.onerror = (err) => {
        console.error("🚨 WebSocket error:", err)
        this.onError?.(err)
      }

      this.socket.onclose = (event) => {
        console.warn("🔌 WebSocket closed:", event.code, event.reason)
        this.isConnected = false
        this.attemptReconnect()
      }
    } catch (error) {
      console.error("Failed to create WebSocket:", error)
      this.onError?.(error as Event)
    }
  }

  private attemptReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("❌ Max reconnection attempts reached")
      return
    }

    this.reconnectAttempts++
    console.log(`🔄 Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})`)

    setTimeout(() => {
      this.connect()
    }, this.reconnectDelay * this.reconnectAttempts)
  }

  send(msg: SignalPayload) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(msg))
    } else {
      console.warn("⚠️ Socket not ready, message queued")
      // Could implement message queuing here for critical messages
    }
  }

  close() {
    this.isConnected = false
    this.socket?.close()
  }

  getConnectionState(): string {
    if (!this.socket) return "closed"

    switch (this.socket.readyState) {
      case WebSocket.CONNECTING:
        return "connecting"
      case WebSocket.OPEN:
        return "open"
      case WebSocket.CLOSING:
        return "closing"
      case WebSocket.CLOSED:
        return "closed"
      default:
        return "unknown"
    }
  }
}
