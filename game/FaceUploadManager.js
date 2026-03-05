/**
 * FaceUploadManager.js
 * Handles uploading, processing, and cropping face images.
 * Uses Canvas API to crop the centre of an uploaded image into a circular
 * face texture that can be drawn onto a fighter's head region.
 */

class FaceUploadManager {
    constructor() {
        /** @type {Object.<string, string>} key → data-URL */
        this.faceDataUrls = {};
    }

    /**
     * Load an image File and process it into a circular face crop.
     * @param {File} file
     * @param {string} key  – 'player' | 'enemy'
     * @returns {Promise<string>}  resolves with a data-URL (PNG)
     */
    loadFace(file, key) {
        return new Promise((resolve, reject) => {
            if (!file) {
                reject(new Error('No file provided'));
                return;
            }

            const reader = new FileReader();

            reader.onload = (e) => {
                const img = new Image();

                img.onload = () => {
                    try {
                        const dataUrl = this._cropToCircularFace(img);
                        this.faceDataUrls[key] = dataUrl;
                        resolve(dataUrl);
                    } catch (err) {
                        reject(err);
                    }
                };

                img.onerror = () => reject(new Error('Failed to decode image'));
                img.src = e.target.result;
            };

            reader.onerror = () => reject(new Error('Failed to read file'));
            reader.readAsDataURL(file);
        });
    }

    /**
     * Generate a random placeholder face (gradient circle) for the enemy
     * when no image has been uploaded.
     * @returns {string} data-URL
     */
    generateRandomFace() {
        const size = 128;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Circular clip
        ctx.beginPath();
        ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2);
        ctx.clip();

        // Random skin-tone gradient
        const hue = Math.floor(Math.random() * 40) + 10; // 10-50 (skin tones)
        const grd = ctx.createRadialGradient(size * 0.4, size * 0.35, size * 0.05,
                                              size / 2, size / 2, size / 2);
        grd.addColorStop(0, `hsl(${hue}, 60%, 75%)`);
        grd.addColorStop(1, `hsl(${hue}, 50%, 45%)`);
        ctx.fillStyle = grd;
        ctx.fillRect(0, 0, size, size);

        // Simple face features
        ctx.fillStyle = `hsl(${hue - 5}, 40%, 35%)`;
        // Eyes
        ctx.beginPath();
        ctx.ellipse(size * 0.36, size * 0.42, 8, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(size * 0.64, size * 0.42, 8, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        // Mouth
        ctx.strokeStyle = `hsl(${hue - 10}, 35%, 30%)`;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(size / 2, size * 0.62, size * 0.15, 0.2, Math.PI - 0.2);
        ctx.stroke();

        const dataUrl = canvas.toDataURL('image/png');
        this.faceDataUrls['enemy'] = dataUrl;
        return dataUrl;
    }

    /**
     * Crop the centre square from an image and clip it to a circle.
     * @param {HTMLImageElement} img
     * @param {number} [outputSize=128]
     * @returns {string} data-URL
     * @private
     */
    _cropToCircularFace(img, outputSize = 128) {
        const canvas = document.createElement('canvas');
        canvas.width = outputSize;
        canvas.height = outputSize;
        const ctx = canvas.getContext('2d');

        // Centre-crop: take the smallest dimension as the crop square
        const srcSize = Math.min(img.width, img.height);
        const srcX = (img.width - srcSize) / 2;
        const srcY = Math.max(0, (img.height - srcSize) / 2 - img.height * 0.05); // slightly upper

        // Circular clip
        ctx.beginPath();
        ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
        ctx.clip();

        ctx.drawImage(img,
            srcX, srcY, srcSize, srcSize,
            0, 0, outputSize, outputSize);

        return canvas.toDataURL('image/png');
    }

    /**
     * Return the stored data-URL for a given key, or null.
     * @param {string} key
     * @returns {string|null}
     */
    getFaceDataUrl(key) {
        return this.faceDataUrls[key] || null;
    }

    /**
     * True when both player and enemy faces have been loaded.
     */
    bothFacesReady() {
        return !!(this.faceDataUrls['player'] && this.faceDataUrls['enemy']);
    }
}

// Global singleton
const faceUploadManager = new FaceUploadManager();
