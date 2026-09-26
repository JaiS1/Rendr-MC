// "Lighthouse": the flagship walkthrough. Select a sea cliff, describe a
// lighthouse, watch it built, reviewed, revised and lit at dusk.
import { buildWorld, C, G } from "./lighthouse-world.js";
import { makeSelection } from "../ui.js";
import { range } from "../script.js";

const START = 10.6;
const DONE = 34.6;
const PROMPT = "Build a red-and-white lighthouse on this cliff, with a small keeper's cottage.";

const phases = [
  { key: "foundation", t0: 14.3, t1: 15.3 },
  { key: "tower", t0: 15.8, t1: 20.3 },
  { key: "lantern", t0: 20.8, t1: 22.4 },
  { key: "roof", t0: 22.6, t1: 23.4 },
  { key: "cottage", t0: 24.0, t1: 27.3 },
  { key: "lanternCore", t0: 31.1, t1: 31.6 },
  { key: "path", t0: 32.0, t1: 33.0 },
];
const phase = Object.fromEntries(phases.map((p) => [p.key, p]));

const selection = makeSelection({
  A: [C.x - 14, G + 1, C.z + 9],
  B: [C.x + 7, G + 1, C.z - 8],
  H: 28,
  drag: [4.9, 5.9],
  extrude: [6.0, 6.5],
  dim: [13.6, 14.2],
  fade: [[14, 15, 1, 0.3], [33.4, 34.2, 0.3, 0]],
});

