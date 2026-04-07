"""
Intent Matcher — Maps Whisper transcriptions to structured game actions.

Uses regex pattern matching with fuzzy fallback for robustness.
Supports: game launch, background change, mic mute, and generic control.
"""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from typing import Optional
from thefuzz import process, fuzz

# ── Intent names ─────────────────────────────────────────────────────────────
START_GAME      = "START_GAME"
CHANGE_BG       = "CHANGE_BG"
MUTE_MIC        = "MUTE_MIC"
UNMUTE_MIC      = "UNMUTE_MIC"
LEAVE_GAME      = "LEAVE_GAME"
CHESS_MOVE      = "CHESS_MOVE"
UNKNOWN         = "UNKNOWN"

# ── Game aliases ─────────────────────────────────────────────────────────────
_GAME_ALIASES: dict[str, str] = {
    "air hockey":    "air_hockey",
    "airhockey":     "air_hockey",
    "hockey":        "air_hockey",
    "chess":         "chess",
    "ar chess":      "chess",
    "scribble":      "scribble",
    "scribble draw": "scribble",
    "draw":          "scribble",
    "balloon":       "balloon_pop",
    "balloon pop":   "balloon_pop",
    "poof":          "balloon_pop",
    "puzzle":        "face_puzzle",
    "face puzzle":   "face_puzzle",
}

# Background aliases — keys are what the user might say
_BG_ALIASES: dict[str, dict] = {
    "none":      {"type": "none"},
    "off":       {"type": "none"},
    "no bg":     {"type": "none"},
    "remove background": {"type": "none"},
    "blur":      {"type": "blur", "blurAmount": 14},
    "blurry":    {"type": "blur", "blurAmount": 14},
    "beach":     {"type": "image", "imageUrl": "https://images.unsplash.com/photo-1507525428034-b723cf961d3e?w=1920&h=1080&fit=crop"},
    "office":    {"type": "image", "imageUrl": "https://images.unsplash.com/photo-1497366216548-37526070297c?w=1920&h=1080&fit=crop"},
    "space":     {"type": "image", "imageUrl": "https://images.unsplash.com/photo-1419242902214-272b3f66ee7a?w=1920&h=1080&fit=crop"},
    "city":      {"type": "image", "imageUrl": "https://images.unsplash.com/photo-1480714378408-67cf0d13bc1b?w=1920&h=1080&fit=crop"},
    "mountains": {"type": "image", "imageUrl": "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?w=1920&h=1080&fit=crop"},
    "forest":    {"type": "image", "imageUrl": "https://images.unsplash.com/photo-1511497584788-876760111969?w=1920&h=1080&fit=crop"},
    "galaxy":    {"type": "image", "imageUrl": "https://images.unsplash.com/photo-1462331940025-496dfbfc7564?w=1920&h=1080&fit=crop"},
    "gradient":  {"type": "gradient", "gradientColors": ["#0f0c29", "#302b63", "#24243e"], "gradientAngle": 135},
    "neon":      {"type": "style", "styleFilter": "neon"},
    "sepia":     {"type": "style", "styleFilter": "sepia"},
    "vintage":   {"type": "style", "styleFilter": "vintage"},
    "grayscale": {"type": "style", "styleFilter": "grayscale"},
    "black and white": {"type": "style", "styleFilter": "grayscale"},
}

# ── Compiled patterns ─────────────────────────────────────────────────────────
_START_PATTERNS = re.compile(
    r"\b(start|launch|play|open|load|go to|select|begin)\b.{0,30}?\b("
    + "|".join(re.escape(k) for k in _GAME_ALIASES) + r")\b",
    re.IGNORECASE
)

_BG_PATTERNS = re.compile(
    r"\b(background|bg|set background|change background|switch background|use)\b.{0,20}?\b("
    + "|".join(re.escape(k) for k in _BG_ALIASES) + r")\b",
    re.IGNORECASE
)

