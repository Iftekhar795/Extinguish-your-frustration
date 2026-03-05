/**
 * SpriteManager.js
 *
 * Handles custom sprite loading with automatic face detection and
 * body compositing.
 *
 * Upload flow (default — Frame W/H left at 0):
 *  1. User uploads any photo.
 *  2. The browser's Shape Detection API (FaceDetector) locates the face.
 *     On browsers that don't support FaceDetector, a centre-top crop is used.
 *  3. The detected face region is composited as a circle onto a 60×100 px
 *     fighter-body template (matching the game's default sprite size).
 *  4. The resulting texture is registered in Phaser and the fighter sprite
 *     updates live without restarting the game.
 *
 * Sprite-sheet mode (Frame W/H > 0):
 *  The original image is used as-is — face detection is skipped.
 *  Use this to supply a full sprite sheet as before.
 */

class SpriteManager {
    constructor() {
        this._data  = { player: null, enemy: null };
        this._scene = null;
    }

    /**
     * Provide the active Phaser scene so textures can be registered.
     * @param {Phaser.Scene} scene
     */
    setScene(scene) {
        this._scene = scene;
        ['player', 'enemy'].forEach(t => {
            if (this._data[t]) this._registerInScene(scene, t);
        });
    }

    /**
     * Load a user-uploaded image file.
     *
     * @param {File}   file
     * @param {string} type       'player' | 'enemy'
     * @param {{ frameWidth:number, frameHeight:number, frameCount:number }} sheetCfg
     * @param {Function} callback (err, info) => void
     *        info: { type, width, height, faceDetected }
     */
    loadCustomSprite(file, type, sheetCfg, callback) {
        if (!file) { callback(new Error('No file selected'), null); return; }

        const reader = new FileReader();
        reader.onerror = () => callback(new Error('Failed to read file'), null);

        reader.onload = (e) => {
            const img = new Image();
            img.onerror = () => callback(new Error('Invalid image file'), null);

            img.onload = async () => {
                try {
                    const useFaceMode = !(sheetCfg.frameWidth > 0);

                    if (useFaceMode) {
                        // ── Face-detection + body-composite path ──────────────
                        let faceRegion;
                        try {
                            faceRegion = await this._detectFaceRegion(img);
                        } catch (_) {
                            faceRegion = this._fallbackCrop(img);
                        }

                        const dataUrl = this._buildComposite(img, type, faceRegion);

                        this._data[type] = {
                            dataUrl,
                            naturalWidth:  60,
                            naturalHeight: 100,
                            frameWidth:    60,
                            frameHeight:   100,
                            frameCount:    1,
                            faceDetected:  faceRegion.detected
                        };

                        if (this._scene) this._registerInScene(this._scene, type);

                        callback(null, {
                            type,
                            width:        img.naturalWidth,
                            height:       img.naturalHeight,
                            faceDetected: faceRegion.detected
                        });

                    } else {
                        // ── Original sprite-sheet path ────────────────────────
                        const canvas = document.createElement('canvas');
                        canvas.width  = img.naturalWidth;
                        canvas.height = img.naturalHeight;
                        canvas.getContext('2d').drawImage(img, 0, 0);

                        const fw = sheetCfg.frameWidth  > 0 ? sheetCfg.frameWidth  : img.naturalWidth;
                        const fh = sheetCfg.frameHeight > 0 ? sheetCfg.frameHeight : img.naturalHeight;

                        this._data[type] = {
                            dataUrl:       canvas.toDataURL('image/png'),
                            naturalWidth:  img.naturalWidth,
                            naturalHeight: img.naturalHeight,
                            frameWidth:    fw,
                            frameHeight:   fh,
                            frameCount:    Math.max(1, sheetCfg.frameCount || 1),
                            faceDetected:  false
                        };

                        if (this._scene) this._registerInScene(this._scene, type);

                        callback(null, {
                            type,
                            width:        img.naturalWidth,
                            height:       img.naturalHeight,
                            faceDetected: false
                        });
                    }
                } catch (err) {
                    callback(new Error('Processing failed: ' + err.message), null);
                }
            };

            img.src = e.target.result;
        };

        reader.readAsDataURL(file);
    }

    // ── Face detection ──────────────────────────────────────────────────────

    /**
     * Try the browser's native FaceDetector API (Chrome / Edge).
     * Falls back to a centre-top crop on unsupported browsers.
     *
     * @param {HTMLImageElement} img
     * @returns {{ x, y, width, height, detected: boolean }}
     */
    async _detectFaceRegion(img) {
        if (typeof FaceDetector !== 'undefined') {
            try {
                const fd    = new FaceDetector({ fastMode: true, maxDetectedFaces: 1 });
                const faces = await fd.detect(img);

                if (faces && faces.length > 0) {
                    const b = faces[0].boundingBox;
                    // Pad around the detected bounding box so the composite circle
                    // captures hair (above) and chin/neck (below) naturally.
                    // ~38% side padding and ~45% vertical padding give the best fit
                    // for typical portrait selfies at this sprite scale.
                    const padX = b.width  * 0.38;
                    const padY = b.height * 0.45;
                    const x    = Math.max(0, b.x - padX);
                    const y    = Math.max(0, b.y - padY * 0.7);
                    return {
                        x,
                        y,
                        width:    Math.min(img.naturalWidth  - x, b.width  + padX * 2),
                        height:   Math.min(img.naturalHeight - y, b.height + padY * 1.6),
                        detected: true
                    };
                }
            } catch (_) { /* fall through to fallback */ }
        }
        return this._fallbackCrop(img);
    }

