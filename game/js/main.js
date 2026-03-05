/**
 * main.js
 * Initialises Phaser, wires up the lobby HTML overlay,
 * and handles face-upload events.
 */

// ── Phaser configuration ─────────────────────────────────────────────────────

const GAME_CFG = {
    type:   Phaser.AUTO,
    width:  800,
    height: 500,
    parent: 'game-container',
    backgroundColor: '#87ceeb',
    scene: [FightScene]
};

let game = null; // created on first "Start Fight" click

// ── Utility ───────────────────────────────────────────────────────────────────

/**
 * Convert a CSS hex colour string ("#rrggbb") to a Phaser number (0xRRGGBB).
 * Falls back to the supplied default if parsing fails.
 */
function hexToPhaser(hex, fallback) {
    const n = parseInt(hex.replace('#', ''), 16);
    return isNaN(n) ? fallback : n;
}

/** Set status text on the lobby */
function setStatus(msg, isError = false) {
    const el = document.getElementById('lobby-status');
    if (!el) return;
    el.textContent = msg;
    el.className   = isError ? 'status error' : 'status ok';
}

// ── Face Upload ───────────────────────────────────────────────────────────────

function wireUpFaceInput(inputId, previewId, placeholderId, type) {
    const input = document.getElementById(inputId);
    if (!input) return;

    // Click on the upload area triggers the file input
    const area = input.closest('.face-upload-area');
    if (area) {
        area.addEventListener('click', (e) => {
            if (e.target !== input) input.click();
        });
    }

    input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;

        setStatus('Loading face…');
        faceManager.loadFace(file, type, (err, result) => {
            if (err) {
                setStatus('Error: ' + err.message, true);
                return;
            }
            setStatus(`${type === 'player' ? 'Player' : 'Enemy'} face loaded ✓`);

            // Show preview
            const preview = document.getElementById(previewId);
            const holder  = document.getElementById(placeholderId);
            if (preview) { preview.src = result.dataURL; preview.style.display = 'block'; }
            if (holder)  holder.style.display = 'none';
        });
    });
}

// ── Start Fight ───────────────────────────────────────────────────────────────

document.getElementById('start-fight-btn').addEventListener('click', () => {
    const cfg = {
        playerColor: hexToPhaser(document.getElementById('player-color').value, 0x2255cc),
        enemyColor:  hexToPhaser(document.getElementById('enemy-color').value,  0xcc2222),
        arena:       parseInt(document.getElementById('arena-select').value, 10) || 0,
        difficulty:  document.getElementById('difficulty').value || 'normal'
    };

    document.getElementById('lobby-overlay').style.display = 'none';

    if (!game) {
        game = new Phaser.Game(GAME_CFG);
        // Give Phaser a frame to set up the canvas, then start the scene
        game.events.once('ready', () => game.scene.start('FightScene', cfg));
    } else {
        // Restart the fight with fresh config
        const scene = game.scene.getScene('FightScene');
        if (scene && scene.scene.isActive()) {
            scene.scene.restart(cfg);
        } else {
            game.scene.start('FightScene', cfg);
        }
    }
});

// ── Share Link ────────────────────────────────────────────────────────────────

document.getElementById('get-share-link-btn').addEventListener('click', () => {
    shareManager.copyAndShowLink();
});

// ── Page load: restore shared config from URL ─────────────────────────────────

window.addEventListener('load', () => {
    wireUpFaceInput('player-face-input', 'player-face-preview', 'player-upload-placeholder', 'player');
    wireUpFaceInput('enemy-face-input',  'enemy-face-preview',  'enemy-upload-placeholder',  'enemy');

    const sharedCfg = shareManager.loadFromURL();
    if (sharedCfg) {
        shareManager.applyConfig(sharedCfg);
        const notice = document.getElementById('share-notice');
        if (notice) notice.style.display = 'block';
        setStatus('Loaded shared fighter configuration!');
    }

    console.log('Face Fighter ready. Upload faces and press Start Fight!');
});
