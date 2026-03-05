/**
 * EnemyAI.js
 * AI-controlled opponent fighter.
 *
 * Decision loop re-evaluates every 0.2–0.45 s and picks one of:
 *   approach | retreat | punch | kick | block | jump
 *
 * Blocking has a reaction chance when the player is visibly attacking.
 */

class EnemyAI {
    constructor(scene, x, y, texKey) {
        this.scene  = scene;
        this.hp     = 100;
        this.state  = 'idle';
        this.facing = -1; // starts facing left (toward player)

        this._atkCd      = 0;
        this._hurtTimer  = 0;
        this._hitActive  = false;
        this._hitDamage  = 0;
        this._hitType    = '';
        this._hasHit     = false;
        this._thinkTimer = 0;
        this._action     = 'approach';

        this.sprite = scene.physics.add.sprite(x, y, texKey);
        this.sprite.setOrigin(0.5, 1);
        this.sprite.setScale(1.5);
        this.sprite.setDepth(6); // above background layers (0-5), below HUD (10+)
        this.sprite.setFlipX(true);
        this.sprite.body.setGravityY(600);
        this.sprite.setCollideWorldBounds(true);
    }

    // ── Per-frame update ─────────────────────────────────────────────────────

    update(delta, player) {
        if (this.state === 'down') return;

        const dt  = delta / 1000;
        const gnd = this.sprite.body.blocked.down;

        this._atkCd      = Math.max(0, this._atkCd      - dt);
        this._hurtTimer  = Math.max(0, this._hurtTimer  - dt);
        this._thinkTimer = Math.max(0, this._thinkTimer - dt);

        // Always face player
        this.facing = player.sprite.x >= this.sprite.x ? 1 : -1;
        this.sprite.setFlipX(this.facing < 0);

        // ── Hurt ─────────────────────────────────────────────────────────────
        if (this._hurtTimer > 0) {
            this.state      = 'hurt';
            this._hitActive = false;
            this.sprite.body.setVelocityX(this.sprite.body.velocity.x * 0.85);
            return;
        }
        if (this.state === 'hurt') {
            this.state = 'idle';
            this.sprite.clearTint();
            this.sprite.setScale(1.5);
            this.sprite.setAngle(0);
        }

        // ── Active attack ────────────────────────────────────────────────────
        if (this._atkCd > 0 && (this.state === 'punch' || this.state === 'kick')) {
            if (this._hitActive && !this._hasHit) this._checkHit(player);
            return;
        }
        if (this.state === 'punch' || this.state === 'kick') {
            this.state = 'idle';
            this.sprite.setAngle(0);
            this.sprite.setScale(1.5);
            this._hitActive = false;
        }

        const dist = Math.abs(this.sprite.x - player.sprite.x);

        // ── AI decision ──────────────────────────────────────────────────────
        if (this._thinkTimer === 0) {
            this._thinkTimer = 0.18 + Math.random() * 0.27;
            this._decide(dist, player, gnd);
        }

        // ── Execute chosen action ────────────────────────────────────────────
        switch (this._action) {
            case 'approach':
                this._exitBlock();
                this.sprite.body.setVelocityX(this.facing * 175);
                if (gnd) this.state = 'walk';
                break;

            case 'retreat':
                this._exitBlock();
                this.sprite.body.setVelocityX(-this.facing * 140);
                if (gnd) this.state = 'walk';
                break;

            case 'punch':
                this.sprite.body.setVelocityX(0);
                if (this._atkCd === 0 && dist < 120) this._doPunch();
                else if (dist >= 120) this._action = 'approach'; // close the gap first
                break;

            case 'kick':
                this.sprite.body.setVelocityX(0);
                if (this._atkCd === 0 && dist < 150) this._doKick();
                else if (dist >= 150) this._action = 'approach';
                break;

            case 'block':
                this.sprite.body.setVelocityX(0);
                if (this.state !== 'block') {
                    this.state = 'block';
                    this.sprite.setTint(0x6699FF);
                    this.sprite.setScale(1.4, 1.5);
                }
                break;

            case 'jump':
                if (gnd) this.sprite.body.setVelocityY(-520);
                if (gnd && this.state !== 'jump') this.state = 'jump';
                this._action = 'approach'; // resume after jump
                break;

            default:
                this.sprite.body.setVelocityX(0);
                if (gnd && this.state !== 'idle') {
                    this.state = 'idle';
                    this._exitBlock();
                }
        }

        // Exit block if action no longer requires it
        if (this.state === 'block' && this._action !== 'block') this._exitBlock();

        // Land from jump
        if (gnd && this.state === 'jump') this.state = 'idle';

        // ── Visual state ──────────────────────────────────────────────────────
        if (this.state === 'walk') {
            this.sprite.setAngle(Math.sin(this.scene.time.now / 90) * 6);
        } else if (this.state === 'jump') {
            this.sprite.setAngle(this.facing * -12);
            this.sprite.setScale(1.3, 1.65);
        } else if (this.state === 'idle') {
            this.sprite.setAngle(0);
            this.sprite.setScale(1.5);
        }
    }

