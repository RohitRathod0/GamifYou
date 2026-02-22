# ADR-001: Browser-side Landmark Extraction vs Server-side Full CV

**Status:** Accepted  
**Date:** 2026-02-22  
**Context:** GestureHub needs to process webcam video from each player to control games.

---

## Decision

MediaPipe Hands runs **in the browser** via WebAssembly.  
The server receives only the 21 normalised 3D keypoints (not raw video).

---

## Rationale

| Factor | Client-side Extraction | Server-side Full CV |
|--------|----------------------|---------------------|
| **Bandwidth** | 252 bytes/frame (21 × 3 floats) | ~3 MB/frame (raw 1080p) |
| **Latency** | ~3ms WASM inference | ~150ms round-trip + GPU queue |
| **Privacy** | Raw video never leaves device | Raw video traverses network |
| **Server cost** | Zero GPU required | GPU instance ~$100/mo |
| **Spoofability** | Landmarks could be fabricated | Harder to spoof raw video |

### Why bandwidth wins the argument

At 60fps with 6 players:
- Client-side: 6 × 252 B × 60 = **~90 KB/s** total
- Server-side: 6 × 3 MB × 60 = **~1 GB/s** — impossible on free tier

### Anti-spoofing

The server-side gesture classifier validates plausibility (anatomically impossible configurations are rejected). Future work: server-side confidence threshold could require multiple corroborating frames before accepting any input.

---

## Consequences

- ✅ Free hosting tier supports 6+ concurrent players
- ✅ 60fps hand tracking in-browser with zero server GPU cost
- ✅ User privacy preserved
- ⚠️ Client-side code less auditable (mitigated by server-side validation)
- ⚠️ WASM requires secure context (HTTPS) in production
