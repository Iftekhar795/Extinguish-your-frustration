# Extinguish Your Frustration — Boxing Fighter

A browser-based **Street Fighter-style boxing game** built with [Phaser 3](https://phaser.io/).  
Upload a photo of yourself and fight as your own face on a boxer body — no server or install needed.

---

## ▶ Play Now

**Online (GitHub Pages):**  
👉 **https://iftekhar795.github.io/Extinguish-your-frustration/**  
*(Enable GitHub Pages: Settings → Pages → branch `main`, folder `/root` → Save.)*

**Locally — no server needed:**
1. Click **Code → Download ZIP** on the repo page, then unzip.
2. Open the `game/` folder and **double-click `index.html`** — plays straight in your browser.

---

## Controls (Player 1)

| Key                    | Action         |
|------------------------|----------------|
| A / ←  ·  D / →        | Walk           |
| W / ↑                  | Jump           |
| S (hold)               | Block          |
| J / Z                  | Punch (10 dmg) |
| K / X                  | Kick  (16 dmg) |
| R (after match ends)   | Restart        |

> **CPU** is AI-controlled and will approach, attack, retreat, and block.

---

## 📸 Face-on-Fighter Upload

1. Click **Load Player Photo** or **Load CPU Photo** and pick any portrait photo.
2. The face is **automatically detected** using the browser's Shape Detection API (`FaceDetector`) and cropped.
3. The cropped face is composited as a circle on the fighter's head — the body template stays.
4. The fighter updates **live in-game** without restarting.

| Browser         | Face detection method                        |
|-----------------|----------------------------------------------|
| Chrome / Edge   | Native `FaceDetector` API — precise          |
| Firefox / Safari | Centre-top crop fallback — works well for selfies |

> **Tip:** Portrait selfies work best. The face fills the head circle most naturally.

---

## Game Rules

- **Best of 3 rounds** — first to win 2 rounds wins the match.
- Each round has a **60-second timer**.
- Round ends by **K.O.** (HP → 0) or **TIME** (higher HP wins).
- **Blocking** absorbs 90% of incoming damage (chip damage: 1 HP per hit).

---

## Project Structure

```
game/
├── index.html            Game page + upload panel
├── style.css             Layout & dark-arena styles
├── phaser.min.js         Bundled Phaser 3.60.0 (no internet needed)
├── main.js               Phaser config + upload UI
├── SpriteManager.js      Face detection, body compositing, Phaser texture
├── PlayerController.js   P1 fighter: keyboard input, states, hit detection
├── EnemyAI.js            AI fighter: approach/retreat/attack/block decisions
└── GameScene.js          Arena, HP bars, round flow, KO/TIME, best-of-3
```

---

## Running with a Local Server (optional)

```bash
cd path/to/Extinguish-your-frustration
python3 -m http.server 8080
# Open http://localhost:8080/game/index.html
```
