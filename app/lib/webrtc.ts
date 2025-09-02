export const STUN_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
  { urls: "stun:stun3.l.google.com:19302" },
]

export function createPeer(): RTCPeerConnection {
  const config: RTCConfiguration = {
    iceServers: STUN_SERVERS,
    iceCandidatePoolSize: 10,
    bundlePolicy: "max-bundle",
    rtcpMuxPolicy: "require",
    iceTransportPolicy: "all",
  }

  const pc = new RTCPeerConnection(config)

  // Enable hardware acceleration if available
  pc.addEventListener("track", (event) => {
    const [stream] = event.streams
    if (stream) {
      // Optimize for low latency
      const videoTrack = stream.getVideoTracks()[0]
      if (videoTrack) {
        videoTrack.contentHint = "motion"
      }
    }
  })

  return pc
}

export function attachMediaTracks(pc: RTCPeerConnection, stream: MediaStream) {
  stream.getTracks().forEach((track) => {
    // Configure track for optimal performance
    if (track.kind === "video") {
      track.contentHint = "motion"
    }

    const sender = pc.addTrack(track, stream)

    // Configure encoding parameters for low latency
    if (track.kind === "video") {
      const params = sender.getParameters()
      if (params.encodings && params.encodings.length > 0) {
        params.encodings[0].priority = "high"
        params.encodings[0].networkPriority = "high"
        sender.setParameters(params)
      }
    }
  })
}

export async function makeOffer(pc: RTCPeerConnection): Promise<RTCSessionDescriptionInit> {
  const offer = await pc.createOffer({
    offerToReceiveAudio: false,
    offerToReceiveVideo: false,
    iceRestart: false,
  })

  await pc.setLocalDescription(offer)
  return offer
}

export async function applyAnswer(pc: RTCPeerConnection, answer: RTCSessionDescriptionInit) {
  await pc.setRemoteDescription(answer)
}

export function optimizeForLowLatency(pc: RTCPeerConnection) {
  // Additional optimizations can be added here
  pc.addEventListener("connectionstatechange", () => {
    console.log("Connection state:", pc.connectionState)
  })

  pc.addEventListener("iceconnectionstatechange", () => {
    console.log("ICE connection state:", pc.iceConnectionState)
  })
}
