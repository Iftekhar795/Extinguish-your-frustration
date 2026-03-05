/**
 * SoundManager.js
 * Street Fighter-style synthesised sound effects using the Web Audio API.
 * No external audio files required – every sound is generated procedurally.
 *
 * Usage:  soundManager.playPunch()  /  soundManager.playEnemyHitVoice()  etc.
 */

class SoundManager {
    constructor() {
        this._ctx         = null;
        this._masterGain  = null;
    }

    // ── Audio context (lazy, respects browser autoplay policy) ───

    _getCtx() {
        if (!this._ctx) {
            try {
                this._ctx = new (window.AudioContext || window.webkitAudioContext)();
                this._masterGain = this._ctx.createGain();
                this._masterGain.gain.value = 0.65;
                this._masterGain.connect(this._ctx.destination);
            } catch (e) { return null; }
        }
        if (this._ctx.state === 'suspended') {
            this._ctx.resume().catch(() => {});
        }
        return this._ctx;
    }

    /** Set master volume. 0 = silent, 1 = full. */
    setVolume(v) {
        this._getCtx();
        if (this._masterGain) this._masterGain.gain.value = Math.max(0, Math.min(1, v));
    }

    _out() {
        this._getCtx();
        return this._masterGain;
    }

    // ── Helpers ───────────────────────────────────────────────────

    /** White-noise buffer of given duration (seconds) */
    _noiseBuffer(ctx, dur) {
        const n   = Math.floor(ctx.sampleRate * dur);
        const buf = ctx.createBuffer(1, n, ctx.sampleRate);
        const d   = buf.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
        return buf;
    }

    /** Fire-and-forget oscillator burst */
    _osc(ctx, out, type, freqStart, freqEnd, durSec, gainPeak, startOffset = 0) {
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        const t = ctx.currentTime + startOffset;
        o.type = type;
        o.frequency.setValueAtTime(freqStart, t);
        if (freqEnd !== freqStart) {
            o.frequency.exponentialRampToValueAtTime(Math.max(freqEnd, 1), t + durSec);
        }
        g.gain.setValueAtTime(gainPeak, t);
        g.gain.exponentialRampToValueAtTime(0.001, t + durSec);
        o.connect(g); g.connect(out);
        o.start(t); o.stop(t + durSec + 0.02);
    }

    // ── Public sound API ─────────────────────────────────────────

    /** Punch whoosh + hard crack (SF-style jab / straight) */
    playPunch() {
        const ctx = this._getCtx(); if (!ctx) return;
        const out = this._out();
        const now = ctx.currentTime;

        // Air whoosh
        const wBuf = this._noiseBuffer(ctx, 0.09);
        const ws   = ctx.createBufferSource();
        ws.buffer  = wBuf;
        const wf   = ctx.createBiquadFilter();
        wf.type    = 'bandpass'; wf.frequency.value = 900; wf.Q.value = 1.8;
        const wg   = ctx.createGain();
        wg.gain.setValueAtTime(0.28, now);
        wg.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
        ws.connect(wf); wf.connect(wg); wg.connect(out);
        ws.start(now);

        // Bone crack
        const t = now + 0.055;
        this._osc(ctx, out, 'square', 180, 40, 0.09, 0.55, 0.055);

        // High snap
        const sBuf = this._noiseBuffer(ctx, 0.04);
        const ss   = ctx.createBufferSource();
        ss.buffer  = sBuf;
        const sf   = ctx.createBiquadFilter();
        sf.type    = 'highpass'; sf.frequency.value = 3200;
        const sg   = ctx.createGain();
        sg.gain.setValueAtTime(0.35, t); sg.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
        ss.connect(sf); sf.connect(sg); sg.connect(out);
        ss.start(t);
    }

    /** Kick – heavier, deeper thud with body-slam tone */
    playKick() {
        const ctx = this._getCtx(); if (!ctx) return;
        const out = this._out();
        const now = ctx.currentTime;

        // Deep body thump
        this._osc(ctx, out, 'sine', 130, 28, 0.22, 0.85, 0.05);

        // Mid crunch
        this._osc(ctx, out, 'sawtooth', 220, 60, 0.14, 0.3, 0.05);

        // Long air whoosh
        const wBuf = this._noiseBuffer(ctx, 0.13);
        const ws   = ctx.createBufferSource(); ws.buffer = wBuf;
        const wf   = ctx.createBiquadFilter();
        wf.type = 'bandpass'; wf.frequency.value = 500; wf.Q.value = 1.4;
        const wg = ctx.createGain();
        wg.gain.setValueAtTime(0.22, now); wg.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        ws.connect(wf); wf.connect(wg); wg.connect(out); ws.start(now);
    }

