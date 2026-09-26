import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/hanken-grotesk/400.css";
import "@fontsource/hanken-grotesk/500.css";
import "@fontsource/hanken-grotesk/600.css";
import "@fontsource/hanken-grotesk/700.css";
import "./demo.css";
import * as THREE from "three";
import { createScene } from "./scene.js";
import { C, G } from "./world.js";
import {
  DURATION, PROMPT, PHASES, DUSK, END_CARD, TITLE_OUT,
  clamp01, smooth, easeInOut, range, lerp,
} from "./script.js";

const $ = (id) => document.getElementById(id);
const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
const phase = Object.fromEntries(PHASES.map((p) => [p.key, p]));
const fmt = (n) => n.toLocaleString("en-US");
const tex = (name) => `/textures/block/${name}.png`;
const swatch = (name) => `<img src="${tex(name)}" alt="" />`;

const AGENT_START = 10.6;
const AGENT_DONE = 34.6;
const PANEL_IN = [10.3, 11.1];

// ---------------------------------------------------------------- camera path
const KEYS = [
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
];
const cr = (p0, p1, p2, p3, u) =>
  0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
function cameraAt(t) {
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
  const k0 = KEYS[Math.max(0, i - 1)], k1 = KEYS[i], k2 = KEYS[i + 1], k3 = KEYS[Math.min(KEYS.length - 1, i + 2)];
  const u = clamp01((t - k1.t) / (k2.t - k1.t));
  const f = (g) => cr(g(k0), g(k1), g(k2), g(k3), u);
  const th = f((k) => k.th), elv = (f((k) => k.el) * Math.PI) / 180, d = f((k) => k.d);
  const tg = [0, 1, 2].map((j) => f((k) => k.tg[j]));
  const target = new THREE.Vector3(...tg);
  const position = new THREE.Vector3(
    tg[0] + d * Math.cos(elv) * Math.sin(th),
    tg[1] + d * Math.sin(elv),
    tg[2] + d * Math.cos(elv) * Math.cos(th)
  );
  return { position, target };
}

// ------------------------------------------------------------- selection box
const SEL_A = [C.x - 14, G + 1, C.z + 9];
const SEL_B = [C.x + 7, G + 1, C.z - 8];
const SEL_H = 28;
function selectionAt(t) {
  if (t < 4.9) return null;
  const k = easeInOut(range(t, 4.9, 5.9));
  const cx = lerp(SEL_A[0], SEL_B[0], k), cz = lerp(SEL_A[2], SEL_B[2], k);
  const h = lerp(1, SEL_H, easeInOut(range(t, 6.0, 6.5)));
  let alpha = 1;
  if (t > 14) alpha = lerp(1, 0.3, range(t, 14, 15));
  if (t > 33.4) alpha = lerp(0.3, 0, range(t, 33.4, 34.2));
  if (alpha <= 0) return null;
  return {
    min: [Math.min(SEL_A[0], cx), SEL_A[1], Math.min(SEL_A[2], cz)],
    max: [Math.max(SEL_A[0], cx), SEL_A[1] + h, Math.max(SEL_A[2], cz)],
    alpha,
  };
}
const dimAlpha = (t) => range(t, 5.0, 5.3) * (1 - range(t, 13.6, 14.2));

// ------------------------------------------------------------------- the feed
const feed = $("feed");
const items = []; // { node, t0, update?(t) }
const push = (t0, node, update, parent = feed) => {
  node.style.display = "none";
  parent.appendChild(node);
  items.push({ node, t0, update, display: node.dataset.display || "block" });
  return node;
};

