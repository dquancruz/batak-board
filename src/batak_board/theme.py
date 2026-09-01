"""
Visual theme: "cyberpunk / elite sports dashboard" palette and fonts,
shared by every screen so the UI reads as one consistent system.

Every color below is a ``(light, dark)`` tuple. CustomTkinter resolves a
2-tuple against the current appearance mode automatically and re-colors
already-built widgets the moment ``ctk.set_appearance_mode()`` is called
(see ``ui/app.py``'s theme toggle) -- so screens/components never need an
if/else on the current mode, they just reference these constants.

Kept free of any customtkinter import at module load time beyond the
constants below, so it's cheap to inspect/test.
"""

from __future__ import annotations

# --------------------------------------------------------------------------
# Palette: (light_mode_hex, dark_mode_hex)
# --------------------------------------------------------------------------

BG_PRIMARY = ("#f4f6fb", "#0b0e14")        # app background
BG_SURFACE = ("#ffffff", "#12161f")        # cards / panels
BG_SURFACE_ALT = ("#e8ecf5", "#1a2030")    # raised elements, inputs

# Dark mode keeps full neon brightness; light mode uses deeper, more
# saturated shades of the same hues so text/fills stay readable on a
# near-white background instead of glaring or washing out.
NEON_GREEN = ("#12a150", "#39ff8f")        # success / correct press
NEON_RED = ("#d81140", "#ff3b5c")          # error / miss / timeout
NEON_CYAN = ("#0891b2", "#33e1ff")         # navigation / neutral accent
NEON_YELLOW = ("#b45309", "#ffd23f")       # warnings / countdown low time
NEON_MAGENTA = ("#c026d3", "#ff3fe0")      # winner / celebration highlight

TEXT_PRIMARY = ("#0f1420", "#eef2ff")
TEXT_MUTED = ("#4b5468", "#8b98b3")        # kept darker/lighter than a mid-gray in both modes for contrast
BORDER = ("#d7dceb", "#232a3d")

LED_OFF = ("#dfe4f0", "#242c3d")           # button/LED grid, unlit state

# --------------------------------------------------------------------------
# Fonts (family, size, weight) - large and legible at a distance, per spec.
# --------------------------------------------------------------------------

FONT_FAMILY = "Segoe UI"  # falls back gracefully on non-Windows via customtkinter

FONT_TITLE = (FONT_FAMILY, 56, "bold")
FONT_HEADING = (FONT_FAMILY, 32, "bold")
FONT_SCORE = (FONT_FAMILY, 96, "bold")
FONT_BODY = (FONT_FAMILY, 20, "normal")
FONT_LABEL = (FONT_FAMILY, 17, "bold")
FONT_BUTTON = (FONT_FAMILY, 22, "bold")

CORNER_RADIUS = 14
