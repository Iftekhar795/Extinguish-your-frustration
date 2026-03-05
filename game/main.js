/**
 * main.js
 * Entry point – initialises the Phaser game and wires up the HTML setup UI.
 * The setup screen lets users upload faces, customise fighters, choose an arena,
 * and set difficulty before launching the Phaser FightScene.
 */

// ── Phaser configuration ──────────────────────────────────────
const GAME_WIDTH  = 480;
const GAME_HEIGHT = 760;

const phaserConfig = {
    type: Phaser.AUTO,
    width:  GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'game-container',
    backgroundColor: '#0a0a1a',
    scale: {
        mode:       Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 0 }, debug: false },
    },
    scene: [FightScene],
    render: {
        pixelArt: false,
        antialias: true,
    },
};

let game = null;  // created when fight starts

// ── Mobile input state (shared with FightScene) ───────────────
window._mobileInput = {
    left:         false,
    right:        false,
    jumpJustDown: false,
    punchJustDown: false,
    kickJustDown:  false,
    block:        false,
    specialDown:  false,
    specialJustUp: false,
};

// ── DOM helpers ──────────────────────────────────────────────

function qs(sel) { return document.querySelector(sel); }

function setStatus(msg, isError = false) {
    const el = qs('#status-message');
    if (!el) return;
    el.textContent = msg;
    el.className   = isError ? 'status error' : 'status';
}

function hexToInt(hexStr, fallback) {
    const n = parseInt(hexStr.replace('#', ''), 16);
    return isNaN(n) ? fallback : n;
}

// ── Touch device detection ────────────────────────────────────

function isTouchDevice() {
    return ('ontouchstart' in window) ||
           navigator.maxTouchPoints > 0 ||
           window.matchMedia('(hover: none) and (pointer: coarse)').matches;
}

// ── Mobile virtual controls ───────────────────────────────────

/**
 * Wire up the on-screen mobile buttons.
 * Each button sets/clears flags in window._mobileInput so FightScene can
 * read them in _handleInput() just like keyboard keys.
 */
function setupMobileControls() {
    const ctrl = qs('#mobile-controls');
    if (!ctrl) return;

    // Show only on touch devices
    if (!isTouchDevice()) {
        ctrl.style.display = 'none';
        return;
    }

    ctrl.style.display = 'flex';

    const mi = window._mobileInput;

    /**
     * Bind touchstart / touchend / touchcancel to a button.
     * onDown  – called when finger touches the button
     * onUp    – called when finger lifts (or touch cancelled)
     */
    function bindBtn(id, onDown, onUp) {
        const btn = qs('#' + id);
        if (!btn) return;

        btn.addEventListener('touchstart', (e) => {
            e.preventDefault();
            btn.classList.add('active');
            onDown();
        }, { passive: false });

        const release = (e) => {
            e.preventDefault();
            btn.classList.remove('active');
            if (onUp) onUp();
        };
        btn.addEventListener('touchend',    release, { passive: false });
        btn.addEventListener('touchcancel', release, { passive: false });
    }

    // Movement
    bindBtn('mb-left',  () => { mi.left  = true;  }, () => { mi.left  = false; });
    bindBtn('mb-right', () => { mi.right = true;  }, () => { mi.right = false; });
    bindBtn('mb-up',    () => { mi.jumpJustDown  = true; }, null);

    // Actions
    bindBtn('mb-punch',   () => { mi.punchJustDown = true; }, null);
    bindBtn('mb-kick',    () => { mi.kickJustDown  = true; }, null);
    bindBtn('mb-block',   () => { mi.block = true;  }, () => { mi.block = false; });
    bindBtn('mb-special', () => { mi.specialDown  = true;  },
                          () => { mi.specialDown  = false; mi.specialJustUp = true; });
}

// ── Face upload handlers ──────────────────────────────────────

