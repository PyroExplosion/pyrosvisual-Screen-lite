export interface SystemStats {
  cpuUsage: number
  memoryUsage: number
  networkLatency: number
  frameRate: number
  bandwidth: number
}

export class PerformanceMonitor {
  private isMonitoring = false
  private monitoringInterval: NodeJS.Timeout | null = null
  private frameCount = 0
  private lastFrameTime = 0
  private bandwidthSamples: number[] = []

  start(callback: (stats: SystemStats) => void) {
    if (this.isMonitoring) return

    this.isMonitoring = true
    this.lastFrameTime = performance.now()
    this.frameCount = 0

    this.monitoringInterval = setInterval(async () => {
      const stats = await this.collectStats()
      callback(stats)
    }, 1000)

    console.log("📊 Performance monitoring started")
  }

  stop() {
    if (!this.isMonitoring) return

    this.isMonitoring = false

    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval)
      this.monitoringInterval = null
    }

    console.log("📊 Performance monitoring stopped")
  }

  private async collectStats(): Promise<SystemStats> {
    const cpuUsage = await this.estimateCPUUsage()
    const memoryUsage = this.getMemoryUsage()
    const networkLatency = await this.measureNetworkLatency()
    const frameRate = this.calculateFrameRate()
    const bandwidth = this.calculateBandwidth()

    return {
      cpuUsage,
      memoryUsage,
      networkLatency,
      frameRate,
      bandwidth,
    }
  }

  private async estimateCPUUsage(): Promise<number> {
    const start = performance.now()

    // CPU-intensive task for measurement
    let iterations = 0
    const targetTime = 10 // ms

    while (performance.now() - start < targetTime) {
      Math.random() * Math.random()
      iterations++
    }

    const actualTime = performance.now() - start
    const efficiency = targetTime / actualTime

    return Math.max(0, Math.min(100, (1 - efficiency) * 100))
  }

  private getMemoryUsage(): number {
    if ("memory" in performance) {
      const memory = (performance as any).memory
      return (memory.usedJSHeapSize / memory.jsHeapSizeLimit) * 100
    }
    return 0
  }

  private async measureNetworkLatency(): Promise<number> {
    try {
      const start = performance.now()
      const response = await fetch("/api/ping", {
        method: "HEAD",
        cache: "no-cache",
      })
      const latency = performance.now() - start
      return response.ok ? latency : 0
    } catch {
      return 0
    }
  }

  private calculateFrameRate(): number {
    const now = performance.now()
    const delta = now - this.lastFrameTime

    if (delta >= 1000) {
      const fps = (this.frameCount * 1000) / delta
      this.frameCount = 0
      this.lastFrameTime = now
      return Math.round(fps)
    }

    this.frameCount++
    return 60 // Default assumption
  }

  private calculateBandwidth(): number {
    if (this.bandwidthSamples.length === 0) return 0

    const sum = this.bandwidthSamples.reduce((a, b) => a + b, 0)
    return sum / this.bandwidthSamples.length
  }

  recordBandwidth(bytes: number) {
    this.bandwidthSamples.push(bytes)

    // Keep only recent samples
    if (this.bandwidthSamples.length > 10) {
      this.bandwidthSamples.shift()
    }
  }

  recordFrame() {
    this.frameCount++
  }
}
