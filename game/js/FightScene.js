/**
 * FightScene.js
 * Main Phaser scene: arena, HUD, round management, per-frame game loop.
 */

class FightScene extends Phaser.Scene {
    constructor() { super({ key: 'FightScene' }); }

    /** Receive config from lobby */
    init(data) { this.cfg = data || {}; }

    // ══════════════════════════════════════════════════════════════════════════
    //  CREATE
    // ══════════════════════════════════════════════════════════════════════════

    create() {
        const W = this.scale.width;
        const H = this.scale.height;
        this.W = W;
        this.H = H;

        this._buildArena();

        const groundY = H - 78;

        // ── Player ────────────────────────────────────────────────────────────
        this.player = new Fighter(this, 190, groundY, {
            side:        'left',
            color:       this.cfg.playerColor || 0x2255cc,
            faceDataURL: faceManager.getFaceDataURL('player')
        });

        // ── Enemy AI ──────────────────────────────────────────────────────────
        this.enemy = new EnemyAI(this, W - 190, groundY, {
            side:        'right',
            color:       this.cfg.enemyColor || 0xcc2222,
            faceDataURL: faceManager.getFaceDataURL('enemy'),
            difficulty:  this.cfg.difficulty || 'normal'
        });

        // Start facing each other
        this.player.facing = 1;
        this.enemy.facing  = -1;

        // ── Keyboard ─────────────────────────────────────────────────────────
        this.keys = this.input.keyboard.addKeys({
            left:       Phaser.Input.Keyboard.KeyCodes.A,
            right:      Phaser.Input.Keyboard.KeyCodes.D,
            up:         Phaser.Input.Keyboard.KeyCodes.W,
            lPunch:     Phaser.Input.Keyboard.KeyCodes.J,
            hPunch:     Phaser.Input.Keyboard.KeyCodes.K,
            kick:       Phaser.Input.Keyboard.KeyCodes.L,
            special:    Phaser.Input.Keyboard.KeyCodes.U,
            block:      Phaser.Input.Keyboard.KeyCodes.SHIFT
        });

        // ── HUD ───────────────────────────────────────────────────────────────
        this.hudGfx   = this.add.graphics().setDepth(10);
        this.timerTxt = this.add.text(W / 2, 8, '99', {
            fontSize: '32px', color: '#ffffff', fontStyle: 'bold',
            stroke: '#000000', strokeThickness: 4
        }).setOrigin(0.5, 0).setDepth(12);

        this.add.text(50,  10, 'PLAYER', { fontSize: '14px', color: '#fff', fontStyle: 'bold' }).setDepth(12);
        this.add.text(W - 50, 10, 'ENEMY',  { fontSize: '14px', color: '#fff', fontStyle: 'bold' }).setDepth(12).setOrigin(1, 0);

        // Win-round dots (best of 3)
        this._playerDots = [];
        this._enemyDots  = [];
        for (let i = 0; i < 2; i++) {
            this._playerDots.push(this.add.circle(50 + i * 18, 45, 7, 0x333333).setDepth(12));
            this._enemyDots.push( this.add.circle(W - 50 - i * 18, 45, 7, 0x333333).setDepth(12));
        }

        // Controls hint at bottom
        this.add.text(W / 2, H - 8,
            'A/D: Move  W: Jump  J: Light  K: Heavy  L: Kick  U: Special (need 2+ combo)  Shift: Block',
            { fontSize: '10px', color: '#ffffff99' }
        ).setOrigin(0.5, 1).setDepth(12);

        // Combo display
        this.comboTxt = this.add.text(W / 2, H / 2, '', {
            fontSize: '46px', color: '#ffff00', fontStyle: 'bold',
            stroke: '#000000', strokeThickness: 5
        }).setOrigin(0.5).setDepth(20).setAlpha(0);

        // ── Round state ───────────────────────────────────────────────────────
        this.round       = 1;
        this.playerWins  = 0;
        this.enemyWins   = 0;
        this.roundActive = false;
        this.roundTimer  = 99;
        this._timerEvt   = null;

        this._showMessage(`ROUND ${this.round}`, () => this._startRound());
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  ARENA BACKGROUND
    // ══════════════════════════════════════════════════════════════════════════

    _buildArena() {
        const { W, H } = this;
        const idx = (this.cfg.arena || 0) % 3;

        const themes = [
            { sky: 0x87ceeb, ground: 0x8b7355, buildingColor: 0x4a8c4a,  accent: 0x336633 },  // city
            { sky: 0x1a1a2e, ground: 0x444444, buildingColor: 0x882222,  accent: 0xff4444 },  // night
            { sky: 0xf5d76e, ground: 0xc09000, buildingColor: 0xa06000,  accent: 0xcc7700 },  // desert
        ];
        const t = themes[idx];

        this.cameras.main.setBackgroundColor(t.sky);

        const bg = this.add.graphics().setDepth(0);

        // Background buildings / structures
        bg.fillStyle(t.buildingColor, 0.75);
        for (let i = 0; i < 7; i++) {
            const bh = 90 + (i % 3) * 55;
            bg.fillRect(i * 120 - 10, H - 78 - bh, 90, bh);
        }

        // Ground
        bg.fillStyle(t.ground, 1);
        bg.fillRect(0, H - 78, W, 78);

        // Ground accent line
        bg.lineStyle(3, t.accent, 0.8);
        bg.lineBetween(0, H - 78, W, H - 78);
        bg.lineStyle(1, t.accent, 0.4);
        bg.lineBetween(0, H - 55, W, H - 55);

        // Arena wall markers
        bg.fillStyle(0xffffff, 0.08);
        bg.fillRect(this.player ? this.player.leftBound : 70, 0, 2, H);
        bg.fillRect(this.player ? this.player.rightBound : 730, 0, 2, H);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  ROUND MANAGEMENT
    // ══════════════════════════════════════════════════════════════════════════

    _startRound() {
        this.roundActive = true;
        this.roundTimer  = 99;
        this._timerEvt = this.time.addEvent({
            delay: 1000, loop: true,
            callback: () => {
                if (!this.roundActive) return;
                this.roundTimer--;
                this.timerTxt.setText(String(this.roundTimer).padStart(2, '0'));
                if (this.roundTimer <= 0) this._endRound('timeout');
            }
        });
        this._showMessage('FIGHT!', null, 800);
    }

    _endRound(reason) {
        if (!this.roundActive) return;
        this.roundActive = false;
        if (this._timerEvt) { this._timerEvt.remove(); this._timerEvt = null; }

        let winner;
        if (this.player.hp <= 0) winner = 'enemy';
        else if (this.enemy.hp <= 0) winner = 'player';
        else winner = this.player.hp >= this.enemy.hp ? 'player' : 'enemy';

        if (winner === 'player') this.playerWins++;
        else this.enemyWins++;

        this._updateDots();

        const msg = winner === 'player' ? 'K.O. — PLAYER WINS!' : 'K.O. — ENEMY WINS!';
        this._showMessage(msg, () => {
            if (this.playerWins >= 2 || this.enemyWins >= 2) {
                this._showMatchEnd(this.playerWins >= 2);
            } else {
                this.round++;
                this._resetFighters();
                this._showMessage(`ROUND ${this.round}`, () => this._startRound());
            }
        });
    }

    _resetFighters() {
        this.player.hp = this.player.maxHP;
        this.player.x  = 190;
        this.player.y  = this.player.groundY;
        this.player.velX = this.player.velY = 0;
        this.player.state = 'idle';
        this.player.isBlocking = false;

        this.enemy.hp = this.enemy.maxHP;
        this.enemy.x  = this.W - 190;
        this.enemy.y  = this.enemy.groundY;
        this.enemy.velX = this.enemy.velY = 0;
        this.enemy.state = 'idle';
        this.enemy.isBlocking = false;
    }

    _updateDots() {
        for (let i = 0; i < this.playerWins; i++) this._playerDots[i].setFillStyle(0xffff00);
        for (let i = 0; i < this.enemyWins;  i++) this._enemyDots[i].setFillStyle(0xff4444);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  MATCH END SCREEN
    // ══════════════════════════════════════════════════════════════════════════

    _showMatchEnd(playerWon) {
        const { W, H } = this;

        this.add.rectangle(W / 2, H / 2, W, H, 0x000000, 0.62).setDepth(25);

        this.add.text(W / 2, H / 2 - 70,
            playerWon ? '🏆 PLAYER WINS THE MATCH!' : '💀 ENEMY WINS THE MATCH!',
            { fontSize: '38px', color: '#fff', fontStyle: 'bold', stroke: '#000', strokeThickness: 5 }
        ).setOrigin(0.5).setDepth(26);

        // Stats
        const pHit = 100 - this.player.hp;
        const eHit = 100 - this.enemy.hp;
        this.add.text(W / 2, H / 2 - 10,
            `Damage dealt — You: ${eHit} | Enemy: ${pHit}`,
            { fontSize: '16px', color: '#ffddaa' }
        ).setOrigin(0.5).setDepth(26);

        // Play Again
        const btnPlay = this.add.text(W / 2, H / 2 + 45, '▶  PLAY AGAIN', {
            fontSize: '26px', color: '#fff', backgroundColor: '#226633',
            padding: { x: 22, y: 10 }
        }).setOrigin(0.5).setDepth(26).setInteractive({ useHandCursor: true });
        btnPlay.on('pointerover',  () => btnPlay.setBackgroundColor('#33aa55'));
        btnPlay.on('pointerout',   () => btnPlay.setBackgroundColor('#226633'));
        btnPlay.on('pointerdown',  () => {
            document.getElementById('lobby-overlay').style.display = 'flex';
            this.scene.stop('FightScene');
        });

        // Share Link
        const btnShare = this.add.text(W / 2, H / 2 + 110, '🔗  SHARE THIS FIGHT', {
            fontSize: '20px', color: '#fff', backgroundColor: '#224488',
            padding: { x: 22, y: 10 }
        }).setOrigin(0.5).setDepth(26).setInteractive({ useHandCursor: true });
        btnShare.on('pointerover',  () => btnShare.setBackgroundColor('#3366aa'));
        btnShare.on('pointerout',   () => btnShare.setBackgroundColor('#224488'));
        btnShare.on('pointerdown',  () => shareManager.copyAndShowLink());
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  OVERLAY MESSAGE
    // ══════════════════════════════════════════════════════════════════════════

    _showMessage(text, callback, duration = 1500) {
        const txt = this.add.text(this.W / 2, this.H / 2, text, {
            fontSize: '68px', color: '#fff', fontStyle: 'bold',
            stroke: '#000000', strokeThickness: 7
        }).setOrigin(0.5).setDepth(30);
        this.time.delayedCall(duration, () => {
            txt.destroy();
            if (callback) callback();
        });
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  UPDATE LOOP
    // ══════════════════════════════════════════════════════════════════════════

    update(_time, delta) {
        if (!this.roundActive) return;

        const dt = delta / 1000;

        this._handleInput();
        this.player.update(dt);
        this.enemy.update(dt);
        this.enemy.updateAI(dt, this.player);

        // Keep fighters facing each other
        if (this.player.x < this.enemy.x) {
            this.player.facing = 1; this.enemy.facing = -1;
        } else {
            this.player.facing = -1; this.enemy.facing = 1;
        }

        // Simple body separation: prevent overlap
        const overlap = 44;
        if (Math.abs(this.player.x - this.enemy.x) < overlap) {
            const push = (overlap - Math.abs(this.player.x - this.enemy.x)) / 2;
            if (this.player.x < this.enemy.x) {
                this.player.x -= push;  this.enemy.x += push;
            } else {
                this.player.x += push;  this.enemy.x -= push;
            }
        }

        this._checkCombat();
        this._updateHUD();

        this.player.draw();
        this.enemy.draw();

        if (this.player.hp <= 0 || this.enemy.hp <= 0) this._endRound('ko');
    }

    // ── Input ─────────────────────────────────────────────────────────────────

    _handleInput() {
        const k = this.keys;
        const p = this.player;
        if (p.state === 'ko') return;

        if (k.left.isDown)       p.moveLeft();
        else if (k.right.isDown) p.moveRight();
        else                     p.stopMoving();

        if (Phaser.Input.Keyboard.JustDown(k.up))      p.jump();
        if (Phaser.Input.Keyboard.JustDown(k.lPunch))  p.lightPunch();
        if (Phaser.Input.Keyboard.JustDown(k.hPunch))  p.heavyPunch();
        if (Phaser.Input.Keyboard.JustDown(k.kick))    p.kick();
        if (Phaser.Input.Keyboard.JustDown(k.special)) p.special();
        p.block(k.block.isDown);
    }

    // ── Hit detection ─────────────────────────────────────────────────────────

    _checkCombat() {
        this._checkHit(this.player, this.enemy, 'player');
        this._checkHit(this.enemy,  this.player, 'enemy');
    }

    _checkHit(attacker, defender, side) {
        if (attacker.hitThisAttack) return;
        const hb = attacker.getAttackHitbox();
        if (!hb) return;
        const db = defender.getBounds();
        if (this._overlaps(hb, db)) {
            const dmg    = attacker.getAttackDamage();
            const result = defender.takeHit(dmg);
            if (result.hit) {
                attacker.hitThisAttack = true;
                attacker.combo++;
                attacker.comboTimer = 2.0;
                this._showCombo(attacker.combo, side);
            }
        }
    }

    _overlaps(a, b) {
        return a.x < b.x + b.width  && a.x + a.width  > b.x &&
               a.y < b.y + b.height && a.y + a.height > b.y;
    }

    _showCombo(count, side) {
        if (count < 2) return;
        const xPos = side === 'player' ? 200 : this.W - 200;
        this.comboTxt.setPosition(xPos, this.H * 0.45);
        this.comboTxt.setText(`${count} HIT COMBO!`);
        this.comboTxt.setAlpha(1);
        this.tweens.killTweensOf(this.comboTxt);
        this.tweens.add({
            targets: this.comboTxt, alpha: 0, y: this.H * 0.35,
            duration: 950, ease: 'Power2'
        });
    }

    // ── HUD ───────────────────────────────────────────────────────────────────

    _updateHUD() {
        const g   = this.hudGfx;
        const W   = this.W;
        const BAR_W = 270, BAR_H = 18, BAR_Y = 14;
        g.clear();

        const drawBar = (pct, x, col) => {
            g.fillStyle(0x222222, 1);
            g.fillRect(x, BAR_Y, BAR_W, BAR_H);
            g.fillStyle(col, 1);
            g.fillRect(x, BAR_Y, Math.max(0, BAR_W * pct), BAR_H);
            g.lineStyle(2, 0xffffff, 0.6);
            g.strokeRect(x, BAR_Y, BAR_W, BAR_H);
        };

        const pp = this.player.hp / this.player.maxHP;
        const ep = this.enemy.hp  / this.enemy.maxHP;
        drawBar(pp, 50,       pp > 0.3 ? 0x44ff44 : 0xff3333);
        drawBar(ep, W - 320, ep > 0.3 ? 0xff4444 : 0xff8800);
    }
}
