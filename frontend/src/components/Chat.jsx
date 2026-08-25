import { useEffect, useRef, useState } from "react";
import Avatar from "./Avatar";

export default function Chat({
  username,
  roomId,
  onlineUsers,
  messages,
  typingUsers,
  onSendChat,
  onTyping,
  onStopTyping,
  onLeaveRoom,
  onJoinCall,
  inCall,
}) {
  const [message, setMessage] = useState("");
  const [showUsers, setShowUsers] = useState(false);
  const [copied, setCopied] = useState(false);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const isTypingRef = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, typingUsers]);

  const handleMessageChange = (e) => {
    setMessage(e.target.value);
    if (!isTypingRef.current) {
      isTypingRef.current = true;
      onTyping();
    }
    clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => {
      isTypingRef.current = false;
      onStopTyping();
    }, 1500);
  };

  const handleSend = () => {
    if (!message.trim()) return;
    clearTimeout(typingTimeoutRef.current);
    isTypingRef.current = false;
    onStopTyping();
    onSendChat(message.trim());
    setMessage("");
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter") handleSend();
  };

  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API unavailable (e.g. insecure context) — fail silently
    }
  };

  const typingText = () => {
    if (!typingUsers.length) return null;
    if (typingUsers.length === 1) return `${typingUsers[0]} is typing`;
    if (typingUsers.length === 2) return `${typingUsers[0]} and ${typingUsers[1]} are typing`;
    return `${typingUsers[0]} and ${typingUsers.length - 1} others are typing`;
  };

  return (
    <div className="chat-layout">
      {/* Users sidebar */}
      <div className={`users-sidebar ${showUsers ? "open" : ""}`}>
        <div className="users-sidebar-header">
          <span>Online</span>
          <button className="sidebar-close" onClick={() => setShowUsers(false)}>
            ✕
          </button>
        </div>
        <div className="users-list">
          {onlineUsers.map((u) => (
            <div key={u.id} className={`user-item ${u.username === username ? "me" : ""}`}>
              <Avatar name={u.username} size={32} />
              <div className="user-item-info">
                <span className="user-item-name">
                  {u.username}
                  {u.username === username && " (you)"}
                </span>
                {typingUsers.includes(u.username) && <span className="user-item-typing">typing...</span>}
              </div>
              <span className="user-item-dot" />
            </div>
          ))}
        </div>
      </div>

      {/* Main chat area */}
      <div className="chat-main">
        <div className="chat-header">
          <div className="user-badge">
            <span className="online-dot" />
            <span>{username}</span>
          </div>
          <div className="room-info">
            <span className="room-label" title="Room ID">
              Room: {roomId}
            </span>
            <button className="copy-btn" onClick={copyRoomId} title="Copy Room ID">
              {copied ? "Copied!" : "Copy"}
            </button>
            <button className="users-toggle" onClick={() => setShowUsers((v) => !v)} title="Online users">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
              </svg>
              <span className="users-toggle-count">{onlineUsers.length}</span>
            </button>
          </div>
        </div>

        <div className="messages">
          {messages.length === 0 && <div className="empty-state">No messages yet. Say hi! 👋</div>}
          {messages.map((msg, index) => (
            <div
              key={index}
              className={
                msg.type === "system" ? "msg system" : msg.username === username ? "msg own" : "msg other"
              }
            >
              {msg.type === "chat" ? (
                <>
                  {msg.username !== username && <Avatar name={msg.username} size={30} />}
                  <div className="bubble-wrap">
                    {msg.username !== username && <div className="meta">{msg.username}</div>}
                    <div className="bubble">{msg.text}</div>
                    <div className="time">{msg.time}</div>
                  </div>
                </>
              ) : (
                <div className="system-text">
                  {msg.text}
                  {msg.time && <span className="sys-time"> · {msg.time}</span>}
                </div>
              )}
            </div>
          ))}

          {typingUsers.length > 0 && (
            <div className="typing-indicator">
              <div className="typing-dots">
                <span />
                <span />
                <span />
              </div>
              <span className="typing-text">{typingText()}</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="input-row">
          <input
            type="text"
            placeholder="Type something..."
            value={message}
            onChange={handleMessageChange}
            onKeyDown={handleKeyDown}
            autoFocus
          />
          <button onClick={handleSend} disabled={!message.trim()}>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              width="18"
              height="18"
            >
              <line x1="22" y1="2" x2="11" y2="13" />
              <polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
        </div>

        <div className="room-actions">
          <button className="video-call-btn" onClick={onJoinCall} disabled={inCall}>
            {inCall ? "📹 In Call" : "🎥 Join Video Call"}
          </button>
          <button className="leave-room-btn" onClick={onLeaveRoom}>
            Leave Room
          </button>
        </div>
      </div>
    </div>
  );
}