async function handleFaceUpload(fileInputId, previewId, key) {
    const fileInput = qs('#' + fileInputId);
    const file = fileInput && fileInput.files[0];
    if (!file) {
        setStatus('Please choose an image file first.', true);
        return;
    }

    setStatus('Processing face image…');
    try {
        const dataUrl = await faceUploadManager.loadFace(file, key);
        const preview = qs('#' + previewId);
        if (preview) {
            preview.src = dataUrl;
            preview.style.display = 'block';
        }
        setStatus(key === 'player' ? 'Player face loaded ✔' : 'Enemy face loaded ✔');
    } catch (err) {
        setStatus('Failed to load image: ' + err.message, true);
    }
}

// ── Read URL params (for share links) ─────────────────────────

function readUrlParams() {
    const params = new URLSearchParams(window.location.search);
    return {
        playerName:  params.get('playerName')  || '',
        playerBody:  params.get('playerBody')  || '',
        playerPants: params.get('playerPants') || '',
        enemyName:   params.get('enemyName')   || '',
        enemyBody:   params.get('enemyBody')   || '',
        enemyPants:  params.get('enemyPants')  || '',
        arena:       params.get('arena')       || '0',
        difficulty:  params.get('difficulty')  || '1',
    };
}

function applyUrlParams(p) {
    /** Convert a stored integer colour value back to a CSS hex string */
    function intToHexColor(val) {
        return '#' + parseInt(val).toString(16).padStart(6, '0');
    }
    if (p.playerName)  { const el = qs('#player-name');    if (el) el.value = p.playerName;              }
    if (p.playerBody)  { const el = qs('#player-body');    if (el) el.value = intToHexColor(p.playerBody);  }
    if (p.playerPants) { const el = qs('#player-pants');   if (el) el.value = intToHexColor(p.playerPants); }
    if (p.enemyName)   { const el = qs('#enemy-name');     if (el) el.value = p.enemyName;               }
    if (p.enemyBody)   { const el = qs('#enemy-body');     if (el) el.value = intToHexColor(p.enemyBody);   }
    if (p.enemyPants)  { const el = qs('#enemy-pants');    if (el) el.value = intToHexColor(p.enemyPants);  }
    if (p.arena)       { const el = qs('#arena-select');   if (el) el.value = p.arena;                   }
    if (p.difficulty)  { const el = qs('#difficulty');     if (el) el.value = p.difficulty;               }
}

// ── Start fight ──────────────────────────────────────────────

function startFight() {
    // Ensure enemy has a face (generate one if not uploaded)
    if (!faceUploadManager.getFaceDataUrl('player')) {
        setStatus('Please upload your face image first!', true);
        return;
    }
    if (!faceUploadManager.getFaceDataUrl('enemy')) {
        faceUploadManager.generateRandomFace();
        setStatus('No enemy face uploaded – using random face.');
    }

    const playerConfig = {
        name:        qs('#player-name').value.trim()  || 'PLAYER',
        bodyColor:   hexToInt(qs('#player-body').value,  0x4169E1),
        pantsColor:  hexToInt(qs('#player-pants').value, 0x1a1a2e),
        faceDataUrl: faceUploadManager.getFaceDataUrl('player'),
    };

    const enemyConfig = {
        name:        qs('#enemy-name').value.trim()   || 'ENEMY',
        bodyColor:   hexToInt(qs('#enemy-body').value,   0x8B0000),
        pantsColor:  hexToInt(qs('#enemy-pants').value,  0x1a1a2e),
        faceDataUrl: faceUploadManager.getFaceDataUrl('enemy'),
    };

    const arenaIndex  = parseInt(qs('#arena-select').value, 10) || 0;
    const difficulty  = parseInt(qs('#difficulty').value,   10) || 1;

    // Hide setup, show game
    qs('#setup-screen').style.display = 'none';
    qs('#game-screen').style.display  = 'flex';

    // Show/wire mobile controls (no-op on desktop)
    setupMobileControls();

    if (!game) {
        // Store config globally so FightScene.init() can always find it
        window._pendingFightConfig = { playerConfig, enemyConfig, arenaIndex, difficulty };
        game = new Phaser.Game(phaserConfig);
        // After Phaser is ready, restart the scene with the correct data
        game.events.once('ready', () => {
            game.scene.start('FightScene', { playerConfig, enemyConfig, arenaIndex, difficulty });
        });
    } else {
        game.scene.start('FightScene', { playerConfig, enemyConfig, arenaIndex, difficulty });
    }
}

