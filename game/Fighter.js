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
        { inputs: ['punch', 'punch', 'kick'],  name: 'HADOUKEN!',      damage: 38, knockback: 180 },
        { inputs: ['punch', 'punch', 'punch'], name: 'TRIPLE JABS!',   damage: 30, knockback: 100 },
        { inputs: ['kick',  'kick',  'punch'], name: 'DRAGON RUSH!',   damage: 35, knockback: 160 },
        { inputs: ['kick',  'kick',  'kick'],  name: 'HURRICANE KICK!',damage: 32, knockback: 140 },
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

        // Super meter (SF-style gauge – fills from dealing/receiving damage)
        this._superMeter    = 0;
        this._superMeterMax = 100;

        // State machine
        // Valid states: 'idle'|'walking'|'jumping'|'punch'|'kick'|'crouchPunch'|'crouchKick'|
        //               'jumpPunch'|'jumpKick'|'crouching'|'blocking'|'special'|'shoryuken'|'hit'|'ko'
        this.state        = 'idle';
        this.stateTimer   = 0; // countdown (ms) until state ends
        this.isGrounded   = true;
        this.isBlocking   = false;

        // Attack parameters (keys must match the state names used for attacks)
        this._attacks = {
            punch:       { damage: 10, duration: 240, hitWindow: [50,  190], range: 65  },
            kick:        { damage: 15, duration: 360, hitWindow: [80,  290], range: 85  },
            crouchPunch: { damage: 8,  duration: 200, hitWindow: [45,  160], range: 55  },
            crouchKick:  { damage: 18, duration: 420, hitWindow: [100, 360], range: 100 },
            jumpPunch:   { damage: 12, duration: 280, hitWindow: [60,  230], range: 70  },
            jumpKick:    { damage: 18, duration: 320, hitWindow: [80,  290], range: 80  },
            special:     { damage: 0,  duration: 450, hitWindow: [0,   0  ], range: 0   },
            shoryuken:   { damage: 32, duration: 520, hitWindow: [55,  300], range: 52  },
        };

        // Projectile fire callback – assigned by FightScene after construction
        this._onProjectileFire = null;

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
        const crouching = this.state === 'crouching' || this.state === 'crouchPunch' || this.state === 'crouchKick';
        const heightMul = crouching ? 0.60 : 1;
        return {
            x: this.x - Fighter.WIDTH / 2,
            y: this.y - Fighter.HEIGHT * heightMul,
            w: Fighter.WIDTH,
            h: Fighter.HEIGHT * heightMul,
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

        // Shoryuken has a tall upward hitbox
        if (this.state === 'shoryuken') {
            return {
                x: this.x - Fighter.WIDTH / 2 + dir * 4,
                y: this.y - Fighter.HEIGHT * 1.8,
                w: Fighter.WIDTH + attack.range,
                h: Fighter.HEIGHT * 1.3,
            };
        }

        // Crouching attacks hit low; jump attacks travel with the fighter; normal attacks hit mid
        const isCrouch = this.state === 'crouchPunch' || this.state === 'crouchKick';
        const hitY  = isCrouch
            ? this.y - Fighter.HEIGHT * 0.30
            : this.y - Fighter.HEIGHT * 0.65;
        const hitH  = isCrouch
            ? Fighter.HEIGHT * 0.30
            : Fighter.HEIGHT * 0.50;

        return {
            x: this.x + dir * (Fighter.WIDTH / 2),
            y: hitY,
            w: attack.range,
            h: hitH,
        };
    }

    /** Deal damage to this fighter from an opponent's active attack. */
    receiveHit(rawDamage, knockbackDir = 0, knockbackForce = 0) {
        if (this.state === 'ko') return 0;
        const dmg = this.isBlocking ? Math.floor(rawDamage * 0.2) : rawDamage;
        this.hp = Math.max(0, this.hp - dmg);
        this._flashTimer = 200;
        // Build super meter from taking damage (SF mechanic – "revenge gauge")
        this._superMeter = Math.min(this._superMeterMax, this._superMeter + Math.floor(dmg * 0.9));
        if (!this.isBlocking) {
            this._enterState('hit', 300);
            // Apply knockback on strong hits (kick / Shoryuken)
            if (knockbackDir !== 0 && knockbackForce > 0) {
                this.velX = knockbackDir * knockbackForce;
            }
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

    /** Start a punch – routes to crouchPunch, jumpPunch, or standing punch */
    punch() {
        if (!this._canAttack()) return false;
        this._pushCombo('punch');
        if (!this.isGrounded) {
            this._enterState('jumpPunch', this._attacks.jumpPunch.duration);
        } else if (this.state === 'crouching') {
            this._enterState('crouchPunch', this._attacks.crouchPunch.duration);
        } else {
            this._enterState('punch', this._attacks.punch.duration);
        }
        this._attackHit = false;
        this._superMeter = Math.min(this._superMeterMax, this._superMeter + 5);
        return true;
    }

    /** Start a kick – routes to crouchKick, jumpKick, or standing kick */
    kick() {
        if (!this._canAttack()) return false;
        this._pushCombo('kick');
        if (!this.isGrounded) {
            this._enterState('jumpKick', this._attacks.jumpKick.duration);
        } else if (this.state === 'crouching') {
            this._enterState('crouchKick', this._attacks.crouchKick.duration);
        } else {
            this._enterState('kick', this._attacks.kick.duration);
        }
        this._attackHit = false;
        this._superMeter = Math.min(this._superMeterMax, this._superMeter + 5);
        return true;
    }

    /** Start a special move (Hadouken – fires a projectile) */
    special() {
        if (!this._canAttack()) return false;
        this._enterState('special', this._attacks.special.duration);
        this._attackHit = false;
        // Fire the projectile after a short wind-up
        this.scene.time.delayedCall(210, () => {
            if (this.state === 'special' && this._onProjectileFire) {
                this._onProjectileFire();
            }
        });
        return true;
    }

    /** Shoryuken – rising uppercut super move. Costs full super meter. */
    shoryuken() {
        if (!this._canAttack()) return false;
        if (this._superMeter < this._superMeterMax) return false;
        this._superMeter = 0;
        this._enterState('shoryuken', this._attacks.shoryuken.duration);
        this._attackHit = false;
        // Launch upward and forward
        this.velY       = -820;
        this.isGrounded = false;
        return true;
    }

    /** @returns {number} 0-100 */
    getSuperMeter() { return this._superMeter; }

    /** Add to the super meter (clamped to max). */
    addSuperMeter(amount) {
        this._superMeter = Math.min(this._superMeterMax, this._superMeter + amount);
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

    /** Enter or hold a crouch */
    crouch() {
        if (this.state === 'ko' || this._isAttacking() || this.state === 'hit' || !this.isGrounded) return;
        if (this.state !== 'crouching') {
            this.isBlocking = false;
            this._enterState('crouching', Infinity);
        }
    }

    /** Stand up from crouch */
    standUp() {
        if (this.state === 'crouching') {
            this._enterState('idle', 0);
        }
    }

    /** Move horizontally.  +1 = right, -1 = left, 0 = stop */
    move(dir) {
        if (this.state === 'ko' || this._isAttacking() || this.state === 'hit') return;
        if (this.state === 'crouching' && dir !== 0) return; // can't walk while crouching
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
                if (['jumping', 'jumpPunch', 'jumpKick'].includes(this.state)) {
                    this._enterState('idle', 0);
                }
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
        return ['punch', 'kick', 'crouchPunch', 'crouchKick', 'jumpPunch', 'jumpKick', 'special', 'shoryuken'].includes(this.state);
    }

    _canAttack() {
        // Allow attacks from ground states OR while jumping (for air attacks)
        return !this._isAttacking() &&
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
            case 'crouchPunch':
            case 'crouchKick':
                this._enterState('crouching', Infinity);
                break;
            case 'jumpPunch':
            case 'jumpKick':
            case 'shoryuken':
                // Return to jumping (or idle if already landed)
                if (this.isGrounded) {
                    this._enterState('idle', 0);
                } else {
                    this._enterState('jumping', Infinity);
                }
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
        const punchProg      = this.state === 'punch'
            ? Math.max(0, 1 - this.stateTimer / this._attacks.punch.duration) : 0;
        const kickProg       = this.state === 'kick'
            ? Math.max(0, 1 - this.stateTimer / this._attacks.kick.duration) : 0;
        const specialProg    = this.state === 'special'
            ? Math.max(0, 1 - this.stateTimer / this._attacks.special.duration) : 0;
        const hitProg        = this.state === 'hit'
            ? Math.max(0, 1 - this.stateTimer / 300) : 0;
        const crouchPunchProg = this.state === 'crouchPunch'
            ? Math.max(0, 1 - this.stateTimer / this._attacks.crouchPunch.duration) : 0;
        const crouchKickProg  = this.state === 'crouchKick'
            ? Math.max(0, 1 - this.stateTimer / this._attacks.crouchKick.duration) : 0;
        const jumpPunchProg   = this.state === 'jumpPunch'
            ? Math.max(0, 1 - this.stateTimer / this._attacks.jumpPunch.duration) : 0;
        const jumpKickProg    = this.state === 'jumpKick'
            ? Math.max(0, 1 - this.stateTimer / this._attacks.jumpKick.duration) : 0;
        const shoryukenProg   = this.state === 'shoryuken'
            ? Math.max(0, 1 - this.stateTimer / this._attacks.shoryuken.duration) : 0;

        switch (this.state) {
            case 'idle': {
                // SF-style guard stance: low crouch, both fists raised, slight forward lean
                const breath  = Math.sin(now / 600) * 1.5;
                crouchOffset  = 7 + breath;
                bodyLeanX     = dir * 4;
                leftArmAngle  = dir * 0.72;   // lead guard arm forward
                rightArmAngle = dir * 0.36;   // rear arm close to chin
                leftLegAngle  = -0.13;
                rightLegAngle =  0.13;
                break;
            }
            case 'walking': {
                // Keep guard up while moving – SF side-step walk
                const t = now / 180;
                leftLegAngle  =  Math.sin(t) * 0.48;
                rightLegAngle = -Math.sin(t) * 0.48;
                leftArmAngle  = dir * 0.62 + Math.sin(t) * 0.14;
                rightArmAngle = dir * 0.28 - Math.sin(t) * 0.14;
                bodyLeanX     = dir * 5;
                crouchOffset  = 5;
                break;
            }
            case 'punch': {
                // Sharp straight jab: body drives forward, lead arm extends fully
                const s = Math.sin(punchProg * Math.PI);
                bodyLeanX     = dir * s * 13;
                rightArmAngle = dir * s * 1.62;  // full extension
                leftArmAngle  = dir * 0.35;       // guard arm up
                leftLegAngle  = -dir * 0.10;
                rightLegAngle =  dir * 0.10;
                headOffX      = dir * s * 5;
                crouchOffset  = s * 3;
                break;
            }
            case 'kick': {
                // SF roundhouse: leg rises to ~1.68 rad, body counter-leans dramatically
                const s = Math.sin(kickProg * Math.PI);
                rightLegAngle =  dir * s * 1.68;   // higher leg raise than before
                bodyLeanX     = -dir * s * 11;
                leftArmAngle  =  dir * s * 0.62;
                rightArmAngle = -dir * s * 0.42;
                crouchOffset  = -s * 10;
                headOffX      = -dir * s * 4;
                break;
            }
            case 'crouching': {
                // Deep crouch with low guard – reduces hitbox
                crouchOffset  = 25;
                bodyLeanX     = dir * 3;
                leftArmAngle  = dir * 0.55;
                rightArmAngle = dir * 0.25;
                leftLegAngle  =  dir * 0.18;
                rightLegAngle = -dir * 0.18;
                break;
            }
            case 'crouchPunch': {
                // Quick low jab from crouch
                const s = Math.sin(crouchPunchProg * Math.PI);
                crouchOffset  = 23;
                bodyLeanX     = dir * (3 + s * 9);
                rightArmAngle = dir * s * 1.45;
                leftArmAngle  = dir * 0.30;
                leftLegAngle  =  dir * 0.18;
                rightLegAngle = -dir * 0.18;
                break;
            }
            case 'crouchKick': {
                // Low sweep: kicking leg extends wide and low
                const s = Math.sin(crouchKickProg * Math.PI);
                crouchOffset  = 26;
                rightLegAngle = dir * s * 1.58;
                bodyLeanX     = -dir * s * 6;
                leftArmAngle  = dir * 0.30;
                rightArmAngle = dir * s * 0.20;
                leftLegAngle  =  dir * 0.12;
                break;
            }
            case 'jumpPunch': {
                // Aerial punch: arm drives diagonally downward-forward
                const s = Math.sin(jumpPunchProg * Math.PI);
                leftLegAngle  = -0.32;
                rightLegAngle =  0.32;
                rightArmAngle = dir * s * 1.42;
                leftArmAngle  = dir * 0.28;
                headOffX      = dir * s * 4;
                bodyLeanX     = dir * s * 7;
                break;
            }
            case 'jumpKick': {
                // Flying kick: leg thrusts forward-diagonally
                const s = Math.sin(jumpKickProg * Math.PI);
                rightLegAngle = dir * s * 1.52;
                leftLegAngle  = -0.25;
                leftArmAngle  = -dir * s * 0.42;
                rightArmAngle = -dir * s * 0.28;
                bodyLeanX     = dir * s * 8;
                break;
            }
            case 'blocking': {
                // SF high guard: forearms crossed in front of face, deep crouch
                crouchOffset  =  8;
                leftArmAngle  =  dir * 1.08;
                rightArmAngle = -dir * 0.98;
                leftLegAngle  = -0.12;
                rightLegAngle =  0.12;
                bodyLeanX     = -dir * 2;
                break;
            }
            case 'special': {
                // Hadouken pose: arms thrust forward, palms cupped together
                const pulse   = Math.sin(now / 65) * 0.18;
                leftArmAngle  = dir * (1.12 + pulse);
                rightArmAngle = dir * (1.38 + pulse);
                leftLegAngle  = -0.16;
                rightLegAngle =  0.16;
                bodyLeanX     = dir * 9;
                crouchOffset  = 6;
                break;
            }
            case 'hit': {
                // Dramatic snap-back with full-body recoil
                bodyLeanX     = -dir * hitProg * 18;
                headOffX      = -dir * hitProg * 11;
                headOffY      =  hitProg * 7;
                leftArmAngle  = -dir * hitProg * 0.62;
                rightArmAngle = -dir * hitProg * 0.62;
                crouchOffset  =  hitProg * 5;
                break;
            }
            case 'jumping': {
                // Knees pulled up, arms guard while airborne
                leftLegAngle  = -0.42;
                rightLegAngle =  0.42;
                leftArmAngle  =  dir * 0.62;
                rightArmAngle =  dir * 0.32;
                break;
            }
            case 'shoryuken': {
                // Rising Dragon Punch – arm drives straight upward, body rotates forward
                const s = Math.sin(shoryukenProg * Math.PI);
                rightArmAngle = -dir * (1.05 + s * 0.75);  // arm thrusts UP
                leftArmAngle  =  dir * 0.22;
                leftLegAngle  = -0.38;
                rightLegAngle =  0.38;
                bodyLeanX     =  dir * s * 12;
                headOffX      =  dir * s * 5;
                headOffY      = -s * 5;  // slight upward head surge
                crouchOffset  = -s * 6;
                break;
            }
            case 'ko': {
                // Dramatic backward collapse
                bodyLeanX     = dir * 22;
                headOffX      = dir * 14;
                headOffY      =  12;
                leftArmAngle  =  dir * 0.72;
                rightArmAngle =  dir * 0.45;
                leftLegAngle  =  dir * 0.26;
                rightLegAngle = -dir * 0.18;
                crouchOffset  =  8;
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

        // ── Special: Hadouken energy glow around hands ───────
        if (this.state === 'special') {
            const pulse   = Math.sin(now / 60) * 0.20 + 0.80;
            // Glow aura around the torso
            g.fillStyle(0x00AAFF, 0.10 + Math.sin(now / 80) * 0.05);
            g.fillCircle(torsoX, torsoY + torsoH * 0.5, 36 * pulse);
            // Energy ball between cupped hands (in front of fighter)
            const ballX = torsoX + dir * 32;
            const ballY = torsoY + torsoH * 0.35;
            const ballR  = 10 + Math.sin(now / 55) * 3;
            // Outer halo
            g.fillStyle(0x0044FF, 0.22);
            g.fillCircle(ballX, ballY, ballR * 2.2);
            // Core
            g.fillStyle(0x00CCFF, 0.75 + Math.sin(now / 60) * 0.15);
            g.fillCircle(ballX, ballY, ballR);
            // Inner bright spot
            g.fillStyle(0xffffff, 0.65);
            g.fillCircle(ballX - ballR * 0.30, ballY - ballR * 0.30, ballR * 0.38);
        }

        // ── Shoryuken: rising energy flame ────────────────────
        if (this.state === 'shoryuken') {
            const s     = Math.sin(shoryukenProg * Math.PI);
            const pulse = Math.sin(now / 55) * 0.18 + 0.72;
            // Outer fire halo
            g.fillStyle(0xFF4400, 0.18 * pulse);
            g.fillCircle(torsoX, torsoY, 40 + s * 22);
            // Mid flame
            g.fillStyle(0xFF8800, 0.40 * pulse);
            g.fillCircle(torsoX + dir * 8, torsoY - s * 14, 22 + s * 12);
            // Core bright tip (fist position)
            const fistX = torsoX + dir * 14 + dir * s * 10;
            const fistY = torsoY - 10 - s * 22;
            g.fillStyle(0xFFDD00, 0.80);
            g.fillCircle(fistX, fistY, 12 + s * 6);
            g.fillStyle(0xffffff, 0.55);
            g.fillCircle(fistX - 3, fistY - 3, 5);
        }

        // ── Super-meter full: golden power aura ───────────────
        if (this._superMeter >= this._superMeterMax && this.state !== 'shoryuken') {
            const pulse = Math.sin(now / 90) * 0.08 + 0.12;
            g.fillStyle(0xFFD700, pulse);
            g.fillCircle(x, y - Fighter.HEIGHT * 0.5, Fighter.HEIGHT * 0.68);
            // Orbiting sparks
            for (let i = 0; i < 4; i++) {
                const angle = now / 320 + i * Math.PI / 2;
                const sx = x  + Math.cos(angle) * 30;
                const sy = (y - Fighter.HEIGHT * 0.5) + Math.sin(angle) * 18;
                g.fillStyle(0xFFFF44, 0.65);
                g.fillCircle(sx, sy, 3.5);
            }
        }

        // ── Arms ─────────────────────────────────────────────
        const armColor = flashing ? 0xff3333 : this.skinColor;
        const armW     = 12;
        const armH     = 30;
        const shoulderY = torsoY + 4;

        this._drawArm(g, torsoX - 18, shoulderY, armW, armH, leftArmAngle,  armColor);
        this._drawArm(g, torsoX + 18, shoulderY, armW, armH, rightArmAngle, armColor);

        // Fist knuckle at tip of front arm during attacks
        const showFist = (this.state === 'punch'       && punchProg       > 0.30 && punchProg       < 0.85)
                      || (this.state === 'crouchPunch' && crouchPunchProg > 0.30 && crouchPunchProg < 0.85)
                      || (this.state === 'jumpPunch'   && jumpPunchProg   > 0.28 && jumpPunchProg   < 0.88)
                      || (this.state === 'shoryuken'   && shoryukenProg   > 0.15 && shoryukenProg   < 0.75);
        if (showFist) {
            const fistX = torsoX + dir * (18 + Math.sin(rightArmAngle) * armH);
            const fistY = shoulderY + Math.cos(rightArmAngle) * armH;
            const fistColor = this.state === 'shoryuken'
                ? (flashing ? 0xff3333 : 0xFFAA00)
                : (flashing ? 0xff3333 : this.skinColor);
            g.fillStyle(fistColor, 1);
            g.fillCircle(fistX, fistY, this.state === 'shoryuken' ? 10 : 8);
            if (this.state === 'shoryuken') {
                // Extra energy ring on fist
                g.lineStyle(2, 0xFFFF00, 0.7);
                g.strokeCircle(fistX, fistY, 14);
            }
        }

        // Boot / foot at tip of kicking leg during kick states
        const showBoot = (this.state === 'kick'      && kickProg      > 0.28 && kickProg      < 0.88)
                      || (this.state === 'crouchKick' && crouchKickProg > 0.28 && crouchKickProg < 0.88)
                      || (this.state === 'jumpKick'   && jumpKickProg   > 0.25 && jumpKickProg   < 0.90);
        if (showBoot) {
            const bootX = x + 8 + Math.sin(rightLegAngle) * legH;
            const bootY = hipY  + Math.cos(rightLegAngle) * legH;
            g.fillStyle(flashing ? 0xff3333 : this.pantsColor, 1);
            g.fillCircle(bootX, bootY, 9);
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
            } else if (['punch','kick','crouchPunch','crouchKick','jumpPunch','jumpKick','special','shoryuken'].includes(this.state)) {
                // Fierce war cry
                g.arc(headCX, headCY + 3, 9, 0.15, Math.PI - 0.15);
            } else {
                // Focused guard
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
