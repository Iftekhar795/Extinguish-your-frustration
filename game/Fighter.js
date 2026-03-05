/**
 * Fighter.js
 * Base fighter class – handles procedural graphics rendering, physics,
 * health, attacks, blocking, and combo detection.
 *
 * Fighters are drawn each frame using a Phaser Graphics object so that
 * the uploaded face image can be composited directly onto the head.
 */

class Fighter {
    // ── constants ──────────────────────────────────────────────
    static get WIDTH()  { return 44; }
    static get HEIGHT() { return 110; }
    static get HEAD_RADIUS() { return 22; }
    static get GRAVITY() { return 1400; }
    static get GROUND_Y_OFFSET() { return 0; } // feet sit at groundY

    static COMBOS = [
        { inputs: ['punch', 'punch', 'kick'],  name: 'Fury Combo',    damage: 38, knockback: 180 },
        { inputs: ['punch', 'punch', 'punch'], name: 'Triple Threat', damage: 30, knockback: 100 },
        { inputs: ['kick',  'kick',  'punch'], name: 'Sweep Combo',   damage: 35, knockback: 160 },
    ];

    // ── constructor ────────────────────────────────────────────
    constructor(scene, config) {
        this.scene = scene;

        // Position / physics
        this.x         = config.x;
        this.y         = config.y;      // y = ground level (feet)
        this.groundY   = config.y;
        this.velX      = 0;
        this.velY      = 0;
        this.facingRight = config.facingRight !== false; // default true

        // Appearance
        this.bodyColor   = config.bodyColor   || 0x4169E1;
        this.pantsColor  = config.pantsColor  || 0x1a1a2e;
        this.skinColor   = config.skinColor   || 0xF4A460;
        this.faceDataUrl = config.faceDataUrl || null;
        this.name        = config.name        || 'Fighter';

        // Combat stats
        this.maxHp = 100;
        this.hp    = 100;

        // State machine
        // Valid states: 'idle' | 'walking' | 'jumping' | 'punch' | 'kick' | 'blocking' | 'special' | 'hit' | 'ko'
        this.state        = 'idle';
        this.stateTimer   = 0; // countdown (ms) until state ends
        this.isGrounded   = true;
        this.isBlocking   = false;

        // Attack parameters (keys must match the state names used for attacks)
        this._attacks = {
            punch:   { damage: 10, duration: 250, hitWindow: [80,  220], range: 60  },
            kick:    { damage: 15, duration: 380, hitWindow: [100, 320], range: 80  },
            special: { damage: 28, duration: 550, hitWindow: [150, 480], range: 100 },
        };

        // Whether an active attack has already landed (prevent multi-hit per swing)
        this._attackHit = false;

        // Combo tracking
        this._comboBuffer  = []; // recent attack names
        this._comboTimers  = []; // timestamps of each entry
        this._comboTimeout = 700; // ms – window to complete a combo

        // Rendering
        this.graphics  = scene.add.graphics();
        this.faceImage = null; // Phaser Image once loaded
        this._loadFaceTexture();

        // Hit flash
        this._flashTimer = 0;

        // Special move charge
        this._specialCharge = 0; // 0-100
    }

    // ── face texture ──────────────────────────────────────────
    _loadFaceTexture() {
        if (!this.faceDataUrl) return;

        const key = 'face_' + this.name + '_' + Date.now();
        if (!this.scene.textures.exists(key)) {
            const img = new Image();
            img.onload = () => {
                const tex = this.scene.textures.createCanvas(key, img.width, img.height);
                tex.context.drawImage(img, 0, 0);
                tex.refresh();
                this.faceImage = this.scene.add.image(0, 0, key);
                this.faceImage.setDisplaySize(
                    Fighter.HEAD_RADIUS * 2,
                    Fighter.HEAD_RADIUS * 2
                );
                this.faceImage.setDepth(10);
            };
            img.src = this.faceDataUrl;
        }
    }

    // ── public API ────────────────────────────────────────────

