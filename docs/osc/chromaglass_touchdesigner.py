# ChromaGlass from TouchDesigner: a starter for docs/osc.md.
#
# Setup, once:
#   1. Put down an OSC Out DAT, name it `oscout1`, Network Address 127.0.0.1
#      (or the show laptop's address), Network Port 9000.
#   2. Put down a Text DAT, name it `chromaglass`, and paste this file into it.
#   3. In ChromaGlass, turn on Show > OSC input (This Mac only, or From the
#      network for a second computer). OSC in is Pro.
#
# Then from any script, a Panel Execute DAT or the Textport:
#   mod.chromaglass.preset('galaxy')
#   mod.chromaglass.action('blackout-toggle')
#   mod.chromaglass.setting('audioImpact', 0.8)
#
# And to play settings from channels: put down a CHOP Execute DAT on a CHOP
# whose channels are named after settings (audioImpact, dimmer, bloom, ...),
# turn on its Value Change, and make its callback:
#   def onValueChange(channel, sampleIndex, val, prev):
#       mod.chromaglass.setting(channel.name, val)
#
# The show server takes a number as it is and the app clamps it to the
# setting's own travel, so a 0 to 1 channel suits the settings that run 0 to 1
# (docs/osc.md lists them); scale the others in a Math CHOP first.

OUT = 'oscout1'


def _send(address, values=()):
    op(OUT).sendOSC(address, list(values))


def setting(key, value):
    """/chromaglass/setting/<key> <value>: any setting, e.g. setting('dimmer', 0.5)."""
    _send('/chromaglass/setting/' + key, [float(value)])


def action(name):
    """/chromaglass/action/<name>: go, back, lucky, seed, clear, blackout-toggle, ..."""
    _send('/chromaglass/action/' + name)


def preset(preset_id):
    """/chromaglass/preset <id>: cue a look, e.g. preset('lava-lamp')."""
    _send('/chromaglass/preset', [preset_id])


def drop(x, y, amount=0.5):
    """Dye at a point; x and y run 0 to 1 across the plate, y up."""
    _send('/chromaglass/drop', [float(x), float(y), float(amount)])


def blow(x, y, amount=0.5, dx=0.0, dy=0.0):
    """Air at a point, with an optional direction."""
    _send('/chromaglass/blow', [float(x), float(y), float(amount), float(dx), float(dy)])


def press(x, y, amount=0.5):
    """A hand on the top glass at a point."""
    _send('/chromaglass/press', [float(x), float(y), float(amount)])


def tilt(x, y):
    """Rock the plate; each runs -1 to 1."""
    _send('/chromaglass/tilt', [float(x), float(y)])


def dye(hex_colour):
    """The dropper's colour, '#rrggbb'."""
    _send('/chromaglass/dye', [hex_colour])
