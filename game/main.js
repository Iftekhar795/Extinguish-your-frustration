/**
 * main.js
 * Entry point – initialises the Phaser game and wires up the HTML setup UI.
 * The setup screen lets users upload faces, customise fighters, choose an arena,
 * and set difficulty before launching the Phaser FightScene.
 */

// ── Phaser configuration ──────────────────────────────────────
const GAME_WIDTH  = 900;
const GAME_HEIGHT = 500;

const phaserConfig = {
    type: Phaser.AUTO,
    width:  GAME_WIDTH,
    height: GAME_HEIGHT,
    parent: 'game-container',
    backgroundColor: '#0a0a1a',
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
    qs('#game-screen').style.display  = 'block';

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

    // Upload buttons
    qs('#load-player-btn').addEventListener('click', () =>
        handleFaceUpload('player-sprite', 'player-face-preview', 'player'));

    qs('#load-enemy-btn').addEventListener('click', () =>
        handleFaceUpload('enemy-sprite', 'enemy-face-preview', 'enemy'));

    qs('#random-enemy-btn').addEventListener('click', () => {
        const dataUrl = faceUploadManager.generateRandomFace();
        const preview = qs('#enemy-face-preview');
        if (preview) { preview.src = dataUrl; preview.style.display = 'block'; }
        setStatus('Random enemy face generated ✔');
    });

    qs('#start-fight-btn').addEventListener('click', startFight);

    // Drag-and-drop faces
    ['player-drop-zone', 'enemy-drop-zone'].forEach((zoneId, i) => {
        const zone = qs('#' + zoneId);
        if (!zone) return;
        const key = i === 0 ? 'player' : 'enemy';
        const previewId = key + '-face-preview';
        const inputId   = key + '-sprite';

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