    /**
     * Fallback: use the top-centre square of the image.
     * Works well for portrait selfies and headshots.
     */
    _fallbackCrop(img) {
        const w    = img.naturalWidth;
        const h    = img.naturalHeight;
        const size = Math.min(w, h);
        return {
            x:        (w - size) / 2,
            y:        0,
            width:    size,
            height:   size,
            detected: false
        };
    }

    // ── Face-on-body compositing ─────────────────────────────────────────────

    /**
     * Draws a 60×100 fighter-body template and composites the detected face
     * region as a circle on the head area.
     *
     * @param {HTMLImageElement} img        Original uploaded photo
     * @param {string}           type       'player' | 'enemy'
     * @param {{ x, y, width, height }} faceRegion
     * @returns {string} PNG data URL
     */
    _buildComposite(img, type, faceRegion) {
        const W = 60, H = 100;
        const cv  = document.createElement('canvas');
        cv.width  = W;
        cv.height = H;
        const ctx = cv.getContext('2d');

        const isP    = (type === 'player');
        const skin   = isP ? '#E8A87C' : '#C47A3A';
        const shorts = isP ? '#1D4ED8' : '#DC2626';
        const gloves = isP ? '#FFFFFF' : '#111111';
        const gloveH = isP ? '#CCCCCC' : '#333333';
        const shoes  = isP ? '#CC0000' : '#000000';

        // ── Body template ──────────────────────────────────────────────────

        // Shorts
        ctx.fillStyle = shorts;
        ctx.fillRect(12, 52, 36, 24);

        // Torso
        ctx.fillStyle = skin;
        this._rrect(ctx, 10, 22, 40, 34, 5);
        ctx.fill();

        // Boxing gloves
        ctx.fillStyle = gloves;
        ctx.beginPath(); ctx.arc(5,  40, 8, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(55, 40, 8, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = gloveH;
        ctx.fillRect(1, 36, 8, 5);
        ctx.fillRect(51, 36, 8, 5);

        // Legs
        ctx.fillStyle = skin;
        ctx.fillRect(13, 74, 14, 18);
        ctx.fillRect(33, 74, 14, 18);

        // Shoes
        ctx.fillStyle = shoes;
        this._rrect(ctx, 9,  88, 20, 10, 3); ctx.fill();
        this._rrect(ctx, 31, 88, 20, 10, 3); ctx.fill();

        // ── Face circle ──────────────────────────────────────────────────────
        const hcx = 30, hcy = 14, hr = 13;

        // Skin-tone base (visible if face crop doesn't fill the circle)
        ctx.fillStyle = skin;
        ctx.beginPath(); ctx.arc(hcx, hcy, hr, 0, Math.PI * 2); ctx.fill();

        // Clip to circle and draw face
        if (faceRegion.width > 0 && faceRegion.height > 0) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(hcx, hcy, hr, 0, Math.PI * 2);
            ctx.clip();
            ctx.drawImage(
                img,
                faceRegion.x, faceRegion.y, faceRegion.width, faceRegion.height,
                hcx - hr, hcy - hr, hr * 2, hr * 2
            );
            ctx.restore();
        }

        // Subtle outline around face circle
        ctx.strokeStyle = 'rgba(0,0,0,0.35)';
        ctx.lineWidth   = 1.2;
        ctx.beginPath(); ctx.arc(hcx, hcy, hr, 0, Math.PI * 2); ctx.stroke();

        return cv.toDataURL('image/png');
    }

    /**
     * Cross-browser rounded rectangle path.
     * Uses ctx.roundRect if available, otherwise quadratic curves.
     */
    _rrect(ctx, x, y, w, h, r) {
        if (typeof ctx.roundRect === 'function') {
            ctx.beginPath();
            ctx.roundRect(x, y, w, h, r);
        } else {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
        }
    }

    // ── Phaser texture registration ──────────────────────────────────────────

    /**
     * Register (or re-register) a stored sprite as a Phaser canvas texture
     * and emit 'spriteUpdated' so live fighters swap textures immediately.
     */
    _registerInScene(scene, type) {
        const data = this._data[type];
        if (!data) return;

        const texKey = type + '-custom';
        const img    = new Image();

        img.onload = () => {
            if (scene.textures.exists(texKey)) scene.textures.remove(texKey);

            const tex = scene.textures.createCanvas(texKey, img.naturalWidth, img.naturalHeight);
            tex.context.drawImage(img, 0, 0);

            // Slice into numbered frames (for sprite-sheet uploads)
            const fw   = data.frameWidth;
            const fh   = data.frameHeight;
            const cols = Math.max(1, Math.floor(img.naturalWidth  / fw));
            const rows = Math.max(1, Math.floor(img.naturalHeight / fh));

            let idx = 0;
            outer: for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    tex.add(idx, 0, col * fw, row * fh, fw, fh);
                    idx++;
                    if (idx >= data.frameCount) break outer;
                }
            }
            tex.refresh();

            scene.events.emit('spriteUpdated', type, texKey, data);
        };

        img.src = data.dataUrl;
    }

    isLoaded(type) { return this._data[type] !== null; }
    getData(type)  { return this._data[type]; }
}

// Single global instance shared by scene and UI
const spriteManager = new SpriteManager();
