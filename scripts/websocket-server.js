const WebSocket = require("ws")
const http = require("http")

class AdvancedWebSocketServer {
  constructor(port = 8080) {
    this.port = port
    this.sessions = new Map()
    this.viewers = new Map()
    this.hosts = new Map()

    this.server = http.createServer()
    this.wss = new WebSocket.Server({ server: this.server })

    this.setupWebSocketHandlers()
  }

  setupWebSocketHandlers() {
    this.wss.on("connection", (ws, req) => {
      console.log("🔗 New WebSocket connection")

      ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString())
          this.handleMessage(ws, message)
        } catch (error) {
          console.error("❌ Message parsing error:", error)
        }
      })

      ws.on("close", () => {
        this.handleDisconnection(ws)
      })

      ws.on("error", (error) => {
        console.error("❌ WebSocket error:", error)
      })
    })
  }

  handleMessage(ws, message) {
    switch (message.type) {
      case "host-ready":
        this.handleHostReady(ws, message)
        break
      case "viewer-join":
        this.handleViewerJoin(ws, message)
        break
      case "offer":
        this.handleOffer(ws, message)
        break
      case "answer":
        this.handleAnswer(ws, message)
        break
      case "ice-candidate":
        this.handleIceCandidate(ws, message)
        break
      case "mouse-move":
      case "mouse-click":
      case "key-down":
      case "key-up":
      case "touch-start":
      case "touch-move":
      case "touch-end":
        this.handleInteraction(ws, message)
        break
      default:
        console.log("🤷 Unknown message type:", message.type)
    }
  }

  handleHostReady(ws, message) {
    const { sessionId } = message

    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        host: ws,
        viewers: new Set(),
        createdAt: Date.now(),
      })
    }

    this.hosts.set(ws, sessionId)

    console.log("🏠 Host ready for session:", sessionId)

    ws.send(
      JSON.stringify({
        type: "host-ready-ack",
        sessionId,
      }),
    )
  }

  handleViewerJoin(ws, message) {
    const { sessionId, viewerId } = message
    const session = this.sessions.get(sessionId)

    if (!session) {
      ws.send(
        JSON.stringify({
          type: "error",
          message: "Session not found",
        }),
      )
      return
    }

    session.viewers.add(ws)
    this.viewers.set(ws, { sessionId, viewerId })

    console.log("👀 Viewer joined session:", sessionId, "Viewer ID:", viewerId)

    // Notify host about new viewer
    session.host.send(
      JSON.stringify({
        type: "viewer-joined",
        viewerId,
        viewerCount: session.viewers.size,
      }),
    )

    ws.send(
      JSON.stringify({
        type: "viewer-joined-ack",
        sessionId,
      }),
    )
  }

  handleOffer(ws, message) {
    const { viewerId, offer } = message
    const hostSessionId = this.hosts.get(ws)

    if (!hostSessionId) return

    const session = this.sessions.get(hostSessionId)
    if (!session) return

    // Find the specific viewer
    const viewer = Array.from(session.viewers).find((v) => {
      const viewerInfo = this.viewers.get(v)
      return viewerInfo && viewerInfo.viewerId === viewerId
    })

    if (viewer) {
      viewer.send(
        JSON.stringify({
          type: "offer",
          offer,
        }),
      )
    }
  }

  handleAnswer(ws, message) {
    const { answer } = message
    const viewerInfo = this.viewers.get(ws)

    if (!viewerInfo) return

    const session = this.sessions.get(viewerInfo.sessionId)
    if (!session) return

    session.host.send(
      JSON.stringify({
        type: "answer",
        viewerId: viewerInfo.viewerId,
        answer,
      }),
    )
  }

  handleIceCandidate(ws, message) {
    const { candidate, viewerId } = message

    if (this.hosts.has(ws)) {
      // From host to viewer
      const sessionId = this.hosts.get(ws)
      const session = this.sessions.get(sessionId)

      if (session && viewerId) {
        const viewer = Array.from(session.viewers).find((v) => {
          const info = this.viewers.get(v)
          return info && info.viewerId === viewerId
        })

        if (viewer) {
          viewer.send(
            JSON.stringify({
              type: "ice-candidate",
              candidate,
            }),
          )
        }
      }
    } else if (this.viewers.has(ws)) {
      // From viewer to host
      const viewerInfo = this.viewers.get(ws)
      const session = this.sessions.get(viewerInfo.sessionId)

      if (session) {
        session.host.send(
          JSON.stringify({
            type: "ice-candidate",
            viewerId: viewerInfo.viewerId,
            candidate,
          }),
        )
      }
    }
  }

  handleInteraction(ws, message) {
    const viewerInfo = this.viewers.get(ws)
    if (!viewerInfo) return

    const session = this.sessions.get(viewerInfo.sessionId)
    if (!session) return

    // Forward interaction to host
    session.host.send(
      JSON.stringify({
        type: "remote-interaction",
        viewerId: viewerInfo.viewerId,
        interaction: message,
      }),
    )

    // Broadcast cursor position to other viewers
    if (message.type === "mouse-move") {
      const cursorUpdate = {
        type: "cursor-update",
        cursors: {
          [viewerInfo.viewerId]: {
            x: message.x,
            y: message.y,
            color: this.getViewerColor(viewerInfo.viewerId),
          },
        },
      }

      session.viewers.forEach((viewer) => {
        if (viewer !== ws) {
          viewer.send(JSON.stringify(cursorUpdate))
        }
      })
    }
  }

  handleDisconnection(ws) {
    if (this.hosts.has(ws)) {
      const sessionId = this.hosts.get(ws)
      const session = this.sessions.get(sessionId)

      if (session) {
        // Notify all viewers that host disconnected
        session.viewers.forEach((viewer) => {
          viewer.send(
            JSON.stringify({
              type: "host-disconnected",
            }),
          )
        })

        this.sessions.delete(sessionId)
      }

      this.hosts.delete(ws)
      console.log("🏠 Host disconnected from session:", sessionId)
    } else if (this.viewers.has(ws)) {
      const viewerInfo = this.viewers.get(ws)
      const session = this.sessions.get(viewerInfo.sessionId)

      if (session) {
        session.viewers.delete(ws)

        // Notify host about viewer leaving
        session.host.send(
          JSON.stringify({
            type: "viewer-left",
            viewerId: viewerInfo.viewerId,
            viewerCount: session.viewers.size,
          }),
        )
      }

      this.viewers.delete(ws)
      console.log("👀 Viewer disconnected:", viewerInfo.viewerId)
    }
  }

  getViewerColor(viewerId) {
    const colors = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#ffeaa7", "#dda0dd"]
    const hash = viewerId.split("").reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0)
      return a & a
    }, 0)
    return colors[Math.abs(hash) % colors.length]
  }

  start() {
    this.server.listen(this.port, () => {
      console.log(`🚀 Advanced WebSocket server running on port ${this.port}`)
      console.log(`📡 WebSocket endpoint: ws://localhost:${this.port}`)
    })
  }

  getStats() {
    return {
      activeSessions: this.sessions.size,
      totalViewers: this.viewers.size,
      totalHosts: this.hosts.size,
    }
  }
}

// Start the server
const server = new AdvancedWebSocketServer(8080)
server.start()

// Log stats every 30 seconds
setInterval(() => {
  const stats = server.getStats()
  console.log("📊 Server Stats:", stats)
}, 30000)

module.exports = AdvancedWebSocketServer
