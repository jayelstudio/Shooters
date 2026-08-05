---
title: "Buckets! — Product Requirements Document"
tags: [game, prd, mobile-web, basketball, shooters]
project: Shooters
codename: Buckets
version: 0.1 (MVP)
status: Draft
owner: jorge@jledesma.com
last_updated: 2026-08-05
---

# Buckets! — PRD (MVP)

> [!info] TL;DR
> **Buckets!** is a one-thumb, portrait, mobile-web basketball shooting game. You slide along a 3‑point arc to a **glowing hotspot**, hold to charge a shot meter, and release inside the **green zone** for a **swish**. Optional **dribble** taps warm you up and buff your next shot. Success feels like *timing + rhythm*, not aiming.

---

## 1. Context & Motivation

The current "build" is a single splash screen (`buckets-splash.png.PNG`) that already commits to the entire product idea:

- **Title:** *Buckets!* — punchy, streetball vibe.
- **Setting:** Outdoor court, chain-link fence, city skyline, cartoon crowd.
- **Rules communicated on the splash (verbatim):**
  1. **Move along the arc** to the glowing spot
  2. **Hold SHOOT** — release in the **green zone** for a swish
  3. **DRIBBLE** to warm up before you shoot
- **Framing:** *"Best in portrait. Sound on for crowd & swish."*

Why write this PRD now: the concept is crisp but nothing is built. A short, opinionated spec lets us jump straight to a playable v1 without re‑litigating the loop every sprint. This doc locks the **MVP** — everything else lives in the backlog at the bottom.

---

## 2. Goals & Non‑Goals

### 2.1 Goals (MVP)

- **G1 – Playable in <10 s.** From cold URL to first shot in under ten seconds, no signup.
- **G2 – Fun loop in one thumb.** Movement, charge, release, dribble — all on one thumb, in portrait.
- **G3 – Instant feedback.** Every shot has a visible arc, a rim/net reaction, and audio (swish / clang / off-backboard).
- **G4 – A run has stakes.** Session ends on a miss streak (see §5.2), giving a natural score to chase and share.
- **G5 – Mobile web first.** Ship as a static site — no install, no store review.

### 2.2 Non‑Goals (MVP)

- No accounts, cloud saves, or leaderboards (local high score only).
- No multiplayer, no online rooms.
- No monetization, no ads, no IAP.
- No character selection, unlocks, or cosmetics.
- No landscape mode, no desktop-first controls (desktop plays but is not a target).
- No physics-sim rebounds — outcomes are deterministic from meter release + hotspot proximity (see §6.2).

---

## 3. Target Player & Session Shape

- **Who:** Casual mobile players, ~10–45. Basketball fans a plus, not required.
- **Where:** Loaded from a link — Twitter/X, iMessage, Discord, a QR at a live event.
- **Session length:** 30–120 s per run. "One more shot" replayability.
- **Success feel:** Rhythm game energy — the meter and hotspot pulse, and a "green zone swish" reads like landing a Guitar Hero note.

---

## 4. The Core Loop (30-second version)

```
┌──────────────┐   move    ┌──────────────┐   hold    ┌───────────────┐
│  On the arc  │──────────▶│  Hotspot lit │──────────▶│ Charging meter│
└──────────────┘           └──────────────┘           └───────┬───────┘
        ▲                                                    │ release
        │                                                    ▼
┌───────┴──────┐                                     ┌──────────────┐
│  Next shot   │◀── swish / miss ──── ball flies ────│ Green zone?  │
└──────────────┘                                     └──────────────┘
```

1. **Position** — Drag the player left/right along the 3-point arc to reach the pulsing **hotspot**.
2. **Charge** — Press-and-hold the **SHOOT** button; a vertical meter fills, sweeps into a **green zone**, then overshoots.
3. **Release** — Let go inside the green zone → **swish**. Above/below → clang / airball / brick.
4. **Dribble (optional)** — Tap the **DRIBBLE** button 2–4 times between shots. Each tap adds a small **hotstreak** buff to the *next* shot only (widens green zone by ~10% per tap, caps at +30%).
5. **Repeat** — New hotspot spawns. Streak counter climbs. Miss threshold ends the run.

---

## 5. Modes & Progression (MVP)

### 5.1 Single Mode: "Streak Run"

One mode ships. Named copy TBD — internally "Streak Run."

- Shots continue indefinitely until the run-ending condition triggers.
- Score = swishes + bonuses (see §5.3).
- Local high score persists via `localStorage`.

### 5.2 Run-Ending Condition