    /** @returns {{x:number,y:number,w:number,h:number}} */
    getBodyHitbox() {
        return {
            x: this.x - Fighter.WIDTH / 2,
            y: this.y - Fighter.HEIGHT,
            w: Fighter.WIDTH,
            h: Fighter.HEIGHT,
        };
    }

    /** Attack hitbox (extended in facing direction) when swinging */
    getAttackHitbox() {
        if (!this._isAttacking()) return null;
        const attack = this._attacks[this.state];
        if (!attack) return null;

        const elapsed = attack.duration - this.stateTimer;
        const [winStart, winEnd] = attack.hitWindow;
        if (elapsed < winStart || elapsed > winEnd) return null;

        const dir = this.facingRight ? 1 : -1;
        return {
            x: this.x + dir * (Fighter.WIDTH / 2),
            y: this.y - Fighter.HEIGHT * 0.65,
            w: attack.range,
            h: Fighter.HEIGHT * 0.5,
        };
    }

    /** Deal damage to this fighter from an opponent's active attack. */
    receiveHit(rawDamage) {
        if (this.state === 'ko') return 0;
        const dmg = this.isBlocking ? Math.floor(rawDamage * 0.2) : rawDamage;
        this.hp = Math.max(0, this.hp - dmg);
        this._flashTimer = 200;
        if (!this.isBlocking) {
            this._enterState('hit', 300);
        }
        if (this.hp === 0) {
            this._enterState('ko', Infinity);
        }
        return dmg;
    }

    /** Called when we detect a combo from the buffer. Returns combo info or null. */
    checkCombo() {
        const now = Date.now();
        // Purge stale entries
        while (this._comboTimers.length > 0 && now - this._comboTimers[0] > this._comboTimeout) {
            this._comboTimers.shift();
            this._comboBuffer.shift();
        }

        for (const combo of Fighter.COMBOS) {
            if (this._comboBuffer.length < combo.inputs.length) continue;
            const slice = this._comboBuffer.slice(-combo.inputs.length);
            if (slice.every((v, i) => v === combo.inputs[i])) {
                // Clear buffer after combo detected
                this._comboBuffer = [];
                this._comboTimers = [];
                return combo;
            }
        }
        return null;
    }

    /** Start a punch */
    punch() {
        if (!this._canAttack()) return false;
        this._pushCombo('punch');
        this._enterState('punch', this._attacks.punch.duration);
        this._attackHit = false;
        return true;
    }

    /** Start a kick */
    kick() {
        if (!this._canAttack()) return false;
        this._pushCombo('kick');
        this._enterState('kick', this._attacks.kick.duration);
        this._attackHit = false;
        return true;
    }

    /** Start a special move */
    special() {
        if (!this._canAttack()) return false;
        this._enterState('special', this._attacks.special.duration);
        this._attackHit = false;
        return true;
    }

    /** Start/stop blocking */
    setBlocking(flag) {
        if (this.state === 'ko') return;
        this.isBlocking = flag;
        if (flag && this._canBlock()) {
            this._enterState('blocking', Infinity);
        } else if (!flag && this.state === 'blocking') {
            this._enterState('idle', 0);
        }
    }

    /** Move horizontally.  +1 = right, -1 = left, 0 = stop */
    move(dir) {
        if (this.state === 'ko' || this._isAttacking() || this.state === 'hit') return;
        const speed = 220;
        this.velX = dir * speed;
        if (dir !== 0) {
            this.facingRight = dir > 0;
            if (this.isGrounded) this._enterState('walking', Infinity);
        } else {
            if (this.state === 'walking') this._enterState('idle', 0);
        }
    }

    /** Jump */
    jump() {
        if (!this.isGrounded || this.state === 'ko' || this._isAttacking()) return;
        this.velY = -680;
        this.isGrounded = false;
        this._enterState('jumping', Infinity);
    }

    /** Increase special charge (held button) */
    chargeSpecial(deltaMs) {
        this._specialCharge = Math.min(100, this._specialCharge + deltaMs * 0.12);
    }

