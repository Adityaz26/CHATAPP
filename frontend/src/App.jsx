import { useEffect } from "react";
import "./App.css";
import RoomLobby from "./components/RoomLobby";
import Chat from "./components/Chat";
import VideoCall from "./components/VideoCall";
import { useWebSocket } from "./hooks/useWebSocket";
import { useGroupCall } from "./hooks/useGroupCall";

function App() {
  const {
    connectionStatus,
    errorMessage,
    roomId,
    username,
    onlineUsers,
    messages,
    typingUsers,
    signal,
    clearSignal,
    createRoom,
    joinRoom,
    leaveRoom,
    sendChat,
    sendTyping,
    sendStopTyping,
    sendSignal,
  } = useWebSocket();

  const {
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
  } = useGroupCall({ signal, clearSignal, sendSignal });

  const joined = Boolean(roomId);
  const connecting = connectionStatus === "connecting";

  // auto-dismiss transient call error toasts
  useEffect(() => {
    if (!callError) return;
    const t = setTimeout(() => setCallError(""), 4000);
    return () => clearTimeout(t);
  }, [callError, setCallError]);

  const handleLeaveRoom = () => {
    if (inCall) leaveCall();
    leaveRoom();
  };

  return (
    <div className="app">
      <div className={`card ${joined ? "expanded" : ""}`}>
        <div className="brand">
          <span className="brand-dot" />
          <h1>BaatCheet</h1>
        </div>

        {!joined && (
          <RoomLobby
            onCreateRoom={createRoom}
            onJoinRoom={joinRoom}
            connecting={connecting}
            errorMessage={errorMessage}
          />
        )}

        {joined && (
          <Chat
            username={username}
            roomId={roomId}
            onlineUsers={onlineUsers}
            messages={messages}
            typingUsers={typingUsers}
            onSendChat={sendChat}
            onTyping={sendTyping}
            onStopTyping={sendStopTyping}
            onLeaveRoom={handleLeaveRoom}
            onJoinCall={joinCall}
            inCall={inCall}
          />
        )}
      </div>

      {joined && inCall && (
        <VideoCall
          username={username}
          localStream={localStream}
          remotePeers={remotePeers}
          micEnabled={micEnabled}
          camEnabled={camEnabled}
          onLeaveCall={leaveCall}
          onToggleMic={toggleMic}
          onToggleCam={toggleCam}
        />
      )}

      {callError && <div className="call-toast">{callError}</div>}
    </div>
  );
}

export default App;
