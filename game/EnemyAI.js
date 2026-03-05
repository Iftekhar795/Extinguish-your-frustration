/**
 * EnemyAI.js
 * AI-controlled opponent that extends Fighter.
 *
 * Implements a simple state-machine with pattern tracking:
 *   APPROACH  – walk toward the player
 *   ATTACK    – throw punches, kicks, or specials
 *   RETREAT   – back away after taking damage
 *   BLOCK     – defend when player is attacking
 *
 * The AI records the player's recent attacks so it can bias its reactions.
 */

class EnemyAI extends Fighter {

    constructor(scene, config) {
        super(scene, config);

        // AI state
        this._aiState    = 'approach';
        this._aiTimer    = 0;          // ms until next decision
        this._playerRef  = null;

        // Pattern learning – track last N player attack types
        this._playerHistory = [];
        this._maxHistory    = 8;

        // Difficulty (0 = easy, 1 = normal, 2 = hard)
        this.difficulty  = config.difficulty !== undefined ? config.difficulty : 1;

        // Per-difficulty tuning
        const tuning = [
            { reactionTime: 700, blockChance: 0.15, aggression: 0.4 },  // easy
            { reactionTime: 450, blockChance: 0.35, aggression: 0.65 }, // normal
            { reactionTime: 250, blockChance: 0.55, aggression: 0.85 }, // hard
        ];
        this._t = tuning[this.difficulty];
    }

    /** Provide a reference to the player fighter each frame */
    setPlayer(player) {
        this._playerRef = player;
    }

    /** Record a player's attack so the AI can learn patterns */
    recordPlayerAttack(attackType) {
        this._playerHistory.push(attackType);
        if (this._playerHistory.length > this._maxHistory) {
            this._playerHistory.shift();
        }
    }

    // ── override update ──────────────────────────────────────
    update(deltaMs) {
        super.update(deltaMs);

        if (!this._playerRef || this.state === 'ko') return;

        this._aiTimer -= deltaMs;
        if (this._aiTimer > 0) return;

        // Reset decision timer (shorter = more responsive)
        this._aiTimer = this._t.reactionTime + Math.random() * 200;

        this._decide();
    }

    // ── AI decision making ───────────────────────────────────
    _decide() {
        const player  = this._playerRef;
        const dx      = player.x - this.x;  // positive = player is to the right
        const dist    = Math.abs(dx);

        // Always face the player
        this.facingRight = dx > 0;

        const playerAttacking = ['punch', 'kick', 'special'].includes(player.state);

        // ── BLOCK if player is attacking and we are in range ──
        if (playerAttacking && dist < 120 && Math.random() < this._t.blockChance) {
            this._aiState = 'block';
            this.setBlocking(true);
            this._aiTimer = 350;
            return;
        }

        // Stop blocking when player stops
        if (this.state === 'blocking' && !playerAttacking) {
            this.setBlocking(false);
        }

        // ── Choose action by distance ─────────────────────────
        if (dist > 140) {
            this._aiState = 'approach';
        } else if (dist < 60 && Math.random() < 0.3) {
            // Too close – back up a little
            this._aiState = 'retreat';
        } else {
            this._aiState = Math.random() < this._t.aggression ? 'attack' : 'approach';
        }

        switch (this._aiState) {
            case 'approach':
                this.move(dx > 0 ? 1 : -1);
                // Schedule stop after short walk
                setTimeout(() => {
                    if (this._aiState === 'approach') this.move(0);
                }, this._t.reactionTime * 1.2);
                break;

            case 'retreat':
                this.move(dx > 0 ? -1 : 1);
                setTimeout(() => this.move(0), 300);
                break;

            case 'attack':
                this.move(0);
                this._chooseAttack(dist);
                break;

            case 'block':
                // handled above
                break;
        }
    }

    _chooseAttack(dist) {
        // Use Shoryuken when super meter is full and player is in range
        if (this._superMeter >= this._superMeterMax && dist < 130) {
            this.shoryuken();
            return;
        }

        // Bias attack choice based on player history
        const punchCount = this._playerHistory.filter(a => a === 'punch').length;
        const kickCount  = this._playerHistory.filter(a => a === 'kick').length;

        // More kicks if player uses lots of punches (punches are short range)
        const kickBias = kickCount > punchCount ? 0.6 : 0.4;

        const roll = Math.random();

        if (dist > 90 && roll < 0.25 && this._specialCharge > 60) {
            this.special();
        } else if (roll < kickBias) {
            this.kick();
        } else {
            this.punch();
        }
    }
}
