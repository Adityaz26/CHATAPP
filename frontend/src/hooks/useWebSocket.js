import { useCallback, useEffect, useRef, useState } from "react";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:4000";
const MAX_RECONNECT_ATTEMPTS = 6;

export function useWebSocket() {
  const socketRef = useRef(null);
  const [connectionStatus, setConnectionStatus] = useState("idle"); // idle | connecting | open | reconnecting | closed
  const [errorMessage, setErrorMessage] = useState("");

  const [roomId, setRoomId] = useState(null);
  const [username, setUsername] = useState("");
  const [myId, setMyId] = useState(null);
  const [onlineUsers, setOnlineUsers] = useState([]); // [{ id, username }]
  const [messages, setMessages] = useState([]);
  const [typingUsers, setTypingUsers] = useState([]);
  const [signal, setSignal] = useState(null); // last call/WebRTC related message

  const pendingActionRef = useRef(null); // { type: 'create' | 'join', username, roomId }
  const lastRoomRef = useRef(null); // { username, roomId } — kept so a dropped connection can silently rejoin
  const isLeavingRef = useRef(false); // true only when the user explicitly clicks "Leave Room"
  const isReconnectJoinRef = useRef(false); // true while the in-flight join is a silent reconnect, not a fresh one
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef(null);
  const connectRef = useRef(null); // holds the latest `connect`, so onclose can call it without a self-reference

  const send = useCallback((payload) => {
    const ws = socketRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
      return true;
    }
    return false;
  }, []);

  const connect = useCallback(() => {
    setConnectionStatus((s) => (s === "reconnecting" ? "reconnecting" : "connecting"));
    const ws = new WebSocket(WS_URL);
    socketRef.current = ws;

    ws.onopen = () => {
      reconnectAttemptsRef.current = 0;
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
        case "room-joined": {
          setRoomId(msg.roomId);
          setUsername(msg.username);
          setMyId(msg.id);
          lastRoomRef.current = { username: msg.username, roomId: msg.roomId };
          setErrorMessage("");

          if (isReconnectJoinRef.current) {
            isReconnectJoinRef.current = false;
            setMessages((prev) => [
              ...prev,
              { type: "system", text: "Reconnected.", time: new Date().toLocaleTimeString() },
            ]);
          } else {
            setMessages([]);
          }
          break;
        }

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
          // A reconnect attempt got rejected (room gone, etc.) — stop retrying and drop to the lobby.
          if (isReconnectJoinRef.current) {
            isReconnectJoinRef.current = false;
            lastRoomRef.current = null;
            reconnectAttemptsRef.current = 0;
            setConnectionStatus("closed");
            setRoomId(null);
            setMyId(null);
          }
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
      setOnlineUsers([]);
      setTypingUsers([]);

      if (isLeavingRef.current) {
        isLeavingRef.current = false;
        setConnectionStatus("closed");
        setRoomId(null);
        setMyId(null);
        lastRoomRef.current = null;
        return;
      }

      // Unexpected drop (idle timeout, backgrounded tab, brief network blip) —
      // try to silently reconnect and rejoin the same room instead of
      // bouncing the user back to the lobby.
      if (lastRoomRef.current) {
        if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          setConnectionStatus("closed");
          setErrorMessage("Lost connection to the server. Please rejoin the room.");
          setRoomId(null);
          setMyId(null);
          lastRoomRef.current = null;
          return;
        }

        const attempt = reconnectAttemptsRef.current;
        reconnectAttemptsRef.current += 1;
        setConnectionStatus("reconnecting");

        const delay = Math.min(1000 * 2 ** attempt, 8000);
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = setTimeout(() => {
          if (isLeavingRef.current || !lastRoomRef.current) return;
          isReconnectJoinRef.current = true;
          pendingActionRef.current = {
            type: "join",
            username: lastRoomRef.current.username,
            roomId: lastRoomRef.current.roomId,
          };
          connectRef.current?.();
        }, delay);
      } else {
        setConnectionStatus("closed");
      }
    };

    ws.onerror = () => {
      setErrorMessage("Couldn't reach the server. Check your connection and try again.");
    };

    return ws;
  }, []);

  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  // If the tab was backgrounded and the heartbeat still lost the connection,
  // reconnect immediately as soon as the tab is visible again rather than
  // waiting for the next scheduled retry.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== "visible") return;
      const ws = socketRef.current;
      const socketIsDead = !ws || ws.readyState === WebSocket.CLOSED || ws.readyState === WebSocket.CLOSING;
      if (socketIsDead && lastRoomRef.current && !isLeavingRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectAttemptsRef.current = 0;
        isReconnectJoinRef.current = true;
        pendingActionRef.current = {
          type: "join",
          username: lastRoomRef.current.username,
          roomId: lastRoomRef.current.roomId,
        };
        connectRef.current?.();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, []);

  const createRoom = useCallback(
    (user) => {
      setErrorMessage("");
      isLeavingRef.current = false;
      reconnectAttemptsRef.current = 0;
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        send({ type: "create-room", username: user });
      } else {
        pendingActionRef.current = { type: "create", username: user };
        connect();
      }
    },
    [send, connect]
  );

  const joinRoom = useCallback(
    (user, room) => {
      setErrorMessage("");
      isLeavingRef.current = false;
      reconnectAttemptsRef.current = 0;
      const roomId = room.trim().toUpperCase();
      if (socketRef.current?.readyState === WebSocket.OPEN) {
        send({ type: "join-room", username: user, roomId });
      } else {
        pendingActionRef.current = { type: "join", username: user, roomId };
        connect();
      }
    },
    [send, connect]
  );

  const leaveRoom = useCallback(() => {
    isLeavingRef.current = true;
    lastRoomRef.current = null;
    clearTimeout(reconnectTimeoutRef.current);
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
      clearTimeout(reconnectTimeoutRef.current);
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