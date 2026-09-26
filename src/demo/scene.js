import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { buildWorld, C, G, SEA } from "./world.js";
import { PHASES, DUSK, lerp, smooth, range, clamp01 } from "./script.js";

const TYPES = {
  grass: { top: "grass_block_top", side: "grass_block_side", bottom: "dirt", topTint: "#7fbf55" },
  dirt: { all: "dirt" },
  stone: { all: "stone" },
  sand: { all: "sand" },
  oak_log: { side: "oak_log", top: "oak_log_top" },
  oak_leaves: { all: "oak_leaves", tint: "#77b84f", cutout: true },
  stone_bricks: { all: "stone_bricks" },
  polished_andesite: { all: "polished_andesite" },
  white_concrete: { all: "white_concrete" },
  red_concrete: { all: "red_concrete" },
  glass: { all: "glass", cutout: true },
  smooth_stone: { all: "smooth_stone" },
  iron_bars: { all: "iron_bars", cutout: true },
  dark_oak_planks: { all: "dark_oak_planks" },
  spruce_planks: { all: "spruce_planks" },
  spruce_log: { side: "spruce_log", top: "spruce_log_top" },
  cobblestone: { all: "cobblestone" },
  glowstone: { all: "glowstone", emissive: true },
  sea_lantern: { all: "sea_lantern", emissive: true },
  path: { top: "dirt_path_top", side: "dirt_path_side", bottom: "dirt", overlay: true },
};
const PLANTS = {
  short_grass: "#7fbf55",
  poppy: null,
  dandelion: null,
  oxeye_daisy: null,
  cornflower: null,
  allium: null,
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

export async function createScene(canvas) {
  const names = new Set(["water_still"]);
  for (const t of Object.values(TYPES))
    for (const k of ["all", "top", "side", "bottom"]) if (t[k]) names.add(t[k]);
  for (const p of Object.keys(PLANTS)) names.add(p);
  const images = {};
  await Promise.all(
    [...names].map(async (n) => (images[n] = await loadImage(`/textures/block/${n}.png`)))
  );
  const tex = {};
  for (const n of names) if (n !== "water_still") tex[n] = frameTexture(images[n]).tex;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  const world = buildWorld();

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
  scene.fog = new THREE.Fog(0xbcdcf5, 140, 380);

  const hemi = new THREE.HemisphereLight(0xd6ecff, 0x6b5a45, 1.25);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const sc = sun.shadow.camera;
  sc.left = -62; sc.right = 62; sc.top = 62; sc.bottom = -62; sc.near = 1; sc.far = 260;
  sun.shadow.bias = -0.0006;
  sun.shadow.normalBias = 0.03;
  scene.add(sun, sun.target);
  sun.target.position.set(0, 10, 0);

  const lampLight = new THREE.PointLight(0xffd48a, 0, 60, 1.6);
  lampLight.position.set(C.x + 0.5, G + 23.5, C.z + 0.5);
  scene.add(lampLight);
  const cottageLight = new THREE.PointLight(0xffb86b, 0, 14, 1.8);
  cottageLight.position.set(C.x - 9, G + 3, C.z + 1.5);
  scene.add(cottageLight);

  // Materials
  const materials = {};
  const emissiveMats = [];
  const mkMat = (name, def, face) => {
    const opts = { map: tex[name] };
    if (def.cutout) Object.assign(opts, { alphaTest: 0.35, side: THREE.DoubleSide });
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

  // Group instances by type; build blocks keep a schedule for animation.
  const phaseTimes = Object.fromEntries(PHASES.map((p) => [p.key, p]));
  const byType = {};
  const add = (b, t0) => {
    (byType[b.type] ||= { stat: [], build: [] })[t0 == null ? "stat" : "build"].push({ ...b, t0 });
  };
  for (const b of world.terrain) add(b);
  const buildOrder = [];
  for (const [key, list] of Object.entries(world.build)) {
    const p = phaseTimes[key];
    list.forEach((b, i) => {
      const t0 = p.t0 + (i / Math.max(1, list.length - 1)) * (p.t1 - p.t0 - 0.3);
      add(b, t0);
      buildOrder.push({ ...b, t0 });
    });
  }
  buildOrder.sort((a, b) => a.t0 - b.t0);

  // Blueprint ghost: the agent's plan drawn in the world before blocks land.
  const late = new Set(["lanternCore", "path"]);
  const ghosts = [];
  for (const [key, list] of Object.entries(world.build)) {
    const p = phaseTimes[key];
    list.forEach((b, i) => {
      const src = byType[b.type].build.find((x) => x.x === b.x && x.y === b.y && x.z === b.z);
      const tg = late.has(key)
        ? p.t0 - 0.9 + (i / list.length) * 0.5
        : 12.5 + ((b.y - G) / 28) * 1.3 + ((b.x + b.z) & 3) * 0.03;
      ghosts.push({ ...b, tg, t0: src.t0, overlay: TYPES[b.type].overlay });
    });
  }
  const ghostMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: { color: { value: new THREE.Color("#8cb8f0") }, opacity: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; vec4 p = vec4(position, 1.0);
      #ifdef USE_INSTANCING
        p = instanceMatrix * p;
      #endif
      gl_Position = projectionMatrix * modelViewMatrix * p; }`,
    fragmentShader: `uniform vec3 color; uniform float opacity; varying vec2 vUv;
      void main(){ float e = min(min(vUv.x, 1.0 - vUv.x), min(vUv.y, 1.0 - vUv.y));
        float line = 1.0 - smoothstep(0.035, 0.07, e);
        gl_FragColor = vec4(color, mix(0.16, 0.95, line) * opacity); }`,
  });
  const ghostMesh = new THREE.InstancedMesh(boxGeo, ghostMat, ghosts.length);
  ghostMesh.renderOrder = 5;
  ghostMesh.frustumCulled = false;

  const meshes = [];
  for (const [type, { stat, build }] of Object.entries(byType)) {
    const def = TYPES[type];
    const mesh = new THREE.InstancedMesh(def.overlay ? pathGeo : boxGeo, materials[type], stat.length + build.length);
    mesh.castShadow = !def.overlay;
    mesh.receiveShadow = true;
    stat.forEach((b, i) => {
      tmp.position.set(b.x + 0.5, b.y + 0.5, b.z + 0.5);
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.userData = { def, build, offset: stat.length };
    scene.add(mesh);
    meshes.push(mesh);
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
    const m = new THREE.MeshLambertMaterial({ map: tex[plant], alphaTest: 0.4, side: THREE.DoubleSide });
    if (tint) m.color.set(tint);
    const mesh = new THREE.InstancedMesh(crossGeo, m, list.length);
    list.forEach((d, i) => {
      tmp.position.set(d.x + 0.5, d.y + 0.5, d.z + 0.5);
      tmp.scale.setScalar(1);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.receiveShadow = true;
    scene.add(mesh);
  }

  // Water: animated still-water frames on a large plane
  const water = frameTexture(images.water_still);
  water.tex.minFilter = THREE.LinearMipmapLinearFilter;
  water.tex.wrapS = water.tex.wrapT = THREE.RepeatWrapping;
  water.tex.repeat.set(700, 700);
  const waterMat = new THREE.MeshLambertMaterial({
    map: water.tex,
    color: 0x3f76e4,
    transparent: true,
    opacity: 0.9,
  });
  const waterMesh = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), waterMat);
  waterMesh.rotation.x = -Math.PI / 2;
  waterMesh.position.y = SEA + 0.88;
  waterMesh.receiveShadow = true;
  scene.add(waterMesh);
  const sandTex = frameTexture(images.sand).tex;
  sandTex.wrapS = sandTex.wrapT = THREE.RepeatWrapping;
  sandTex.repeat.set(700, 700);
  const seabed = new THREE.Mesh(new THREE.PlaneGeometry(700, 700), new THREE.MeshLambertMaterial({ map: sandTex }));
  seabed.rotation.x = -Math.PI / 2;
  seabed.position.y = 0.99;
  scene.add(seabed);

  // Minecraft-style clouds
  const clouds = new THREE.Group();
  const cloudMat = new THREE.MeshLambertMaterial({ color: 0xffffff, transparent: true, opacity: 0.85, emissive: 0xffffff, emissiveIntensity: 0.35 });
  const cloudGeo = new THREE.BoxGeometry(12, 4, 12);
  const cells = [];
  for (let x = -24; x < 24; x++)
    for (let z = -24; z < 24; z++) {
      const n = Math.sin(x * 0.7 + Math.cos(z * 0.45) * 2) + Math.cos(z * 0.6 + Math.sin(x * 0.3) * 2);
      if (n > 1.05) cells.push([x, z]);
    }
  const cloudMesh = new THREE.InstancedMesh(cloudGeo, cloudMat, cells.length);
  cells.forEach(([x, z], i) => {
    tmp.position.set(x * 12, 0, z * 12);
    tmp.scale.setScalar(1);
    tmp.updateMatrix();
    cloudMesh.setMatrixAt(i, tmp.matrix);
  });
  clouds.add(cloudMesh);
  clouds.position.y = 78;
  scene.add(clouds);

  // Lighthouse beams
  const beamGeo = new THREE.ConeGeometry(9, 90, 32, 1, true);
  beamGeo.translate(0, -45, 0);
  beamGeo.rotateZ(Math.PI / 2);
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0xffe2a0,
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  const beams = new THREE.Group();
  const b1 = new THREE.Mesh(beamGeo, beamMat);
  const b2 = new THREE.Mesh(beamGeo, beamMat);
  b2.rotation.y = Math.PI;
  beams.add(b1, b2);
  beams.position.copy(lampLight.position);
  beams.visible = false;
  scene.add(beams);
  scene.add(ghostMesh);

  // Selection box (WorldEdit-style) and the build "cursor" cube
  const selection = new THREE.Group();
  const selEdges = new THREE.LineSegments(
    new THREE.EdgesGeometry(new THREE.BoxGeometry(1, 1, 1)),
    new THREE.LineBasicMaterial({ color: 0xf4b64a, transparent: true, opacity: 1, fog: false, depthTest: false })
  );
  selEdges.renderOrder = 10;
  const selFill = new THREE.Mesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xf4b64a, transparent: true, opacity: 0.08, depthWrite: false, fog: false })
  );
  selection.add(selFill, selEdges);
  selection.visible = false;
  scene.add(selection);

  const dimGeo = new THREE.BufferGeometry();
  dimGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(3 * 2 * 3 * 7), 3));
  const dims = new THREE.LineSegments(
    dimGeo,
    new THREE.LineBasicMaterial({ color: 0xf4b64a, transparent: true, fog: false, depthTest: false })
  );
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

  // Cameras
  const camera = new THREE.PerspectiveCamera(34, 1, 0.5, 1200);
  const thumbCam = new THREE.PerspectiveCamera(34, 1.6, 0.5, 1200);

  // Post-processing
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
    // Shift the optical centre left so the scene is framed beside the panel.
    camera.setViewOffset(w, h, rightPanel / 2, 0, w, h);
    camera.updateProjectionMatrix();
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

  let lastWaterFrame = -1;
  const v = new THREE.Vector3();

  function update(t, cam) {
    // Build animation
    let latest = null;
    for (const mesh of meshes) {
      const { def, build, offset } = mesh.userData;
      if (!build.length) continue;
      build.forEach((b, i) => {
        const k = clamp01((t - b.t0) / 0.35);
        const s = k <= 0 ? 0.0001 : Math.max(0.0001, easeOutBack(k));
        tmp.position.set(b.x + 0.5, b.y + (def.overlay ? 1.04 : 0.5) + (1 - smooth(k)) * 1.6, b.z + 0.5);
        tmp.scale.setScalar(Math.min(s, 1.12));
        tmp.updateMatrix();
        mesh.setMatrixAt(offset + i, tmp.matrix);
      });
      mesh.instanceMatrix.needsUpdate = true;
    }
    ghosts.forEach((g, i) => {
      const k = clamp01((t - g.tg) / 0.25);
      const gone = t >= g.t0 + 0.15;
      const s = k <= 0 || gone ? 0.0001 : 0.6 + 0.4 * smooth(k);
      tmp.position.set(g.x + 0.5, g.y + (g.overlay ? 1.04 : 0.5), g.z + 0.5);
      tmp.scale.set(s, g.overlay ? s * 0.08 : s, s);
      tmp.updateMatrix();
      ghostMesh.setMatrixAt(i, tmp.matrix);
    });
    ghostMesh.instanceMatrix.needsUpdate = true;
    let placed = 0;
    for (const b of buildOrder) {
      if (b.t0 <= t) { placed++; latest = b; } else break;
    }
    const building = PHASES.some((p) => t >= p.t0 && t <= p.t1 + 0.2);
    head.visible = !!latest && building;
    if (latest) head.position.set(latest.x + 0.5, latest.y + 0.5 + (TYPES[latest.type].overlay ? 0.55 : 0), latest.z + 0.5);

    // Time of day
    const d = smooth(range(t, DUSK.t0, DUSK.t1));
    mix(colors.dayTop, colors.duskTop, d, skyU.top.value);
    mix(colors.dayHor, colors.duskHor, d, skyU.horizon.value);
    mix(colors.dayBot, colors.duskBot, d, skyU.bottom.value);
    mix(colors.daySun, colors.duskSun, d, skyU.sunColor.value);
    mix(colors.dayFog, colors.duskFog, d, scene.fog.color);
    mix(colors.dayHemi, colors.duskHemi, d, hemi.color);
    mix(colors.dayLight, colors.duskLight, d, sun.color);
    hemi.intensity = lerp(1.25, 0.45, d);
    sun.intensity = lerp(2.4, 1.1, d);
    const sunAz = lerp(-0.55, -1.35, d);
    const sunEl = lerp(0.95, 0.12, d);
    v.set(Math.cos(sunEl) * Math.sin(sunAz), Math.sin(sunEl), Math.cos(sunEl) * Math.cos(sunAz));
    skyU.sunDir.value.copy(v);
    sun.position.copy(v).multiplyScalar(120).add(sun.target.position);
    renderer.toneMappingExposure = lerp(1.05, 1.15, d);
    for (const m of emissiveMats) m.emissiveIntensity = lerp(0.35, 2.4, d);
    lampLight.intensity = lerp(0, 90, d) * (t > PHASES[5].t0 ? 1 : 0);
    cottageLight.intensity = lerp(0, 6, d);
    beams.visible = d > 0.01;
    beamMat.opacity = 0.13 * d;
    beams.rotation.y = t * 0.9;
    bloom.strength = lerp(0.12, 0.85, d);
    bloom.enabled = d > 0.001;
    waterMat.color.set(0x3f76e4).lerp(new THREE.Color("#2a3f7a"), d * 0.6);

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

    // Camera
    camera.position.copy(cam.position);
    camera.lookAt(cam.target);
    sky.position.copy(camera.position);
    return { placed, total: buildOrder.length, latest: building && latest ? latest.type : null };
  }

  // Architectural dimension lines: extension lines, a dimension line, and
  // 45-degree ticks at each end. Returns label anchors for the overlay.
  function setDims(box, alpha) {
    const { min, max } = box;
    const o = 1.6, e = 0.5, tk = 0.45;
    const arr = dimGeo.attributes.position.array;
    let i = 0;
    const seg = (a, b) => { arr.set(a, i); arr.set(b, i + 3); i += 6; };
    const dim = (a, b, ext, tick) => {
      const A = a.map((v, j) => v + ext[j]), B = b.map((v, j) => v + ext[j]);
      seg(a.map((v, j) => v + ext[j] * 0.15), a.map((v, j) => v + ext[j] * (1 + e / o)));
      seg(b.map((v, j) => v + ext[j] * 0.15), b.map((v, j) => v + ext[j] * (1 + e / o)));
      seg(A, B);
      seg(A.map((v, j) => v - tick[j]), A.map((v, j) => v + tick[j]));
      seg(B.map((v, j) => v - tick[j]), B.map((v, j) => v + tick[j]));
      return A.map((v, j) => (v + B[j]) / 2);
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

  function setSelection(box, dimAlpha = 0) {
    if (!box) { selection.visible = false; dims.visible = false; return null; }
    const { min, max, alpha = 1 } = box;
    selection.visible = true;
    selection.position.set((min[0] + max[0]) / 2, (min[1] + max[1]) / 2, (min[2] + max[2]) / 2);
    selection.scale.set(Math.max(0.01, max[0] - min[0]), Math.max(0.01, max[1] - min[1]), Math.max(0.01, max[2] - min[2]));
    selEdges.material.opacity = alpha;
    selFill.material.opacity = 0.03 * alpha;
    return setDims(box, dimAlpha);
  }

  function render() {
    composer.render();
  }

  // Renders a still from another viewpoint into a 2D canvas (the agent's
  // "screenshot" for self-review). Returns projected points for annotations.
  function snapshot(out, view, points = []) {
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
    const selWas = selection.visible, headWas = head.visible, dimsWas = dims.visible;
    selection.visible = head.visible = dims.visible = false;
    renderer.render(scene, thumbCam);
    const ctx = out.getContext("2d");
    ctx.drawImage(renderer.domElement, 0, 0, w * 2, h * 2, 0, 0, w, h);
    selection.visible = selWas; head.visible = headWas; dims.visible = dimsWas;
    renderer.setPixelRatio(pr);
    renderer.setSize(size.x, size.y, false);
    composer.setSize(size.x, size.y);
    return points.map((p) => {
      v.set(...p).project(thumbCam);
      return [((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h];
    });
  }

  function project(p) {
    v.set(...p).project(camera);
    return [((v.x + 1) / 2) * viewW, ((1 - v.y) / 2) * viewH];
  }

  const counts = Object.fromEntries(Object.entries(world.build).map(([k, l]) => [k, l.length]));
  return { resize, update, render, setSelection, setPanelShift, snapshot, project, counts };
}
