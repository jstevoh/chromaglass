# Cause of the "Comet" Effect

The ink pulling into a comet is actually a result of **Plate Rock** (or any active **Tilt**).
When `Plate Rock` is turned on, it doesn't just kick the fluid on the beat — it also applies a very slow, wandering sway (simulating a hand holding the glass unsteadily). The GPU fluid solver treats this as physical gravity pulling down on heavy dye.

When you pour fresh ink, it has a higher density than the surrounding liquid. The background `Plate Rock` sway acts as gravity, pulling that heavy ink downhill and stretching it into a comet! Because the sway is driven by Perlin noise, the direction stays steady for a few seconds before slowly drifting. This perfectly explains why it "typically stays in that general direction once it starts - though could drift over time."

# Solution and Preset

While it's the physically correct behavior of `Plate Rock`, it feels random if you don't know the plate is slowly swaying!

To make sure it doesn't happen randomly, you can turn down `Plate Rock` when you want a perfectly flat, still surface for pouring.

Since you loved the comet effect, I've promoted it to a first-class feature:
1. I added **Comet Flow** and **Flow Direction** to the settings panel (under *Center Gravity*).
2. I wired this directly into the WGSL GPU solver (`hsBody`), so you can now dial in a constant, steady "wind" that pulls heavy ink without needing the random, hidden sway of Plate Rock.
3. I created a new built-in preset called **Comet River** that sets these up perfectly!
