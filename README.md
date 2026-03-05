# ⚡ Face Fighter

A browser-based 2-D fighting game where **you put your own face on the fighter**.  
Upload a selfie, customise your outfit, choose an arena, and settle the score against an AI opponent — on desktop or mobile.

![Mobile fight screen](https://github.com/user-attachments/assets/7468a1fa-8340-46e0-b67f-df3e8051eab9)

---

## 🎮 Play it now

The game is hosted on **GitHub Pages** — no install needed:

> **<https://iftekhar795.github.io/Extinguish-your-frustration/>**

Open that link on a phone or a desktop browser and you're ready to go.

---

## 🖥️ Run it locally

The game is a plain HTML/JS/CSS app — no build step, no dependencies to install.

### 1 · Clone the repository

```bash
git clone https://github.com/Iftekhar795/Extinguish-your-frustration.git
cd Extinguish-your-frustration
```

### 2 · Start a local web server

Pick any of the options below — all open the game on `http://localhost:8000/game/`.

**Python (built-in, zero setup):**
```bash
python3 -m http.server 8000
```

**Node.js (npx, no global install):**
```bash
npx serve .
```

**VS Code:** install the *Live Server* extension, right-click `game/index.html` → *Open with Live Server*.

### 3 · Open your browser

```
http://localhost:8000/game/
```

> **Why can't I just open `index.html` directly?**  
> Browsers block local file access for security reasons (`file://` URLs). A local server sidesteps this in one line.

---

## 🕹️ How to play

### Setup screen

| Step | What to do |
|------|-----------|
| **1** | Upload a photo of your face (or take a selfie on mobile) for **Your Fighter** |
| **2** | Upload / generate a face for the **Enemy Fighter**, or click *Generate Random* |
| **3** | (Optional) Set names, outfit colours, arena, and difficulty |
| **4** | Press **⚡ START FIGHT!** |

### Keyboard controls (desktop)

| Key | Action |
|-----|--------|
| `←` `→` | Move left / right |
| `↑` | Jump |
| `Z` | Punch |
| `X` | Kick |
| `C` | Block (hold) |
| `V` | Charge Special (hold) → release to fire |

### Touch controls (mobile)

A virtual gamepad appears automatically when you start a fight:

```
[ ◀  ↑  ▶ ]          [ 👊  🦵 ]
                      [ 🛡   ⚡ ]
```

| Button | Action |
|--------|--------|
| ◀ / ▶ | Move left / right |
| ↑ | Jump |
| 👊 | Punch |
| 🦵 | Kick |
| 🛡 | Block (hold down) |
| ⚡ | Charge Special (hold) → lift finger to fire |

### Combos

| Input sequence | Combo name | Bonus damage |
|----------------|-----------|-------------|
| Punch → Punch → Kick | **Fury Combo** | +38 |
| Punch → Punch → Punch | **Triple Threat** | +30 |
| Kick → Kick → Punch | **Sweep Combo** | +35 |

### Rounds & winning

- Best of 3 rounds · 99-second timer per round  
- KO the enemy **or** have more HP when the clock runs out  
- Win 2 rounds to claim victory 🏆

---

## 📁 Repository layout

```
Extinguish-your-frustration/
├── index.html          ← GitHub Pages entry point (redirects to game/)
├── .nojekyll           ← tells GitHub Pages to skip Jekyll processing
├── README.md           ← this file
├── game/               ← the complete Face Fighter game
│   ├── index.html      ← main HTML (setup screen + game screen)
│   ├── main.js         ← entry point: Phaser config, setup UI, mobile wiring
│   ├── FightScene.js   ← Phaser scene: arena, HUD, input, combat loop
│   ├── Fighter.js      ← base fighter class (physics, attacks, rendering)
│   ├── EnemyAI.js      ← AI opponent (extends Fighter)
│   ├── FaceUploadManager.js  ← image upload & circular face crop
│   ├── style.css       ← all styling inc. mobile virtual controls
│   └── phaser.min.js   ← Phaser 3.60.0 bundled locally (CDN fallback)
└── New game/           ← earlier prototype files (for reference)
```

---

## 🚀 Deploy your own copy to GitHub Pages

1. Fork this repository on GitHub.
2. Go to your fork → **Settings** → **Pages**.
3. Under *Source*, choose **Deploy from a branch** → branch `main` (or `master`) → folder `/ (root)`.
4. Click **Save**.  GitHub will show a URL like `https://<your-username>.github.io/Extinguish-your-frustration/`.
5. Visit that URL — the root `index.html` redirects you straight into the game.

> The `.nojekyll` file at the root is required so GitHub Pages skips Jekyll processing entirely and serves all files exactly as-is — without it, Jekyll's build step could silently drop or transform static assets.

---

## 🛠️ Development tips

- All game logic lives in the `game/` folder — edit those files and refresh the browser.
- No bundler or transpiler is used; changes take effect immediately on refresh.
- Use browser DevTools → Console to see Phaser logs and any errors.
- To test mobile controls on a desktop browser: open DevTools → toggle device toolbar (Ctrl+Shift+M / Cmd+Shift+M) — the virtual gamepad will appear automatically when a touch-capable user agent is detected.

---

## 📜 Licence

MIT — feel free to fork, remix, and upload your boss's face.