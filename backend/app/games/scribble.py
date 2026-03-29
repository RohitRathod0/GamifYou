"""
ScribbleGame — Server-side state machine for the Finger-Draw Scribble game.

Handles:
  - Turn rotation (drawer cycling through all players)
  - Word selection per turn
  - Guess validation with fuzzy matching
  - Score calculation (time-based + position-based)
  - Progressive word hint reveal
  - Phase transitions: waiting → drawing → round_end → game_over
"""
from __future__ import annotations

import random
import time
from difflib import SequenceMatcher
from typing import Dict, List, Literal, Optional, Set

# ── Word Bank ─────────────────────────────────────────────────────────────────

WORD_BANK: Dict[str, List[str]] = {
    "easy": [
        "cat", "dog", "sun", "tree", "house", "apple", "fish", "bird",
        "car", "hat", "ball", "star", "moon", "boat", "cake", "door",
        "key", "eye", "ear", "hand", "foot", "book", "pen", "cup",
        "bed", "lamp", "fan", "egg", "bag", "box",
    ],
    "medium": [
        "guitar", "bicycle", "elephant", "volcano", "rainbow", "castle",
        "umbrella", "diamond", "rocket", "balloon", "camera", "compass",
        "dragon", "feather", "glasses", "hammer", "island", "jungle",
        "kangaroo", "lantern", "magnet", "noodles", "octopus", "penguin",
        "pyramid", "scissors", "tornado", "village", "walrus", "xylophone",
    ],
    "hard": [
        "democracy", "spaghetti", "telescope", "parachute", "saxophone",
        "anniversary", "caterpillar", "constellation", "encyclopedia",
        "footprint", "guillotine", "hibernation", "illuminati", "jurisdiction",
        "kaleidoscope", "labyrinth", "metamorphosis", "navigation", "observatory",
        "philosophy", "quarantine", "renaissance", "superintendent", "thunderstorm",
        "unbelievable", "vaccination", "wilderness", "xenophobia", "yellowstone",
    ],
}

ALL_WORDS: List[str] = [w for words in WORD_BANK.values() for w in words]


def _pick_word() -> str:
    return random.choice(ALL_WORDS)


def _fuzzy_match(guess: str, word: str, threshold: float = 0.85) -> bool:
    """Return True if guess is close enough to word (case-insensitive)."""
    g = guess.strip().lower()
    w = word.strip().lower()
    if g == w:
        return True
    ratio = SequenceMatcher(None, g, w).ratio()
    return ratio >= threshold


def _make_hint(word: str, revealed: Set[int]) -> str:
    """Return word as underscores with revealed letters shown."""
    return " ".join(c if i in revealed else ("_" if c != " " else " ") for i, c in enumerate(word))


# ── State Machine ─────────────────────────────────────────────────────────────


