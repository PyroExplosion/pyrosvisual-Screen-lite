export interface PlaybackFrame {
  timestamp: number
  videoData?: Blob
  interactionData?: any
}

export class SessionPlayer {
  private sessionId: string
  private isPlaying = false
  private currentTime = 0
  private duration = 0
  private playbackRate = 1
  private frames: PlaybackFrame[] = []

  public onProgressUpdate?: (progress: number) => void
  public onFrameUpdate?: (frame: PlaybackFrame) => void

  constructor(sessionId: string) {
    this.sessionId = sessionId
  }

  async loadSession(): Promise<number> {
    try {
      const recording = await this.getRecordingFromStorage(this.sessionId)
      if (!recording) {
        throw new Error("Recording not found")
      }

      this.duration = recording.duration
      this.frames = this.processRecording(recording)

      console.log("📼 Session loaded:", this.sessionId, "Duration:", this.duration)
      return this.duration
    } catch (error) {
      console.error("Failed to load session:", error)
      throw error
    }
  }

  private async getRecordingFromStorage(sessionId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("SessionRecordings", 1)

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        const transaction = db.transaction(["recordings"], "readonly")
        const store = transaction.objectStore("recordings")
        const getRequest = store.get(sessionId)

        getRequest.onsuccess = () => {
          resolve(getRequest.result)
        }

        getRequest.onerror = () => {
          reject(getRequest.error)
        }
      }

      request.onerror = () => {
        reject(request.error)
      }
    })
  }

  private processRecording(recording: any): PlaybackFrame[] {
    const frames: PlaybackFrame[] = []

    // Process video frames
    if (recording.videoBlob) {
      frames.push({
        timestamp: recording.timestamp,
        videoData: recording.videoBlob,
      })
    }

    // Process interaction frames
    recording.interactions?.forEach((interaction: any) => {
      frames.push({
        timestamp: interaction.timestamp,
        interactionData: interaction.data,
      })
    })

    return frames.sort((a, b) => a.timestamp - b.timestamp)
  }

  play() {
    if (this.isPlaying || this.frames.length === 0) return

    this.isPlaying = true
    this.startPlayback()
    console.log("▶️ Playback started")
  }

  pause() {
    this.isPlaying = false
    console.log("⏸️ Playback paused")
  }

  stop() {
    this.isPlaying = false
    this.currentTime = 0
    console.log("⏹️ Playback stopped")
  }

  seek(time: number) {
    this.currentTime = Math.max(0, Math.min(time, this.duration))

    // Find the appropriate frame
    const frame = this.frames.find((f) => f.timestamp >= this.currentTime) || this.frames[this.frames.length - 1]

    if (frame) {
      this.onFrameUpdate?.(frame)
    }

    this.onProgressUpdate?.(this.currentTime)
  }

  setPlaybackRate(rate: number) {
    this.playbackRate = Math.max(0.25, Math.min(4, rate))
  }

  private startPlayback() {
    const startTime = Date.now()
    const initialCurrentTime = this.currentTime

    const playbackLoop = () => {
      if (!this.isPlaying) return

      const elapsed = (Date.now() - startTime) * this.playbackRate
      this.currentTime = initialCurrentTime + elapsed

      if (this.currentTime >= this.duration) {
        this.stop()
        return
      }

      // Find frames to play at current time
      const currentFrames = this.frames.filter(
        (f) => f.timestamp <= this.currentTime && f.timestamp > this.currentTime - 100, // 100ms window
      )

      currentFrames.forEach((frame) => {
        this.onFrameUpdate?.(frame)
      })

      this.onProgressUpdate?.(this.currentTime)

      requestAnimationFrame(playbackLoop)
    }

    requestAnimationFrame(playbackLoop)
  }

  getCurrentTime(): number {
    return this.currentTime
  }

  getDuration(): number {
    return this.duration
  }

  isCurrentlyPlaying(): boolean {
    return this.isPlaying
  }
}
