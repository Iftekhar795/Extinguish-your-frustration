/**
 * GameScene.js
 * Street Fighter-style boxing game scene.
 *
 * Two fighters face off in an arena. Best-of-3 rounds.
 * Colliders keep fighters on the ground; hit detection is distance-based.
 */

class GameScene extends Phaser.Scene {
    constructor() {
        super({ key: 'GameScene' });
        this.player       = null;
        this.enemy        = null;
        this.platforms    = null;
        this.roundTime    = 60;
        this.roundTimer   = null;
        this.isRoundActive = false;
        this.isGameOver   = false;
        this.roundNumber  = 1;
        this.playerWins   = 0;
        this.enemyWins    = 0;
    }

    preload() {}

    create() {
        const W       = this.scale.width;
        const H       = this.scale.height;
        const groundY = H - 80;

        this._drawBackground(W, H);
        this._createDefaultTextures(W, H);

        // Ground platform
        this.platforms = this.physics.add.staticGroup();
        const ground = this.platforms.create(W / 2, H - 40, 'ground-tex');
        ground.setDisplaySize(W, 80).refreshBody();

        // Fighters
        const playerTex = spriteManager.isLoaded('player') ? 'player-custom' : 'player-default';
        const enemyTex  = spriteManager.isLoaded('enemy')  ? 'enemy-custom'  : 'enemy-default';
        this.player = new PlayerController(this, 220, groundY, playerTex);
        this.enemy  = new EnemyAI(this, W - 220, groundY, enemyTex);

        // Ground colliders
        this.physics.add.collider(this.player.sprite, this.platforms);
        this.physics.add.collider(this.enemy.sprite,  this.platforms);

        // HUD
        this._createHUD(W, H);

        // Kick off first round
        this._startRound();

        // Hot-swap uploaded sprites
        this.events.on('spriteUpdated', this._onSpriteUpdated, this);
        spriteManager.setScene(this);
    }

    // ── Background ──────────────────────────────────────────────────────────

    _drawBackground(W, H) {
        // Night sky gradient
        const sky = this.add.graphics().setDepth(0);
        sky.fillGradientStyle(0x0d0b1e, 0x0d0b1e, 0x1a1040, 0x1a1040, 1);
        sky.fillRect(0, 0, W, H - 80);

        // City silhouette
        const city = this.add.graphics().setDepth(1);
        city.fillStyle(0x080812);
        [
            [0,     H - 260, 120, 180],
            [80,    H - 300, 80,  220],
            [210,   H - 240, 100, 160],
            [340,   H - 280, 90,  200],
            [470,   H - 210, 80,  130],
            [590,   H - 270, 110, 190],
            [730,   H - 240, 90,  160],
            [860,   H - 280, 100, 200],
            [970,   H - 220, 80,  140],
            [W-70,  H - 250, 70,  170]
        ].forEach(([x, y, w, h]) => city.fillRect(x, y, w, h));

        // Building window lights
        const wl = this.add.graphics().setDepth(2);
        wl.fillStyle(0xFFDD55, 0.6);
        [
            [22,  H-250, 7, 7], [42,  H-250, 7, 7], [22,  H-230, 7, 7],
            [90,  H-290, 7, 7], [110, H-290, 7, 7], [90,  H-270, 7, 7],
            [600, H-260, 7, 7], [620, H-260, 7, 7], [600, H-240, 7, 7],
            [870, H-270, 7, 7], [890, H-270, 7, 7], [870, H-250, 7, 7]
        ].forEach(([x, y, w, h]) => wl.fillRect(x, y, w, h));

        // Crowd silhouettes
        const crowd = this.add.graphics().setDepth(3);
        crowd.fillStyle(0x06060f, 0.98);
        for (let i = 0; i < W; i += 28) {
            crowd.fillEllipse(i + 14, H - 80, 24, 26 + Math.sin(i * 0.28) * 10);
        }

        // Neon top strips
        const neon = this.add.graphics().setDepth(4);
        neon.fillStyle(0xFF0066, 0.8); neon.fillRect(0, 0, W, 3);
        neon.fillStyle(0x00FFCC, 0.8); neon.fillRect(0, 5, W, 2);

        // Arena spotlight cones
        const spots = this.add.graphics().setDepth(5);
        spots.fillStyle(0xFFFFCC, 0.04);
        spots.fillTriangle(W * 0.25, 88, W * 0.25 - 140, H - 80, W * 0.25 + 140, H - 80);
        spots.fillTriangle(W * 0.75, 88, W * 0.75 - 140, H - 80, W * 0.75 + 140, H - 80);
    }