// ── Wire up DOM ───────────────────────────────────────────────

window.addEventListener('DOMContentLoaded', () => {
    // Restore values from URL params (shared link)
    applyUrlParams(readUrlParams());

    // Make drop zones tap-to-upload on mobile (touch devices have no drag-and-drop)
    ['player-drop-zone', 'enemy-drop-zone'].forEach((zoneId, i) => {
        const zone = qs('#' + zoneId);
        if (!zone) return;
        const inputId = (i === 0 ? 'player' : 'enemy') + '-sprite';
        if (isTouchDevice()) {
            zone.addEventListener('click', () => qs('#' + inputId).click());
        }
    });

    // Upload buttons
    qs('#load-player-btn').addEventListener('click', (e) => {
        e.stopPropagation(); // don't bubble to drop zone click handler
        handleFaceUpload('player-sprite', 'player-face-preview', 'player');
    });

    // Selfie (camera) shortcut for the player – opens front camera directly on mobile
    const selfieBtn = qs('#player-selfie-btn');
    const cameraInput = qs('#player-camera-input');
    if (selfieBtn && cameraInput) {
        selfieBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            cameraInput.value = ''; // allow re-capturing the same photo
            cameraInput.click();
        });
        // Auto-upload as soon as a photo is captured
        cameraInput.addEventListener('change', () => {
            handleFaceUpload('player-camera-input', 'player-face-preview', 'player');
        });
    }

    // Auto-upload from gallery file picker when a file is chosen
    // Also clear value so the same file can be re-selected (consistent with camera input)
    const galleryInput = qs('#player-sprite');
    if (galleryInput) {
        galleryInput.addEventListener('click', () => {
            galleryInput.value = ''; // allow re-selecting the same file
        });
        galleryInput.addEventListener('change', () => {
            if (galleryInput.files && galleryInput.files[0]) {
                handleFaceUpload('player-sprite', 'player-face-preview', 'player');
            }
        });
    }

    qs('#load-enemy-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        handleFaceUpload('enemy-sprite', 'enemy-face-preview', 'enemy');
    });

    qs('#random-enemy-btn').addEventListener('click', () => {
        const dataUrl = faceUploadManager.generateRandomFace();
        const preview = qs('#enemy-face-preview');
        if (preview) { preview.src = dataUrl; preview.style.display = 'block'; }
        setStatus('Random enemy face generated ✔');
    });

    qs('#start-fight-btn').addEventListener('click', startFight);

    // Drag-and-drop faces (desktop)
    ['player-drop-zone', 'enemy-drop-zone'].forEach((zoneId, i) => {
        const zone = qs('#' + zoneId);
        if (!zone) return;
        const key = i === 0 ? 'player' : 'enemy';
        const previewId = key + '-face-preview';

        zone.addEventListener('dragover',  (e) => { e.preventDefault(); zone.classList.add('drag-over'); });
        zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
        zone.addEventListener('drop', async (e) => {
            e.preventDefault();
            zone.classList.remove('drag-over');
            const file = e.dataTransfer.files[0];
            if (!file || !file.type.startsWith('image/')) {
                setStatus('Please drop an image file.', true);
                return;
            }
            setStatus('Processing face image…');
            try {
                const dataUrl = await faceUploadManager.loadFace(file, key);
                const preview = qs('#' + previewId);
                if (preview) { preview.src = dataUrl; preview.style.display = 'block'; }
                setStatus(key === 'player' ? 'Player face loaded ✔' : 'Enemy face loaded ✔');
            } catch (err) {
                setStatus('Failed to load image: ' + err.message, true);
            }
        });
    });

    console.log('Face Fighter loaded. Upload faces and click "Start Fight!"');
});
