/**
 * PlayerController.js
 * Human-controlled fighter (Player 1).
 *
 * Controls:
 *   A / ←     Walk left
 *   D / →     Walk right
 *   W / ↑     Jump
 *   S         Block (hold while on ground)
 *   J / Z     Punch
 *   K / X     Kick
 */

class PlayerController {
    constructor(scene, x, y, texKey) {
        this.scene  = scene;
        this.hp     = 100;
        this.state  = 'idle'; // idle | walk | jump | punch | kick | block | hurt | down
        this.facing = 1;      // 1 = right, -1 = left

        this._atkCd     = 0;     // attack cooldown (seconds)
        this._hurtTimer = 0;     // stun duration remaining
        this._hitActive = false; // is the attack hitbox currently live?
        this._hitDamage = 0;
        this._hitType   = '';
        this._hasHit    = false; // prevent multiple hits per single swing

        this.sprite = scene.physics.add.sprite(x, y, texKey);
        this.sprite.setOrigin(0.5, 1);
        this.sprite.setScale(1.5);
        this.sprite.setDepth(6); // above background layers (0-5), below HUD (10+)
        this.sprite.body.setGravityY(600);
        this.sprite.setCollideWorldBounds(true);

        this._keys = scene.input.keyboard.addKeys({
            left:   Phaser.Input.Keyboard.KeyCodes.A,
            right:  Phaser.Input.Keyboard.KeyCodes.D,
            up:     Phaser.Input.Keyboard.KeyCodes.W,
            down:   Phaser.Input.Keyboard.KeyCodes.S,
            larrow: Phaser.Input.Keyboard.KeyCodes.LEFT,
            rarrow: Phaser.Input.Keyboard.KeyCodes.RIGHT,
            uarrow: Phaser.Input.Keyboard.KeyCodes.UP,
            punch:  Phaser.Input.Keyboard.KeyCodes.J,
            kick:   Phaser.Input.Keyboard.KeyCodes.K,
            punch2: Phaser.Input.Keyboard.KeyCodes.Z,
            kick2:  Phaser.Input.Keyboard.KeyCodes.X
        });
    }

    // ── Per-frame update ─────────────────────────────────────────────────────

    update(delta, opponent) {
        if (this.state === 'down') return;

        const dt   = delta / 1000;
        const gnd  = this.sprite.body.blocked.down;
        const keys = this._keys;

        this._atkCd     = Math.max(0, this._atkCd     - dt);
        this._hurtTimer = Math.max(0, this._hurtTimer - dt);

        // Always face the opponent
        this.facing = opponent.sprite.x >= this.sprite.x ? 1 : -1;
        this.sprite.setFlipX(this.facing < 0);

        // ── Hurt (stun) ──────────────────────────────────────────────────────
        if (this._hurtTimer > 0) {
            this.state      = 'hurt';
            this._hitActive = false;
            return;
        }
        if (this.state === 'hurt') {
            this.state = 'idle';
            this.sprite.clearTint();
            this.sprite.setScale(1.5);
            this.sprite.setAngle(0);
        }

        // ── Active attack: wait out cooldown, check hit ──────────────────────
        if (this._atkCd > 0 && (this.state === 'punch' || this.state === 'kick')) {
            if (this._hitActive && !this._hasHit) this._checkHit(opponent);
            return;
        }
        if (this.state === 'punch' || this.state === 'kick') {
            // Attack animation finished — return to idle
            this.state = 'idle';
            this.sprite.setAngle(0);
            this.sprite.setScale(1.5);
            this._hitActive = false;
        }

        // ── Block (hold S while grounded) ────────────────────────────────────
        if (keys.down.isDown && gnd) {
            if (this.state !== 'block') {
                this.state = 'block';
                this.sprite.setTint(0x6699FF);
                this.sprite.setScale(1.4, 1.5);
            }
            this.sprite.body.setVelocityX(0);
            return;
        }
        if (this.state === 'block') {
            this.state = 'idle';
            this.sprite.clearTint();
            this.sprite.setScale(1.5);
            this.sprite.setAngle(0);
        }

        // ── Attacks ──────────────────────────────────────────────────────────
        if (this._atkCd === 0) {
            if (Phaser.Input.Keyboard.JustDown(keys.punch) ||
                Phaser.Input.Keyboard.JustDown(keys.punch2)) {
                this._doPunch(); return;
            }
            if (Phaser.Input.Keyboard.JustDown(keys.kick) ||
                Phaser.Input.Keyboard.JustDown(keys.kick2)) {
                this._doKick(); return;
            }
        }

        // ── Jump ─────────────────────────────────────────────────────────────
        if ((keys.up.isDown || keys.uarrow.isDown) && gnd) {
            this.sprite.body.setVelocityY(-580);
            this.state = 'jump';
        }

        // ── Walk ─────────────────────────────────────────────────────────────
        if (keys.left.isDown || keys.larrow.isDown) {
            this.sprite.body.setVelocityX(-220);
            if (gnd) this.state = 'walk';
        } else if (keys.right.isDown || keys.rarrow.isDown) {
            this.sprite.body.setVelocityX(220);
            if (gnd) this.state = 'walk';
        } else {
            this.sprite.body.setVelocityX(0);
            if (gnd && this.state === 'walk') this.state = 'idle';
        }

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

    // ── Attacks ──────────────────────────────────────────────────────────────

    _doPunch() {
        this.state      = 'punch';
        this._atkCd     = 0.45;
        this._hitActive = true;
        this._hitDamage = 10; // punch: 10 dmg (kick: 16 dmg — slower but harder)
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
        this._atkCd     = 0.65;
        this._hitActive = true;
        this._hitDamage = 16;
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

    _checkHit(opponent) {
        if (this._hasHit) return;
        const range = this._hitType === 'kick' ? 135 : 105;
        if (Math.abs(this.sprite.x - opponent.sprite.x) < range) {
            this._hasHit = true;
            const knockDir = opponent.sprite.x > this.sprite.x ? 1 : -1;
            opponent.takeDamage(this._hitDamage, knockDir);
        }
    }

    // ── Take damage ──────────────────────────────────────────────────────────

    takeDamage(amount, knockDir) {
        if (this.state === 'down') return;
        const dmg = this.state === 'block' ? Math.max(1, Math.floor(amount * 0.1)) : amount;
        this.hp = Math.max(0, this.hp - dmg);
        this.sprite.body.setVelocityX(knockDir * 200);

        if (this.state !== 'block') {
            this._hurtTimer = 0.34;
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
        this.hp     = 100;
        this.state  = 'idle';
        this._atkCd = 0; this._hurtTimer = 0; this._hitActive = false;
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
