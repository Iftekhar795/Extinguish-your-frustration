/**
 * PlayerController.js
 * Physics-based player character with smooth animation.
 *
 * Movement: player stays at a fixed x position; only jumping is controlled.
 * Animation:
 *   - Single uploaded image → tween-based squash/stretch + lean (looks fluid)
 *   - Sprite sheet (frameCount > 1) → Phaser frame animation
 */

class PlayerController {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x
     * @param {number} y       - bottom of sprite (origin 0.5, 1)
     * @param {string} texKey  - Phaser texture key
     */
    constructor(scene, x, y, texKey) {
        this.scene    = scene;
        this._animFPS = 10;
        this._runTween  = null;
        this._jumpTween = null;

        // Physics sprite — Phaser arcade physics handles gravity + ground collision
        this.sprite = scene.physics.add.sprite(x, y, texKey);
        this.sprite.setOrigin(0.5, 1);
        this.sprite.setScale(1.4);
        // Extra gravity on top of world gravity so the jump arc feels snappy
        this.sprite.body.setGravityY(500);
        // Keep player within the visible world horizontally
        this.sprite.setCollideWorldBounds(true);

        this._setupInput();
        this._startRunAnim(texKey);
    }

    // ─── Input ───────────────────────────────────────────────────────────────

    _setupInput() {
        const jump = () => this.jump();
        this.scene.input.keyboard.on('keydown-SPACE', jump);
        this.scene.input.keyboard.on('keydown-W',     jump);
        this.scene.input.keyboard.on('keydown-UP',    jump);
        this.scene.input.on('pointerdown', jump);
    }

    // ─── Animation ───────────────────────────────────────────────────────────

    /**
     * Start the run animation.  Uses frame animation for sprite sheets,
     * tween-based squash/stretch for single-image uploads.
     * @param {string} texKey
     */
    _startRunAnim(texKey) {
        this._stopRunAnim();

        const data           = spriteManager.getData('player');
        const hasMultiFrames = data && data.frameCount > 1;

        if (hasMultiFrames) {
            const animKey = 'player-run';
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
            // Single image — tween lean + squash to simulate a run cycle
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

    // ─── Jump ────────────────────────────────────────────────────────────────

    jump() {
        // Only allow jump when standing on a surface
        if (!this.sprite.body.blocked.down) return;

        this.sprite.body.setVelocityY(-520);

        // Pause running tween and play a brief stretch-up tween
        if (this._runTween) this._runTween.pause();

        if (this._jumpTween) this._jumpTween.stop();
        this._jumpTween = this.scene.tweens.add({
            targets:  this.sprite,
            scaleY:   1.6,
            scaleX:   1.1,
            angle:    0,
            duration: 90,
            yoyo:     true,
            ease:     'Sine.easeOut',
            onComplete: () => { this._jumpTween = null; }
        });
    }

    // ─── Per-frame update ────────────────────────────────────────────────────

    update() {
        // Resume run tween once player lands
        if (this.sprite.body.blocked.down && this._runTween && this._runTween.paused) {
            this._runTween.resume();
        }
    }

    // ─── Public helpers ──────────────────────────────────────────────────────

    /**
     * Hot-swap the sprite texture (called when user uploads a new image).
     * @param {string} texKey
     * @param {object} data   - sprite data from SpriteManager
     */
    updateTexture(texKey, data) {
        this.sprite.setTexture(texKey, 0);
        if (this.scene.anims.exists('player-run')) {
            this.scene.anims.remove('player-run');
        }
        this._startRunAnim(texKey);
    }

    /** Update animation frame rate (works for both tween and frame animations). */
    setAnimationFPS(fps) {
        this._animFPS = fps;
        const anim = this.scene.anims.get('player-run');
        if (anim) {
            anim.frameRate = fps;
        }
        if (this._runTween) {
            const dur = Math.round(BASE_RUN_TWEEN_MS / Math.max(1, fps / 10));
            this._runTween.updateTo('duration', dur, true);
        }
    }

    /** @returns {{ x: number, y: number }} */
    getPosition() {
        return { x: this.sprite.x, y: this.sprite.y };
    }
}
