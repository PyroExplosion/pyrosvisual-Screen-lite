export type LoggedFrame = {
  timestamp: number
  pos: { x: number; y: number }
  type?: "mouse" | "touch" | "key"
  data?: any
}

export class Logger {
  private frames: LoggedFrame[] = []
  private timezone: string
  private maxFrames = 10000 // Limit memory usage

  constructor(timezone = "UTC") {
    this.timezone = timezone
  }

  record(pos: { x: number; y: number }, type: "mouse" | "touch" | "key" = "mouse", data?: any) {
    const frame: LoggedFrame = {
      timestamp: Date.now(),
      pos,
      type,
      data,
    }

    this.frames.push(frame)

    // Limit memory usage
    if (this.frames.length > this.maxFrames) {
      this.frames = this.frames.slice(-this.maxFrames / 2)
    }
  }

  seek(time: number): LoggedFrame | null {
    const result = this.frames.filter((f) => f.timestamp <= time).sort((a, b) => b.timestamp - a.timestamp)[0]

    return result || null
  }

  getFramesInRange(startTime: number, endTime: number): LoggedFrame[] {
    return this.frames.filter((f) => f.timestamp >= startTime && f.timestamp <= endTime)
  }

  formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleTimeString("en-US", {
      timeZone: this.timezone,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      fractionalSecondDigits: 3,
    })
  }

  export(): LoggedFrame[] {
    return [...this.frames]
  }

  exportAsJSON(): string {
    return JSON.stringify(this.frames, null, 2)
  }

  importFromJSON(json: string) {
    try {
      const imported = JSON.parse(json) as LoggedFrame[]
      this.frames = imported
    } catch (error) {
      console.error("Failed to import frames:", error)
    }
  }

  clear() {
    this.frames = []
  }

  getStats() {
    return {
      totalFrames: this.frames.length,
      timespan: this.frames.length > 0 ? this.frames[this.frames.length - 1].timestamp - this.frames[0].timestamp : 0,
      memoryUsage: JSON.stringify(this.frames).length,
    }
  }
}
