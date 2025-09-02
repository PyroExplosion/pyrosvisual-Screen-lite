export interface KeyCombo {
  ctrl?: boolean
  alt?: boolean
  shift?: boolean
  meta?: boolean
}

export class InteractionManager {
  private sessionId: string
  private ws: WebSocket | null = null

  public onCursorUpdate?: (cursors: { [key: string]: { x: number; y: number; color: string } }) => void

  constructor(sessionId: string) {
    this.sessionId = sessionId
    this.initializeWebSocket()
  }

  private initializeWebSocket() {
    this.ws = new WebSocket("ws://localhost:8080")

    this.ws.onopen = () => {
      console.log("🎮 Interaction WebSocket connected")
      this.ws?.send(
        JSON.stringify({
          type: "interaction-ready",
          sessionId: this.sessionId,
        }),
      )
    }

    this.ws.onmessage = (event) => {
      const message = JSON.parse(event.data)
      this.handleMessage(message)
    }

    this.ws.onclose = () => {
      console.log("🎮 Interaction WebSocket disconnected")
      setTimeout(() => this.initializeWebSocket(), 3000)
    }
  }

  private handleMessage(message: any) {
    switch (message.type) {
      case "cursor-update":
        this.onCursorUpdate?.(message.cursors)
        break
    }
  }

  sendMouseMove(x: number, y: number) {
    this.ws?.send(
      JSON.stringify({
        type: "mouse-move",
        sessionId: this.sessionId,
        x,
        y,
        timestamp: Date.now(),
      }),
    )
  }

  sendMouseClick(x: number, y: number, button: number) {
    this.ws?.send(
      JSON.stringify({
        type: "mouse-click",
        sessionId: this.sessionId,
        x,
        y,
        button,
        timestamp: Date.now(),
      }),
    )
  }

  sendMouseWheel(x: number, y: number, deltaX: number, deltaY: number) {
    this.ws?.send(
      JSON.stringify({
        type: "mouse-wheel",
        sessionId: this.sessionId,
        x,
        y,
        deltaX,
        deltaY,
        timestamp: Date.now(),
      }),
    )
  }

  sendKeyDown(key: string, code: string, modifiers: KeyCombo = {}) {
    this.ws?.send(
      JSON.stringify({
        type: "key-down",
        sessionId: this.sessionId,
        key,
        code,
        modifiers,
        timestamp: Date.now(),
      }),
    )
  }

  sendKeyUp(key: string, code: string) {
    this.ws?.send(
      JSON.stringify({
        type: "key-up",
        sessionId: this.sessionId,
        key,
        code,
        timestamp: Date.now(),
      }),
    )
  }

  sendKeyCombo(keys: string[]) {
    this.ws?.send(
      JSON.stringify({
        type: "key-combo",
        sessionId: this.sessionId,
        keys,
        timestamp: Date.now(),
      }),
    )
  }

  sendTouchStart(touches: Array<{ x: number; y: number; id: number }>) {
    this.ws?.send(
      JSON.stringify({
        type: "touch-start",
        sessionId: this.sessionId,
        touches,
        timestamp: Date.now(),
      }),
    )
  }

  sendTouchMove(touches: Array<{ x: number; y: number; id: number }>) {
    this.ws?.send(
      JSON.stringify({
        type: "touch-move",
        sessionId: this.sessionId,
        touches,
        timestamp: Date.now(),
      }),
    )
  }

  sendTouchEnd(touches: Array<{ x: number; y: number; id: number }>) {
    this.ws?.send(
      JSON.stringify({
        type: "touch-end",
        sessionId: this.sessionId,
        touches,
        timestamp: Date.now(),
      }),
    )
  }

  cleanup() {
    this.ws?.close()
  }
}
