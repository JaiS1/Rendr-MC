// Easing and timing helpers shared by every scenario. All demo motion is a
// function of time, so any frame can be rendered on its own.

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
