/**
 * FightScene.js
 * Main Phaser scene: arena, fighters, HP bars, round/timer logic, win screen.
 *
 * Accepted config (passed via scene.settings.data or game.registry):
 *   playerConfig  {Object}  - Fighter constructor config for player
 *   enemyConfig   {Object}  - Fighter constructor config for enemy
 *   arenaIndex    {number}  - 0|1|2 which arena to load
 */

const ARENAS = [
    {
        name: 'Steel Factory',
        bgColor:    0x1a1a2e,
        floorColor: 0x444444,
        accentColor: 0xFF6B35,
        clouds: false,
        particles: true,
    },
    {
        name: 'Sunset Dojo',
        bgColor:    0x2D1B69,
        floorColor: 0x8B4513,
        accentColor: 0xFF9F43,
        clouds: true,
        particles: false,
    },
    {
        name: 'Arctic Peak',
        bgColor:    0x0A2342,
        floorColor: 0xBDCDD6,
        accentColor: 0x48CAE4,
        clouds: true,
        particles: true,
    },
];

class FightScene extends Phaser.Scene {
    constructor() {
        super({ key: 'FightScene' });

        this.player      = null;
        this.enemy       = null;
        this._arena      = null;

        // Round state
        this._round       = 1;
        this._maxRounds   = 3;
        this._playerWins  = 0;
        this._enemyWins   = 0;
        this._roundOver   = false;
        this._gameOver    = false;
        this._roundTimer  = 99; // seconds
        this._timerAccum  = 0;

        // Input
        this._keys        = {};
        this._prevKeys    = {};

        // UI elements (Phaser objects)
        this._playerHpBar = null;
        this._enemyHpBar  = null;
        this._timerText   = null;
        this._roundText   = null;
        this._comboText   = null;

        // Bounds
        this._leftBound  = 60;
        this._rightBound = 0; // set in create
    }

    // ── lifecycle ─────────────────────────────────────────────

    init(data) {
        // data may be empty on auto-start; fall back to global pending config
        const cfg = (data && data.playerConfig) ? data : (window._pendingFightConfig || {});
        this._playerConfig = cfg.playerConfig  || {};
        this._enemyConfig  = cfg.enemyConfig   || {};
        this._arenaIdx     = cfg.arenaIndex    !== undefined ? cfg.arenaIndex  : 0;
        this._difficulty   = cfg.difficulty    !== undefined ? cfg.difficulty   : 1;
    }

    create() {
        const W = this.scale.width;
        const H = this.scale.height;

        this._rightBound = W - 60;
        const groundY    = H - 80;

        this._arena = ARENAS[this._arenaIdx % ARENAS.length];

        // ── background ───────────────────────────────────────
        this._drawArena(W, H, groundY);

        // ── fighters ─────────────────────────────────────────
        const playerCfg = {
            ...this._playerConfig,
            x: 160,
            y: groundY,
            facingRight: true,
        };

        const enemyCfg = {
            ...this._enemyConfig,
            x: W - 160,
            y: groundY,
            facingRight: false,
            difficulty: this._difficulty,
        };

        this.player = new Fighter(this, playerCfg);
        this.enemy  = new EnemyAI(this, enemyCfg);
        this.enemy.setPlayer(this.player);

        this._groundY = groundY;

        // ── UI ───────────────────────────────────────────────
        this._createHUD(W);

        // ── input ────────────────────────────────────────────
        this._setupInput();

        // ── "Round 1 – FIGHT!" splash ─────────────────────────
        this._showRoundSplash();
    }

    update(time, delta) {
        if (this._gameOver) return;
        if (this._roundOver) return;

        // ── input → player commands ──────────────────────────
        this._handleInput(delta);

        // ── update fighters ──────────────────────────────────
        this.player.update(delta);
        this.enemy.update(delta);

        // ── bounds clamping ──────────────────────────────────
        this.player.x = Phaser.Math.Clamp(this.player.x, this._leftBound, this._rightBound);
        this.enemy.x  = Phaser.Math.Clamp(this.enemy.x,  this._leftBound, this._rightBound);

        // Fighters face each other
        this.player.facingRight = this.player.x < this.enemy.x;
        this.enemy.facingRight  = this.enemy.x  < this.player.x;

        // ── collision / combat ───────────────────────────────
        this._resolveCombat();

        // ── HUD update ───────────────────────────────────────
        this._updateHUD(delta);

        // ── win condition ────────────────────────────────────
        this._checkRoundEnd();
    }

