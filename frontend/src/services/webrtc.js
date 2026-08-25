export const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    // Add TURN server(s) here later if two peers can't connect directly, e.g.:
    // { urls: "turn:your-turn-server.com:3478", username: "user", credential: "pass" },
  ],
};

export function createPeerConnection({ onIceCandidate, onTrack, onConnectionStateChange }) {
  const pc = new RTCPeerConnection(ICE_SERVERS);

  pc.onicecandidate = (event) => {
    if (event.candidate) onIceCandidate?.(event.candidate);
  };

  pc.ontrack = (event) => {
    onTrack?.(event.streams[0]);
  };

  pc.onconnectionstatechange = () => {
    onConnectionStateChange?.(pc.connectionState);
  };

  return pc;
}

export async function getLocalStream() {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("unsupported");
  }
  return navigator.mediaDevices.getUserMedia({ video: true, audio: true });
}
