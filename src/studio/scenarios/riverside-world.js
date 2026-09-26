// "Riverside": a meadow on a river bend with an existing player base (house,
// two fields, a path and a dock). The architect adds a farm wall and a
// watchtower in the base's own palette, then opens gates where the wall
// crossed the path.
import {
  fbm, hash, smoothstep, mulberry32, makeHeightmap, columnsToBlocks, oakTree, dedupe, orderAround, box,
} from "../terrain.js";

export const HALF = 48;
export const SEA = 10;
export const P = 12; // base plateau top block
const lerp = (a, b, k) => a + (b - a) * k;
export const riverZ = (x) => 10 + Math.sin(x / 13) * 5;

// Existing base layout
export const HOUSE = { x0: -19, x1: -13, z0: -13, z1: -8 };
export const FIELDS = [
  { x0: -10, x1: -7, z0: -8, z1: -3, crop: "wheat_stage7" },
  { x0: -5, x1: -2, z0: -8, z1: -3, crop: "carrots_stage3" },
];
export const PATH_X = -6;
export const TOWER = { x0: 3, x1: 7, z0: -1, z1: 3 };
export const WALL = { x0: -11, x1: -1, z0: -9, z1: -2 };

function heightAt(x, z) {
  let h = 12 + (fbm(x, z) - 0.5) * 9 + Math.max(0, fbm(x * 0.5 + 50, z * 0.5) - 0.55) * 30 * smoothstep(0, -30, z);
  // Flatten the base site
  const dx = Math.max(-23 - x, 0, x - 10);
  const dz = Math.max(-17 - z, 0, z - 6);
  h = lerp(P, h, smoothstep(0, 6, Math.hypot(dx, dz)));
  // River channel and banks
  const dr = Math.abs(z - riverZ(x));
  if (dr < 3.2) h = 7;
  else if (dr < 5) h = Math.min(h, SEA);
  else if (dr < 8) h = Math.min(h, lerp(SEA, h, smoothstep(5, 8, dr)));
  return Math.round(h);
}

const inField = (x, z) => FIELDS.find((f) => x >= f.x0 && x <= f.x1 && z >= f.z0 && z <= f.z1);
const isWaterRow = (x) => x === -8 || x === -4;

