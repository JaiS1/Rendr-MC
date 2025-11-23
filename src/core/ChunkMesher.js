import * as THREE from "three";
import { BLOCKS, getBlockById } from "./BlockRegistry";
import { textureManager } from "./TextureManager";
import { CHUNK_SIZE } from "../world/TestWorldGenerator";

const TINT_COLOR_FOLIAGE = new THREE.Color("#91BD59");
const TINT_COLOR_WATER = new THREE.Color("#3F76E4");
const TINT_COLOR_WHITE = new THREE.Color("#FFFFFF");

export class ChunkMesher {
  constructor() {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
    this.indices = [];
  }

  generateGeometry({ ids, metadata }) {
    this.positions = [];
    this.normals = [];
    this.uvs = [];
    this.colors = [];
    this.indices = [];

    const getBlock = (x, y, z) => {
      if (
        x < 0 ||
        x >= CHUNK_SIZE ||
        y < 0 ||
        y >= CHUNK_SIZE ||
        z < 0 ||
        z >= CHUNK_SIZE
      ) {
        return { block: BLOCKS.AIR, meta: 0 };
      }
      const index = x + z * CHUNK_SIZE + y * CHUNK_SIZE * CHUNK_SIZE;
      return { block: getBlockById(ids[index]), meta: metadata[index] };
    };

    const getBlockOnly = (x, y, z) => getBlock(x, y, z).block;

    for (let y = 0; y < CHUNK_SIZE; y++) {
      for (let z = 0; z < CHUNK_SIZE; z++) {
        for (let x = 0; x < CHUNK_SIZE; x++) {
          const { block, meta } = getBlock(x, y, z);
          if (block.id === BLOCKS.AIR.id) continue;

          // Determine base tint
          let baseTint = TINT_COLOR_WHITE;
          if (
            block.id === BLOCKS.OAK_LEAVES.id ||
            block.id === BLOCKS.BIRCH_LEAVES.id ||
            block.id === BLOCKS.SPRUCE_LEAVES.id ||
            block.id === BLOCKS.JUNGLE_LEAVES.id ||
            block.id === BLOCKS.ACACIA_LEAVES.id ||
            block.id === BLOCKS.DARK_OAK_LEAVES.id
          ) {
            baseTint = TINT_COLOR_FOLIAGE;
          } else if (block.id === BLOCKS.WATER.id) {
            baseTint = TINT_COLOR_WATER;
          }

          if (block.geometry === "cube" || block.geometry === "custom") {
            const isChest = block.id === BLOCKS.CHEST.id;
            const size = isChest ? 0.875 : 1.0;
            const offsetX = (1.0 - size) / 2;
            const offsetZ = (1.0 - size) / 2;
            const offsetY = isChest ? 0 : (1.0 - size) / 2;

            this.addCube(
              x,
              y,
              z,
              block,
              getBlockOnly,
              size,
              offsetX,
              offsetY,
              offsetZ,
              baseTint
            );
          } else if (block.geometry === "fluid") {
            this.addFluid(x, y, z, block, getBlockOnly, baseTint);
          } else if (block.geometry === "stairs") {
            this.addStairs(x, y, z, block, getBlockOnly, baseTint, meta);
          } else if (block.geometry === "slab") {
            this.addSlab(x, y, z, block, getBlockOnly, baseTint, meta);
          } else if (block.geometry === "cross") {
            this.addCross(x, y, z, block, baseTint);
          } else if (block.geometry === "rail") {
            this.addRail(x, y, z, block, baseTint);
          } else if (block.geometry === "ladder") {
            this.addLadder(x, y, z, block, baseTint);
          } else if (block.geometry === "trapdoor") {
            this.addTrapdoor(x, y, z, block, baseTint);
          }
        }
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(this.positions, 3)
    );
    geometry.setAttribute(
      "normal",
      new THREE.Float32BufferAttribute(this.normals, 3)
    );
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(this.uvs, 2));
    geometry.setAttribute(
      "color",
      new THREE.Float32BufferAttribute(this.colors, 3)
    );
    geometry.setIndex(this.indices);

    return geometry;
  }

