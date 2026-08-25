# BaatCheet — Rooms + Group Video Call update

Room-based chat plus a **group** video call: any number of people who join
the same Room ID can hop into the same video call together (not just two).

## How the group call works

WebRTC connections are always one-to-one, so a group call is built as a
**full mesh**: every participant opens a direct `RTCPeerConnection` to every
other participant. The WebSocket server never touches video/audio — it only
relays small signaling messages (who's in the call, SDP offers/answers, ICE
candidates), each one addressed to a specific peer by their connection id.

```
Alice        Bob         Carol
  |<----------->|           (Alice ↔ Bob)
  |<------------------------>|  (Alice ↔ Carol)
              |<------------>|  (Bob ↔ Carol)
```

When someone clicks **Join Video Call**, the server tells them who's already
on the call; they open a connection + send an offer to each of those people.
Anyone who joins later just waits for an offer from the newcomer. This way
each pair only ever opens one connection, never two.

Mesh works well for a handful of people in a room. If you expect large
rooms (dozens of simultaneous video participants) you'd eventually want to
swap this for an SFU (e.g. LiveKit, mediasoup) instead of adding more direct
connections per person — that's a bigger change than this pass covers.

## What changed and why

**Backend — `backend/server.js`**
- Every socket gets a unique `id` (`crypto.randomUUID()`) in addition to its
  chat `username` — this is what lets signaling target one specific peer.
- `rooms`: `Map<roomId, Set<ws>>` — everyone chatting in a room (unchanged
  concept from before, just bumped `MAX_ROOM_SIZE` to 12 so more than 2
  people can share a room).
- `callRooms`: `Map<roomId, Set<ws>>` — the subset of a room's members who
  are *currently in the video call*. Room membership and call membership
  are tracked separately, so people can chat without being on camera.
- `join-call` — adds the socket to `callRooms`, replies with the list of
  existing participants (`call-peers`), and tells the existing participants
  someone new arrived (`peer-joined`).
- `leave-call` — removes the socket from `callRooms` and tells the remaining
  participants (`peer-left`). Also runs automatically on disconnect/leave-room.
- `webrtc-offer` / `webrtc-answer` / `ice-candidate` — now carry a `to` field
  (the target peer's id) and are relayed to *that one peer only*, not
  broadcast to the room. The server still never trusts a client-supplied
  `roomId` — routing is always based on the sender's own socket state.

**Frontend**
- `hooks/useWebSocket.js` — now also tracks your own peer `id`, and
  `onlineUsers` is a list of `{ id, username }` objects (needed since
  signaling addresses people by id, not username).
- `hooks/useGroupCall.js` (replaces the old 1-to-1 call hook) — owns one
  `RTCPeerConnection` per remote participant in a `Map`, and a
  `remotePeers` state object (`{ [peerId]: { username, stream } }`) that the
  video UI renders directly.
- `components/VideoCall.jsx` — now a responsive **grid of video tiles**
  (your camera + one tile per connected peer, each labeled with their name),
  instead of a single remote video + floating local preview.
- `components/Chat.jsx` — the video call button now reads **"Join Video
  Call"** and is only disabled once you're already in the call — no more
  "need at least 2 people" restriction, since you can join and simply wait
  for others.
- Everything else (chat, typing indicators, online users, room create/join)
  is unchanged from the previous pass.

## Folder structure

```
baatcheet/
├── backend/
│   ├── server.js
│   └── package.json
└── frontend/
    ├── src/
    │   ├── components/
    │   │   ├── Avatar.jsx
    │   │   ├── Chat.jsx
    │   │   ├── RoomLobby.jsx
    │   │   ├── VideoCall.jsx
    │   │   ├── LocalVideo.jsx
    │   │   └── RemoteVideo.jsx
    │   ├── hooks/
    │   │   ├── useWebSocket.js
    │   │   └── useGroupCall.js
    │   ├── services/
    │   │   └── webrtc.js
    │   ├── App.jsx
    │   ├── App.css
    │   ├── index.css
    │   └── main.jsx
    ├── index.html
    ├── vite.config.js
    ├── eslint.config.js
    ├── package.json
    └── .env.example
```

## Environment variables

Create `frontend/.env` (not committed) from the example:

```env
# local dev
VITE_WS_URL=ws://localhost:4000
```

For production, set the same variable in Vercel's project settings pointing
at your deployed backend, e.g.:

```env
VITE_WS_URL=wss://chatapp1-d6n9.onrender.com
```

Vite bakes `VITE_WS_URL` in at build time, so set it *before* deploying/building.

## Local testing

1. **Backend**
   ```bash
   cd backend
   npm install
   npm start
   # 🚀 Server running on port 4000
   ```

2. **Frontend**
   ```bash
   cd frontend
   npm install
   cp .env.example .env   # VITE_WS_URL=ws://localhost:4000
   npm run dev
   ```

3. Open the printed local URL in **three or more** browser windows/tabs
   (normal + incognito + a different browser works well, since rooms are
   per-connection).

## Testing a group call with several people

1. **Window A**: Create Room, note the Room ID (or click **Copy**).
2. **Windows B, C, D…**: Join Room with the same Room ID and a unique name
   each. Confirm the online count and sidebar list grows as each joins, and
   that chat messages reach everyone in the room.
3. In **any** window, click **🎥 Join Video Call** — you'll see your own
   tile appear, waiting for others.
4. In each of the other windows, also click **🎥 Join Video Call**. As each
   one joins, a new tile appears for them in every other window — everyone
   ends up seeing everyone else.
5. Test **🎤 Mute**, **📹 Camera**, and **📞 Leave Call** from any window —
   leaving should remove that person's tile everywhere else without
   disturbing the rest of the call.
6. Have one person click **Leave Room** entirely — confirm they're removed
   from both the chat sidebar and the call grid, and the room stays intact
   for everyone else. If everyone leaves, the room is deleted server-side.

To test across real, separate networks (not just tabs on one machine),
deploy both halves first and open the same Room ID on different devices.

## Production deployment

**Backend**: deploy `backend/` exactly as before (Render, Railway, etc.) —
only the code inside `server.js` changed, not the deployment process.

**Frontend (Vercel)**: set `VITE_WS_URL` to your backend's `wss://...` URL
in the Vercel project's environment variables, then redeploy.

If video connects for some pairs in a room but not others (offer/answer
succeeds, no video appears), that's usually a NAT traversal issue — add a
TURN server to `ICE_SERVERS` in `frontend/src/services/webrtc.js`, which is
already structured for a one-line addition.

## Notes / assumptions

- `MAX_ROOM_SIZE` in `server.js` is set to **12** — raise or lower it to fit
  how many people you expect to share one room.
- Usernames must be unique *within* a room, not globally.
- Since this is a mesh (not an SFU), each participant uploads their own
  video/audio once per other participant on the call — bandwidth use grows
  with the number of people, which is normal for mesh calls and the main
  reason mesh doesn't scale past small groups.
