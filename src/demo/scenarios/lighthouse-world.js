// Deterministic demo world: an island with a sea cliff, plus the scripted
// lighthouse build the "architect" places on top of it.

export const WORLD_HALF = 48;
export const SEA = 8; // water surface sits just below y = SEA + 1
export const C = { x: 12, z: -8 }; // lighthouse centre (cliff plateau)
export const G = 19; // plateau top block y
const ISLAND = { x: -6, z: 4 };
const PLATEAU_R = 14.5;

function hash(x, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263)) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(x, z) {
  const xi = Math.floor(x);
  const zi = Math.floor(z);
  const xf = x - xi;
  const zf = z - zi;
  const u = xf * xf * (3 - 2 * xf);
  const v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi);
  const b = hash(xi + 1, zi);
  const c = hash(xi, zi + 1);
  const d = hash(xi + 1, zi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const fbm = (x, z) =>
  vnoise(x / 16, z / 16) * 0.6 +
  vnoise(x / 8 + 31, z / 8 + 17) * 0.3 +
  vnoise(x / 4 + 7, z / 4 + 91) * 0.1;

const smoothstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function mulberry32(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function distToCliff(x, z) {
  return Math.hypot(x - C.x, z - C.z);
}

function heightAt(x, z) {
  const warp = 0.8 + fbm(x * 0.7 + 40, z * 0.7 - 13) * 0.4;
  const r = (Math.hypot(x - ISLAND.x, z - ISLAND.z) / 31) * warp;
  let h = 4 + 9 * (1 - r * r) + (fbm(x, z) - 0.5) * 16;
  if (r > 1.05) h = Math.min(h, SEA - 2 - (r - 1.05) * 8);
  const dC = distToCliff(x, z) + (vnoise(x / 3, z / 3) - 0.5) * 2.5;
  const outer = 26 - 9 * smoothstep(-4, 6, x - C.x);
  if (dC < PLATEAU_R) h = G;
  else if (dC < outer) {
    const k = smoothstep(PLATEAU_R, outer, dC);
    h = Math.max(h, G * (1 - k) + h * k);
  }
  return Math.max(0, Math.round(h));
}

export function buildWorld() {
  const N = WORLD_HALF * 2;
  const heights = new Int16Array(N * N);
  const H = (x, z) => {
    if (x < -WORLD_HALF || x >= WORLD_HALF || z < -WORLD_HALF || z >= WORLD_HALF)
      return -1;
    return heights[(x + WORLD_HALF) + (z + WORLD_HALF) * N];
  };
  for (let z = -WORLD_HALF; z < WORLD_HALF; z++)
    for (let x = -WORLD_HALF; x < WORLD_HALF; x++)
      heights[(x + WORLD_HALF) + (z + WORLD_HALF) * N] = heightAt(x, z);

  const terrain = []; // {x,y,z,type}
  const tops = new Map(); // "x,z" -> top type
  for (let z = -WORLD_HALF; z < WORLD_HALF; z++) {
    for (let x = -WORLD_HALF; x < WORLD_HALF; x++) {
      const h = H(x, z);
      const ns = [H(x + 1, z), H(x - 1, z), H(x, z + 1), H(x, z - 1)];
      const edge = ns.some((n) => n < 0);
      const minN = edge ? Math.max(0, SEA - 5) : Math.min(...ns);
      const maxDiff = Math.max(...ns.map((n) => h - n));
      let top;
      if (h <= SEA) top = "sand";
      else if (maxDiff >= 3 && distToCliff(x, z) > PLATEAU_R - 0.5) top = "stone";
      else top = "grass";
      tops.set(`${x},${z}`, top);
      const bottom = Math.max(0, Math.min(h - 1, minN));
      for (let y = h; y >= bottom; y--) {
        let type;
        if (y === h) type = top;
        else if (top === "grass" && y >= h - 3) type = "dirt";
        else if (top === "sand") type = "sand";
        else type = "stone";
        terrain.push({ x, y, z, type });
      }
    }
  }

  const build = buildStructures(H);
  const pathCells = new Set(build.path.map((b) => `${b.x},${b.z}`));

  // Trees and plants, kept clear of the build site and the path.
  const rng = mulberry32(1337);
  const trees = [];
  const decor = [];
  const taken = new Set();
  const nearPath = (x, z) => {
    for (let dx = -2; dx <= 2; dx++)
      for (let dz = -2; dz <= 2; dz++) if (pathCells.has(`${x + dx},${z + dz}`)) return true;
    return false;
  };
  for (let i = 0; i < 400 && trees.length < 22; i++) {
    const x = Math.floor(rng() * 70) - 38;
    const z = Math.floor(rng() * 70) - 34;
    const h = H(x, z);
    if (tops.get(`${x},${z}`) !== "grass" || h < SEA + 2) continue;
    if (distToCliff(x, z) < PLATEAU_R + 3 || nearPath(x, z)) continue;
    if (trees.some((t) => Math.hypot(t.x - x, t.z - z) < 5)) continue;
    trees.push({ x, z });
    const trunk = 4 + Math.floor(rng() * 2);
    for (let y = 1; y <= trunk; y++) terrain.push({ x, y: h + y, z, type: "oak_log" });
    const topY = h + trunk;
    for (let y = topY - 2; y <= topY + 1; y++) {
      const r = y >= topY ? 1 : 2;
      for (let dx = -r; dx <= r; dx++)
        for (let dz = -r; dz <= r; dz++) {
          if (dx === 0 && dz === 0 && y <= topY) continue;
          if (Math.abs(dx) === r && Math.abs(dz) === r && (r === 1 || rng() < 0.6)) continue;
          terrain.push({ x: x + dx, y, z: z + dz, type: "oak_leaves" });
        }
    }
    for (let dx = -2; dx <= 2; dx++) for (let dz = -2; dz <= 2; dz++) taken.add(`${x + dx},${z + dz}`);
  }
  const plants = ["short_grass", "short_grass", "short_grass", "short_grass", "poppy", "dandelion", "oxeye_daisy", "cornflower", "allium"];
  for (let i = 0; i < 1400 && decor.length < 420; i++) {
    const x = Math.floor(rng() * 80) - 42;
    const z = Math.floor(rng() * 80) - 38;
    const key = `${x},${z}`;
    if (tops.get(key) !== "grass" || taken.has(key) || pathCells.has(key)) continue;
    if (distToCliff(x, z) < PLATEAU_R + 0.5 && !(distToCliff(x, z) > 11 && x > C.x - 2)) continue;
    taken.add(key);
    decor.push({ x, y: H(x, z) + 1, z, type: plants[Math.floor(rng() * plants.length)] });
  }

  return { terrain, decor, build, sea: SEA };
}

function buildStructures(H) {
  const at = (dx, y, dz, type) => ({ x: C.x + dx, y, z: C.z + dz, type });
  const disc = (y, r, type, rInner = -1) => {
    const out = [];
    const R = Math.ceil(r);
    for (let dx = -R; dx <= R; dx++)
      for (let dz = -R; dz <= R; dz++) {
        const d = Math.hypot(dx, dz);
        if (d <= r && d > rInner) out.push(at(dx, y, dz, type));
      }
    return out;
  };

  const foundation = [...disc(G + 1, 4.6, "stone_bricks"), ...disc(G + 2, 3.6, "polished_andesite")];

  const tower = [];
  for (let y = G + 3; y <= G + 20; y++) {
    const i = y - (G + 3);
    const rMax = 2.9 - i * 0.035;
    const band = Math.floor(i / 3) % 2 === 0 ? "white_concrete" : "red_concrete";
    for (const b of disc(y, rMax, band, rMax - 1.15)) {
      const dx = b.x - C.x;
      const dz = b.z - C.z;
      const window =
        ((i === 4 || i === 10 || i === 16) && dx === 0 && dz > 0) ||
        ((i === 7 || i === 13) && dz === 0 && dx < 0);
      tower.push(window ? { ...b, type: "glass" } : b);
    }
  }

  const gy = G + 21;
  const lantern = [
    ...disc(gy, 3.7, "smooth_stone"),
    ...disc(gy + 1, 3.7, "iron_bars", 2.9),
    ...disc(gy + 1, 2.25, "glass", 1.1),
    ...disc(gy + 2, 2.25, "glass", 1.1),
    ...disc(gy + 3, 2.25, "glass", 1.1),
  ];
  const roof = [
    ...disc(gy + 4, 2.7, "dark_oak_planks"),
    ...disc(gy + 5, 1.6, "dark_oak_planks"),
    at(0, gy + 6, 0, "dark_oak_planks"),
    at(0, gy + 7, 0, "glowstone"),
  ];

  // Keeper's cottage, west of the tower.
  const cottage = [];
  const x0 = -12, x1 = -7, z0 = -1, z1 = 4, fy = G + 1;
  for (let dx = x0; dx <= x1; dx++)
    for (let dz = z0; dz <= z1; dz++) cottage.push(at(dx, fy, dz, "spruce_planks"));
  for (let y = fy + 1; y <= fy + 3; y++)
    for (let dx = x0; dx <= x1; dx++)
      for (let dz = z0; dz <= z1; dz++) {
        const onX = dx === x0 || dx === x1;
        const onZ = dz === z0 || dz === z1;
        if (!onX && !onZ) continue;
        if (dx === x0 && dz === 2 && y <= fy + 2) continue; // door
        let type = onX && onZ ? "spruce_log" : "spruce_planks";
        if (y === fy + 2 && !(onX && onZ)) {
          if (onZ && (dx === -10 || dx === -9)) type = "glass";
          if (dx === x1 && (dz === 1 || dz === 2)) type = "glass";
        }
        cottage.push(at(dx, y, dz, type));
      }
  for (let k = 0; k <= 3; k++) {
    const y = fy + 4 + k;
    const a = x0 - 1 + k;
    const b = x1 + 1 - k;
    for (let dz = z0 - 1; dz <= z1 + 1; dz++) {
      cottage.push(at(a, y, dz, "dark_oak_planks"));
      cottage.push(at(b, y, dz, "dark_oak_planks"));
    }
    for (let dx = a + 1; dx < b; dx++) {
      cottage.push(at(dx, y, z0, "spruce_planks"));
      cottage.push(at(dx, y, z1, "spruce_planks"));
    }
  }
  for (let y = fy + 4; y <= fy + 8; y++) cottage.push(at(-8, y, 3, "cobblestone"));

  // Fix pass 1: light the lantern room.
  const lanternCore = [
    at(0, gy + 1, 0, "glowstone"),
    ...disc(gy + 2, 1.05, "sea_lantern"),
    at(0, gy + 3, 0, "glowstone"),
  ];

  // Fix pass 2: path from the cottage door down to the island trail.
  const path = [];
  const seen = new Set();
  let px = C.x + x0 - 1;
  let pz = C.z + 2;
  for (let i = 0; i < 22; i++) {
    const cx = Math.round(px);
    const cz = Math.round(pz);
    for (const [ox, oz] of [[0, 0], [0, 1]]) {
      const key = `${cx + ox},${cz + oz}`;
      if (seen.has(key)) continue;
      seen.add(key);
      path.push({ x: cx + ox, y: H(cx + ox, cz + oz), z: cz + oz, type: "path" });
    }
    px -= 0.85;
    pz += 0.45 + Math.sin(i * 0.5) * 0.35;
  }

  const dedupe = (list) => {
    const m = new Map();
    for (const b of list) m.set(`${b.x},${b.y},${b.z}`, b);
    return [...m.values()];
  };
  const order = (list) =>
    dedupe(list).sort(
      (a, b) =>
        a.y - b.y ||
        Math.atan2(a.z - C.z, a.x - C.x) - Math.atan2(b.z - C.z, b.x - C.x)
    );

  return {
    foundation: order(foundation),
    tower: order(tower),
    lantern: order(lantern),
    roof: order(roof),
    cottage: order(cottage),
    lanternCore: order(lanternCore),
    path, // already in walking order
  };
}