  addFace(
    x,
    y,
    z,
    width,
    height,
    depth,
    uMin,
    uMax,
    vMin,
    vMax,
    normal,
    tint,
    faceType
  ) {
    const r = this.positions.length / 3;
    let v = [];

    const x0 = x;
    const x1 = x + width;
    const y0 = y;
    const y1 = y + height;
    const z0 = z;
    const z1 = z + depth;

    if (faceType === 0) {
      v = [x1, y0, z1, x1, y0, z0, x1, y1, z0, x1, y1, z1];
    } else if (faceType === 1) {
      v = [x0, y0, z0, x0, y0, z1, x0, y1, z1, x0, y1, z0];
    } else if (faceType === 2) {
      v = [x0, y1, z1, x1, y1, z1, x1, y1, z0, x0, y1, z0];
    } else if (faceType === 3) {
      v = [x0, y0, z0, x1, y0, z0, x1, y0, z1, x0, y0, z1];
    } else if (faceType === 4) {
      v = [x1, y0, z1, x0, y0, z1, x0, y1, z1, x1, y1, z1];
    } else if (faceType === 5) {
      v = [x0, y0, z0, x1, y0, z0, x1, y1, z0, x0, y1, z0];
    }

    this.positions.push(...v);

    for (let i = 0; i < 4; i++) {
      this.normals.push(normal.x, normal.y, normal.z);
      this.colors.push(tint.r, tint.g, tint.b);
    }

    this.uvs.push(uMin, vMin);
    this.uvs.push(uMax, vMin);
    this.uvs.push(uMax, vMax);
    this.uvs.push(uMin, vMax);

    this.indices.push(r, r + 1, r + 2);
    this.indices.push(r, r + 2, r + 3);
  }

  getTextureUVs(block, face) {
    let texName = block.texture;
    if (typeof texName === "object") {
      if (face === "top" && texName.top) texName = texName.top;
      else if (face === "bottom" && texName.bottom) texName = texName.bottom;
      else if (face === "front" && texName.front) texName = texName.front;
      else if (texName.side) texName = texName.side;
      else texName = Object.values(texName)[0];
    }
    return textureManager.getUVs(texName);
  }

  addCube(x, y, z, block, getBlock, size, offX, offY, offZ, baseTint) {
    const startX = x + offX;
    const startY = y + offY;
    const startZ = z + offZ;

    const neighbors = [
      {
        dx: 1,
        dy: 0,
        dz: 0,
        face: 0,
        name: "side",
        normal: new THREE.Vector3(1, 0, 0),
      },
      {
        dx: -1,
        dy: 0,
        dz: 0,
        face: 1,
        name: "side",
        normal: new THREE.Vector3(-1, 0, 0),
      },
      {
        dx: 0,
        dy: 1,
        dz: 0,
        face: 2,
        name: "top",
        normal: new THREE.Vector3(0, 1, 0),
      },
      {
        dx: 0,
        dy: -1,
        dz: 0,
        face: 3,
        name: "bottom",
        normal: new THREE.Vector3(0, -1, 0),
      },
      {
        dx: 0,
        dy: 0,
        dz: 1,
        face: 4,
        name: "side",
        normal: new THREE.Vector3(0, 0, 1),
      },
      {
        dx: 0,
        dy: 0,
        dz: -1,
        face: 5,
        name: "side",
        normal: new THREE.Vector3(0, 0, -1),
      },
    ];

    if (block.id === BLOCKS.CHEST.id) {
      neighbors[4].name = "front";
    }

    for (const n of neighbors) {
      const nb = getBlock(x + n.dx, y + n.dy, z + n.dz);
      let shouldDraw = true;
      if (size === 1.0) {
        if (!nb.isTransparent) shouldDraw = false;
      }

      if (shouldDraw) {
        const { uMin, uMax, vMin, vMax } = this.getTextureUVs(block, n.name);
        let currentTint = baseTint;
        if (block.id === BLOCKS.GRASS_BLOCK.id) {
          if (n.face === 2) currentTint = TINT_COLOR_FOLIAGE;
          else currentTint = TINT_COLOR_WHITE;
        }

        this.addFace(
          startX,
          startY,
          startZ,
          size,
          size,
          size,
          uMin,
          uMax,
          vMin,
          vMax,
          n.normal,
          currentTint,
          n.face
        );
      }
    }
  }

