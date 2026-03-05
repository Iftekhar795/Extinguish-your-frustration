# Extinguish Your Frustration — 2D Endless Runner

A browser-based 2D endless runner built with [Phaser 3](https://phaser.io/).  
No installation needed — runs entirely in your browser.

---

## ▶ Play Now

**Online (GitHub Pages):**  
👉 **https://iftekhar795.github.io/Extinguish-your-frustration/**  
*(Available after this PR is merged to `main` and GitHub Pages is enabled — see [setup instructions](#enabling-github-pages) below.)*

**Locally — no server required:**
1. Click the green **Code** button on the repository page and choose **Download ZIP**.
2. Unzip the folder anywhere on your computer.
3. Open the `game/` folder and **double-click `index.html`** — it opens straight in your browser.
4. That's it! The game starts immediately.

---

## Controls

| Key / Input           | Action  |
|-----------------------|---------|
| Space / W / ↑ / Tap   | Jump    |
| R / Tap (game-over)   | Restart |

---

## Features

- **Auto-running player** — stays on the left side of the screen; you only need to jump.
- **AI-controlled enemy** — spawns from the right, chases the player and mirrors jumps.
- **Spike obstacles** — spawn at increasing frequency and speed as your score grows.
- **Custom sprite upload** — upload any PNG/JPG for the player or enemy; the game hot-swaps the texture live.
- **Sprite-sheet support** — specify frame width, height, and frame count for a multi-frame animation.
- **Single-image animation** — uploaded single images get an automatic squash/stretch tween so they look fluid.
- **Adjustable animation FPS** — tune the run-cycle speed from the control panel.
- **Score & difficulty** — score increases as obstacles pass; obstacle speed ramps up over time.

---

## Uploading Custom Sprites

1. Use the panel on the right side of the game to upload an image.
2. **Single image** (PNG/JPG): leave Frame W and Frame H at `0`. A smooth tween animation is applied automatically.
3. **Sprite sheet**: set Frame W, Frame H, and the total frame count before clicking Load.
4. Adjust **Player FPS** / **Enemy FPS** and click **Apply Settings** to tune animation speed.
5. Sprites update instantly without needing to restart the game.

---

## Enabling GitHub Pages

To make the game playable at `https://iftekhar795.github.io/Extinguish-your-frustration/`:

1. Go to your repository on GitHub.
2. Click **Settings** → scroll down to **Pages** (left sidebar).
3. Under **Source**, select **Deploy from a branch**.
4. Set the branch to **`main`** and the folder to **`/ (root)`**.
5. Click **Save**. GitHub will publish the site within a minute or two.
6. Visit the URL above to play!

> **Note:** The `.nojekyll` file in this repository is already set up so GitHub Pages serves the game correctly.

---

## Project Structure

```
game/
├── index.html          Main game page + upload UI
├── style.css           Layout & responsive styles
├── phaser.min.js       Bundled Phaser 3.60.0 (no internet needed)
├── main.js             Phaser config + upload UI handlers
├── SpriteManager.js    Sprite loading, canvas textures, frame slicing
├── PlayerController.js Physics player, jump, tween/frame animation
├── EnemyAI.js          AI enemy, chasing behaviour, tween/frame animation
└── GameScene.js        Main Phaser scene (world, collisions, score, HUD)
```

---

## Running with a Local Server (optional)

If you want to run a local dev server instead of double-clicking:

```bash
# Python (built-in, no install needed)
cd path/to/Extinguish-your-frustration
python3 -m http.server 8080
# Then open http://localhost:8080/game/index.html
```