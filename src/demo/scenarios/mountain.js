// "Mountain": carve a hideout into a cliff face. Shows excavation (blocks
// removed), a glazed facade, a cantilevered balcony, and a structural fix
// found in review. Ends at dusk with the rooms lit from inside.
import { buildWorld, CX, FACE, L } from "./mountain-world.js";
import { makeSelection } from "../ui.js";
import { range } from "../script.js";

const START = 8.1;
const DONE = 28.8;
const PROMPT = "Carve a hideout into this cliff face, with a balcony looking out over the valley.";

const phases = [
  { key: "excavate", t0: 13.2, t1: 16.2, remove: true },
  { key: "facade", t0: 16.5, t1: 19.0 },
  { key: "interior", t0: 19.2, t1: 20.4 },
  { key: "balcony", t0: 20.6, t1: 22.0 },
  { key: "stairs", t0: 22.2, t1: 23.2 },
  { key: "supports", t0: 26.2, t1: 27.2 },
];
const phase = Object.fromEntries(phases.map((p) => [p.key, p]));

const selection = makeSelection({
  A: [CX - 7, L, FACE + 6],
  B: [CX + 8, L, FACE - 12],
  H: 10,
  drag: [2.2, 3.2],
  extrude: [3.3, 3.8],
  dim: [11.0, 11.6],
  fade: [[12.6, 13.4, 1, 0.3], [28.2, 29.0, 0.3, 0]],
});

