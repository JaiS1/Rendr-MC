// The demo's script: every time-dependent value in the video comes from here,
// so a frame can be rendered for any t (the recorder steps t frame by frame).

export const DURATION = 45;

export const PROMPT =
  "Build a red-and-white lighthouse on this cliff, with a small keeper's cottage.";

// Build phases: which block list animates in, and over what time window.
export const PHASES = [
  { key: "foundation", t0: 14.3, t1: 15.3 },
  { key: "tower", t0: 15.8, t1: 20.3 },
  { key: "lantern", t0: 20.8, t1: 22.4 },
  { key: "roof", t0: 22.6, t1: 23.4 },
  { key: "cottage", t0: 24.0, t1: 27.3 },
  { key: "lanternCore", t0: 31.1, t1: 31.6 },
  { key: "path", t0: 32.0, t1: 33.0 },
];

export const DUSK = { t0: 34.5, t1: 39.5 };
export const END_CARD = 40.6;
export const TITLE_OUT = { t0: 2.4, t1: 3.2 };

export const clamp01 = (x) => Math.min(1, Math.max(0, x));
export const smooth = (x) => {
  const t = clamp01(x);
  return t * t * (3 - 2 * t);
};
export const easeInOut = (x) => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
};
export const range = (t, a, b) => clamp01((t - a) / (b - a));
export const lerp = (a, b, k) => a + (b - a) * k;
