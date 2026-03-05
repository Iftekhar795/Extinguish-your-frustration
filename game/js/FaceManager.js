/**
 * FaceManager.js
 * Handles face image upload, center-crop processing,
 * and stores full + thumbnail versions for sharing.
 */

class FaceManager {
    /** Face crop dimensions and quality */
    static get FULL_SIZE()    { return 100; }
    static get FULL_QUALITY() { return 0.75; }
    static get THUMB_SIZE()   { return 50; }
    static get THUMB_QUALITY(){ return 0.25; }

    constructor() {
        this.faces      = { player: null, enemy: null };
        this.thumbnails = { player: null, enemy: null };
    }

    /**
     * Load an image file, crop the face area, and store as data URLs.
     * @param {File} file
     * @param {'player'|'enemy'} type
     * @param {Function} callback  (error, { dataURL, width, height })
     */
    loadFace(file, type, callback) {
        if (!file) { callback(new Error('No file selected'), null); return; }

        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const result = this._cropFace(img);
                    this.faces[type]      = result.full;
                    this.thumbnails[type] = result.thumb;
                    callback(null, { dataURL: result.full, width: img.width, height: img.height });
                } catch (err) {
                    callback(err, null);
                }
            };
            img.onerror = () => callback(new Error('Failed to load image'), null);
            img.src = e.target.result;
        };
        reader.onerror = () => callback(new Error('Failed to read file'), null);
        reader.readAsDataURL(file);
    }

    /**
     * Centre-square crop the image to isolate a face, return two sizes.
     * @param {HTMLImageElement} img
     * @returns {{ full: string, thumb: string }}
     */
    _cropFace(img) {
        // Square crop from the centre-top (faces are usually upper-centre)
        const side = Math.min(img.width, img.height);
        const srcX = (img.width  - side) / 2;
        // Shift crop upward slightly so forehead isn't cut off
        const srcY = Math.max(0, (img.height - side) / 2 - img.height * 0.08);

        const drawCropped = (size, quality) => {
            const c   = document.createElement('canvas');
            c.width   = c.height = size;
            c.getContext('2d').drawImage(img, srcX, srcY, side, side, 0, 0, size, size);
            return c.toDataURL('image/jpeg', quality);
        };

        return {
            full:  drawCropped(FaceManager.FULL_SIZE,  FaceManager.FULL_QUALITY),
            thumb: drawCropped(FaceManager.THUMB_SIZE, FaceManager.THUMB_QUALITY)
        };
    }

    /** @returns {string|null} */
    getFaceDataURL(type) { return this.faces[type]; }

    /** Returns encoded representation for sharing */
    encodeFaces() {
        return {
            playerFull:  this.faces.player,
            enemyFull:   this.faces.enemy,
            playerThumb: this.thumbnails.player,
            enemyThumb:  this.thumbnails.enemy
        };
    }

    /** Restore faces from a decoded share config */
    loadFromEncoded(data) {
        if (data.playerFull)  this.faces.player      = data.playerFull;
        if (data.enemyFull)   this.faces.enemy        = data.enemyFull;
        if (data.playerThumb) this.thumbnails.player  = data.playerThumb;
        if (data.enemyThumb)  this.thumbnails.enemy   = data.enemyThumb;
    }
}

// Global singleton used by other modules
const faceManager = new FaceManager();
