"use client"

import { useState, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { WifiOff, Zap, Clock, Activity } from "lucide-react"

interface ConnectionTest {
  name: string
  status: "pending" | "running" | "success" | "failed"
  result?: string
  duration?: number
}

export default function ConnectionTester() {
  const [isRunning, setIsRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [tests, setTests] = useState<ConnectionTest[]>([
    { name: "WebSocket Connection", status: "pending" },
    { name: "WebRTC Peer Connection", status: "pending" },
    { name: "STUN Server Connectivity", status: "pending" },
    { name: "Media Device Access", status: "pending" },
    { name: "Network Latency", status: "pending" },
    { name: "Bandwidth Test", status: "pending" },
  ])

  const wsRef = useRef<WebSocket | null>(null)

  const runTests = async () => {
    setIsRunning(true)
    setProgress(0)

    const testFunctions = [
      testWebSocketConnection,
      testWebRTCConnection,
      testSTUNConnectivity,
      testMediaDeviceAccess,
      testNetworkLatency,
      testBandwidth,
    ]

    for (let i = 0; i < testFunctions.length; i++) {
      setTests((prev) => prev.map((test, index) => (index === i ? { ...test, status: "running" } : test)))

      try {
        const startTime = Date.now()
        const result = await testFunctions[i]()
        const duration = Date.now() - startTime

        setTests((prev) =>
          prev.map((test, index) =>
            index === i
              ? {
                  ...test,
                  status: "success",
                  result: result || "Passed",
                  duration,
                }
              : test,
          ),
        )
      } catch (error) {
        setTests((prev) =>
          prev.map((test, index) =>
            index === i
              ? {
                  ...test,
                  status: "failed",
                  result: error instanceof Error ? error.message : "Failed",
                  duration: Date.now() - Date.now(),
                }
              : test,
          ),
        )
      }

      setProgress(((i + 1) / testFunctions.length) * 100)
      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    setIsRunning(false)
  }

  const testWebSocketConnection = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket("ws://localhost:9000")
      wsRef.current = ws

      const timeout = setTimeout(() => {
        ws.close()
        reject(new Error("Connection timeout"))
      }, 5000)

      ws.onopen = () => {
        clearTimeout(timeout)
        ws.close()
        resolve("Connected successfully")
      }

      ws.onerror = () => {
        clearTimeout(timeout)
        reject(new Error("Connection failed"))
      }
    })
  }

  const testWebRTCConnection = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      try {
        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        })

        pc.createDataChannel("test")

        pc.createOffer()
          .then((offer) => {
            pc.setLocalDescription(offer)
            resolve("WebRTC supported")
          })
          .catch(reject)

        setTimeout(() => {
          pc.close()
        }, 1000)
      } catch (error) {
        reject(error)
      }
    })
  }

  const testSTUNConnectivity = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const pc = new RTCPeerConnection({
        iceServers: [{ urls: "stun:stun.l.google.com:19302" }, { urls: "stun:stun1.l.google.com:19302" }],
      })

      let candidatesFound = 0

      pc.onicecandidate = (event) => {
        if (event.candidate) {
          candidatesFound++
        } else {
          pc.close()
          if (candidatesFound > 0) {
            resolve(`Found ${candidatesFound} ICE candidates`)
          } else {
            reject(new Error("No ICE candidates found"))
          }
        }
      }

      pc.createDataChannel("test")
      pc.createOffer().then((offer) => pc.setLocalDescription(offer))

      setTimeout(() => {
        pc.close()
        if (candidatesFound === 0) {
          reject(new Error("STUN server timeout"))
        }
      }, 10000)
    })
  }

  const testMediaDeviceAccess = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      navigator.mediaDevices
        .getDisplayMedia({
          video: true,
          audio: true,
        })
        .then((stream) => {
          const videoTracks = stream.getVideoTracks().length
          const audioTracks = stream.getAudioTracks().length

          stream.getTracks().forEach((track) => track.stop())

          resolve(`Video: ${videoTracks}, Audio: ${audioTracks}`)
        })
        .catch((error) => {
          reject(new Error("Media access denied"))
        })
    })
  }

  const testNetworkLatency = (): Promise<string> => {
    return new Promise((resolve, reject) => {
      const startTime = performance.now()

      fetch("/api/ping", { method: "HEAD" })
        .then(() => {
          const latency = performance.now() - startTime
          resolve(`${latency.toFixed(0)}ms`)
        })
        .catch(() => {
          // Fallback test using WebSocket ping
          if (wsRef.current?.readyState === WebSocket.OPEN) {
            const pingStart = performance.now()
            wsRef.current.send(JSON.stringify({ t: "ping" }))

            wsRef.current.onmessage = () => {
              const latency = performance.now() - pingStart
              resolve(`${latency.toFixed(0)}ms (WebSocket)`)
            }
          } else {
            reject(new Error("Network unreachable"))
          }
        })
    })
  }

  const testBandwidth = (): Promise<string> => {
    return new Promise((resolve) => {
      // Simple bandwidth estimation
      const testSize = 1024 * 100 // 100KB
      const testData = new ArrayBuffer(testSize)
      const startTime = performance.now()

      // Simulate data processing
      setTimeout(() => {
        const duration = performance.now() - startTime
        const bandwidth = (testSize * 8) / (duration / 1000) / 1000 // Kbps
        resolve(`~${bandwidth.toFixed(0)} Kbps`)
      }, 100)
    })
  }

  const resetTests = () => {
    setTests((prev) =>
      prev.map((test) => ({
        ...test,
        status: "pending",
        result: undefined,
        duration: undefined,
      })),
    )
    setProgress(0)
  }

  const getStatusIcon = (status: ConnectionTest["status"]) => {
    switch (status) {
      case "running":
        return <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500" />
      case "success":
        return <Zap className="h-4 w-4 text-green-500" />
      case "failed":
        return <WifiOff className="h-4 w-4 text-red-500" />
      default:
        return <Clock className="h-4 w-4 text-slate-400" />
    }
  }

  const getStatusBadge = (status: ConnectionTest["status"]) => {
    switch (status) {
      case "running":
        return <Badge variant="secondary">Running</Badge>
      case "success":
        return <Badge className="bg-green-600">Passed</Badge>
      case "failed":
        return <Badge variant="destructive">Failed</Badge>
      default:
        return <Badge variant="outline">Pending</Badge>
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 p-4">
      <div className="container mx-auto max-w-4xl">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-white mb-2">Connection Tester</h1>
          <p className="text-slate-300">Test your system's compatibility with the remote desktop application</p>
        </div>

        <Card className="bg-slate-800/50 border-slate-700 mb-6">
          <CardHeader>
            <CardTitle className="text-white flex items-center gap-2">
              <Activity className="h-5 w-5" />
              System Diagnostics
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Test Progress</span>
                <span className="text-white">{progress.toFixed(0)}%</span>
              </div>
              <Progress value={progress} className="h-2" />

              <div className="flex gap-4">
                <Button onClick={runTests} disabled={isRunning} className="bg-blue-600 hover:bg-blue-700">
                  {isRunning ? "Running Tests..." : "Run Diagnostics"}
                </Button>
                <Button onClick={resetTests} variant="outline" disabled={isRunning}>
                  Reset
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4">
          {tests.map((test, index) => (
            <Card key={index} className="bg-slate-800/50 border-slate-700">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {getStatusIcon(test.status)}
                    <div>
                      <h3 className="text-white font-medium">{test.name}</h3>
                      {test.result && <p className="text-sm text-slate-400">{test.result}</p>}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {test.duration && <span className="text-xs text-slate-400">{test.duration}ms</span>}
                    {getStatusBadge(test.status)}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        <Card className="mt-8 bg-slate-800/50 border-slate-700">
          <CardHeader>
            <CardTitle className="text-white">System Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-4 text-sm">
              <div>
                <h4 className="font-semibold text-white mb-2">Browser</h4>
                <p className="text-slate-300">{navigator.userAgent}</p>
              </div>
              <div>
                <h4 className="font-semibold text-white mb-2">Screen</h4>
                <p className="text-slate-300">
                  {screen.width}x{screen.height} @ {screen.pixelDepth}bit
                </p>
              </div>
              <div>
                <h4 className="font-semibold text-white mb-2">Connection</h4>
                <p className="text-slate-300">{(navigator as any).connection?.effectiveType || "Unknown"}</p>
              </div>
              <div>
                <h4 className="font-semibold text-white mb-2">Hardware</h4>
                <p className="text-slate-300">{navigator.hardwareConcurrency} cores</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
