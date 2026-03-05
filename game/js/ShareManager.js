/**
 * ShareManager.js
 * Encode / decode the full game configuration (including face thumbnails)
 * into a URL hash so friends can load the same fighters in their browser.
 *
 * Format: #config=<base64(JSON)>
 * The JSON contains thumbnail face data (≈50×50 JPEG) so the URL stays under
 * typical browser limits (~8 KB for hash fragments).
 */

class ShareManager {

    /**
     * Build a shareable URL with the current lobby config baked in.
     * @returns {string} Full URL with #config=... fragment
     */
    generateShareLink() {
        const cfg = this._collectConfig();
        let encoded;
        try {
            // Safe Unicode → base64: percent-encode, then map percent-escaped bytes to chars
            const utf8 = encodeURIComponent(JSON.stringify(cfg))
                .replace(/%([0-9A-F]{2})/g, (_, p1) => String.fromCharCode(parseInt(p1, 16)));
            encoded = btoa(utf8);
        } catch (e) {
            console.warn('ShareManager: failed to encode config', e);
            return window.location.href;
        }
        return `${window.location.origin}${window.location.pathname}#config=${encoded}`;
    }

    /**
     * Try to decode a #config=... fragment from the current URL.
     * @returns {object|null} Decoded config or null if absent / corrupt
     */
    loadFromURL() {
        const hash = window.location.hash;
        if (!hash.startsWith('#config=')) return null;
        try {
            // Reverse the encoding: base64 → bytes → percent-encoded → JSON string
            const utf8 = atob(hash.slice(8))
                .split('')
                .map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
                .join('');
            const json = decodeURIComponent(utf8);
            return JSON.parse(json);
        } catch (e) {
            console.warn('ShareManager: invalid share link', e);
            return null;
        }
    }

    /**
     * Apply a decoded config to the lobby UI and FaceManager.
     * @param {object} cfg
     */
    applyConfig(cfg) {
        if (cfg.playerFace) {
            faceManager.faces.player      = cfg.playerFace;
            faceManager.thumbnails.player = cfg.playerFace;
            const prev = document.getElementById('player-face-preview');
            if (prev) { prev.src = cfg.playerFace; prev.style.display = 'block'; }
            const ph = document.getElementById('player-upload-placeholder');
            if (ph) ph.style.display = 'none';
        }
        if (cfg.enemyFace) {
            faceManager.faces.enemy      = cfg.enemyFace;
            faceManager.thumbnails.enemy = cfg.enemyFace;
            const prev = document.getElementById('enemy-face-preview');
            if (prev) { prev.src = cfg.enemyFace; prev.style.display = 'block'; }
            const ph = document.getElementById('enemy-upload-placeholder');
            if (ph) ph.style.display = 'none';
        }
        if (cfg.playerColor) {
            const el = document.getElementById('player-color');
            if (el) el.value = cfg.playerColor;
        }
        if (cfg.enemyColor) {
            const el = document.getElementById('enemy-color');
            if (el) el.value = cfg.enemyColor;
        }
        if (cfg.arena !== undefined) {
            const el = document.getElementById('arena-select');
            if (el) el.value = String(cfg.arena);
        }
        if (cfg.difficulty) {
            const el = document.getElementById('difficulty');
            if (el) el.value = cfg.difficulty;
        }
    }

    /**
     * Generate a link, copy it to the clipboard, and show it in the lobby UI.
     */
    copyAndShowLink() {
        const link = this.generateShareLink();
        this._showInLobby(link);
    }

    // ── Private ───────────────────────────────────────────────────────────────

    _collectConfig() {
        const cfg = {};

        // Face thumbnails (small JPEG ~50×50)
        const faces = faceManager.encodeFaces();
        if (faces.playerThumb) cfg.playerFace = faces.playerThumb;
        if (faces.enemyThumb)  cfg.enemyFace  = faces.enemyThumb;

        const byId = (id) => { const el = document.getElementById(id); return el ? el.value : null; };
        cfg.playerColor = byId('player-color');
        cfg.enemyColor  = byId('enemy-color');
        cfg.arena       = byId('arena-select');
        cfg.difficulty  = byId('difficulty');

        return cfg;
    }

    _showInLobby(url) {
        const container = document.getElementById('share-link-container');
        const input     = document.getElementById('share-link-input');
        const msg       = document.getElementById('share-link-msg');
        if (!container || !input) return;

        input.value = url;
        container.style.display = 'block';

        // Attempt clipboard copy
        if (navigator.clipboard && window.isSecureContext) {
            navigator.clipboard.writeText(url)
                .then(() => { if (msg) msg.textContent = '✅ Link copied to clipboard!'; })
                .catch(() => {
                    input.select();
                    if (msg) msg.textContent = 'Copy the link above to share.';
                });
        } else {
            input.select();
            // document.execCommand is deprecated but kept as last-resort fallback
            // for non-secure contexts where the Clipboard API is unavailable
            // eslint-disable-next-line no-restricted-globals
            document.execCommand('copy');
            if (msg) msg.textContent = '✅ Link copied to clipboard!';
        }
    }
}

// Global singleton
const shareManager = new ShareManager();