// Revision cloud: scalloped loop drawn around an issue, as on a marked-up drawing.
function cloudPath(cx, cy, r, bumps = 11) {
  const pts = [];
  for (let i = 0; i <= bumps; i++) {
    const a = (i / bumps) * Math.PI * 2 - Math.PI / 2;
    pts.push([cx + Math.cos(a) * r * 1.08, cy + Math.sin(a) * r * 0.86]);
  }
  const arc = Math.hypot(pts[1][0] - pts[0][0], pts[1][1] - pts[0][1]) * 0.62;
  return `M${pts[0][0].toFixed(1)} ${pts[0][1].toFixed(1)}` +
    pts.slice(1).map(([x, y]) => ` A${arc.toFixed(1)} ${arc.toFixed(1)} 0 0 1 ${x.toFixed(1)} ${y.toFixed(1)}`).join("");
}
const triangle = (n, cls = "tri") =>
  `<svg class="${cls}" viewBox="0 0 22 20" width="22" height="20"><path d="M11 2 20.5 18.5h-19z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round" /><text x="11" y="15.4" text-anchor="middle" fill="currentColor" style="font: 800 10px 'Archivo Variable', sans-serif">${n}</text></svg>`;

function brief(t0) {
  push(t0, el("section", "brief", `<div class="eyebrow">Brief</div><p>${PROMPT}</p>`));
}

function survey(t0, t1) {
  const n = el("section", "survey", `
    <div class="eyebrow"><span>Site survey</span></div>
    <div class="figs">
      <div><div class="fig">19<small>y</small></div><div class="figcap">Plateau height</div></div>
      <div><div class="fig">21 × 17</div><div class="figcap">Flat area</div></div>
      <div><div class="fig">16<small>m</small></div><div class="figcap">Drop to sea, east</div></div>
    </div>`);
  const label = n.querySelector(".eyebrow span");
  const figs = n.querySelector(".figs");
  push(t0, n, (t) => {
    label.className = t < t1 ? "live" : "";
    label.textContent = t < t1 ? "Surveying site…" : "Site survey";
    figs.style.opacity = range(t, t1, t1 + 0.3);
  });
}

function thought(t0, t1, text) {
  const n = el("section", "", `<div class="eyebrow">Approach</div><div class="thought"></div>`);
  const body = n.querySelector(".thought");
  push(t0, n, (t) => {
    body.textContent = text.slice(0, Math.floor(text.length * range(t, t0, t1)));
  });
}

function plan(t0, counts, steps) {
  const n = el("section", "plan", `<div class="eyebrow">Plan</div><ol></ol>`);
  const ol = n.querySelector("ol");
  push(t0, n);
  for (const s of steps) {
    const li = el("li", `step${s.rev ? " rev" : ""}`, `
      <span class="state">${s.rev ? triangle(s.rev) : ""}</span>
      <span class="title">${s.title}</span>
      <span class="count"></span>
      <span class="op">${s.op}</span>
      ${s.mats.length ? `<span class="mats">${s.mats.map(swatch).join("")}</span>` : ""}
      <span class="bar"><i></i></span>`);
    li.dataset.display = "grid";
    const count = li.querySelector(".count");
    const bar = li.querySelector(".bar i");
    const total = (s.keys || []).reduce((a, k) => a + counts[k], 0);
    push(s.appear ?? t0, li, (t) => {
      const state = t >= s.done ? "done" : t >= s.active ? "active" : "pending";
      li.className = `step ${state}${s.rev ? " rev" : ""}`;
      let placed = 0;
      for (const k of s.keys || []) {
        const p = phase[k];
        placed += Math.round(counts[k] * clamp01((t - p.t0) / (p.t1 - p.t0 - 0.3)));
      }
      if (s.keys) {
        count.textContent = state === "active" ? `${fmt(placed)} / ${fmt(total)}` : fmt(total);
        bar.style.width = `${((placed / total) * 100).toFixed(1)}%`;
      } else {
        count.textContent = s.count || "";
        bar.style.width = `${(range(t, s.active, s.done) * 100).toFixed(1)}%`;
      }
    }, ol);
  }
}

const snapshots = []; // { t, canvas, view, done, pts }
function shot(v) {
  const wrap = el("div", `shot ${v.cls || ""}`);
  const canvas = el("canvas");
  canvas.width = v.w;
  canvas.height = v.h;
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("class", "markup");
  svg.setAttribute("viewBox", `0 0 ${v.w} ${v.h}`);
  svg.setAttribute("preserveAspectRatio", "none");
  wrap.append(canvas, svg, el("span", "cap", v.label));
  const s = { t: v.t, canvas, view: v, done: false, wrap, svg };
  snapshots.push(s);
  return s;
}