export default {
  title: "Rendr · Lighthouse",
  worldName: "Survival Island",
  worldTag: "Java 1.21",
  titleblock: { project: "Lighthouse", site: "Cliff plateau", scale: "1 block = 1 m" },
  duration: 45,
  cards: { title: [2.4, 3.2], end: 40.6 },
  world: buildWorld,
  phases,
  ghost: (b) =>
    b.key === "lanternCore" || b.key === "path"
      ? phase[b.key].t0 - 0.9 + (b.idx / b.n) * 0.5
      : 12.5 + ((b.y - G) / 28) * 1.3 + ((b.x + b.z) & 3) * 0.03,
  env: {
    dusk: { t0: 34.5, t1: 39.5 },
    lights: [
      { pos: [C.x + 0.5, G + 23.5, C.z + 0.5], color: 0xffd48a, intensity: 90, distance: 60, after: phase.lanternCore.t0 },
      { pos: [C.x - 9, G + 3, C.z + 1.5], color: 0xffb86b, intensity: 6, distance: 14 },
    ],
    beams: { pos: [C.x + 0.5, G + 23.5, C.z + 0.5], after: phase.lanternCore.t0 },
  },
  camera: [
    { t: 0, th: -0.95, el: 34, d: 112, tg: [0, 10, 0] },
    { t: 3.5, th: -0.82, el: 32, d: 100, tg: [2, 12, -2] },
    { t: 6.5, th: -0.72, el: 31, d: 86, tg: [5, 18, -5] },
    { t: 10.5, th: -0.63, el: 28, d: 78, tg: [6, 24, -6] },
    { t: 14, th: -0.55, el: 24, d: 76, tg: [7, 28, -6] },
    { t: 20, th: -0.32, el: 21, d: 80, tg: [7, 32, -6] },
    { t: 27, th: -0.08, el: 20, d: 82, tg: [6, 32, -5] },
    { t: 31, th: 0.1, el: 19, d: 78, tg: [7, 32, -6] },
    { t: 34.5, th: 0.35, el: 14, d: 76, tg: [9, 33, -7] },
    { t: 40, th: 0.95, el: 9, d: 74, tg: [10, 33, -7] },
    { t: 45.5, th: 1.4, el: 12, d: 78, tg: [10, 33, -7] },
  ],
  selection,
  aiToolAt: 3.7,
  placedFrom: 14.2,
  command: {
    prompt: PROMPT, placeholder: "Describe what to build here…",
    open: 3.75, focus: 7.25, typing: [7.4, 9.8], send: 10.4, footerAt: 6.4,
    ctx: "Selection 21 × 17 × 28", footer: "Cliff plateau · 9,996 blocks of space",
  },
  clicks: [3.65, 4.9, 7.25, 10.4],
  cursorOpacity: (t) => range(t, 2.8, 3.1) * (1 - range(t, 10.7, 11.1)),
  cursor: (t, { center, inputPos, project, sel }) => {
    const drag = () => project(sel.dragPoint(t));
    return [
      { t: 2.8, at: () => [innerWidth * 0.4, innerHeight * 0.62] },
      { t: 3.0, at: () => [innerWidth * 0.4, innerHeight * 0.62] },
      { t: 3.6, at: () => center("aiTool") },
      { t: 3.9, at: () => center("aiTool") },
      { t: 4.8, at: () => project(sel.A) },
      { t: 4.9, at: drag },
      { t: 5.9, at: drag },
      { t: 6.4, at: drag },
      { t: 7.2, at: inputPos },
      { t: 9.9, at: inputPos },
      { t: 10.35, at: () => center("sendBtn") },
      { t: 12, at: () => center("sendBtn") },
    ];
  },
  agent: {
    start: START,
    done: DONE,
    panelIn: [10.3, 11.1],
    statuses: [
      [DONE, "Complete"], [33.2, "Reviewing"], [30.9, "Revising"], [27.6, "Reviewing"],
      [14.2, "Building"], [12.1, "Planning"], [START, "Surveying"], [0, "Idle"],
    ],
  },
  hotbar: {
    slots: ["stone_bricks", "white_concrete", "red_concrete", "glass", "smooth_stone", "dark_oak_planks", "spruce_planks", "sea_lantern", "dirt_path_top"],
    slotOf: {
      polished_andesite: "stone_bricks", cobblestone: "stone_bricks", iron_bars: "smooth_stone",
      spruce_log: "spruce_planks", glowstone: "sea_lantern", path: "dirt_path_top",
    },
    names: { path: "Dirt Path" },
    show: [14.0, 33.6],
  },
  coords: (t) => (t < 4.8 ? "3, 14, 1" : "12, 19, −8"),

  feed({ brief, survey, thought, plan, review, summary, counts }) {
    brief(START + 0.3, PROMPT);
    survey(START + 0.6, 11.9, {
      label: "Site survey", live: "Surveying site…",
      figs: [
        { value: "19", unit: "y", cap: "Plateau height" },
        { value: "21 × 17", cap: "Flat area" },
        { value: "16", unit: "m", cap: "Drop to sea, east" },
      ],
    });
    thought(12.2, 13.6,
      "The plateau ends in a sheer drop to the sea on the east. The tower goes on the seaward edge so it reads from the water, and the cottage sits inland, out of the wind.");
    plan(13.8, [
      { title: "Foundation", op: "<em>fill_disc</em> · radius 4.5, two courses", mats: ["stone_bricks", "polished_andesite"], keys: ["foundation"], active: 14.2 },
      { title: "Tower", op: "<em>build_cylinder</em> · 18 high, tapers 2.9 → 2.3, bands of 3", mats: ["white_concrete", "red_concrete", "glass"], keys: ["tower"] },
      { title: "Gallery, lantern room, roof", op: "<em>place_structure</em> · anchored to the tower top", mats: ["smooth_stone", "iron_bars", "glass", "dark_oak_planks"], keys: ["lantern", "roof"] },
      { title: "Keeper’s cottage", op: "<em>place_structure</em> · 6 × 6, gable roof, chimney", mats: ["spruce_planks", "spruce_log", "dark_oak_planks", "cobblestone"], keys: ["cottage"] },
      { title: "Self-review", op: "<em>render_views</em> · north, from the sea, southwest", count: "3 views", active: 27.6, done: 33.9 },
      { rev: 1, appear: 30.9, title: "Light the lantern room", op: "<em>place_blocks</em> · 5 sea lanterns, 2 glowstone", mats: ["sea_lantern", "glowstone"], keys: ["lanternCore"], active: 31.0 },
      { rev: 2, appear: 31.7, title: "Path up from the trail", op: "<em>draw_path</em> · dirt path, follows the terrain", mats: ["dirt_path_top"], keys: ["path"], active: 31.9 },
    ]);

    const lamp = [C.x + 0.5, G + 23.5, C.z + 0.5];
    const door = [C.x - 12.5, G + 2, C.z + 2.5];
    const V = {
      sea: { label: "From the sea", position: [C.x + 62, G + 4, C.z + 14], target: [C.x + 0.5, G + 12, C.z], fov: 30 },
      north: { label: "North", position: [C.x - 5, G + 14, C.z - 52], target: [C.x - 4, G + 11, C.z + 1], fov: 30 },
      sw: { label: "Southwest", position: [C.x - 30, G + 14, C.z + 26], target: [C.x - 9, G + 3, C.z + 2], fov: 30 },
    };
    review(27.7, "Review · pass 1", 30.9, "", [
      { ...V.sea, t: 28.0, cls: "wide", w: 824, h: 434, marks: [{ p: lamp, t: 29.7, rev: 1 }] },
      { ...V.north, t: 28.3, w: 404, h: 252 },
      { ...V.sw, t: 28.6, w: 404, h: 252, marks: [{ p: door, t: 30.4, rev: 2 }] },
    ], [
      { t: 29.0, good: true, text: "Silhouette reads clearly from all three views. The taper and gallery overhang work." },
      { t: 29.7, rev: 1, text: "The lantern room is hollow glass. From the sea it won’t read as a light." },
      { t: 30.4, rev: 2, text: "The cottage door opens onto bare slope, with no way up from the trail." },
    ]);
    review(33.2, "Review · pass 2", 34.0, "compact", [
      { ...V.sea, t: 33.3, w: 270, h: 208, marks: [{ p: lamp, t: 33.8, good: true }] },
      { ...V.north, t: 33.45, w: 270, h: 208 },
      { ...V.sw, t: 33.6, w: 270, h: 208, marks: [{ p: door, t: 33.9, good: true }] },
    ], [
      { t: 34.0, good: true, text: "Both revisions resolved. The lantern room is lit and the path reaches the trail." },
    ]);

    const total = Object.values(counts).reduce((a, b) => a + b, 0);
    summary(DONE, [
      { value: total.toLocaleString("en-US"), cap: "blocks" },
      { value: "7", cap: "operations" },
      { value: "2", cap: "reviews" },
      { value: (DONE - START).toFixed(1), unit: "s", cap: "elapsed" },
    ], ["Keep build", "Undo", "Export .schem"]);
  },
};