export default {
  title: "Rendr · Mountain",
  worldName: "Highlands",
  worldTag: "Java 1.21",
  titleblock: { project: "Cliff hideout", site: "South face", scale: "1 block = 1 m" },
  duration: 40,
  cards: { title: null, end: null, fadeIn: 0.4 },
  world: buildWorld,
  phases,
  ghost: (b) =>
    b.key === "supports"
      ? phase.supports.t0 - 0.8 + (b.idx / b.n) * 0.4
      : 11.8 + (b.key === "excavate" ? (FACE - b.z) / 10 : 0.2 + (b.y - L) / 10) * 1.0,
  env: {
    dusk: { t0: 29.5, t1: 34.5 },
    sun: { az: 0.35, el: 0.9, duskAz: -1.2, duskEl: 0.1 },
    lights: [
      { pos: [CX + 0.5, L + 4, FACE - 4], color: 0xffb070, intensity: 40, distance: 26, after: phase.interior.t0 },
      { pos: [CX + 0.5, L + 3, FACE + 3], color: 0xffb070, intensity: 8, distance: 12, after: phase.interior.t0 },
    ],
    shadow: { center: [CX, 26, -6], extent: 60 },
    fog: [160, 420],
    cloudHeight: 92,
  },
  camera: [
    { t: 0, th: -0.9, el: 30, d: 150, tg: [2, 26, -8] },
    { t: 1.5, th: -0.62, el: 26, d: 112, tg: [5, 28, -4] },
    { t: 4, th: -0.36, el: 20, d: 92, tg: [6, 29, -3] },
    { t: 8, th: -0.26, el: 18, d: 84, tg: [6, 29, -3] },
    { t: 13, th: -0.15, el: 15, d: 70, tg: [6, 29, -4] },
    { t: 18, th: 0.0, el: 13, d: 64, tg: [6, 29, -3] },
    { t: 23, th: 0.16, el: 15, d: 68, tg: [6, 28, -2] },
    { t: 28.8, th: 0.3, el: 13, d: 70, tg: [6, 28, -2] },
    { t: 34, th: 0.52, el: 9, d: 62, tg: [6, 29, -2] },
    { t: 40.5, th: 0.82, el: 7, d: 58, tg: [6, 29, -2] },
  ],
  selection,
  aiToolAt: 1.6,
  placedFrom: 13.2,
  command: {
    prompt: PROMPT, placeholder: "Describe what to build here…",
    open: 1.65, focus: 4.45, typing: [4.6, 7.2], send: 7.7, footerAt: 3.8,
    ctx: "Selection 15 × 18 × 10", footer: "South face · solid stone",
  },
  clicks: [1.5, 2.2, 4.4, 7.7],
  cursorOpacity: (t) => range(t, 0.8, 1.1) * (1 - range(t, 8.0, 8.4)),
  cursor: (t, { center, inputPos, project, sel }) => {
    const drag = () => project(sel.dragPoint(t));
    return [
      { t: 0.8, at: () => [innerWidth * 0.36, innerHeight * 0.66] },
      { t: 1.0, at: () => [innerWidth * 0.36, innerHeight * 0.66] },
      { t: 1.45, at: () => center("aiTool") },
      { t: 1.7, at: () => center("aiTool") },
      { t: 2.15, at: () => project(sel.A) },
      { t: 2.2, at: drag },
      { t: 3.2, at: drag },
      { t: 3.6, at: drag },
      { t: 4.35, at: inputPos },
      { t: 7.25, at: inputPos },
      { t: 7.65, at: () => center("sendBtn") },
      { t: 9, at: () => center("sendBtn") },
    ];
  },
  agent: {
    start: START,
    done: DONE,
    panelIn: [7.8, 8.6],
    statuses: [
      [DONE, "Complete"], [27.5, "Reviewing"], [26.0, "Revising"], [23.5, "Reviewing"],
      [phase.facade.t0, "Building"], [phase.excavate.t0, "Excavating"], [11.6, "Planning"], [START, "Surveying"], [0, "Idle"],
    ],
  },
  hotbar: {
    slots: ["polished_deepslate", "deepslate_bricks", "deepslate_tiles", "glass", "bookshelf", "shroomlight", "dark_oak_planks", "iron_bars", "stone_bricks"],
    slotOf: { spruce_planks: "dark_oak_planks", barrel: "bookshelf" },
    show: [16.3, 27.4],
  },
  coords: (t) => (t < 2.2 ? "0, 31, −9" : "6, 26, −2"),

  feed({ brief, survey, thought, plan, review, summary, counts, fmt }) {
    brief(START + 0.3, PROMPT);
    survey(START + 0.6, 9.6, {
      label: "Site survey", live: "Surveying the face…",
      figs: [
        { swatches: ["stone", "andesite", "tuff"], cap: "Rock" },
        { value: "18", unit: "m", cap: "Face height" },
        { value: "14", unit: "m", cap: "Solid rock behind" },
      ],
    });
    thought(9.9, 11.4,
      "Solid stone behind the face, so the rooms can go straight in. A deepslate frame reads against the grey rock, a glass wall faces the valley, and the balcony steps out over the ledge.");
    plan(11.6, [
      { title: "Excavate", op: "<em>carve_box</em> · 11 × 8 × 11 into the face", mats: ["stone", "andesite", "tuff"], keys: ["excavate"], remove: true },
      { title: "Floor and facade", op: "<em>place_structure</em> · deepslate frame, glass wall, door", mats: ["polished_deepslate", "deepslate_bricks", "deepslate_tiles", "glass"], keys: ["facade"] },
      { title: "Interior", op: "<em>furnish</em> · library wall, shroomlight lamps", mats: ["bookshelf", "shroomlight", "spruce_planks"], keys: ["interior"] },
      { title: "Balcony", op: "<em>cantilever</em> · 9 × 5 deck, iron rail", mats: ["dark_oak_planks", "iron_bars"], keys: ["balcony"] },
      { title: "Stair to the ledge", op: "<em>stairs</em> · 4 steps down, stone brick", mats: ["stone_bricks"], keys: ["stairs"] },
      { title: "Self-review", op: "<em>render_views</em> · valley, east, above", count: "3 views", active: 23.5, done: 28.5 },
      { rev: 1, appear: 26.0, title: "Carry the balcony", op: "<em>place_blocks</em> · 2 deepslate columns and a beam", mats: ["deepslate_bricks", "polished_deepslate"], keys: ["supports"], active: 26.1 },
    ]);

    const underside = [CX + 0.5, L - 1.5, FACE + 3.5];
    const V = {
      valley: { label: "From the valley", position: [CX + 3, L - 6, FACE + 42], target: [CX, L + 1, FACE], fov: 30 },
      east: { label: "East", position: [CX + 34, L + 4, FACE + 16], target: [CX, L + 1, FACE], fov: 32 },
      above: { label: "Above", position: [CX - 12, L + 30, FACE + 26], target: [CX, L, FACE], fov: 34 },
    };
    review(23.5, "Review · pass 1", 26.0, "", [
      { ...V.valley, t: 23.8, cls: "wide", w: 824, h: 434, marks: [{ p: underside, t: 25.4, rev: 1, scale: 0.9 }] },
      { ...V.east, t: 24.1, w: 404, h: 252 },
      { ...V.above, t: 24.4, w: 404, h: 252 },
    ], [
      { t: 24.8, good: true, text: "The deepslate frame reads clearly against the rock, and the glass wall faces the valley." },
      { t: 25.4, rev: 1, text: "Nothing sits under the balcony. From the valley it reads as floating." },
    ]);
    review(27.5, "Review · pass 2", 28.4, "compact", [
      { ...V.valley, t: 27.6, w: 270, h: 208, marks: [{ p: underside, t: 28.1, good: true, scale: 0.8 }] },
      { ...V.east, t: 27.75, w: 270, h: 208 },
      { ...V.above, t: 27.9, w: 270, h: 208 },
    ], [
      { t: 28.3, good: true, text: "Two columns and a beam carry the balcony down to the ledge." },
    ]);

    const placed = ["facade", "interior", "balcony", "stairs", "supports"].reduce((a, k) => a + counts[k], 0);
    summary(DONE, [
      { value: fmt(counts.excavate), cap: "excavated" },
      { value: fmt(placed), cap: "placed" },
      { value: "7", cap: "operations" },
      { value: (DONE - START).toFixed(1), unit: "s", cap: "elapsed" },
    ], ["Keep changes", "Undo", "Diff view"]);
  },
};