  addFluid(x, y, z, block, getBlock, tint) {
    const above = getBlock(x, y + 1, z);
    const isWaterAbove = above.id === BLOCKS.WATER.id;
    const height = isWaterAbove ? 1.0 : 0.9;

    const neighbors = [
      { dx: 1, dy: 0, dz: 0, face: 0, normal: new THREE.Vector3(1, 0, 0) },
      { dx: -1, dy: 0, dz: 0, face: 1, normal: new THREE.Vector3(-1, 0, 0) },
      { dx: 0, dy: 1, dz: 0, face: 2, normal: new THREE.Vector3(0, 1, 0) },
      { dx: 0, dy: -1, dz: 0, face: 3, normal: new THREE.Vector3(0, -1, 0) },
      { dx: 0, dy: 0, dz: 1, face: 4, normal: new THREE.Vector3(0, 0, 1) },
      { dx: 0, dy: 0, dz: -1, face: 5, normal: new THREE.Vector3(0, 0, -1) },
    ];

    const { uMin, uMax, vMin, vMax } = this.getTextureUVs(block, "top");

    for (const n of neighbors) {
      const nb = getBlock(x + n.dx, y + n.dy, z + n.dz);
      if (nb.id === block.id) continue;
      if (!nb.isTransparent && !nb.isFluid) continue;

      if (n.face === 2) {
        this.addFace(
          x,
          y + height - 1.0,
          z,
          1.0,
          1.0,
          1.0,
          uMin,
          uMax,
          vMin,
          vMax,
          n.normal,
          tint,
          n.face
        );
        this.addFace(
          x,
          y,
          z,
          1.0,
          height,
          1.0,
          uMin,
          uMax,
          vMin,
          vMax,
          n.normal,
          tint,
          n.face
        );
      } else if (n.face === 3) {
        this.addFace(
          x,
          y,
          z,
          1.0,
          height,
          1.0,
          uMin,
          uMax,
          vMin,
          vMax,
          n.normal,
          tint,
          n.face
        );
      } else {
        this.addFace(
          x,
          y,
          z,
          1.0,
          height,
          1.0,
          uMin,
          uMax,
          vMin,
          vMax,
          n.normal,
          tint,
          n.face
        );
      }
    }
  }

  getPartialUVs(uvs, uStart, uEnd, vStart, vEnd) {
    const width = uvs.uMax - uvs.uMin;
    const height = uvs.vMax - uvs.vMin;
    return {
      uMin: uvs.uMin + width * uStart,
      uMax: uvs.uMin + width * uEnd,
      vMin: uvs.vMin + height * vStart,
      vMax: uvs.vMin + height * vEnd,
    };
  }

