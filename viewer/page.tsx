"use client"

import type React from "react"

import { useEffect, useRef, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Monitor, Volume2, VolumeX, Maximize, Minimize, Users, Activity } from "lucide-react"
import { SignalingClient, type SignalPayload } from "../app/lib/signaling"
import { createPeer } from "../app/lib/webrtc"
import { InteractionTracker } from "../app/lib/interaction-tracker"
import { Logger } from "../app/lib/logger"
import Overlay from "../app/lib/overlay"

type Point = { x: number; y: number }
type CursorMap = { [uid: string]: { pos: Point; color: string } }

export default function ViewerPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const signalRef = useRef<SignalingClient | null>(null)
  const peerRef = useRef<RTCPeerConnection | null>(null)
  const trackerRef = useRef<InteractionTracker | null>(null)
  const loggerRef = useRef<Logger | null>(null)

  const [isConnected, setIsConnected] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [sessionId, setSessionId] = useState("")
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [myPos, setMyPos] = useState<Point>({ x: 0, y: 0 })
  const [remoteCursors, setRemoteCursors] = useState<CursorMap>({})
  const [overlayMsg, setOverlayMsg] = useState<string | null>(null)
  const [viewerId] = useState(() => crypto.randomUUID())

  const [connectionStats, setConnectionStats] = useState({
    latency: 0,
    bitrate: 0,
    fps: 0,
    packetLoss: 0,
  })

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    loggerRef.current = new Logger()
    trackerRef.current = new InteractionTracker(loggerRef.current)

    // Get session ID from URL
    const urlParams = new URLSearchParams(window.location.search)
    const sessionFromUrl = urlParams.get("session")
    if (sessionFromUrl) {
      setSessionId(sessionFromUrl)
    }

    return () => {
      cleanup()
    }
  }, [mounted])

  const handleSignalMessage = useCallback(
    async (msg: SignalPayload) => {
      switch (msg.t) {
        case "offer":
          if (msg.s === sessionId) {
            await handleOffer(msg.d)
          }
          break
        case "ice-candidate":
          if (peerRef.current && msg.s === sessionId) {
            await peerRef.current.addIceCandidate(msg.d)
          }
          break
        case "cursor":
          if (msg.uid !== viewerId) {
            setRemoteCursors((prev) => ({
              ...prev,
              [msg.uid]: {
                pos: msg.pos,
                color: getViewerColor(msg.uid),
              },
            }))
          }
          break
      }
    },
    [sessionId, viewerId],
  )

  const handleOffer = async (offer: RTCSessionDescriptionInit) => {
    peerRef.current = createPeer()

    peerRef.current.ontrack = (event) => {
      console.log("📺 Received remote stream")
      if (videoRef.current) {
        videoRef.current.srcObject = event.streams[0]
      }
      setIsConnected(true)
      setIsConnecting(false)
    }

    peerRef.current.onicecandidate = (event) => {
      if (event.candidate && signalRef.current) {
        signalRef.current.send({
          t: "ice-candidate",
          s: sessionId,
          d: event.candidate,
        })
      }
    }

    peerRef.current.onconnectionstatechange = () => {
      const state = peerRef.current?.connectionState
      console.log("Connection state:", state)

      if (state === "disconnected" || state === "failed") {
        setIsConnected(false)
        showOverlay("Connection lost. Attempting to reconnect...")
        setTimeout(connectToSession, 3000)
      }
    }

    await peerRef.current.setRemoteDescription(offer)
    const answer = await peerRef.current.createAnswer()
    await peerRef.current.setLocalDescription(answer)

    signalRef.current?.send({
      t: "answer",
      s: sessionId,
      d: answer,
    })

    // Start monitoring stats
    startStatsMonitoring()
  }

  const connectToSession = useCallback(async () => {
    if (!sessionId || isConnecting) return

    try {
      setIsConnecting(true)

      signalRef.current = new SignalingClient("ws://localhost:9000", handleSignalMessage, (error) => {
        console.error("❌ Signaling error:", error)
        setIsConnecting(false)
        showOverlay("Connection failed. Check server status.")
      })

      signalRef.current.send({ t: "viewer-join", uid: viewerId })
      console.log("🔗 Connecting to session:", sessionId)
    } catch (error) {
      console.error("Failed to connect:", error)
      setIsConnecting(false)
      showOverlay("Failed to connect to session")
    }
  }, [sessionId, isConnecting, handleSignalMessage, viewerId])

  const disconnect = useCallback(() => {
    cleanup()
    setIsConnected(false)
    setIsConnecting(false)
  }, [])

  const handleInput = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (!videoRef.current || !signalRef.current || !isConnected) return

      const bounds = videoRef.current.getBoundingClientRect()
      let x: number, y: number

      if ("touches" in e) {
        x = e.touches[0].clientX - bounds.left
        y = e.touches[0].clientY - bounds.top
      } else {
        x = e.clientX - bounds.left
        y = e.clientY - bounds.top

        if (e.type === "mousedown") {
          trackerRef.current?.onMouseDown({ x, y }, (e as React.MouseEvent).button)
        }
        if (e.type === "mouseup") {
          trackerRef.current?.onMouseUp({ x, y })
        }
      }

      const pos = {
        x: Math.max(0, Math.min(bounds.width, x)),
        y: Math.max(0, Math.min(bounds.height, y)),
      }

      setMyPos(pos)
      trackerRef.current?.onMouseMove(pos)

      signalRef.current.send({
        t: "cursor",
        uid: viewerId,
        pos,
      })
    },
    [isConnected, viewerId],
  )

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isConnected) return

      if (e.key === "Enter") {
        trackerRef.current?.onEnterKey(myPos)
        showOverlay("⏎ Enter pressed")
      }

      // Prevent default browser shortcuts when connected
      if (e.ctrlKey || e.altKey || e.metaKey) {
        e.preventDefault()
      }
    },
    [isConnected, myPos],
  )

  const toggleFullscreen = useCallback(() => {
    if (!containerRef.current) return

    if (!isFullscreen) {
      containerRef.current.requestFullscreen()
      setIsFullscreen(true)
    } else {
      document.exitFullscreen()
      setIsFullscreen(false)
    }
  }, [isFullscreen])

  const toggleAudio = useCallback(() => {
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      const audioTrack = stream.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setAudioEnabled(audioTrack.enabled)
      }
    }
  }, [])

  const startStatsMonitoring = () => {
    if (!peerRef.current) return

    const statsInterval = setInterval(async () => {
      if (!peerRef.current || peerRef.current.connectionState === "closed") {
        clearInterval(statsInterval)
        return
      }

      try {
        const stats = await peerRef.current.getStats()
        const connectionStats = parseStats(stats)
        setConnectionStats(connectionStats)
      } catch (error) {
        console.error("Failed to get stats:", error)
      }
    }, 1000)
  }

  const parseStats = (stats: RTCStatsReport) => {
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

  const getViewerColor = (uid: string) => {
    const colors = ["#ff6b6b", "#4ecdc4", "#45b7d1", "#96ceb4", "#ffeaa7", "#dda0dd"]
    const hash = uid.split("").reduce((a, b) => {
      a = (a << 5) - a + b.charCodeAt(0)
      return a & a
    }, 0)
    return colors[Math.abs(hash) % colors.length]
  }

  const showOverlay = (message: string) => {
    setOverlayMsg(message)
    setTimeout(() => setOverlayMsg(null), 3000)
  }

  const cleanup = useCallback(() => {
    peerRef.current?.close()
    signalRef.current?.close()
    peerRef.current = null
    signalRef.current = null
  }, [])

  useEffect(() => {
    if (isConnected) {
      window.addEventListener("keydown", handleKeyDown)
      return () => window.removeEventListener("keydown", handleKeyDown)
    }
  }, [isConnected, handleKeyDown])

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="container mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-white mb-2">Remote Desktop Viewer</h1>
            <p className="text-slate-300">Loading...</p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="container mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-white mb-2">Remote Desktop Viewer</h1>
          <p className="text-slate-300">Connect to and interact with remote desktops</p>
        </div>

        {!isConnected && (
          <Card className="bg-slate-800/50 border-slate-700 mb-6">
            <CardHeader>
              <CardTitle className="text-white">Connect to Session</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-slate-300 mb-2 block">Session ID</label>
                <Input
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  placeholder="Enter session ID or paste share link..."
                  className="bg-slate-700 border-slate-600 text-white"
                />
              </div>
              <Button
                onClick={connectToSession}
                disabled={!sessionId || isConnecting}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {isConnecting ? "Connecting..." : "Connect"}
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Main Video Display */}
          <div className="lg:col-span-3">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2">
                    <Monitor className="h-5 w-5" />
                    Remote Desktop
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={isConnected ? "default" : "secondary"}>
                      {isConnected ? "Connected" : isConnecting ? "Connecting" : "Disconnected"}
                    </Badge>
                    {isConnected && (
                      <Badge variant="outline" className="text-slate-300">
                        {connectionStats.latency}ms
                      </Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div
                  ref={containerRef}
                  className="relative aspect-video bg-black rounded-lg overflow-hidden cursor-none"
                  onMouseMove={handleInput}
                  onMouseDown={handleInput}
                  onMouseUp={handleInput}
                  onTouchStart={handleInput}
                  onTouchMove={handleInput}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  <video ref={videoRef} autoPlay playsInline className="w-full h-full object-contain" />

                  {/* Local Cursor */}
                  {isConnected && (
                    <div
                      className="absolute w-4 h-4 bg-blue-500 rounded-full pointer-events-none z-10 transform -translate-x-1/2 -translate-y-1/2 border-2 border-white shadow-lg"
                      style={{
                        left: `${myPos.x}px`,
                        top: `${myPos.y}px`,
                      }}
                    />
                  )}

                  {/* Remote Cursors */}
                  {Object.entries(remoteCursors).map(([uid, cursor]) => (
                    <div
                      key={uid}
                      className="absolute w-4 h-4 rounded-full pointer-events-none z-10 transform -translate-x-1/2 -translate-y-1/2 border-2 border-white shadow-lg"
                      style={{
                        left: `${cursor.pos.x}px`,
                        top: `${cursor.pos.y}px`,
                        backgroundColor: cursor.color,
                      }}
                    />
                  ))}

                  {!isConnected && !isConnecting && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center text-slate-400">
                        <Monitor className="h-16 w-16 mx-auto mb-4 opacity-50" />
                        <p>Enter a session ID to connect</p>
                      </div>
                    </div>
                  )}

                  {isConnecting && (
                    <div className="absolute inset-0 flex items-center justify-center bg-black/50">
                      <div className="text-center text-white">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-4"></div>
                        <p>Connecting to session...</p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Controls */}
                <div className="flex items-center justify-between mt-4">
                  <div className="flex gap-2">
                    {isConnected && (
                      <Button
                        onClick={disconnect}
                        variant="outline"
                        className="bg-red-600 hover:bg-red-700 text-white border-red-600"
                      >
                        Disconnect
                      </Button>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={toggleAudio} disabled={!isConnected}>
                      {audioEnabled ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
                    </Button>
                    <Button variant="outline" size="icon" onClick={toggleFullscreen} disabled={!isConnected}>
                      {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Control Panel */}
          <div className="space-y-6">
            {/* Connection Stats */}
            {isConnected && (
              <Card className="bg-slate-800/50 border-slate-700">
                <CardHeader>
                  <CardTitle className="text-white text-sm flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Connection Stats
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Latency</span>
                    <span className="text-white">{connectionStats.latency.toFixed(0)}ms</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Bitrate</span>
                    <span className="text-white">{(connectionStats.bitrate / 1000).toFixed(1)} Mbps</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">FPS</span>
                    <span className="text-white">{connectionStats.fps}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-400">Packet Loss</span>
                    <span className="text-white">{connectionStats.packetLoss.toFixed(2)}%</span>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Connected Users */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Connected Users
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                    <span className="text-xs text-slate-300">You</span>
                  </div>
                  {Object.entries(remoteCursors).map(([uid, cursor]) => (
                    <div key={uid} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: cursor.color }}></div>
                      <span className="text-xs text-slate-300">User {uid.slice(0, 8)}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white text-sm">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start bg-transparent text-xs"
                  disabled={!isConnected}
                >
                  Ctrl+C (Copy)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start bg-transparent text-xs"
                  disabled={!isConnected}
                >
                  Ctrl+V (Paste)
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start bg-transparent text-xs"
                  disabled={!isConnected}
                >
                  Alt+Tab
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      {overlayMsg && <Overlay message={overlayMsg} />}
    </div>
  )
}