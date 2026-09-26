// "Mountain": a peak with a sheer south face above a narrow ledge. The
// architect carves a hideout into the rock, glazes the opening, cantilevers a
// balcony over the ledge, and adds supports after review.
import {
  fbm, hash, vnoise, smoothstep, mulberry32, makeHeightmap, columnsToBlocks, spruceTree, dedupe, box,
} from "../terrain.js";

export const HALF = 48;
export const SEA = 10;
export const CX = 6; // hideout centre x
export const FACE = -2; // z of the cliff face (faces south, +z)
export const L = 26; // hideout floor y
export const LEDGE = L - 4;
const M = { x: 6, z: -16 };
const lerp = (a, b, k) => a + (b - a) * k;

function heightAt(x, z) {
  const valley = 12 + (fbm(x, z) - 0.5) * 6;
  const r = Math.hypot(x - M.x, (z - M.z) * 1.1);
  const ridge = 1 - Math.abs(vnoise(x / 9, z / 9) * 2 - 1);
  let h = valley + 46 * Math.exp(-((r / 25) ** 2)) + (ridge - 0.5) * 12 * Math.exp(-((r / 30) ** 2));
  // Solid rock above and behind the hideout
  const w = smoothstep(15, 10, Math.abs(x - CX));
  if (z <= FACE && z >= FACE - 16) h = lerp(h, Math.max(h, L + 13), w);
  // The face: a sheer drop onto a narrow ledge, then a slope to the valley
  if (z > FACE) {
    const ledge = z <= FACE + 4 ? LEDGE : LEDGE - (z - FACE - 4) * 1.3;
    h = lerp(h, Math.min(h, ledge), w);
  }
  // A lake in the valley
  const dl = Math.hypot(x + 22, z - 22);
  if (dl < 14) h = Math.min(h, lerp(6, h, smoothstep(9, 14, dl)));
  return Math.max(1, Math.round(h));
}

const rock = (x, y, z) => {
  const n = hash(Math.floor(x / 3) * 7 + Math.floor(y / 2), Math.floor(z / 3) * 13 + Math.floor(y / 3));
  return n > 0.82 ? "tuff" : n > 0.6 ? "andesite" : "stone";
};