  addStairs(x, y, z, block, getBlock, tint, meta) {
    // Meta: 0=East, 1=West, 2=South, 3=North (Default)
    // Default implementation was North (Ascending South->North, High at Z=0).
    const direction = meta & 3;

    const getUVs = (face, uS, uE, vS, vE) => {
      const fullUVs = this.getTextureUVs(block, face);
      return this.getPartialUVs(fullUVs, uS, uE, vS, vE);
    };

    const addPFace = (px, py, pz, w, h, d, uv, faceIdx, faceName) => {
      this.addFace(
        px,
        py,
        pz,
        w,
        h,
        d,
        uv.uMin,
        uv.uMax,
        uv.vMin,
        uv.vMax,
        this.getFaceNormal(faceIdx),
        tint,
        faceIdx
      );
    };

    // Bottom Slab (Always present)
    addPFace(x, y, z, 1, 0.5, 1, getUVs("bottom", 0, 1, 0, 1), 3, "bottom");

    // Sides of bottom slab (Always present, but UVs might shift?)
    // For simple textures, full width/half height is fine.
    // BUT if we want to be precise, we should map based on orientation.
    // Let's keep sides simple for bottom slab (bottom half of texture).
    addPFace(x, y, z, 1, 0.5, 1, getUVs("side", 0, 1, 0, 0.5), 4, "side");
    addPFace(x, y, z, 1, 0.5, 1, getUVs("side", 0, 1, 0, 0.5), 5, "side");
    addPFace(x, y, z, 1, 0.5, 1, getUVs("side", 0, 1, 0, 0.5), 0, "side");
    addPFace(x, y, z, 1, 0.5, 1, getUVs("side", 0, 1, 0, 0.5), 1, "side");

    // Top of Bottom Slab (Seat)
    // Visible part depends on Top Step location.
    // Top Step occupies half the block.
    // North (3): Top Step at Z=0..0.5. Seat at Z=0.5..1.
    // South (2): Top Step at Z=0.5..1. Seat at Z=0..0.5.
    // West (1): Top Step at X=0..0.5. Seat at X=0.5..1.
    // East (0): Top Step at X=0.5..1. Seat at X=0..0.5.

    let seatX = x,
      seatZ = z,
      seatW = 1,
      seatD = 1;
    let stepX = x,
      stepZ = z,
      stepW = 1,
      stepD = 1;

    if (direction === 3) {
      // North
      // Seat South
      seatZ = z + 0.5;
      seatD = 0.5;
      // Step North
      stepD = 0.5;
    } else if (direction === 2) {
      // South
      // Seat North
      seatD = 0.5;
      // Step South
      stepZ = z + 0.5;
      stepD = 0.5;
    } else if (direction === 1) {
      // West
      // Seat East
      seatX = x + 0.5;
      seatW = 0.5;
      // Step West
      stepW = 0.5;
    } else if (direction === 0) {
      // East
      // Seat West
      seatW = 0.5;
      // Step East
      stepX = x + 0.5;
      stepW = 0.5;
    }

    // Render Seat (Top Face of bottom slab)
    // UVs need to be rotated? Ideally yes. For now, slicing simple.
    addPFace(
      seatX,
      y,
      seatZ,
      seatW,
      0.5,
      seatD,
      getUVs("top", 0, 1, 0, 0.5),
      2,
      "top"
    );

    // --- Top Step ---
    // Top Face
    addPFace(
      stepX,
      y + 0.5,
      stepZ,
      stepW,
      0.5,
      stepD,
      getUVs("top", 0, 1, 0.5, 1),
      2,
      "top"
    );

    // Sides of Top Step
    // We need to render faces based on location.
    // If North (3): Step is at North.
    // Front (Z=0.5) -> Face 4 (South face of the step).
    // Back (Z=0) -> Face 5 (North face of the step, aligns with block North).
    // Left/Right -> Partial width.

    if (direction === 3) {
      // North
      // South Face of Step (Riser)
      addPFace(
        x,
        y + 0.5,
        z,
        1,
        0.5,
        0.5,
        getUVs("side", 0, 1, 0.5, 1),
        4,
        "side"
      );
      // North Face of Step (Back)
      addPFace(
        x,
        y + 0.5,
        z,
        1,
        0.5,
        0.5,
        getUVs("side", 0, 1, 0.5, 1),
        5,
        "side"
      );
      // Sides (X)
      addPFace(
        x,
        y + 0.5,
        z,
        1,
        0.5,
        0.5,
        getUVs("side", 0.5, 1, 0.5, 1),
        0,
        "side"
      ); // Right
      addPFace(
        x,
        y + 0.5,
        z,
        1,
        0.5,
        0.5,
        getUVs("side", 0, 0.5, 0.5, 1),
        1,
        "side"
      ); // Left
    } else if (direction === 2) {
      // South
      // North Face of Step (Riser) - at Z=0.5 facing -Z
      // My addPFace logic adds based on box.
      // Box is at z+0.5.
      // Face 5 (-Z) of this box is at z+0.5.
      addPFace(
        x,
        y + 0.5,
        z + 0.5,
        1,
        0.5,
        0.5,
        getUVs("side", 0, 1, 0.5, 1),
        5,
        "side"
      );
      // South Face (Back)
      addPFace(
        x,
        y + 0.5,
        z + 0.5,
        1,
        0.5,
        0.5,
        getUVs("side", 0, 1, 0.5, 1),
        4,
        "side"
      );
      // Sides
      addPFace(
        x,
        y + 0.5,
        z + 0.5,
        1,
        0.5,
        0.5,
        getUVs("side", 0, 0.5, 0.5, 1),
        0,
        "side"
      ); // Right (Flipped UVs for variety?)
      addPFace(
        x,
        y + 0.5,
        z + 0.5,
        1,
        0.5,
        0.5,
        getUVs("side", 0.5, 1, 0.5, 1),
        1,
        "side"
      );
    } else if (direction === 1) {
      // West
      // East Face of Step (Riser) - at X=0.5 facing +X? No, Step is at West (X=0).
      // So Riser is at X=0.5 facing +X (Face 0).
      addPFace(
        x,
        y + 0.5,
        z,
        0.5,
        0.5,
        1,
        getUVs("side", 0, 1, 0.5, 1),
        0,
        "side"
      );
      // West Face (Back)
      addPFace(
        x,
        y + 0.5,
        z,
        0.5,
        0.5,
        1,
        getUVs("side", 0, 1, 0.5, 1),
        1,
        "side"
      );
      // Sides (Z)
      addPFace(
        x,
        y + 0.5,
        z,
        0.5,
        0.5,
        1,
        getUVs("side", 0.5, 1, 0.5, 1),
        4,
        "side"
      );
      addPFace(
        x,
        y + 0.5,
        z,
        0.5,
        0.5,
        1,
        getUVs("side", 0, 0.5, 0.5, 1),
        5,
        "side"
      );
    } else if (direction === 0) {
      // East
      // Step is at East (X=0.5..1).
      // West Face of Step (Riser) - at X=0.5 facing -X (Face 1).
      addPFace(
        x + 0.5,
        y + 0.5,
        z,
        0.5,
        0.5,
        1,
        getUVs("side", 0, 1, 0.5, 1),
        1,
        "side"
      );
      // East Face (Back)
      addPFace(
        x + 0.5,
        y + 0.5,
        z,
        0.5,
        0.5,
        1,
        getUVs("side", 0, 1, 0.5, 1),
        0,
        "side"
      );
      // Sides
      addPFace(
        x + 0.5,
        y + 0.5,
        z,
        0.5,
        0.5,
        1,
        getUVs("side", 0, 0.5, 0.5, 1),
        4,
        "side"
      );
      addPFace(
        x + 0.5,
        y + 0.5,
        z,
        0.5,
        0.5,
        1,
        getUVs("side", 0.5, 1, 0.5, 1),
        5,
        "side"
      );
    }
  }

