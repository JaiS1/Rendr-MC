import "@fontsource/inter/400.css";
import "@fontsource/inter/500.css";
import "@fontsource/inter/600.css";
import "@fontsource/inter/800.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
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

// ---------------------------------------------------------------- camera path
const KEYS = [
  { t: 0, th: -0.95, el: 34, d: 112, tg: [0, 10, 0] },
  { t: 3.5, th: -0.82, el: 32, d: 100, tg: [2, 12, -2] },
  { t: 6.5, th: -0.72, el: 31, d: 86, tg: [5, 18, -5] },
  { t: 10.5, th: -0.63, el: 28, d: 76, tg: [6, 24, -6] },
  { t: 14, th: -0.55, el: 24, d: 74, tg: [7, 27, -6] },
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
  if (t > 14) alpha = lerp(1, 0.35, range(t, 14, 15));
  if (t > 33.4) alpha = lerp(0.35, 0, range(t, 33.4, 34.2));
  if (alpha <= 0) return null;
  return {
    min: [Math.min(SEL_A[0], cx), SEL_A[1], Math.min(SEL_A[2], cz)],
    max: [Math.max(SEL_A[0], cx), SEL_A[1] + h, Math.max(SEL_A[2], cz)],
    alpha,
  };
}

// ------------------------------------------------------------------- the feed
const feed = $("feed");
const items = []; // { node, t0, update?(t) }
const push = (t0, node, update) => {
  node.style.display = "none";
  feed.appendChild(node);
  items.push({ node, t0, update });
  return node;
};

function streamText(node, text, t0, t1) {
  return (t) => {
    const n = Math.floor(text.length * range(t, t0, t1));
    node.textContent = text.slice(0, n);
  };
}

function label(t0, text, until) {
  const n = el("div", "label", `<span>${text}</span>`);
  const span = n.firstChild;
  push(t0, n, (t) => {
    const busy = t < until;
    span.className = busy ? "shimmer" : "";
    span.style.backgroundPosition = `${-((t * 120) % 200)}% 0`;
  });
}

function thought(t0, t1, text) {
  const n = el("div", "thought");
  push(t0, n, streamText(n, text, t0, t1));
}

function tool(t0, t1, fn, args, result, bar) {
  const n = el(
    "div",
    "tool",
    `<div class="row"><span class="fn">${fn}</span><span class="st"></span></div>
     <div class="args">${args}</div>${bar ? '<div class="bar"><i></i></div>' : ""}<div class="res">${result}</div>`
  );
  const st = n.querySelector(".st");
  const res = n.querySelector(".res");
  const barEl = n.querySelector(".bar i");
  push(t0, n, (t) => {
    const done = t >= t1;
    st.innerHTML = done
      ? `<span style="color:var(--accent)">✓</span> ${(t1 - t0).toFixed(1)}s`
      : `<span class="spin" style="transform:rotate(${(t * 540) % 360}deg)"></span> running`;
    res.style.display = done ? "block" : "none";
    if (barEl) barEl.style.width = `${(bar(t) * 100).toFixed(1)}%`;
  });
}

function plan(t0, steps) {
  const n = el("div", "plan", `<div class="label">Plan</div><ol></ol>`);
  const ol = n.querySelector("ol");
  const lis = steps.map((s, i) => {
    const li = el("li", "", `<span class="box"></span><span>${s.text}</span><small>${i + 1}/${steps.length}</small>`);
    ol.appendChild(li);
    return li;
  });
  push(t0, n, (t) => {
    steps.forEach((s, i) => {
      lis[i].className = t >= s.done ? "done" : t >= s.active ? "active" : "";
      lis[i].style.opacity = range(t, t0 + i * 0.12, t0 + i * 0.12 + 0.25);
    });
  });
}

const k = (s) => `<span class="k">${s}</span>`;
const s = (x) => `<span class="s">"${x}"</span>`;
const n = (x) => `<span class="n">${x}</span>`;

