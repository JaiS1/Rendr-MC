import * as THREE from "three";
import { BLOCKS } from "./BlockRegistry";

const TEXTURE_PATH_BLOCK = "/textures/block/";
const TEXTURE_PATH_ENTITY = "/textures/entity/chest/";
const MISSING_COLOR = "#FF00FF";

export class TextureManager {
  constructor() {
    this.textureMap = new Map(); // name -> texture
    this.atlasTexture = null;
    this.uvMap = new Map(); // name -> { u, v, su, sv } (start u, start v, size u, size v)
    this.loadingPromise = null;
  }

  async loadTextures() {
    if (this.loadingPromise) return this.loadingPromise;

    this.loadingPromise = new Promise(async (resolve) => {
      const textureNames = new Set();

      // Collect all texture names from BlockRegistry
      Object.values(BLOCKS).forEach((block) => {
        if (!block.texture) return;
        if (typeof block.texture === "string") {
          textureNames.add(block.texture);
        } else {
          Object.values(block.texture).forEach((tex) => textureNames.add(tex));
        }
      });

      // Also ensure chest entity texture is loaded if needed
      // We don't add it to textureNames directly because we process it separately
      // But we need to know if we need it.
      // For now, let's just assume we need it if we have a chest block.

      const sortedNames = Array.from(textureNames).sort();
      const loadedImages = [];

      const loader = new THREE.ImageLoader();

      // Special handling for Chest
      // We will try to load 'normal.png' from entity/chest/ and slice it.
      // If successful, we add the slices to loadedImages with names 'chest_top.png', etc.

      let chestImage = null;
      try {
        chestImage = await new Promise((res) => {
          loader.load(
            `${TEXTURE_PATH_ENTITY}normal.png`,
            (img) => res(img),
            undefined,
            () => res(null)
          );
        });
      } catch (e) {
        console.warn("Failed to load chest texture");
      }

      if (chestImage) {
        const chestFaces = this.processChestTexture(chestImage);
        chestFaces.forEach((face) => {
          // Only add if requested (or just add all, it's fine)
          // We registered 'chest_top.png' etc in BlockRegistry
          loadedImages.push({ name: face.name, image: face.image });
          // Remove from sortedNames so we don't try to load it again
          const idx = sortedNames.indexOf(face.name);
          if (idx > -1) sortedNames.splice(idx, 1);
        });
      }

      for (const name of sortedNames) {
        let finalPath = `${TEXTURE_PATH_BLOCK}${name}`;

        try {
          const image = await new Promise((res, rej) => {
            loader.load(
              finalPath,
              (img) => res(img),
              undefined,
              (err) => res(null)
            );
          });

          if (image) {
            loadedImages.push({ name, image });
          } else {
            console.warn(`Missing texture: ${name}`);
            loadedImages.push({ name, image: this.createFallbackImage() });
          }
        } catch (e) {
          console.warn(`Error loading texture ${name}:`, e);
          loadedImages.push({ name, image: this.createFallbackImage() });
        }
      }

      this.createAtlas(loadedImages);
      resolve();
    });

    return this.loadingPromise;
  }

