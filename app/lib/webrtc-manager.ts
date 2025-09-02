export interface StreamConfig {
  video: {
    codec: string
    bitrate: number
    frameRate: number
  }
  audio: {
    codec: string
    bitrate: number
  }
}

export interface PerformanceStats {
  fps: number
  bitrate: number
  latency: number
  cpuUsage: number
  memoryUsage: number
}

export class AdvancedWebRTCManager {
  private sessionId: string
  private ws: WebSocket | null = null
  private peerConnections: Map<string, RTCPeerConnection> = new Map()
  private localStream: MediaStream | null = null
  private isInitialized = false

  public onUserConnected?: (count: number) => void
  public onPerformanceUpdate?: (stats: PerformanceStats) => void

  constructor(sessionId: string) {
    this.sessionId = sessionId
    this.initializeWebSocket()
  }

  private initializeWebSocket() {
    this.ws = new WebSocket("ws://localhost:8080")

    this.ws.onopen = () => {
      console.log("🔗 WebSocket connected")
      this.ws?.send(
        JSON.stringify({
          type: "host-ready",
          sessionId: this.sessionId,
        }),
      )
    }

    this.ws.onmessage = async (event) => {
      const message = JSON.parse(event.data)
      await this.handleWebSocketMessage(message)
    }

    this.ws.onclose = () => {
      console.log("🔌 WebSocket disconnected")
      setTimeout(() => this.initializeWebSocket(), 3000)
    }

    this.ws.onerror = (error) => {
      console.error("❌ WebSocket error:", error)
    }
  }

  private async handleWebSocketMessage(message: any) {
    switch (message.type) {
      case "viewer-joined":
        await this.handleViewerJoined(message.viewerId)
        break
      case "ice-candidate":
        await this.handleIceCandidate(message.viewerId, message.candidate)
        break
      case "answer":
        await this.handleAnswer(message.viewerId, message.answer)
        break
      case "viewer-left":
        this.handleViewerLeft(message.viewerId)
        break
    }
  }

  private async handleViewerJoined(viewerId: string) {
    if (!this.localStream) return

    const peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
      iceCandidatePoolSize: 10,
    })

    // Add local stream tracks
    this.localStream.getTracks().forEach((track) => {
      peerConnection.addTrack(track, this.localStream!)
    })

    // Handle ICE candidates
    peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws?.send(
          JSON.stringify({
            type: "ice-candidate",
            viewerId,
            candidate: event.candidate,
          }),
        )
      }
    }

    // Monitor connection stats
    this.monitorPeerConnection(peerConnection, viewerId)

    this.peerConnections.set(viewerId, peerConnection)

    // Create and send offer
    const offer = await peerConnection.createOffer({
      offerToReceiveAudio: false,
      offerToReceiveVideo: false,
    })

    await peerConnection.setLocalDescription(offer)

    this.ws?.send(
      JSON.stringify({
        type: "offer",
        viewerId,
        offer,
      }),
    )

    this.onUserConnected?.(this.peerConnections.size)
  }

  private async handleIceCandidate(viewerId: string, candidate: RTCIceCandidate) {
    const peerConnection = this.peerConnections.get(viewerId)
    if (peerConnection) {
      await peerConnection.addIceCandidate(candidate)
    }
  }

  private async handleAnswer(viewerId: string, answer: RTCSessionDescription) {
    const peerConnection = this.peerConnections.get(viewerId)
    if (peerConnection) {
      await peerConnection.setRemoteDescription(answer)
    }
  }

  private handleViewerLeft(viewerId: string) {
    const peerConnection = this.peerConnections.get(viewerId)
    if (peerConnection) {
      peerConnection.close()
      this.peerConnections.delete(viewerId)
    }
    this.onUserConnected?.(this.peerConnections.size)
  }

  private monitorPeerConnection(peerConnection: RTCPeerConnection, viewerId: string) {
    const statsInterval = setInterval(async () => {
      if (peerConnection.connectionState === "closed") {
        clearInterval(statsInterval)
        return
      }

      try {
        const stats = await peerConnection.getStats()
        const performanceStats = this.parseStats(stats)
        this.onPerformanceUpdate?.(performanceStats)
      } catch (error) {
        console.error("Failed to get stats:", error)
      }
    }, 1000)
  }

  private parseStats(stats: RTCStatsReport): PerformanceStats {
    let fps = 0
    let bitrate = 0
    let latency = 0

    stats.forEach((report) => {
      if (report.type === "outbound-rtp" && report.mediaType === "video") {
        fps = report.framesPerSecond || 0
        bitrate = report.bytesSent ? (report.bytesSent * 8) / 1000 : 0
      }
      if (report.type === "candidate-pair" && report.state === "succeeded") {
        latency = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : 0
      }
    })

    return {
      fps,
      bitrate,
      latency,
      cpuUsage: this.getCPUUsage(),
      memoryUsage: this.getMemoryUsage(),
    }
  }

  private getCPUUsage(): number {
    // Simplified CPU usage estimation
    return Math.random() * 30 + 10
  }

  private getMemoryUsage(): number {
    // Simplified memory usage estimation
    if ("memory" in performance) {
      const memory = (performance as any).memory
      return (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100
    }
    return Math.random() * 40 + 20
  }

  async initializeStream(stream: MediaStream, config: StreamConfig) {
    this.localStream = stream
    this.isInitialized = true

    // Configure video encoding parameters
    const videoTrack = stream.getVideoTracks()[0]
    if (videoTrack) {
      const sender = this.peerConnections
        .values()
        .next()
        .value?.getSenders()
        .find((s: RTCRtpSender) => s.track === videoTrack)

      if (sender) {
        const params = sender.getParameters()
        if (params.encodings && params.encodings.length > 0) {
          params.encodings[0].maxBitrate = config.video.bitrate
          params.encodings[0].maxFramerate = config.video.frameRate
          await sender.setParameters(params)
        }
      }
    }

    console.log("🎥 Stream initialized with config:", config)
  }

  stopStream() {
    if (this.localStream) {
      this.localStream.getTracks().forEach((track) => track.stop())
      this.localStream = null
    }

    this.peerConnections.forEach((pc) => pc.close())
    this.peerConnections.clear()

    this.isInitialized = false
    this.onUserConnected?.(0)
  }

  toggleAudio() {
    if (this.localStream) {
      const audioTrack = this.localStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
      }
    }
  }

  toggleVideo() {
    if (this.localStream) {
      const videoTrack = this.localStream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
      }
    }
  }

  cleanup() {
    this.stopStream()
    this.ws?.close()
  }
}