- **Two misses in a row** ends the run.
- One-off misses reset the "miss counter" to zero on the next made shot.
- Design intent: rewards recovery, punishes tilting, keeps runs short.

### 5.3 Scoring

| Result | Points | Notes |
|---|---:|---|
| **Swish** (release in green zone) | **3** | Base bucket. |
| **Bank shot** (release just outside green, still makes it) | 2 | Small forgiveness band around green (~10%). |
| **Miss** | 0 | Increments miss counter. |
| **Heat bonus** | +1 per shot at streak ≥ 3 | Stacks with swish/bank. |
| **Perfect dribble entry** | +1 | Released within 100 ms of a dribble tap. |

*Design intent:* the green zone is the primary skill test; dribble is a tempo secondary that only matters once you're past the tutorial.

---

## 6. Systems Detail

### 6.1 The Arc & Hotspot

- The 3-point line spans the lower half of the portrait screen as a horizontal-ish arc (viewed from behind the player).
- Player sprite snaps along a 1D path; horizontal drag controls position.
- One **hotspot** at a time — visible glow, pulsing at ~1.2 Hz.
- Hotspot moves after every shot (swish or miss). Movement is randomized within constraints: not more than ~40% arc-width from previous, avoiding whiplash.

### 6.2 Shot Meter

- Vertical bar on the right thumb-zone. Tap-and-hold to fill.
- Fill sweeps 0 → 100% over ~900 ms, then reverses and repeats until release.
- **Green zone** sits at 70–85% of the bar by default.
- **Distance-from-hotspot penalty:** the further you release from the hotspot along the arc, the *narrower* the effective green zone (linear from 100% width at hotspot to ~30% at arc extremes). Standing on the hotspot is the only way to get the full skill target.
- **Deterministic outcome function** (no ragdoll physics):
  - `score = meter_accuracy × hotspot_accuracy`
  - `score ≥ 0.85` → swish (nothing but net anim)
  - `0.6 ≤ score < 0.85` → bank/rim-roll make
  - `score < 0.6` → miss (clang, brick, or airball based on which factor was worse)

### 6.3 Dribble

- **DRIBBLE** button in bottom-left thumb-zone.
- Each tap plays a bounce SFX and adds one **heat charge** (max 3).
- Heat charges consume on next shot: each widens the green zone by 10% and slightly slows the meter.
- Charges reset after every shot, made or missed.

### 6.4 Camera & FX

- Static camera — no swing on shot.
- Ball follows a pre-computed arc tween (bezier from release point to rim).
- Impact reactions: net swishes, rim clangs, backboard shakes. Small screen-shake on swish (2 px, 100 ms).
- Confetti burst on 3-streak.

---

## 7. Controls (Portrait, One-Thumb)

```
┌──────────────────────────────┐
│                              │
│         [scoreboard]         │  ← top HUD: score, high score, streak
│                              │
│                              │
│         (basket)             │
│           ⋂                  │
│                              │
│      ~~~ arc line ~~~        │
│         (player)             │
│                              │
├──────────────┬───────────────┤
│              │               │
│   DRIBBLE    │  ▮ SHOOT ▮   │  ← bottom HUD: two big thumb targets
│              │               │
└──────────────┴───────────────┘
```

- **Drag anywhere in the top 60% of the screen** → moves player along arc.
- **Hold SHOOT** → fills meter. **Release** → shoots.
- **Tap DRIBBLE** → adds heat charge.
- No pinch, no two-finger gestures, no swipe-back conflicts.

---

## 8. UI / Screens

Only **3 screens** ship in MVP. Match the splash's visual language everywhere.

1. **Splash / Start** — the existing splash (`buckets-splash.png.PNG`) with rules and **TAP TO PLAY**.
2. **Game** — court + HUD (§7). No pause menu in MVP; backgrounding the tab pauses.
3. **Game Over** — final score, high score, "Play Again," "Share" (Web Share API, falls back to copy-link).

### 8.1 HUD Elements

- Top-left: current **score** (big).
- Top-right: **high score** (small, greyed if not beaten).
- Top-center: **streak pips** (● ● ● …), turn gold at streak ≥ 3.
- Bottom-left: **DRIBBLE** button + heat charge dots above it.
- Bottom-right: **SHOOT** button with meter overlay while held.

---

## 9. Audio

Sound is called out on the splash — treat it as first-class, not decoration.

- **Ambient loop:** low-volume outdoor crowd murmur.
- **SFX:** dribble bounce, shoe squeak on movement, swish, rim clang, backboard bank, airball whiff.
- **Crowd reactions:** small "ooh" on near-misses, growing cheer on streaks, roar on 5+ streak.
- **UI:** button clicks, meter tick at green-zone entry, satisfying "ding" on green-zone release.
- Muted by default on iOS Safari; a **speaker icon** in the top corner unmutes.