  getFaceNormal(face) {
    const normals = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    ];
    return normals[face];
  }

  addSlab(x, y, z, block, getBlock, tint, meta) {
    // Meta 8 = Top
    const isTop = (meta & 8) === 8;
    const yOff = isTop ? 0.5 : 0;

    const getUVs = (face, uS, uE, vS, vE) => {
      const fullUVs = this.getTextureUVs(block, face);
      return this.getPartialUVs(fullUVs, uS, uE, vS, vE);
    };

    const addPFace = (px, py, pz, w, h, d, uv, faceIdx, faceName) => {
      this.addFace(
        px,
        py,
        pz,
        w,
        h,
        d,
        uv.uMin,
        uv.uMax,
        uv.vMin,
        uv.vMax,
        this.getFaceNormal(faceIdx),
        tint,
        faceIdx
      );
    };

    // Bottom/Top Face
    addPFace(
      x,
      y + yOff,
      z,
      1,
      0.5,
      1,
      getUVs("bottom", 0, 1, 0, 1),
      3,
      "bottom"
    );
    addPFace(x, y + yOff, z, 1, 0.5, 1, getUVs("top", 0, 1, 0, 1), 2, "top");

    // Sides (Using bottom half of texture if bottom slab, top half if top slab? Or just full compressed? or bottom half always?)
    // Usually slab side texture is bottom half.
    // If it's a top slab, it's the top half of the block space, so maybe use top half of texture?
    // Minecraft slabs use side texture.
    // Let's use appropriate half.
    const vS = isTop ? 0.5 : 0;
    const vE = isTop ? 1 : 0.5;

    addPFace(
      x,
      y + yOff,
      z,
      1,
      0.5,
      1,
      getUVs("side", 0, 1, vS, vE),
      4,
      "side"
    );
    addPFace(
      x,
      y + yOff,
      z,
      1,
      0.5,
      1,
      getUVs("side", 0, 1, vS, vE),
      5,
      "side"
    );
    addPFace(
      x,
      y + yOff,
      z,
      1,
      0.5,
      1,
      getUVs("side", 0, 1, vS, vE),
      0,
      "side"
    );
    addPFace(
      x,
      y + yOff,
      z,
      1,
      0.5,
      1,
      getUVs("side", 0, 1, vS, vE),
      1,
      "side"
    );
  }

  addCross(x, y, z, block, tint) {
    const { uMin, uMax, vMin, vMax } = this.getTextureUVs(block, "side");
    this.addDiagonalFace(x, y, z, uMin, uMax, vMin, vMax, tint, false);
    this.addDiagonalFace(x, y, z, uMin, uMax, vMin, vMax, tint, true);
    this.addDiagonalFace2(x, y, z, uMin, uMax, vMin, vMax, tint, false);
    this.addDiagonalFace2(x, y, z, uMin, uMax, vMin, vMax, tint, true);
  }

  addDiagonalFace(x, y, z, uMin, uMax, vMin, vMax, tint, flipped) {
    const r = this.positions.length / 3;
    const v = [x, y, z, x + 1, y, z + 1, x + 1, y + 1, z + 1, x, y + 1, z];
    this.positions.push(...v);
    const nx = -0.707;
    const nz = 0.707;
    for (let i = 0; i < 4; i++) {
      this.normals.push(flipped ? -nx : nx, 0, flipped ? -nz : nz);
      this.colors.push(tint.r, tint.g, tint.b);
    }
    this.uvs.push(uMin, vMin);
    this.uvs.push(uMax, vMin);
    this.uvs.push(uMax, vMax);
    this.uvs.push(uMin, vMax);
    if (flipped) {
      this.indices.push(r, r + 2, r + 1);
      this.indices.push(r, r + 3, r + 2);
    } else {
      this.indices.push(r, r + 1, r + 2);
      this.indices.push(r, r + 2, r + 3);
    }
  }

  addDiagonalFace2(x, y, z, uMin, uMax, vMin, vMax, tint, flipped) {
    const r = this.positions.length / 3;
    const v = [x, y, z + 1, x + 1, y, z, x + 1, y + 1, z, x, y + 1, z + 1];
    this.positions.push(...v);
    const nx = 0.707;
    const nz = 0.707;
    for (let i = 0; i < 4; i++) {
      this.normals.push(flipped ? -nx : nx, 0, flipped ? -nz : nz);
      this.colors.push(tint.r, tint.g, tint.b);
    }
    this.uvs.push(uMin, vMin);
    this.uvs.push(uMax, vMin);
    this.uvs.push(uMax, vMax);
    this.uvs.push(uMin, vMax);
    if (flipped) {
      this.indices.push(r, r + 2, r + 1);
      this.indices.push(r, r + 3, r + 2);
    } else {
      this.indices.push(r, r + 1, r + 2);
      this.indices.push(r, r + 2, r + 3);
    }
  }

  addRail(x, y, z, block, tint) {
    this.addBox(x, y, z, 1.0, 0.05, 1.0, block, tint);
  }

  addLadder(x, y, z, block, tint) {
    this.addBox(x, y, z, 1.0, 1.0, 0.05, block, tint);
  }

  addTrapdoor(x, y, z, block, tint) {
    this.addBox(x, y, z, 1.0, 0.1875, 1.0, block, tint);
  }

  addBox(x, y, z, w, h, d, block, tint) {
    const faces = [0, 1, 2, 3, 4, 5];
    const normals = [
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(-1, 0, 0),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(0, 0, -1),
    ];
    const names = ["side", "side", "top", "bottom", "side", "side"];

    for (let i = 0; i < 6; i++) {
      const { uMin, uMax, vMin, vMax } = this.getTextureUVs(block, names[i]);
      this.addFace(
        x,
        y,
        z,
        w,
        h,
        d,
        uMin,
        uMax,
        vMin,
        vMax,
        normals[i],
        tint,
        faces[i]
      );
    }
  }
}

export const chunkMesher = new ChunkMesher();
