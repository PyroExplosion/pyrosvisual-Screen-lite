const WebSocket = require("ws")
const http = require("http")
// const https = require("https") // Uncomment for WSS
// const fs = require("fs") // Uncomment for WSS

class OptimizedWebSocketServer {
  constructor(port = 9000) {
    this.port = port
    this.sessions = new Map() // Map<sessionId, { hostWs: WebSocket, viewers: Map<viewerId, WebSocket> }>
    this.clientToSession = new Map() // Map<clientId, sessionId>
    this.clientToViewerId = new Map() // Map<clientId, viewerId>
    this.clients = new Map(); // Initialize clients map here
    this.stats = {
      totalConnections: 0,
      activeSessions: 0,
      startTime: Date.now(),
    }

    // For WSS: Uncomment and configure your SSL certificates
    // const privateKey = fs.readFileSync('/path/to/your/private.key', 'utf8');
    // const certificate = fs.readFileSync('/path/to/your/certificate.crt', 'utf8');
    // const credentials = { key: privateKey, cert: certificate };
    // this.server = https.createServer(credentials); // Use https for WSS
    this.server = http.createServer() // Use http for WS (default for local dev)

    this.wss = new WebSocket.Server({
      server: this.server,
      perMessageDeflate: {
        zlibDeflateOptions: {
          level: 3,
          chunkSize: 1024,
        },
        threshold: 1024,
        concurrencyLimit: 10,
        clientMaxWindowBits: 15,
        serverMaxWindowBits: 15,
        serverMaxNoContextTakeover: false,
        clientMaxNoContextTakeover: false,
      },
    })

    this.setupWebSocketHandlers()
    this.setupHealthCheck()
  }

  setupWebSocketHandlers() {
    this.wss.on("connection", (ws, req) => {
      const clientId = this.generateClientId()
      this.clients.set(clientId, {
        ws,
        sessionId: null,
        type: null,
        connectedAt: Date.now(),
        lastPong: Date.now(),
      })

      this.stats.totalConnections++
      console.log(`🔗 Client connected: ${clientId} (Total: ${this.clients.size})`)

      ws.on("message", (data) => {
        try {
          const message = JSON.parse(data.toString())
          this.handleMessage(clientId, message)
        } catch (error) {
          console.error("❌ Message parsing error:", error)
          this.sendError(ws, "Invalid message format")
        }
      })

      ws.on("close", (code, reason) => {
        this.handleDisconnection(clientId, code, reason)
      })

      ws.on("error", (error) => {
        console.error(`❌ WebSocket error for ${clientId}:`, error)
      })

      ws.on("pong", () => {
        const client = this.clients.get(clientId)
        if (client) {
          client.lastPong = Date.now()
        }
      })
    })
  }

  setupHealthCheck() {
    // Ping clients every 30 seconds
    setInterval(() => { // Changed to arrow function to preserve 'this' context
      this.clients.forEach((client, clientId) => {
        if (client.ws.readyState === WebSocket.OPEN) {
          // Check for stale connections (no pong received)
          if (Date.now() - client.lastPong > 60000) { // 60 seconds without pong
            console.warn(`Client ${clientId} timed out (no pong). Disconnecting.`)
            client.ws.terminate() // Force close
          } else {
            client.ws.ping()
          }
        } else {
          this.clients.delete(clientId)
        }
      })
    }, 30000)

    // Log stats every minute
    setInterval(() => {
      console.log("📊 Server Stats:", this.getStats())
    }, 60000)
  }

  handleMessage(clientId, message) {
    const client = this.clients.get(clientId)
    if (!client) return

    switch (message.t) {
      case "host-ready":
        this.handleHostReady(clientId, message)
        break
      case "viewer-join":
        this.handleViewerJoin(clientId, message)
        break
      case "offer": // Offer from host to a specific viewer
        this.handleOffer(clientId, message)
        break
      case "answer": // Answer from viewer to host
        this.handleAnswer(clientId, message)
        break
      case "ice-candidate":
        this.handleIceCandidate(clientId, message)
        break
      case "cursor":
        this.handleCursor(clientId, message)
        break
      case "stats":
        this.handleStats(clientId, message)
        break
      case "ping": // Handle ping from client for latency test
        this.sendToClient(clientId, { t: "pong" })
        break
      default:
        console.log(`🤷 Unknown message type: ${message.t}`)
    }
  }

