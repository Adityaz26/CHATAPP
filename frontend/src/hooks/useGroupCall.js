import { useCallback, useEffect, useRef, useState } from "react";
import { createPeerConnection, getLocalStream } from "../services/webrtc";

/**
 * Drives a group video call using a full-mesh WebRTC topology: every
 * participant opens a direct RTCPeerConnection to every other participant.
 * The WebSocket server only relays signaling (join/leave notices, SDP
 * offers/answers, ICE candidates) — video/audio always flows peer-to-peer.
 *
 * Mesh scales fine for small groups (a handful of people). For larger
 * rooms you'd want to move to an SFU instead of adding more direct
 * connections per participant.
 */
export function useGroupCall({ signal, clearSignal, sendSignal }) {
  const [inCall, setInCall] = useState(false);
  const [localStream, setLocalStream] = useState(null);
  const [remotePeers, setRemotePeers] = useState({}); // { [peerId]: { username, stream } }
  const [callError, setCallError] = useState("");
  const [micEnabled, setMicEnabled] = useState(true);
  const [camEnabled, setCamEnabled] = useState(true);

  const localStreamRef = useRef(null);
  const pcsRef = useRef(new Map()); // peerId -> RTCPeerConnection
  const pendingCandidatesRef = useRef(new Map()); // peerId -> RTCIceCandidate[]

  const closePeer = useCallback((peerId) => {
    pcsRef.current.get(peerId)?.close();
    pcsRef.current.delete(peerId);
    pendingCandidatesRef.current.delete(peerId);
    setRemotePeers((prev) => {
      if (!(peerId in prev)) return prev;
      const next = { ...prev };
      delete next[peerId];
      return next;
    });
  }, []);

  const cleanupAll = useCallback(() => {
    pcsRef.current.forEach((pc) => pc.close());
    pcsRef.current.clear();
    pendingCandidatesRef.current.clear();
    localStreamRef.current?.getTracks().forEach((t) => t.stop());
    localStreamRef.current = null;
    setLocalStream(null);
    setRemotePeers({});
    setInCall(false);
    setMicEnabled(true);
    setCamEnabled(true);
  }, []);

  const createPcFor = useCallback(
    (peerId, peerUsername) => {
      const pc = createPeerConnection({
        onIceCandidate: (candidate) => sendSignal({ type: "ice-candidate", to: peerId, candidate }),
        onTrack: (stream) => {
          setRemotePeers((prev) => ({ ...prev, [peerId]: { username: peerUsername, stream } }));
        },
        onConnectionStateChange: (state) => {
          if (state === "failed" || state === "disconnected") closePeer(peerId);
        },
      });
      localStreamRef.current?.getTracks().forEach((t) => pc.addTrack(t, localStreamRef.current));
      pcsRef.current.set(peerId, pc);
      return pc;
    },
    [sendSignal, closePeer]
  );

  const acquireLocalMedia = useCallback(async () => {
    try {
      const stream = await getLocalStream();
      localStreamRef.current = stream;
      setLocalStream(stream);
      return stream;
    } catch (err) {
      if (err?.name === "NotAllowedError") {
        setCallError("Camera/microphone permission was denied.");
      } else if (err?.message === "unsupported") {
        setCallError("Your browser doesn't support video calls.");
      } else {
        setCallError("Couldn't access your camera or microphone.");
      }
      throw err;
    }
  }, []);

  const joinCall = useCallback(async () => {
    setCallError("");
    try {
      await acquireLocalMedia();
      setInCall(true);
      sendSignal({ type: "join-call" });
    } catch {
      // acquireLocalMedia already set a friendly error message
    }
  }, [acquireLocalMedia, sendSignal]);

  const leaveCall = useCallback(() => {
    sendSignal({ type: "leave-call" });
    cleanupAll();
  }, [sendSignal, cleanupAll]);

  const toggleMic = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getAudioTracks().forEach((t) => (t.enabled = !t.enabled));
    setMicEnabled((v) => !v);
  }, []);

  const toggleCam = useCallback(() => {
    const stream = localStreamRef.current;
    if (!stream) return;
    stream.getVideoTracks().forEach((t) => (t.enabled = !t.enabled));
    setCamEnabled((v) => !v);
  }, []);

  useEffect(() => {
    if (!signal) return;

    (async () => {
      switch (signal.type) {
        // Just joined — connect to everyone already on the call. We always
        // initiate here so each pair only opens one connection, not two.
        case "call-peers": {
          for (const peer of signal.peers || []) {
            const pc = createPcFor(peer.id, peer.username);
            try {
              const offer = await pc.createOffer();
              await pc.setLocalDescription(offer);
              sendSignal({ type: "webrtc-offer", to: peer.id, offer });
            } catch {
              closePeer(peer.id);
            }
          }
          break;
        }

        // Someone else joined after us — nothing to do yet, they'll send
        // us an offer once they've set up their side.
        case "peer-joined":
          break;

        case "peer-left":
          closePeer(signal.id);
          break;

        case "webrtc-offer": {
          const fromId = signal.from;
          let pc = pcsRef.current.get(fromId);
          if (!pc) pc = createPcFor(fromId, signal.fromUsername);
          await pc.setRemoteDescription(new RTCSessionDescription(signal.offer));
          const queued = pendingCandidatesRef.current.get(fromId) || [];
          for (const c of queued) await pc.addIceCandidate(c);
          pendingCandidatesRef.current.delete(fromId);
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          sendSignal({ type: "webrtc-answer", to: fromId, answer });
          break;
        }

        case "webrtc-answer": {
          const fromId = signal.from;
          const pc = pcsRef.current.get(fromId);
          if (!pc) break;
          await pc.setRemoteDescription(new RTCSessionDescription(signal.answer));
          const queued = pendingCandidatesRef.current.get(fromId) || [];
          for (const c of queued) await pc.addIceCandidate(c);
          pendingCandidatesRef.current.delete(fromId);
          break;
        }

        case "ice-candidate": {
          const fromId = signal.from;
          const candidate = new RTCIceCandidate(signal.candidate);
          const pc = pcsRef.current.get(fromId);
          if (pc && pc.remoteDescription) {
            await pc.addIceCandidate(candidate);
          } else {
            const queue = pendingCandidatesRef.current.get(fromId) || [];
            queue.push(candidate);
            pendingCandidatesRef.current.set(fromId, queue);
          }
          break;
        }

        default:
          break;
      }
      clearSignal();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signal]);

  useEffect(() => () => cleanupAll(), [cleanupAll]);

  return {
    inCall,
    localStream,
    remotePeers,
    callError,
    setCallError,
    micEnabled,
    camEnabled,
    joinCall,
    leaveCall,
    toggleMic,
    toggleCam,
  };
}