    /** Block – metallic guard clang */
    playBlock() {
        const ctx = this._getCtx(); if (!ctx) return;
        const out = this._out();
        const now = ctx.currentTime;

        [380, 570, 820, 1200].forEach((freq, i) => {
            this._osc(ctx, out, 'triangle', freq, freq * 0.5, 0.28 - i * 0.04, 0.14 - i * 0.02, i * 0.005);
        });

        // Metallic noise burst
        const nBuf = this._noiseBuffer(ctx, 0.06);
        const ns   = ctx.createBufferSource(); ns.buffer = nBuf;
        const nf   = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 2000; nf.Q.value = 2;
        const ng   = ctx.createGain();
        ng.gain.setValueAtTime(0.18, now); ng.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
        ns.connect(nf); nf.connect(ng); ng.connect(out); ns.start(now);
    }

    /** Hit received – body impact thwack */
    playHitReceived() {
        const ctx = this._getCtx(); if (!ctx) return;
        const out = this._out();
        const now = ctx.currentTime;

        this._osc(ctx, out, 'sawtooth', 200, 55, 0.13, 0.6);

        const nBuf = this._noiseBuffer(ctx, 0.07);
        const ns   = ctx.createBufferSource(); ns.buffer = nBuf;
        const nf   = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 1200;
        const ng   = ctx.createGain();
        ng.gain.setValueAtTime(0.25, now); ng.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        ns.connect(nf); nf.connect(ng); ng.connect(out); ns.start(now);
    }

    /**
     * Enemy (girl) hit vocalization – synthesised "Ow!" / "Ah!" exclamation.
     * Uses a sawtooth source through vocal formant filters (F1, F2, F3)
     * to approximate a surprised female voice.
     */
    playEnemyHitVoice() {
        const ctx = this._getCtx(); if (!ctx) return;
        const out = this._out();
        const now = ctx.currentTime;
        const d   = 0.05; // slight delay after impact

        // Play physical impact first
        this.playHitReceived();

        // ── Voice source (two slightly detuned sawtooths for warmth) ──
        const src1 = ctx.createOscillator(); src1.type = 'sawtooth';
        const src2 = ctx.createOscillator(); src2.type = 'sawtooth';

        // Female F0 contour for a surprised "Ow!" – starts high, falls
        src1.frequency.setValueAtTime(350, now + d);
        src1.frequency.linearRampToValueAtTime(280, now + d + 0.07);
        src1.frequency.linearRampToValueAtTime(200, now + d + 0.30);
        src2.frequency.setValueAtTime(353, now + d);
        src2.frequency.linearRampToValueAtTime(283, now + d + 0.07);
        src2.frequency.linearRampToValueAtTime(203, now + d + 0.30);

        // Formant filters for the /ow/ vowel
        const f1 = ctx.createBiquadFilter(); f1.type = 'bandpass'; f1.frequency.value = 640;  f1.Q.value = 6;
        const f2 = ctx.createBiquadFilter(); f2.type = 'bandpass'; f2.frequency.value = 1060; f2.Q.value = 5;
        const f3 = ctx.createBiquadFilter(); f3.type = 'bandpass'; f3.frequency.value = 2400; f3.Q.value = 3;

        // Amplitude envelope
        const env = ctx.createGain();
        env.gain.setValueAtTime(0, now + d);
        env.gain.linearRampToValueAtTime(0.24, now + d + 0.045);
        env.gain.setValueAtTime(0.24, now + d + 0.12);
        env.gain.exponentialRampToValueAtTime(0.001, now + d + 0.34);

        [src1, src2].forEach(s => { s.connect(f1); s.connect(f2); s.connect(f3); });
        [f1, f2, f3].forEach(f => f.connect(env));
        env.connect(out);

        [src1, src2].forEach(s => { s.start(now + d); s.stop(now + d + 0.38); });
    }

    /** Special move charge – rising power hum */
    playSpecialCharge() {
        const ctx = this._getCtx(); if (!ctx) return;
        const out = this._out();
        const now = ctx.currentTime;

        this._osc(ctx, out, 'sawtooth', 80, 340, 0.55, 0.18);
        this._osc(ctx, out, 'sine',     160, 680, 0.55, 0.08);
    }