function review(t0, title, liveEnd, sheetCls, views, findings) {
  const n = el("section", "review", `<div class="eyebrow"><span>${title}</span></div><div class="sheet ${sheetCls}"></div><ul class="findings"></ul>`);
  const label = n.querySelector(".eyebrow span");
  const sheet = n.querySelector(".sheet");
  const list = n.querySelector(".findings");
  const shots = views.map((v) => {
    const s = shot(v);
    sheet.appendChild(s.wrap);
    return s;
  });
  const rows = findings.map((f) => {
    const li = el("li", f.good ? "good" : "bad", `<span class="key">${f.rev ? triangle(f.rev) : '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>'}</span><span></span>`);
    list.appendChild(li);
    return { ...f, li, span: li.lastChild };
  });
  push(t0, n, (t) => {
    label.className = t < liveEnd ? "live" : "";
    for (const s of shots) {
      s.wrap.style.opacity = t >= s.t ? 1 : 0.2;
      // Draw the markup once the shot exists and its projected points are known.
      if (s.done && !s.marked && s.pts) {
        s.marked = true;
        s.marks = (s.view.marks || []).map((m, i) => {
          const [x, y] = s.pts[i];
          const r = s.canvas.width * (s.view.cls === "wide" ? 0.07 : 0.12);
          const color = m.good ? "#7fd49a" : "#ff6a55";
          const g = document.createElementNS("http://www.w3.org/2000/svg", "g");
          g.innerHTML = m.good
            ? `<circle cx="${x}" cy="${y}" r="${r * 0.8}" pathLength="1" stroke="${color}" stroke-width="${r * 0.09}" fill="none" />`
            : `<path d="${cloudPath(x, y, r)}" pathLength="1" stroke="${color}" stroke-width="${r * 0.075}" fill="none" stroke-linecap="round" />
               <g transform="translate(${x + r * 1.2} ${y - r * 0.55}) scale(${r / 22})" style="color:${color}">${triangle(m.rev, "")}</g>`;
          s.svg.appendChild(g);
          return { ...m, g, line: g.firstElementChild, badge: g.children[1] };
        });
      }
      for (const m of s.marks || []) {
        const p = range(t, m.t, m.t + 0.5);
        m.g.style.display = t >= m.t ? "" : "none";
        m.line.setAttribute("stroke-dasharray", "1");
        m.line.setAttribute("stroke-dashoffset", String(1 - p));
        if (m.badge) m.badge.style.opacity = range(t, m.t + 0.35, m.t + 0.55);
      }
    }
    for (const r of rows) {
      r.li.style.display = t >= r.t ? "grid" : "none";
      r.span.textContent = r.text.slice(0, Math.floor(r.text.length * range(t, r.t, r.t + 0.6)));
    }
  });
}