    // ── Default procedural textures ─────────────────────────────────────────

    _createDefaultTextures(W, H) {
        // Player: blue-shorts fighter
        if (!this.textures.exists('player-default')) {
            const g = this.make.graphics({ add: false });
            g.fillStyle(0x1D4ED8); g.fillRect(12, 52, 36, 24);           // shorts
            g.fillStyle(0xE8A87C); g.fillRoundedRect(10, 22, 40, 34, 5); // torso
            g.fillStyle(0xE8A87C); g.fillCircle(30, 14, 13);             // head
            g.fillStyle(0x2D1B00); g.fillRect(18, 3, 24, 9);             // hair
            g.fillStyle(0x000000); g.fillCircle(24, 12, 2.5); g.fillCircle(36, 12, 2.5); // eyes
            g.fillStyle(0x000000); g.fillRect(26, 19, 8, 2);             // mouth
            g.fillStyle(0xFFFFFF); g.fillCircle(5, 40, 8); g.fillCircle(55, 40, 8);      // gloves
            g.fillStyle(0xCCCCCC); g.fillRect(1, 36, 8, 5); g.fillRect(51, 36, 8, 5);
            g.fillStyle(0xE8A87C); g.fillRect(13, 74, 14, 18); g.fillRect(33, 74, 14, 18); // legs
            g.fillStyle(0xCC0000); g.fillRoundedRect(9, 88, 20, 10, 3); g.fillRoundedRect(31, 88, 20, 10, 3);
            g.generateTexture('player-default', 60, 100);
            g.destroy();
        }

        // Enemy: red-shorts fighter with mohawk
        if (!this.textures.exists('enemy-default')) {
            const g = this.make.graphics({ add: false });
            g.fillStyle(0xDC2626); g.fillRect(12, 52, 36, 24);
            g.fillStyle(0xC47A3A); g.fillRoundedRect(10, 22, 40, 34, 5);
            g.fillStyle(0xC47A3A); g.fillCircle(30, 14, 13);
            g.fillStyle(0xFF6600); g.fillRect(23, 2, 14, 10); g.fillTriangle(23, 2, 30, -8, 37, 2);
            g.fillStyle(0x000000); g.fillCircle(24, 12, 2.5); g.fillCircle(36, 12, 2.5);
            g.fillStyle(0x000000); g.fillRect(26, 19, 8, 3);
            g.fillStyle(0x111111); g.fillCircle(5, 40, 8); g.fillCircle(55, 40, 8);
            g.fillStyle(0x333333); g.fillRect(1, 36, 8, 5); g.fillRect(51, 36, 8, 5);
            g.fillStyle(0xC47A3A); g.fillRect(13, 74, 14, 18); g.fillRect(33, 74, 14, 18);
            g.fillStyle(0x000000); g.fillRoundedRect(9, 88, 20, 10, 3); g.fillRoundedRect(31, 88, 20, 10, 3);
            g.generateTexture('enemy-default', 60, 100);
            g.destroy();
        }

        // Dark wood arena floor
        if (!this.textures.exists('ground-tex')) {
            const g = this.make.graphics({ add: false });
            g.fillStyle(0x3D2010); g.fillRect(0, 0, W, 80);
            g.fillStyle(0x4A2814);
            for (let i = 0; i < W; i += 100) g.fillRect(i, 0, 2, 80);
            g.fillStyle(0x5C3318);
            for (let i = 50; i < W; i += 100) g.fillRect(i, 0, 1, 80);
            g.fillStyle(0x6A3D20); g.fillRect(0, 0, W, 5);
            g.fillStyle(0xFFFFFF);
            g.fillRect(W / 2 - 1, 8, 2, 64);   // center line
            g.fillRect(70, 8, 2, 64);            // left corner marker
            g.fillRect(W - 72, 8, 2, 64);        // right corner marker
            g.generateTexture('ground-tex', W, 80);
            g.destroy();
        }
    }

