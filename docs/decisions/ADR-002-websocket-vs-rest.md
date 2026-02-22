# ADR-002: WebSocket vs REST for Landmark Streaming

**Status:** Accepted  
**Date:** 2026-02-22  
**Context:** Players generate ~60 landmark frames per second that must reach the server.

---

## Decision

**WebSocket** is used for all real-time game data: landmark frames, gesture results, game state updates, and WebRTC signalling.

REST (`/api/cv/*`) is used **only** for one-shot queries and post-session analytics.

---

## Rationale

At 60fps, each player sends 60 messages/second. REST has prohibitive overhead:

| Cost | WebSocket | REST (HTTP/1.1) |
|------|-----------|-----------------|
| Connection setup | Once per session | Per request (~3 RTTs) |
| Headers | ~few bytes | ~400-800 bytes every request |
| Total overhead/min | ~KB | ~3 MB per player |
| Server connections | 1 persistent | 60 new connections/sec |

### Why not HTTP/2 streaming?

HTTP/2 Push exists but:
1. Requires additional server config
2. WebSocket is the established standard for game networking
3. FastAPI WebSocket support is first-class with `receive_text()` / `send_json()`

---

## Consequences

- ✅ Persistent connection eliminates per-frame TCP handshake overhead
- ✅ Full-duplex: server can push gesture results without client polling
- ✅ Native support in React (`useRef` WebSocket + reconnect pattern)
- ⚠️ Sticky sessions required for load balancing at scale (consistent hash on room_code)
- ⚠️ WebSocket uses `ws://` locally and must use `wss://` in production (HTTPS)