    // ── arena drawing ─────────────────────────────────────────

    _drawArena(W, H, groundY) {
        const a = this._arena;

        // Sky
        const sky = this.add.graphics();
        sky.fillStyle(a.bgColor, 1);
        sky.fillRect(0, 0, W, H);

        // Gradient overlay
        const grad = this.add.graphics();
        grad.fillGradientStyle(a.bgColor, a.bgColor, 0x000000, 0x000000, 0.0, 0.0, 0.5, 0.5);
        grad.fillRect(0, H * 0.5, W, H * 0.5);

        // Clouds / stars
        if (a.clouds) {
            this._drawClouds(W, H, a.accentColor);
        } else {
            this._drawStars(W, H);
        }

        // Floor
        const floor = this.add.graphics();
        floor.fillStyle(a.floorColor, 1);
        floor.fillRect(0, groundY, W, H - groundY);

        // Floor line
        floor.lineStyle(3, a.accentColor, 0.8);
        floor.beginPath();
        floor.moveTo(0, groundY);
        floor.lineTo(W, groundY);
        floor.strokePath();

        // Arena name
        this.add.text(W / 2, 20, a.name, {
            fontSize: '14px',
            fontFamily: 'Arial',
            color: '#' + a.accentColor.toString(16).padStart(6, '0'),
            alpha: 0.7,
        }).setOrigin(0.5, 0);
    }

    _drawClouds(W, H, color) {
        const g = this.add.graphics();
        g.fillStyle(color, 0.08);
        [[W * 0.15, H * 0.2, 80], [W * 0.55, H * 0.15, 60], [W * 0.8, H * 0.3, 70]].forEach(([x, y, r]) => {
            g.fillCircle(x, y, r);
            g.fillCircle(x + r * 0.7, y + r * 0.2, r * 0.7);
            g.fillCircle(x - r * 0.5, y + r * 0.1, r * 0.6);
        });
    }

    _drawStars(W, H) {
        const g = this.add.graphics();
        g.fillStyle(0xffffff, 1);
        for (let i = 0; i < 60; i++) {
            const x = Math.random() * W;
            const y = Math.random() * H * 0.7;
            g.fillCircle(x, y, Math.random() * 1.5 + 0.5);
        }
    }

    // ── HUD ────────────────────────────────────────────────────

