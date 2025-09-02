export interface RecordingFrame {
  timestamp: number
  type: "video" | "audio" | "interaction" | "cursor"
  data: any
}

export class SessionRecorder {
  private sessionId: string
  private isRecording = false
  private mediaRecorder: MediaRecorder | null = null
  private recordedChunks: Blob[] = []
  private interactionLog: RecordingFrame[] = []
  private startTime = 0

  constructor(sessionId: string) {
    this.sessionId = sessionId
  }

  async start(stream?: MediaStream) {
    if (this.isRecording) return

    this.isRecording = true
    this.startTime = Date.now()
    this.recordedChunks = []
    this.interactionLog = []

    if (stream) {
      try {
        this.mediaRecorder = new MediaRecorder(stream, {
          mimeType: "video/webm;codecs=vp9,opus",
          videoBitsPerSecond: 2500000,
          audioBitsPerSecond: 128000,
        })

        this.mediaRecorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            this.recordedChunks.push(event.data)
          }
        }

        this.mediaRecorder.onstop = () => {
          this.saveRecording()
        }

        this.mediaRecorder.start(1000) // 1-second chunks
        console.log("🎬 Video recording started")
      } catch (error) {
        console.error("Failed to start media recorder:", error)
      }
    }

    console.log("🎬 Session recording started:", this.sessionId)
  }

  stop() {
    if (!this.isRecording) return

    this.isRecording = false

    if (this.mediaRecorder && this.mediaRecorder.state !== "inactive") {
      this.mediaRecorder.stop()
    }

    console.log("⏹️ Session recording stopped")
  }

  recordInteraction(type: string, data: any) {
    if (!this.isRecording) return

    this.interactionLog.push({
      timestamp: Date.now() - this.startTime,
      type: "interaction",
      data: { type, ...data },
    })
  }

  recordCursor(position: { x: number; y: number }, userId: string) {
    if (!this.isRecording) return

    this.interactionLog.push({
      timestamp: Date.now() - this.startTime,
      type: "cursor",
      data: { position, userId },
    })
  }

  private async saveRecording() {
    if (this.recordedChunks.length === 0) return

    const videoBlob = new Blob(this.recordedChunks, { type: "video/webm" })
    const recording = {
      sessionId: this.sessionId,
      timestamp: this.startTime,
      duration: Date.now() - this.startTime,
      videoBlob,
      interactions: this.interactionLog,
      metadata: {
        userAgent: navigator.userAgent,
        resolution: `${screen.width}x${screen.height}`,
        recordingSize: videoBlob.size,
      },
    }

    try {
      await this.saveToIndexedDB(recording)
      console.log("💾 Recording saved successfully")
    } catch (error) {
      console.error("Failed to save recording:", error)
    }
  }

  private async saveToIndexedDB(recording: any): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("SessionRecordings", 1)

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        if (!db.objectStoreNames.contains("recordings")) {
          const store = db.createObjectStore("recordings", { keyPath: "sessionId" })
          store.createIndex("timestamp", "timestamp", { unique: false })
        }
      }

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        const transaction = db.transaction(["recordings"], "readwrite")
        const store = transaction.objectStore("recordings")

        const putRequest = store.put(recording)

        putRequest.onsuccess = () => resolve()
        putRequest.onerror = () => reject(putRequest.error)
      }

      request.onerror = () => reject(request.error)
    })
  }

  async getRecording(sessionId: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("SessionRecordings", 1)

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        const transaction = db.transaction(["recordings"], "readonly")
        const store = transaction.objectStore("recordings")
        const getRequest = store.get(sessionId)

        getRequest.onsuccess = () => resolve(getRequest.result)
        getRequest.onerror = () => reject(getRequest.error)
      }

      request.onerror = () => reject(request.error)
    })
  }

  async getAllRecordings(): Promise<any[]> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open("SessionRecordings", 1)

      request.onsuccess = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        const transaction = db.transaction(["recordings"], "readonly")
        const store = transaction.objectStore("recordings")
        const getAllRequest = store.getAll()

        getAllRequest.onsuccess = () => resolve(getAllRequest.result)
        getAllRequest.onerror = () => reject(getAllRequest.error)
      }

      request.onerror = () => reject(request.error)
    })
  }
}
