# Extinguish Your Frustration — 2D Endless Runner

A browser-based 2D endless runner built with [Phaser 3](https://phaser.io/).

## Features

- **Auto-running player** — stays on the left side of the screen; tap/press to jump over obstacles.
- **AI-controlled enemy** — spawns from the right, chases the player and mirrors jumps.
- **Scrolling obstacles** — spike blocks spawn at increasing frequency and speed.
- **Custom sprite upload** — upload any PNG/JPG for the player or enemy; the game hot-swaps the texture live while playing.
- **Sprite-sheet support** — specify frame width, height, and frame count to animate a sprite sheet.
- **Single-image animation** — if you upload a single image, a smooth squash/stretch tween keeps the character looking fluid (no goofy static poses).
- **Adjustable animation FPS** — tune the run-cycle speed from the control panel.
- **Score & difficulty** — score increases as obstacles pass; obstacle speed ramps up over time.
- **Restart** — press **R** or tap after game-over to restart.

## How to Play

Open `game/index.html` in a browser (or visit the GitHub Pages URL).

| Key / Input          | Action  |
|----------------------|---------|
| Space / W / ↑ / Tap  | Jump    |
| R / Tap (game-over)  | Restart |

## Custom Sprites

1. Click **Load Player Sprite** or **Load Enemy Sprite** and choose a PNG/JPG.
2. For a **single image**: leave Frame W and Frame H at `0`. A tween animation will be applied automatically.
3. For a **sprite sheet**: set Frame W, Frame H, and the total frame count before loading.
4. Adjust **Player FPS** / **Enemy FPS** and click **Apply Settings** to tune animation speed.

## Project Structure

```
game/
├── index.html          Main game page
├── style.css           Layout & UI styles
├── main.js             Phaser config + upload UI handlers
├── SpriteManager.js    Sprite loading, canvas textures, frame slicing
├── PlayerController.js Physics player, jump, tween/frame animation
├── EnemyAI.js          AI enemy, chasing behaviour, tween/frame animation
└── GameScene.js        Main Phaser scene (world, collisions, score, HUD)
```