const snapshots = []; // { t, canvas, view, marks, done }
function review(t0, title, views, critiques) {
  const node = el("div", "review", `<div class="label">${title}</div><div class="thumbs"></div><div class="critique"></div>`);
  const thumbs = node.querySelector(".thumbs");
  const crit = node.querySelector(".critique");
  const shots = views.map((v) => {
    const wrap = el("div", "thumb");
    const canvas = el("canvas");
    canvas.width = 272;
    canvas.height = 188;
    wrap.append(canvas, el("span", "", v.label));
    const marks = (v.marks || []).map((m) => {
      const dot = el("i", `mark${m.good ? " good" : ""}`);
      wrap.appendChild(dot);
      return { ...m, dot };
    });
    thumbs.appendChild(wrap);
    const shot = { t: v.t, canvas, view: v, marks, wrap, done: false };
    snapshots.push(shot);
    return shot;
  });
  const lines = critiques.map((c) => {
    const d = el("div", c.good ? "good" : "bad", `<b>${c.good ? "✓" : "✕"}</b><span></span>`);
    crit.appendChild(d);
    return { ...c, d, span: d.querySelector("span") };
  });
  push(t0, node, (t) => {
    for (const sh of shots) {
      sh.wrap.style.opacity = t >= sh.t ? 1 : 0.25;
      for (const m of sh.marks) {
        const on = t >= m.t && sh.pts;
        m.dot.style.display = on ? "block" : "none";
        if (on) {
          const [x, y] = sh.pts[sh.marks.indexOf(m)];
          m.dot.style.left = `${(x / sh.canvas.width) * 100}%`;
          m.dot.style.top = `${(y / sh.canvas.height) * 100}%`;
          const p = range(t, m.t, m.t + 0.3);
          m.dot.style.transform = `translate(-50%,-50%) scale(${lerp(1.8, 1, p)})`;
          m.dot.style.opacity = p;
        }
      }
    }
    for (const l of lines) {
      l.d.style.display = t >= l.t ? "flex" : "none";
      l.span.textContent = l.text.slice(0, Math.floor(l.text.length * range(t, l.t, l.t + 0.55)));
    }
  });
}

function buildFeed(counts) {
  const user = el("div", "msg-user", `${PROMPT}<div class="ctx">▣ selection · 21 × 28 × 17 · cliff_plateau</div>`);
  push(10.6, user);

  label(11.0, "Surveying site", 11.9);
  tool(11.1, 11.9, "get_heightmap", `{ ${k("region")}: ${s("selection")} }`, "→ plateau y=19 · 21×17 flat · 16-block drop to the east");
  thought(
    12.1, 13.6,
    "Flat plateau with a sheer drop to the sea on the east edge. I'll put the tower on the seaward side so it reads from the water, and tuck the cottage inland, out of the wind."
  );
  plan(13.8, [
    { text: "Foundation · stone bricks", active: 14.2, done: phase.foundation.t1 },
    { text: "Tower · 18 high, tapered, red/white bands", active: phase.tower.t0, done: phase.tower.t1 },
    { text: "Gallery, lantern room & roof", active: phase.lantern.t0, done: phase.roof.t1 },
    { text: "Keeper's cottage", active: phase.cottage.t0, done: phase.cottage.t1 },
    { text: "Review from 3 viewpoints", active: 27.7, done: 33.9 },
  ]);

  const prog = (...keys) => (t) => {
    const a = phase[keys[0]].t0, b = phase[keys[keys.length - 1]].t1;
    return range(t, a, b);
  };
  const sum = (...keys) => keys.reduce((a, key) => a + counts[key], 0);

  tool(14.2, phase.foundation.t1, "fill_disc",
    `{ ${k("center")}: [${n(12)}, ${n(20)}, ${n(-8)}], ${k("radius")}: ${n(4.5)},\n  ${k("block")}: ${s("stone_bricks")}, ${k("layers")}: ${n(2)} }`,
    `✓ ${fmt(sum("foundation"))} blocks placed`, prog("foundation"));
  tool(15.6, phase.tower.t1, "build_cylinder",
    `{ ${k("height")}: ${n(18)}, ${k("radius")}: [${n(3.0)}, ${n(2.3)}], ${k("hollow")}: ${n("true")},\n  ${k("bands")}: [${s("white_concrete")}, ${s("red_concrete")}], ${k("every")}: ${n(3)},\n  ${k("windows")}: ${s("spiral")} }`,
    `✓ ${fmt(sum("tower"))} blocks placed`, prog("tower"));
  tool(20.6, phase.roof.t1, "place_structure",
    `{ ${k("parts")}: [${s("gallery")}, ${s("railing")}, ${s("lantern_room")}, ${s("cone_roof")}],\n  ${k("anchor")}: ${s("tower.top")} }`,
    `✓ ${fmt(sum("lantern", "roof"))} blocks placed`, prog("lantern", "roof"));
  tool(23.8, phase.cottage.t1, "place_structure",
    `{ ${k("kind")}: ${s("cottage")}, ${k("size")}: [${n(6)}, ${n(6)}], ${k("roof")}: ${s("gable")},\n  ${k("palette")}: ${s("spruce")}, ${k("chimney")}: ${n("true")} }`,
    `✓ ${fmt(sum("cottage"))} blocks placed`, prog("cottage"));

  label(27.6, "Reviewing · rendering 3 viewpoints", 29.0);
  const lamp = [C.x + 0.5, G + 23.5, C.z + 0.5];
  const door = [C.x - 12.5, G + 2, C.z + 2.5];
  const views = (t, good) => [
    { t, label: "north", position: [C.x - 5, G + 14, C.z - 52], target: [C.x - 4, G + 11, C.z + 1], fov: 30 },
    { t: t + 0.3, label: "from sea", position: [C.x + 62, G + 4, C.z + 14], target: [C.x + 0.5, G + 12, C.z], fov: 30, marks: [{ p: lamp, t: good ? t + 0.6 : 29.7, good }] },
    { t: t + 0.6, label: "southwest", position: [C.x - 30, G + 14, C.z + 26], target: [C.x - 9, G + 3, C.z + 2], fov: 30, marks: [{ p: door, t: good ? t + 0.7 : 30.4, good }] },
  ];
  review(27.7, "Self-review · pass 1", views(28.0, false), [
    { t: 29.0, good: true, text: "Silhouette reads clearly; gallery overhang and taper look right." },
    { t: 29.7, text: "From the sea the lantern room is hollow glass, so it won't read as a light." },
    { t: 30.4, text: "The cottage door opens onto bare slope with no way up from the trail." },
  ]);

  tool(31.0, phase.lanternCore.t1, "place_blocks",
    `{ ${k("at")}: ${s("lantern_room.interior")},\n  ${k("blocks")}: { ${s("sea_lantern")}: ${n(5)}, ${s("glowstone")}: ${n(2)} } }`,
    `✓ ${fmt(sum("lanternCore"))} blocks placed`, prog("lanternCore"));
  tool(31.8, phase.path.t1, "draw_path",
    `{ ${k("from")}: ${s("cottage.door")}, ${k("to")}: ${s("trail")},\n  ${k("block")}: ${s("dirt_path")}, ${k("follow_terrain")}: ${n("true")} }`,
    `✓ ${fmt(sum("path"))} blocks placed`, prog("path"));

  review(33.2, "Self-review · pass 2", views(33.3, true), [
    { t: 34.1, good: true, text: "Lantern room lit, path connects the cottage. All checks pass." },
  ]);

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  push(34.6, el("div", "summary", `
    <div class="head"><svg viewBox="0 0 24 24"><path d="M5 12l5 5L20 7" /></svg>Build complete</div>
    <div class="nums">
      <div>${fmt(total)}<small>blocks</small></div>
      <div>7<small>tool calls</small></div>
      <div>2<small>review passes</small></div>
      <div>23.9s<small>wall time</small></div>
    </div>
    <div class="actions"><span>↶ Undo</span><span>Export .schem</span><span>Share replay</span></div>`));
}

