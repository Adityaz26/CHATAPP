import { useCallback, useEffect, useRef, useState } from "react";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:4000";

export function useWebSocket() {
  const socketRef = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState("idle"); // idle | connecting | open | closed
  const [errorMessage, setErrorMessage] = useState("");

  const [roomId, setRoomId] = useState(null);
  const [username, setUsername] = useState("");
  const [myId, setMyId] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]); // [{ id, username }]
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [signal, setSignal] = useState(null); // last call/WebRTC related message

  const pendingActionRef = useRef(null); // { type: 'create' | 'join', username, roomId }

  const send = useCallback((payload) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const ensureConnected = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      return socketRef.current;
    }

    setConnectionStatus("connecting");
    const ws = new WebSocket(WS_URL);
    socketRef.current = ws;

    ws.onopen = () => {
      setConnectionStatus("open");
      const action = pendingActionRef.current;
      pendingActionRef.current = null;
      if (action?.type === "create") {
        ws.send(JSON.stringify({ type: "create-room", username: action.username }));
      } else if (action?.type === "join") {
        ws.send(JSON.stringify({ type: "join-room", username: action.username, roomId: action.roomId }));
      }
    };

    ws.onmessage = (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }

      switch (msg.type) {
        case "room-created":
        case "room-joined":
          setRoomId(msg.roomId);
          setUsername(msg.username);
          setMyId(msg.id);
          setMessages([]);
          setErrorMessage("");
          break;

        case "user_list":
          setOnlineUsers(msg.users || []); // [{ id, username }]
          break;

        case "typing":
          setTypingUsers((prev) => (prev.includes(msg.username) ? prev : [...prev, msg.username]));
          break;

        case "stop_typing":
          setTypingUsers((prev) => prev.filter((u) => u !== msg.username));
          break;

        case "chat":
          setTypingUsers((prev) => prev.filter((u) => u !== msg.username));
          setMessages((prev) => [...prev, msg]);
          break;

        case "system":
          setMessages((prev) => [...prev, msg]);
          break;

        case "error":
          setErrorMessage(msg.message || "Something went wrong. Please try again.");
          break;

        case "call-peers":
        case "peer-joined":
        case "peer-left":
        case "webrtc-offer":
        case "webrtc-answer":
        case "ice-candidate":
          setSignal(msg);
          break;

        default:
          break;
      }
    };

    ws.onclose = () => {
      setConnectionStatus("closed");
      setRoomId(null);
      setMyId(null);
      setOnlineUsers([]);
      setTypingUsers([]);
    };

    ws.onerror = () => {
      setErrorMessage("Couldn't reach the server. Check your connection and try again.");
    };

    return ws;
  }, []);

  const createRoom = useCallback(
    (user) => {
      setErrorMessage("");
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        send({ type: "create-room", username: user });
      } else {
        pendingActionRef.current = { type: "create", username: user };
        ensureConnected();
      }
    },
    [send, ensureConnected]
  );

  const joinRoom = useCallback(
    (user, room) => {
      setErrorMessage("");
      const roomId = room.trim().toUpperCase();
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        send({ type: "join-room", username: user, roomId });
      } else {
        pendingActionRef.current = { type: "join", username: user, roomId };
        ensureConnected();
      }
    },
    [send, ensureConnected]
  );

  const leaveRoom = useCallback(() => {
    send({ type: "leave-room" });
    socketRef.current?.close();
    socketRef.current = null;
    setRoomId(null);
    setUsername("");
    setMyId(null);
    setMessages([]);
    setOnlineUsers([]);
    setTypingUsers([]);
    setConnectionStatus("idle");
  }, [send]);

  const sendChat = useCallback(
    (text) => {
      send({
        type: "chat",
        text,
        time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      });
    },
    [send]
  );

  const sendTyping = useCallback(() => send({ type: "typing", username }), [send, username]);
  const sendStopTyping = useCallback(() => send({ type: "stop_typing", username }), [send, username]);
  const sendSignal = useCallback((payload) => send(payload), [send]);

  useEffect(() => {
    return () => {
      socketRef.current?.close();
    };
  }, []);

  return {
    connectionStatus,
    errorMessage,
    setErrorMessage,
    roomId,
    username,
    myId,
    onlineUsers,
    messages,
    typingUsers,
    signal,
    clearSignal: () => setSignal(null),
    createRoom,
    joinRoom,
    leaveRoom,
    sendChat,
    sendTyping,
    sendStopTyping,
    sendSignal,
  };
}
