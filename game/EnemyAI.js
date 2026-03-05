/**
 * EnemyAI.js
 * AI-controlled enemy that runs ahead of the player (comes from the right)
 * and must be dodged.  Uses the same tween / frame animation system as the
 * player so custom uploaded images look fluid.
 */

class EnemyAI {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x
     * @param {number} y       - bottom of sprite (origin 0.5, 1)
     * @param {string} texKey  - Phaser texture key
     */
    constructor(scene, x, y, texKey) {
        this.scene      = scene;
        this._animFPS   = 10;
        this._runTween  = null;
        this._jumpCooldown = 0;
        this._baseSpeed    = 190; // px/s (left = negative)

        this.sprite = scene.physics.add.sprite(x, y, texKey);
        this.sprite.setOrigin(0.5, 1);
        this.sprite.setScale(1.4);
        this.sprite.setFlipX(true);          // face left (mirror for chasing look)
        this.sprite.body.setGravityY(500);
        this.sprite.body.setVelocityX(-this._baseSpeed);

        this._startRunAnim(texKey);
    }

    // ─── Animation ───────────────────────────────────────────────────────────

    _startRunAnim(texKey) {
        this._stopRunAnim();

        const data           = spriteManager.getData('enemy');
        const hasMultiFrames = data && data.frameCount > 1;

        if (hasMultiFrames) {
            const animKey = 'enemy-run';
            if (!this.scene.anims.exists(animKey)) {
                const frames = [];
                for (let i = 0; i < data.frameCount; i++) {
                    frames.push({ key: texKey, frame: i });
                }
                this.scene.anims.create({
                    key:       animKey,
                    frames:    frames,
                    frameRate: this._animFPS,
                    repeat:    -1
                });
            }
            this.sprite.play(animKey, true);
        } else {
        // Base duration for one half-cycle of the run tween (in ms).
        // Scaled by animFPS so faster FPS = shorter cycle.
        const BASE_RUN_TWEEN_MS = 220;
        const dur = Math.round(BASE_RUN_TWEEN_MS / Math.max(1, this._animFPS / 10));
            this._runTween = this.scene.tweens.add({
                targets:  this.sprite,
                angle:    { from: -6, to: 6 },
                scaleX:   { from: 1.32, to: 1.48 },
                scaleY:   { from: 1.48, to: 1.32 },
                duration: dur,
                yoyo:     true,
                repeat:   -1,
                ease:     'Sine.easeInOut'
            });
        }
    }

    _stopRunAnim() {
        if (this._runTween) {
            this._runTween.stop();
            this._runTween = null;
        }
        this.sprite.anims.stop();
    }

    // ─── Per-frame AI update ─────────────────────────────────────────────────

    /**
     * @param {number} delta      - ms since last frame
     * @param {{ x:number, y:number }} playerPos
     */
    update(delta, playerPos) {
        const dtSec = delta / 1000;
        this._jumpCooldown = Math.max(0, this._jumpCooldown - dtSec);

        // ── Horizontal speed: speed up slightly when close to the player ────
        const distX = this.sprite.x - playerPos.x;
        const speed = distX < 250 ? this._baseSpeed * 1.15 : this._baseSpeed;
        this.sprite.body.setVelocityX(-speed);

        // ── Jumping AI ───────────────────────────────────────────────────────
        if (this.sprite.body.blocked.down && this._jumpCooldown === 0) {
            // Random jump (~once every 3-5 seconds on average)
            if (Math.random() < 0.008) {
                this._doJump();
            }
            // Mirror player if player is in the air and enemy is close
            if (!playerPos.onGround && distX < 300) {
                this._doJump();
            }
        }

        // Resume run tween after landing
        if (this.sprite.body.blocked.down && this._runTween && this._runTween.paused) {
            this._runTween.resume();
        }

        // ── Recycle: reset to right side when off left edge ─────────────────
        if (this.sprite.x < -120) {
            this._respawn();
        }
    }

    _doJump() {
        if (!this.sprite.body.blocked.down) return;
        this.sprite.body.setVelocityY(-480);
        this._jumpCooldown = 2.0;
        if (this._runTween) this._runTween.pause();
    }

    _respawn() {
        const W = this.scene.scale.width;
        this.sprite.x = W + Phaser.Math.Between(200, 450);
        this.sprite.body.setVelocityX(-this._baseSpeed);
    }

    // ─── Public helpers ──────────────────────────────────────────────────────

    /** Hot-swap texture when user uploads a new image. */
    updateTexture(texKey, data) {
        this.sprite.setTexture(texKey, 0);
        if (this.scene.anims.exists('enemy-run')) {
            this.scene.anims.remove('enemy-run');
        }
        this._startRunAnim(texKey);
    }

    /** Update animation frame rate. */
    setAnimationFPS(fps) {
        this._animFPS = fps;
        const anim = this.scene.anims.get('enemy-run');
        if (anim) { anim.frameRate = fps; }
        if (this._runTween) {
            const dur = Math.round(BASE_RUN_TWEEN_MS / Math.max(1, fps / 10));
            this._runTween.updateTo('duration', dur, true);
        }
    }

    /** @returns {{ x:number, y:number }} */
    getPosition() {
        return { x: this.sprite.x, y: this.sprite.y };
    }
}
