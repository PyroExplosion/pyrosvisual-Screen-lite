export interface ConnectionStats {
  latency: number
  bitrate: number
  fps: number
  packetLoss: number
}

export class AdvancedWebRTCViewer {
  private sessionId: string
  private ws: WebSocket | null = null
  private peerConnection: RTCPeerConnection | null = null
  private remoteStream: MediaStream | null = null

  public onStreamReceived?: (stream: MediaStream) => void
  public onStatsUpdate?: (stats: ConnectionStats) => void
  public onDisconnected?: () => void

  constructor(sessionId: string) {
    this.sessionId = sessionId
  }

  async connect() {
    return new Promise<void>((resolve, reject) => {
      this.ws = new WebSocket("ws://localhost:8080")

      this.ws.onopen = () => {
        console.log("🔗 Viewer WebSocket connected")
        this.ws?.send(
          JSON.stringify({
            type: "viewer-join",
            sessionId: this.sessionId,
            viewerId: crypto.randomUUID(),
          }),
        )
        resolve()
      }

      this.ws.onmessage = async (event) => {
        const message = JSON.parse(event.data)
        await this.handleWebSocketMessage(message)
      }

      this.ws.onclose = () => {
        console.log("🔌 Viewer WebSocket disconnected")
        this.onDisconnected?.()
      }

      this.ws.onerror = (error) => {
        console.error("❌ Viewer WebSocket error:", error)
        reject(error)
      }
    })
  }

  private async handleWebSocketMessage(message: any) {
    switch (message.type) {
      case "offer":
        await this.handleOffer(message.offer)
        break
      case "ice-candidate":
        await this.handleIceCandidate(message.candidate)
        break
    }
  }

  private async handleOffer(offer: RTCSessionDescription) {
    this.peerConnection = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
    })

    // Handle incoming stream
    this.peerConnection.ontrack = (event) => {
      console.log("📺 Received remote stream")
      this.remoteStream = event.streams[0]
      this.onStreamReceived?.(this.remoteStream)
    }

    // Handle ICE candidates
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        this.ws?.send(
          JSON.stringify({
            type: "ice-candidate",
            candidate: event.candidate,
          }),
        )
      }
    }

    // Monitor connection
    this.peerConnection.onconnectionstatechange = () => {
      console.log("Connection state:", this.peerConnection?.connectionState)
      if (this.peerConnection?.connectionState === "disconnected") {
        this.onDisconnected?.()
      }
    }

    // Set remote description and create answer
    await this.peerConnection.setRemoteDescription(offer)
    const answer = await this.peerConnection.createAnswer()
    await this.peerConnection.setLocalDescription(answer)

    this.ws?.send(
      JSON.stringify({
        type: "answer",
        answer,
      }),
    )

    // Start monitoring stats
    this.startStatsMonitoring()
  }

  private async handleIceCandidate(candidate: RTCIceCandidate) {
    if (this.peerConnection) {
      await this.peerConnection.addIceCandidate(candidate)
    }
  }

  private startStatsMonitoring() {
    if (!this.peerConnection) return

    const statsInterval = setInterval(async () => {
      if (!this.peerConnection || this.peerConnection.connectionState === "closed") {
        clearInterval(statsInterval)
        return
      }

      try {
        const stats = await this.peerConnection.getStats()
        const connectionStats = this.parseStats(stats)
        this.onStatsUpdate?.(connectionStats)
      } catch (error) {
        console.error("Failed to get viewer stats:", error)
      }
    }, 1000)
  }

  private parseStats(stats: RTCStatsReport): ConnectionStats {
    let latency = 0
    let bitrate = 0
    let fps = 0
    let packetLoss = 0

    stats.forEach((report) => {
      if (report.type === "inbound-rtp" && report.mediaType === "video") {
        fps = report.framesPerSecond || 0
        bitrate = report.bytesReceived ? (report.bytesReceived * 8) / 1000 : 0
        packetLoss = report.packetsLost || 0
      }
      if (report.type === "candidate-pair" && report.state === "succeeded") {
        latency = report.currentRoundTripTime ? report.currentRoundTripTime * 1000 : 0
      }
    })

    return { latency, bitrate, fps, packetLoss }
  }

  toggleAudio() {
    if (this.remoteStream) {
      const audioTrack = this.remoteStream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
      }
    }
  }

  disconnect() {
    this.peerConnection?.close()
    this.ws?.close()
    this.remoteStream = null
  }
}
