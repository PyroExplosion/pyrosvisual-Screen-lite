"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Monitor, Users, Play, Wifi, WifiOff } from 'lucide-react'
import Link from "next/link"

export default function HomePage() {
  const [mounted, setMounted] = useState(false)
  const [serverStatus, setServerStatus] = useState<"checking" | "online" | "offline">("checking")
  const [stats] = useState({
    activeSessions: 0,
    totalConnections: 0,
    uptime: "00:00:00",
  })

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!mounted) return

    checkServerStatus()
    const interval = setInterval(checkServerStatus, 5000)
    return () => clearInterval(interval)
  }, [mounted])

  const checkServerStatus = async () => {
    if (!mounted) return

    try {
      const ws = new WebSocket("ws://localhost:9000")
      ws.onopen = () => {
        setServerStatus("online")
        ws.close()
      }
      ws.onerror = () => {
        setServerStatus("offline")
      }
      setTimeout(() => {
        if (ws.readyState === WebSocket.CONNECTING) {
          setServerStatus("offline")
          ws.close()
        }
      }, 3000)
    } catch {
      setServerStatus("offline")
    }
  }

  // Prevent hydration mismatch by not rendering dynamic content until mounted
  if (!mounted) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
        <div className="container mx-auto px-4 py-8">
          <div className="text-center mb-12">
            <h1 className="text-4xl font-bold text-white mb-4">LiteScreen v0.9</h1>
            <p className="text-xl text-slate-300 max-w-2xl mx-auto">
              Ultra-high performance remote desktop with sub-50ms latency, hardware acceleration, and advanced
              interaction tracking.
            </p>
            <div className="flex items-center justify-center gap-2 mt-4">
              <Badge variant="secondary">Loading...</Badge>
            </div>
          </div>
          {/* Static content that doesn't change */}
          <div className="grid md:grid-cols-3 gap-6 mb-8">
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-200">Active Sessions</CardTitle>
                <Users className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">0</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-200">Total Connections</CardTitle>
                <Monitor className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">0</div>
              </CardContent>
            </Card>
            <Card className="bg-slate-800/50 border-slate-700">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium text-slate-200">Server Uptime</CardTitle>
                <Play className="h-4 w-4 text-slate-400" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-white">00:00:00</div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900">
      <div className="container mx-auto px-4 py-8">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-4">LiteScreen v0.9</h1>
          <p className="text-xl text-slate-300 max-w-2xl mx-auto">
            Ultra-high performance remote desktop with sub-50ms latency, hardware acceleration, and advanced interaction
            tracking.
          </p>

          <div className="flex items-center justify-center gap-2 mt-4">
            {serverStatus === "online" ? (
              <Badge className="bg-green-600 hover:bg-green-700">
                <Wifi className="h-3 w-3 mr-1" />
                Server Online
              </Badge>
            ) : serverStatus === "offline" ? (
              <Badge variant="destructive">
                <WifiOff className="h-3 w-3 mr-1" />
                Server Offline
              </Badge>
            ) : (
              <Badge variant="secondary">Checking Server...</Badge>
            )}
          </div>
        </div>

        <div className="grid md:grid-cols-3 gap-6 mb-8">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-200">Active Sessions</CardTitle>
              <Users className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{stats.activeSessions}</div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-200">Total Connections</CardTitle>
              <Monitor className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{stats.totalConnections}</div>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium text-slate-200">Server Uptime</CardTitle>
              <Play className="h-4 w-4 text-slate-400" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-white">{stats.uptime}</div>
            </CardContent>
          </Card>
        </div>

        <div className="grid md:grid-cols-2 gap-8">
          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                Host Desktop
              </CardTitle>
              <CardDescription className="text-slate-300">
                Share your desktop with ultra-low latency and hardware acceleration.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Hardware Accelerated</Badge>
                <Badge variant="secondary">Sub-50ms Latency</Badge>
                <Badge variant="secondary">4K @ 60fps</Badge>
                <Badge variant="secondary">Multi-Monitor</Badge>
              </div>
              <Link href="/host">
                <Button className="w-full bg-blue-600 hover:bg-blue-700" disabled={serverStatus !== "online"}>
                  {serverStatus === "online" ? "Start Hosting" : "Server Required"}
                </Button>
              </Link>
            </CardContent>
          </Card>

          <Card className="bg-slate-800/50 border-slate-700">
            <CardHeader>
              <CardTitle className="text-white flex items-center gap-2">
                <Users className="h-5 w-5" />
                Connect to Desktop
              </CardTitle>
              <CardDescription className="text-slate-300">
                Connect with full interaction support and session recording.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Badge variant="secondary">Real-time Cursors</Badge>
                <Badge variant="secondary">Session Recording</Badge>
                <Badge variant="secondary">Touch Optimized</Badge>
                <Badge variant="secondary">Auto-Reconnect</Badge>
              </div>
              <Link href="/viewer">
                <Button className="w-full bg-green-600 hover:bg-green-700" disabled={serverStatus !== "online"}>
                  {serverStatus === "online" ? "Connect to Desktop" : "Server Required"}
                </Button>
              </Link>
            </CardContent>
          </Card>
        </div>

        {serverStatus === "offline" && (
          <Card className="mt-8 bg-red-900/20 border-red-700">
            <CardHeader>
              <CardTitle className="text-red-400">Server Not Running</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-red-300 mb-4">The WebSocket server is not running. To start the application:</p>
              <div className="bg-slate-800 p-4 rounded-lg">
                <code className="text-green-400">npm run dev</code>
              </div>
              <p className="text-red-300 mt-2 text-sm">
                This will automatically start both the Next.js app and the WebSocket server.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
