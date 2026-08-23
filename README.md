# Reverse Swing

A bowling studio for the delivery Pakistani fast bowlers turned into a weapon: the old ball that goes the **wrong way**.

The aerodynamics live in Rust. The client is a bowling game: bowler's-end camera, a length map on the pitch, a run-up, a batsman who tries to play, and stumps that fall.

## The science (and who invented the art)

Reverse swing grew on dry, abrasive Pakistani pitches and was brought to the world stage by **Sarfraz Nawaz** and **Imran Khan**, then finished as a match-winner by **Wasim Akram** and **Waqar Younis**.

The model follows Rabindra Mehta's wind-tunnel picture plus the laminar-separation-bubble work of Scobie, Deshpande and others:

- **Conventional** (~30–70 mph): the seam trips one face into turbulence. That side stays attached longer. The ball swings *with* the seam.
- **Dead zone** (~80 mph on a new ball): both layers transition. Nothing useful happens.
- **Reverse** (above a critical speed the roughness can lower): the seam thickens an already-turbulent layer so it separates *early*. A bubble on the rough non-seam face delays separation there. Pressure flips. The ball swings *against* the seam — same grip as the outswinger, suddenly an inswinging yorker.
- **Contrast**: seam upright; shine versus roughness alone decides the way.

Wetting one side to "unbalance" the ball is a myth. Late hoop is just a parabolic side force: most of the metres appear in the second half of flight.

## Run it

```bash
cargo run -p server
```

Open [http://127.0.0.1:7474](http://127.0.0.1:7474).

```
Space          bowl
Q / E          wrist / seam
R / F          pace
arrows         line and length
P              pause
T              replay last ball
1 2 3          time scale
```

## Layout

- `crates/physics` — Mehta/Scobie swing classification and trajectory integration
- `crates/server` — Axum API (`/api/bowl`, `/api/preview`, `/api/challenges`, `/api/lore`) plus the studio
- `web/js/engine.js` — PlayerLoop, look-at camera, rigidbodies, trails, particles, input
- `web/js/render.js` — pitch, length map, players, stump smash, hawk-eye
- `web/js/game.js` — bowling studio, batter AI, challenges, delivery chips

## Challenges

Sarfraz's Discovery, Imran's Karachi Spell, Waqar's Toe-Crusher, Wasim's Late Leave, and Contrast Class.