    _createHUD(W) {
        const barW = W * 0.36;
        const barH = 22;
        const barY = 14;

        // Player HP bar (left)
        this._playerHpBg = this.add.graphics();
        this._playerHpBg.fillStyle(0x222222, 0.9);
        this._playerHpBg.fillRoundedRect(10, barY, barW, barH, 4);

        this._playerHpFill = this.add.graphics();

        this.add.text(14, barY + barH + 2, this._playerConfig.name || 'PLAYER 1', {
            fontSize: '11px', fontFamily: 'Arial', color: '#aaaaaa',
        });

        // Enemy HP bar (right)
        this._enemyHpBg = this.add.graphics();
        this._enemyHpBg.fillStyle(0x222222, 0.9);
        this._enemyHpBg.fillRoundedRect(W - 10 - barW, barY, barW, barH, 4);

        this._enemyHpFill = this.add.graphics();

        this.add.text(W - 14, barY + barH + 2, this._enemyConfig.name || 'ENEMY', {
            fontSize: '11px', fontFamily: 'Arial', color: '#aaaaaa',
        }).setOrigin(1, 0);

        // Timer
        this._timerText = this.add.text(W / 2, barY, '99', {
            fontSize: '28px',
            fontFamily: 'Arial Black, Arial',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5, 0);

        // Round wins (pip indicators)
        this._playerWinPips = [];
        this._enemyWinPips  = [];
        for (let i = 0; i < this._maxRounds; i++) {
            const pip = this.add.graphics();
            pip.fillStyle(0x444444, 1);
            pip.fillCircle(20 + i * 14, barY + barH + 16, 5);
            this._playerWinPips.push(pip);

            const ep = this.add.graphics();
            ep.fillStyle(0x444444, 1);
            ep.fillCircle(W - 20 - i * 14, barY + barH + 16, 5);
            this._enemyWinPips.push(ep);
        }

        // Combo text
        this._comboText = this.add.text(W / 2, 70, '', {
            fontSize: '22px',
            fontFamily: 'Arial Black, Arial',
            fontStyle: 'bold',
            color: '#FFD700',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5, 0).setAlpha(0);

        // Controls hint – keyboard shortcuts, hidden on touch devices
        const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        this._controlsHint = this.add.text(W / 2, this.scale.height - 18,
            '← → Move  ↑ Jump  Z Punch  X Kick  C Block  V Special', {
            fontSize: '11px', fontFamily: 'Arial', color: '#888888',
        }).setOrigin(0.5, 1).setVisible(!isMobile);

        this._barW = barW;
        this._barH = barH;
        this._barY = barY;

        // Cache previous HP ratios to avoid unnecessary redraws
        this._prevPlayerHpRatio = -1;
        this._prevEnemyHpRatio  = -1;
    }

    _updateHUD(delta) {
        const W = this.scale.width;

        // Player HP – only redraw when ratio changes
        const pRatio = this.player.hp / this.player.maxHp;
        if (pRatio !== this._prevPlayerHpRatio) {
            this._playerHpFill.clear();
            this._playerHpFill.fillStyle(this._hpColor(pRatio), 1);
            this._playerHpFill.fillRoundedRect(10, this._barY, this._barW * pRatio, this._barH, 4);
            this._prevPlayerHpRatio = pRatio;
        }

        // Enemy HP – only redraw when ratio changes
        const eRatio = this.enemy.hp / this.enemy.maxHp;
        if (eRatio !== this._prevEnemyHpRatio) {
            this._enemyHpFill.clear();
            this._enemyHpFill.fillStyle(this._hpColor(eRatio), 1);
            const eBarX = W - 10 - this._barW;
            const eBarW = this._barW * eRatio;
            this._enemyHpFill.fillRoundedRect(eBarX + (this._barW - eBarW), this._barY, eBarW, this._barH, 4);
            this._prevEnemyHpRatio = eRatio;
        }

        // Timer
        this._timerAccum += delta;
        if (this._timerAccum >= 1000) {
            this._timerAccum -= 1000;
            this._roundTimer = Math.max(0, this._roundTimer - 1);
            this._timerText.setText(String(this._roundTimer).padStart(2, '0'));
            if (this._roundTimer <= 10) {
                this._timerText.setColor('#FF6B35');
            }
        }

        // Combo text fade
        if (this._comboText.alpha > 0) {
            this._comboText.setAlpha(this._comboText.alpha - delta / 1500);
        }
    }

    _hpColor(ratio) {
        if (ratio > 0.5) return 0x2ECC71;
        if (ratio > 0.25) return 0xF39C12;
        return 0xE74C3C;
    }

    _updateWinPips() {
        const fill = 0xFFD700;
        for (let i = 0; i < this._playerWins; i++) {
            this._playerWinPips[i].clear();
            this._playerWinPips[i].fillStyle(fill, 1);
            this._playerWinPips[i].fillCircle(20 + i * 14, this._barY + this._barH + 16, 5);
        }
        for (let i = 0; i < this._enemyWins; i++) {
            this._enemyWinPips[i].clear();
            this._enemyWinPips[i].fillStyle(fill, 1);
            this._enemyWinPips[i].fillCircle(this.scale.width - 20 - i * 14, this._barY + this._barH + 16, 5);
        }
    }

    // ── input ──────────────────────────────────────────────────

    _setupInput() {
        const kb = this.input.keyboard;
        this._keys = {
            left:    kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
            right:   kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
            up:      kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
            punch:   kb.addKey(Phaser.Input.Keyboard.KeyCodes.Z),
            kick:    kb.addKey(Phaser.Input.Keyboard.KeyCodes.X),
            block:   kb.addKey(Phaser.Input.Keyboard.KeyCodes.C),
            special: kb.addKey(Phaser.Input.Keyboard.KeyCodes.V),
        };
    }

    _handleInput(delta) {
        const k  = this._keys;
        const mi = window._mobileInput || {};
        const p  = this.player;

        // Movement (keyboard OR mobile d-pad)
        const goLeft  = (k.left.isDown  && !k.right.isDown) || (mi.left  && !mi.right);
        const goRight = (k.right.isDown && !k.left.isDown)  || (mi.right && !mi.left);
        if      (goLeft)  p.move(-1);
        else if (goRight) p.move(1);
        else              p.move(0);

        // Jump
        if (Phaser.Input.Keyboard.JustDown(k.up) || mi.jumpJustDown) {
            p.jump();
            mi.jumpJustDown = false;
        }

        // Block
        p.setBlocking(k.block.isDown || !!mi.block);

        // Punch (just pressed)
        if (Phaser.Input.Keyboard.JustDown(k.punch) || mi.punchJustDown) {
            if (p.punch()) {
                this.enemy.recordPlayerAttack('punch');
                this._checkPlayerCombo();
            }
            mi.punchJustDown = false;
        }

        // Kick (just pressed)
        if (Phaser.Input.Keyboard.JustDown(k.kick) || mi.kickJustDown) {
            if (p.kick()) {
                this.enemy.recordPlayerAttack('kick');
                this._checkPlayerCombo();
            }
            mi.kickJustDown = false;
        }

        // Special (charge while held, release to fire)
        if (k.special.isDown || mi.specialDown) {
            p.chargeSpecial(delta);
        }
        if (Phaser.Input.Keyboard.JustUp(k.special) || mi.specialJustUp) {
            if (p.getSpecialCharge() >= 50) {
                p.special();
                this.enemy.recordPlayerAttack('special');
            }
            mi.specialJustUp = false;
        }
    }

    _checkPlayerCombo() {
        const combo = this.player.checkCombo();
        if (combo) {
            this._showComboText(combo.name + '! +' + combo.damage);
            // Apply bonus damage to enemy
            this.enemy.receiveHit(combo.damage);
        }
    }

    _showComboText(text) {
        this._comboText.setText(text);
        this._comboText.setAlpha(1);
    }

    // ── combat resolution ─────────────────────────────────────

    _resolveCombat() {
        // Player attacks enemy
        const pAtk = this.player.getAttackHitbox();
        if (pAtk && !this.player._attackHit) {
            if (this._hitboxOverlap(pAtk, this.enemy.getBodyHitbox())) {
                const state  = this.player.state;
                const attack = this.player._attacks[state];
                if (attack) {
                    const dmg = attack.damage;
                    this.enemy.receiveHit(dmg);
                    this.player._attackHit = true;
                    this._spawnHitEffect(this.enemy.x, this.enemy.y - 60, false);
                }
            }
        }

        // Enemy attacks player
        const eAtk = this.enemy.getAttackHitbox();
        if (eAtk && !this.enemy._attackHit) {
            if (this._hitboxOverlap(eAtk, this.player.getBodyHitbox())) {
                const state  = this.enemy.state;
                const attack = this.enemy._attacks[state];
                if (attack) {
                    const dmg = attack.damage;
                    this.player.receiveHit(dmg);
                    this.enemy._attackHit = true;
                    this._spawnHitEffect(this.player.x, this.player.y - 60, true);
                }
            }
        }
    }

    _hitboxOverlap(a, b) {
        return a.x < b.x + b.w &&
               a.x + a.w > b.x &&
               a.y < b.y + b.h &&
               a.y + a.h > b.y;
    }

    _spawnHitEffect(x, y, redTeam) {
        const color = redTeam ? '#ff4444' : '#ffaa00';
        const t = this.add.text(x, y, '★', {
            fontSize: '28px', color, stroke: '#000', strokeThickness: 2,
        }).setOrigin(0.5);
        this.tweens.add({
            targets: t,
            y: y - 40,
            alpha: 0,
            duration: 450,
            ease: 'Power2',
            onComplete: () => t.destroy(),
        });
    }

    // ── round / game logic ────────────────────────────────────

    _checkRoundEnd() {
        if (this._roundOver) return;

        const playerDead = this.player.isKO();
        const enemyDead  = this.enemy.isKO();
        const timedOut   = this._roundTimer <= 0;

        if (!playerDead && !enemyDead && !timedOut) return;

        this._roundOver = true;

        let winner;
        if (enemyDead || (timedOut && this.player.hp >= this.enemy.hp)) {
            winner = 'player';
            this._playerWins++;
        } else if (playerDead || (timedOut && this.enemy.hp > this.player.hp)) {
            winner = 'enemy';
            this._enemyWins++;
        } else {
            winner = 'draw';
        }

        this._updateWinPips();

        // Show round result then continue or end
        const winsNeeded = Math.ceil(this._maxRounds / 2);
        const gameOver   = this._playerWins >= winsNeeded || this._enemyWins >= winsNeeded
                           || this._round >= this._maxRounds;

        const resultText = winner === 'player' ? 'KO!' : winner === 'enemy' ? 'YOU LOSE!' : 'DRAW!';
        const subText    = winner === 'player' ? 'PLAYER WINS' : winner === 'enemy' ? 'ENEMY WINS' : 'DRAW';

        this._showRoundResult(resultText, subText, () => {
            if (gameOver) {
                this._endGame(this._playerWins > this._enemyWins ? 'player' : 'enemy');
            } else {
                this._round++;
                this._nextRound();
            }
        });
    }

    _showRoundResult(big, small, onDone) {
        const W = this.scale.width;
        const H = this.scale.height;
        const overlay = this.add.graphics();
        overlay.fillStyle(0x000000, 0.5);
        overlay.fillRect(0, 0, W, H);

        const bigTxt = this.add.text(W / 2, H / 2 - 20, big, {
            fontSize: '64px',
            fontFamily: 'Arial Black, Arial',
            fontStyle: 'bold',
            color: '#FFD700',
            stroke: '#000000',
            strokeThickness: 6,
        }).setOrigin(0.5);

        const smTxt = this.add.text(W / 2, H / 2 + 40, small, {
            fontSize: '24px',
            fontFamily: 'Arial',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5);

        this.time.delayedCall(2000, () => {
            overlay.destroy();
            bigTxt.destroy();
            smTxt.destroy();
            if (onDone) onDone();
        });
    }

    _showRoundSplash() {
        const W = this.scale.width;
        const H = this.scale.height;

        const roundTxt = this.add.text(W / 2, H / 2, `ROUND ${this._round}`, {
            fontSize: '52px',
            fontFamily: 'Arial Black, Arial',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 5,
        }).setOrigin(0.5).setAlpha(0);

        const fightTxt = this.add.text(W / 2, H / 2 + 60, 'FIGHT!', {
            fontSize: '64px',
            fontFamily: 'Arial Black, Arial',
            fontStyle: 'bold',
            color: '#FF6B35',
            stroke: '#000000',
            strokeThickness: 6,
        }).setOrigin(0.5).setAlpha(0);

        this.tweens.add({ targets: roundTxt, alpha: 1, duration: 300, ease: 'Power2' });
        this.time.delayedCall(600, () => {
            this.tweens.add({ targets: fightTxt, alpha: 1, duration: 200, ease: 'Power2' });
        });
        this.time.delayedCall(1800, () => {
            this.tweens.add({ targets: [roundTxt, fightTxt], alpha: 0, duration: 400, onComplete: () => {
                roundTxt.destroy();
                fightTxt.destroy();
            }});
        });
    }

    _nextRound() {
        // Reset fighters
        const W = this.scale.width;
        this.player.x   = 160;
        this.player.y   = this._groundY;
        this.player.hp  = this.player.maxHp;
        this.player._enterState('idle', 0);
        this._prevPlayerHpRatio = -1; // force HP bar redraw

        this.enemy.x    = W - 160;
        this.enemy.y    = this._groundY;
        this.enemy.hp   = this.enemy.maxHp;
        this.enemy._enterState('idle', 0);
        this._prevEnemyHpRatio = -1; // force HP bar redraw

        this._roundTimer = 99;
        this._timerText.setText('99').setColor('#ffffff');
        this._timerAccum = 0;
        this._roundOver  = false;

        this._showRoundSplash();
    }

    _endGame(winner) {
        this._gameOver = true;
        const W = this.scale.width;
        const H = this.scale.height;

        const overlay = this.add.graphics();
        overlay.fillStyle(0x000000, 0.75);
        overlay.fillRect(0, 0, W, H);

        const isPlayerWin = winner === 'player';
        const headline = isPlayerWin ? '🏆 VICTORY!' : '💀 DEFEATED!';
        const sub      = isPlayerWin
            ? `You won ${this._playerWins} - ${this._enemyWins}`
            : `Enemy won ${this._enemyWins} - ${this._playerWins}`;

        this.add.text(W / 2, H / 2 - 60, headline, {
            fontSize: '56px',
            fontFamily: 'Arial Black, Arial',
            fontStyle: 'bold',
            color: isPlayerWin ? '#FFD700' : '#FF4444',
            stroke: '#000000',
            strokeThickness: 6,
        }).setOrigin(0.5);

        this.add.text(W / 2, H / 2, sub, {
            fontSize: '22px',
            fontFamily: 'Arial',
            color: '#ffffff',
        }).setOrigin(0.5);

        // Share link button
        const shareUrl = this._buildShareUrl();
        const shareTxt = this.add.text(W / 2, H / 2 + 50,
            '🔗 Copy shareable link', {
            fontSize: '16px',
            fontFamily: 'Arial',
            color: '#88DDFF',
            backgroundColor: '#1a1a2e',
            padding: { x: 14, y: 8 },
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        shareTxt.on('pointerover', () => shareTxt.setColor('#ffffff'));
        shareTxt.on('pointerout',  () => shareTxt.setColor('#88DDFF'));
        shareTxt.on('pointerdown', () => {
            this._copyToClipboard(shareUrl);
            shareTxt.setText('✅ Link copied!');
            this.time.delayedCall(2000, () => shareTxt.setText('🔗 Copy shareable link'));
        });

        // Rematch button
        const rematch = this.add.text(W / 2, H / 2 + 100, '⚔️  Rematch', {
            fontSize: '20px',
            fontFamily: 'Arial Black, Arial',
            color: '#FF6B35',
            backgroundColor: '#1a1a2e',
            padding: { x: 20, y: 10 },
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        rematch.on('pointerover', () => rematch.setColor('#FFD700'));
        rematch.on('pointerout',  () => rematch.setColor('#FF6B35'));
        rematch.on('pointerdown', () => {
            this._gameOver = false;
            this._round = 1;
            this._playerWins = 0;
            this._enemyWins  = 0;
            this.scene.restart({
                playerConfig: this._playerConfig,
                enemyConfig:  this._enemyConfig,
                arenaIndex:   this._arenaIdx,
                difficulty:   this._difficulty,
            });
        });

        // Back to setup button
        const backBtn = this.add.text(W / 2, H / 2 + 155, '← Back to Setup', {
            fontSize: '16px',
            fontFamily: 'Arial',
            color: '#aaaaaa',
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });

        backBtn.on('pointerdown', () => {
            this.scene.stop();
            document.getElementById('setup-screen').style.display = 'flex';
            document.getElementById('game-screen').style.display  = 'none';
        });
    }

    // ── share link ────────────────────────────────────────────

    _buildShareUrl() {
        const params = new URLSearchParams({
            playerName:  this._playerConfig.name       || 'Player',
            playerBody:  this._playerConfig.bodyColor  || 0x4169E1,
            playerPants: this._playerConfig.pantsColor || 0x1a1a2e,
            enemyName:   this._enemyConfig.name        || 'Enemy',
            enemyBody:   this._enemyConfig.bodyColor   || 0x8B0000,
            enemyPants:  this._enemyConfig.pantsColor  || 0x1a1a2e,
            arena:       this._arenaIdx,
            difficulty:  this._difficulty,
        });
        return window.location.origin + window.location.pathname + '?' + params.toString();
    }

    _copyToClipboard(text) {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(text).catch(() => this._fallbackCopy(text));
        } else {
            this._fallbackCopy(text);
        }
    }

    _fallbackCopy(text) {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.opacity  = '0';
        document.body.appendChild(el);
        el.focus();
        el.select();
        document.execCommand('copy');
        document.body.removeChild(el);
    }
}
