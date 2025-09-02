import type { Logger } from "./logger"

export class InteractionTracker {
  private logger: Logger
  private lastMouseDown: { pos: { x: number; y: number }; button: number; timestamp: number } | null = null
  private dragThreshold = 10
  private clickTimeout = 500

  constructor(logger: Logger) {
    this.logger = logger
  }

  onMouseMove(pos: { x: number; y: number }) {
    this.logger.record(pos)
  }

  onMouseDown(pos: { x: number; y: number }, button: number) {
    this.lastMouseDown = {
      pos,
      button,
      timestamp: Date.now(),
    }
    console.log("🖱️ Mouse down:", pos, `button: ${button}`)
  }

  onMouseUp(pos: { x: number; y: number }) {
    if (!this.lastMouseDown) return

    const duration = Date.now() - this.lastMouseDown.timestamp
    const dx = pos.x - this.lastMouseDown.pos.x
    const dy = pos.y - this.lastMouseDown.pos.y
    const distance = Math.sqrt(dx * dx + dy * dy)

    if (distance > this.dragThreshold) {
      console.log(`🎯 Dragged ${Math.round(distance)}px in ${duration}ms`)
      this.logger.record(pos)
    } else if (duration < this.clickTimeout) {
      if (this.lastMouseDown.button === 2) {
        console.log("🖱️ Right click at", pos)
      } else {
        console.log("🖱️ Left click at", pos)
      }
      this.logger.record(pos)
    } else {
      console.log("🖱️ Long press at", pos)
      this.logger.record(pos)
    }

    this.lastMouseDown = null
  }

  onEnterKey(pos: { x: number; y: number }) {
    console.log("⏎ Enter pressed at", pos)
    this.logger.record(pos)
  }

  onKeyPress(key: string, pos: { x: number; y: number }) {
    console.log(`⌨️ Key pressed: ${key} at`, pos)
    this.logger.record(pos)
  }

  onTouchStart(touches: Array<{ x: number; y: number; id: number }>) {
    console.log("👆 Touch start:", touches)
    if (touches.length > 0) {
      this.logger.record(touches[0])
    }
  }

  onTouchMove(touches: Array<{ x: number; y: number; id: number }>) {
    if (touches.length > 0) {
      this.logger.record(touches[0])
    }
  }

  onTouchEnd(touches: Array<{ x: number; y: number; id: number }>) {
    console.log("👆 Touch end:", touches)
    if (touches.length > 0) {
      this.logger.record(touches[0])
    }
  }

  getInteractionHistory() {
    return this.logger.export()
  }

  clearHistory() {
    this.logger.clear()
  }
}