    /** Special move release – energy blast */
    playSpecialRelease() {
        const ctx = this._getCtx(); if (!ctx) return;
        const out = this._out();
        const now = ctx.currentTime;

        // Rising power tone
        this._osc(ctx, out, 'sawtooth', 440, 880, 0.15, 0.55);
        this._osc(ctx, out, 'sawtooth', 440, 220, 0.40, 0.35, 0.12);

        // Noise burst
        const nBuf = this._noiseBuffer(ctx, 0.22);
        const ns   = ctx.createBufferSource(); ns.buffer = nBuf;
        const nf   = ctx.createBiquadFilter(); nf.type = 'bandpass'; nf.frequency.value = 1400; nf.Q.value = 0.9;
        const ng   = ctx.createGain();
        ng.gain.setValueAtTime(0.32, now); ng.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        ns.connect(nf); nf.connect(ng); ng.connect(out); ns.start(now);
    }

    /** Jump – short rising tone + air swish */
    playJump() {
        const ctx = this._getCtx(); if (!ctx) return;
        const out = this._out();
        const now = ctx.currentTime;

        this._osc(ctx, out, 'sine', 260, 560, 0.16, 0.20);

        const wBuf = this._noiseBuffer(ctx, 0.10);
        const ws   = ctx.createBufferSource(); ws.buffer = wBuf;
        const wf   = ctx.createBiquadFilter(); wf.type = 'highpass'; wf.frequency.value = 1000;
        const wg   = ctx.createGain();
        wg.gain.setValueAtTime(0.10, now); wg.gain.exponentialRampToValueAtTime(0.001, now + 0.10);
        ws.connect(wf); wf.connect(wg); wg.connect(out); ws.start(now);
    }

    /** KO – dramatic crash + deep bass boom */
    playKO() {
        const ctx = this._getCtx(); if (!ctx) return;
        const out = this._out();
        const now = ctx.currentTime;

        // Deep bass boom
        this._osc(ctx, out, 'sine', 90, 18, 0.65, 1.0);
        this._osc(ctx, out, 'sine', 60, 12, 0.65, 0.6, 0.05);

        // Crash noise
        const nBuf = this._noiseBuffer(ctx, 0.45);
        const ns   = ctx.createBufferSource(); ns.buffer = nBuf;
        const nf   = ctx.createBiquadFilter(); nf.type = 'lowpass'; nf.frequency.value = 1100;
        const ng   = ctx.createGain();
        ng.gain.setValueAtTime(0.55, now); ng.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        ns.connect(nf); nf.connect(ng); ng.connect(out); ns.start(now);

        // Echo hits
        [0.18, 0.32].forEach(off => this._osc(ctx, out, 'sine', 70, 15, 0.25, 0.3, off));
    }

    /** Round start – punchy stinger chord */
    playRoundStart() {
        const ctx = this._getCtx(); if (!ctx) return;
        const out = this._out();

        // Stacked square chords arriving in sequence
        [[220, 0], [330, 0.05], [440, 0.10], [550, 0.15]].forEach(([freq, off]) => {
            this._osc(ctx, out, 'square', freq, freq * 0.7, 0.45, 0.10, off);
        });

        // Punchy noise accent
        const ctx2 = ctx;
        const now  = ctx2.currentTime + 0.15;
        const nBuf = this._noiseBuffer(ctx2, 0.05);
        const ns   = ctx2.createBufferSource(); ns.buffer = nBuf;
        const ng   = ctx2.createGain();
        ng.gain.setValueAtTime(0.18, now); ng.gain.exponentialRampToValueAtTime(0.001, now + 0.05);
        ns.connect(ng); ng.connect(out); ns.start(now);
    }

    /** Round win / KO jingle */
    playRoundWin() {
        const ctx = this._getCtx(); if (!ctx) return;
        const out = this._out();

        // Rising arpeggio
        [440, 554, 659, 880].forEach((freq, i) => {
            this._osc(ctx, out, 'square', freq, freq, 0.22, 0.16, i * 0.10);
        });
        // Final chord bloom
        [440, 554, 659].forEach(freq => {
            this._osc(ctx, out, 'sine', freq, freq * 0.8, 0.6, 0.12, 0.42);
        });
    }

    /** Combo trigger – quick rising triple-tone */
    playCombo() {
        const ctx = this._getCtx(); if (!ctx) return;
        const out = this._out();

        [330, 440, 660].forEach((freq, i) => {
            this._osc(ctx, out, 'triangle', freq, freq, 0.18, 0.20, i * 0.07);
        });
    }
}

// Global singleton
const soundManager = new SoundManager();
