"""
Visual theme: dark "cyberpunk / elite sports dashboard" palette and fonts,
shared by every screen so the UI reads as one consistent system.

Kept free of any customtkinter import at module load time beyond the
constants below, so it's cheap to inspect/test.
"""

from __future__ import annotations

# --------------------------------------------------------------------------
# Palette
# --------------------------------------------------------------------------

BG_PRIMARY = "#0b0e14"       # near-black app background
BG_SURFACE = "#12161f"       # cards / panels
BG_SURFACE_ALT = "#1a2030"   # raised elements, inputs

NEON_GREEN = "#39ff8f"       # success / correct press / player 1 accent
NEON_RED = "#ff3b5c"         # error / miss / timeout
NEON_CYAN = "#33e1ff"        # navigation / neutral accent / player 2
NEON_YELLOW = "#ffd23f"      # warnings / countdown low time
NEON_MAGENTA = "#ff3fe0"     # winner / celebration highlight

TEXT_PRIMARY = "#eef2ff"
TEXT_MUTED = "#7c8aa5"
BORDER = "#232a3d"

LED_OFF = "#242c3d"          # button/LED grid, unlit state

# --------------------------------------------------------------------------
# Fonts (family, size, weight) - large and legible at a distance, per spec.
# --------------------------------------------------------------------------

FONT_FAMILY = "Segoe UI"  # falls back gracefully on non-Windows via customtkinter

FONT_TITLE = (FONT_FAMILY, 56, "bold")
FONT_HEADING = (FONT_FAMILY, 32, "bold")
FONT_SCORE = (FONT_FAMILY, 96, "bold")
FONT_BODY = (FONT_FAMILY, 18, "normal")
FONT_LABEL = (FONT_FAMILY, 15, "bold")
FONT_BUTTON = (FONT_FAMILY, 20, "bold")

CORNER_RADIUS = 14