export function buildWorld() {
  const hm = makeHeightmap(HALF, heightAt);
  const { H } = hm;
  const { blocks: terrain, tops } = columnsToBlocks(hm, (x, z, h, { maxDiff }) => {
    let top = h <= SEA ? "sand" : maxDiff >= 3 ? "stone" : "grass";
    if (inField(x, z)) top = isWaterRow(x) ? "water_block" : "farmland";
    return { top, fill: (d) => (top === "sand" ? "sand" : d <= 3 ? "dirt" : "stone") };
  });

  // Existing player base (part of the imported world)
  const base = [];
  const { x0, x1, z0, z1 } = HOUSE;
  base.push(...box(x0, x1, P + 1, P + 1, z0, z1, "oak_planks"));
  for (let y = P + 2; y <= P + 4; y++)
    for (let x = x0; x <= x1; x++)
      for (let z = z0; z <= z1; z++) {
        const onX = x === x0 || x === x1, onZ = z === z0 || z === z1;
        if (!onX && !onZ) continue;
        if (x === x1 && z === -10 && y <= P + 3) continue; // door, east wall
        let type = onX && onZ ? "oak_log" : y === P + 2 ? "cobblestone" : "oak_planks";
        if (y === P + 3 && !(onX && onZ) && ((onZ && (x === -17 || x === -15)) || (x === x0 && (z === -11 || z === -10)))) type = "glass";
        base.push({ x, y, z, type });
      }
  for (let k = 0; k <= 3; k++) {
    const y = P + 5 + k, a = z0 - 1 + k, b = z1 + 1 - k;
    for (let x = x0 - 1; x <= x1 + 1; x++) {
      base.push({ x, y, z: a, type: "spruce_planks" }, { x, y, z: b, type: "spruce_planks" });
    }
    for (let z = a + 1; z < b; z++) base.push({ x: x0, y, z, type: "oak_planks" }, { x: x1, y, z, type: "oak_planks" });
  }
  for (let y = P + 5; y <= P + 9; y++) base.push({ x: -18, y, z: -9, type: "cobblestone" });
  base.push(
    { x: -12, y: P + 1, z: -13, type: "hay_block" }, { x: -12, y: P + 1, z: -12, type: "hay_block" },
    { x: -12, y: P + 2, z: -13, type: "hay_block" },
    { x: -14, y: P + 1, z: -6, type: "barrel" }, { x: -13, y: P + 1, z: -6, type: "barrel" },
  );
  // Path: door east along z = -10, then south between the fields to the river
  const pathCells = [];
  for (let x = x1 + 1; x <= PATH_X; x++) pathCells.push([x, -10]);
  for (let z = -9; z <= 3; z++) pathCells.push([PATH_X, z]);
  for (const [x, z] of pathCells) if (H(x, z) > SEA) base.push({ x, y: H(x, z), z, type: "path" });
  // Dock over the river
  for (let z = 3; z <= 8; z++) for (let x = PATH_X - 1; x <= PATH_X + 1; x++) base.push({ x, y: SEA, z, type: "oak_planks" });
  for (const x of [PATH_X - 1, PATH_X + 1]) for (let y = 7; y < SEA; y++) base.push({ x, y, z: 8, type: "oak_log" });
  const baseBlocks = dedupe(base);
  terrain.push(...baseBlocks);

  // Trees and plants away from the base and river
  const rng = mulberry32(99);
  const decor = [];
  const taken = new Set(pathCells.map(([x, z]) => `${x},${z}`));
  const trees = [];
  const nearBase = (x, z) => x > -25 && x < 12 && z > -19 && z < 8;
  for (let i = 0; i < 600 && trees.length < 34; i++) {
    const x = Math.floor(rng() * 90) - 45, z = Math.floor(rng() * 90) - 45;
    const h = H(x, z);
    if (tops.get(`${x},${z}`) !== "grass" || h <= SEA + 1 || nearBase(x, z)) continue;
    if (Math.abs(z - riverZ(x)) < 7) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 5)) continue;
    trees.push({ x, z });
    oakTree(terrain, x, h, z, rng);
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) taken.add(`${x + dx},${z + dz}`);
  }
  for (const f of FIELDS)
    for (let x = f.x0; x <= f.x1; x++)
      for (let z = f.z0; z <= f.z1; z++) if (!isWaterRow(x)) decor.push({ x, y: P + 1, z, type: f.crop });
  const plants = ["short_grass", "short_grass", "short_grass", "fern", "poppy", "dandelion", "oxeye_daisy", "cornflower"];
  for (let i = 0; i < 1600 && decor.length < 520; i++) {
    const x = Math.floor(rng() * 94) - 47, z = Math.floor(rng() * 94) - 47;
    const key = `${x},${z}`;
    if (tops.get(key) !== "grass" || taken.has(key)) continue;
    if (x >= HOUSE.x0 - 1 && x <= HOUSE.x1 + 1 && z >= HOUSE.z0 - 1 && z <= HOUSE.z1 + 1) continue;
    if (x >= WALL.x0 - 1 && x <= TOWER.x1 + 1 && z >= WALL.z0 - 1 && z <= TOWER.z1 + 1) continue;
    taken.add(key);
    decor.push({ x, y: H(x, z) + 1, z, type: plants[Math.floor(rng() * plants.length)] });
  }

  // The architect's additions
  const stone = (x, y, z) => (hash(x * 7 + y, z * 13 - y) > 0.72 ? "mossy_cobblestone" : "cobblestone");
  const wall = [];
  for (let x = WALL.x0; x <= WALL.x1; x++)
    for (let z = WALL.z0; z <= WALL.z1; z++) {
      const edge = x === WALL.x0 || x === WALL.x1 || z === WALL.z0 || z === WALL.z1;
      if (!edge) continue;
      const post = (x - WALL.x0) % 4 === 0 && (z === WALL.z0 || z === WALL.z1) || (z - WALL.z0) % 4 === 0 && (x === WALL.x0 || x === WALL.x1);
      const corner = (x === WALL.x0 || x === WALL.x1) && (z === WALL.z0 || z === WALL.z1);
      for (let y = P + 1; y <= P + 2; y++) wall.push({ x, y, z, type: post || corner ? "oak_log" : stone(x, y, z) });
      if (post || corner) wall.push({ x, y: P + 3, z, type: "oak_log" });
    }

  const T = TOWER;
  const towerBase = box(T.x0, T.x1, P + 1, P + 5, T.z0, T.z1, stone, (x, y, z) => {
    const edge = x === T.x0 || x === T.x1 || z === T.z0 || z === T.z1;
    const door = x === T.x0 && z === 1 && y <= P + 2;
    return edge && !door;
  });
  const towerTop = [];
  for (const x of [T.x0, T.x1]) for (const z of [T.z0, T.z1]) for (let y = P + 6; y <= P + 12; y++) towerTop.push({ x, y, z, type: "oak_log" });
  towerTop.push(...box(T.x0 - 1, T.x1 + 1, P + 13, P + 13, T.z0 - 1, T.z1 + 1, "spruce_planks"));
  towerTop.push(...box(T.x0 - 1, T.x1 + 1, P + 14, P + 14, T.z0 - 1, T.z1 + 1, "oak_planks", (x, y, z) => {
    const edge = x === T.x0 - 1 || x === T.x1 + 1 || z === T.z0 - 1 || z === T.z1 + 1;
    return edge && (x + z) % 2 === 0;
  }));
  for (const x of [T.x0 - 1, T.x1 + 1]) for (const z of [T.z0 - 1, T.z1 + 1]) for (let y = P + 14; y <= P + 15; y++) towerTop.push({ x, y, z, type: "oak_log" });
  const towerRoof = [
    ...box(T.x0 - 2, T.x1 + 2, P + 16, P + 16, T.z0 - 2, T.z1 + 2, "spruce_planks"),
    ...box(T.x0 - 1, T.x1 + 1, P + 17, P + 17, T.z0 - 1, T.z1 + 1, "spruce_planks"),
    ...box(T.x0, T.x1, P + 18, P + 18, T.z0, T.z1, "spruce_planks"),
    ...box(T.x0 + 1, T.x1 - 1, P + 19, P + 19, T.z0 + 1, T.z1 - 1, "spruce_planks"),
    { x: 5, y: P + 20, z: 1, type: "spruce_planks" },
  ];

  // Revision: open gates where the wall crosses the path
  const gate = [];
  for (const z of [WALL.z0, WALL.z1]) for (let y = P + 1; y <= P + 2; y++) gate.push({ x: PATH_X, y, z, type: "cobblestone" });
  const wallAt = new Set(wall.map((b) => `${b.x},${b.y},${b.z}`));
  const gatePosts = [];
  for (const z of [WALL.z0, WALL.z1])
    for (const x of [PATH_X - 1, PATH_X + 1])
      for (let y = P + 3; y <= P + 4; y++) if (!wallAt.has(`${x},${y},${z}`)) gatePosts.push({ x, y, z, type: "oak_log" });

  const cx = (WALL.x0 + WALL.x1) / 2, cz = (WALL.z0 + WALL.z1) / 2;
  return {
    terrain, decor, sea: SEA, seabed: 6.5,
    baseCount: baseBlocks.length,
    build: {
      wall: orderAround(wall, cx, cz),
      towerBase: orderAround(towerBase, 5, 1),
      towerTop: orderAround(towerTop, 5, 1),
      towerRoof: orderAround(towerRoof, 5, 1),
      gatePosts,
    },
    remove: { gate },
  };
}
