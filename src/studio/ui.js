// Runner for a studio scenario. A scenario supplies the world,
// the timeline and the feed; this module drives the scene and every overlay
// as a pure function of time so frames can be rendered in any order.
import * as THREE from "three";
import { createScene } from "./scene.js";
import { clamp01, smooth, easeInOut, range, lerp } from "./script.js";

export const $ = (id) => document.getElementById(id);
export const el = (tag, cls, html) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};
export const fmt = (n) => n.toLocaleString("en-US");
export const swatch = (name) => `<img src="/textures/block/${name}.png" alt="" />`;
export const triangle = (n, cls = "tri") =>
  `<svg class="${cls}" viewBox="0 0 22 20" width="22" height="20"><path d="M11 2 20.5 18.5h-19z" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linejoin="round" /><text x="11" y="15.4" text-anchor="middle" fill="currentColor" style="font: 800 10px 'Archivo Variable', sans-serif">${n}</text></svg>`;
const CHECK = '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>';

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

// ---------------------------------------------------------------- camera path
const cr = (p0, p1, p2, p3, u) =>
  0.5 * (2 * p1 + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u + (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u);
function cameraAt(KEYS, t) {
  let i = 0;
  while (i < KEYS.length - 2 && t > KEYS[i + 1].t) i++;
  const k0 = KEYS[Math.max(0, i - 1)], k1 = KEYS[i], k2 = KEYS[i + 1], k3 = KEYS[Math.min(KEYS.length - 1, i + 2)];
  const u = clamp01((t - k1.t) / (k2.t - k1.t));
  const f = (g) => cr(g(k0), g(k1), g(k2), g(k3), u);
  const th = f((k) => k.th), elv = (f((k) => k.el) * Math.PI) / 180, d = f((k) => k.d);
  const tg = [0, 1, 2].map((j) => f((k) => k.tg[j]));
  return {
    target: new THREE.Vector3(...tg),
    position: new THREE.Vector3(
      tg[0] + d * Math.cos(elv) * Math.sin(th),
      tg[1] + d * Math.sin(elv),
      tg[2] + d * Math.cos(elv) * Math.cos(th)
    ),
  };
}

// WorldEdit-style selection: drag a footprint, then extrude it upward.
export function makeSelection({ A, B, H, drag, extrude, dim, dimAt = drag[0] + 0.1, fade = [], hideAt }) {
  const at = (t) => {
    if (t < drag[0]) return null;
    const k = easeInOut(range(t, drag[0], drag[1]));
    const cx = lerp(A[0], B[0], k), cz = lerp(A[2], B[2], k);
    const h = lerp(1, H, easeInOut(range(t, extrude[0], extrude[1])));
    let alpha = 1;
    for (const [t0, t1, a0, a1] of fade) if (t > t0) alpha = lerp(a0, a1, range(t, t0, t1));
    if (hideAt != null && t >= hideAt) return null;
    if (alpha <= 0) return null;
    return {
      min: [Math.min(A[0], cx), A[1], Math.min(A[2], cz)],
      max: [Math.max(A[0], cx), A[1] + h, Math.max(A[2], cz)],
      alpha,
    };
  };
  const dimAlpha = (t) => range(t, dimAt, dimAt + 0.3) * (1 - range(t, dim[0], dim[1]));
  const dragPoint = (t) => {
    const k = easeInOut(range(t, drag[0], drag[1]));
    return [lerp(A[0], B[0], k), A[1], lerp(A[2], B[2], k)];
  };
  return { at, dimAlpha, dragPoint, A, B };
}

export async function run(S) {
  document.title = S.title;
  $("worldName").textContent = S.worldName;
  $("worldTag").textContent = S.worldTag;
  for (const [k, v] of Object.entries(S.titleblock)) $(`tb-${k}`).textContent = v;
  $("cmdCtx").textContent = S.command.ctx;
  $("cmdFooter").textContent = S.command.footer;

  const phase = Object.fromEntries(S.phases.map((p) => [p.key, p]));
  const feed = $("feed");
  const items = [];
  const push = (t0, node, update, parent = feed) => {
    node.style.display = "none";
    parent.appendChild(node);
    items.push({ node, t0, update, display: node.dataset.display || "block" });
    return node;
  };

  // --------------------------------------------------------- feed components
  const brief = (t0, text) => push(t0, el("section", "brief", `<div class="eyebrow">Brief</div><p>${text}</p>`));

  const survey = (t0, t1, { label, live, figs }) => {
    const n = el("section", "survey", `
      <div class="eyebrow"><span></span></div>
      <div class="figs">${figs.map((f) => `<div>
        <div class="fig">${f.swatches ? `<span class="fig-swatches">${f.swatches.map(swatch).join("")}</span>` : ""}${f.value ?? ""}${f.unit ? `<small>${f.unit}</small>` : ""}</div>
        <div class="figcap">${f.cap}</div></div>`).join("")}</div>`);
    const lab = n.querySelector(".eyebrow span");
    const figsEl = n.querySelector(".figs");
    push(t0, n, (t) => {
      lab.className = t < t1 ? "live" : "";
      lab.textContent = t < t1 ? live : label;
      figsEl.style.opacity = range(t, t1, t1 + 0.3);
    });
  };

  const thought = (t0, t1, text, label = "Approach") => {
    const n = el("section", "", `<div class="eyebrow">${label}</div><div class="thought"></div>`);
    const body = n.querySelector(".thought");
    push(t0, n, (t) => {
      body.textContent = text.slice(0, Math.floor(text.length * range(t, t0, t1)));
    });
  };

  const plan = (t0, steps) => {
    const n = el("section", "plan", `<div class="eyebrow">Plan</div><ol></ol>`);
    const ol = n.querySelector("ol");
    push(t0, n);
    for (const s of steps) {
      const li = el("li", `step${s.rev ? " rev" : ""}`, `
        <span class="state">${s.rev ? triangle(s.rev) : ""}</span>
        <span class="title">${s.title}</span>
        <span class="count"></span>
        <span class="op">${s.op}</span>
        ${s.mats?.length ? `<span class="mats">${s.mats.map(swatch).join("")}</span>` : ""}
        <span class="bar"><i></i></span>`);
      li.dataset.display = "grid";
      const count = li.querySelector(".count");
      const bar = li.querySelector(".bar i");
      const keys = s.keys || [];
      const total = keys.reduce((a, k) => a + scene.counts[k], 0);
      const done = s.done ?? Math.max(...keys.map((k) => phase[k].t1));
      const active = s.active ?? Math.min(...keys.map((k) => phase[k].t0));
      const sign = s.remove ? "−" : "";
      push(s.appear ?? t0, li, (t) => {
        const state = t >= done ? "done" : t >= active ? "active" : "pending";
        li.className = `step ${state}${s.rev ? " rev" : ""}`;
        if (keys.length) {
          let n = 0;
          for (const k of keys) {
            const p = phase[k];
            n += Math.round(scene.counts[k] * clamp01((t - p.t0) / (p.t1 - p.t0 - 0.3)));
          }
          count.textContent = state === "active" ? `${sign}${fmt(n)} / ${fmt(total)}` : `${sign}${fmt(total)}`;
          bar.style.width = `${((n / total) * 100).toFixed(1)}%`;
        } else {
          count.textContent = s.count || "";
          bar.style.width = `${(range(t, active, done) * 100).toFixed(1)}%`;
        }
      }, ol);
    }
  };

  const snapshots = [];
  const review = (t0, title, liveEnd, sheetCls, views, findings) => {
    const n = el("section", "review", `<div class="eyebrow"><span>${title}</span></div><div class="sheet ${sheetCls}"></div><ul class="findings"></ul>`);
    const label = n.querySelector(".eyebrow span");
    const sheet = n.querySelector(".sheet");
    const list = n.querySelector(".findings");
    const shots = views.map((v) => {
      const wrap = el("div", `shot ${v.cls || ""}`);
      const canvas = el("canvas");
      canvas.width = v.w;
      canvas.height = v.h;
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
      svg.setAttribute("class", "markup");
      svg.setAttribute("viewBox", `0 0 ${v.w} ${v.h}`);
      svg.setAttribute("preserveAspectRatio", "none");
      wrap.append(canvas, svg, el("span", "cap", v.label));
      sheet.appendChild(wrap);
      const s = { t: v.t, canvas, view: v, done: false, wrap, svg };
      snapshots.push(s);
      return s;
    });
    const rows = findings.map((f) => {
      const li = el("li", f.good ? "good" : "bad", `<span class="key">${f.rev ? triangle(f.rev) : CHECK}</span><span></span>`);
      list.appendChild(li);
      return { ...f, li, span: li.lastChild };
    });
    push(t0, n, (t) => {
      label.className = t < liveEnd ? "live" : "";
      for (const s of shots) {
        s.wrap.style.opacity = t >= s.t ? 1 : 0.2;
        if (s.done && !s.marked && s.pts) {
          s.marked = true;
          s.marks = (s.view.marks || []).map((m, i) => {
            const [x, y] = s.pts[i];
            const r = s.canvas.width * (s.view.cls === "wide" ? 0.07 : 0.12) * (m.scale || 1);
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
  };

  const summary = (t0, figs, actions) =>
    push(t0, el("section", "summary", `
      <div class="head">${CHECK}Build complete</div>
      <div class="figs">${figs.map((f) => `<div><div class="fig">${f.value}${f.unit ? `<small>${f.unit}</small>` : ""}</div><div class="figcap">${f.cap}</div></div>`).join("")}</div>
      <div class="actions">${actions.map((a, i) => `<span${i === 0 ? ' class="primary"' : ""}>${a}</span>`).join("")}</div>`));

  // ------------------------------------------------------------------ scene
  const scene = await createScene($("view"), S);
  const fit = () => scene.resize(innerWidth, innerHeight, $("panel").offsetWidth + 20);
  fit();
  addEventListener("resize", fit);

  const api = { $, el, push, fmt, swatch, triangle, brief, survey, thought, plan, review, summary, scene, phase, counts: scene.counts };
  S.feed(api);
  S.setup?.(api);

  // Hotbar
  const slotEls = {};
  for (const s of S.hotbar.slots) {
    const d = el("div", "slot", swatch(s));
    $("slots").appendChild(d);
    slotEls[s] = d;
  }
  const prettyName = (type) => S.hotbar.names?.[type] || type.split("_").map((w) => w[0].toUpperCase() + w.slice(1)).join(" ");
  let lastHotType = S.hotbar.slots[0];
  const usedSlots = new Set();

  const sel = S.selection;
  const cursor = $("cursor");
  const ripple = $("ripple");
  const center = (id) => {
    const r = $(id).getBoundingClientRect();
    return [r.left + r.width / 2, r.top + r.height / 2];
  };
  const inputPos = () => {
    const r = $("cmdInput").getBoundingClientRect();
    return [r.left + 120, r.top + r.height / 2 + 6];
  };
  const cursorApi = { center, inputPos, project: (p) => scene.project(p), sel };

  function cursorAt(t) {
    const path = S.cursor(t, cursorApi);
    let i = 0;
    while (i < path.length - 2 && t > path[i + 1].t) i++;
    const a = path[i], b = path[i + 1];
    const pa = a.at(), pb = b.at();
    const u = easeInOut(range(t, a.t, b.t));
    const pos = a.at === b.at ? pb : [lerp(pa[0], pb[0], u), lerp(pa[1], pb[1], u)];
    return { pos, opacity: S.cursorOpacity(t) };
  }

  const A = S.agent;
  const C = S.command;
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

    const panelK = smooth(range(t, A.panelIn[0], A.panelIn[1]));
    scene.setPanelShift(panelK);
    const panel = $("panel");
    panel.style.transform = `translateX(${((1 - panelK) * 110).toFixed(2)}%)`;
    panel.style.opacity = panelK;

    const { placed, removed, latest } = scene.update(t, cameraAt(S.camera, t));
    const box = sel.at(t);
    const da = box ? sel.dimAlpha(t) : 0;
    const anchors = scene.setSelection(box, da);
    scene.setHighlight(S.highlight?.(t) ?? null);

    for (const s of snapshots) {
      if (!s.done && t >= s.t) {
        s.pts = scene.snapshot(s.canvas, s.view, (s.view.marks || []).map((m) => m.p));
        s.done = true;
      }
    }
    if (!skipRender) scene.render();

    // Top bar
    const placedEl = $("placed");
    placedEl.style.opacity = range(t, S.placedFrom, S.placedFrom + 0.3);
    placedEl.innerHTML = `<b>+${fmt(placed)}</b> placed${removed ? `<span class="minus"><b>−${fmt(removed)}</b> removed</span>` : ""}`;
    $("fps").textContent = String(58 + ((Math.floor(t * 3) * 7919) % 4));
    $("topbar").style.opacity = S.chromeOpacity ? S.chromeOpacity(t) : 1;
    $("topbar").style.right = `${20 + (panel.offsetWidth + 20) * panelK}px`;
    $("toolbar").style.opacity = S.chromeOpacity ? S.chromeOpacity(t) : 1;

    // Toolbar
    const aiOn = t >= S.aiToolAt;
    $("aiTool").classList.toggle("active", aiOn);
    document.querySelector('[data-tool="select"]').classList.toggle("active", !aiOn);
    $("aiTip").style.opacity = range(t, S.aiToolAt, S.aiToolAt + 0.2) * (1 - range(t, S.aiToolAt + 1.1, S.aiToolAt + 1.3));

    // Dimension labels
    for (const [key, id] of [["w", "dimW"], ["d", "dimD"], ["h", "dimH"]]) {
      const node = $(id);
      node.style.opacity = da;
      if (!anchors || da <= 0) continue;
      const [x, y] = scene.project(anchors[key]);
      node.style.left = `${x}px`;
      node.style.top = `${y}px`;
      const v = key === "w" ? box.max[0] - box.min[0] : key === "d" ? box.max[2] - box.min[2] : box.max[1] - box.min[1];
      node.textContent = `${Math.round(v)} m`;
    }

    // Command bar
    const cmdIn = smooth(range(t, C.open, C.open + 0.5));
    const cmdOut = smooth(range(t, C.send + 0.05, C.send + 0.55));
    const cmd = $("command");
    cmd.style.opacity = cmdIn * (1 - cmdOut);
    cmd.style.transform = `translate(-50%, ${((1 - cmdIn) * 20 + cmdOut * 28).toFixed(1)}px)`;
    const typing = range(t, C.typing[0], C.typing[1]);
    const sent = t >= C.send;
    const text = C.prompt.slice(0, Math.floor(C.prompt.length * typing));
    const promptEl = $("promptText");
    promptEl.textContent = text || C.placeholder;
    promptEl.className = text ? "" : "placeholder";
    const focus = t >= C.focus && !sent;
    $("caret").style.opacity = focus && ((typing > 0 && typing < 1) || Math.floor(t * 2.2) % 2 === 0) ? 1 : 0;
    $("sendBtn").classList.toggle("ready", !!text);
    document.querySelector(".cmd-foot").style.opacity = range(t, C.footerAt, C.footerAt + 0.3);

    // Hotbar
    const hot = $("hotbar");
    const [h0, h1] = S.hotbar.show;
    hot.style.opacity = range(t, h0, h0 + 0.4) * (1 - range(t, h1, h1 + 0.6));
    hot.style.left = `${(innerWidth - (panel.offsetWidth + 20) * panelK) / 2}px`;
    if (latest) {
      lastHotType = latest;
      usedSlots.add(S.hotbar.slotOf[latest] || latest);
    }
    const activeSlot = S.hotbar.slotOf[lastHotType] || lastHotType;
    for (const [name, node] of Object.entries(slotEls)) {
      node.classList.toggle("active", name === activeSlot);
      node.classList.toggle("used", usedSlots.has(name) && name !== activeSlot);
    }
    $("hotName").textContent = prettyName(lastHotType);

    // Title block
    const status = A.statuses.find(([t0]) => t >= t0)[1];
    const st = $("agentStatus");
    st.className = `status${status === "Complete" ? " ok" : status === "Idle" ? "" : " busy"}`;
    st.lastChild.textContent = status;
    const elapsed = clamp01((t - A.start) / (A.done - A.start)) * (A.done - A.start);
    $("elapsed").textContent = `${Math.floor(elapsed / 60)}:${(elapsed % 60).toFixed(1).padStart(4, "0")}`;

    // Feed
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
    $("coords").textContent = S.coords(t);
    $("corner").style.opacity = S.chromeOpacity ? S.chromeOpacity(t) : 1;
    const dusk = S.env.dusk ? smooth(range(t, S.env.dusk.t0, S.env.dusk.t1)) : 0;
    const [c0, c1] = S.clock || [12 * 60, 19 * 60 + 40];
    const mins = Math.round(lerp(c0, c1, dusk));
    $("clock").textContent = `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

    // Cursor
    const c = cursorAt(t);
    cursor.style.opacity = c.opacity;
    cursor.style.transform = `translate(${c.pos[0] - 5}px, ${c.pos[1] - 3}px)`;
    const lastClick = S.clicks.filter((ct) => t >= ct).pop();
    const rp = lastClick == null ? 1 : range(t, lastClick, lastClick + 0.45);
    ripple.style.opacity = rp < 1 ? 1 - rp : 0;
    ripple.style.transform = `scale(${lerp(0.3, 1.4, rp)})`;
    const pressed = lastClick != null && t - lastClick < 0.12;
    cursor.firstElementChild.style.transform = `scale(${pressed ? 0.88 : 1})`;

    S.overlay?.(t, api);

    // Cards and fades
    $("titleCard").style.opacity = S.cards.title ? 1 - smooth(range(t, S.cards.title[0], S.cards.title[1])) : 0;
    $("endCard").style.opacity = S.cards.end ? smooth(range(t, S.cards.end, S.cards.end + 0.9)) : 0;
    $("fade").style.opacity = Math.max(1 - range(t, 0, S.cards.fadeIn ?? 0.9), range(t, S.duration - 0.6, S.duration));
  }

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
    window.__duration = S.duration;
    window.__ready = true;
    return;
  }
  const start = performance.now() - (Number(params.get("t")) || 0) * 1000;
  const loop = () => {
    frame(((performance.now() - start) / 1000) % S.duration);
    requestAnimationFrame(loop);
  };
  loop();
}