    // ── HUD ─────────────────────────────────────────────────────────────────

    _createHUD(W, H) {
        const D = 10;

        // Dark top strip
        const hbg = this.add.graphics().setDepth(D);
        hbg.fillStyle(0x000000, 0.78); hbg.fillRect(0, 0, W, 86);
        hbg.lineStyle(2, 0xFF0066, 0.5); hbg.strokeRect(0, 0, W, 86);

        // Fighter name labels
        this.add.text(52, 8, 'P1',  { fontSize: '12px', fill: '#FF0066', fontStyle: 'bold', stroke: '#000', strokeThickness: 2 }).setDepth(D + 5);
        this.add.text(W - 52, 8, 'CPU', { fontSize: '12px', fill: '#00FFCC', fontStyle: 'bold', stroke: '#000', strokeThickness: 2 }).setOrigin(1, 0).setDepth(D + 5);

        // Win-round stars
        this.p1WinLabel = this.add.text(52, 63, '', { fontSize: '16px', fill: '#FFD700', fontStyle: 'bold' }).setDepth(D + 5);
        this.p2WinLabel = this.add.text(W - 52, 63, '', { fontSize: '16px', fill: '#FFD700', fontStyle: 'bold' }).setOrigin(1, 0).setDepth(D + 5);
        this._refreshWinStars();

        // HP bar backgrounds
        const bgr = this.add.graphics().setDepth(D + 1);
        bgr.fillStyle(0x1a1a1a);
        bgr.fillRect(52, 24, 370, 32);
        bgr.fillRect(W - 422, 24, 370, 32);

        // HP bar fill graphics (redrawn each frame)
        this.p1Hp = this.add.graphics().setDepth(D + 2);
        this.p2Hp = this.add.graphics().setDepth(D + 2);

        // HP numbers
        this.p1HpTxt = this.add.text(57, 27, '100', { fontSize: '18px', fill: '#FFF', fontStyle: 'bold', stroke: '#000', strokeThickness: 3 }).setDepth(D + 4);
        this.p2HpTxt = this.add.text(W - 57, 27, '100', { fontSize: '18px', fill: '#FFF', fontStyle: 'bold', stroke: '#000', strokeThickness: 3 }).setOrigin(1, 0).setDepth(D + 4);

        // Round countdown timer
        this.timerTxt = this.add.text(W / 2, 10, '60', { fontSize: '44px', fill: '#FFF', fontStyle: 'bold', stroke: '#000', strokeThickness: 5 }).setOrigin(0.5, 0).setDepth(D + 5);

        // Round label
        this.roundLbl = this.add.text(W / 2, 60, 'ROUND 1', { fontSize: '13px', fill: '#FFDD00', fontStyle: 'bold', stroke: '#000', strokeThickness: 2 }).setOrigin(0.5, 0).setDepth(D + 5);

        // Initial HP bar draw (all text objects are now ready)
        this._refreshHPBars();
    }

