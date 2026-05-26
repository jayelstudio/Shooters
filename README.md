# Shooters

A first-person 3-point shooting game for phones and tablets, built with Three.js.
You stand at the 3-point line in a photorealistic arena, move along the arc, and
shoot with a timing-based power meter. Full ball physics: arc, rim/backboard
bounces, and net swishes.

## Play

- **◀ ▶** — move along the 3-point line (5 spots: 2 left, center, 2 right).
- **Hold SHOOT** — a power meter ping-pongs up and down. **Release inside the
  green zone** for a clean swish. Too early/late falls short or long.
- **DRIBBLE** — bounce the ball to warm up before shooting.
- **Goal** — make the required shots **from the glowing spot** to clear each
  level. Each level the target spot moves, the meter speeds up, and the green
  zone shrinks. You have a limited number of lives (missed shots).

Designed for **portrait** orientation. Turn sound on for crowd and swish FX.

## Run it

It must be served over http(s) (ES modules + a CDN import for Three.js won't run
from a `file://` path). From the repo root:

```bash
python3 -m http.server 8000
# then open http://localhost:8000 on your phone/tablet (same Wi-Fi) or desktop
```

Or deploy the folder to any static host (GitHub Pages, Netlify, etc.).

## Tech

- **Three.js** (loaded via CDN import map) — WebGL rendering, shadows, ACES tone
  mapping, procedural PBR environment for reflections.
- **Procedural assets** — hardwood, basketball leather, glass backboard, and the
  crowd are all generated in code (canvas textures); no external image files.
- **Custom physics** — fixed-substep integration with gravity and analytic
  launch-speed solving so a perfectly-timed shot swishes from every spot.
- **Web Audio** — all SFX (bounce, rim, backboard, swish, dribble) and the crowd
  ambiance/cheers are synthesized at runtime.

## Project layout

```
index.html        # shell, HUD, controls, import map
styles.css        # portrait-first, touch-friendly UI
src/config.js     # dimensions + tuning constants
src/materials.js  # procedural textures + environment
src/arena.js      # court, hoop, backboard, net, stands, lights
src/player.js     # camera rig, first-person arms, shooting spots
src/ball.js       # ball physics, collisions, scoring, dribble
src/audio.js      # synthesized SFX + crowd
src/game.js       # state, levels, scoring, input, power meter
src/main.js       # bootstrap + render loop
```