export function buildWorld() {
  const hm = makeHeightmap(HALF, heightAt);
  const { H } = hm;
  const inHideout = (x, z) => x >= CX - 8 && x <= CX + 8 && z >= FACE - 13 && z <= FACE;
  const { blocks: terrain, tops } = columnsToBlocks(
    hm,
    (x, z, h, { maxDiff }) => {
      let top;
      if (h <= SEA) top = "sand";
      else if (h >= 46) top = "snow";
      else if (maxDiff >= 3 || h >= 38) top = rock(x, h, z);
      else if (h >= 24) top = hash(x, z) > 0.5 ? "coarse_dirt" : "podzol";
      else top = hash(x * 3, z) > 0.8 ? "podzol" : "grass";
      const soil = top === "grass" || top === "podzol" || top === "coarse_dirt";
      return { top, fill: (d, y, fx, fz) => (top === "sand" ? "sand" : soil && d <= 2 ? "dirt" : rock(fx, y, fz)) };
    },
    { deepFill: (x, z) => (inHideout(x, z) ? L - 2 : null) }
  );

  // Spruce forest on the lower slopes, plants in the valley
  const rng = mulberry32(2024);
  const decor = [];
  const trees = [];
  const clear = (x, z) => Math.abs(x - CX) < 16 && z > FACE - 16 && z < FACE + 14;
  for (let i = 0; i < 900 && trees.length < 46; i++) {
    const x = Math.floor(rng() * 92) - 46, z = Math.floor(rng() * 92) - 46;
    const h = H(x, z), top = tops.get(`${x},${z}`);
    if (!(top === "grass" || top === "podzol") || h <= SEA + 1 || h > 34 || clear(x, z)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 4)) continue;
    trees.push({ x, z });
    spruceTree(terrain, x, h, z, rng);
  }
  const plants = ["short_grass", "short_grass", "fern", "fern", "dandelion", "poppy", "cornflower"];
  const taken = new Set(trees.map((t) => `${t.x},${t.z}`));
  for (let i = 0; i < 1600 && decor.length < 420; i++) {
    const x = Math.floor(rng() * 94) - 47, z = Math.floor(rng() * 94) - 47;
    const key = `${x},${z}`;
    const top = tops.get(key);
    if (!(top === "grass" || top === "podzol") || taken.has(key)) continue;
    taken.add(key);
    decor.push({ x, y: H(x, z) + 1, z, type: plants[Math.floor(rng() * plants.length)] });
  }

  // Excavation: face first, then deeper, top down within each slice
  const excavate = box(CX - 5, CX + 5, L, L + 7, FACE - 10, FACE, "stone").sort(
    (a, b) => b.z - a.z || b.y - a.y || a.x - b.x
  );

  const facade = [
    ...box(CX - 5, CX + 5, L, L, FACE - 10, FACE, "polished_deepslate", (x, y, z) => !(Math.abs(x - CX) <= 2 && z >= FACE - 7 && z <= FACE - 3)),
    ...box(CX - 5, CX + 5, L + 1, L + 7, FACE, FACE, (x, y) => {
      if (x === CX && y <= L + 2) return null; // door
      if (y === L + 7) return "deepslate_tiles";
      if (x === CX - 5 || x === CX + 5 || x === CX - 2 || x === CX + 2) return "deepslate_bricks";
      return "glass";
    }),
  ].sort((a, b) => a.y - b.y || a.x - b.x);

  const interior = [
    ...box(CX - 4, CX + 4, L + 1, L + 3, FACE - 10, FACE - 10, "bookshelf"),
    ...box(CX - 2, CX + 2, L, L, FACE - 7, FACE - 3, "spruce_planks"),
    { x: CX - 3, y: L + 7, z: FACE - 5, type: "shroomlight" },
    { x: CX + 3, y: L + 7, z: FACE - 5, type: "shroomlight" },
    { x: CX, y: L + 7, z: FACE - 8, type: "shroomlight" },
    { x: CX - 4, y: L + 1, z: FACE - 2, type: "barrel" },
    { x: CX + 4, y: L + 1, z: FACE - 2, type: "barrel" },
  ];

  const balcony = [
    ...box(CX - 4, CX + 4, L, L, FACE + 1, FACE + 5, "dark_oak_planks"),
    ...box(CX - 4, CX + 4, L + 1, L + 1, FACE + 1, FACE + 5, "iron_bars", (x, y, z) => {
      const edge = x === CX - 4 || x === CX + 4 || z === FACE + 5;
      const stairGap = x === CX + 4 && z <= FACE + 2;
      return edge && !stairGap;
    }),
  ].sort((a, b) => a.z - b.z || a.y - b.y || a.x - b.x);

  const stairs = [];
  for (let i = 0; i <= 3; i++)
    for (const z of [FACE + 1, FACE + 2]) stairs.push({ x: CX + 5 + i, y: L - i, z, type: "stone_bricks" });

  const supports = [
    ...box(CX - 4, CX - 4, LEDGE + 1, L - 1, FACE + 4, FACE + 4, "deepslate_bricks"),
    ...box(CX + 4, CX + 4, LEDGE + 1, L - 1, FACE + 4, FACE + 4, "deepslate_bricks"),
    ...box(CX - 3, CX + 3, L - 1, L - 1, FACE + 4, FACE + 4, "polished_deepslate"),
  ].sort((a, b) => a.y - b.y || a.x - b.x);

  return {
    terrain, decor, sea: SEA, seabed: 4.5,
    build: { facade: dedupe(facade), interior, balcony, stairs, supports },
    remove: { excavate },
  };
}