    _refreshHPBars() {
        if (!this.player || !this.enemy) return;
        const W  = this.scale.width;
        const p1r = Math.max(0, this.player.hp / 100);
        const p2r = Math.max(0, this.enemy.hp  / 100);
        const p1c = p1r > 0.5 ? 0x00DD44 : p1r > 0.25 ? 0xFFAA00 : 0xFF2222;
        const p2c = p2r > 0.5 ? 0x00DD44 : p2r > 0.25 ? 0xFFAA00 : 0xFF2222;

        this.p1Hp.clear();
        this.p1Hp.fillStyle(p1c);
        this.p1Hp.fillRect(52, 24, Math.floor(370 * p1r), 32);

        this.p2Hp.clear();
        this.p2Hp.fillStyle(p2c);
        const bw = Math.floor(370 * p2r);
        this.p2Hp.fillRect(W - 422 + (370 - bw), 24, bw, 32);

        this.p1HpTxt.setText(Math.ceil(this.player.hp).toString());
        this.p2HpTxt.setText(Math.ceil(this.enemy.hp).toString());
    }

    _refreshWinStars() {
        this.p1WinLabel.setText('★'.repeat(this.playerWins));
        this.p2WinLabel.setText('★'.repeat(this.enemyWins));
    }

    // ── Round flow ───────────────────────────────────────────────────────────

    _startRound() {
        this.isRoundActive = false;
        this.roundTime = 60;
        this.roundLbl.setText('ROUND ' + this.roundNumber);
        this.timerTxt.setText('60').setStyle({ fill: '#FFFFFF' });

        const W = this.scale.width, H = this.scale.height;
        const t = this.add.text(W / 2, H / 2, 'ROUND ' + this.roundNumber, {
            fontSize: '72px', fill: '#FFDD00', fontStyle: 'bold', stroke: '#000', strokeThickness: 8
        }).setOrigin(0.5).setDepth(30).setAlpha(0);

        this.tweens.add({
            targets: t, alpha: 1, scaleX: { from: 0.6, to: 1 }, scaleY: { from: 0.6, to: 1 }, duration: 350,
            onComplete: () => this.time.delayedCall(900, () => {
                this.tweens.add({
                    targets: t, alpha: 0, duration: 250,
                    onComplete: () => { t.destroy(); this._showFight(); }
                });
            })
        });
    }

    _showFight() {
        const W = this.scale.width, H = this.scale.height;
        const ft = this.add.text(W / 2, H / 2, 'FIGHT!', {
            fontSize: '96px', fill: '#FF4400', fontStyle: 'bold', stroke: '#FFD700', strokeThickness: 6
        }).setOrigin(0.5).setDepth(30).setAlpha(0);

        this.tweens.add({
            targets: ft, alpha: 1, scaleX: { from: 0.2, to: 1 }, scaleY: { from: 0.2, to: 1 },
            duration: 220, ease: 'Back.easeOut',
            onComplete: () => this.time.delayedCall(500, () => {
                this.tweens.add({
                    targets: ft, alpha: 0, scaleX: 1.4, scaleY: 1.4, duration: 280,
                    onComplete: () => {
                        ft.destroy();
                        this.isRoundActive = true;
                        this.roundTimer = this.time.addEvent({
                            delay: 1000, callback: this._tickTimer, callbackScope: this, loop: true
                        });
                    }
                });
            })
        });
    }

    _tickTimer() {
        if (!this.isRoundActive) return;
        this.roundTime = Math.max(0, this.roundTime - 1);
        this.timerTxt.setText(this.roundTime.toString());
        if (this.roundTime <= 10) this.timerTxt.setStyle({ fill: '#FF4444' });
        if (this.roundTime <= 0) this._endRound('time');
    }