_MUTE_PATTERNS   = re.compile(r"\b(mute|silence|quiet)\b", re.IGNORECASE)
_UNMUTE_PATTERNS = re.compile(r"\b(unmute|speak|voice on)\b", re.IGNORECASE)
_LEAVE_PATTERNS  = re.compile(r"\b(leave|exit|quit|back|stop game|go back)\b", re.IGNORECASE)

# ── Canonical Intents for Fuzz Matching ──────────────────────────────────────
# We map typical spoken phrases directly to intents to avoid fragile regex
CANONICAL_INTENTS = {
    "play chess": (START_GAME, {"game_type": "chess"}),
    "start air hockey": (START_GAME, {"game_type": "air_hockey"}),
    "draw scribble": (START_GAME, {"game_type": "scribble"}),
    "open balloon pop": (START_GAME, {"game_type": "balloon_pop"}),
    "face puzzle": (START_GAME, {"game_type": "face_puzzle"}),
    "background space": (CHANGE_BG, {"bgConfig": _BG_ALIASES["space"]}),
    "background office": (CHANGE_BG, {"bgConfig": _BG_ALIASES["office"]}),
    "background beach": (CHANGE_BG, {"bgConfig": _BG_ALIASES["beach"]}),
    "remove background": (CHANGE_BG, {"bgConfig": _BG_ALIASES["none"]}),
    "mute microphone": (MUTE_MIC, {}),
    "unmute microphone": (UNMUTE_MIC, {}),
    "leave game": (LEAVE_GAME, {}),
}


@dataclass
class IntentResult:
    intent:     str
    confidence: float          # 0.0–1.0
    action:     dict = field(default_factory=dict)

def extract_chess_move(text: str) -> dict | None:
    text = text.lower()
    # Replace common phonetic mistakes and punctuation
    replacements = {
        ",": " ", ".": " ", "-": " ", " to ": " ", " takes ": " ", " capture ": " ", " captures ": " ", " move ": " ", " play ": " ",
        "see": "c", "sea": "c", "she": "c", "bee": "b", "be": "b", "me": "b", "we": "b",
        "dee": "d", "the": "d", "deep": "d", "if": "f", "eff": "f", "off": "f", "half": "f",
        "gee": "g", "je": "g", "age": "h", "edge": "h", "each": "h", "eight": "8", "one": "1", "two": "2", "too": "2", "three": "3",
        "four": "4", "for": "4", "five": "5", "six": "6", "seven": "7"
    }
    for k, v in replacements.items():
        text = text.replace(k, v)
        
    # Look for two valid algebraic coordinates (e.g. "b 2", "b2", "b  2")
    coords = re.findall(r'\b([a-h])\s*([1-8])\b', text)
    if len(coords) >= 2:
        return {
            "from": f"{coords[0][0]}{coords[0][1]}",
            "to": f"{coords[1][0]}{coords[1][1]}"
        }
    return None


def match_intent(text: str) -> IntentResult:
    """Parse a raw Whisper transcript into a structured intent."""
    text_lower = text.lower().strip()
    
    if not text_lower:
        return IntentResult(intent=UNKNOWN, confidence=0.0, action={})

    # 1. Fuzzy match canonical globals first
    # Find best match from our predefined phrases list
    choices = list(CANONICAL_INTENTS.keys())
    best_match, score = process.extractOne(text_lower, choices, scorer=fuzz.token_set_ratio)
    
    # If confidence is > 75%, execute it
    if score >= 75:
        intent, action = CANONICAL_INTENTS[best_match]
        return IntentResult(intent=intent, confidence=score/100.0, action=action)

    # 2. CHESS_MOVE 
    chess_action = extract_chess_move(text_lower)
    if chess_action:
        return IntentResult(intent=CHESS_MOVE, confidence=0.90, action=chess_action)

    return IntentResult(intent=UNKNOWN, confidence=0.0, action={})
