/**
 * Fighter.js
 * Represents a single combatant: custom physics, combat state machine,
 * procedural body drawing with optional face-image overlay.
 */

class Fighter {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x          Initial x (pixels)
     * @param {number} groundY    Y coordinate of the ground surface
     * @param {object} cfg
     *   cfg.side        'left' | 'right'
     *   cfg.color       0xRRGGBB  body / outfit colour
     *   cfg.faceDataURL string|null  data URL of the cropped face
     */
    constructor(scene, x, groundY, cfg) {
        this.scene   = scene;
        this.x       = x;
        this.y       = groundY;
        this.groundY = groundY;
        this.side    = cfg.side;
        this.facing  = cfg.side === 'left' ? 1 : -1;  // 1=right, -1=left
        this.color   = cfg.color || (cfg.side === 'left' ? 0x2255cc : 0xcc2222);

        // ── Health ──────────────────────────────────────────────────────────
        this.maxHP = 100;
        this.hp    = 100;

        // ── Physics ─────────────────────────────────────────────────────────
        this.velX    = 0;
        this.velY    = 0;
        this.onGround = true;
        this.SPEED    = 190;
        this.JUMP_PWR = -530;
        this.GRAVITY  = 1250;

        // ── State machine ────────────────────────────────────────────────────
        // idle | walk_fwd | walk_back | jump | light_punch | heavy_punch |
        // kick | special | block | hit | ko
        this.state         = 'idle';
        this.stateTimer    = 0;   // seconds remaining in timed states
        this.isBlocking    = false;
        this.hitThisAttack = false;

        // ── Combo tracking ───────────────────────────────────────────────────
        this.combo      = 0;
        this.comboTimer = 0;

        // ── Arena bounds ─────────────────────────────────────────────────────
        this.leftBound  = 70;
        this.rightBound = 730;

        // ── Visuals ──────────────────────────────────────────────────────────
        this.graphics  = scene.add.graphics().setDepth(5);
        this.faceImage = null;
        this._loadFace(cfg.faceDataURL);
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  FACE IMAGE
    // ══════════════════════════════════════════════════════════════════════════

    _loadFace(dataURL) {
        if (!dataURL) return;
        const key = `face_${this.side}`;
        if (this.scene.textures.exists(key)) this.scene.textures.remove(key);

        const img = new Image();
        img.onload = () => {
            const tex = this.scene.textures.createCanvas(key, 44, 44);
            const ctx = tex.getContext();
            // Circular clip so face fits neatly inside the head circle
            ctx.save();
            ctx.beginPath();
            ctx.arc(22, 22, 21, 0, Math.PI * 2);
            ctx.closePath();
            ctx.clip();
            ctx.drawImage(img, 0, 0, 44, 44);
            ctx.restore();
            tex.refresh();

            if (this.faceImage) this.faceImage.destroy();
            this.faceImage = this.scene.add.image(this.x, this.y - 130, key).setDepth(6);
        };
        img.src = dataURL;
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  DRAWING  (called every frame)
    // ══════════════════════════════════════════════════════════════════════════

    draw() {
        const g  = this.graphics;
        g.clear();

        const fx = this.x;
        const fy = this.y;
        const d  = this.facing; // 1=right, -1=left
        const s  = this.state;
        const c  = this.color;
        const SKIN = 0xffcc99;

        // Helper: mirror x offset around fighter centre
        // For rects the starting corner must also be flipped
        const rX = (dx, w) => d >= 0 ? fx + dx : fx - dx - w;
        const cX = (dx)    => fx + dx * d;

        // ── Shadow ────────────────────────────────────────────────────────────
        g.fillStyle(0x000000, 0.18);
        g.fillEllipse(fx, fy + 2, 56, 11);

        // ── Legs ─────────────────────────────────────────────────────────────
        g.fillStyle(c, 1);
        if (s === 'kick' && this.stateTimer > 0) {
            g.fillRect(rX(-15, 13), fy - 50, 13, 50);           // standing leg
            g.fillStyle(SKIN, 1);
            g.fillRect(rX(18, 55), fy - 38, 55, 14);            // kick leg
            g.fillStyle(0x222222, 1);
            g.fillRect(rX(72, 13), fy - 40, 13, 16);            // shoe
            g.fillStyle(c, 1);
        } else {
            g.fillRect(rX(-15, 13), fy - 50, 13, 50);
            g.fillRect(rX(2, 13), fy - 50, 13, 50);
        }

        // Shoes
        g.fillStyle(0x222222, 1);
        g.fillRect(rX(-17, 15), fy - 6, 15, 6);
        g.fillRect(rX(1, 15), fy - 6, 15, 6);

        // Belt
        g.fillStyle(0x111111, 1);
        g.fillRect(rX(-18, 36), fy - 57, 36, 7);

        // ── Torso ─────────────────────────────────────────────────────────────
        g.fillStyle(c, 1);
        g.fillRect(rX(-18, 36), fy - 108, 36, 51);
        // Highlight stripe
        g.fillStyle(0xffffff, 0.12);
        g.fillRect(rX(-11, 10), fy - 108, 10, 51);

        // ── Arms ─────────────────────────────────────────────────────────────
        g.fillStyle(SKIN, 1);
        if (s === 'light_punch' && this.stateTimer > 0) {
            g.fillRect(rX(-31, 13), fy - 108, 13, 45);          // back arm
            g.fillRect(rX(18, 58), fy - 107, 58, 13);           // punch arm
            g.fillCircle(cX(77), fy - 101, 10);                  // fist
        } else if (s === 'heavy_punch' && this.stateTimer > 0) {
            g.fillRect(rX(-31, 13), fy - 108, 13, 45);
            g.fillRect(rX(18, 83), fy - 109, 83, 15);
            g.fillCircle(cX(102), fy - 101, 13);                 // big fist
        } else if (s === 'special' && this.stateTimer > 0) {
            g.fillRect(rX(-105, 45), fy - 108, 45, 13);
            g.fillRect(rX(18, 45), fy - 108, 45, 13);
            // Energy projectile
            g.fillStyle(0xffff00, 0.85);
            g.fillCircle(cX(70), fy - 101, 20);
            g.fillStyle(0xff8800, 1);
            g.fillCircle(cX(70), fy - 101, 11);
            g.fillStyle(SKIN, 1);
        } else if (s === 'block') {
            g.fillRect(rX(-31, 13), fy - 110, 13, 50);
            g.fillRect(rX(18, 13), fy - 110, 13, 50);
            // Shield shimmer
            g.fillStyle(0x44aaff, 0.22);
            g.fillRect(rX(-5, 30), fy - 130, 30, 75);
        } else {
            // Idle / walk – gentle arm swing not needed for clarity
            g.fillRect(rX(-31, 13), fy - 108, 13, 45);
            g.fillRect(rX(18, 13), fy - 108, 13, 45);
        }

        // ── Neck ─────────────────────────────────────────────────────────────
        g.fillStyle(SKIN, 1);
        g.fillRect(rX(-5, 10), fy - 116, 10, 15);

        // ── Head ─────────────────────────────────────────────────────────────
        g.fillStyle(SKIN, 1);
        g.fillCircle(fx, fy - 130, 22);

        // Hair
        g.fillStyle(0x221100, 1);
        g.fillEllipse(fx, fy - 148, 50, 22);

        // Draw simple eyes/mouth only when no face image is loaded
        if (!this.faceImage) {
            g.fillStyle(0x333333, 1);
            g.fillCircle(cX(7),  fy - 133, 4);
            g.fillCircle(cX(-2), fy - 133, 4);
            if (s === 'hit') {
                g.fillCircle(fx, fy - 123, 4);                   // shocked mouth
            } else {
                g.fillRect(rX(-7, 15), fy - 123, 15, 3);        // mouth
            }
        }

        // ── Hit flash ────────────────────────────────────────────────────────
        if (s === 'hit') {
            g.fillStyle(0xff2200, 0.28);
            g.fillRect(fx - 26, fy - 152, 52, 152);
        }

        // ── KO overlay ───────────────────────────────────────────────────────
        if (s === 'ko') {
            g.fillStyle(0x888888, 0.5);
            g.fillRect(fx - 30, fy - 40, 60, 40);
            // X-eyes
            g.lineStyle(2, 0x000000, 1);
            [[cX(4), fy-136, cX(10), fy-130], [cX(10), fy-136, cX(4), fy-130],
             [cX(-5), fy-136, cX(1), fy-130], [cX(1), fy-136, cX(-5), fy-130]]
            .forEach(([x1,y1,x2,y2]) => g.lineBetween(x1,y1,x2,y2));
        }

        // ── Face image position ───────────────────────────────────────────────
        if (this.faceImage) {
            this.faceImage.setPosition(fx, fy - 130);
        }
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  COMBAT ACTIONS
    // ══════════════════════════════════════════════════════════════════════════

    lightPunch() {
        if (!this._canAttack()) return;
        this.state = 'light_punch';  this.stateTimer = 0.25;  this.hitThisAttack = false;
    }
    heavyPunch() {
        if (!this._canAttack()) return;
        this.state = 'heavy_punch';  this.stateTimer = 0.50;  this.hitThisAttack = false;
    }
    kick() {
        if (!this._canAttack()) return;
        this.state = 'kick';         this.stateTimer = 0.40;  this.hitThisAttack = false;
    }
    special() {
        if (!this._canAttack() || this.combo < 2) return;
        this.state = 'special';      this.stateTimer = 0.70;  this.hitThisAttack = false;
    }
    block(held) {
        if (held && this._canBlock()) {
            this.state = 'block';  this.isBlocking = true;
        } else if (!held && this.state === 'block') {
            this.state = 'idle';   this.isBlocking = false;
        }
    }
    jump() {
        if (this.onGround && this._canMove()) {
            this.velY     = this.JUMP_PWR;
            this.onGround = false;
            this.state    = 'jump';
        }
    }
    moveLeft() {
        if (this._canMove()) this.velX = -this.SPEED;
    }
    moveRight() {
        if (this._canMove()) this.velX =  this.SPEED;
    }
    stopMoving() {
        if (this.state === 'walk_fwd' || this.state === 'walk_back') this.state = 'idle';
        this.velX = 0;
    }

    _canAttack() { return ['idle','walk_fwd','walk_back'].includes(this.state); }
    _canMove()   { return ['idle','walk_fwd','walk_back','block'].includes(this.state); }
    _canBlock()  { return ['idle','walk_fwd','walk_back','block'].includes(this.state); }

    // ══════════════════════════════════════════════════════════════════════════
    //  HIT RECEPTION
    // ══════════════════════════════════════════════════════════════════════════

    /**
     * Apply incoming damage, respecting block.
     * @returns {{ hit: boolean, ko: boolean, damage: number }}
     */
    takeHit(damage) {
        if (this.state === 'ko') return { hit: false, ko: true, damage: 0 };
        if (this.isBlocking) damage = Math.max(1, Math.floor(damage * 0.15));

        this.hp = Math.max(0, this.hp - damage);
        if (this.hp === 0) {
            this.state = 'ko';
            return { hit: true, ko: true, damage };
        }
        // Stagger
        this.state      = 'hit';
        this.stateTimer = 0.30;
        this.velX       = -this.facing * 70;
        return { hit: true, ko: false, damage };
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  HITBOXES & DAMAGE
    // ══════════════════════════════════════════════════════════════════════════

    getAttackHitbox() {
        const ATTACKS = {
            light_punch: { reach: 68,  yOff: -107, h: 20 },
            heavy_punch: { reach: 96,  yOff: -112, h: 24 },
            kick:        { reach: 80,  yOff: -55,  h: 22 },
            special:     { reach: 115, yOff: -112, h: 85 }
        };
        const def = ATTACKS[this.state];
        if (!def) return null;
        const x = this.facing >= 0 ? this.x + 18 : this.x - 18 - def.reach;
        return { x, y: this.y + def.yOff, width: def.reach, height: def.h, type: this.state };
    }

    getAttackDamage() {
        return { light_punch: 8, heavy_punch: 16, kick: 12, special: 22 }[this.state] || 0;
    }

    /** Rectangular hit-receive zone */
    getBounds() {
        return { x: this.x - 22, y: this.y - 152, width: 44, height: 152 };
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  UPDATE  (called every frame by FightScene)
    // ══════════════════════════════════════════════════════════════════════════

    update(dt) {
        // ── State timer ───────────────────────────────────────────────────────
        if (this.stateTimer > 0) {
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) {
                this.stateTimer = 0;
                if (['light_punch','heavy_punch','kick','special','hit'].includes(this.state)) {
                    this.state = 'idle';
                    this.hitThisAttack = false;
                }
            }
        }

        // ── Combo timer ───────────────────────────────────────────────────────
        if (this.comboTimer > 0) {
            this.comboTimer -= dt;
            if (this.comboTimer <= 0) { this.combo = 0; this.comboTimer = 0; }
        }

        // ── Gravity ───────────────────────────────────────────────────────────
        if (!this.onGround) {
            this.velY = Math.min(this.velY + this.GRAVITY * dt, 900);
        }

        // ── Position ─────────────────────────────────────────────────────────
        this.x += this.velX * dt;
        this.y += this.velY * dt;

        // Velocity reset (movement must be re-applied each frame)
        this.velX = 0;

        // ── Ground ───────────────────────────────────────────────────────────
        if (this.y >= this.groundY) {
            this.y        = this.groundY;
            this.velY     = 0;
            this.onGround = true;
            if (this.state === 'jump') this.state = 'idle';
        }

        // ── Bounds ───────────────────────────────────────────────────────────
        this.x = Math.max(this.leftBound, Math.min(this.rightBound, this.x));
    }

    /** Free Phaser objects */
    destroy() {
        this.graphics.destroy();
        if (this.faceImage) this.faceImage.destroy();
    }
}