function buildFeed(counts) {
  brief(AGENT_START + 0.3);
  survey(AGENT_START + 0.6, 11.9);
  thought(12.2, 13.6,
    "The plateau ends in a sheer drop to the sea on the east. The tower goes on the seaward edge so it reads from the water, and the cottage sits inland, out of the wind.");

  plan(13.8, counts, [
    { title: "Foundation", op: "<em>fill_disc</em> · radius 4.5, two courses", mats: ["stone_bricks", "polished_andesite"], keys: ["foundation"], active: 14.2, done: phase.foundation.t1 },
    { title: "Tower", op: "<em>build_cylinder</em> · 18 high, tapers 2.9 → 2.3, bands of 3", mats: ["white_concrete", "red_concrete", "glass"], keys: ["tower"], active: phase.tower.t0, done: phase.tower.t1 },
    { title: "Gallery, lantern room, roof", op: "<em>place_structure</em> · anchored to the tower top", mats: ["smooth_stone", "iron_bars", "glass", "dark_oak_planks"], keys: ["lantern", "roof"], active: phase.lantern.t0, done: phase.roof.t1 },
    { title: "Keeper’s cottage", op: "<em>place_structure</em> · 6 × 6, gable roof, chimney", mats: ["spruce_planks", "spruce_log", "dark_oak_planks", "cobblestone"], keys: ["cottage"], active: phase.cottage.t0, done: phase.cottage.t1 },
    { title: "Self-review", op: "<em>render_views</em> · north, from the sea, southwest", mats: [], count: "3 views", active: 27.6, done: 33.9 },
    { rev: 1, appear: 30.9, title: "Light the lantern room", op: "<em>place_blocks</em> · 5 sea lanterns, 2 glowstone", mats: ["sea_lantern", "glowstone"], keys: ["lanternCore"], active: 31.0, done: phase.lanternCore.t1 },
    { rev: 2, appear: 31.7, title: "Path up from the trail", op: "<em>draw_path</em> · dirt path, follows the terrain", mats: ["dirt_path_top"], keys: ["path"], active: 31.9, done: phase.path.t1 },
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
  push(AGENT_DONE, el("section", "summary", `
    <div class="head"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>Build complete</div>
    <div class="figs">
      <div><div class="fig">${fmt(total)}</div><div class="figcap">blocks</div></div>
      <div><div class="fig">7</div><div class="figcap">operations</div></div>
      <div><div class="fig">2</div><div class="figcap">reviews</div></div>
      <div><div class="fig">${(AGENT_DONE - AGENT_START).toFixed(1)}<small>s</small></div><div class="figcap">elapsed</div></div>
    </div>
    <div class="actions"><span class="primary">Keep build</span><span>Undo</span><span>Export .schem</span></div>`));
}

// --------------------------------------------------------------------- hotbar
const SLOTS = ["stone_bricks", "white_concrete", "red_concrete", "glass", "smooth_stone", "dark_oak_planks", "spruce_planks", "sea_lantern", "dirt_path_top"];
const SLOT_OF = {
  polished_andesite: "stone_bricks", cobblestone: "stone_bricks", iron_bars: "smooth_stone",
  spruce_log: "spruce_planks", glowstone: "sea_lantern", path: "dirt_path_top",
};
const NAMES = { path: "Dirt Path" };
const prettyName = (type) => NAMES[type] || type.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
const slotEls = {};
function buildHotbar() {
  const slots = $("slots");
  for (const s of SLOTS) {
    const d = el("div", "slot", swatch(s));
    slots.appendChild(d);
    slotEls[s] = d;
  }
}
let lastHotType = "stone_bricks";
const usedSlots = new Set();

// --------------------------------------------------------------------- cursor
const cursor = $("cursor");
const ripple = $("ripple");
const CLICKS = [3.65, 4.9, 7.25, 10.4];
function center(id) {
  const r = $(id).getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}
function cursorAt(t, scene) {
  const inputPos = () => {
    const r = $("cmdInput").getBoundingClientRect();
    return [r.left + 120, r.top + r.height / 2 + 6];
  };
  const drag = () => {
    const kk = easeInOut(range(t, 4.9, 5.9));
    return scene.project([lerp(SEL_A[0], SEL_B[0], kk), SEL_A[1], lerp(SEL_A[2], SEL_B[2], kk)]);
  };
  const path = [
    { t: 2.8, at: () => [innerWidth * 0.4, innerHeight * 0.62] },
    { t: 3.0, at: () => [innerWidth * 0.4, innerHeight * 0.62] },
    { t: 3.6, at: () => center("aiTool") },
    { t: 3.9, at: () => center("aiTool") },
    { t: 4.8, at: () => scene.project(SEL_A) },
    { t: 4.9, at: drag },
    { t: 5.9, at: drag },
    { t: 6.4, at: drag },
    { t: 7.2, at: inputPos },
    { t: 9.9, at: inputPos },
    { t: 10.35, at: () => center("sendBtn") },
    { t: 12, at: () => center("sendBtn") },
  ];
  let i = 0;
  while (i < path.length - 2 && t > path[i + 1].t) i++;
  const a = path[i], b = path[i + 1];
  const pa = a.at(), pb = b.at();
  const u = easeInOut(range(t, a.t, b.t));
  const pos = a.at === b.at ? pb : [lerp(pa[0], pb[0], u), lerp(pa[1], pb[1], u)];
  const opacity = range(t, 2.8, 3.1) * (1 - range(t, 10.7, 11.1));
  return { pos, opacity };
}

// ----------------------------------------------------------------- main frame
let scene;
let feedY = 0;
let lastT = -1;

function frame(t, skipRender = false) {
  const dt = lastT < 0 || t < lastT ? 1 : Math.min(0.25, t - lastT);
  if (t < lastT) {
    snapshots.forEach((s) => (s.done = false));
    feedY = 0;
    usedSlots.clear();
  }
  lastT = t;

  const panelK = smooth(range(t, PANEL_IN[0], PANEL_IN[1]));
  scene.setPanelShift(panelK);
  const panel = $("panel");
  panel.style.transform = `translateX(${((1 - panelK) * 110).toFixed(2)}%)`;
  panel.style.opacity = panelK;

  const cam = cameraAt(t);
  const { placed, latest } = scene.update(t, cam);
  const sel = selectionAt(t);
  const da = sel ? dimAlpha(t) : 0;
  const anchors = scene.setSelection(sel, da);

  // Agent screenshots are real renders of the world at that moment.
  for (const s of snapshots) {
    if (!s.done && t >= s.t) {
      s.pts = scene.snapshot(s.canvas, s.view, (s.view.marks || []).map((m) => m.p));
      s.done = true;
    }
  }
  if (!skipRender) scene.render();

  // Top bar
  const placedEl = $("placed");
  placedEl.style.opacity = range(t, 14.2, 14.5);
  placedEl.innerHTML = `<b>+${fmt(placed)}</b> placed`;
  $("fps").textContent = String(58 + ((Math.floor(t * 3) * 7919) % 4));

  // Toolbar
  const aiOn = t >= 3.7;
  $("aiTool").classList.toggle("active", aiOn);
  document.querySelector('[data-tool="select"]').classList.toggle("active", !aiOn);
  $("aiTip").style.opacity = range(t, 3.7, 3.9) * (1 - range(t, 4.8, 5.0));

  // Dimension labels
  for (const [key, id] of [["w", "dimW"], ["d", "dimD"], ["h", "dimH"]]) {
    const node = $(id);
    node.style.opacity = da;
    if (!anchors || da <= 0) continue;
    const [x, y] = scene.project(anchors[key]);
    node.style.left = `${x}px`;
    node.style.top = `${y}px`;
    const v = key === "w" ? sel.max[0] - sel.min[0] : key === "d" ? sel.max[2] - sel.min[2] : sel.max[1] - sel.min[1];
    node.textContent = `${Math.round(v)} m`;
  }

  // Command bar
  const cmdIn = smooth(range(t, 3.75, 4.25));
  const cmdOut = smooth(range(t, 10.45, 10.95));
  const cmd = $("command");
  cmd.style.opacity = cmdIn * (1 - cmdOut);
  cmd.style.transform = `translate(-50%, ${((1 - cmdIn) * 20 + cmdOut * 28).toFixed(1)}px)`;
  const typing = range(t, 7.4, 9.8);
  const sent = t >= 10.4;
  const text = PROMPT.slice(0, Math.floor(PROMPT.length * typing));
  const promptEl = $("promptText");
  promptEl.textContent = text || "Describe what to build here…";
  promptEl.className = text ? "" : "placeholder";
  const focus = t >= 7.25 && !sent;
  $("caret").style.opacity = focus && ((typing > 0 && typing < 1) || Math.floor(t * 2.2) % 2 === 0) ? 1 : 0;
  $("sendBtn").classList.toggle("ready", !!text);
  document.querySelector(".cmd-foot").style.opacity = range(t, 6.4, 6.7);

  // Hotbar
  const hot = $("hotbar");
  hot.style.opacity = range(t, 14.0, 14.4) * (1 - range(t, 33.6, 34.2));
  hot.style.left = `${(innerWidth - (panel.offsetWidth + 20) * panelK) / 2}px`;
  if (latest) {
    lastHotType = latest;
    usedSlots.add(SLOT_OF[latest] || latest);
  }
  const activeSlot = SLOT_OF[lastHotType] || lastHotType;
  for (const [name, node] of Object.entries(slotEls)) {
    node.classList.toggle("active", name === activeSlot);
    node.classList.toggle("used", usedSlots.has(name) && name !== activeSlot);
  }
  $("hotName").textContent = prettyName(lastHotType);

  // Title block
  const status = [
    [AGENT_DONE, "Complete"], [33.2, "Reviewing"], [30.9, "Revising"], [27.6, "Reviewing"],
    [14.2, "Building"], [12.1, "Planning"], [AGENT_START, "Surveying"], [0, "Idle"],
  ].find(([t0]) => t >= t0)[1];
  const st = $("agentStatus");
  st.className = `status${status === "Complete" ? " ok" : status === "Idle" ? "" : " busy"}`;
  st.lastChild.textContent = status;
  const elapsed = clamp01((t - AGENT_START) / (AGENT_DONE - AGENT_START)) * (AGENT_DONE - AGENT_START);
  $("elapsed").textContent = `${Math.floor(elapsed / 60)}:${(elapsed % 60).toFixed(1).padStart(4, "0")}`;

  // Feed items
  for (const it of items) {
    const vis = t >= it.t0;
    it.node.style.display = vis ? it.display : "none";
    if (!vis) continue;
    const p = smooth(range(t, it.t0, it.t0 + 0.35));
    it.node.style.opacity = p;
    it.node.style.transform = `translateY(${((1 - p) * 10).toFixed(1)}px)`;
    it.update?.(t);
  }
  const wrap = feed.parentElement;
  const target = Math.min(0, wrap.clientHeight - feed.scrollHeight);
  feedY += (target - feedY) * (1 - Math.exp(-dt * 6));
  feed.style.transform = `translateY(${feedY.toFixed(1)}px)`;

  // Corner readouts
  $("coords").textContent = t < 4.8 ? "3, 14, 1" : "12, 19, −8";
  const dusk = smooth(range(t, DUSK.t0, DUSK.t1));
  const mins = Math.round(lerp(12 * 60, 19 * 60 + 40, dusk));
  $("clock").textContent = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

  // Cursor
  const c = cursorAt(t, scene);
  cursor.style.opacity = c.opacity;
  cursor.style.transform = `translate(${c.pos[0] - 5}px, ${c.pos[1] - 3}px)`;
  const lastClick = CLICKS.filter((ct) => t >= ct).pop();
  const rp = lastClick == null ? 1 : range(t, lastClick, lastClick + 0.45);
  ripple.style.opacity = rp < 1 ? 1 - rp : 0;
  ripple.style.transform = `scale(${lerp(0.3, 1.4, rp)})`;
  const pressed = lastClick != null && t - lastClick < 0.12;
  cursor.firstElementChild.style.transform = `scale(${pressed ? 0.88 : 1})`;

  // Cards and fades
  $("titleCard").style.opacity = 1 - smooth(range(t, TITLE_OUT.t0, TITLE_OUT.t1));
  $("endCard").style.opacity = smooth(range(t, END_CARD, END_CARD + 0.9));
  $("fade").style.opacity = Math.max(1 - range(t, 0, 0.9), range(t, DURATION - 0.6, DURATION));
}

async function main() {
  const canvas = $("view");
  scene = await createScene(canvas);
  const fit = () => scene.resize(innerWidth, innerHeight, $("panel").offsetWidth + 20);
  fit();
  addEventListener("resize", fit);
  buildFeed(scene.counts);
  buildHotbar();
  await document.fonts.ready;
  await Promise.all(
    [...document.images].map((img) => (img.complete ? null : new Promise((r) => { img.onload = img.onerror = r; })))
  );

  const params = new URLSearchParams(location.search);
  if (params.has("capture")) {
    window.__renderAt = (t, skip) => {
      frame(t, skip);
      return new Promise((r) => requestAnimationFrame(() => r()));
    };
    window.__duration = DURATION;
    window.__ready = true;
    return;
  }
  const start = performance.now() - (Number(params.get("t")) || 0) * 1000;
  const loop = () => {
    const t = ((performance.now() - start) / 1000) % DURATION;
    frame(t);
    requestAnimationFrame(loop);
  };
  loop();
}

main();
