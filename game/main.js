/**
 * main.js
 * Initialises Phaser and wires up the sprite-upload / animation UI.
 */

// ── Phaser game configuration ─────────────────────────────────────────────────
const config = {
    type:   Phaser.AUTO,
    width:  1024,
    height: 576,
    parent: 'game-container',
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 420 },
            debug:   false
        }
    },
    scene:  GameScene,
    render: {
        pixelArt:  false,
        antialias: true
    }
};

const game = new Phaser.Game(config);

// ── Helpers ───────────────────────────────────────────────────────────────────

function updateStatus(message, isError) {
    const el = document.getElementById('status-message');
    el.textContent = message;
    el.className = isError ? 'error' : '';
}

/** Read frame-config inputs for a given sprite type ('player' or 'enemy'). */
function getSheetConfig(type) {
    return {
        frameWidth:  parseInt(document.getElementById(type + '-fw').value)     || 0,
        frameHeight: parseInt(document.getElementById(type + '-fh').value)     || 0,
        frameCount:  parseInt(document.getElementById(type + '-frames').value) || 1
    };
}

/** Try to get the running GameScene; returns null if not yet ready. */
function getScene() {
    return game.scene.getScene('GameScene');
}

// ── Load buttons ──────────────────────────────────────────────────────────────

document.getElementById('load-player-btn').addEventListener('click', () => {
    const file = document.getElementById('player-sprite').files[0];
    if (!file) { updateStatus('Select a player image first.', true); return; }

    updateStatus('Loading player sprite…', false);
    spriteManager.loadCustomSprite(file, 'player', getSheetConfig('player'), (err, info) => {
        if (err) {
            updateStatus('Player error: ' + err.message, true);
        } else {
            updateStatus(
                `Player sprite loaded (${info.width}×${info.height} px). ` +
                'The character will update in-game automatically.',
                false
            );
        }
    });
});

document.getElementById('load-enemy-btn').addEventListener('click', () => {
    const file = document.getElementById('enemy-sprite').files[0];
    if (!file) { updateStatus('Select an enemy image first.', true); return; }

    updateStatus('Loading enemy sprite…', false);
    spriteManager.loadCustomSprite(file, 'enemy', getSheetConfig('enemy'), (err, info) => {
        if (err) {
            updateStatus('Enemy error: ' + err.message, true);
        } else {
            updateStatus(
                `Enemy sprite loaded (${info.width}×${info.height} px). ` +
                'The character will update in-game automatically.',
                false
            );
        }
    });
});

// ── Apply animation settings ──────────────────────────────────────────────────

document.getElementById('apply-settings-btn').addEventListener('click', () => {
    const playerFPS = parseInt(document.getElementById('player-fps').value) || 10;
    const enemyFPS  = parseInt(document.getElementById('enemy-fps').value)  || 10;

    const scene = getScene();
    if (scene && scene.player) { scene.player.setAnimationFPS(playerFPS); }
    if (scene && scene.enemy)  { scene.enemy.setAnimationFPS(enemyFPS); }

    updateStatus(
        `Animation FPS updated — Player: ${playerFPS}, Enemy: ${enemyFPS}`,
        false
    );
});

// ── Ready ─────────────────────────────────────────────────────────────────────

window.addEventListener('load', () => {
    console.log('2D Endless Runner ready!');
    console.log('Upload custom sprites using the panel on the right.');
});