  processChestTexture(chestImage) {
    // Coordinates based on standard 1.15+ entity layout (un-flipped relative to python script)
    // Source Image is assumed to be 64x64 standard layout.
    // 1 unit = 1 pixel.

    // Source Coordinates (x, y, w, h)
    const src = {
      top: { x: 28, y: 0, w: 14, h: 14 },
      frontTop: { x: 42, y: 14, w: 14, h: 5 },
      frontBottom: { x: 42, y: 33, w: 14, h: 10 },
      sideTop: { x: 14, y: 14, w: 14, h: 5 },
      sideBottom: { x: 14, y: 33, w: 14, h: 10 },
      lock: { x: 1, y: 1, w: 2, h: 4 },
    };

    const createFace = (name, width, height, drawFn) => {
      // Intermediate canvas for the actual content size (e.g., 14x14 or 14x15)
      const contentCanvas = document.createElement("canvas");
      contentCanvas.width = width;
      contentCanvas.height = height;
      const cCtx = contentCanvas.getContext("2d");
      cCtx.imageSmoothingEnabled = false;

      drawFn(cCtx);

      // Final 16x16 canvas (Stretched to fill)
      const finalCanvas = document.createElement("canvas");
      finalCanvas.width = 16;
      finalCanvas.height = 16;
      const fCtx = finalCanvas.getContext("2d");
      fCtx.imageSmoothingEnabled = false;

      // Stretch content to 16x16
      fCtx.drawImage(contentCanvas, 0, 0, width, height, 0, 0, 16, 16);

      return { name, image: finalCanvas };
    };

    const faces = [];

    // 1. Top Face (14x14)
    faces.push(
      createFace("chest_top.png", 14, 14, (ctx) => {
        ctx.drawImage(
          chestImage,
          src.top.x,
          src.top.y,
          src.top.w,
          src.top.h,
          0,
          0,
          14,
          14
        );
      })
    );

    // 2. Front Face (14x15) - Composite Top + Bottom + Lock
    faces.push(
      createFace("chest_front.png", 14, 15, (ctx) => {
        // Top Part
        ctx.drawImage(
          chestImage,
          src.frontTop.x,
          src.frontTop.y,
          src.frontTop.w,
          src.frontTop.h,
          0,
          0,
          14,
          5
        );
        // Bottom Part
        ctx.drawImage(
          chestImage,
          src.frontBottom.x,
          src.frontBottom.y,
          src.frontBottom.w,
          src.frontBottom.h,
          0,
          5,
          14,
          10
        );
        // Lock (Centered horizontally: (14-2)/2 = 6)
        // Position vertically: Overlap region. Let's put it at y=3 relative to top (covering the seam at 5)
        // Python script used (7,3) on padded image. Here we are tighter.
        // Seam is at y=5. Lock is 4 high. 3..7 covers the seam.
        ctx.drawImage(
          chestImage,
          src.lock.x,
          src.lock.y,
          src.lock.w,
          src.lock.h,
          6,
          3,
          2,
          4
        );
      })
    );

    // 3. Side Face (14x15) - Composite Top + Bottom
    faces.push(
      createFace("chest_side.png", 14, 15, (ctx) => {
        ctx.drawImage(
          chestImage,
          src.sideTop.x,
          src.sideTop.y,
          src.sideTop.w,
          src.sideTop.h,
          0,
          0,
          14,
          5
        );
        ctx.drawImage(
          chestImage,
          src.sideBottom.x,
          src.sideBottom.y,
          src.sideBottom.w,
          src.sideBottom.h,
          0,
          5,
          14,
          10
        );
      })
    );

    // 4. Bottom - Reuse Top (simplification)
    // In BlockRegistry we can map 'chest_bottom.png' -> 'chest_top.png' logic or just create a copy?
    // Let's just create it to be safe.
    faces.push(
      createFace("chest_bottom.png", 14, 14, (ctx) => {
        // Use top texture for bottom for now, or extract actual bottom if needed (x=28, y=19?)
        // Let's use top to ensure it exists.
        ctx.drawImage(
          chestImage,
          src.top.x,
          src.top.y,
          src.top.w,
          src.top.h,
          0,
          0,
          14,
          14
        );
      })
    );

    return faces;
  }

  createFallbackImage() {
    const canvas = document.createElement("canvas");
    canvas.width = 16;
    canvas.height = 16;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = MISSING_COLOR;
    ctx.fillRect(0, 0, 16, 16);
    return canvas;
  }

  createAtlas(loadedImages) {
    // Simple row-based atlas for now (or grid)
    // Assuming 16x16 textures
    const count = loadedImages.length;
    const cols = Math.ceil(Math.sqrt(count));
    const rows = Math.ceil(count / cols);
    const size = 16;

    const canvas = document.createElement("canvas");
    canvas.width = cols * size;
    canvas.height = rows * size;
    const ctx = canvas.getContext("2d");

    // Disable smoothing for pixel art
    ctx.imageSmoothingEnabled = false;

    loadedImages.forEach((item, index) => {
      const col = index % cols;
      const row = Math.floor(index / cols);
      const x = col * size;
      const y = row * size;

      ctx.drawImage(
        item.image,
        0,
        0,
        item.image.width,
        item.image.height,
        x,
        y,
        size,
        size
      );

      // Calculate UVs
      // UVs in Three.js are 0..1, with (0,0) at bottom-left usually, but for canvas it's top-left.
      // We need to map carefully.
      // Actually, Three.js UV (0,0) is bottom-left. Canvas (0,0) is top-left.
      // So V needs to be flipped or we draw upside down?
      // Standard approach: Draw normally, but calculate UVs such that V=1 is top (if we flipY) or V=0 is top.
      // Let's stick to standard: V=0 is bottom, V=1 is top.
      // So a texture at row 0 (top) has V range [1 - 1/rows, 1].

      // Let's normalize to 0..1
      const uMin = col / cols;
      const uMax = (col + 1) / cols;
      // Inverted Y for UVs
      const vMin = 1 - (row + 1) / rows;
      const vMax = 1 - row / rows;

      this.uvMap.set(item.name, { uMin, uMax, vMin, vMax });
    });

    this.atlasTexture = new THREE.CanvasTexture(canvas);
    this.atlasTexture.magFilter = THREE.NearestFilter;
    this.atlasTexture.minFilter = THREE.NearestFilter;
    this.atlasTexture.colorSpace = THREE.SRGBColorSpace;
  }

  getTexture() {
    return this.atlasTexture;
  }

  getUVs(textureName) {
    return (
      this.uvMap.get(textureName) || { uMin: 0, uMax: 0, vMin: 0, vMax: 0 }
    );
  }
}

export const textureManager = new TextureManager();
