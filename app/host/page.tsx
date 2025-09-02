"use client"

import { useEffect, useRef, useState, useCallback } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Monitor, Mic, MicOff, Video, VideoOff, Users, Activity, Square, Play, Copy, Check } from 'lucide-react'
import { SignalingClient, type SignalPayload } from "../lib/signaling"
import { createPeer, attachMediaTracks, makeOffer } from "../lib/webrtc"
import { PerformanceMonitor } from "../lib/performance-monitor"
import { SessionRecorder } from "../lib/session-recorder"

// Define a type for the map of peer connections
type PeerConnectionsMap = Map<string, RTCPeerConnection>;

export default function HostPage() {
  const videoRef = useRef<HTMLVideoElement>(null)
  const signalRef = useRef<SignalingClient | null>(null)
  // Use a Map to store peer connections for each viewer
  const peerConnections = useRef<PeerConnectionsMap>(new Map())
  const performanceMonitor = useRef<PerformanceMonitor | null>(null)
  const sessionRecorder = useRef<SessionRecorder | null>(null)
  const localStream = useRef<MediaStream | null>(null) // Store local stream

  const [isStreaming, setIsStreaming] = useState(false)
  const [isRecording, setIsRecording] = useState(false)
  const [audioEnabled, setAudioEnabled] = useState(true)
  const [videoEnabled, setVideoEnabled] = useState(true)
  const [connectedUsers, setConnectedUsers] = useState(0)
  const [sessionId] = useState(() => crypto.randomUUID())
  const [copied, setCopied] = useState(false)
  const [performance, setPerformance] = useState({
    fps: 0,
    bitrate: 0,
    latency: 0,
    cpuUsage: 0,
    memoryUsage: 0,
  })

  const [streamConfig, setStreamConfig] = useState({
    resolution: "1920x1080",
    frameRate: 60,
    bitrate: 8000,
    codec: "h264",
  })

  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    performanceMonitor.current = new PerformanceMonitor()
    sessionRecorder.current = new SessionRecorder(sessionId)

    // Initialize signaling
    signalRef.current = new SignalingClient(
      "ws://localhost:9000",
      handleSignalMessage,
      (error) => {
        console.error("❌ Signaling error:", error)
      },
      () => { // onOpenCallback
        // Send host ready signal ONLY after WebSocket is open
        signalRef.current?.send({ t: "host-ready", s: sessionId })
      }
    )

    // Remove the immediate send call
    // signalRef.current.send({ t: "host-ready", s: sessionId })

    return () => {
      cleanup()
    }
  }, [sessionId, mounted])

  const handleSignalMessage = useCallback(
    async (msg: SignalPayload) => {
      switch (msg.t) {
        case "viewer-joined":
          // Server notifies host that a new viewer has joined
          setConnectedUsers(msg.viewerCount)
          console.log(`👀 Viewer ${msg.viewerId} joined. Total: ${msg.viewerCount}`)
          if (localStream.current) {
            // Create a new peer connection for this specific viewer
            await createPeerConnectionForViewer(msg.viewerId, localStream.current)
          }
          break
        case "answer":
          // Viewer sends answer back to host
          if (msg.viewerId) {
            const peerConnection = peerConnections.current.get(msg.viewerId)
            if (peerConnection) {
              await peerConnection.setRemoteDescription(msg.d)
              console.log(`✅ Answer applied for viewer: ${msg.viewerId}`)
            }
          }
          break
        case "ice-candidate":
          // ICE candidate from viewer to host
          if (msg.from === "viewer" && msg.viewerId) {
            const peerConnection = peerConnections.current.get(msg.viewerId)
            if (peerConnection) {
              await peerConnection.addIceCandidate(msg.d)
              console.log(`🧊 ICE candidate from viewer ${msg.viewerId} applied.`)
            }
          }
          break
        case "viewer-count-changed":
          setConnectedUsers(msg.count);
          break;
        case "host-disconnected":
          // This message is for viewers, host won't receive it from server
          break;
      }
    },
    [sessionId],
  )

  const createPeerConnectionForViewer = useCallback(async (viewerId: string, stream: MediaStream) => {
    const peerConnection = createPeer()
    peerConnections.current.set(viewerId, peerConnection)

    // Add local stream tracks to the new peer connection
    attachMediaTracks(peerConnection, stream)

    // Handle ICE candidates for this specific peer connection
    peerConnection.onicecandidate = (event) => {
      if (event.candidate && signalRef.current) {
        signalRef.current.send({
          t: "ice-candidate",
          s: sessionId,
          d: event.candidate,
          targetViewerId: viewerId, // Specify which viewer this candidate is for
          from: "host",
        })
      }
    }

    // Monitor connection state for this peer
    peerConnection.onconnectionstatechange = () => {
      console.log(`Connection state for viewer ${viewerId}:`, peerConnection.connectionState)
      if (peerConnection.connectionState === "disconnected" || peerConnection.connectionState === "failed") {
        peerConnections.current.delete(viewerId); // Remove disconnected peer
        setConnectedUsers(peerConnections.current.size); // Update count
        console.log(`Viewer ${viewerId} disconnected. Remaining: ${peerConnections.current.size}`);
      }
    }

    // Create and send offer to the server for this specific viewer
    const offer = await makeOffer(peerConnection)
    signalRef.current?.send({
      t: "offer",
      s: sessionId,
      d: offer,
      targetViewerId: viewerId, // Specify which viewer this offer is for
    })
    console.log(`🚀 Offer sent to server for viewer: ${viewerId}`)
  }, [sessionId]);


  const startStreaming = useCallback(async () => {
    if (isStreaming) return

    try {
      setIsStreaming(true)

      // Get high-quality display media
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          width: { ideal: Number.parseInt(streamConfig.resolution.split("x")[0]) },
          height: { ideal: Number.parseInt(streamConfig.resolution.split("x")[1]) },
          frameRate: { ideal: streamConfig.frameRate },
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          sampleRate: 48000,
        },
      })
      localStream.current = stream; // Store the local stream

      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }

      // Start performance monitoring
      performanceMonitor.current?.start((stats) => {
        setPerformance((prev) => ({ ...prev, ...stats }))
      })

      console.log("🚀 Display media captured. Waiting for viewers...")
    } catch (error) {
      console.error("Failed to start streaming:", error)
      setIsStreaming(false)
    }
  }, [isStreaming, streamConfig])

  const stopStreaming = useCallback(() => {
    if (localStream.current) {
      localStream.current.getTracks().forEach((track) => track.stop())
      localStream.current = null;
    }

    // Close all active peer connections
    peerConnections.current.forEach((pc) => pc.close())
    peerConnections.current.clear()

    performanceMonitor.current?.stop()

    setIsStreaming(false)
    setConnectedUsers(0)
    console.log("⏹️ Streaming stopped")
  }, [])

  const toggleRecording = useCallback(() => {
    if (!sessionRecorder.current) return

    if (isRecording) {
      sessionRecorder.current.stop()
      setIsRecording(false)
    } else {
      const stream = videoRef.current?.srcObject as MediaStream
      if (stream) {
        sessionRecorder.current.start(stream)
        setIsRecording(true)
      }
    }
  }, [isRecording])

  const toggleAudio = useCallback(() => {
    if (localStream.current) {
      const audioTrack = localStream.current.getAudioTracks()[0]
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled
        setAudioEnabled(audioTrack.enabled)
      }
    }
  }, [])

  const toggleVideo = useCallback(() => {
    if (localStream.current) {
      const videoTrack = localStream.current.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled
        setVideoEnabled(videoTrack.enabled)
      }
    }
  }, [])

  const copySessionId = useCallback(() => {
    navigator.clipboard.writeText(sessionId)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }, [sessionId])

  const cleanup = useCallback(() => {
    stopStreaming()
    signalRef.current?.close()
    performanceMonitor.current?.stop()
    sessionRecorder.current?.stop()
  }, [stopStreaming])

  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
        <div className="container mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-white mb-2">Desktop Host</h1>
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
          <h1 className="text-3xl font-bold text-white mb-2">Desktop Host</h1>
          <p className="text-slate-300">Share your desktop with optimized performance</p>
        </div>

        <div className="grid lg:grid-cols-4 gap-6">
          {/* Main Video Display */}
          <div className="lg:col-span-3">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-white flex items-center gap-2">
                    <Monitor className="h-5 w-5" />
                    Desktop Stream
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge variant={isStreaming ? "default" : "secondary"}>{isStreaming ? "Live" : "Offline"}</Badge>
                    <Badge variant="outline" className="text-slate-300">
                      <Users className="h-3 w-3 mr-1" />
                      {connectedUsers}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="relative aspect-video bg-black rounded-lg overflow-hidden">
                  <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-contain" />
                  {!isStreaming && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="text-center text-slate-400">
                        <Monitor className="h-16 w-16 mx-auto mb-4 opacity-50" />
                        <p>Click "Start Streaming" to begin</p>
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between mt-4">
                  <div className="flex gap-2">
                    <Button
                      onClick={isStreaming ? stopStreaming : startStreaming}
                      className={isStreaming ? "bg-red-600 hover:bg-red-700" : "bg-green-600 hover:bg-green-700"}
                    >
                      {isStreaming ? (
                        <>
                          <Square className="h-4 w-4 mr-2" />
                          Stop Streaming
                        </>
                      ) : (
                        <>
                          <Play className="h-4 w-4 mr-2" />
                          Start Streaming
                        </>
                      )}
                    </Button>

                    <Button
                      variant="outline"
                      onClick={toggleRecording}
                      disabled={!isStreaming}
                      className={isRecording ? "border-red-500 text-red-500" : ""}
                    >
                      {isRecording ? "Stop Recording" : "Start Recording"}
                    </Button>
                  </div>

                  <div className="flex gap-2">
                    <Button variant="outline" size="icon" onClick={toggleAudio} disabled={!isStreaming}>
                      {audioEnabled ? <Mic className="h-4 w-4" /> : <MicOff className="h-4 w-4" />}
                    </Button>
                    <Button variant="outline" size="icon" onClick={toggleVideo} disabled={!isStreaming}>
                      {videoEnabled ? <Video className="h-4 w-4" /> : <VideoOff className="h-4 w-4" />}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Control Panel */}
          <div className="space-y-6">
            {/* Session Info */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white text-sm">Session Info</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <p className="text-xs text-slate-400 mb-1">Session ID</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs font-mono text-slate-200 break-all flex-1">{sessionId.slice(0, 8)}...</p>
                    <Button size="icon" variant="ghost" className="h-6 w-6" onClick={copySessionId}>
                      {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-400">Connected Users</span>
                  <Badge variant="outline">{connectedUsers}</Badge>
                </div>
              </CardContent>
            </Card>

            {/* Performance Metrics */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white text-sm flex items-center gap-2">
                  <Activity className="h-4 w-4" />
                  Performance
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">FPS</span>
                    <span className="text-white">{performance.fps}</span>
                  </div>
                  <Progress value={(performance.fps / 60) * 100} className="h-2" />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Bitrate</span>
                    <span className="text-white">{(performance.bitrate / 1000).toFixed(1)} Mbps</span>
                  </div>
                  <Progress value={(performance.bitrate / 10000) * 100} className="h-2" />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">Latency</span>
                    <span className="text-white">{performance.latency}ms</span>
                  </div>
                  <Progress value={(performance.latency / 100) * 100} className="h-2" />
                </div>

                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">CPU Usage</span>
                    <span className="text-white">{performance.cpuUsage}%</span>
                  </div>
                  <Progress value={performance.cpuUsage} className="h-2" />
                </div>
              </CardContent>
            </Card>

            {/* Stream Settings */}
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader>
                <CardTitle className="text-white text-sm">Stream Settings</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Resolution</label>
                  <select
                    className="w-full bg-slate-700 border-slate-600 text-white text-xs rounded px-2 py-1"
                    value={streamConfig.resolution}
                    onChange={(e) => setStreamConfig((prev) => ({ ...prev, resolution: e.target.value }))}
                    disabled={isStreaming}
                  >
                    <option value="1920x1080">1920x1080 (1080p)</option>
                    <option value="2560x1440">2560x1440 (1440p)</option>
                    <option value="3840x2160">3840x2160 (4K)</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Frame Rate</label>
                  <select
                    className="w-full bg-slate-700 border-slate-600 text-white text-xs rounded px-2 py-1"
                    value={streamConfig.frameRate}
                    onChange={(e) =>
                      setStreamConfig((prev) => ({ ...prev, frameRate: Number.parseInt(e.target.value) }))
                    }
                    disabled={isStreaming}
                  >
                    <option value={30}>30 FPS</option>
                    <option value={60}>60 FPS</option>
                    <option value={120}>120 FPS</option>
                  </select>
                </div>

                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Bitrate (Kbps)</label>
                  <input
                    type="range"
                    min="2000"
                    max="15000"
                    step="500"
                    value={streamConfig.bitrate}
                    onChange={(e) => setStreamConfig((prev) => ({ ...prev, bitrate: Number.parseInt(e.target.value) }))}
                    disabled={isStreaming}
                    className="w-full"
                  />
                  <div className="text-xs text-slate-300 text-center">{streamConfig.bitrate} Kbps</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  )
}