class ScribbleGame:
    """Server-side Scribble game state machine.

    One instance per active room. Managed by the WS router.
    """

    def __init__(
        self,
        room_code: str,
        player_ids: List[str],
        usernames: Dict[str, str],
        max_rounds: int = 3,
        round_duration: int = 80,
    ) -> None:
        self.room_code = room_code
        self.player_ids: List[str] = list(player_ids)
        self.usernames: Dict[str, str] = usernames  # player_id → username
        self.max_rounds = max_rounds
        self.round_duration = round_duration

        # Mutable state
        self.current_drawer_index: int = 0
        self.current_word: str = ""
        self.round_number: int = 0
        self.scores: Dict[str, int] = {pid: 0 for pid in player_ids}
        self.guessed_correctly: Set[str] = set()
        self.phase: Literal["waiting", "drawing", "round_end", "game_over"] = "waiting"
        self.round_start_time: float = 0.0

        # Progressive hint state
        self._revealed_indices: Set[int] = set()
        self._last_reveal_time: float = 0.0
        self._next_reveal_time: float = 0.0

        # Stroke history for late-joiners (in-memory)
        self.stroke_history: List[dict] = []

    # ── Properties ────────────────────────────────────────────────────────────

    @property
    def current_drawer_id(self) -> str:
        return self.player_ids[self.current_drawer_index % len(self.player_ids)]

    @property
    def time_remaining(self) -> float:
        if self.phase != "drawing":
            return 0.0
        elapsed = time.time() - self.round_start_time
        return max(0.0, self.round_duration - elapsed)

    @property
    def word_hint(self) -> str:
        return _make_hint(self.current_word, self._revealed_indices)

    # ── Public API ────────────────────────────────────────────────────────────

    def start_game(self) -> dict:
        """Start the game from the waiting phase. Returns the first turn payload."""
        self.round_number = 1
        self.current_drawer_index = 0
        self.scores = {pid: 0 for pid in self.player_ids}
        return self._begin_turn()

    def get_hint_update(self) -> Optional[dict]:
        """Call this periodically (on any message) to check if a new letter should be revealed.

        Returns a hint-update payload if a new letter was revealed, else None.
        """
        if self.phase != "drawing" or not self.current_word:
            return None
        now = time.time()
        if now >= self._next_reveal_time:
            self._reveal_next_letter()
            self._schedule_next_reveal()
            return {
                "type": "scribble:hint",
                "word_hint": self.word_hint,
                "time_left": round(self.time_remaining, 1),
            }
        return None

    def handle_guess(self, player_id: str, text: str) -> dict:
        """Process a player's guess. Returns a result payload.

        Possible result types:
          - scribble:wrong  — incorrect guess
          - scribble:correct — correct guess (includes points awarded)
          - scribble:already_guessed — player already got it right this round
          - scribble:round_end — all guessers correct or timer expired
        """
        if self.phase != "drawing":
            return {"type": "scribble:error", "message": "Not in drawing phase"}

        if player_id == self.current_drawer_id:
            return {"type": "scribble:error", "message": "Drawer cannot guess"}

        if player_id in self.guessed_correctly:
            return {"type": "scribble:already_guessed", "player_id": player_id}

        # Timer expired?
        if self.time_remaining <= 0:
            return self._end_round()

        if _fuzzy_match(text, self.current_word):
            pts = self._calculate_points()
            self.scores[player_id] = self.scores.get(player_id, 0) + pts
            self.guessed_correctly.add(player_id)

            # Drawer bonus
            drawer_bonus = 20
            self.scores[self.current_drawer_id] = (
                self.scores.get(self.current_drawer_id, 0) + drawer_bonus
            )

            result: dict = {
                "type": "scribble:correct",
                "player_id": player_id,
                "username": self.usernames.get(player_id, player_id),
                "points_awarded": pts,
                "drawer_bonus": drawer_bonus,
                "scores": dict(self.scores),
                "time_left": round(self.time_remaining, 1),
            }

            # Check if all non-drawers guessed correctly
            non_drawers = [pid for pid in self.player_ids if pid != self.current_drawer_id]
            if all(pid in self.guessed_correctly for pid in non_drawers):
                round_end = self._end_round()
                result["round_end"] = round_end

            return result

        return {
            "type": "scribble:wrong",
            "player_id": player_id,
            "text": text,
        }

    def check_timer_expired(self) -> Optional[dict]:
        """Call this on incoming messages to detect timer expiry. Returns round_end payload or None."""
        if self.phase == "drawing" and self.time_remaining <= 0:
            return self._end_round()
        return None

    def get_state_snapshot(self) -> dict:
        """Full state for sync messages (used on start / re-join)."""
        return {
            "type": "scribble:state",
            "phase": self.phase,
            "drawer_id": self.current_drawer_id,
            "word_hint": self.word_hint,
            "scores": dict(self.scores),
            "time_left": round(self.time_remaining, 1),
            "round_number": self.round_number,
            "max_rounds": self.max_rounds,
            "usernames": dict(self.usernames),
        }

    # ── Private Helpers ───────────────────────────────────────────────────────

    def _begin_turn(self) -> dict:
        """Initialise state for the current drawer's turn."""
        self.current_word = _pick_word()
        self.guessed_correctly = set()
        self.phase = "drawing"
        self.round_start_time = time.time()
        self.stroke_history = []

        # Hint reveal schedule
        self._revealed_indices = set()
        self._last_reveal_time = self.round_start_time
        self._schedule_next_reveal()

        return {
            "type": "scribble:turn_start",
            "drawer_id": self.current_drawer_id,
            "drawer_username": self.usernames.get(self.current_drawer_id, self.current_drawer_id),
            "round_number": self.round_number,
            "max_rounds": self.max_rounds,
            "round_duration": self.round_duration,
            "word_length": len(self.current_word),
            "word_hint": self.word_hint,
            "scores": dict(self.scores),
        }

    def _end_round(self) -> dict:
        """Transition to round_end. Advance to next turn or end game."""
        self.phase = "round_end"
        payload: dict = {
            "type": "scribble:round_end",
            "word": self.current_word,
            "scores": dict(self.scores),
            "round_number": self.round_number,
        }

        # Advance
        self.current_drawer_index += 1
        total_turns = self.max_rounds * len(self.player_ids)
        turns_done = (self.round_number - 1) * len(self.player_ids) + (
            self.current_drawer_index
        )

        if self.current_drawer_index >= len(self.player_ids):
            # Completed one full round of all players
            self.current_drawer_index = 0
            self.round_number += 1

        if self.round_number > self.max_rounds or turns_done >= total_turns:
            payload["game_over"] = self._end_game()
        else:
            payload["next_drawer_id"] = self.current_drawer_id
            payload["next_drawer_username"] = self.usernames.get(
                self.current_drawer_id, self.current_drawer_id
            )
            payload["next_turn"] = self._begin_turn()

        return payload

    def _end_game(self) -> dict:
        """Compute final scores and winner."""
        self.phase = "game_over"
        winner_id = max(self.scores, key=lambda pid: self.scores[pid]) if self.scores else None
        return {
            "type": "scribble:game_over",
            "final_scores": dict(self.scores),
            "winner_id": winner_id,
            "winner_username": self.usernames.get(winner_id, winner_id) if winner_id else None,
        }

    def _calculate_points(self) -> int:
        """Score based on speed and how many have already guessed."""
        time_ratio = self.time_remaining / self.round_duration
        time_bonus = round(time_ratio * 100)
        position_penalty = len(self.guessed_correctly) * 50
        base = 500
        return max(100, base - position_penalty + time_bonus)

    def _reveal_next_letter(self) -> None:
        """Reveal one random unrevealed letter in the current word."""
        unrevealed = [
            i for i, c in enumerate(self.current_word)
            if i not in self._revealed_indices and c != " "
        ]
        if unrevealed:
            self._revealed_indices.add(random.choice(unrevealed))

    def _schedule_next_reveal(self) -> None:
        """Schedule the next letter reveal based on remaining word length."""
        unrevealed_count = sum(
            1 for i, c in enumerate(self.current_word)
            if i not in self._revealed_indices and c != " "
        )
        if unrevealed_count > 0:
            interval = self.round_duration / max(len(self.current_word), 1)
            self._next_reveal_time = time.time() + interval
