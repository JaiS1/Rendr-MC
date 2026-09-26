// Shared helpers for scenario worlds: deterministic noise, heightmap-to-blocks,
// trees and plants, and ordering for build lists.

export function hash(x, z) {
  let h = (Math.imul(x, 374761393) + Math.imul(z, 668265263)) ^ 0x5bd1e995;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

export function vnoise(x, z) {
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

export const fbm = (x, z) =>
  vnoise(x / 16, z / 16) * 0.6 +
  vnoise(x / 8 + 31, z / 8 + 17) * 0.3 +
  vnoise(x / 4 + 7, z / 4 + 91) * 0.1;

export const smoothstep = (a, b, x) => {
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

// Heightmap over [-half, half). `heightAt(x, z)` gives the top block y.
export function makeHeightmap(half, heightAt) {
  const N = half * 2;
  const heights = new Int16Array(N * N);
  for (let z = -half; z < half; z++)
    for (let x = -half; x < half; x++) heights[x + half + (z + half) * N] = heightAt(x, z);
  const H = (x, z) =>
    x < -half || x >= half || z < -half || z >= half ? -1 : heights[x + half + (z + half) * N];
  return { H, half };
}

// Turn a heightmap into visible blocks. `column(x, z, h, info)` returns
// { top, fill(depth) } block types; `solid(x, z)` optionally forces a deeper fill.
export function columnsToBlocks({ H, half }, column, { floor = 3, deepFill } = {}) {
  const blocks = [];
  const tops = new Map();
  for (let z = -half; z < half; z++) {
    for (let x = -half; x < half; x++) {
      const h = H(x, z);
      const ns = [H(x + 1, z), H(x - 1, z), H(x, z + 1), H(x, z - 1)];
      const edge = ns.some((n) => n < 0);
      const minN = edge ? floor : Math.min(...ns);
      const maxDiff = Math.max(...ns.map((n) => h - n));
      const { top, fill } = column(x, z, h, { maxDiff });
      tops.set(`${x},${z}`, top);
      let bottom = Math.max(0, Math.min(h - 1, minN));
      if (deepFill) bottom = Math.min(bottom, deepFill(x, z) ?? bottom);
      for (let y = h; y >= bottom; y--) blocks.push({ x, y, z, type: y === h ? top : fill(h - y, y, x, z) });
    }
  }
  return { blocks, tops };
}

export function oakTree(out, x, h, z, rng, leaves = "oak_leaves", log = "oak_log") {
  const trunk = 4 + Math.floor(rng() * 2);
  for (let y = 1; y <= trunk; y++) out.push({ x, y: h + y, z, type: log });
  const topY = h + trunk;
  for (let y = topY - 2; y <= topY + 1; y++) {
    const r = y >= topY ? 1 : 2;
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        if (dx === 0 && dz === 0 && y <= topY) continue;
        if (Math.abs(dx) === r && Math.abs(dz) === r && (r === 1 || rng() < 0.6)) continue;
        out.push({ x: x + dx, y, z: z + dz, type: leaves });
      }
  }
}

export function spruceTree(out, x, h, z, rng) {
  const trunk = 7 + Math.floor(rng() * 4);
  for (let y = 1; y <= trunk; y++) out.push({ x, y: h + y, z, type: "spruce_log" });
  const top = h + trunk;
  out.push({ x, y: top + 1, z, type: "spruce_leaves" });
  for (let y = top; y >= h + 3; y--) {
    const i = top - y;
    const r = i === 0 ? 1 : i % 2 === 1 ? Math.min(3, 1 + Math.floor(i / 2)) : Math.max(1, Math.floor(i / 2));
    for (let dx = -r; dx <= r; dx++)
      for (let dz = -r; dz <= r; dz++) {
        if (dx === 0 && dz === 0) continue;
        if (Math.abs(dx) + Math.abs(dz) > r + (r > 1 ? 1 : 0)) continue;
        out.push({ x: x + dx, y, z: z + dz, type: "spruce_leaves" });
      }
  }
}

export function dedupe(list) {
  const m = new Map();
  for (const b of list) m.set(`${b.x},${b.y},${b.z}`, b);
  return [...m.values()];
}

// Bottom-up, then sweeping around a centre: reads as someone building it.
export const orderAround = (list, cx, cz) =>
  dedupe(list).sort(
    (a, b) => a.y - b.y || Math.atan2(a.z - cz, a.x - cx) - Math.atan2(b.z - cz, b.x - cx)
  );

export function box(x0, x1, y0, y1, z0, z1, type, pred) {
  const out = [];
  for (let y = y0; y <= y1; y++)
    for (let z = z0; z <= z1; z++)
      for (let x = x0; x <= x1; x++) {
        const t = typeof type === "function" ? type(x, y, z) : type;
        if (t && (!pred || pred(x, y, z))) out.push({ x, y, z, type: t });
      }
  return out;
}
