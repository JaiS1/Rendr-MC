import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { lerp, smooth, range, clamp01 } from "./script.js";

export const TYPES = {
  grass: { top: "grass_block_top", side: "grass_block_side", bottom: "dirt", topTint: "#7fbf55" },
  dirt: { all: "dirt" },
  coarse_dirt: { all: "coarse_dirt" },
  podzol: { top: "podzol_top", side: "podzol_side", bottom: "dirt" },
  stone: { all: "stone" },
  andesite: { all: "andesite" },
  tuff: { all: "tuff" },
  gravel: { all: "gravel" },
  snow: { all: "snow" },
  sand: { all: "sand" },
  farmland: { top: "farmland_moist", side: "dirt", bottom: "dirt" },
  water_block: { all: "water_still", tint: "#3f76e4", liquid: true },
  oak_log: { side: "oak_log", top: "oak_log_top" },
  oak_leaves: { all: "oak_leaves", tint: "#77b84f", cutout: true },
  oak_planks: { all: "oak_planks" },
  spruce_log: { side: "spruce_log", top: "spruce_log_top" },
  spruce_leaves: { all: "spruce_leaves", tint: "#5f8f55", cutout: true },
  stripped_spruce_log: { side: "stripped_spruce_log", top: "spruce_log_top" },
  hay_block: { side: "hay_block_side", top: "hay_block_top" },
  barrel: { side: "barrel_side", top: "barrel_top" },
  bookshelf: { side: "bookshelf", top: "oak_planks" },
  stone_bricks: { all: "stone_bricks" },
  mossy_cobblestone: { all: "mossy_cobblestone" },
  polished_andesite: { all: "polished_andesite" },
  polished_deepslate: { all: "polished_deepslate" },
  deepslate_bricks: { all: "deepslate_bricks" },
  deepslate_tiles: { all: "deepslate_tiles" },
  white_concrete: { all: "white_concrete" },
  red_concrete: { all: "red_concrete" },
  glass: { all: "glass", cutout: true },
  smooth_stone: { all: "smooth_stone" },
  iron_bars: { all: "iron_bars", cutout: true },
  dark_oak_planks: { all: "dark_oak_planks" },
  spruce_planks: { all: "spruce_planks" },
  cobblestone: { all: "cobblestone" },
  glowstone: { all: "glowstone", emissive: true },
  sea_lantern: { all: "sea_lantern", emissive: true },
  shroomlight: { all: "shroomlight", emissive: true },
  path: { top: "dirt_path_top", side: "dirt_path_side", bottom: "dirt", overlay: true },
};
const PLANTS = {
  short_grass: "#7fbf55",
  fern: "#6f9f55",
  poppy: null,
  dandelion: null,
  oxeye_daisy: null,
  cornflower: null,
  allium: null,
  wheat_stage7: null,
  carrots_stage3: null,
};

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function frameTexture(img, frame = 0) {
  const s = img.width;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, frame * s, s, s, 0, 0, s, s);
  const tex = new THREE.CanvasTexture(canvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestMipmapLinearFilter;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return { tex, canvas, ctx, frames: Math.max(1, Math.floor(img.height / s)), img };
}

