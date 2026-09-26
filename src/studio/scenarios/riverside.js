// "Riverside": open a world file, watch it stream in, let Rendr find the
// player's base, then extend it in the base's own palette.
import { buildWorld, P, PATH_X, WALL } from "./riverside-world.js";
import { makeSelection } from "../ui.js";
import { range, smooth, easeInOut, lerp } from "../script.js";

const START = 18.9;
const DONE = 37.2;
const PROMPT = "Extend my base: add a stone watchtower by the river and wall in the farm.";
const IMPORT = { drop: 2.0, start: 2.3, chunks: [2.7, 7.4], end: 8.4 };

const phases = [
  { key: "wall", t0: 24.0, t1: 26.6 },
  { key: "towerBase", t0: 26.9, t1: 28.2 },
  { key: "towerTop", t0: 28.4, t1: 30.2 },
  { key: "towerRoof", t0: 30.4, t1: 31.4 },
  { key: "gate", t0: 34.4, t1: 34.9, remove: true },
  { key: "gatePosts", t0: 35.1, t1: 35.6 },
];
const phase = Object.fromEntries(phases.map((p) => [p.key, p]));

// Chunks stream in nearest-first from the spawn chunk.
const CHUNKS = [];
for (let cx = -3; cx < 3; cx++) for (let cz = -3; cz < 3; cz++) CHUNKS.push([cx, cz]);
CHUNKS.sort((a, b) => Math.hypot(a[0] + 0.5, a[1] + 0.5) - Math.hypot(b[0] + 0.5, b[1] + 0.5) || a[0] - b[0] || a[1] - b[1]);
const chunkRank = new Map(CHUNKS.map(([x, z], i) => [`${x},${z}`, i]));
const chunkTime = (x, z) => {
  const i = chunkRank.get(`${Math.floor(x / 16)},${Math.floor(z / 16)}`) ?? 35;
  return IMPORT.chunks[0] + 0.2 + (i / CHUNKS.length) * (IMPORT.chunks[1] - IMPORT.chunks[0] - 0.5);
};

const BASE_BOX = { min: [-20, P, -14], max: [0, P + 10, 9] };
const selection = makeSelection({
  A: [-22, P + 1, 9],
  B: [9, P + 1, -15],
  H: 22,
  drag: [13.2, 14.2],
  extrude: [14.3, 14.8],
  dim: [22.0, 22.6],
  fade: [[23.6, 24.4, 1, 0.3], [36.4, 37.2, 0.3, 0]],
});

let world;

