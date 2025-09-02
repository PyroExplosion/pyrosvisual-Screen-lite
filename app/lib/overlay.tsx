"use client"

import { useEffect, useState } from "react"

type OverlayProps = {
  message: string
  timeout?: number
  type?: "info" | "success" | "warning" | "error"
}

export default function Overlay({ message, timeout = 3000, type = "info" }: OverlayProps) {
  const [visible, setVisible] = useState(true)

  useEffect(() => {
    const timer = setTimeout(() => setVisible(false), timeout)
    return () => clearTimeout(timer)
  }, [timeout])

  if (!visible) return null

  const getTypeStyles = () => {
    switch (type) {
      case "success":
        return "bg-green-600/90 border-green-500"
      case "warning":
        return "bg-yellow-600/90 border-yellow-500"
      case "error":
        return "bg-red-600/90 border-red-500"
      default:
        return "bg-slate-800/90 border-slate-600"
    }
  }

  return (
    <div
      className={`fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 rounded-lg border text-white font-medium shadow-lg transition-all duration-300 ${getTypeStyles()}`}
    >
      {message}
    </div>
  )
}