const easeOutBack = (x) => {
  const c1 = 1.9;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

const BUILD_DUR = 0.35;
const CHUNK_DUR = 0.6;
const REMOVE_DUR = 0.3;
const HIDDEN = 0.0001;

// Where an instance sits at time t: appearing (built or streamed in), in place,
// or being removed. Returns null when it should not be drawn.
function placeAt(e, t) {
  if (t < e.t0) return null;
  let y = e.y + (e.overlay ? 1.04 : 0.5);
  let s = 1;
  if (e.mode === "build") {
    const k = clamp01((t - e.t0) / BUILD_DUR);
    s = Math.min(1.12, Math.max(HIDDEN, easeOutBack(k)));
    y += (1 - smooth(k)) * 1.6;
  } else if (e.mode === "chunk") {
    const k = clamp01((t - e.t0) / CHUNK_DUR);
    y -= (1 - smooth(k)) * 5;
  }
  if (t >= e.tr) {
    const k = clamp01((t - e.tr) / REMOVE_DUR);
    if (k >= 1) return null;
    s *= 1 - smooth(k);
    y += smooth(k) * 0.6;
  }
  return { y, s };
}

// An instance only needs a new matrix when t or the previous t touches one
// of its animation windows, or t has crossed one of them.
function needsUpdate(e, t, prev) {
  if (prev == null) return true;
  const lo = Math.min(t, prev), hi = Math.max(t, prev);
  const dur = e.mode === "build" ? BUILD_DUR : CHUNK_DUR;
  const within = (a, b) => hi >= a && lo <= b;
  return (e.t0 > -Infinity && within(e.t0, e.t0 + dur)) || (e.tr < Infinity && within(e.tr, e.tr + REMOVE_DUR));
}

export async function createScene(canvas, S) {
  const world = S.world();
  const env = S.env;

  const names = new Set(["water_still", "sand"]);
  for (const t of Object.values(TYPES))
    for (const k of ["all", "top", "side", "bottom"]) if (t[k]) names.add(t[k]);
  for (const p of Object.keys(PLANTS)) names.add(p);
  const images = {};
  await Promise.all([...names].map(async (n) => (images[n] = await loadImage(`/textures/block/${n}.png`))));
  const tex = {};
  for (const n of names) tex[n] = frameTexture(images[n]).tex;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();

  // Sky dome
  const skyU = {
    top: { value: new THREE.Color() },
    horizon: { value: new THREE.Color() },
    bottom: { value: new THREE.Color() },
    sunDir: { value: new THREE.Vector3() },
    sunColor: { value: new THREE.Color() },
  };
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(900, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: skyU,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: `varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 horizon; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; varying vec3 vDir;
        void main(){ vec3 d = normalize(vDir); float h = d.y;
          vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h,0.0,1.0), 0.55)) : mix(horizon, bottom, pow(clamp(-h,0.0,1.0), 0.4));
          float s = max(dot(d, normalize(sunDir)), 0.0);
          col += sunColor * (pow(s, 900.0) * 3.0 + pow(s, 12.0) * 0.35);
          gl_FragColor = vec4(col, 1.0); }`,
    })
  );
  sky.renderOrder = -1;
  scene.add(sky);
  scene.fog = new THREE.Fog(0xbcdcf5, ...(env.fog || [140, 380]));

  const hemi = new THREE.HemisphereLight(0xd6ecff, 0x6b5a45, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const ext = env.shadow?.extent ?? 62;
  Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 1, far: 320 });
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  sun.target.position.set(...(env.shadow?.center ?? [0, 10, 0]));

  const points = (env.lights || []).map((l) => {
    const p = new THREE.PointLight(l.color, 0, l.distance, 1.7);
    p.position.set(...l.pos);
    scene.add(p);
    return { ...l, light: p };
  });

  // Materials
  const materials = {};
  const emissiveMats = [];
  const mkMat = (name, def, face) => {
    const opts = { map: tex[name] };
    if (def.cutout) Object.assign(opts, { alphaTest: 0.35, side: THREE.DoubleSide });
    if (def.liquid) Object.assign(opts, { transparent: true, opacity: 0.85 });
    const m = new THREE.MeshLambertMaterial(opts);
    if (face === "top" && def.topTint) m.color.set(def.topTint);
    if (def.tint) m.color.set(def.tint);
    if (def.emissive) {
      m.emissive.set(0xffffff);
      m.emissiveMap = tex[name];
      m.emissiveIntensity = 0.35;
      emissiveMats.push(m);
    }
    return m;
  };
  for (const [type, def] of Object.entries(TYPES)) {
    if (def.all) materials[type] = mkMat(def.all, def);
    else {
      const side = mkMat(def.side, def, "side");
      const top = mkMat(def.top, def, "top");
      const bottom = mkMat(def.bottom || def.top, def, "bottom");
      materials[type] = [side, side, top, bottom, side, side];
    }
  }

  const boxGeo = new THREE.BoxGeometry(1, 1, 1);
  const pathGeo = new THREE.BoxGeometry(1, 0.08, 1);
  const tmp = new THREE.Object3D();
  const key3 = (b) => `${b.x},${b.y},${b.z}`;

  // Schedule builds and removals from the scenario's phases.
  const phaseOf = Object.fromEntries(S.phases.map((p) => [p.key, p]));
  const schedule = (list, p) =>
    list.map((b, i) => ({ ...b, idx: i, n: list.length, at: p.t0 + (i / Math.max(1, list.length - 1)) * (p.t1 - p.t0 - 0.3) }));
  const removeAt = new Map();
  const removals = [];
  for (const [key, list] of Object.entries(world.remove || {})) {
    for (const r of schedule(list, phaseOf[key])) {
      removeAt.set(key3(r), r.at);
      removals.push({ ...r, key });
    }
  }
  const builds = [];
  for (const [key, list] of Object.entries(world.build || {}))
    for (const b of schedule(list, phaseOf[key])) builds.push({ ...b, key });

  // Every block becomes an instance entry; only animated ones are re-posed per frame.
  const byType = {};
  const entry = (b, t0, mode) => {
    const def = TYPES[b.type];
    // A removal only applies to blocks that exist before it (terrain carved,
    // or a wall later opened into a gate), never to blocks built after it.
    const r = removeAt.get(key3(b));
    const e = { x: b.x, y: b.y, z: b.z, t0, mode, tr: r != null && r > t0 ? r : Infinity, overlay: !!def.overlay };
    (byType[b.type] ||= []).push(e);
    return e;
  };
  for (const b of world.terrain) {
    const t0 = S.reveal ? S.reveal(b) : -Infinity;
    entry(b, t0, "chunk");
  }
  for (const b of builds) entry(b, b.at, "build");

  const meshes = [];
  const addMesh = (geo, mat, entries, opts = {}) => {
    const mesh = new THREE.InstancedMesh(geo, mat, entries.length);
    // Instances start hidden, so bounds computed on the first frame would be wrong.
    mesh.frustumCulled = false;
    mesh.castShadow = opts.cast ?? true;
    mesh.receiveShadow = true;
    if (opts.renderOrder) mesh.renderOrder = opts.renderOrder;
    mesh.userData.entries = entries;
    scene.add(mesh);
    meshes.push(mesh);
    return mesh;
  };
  for (const [type, entries] of Object.entries(byType)) {
    const def = TYPES[type];
    addMesh(def.overlay ? pathGeo : boxGeo, materials[type], entries, { cast: !def.overlay && !def.liquid, renderOrder: def.liquid ? 2 : 0 });
  }

  // Plants: two crossed quads per instance
  const crossGeo = (() => {
    const g1 = new THREE.PlaneGeometry(1, 1);
    g1.rotateY(Math.PI / 4);
    const g2 = new THREE.PlaneGeometry(1, 1);
    g2.rotateY(-Math.PI / 4);
    const g = new THREE.BufferGeometry();
    const merge = (attr) =>
      new THREE.Float32BufferAttribute([...g1.attributes[attr].array, ...g2.attributes[attr].array], g1.attributes[attr].itemSize);
    g.setAttribute("position", merge("position"));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(24).fill(0).map((_, i) => (i % 3 === 1 ? 1 : 0)), 3));
    g.setAttribute("uv", merge("uv"));
    g.setIndex([0, 2, 1, 2, 3, 1, 4, 6, 5, 6, 7, 5]);
    return g;
  })();
  for (const [plant, tint] of Object.entries(PLANTS)) {
    const list = world.decor.filter((d) => d.type === plant);
    if (!list.length) continue;
    const m = new THREE.MeshLambertMaterial({ map: tex[plant], alphaTest: 0.4, side: THREE.DoubleSide });
    if (tint) m.color.set(tint);
    const entries = list.map((d) => ({
      x: d.x, y: d.y, z: d.z, mode: "chunk", t0: S.reveal ? S.reveal(d) : -Infinity,
      tr: removeAt.get(key3({ x: d.x, y: d.y - 1, z: d.z })) ?? Infinity, overlay: false,
    }));
    addMesh(crossGeo, m, entries, { cast: false });
  }

  // Blueprint ghosts (to build) and redline ghosts (to excavate).
  const ghostMat = (color) =>
    new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { color: { value: new THREE.Color(color) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; vec4 p = vec4(position, 1.0);
        #ifdef USE_INSTANCING
          p = instanceMatrix * p;
        #endif
        gl_Position = projectionMatrix * modelViewMatrix * p; }`,
      fragmentShader: `uniform vec3 color; varying vec2 vUv;
        void main(){ float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
          float line = 1.0 - smoothstep(0.035, 0.07, e);
          gl_FragColor = vec4(color, mix(0.16, 0.95, line)); }`,
    });
  const makeGhosts = (list, color, until, grow) => {
    const ghosts = list
      .map((b) => ({ ...b, tg: S.ghost?.(b), until: until(b) }))
      .filter((g) => g.tg != null);
    const mesh = new THREE.InstancedMesh(boxGeo, ghostMat(color), Math.max(1, ghosts.length));
    mesh.count = ghosts.length;
    mesh.renderOrder = 5;
    mesh.frustumCulled = false;
    scene.add(mesh);
    return { mesh, ghosts, grow };
  };
  const ghostSets = [
    makeGhosts(builds, "#8cb8f0", (b) => b.at + 0.15, 1),
    makeGhosts(removals, "#ff7a62", (r) => r.at, 1.03),
  ];

  // Water plane
  const sea = world.sea;
  const water = frameTexture(images.water_still);
  water.tex.minFilter = THREE.LinearMipmapLinearFilter;
  water.tex.wrapS = water.tex.wrapT = THREE.RepeatWrapping;
  water.tex.repeat.set(700, 700);
  const waterMat = new THREE.MeshLambertMaterial({ map: water.tex, color: 0x3f76e4, transparent: true, opacity: 0.9 });
  const waterGroup = new THREE.Group();
  if (sea != null) {
    const waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), waterMat);
    waterMesh.rotation.x = -Math.PI / 2;
    waterMesh.position.y = sea + 0.88;
    waterMesh.receiveShadow = true;
    const sandTex = frameTexture(images.sand).tex;
    sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
    sandTex.repeat.set(700, 700);
    const seabed = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ map: sandTex }));
    seabed.rotation.x = -Math.PI / 2;
    seabed.position.y = world.seabed ?? 0.99;
    waterGroup.add(waterMesh, seabed);
    scene.add(waterGroup);
  }

  // Minecraft-style clouds
  const clouds = new THREE.Group();
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, emissive: 0xffffff, emissiveIntensity: 0.35 });
  const cells = [];
  for (let x = -24; x < 24; x++)
    for (let z = -24; z < 24; z++) {
      const n = Math.sin(x * 0.7 + Math.cos(z * 0.45) * 2) + Math.cos(z * 0.6 + Math.sin(x * 0.3) * 2);
      if (n > 1.05) cells.push([x, z]);
    }
  const cloudMesh = new THREE.InstancedMesh(new THREE.BoxGeometry(12, 4, 12), cloudMat, cells.length);
  cells.forEach(([x, z], i) => {
    tmp.position.set(x * 12, 0, z * 12);
    tmp.scale.setScalar(1);
    tmp.updateMatrix();
    cloudMesh.setMatrixAt(i, tmp.matrix);
  });
  clouds.add(cloudMesh);
  clouds.position.y = env.cloudHeight ?? 78;
  scene.add(clouds);

  // Optional rotating light beams (the lighthouse)
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffe2a0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending,
    depthWrite: false, side: THREE.DoubleSide, fog: false,
  });
  const beams = new THREE.Group();
  if (env.beams) {
    const beamGeo = new THREE.ConeGeometry(9, 90, 32, 1, true);
    beamGeo.translate(0, -45, 0);
    beamGeo.rotateZ(Math.PI / 2);
    const b1 = new THREE.Mesh(beamGeo, beamMat);
    const b2 = new THREE.Mesh(beamGeo, beamMat);
    b2.rotation.y = Math.PI;
    beams.add(b1, b2);
    beams.position.set(...env.beams.pos);
    beams.visible = false;
    scene.add(beams);
  }

  // Selection (amber), detection highlight (blueprint) and the build cursor
  const wireBox = (color, fillOpacity) => {
    const g = new THREE.Group();
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
      new THREE.LineBasicMaterial({ color, transparent: true, opacity: 1, fog: false, depthTest: false })
    );
    edges.renderOrder = 10;
    const fill = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: fillOpacity, depthWrite: false, fog: false })
    );
    g.add(fill, edges);
    g.visible = false;
    g.userData = { edges, fill, fillOpacity };
    scene.add(g);
    return g;
  };
  const selection = wireBox(0xf4b64a, 0.03);
  const highlight = wireBox(0x8cb8f0, 0.05);
  const placeBox = (g, b) => {
    if (!b || (b.alpha ?? 1) <= 0.001) { g.visible = false; return; }
    const { min, max, alpha = 1 } = b;
    g.visible = true;
    g.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    g.scale.set(Math.max(0.01, max[0] - min[0]), Math.max(0.01, max[1] - min[1]), Math.max(0.01, max[2] - min[2]));
    g.userData.edges.material.opacity = alpha;
    g.userData.fill.material.opacity = g.userData.fillOpacity * alpha;
  };

  const dimGeo = new THREE.BufferGeometry();
  dimGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(3 * 2 * 3 * 7), 3));
  const dims = new THREE.LineSegments(dimGeo, new THREE.LineBasicMaterial({ color: 0xf4b64a, transparent: true, fog: false, depthTest: false }));
  dims.renderOrder = 10;
  dims.frustumCulled = false;
  scene.add(dims);

  const head = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1.08, 1.08, 1.08)),
    new THREE.LineBasicMaterial({ color: 0xf4b64a, fog: false, depthTest: false, transparent: true })
  );
  head.renderOrder = 11;
  head.visible = false;
  scene.add(head);

  // Cameras and post-processing
  const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 1200);
  const thumbCam = new THREE.PerspectiveCamera(34, 1.6, 0.5, 1200);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.15, 0.6, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let viewW = 1, viewH = 1, panelW = 0;
  function setPanelShift(k) {
    camera.setViewOffset(viewW, viewH, (panelW * k) / 2, 0, viewW, viewH);
    camera.updateProjectionMatrix();
  }
  function resize(w, h, rightPanel) {
    viewW = w; viewH = h; panelW = rightPanel;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    setPanelShift(0);
  }

  const colors = {
    dayTop: new THREE.Color("#2f78d6"), duskTop: new THREE.Color("#1a1f4d"),
    dayHor: new THREE.Color("#bcdcf5"), duskHor: new THREE.Color("#f59a5c"),
    dayBot: new THREE.Color("#8fb6d6"), duskBot: new THREE.Color("#2b2440"),
    daySun: new THREE.Color("#fff6e0"), duskSun: new THREE.Color("#ff8a3d"),
    dayHemi: new THREE.Color("#d6ecff"), duskHemi: new THREE.Color("#7078c0"),
    dayLight: new THREE.Color("#fff1dc"), duskLight: new THREE.Color("#ff9d5c"),
    dayFog: new THREE.Color("#bcdcf5"), duskFog: new THREE.Color("#c9766a"),
  };
  const mix = (a, b, k, out) => out.copy(a).lerp(b, k);
  const deepWater = new THREE.Color("#2a3f7a");
  const sunCfg = env.sun || { az: -0.55, el: 0.95, duskAz: -1.35, duskEl: 0.12 };
  const events = [...builds.map((b) => ({ t: b.at, b, kind: "build" })), ...removals.map((r) => ({ t: r.at, b: r, kind: "remove" }))].sort((a, b) => a.t - b.t);

  let lastWaterFrame = -1;
  let prevT = null;
  const v = new THREE.Vector3();

  function update(t, cam) {
    for (const mesh of meshes) {
      const entries = mesh.userData.entries;
      let dirty = false;
      for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (!needsUpdate(e, t, prevT)) continue;
        const p = placeAt(e, t);
        tmp.position.set(e.x + 0.5, p ? p.y : -999, e.z + 0.5);
        tmp.scale.setScalar(p ? p.s : HIDDEN);
        tmp.updateMatrix();
        mesh.setMatrixAt(i, tmp.matrix);
        dirty = true;
      }
      if (dirty) mesh.instanceMatrix.needsUpdate = true;
    }
    for (const { mesh, ghosts, grow } of ghostSets) {
      ghosts.forEach((g, i) => {
        const k = clamp01((t - g.tg) / 0.25);
        const s = k <= 0 || t >= g.until ? HIDDEN : (0.6 + 0.4 * smooth(k)) * grow;
        const ov = TYPES[g.type]?.overlay;
        tmp.position.set(g.x + 0.5, g.y + (ov ? 1.04 : 0.5), g.z + 0.5);
        tmp.scale.set(s, ov ? s * 0.08 : s, s);
        tmp.updateMatrix();
        mesh.setMatrixAt(i, tmp.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    prevT = t;

    let placed = 0, removed = 0, latest = null;
    for (const ev of events) {
      if (ev.t > t) break;
      if (ev.kind === "build") placed++;
      else removed++;
      latest = ev;
    }
    const active = S.phases.some((p) => t >= p.t0 && t <= p.t1 + 0.2);
    head.visible = !!latest && active;
    if (latest) head.position.set(latest.b.x + 0.5, latest.b.y + 0.5 + (TYPES[latest.b.type]?.overlay ? 0.55 : 0), latest.b.z + 0.5);
    head.material.color.set(latest?.kind === "remove" ? 0xff7a62 : 0xf4b64a);

    // Time of day
    const d = env.dusk ? smooth(range(t, env.dusk.t0, env.dusk.t1)) : 0;
    mix(colors.dayTop, colors.duskTop, d, skyU.top.value);
    mix(colors.dayHor, colors.duskHor, d, skyU.horizon.value);
    mix(colors.dayBot, colors.duskBot, d, skyU.bottom.value);
    mix(colors.daySun, colors.duskSun, d, skyU.sunColor.value);
    mix(colors.dayFog, colors.duskFog, d, scene.fog.color);
    mix(colors.dayHemi, colors.duskHemi, d, hemi.color);
    mix(colors.dayLight, colors.duskLight, d, sun.color);
    hemi.intensity = lerp(1.25, 0.45, d);
    sun.intensity = lerp(2.4, 1.1, d);
    const sunAz = lerp(sunCfg.az, sunCfg.duskAz, d);
    const sunEl = lerp(sunCfg.el, sunCfg.duskEl, d);
    v.set(Math.cos(sunEl) * Math.sin(sunAz), Math.sin(sunEl), Math.cos(sunEl) * Math.cos(sunAz));
    skyU.sunDir.value.copy(v);
    sun.position.copy(v).multiplyScalar(140).add(sun.target.position);
    renderer.toneMappingExposure = lerp(1.05, 1.15, d);
    for (const m of emissiveMats) m.emissiveIntensity = lerp(0.35, 2.4, d);
    for (const p of points) p.light.intensity = lerp(0, p.intensity, d) * (t > (p.after ?? 0) ? 1 : 0);
    if (env.beams) {
      beams.visible = d > 0.01 && t > env.beams.after;
      beamMat.opacity = 0.13 * d;
      beams.rotation.y = t * 0.9;
    }
    bloom.strength = lerp(0.12, 0.85, d);
    bloom.enabled = d > 0.001;
    waterMat.color.set(0x3f76e4).lerp(deepWater, d * 0.6);
    if (sea != null) waterGroup.visible = t >= (env.waterFrom ?? -Infinity);

    // Water animation
    const wf = Math.floor(t * 12) % water.frames;
    if (wf !== lastWaterFrame) {
      const s = water.img.width;
      water.ctx.globalAlpha = 1;
      water.ctx.fillStyle = "#b8b8b8";
      water.ctx.fillRect(0, 0, s, s);
      water.ctx.globalAlpha = 0.45;
      water.ctx.drawImage(water.img, 0, wf * s, s, s, 0, 0, s, s);
      water.tex.needsUpdate = true;
      lastWaterFrame = wf;
    }
    clouds.position.x = -60 + t * 1.6;

    camera.position.copy(cam.position);
    camera.lookAt(cam.target);
    sky.position.copy(camera.position);
    return {
      placed, removed,
      latest: active && latest?.kind === "build" ? latest.b.type : null,
    };
  }

  // Architectural dimension lines: extension lines, a dimension line, and
  // 45-degree ticks at each end. Returns label anchors for the overlay.
  function setDims(b, alpha) {
    const { min, max } = b;
    const o = 1.6, e = 0.5, tk = 0.45;
    const arr = dimGeo.attributes.position.array;
    let i = 0;
    const seg = (a, c) => { arr.set(a, i); arr.set(c, i + 3); i += 6; };
    const dim = (a, c, ext, tick) => {
      const A = a.map((q, j) => q + ext[j]), B = c.map((q, j) => q + ext[j]);
      seg(a.map((q, j) => q + ext[j] * 0.15), a.map((q, j) => q + ext[j] * (1 + e / o)));
      seg(c.map((q, j) => q + ext[j] * 0.15), c.map((q, j) => q + ext[j] * (1 + e / o)));
      seg(A, B);
      seg(A.map((q, j) => q - tick[j]), A.map((q, j) => q + tick[j]));
      seg(B.map((q, j) => q - tick[j]), B.map((q, j) => q + tick[j]));
      return A.map((q, j) => (q + B[j]) / 2);
    };
    const labels = {
      w: dim([min[0], min[1], max[2]], [max[0], min[1], max[2]], [0, 0, o], [tk, 0, tk]),
      d: dim([max[0], min[1], min[2]], [max[0], min[1], max[2]], [o, 0, 0], [tk, 0, tk]),
      h: dim([max[0], min[1], max[2]], [max[0], max[1], max[2]], [o, 0, o], [tk, tk, 0]),
    };
    arr.fill(0, i);
    dimGeo.attributes.position.needsUpdate = true;
    dims.material.opacity = alpha;
    dims.visible = alpha > 0.01;
    return labels;
  }

  function setSelection(b, dimAlpha = 0) {
    placeBox(selection, b);
    if (!b) { dims.visible = false; return null; }
    return setDims(b, dimAlpha);
  }

  function setHighlight(b) {
    placeBox(highlight, b);
  }

  function render() {
    composer.render();
  }

  // Renders a still from another viewpoint into a 2D canvas (the agent's
  // "screenshot" for self-review). Returns projected points for annotations.
  function snapshot(out, view, pts = []) {
    thumbCam.aspect = out.width / out.height;
    thumbCam.fov = view.fov || 30;
    thumbCam.updateProjectionMatrix();
    thumbCam.position.set(...view.position);
    thumbCam.lookAt(...view.target);
    const size = renderer.getSize(new THREE.Vector2());
    const pr = renderer.getPixelRatio();
    const w = Math.round(out.width), h = Math.round(out.height);
    renderer.setPixelRatio(1);
    renderer.setSize(w * 2, h * 2, false);
    sky.position.copy(thumbCam.position);
    const hide = [selection, highlight, head, dims, ...ghostSets.map((g) => g.mesh)];
    const was = hide.map((o) => o.visible);
    hide.forEach((o) => (o.visible = false));
    renderer.render(scene, thumbCam);
    out.getContext("2d").drawImage(renderer.domElement, 0, 0, w * 2, h * 2, 0, 0, w, h);
    hide.forEach((o, i) => (o.visible = was[i]));
    renderer.setPixelRatio(pr);
    renderer.setSize(size.x, size.y, false);
    composer.setSize(size.x, size.y);
    return pts.map((p) => {
      v.set(...p).project(thumbCam);
      return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h];
    });
  }

  function project(p) {
    v.set(...p).project(camera);
    return [((v.x + 1) / 2) * viewW, ((1 - v.y) / 2) * viewH];
  }

  const counts = {};
  for (const [k, l] of Object.entries(world.build || {})) counts[k] = l.length;
  for (const [k, l] of Object.entries(world.remove || {})) counts[k] = l.length;
  return { resize, update, render, setSelection, setHighlight, setPanelShift, snapshot, project, counts, world };
}
