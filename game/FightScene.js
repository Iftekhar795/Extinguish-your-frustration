/**
 * FightScene.js
 * Main Phaser scene: arena, fighters, HP bars, round/timer logic, win screen.
 *
 * Accepted config (passed via scene.settings.data or game.registry):
 *   playerConfig  {Object}  - Fighter constructor config for player
 *   enemyConfig   {Object}  - Fighter constructor config for enemy
 *   arenaIndex    {number}  - 0|1|2 which arena to load
 */

/** ms window for the hit-combo counter to stay active between hits */
const HIT_COMBO_TIMEOUT = 1800;

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

        this._rightBound = W - 55;

        // Space reserved at the bottom for mobile controls overlay
        const MOBILE_CONTROL_CLEARANCE = 190;
        const groundY = H - MOBILE_CONTROL_CLEARANCE;

        this._arena = ARENAS[this._arenaIdx % ARENAS.length];

        // ── background ───────────────────────────────────────
        this._drawArena(W, H, groundY);

        // ── fighters ─────────────────────────────────────────
        const playerCfg = {
            ...this._playerConfig,
            x: 115,
            y: groundY,
            facingRight: true,
        };

        const enemyCfg = {
            ...this._enemyConfig,
            x: W - 115,
            y: groundY,
            facingRight: false,
            difficulty: this._difficulty,
        };

        this.player = new Fighter(this, playerCfg);
        this.enemy  = new EnemyAI(this, enemyCfg);
        this.enemy.setPlayer(this.player);

        // ── Projectile system ─────────────────────────────────
        this._projectiles = [];
        this.player._onProjectileFire = () => this._spawnProjectile(this.player);
        this.enemy._onProjectileFire  = () => this._spawnProjectile(this.enemy);

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

        // ── projectiles ──────────────────────────────────────
        this._updateProjectiles(delta);

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

        // Sky fill
        const sky = this.add.graphics();
        sky.fillStyle(a.bgColor, 1);
        sky.fillRect(0, 0, W, H);

        // Atmospheric gradient (darker toward floor)
        const grad = this.add.graphics();
        grad.fillGradientStyle(a.bgColor, a.bgColor, 0x000000, 0x000000, 0, 0, 0.55, 0.55);
        grad.fillRect(0, H * 0.4, W, H * 0.6);

        // Clouds / stars
        if (a.clouds) {
            this._drawClouds(W, H, a.accentColor);
        } else {
            this._drawStars(W, H);
        }

        // Distant architecture / silhouette lines
        this._drawArenaDetails(W, groundY, a);

        // Floor surface with perspective stripes
        const floor = this.add.graphics();
        floor.fillStyle(a.floorColor, 1);
        floor.fillRect(0, groundY, W, H - groundY);

        // Perspective grid lines on floor
        floor.lineStyle(1, a.accentColor, 0.12);
        for (let i = 1; i <= 5; i++) {
            const fy = groundY + (H - groundY) * (i / 6);
            floor.beginPath(); floor.moveTo(0, fy); floor.lineTo(W, fy); floor.strokePath();
        }
        // Vertical convergence lines
        floor.lineStyle(1, a.accentColor, 0.09);
        for (let i = 0; i <= 8; i++) {
            const fx = W * (i / 8);
            floor.beginPath();
            floor.moveTo(W / 2, groundY);
            floor.lineTo(fx, H);
            floor.strokePath();
        }

        // Floor edge glow line
        const glow = this.add.graphics();
        glow.lineStyle(4, a.accentColor, 0.55);
        glow.beginPath(); glow.moveTo(0, groundY); glow.lineTo(W, groundY); glow.strokePath();
        glow.lineStyle(1, 0xffffff, 0.20);
        glow.beginPath(); glow.moveTo(0, groundY - 1); glow.lineTo(W, groundY - 1); glow.strokePath();
    }

    _drawArenaDetails(W, groundY, a) {
        const g = this.add.graphics();
        // Simple silhouette buildings / pillars giving depth
        g.fillStyle(0x000000, 0.22);
        const bh = groundY * 0.4;
        // Left building
        g.fillRect(0, groundY - bh, W * 0.18, bh);
        // Right building
        g.fillRect(W - W * 0.15, groundY - bh * 0.75, W * 0.15, bh * 0.75);
        // Centre arch hint
        g.fillStyle(a.accentColor, 0.06);
        g.fillCircle(W / 2, groundY, W * 0.42);
    }

    _drawClouds(W, H, color) {
        const g = this.add.graphics();
        g.fillStyle(color, 0.07);
        [[W * 0.15, H * 0.18, 60], [W * 0.55, H * 0.12, 50], [W * 0.82, H * 0.24, 55]].forEach(([cx, cy, r]) => {
            g.fillCircle(cx,       cy,       r);
            g.fillCircle(cx + r * 0.65, cy + r * 0.20, r * 0.65);
            g.fillCircle(cx - r * 0.45, cy + r * 0.15, r * 0.55);
        });
    }

    _drawStars(W, H) {
        const g = this.add.graphics();
        for (let i = 0; i < 80; i++) {
            const bri = Math.random();
            g.fillStyle(0xffffff, bri * 0.7 + 0.1);
            g.fillCircle(
                Math.random() * W,
                Math.random() * H * 0.72,
                Math.random() * 1.6 + 0.3,
            );
        }
    }


    _createHUD(W) {
        const barH      = 22;
        const barY      = 36;          // top of HP bars
        const nameY     = 8;           // top of name text row
        const barW      = W * 0.41;    // ~197 px at W=480 — leaves ~86 px for center timer
        const eBarX     = W - 8 - barW;
        const cx        = W / 2;
        const superBarH = 6;           // SF-style super meter height
        const superBarY = barY + barH + 3;  // sits right below HP bars
        const pipY      = superBarY + superBarH + 6;  // win pips below super bar
        const hudHeight = pipY + 14;   // HUD backing strip height

        // ── Translucent HUD backing strip ─────────────────────
        const hudBg = this.add.graphics();
        hudBg.fillStyle(0x000000, 0.52);
        hudBg.fillRect(0, 0, W, hudHeight);
        hudBg.lineStyle(1, 0x223355, 0.7);
        hudBg.strokeRect(0, hudHeight, W, 0);

        // ── Player name (left) ────────────────────────────────
        this.add.text(10, nameY, (this._playerConfig.name || 'PLAYER').toUpperCase(), {
            fontSize: '13px', fontFamily: 'Arial Black, Arial',
            color: '#5DD8FF',
        });

        // ── Enemy name (right) ────────────────────────────────
        this.add.text(W - 10, nameY, (this._enemyConfig.name || 'ENEMY').toUpperCase(), {
            fontSize: '13px', fontFamily: 'Arial Black, Arial',
            color: '#FF7070',
        }).setOrigin(1, 0);

        // ── Player HP bar ─────────────────────────────────────
        this._playerHpBg = this.add.graphics();
        this._playerHpBg.fillStyle(0x111111, 0.95);
        this._playerHpBg.fillRoundedRect(8, barY, barW, barH, 4);
        this._playerHpBg.lineStyle(1.5, 0x3399BB, 0.6);
        this._playerHpBg.strokeRoundedRect(8, barY, barW, barH, 4);
        this._playerHpFill = this.add.graphics();

        // ── Enemy HP bar ──────────────────────────────────────
        this._enemyHpBg = this.add.graphics();
        this._enemyHpBg.fillStyle(0x111111, 0.95);
        this._enemyHpBg.fillRoundedRect(eBarX, barY, barW, barH, 4);
        this._enemyHpBg.lineStyle(1.5, 0xBB3333, 0.6);
        this._enemyHpBg.strokeRoundedRect(eBarX, barY, barW, barH, 4);
        this._enemyHpFill = this.add.graphics();

        // ── Player super meter (SF-style golden gauge) ────────
        const playerSuperBg = this.add.graphics();
        playerSuperBg.fillStyle(0x1a0a00, 0.92);
        playerSuperBg.fillRoundedRect(8, superBarY, barW, superBarH, 3);
        playerSuperBg.lineStyle(1, 0x886600, 0.5);
        playerSuperBg.strokeRoundedRect(8, superBarY, barW, superBarH, 3);
        this._playerSuperFill = this.add.graphics();

        // ── Enemy super meter ─────────────────────────────────
        const enemySuperBg = this.add.graphics();
        enemySuperBg.fillStyle(0x1a0a00, 0.92);
        enemySuperBg.fillRoundedRect(eBarX, superBarY, barW, superBarH, 3);
        enemySuperBg.lineStyle(1, 0x886600, 0.5);
        enemySuperBg.strokeRoundedRect(eBarX, superBarY, barW, superBarH, 3);
        this._enemySuperFill = this.add.graphics();

        // "SUPER" labels flanking the timer
        this.add.text(9, superBarY - 1, 'SUPER', {
            fontSize: '7px', fontFamily: 'Arial', color: '#AA8800',
        });
        this.add.text(W - 9, superBarY - 1, 'SUPER', {
            fontSize: '7px', fontFamily: 'Arial', color: '#AA8800',
        }).setOrigin(1, 0);

        // ── Timer ─────────────────────────────────────────────
        this._timerText = this.add.text(cx, barY - 1, '99', {
            fontSize: '30px',
            fontFamily: 'Arial Black, Arial',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 4,
        }).setOrigin(0.5, 0);

        // ── Round label ───────────────────────────────────────
        this._roundLabel = this.add.text(cx, barY + barH + 4, `ROUND ${this._round}`, {
            fontSize: '10px', fontFamily: 'Arial', color: '#889999',
        }).setOrigin(0.5, 0);

        // ── Win pips ──────────────────────────────────────────
        this._playerWinPips = [];
        this._enemyWinPips  = [];
        for (let i = 0; i < this._maxRounds; i++) {
            const pp = this.add.graphics();
            pp.fillStyle(0x2a2a3a, 1);
            pp.fillCircle(13 + i * 15, pipY, 5);
            pp.lineStyle(1.2, 0x445566, 1);
            pp.strokeCircle(13 + i * 15, pipY, 5);
            this._playerWinPips.push(pp);

            const ep = this.add.graphics();
            ep.fillStyle(0x2a2a3a, 1);
            ep.fillCircle(W - 13 - i * 15, pipY, 5);
            ep.lineStyle(1.2, 0x664444, 1);
            ep.strokeCircle(W - 13 - i * 15, pipY, 5);
            this._enemyWinPips.push(ep);
        }

        // ── Combo / hit-counter text ──────────────────────────
        this._comboText = this.add.text(cx, pipY + 6, '', {
            fontSize: '21px',
            fontFamily: 'Arial Black, Arial',
            fontStyle: 'bold',
            color: '#FFD700',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5, 0).setAlpha(0);

        // ── Hit combo counter (left side) ─────────────────────
        this._hitCounterText = this.add.text(14, pipY + 6, '', {
            fontSize: '20px',
            fontFamily: 'Arial Black, Arial',
            fontStyle: 'bold',
            color: '#FF8C00',
            stroke: '#000000',
            strokeThickness: 3,
        }).setAlpha(0);

        // ── Keyboard hint (desktop) ───────────────────────────
        const isMobile = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
        this._controlsHint = this.add.text(cx, this.scale.height - 14,
            '← → Move  ↑ Jump  Z Punch  X Kick  C Block  V Special/Shoryuken', {
            fontSize: '10px', fontFamily: 'Arial', color: '#666677',
        }).setOrigin(0.5, 1).setVisible(!isMobile);

        // Cache layout values
        this._barW       = barW;
        this._barH       = barH;
        this._barY       = barY;
        this._eBarX      = eBarX;
        this._superBarY  = superBarY;
        this._superBarH  = superBarH;
        this._pipY       = pipY;
        this._prevPlayerHpRatio    = -1;
        this._prevEnemyHpRatio     = -1;
        this._playerSuperWasFull   = false;
        this._enemySuperWasFull    = false;

        // Hit combo tracking
        this._hitComboCount = 0;
        this._hitComboTimer = 0;
    }

    _updateHUD(delta) {
        const W   = this.scale.width;
        const now = Date.now();

        // Player HP (fills left → right)
        const pRatio = this.player.hp / this.player.maxHp;
        if (pRatio !== this._prevPlayerHpRatio) {
            this._playerHpFill.clear();
            if (pRatio > 0) {
                const c = this._hpColor(pRatio);
                this._playerHpFill.fillStyle(c, 1);
                this._playerHpFill.fillRoundedRect(8, this._barY, this._barW * pRatio, this._barH, 4);
                // Shine
                this._playerHpFill.fillStyle(0xffffff, 0.13);
                this._playerHpFill.fillRoundedRect(8, this._barY, this._barW * pRatio, this._barH * 0.45, 4);
            }
            this._prevPlayerHpRatio = pRatio;
        }

        // Enemy HP (fills right → left, SF style)
        const eRatio = this.enemy.hp / this.enemy.maxHp;
        if (eRatio !== this._prevEnemyHpRatio) {
            this._enemyHpFill.clear();
            if (eRatio > 0) {
                const c    = this._hpColor(eRatio);
                const fillW = this._barW * eRatio;
                const fillX = this._eBarX + (this._barW - fillW);
                this._enemyHpFill.fillStyle(c, 1);
                this._enemyHpFill.fillRoundedRect(fillX, this._barY, fillW, this._barH, 4);
                this._enemyHpFill.fillStyle(0xffffff, 0.13);
                this._enemyHpFill.fillRoundedRect(fillX, this._barY, fillW, this._barH * 0.45, 4);
            }
            this._prevEnemyHpRatio = eRatio;
        }

        // ── Super meters (updated every frame for smooth animation) ──
        const pSuperRatio = this.player.getSuperMeter() / 100;
        this._playerSuperFill.clear();
        if (pSuperRatio > 0) {
            const isFull = pSuperRatio >= 1;
            const pulse  = isFull ? (Math.floor(now / 200) % 2 === 0 ? 0xFFFF88 : 0xFFCC00) : 0xCC8800;
            this._playerSuperFill.fillStyle(pulse, 1);
            this._playerSuperFill.fillRoundedRect(8, this._superBarY, this._barW * pSuperRatio, this._superBarH, 3);
            if (isFull) {
                this._playerSuperFill.fillStyle(0xFFFFFF, 0.28);
                this._playerSuperFill.fillRoundedRect(8, this._superBarY, this._barW * pSuperRatio, this._superBarH * 0.5, 3);
            }
        }
        // Trigger "SUPER READY!" notification once when meter fills
        const pSuperFull = pSuperRatio >= 1;
        if (pSuperFull && !this._playerSuperWasFull) {
            this._showComboText('⚡ SUPER READY!');
        }
        this._playerSuperWasFull = pSuperFull;

        const eSuperRatio = this.enemy.getSuperMeter() / 100;
        this._enemySuperFill.clear();
        if (eSuperRatio > 0) {
            const isFull  = eSuperRatio >= 1;
            const pulse   = isFull ? (Math.floor(now / 200) % 2 === 0 ? 0xFFFF88 : 0xFFCC00) : 0xCC8800;
            const fillW   = this._barW * eSuperRatio;
            const fillX   = this._eBarX + (this._barW - fillW);
            this._enemySuperFill.fillStyle(pulse, 1);
            this._enemySuperFill.fillRoundedRect(fillX, this._superBarY, fillW, this._superBarH, 3);
            if (isFull) {
                this._enemySuperFill.fillStyle(0xFFFFFF, 0.28);
                this._enemySuperFill.fillRoundedRect(fillX, this._superBarY, fillW, this._superBarH * 0.5, 3);
            }
        }
        this._enemySuperWasFull = eSuperRatio >= 1;

        // Timer countdown
        this._timerAccum += delta;
        if (this._timerAccum >= 1000) {
            this._timerAccum -= 1000;
            this._roundTimer = Math.max(0, this._roundTimer - 1);
            this._timerText.setText(String(this._roundTimer).padStart(2, '0'));
            if (this._roundTimer <= 10) this._timerText.setColor('#FF6B35');
        }

        // Combo text fade
        if (this._comboText.alpha > 0) {
            this._comboText.setAlpha(this._comboText.alpha - delta / 1400);
        }

        // Hit combo counter timer – hide after inactivity
        if (this._hitComboTimer > 0) {
            this._hitComboTimer -= delta;
            if (this._hitComboTimer <= 0) {
                this._hitComboCount = 0;
                this._hitCounterText.setAlpha(0);
            }
        }
    }

    _hpColor(ratio) {
        if (ratio > 0.50) return 0x22DD66;
        if (ratio > 0.25) return 0xEEAA11;
        return 0xEE3322;
    }

    _updateWinPips() {
        const W   = this.scale.width;
        const pipY = this._pipY;
        for (let i = 0; i < this._maxRounds; i++) {
            const pp = this._playerWinPips[i];
            pp.clear();
            if (i < this._playerWins) {
                pp.fillStyle(0xFFD700, 1); pp.fillCircle(13 + i * 15, pipY, 5);
                pp.lineStyle(1.2, 0xFFA500, 1); pp.strokeCircle(13 + i * 15, pipY, 5);
            } else {
                pp.fillStyle(0x2a2a3a, 1); pp.fillCircle(13 + i * 15, pipY, 5);
                pp.lineStyle(1.2, 0x445566, 1); pp.strokeCircle(13 + i * 15, pipY, 5);
            }

            const ep = this._enemyWinPips[i];
            ep.clear();
            if (i < this._enemyWins) {
                ep.fillStyle(0xFFD700, 1); ep.fillCircle(W - 13 - i * 15, pipY, 5);
                ep.lineStyle(1.2, 0xFFA500, 1); ep.strokeCircle(W - 13 - i * 15, pipY, 5);
            } else {
                ep.fillStyle(0x2a2a3a, 1); ep.fillCircle(W - 13 - i * 15, pipY, 5);
                ep.lineStyle(1.2, 0x664444, 1); ep.strokeCircle(W - 13 - i * 15, pipY, 5);
            }
        }
    }

    // ── input ──────────────────────────────────────────────────

    _setupInput() {
        const kb = this.input.keyboard;
        this._keys = {
            left:    kb.addKey(Phaser.Input.Keyboard.KeyCodes.LEFT),
            right:   kb.addKey(Phaser.Input.Keyboard.KeyCodes.RIGHT),
            up:      kb.addKey(Phaser.Input.Keyboard.KeyCodes.UP),
            down:    kb.addKey(Phaser.Input.Keyboard.KeyCodes.DOWN),
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

        // Crouch (down key – cannot move while crouching)
        const wantCrouch = k.down.isDown || !!mi.down;
        if (wantCrouch) {
            p.crouch();
        } else {
            p.standUp();
            // Movement (keyboard OR mobile d-pad) – only when not crouching
            const goLeft  = (k.left.isDown  && !k.right.isDown) || (mi.left  && !mi.right);
            const goRight = (k.right.isDown && !k.left.isDown)  || (mi.right && !mi.left);
            if      (goLeft)  p.move(-1);
            else if (goRight) p.move(1);
            else              p.move(0);
        }

        // Jump
        if (Phaser.Input.Keyboard.JustDown(k.up) || mi.jumpJustDown) {
            const wasGrounded = p.isGrounded;
            p.jump();
            if (wasGrounded && !p.isGrounded) soundManager.playJump();
            mi.jumpJustDown = false;
        }

        // Block (only when not crouching)
        if (!wantCrouch) {
            p.setBlocking(k.block.isDown || !!mi.block);
        }

        // Punch (just pressed)
        if (Phaser.Input.Keyboard.JustDown(k.punch) || mi.punchJustDown) {
            if (p.punch()) {
                soundManager.playPunch();
                this.enemy.recordPlayerAttack('punch');
                this._checkPlayerCombo();
            }
            mi.punchJustDown = false;
        }

        // Kick (just pressed)
        if (Phaser.Input.Keyboard.JustDown(k.kick) || mi.kickJustDown) {
            if (p.kick()) {
                soundManager.playKick();
                this.enemy.recordPlayerAttack('kick');
                this._checkPlayerCombo();
            }
            mi.kickJustDown = false;
        }

        // Special (charge while held, release to fire Hadouken; or Shoryuken if super is full)
        if (k.special.isDown || mi.specialDown) {
            p.chargeSpecial(delta);
        }
        if (Phaser.Input.Keyboard.JustUp(k.special) || mi.specialJustUp) {
            if (p.getSuperMeter() >= 100) {
                // Super meter full → Shoryuken!
                if (p.shoryuken()) {
                    soundManager.playShoryuken();
                    this.enemy.recordPlayerAttack('special');
                }
            } else if (p.getSpecialCharge() >= 50) {
                p.special();
                soundManager.playSpecialRelease();
                this.enemy.recordPlayerAttack('special');
            }
            mi.specialJustUp = false;
        }
    }

    _checkPlayerCombo() {
        const combo = this.player.checkCombo();
        if (combo) {
            soundManager.playCombo();
            this._showComboText(combo.name + '! +' + combo.damage);
            // Apply bonus damage to enemy
            this.enemy.receiveHit(combo.damage);
        }
    }

    _showComboText(text) {
        this._comboText.setText(text);
        this._comboText.setAlpha(1);
    }

    /** Camera shake for impactful hits (SF-style screen shake). */
    _screenShake(intensity, duration) {
        this.cameras.main.shake(duration, intensity * 0.001);
    }

    /** Record that the player landed a hit and update the combo counter. */
    _recordPlayerHit() {
        this._hitComboCount++;
        this._hitComboTimer = HIT_COMBO_TIMEOUT;
        if (this._hitComboCount >= 2) {
            this._hitCounterText.setText(this._hitComboCount + ' HIT!');
            this._hitCounterText.setAlpha(1).setScale(1.3);
            this.tweens.add({
                targets: this._hitCounterText, scaleX: 1, scaleY: 1,
                duration: 140, ease: 'Back.Out',
            });
            soundManager.playComboHit(this._hitComboCount);
        }
    }

    // ── projectile system (Hadouken) ──────────────────────────

    _spawnProjectile(owner) {
        const dir    = owner.facingRight ? 1 : -1;
        const startX = owner.x + dir * 28;
        const startY = owner.y - Fighter.HEIGHT * 0.55;

        const proj = {
            x:     startX,
            y:     startY,
            velX:  dir * 400,
            owner,
            g:     this.add.graphics(),
            life:  2800,
            hit:   false,
        };
        this._projectiles.push(proj);
    }

    _updateProjectiles(delta) {
        const W = this.scale.width;
        for (let i = this._projectiles.length - 1; i >= 0; i--) {
            const proj = this._projectiles[i];
            proj.x    += proj.velX * (delta / 1000);
            proj.life -= delta;

            // Remove if off-screen or expired
            if (proj.hit || proj.x < -20 || proj.x > W + 20 || proj.life <= 0) {
                proj.g.destroy();
                this._projectiles.splice(i, 1);
                continue;
            }

            // Draw Hadouken fireball
            const t   = Date.now();
            const g   = proj.g;
            g.clear();
            // Outer halo / wave rings
            g.fillStyle(0x0033FF, 0.12);
            g.fillCircle(proj.x, proj.y, 28 + Math.sin(t / 70) * 5);
            // Mid glow
            g.fillStyle(0x0088FF, 0.30);
            g.fillCircle(proj.x, proj.y, 18 + Math.sin(t / 55) * 3);
            // Core
            g.fillStyle(0x00CCFF, 0.85);
            g.fillCircle(proj.x, proj.y, 11 + Math.sin(t / 45) * 2);
            // Inner bright spot
            g.fillStyle(0xffffff, 0.70);
            g.fillCircle(proj.x - 4, proj.y - 4, 5);

            // Check collision with target fighter
            const target = proj.owner === this.player ? this.enemy : this.player;
            const hitbox = target.getBodyHitbox();
            if (proj.x + 14 > hitbox.x && proj.x - 14 < hitbox.x + hitbox.w &&
                proj.y + 14 > hitbox.y && proj.y - 14 < hitbox.y + hitbox.h) {
                const dmg = 25;
                if (target.isBlocking) {
                    soundManager.playBlock();
                    target.receiveHit(Math.floor(dmg * 0.2));
                } else {
                    soundManager.playSpecialRelease
                        ? soundManager.playEnemyHitVoice()
                        : null;
                    target.receiveHit(dmg);
                    this._spawnHitEffect(proj.x, proj.y, proj.owner === this.enemy);
                    if (target.isKO()) {
                        this.time.delayedCall(120, () => soundManager.playKO());
                    }
                }
                proj.hit = true;
            }
        }
    }

    // ── combat resolution ─────────────────────────────────────

    _resolveCombat() {
        // Player attacks enemy
        const pAtk = this.player.getAttackHitbox();
        if (pAtk && !this.player._attackHit) {
            if (this._hitboxOverlap(pAtk, this.enemy.getBodyHitbox())) {
                const state  = this.player.state;
                const attack = this.player._attacks[state];
                if (attack && attack.damage > 0) {
                    const dmg      = attack.damage;
                    const isHeavy  = ['kick', 'crouchKick', 'jumpKick', 'shoryuken'].includes(state);
                    const knockDir = this.player.facingRight ? 1 : -1;
                    const knockForce = state === 'shoryuken' ? 280
                                     : isHeavy               ? 180
                                     :                         0;
                    if (this.enemy.isBlocking) {
                        soundManager.playBlock();
                        this.enemy.receiveHit(Math.floor(dmg * 0.2), knockDir, knockForce * 0.3);
                    } else {
                        soundManager.playEnemyHitVoice();
                        this.enemy.receiveHit(dmg, knockDir, knockForce);
                        // Attacker gains super meter on hit
                        this.player.addSuperMeter(10 + (isHeavy ? 5 : 0));
                        // Hit combo counter
                        this._recordPlayerHit();
                    }
                    this.player._attackHit = true;
                    this._spawnHitEffect(this.enemy.x, this.enemy.y - 60, false, state === 'shoryuken');
                    // Screen shake proportional to hit strength
                    if (!this.enemy.isBlocking) {
                        if (state === 'shoryuken') {
                            this._screenShake(8, 160);
                        } else if (isHeavy) {
                            this._screenShake(4, 80);
                        } else {
                            this._screenShake(2, 45);
                        }
                    }
                    if (this.enemy.isKO()) {
                        this._screenShake(10, 280);
                        this.time.delayedCall(120, () => soundManager.playKO());
                    }
                }
            }
        }

        // Enemy attacks player
        const eAtk = this.enemy.getAttackHitbox();
        if (eAtk && !this.enemy._attackHit) {
            if (this._hitboxOverlap(eAtk, this.player.getBodyHitbox())) {
                const state  = this.enemy.state;
                const attack = this.enemy._attacks[state];
                if (attack && attack.damage > 0) {
                    const dmg      = attack.damage;
                    const isHeavy  = ['kick', 'crouchKick', 'jumpKick', 'shoryuken'].includes(state);
                    const knockDir = this.enemy.facingRight ? 1 : -1;
                    const knockForce = state === 'shoryuken' ? 280
                                     : isHeavy               ? 180
                                     :                         0;
                    if (this.player.isBlocking) {
                        soundManager.playBlock();
                        this.player.receiveHit(Math.floor(dmg * 0.2), knockDir, knockForce * 0.3);
                    } else {
                        soundManager.playHitReceived();
                        this.player.receiveHit(dmg, knockDir, knockForce);
                        this.enemy.addSuperMeter(10 + (isHeavy ? 5 : 0));
                    }
                    this.enemy._attackHit = true;
                    this._spawnHitEffect(this.player.x, this.player.y - 60, true, state === 'shoryuken');
                    if (!this.player.isBlocking) {
                        if (state === 'shoryuken') {
                            this._screenShake(8, 160);
                        } else if (isHeavy) {
                            this._screenShake(4, 80);
                        } else {
                            this._screenShake(2, 45);
                        }
                    }
                    if (this.player.isKO()) {
                        this._screenShake(10, 280);
                        this.time.delayedCall(120, () => soundManager.playKO());
                    }
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

    _spawnHitEffect(x, y, redTeam, isSuper = false) {
        const symbols = isSuper
            ? ['🔥', '💥', '⚡', '★', '✸']
            : ['★', '💥', '✸', '⚡', '✦'];
        const color   = redTeam ? '#FF4455' : '#FFCC00';

        // Central burst flash (larger for super moves)
        const burstR = isSuper ? 42 : 26;
        const flash = this.add.graphics();
        flash.fillStyle(isSuper ? 0xFF8800 : (redTeam ? 0xFF2244 : 0xFFBB00), isSuper ? 0.75 : 0.55);
        flash.fillCircle(x, y, burstR);
        if (isSuper) {
            // Extra outer ring for Shoryuken
            flash.lineStyle(3, 0xFFFFAA, 0.65);
            flash.strokeCircle(x, y, burstR * 1.6);
        }
        this.tweens.add({
            targets: flash, alpha: 0, scaleX: isSuper ? 3.0 : 2.2, scaleY: isSuper ? 3.0 : 2.2,
            duration: isSuper ? 280 : 180, ease: 'Power2',
            onComplete: () => flash.destroy(),
        });

        // Scatter particles (more for super)
        const count = isSuper ? 7 : 4;
        for (let i = 0; i < count; i++) {
            const sym = i === 0 ? symbols[Math.floor(Math.random() * symbols.length)] : (isSuper && i < 3 ? '✦' : '·');
            const ox  = (Math.random() - 0.5) * (isSuper ? 52 : 36);
            const oy  = (Math.random() - 0.5) * (isSuper ? 36 : 24);
            const t   = this.add.text(x + ox, y + oy, sym, {
                fontSize: i === 0 ? (isSuper ? '34px' : '26px') : '16px',
                color: isSuper ? '#FF8800' : color,
                stroke: '#000000',
                strokeThickness: 2,
            }).setOrigin(0.5);

            this.tweens.add({
                targets: t,
                y:       y + oy - (isSuper ? 80 : 55) - Math.random() * 22,
                x:       x + ox + (Math.random() - 0.5) * (isSuper ? 52 : 36),
                alpha:   0,
                scaleX:  i === 0 ? (isSuper ? 2.2 : 1.6) : 1,
                scaleY:  i === 0 ? (isSuper ? 2.2 : 1.6) : 1,
                duration: (isSuper ? 480 : 380) + Math.random() * 120,
                ease:    'Power2',
                onComplete: () => t.destroy(),
            });
        }
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
        soundManager.playRoundWin();

        const W = this.scale.width;
        const H = this.scale.height;

        const overlay = this.add.graphics();
        overlay.fillStyle(0x000000, 0.62);
        overlay.fillRect(0, 0, W, H);
        overlay.setAlpha(0);
        this.tweens.add({ targets: overlay, alpha: 1, duration: 220 });

        const bigTxt = this.add.text(W / 2, H / 2 - 24, big, {
            fontSize: '64px',
            fontFamily: 'Arial Black, Arial',
            fontStyle: 'bold',
            color: '#FFD700',
            stroke: '#000000',
            strokeThickness: 7,
        }).setOrigin(0.5).setScale(2).setAlpha(0);

        const smTxt = this.add.text(W / 2, H / 2 + 46, small, {
            fontSize: '24px',
            fontFamily: 'Arial Black, Arial',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 3,
        }).setOrigin(0.5).setAlpha(0);

        this.tweens.add({ targets: bigTxt, alpha: 1, scaleX: 1, scaleY: 1, duration: 280, ease: 'Back.Out' });
        this.time.delayedCall(180, () => {
            this.tweens.add({ targets: smTxt, alpha: 1, duration: 260 });
        });

        this.time.delayedCall(2200, () => {
            overlay.destroy(); bigTxt.destroy(); smTxt.destroy();
            if (onDone) onDone();
        });
    }

    _showRoundSplash() {
        soundManager.playRoundStart();

        const W  = this.scale.width;
        const H  = this.scale.height;
        const cx = W / 2;
        const cy = H / 2;

        const overlay = this.add.graphics();
        overlay.fillStyle(0x000000, 0.40);
        overlay.fillRect(0, 0, W, H);
        overlay.setAlpha(0);
        this.tweens.add({ targets: overlay, alpha: 1, duration: 200 });

        const roundTxt = this.add.text(cx, cy - 44, `ROUND  ${this._round}`, {
            fontSize: '44px',
            fontFamily: 'Arial Black, Arial',
            fontStyle: 'bold',
            color: '#ffffff',
            stroke: '#000000',
            strokeThickness: 5,
        }).setOrigin(0.5).setScale(0).setAlpha(0);

        const fightTxt = this.add.text(cx, cy + 28, 'FIGHT!', {
            fontSize: '62px',
            fontFamily: 'Arial Black, Arial',
            fontStyle: 'bold',
            color: '#FF6B35',
            stroke: '#000000',
            strokeThickness: 7,
        }).setOrigin(0.5).setScale(0).setAlpha(0);

        this.tweens.add({ targets: roundTxt, alpha: 1, scaleX: 1, scaleY: 1, duration: 320, ease: 'Back.Out' });

        this.time.delayedCall(540, () => {
            this.tweens.add({ targets: fightTxt, alpha: 1, scaleX: 1.08, scaleY: 1.08, duration: 200, ease: 'Back.Out' });
            this.tweens.add({ targets: fightTxt, scaleX: 1, scaleY: 1, duration: 140, delay: 200 });
        });

        this.time.delayedCall(1700, () => {
            this.tweens.add({
                targets: [overlay, roundTxt, fightTxt], alpha: 0, duration: 320,
                onComplete: () => { overlay.destroy(); roundTxt.destroy(); fightTxt.destroy(); },
            });
        });
    }

    _nextRound() {
        // Reset fighters
        const W = this.scale.width;
        this.player.x   = 115;
        this.player.y   = this._groundY;
        this.player.hp  = this.player.maxHp;
        this.player._superMeter = 0;
        this.player._enterState('idle', 0);
        this._prevPlayerHpRatio = -1;

        this.enemy.x    = W - 115;
        this.enemy.y    = this._groundY;
        this.enemy.hp   = this.enemy.maxHp;
        this.enemy._superMeter = 0;
        this.enemy._enterState('idle', 0);
        this._prevEnemyHpRatio = -1;

        // Reset hit combo counter
        this._hitComboCount = 0;
        this._hitComboTimer = 0;
        this._hitCounterText.setAlpha(0);
        this._playerSuperWasFull = false;
        this._enemySuperWasFull  = false;

        this._roundTimer = 99;
        this._timerText.setText('99').setColor('#ffffff');
        this._timerAccum = 0;
        this._roundOver  = false;

        if (this._roundLabel) this._roundLabel.setText(`ROUND ${this._round}`);

        this._showRoundSplash();
    }

    _endGame(winner) {
        this._gameOver = true;
        const W = this.scale.width;
        const H = this.scale.height;

        const overlay = this.add.graphics();
        overlay.fillStyle(0x000000, 0.78);
        overlay.fillRect(0, 0, W, H);
        overlay.setAlpha(0);
        this.tweens.add({ targets: overlay, alpha: 1, duration: 350 });

        const isPlayerWin = winner === 'player';
        const headline = isPlayerWin ? '🏆 VICTORY!' : '💀 DEFEATED!';
        const sub      = isPlayerWin
            ? `You won  ${this._playerWins} - ${this._enemyWins}`
            : `Enemy won  ${this._enemyWins} - ${this._playerWins}`;

        const headTxt = this.add.text(W / 2, H / 2 - 70, headline, {
            fontSize: '50px',
            fontFamily: 'Arial Black, Arial',
            fontStyle: 'bold',
            color: isPlayerWin ? '#FFD700' : '#FF4444',
            stroke: '#000000',
            strokeThickness: 6,
        }).setOrigin(0.5).setScale(2).setAlpha(0);

        this.tweens.add({ targets: headTxt, alpha: 1, scaleX: 1, scaleY: 1, duration: 400, delay: 200, ease: 'Back.Out' });

        this.add.text(W / 2, H / 2 - 12, sub, {
            fontSize: '20px',
            fontFamily: 'Arial Black, Arial',
            color: '#dddddd',
            stroke: '#000000',
            strokeThickness: 2,
        }).setOrigin(0.5).setAlpha(0.9);

        // Share link
        const shareUrl = this._buildShareUrl();
        const shareTxt = this.add.text(W / 2, H / 2 + 40,
            '🔗 Copy shareable link', {
            fontSize: '15px', fontFamily: 'Arial', color: '#88DDFF',
            backgroundColor: '#0a1830',
            padding: { x: 14, y: 9 },
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        shareTxt.on('pointerover', () => shareTxt.setColor('#ffffff'));
        shareTxt.on('pointerout',  () => shareTxt.setColor('#88DDFF'));
        shareTxt.on('pointerdown', () => {
            this._copyToClipboard(shareUrl);
            shareTxt.setText('✅ Link copied!');
            this.time.delayedCall(2000, () => shareTxt.setText('🔗 Copy shareable link'));
        });

        // Rematch
        const rematch = this.add.text(W / 2, H / 2 + 94, '⚔️  REMATCH', {
            fontSize: '20px',
            fontFamily: 'Arial Black, Arial',
            color: '#FF6B35',
            backgroundColor: '#1a1a2e',
            padding: { x: 22, y: 12 },
        }).setOrigin(0.5).setInteractive({ useHandCursor: true });
        rematch.on('pointerover', () => rematch.setColor('#FFD700'));
        rematch.on('pointerout',  () => rematch.setColor('#FF6B35'));
        rematch.on('pointerdown', () => {
            this._gameOver    = false;
            this._round       = 1;
            this._playerWins  = 0;
            this._enemyWins   = 0;
            this.scene.restart({
                playerConfig: this._playerConfig,
                enemyConfig:  this._enemyConfig,
                arenaIndex:   this._arenaIdx,
                difficulty:   this._difficulty,
            });
        });

        // Back to setup
        const backBtn = this.add.text(W / 2, H / 2 + 150, '← Back to Setup', {
            fontSize: '15px', fontFamily: 'Arial', color: '#888888',
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
