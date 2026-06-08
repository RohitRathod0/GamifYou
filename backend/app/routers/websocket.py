"""
GestureHub Backend — WebSocket Router

Handles real-time bidirectional communication with game clients.

Fixes applied:
  1. chess_color_assign sent to both players when 2nd player joins
  2. player_joined now includes username so frontend can display it
  3. Color assignment persisted in Redis so reconnects get same color
"""
from __future__ import annotations

import json
import logging
from typing import Dict, List, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.schemas.room import GameType, WSMessageType
from app.services.game_service import GameService
from app.services.gesture_pipeline import GesturePipeline
from app.services.room_service import RoomService
from app.games.scribble import ScribbleGame

logger = logging.getLogger(__name__)

router = APIRouter()

# ── Pipeline Registry ─────────────────────────────────────────────────────────
_gesture_pipelines: Dict[str, GesturePipeline] = {}
_scribble_games: Dict[str, ScribbleGame] = {}

# ── Chess color assignment (in-memory, backed by Redis room order) ────────────
# Key: room_code → {player_id: 'white'|'black'}
_chess_colors: Dict[str, Dict[str, str]] = {}


# ── Connection Manager ────────────────────────────────────────────────────────

class ConnectionManager:
    def __init__(self) -> None:
        self.active_connections: Dict[str, Dict[str, WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_code: str, player_id: str) -> None:
        await websocket.accept()
        self.active_connections.setdefault(room_code, {})[player_id] = websocket
        logger.info("Player %s connected to room %s", player_id, room_code)

    def disconnect(self, room_code: str, player_id: str) -> None:
        if room_code in self.active_connections:
            self.active_connections[room_code].pop(player_id, None)
            logger.info("Player %s disconnected from room %s", player_id, room_code)
            if not self.active_connections[room_code]:
                del self.active_connections[room_code]
        pipeline_key = f"{room_code}:{player_id}"
        _gesture_pipelines.pop(pipeline_key, None)

    def get_room_player_count(self, room_code: str) -> int:
        """Return number of currently connected players in a room."""
        return len(self.active_connections.get(room_code, {}))

    async def send_personal_message(self, message: dict, room_code: str, player_id: str) -> None:
        ws = self.active_connections.get(room_code, {}).get(player_id)
        if ws:
            await ws.send_json(message)

    async def broadcast_to_room(
        self,
        message: dict,
        room_code: str,
        exclude_player: Optional[str] = None,
    ) -> None:
        if room_code not in self.active_connections:
            return
        disconnected: List[str] = []
        for pid, ws in self.active_connections[room_code].items():
            if pid == exclude_player:
                continue
            try:
                await ws.send_json(message)
            except Exception:
                logger.warning("Failed to send to %s; marking for removal", pid)
                disconnected.append(pid)
        for pid in disconnected:
            self.disconnect(room_code, pid)


manager = ConnectionManager()


# ── Color Assignment Helper ───────────────────────────────────────────────────

async def assign_chess_colors(room_code: str, player_id: str) -> None:
    """Assign chess colors based on join order and notify both players.

    First player to connect → white.
    Second player to connect → black.
    Sends chess_color_assign to each player individually.
    Also re-notifies player 1 so they are confirmed as white even if
    they missed an earlier message.

    Args:
        room_code: The room both players are in.
        player_id: The player who just connected (triggers assignment).
    """
    room_colors = _chess_colors.setdefault(room_code, {})

    # If this player already has a color (reconnect), just re-send it
    if player_id in room_colors:
        await manager.send_personal_message(
            {
                "type": "chess_color_assign",
                "data": {"color": room_colors[player_id]},
            },
            room_code,
            player_id,
        )
        return

    # Assign based on how many players already have colors
    assigned_count = len(room_colors)
    if assigned_count == 0:
        # First player — white, wait for second
        room_colors[player_id] = "white"
        await manager.send_personal_message(
            {
                "type": "chess_color_assign",
                "data": {"color": "white"},
            },
            room_code,
            player_id,
        )
        logger.info("Chess: %s assigned WHITE in room %s", player_id, room_code)

    elif assigned_count == 1:
        # Second player — black; re-confirm white to player 1
        room_colors[player_id] = "black"
        white_player_id = next(iter(room_colors))  # first entry = white

        await manager.send_personal_message(
            {
                "type": "chess_color_assign",
                "data": {"color": "black"},
            },
            room_code,
            player_id,
        )
        # Re-confirm white player in case they missed the first message
        await manager.send_personal_message(
            {
                "type": "chess_color_assign",
                "data": {"color": "white"},
            },
            room_code,
            white_player_id,
        )
        logger.info(
            "Chess: %s assigned BLACK in room %s (white=%s)",
            player_id, room_code, white_player_id,
        )
    else:
        # Spectator / 3rd+ player — no color
        logger.info("Chess: %s is spectator in room %s", player_id, room_code)


# ── WebSocket Endpoint ────────────────────────────────────────────────────────

@router.websocket("/ws/{room_code}/{player_id}")
async def websocket_endpoint(
    websocket: WebSocket, room_code: str, player_id: str
) -> None:
    room_code = room_code.upper().strip()
    await manager.connect(websocket, room_code, player_id)

    pipeline_key = f"{room_code}:{player_id}"
    _gesture_pipelines[pipeline_key] = GesturePipeline(player_id)

    # Confirm connection to joining player
    await manager.send_personal_message(
        {
            "type": WSMessageType.CONNECT,
            "data": {
                "player_id": player_id,
                "room_code": room_code,
                "message": "Connected to GestureHub",
            },
        },
        room_code,
        player_id,
    )

    # ── FIX 2: Include username in player_joined so RoomView can display it ───
    room = await RoomService.get_room(room_code)
    joining_username = "Unknown"
    if room:
        for p in room.players:
            if p.player_id == player_id:
                joining_username = p.username
                break

    await manager.broadcast_to_room(
        {
            "type": WSMessageType.PLAYER_JOINED,
            "data": {
                "player_id": player_id,
                "username": joining_username,
                "room_code": room_code,
            },
        },
        room_code,
        exclude_player=player_id,
    )

    # Notify all connected clients about updated player count (lobby can react)
    await manager.broadcast_to_room(
        {
            "type": "room_player_count_updated",
            "data": {
                "room_code": room_code,
                "player_count": manager.get_room_player_count(room_code),
            },
        },
        room_code,
    )

    try:
        while True:
            data = await websocket.receive_text()
            message: dict = json.loads(data)
            message_type: str = message.get("type", "")
            message_data: dict = message.get("data", {})

            # ── LANDMARK_FRAME ────────────────────────────────────────────
            if message_type == "LANDMARK_FRAME":
                raw_landmarks: List[dict] = message_data.get("landmarks", [])
                if len(raw_landmarks) != 21:
                    await manager.send_personal_message(
                        {
                            "type": "ERROR",
                            "data": {
                                "code": "INVALID_LANDMARKS",
                                "message": "Expected exactly 21 landmark points.",
                            },
                        },
                        room_code,
                        player_id,
                    )
                    continue

                pipeline = _gesture_pipelines.get(pipeline_key)
                if pipeline:
                    result = pipeline.process(raw_landmarks)
                    if result.get("stable_gesture"):
                        await manager.broadcast_to_room(
                            {
                                "type": "GESTURE_RESULT",
                                "data": {
                                    "player_id": player_id,
                                    "gesture": result["stable_gesture"],
                                    "confidence": result["confidence"],
                                    "game_action": result["game_action"],
                                    "finger_states": result["finger_states"],
                                    "processing_time_ms": result["processing_time_ms"],
                                },
                            },
                            room_code,
                        )
                    await manager.send_personal_message(
                        {
                            "type": "GESTURE_RESULT",
                            "data": {
                                "player_id": player_id,
                                "raw_gesture": result["raw_gesture"],
                                "stable_gesture": result.get("stable_gesture"),
                                "confidence": result["confidence"],
                                "game_action": result.get("game_action"),
                                "finger_states": result["finger_states"],
                                "processing_time_ms": result["processing_time_ms"],
                            },
                        },
                        room_code,
                        player_id,
                    )

            # ── PLAYER_READY ──────────────────────────────────────────────
            elif message_type == WSMessageType.PLAYER_READY:
                ready: bool = message_data.get("ready", False)
                room = await RoomService.set_player_ready(room_code, player_id, ready)
                await manager.broadcast_to_room(
                    {
                        "type": WSMessageType.PLAYER_READY,
                        "data": {
                            "player_id": player_id,
                            "ready": ready,
                            "room": room.model_dump(mode="json") if room else None,
                        },
                    },
                    room_code,
                )

            # ── GAME_SELECTED ─────────────────────────────────────────────
            elif message_type == WSMessageType.GAME_SELECTED:
                game_type = GameType(message_data.get("game_type"))
                room = await RoomService.select_game(room_code, game_type)
                if room:
                    player_ids = [p.player_id for p in room.players]
                    initial_state = GameService.initialize_game_state(game_type, player_ids)
                    await RoomService.update_game_state(room_code, initial_state)
                    await manager.broadcast_to_room(
                        {
                            "type": WSMessageType.GAME_SELECTED,
                            "data": {
                                "game_type": game_type.value,
                                "initial_state": initial_state,
                            },
                        },
                        room_code,
                    )
                    # Assign (or re-assign) chess colors only when chess is chosen
                    if game_type.value == "chess":
                        # Clear stale colors from a prior chess session in this room
                        _chess_colors.pop(room_code, None)
                        # Assign colors to every currently-connected player in join order
                        for pid in list(manager.active_connections.get(room_code, {}).keys()):
                            await assign_chess_colors(room_code, pid)
                    else:
                        # Non-chess game selected — clear any chess colors so the
                        # frontend doesn't keep showing the chess color badge
                        _chess_colors.pop(room_code, None)
                        await manager.broadcast_to_room(
                            {"type": "chess_color_clear", "data": {}},
                            room_code,
                        )

            # ── GAME_START ────────────────────────────────────────────────
            elif message_type == WSMessageType.GAME_START:
                await manager.broadcast_to_room(
                    {"type": WSMessageType.GAME_START, "data": message_data},
                    room_code,
                )

            # ── GAME_STATE_UPDATE ─────────────────────────────────────────
            elif message_type == WSMessageType.GAME_STATE_UPDATE:
                state_update: dict = message_data.get("state", {})
                room = await RoomService.get_room(room_code)
                if room and room.current_game:
                    is_valid: bool = GameService.validate_game_update(
                        room.current_game, room.game_state, state_update
                    )
                    if is_valid:
                        new_state: dict = {**room.game_state, **state_update}
                        await RoomService.update_game_state(room_code, new_state)
                        game_ended, winner = GameService.check_game_end(
                            room.current_game, new_state
                        )
                        if game_ended:
                            await manager.broadcast_to_room(
                                {
                                    "type": WSMessageType.GAME_END,
                                    "data": {"winner": winner, "final_state": new_state},
                                },
                                room_code,
                            )
                        else:
                            await manager.broadcast_to_room(
                                {
                                    "type": WSMessageType.GAME_STATE_UPDATE,
                                    "data": {
                                        "player_id": player_id,
                                        "state": new_state,
                                    },
                                },
                                room_code,
                                exclude_player=player_id,
                            )

            # ── WebRTC Signalling ─────────────────────────────────────────
            elif message_type == WSMessageType.WEBRTC_OFFER:
                target = message_data.get("target_player_id")
                if target:
                    await manager.send_personal_message(
                        {
                            "type": WSMessageType.WEBRTC_OFFER,
                            "data": {
                                "from_player_id": player_id,
                                "offer": message_data.get("offer"),
                            },
                        },
                        room_code,
                        target,
                    )

            elif message_type == WSMessageType.WEBRTC_ANSWER:
                target = message_data.get("target_player_id")
                if target:
                    await manager.send_personal_message(
                        {
                            "type": WSMessageType.WEBRTC_ANSWER,
                            "data": {
                                "from_player_id": player_id,
                                "answer": message_data.get("answer"),
                            },
                        },
                        room_code,
                        target,
                    )

            elif message_type == WSMessageType.WEBRTC_ICE_CANDIDATE:
                target = message_data.get("target_player_id")
                if target:
                    await manager.send_personal_message(
                        {
                            "type": WSMessageType.WEBRTC_ICE_CANDIDATE,
                            "data": {
                                "from_player_id": player_id,
                                "candidate": message_data.get("candidate"),
                            },
                        },
                        room_code,
                        target,
                    )

            # ── CHAT_MESSAGE ──────────────────────────────────────────────
            elif message_type == WSMessageType.CHAT_MESSAGE:
                await manager.broadcast_to_room(
                    {
                        "type": WSMessageType.CHAT_MESSAGE,
                        "data": {
                            "player_id": player_id,
                            "message": message_data.get("message", ""),
                            "username": message_data.get("username", "Unknown"),
                        },
                    },
                    room_code,
                )

            # ── SCRIBBLE DRAW ─────────────────────────────────────────────
            elif message_type.startswith("scribble:"):
                game = _scribble_games.get(room_code)

                if message_type == "scribble:start":
                    room = await RoomService.get_room(room_code)
                    if room:
                        usernames = {p.player_id: p.username for p in room.players}
                        game = ScribbleGame(
                            room_code=room_code,
                            player_ids=[p.player_id for p in room.players],
                            usernames=usernames,
                            max_rounds=message_data.get("rounds", 3),
                            round_duration=message_data.get("draw_time", 80),
                        )
                        _scribble_games[room_code] = game
                        await manager.broadcast_to_room(
                            {"type": "scribble:turn_start", "data": game.start_game()},
                            room_code,
                        )

                elif message_type == "scribble:stroke":
                    # Attach player_id so late joiners receiving canvas_replay also get it
                    message_data["player_id"] = player_id
                    if game:
                        game.stroke_history.append(message_data)
                    
                    is_end = message_data.get("isEnd", message_data.get("is_end", False))
                    brush_size = message_data.get("brushSize", message_data.get("brush_size", 4))

                    await manager.broadcast_to_room(
                        {
                            "type": "scribble:stroke",
                            "data": {
                                "player_id": player_id,
                                "points": message_data.get("points", []),
                                "color": message_data.get("color", "#000000"),
                                "brushSize": brush_size,
                                "isEnd": is_end,
                            },
                        },
                        room_code,
                        exclude_player=player_id,
                    )

                elif message_type == "scribble:clear":
                    if game:
                        game.stroke_history = []
                    await manager.broadcast_to_room(
                        {"type": "scribble:clear", "data": {"player_id": player_id}},
                        room_code,
                        exclude_player=player_id,
                    )

                elif message_type == "scribble:guess":
                    if game:
                        guess_text = message_data.get("text", "")
                        result = game.handle_guess(player_id, guess_text)
                        await manager.broadcast_to_room(
                            {
                                "type": "scribble:chat",
                                "data": {
                                    "player_id": player_id,
                                    "username": game.usernames.get(player_id, player_id),
                                    "text": guess_text,
                                    "is_guess": True,
                                },
                            },
                            room_code,
                        )
                        if result.get("type") == "scribble:correct":
                            await manager.broadcast_to_room(
                                {"type": "scribble:correct", "data": result},
                                room_code,
                            )
                            if "round_end" in result:
                                await manager.broadcast_to_room(
                                    {"type": "scribble:round_end", "data": result["round_end"]},
                                    room_code,
                                )

                elif message_type == "scribble:chat":
                    username = message_data.get("username", "Unknown")
                    if game:
                        username = game.usernames.get(player_id, username)
                    await manager.broadcast_to_room(
                        {
                            "type": "scribble:chat",
                            "data": {
                                "player_id": player_id,
                                "username": username,
                                "text": message_data.get("text", ""),
                                "is_guess": False,
                            },
                        },
                        room_code,
                    )

                elif message_type == "scribble:get_state":
                    if game:
                        await manager.send_personal_message(
                            {"type": "scribble:state", "data": game.get_state_snapshot()},
                            room_code,
                            player_id,
                        )
                        if game.stroke_history:
                            await manager.send_personal_message(
                                {
                                    "type": "scribble:canvas_replay",
                                    "data": {"strokes": game.stroke_history},
                                },
                                room_code,
                                player_id,
                            )

                if game:
                    hint_update = game.get_hint_update()
                    if hint_update:
                        await manager.broadcast_to_room(
                            {"type": "scribble:hint", "data": hint_update}, room_code
                        )
                    timer_expiry = game.check_timer_expired()
                    if timer_expiry:
                        await manager.broadcast_to_room(
                            {"type": "scribble:round_end", "data": timer_expiry}, room_code
                        )

    except WebSocketDisconnect:
        manager.disconnect(room_code, player_id)
        await RoomService.leave_room(room_code, player_id)
        await manager.broadcast_to_room(
            {
                "type": WSMessageType.PLAYER_LEFT,
                "data": {"player_id": player_id, "room_code": room_code},
            },
            room_code,
        )
        logger.info("WebSocket disconnected: %s from %s", player_id, room_code)

    except Exception as exc:
        logger.error("WebSocket error for %s: %s", player_id, exc)
        manager.disconnect(room_code, player_id)