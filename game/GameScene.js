/**
 * GameScene.js
 * Main Phaser scene: creates the world, spawns player / enemy / obstacles,
 * handles collisions, score, and game-over / restart flow.
 *
 * Design: fixed camera — player stays on the left, everything moves right-to-left.
 */

class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
        this.player        = null;
        this.enemy         = null;
        this.platforms     = null;
        this.obstacles     = null;
        this.score         = 0;
        this.isGameOver    = false;
        this.scoreText     = null;
        this.spawnTimer    = null;
        this.obstacleSpeed = 290; // px/s, increases slowly over time
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Lifecycle
    // ═══════════════════════════════════════════════════════════════════════

    preload() {
        // Nothing to preload — all default textures are generated in create()
    }

    create() {
        const W       = this.scale.width;
        const H       = this.scale.height;
        const groundY = H - 80; // top of the ground (where characters stand)

        // ── Background ─────────────────────────────────────────────────────
        this.cameras.main.setBackgroundColor('#87CEEB');
        this._drawBackground(W, H);

        // ── Default procedural textures ─────────────────────────────────────
        this._createDefaultTextures(W);

        // ── Ground ──────────────────────────────────────────────────────────
        this.platforms = this.physics.add.staticGroup();
        // A wide grass/dirt strip along the bottom
        const groundImg = this.platforms.create(W / 2, H - 40, 'ground-tex');
        groundImg.setDisplaySize(W, 80).refreshBody();

        // ── Player ──────────────────────────────────────────────────────────
        const playerTex = spriteManager.isLoaded('player') ? 'player-custom' : 'player-default';
        this.player = new PlayerController(this, 150, groundY, playerTex);

        // ── Enemy ───────────────────────────────────────────────────────────
        const enemyTex = spriteManager.isLoaded('enemy') ? 'enemy-custom' : 'enemy-default';
        this.enemy = new EnemyAI(this, W + 320, groundY, enemyTex);

        // ── Obstacle pool ───────────────────────────────────────────────────
        this.obstacles = this.physics.add.group();
        this._spawnObstacle(); // first obstacle right away

        this.spawnTimer = this.time.addEvent({
            delay:         1700,
            callback:      this._spawnObstacle,
            callbackScope: this,
            loop:          true
        });

        // ── Physics colliders / overlaps ─────────────────────────────────────
        this.physics.add.collider(this.player.sprite, this.platforms);
        this.physics.add.collider(this.enemy.sprite,  this.platforms);

        this.physics.add.overlap(
            this.player.sprite, this.obstacles,
            this._onHitObstacle, null, this
        );
        this.physics.add.overlap(
            this.player.sprite, this.enemy.sprite,
            this._onHitEnemy, null, this
        );

        // ── HUD ─────────────────────────────────────────────────────────────
        this.scoreText = this.add.text(W - 20, 16, 'Score: 0', {
            fontSize:        '26px',
            fill:            '#ffffff',
            stroke:          '#000000',
            strokeThickness: 3,
            fontStyle:       'bold'
        }).setOrigin(1, 0).setDepth(5);

        this.add.text(W / 2, 16, '↑ / W / Space / Tap — Jump', {
            fontSize:        '15px',
            fill:            '#ffffff',
            stroke:          '#000000',
            strokeThickness: 2
        }).setOrigin(0.5, 0).setDepth(5);

        // ── Listen for hot-swapped custom sprites ────────────────────────────
        this.events.on('spriteUpdated', this._onSpriteUpdated, this);
        spriteManager.setScene(this);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Background helpers
    // ═══════════════════════════════════════════════════════════════════════

    _drawBackground(W, H) {
        // Sky gradient
        const sky = this.add.graphics().setDepth(0);
        sky.fillGradientStyle(0x5BA8D9, 0x5BA8D9, 0xB8E4F8, 0xB8E4F8, 1);
        sky.fillRect(0, 0, W, H - 80);

        // Distant mountains — [x, y, width, height]
        const MOUNTAIN_POSITIONS = [
            [80,  H - 140, 120, 100],
            [280, H - 160, 150, 120],
            [510, H - 130, 130,  90],
            [720, H - 155, 160, 130],
            [950, H - 125, 110,  85]
        ];
        const mtn = this.add.graphics().setDepth(1);
        mtn.fillStyle(0x7EB8D0, 0.6);
        MOUNTAIN_POSITIONS.forEach(([x, y, w, h]) => {
            mtn.fillTriangle(x - w / 2, y + h, x, y, x + w / 2, y + h);
        });

        // Clouds — [centerX, centerY, radiusX, radiusY]
        const CLOUD_POSITIONS = [
            [130, 65, 55, 22],
            [380, 50, 75, 28],
            [650, 70, 60, 24],
            [900, 55, 70, 26]
        ];
        const clouds = this.add.graphics().setDepth(2);
        clouds.fillStyle(0xFFFFFF, 0.85);
        CLOUD_POSITIONS.forEach(([cx, cy, rx, ry]) => {
            clouds.fillEllipse(cx - 15, cy, rx * 1.4, ry * 1.2);
            clouds.fillEllipse(cx + 10, cy - 8, rx, ry * 1.4);
            clouds.fillEllipse(cx + 35, cy, rx * 1.2, ry);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Default procedural textures (used when no custom sprite is uploaded)
    // ═══════════════════════════════════════════════════════════════════════

    _createDefaultTextures(W) {
        // ── Player: blue body + gold head ───────────────────────────────────
        if (!this.textures.exists('player-default')) {
            const g = this.make.graphics({ add: false });
            // Body
            g.fillStyle(0x2563EB);
            g.fillRoundedRect(8, 18, 24, 28, 4);
            // Head
            g.fillStyle(0xFBBF24);
            g.fillCircle(20, 10, 10);
            // Eye
            g.fillStyle(0x1E3A5F);
            g.fillCircle(24, 8, 2.5);
            // Mouth (smile)
            g.fillStyle(0x1E3A5F);
            g.fillRect(20, 13, 6, 2);
            g.generateTexture('player-default', 40, 48);
            g.destroy();
        }

        // ── Enemy: red body + orange head ───────────────────────────────────
        if (!this.textures.exists('enemy-default')) {
            const g = this.make.graphics({ add: false });
            g.fillStyle(0xDC2626);
            g.fillRoundedRect(8, 18, 24, 28, 4);
            g.fillStyle(0xF97316);
            g.fillCircle(20, 10, 10);
            g.fillStyle(0x7F1D1D);
            g.fillCircle(24, 8, 2.5);
            // Frown
            g.fillStyle(0x7F1D1D);
            g.fillRect(20, 15, 6, 2);
            g.generateTexture('enemy-default', 40, 48);
            g.destroy();
        }

        // ── Ground ───────────────────────────────────────────────────────────
        if (!this.textures.exists('ground-tex')) {
            const g = this.make.graphics({ add: false });
            g.fillStyle(0x6B4423); // dirt
            g.fillRect(0, 12, W, 68);
            g.fillStyle(0x22C55E); // grass stripe
            g.fillRect(0, 0, W, 14);
            g.generateTexture('ground-tex', W, 80);
            g.destroy();
        }

        // ── Obstacle: spiky red block ─────────────────────────────────────
        if (!this.textures.exists('obstacle')) {
            const g = this.make.graphics({ add: false });
            g.fillStyle(0xEF4444);
            g.fillRect(2, 14, 26, 42);
            g.fillStyle(0xFCA5A5);
            // Three spikes
            [6, 15, 24].forEach(sx => {
                g.fillTriangle(sx, 14, sx + 5, 2, sx + 10, 14);
            });
            g.generateTexture('obstacle', 30, 56);
            g.destroy();
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Obstacle management
    // ═══════════════════════════════════════════════════════════════════════

    _spawnObstacle() {
        if (this.isGameOver) return;

        const W       = this.scale.width;
        const H       = this.scale.height;
        const groundY = H - 80;

        // Vary height slightly so every obstacle looks a bit different
        const heightScale = Phaser.Math.FloatBetween(0.7, 1.2);
        const spawnX      = W + Phaser.Math.Between(20, 80);

        const obs = this.obstacles.create(spawnX, groundY - 4, 'obstacle');
        obs.setOrigin(0.5, 1);
        obs.setScale(1, heightScale);
        obs.body.setAllowGravity(false);
        obs.body.setImmovable(true);
        // Match physics body to visual size
        obs.body.setSize(24, 52 * heightScale);
        obs.body.setVelocityX(-this.obstacleSpeed);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Collision handlers
    // ═══════════════════════════════════════════════════════════════════════

    _onHitObstacle() {
        this._triggerGameOver('Hit an obstacle!  Score: ');
    }

    _onHitEnemy() {
        this._triggerGameOver('Caught by enemy!  Score: ');
    }

    _triggerGameOver(msg) {
        if (this.isGameOver) return;
        this.isGameOver = true;

        this.physics.pause();
        if (this.spawnTimer) this.spawnTimer.remove();

        this.player.sprite.setTint(0xff4444);

        const W = this.scale.width;
        const H = this.scale.height;

        // Semi-transparent overlay
        this.add.rectangle(W / 2, H / 2, W * 0.65, 150, 0x000000, 0.72).setDepth(20);

        this.add.text(W / 2, H / 2 - 34, msg + this.score, {
            fontSize:        '30px',
            fill:            '#ffffff',
            fontStyle:       'bold',
            stroke:          '#000',
            strokeThickness: 3
        }).setOrigin(0.5).setDepth(21);

        this.add.text(W / 2, H / 2 + 22, 'Press  R  or tap to restart', {
            fontSize: '20px',
            fill:     '#FCD34D'
        }).setOrigin(0.5).setDepth(21);

        this.input.keyboard.once('keydown-R', this._restartGame, this);
        this.input.once('pointerdown',        this._restartGame, this);
    }

    _restartGame() {
        this.score         = 0;
        this.isGameOver    = false;
        this.obstacleSpeed = 290;
        this.scene.restart();
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Live sprite hot-swap
    // ═══════════════════════════════════════════════════════════════════════

    _onSpriteUpdated(type, texKey, data) {
        if (type === 'player' && this.player) {
            this.player.updateTexture(texKey, data);
        }
        if (type === 'enemy' && this.enemy) {
            this.enemy.updateTexture(texKey, data);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════
    // Main update loop
    // ═══════════════════════════════════════════════════════════════════════

    update(time, delta) {
        if (this.isGameOver) return;

        this.player.update();

        // Pass player grounded state so enemy AI can mirror jumps
        const playerPos = this.player.getPosition();
        playerPos.onGround = this.player.sprite.body.blocked.down;
        this.enemy.update(delta, playerPos);

        // Recycle off-screen obstacles and add score
        this.obstacles.children.each(obs => {
            if (obs.active && obs.x < -80) {
                obs.destroy();
                this.score         += 10;
                this.obstacleSpeed  = Math.min(520, this.obstacleSpeed + 1.5);
                this.scoreText.setText('Score: ' + this.score);
            }
        });
    }
}
