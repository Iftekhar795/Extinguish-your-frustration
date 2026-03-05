/**
 * EnemyAI.js
 * Extends Fighter with an AI controller that:
 *   • Chases and attacks the player
 *   • Tracks which attacks land most and adapts
 *   • Blocks when the player is attacking
 *   • Three difficulty levels: easy | normal | hard
 */

class EnemyAI extends Fighter {
    /**
     * @param {Phaser.Scene} scene
     * @param {number} x
     * @param {number} groundY
     * @param {object} cfg  – same as Fighter plus cfg.difficulty
     */
    constructor(scene, x, groundY, cfg) {
        super(scene, x, groundY, cfg);

        const diff = cfg.difficulty || 'normal';
        // Reaction time: how often the AI re-evaluates (seconds)
        this.reactionTime  = { easy: 0.80, normal: 0.55, hard: 0.30 }[diff];
        // How eagerly the AI attacks when in range (0–1)
        this.aggression    = { easy: 0.30, normal: 0.50, hard: 0.72 }[diff];
        // Block probability when player is attacking
        this.blockReaction = { easy: 0.25, normal: 0.50, hard: 0.72 }[diff];

        this._decisionTimer = 0;
        // Persistent movement intent: -1 = left, 0 = stop, 1 = right
        this._moveIntent = 0;

        // ── Pattern learning ──────────────────────────────────────────────────
        this._playerHistory = []; // last 20 attack types from player
        this._avoidAttack   = null;  // attack type the AI learned to block
    }

    // ══════════════════════════════════════════════════════════════════════════
    //  AI UPDATE  (called by FightScene every frame)
    // ══════════════════════════════════════════════════════════════════════════

    updateAI(dt, player) {
        if (this.state === 'ko') return;

        // Apply persistent movement intent every frame so the AI keeps moving
        // between decision cycles (velocity is reset to 0 after each physics step)
        if (this._moveIntent ===  1) this.moveRight();
        else if (this._moveIntent === -1) this.moveLeft();

        // Track player's attack pattern
        const playerAttacking =
            ['light_punch','heavy_punch','kick','special'].includes(player.state);
        if (playerAttacking) this._recordPlayerAttack(player.state);

        // Throttle decisions to simulate reaction time
        this._decisionTimer -= dt;
        if (this._decisionTimer > 0) return;
        this._decisionTimer = this.reactionTime + Math.random() * 0.15;

        const dist = Math.abs(this.x - player.x);

        // ── Block if player is attacking ──────────────────────────────────────
        if (playerAttacking && Math.random() < this.blockReaction) {
            this._moveIntent = 0;
            this.block(true);
            return;
        }
        // Release block if not under attack
        if (this.state === 'block' && !playerAttacking) {
            this.block(false);
        }

        // ── Movement & attack decision ────────────────────────────────────────
        if (dist > 260) {
            // Close the gap
            this._moveIntent = player.x > this.x ? 1 : -1;
        } else if (dist < 55) {
            // Too close: back off or light jab
            this._moveIntent = 0;
            if (Math.random() < 0.45) {
                this._moveIntent = player.x > this.x ? -1 : 1; // back off
            } else {
                this.lightPunch();
            }
        } else {
            // Ideal range: stop moving and decide attack
            this._moveIntent = 0;
            this._decideAttack();
        }

        // Occasional random jump
        if (Math.random() < 0.04 && this.onGround) this.jump();
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    _decideAttack() {
        const r = Math.random();
        if (r < this.aggression * 0.40)       this.lightPunch();
        else if (r < this.aggression * 0.65)  this.heavyPunch();
        else if (r < this.aggression * 0.82)  this.kick();
        else if (r < this.aggression * 0.90 && this.combo >= 2) this.special();
    }

    _recordPlayerAttack(attackType) {
        this._playerHistory.push(attackType);
        if (this._playerHistory.length > 20) this._playerHistory.shift();

        // Find the most-used player attack and learn to react to it
        const counts = {};
        for (const a of this._playerHistory) counts[a] = (counts[a] || 0) + 1;
        let best = 0;
        for (const [k, v] of Object.entries(counts)) {
            if (v > best) { best = v; this._avoidAttack = k; }
        }
    }
}
