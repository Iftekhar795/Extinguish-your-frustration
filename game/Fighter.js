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
        const now = Date.now();
        g.clear();

        const flashing = this._flashTimer > 0 && Math.floor(this._flashTimer / 50) % 2 === 0;
        const alpha    = this.state === 'ko' ? 0.48 : 1;
        g.setAlpha(alpha);

        const dir = this.facingRight ? 1 : -1;
        const x   = this.x;
        const y   = this.y; // feet

        // ── Per-state animation parameters ───────────────────
        // All offsets are in game units; angles in radians.

        let bodyLeanX    = 0;   // torso/head horizontal offset
        let crouchOffset = 0;   // feet-to-hip distance change (positive = squat)
        let headOffX     = 0;   // extra head horizontal offset
        let headOffY     = 0;   // extra head vertical offset

        let leftLegAngle  = 0;
        let rightLegAngle = 0;
        let leftArmAngle  = 0;
        let rightArmAngle = 0;

        // Pre-compute progress values (0→1 over the state duration)
        const punchProg   = this.state === 'punch'
            ? Math.max(0, 1 - this.stateTimer / this._attacks.punch.duration) : 0;
        const kickProg    = this.state === 'kick'
            ? Math.max(0, 1 - this.stateTimer / this._attacks.kick.duration) : 0;
        const specialProg = this.state === 'special'
            ? Math.max(0, 1 - this.stateTimer / this._attacks.special.duration) : 0;
        const hitProg     = this.state === 'hit'
            ? Math.max(0, 1 - this.stateTimer / 300) : 0;

        switch (this.state) {
            case 'idle': {
                // Gentle breathing bob in guard stance
                const breath = Math.sin(now / 600) * 2.2;
                crouchOffset  = breath;
                leftArmAngle  = -dir * 0.18;
                rightArmAngle =  dir * 0.18;
                leftLegAngle  = -0.06;
                rightLegAngle =  0.06;
                break;
            }
            case 'walking': {
                const t = now / 175;
                leftLegAngle  =  Math.sin(t) * 0.52;
                rightLegAngle = -Math.sin(t) * 0.52;
                leftArmAngle  = -Math.sin(t) * 0.30;
                rightArmAngle =  Math.sin(t) * 0.30;
                bodyLeanX     = dir * 3;
                break;
            }
            case 'punch': {
                const s = Math.sin(punchProg * Math.PI);
                // Body drives into the punch
                bodyLeanX     = dir * s * 11;
                // Front arm shoots fully out; back arm stays in guard
                rightArmAngle = dir * s * 1.55;
                leftArmAngle  = -dir * 0.28;
                // Slight hip twist
                leftLegAngle  = -dir * 0.08;
                rightLegAngle =  dir * 0.08;
                break;
            }
            case 'kick': {
                const s = Math.sin(kickProg * Math.PI);
                // Roundhouse: kicking leg sweeps up and out
                rightLegAngle =  dir * s * 1.25;
                // Body tilts opposite for balance
                bodyLeanX     = -dir * s * 7;
                // Arms swing for counterbalance
                leftArmAngle  =  dir * s * 0.45;
                rightArmAngle = -dir * s * 0.30;
                // Rise on support leg at peak
                crouchOffset  = -s * 5;
                break;
            }
            case 'blocking': {
                // Crossed-guard: arms raised and crossed in front
                crouchOffset  =  6;
                leftArmAngle  =  dir * 1.05;
                rightArmAngle = -dir * 0.95;
                leftLegAngle  = -0.10;
                rightLegAngle =  0.10;
                break;
            }
            case 'special': {
                // Dramatic charge pose: both arms thrust forward + pulse
                const pulse   = Math.sin(now / 72) * 0.28;
                leftArmAngle  = dir * (0.72 + pulse);
                rightArmAngle = dir * (1.05 + pulse);
                leftLegAngle  = -0.16;
                rightLegAngle =  0.16;
                bodyLeanX     = dir * 6;
                break;
            }
            case 'hit': {
                // Full-body snap-back recoil
                bodyLeanX     = -dir * hitProg * 15;
                headOffX      = -dir * hitProg * 9;
                headOffY      =  hitProg * 5;
                leftArmAngle  = -dir * hitProg * 0.55;
                rightArmAngle = -dir * hitProg * 0.55;
                break;
            }
            case 'jumping': {
                // Knees pulled up, arms reach forward
                leftLegAngle  = -0.42;
                rightLegAngle =  0.42;
                leftArmAngle  =  dir * 0.25;
                rightArmAngle = -dir * 0.25;
                break;
            }
            case 'ko': {
                // Slumped-forward collapse
                bodyLeanX     = dir * 18;
                headOffX      = dir * 12;
                headOffY      =  9;
                leftArmAngle  =  dir * 0.65;
                rightArmAngle =  dir * 0.40;
                leftLegAngle  =  dir * 0.22;
                rightLegAngle = -dir * 0.16;
                break;
            }
        }

        // ── Layout ───────────────────────────────────────────
        const legW  = 14;
        const legH  = 34;
        const torsoH = 44;

        const drawY   = y + crouchOffset;
        const hipY    = drawY - legH;
        const torsoY  = hipY - torsoH;
        const torsoX  = x + bodyLeanX;

        // ── Legs ─────────────────────────────────────────────
        const legColor = flashing ? 0xff3333 : this.pantsColor;
        this._drawLeg(g, x - 8, hipY, legW, legH, leftLegAngle,  legColor);
        this._drawLeg(g, x + 8, hipY, legW, legH, rightLegAngle, legColor);

        // ── Torso ─────────────────────────────────────────────
        const torsoColor = flashing ? 0xff3333 : this.bodyColor;

        // Shadow under torso for depth
        g.fillStyle(0x000000, 0.18);
        g.fillRoundedRect(torsoX - 17, torsoY + 3, 36, torsoH, 6);

        g.fillStyle(torsoColor, 1);
        g.fillRoundedRect(torsoX - 18, torsoY, 36, torsoH, 6);

        // Subtle highlight stripe
        g.fillStyle(0xffffff, 0.10);
        g.fillRoundedRect(torsoX - 18, torsoY, 36, torsoH * 0.45, 6);

        // ── Special: energy orb / glow ────────────────────────
        if (this.state === 'special' && this._specialCharge > 25) {
            const ratio  = this._specialCharge / 100;
            const gAlpha = 0.14 + Math.sin(now / 70) * 0.08;
            g.fillStyle(0x00CCFF, gAlpha);
            g.fillCircle(torsoX, torsoY + torsoH * 0.5, 30 + ratio * 10 + Math.sin(now / 80) * 4);

            // Orb at fist tip
            const orbR = 7 + ratio * 11;
            const orbX = torsoX + dir * (18 + Math.sin(rightArmAngle) * 28);
            const orbY = torsoY + 4 + Math.cos(rightArmAngle) * 28;
            g.fillStyle(0x00EEFF, 0.55 + Math.sin(now / 65) * 0.2);
            g.fillCircle(orbX, orbY, orbR);
            g.fillStyle(0xffffff, 0.40);
            g.fillCircle(orbX - orbR * 0.28, orbY - orbR * 0.28, orbR * 0.40);
        }

        // ── Arms ─────────────────────────────────────────────
        const armColor = flashing ? 0xff3333 : this.skinColor;
        const armW     = 12;
        const armH     = 30;
        const shoulderY = torsoY + 4;

        this._drawArm(g, torsoX - 18, shoulderY, armW, armH, leftArmAngle,  armColor);
        this._drawArm(g, torsoX + 18, shoulderY, armW, armH, rightArmAngle, armColor);

        // Fist knuckle at tip of front arm during punch / kick
        if (this.state === 'punch' && punchProg > 0.3 && punchProg < 0.85) {
            const fistX = torsoX + dir * (18 + Math.sin(rightArmAngle) * armH);
            const fistY = shoulderY + Math.cos(rightArmAngle) * armH;
            g.fillStyle(flashing ? 0xff3333 : this.skinColor, 1);
            g.fillCircle(fistX, fistY, 8);
        }

        // ── Head ─────────────────────────────────────────────
        const headCX = torsoX + headOffX;
        const headCY = torsoY - Fighter.HEAD_RADIUS - 2 + headOffY;

        if (this.faceImage) {
            this.faceImage.setPosition(headCX, headCY);
            this.faceImage.setAlpha(alpha);
            this.faceImage.setFlipX(!this.facingRight);
            if (flashing) {
                this.faceImage.setTint(0xff6666);
            } else {
                this.faceImage.clearTint();
            }
        } else {
            // Fallback procedural head
            const headColor = flashing ? 0xff3333 : this.skinColor;

            // Shadow
            g.fillStyle(0x000000, 0.18);
            g.fillCircle(headCX + 2, headCY + 2, Fighter.HEAD_RADIUS);

            g.fillStyle(headColor, 1);
            g.fillCircle(headCX, headCY, Fighter.HEAD_RADIUS);

            // Highlight
            g.fillStyle(0xffffff, 0.14);
            g.fillCircle(headCX - 6, headCY - 6, Fighter.HEAD_RADIUS * 0.55);

            // Eyes
            const eyeColor = (this.state === 'hit' || this.state === 'ko') ? 0x555555 : 0x000000;
            g.fillStyle(eyeColor, 0.75);
            g.fillCircle(headCX - 7, headCY - 4, 3.5);
            g.fillCircle(headCX + 7, headCY - 4, 3.5);

            // Expression mouth
            g.lineStyle(2, 0x000000, 0.65);
            g.beginPath();
            if (this.state === 'hit' || this.state === 'ko') {
                // Grimace
                g.arc(headCX, headCY + 9, 7, Math.PI, 0);
            } else if (this.state === 'punch' || this.state === 'kick' || this.state === 'special') {
                // Fierce grin
                g.arc(headCX, headCY + 3, 9, 0.15, Math.PI - 0.15);
            } else {
                // Neutral guard
                g.arc(headCX, headCY + 6, 7, 0.1, Math.PI - 0.1);
            }
            g.strokePath();
        }

        // ── Special charge meter (below fighter) ──────────────
        if (this._specialCharge > 8) {
            const meterW = 44;
            const meterH = 6;
            const meterX = x - meterW / 2;
            const meterY = y - Fighter.HEIGHT - 16;
            const fill   = this._specialCharge / 100;

            // Background track
            g.fillStyle(0x001833, 0.7);
            g.fillRoundedRect(meterX, meterY, meterW, meterH, 3);

            // Fill – cyan/blue gradient approximation via two rects
            g.fillStyle(0x0088CC, 0.9);
            g.fillRoundedRect(meterX, meterY, meterW * fill, meterH, 3);
            g.fillStyle(0x00DDFF, 0.55);
            g.fillRoundedRect(meterX, meterY, meterW * fill, meterH / 2, 3);

            // Border
            g.lineStyle(1, 0x0066AA, 0.8);
            g.strokeRoundedRect(meterX, meterY, meterW, meterH, 3);
        }
    }

    /** Draw a single leg rotated around its attachment point */
    _drawLeg(g, baseX, topY, w, h, angle, color) {
        g.fillStyle(color, 1);
        g.save();
        g.translateCanvas(baseX, topY);
        g.rotateCanvas(angle);
        g.fillRoundedRect(-w / 2, 0, w, h, 3);
        g.restore();
    }

    /** Draw a single arm rotated around its attachment point */
    _drawArm(g, baseX, topY, w, h, angle, color) {
        g.fillStyle(color, 1);
        g.save();
        g.translateCanvas(baseX, topY);
        g.rotateCanvas(angle);
        g.fillRoundedRect(-w / 2, 0, w, h, 3);
        g.restore();
    }

    /** Clean up Phaser objects */
    destroy() {
        this.graphics.destroy();
        if (this.faceImage) this.faceImage.destroy();
    }
}
