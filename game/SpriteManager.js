/**
 * SpriteManager.js
 * Handles loading, storing, and managing custom sprite images.
 * Converts uploaded images into Phaser-compatible textures with
 * optional sprite-sheet frame slicing.
 */

class SpriteManager {
    constructor() {
        // Store raw data for each sprite type
        this._data = { player: null, enemy: null };
        // Reference to the active Phaser scene (set once scene is ready)
        this._scene = null;
    }

    /**
     * Provide the active Phaser scene so textures can be (re-)registered.
     * @param {Phaser.Scene} scene
     */
    setScene(scene) {
        this._scene = scene;
        // Re-register any sprites that were loaded before the scene started
        ['player', 'enemy'].forEach(type => {
            if (this._data[type]) {
                this._registerInScene(scene, type);
            }
        });
    }

    /**
     * Load a user-uploaded image file and store it.
     * @param {File}   file        - Image file from <input type="file">
     * @param {string} type        - 'player' or 'enemy'
     * @param {{frameWidth:number, frameHeight:number, frameCount:number}} sheetCfg
     * @param {Function} callback  - (err, info) => void
     */
    loadCustomSprite(file, type, sheetCfg, callback) {
        if (!file) {
            callback(new Error('No file selected'), null);
            return;
        }

        const reader = new FileReader();

        reader.onerror = () => callback(new Error('Failed to read file'), null);

        reader.onload = (e) => {
            const img = new Image();

            img.onerror = () => callback(new Error('Invalid image file'), null);

            img.onload = () => {
                // Draw image to a hidden canvas to obtain a stable data-URL
                const canvas = document.createElement('canvas');
                canvas.width  = img.naturalWidth;
                canvas.height = img.naturalHeight;
                canvas.getContext('2d').drawImage(img, 0, 0);

                const fw = (sheetCfg.frameWidth > 0)  ? sheetCfg.frameWidth  : img.naturalWidth;
                const fh = (sheetCfg.frameHeight > 0) ? sheetCfg.frameHeight : img.naturalHeight;

                this._data[type] = {
                    dataUrl:      canvas.toDataURL('image/png'),
                    naturalWidth:  img.naturalWidth,
                    naturalHeight: img.naturalHeight,
                    frameWidth:    fw,
                    frameHeight:   fh,
                    frameCount:    Math.max(1, sheetCfg.frameCount || 1)
                };

                if (this._scene) {
                    this._registerInScene(this._scene, type);
                }

                callback(null, {
                    type,
                    width:  img.naturalWidth,
                    height: img.naturalHeight
                });
            };

            img.src = e.target.result;
        };

        reader.readAsDataURL(file);
    }

    /**
     * Register (or re-register) a texture in the Phaser scene.
     * Emits 'spriteUpdated' on the scene when the texture is ready.
     * @param {Phaser.Scene} scene
     * @param {string} type - 'player' or 'enemy'
     */
    _registerInScene(scene, type) {
        const data = this._data[type];
        if (!data) return;

        const texKey = type + '-custom';

        const img = new Image();

        img.onload = () => {
            // Remove stale texture so Phaser lets us re-create it
            if (scene.textures.exists(texKey)) {
                scene.textures.remove(texKey);
            }

            // Create a canvas texture of the full image size
            const tex = scene.textures.createCanvas(
                texKey,
                img.naturalWidth,
                img.naturalHeight
            );
            tex.context.drawImage(img, 0, 0);

            // Slice into numbered frames for sprite-sheet support
            const fw   = data.frameWidth;
            const fh   = data.frameHeight;
            const cols = Math.max(1, Math.floor(img.naturalWidth  / fw));
            const rows = Math.max(1, Math.floor(img.naturalHeight / fh));

            let idx = 0;
            outer: for (let row = 0; row < rows; row++) {
                for (let col = 0; col < cols; col++) {
                    // (frameName, sourceIndex, x, y, width, height)
                    tex.add(idx, 0, col * fw, row * fh, fw, fh);
                    idx++;
                    if (idx >= data.frameCount) break outer;
                }
            }

            tex.refresh();

            // Notify the scene so it can swap the sprite texture
            scene.events.emit('spriteUpdated', type, texKey, data);
        };

        img.src = data.dataUrl;
    }

    /** @returns {boolean} */
    isLoaded(type) {
        return this._data[type] !== null;
    }

    /** @returns {object|null} */
    getData(type) {
        return this._data[type];
    }
}

// Single global instance shared between scene and UI
const spriteManager = new SpriteManager();