export default {
  title: "Rendr · Riverside",
  worldName: "Riverside",
  worldTag: "Java 1.21",
  titleblock: { project: "Base extension", site: "Riverside farm", scale: "1 block = 1 m" },
  duration: 43,
  cards: { title: null, end: null, fadeIn: 0.4 },
  world: () => (world = buildWorld()),
  phases,
  reveal: (b) => chunkTime(b.x, b.z),
  ghost: (b) =>
    b.key === "gatePosts" || b.key === "gate"
      ? phase[b.key].t0 - 0.7 + (b.idx / b.n) * 0.3
      : 22.6 + ((b.y - P) / 20) * 1.2 + ((b.x + b.z) & 3) * 0.03,
  env: { waterFrom: IMPORT.chunks[0], shadow: { center: [-4, 12, -2], extent: 66 }, cloudHeight: 200 },
  chromeOpacity: (t) => range(t, IMPORT.end - 0.2, IMPORT.end + 0.4),
  camera: [
    { t: 0, th: -0.7, el: 62, d: 175, tg: [-4, 10, -2] },
    { t: 2.3, th: -0.62, el: 61, d: 170, tg: [-4, 10, -2] },
    { t: 8.4, th: -0.3, el: 55, d: 150, tg: [-5, 11, -3] },
    { t: 10.8, th: -0.12, el: 40, d: 96, tg: [-9, 14, -4] },
    { t: 12.8, th: -0.05, el: 36, d: 86, tg: [-7, 14, -3] },
    { t: 18.5, th: 0.1, el: 33, d: 88, tg: [-6, 15, -4] },
    { t: 24, th: 0.24, el: 30, d: 90, tg: [-4, 17, -4] },
    { t: 31, th: 0.5, el: 27, d: 88, tg: [-3, 18, -3] },
    { t: 37, th: 0.72, el: 25, d: 86, tg: [-3, 17, -3] },
    { t: 43.5, th: 1.0, el: 23, d: 88, tg: [-3, 17, -3] },
  ],
  highlight: (t) => {
    const a = range(t, 9.6, 10.0) * (1 - range(t, 12.9, 13.3));
    return a > 0 ? { ...BASE_BOX, alpha: a } : null;
  },
  selection,
  aiToolAt: 12.6,
  placedFrom: 24.0,
  command: {
    prompt: PROMPT, placeholder: "Describe what to build here…",
    open: 12.65, focus: 15.45, typing: [15.6, 18.0], send: 18.5, footerAt: 14.8,
    ctx: "Selection 31 × 24 × 22", footer: "Includes existing build · 1 structure",
  },
  clicks: [0.5, 12.5, 13.2, 15.4, 18.5],
  cursorOpacity: (t) => range(t, 0.3, 0.5) * (1 - range(t, 2.2, 2.4)) + range(t, 11.8, 12.1) * (1 - range(t, 18.8, 19.2)),
  cursor: (t, { center, inputPos, project, sel }) => {
    const drag = () => project(sel.dragPoint(t));
    const file = () => [innerWidth * 0.5 + 20, innerHeight * 0.5 + 10];
    return [
      { t: 0.3, at: () => [innerWidth * 0.2, innerHeight * 0.86] },
      { t: 0.55, at: () => [innerWidth * 0.2, innerHeight * 0.86] },
      { t: 1.9, at: file },
      { t: 11.8, at: file },
      { t: 11.81, at: () => [innerWidth * 0.36, innerHeight * 0.64] },
      { t: 12.0, at: () => [innerWidth * 0.36, innerHeight * 0.64] },
      { t: 12.45, at: () => center("aiTool") },
      { t: 12.7, at: () => center("aiTool") },
      { t: 13.15, at: () => project(sel.A) },
      { t: 13.2, at: drag },
      { t: 14.2, at: drag },
      { t: 14.6, at: drag },
      { t: 15.35, at: inputPos },
      { t: 18.05, at: inputPos },
      { t: 18.45, at: () => center("sendBtn") },
      { t: 20, at: () => center("sendBtn") },
    ];
  },
  agent: {
    start: START,
    done: DONE,
    panelIn: [18.6, 19.4],
    statuses: [
      [DONE, "Complete"], [35.9, "Reviewing"], [34.2, "Revising"], [31.7, "Reviewing"],
      [24.0, "Building"], [22.4, "Planning"], [START, "Reading base"], [0, "Idle"],
    ],
  },
  hotbar: {
    slots: ["cobblestone", "mossy_cobblestone", "oak_log", "oak_planks", "spruce_planks"],
    slotOf: {},
    show: [23.8, 36.2],
  },
  coords: (t) => (t < 13 ? "−14, 13, −8" : "−6, 13, −4"),

  feed({ brief, survey, thought, plan, review, summary, counts, fmt }) {
    brief(START + 0.3, PROMPT);
    survey(START + 0.6, 20.4, {
      label: "Existing build", live: "Reading existing build…",
      figs: [
        { swatches: ["oak_planks", "cobblestone", "spruce_planks", "oak_log"], cap: "Palette in use" },
        { value: fmt(world.baseCount), cap: "Player blocks" },
        { value: "Rustic", cap: "One storey, gable roof" },
      ],
    });
    thought(20.7, 22.2,
      "Reuse the base’s cobblestone, oak and spruce so the additions read as one build. The tower goes on the river bend, where it overlooks the dock. The wall follows the fields with a block of margin.");
    plan(22.4, [
      { title: "Farm wall", op: "<em>trace_perimeter</em> · fields + 1, posts every 4", mats: ["cobblestone", "mossy_cobblestone", "oak_log"], keys: ["wall"] },
      { title: "Watchtower base", op: "<em>fill_box</em> · 5 × 5 × 5, hollow, door west", mats: ["cobblestone", "mossy_cobblestone"], keys: ["towerBase"] },
      { title: "Frame and lookout", op: "<em>place_structure</em> · oak posts, 7 × 7 spruce deck", mats: ["oak_log", "spruce_planks", "oak_planks"], keys: ["towerTop"] },
      { title: "Roof", op: "<em>place_structure</em> · hipped, spruce, matches the house", mats: ["spruce_planks"], keys: ["towerRoof"] },
      { title: "Self-review", op: "<em>render_views</em> · overhead, river, house", count: "3 views", active: 31.7, done: 36.9 },
      { rev: 1, appear: 34.2, title: "Open gates on the dock path", op: "<em>remove_blocks</em> · 4 wall blocks, then gate posts", mats: ["oak_log"], keys: ["gate", "gatePosts"], active: 34.3 },
    ]);

    const crossing = [PATH_X + 0.5, P + 2, WALL.z1 + 0.5];
    const V = {
      top: { label: "Overhead", position: [-5, 58, 16], target: [-5, P, -5], fov: 38 },
      river: { label: "From the river", position: [20, 30, 30], target: [-2, P + 5, -2], fov: 34 },
      house: { label: "From the house", position: [-30, 22, -24], target: [-4, P + 4, -3], fov: 34 },
    };
    review(31.7, "Review · pass 1", 34.2, "", [
      { ...V.top, t: 32.0, cls: "wide", w: 824, h: 434, marks: [{ p: crossing, t: 33.6, rev: 1, scale: 0.8 }] },
      { ...V.river, t: 32.3, w: 404, h: 252 },
      { ...V.house, t: 32.6, w: 404, h: 252 },
    ], [
      { t: 33.0, good: true, text: "The wall and tower reuse the base’s cobblestone, oak and spruce, so they read as one build." },
      { t: 33.6, rev: 1, text: "The new wall cuts the path from the house to the dock in two places." },
    ]);
    review(35.9, "Review · pass 2", 36.8, "compact", [
      { ...V.top, t: 36.0, w: 270, h: 208, marks: [{ p: crossing, t: 36.5, good: true, scale: 0.7 }] },
      { ...V.river, t: 36.15, w: 270, h: 208 },
      { ...V.house, t: 36.3, w: 270, h: 208 },
    ], [
      { t: 36.7, good: true, text: "Gates open at both crossings. The dock is reachable again." },
    ]);

    const placed = ["wall", "towerBase", "towerTop", "towerRoof", "gatePosts"].reduce((a, k) => a + counts[k], 0);
    summary(DONE, [
      { value: fmt(placed), cap: "placed" },
      { value: `−${counts.gate}`, cap: "removed" },
      { value: "6", cap: "operations" },
      { value: (DONE - START).toFixed(1), unit: "s", cap: "elapsed" },
    ], ["Keep changes", "Undo", "Diff view"]);
  },

  // ------------------------------------------------ import and detection UI
  setup({ el }) {
    const root = el("div", "importer", `
      <div class="imp-backdrop"></div>
      <div class="imp-card">
        <div class="imp-brand">
          <svg class="mark" viewBox="0 0 24 24"><path d="M12 2.5 20.5 7.25v9.5L12 21.5l-8.5-4.75v-9.5z" /><path d="M3.5 7.25 12 12l8.5-4.75M12 12v9.5" /></svg>
          <span class="wordmark">rendr</span>
        </div>
        <div class="imp-drop">
          <svg viewBox="0 0 24 24" class="imp-icon"><path d="M12 3.5 19.5 7.7v8.6L12 20.5l-7.5-4.2V7.7z M4.5 7.7 12 12l7.5-4.3M12 12v8.5" /></svg>
          <div class="imp-title">Drop a Minecraft world to open it</div>
          <div class="imp-sub">Java Edition save folder or .zip. It stays on your machine.</div>
          <span class="imp-btn">Choose folder</span>
        </div>
        <div class="imp-progress">
          <div class="imp-head">
            <div><div class="imp-title">Opening Riverside</div><div class="imp-sub">Java 1.21.1 · 4 region files · 48.2 MB</div></div>
            <div class="imp-pct">0%</div>
          </div>
          <div class="imp-body">
            <canvas class="imp-map" width="288" height="288"></canvas>
            <ol class="imp-steps">
              <li data-a="2.3" data-d="2.7"><i></i><div><b>Read level.dat</b><span>Seed 4815162342 · spawn −14, 64, −8</span></div></li>
              <li data-a="2.6" data-d="6.9"><i></i><div><b>Decode regions</b><span class="imp-region">r.-1.-1.mca</span></div><em class="imp-rc">0 / 4</em></li>
              <li data-a="2.8" data-d="7.3"><i></i><div><b>Mesh chunks</b><span>4 web workers</span><div class="imp-workers"><s></s><s></s><s></s><s></s></div></div></li>
              <li data-a="7.3" data-d="7.8"><i></i><div><b>Upload to GPU</b><span>36 visible chunks</span></div></li>
            </ol>
          </div>
          <div class="imp-stats">
            <div><b class="imp-chunks">0</b><span>chunks</span></div>
            <div><b class="imp-blocks">0</b><span>blocks</span></div>
            <div><b class="imp-time">0.0 s</b><span>elapsed</span></div>
          </div>
        </div>
      </div>
      <div class="imp-file"><svg viewBox="0 0 24 24"><path d="M6 3h8l4 4v14H6z M14 3v4h4 M10 9h2 M10 12h2 M10 15h2" /></svg><div><b>Riverside.zip</b><span>48.2 MB</span></div></div>
      <div class="imp-toast"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Riverside opened · 1,024 chunks in 4.4 s</div>
      <div class="detect-label"><b>Existing build found</b><span></span></div>`);
    document.body.appendChild(root);
    this._ui = {
      root,
      backdrop: root.querySelector(".imp-backdrop"),
      card: root.querySelector(".imp-card"),
      drop: root.querySelector(".imp-drop"),
      progress: root.querySelector(".imp-progress"),
      map: root.querySelector(".imp-map"),
      steps: [...root.querySelectorAll(".imp-steps li")],
      region: root.querySelector(".imp-region"),
      rc: root.querySelector(".imp-rc"),
      workers: [...root.querySelectorAll(".imp-workers s")],
      pct: root.querySelector(".imp-pct"),
      chunks: root.querySelector(".imp-chunks"),
      blocks: root.querySelector(".imp-blocks"),
      time: root.querySelector(".imp-time"),
      file: root.querySelector(".imp-file"),
      toast: root.querySelector(".imp-toast"),
      detect: root.querySelector(".detect-label"),
    };
    this._ui.detect.querySelector("span").textContent = `${world.baseCount.toLocaleString("en-US")} blocks · house, two fields, dock`;
    // Map cells in spiral order from the centre of a 32 × 32 region grid.
    const cells = [];
    for (let x = 0; x < 32; x++) for (let z = 0; z < 32; z++) cells.push([x, z]);
    cells.sort((a, b) => Math.hypot(a[0] - 15.5, a[1] - 15.5) - Math.hypot(b[0] - 15.5, b[1] - 15.5) || Math.atan2(a[1] - 15.5, a[0] - 15.5) - Math.atan2(b[1] - 15.5, b[0] - 15.5));
    this._cells = cells;
  },

  overlay(t, { scene }) {
    const u = this._ui;
    // Backdrop: opaque while empty, then thins so chunks show streaming behind.
    u.backdrop.style.opacity = t < IMPORT.start ? 0.97 : lerp(0.97, 0.4, smooth(range(t, IMPORT.start, 3.0))) * (1 - smooth(range(t, IMPORT.end - 0.4, IMPORT.end + 0.2)));
    // Card: centered drop zone, then slides left as the import runs.
    const slide = easeInOut(range(t, IMPORT.start, IMPORT.start + 0.6));
    const out = smooth(range(t, IMPORT.end, IMPORT.end + 0.5));
    u.card.style.left = `${lerp(innerWidth / 2, 40 + 290, slide)}px`;
    u.card.style.opacity = 1 - out;
    u.card.style.transform = `translate(-50%, -50%) scale(${1 - out * 0.04})`;
    u.drop.style.display = t < IMPORT.start + 0.25 ? "" : "none";
    u.progress.style.display = t < IMPORT.start + 0.25 ? "none" : "";
    u.drop.style.opacity = 1 - range(t, IMPORT.start, IMPORT.start + 0.25);
    u.progress.style.opacity = range(t, IMPORT.start + 0.25, IMPORT.start + 0.5);
    u.drop.classList.toggle("hover", t > 1.45 && t < IMPORT.start);
    u.root.style.display = t > IMPORT.end + 0.6 && t > 13.5 ? "none" : "";

    // Dragged file follows the cursor, then drops into the zone.
    const fileIn = range(t, 0.55, 0.7), fileDrop = range(t, IMPORT.drop, IMPORT.drop + 0.25);
    const cur = document.getElementById("cursor").style.transform.match(/-?[\d.]+/g) || [0, 0];
    u.file.style.opacity = fileIn * (1 - fileDrop);
    u.file.style.transform = `translate(${Number(cur[0]) + 22}px, ${Number(cur[1]) + 18}px) scale(${1 - fileDrop * 0.4})`;

    // Import progress
    const k = easeInOut(range(t, ...IMPORT.chunks));
    const n = Math.round(1024 * k);
    u.pct.textContent = `${Math.round(k * 100)}%`;
    u.chunks.textContent = n.toLocaleString("en-US");
    u.blocks.textContent = k >= 1 ? "4.19M" : `${(4.19 * k).toFixed(2)}M`;
    u.time.textContent = `${(Math.max(0, Math.min(t, 6.7) - IMPORT.start)).toFixed(1)} s`;
    const regions = ["r.-1.-1.mca", "r.0.-1.mca", "r.-1.0.mca", "r.0.0.mca"];
    const rk = Math.min(4, Math.floor(range(t, 2.6, 6.9) * 4 + (t >= 6.9 ? 1 : 0)));
    u.region.textContent = regions[Math.min(3, rk)];
    u.rc.textContent = `${rk} / 4`;
    u.workers.forEach((w, i) => {
      const p = range(t, 2.8 + i * 0.06, 7.3 - (3 - i) * 0.05);
      w.style.width = `${(100 * Math.min(1, p + Math.sin(t * 9 + i * 2) * 0.03 * (p < 1 ? 1 : 0))).toFixed(1)}%`;
    });
    for (const li of u.steps) {
      const a = Number(li.dataset.a), d = Number(li.dataset.d);
      li.className = t >= d ? "done" : t >= a ? "active" : "";
    }
    if (this._drawnN !== n) {
      const ctx = u.map.getContext("2d");
      ctx.clearRect(0, 0, 288, 288);
      this._cells.forEach(([x, z], i) => {
        ctx.fillStyle = i < n - 40 ? "rgba(140,184,240,0.85)" : i < n ? "#f4b64a" : "rgba(140,184,240,0.1)";
        ctx.fillRect(x * 9, z * 9, 8, 8);
      });
      this._drawnN = n;
    }

    // Toast
    u.toast.style.opacity = range(t, IMPORT.end + 0.3, IMPORT.end + 0.6) * (1 - range(t, 11.6, 12.0));
    u.toast.style.transform = `translate(-50%, ${(1 - range(t, IMPORT.end + 0.3, IMPORT.end + 0.6)) * -10}px)`;

    // Detected-structure label pinned above the highlight box
    const a = range(t, 9.8, 10.2) * (1 - range(t, 12.9, 13.3));
    u.detect.style.opacity = a;
    if (a > 0) {
      const [x, y] = scene.project([(BASE_BOX.min[0] + BASE_BOX.max[0]) / 2, BASE_BOX.max[1], BASE_BOX.min[2]]);
      u.detect.style.left = `${x}px`;
      u.detect.style.top = `${y}px`;
    }
  },
};