---

## 10. Visual & Art Direction

- **Reference:** the existing splash — thick-outlined cartoon, saturated colors, chunky letterforms.
- **Palette:** court blue, orange ball, white lines, yellow accent (matches the "TAP TO PLAY" button).
- **Character:** simple mascot silhouette for MVP — no face detail needed at play distance.
- **⚠ Legal / IP:** The splash currently shows what appears to be a red *Angry Birds*-style character on the bench. **Cut or replace before public release** — use an original mascot or a generic crowd sprite.
- **Font:** hand-drawn / brush display font for score & titles; system sans for body/HUD numbers.

---

## 11. Technical Approach

- **Stack:** Static site — HTML + Canvas (or WebGL via Pixi.js / Phaser 3).
  - *Recommendation:* **Phaser 3** — batteries-included for 2D game loops, tween/audio/input handling, portrait-friendly, small enough to load fast.
- **Renderer:** 2D Canvas — no 3D, no shaders needed for MVP.
- **Assets:** PNG spritesheet for ball/player/rim states; OGG+MP3 for audio (Safari compat).
- **Persistence:** `localStorage` for high score, sound-preference.
- **Analytics:** none in MVP (adds a network dep, cookie banner surface area). Add post-MVP if we want to see funnels.
- **Hosting:** any static host — GitHub Pages, Netlify, Vercel.
- **Perf budget:** first-input-ready in ≤ 2.5 s on mid-tier Android over 4G; 60 fps steady on iPhone 12 and up.
- **Repo layout suggestion:**
  ```
  /src        game code
  /assets     png / audio
  /public     index.html, favicon, splash
  /docs       this PRD
  ```

---

## 12. Success Metrics (MVP)

Since MVP has no analytics, success is judged by:

- **Playtest:** 5+ people play unprompted for 3+ runs each.
- **Session length:** median first-visit session ≥ 90 s (measured in later analytics pass).
- **Share rate:** at least one organic share per 10 sessions.
- **Bug bar:** zero crashes on iOS Safari 17+ and Chrome Android over a 20-run session.

---

## 13. Risks & Mitigations

| Risk | Mitigation |
|---|---|
| Meter timing feels arbitrary on high-refresh phones | Lock meter to wall-clock ms, not frame count. |
| iOS Safari audio requires gesture unlock | First tap on splash primes the audio context. |
| Angry-Birds character on splash = IP issue | Replace mascot before any public link. |
| Portrait keyboards / URL bar squeeze | Design safe-area with `env(safe-area-inset-*)`; test with URL bar visible. |
| One-shot gameplay gets stale fast | Backlog: daily hotspot seed, streak leaderboard (see §14). |

---

## 14. Backlog (Post‑MVP)

Ranked, not scheduled.

1. **Daily Challenge** — deterministic seed; shareable score card.
2. **Global leaderboard** — needs a tiny backend (Cloudflare Worker + KV would do).
3. **Cosmetics:** ball skins, court skins earned by streak milestones.
4. **Trick shots:** long-hold for a fadeaway, swipe for a floater — new risk/reward.
5. **Time attack mode:** 60 s, maximize buckets, ignore streak-end rule.
6. **Custom mascot picker.**
7. **PWA install prompt + icon.**
8. **Sound design polish pass** — real crowd stems, ducking.
9. **Haptics** on green-zone hit (mobile only).

---

## 15. Open Questions

- [ ] Is the run-end rule "2 misses in a row" or "3 total misses per run"?
- [ ] Should DRIBBLE be discoverable via a tutorial pip, or trusted from splash instructions?
- [ ] Do we need a mute-by-default policy given iOS restrictions, or auto-unmute on first tap?
- [ ] Final mascot direction — original character, or licensed?
- [ ] Ship name: keep *Buckets!* or trademark-check first?

---

## 16. Verification / Definition of Done

MVP is done when:

- [ ] Splash → Game → Game Over flow works on iOS Safari and Chrome Android.
- [ ] All three splash rules (move / hold-release / dribble) are functional and testable.
- [ ] A run reliably ends via §5.2 rule and shows a final score.
- [ ] High score persists across reloads.
- [ ] Audio plays after first user gesture; muted by default on iOS.
- [ ] Static bundle deploys from `main` to a public URL.
- [ ] 3 playtesters complete a run without help.

---

*Source-of-truth for this PRD lives at `docs/PRD-Buckets.md` in the `Shooters` repo. Update in-place; the PDF is a snapshot.*
