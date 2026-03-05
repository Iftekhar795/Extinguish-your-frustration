/**
 * main.js
 * Initialises Phaser and wires up the photo-upload / settings UI.
 */

const config = {
    type:   Phaser.AUTO,
    width:  1024,
    height: 576,
    parent: 'game-container',
    physics: {
        default: 'arcade',
        arcade: { gravity: { y: 420 }, debug: false }
    },
    scene:  GameScene,
    render: { pixelArt: false, antialias: true }
};

const game = new Phaser.Game(config);

// ── Helpers ───────────────────────────────────────────────────────────────────

function updateStatus(msg, isError) {
    const el = document.getElementById('status-message');
    el.textContent = msg;
    el.className   = isError ? 'error' : '';
}

function getSheetConfig(type) {
    return {
        frameWidth:  parseInt(document.getElementById(type + '-fw').value)     || 0,
        frameHeight: parseInt(document.getElementById(type + '-fh').value)     || 0,
        frameCount:  parseInt(document.getElementById(type + '-frames').value) || 1
    };
}

function getScene() { return game.scene.getScene('GameScene'); }

// ── Load buttons ──────────────────────────────────────────────────────────────

document.getElementById('load-player-btn').addEventListener('click', () => {
    const file = document.getElementById('player-sprite').files[0];
    if (!file) { updateStatus('Select a Player 1 photo first.', true); return; }

    updateStatus('Detecting face and building fighter sprite…', false);
    spriteManager.loadCustomSprite(file, 'player', getSheetConfig('player'), (err, info) => {
        if (err) {
            updateStatus('Player error: ' + err.message, true);
        } else {
            const faceMsg = info.faceDetected
                ? '✅ Face detected & placed on fighter!'
                : '⚠️ No face found — used centre crop. (Works best on portrait photos.)';
            updateStatus(`Player loaded (${info.width}×${info.height} px). ${faceMsg}`, false);
        }
    });
});

document.getElementById('load-enemy-btn').addEventListener('click', () => {
    const file = document.getElementById('enemy-sprite').files[0];
    if (!file) { updateStatus('Select a CPU photo first.', true); return; }

    updateStatus('Detecting face and building fighter sprite…', false);
    spriteManager.loadCustomSprite(file, 'enemy', getSheetConfig('enemy'), (err, info) => {
        if (err) {
            updateStatus('CPU error: ' + err.message, true);
        } else {
            const faceMsg = info.faceDetected
                ? '✅ Face detected & placed on fighter!'
                : '⚠️ No face found — used centre crop.';
            updateStatus(`CPU loaded (${info.width}×${info.height} px). ${faceMsg}`, false);
        }
    });
});

// ── Apply animation settings ──────────────────────────────────────────────────

document.getElementById('apply-settings-btn').addEventListener('click', () => {
    const playerFPS = parseInt(document.getElementById('player-fps').value) || 10;
    const enemyFPS  = parseInt(document.getElementById('enemy-fps').value)  || 10;
    updateStatus(`Settings applied — P1 FPS: ${playerFPS}, CPU FPS: ${enemyFPS}`, false);
});

// ── Ready ─────────────────────────────────────────────────────────────────────

window.addEventListener('load', () => {
    console.log('Boxing Fighter ready!');
    console.log('Upload a portrait photo to put your face on your fighter!');
});