  handleHostReady(clientId, message) {
    const { s: sessionId } = message
    const client = this.clients.get(clientId)

    console.log(`DEBUG: handleHostReady - Received host-ready from clientId: ${clientId}, sessionId: ${sessionId}`)

    if (!client) {
      console.error(`ERROR: handleHostReady - Client not found for clientId: ${clientId}`)
      return
    }

    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        hostClientId: clientId, // Store host's internal clientId
        hostWs: client.ws,
        viewers: new Map(), // Map<viewerId, WebSocket>
        createdAt: Date.now(),
        stats: {
          totalViewers: 0,
          peakViewers: 0,
          dataTransferred: 0,
        },
      })
      this.stats.activeSessions++
      console.log(`🏠 New session created: ${sessionId}`)
    } else {
      // Re-register host if already exists (e.g., host page refresh)
      const session = this.sessions.get(sessionId);
      session.hostClientId = clientId;
      session.hostWs = client.ws;
      console.log(`🏠 Host re-registered for session: ${sessionId}`);
    }

    client.sessionId = sessionId
    client.type = "host"
    this.clientToSession.set(clientId, sessionId)

    console.log(`🏠 Host ready for session: ${sessionId}`)
    this.sendToClient(clientId, { t: "host-ready-ack", s: sessionId })
    console.log(`DEBUG: Sent host-ready-ack to client ${clientId} for session ${sessionId}.`)
  }

  handleViewerJoin(clientId, message) {
    const { s: sessionId, uid: viewerId } = message // Viewer sends its desired sessionId and its unique uid
    const client = this.clients.get(clientId)
    const session = this.sessions.get(sessionId)

    if (!client || !session) {
      this.sendError(client.ws, "Session not found or client invalid")
      return
    }

    session.viewers.set(viewerId, client.ws) // Map viewer's unique ID to its WebSocket
    this.clientToSession.set(clientId, sessionId)
    this.clientToViewerId.set(clientId, viewerId)
    client.sessionId = sessionId
    client.type = "viewer"
    client.viewerId = viewerId

    session.stats.totalViewers++
    session.stats.peakViewers = Math.max(session.stats.peakViewers, session.viewers.size)

    console.log(`👀 Viewer ${viewerId} joined session: ${sessionId}`)

    // Notify host about new viewer, so host can create an offer for this specific viewer
    this.sendToClient(session.hostClientId, {
      t: "viewer-joined",
      viewerId: viewerId, // Send viewer's unique ID
      viewerCount: session.viewers.size,
    })

    this.sendToClient(clientId, { t: "viewer-joined-ack", s: sessionId, uid: viewerId })
  }

  handleOffer(clientId, message) {
    const { s: sessionId, d: offer, targetViewerId } = message // Host sends offer for a specific targetViewerId
    const session = this.sessions.get(sessionId)

    if (!session || session.hostClientId !== clientId) {
      console.warn(`Offer received from non-host or invalid session: ${clientId}, ${sessionId}`)
      return
    }

    const targetViewerWs = session.viewers.get(targetViewerId)
    if (targetViewerWs) {
      this.sendToClient(this.getViewerClientId(targetViewerWs), {
        t: "offer",
        s: sessionId,
        d: offer,
        hostId: clientId, // Include host's clientId for viewer to know who sent the offer
      })
      console.log(`📤 Offer from host ${clientId} to viewer ${targetViewerId} for session ${sessionId}`)
    } else {
      console.warn(`Target viewer ${targetViewerId} not found for session ${sessionId}`)
    }
  }

  handleAnswer(clientId, message) {
    const { s: sessionId, d: answer } = message
    const viewerId = this.clientToViewerId.get(clientId)
    const session = this.sessions.get(sessionId)

    if (!session || !viewerId) {
      console.warn(`Answer received from invalid viewer or session: ${clientId}, ${sessionId}`)
      return
    }

    // Forward answer to the host
    this.sendToClient(session.hostClientId, {
      t: "answer",
      s: sessionId,
      d: answer,
      viewerId: viewerId, // Include viewer's ID so host knows which peer connection to apply it to
    })
    console.log(`📥 Answer from viewer ${viewerId} to host ${session.hostClientId} for session ${sessionId}`)
  }

  handleIceCandidate(clientId, message) {
    const { s: sessionId, d: candidate, targetViewerId } = message // targetViewerId is used when host sends to viewer
    const client = this.clients.get(clientId)

    if (!client || !client.sessionId) return

    const session = this.sessions.get(client.sessionId)
    if (!session) return

    if (client.type === "host") {
      // Host sending ICE candidate to a specific viewer
      const viewerWs = session.viewers.get(targetViewerId)
      if (viewerWs) {
        this.sendToClient(this.getViewerClientId(viewerWs), {
          t: "ice-candidate",
          s: sessionId,
          d: candidate,
          from: "host",
        })
        console.log(`🧊 ICE from host ${clientId} to viewer ${targetViewerId}`)
      }
    } else if (client.type === "viewer") {
      // Viewer sending ICE candidate to the host
      this.sendToClient(session.hostClientId, {
        t: "ice-candidate",
        s: sessionId,
        d: candidate,
        viewerId: client.viewerId, // Viewer's ID
        from: "viewer",
      })
      console.log(`🧊 ICE from viewer ${client.viewerId} to host ${session.hostClientId}`)
    }
  }

  handleCursor(clientId, message) {
    const { uid, pos } = message
    const client = this.clients.get(clientId)

    if (!client || !client.sessionId) return

    const session = this.sessions.get(client.sessionId)
    if (!session) return

    // Broadcast cursor position to all other clients in session (host + other viewers)
    const recipients = new Set([session.hostClientId, ...session.viewers.keys()])
    recipients.delete(clientId) // Don't send back to sender

    recipients.forEach((recipientClientId) => {
      this.sendToClient(recipientClientId, { t: "cursor", uid, pos })
    })
  }

  handleStats(clientId, message) {
    const { s: sessionId, d: stats } = message
    const session = this.sessions.get(sessionId)

    if (session) {
      session.stats.dataTransferred += stats.bytesTransferred || 0
      // Optionally, forward host stats to viewers or store for analytics
    }
  }

  handleDisconnection(clientId, code, reason) {
    const client = this.clients.get(clientId)

    if (client) {
      console.log(`🔌 Client disconnected: ${clientId} (Code: ${code}, Reason: ${reason})`)

      if (client.sessionId) {
        const session = this.sessions.get(client.sessionId)

        if (session) {
          if (client.type === "host") {
            // Host disconnected - notify all viewers and cleanup session
            session.viewers.forEach((viewerWs, viewerId) => {
              this.sendToClient(this.getViewerClientId(viewerWs), { t: "host-disconnected", s: client.sessionId })
            })

            this.sessions.delete(client.sessionId)
            this.stats.activeSessions--
            console.log(`🏠 Session ended: ${client.sessionId}`)
          } else if (client.type === "viewer") {
            // Viewer disconnected - remove from session
            session.viewers.delete(client.viewerId)

            // Notify host about viewer count change
            this.sendToClient(session.hostClientId, {
              t: "viewer-count-changed",
              s: client.sessionId,
              count: session.viewers.size,
            })
            console.log(`👀 Viewer ${client.viewerId} disconnected from session ${client.sessionId}`)
          }
        }
      }
    }

    this.clients.delete(clientId)
    this.clientToSession.delete(clientId)
    this.clientToViewerId.delete(clientId)
  }

  sendToClient(clientId, message) {
    const client = this.clients.get(clientId)

    if (client && client.ws.readyState === WebSocket.OPEN) {
      try {
        client.ws.send(JSON.stringify(message))
      } catch (error) {
        console.error(`Failed to send message to ${clientId}:`, error)
      }
    }
  }

  sendError(ws, message) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ t: "error", message }))
    }
  }

  generateClientId() {
    return `client_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  // Helper to get clientId from viewerWs (since viewers map stores ws directly)
  getViewerClientId(viewerWs) {
    for (const [clientId, clientInfo] of this.clients.entries()) {
      if (clientInfo.ws === viewerWs) {
        return clientId;
      }
    }
    return null;
  }

  getStats() {
    const uptime = Date.now() - this.stats.startTime

    return {
      activeSessions: this.stats.activeSessions,
      connectedClients: this.clients.size,
      totalConnections: this.stats.totalConnections,
      uptime: this.formatUptime(uptime),
      memoryUsage: process.memoryUsage(),
    }
  }

  formatUptime(ms) {
    const seconds = Math.floor(ms / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)

    return `${hours.toString().padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}`
  }

  start() {
    this.server.listen(this.port, () => {
      console.log(`🚀 Optimized WebSocket server running on port ${this.port}`)
      console.log(`📡 WebSocket endpoint: ws://localhost:${this.port}`)
      console.log(`🔧 Server started at: ${new Date().toISOString()}`)
    })

    // Graceful shutdown
    process.on("SIGINT", () => {
      console.log("\n🛑 Shutting down server gracefully...")

      this.clients.forEach((client, clientId) => {
        client.ws.close(1000, "Server shutting down")
      })

      this.server.close(() => {
        console.log("✅ Server shut down successfully")
        process.exit(0)
      })
    })

    process.on("SIGTERM", () => {
      console.log("\n🛑 Received SIGTERM, shutting down...")
      this.server.close(() => {
        process.exit(0)
      })
    })
  }
}

// Start the server
const server = new OptimizedWebSocketServer(9000)
server.start()

module.exports = OptimizedWebSocketServer