    /** @returns {number} 0-100 */
    getSpecialCharge() { return this._specialCharge; }

    isKO() { return this.state === 'ko'; }
    isAlive() { return this.hp > 0; }

    // ── update ────────────────────────────────────────────────
    update(deltaMs) {
        if (this.state === 'ko') {
            this._draw();
            return;
        }

        // Gravity
        if (!this.isGrounded) {
            this.velY += Fighter.GRAVITY * (deltaMs / 1000);
        }

        // Integrate
        this.x += this.velX * (deltaMs / 1000);
        this.y += this.velY * (deltaMs / 1000);

        // Ground clamp
        if (this.y >= this.groundY) {
            this.y = this.groundY;
            this.velY = 0;
            if (!this.isGrounded) {
                this.isGrounded = true;
                if (this.state === 'jumping') this._enterState('idle', 0);
            }
        }

        // Decelerate horizontal (friction) when not explicitly moving
        if (this.state !== 'walking') {
            this.velX *= Math.pow(0.01, deltaMs / 1000);
            if (Math.abs(this.velX) < 1) this.velX = 0;
        }

        // State timer countdown
        if (this.stateTimer !== Infinity) {
            this.stateTimer -= deltaMs;
            if (this.stateTimer <= 0) {
                this._onStateExpired();
            }
        }

        // Hit flash countdown
        if (this._flashTimer > 0) this._flashTimer -= deltaMs;

        // Special charge decay
        if (!this._isAttacking()) {
            this._specialCharge = Math.max(0, this._specialCharge - deltaMs * 0.03);
        }

        this._draw();
    }

    // ── private helpers ───────────────────────────────────────

    _isAttacking() {
        return ['punch', 'kick', 'special'].includes(this.state);
    }

    _canAttack() {
        return this.isGrounded &&
               !this._isAttacking() &&
               this.state !== 'hit' &&
               this.state !== 'ko';
    }

    _canBlock() {
        return this.isGrounded && !this._isAttacking() && this.state !== 'ko';
    }

    _enterState(state, durationMs) {
        this.state      = state;
        this.stateTimer = durationMs;
        if (state !== 'blocking') this.isBlocking = false;
    }

    _onStateExpired() {
        switch (this.state) {
            case 'punch':
            case 'kick':
            case 'special':
            case 'hit':
                this._enterState('idle', 0);
                break;
            default:
                break;
        }
    }

    _pushCombo(action) {
        this._comboBuffer.push(action);
        this._comboTimers.push(Date.now());
        // Keep buffer bounded
        if (this._comboBuffer.length > 5) {
            this._comboBuffer.shift();
            this._comboTimers.shift();
        }
    }