    _exitBlock() {
        if (this.state === 'block') {
            this.state = 'idle';
            this.sprite.clearTint();
            this.sprite.setScale(1.5);
        }
    }

    // ── AI decision logic ────────────────────────────────────────────────────

    _decide(dist, player) {
        const r = Math.random();
        const playerAttacking = player.state === 'punch' || player.state === 'kick';

        // React to incoming attack
        if (playerAttacking && dist < 145 && r < 0.45) { this._action = 'block'; return; }

        if (dist < 110) {
            // Very close — attack, retreat, or block
            if      (r < 0.42) this._action = 'punch';
            else if (r < 0.65) this._action = 'kick';
            else if (r < 0.80) this._action = 'retreat';
            else               this._action = 'block';
            return;
        }
        if (dist < 160) {
            // Medium range — kick, punch, or approach
            if      (r < 0.30) this._action = 'kick';
            else if (r < 0.52) this._action = 'punch';
            else               this._action = 'approach';
            return;
        }
        // Far — mostly approach, occasionally jump
        if      (r < 0.10) this._action = 'jump';
        else if (r < 0.14) this._action = 'block';
        else               this._action = 'approach';
    }

    // ── Attacks ──────────────────────────────────────────────────────────────

    _doPunch() {
        this.state      = 'punch';
        this._atkCd     = 0.52;
        this._hitActive = true;
        this._hitDamage = 8;  // AI punch is slightly weaker than P1 (10) for fairness
        this._hitType   = 'punch';
        this._hasHit    = false;
        this.scene.tweens.add({
            targets: this.sprite,
            scaleX: { from: 1.5, to: 1.8 },
            angle:  this.facing > 0 ? { from: 0, to: 14 } : { from: 0, to: -14 },
            duration: 110, yoyo: true, ease: 'Power2'
        });
    }

    _doKick() {
        this.state      = 'kick';
        this._atkCd     = 0.70;
        this._hitActive = true;
        this._hitDamage = 13;
        this._hitType   = 'kick';
        this._hasHit    = false;
        this.scene.tweens.add({
            targets: this.sprite,
            scaleX: { from: 1.5, to: 2.0 },
            scaleY: { from: 1.5, to: 1.25 },
            angle:  this.facing > 0 ? { from: 0, to: 20 } : { from: 0, to: -20 },
            duration: 160, yoyo: true, ease: 'Power2'
        });
    }

    _checkHit(player) {
        if (this._hasHit) return;
        const range = this._hitType === 'kick' ? 135 : 105;
        if (Math.abs(this.sprite.x - player.sprite.x) < range) {
            this._hasHit   = true;
            const knockDir = player.sprite.x > this.sprite.x ? 1 : -1;
            player.takeDamage(this._hitDamage, knockDir);
        }
    }

    // ── Take damage ──────────────────────────────────────────────────────────

    takeDamage(amount, knockDir) {
        if (this.state === 'down') return;
        const dmg = this.state === 'block' ? Math.max(1, Math.floor(amount * 0.1)) : amount;
        this.hp = Math.max(0, this.hp - dmg);
        this.sprite.body.setVelocityX(knockDir * 200);

        if (this.state !== 'block') {
            this._hurtTimer = 0.3;
            this.state      = 'hurt';
            this.sprite.setTint(0xFF2222);
            this.scene.tweens.add({
                targets: this.sprite, alpha: 0.3, duration: 75, yoyo: true, repeat: 2,
                onComplete: () => this.sprite.setAlpha(1)
            });
        }
        if (this.hp <= 0) {
            this.state = 'down';
            this.sprite.setAngle(this.facing > 0 ? -90 : 90);
            this.sprite.setTint(0xFF4444);
        }
    }

    // ── Round reset ──────────────────────────────────────────────────────────

    reset(x, y) {
        this.hp      = 100;
        this.state   = 'idle';
        this.facing  = -1;
        this._action = 'approach';
        this._atkCd = 0; this._hurtTimer = 0; this._hitActive = false; this._thinkTimer = 0;
        this.sprite.setPosition(x, y);
        this.sprite.setAngle(0);
        this.sprite.setScale(1.5);
        this.sprite.clearTint();
        this.sprite.setAlpha(1);
        this.sprite.body.setVelocityX(0);
        this.sprite.body.setVelocityY(0);
    }

    updateTexture(texKey) { this.sprite.setTexture(texKey, 0); }
    getPosition()         { return { x: this.sprite.x, y: this.sprite.y }; }
}
