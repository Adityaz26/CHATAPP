import http from "http";
import crypto from "crypto";
import express from "express";
import { WebSocketServer, WebSocket } from "ws";

const app = express();

app.get("/", (req, res) => {
  res.send("Backend running");
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// ── Room state ──────────────────────────────────────────────
// roomId -> Set<ws>                       (everyone chatting in the room)
const rooms = new Map();
// roomId -> Set<ws>                       (subset of the room currently in the video call)
const callRooms = new Map();

const ROOM_ID_PREFIXES = ["BC", "BAAT"];
const ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars (0/O, 1/I)
const MAX_ROOM_SIZE = 12; // group room — bump further if you need bigger rooms

function randomSegment(length) {
  let out = "";
  for (let i = 0; i < length; i++) {
    out += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
  }
  return out;
}

function generateRoomId() {
  let id;
  do {
    const prefix = ROOM_ID_PREFIXES[Math.floor(Math.random() * ROOM_ID_PREFIXES.length)];
    id = `${prefix}-${randomSegment(5)}`;
  } while (rooms.has(id));
  return id;
}

function safeSend(ws, payload) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function getRoomUsers(roomId) {
  const room = rooms.get(roomId);
  if (!room) return [];
  return [...room]
    .filter((c) => c.readyState === WebSocket.OPEN && c.username)
    .map((c) => ({ id: c.id, username: c.username }));
}

function broadcastToRoom(roomId, message, exceptWs = null) {
  const room = rooms.get(roomId);
  if (!room) return;
  const payload = JSON.stringify(message);
  room.forEach((client) => {
    if (client !== exceptWs && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function broadcastToCall(roomId, message, exceptWs = null) {
  const callRoom = callRooms.get(roomId);
  if (!callRoom) return;
  const payload = JSON.stringify(message);
  callRoom.forEach((client) => {
    if (client !== exceptWs && client.readyState === WebSocket.OPEN) {
      client.send(payload);
    }
  });
}

function broadcastUserList(roomId) {
  const users = getRoomUsers(roomId);
  broadcastToRoom(roomId, { type: "user_list", roomId, users, count: users.length });
}

function removeFromCall(ws) {
  const { roomId, id } = ws;
  if (!roomId) return;
  const callRoom = callRooms.get(roomId);
  if (!callRoom || !callRoom.has(ws)) return;

  callRoom.delete(ws);
  broadcastToCall(roomId, { type: "peer-left", id }, ws);

  if (callRoom.size === 0) {
    callRooms.delete(roomId);
  }
}

function removeFromRoom(ws) {
  const { roomId, username } = ws;
  if (!roomId) return;
  const room = rooms.get(roomId);
  if (!room) return;

  removeFromCall(ws);
  room.delete(ws);

  if (username) {
    broadcastToRoom(roomId, {
      type: "system",
      text: `${username} left the room`,
      time: new Date().toLocaleTimeString(),
    });
    broadcastToRoom(roomId, { type: "stop_typing", username });
  }

  if (room.size === 0) {
    rooms.delete(roomId);
  } else {
    broadcastUserList(roomId);
  }

  ws.roomId = null;
  ws.username = null;
}

wss.on("connection", (ws) => {
  console.log("✅ WebSocket connected");
  ws.id = crypto.randomUUID();
  ws.username = null;
  ws.roomId = null;

  ws.on("message", (data) => {
    let msg;
    try {
      msg = JSON.parse(data.toString());
    } catch (err) {
      safeSend(ws, { type: "error", message: "Malformed message received." });
      return;
    }

    if (!msg || typeof msg.type !== "string") {
      safeSend(ws, { type: "error", message: "Invalid message format." });
      return;
    }

    switch (msg.type) {
      // ── Room lifecycle ──────────────────────────────────
      case "create-room": {
        const username = (msg.username || "").toString().trim().slice(0, 30);
        if (!username) {
          safeSend(ws, { type: "error", message: "A username is required." });
          return;
        }
        const roomId = generateRoomId();
        rooms.set(roomId, new Set([ws]));
        ws.username = username;
        ws.roomId = roomId;

        safeSend(ws, { type: "room-created", roomId, username, id: ws.id });
        broadcastUserList(roomId);
        break;
      }

      case "join-room": {
        const username = (msg.username || "").toString().trim().slice(0, 30);
        const roomId = (msg.roomId || "").toString().trim().toUpperCase();

        if (ws.roomId) {
          safeSend(ws, { type: "error", message: "You are already in a room." });
          return;
        }
        if (!username || !roomId) {
          safeSend(ws, { type: "error", message: "Username and Room ID are required." });
          return;
        }

        const room = rooms.get(roomId);
        if (!room) {
          safeSend(ws, { type: "error", message: "Room not found. Check the Room ID and try again." });
          return;
        }
        if (room.size >= MAX_ROOM_SIZE) {
          safeSend(ws, { type: "error", message: "This room is already full." });
          return;
        }
        if (getRoomUsers(roomId).some((u) => u.username === username)) {
          safeSend(ws, { type: "error", message: "That username is already taken in this room." });
          return;
        }

        room.add(ws);
        ws.username = username;
        ws.roomId = roomId;

        safeSend(ws, { type: "room-joined", roomId, username, id: ws.id });

        broadcastToRoom(
          roomId,
          {
            type: "system",
            text: `${username} joined the room`,
            time: new Date().toLocaleTimeString(),
          },
          ws
        );

        broadcastUserList(roomId);
        break;
      }

      case "leave-room": {
        removeFromRoom(ws);
        break;
      }

      // ── Chat / typing (existing behaviour, now room-scoped) ──
      case "typing":
      case "stop_typing": {
        if (!ws.roomId) return;
        broadcastToRoom(ws.roomId, { type: msg.type, username: ws.username }, ws);
        break;
      }

      case "chat": {
        if (!ws.roomId || !ws.username) return;
        const text = (msg.text || "").toString().slice(0, 2000);
        if (!text.trim()) return;
        broadcastToRoom(ws.roomId, {
          type: "chat",
          roomId: ws.roomId,
          username: ws.username,
          text,
          time: msg.time || new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        });
        break;
      }

      // ── Group video call — anyone in the room can join the same call ──
      case "join-call": {
        if (!ws.roomId || !ws.username) return;

        let callRoom = callRooms.get(ws.roomId);
        if (!callRoom) {
          callRoom = new Set();
          callRooms.set(ws.roomId, callRoom);
        }
        if (callRoom.has(ws)) return; // already in the call

        // Tell the newcomer who's already on the call — they'll initiate
        // an offer to each existing peer (avoids duplicate connections).
        const existingPeers = [...callRoom]
          .filter((c) => c.readyState === WebSocket.OPEN)
          .map((c) => ({ id: c.id, username: c.username }));

        callRoom.add(ws);

        safeSend(ws, { type: "call-peers", peers: existingPeers });
        broadcastToCall(ws.roomId, { type: "peer-joined", id: ws.id, username: ws.username }, ws);
        break;
      }

      case "leave-call": {
        removeFromCall(ws);
        break;
      }

      // ── WebRTC signaling — routed to one specific peer (mesh topology) ──
      case "webrtc-offer":
      case "webrtc-answer":
      case "ice-candidate": {
        if (!ws.roomId) return;
        const room = rooms.get(ws.roomId);
        if (!room) return;

        const targetId = (msg.to || "").toString();
        const target = [...room].find((c) => c.id === targetId);
        if (!target) return; // target already left — drop the message

        const { to, ...rest } = msg;
        safeSend(target, { ...rest, from: ws.id, fromUsername: ws.username });
        break;
      }

      default:
        // unknown message type — ignore silently
        break;
    }
  });

  ws.on("close", () => {
    removeFromRoom(ws);
    console.log("❌ WebSocket closed");
  });

  ws.on("error", () => {
    // swallow so a single bad socket can't crash the server
  });
});

const PORT = process.env.PORT || 4000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
