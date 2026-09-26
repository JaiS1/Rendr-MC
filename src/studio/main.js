import "@fontsource-variable/archivo/wdth.css";
import "@fontsource/hanken-grotesk/400.css";
import "@fontsource/hanken-grotesk/500.css";
import "@fontsource/hanken-grotesk/600.css";
import "@fontsource/hanken-grotesk/700.css";
import "./studio.css";
import { run } from "./ui.js";

// ?scene=lighthouse | riverside | mountain
const scenarios = {
  lighthouse: () => import("./scenarios/lighthouse.js"),
  riverside: () => import("./scenarios/riverside.js"),
  mountain: () => import("./scenarios/mountain.js"),
};
const name = new URLSearchParams(location.search).get("scene") || "lighthouse";
const load = scenarios[name] || scenarios.lighthouse;
load().then((m) => run(m.default));
