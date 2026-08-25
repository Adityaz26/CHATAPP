import LocalVideo from "./LocalVideo";
import RemoteVideo from "./RemoteVideo";

export default function VideoCall({
  username,
  localStream,
  remotePeers, // { [peerId]: { username, stream } }
  micEnabled,
  camEnabled,
  onLeaveCall,
  onToggleMic,
  onToggleCam,
}) {
  const peerEntries = Object.entries(remotePeers);
  const tileCount = peerEntries.length + 1;

  return (
    <div className="call-overlay call-active">
      <div className={`video-grid tiles-${Math.min(tileCount, 9)}`}>
        <div className="video-tile">
          <LocalVideo stream={localStream} className="tile-video local-mirror" />
          <span className="tile-label">{username} (you)</span>
        </div>

        {peerEntries.map(([peerId, peer]) => (
          <div className="video-tile" key={peerId}>
            {peer.stream ? (
              <RemoteVideo stream={peer.stream} className="tile-video" />
            ) : (
              <div className="tile-waiting">Connecting…</div>
            )}
            <span className="tile-label">{peer.username}</span>
          </div>
        ))}
      </div>

      <div className="call-meta">{tileCount} {tileCount === 1 ? "person" : "people"} on the call</div>

      <div className="call-controls">
        <button className={`control-btn ${!micEnabled ? "off" : ""}`} onClick={onToggleMic} title="Mute/Unmute">
          {micEnabled ? "🎤" : "🔇"}
        </button>
        <button className={`control-btn ${!camEnabled ? "off" : ""}`} onClick={onToggleCam} title="Camera on/off">
          {camEnabled ? "📹" : "🚫"}
        </button>
        <button className="control-btn end" onClick={onLeaveCall} title="Leave call">
          📞
        </button>
      </div>
    </div>
  );
}