    _endRound(reason) {
        if (!this.isRoundActive) return;
        this.isRoundActive = false;
        if (this.roundTimer) { this.roundTimer.remove(); this.roundTimer = null; }

        const W = this.scale.width, H = this.scale.height;
        let winner;
        if (reason === 'time') {
            if (this.player.hp > this.enemy.hp) {
                winner = 'player';
            } else if (this.enemy.hp > this.player.hp) {
                winner = 'enemy';
            } else {
                // Exact tie — both fighters earn a win point (split round)
                winner = 'draw';
            }
        } else {
            winner = reason; // 'player' or 'enemy' via KO
        }

        if (winner === 'player') this.playerWins++;
        else if (winner === 'enemy') this.enemyWins++;
        else { this.playerWins++; this.enemyWins++; } // draw: both get a point
        this._refreshWinStars();

        const topMsg = reason === 'time' ? 'TIME!' : 'K.O.!';
        const subMsg = winner === 'player' ? 'PLAYER 1 WINS!'
                     : winner === 'enemy'  ? 'CPU WINS!'
                     :                       'DRAW!';

        const mt = this.add.text(W / 2, H / 2 - 30, topMsg, {
            fontSize: '80px', fill: '#FFDD00', fontStyle: 'bold', stroke: '#000', strokeThickness: 8
        }).setOrigin(0.5).setDepth(30).setAlpha(0);
        const st = this.add.text(W / 2, H / 2 + 60, subMsg, {
            fontSize: '32px', fill: '#FFFFFF', fontStyle: 'bold', stroke: '#000', strokeThickness: 4
        }).setOrigin(0.5).setDepth(30).setAlpha(0);

        this.tweens.add({
            targets: [mt, st], alpha: 1,
            scaleX: { from: 1.8, to: 1 }, scaleY: { from: 1.8, to: 1 }, duration: 400
        });

        const matchOver = this.playerWins >= 2 || this.enemyWins >= 2;
        this.time.delayedCall(2200, () => {
            mt.destroy(); st.destroy();
            if (matchOver) this._showMatchResult(winner);
            else { this.roundNumber++; this._resetRound(); }
        });
    }

    _resetRound() {
        const W = this.scale.width, H = this.scale.height;
        this.player.reset(220, H - 80);
        this.enemy.reset(W - 220, H - 80);
        this._refreshHPBars();
        this._startRound();
    }

    _showMatchResult(winner) {
        this.isGameOver = true;
        const W = this.scale.width, H = this.scale.height;

        this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.75).setDepth(40);

        const col  = winner === 'player' ? '#00FF44' : winner === 'enemy' ? '#FF4400' : '#FFD700';
        const name = winner === 'player' ? 'PLAYER 1' : winner === 'enemy' ? 'CPU' : 'DRAW';
        const sub  = winner === 'draw'   ? 'WELL FOUGHT!' : 'WINS THE MATCH!';

        this.add.text(W / 2, H / 2 - 60, name, {
            fontSize: '64px', fill: col, fontStyle: 'bold', stroke: '#000', strokeThickness: 8
        }).setOrigin(0.5).setDepth(41);
        this.add.text(W / 2, H / 2 + 10, sub, {
            fontSize: '36px', fill: '#FFD700', fontStyle: 'bold', stroke: '#000', strokeThickness: 5
        }).setOrigin(0.5).setDepth(41);
        this.add.text(W / 2, H / 2 + 80, 'Press  R  or tap to play again', {
            fontSize: '22px', fill: '#FFFFFF', stroke: '#000', strokeThickness: 3
        }).setOrigin(0.5).setDepth(41);

        this.input.keyboard.once('keydown-R', this._restartGame, this);
        this.input.once('pointerdown', this._restartGame, this);
    }

    _restartGame() {
        this.isGameOver  = false;
        this.roundNumber = 1;
        this.playerWins  = 0;
        this.enemyWins   = 0;
        this.scene.restart();
    }

    _onSpriteUpdated(type, texKey, data) {
        if (type === 'player' && this.player) this.player.updateTexture(texKey, data);
        if (type === 'enemy'  && this.enemy)  this.enemy.updateTexture(texKey, data);
    }

    // ── Main game loop ───────────────────────────────────────────────────────

    update(time, delta) {
        if (this.isGameOver || !this.isRoundActive) return;

        this.player.update(delta, this.enemy);
        this.enemy.update(delta, this.player);
        this._refreshHPBars();

        if (!this.isRoundActive) return; // guard against _endRound() called inside update
        if (this.player.hp <= 0) this._endRound('enemy');
        else if (this.enemy.hp <= 0) this._endRound('player');
    }
}