    // ── drawing ───────────────────────────────────────────────
    _draw() {
        const g   = this.graphics;
        const now = Date.now(); // cache once per draw call
        g.clear();

        const flashing = this._flashTimer > 0 && Math.floor(this._flashTimer / 50) % 2 === 0;
        const alpha     = this.state === 'ko' ? 0.5 : 1;
        g.setAlpha(alpha);

        const dir   = this.facingRight ? 1 : -1;
        const x     = this.x;
        const y     = this.y; // feet

        // ── legs ────────────────────────────────────────────
        const legColor = flashing ? 0xff4444 : this.pantsColor;

        const legW  = 14;
        const legH  = 34;
        const hipY  = y - legH;

        // Leg animation
        let leftLegAngle  = 0;
        let rightLegAngle = 0;
        if (this.state === 'walking') {
            const t = now / 200;
            leftLegAngle  =  Math.sin(t) * 0.35;
            rightLegAngle = -Math.sin(t) * 0.35;
        } else if (this.state === 'kick') {
            const progress = 1 - (this.stateTimer / this._attacks.kick.duration);
            rightLegAngle  = dir * Math.sin(progress * Math.PI) * 0.9;
        } else if (this.state === 'jumping') {
            leftLegAngle  = -0.3;
            rightLegAngle =  0.3;
        }

        this._drawLeg(g, x - 8, hipY, legW, legH, leftLegAngle, legColor);
        this._drawLeg(g, x + 8, hipY, legW, legH, rightLegAngle, legColor);

        // ── torso ────────────────────────────────────────────
        const torsoColor = flashing ? 0xff4444 : this.bodyColor;
        g.fillStyle(torsoColor, 1);
        const torsoH = 44;
        const torsoY = hipY - torsoH;
        g.fillRoundedRect(x - 18, torsoY, 36, torsoH, 6);

        // ── arms ─────────────────────────────────────────────
        const armColor = flashing ? 0xff4444 : this.skinColor;
        const armW = 12;
        const armH = 30;
        const shoulderY = torsoY + 4;

        let leftArmAngle  = 0;
        let rightArmAngle = 0;
        if (this.state === 'punch') {
            const progress = 1 - (this.stateTimer / this._attacks.punch.duration);
            rightArmAngle  = dir * Math.sin(progress * Math.PI) * 1.2;
        } else if (this.state === 'blocking') {
            leftArmAngle  =  0.8;
            rightArmAngle = -0.8;
        } else if (this.state === 'special') {
            rightArmAngle = dir * (0.6 + Math.sin(now / 100) * 0.4);
        }

        this._drawArm(g, x - 18, shoulderY, armW, armH, leftArmAngle, armColor);
        this._drawArm(g, x + 18, shoulderY, armW, armH, rightArmAngle, armColor);

        // ── head ─────────────────────────────────────────────
        const headCX = x;
        const headCY = torsoY - Fighter.HEAD_RADIUS - 2;

        if (this.faceImage) {
            // Position the face image
            this.faceImage.setPosition(headCX, headCY);
            this.faceImage.setAlpha(alpha);
            if (!this.facingRight) {
                this.faceImage.setFlipX(true);
            } else {
                this.faceImage.setFlipX(false);
            }
        } else {
            // Fallback: solid circle
            const headColor = flashing ? 0xff4444 : this.skinColor;
            g.fillStyle(headColor, 1);
            g.fillCircle(headCX, headCY, Fighter.HEAD_RADIUS);
            // Simple face
            g.fillStyle(0x000000, 0.7);
            g.fillCircle(headCX - 6, headCY - 4, 3);
            g.fillCircle(headCX + 6, headCY - 4, 3);
            g.lineStyle(2, 0x000000, 0.7);
            g.beginPath();
            g.arc(headCX, headCY + 5, 8, 0.1, Math.PI - 0.1);
            g.strokePath();
        }

        // KO overlay text
        if (this.state === 'ko') {
            g.fillStyle(0x000000, 0.4);
            g.fillRect(x - 25, y - Fighter.HEIGHT - 20, 50, 20);
        }

        // Special charge indicator
        if (this._specialCharge > 10) {
            const barW = 40 * (this._specialCharge / 100);
            g.fillStyle(0xFFD700, 0.8);
            g.fillRect(x - 20, y - Fighter.HEIGHT - 12, barW, 6);
            g.lineStyle(1, 0xffffff, 0.5);
            g.strokeRect(x - 20, y - Fighter.HEIGHT - 12, 40, 6);
        }
    }

    /** Draw a single leg rotated around its top */
    _drawLeg(g, baseX, topY, w, h, angle, color) {
        g.fillStyle(color, 1);
        // Simple approximation with a rotated rectangle using matrix
        g.save();
        g.translateCanvas(baseX, topY);
        g.rotateCanvas(angle);
        g.fillRect(-w / 2, 0, w, h);
        g.restore();
    }

    /** Draw a single arm rotated around its top */
    _drawArm(g, baseX, topY, w, h, angle, color) {
        g.fillStyle(color, 1);
        g.save();
        g.translateCanvas(baseX, topY);
        g.rotateCanvas(angle);
        g.fillRect(-w / 2, 0, w, h);
        g.restore();
    }

    /** Clean up Phaser objects */
    destroy() {
        this.graphics.destroy();
        if (this.faceImage) this.faceImage.destroy();
    }
}