// --------------------------------------------------------------------- cursor
const cursor = $("cursor");
const ripple = $("ripple");
const CLICKS = [3.65, 4.9, 7.25, 10.55];
function center(id) {
  const r = $(id).getBoundingClientRect();
  return [r.left + r.width / 2, r.top + r.height / 2];
}
function cursorAt(t, scene) {
  const inputPos = () => {
    const r = $("composer").querySelector(".input").getBoundingClientRect();
    return [r.left + 60, r.top + 30];
  };
  const drag = () => {
    const kk = easeInOut(range(t, 4.9, 5.9));
    return scene.project([lerp(SEL_A[0], SEL_B[0], kk), SEL_A[1], lerp(SEL_A[2], SEL_B[2], kk)]);
  };
  const path = [
    { t: 2.8, at: () => [innerWidth * 0.36, innerHeight * 0.62] },
    { t: 3.0, at: () => [innerWidth * 0.36, innerHeight * 0.62] },
    { t: 3.6, at: () => center("aiTool") },
    { t: 3.9, at: () => center("aiTool") },
    { t: 4.8, at: () => scene.project(SEL_A) },
    { t: 4.9, at: drag },
    { t: 5.9, at: drag },
    { t: 6.4, at: drag },
    { t: 7.2, at: inputPos },
    { t: 10.1, at: inputPos },
    { t: 10.5, at: () => center("sendBtn") },
    { t: 12, at: () => center("sendBtn") },
  ];
  let i = 0;
  while (i < path.length - 2 && t > path[i + 1].t) i++;
  const a = path[i], b = path[i + 1];
  const pa = a.at(), pb = b.at();
  const u = a.at === b.at ? 1 : easeInOut(range(t, a.t, b.t));
  const pos = a.at === b.at ? pb : [lerp(pa[0], pb[0], u), lerp(pa[1], pb[1], u)];
  const opacity = range(t, 2.8, 3.1) * (1 - range(t, 11.0, 11.4));
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
  }
  lastT = t;

  const cam = cameraAt(t);
  const { placed } = scene.update(t, cam);
  scene.setSelection(selectionAt(t));

  // Agent "screenshots" are real renders of the current world state.
  for (const shot of snapshots) {
    if (!shot.done && t >= shot.t) {
      shot.pts = scene.snapshot(shot.canvas, shot.view, shot.view.marks?.map((m) => m.p) || []);
      shot.done = true;
    }
  }
  if (!skipRender) scene.render();

  // Top chips
  const placedEl = $("placed");
  placedEl.style.opacity = range(t, 14.2, 14.5);
  placedEl.innerHTML = `<b>+${fmt(placed)}</b> blocks`;
  $("fps").textContent = String(58 + (Math.floor(t * 3) * 7919) % 4);

  // Toolbar
  const aiOn = t >= 3.7;
  $("aiTool").classList.toggle("active", aiOn);
  document.querySelector('[data-tool="select"]').classList.toggle("active", !aiOn);
  $("aiTip").style.opacity = range(t, 3.7, 3.9) * (1 - range(t, 4.8, 5.0));

  // Selection label
  const sel = selectionAt(t);
  const selLabel = $("selLabel");
  if (sel && t < 14.5) {
    const [x, y] = scene.project([(sel.min[0] + sel.max[0]) / 2, sel.min[1], sel.max[2]]);
    selLabel.style.left = `${x}px`;
    selLabel.style.top = `${y}px`;
    selLabel.style.opacity = range(t, 5.0, 5.2) * (1 - range(t, 13.8, 14.3));
    const w = Math.round(sel.max[0] - sel.min[0]), d = Math.round(sel.max[2] - sel.min[2]), h = Math.round(sel.max[1] - sel.min[1]);
    $("selDims").textContent = `${w} × ${h} × ${d}`;
  } else selLabel.style.opacity = 0;

  // Composer
  const typing = range(t, 7.4, 10.0);
  const sent = t >= 10.55;
  const text = sent ? "" : PROMPT.slice(0, Math.floor(PROMPT.length * typing));
  const promptEl = $("promptText");
  promptEl.textContent = text || "Describe what to build…";
  promptEl.className = text ? "" : "placeholder";
  const focus = t >= 7.25 && !sent;
  $("composer").querySelector(".input").classList.toggle("focus", focus);
  $("caret").style.opacity = focus && (typing > 0 && typing < 1 ? 1 : Math.floor(t * 2.2) % 2 === 0) ? 1 : 0;
  $("sendBtn").classList.toggle("ready", !!text);
  $("ctxChip").style.opacity = range(t, 6.5, 6.8) * (sent ? 0 : 1);

  // Agent status
  const status = [
    [34.6, "done"], [33.2, "reviewing"], [30.9, "fixing"], [27.6, "reviewing"], [14.2, "building"], [10.6, "thinking"], [0, "idle"],
  ].find(([t0]) => t >= t0)[1];
  const st = $("agentStatus");
  st.classList.toggle("busy", status !== "idle" && status !== "done");
  st.lastChild.textContent = status;

  // Feed items
  for (const it of items) {
    const vis = t >= it.t0;
    it.node.style.display = vis ? (it.node.classList.contains("label") ? "flex" : "block") : "none";
    if (!vis) continue;
    const p = smooth(range(t, it.t0, it.t0 + 0.3));
    it.node.style.opacity = p;
    it.node.style.transform = `translateY(${(1 - p) * 10}px)`;
    it.update?.(t);
  }
  const wrap = feed.parentElement;
  const target = Math.min(0, wrap.clientHeight - feed.scrollHeight);
  feedY += (target - feedY) * (1 - Math.exp(-dt * 7));
  feed.style.transform = `translateY(${feedY.toFixed(1)}px)`;

  // Bottom-left
  $("coords").textContent = t < 4.8 ? "x 3 · y 14 · z 1" : "x 12 · y 19 · z −8";
  const dusk = smooth(range(t, DUSK.t0, DUSK.t1));
  const mins = Math.round(lerp(12 * 60, 19 * 60 + 40, dusk));
  $("clock").textContent = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

  // Cursor
  const c = cursorAt(t, scene);
  cursor.style.opacity = c.opacity;
  cursor.style.transform = `translate(${c.pos[0] - 4}px, ${c.pos[1] - 2}px)`;
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
  const fit = () => {
    const panel = $("panel").getBoundingClientRect();
    scene.resize(innerWidth, innerHeight, panel.width + 18);
  };
  fit();
  addEventListener("resize", fit);
  buildFeed(scene.counts);
  await document.fonts.ready;

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
