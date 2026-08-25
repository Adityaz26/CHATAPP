import { useState } from "react";

export default function RoomLobby({ onCreateRoom, onJoinRoom, connecting, errorMessage }) {
  const [mode, setMode] = useState(null); // null | 'create' | 'join'
  const [username, setUsername] = useState("");
  const [roomId, setRoomId] = useState("");

  const handleCreate = () => {
    if (!username.trim()) return;
    onCreateRoom(username.trim());
  };

  const handleJoin = () => {
    if (!username.trim() || !roomId.trim()) return;
    onJoinRoom(username.trim(), roomId.trim());
  };

  const handlePrimaryAction = () => (mode === "create" ? handleCreate() : handleJoin());

  return (
    <div className="join-section">
      <p className="tagline">Real-time private conversations, simplified.</p>

      {!mode && (
        <div className="lobby-choice">
          <button className="lobby-choice-btn" onClick={() => setMode("create")}>
            Create Room
          </button>
          <button className="lobby-choice-btn secondary" onClick={() => setMode("join")}>
            Join Room
          </button>
        </div>
      )}

      {mode && (
        <div className="input-group">
          <input
            type="text"
            placeholder="Your name..."
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && mode === "create" && handlePrimaryAction()}
            disabled={connecting}
            autoFocus
          />

          {mode === "join" && (
            <input
              type="text"
              placeholder="Room ID (e.g. BC-7X4K9)"
              value={roomId}
              onChange={(e) => setRoomId(e.target.value.toUpperCase())}
              onKeyDown={(e) => e.key === "Enter" && handlePrimaryAction()}
              disabled={connecting}
            />
          )}

          {errorMessage && <div className="lobby-error">{errorMessage}</div>}

          <button onClick={handlePrimaryAction} disabled={connecting}>
            {connecting ? (
              <span className="spinner-wrap">
                <span className="spinner" />
                Connecting
              </span>
            ) : mode === "create" ? (
              "Create Room →"
            ) : (
              "Join Room →"
            )}
          </button>

          <button className="lobby-back" onClick={() => setMode(null)} disabled={connecting}>
            ← Back
          </button>
        </div>
      )}
    </div>
  );
}
