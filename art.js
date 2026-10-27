// Drawing code for every object kind. Each drawing works in "unit space":
// the object's characteristic size spans [-0.5, 0.5]. Loaded before app.js.
"use strict";

const TAU = Math.PI * 2;

// ---------- utilities ----------
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
function hash(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seed) {
  let a = seed;
  return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const gauss = (r) => (r() + r() + r() + r() - 2) / 2;
function rgbOf(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function rgba(hex, a) { const [r, g, b] = rgbOf(hex); return `rgba(${r},${g},${b},${a})`; }
function shadeHex(hex, amt) {
  return "#" + shade(hex, amt).match(/\d+/g).map((v) => (+v).toString(16).padStart(2, "0")).join("");
}
function shade(hex, amt) {
  let [r, g, b] = rgbOf(hex);
  if (amt >= 0) { r += (255 - r) * amt; g += (255 - g) * amt; b += (255 - b) * amt; }
  else { r *= 1 + amt; g *= 1 + amt; b *= 1 + amt; }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

// ---------- shape helpers (unit space: object box is [-0.5, 0.5]) ----------
function ball(c, col, R = 0.5, x = 0, y = 0) {
  const g = c.createRadialGradient(x - R * 0.35, y - R * 0.4, R * 0.05, x, y, R);
  g.addColorStop(0, shade(col, 0.45));
  g.addColorStop(0.55, col);
  g.addColorStop(1, shade(col, -0.55));
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, R, 0, TAU); c.fill();
}
function limbShade(c, R = 0.5) {
  const g = c.createRadialGradient(-R * 0.3, -R * 0.3, 0, 0, 0, R);
  g.addColorStop(0, "rgba(255,255,255,0.22)");
  g.addColorStop(0.55, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.6)");
  c.fillStyle = g;
  c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
}
function lumpy(c, r, R, amp, x = 0, y = 0) {
  const ph = [r() * TAU, r() * TAU, r() * TAU];
  const f = [2 + ((r() * 3) | 0), 5 + ((r() * 3) | 0), 9 + ((r() * 3) | 0)];
  c.beginPath();
  for (let i = 0; i <= 72; i++) {
    const t = (i / 72) * TAU;
    const rr = R * (1 + amp * (Math.sin(f[0] * t + ph[0]) * 0.55 + Math.sin(f[1] * t + ph[1]) * 0.3 + Math.sin(f[2] * t + ph[2]) * 0.15));
    const px = x + Math.cos(t) * rr, py = y + Math.sin(t) * rr;
    i ? c.lineTo(px, py) : c.moveTo(px, py);
  }
  c.closePath();
}
function glow(c, col, R, a = 0.6, x = 0, y = 0) {
  const g = c.createRadialGradient(x, y, 0, x, y, R);
  g.addColorStop(0, rgba(col, a));
  g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g;
  c.beginPath(); c.arc(x, y, R, 0, TAU); c.fill();
}
function rrect(c, x, y, w, h, rad) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, rad) : c.rect(x, y, w, h); }
function craters(c, r, col, n, R = 0.5) {
  c.save(); c.beginPath(); c.arc(0, 0, R, 0, TAU); c.clip();
  for (let i = 0; i < n; i++) {
    const a = r() * TAU, d = Math.sqrt(r()) * R * 0.9, cr = R * (0.03 + r() * r() * 0.16);
    const x = Math.cos(a) * d, y = Math.sin(a) * d;
    c.fillStyle = shade(col, -0.25); c.beginPath(); c.arc(x, y, cr, 0, TAU); c.fill();
    c.fillStyle = shade(col, 0.15); c.beginPath(); c.arc(x - cr * 0.15, y - cr * 0.15, cr * 0.8, 0, TAU); c.fill();
    c.fillStyle = shade(col, -0.12); c.beginPath(); c.arc(x + cr * 0.1, y + cr * 0.1, cr * 0.7, 0, TAU); c.fill();
  }
  c.restore();
}
function edgeFade(c, R = 0.5) {
  c.globalCompositeOperation = "destination-in";
  const g = c.createRadialGradient(0, 0, R * 0.55, 0, 0, R);
  g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
  c.fillStyle = g; c.fillRect(-1, -1, 2, 2);
  c.globalCompositeOperation = "source-over";
}
function dots(c, pts, col) {
  for (const [x, y, s, a] of pts) { c.fillStyle = rgba(col, a); c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill(); }
}

// ---------- procedural textures ----------
const PERM = (() => {
  const r = rng(1337), a = [...Array(256).keys()], p = new Uint8Array(512);
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; }
  for (let i = 0; i < 512; i++) p[i] = a[i & 255];
  return p;
})();
const NVAL = (() => { const r = rng(7), v = new Float32Array(256); for (let i = 0; i < 256; i++) v[i] = r(); return v; })();
function noise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const X = xi & 255, Y = yi & 255, Z = zi & 255;
  const h = (a, b, c) => NVAL[PERM[a + PERM[b + PERM[c]]]];
  const l = (a, b, t) => a + (b - a) * t;
  return l(
    l(l(h(X, Y, Z), h(X + 1, Y, Z), u), l(h(X, Y + 1, Z), h(X + 1, Y + 1, Z), u), v),
    l(l(h(X, Y, Z + 1), h(X + 1, Y, Z + 1), u), l(h(X, Y + 1, Z + 1), h(X + 1, Y + 1, Z + 1), u), v), w);
}
function fbm(x, y, z, oct = 5) {
  let s = 0, a = 0.5, n = 0;
  for (let i = 0; i < oct; i++) { s += a * noise3(x, y, z); n += a; x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; }
  return s / n;
}
const mix = (a, b, t) => a + (b - a) * t;
function mixInto(out, c1, c2, t) { out[0] = mix(c1[0], c2[0], t); out[1] = mix(c1[1], c2[1], t); out[2] = mix(c1[2], c2[2], t); return out; }
// color ramp: stops = [[pos, "#hex"], ...] sorted by pos
function ramp(stops) {
  const s = stops.map(([p, h]) => [p, rgbOf(h)]);
  return (t, out) => {
    if (t <= s[0][0]) return mixInto(out, s[0][1], s[0][1], 0);
    for (let i = 1; i < s.length; i++) if (t <= s[i][0]) return mixInto(out, s[i - 1][1], s[i][1], (t - s[i - 1][0]) / (s[i][0] - s[i - 1][0]));
    return mixInto(out, s[s.length - 1][1], s[s.length - 1][1], 0);
  };
}
// Random craters on a unit sphere, each [cx, cy, cz, radius], bucketed into a
// coarse 3D grid so shading a pixel only tests the craters near it.
const CGRID = 8;
const cell = (v) => clamp(Math.floor((v + 1) / 2 * CGRID), 0, CGRID - 1);
function makeCraters(r, n, big = 0.25) {
  const grid = Array.from({ length: CGRID ** 3 }, () => []);
  for (let i = 0; i < n; i++) {
    const z = r() * 2 - 1, a = r() * TAU, s = Math.sqrt(1 - z * z);
    const cr = [Math.cos(a) * s, Math.sin(a) * s, z, 0.015 + Math.pow(r(), 3.2) * big];
    const ext = cr[3] * 1.25;
    for (let ix = cell(cr[0] - ext); ix <= cell(cr[0] + ext); ix++)
      for (let iy = cell(cr[1] - ext); iy <= cell(cr[1] + ext); iy++)
        for (let iz = cell(cr[2] - ext); iz <= cell(cr[2] + ext); iz++) grid[(ix * CGRID + iy) * CGRID + iz].push(cr);
  }
  return grid;
}
const LIGHT = (() => { const v = [-0.5, -0.55, 0.67], m = Math.hypot(...v); return v.map((x) => x / m); })();
// Brightness change at a sphere point from a crater field (bowl, lit wall, bright rim).
function craterShade(grid, x, y, z) {
  let s = 0;
  for (const [cx, cy, cz, rad] of grid[(cell(x) * CGRID + cell(y)) * CGRID + cell(z)]) {
    const dx = x - cx, dy = y - cy, dz = z - cz;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 > rad * rad * 1.5) continue;
    const d = Math.sqrt(d2) / rad;
    if (d < 1) s += -0.12 * (1 - d * d) - ((dx * LIGHT[0] + dy * LIGHT[1]) / rad) * 0.28 * (1 - d);
    if (d > 0.8 && d < 1.2) s += 0.07 * (1 - Math.abs(d - 1) / 0.2);
  }
  return s;
}
// Render a lit textured sphere into a canvas. tex(x, y, z, out) fills out = [r, g, b].
function sphereSprite(size, tex, emissive = 0) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const c = cv.getContext("2d"), img = c.createImageData(size, size), d = img.data, out = [0, 0, 0];
  const half = size / 2;
  for (let py = 0; py < size; py++) {
    const y = (py + 0.5) / half - 1;
    for (let px = 0; px < size; px++) {
      const x = (px + 0.5) / half - 1, rr = x * x + y * y;
      if (rr >= 1) continue;
      const z = Math.sqrt(1 - rr);
      tex(x, y, z, out);
      let light;
      if (emissive) light = 1 - emissive * (1 - Math.pow(z, 0.5));
      else { const nl = x * LIGHT[0] + y * LIGHT[1] + z * LIGHT[2]; light = Math.max(0, nl) * 1.0 + 0.05 + 0.08 * z; }
      const i = (py * size + px) * 4;
      d[i] = clamp(out[0] * light, 0, 255); d[i + 1] = clamp(out[1] * light, 0, 255); d[i + 2] = clamp(out[2] * light, 0, 255);
      d[i + 3] = clamp((1 - Math.sqrt(rr)) * half, 0, 1) * 255;
    }
  }
  c.putImageData(img, 0, 0);
  return cv;
}
const TEX_SIZE = 640;
function texturedBall(c, o) { c.drawImage(ensureTex(o), -0.5, -0.5, 1, 1); }
function atmosphere(c, col, a = 0.5, R = 0.5, w = 0.06) {
  const g = c.createRadialGradient(0, 0, R * 0.9, 0, 0, R + w);
  g.addColorStop(0, rgba(col, 0)); g.addColorStop(0.55, rgba(col, a)); g.addColorStop(1, rgba(col, 0));
  c.fillStyle = g; c.beginPath(); c.arc(0, 0, R + w, 0, TAU); c.fill();
}

// Surface textures. Each factory gets (rng, offset) and returns tex(x, y, z, out).
const TEX = {
  earth: (r, k) => {
    const ocean = ramp([[0, "#06204f"], [0.35, "#0d3d86"], [0.5, "#1f6bb0"], [0.53, "#3a8cc4"]]);
    const land = ramp([[0.53, "#c9b98a"], [0.56, "#4f8a3a"], [0.63, "#2f6a2a"], [0.7, "#7a7048"], [0.78, "#8a7a6a"], [0.85, "#f0f0f0"]]);
    const desert = [205, 175, 115];
    return (x, y, z, out) => {
      const h = fbm(x * 1.7 + k, y * 1.7, z * 1.7 - k, 6);
      if (h < 0.53) ocean(h, out);
      else {
        land(h, out);
        const dry = smooth(0.15, 0.4, Math.abs(y)) * (1 - smooth(0.45, 0.62, Math.abs(y))) * smooth(0.45, 0.6, fbm(x * 2.5, y * 2.5 + k, z * 2.5, 3));
        mixInto(out, out, desert, dry * 0.85 * (h < 0.7 ? 1 : 0.3));
      }
      const ice = smooth(0.8, 0.86, Math.abs(y) + (h - 0.5) * 0.25);
      mixInto(out, out, [238, 244, 250], ice);
      const q = fbm(x * 3 + 9, y * 3, z * 3, 3);
      const cl = fbm(x * 2.5 + q * 2.2, y * 6 + q, z * 2.5 + k, 5);
      mixInto(out, out, [250, 252, 255], smooth(0.5, 0.68, cl) * 0.92);
    };
  },
  rocky: (base, opt = {}) => (r, k) => {
    const craters = makeCraters(r, opt.craters ?? 140, opt.big ?? 0.22);
    const col = rgbOf(base), dark = opt.dark ? rgbOf(opt.dark) : col.map((v) => v * 0.55);
    return (x, y, z, out) => {
      const n = fbm(x * 4 + k, y * 4, z * 4, 5);
      let t = 0.85 + (n - 0.5) * 0.5;
      const maria = opt.maria ? smooth(0.5, 0.42, fbm(x * 1.4 - k, y * 1.4, z * 1.4 + 3, 4)) * opt.maria : 0;
      mixInto(out, col, dark, maria);
      t += craterShade(craters, x, y, z);
      if (opt.spots) for (const [sx, sy, sz] of opt.spots) { const d = Math.hypot(x - sx, y - sy, z - sz); if (d < 0.05) t += (1 - d / 0.05) * 0.9; }
      if (opt.caps) { const cap = smooth(0.84, 0.9, Math.abs(y) + (n - 0.5) * 0.2); mixInto(out, out, [245, 245, 250], cap); }
      if (opt.albedo) { const a = smooth(0.42, 0.6, fbm(x * 2 + k, y * 2 - k, z * 2, 5)); mixInto(out, out, rgbOf(opt.albedo), a * 0.6); }
      out[0] *= t; out[1] *= t; out[2] *= t;
    };
  },
  venus: (r, k) => {
    const cols = ramp([[0.3, "#b88a4a"], [0.5, "#e2c48a"], [0.7, "#f6e6c0"]]);
    return (x, y, z, out) => {
      const q = fbm(x * 2 + k, y * 2, z * 2, 4);
      cols(fbm(x * 1.5 + q * 2, y * 5 + q * 1.5, z * 1.5, 5), out);
    };
  },
  bands: (stops, opt = {}) => (r, k) => {
    const cols = ramp(stops);
    return (x, y, z, out) => {
      const t = fbm(x * 3 + k, y * 9, z * 3, 5) - 0.5;
      const q = fbm(x * 6 + t * 3, y * 18, z * 6 - k, 4) - 0.5;
      cols(y + t * (opt.turb ?? 0.09) + q * (opt.fine ?? 0.04), out);
      if (opt.spot) {
        const [sx, sy, rx, ry, col] = opt.spot, dx = (x - sx) / rx, dy = (y - sy) / ry, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 1.25) {
          const swirl = 0.5 + 0.5 * Math.sin(d * 14 + Math.atan2(dy, dx) * 2 + q * 8);
          mixInto(out, out, rgbOf(col), smooth(1.25, 0.7, d) * (0.65 + 0.35 * swirl));
        }
      }
    };
  },
  star: (col, spots = 0, grain = 0.12) => (r, k) => {
    const base = rgbOf(col), hot = [255, 250, 235];
    const ss = []; for (let i = 0; i < spots; i++) ss.push([(r() - 0.5) * 1.2, (r() - 0.5) * 0.7, 0.02 + r() * 0.035]);
    return (x, y, z, out) => {
      const g = fbm(x * 30 + k, y * 30, z * 30, 3);
      mixInto(out, base, hot, 0.35 * z + (g - 0.5) * grain * 1.5);
      let t = 0.95 + (g - 0.5) * grain;
      for (const [sx, sy, sr] of ss) { const d = Math.hypot(x - sx, y - sy) / sr; if (d < 1) t *= d < 0.55 ? 0.25 : 0.6; }
      out[0] *= t; out[1] *= t; out[2] *= t;
    };
  },
  pluto: (r, k) => {
    const base = ramp([[0.3, "#9a7058"], [0.5, "#c8a888"], [0.7, "#e2cdb4"]]);
    return (x, y, z, out) => {
      base(fbm(x * 3 + k, y * 3, z * 3, 5), out);
      const heart = Math.min(Math.hypot(x - 0.12, y - 0.05, z - 0.95) / 0.33, Math.hypot(x - 0.32, y + 0.05, z - 0.85) / 0.27) + (fbm(x * 6, y * 6, z * 6, 3) - 0.5) * 0.4;
      mixInto(out, out, [246, 240, 230], smooth(1, 0.8, heart));
      const dark = smooth(0.2, 0.05, Math.abs(y - 0.25)) * smooth(0.1, -0.2, x);
      mixInto(out, out, [90, 48, 34], dark * 0.85);
    };
  },
};

// Which surface texture each object uses: [factory, emissive limb darkening].
function texFor(o) {
  switch (o.n) {
    case "Earth": return [TEX.earth, 0];
    case "The Moon": return [TEX.rocky("#bab8b2", { maria: 0.6, craters: 170 }), 0];
    case "Mercury": return [TEX.rocky("#a89c90", { craters: 260, big: 0.18 }), 0];
    case "Mars": return [TEX.rocky("#c4603a", { craters: 40, big: 0.1, caps: true, albedo: "#5a2414" }), 0];
    case "Venus": return [TEX.venus, 0];
    case "Ceres": return [TEX.rocky("#8e8c88", { craters: 120, big: 0.15, spots: [[0.2, -0.1, 0.97], [0.24, -0.06, 0.97]] }), 0];
    case "Phobos": return [TEX.rocky("#7a6a5c", { craters: 70, big: 0.32 }), 0];
    case "Halley's Comet": return [TEX.rocky("#4e4640", { craters: 25, big: 0.15 }), 0];
    case "Pluto": return [TEX.pluto, 0];
    case "Jupiter": return [TEX.bands([[-1, "#a08868"], [-0.82, "#c8b498"], [-0.62, "#a07c5c"], [-0.48, "#e8dcc4"], [-0.36, "#b98a62"], [-0.24, "#f3e8d4"], [-0.12, "#d9b48a"], [0, "#efe0c4"], [0.1, "#c0885c"], [0.2, "#a86c48"], [0.3, "#ecdcc0"], [0.42, "#c49870"], [0.58, "#e6d6bc"], [0.75, "#a8906e"], [1, "#8a7a64"]], { spot: [0.22, 0.34, 0.16, 0.08, "#c45a36"] }), 0];
    case "Saturn": return [TEX.bands([[-1, "#a89870"], [-0.6, "#d8c49a"], [-0.35, "#e8d8b0"], [-0.15, "#d4b884"], [0, "#efe0bc"], [0.15, "#d8bc8a"], [0.35, "#e6d4aa"], [0.6, "#c8b084"], [1, "#a89870"]], { turb: 0.05 }), 0];
    case "Neptune": return [TEX.bands([[-1, "#2a4aa8"], [-0.4, "#3d63d6"], [-0.1, "#4f78e8"], [0.2, "#3a5ccc"], [0.5, "#5a86f0"], [1, "#2a48a0"]], { spot: [-0.15, -0.25, 0.12, 0.07, "#1a2a70"] }), 0];
    case "Uranus": return [TEX.bands([[-1, "#b0e8ee"], [0, "#9cdce4"], [1, "#86ccd8"]], { turb: 0.03, fine: 0.02 }), 0];
  }
  if (o.k === "star") return [o.n === "The Sun" ? TEX.star(o.c, 7, 0.35) : TEX.star(o.c), 0.55];
  return null;
}
function ensureTex(o) {
  if (!o.tex) { const [f, em] = texFor(o); o.tex = sphereSprite(TEX_SIZE, f(rng(o.seed ^ 0x9e37), (o.seed % 1000) / 37), em); }
  return o.tex;
}

// Beyond the edge of the observable universe we can only see the afterglow of
// the Big Bang. Draw it as a mottled orange/blue field (like the cosmic
// microwave background) that rises at the rim and fills everything outside.
const BEYOND_R = 4; // how far the field extends, in universe diameters from center
function afterglowField(size, k) {
  const cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const c = cv.getContext("2d"), img = c.createImageData(size, size), d = img.data, half = size / 2;
  const base = [105, 50, 38], warm = [255, 138, 58], cool = [90, 138, 255], blob = [0, 0, 0], col = [0, 0, 0];
  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      const x = ((px + 0.5) / half - 1) * BEYOND_R, y = ((py + 0.5) / half - 1) * BEYOND_R, rn = Math.hypot(x, y);
      if (rn < 0.46) continue;
      const spots = smooth(0.42, 0.68, fbm(x * 14 + k, y * 14, 0.37, 5) * 0.7 + fbm(x * 40, y * 40 - k, 2.1, 3) * 0.3);
      mixInto(blob, cool, warm, smooth(0.4, 0.6, fbm(x * 4, y * 4 - k, 7.7, 3)));
      // brightly mottled at the same level as the ring, all the way out
      mixInto(col, base, blob, 0.45 + spots * 0.55);
      const grain = 1 + (fbm(x * 90, y * 90, k + 5, 2) - 0.5) * 0.6;
      col[0] *= grain; col[1] *= grain; col[2] *= grain;
      const i = (py * size + px) * 4;
      d[i] = clamp(col[0], 0, 255); d[i + 1] = clamp(col[1], 0, 255); d[i + 2] = clamp(col[2], 0, 255);
      d[i + 3] = 255 * smooth(0.485, 0.51, rn); // takes over right at the ring
    }
  }
  c.putImageData(img, 0, 0);
  return cv;
}
function universeInterior(c, p, r) {
  // cosmic web fading out toward the edge, over a dark core that also fades,
  // so the afterglow field underneath shows through without any visible rim
  K.web(c, { c: "#8fb0ff" }, p, r);
  c.globalCompositeOperation = "destination-over";
  const g = c.createRadialGradient(0, 0, 0, 0, 0, 0.55);
  g.addColorStop(0, "rgba(6,8,26,1)"); g.addColorStop(0.9, "rgba(6,8,26,1)"); g.addColorStop(0.93, "rgba(6,8,26,0)");
  c.fillStyle = g; c.fillRect(-0.55, -0.55, 1.1, 1.1);
  // the speckled ring at the edge: same colors and brightness as the
  // afterglow beyond, drawn normally (not additively) so overlaps don't blow out
  for (let i = 0; i < 1400; i++) {
    const a = r() * TAU, d = 0.5 + gauss(r) * 0.014;
    glow(c, r() < 0.6 ? "#ff8a3a" : "#5a8aff", 0.006 + r() * 0.014, 0.6, Math.cos(a) * d, Math.sin(a) * d);
  }
  const ring = c.createRadialGradient(0, 0, 0.47, 0, 0, 0.55);
  ring.addColorStop(0, "rgba(255,140,60,0)"); ring.addColorStop(0.4, "rgba(255,140,60,0.18)"); ring.addColorStop(1, "rgba(255,140,60,0)");
  c.fillStyle = ring; c.fillRect(-0.55, -0.55, 1.1, 1.1);
}
function universeLayers(o) {
  if (o.inner) return;
  const size = 1100, R = 0.55, cv = document.createElement("canvas");
  cv.width = cv.height = size;
  const c = cv.getContext("2d"), p = size / (2 * R);
  c.translate(size / 2, size / 2); c.scale(p, p);
  universeInterior(c, p * 0.6, rng(o.seed));
  o.inner = cv;
  o.outer = afterglowField(1024, (o.seed % 97) / 7);
}

// Optional photo for the "my dream" easter egg: the first of these that loads.
let dreamImg = null, dreamTried = false;
function dreamPhoto() {
  if (!dreamTried) {
    dreamTried = true;
    const tryLoad = (names) => {
      if (!names.length) return;
      const im = new Image();
      im.onload = () => { dreamImg = im; };
      im.onerror = () => tryLoad(names.slice(1));
      im.src = names[0];
    };
    tryLoad(["dream.png", "dream.jpg", "dream.jpeg", "dream.webp"]);
  }
  return dreamImg;
}

// ---------- drawings, one per kind. Signature: (ctx, obj, pxPerUnit, rng) ----------
const K = {
  foam(c, o, p, r) {
    c.globalCompositeOperation = "lighter";
    for (let i = 0; i < 70; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 0.42, x = Math.cos(a) * d, y = Math.sin(a) * d, R = 0.03 + r() * 0.12;
      const g = c.createRadialGradient(x, y, R * 0.6, x, y, R);
      g.addColorStop(0, rgba(o.c, 0.02)); g.addColorStop(0.85, rgba(o.c, 0.35)); g.addColorStop(1, rgba(o.c, 0));
      c.fillStyle = g; c.beginPath(); c.arc(x, y, R, 0, TAU); c.fill();
    }
    c.globalCompositeOperation = "source-over";
    edgeFade(c);
  },
  string(c, o, p, r) {
    c.shadowColor = o.c; c.shadowBlur = 14;
    c.strokeStyle = shade(o.c, 0.3); c.lineWidth = 3 / p;
    c.beginPath();
    for (let i = 0; i <= 200; i++) {
      const t = (i / 200) * TAU;
      const R = 0.36 + 0.07 * Math.sin(5 * t + 1) + 0.04 * Math.sin(11 * t);
      const x = Math.cos(t) * R, y = Math.sin(t) * R * 0.8;
      i ? c.lineTo(x, y) : c.moveTo(x, y);
    }
    c.stroke(); c.shadowBlur = 0;
  },
  particle(c, o) {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 0.5);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.25, o.c); g.addColorStop(0.6, rgba(o.c, 0.35)); g.addColorStop(1, rgba(o.c, 0));
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 0.5, 0, TAU); c.fill();
  },
  nucleon(c, o, p) {
    glow(c, o.c, 0.5, 0.45);
    c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 1.5 / p;
    const q = [[0, -0.17], [-0.15, 0.1], [0.15, 0.1]];
    c.beginPath();
    for (let i = 0; i < 3; i++) {
      const [x1, y1] = q[i], [x2, y2] = q[(i + 1) % 3];
      for (let j = 0; j <= 20; j++) {
        const t = j / 20, nx = -(y2 - y1), ny = x2 - x1, w = Math.sin(t * TAU * 3) * 0.08;
        const x = x1 + (x2 - x1) * t + nx * w, y = y1 + (y2 - y1) * t + ny * w;
        j ? c.lineTo(x, y) : c.moveTo(x, y);
      }
    }
    c.stroke();
    const cols = o.n === "Proton" ? ["#ff4d4d", "#4dff6a", "#4d8bff"] : ["#ff4d4d", "#4d8bff", "#4dff6a"];
    q.forEach(([x, y], i) => ball(c, cols[i], 0.075, x, y));
  },
  nucleus(c, o, p, r) {
    const n = o.count, br = 0.46 / Math.sqrt(n) * 1.05;
    const pts = [];
    for (let i = 0; i < n; i++) {
      const d = 0.46 * Math.sqrt((i + 0.5) / n) * 0.82, a = i * 2.39996;
      pts.push([Math.cos(a) * d, Math.sin(a) * d, r() < 0.42 ? o.c : o.c2]);
    }
    for (let i = n - 1; i >= 0; i--) ball(c, pts[i][2], br, pts[i][0], pts[i][1]);
  },
  wave(c, o, p) {
    c.strokeStyle = "rgba(255,255,255,0.18)"; c.lineWidth = 1 / p;
    c.beginPath(); c.moveTo(-0.5, 0); c.lineTo(0.5, 0); c.stroke();
    c.shadowColor = o.c; c.shadowBlur = 10;
    c.strokeStyle = o.c; c.lineWidth = 2.5 / p;
    c.beginPath();
    for (let i = 0; i <= 120; i++) { const t = i / 120, x = -0.5 + t; i ? c.lineTo(x, -Math.sin(t * TAU) * 0.22) : c.moveTo(x, 0); }
    c.stroke(); c.shadowBlur = 0;
    c.strokeStyle = "rgba(255,255,255,0.5)"; c.lineWidth = 1 / p;
    c.beginPath(); c.moveTo(-0.5, 0.26); c.lineTo(-0.5, 0.3); c.lineTo(0.5, 0.3); c.lineTo(0.5, 0.26); c.stroke();
  },
  water(c) {
    c.strokeStyle = "#bbb"; c.lineWidth = 0.08;
    c.beginPath(); c.moveTo(-0.26, 0.17); c.lineTo(0, -0.08); c.lineTo(0.26, 0.17); c.stroke();
    ball(c, "#ff4a4a", 0.26, 0, -0.08);
    ball(c, "#f2f2f2", 0.17, -0.27, 0.18);
    ball(c, "#f2f2f2", 0.17, 0.27, 0.18);
  },
  bucky(c, o, p) {
    ball(c, "#3a3f48", 0.48);
    const n = 60;
    for (let i = 0; i < n; i++) {
      const y = 1 - (2 * (i + 0.5)) / n, rad = Math.sqrt(1 - y * y), th = i * 2.39996;
      const x = Math.cos(th) * rad, z = Math.sin(th) * rad;
      if (z < -0.05) continue;
      ball(c, "#b8c0cc", 0.035 + z * 0.02, x * 0.44, y * 0.44);
    }
  },
  dna(c, o) {
    const h = o.h, k = TAU / 1.7;
    const strand = (ph, col, front) => {
      c.strokeStyle = front ? col : shade(col, -0.45); c.lineWidth = 0.12; c.lineCap = "round";
      c.beginPath();
      for (let i = 0; i <= 120; i++) { const y = -h / 2 + (h * i) / 120, x = 0.42 * Math.sin(k * y + ph); i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke();
    };
    strand(Math.PI * 0.75, o.c2, false);
    const rungCols = ["#ffd166", "#06d6a0", "#ef476f", "#7aa2ff"];
    for (let i = 0; i < 14; i++) {
      const y = -h / 2 + (i + 0.5) * (h / 14);
      const x1 = 0.42 * Math.sin(k * y), x2 = 0.42 * Math.sin(k * y + Math.PI * 0.75);
      c.strokeStyle = rungCols[i % 4]; c.lineWidth = 0.06;
      c.beginPath(); c.moveTo(x1, y); c.lineTo(x2, y); c.stroke();
    }
    strand(0, o.c, true);
  },
  pollen(c, o) {
    c.fillStyle = shade(o.c, -0.15);
    const n = 30;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, a1 = a - 0.06, a2 = a + 0.06;
      c.beginPath(); c.moveTo(Math.cos(a1) * 0.38, Math.sin(a1) * 0.38); c.lineTo(Math.cos(a) * 0.5, Math.sin(a) * 0.5); c.lineTo(Math.cos(a2) * 0.38, Math.sin(a2) * 0.38); c.fill();
    }
    ball(c, o.c, 0.4);
    c.fillStyle = shade(o.c, -0.2);
    for (let i = 0; i < 40; i++) {
      const y = 1 - (2 * (i + 0.5)) / 40, rad = Math.sqrt(1 - y * y), th = i * 2.39996;
      if (Math.sin(th) < 0) continue;
      c.beginPath(); c.arc(Math.cos(th) * rad * 0.36, y * 0.36, 0.025, 0, TAU); c.fill();
    }
  },
  rbc(c, o) {
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 0.5);
    g.addColorStop(0, shade(o.c, -0.35)); g.addColorStop(0.45, shade(o.c, -0.1));
    g.addColorStop(0.75, shade(o.c, 0.15)); g.addColorStop(0.95, shade(o.c, -0.25)); g.addColorStop(1, shade(o.c, -0.5));
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 0.5, 0, TAU); c.fill();
  },
  orbit(c, o, p) {
    const au = o.inner ? [0.39, 0.72, 1, 1.52, 5.2, 9.58, 19.2, 30.1] : [1];
    const max = au[au.length - 1];
    c.lineWidth = 1.2 / p;
    au.forEach((a, i) => {
      const R = (a / max) * 0.5;
      c.strokeStyle = rgba(o.c, 0.55); c.beginPath(); c.arc(0, 0, R, 0, TAU); c.stroke();
      const ang = i * 2.1 + 0.6;
      c.fillStyle = a === 1 ? "#5aa0ff" : "#ddd";
      c.beginPath(); c.arc(Math.cos(ang) * R, Math.sin(ang) * R, 3 / p, 0, TAU); c.fill();
    });
    c.fillStyle = "#ffd04a"; c.beginPath(); c.arc(0, 0, 3 / p, 0, TAU); c.fill();
  },
  bar(c, o, p) {
    c.strokeStyle = o.c; c.lineWidth = 2 / p;
    c.setLineDash([6 / p, 4 / p]);
    c.beginPath(); c.moveTo(-0.5, 0); c.lineTo(0.5, 0); c.stroke(); c.setLineDash([]);
    c.beginPath(); c.moveTo(-0.5, -0.06); c.lineTo(-0.5, 0.06); c.moveTo(0.5, -0.06); c.lineTo(0.5, 0.06); c.stroke();
    if (o.n.includes("Centauri")) {
      glow(c, "#ffd04a", 10 / p, 0.9, -0.5, 0); glow(c, "#ffb070", 10 / p, 0.9, 0.5, 0);
    }
  },
  oort(c, o, p, r) {
    const pts = [];
    for (let i = 0; i < 2600; i++) {
      const a = r() * TAU, cosT = r() * 2 - 1, R = 0.18 + Math.pow(r(), 0.6) * 0.3;
      pts.push([Math.cos(a) * Math.sqrt(1 - cosT * cosT) * R, cosT * R, 0.9 / p * 1.5, 0.35 + r() * 0.4]);
    }
    dots(c, pts, o.c);
    glow(c, "#ffd04a", 0.03, 1);
  },
  nebula(c, o, p, r) {
    c.globalCompositeOperation = "lighter";
    for (let i = 0; i < 70; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 0.3, R = 0.06 + r() * 0.18;
      glow(c, r() < 0.5 ? o.c : o.c2, R, 0.12 + r() * 0.1, Math.cos(a) * d, Math.sin(a) * d * 0.85);
    }
    c.lineWidth = 2 / p; c.strokeStyle = rgba(o.c, 0.25);
    for (let i = 0; i < 40; i++) {
      const a = r() * TAU, d0 = r() * 0.1, d1 = 0.25 + r() * 0.18;
      c.beginPath(); c.moveTo(Math.cos(a) * d0, Math.sin(a) * d0);
      c.quadraticCurveTo(Math.cos(a + 0.3) * d1 * 0.6, Math.sin(a + 0.3) * d1 * 0.6, Math.cos(a) * d1, Math.sin(a) * d1); c.stroke();
    }
    c.globalCompositeOperation = "source-over";
    edgeFade(c);
    const pts = []; for (let i = 0; i < 60; i++) pts.push([(r() - 0.5) * 0.8, (r() - 0.5) * 0.8, (0.8 + r() * 1.6) / p, 0.9]);
    dots(c, pts, "#ffffff");
  },
  cluster(c, o, p, r) {
    glow(c, o.c, 0.3, 0.5);
    const pts = [];
    for (let i = 0; i < o.count * 3; i++) {
      const a = r() * TAU, d = Math.pow(r(), 1.8) * 0.48;
      pts.push([Math.cos(a) * d, Math.sin(a) * d, (0.6 + r() * 1.4) / p, 0.6 + r() * 0.4]);
    }
    c.globalCompositeOperation = "lighter"; dots(c, pts, o.c); c.globalCompositeOperation = "source-over";
  },
  irregular(c, o, p, r) {
    c.globalCompositeOperation = "lighter";
    c.save(); c.rotate(-0.3); c.scale(1, 0.55);
    glow(c, o.c, 0.4, 0.3);
    const pts = [];
    for (let i = 0; i < 3000; i++) {
      const bar = r() < 0.5;
      pts.push(bar ? [gauss(r) * 0.4, gauss(r) * 0.1, (0.6 + r()) / p, 0.5] : [gauss(r) * 0.45, gauss(r) * 0.35 - 0.05, (0.6 + r()) / p, 0.35]);
    }
    dots(c, pts, o.c);
    for (let i = 0; i < 8; i++) glow(c, "#ff7ab0", 0.03 + r() * 0.03, 0.6, gauss(r) * 0.35, gauss(r) * 0.3);
    c.restore();
    c.globalCompositeOperation = "source-over";
    edgeFade(c);
  },
  galaxy(c, o, p, r) {
    c.globalCompositeOperation = "lighter";
    c.save();
    if (o.tilt) { c.rotate(-0.6); c.scale(1, o.tilt); }
    glow(c, o.c, 0.5, 0.18);
    const pts = [], pink = [];
    for (let arm = 0; arm < 2; arm++) {
      for (let i = 0; i < 2600; i++) {
        const t = r(), R = 0.05 + Math.pow(t, 0.8) * 0.43;
        const th = arm * Math.PI + Math.log(R / 0.05) * 1.9 + gauss(r) * 0.55;
        const jit = gauss(r) * 0.06 * (0.4 + R);
        const x = Math.cos(th) * (R + jit), y = Math.sin(th) * (R + jit);
        pts.push([x, y, (0.5 + r() * 1.2) / p, 0.3 + r() * 0.5]);
        if (r() < 0.02) pink.push([x, y]);
      }
    }
    for (let i = 0; i < 1500; i++) { const a = r() * TAU, d = Math.abs(gauss(r)) * 0.3; pts.push([Math.cos(a) * d, Math.sin(a) * d, 0.8 / p, 0.25]); }
    if (!o.tilt) for (let i = 0; i < 700; i++) { const t = gauss(r); pts.push([Math.cos(0.5) * t * 0.12, Math.sin(0.5) * t * 0.12 + gauss(r) * 0.015, 1 / p, 0.5]); }
    dots(c, pts, o.c);
    for (const [x, y] of pink) glow(c, "#ff70a0", 4 / p, 0.6, x, y);
    glow(c, o.c2, 0.13, 0.9);
    glow(c, "#ffffff", 0.04, 0.8);
    c.restore();
    c.globalCompositeOperation = "source-over";
  },
  elliptical(c, o, p, r) {
    c.save(); c.rotate(0.3); c.scale(1, 0.7);
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 0.5);
    g.addColorStop(0, rgba("#ffffff", 0.95)); g.addColorStop(0.08, rgba(o.c, 0.8)); g.addColorStop(0.4, rgba(o.c, 0.25)); g.addColorStop(1, rgba(o.c, 0));
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 0.5, 0, TAU); c.fill();
    const pts = []; for (let i = 0; i < 900; i++) { const a = r() * TAU, d = Math.abs(gauss(r)) * 0.4; pts.push([Math.cos(a) * d, Math.sin(a) * d, 0.8 / p, 0.4]); }
    c.globalCompositeOperation = "lighter"; dots(c, pts, o.c); c.globalCompositeOperation = "source-over";
    c.restore();
  },
  group(c, o, p, r) {
    c.globalCompositeOperation = "lighter";
    glow(c, o.c, 0.5, o.many ? 0.12 : 0.05);
    const n = o.many ? 140 : 26;
    const cols = ["#cfdcff", "#ffe2c0", "#ffffff", "#ffd0a0"];
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = (o.many ? Math.abs(gauss(r)) * 0.42 : Math.sqrt(r()) * 0.42);
      const x = Math.cos(a) * d, y = Math.sin(a) * d;
      const big = !o.many && i < 2;
      const R = big ? 0.06 : (0.008 + r() * r() * 0.03);
      c.save(); c.translate(big ? (i ? 0.15 : -0.12) : x, big ? (i ? -0.08 : 0.06) : y); c.rotate(r() * TAU); c.scale(1, 0.3 + r() * 0.6);
      glow(c, cols[(r() * 4) | 0], R, 0.9);
      c.restore();
    }
    c.globalCompositeOperation = "source-over";
  },
  web(c, o, p, r) {
    c.globalCompositeOperation = "lighter";
    const sy = o.wall ? 0.35 : 1;
    const centers = []; for (let i = 0; i < 30; i++) centers.push([(r() - 0.5) * 0.85, (r() - 0.5) * 0.85 * sy]);
    const nodes = [];
    for (let i = 0; i < 700; i++) { const [cx, cy] = centers[(r() * centers.length) | 0]; nodes.push([cx + gauss(r) * 0.08, cy + gauss(r) * 0.08 * sy]); }
    c.strokeStyle = rgba(o.c, 0.22); c.lineWidth = 1.4 / p;
    c.beginPath();
    for (let i = 0; i < nodes.length; i++) {
      const [x, y] = nodes[i]; let b1 = -1, d1 = 9, b2 = -1, d2 = 9;
      for (let j = 0; j < nodes.length; j++) { if (j === i) continue; const d = Math.hypot(nodes[j][0] - x, nodes[j][1] - y); if (d < d1) { b2 = b1; d2 = d1; b1 = j; d1 = d; } else if (d < d2) { b2 = j; d2 = d; } }
      for (const [b, d] of [[b1, d1], [b2, d2]]) if (b >= 0 && d < 0.1) { c.moveTo(x, y); c.lineTo(...nodes[b]); }
    }
    c.stroke();
    dots(c, nodes.map(([x, y]) => [x, y, (0.8 + r() * 1.4) / p, 0.6]), o.c);
    for (const [x, y] of centers) glow(c, o.c, 0.04, 0.35, x, y);
    c.globalCompositeOperation = "source-over";
    edgeFade(c);
  },
  universe(c, o, p) {
    universeLayers(o);
    c.drawImage(o.outer, -BEYOND_R, -BEYOND_R, BEYOND_R * 2, BEYOND_R * 2);
    c.drawImage(o.inner, -0.55, -0.55, 1.1, 1.1);
    c.fillStyle = "#fff"; c.beginPath(); c.arc(0, 0, 2 / p, 0, TAU); c.fill();
  },

  // easter egg: a framed dream. A picture named dream.png / dream.jpg next to
  // index.html replaces the painted scene.
  dream(c, o, p, r) {
    const img = dreamPhoto();
    glow(c, o.c, 0.8, 0.45);
    c.save(); c.beginPath(); c.arc(0, 0, 0.45, 0, TAU); c.clip();
    if (img) {
      const k = Math.max(0.9 / img.naturalWidth, 0.9 / img.naturalHeight);
      c.drawImage(img, -img.naturalWidth * k / 2, -img.naturalHeight * k / 2, img.naturalWidth * k, img.naturalHeight * k);
    } else {
      // twilight sky
      const sky = c.createLinearGradient(0, -0.45, 0, 0.45);
      sky.addColorStop(0, "#1a1238"); sky.addColorStop(0.55, "#5a3a7a"); sky.addColorStop(0.85, "#e8889a"); sky.addColorStop(1, "#ffc8a0");
      c.fillStyle = sky; c.fillRect(-0.5, -0.5, 1, 1);
      c.fillStyle = "#fff";
      for (let i = 0; i < 70; i++) { c.globalAlpha = 0.3 + r() * 0.7; c.beginPath(); c.arc((r() - 0.5) * 0.9, -0.45 + r() * 0.5, 0.002 + r() * 0.005, 0, TAU); c.fill(); }
      c.globalAlpha = 1;
      // the star being wished on
      glow(c, "#fff4d0", 0.16, 0.8, 0.14, -0.2);
      c.strokeStyle = "rgba(255,250,230,0.9)"; c.lineWidth = 0.006;
      c.beginPath(); c.moveTo(0.14, -0.27); c.lineTo(0.14, -0.13); c.moveTo(0.07, -0.2); c.lineTo(0.21, -0.2); c.stroke();
      ball(c, "#fffbe8", 0.018, 0.14, -0.2);
      // crescent moon
      c.fillStyle = "#fff2d0"; c.beginPath(); c.arc(-0.2, -0.24, 0.07, 0, TAU); c.fill();
      c.fillStyle = "#2a1c4a"; c.beginPath(); c.arc(-0.175, -0.26, 0.062, 0, TAU); c.fill();
      // hill with a small figure looking up
      c.fillStyle = "#1c1430"; c.beginPath(); c.ellipse(-0.05, 0.5, 0.55, 0.22, 0, Math.PI, TAU); c.fill();
      c.fillStyle = "#120c22";
      c.beginPath(); c.arc(-0.08, 0.205, 0.018, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(-0.098, 0.222); c.lineTo(-0.062, 0.222); c.lineTo(-0.055, 0.29); c.lineTo(-0.105, 0.29); c.fill();
      c.strokeStyle = "#120c22"; c.lineWidth = 0.01; c.lineCap = "round";
      c.beginPath(); c.moveTo(-0.065, 0.235); c.lineTo(-0.03, 0.2); c.stroke(); // arm reaching up
    }
    c.restore();
    c.strokeStyle = rgba("#fff0d8", 0.85); c.lineWidth = 0.012;
    c.beginPath(); c.arc(0, 0, 0.45, 0, TAU); c.stroke();
  },

  // ---- textured worlds ----
  earth(c, o) {
    atmosphere(c, "#6ab0ff", 0.55, 0.5, 0.06);
    texturedBall(c, o);
    atmosphere(c, "#9cd0ff", 0.35, 0.49, 0.02);
  },
  moon(c, o) { texturedBall(c, o); },
  mars(c, o) { atmosphere(c, "#ffb08a", 0.25, 0.5, 0.025); texturedBall(c, o); },
  venus(c, o) { atmosphere(c, "#ffe8b0", 0.45, 0.5, 0.05); texturedBall(c, o); },
  pluto(c, o) { texturedBall(c, o); },
  gas(c, o) { atmosphere(c, o.c2, 0.35, 0.5, 0.03); texturedBall(c, o); },
  jupiter(c, o) { texturedBall(c, o); },
  saturn(c, o, p) {
    // ring system: [inner, outer] in planet radii, base brightness
    const rings = [[1.24, 1.53, 0.25], [1.53, 1.95, 0.85], [2.03, 2.27, 0.6]];
    const rr = rng(o.seed);
    const bands = [];
    for (const [a, b, br] of rings) for (let t = a; t < b; t += 0.012) bands.push([t, br * (0.6 + rr() * 0.4) * (Math.abs(t - 2.21) < 0.012 ? 0.1 : 1)]);
    const half = (front) => {
      c.save(); c.rotate(-0.15);
      c.beginPath(); front ? c.rect(-2, 0, 4, 2) : c.rect(-2, -2, 4, 2); c.clip();
      c.lineWidth = 0.0075;
      for (const [t, a] of bands) {
        c.strokeStyle = `rgba(${220 - t * 20 | 0},${200 - t * 22 | 0},${160 - t * 25 | 0},${a})`;
        c.beginPath(); c.ellipse(0, 0, t * 0.5, t * 0.5 * 0.26, 0, 0, TAU); c.stroke();
      }
      c.restore();
    };
    half(false);
    texturedBall(c, o);
    c.save(); c.beginPath(); c.arc(0, 0, 0.5, 0, TAU); c.clip(); c.rotate(-0.15);
    c.strokeStyle = "rgba(20,15,5,0.4)"; c.lineWidth = 0.05; c.beginPath(); c.ellipse(0, 0.05, 0.85, 0.85 * 0.26, 0, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
    c.restore();
    half(true);
  },
  star(c, o, p, r) {
    glow(c, o.c, 0.95, 0.3);
    glow(c, shadeHex(o.c, 0.4), 0.62, 0.5);
    if (o.n === "The Sun") {
      c.strokeStyle = rgba("#ff7a2a", 0.45); c.lineCap = "round";
      for (let i = 0; i < 4; i++) {
        const a = r() * TAU, w = 0.08 + r() * 0.1, h = 0.04 + r() * 0.07;
        c.lineWidth = 0.004 + r() * 0.004;
        c.beginPath(); c.moveTo(Math.cos(a - w) * 0.49, Math.sin(a - w) * 0.49);
        c.bezierCurveTo(Math.cos(a - w) * (0.5 + h * 2), Math.sin(a - w) * (0.5 + h * 2), Math.cos(a + w) * (0.5 + h * 2), Math.sin(a + w) * (0.5 + h * 2), Math.cos(a + w) * 0.49, Math.sin(a + w) * 0.49);
        c.stroke();
      }
    }
    texturedBall(c, o);
  },
  rock(c, o, p, r) {
    if (o.round) { texturedBall(c, o); return; }
    c.save(); lumpy(c, r, 0.4, 0.22); c.clip();
    c.drawImage(ensureTex(o), -0.55, -0.55, 1.1, 1.1);
    const g = c.createRadialGradient(-0.15, -0.15, 0.1, 0, 0, 0.55);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(1, "rgba(0,0,0,0.65)");
    c.fillStyle = g; c.fillRect(-0.6, -0.6, 1.2, 1.2);
    c.restore();
  },
  comet(c, o, p, r) {
    glow(c, "#bfe0ff", 0.75, 0.22);
    c.strokeStyle = "rgba(220,240,255,0.25)"; c.lineCap = "round";
    for (let i = 0; i < 5; i++) { const a = -2.2 + (r() - 0.5) * 1.2; c.lineWidth = 0.02 + r() * 0.03; c.beginPath(); c.moveTo(Math.cos(a) * 0.25, Math.sin(a) * 0.25); c.lineTo(Math.cos(a) * 0.75, Math.sin(a) * 0.75); c.stroke(); }
    K.rock(c, o, p, r);
  },

  // ---- quantum / chemistry ----
  atom(c, o, p) {
    const shells = o.n.startsWith("Carbon") ? 2 : 1;
    const g = c.createRadialGradient(0, 0, 0, 0, 0, 0.5);
    g.addColorStop(0, rgba(o.c, 0.75)); g.addColorStop(shells > 1 ? 0.3 : 0.45, rgba(o.c, 0.35));
    if (shells > 1) { g.addColorStop(0.45, rgba(o.c, 0.15)); g.addColorStop(0.72, rgba(o.c, 0.28)); }
    g.addColorStop(1, rgba(o.c, 0));
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, 0.5, 0, TAU); c.fill();
    if (shells > 1) { // p-orbital lobes
      c.globalCompositeOperation = "lighter";
      for (let i = 0; i < 3; i++) {
        c.save(); c.rotate((i * Math.PI) / 3);
        for (const s of [-1, 1]) { c.save(); c.translate(s * 0.2, 0); c.scale(1, 0.5); glow(c, o.c, 0.2, 0.18); c.restore(); }
        c.restore();
      }
      c.globalCompositeOperation = "source-over";
    }
    c.strokeStyle = rgba("#ffffff", 0.12); c.lineWidth = 1 / p; c.setLineDash([3 / p, 4 / p]);
    for (let s = 1; s <= shells; s++) { c.beginPath(); c.arc(0, 0, 0.2 * s + 0.05, 0, TAU); c.stroke(); }
    c.setLineDash([]);
    glow(c, "#ffb080", Math.max(6 / p, 0.01), 0.9);
    c.fillStyle = "#ffd0b0"; c.beginPath(); c.arc(0, 0, Math.max(1.5 / p, 0.004), 0, TAU); c.fill();
  },
  molecule(c, o, p) {
    // a glucose ring: six-membered ring with OH groups and CH2OH tail
    const ring = [];
    for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i * TAU) / 6; ring.push([Math.cos(a) * 0.16, Math.sin(a) * 0.12]); }
    const subs = [];
    ring.forEach(([x, y], i) => {
      if (i === 0) return; // ring oxygen
      const out = [x * 1.9, y * 2.1];
      subs.push([x, y, out[0], out[1], i === 5 ? "C" : "O"]);
    });
    c.lineCap = "round";
    const bond = (x1, y1, x2, y2) => { c.strokeStyle = "#7a7f88"; c.lineWidth = 0.035; c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke(); c.strokeStyle = "#b8bcc4"; c.lineWidth = 0.012; c.stroke(); };
    for (let i = 0; i < 6; i++) bond(...ring[i], ...ring[(i + 1) % 6]);
    for (const [x, y, ox, oy] of subs) bond(x, y, ox, oy);
    const tail = subs.find((s) => s[4] === "C");
    bond(tail[2], tail[3], tail[2] - 0.1, tail[3] - 0.12);
    for (const [x, y, ox, oy, e] of subs) {
      if (e === "O") { bond(ox, oy, ox + (ox > 0 ? 0.07 : -0.07), oy + 0.03); ball(c, "#f0f0f0", 0.035, ox + (ox > 0 ? 0.07 : -0.07), oy + 0.03); }
    }
    ball(c, "#f0f0f0", 0.035, tail[2] - 0.1 - 0.06, tail[3] - 0.12 - 0.02);
    for (const [x, y, ox, oy, e] of subs) ball(c, e === "O" ? "#ff4a4a" : "#555b66", 0.055, ox, oy);
    ball(c, "#ff4a4a", 0.055, tail[2] - 0.1, tail[3] - 0.12);
    ring.forEach(([x, y], i) => ball(c, i === 0 ? "#ff4a4a" : "#555b66", 0.065, x, y));
  },
  blob(c, o, p, r) {
    if (o.n === "Ribosome") {
      // small and large subunits with an mRNA strand threading between them
      lumpy(c, r, 0.3, 0.12, 0.02, 0.1); c.fillStyle = shade(o.c, -0.1); c.fill();
      lumpy(c, r, 0.22, 0.15, -0.03, -0.2); c.fillStyle = shade(o.c, 0.15); c.fill();
      c.save(); lumpy(c, r, 0.3, 0.12, 0.02, 0.1); c.clip();
      for (let i = 0; i < 40; i++) { glow(c, "#ffffff", 0.04, 0.12, (r() - 0.5) * 0.6, (r() - 0.5) * 0.6); }
      c.restore();
      c.strokeStyle = "#ffd166"; c.lineWidth = 0.03; c.beginPath();
      for (let i = 0; i <= 50; i++) { const x = -0.5 + i / 50, y = -0.05 + Math.sin(i * 0.9) * 0.02; i ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke();
      c.strokeStyle = "#7ae0a0"; c.lineWidth = 0.025; c.beginPath(); c.moveTo(0.02, -0.25);
      for (let i = 0; i < 12; i++) c.lineTo(0.05 + Math.sin(i) * 0.06, -0.3 - i * 0.015); c.stroke();
      return;
    }
    // hemoglobin: four folded subunits, each holding a heme group
    const cols = [o.c, shade(o.c, -0.2), "#d87a8a", "#c0606f"];
    [[-0.13, -0.12], [0.13, -0.1], [-0.12, 0.13], [0.14, 0.12]].forEach(([x, y], i) => {
      lumpy(c, r, 0.19, 0.18, x, y);
      const g = c.createRadialGradient(x - 0.06, y - 0.06, 0, x, y, 0.22);
      g.addColorStop(0, shade(cols[i], 0.3)); g.addColorStop(1, shade(cols[i], -0.35));
      c.fillStyle = g; c.fill();
      c.save(); c.clip();
      c.strokeStyle = rgba("#000000", 0.18); c.lineWidth = 0.012;
      for (let k = 0; k < 6; k++) { c.beginPath(); c.moveTo(x - 0.2, y - 0.15 + k * 0.06); c.bezierCurveTo(x - 0.05, y - 0.2 + k * 0.06, x + 0.05, y - 0.1 + k * 0.06, x + 0.2, y - 0.15 + k * 0.06); c.stroke(); }
      c.restore();
      c.fillStyle = "#3a1010"; c.save(); c.translate(x + 0.03, y); c.rotate(0.5); c.fillRect(-0.04, -0.012, 0.08, 0.024); c.restore();
      glow(c, "#ff8a3a", 0.03, 0.9, x + 0.03, y);
    });
  },

  // ---- microbes & cells ----
  virus(c, o, p, r) {
    const type = o.vt;
    if (type === "icosa") {
      // icosahedral capsid seen face-on: hexagon of shaded triangular facets
      const R = 0.46, pts = [];
      for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i * TAU) / 6; pts.push([Math.cos(a) * R, Math.sin(a) * R]); }
      const mid = pts.map(([x, y]) => [x * 0.45, y * 0.45]);
      for (let i = 0; i < 6; i++) {
        const [a, b] = [pts[i], pts[(i + 1) % 6]], [ma, mb] = [mid[i], mid[(i + 1) % 6]];
        const lit = 0.25 - (i / 6) * 0.5;
        const tri = (pp, l) => { c.beginPath(); pp.forEach(([x, y], j) => (j ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fillStyle = shade(o.c, l); c.fill(); c.strokeStyle = shade(o.c, -0.4); c.lineWidth = 0.008; c.stroke(); };
        tri([a, b, mb], lit); tri([a, mb, ma], lit + 0.08); tri([[0, 0], ma, mb], lit + 0.18);
      }
      c.fillStyle = rgba("#000000", 0.18);
      for (let i = 0; i < 70; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.4; c.beginPath(); c.arc(Math.cos(a) * d, Math.sin(a) * d, 0.012, 0, TAU); c.fill(); }
      return;
    }
    const n = type === "flu" ? 64 : 22, R = 0.36;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r() * 0.05, mushroom = type === "flu" && i % 5 === 0;
      const x1 = Math.cos(a) * R, y1 = Math.sin(a) * R, L = type === "flu" ? 0.12 : 0.09;
      const x2 = Math.cos(a) * (R + L), y2 = Math.sin(a) * (R + L);
      c.strokeStyle = shade(o.c, mushroom ? 0.2 : -0.15); c.lineWidth = type === "flu" ? 0.018 : 0.022; c.lineCap = "round";
      c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.stroke();
      if (mushroom || type === "hiv") ball(c, shade(o.c, mushroom ? 0.3 : 0.15), type === "hiv" ? 0.035 : 0.022, x2, y2);
    }
    // lipid envelope
    const g = c.createRadialGradient(-0.12, -0.12, 0.02, 0, 0, R);
    g.addColorStop(0, shade(o.c, 0.35)); g.addColorStop(0.8, o.c); g.addColorStop(1, shade(o.c, -0.45));
    c.fillStyle = g; c.beginPath(); c.arc(0, 0, R, 0, TAU); c.fill();
    c.strokeStyle = shade(o.c, -0.3); c.lineWidth = 0.02; c.stroke();
    // cut-away interior
    c.fillStyle = rgba("#1a1020", 0.55); c.beginPath(); c.arc(0, 0, R * 0.8, 0, TAU); c.fill();
    if (type === "hiv") {
      c.save(); c.rotate(0.6);
      c.fillStyle = "#e8b04a"; c.beginPath(); c.moveTo(-0.2, -0.05); c.lineTo(0.18, -0.13); c.quadraticCurveTo(0.24, 0, 0.18, 0.13); c.lineTo(-0.2, 0.05); c.quadraticCurveTo(-0.24, 0, -0.2, -0.05); c.fill();
      c.strokeStyle = "#ff5a7a"; c.lineWidth = 0.015; c.beginPath();
      for (let i = 0; i <= 30; i++) { const x = -0.15 + i * 0.01, y = Math.sin(i * 1.2) * 0.04; i ? c.lineTo(x, y) : c.moveTo(x, y); } c.stroke();
      c.restore();
    } else {
      const segs = type === "flu" ? 8 : 0;
      c.lineCap = "round";
      for (let i = 0; i < segs; i++) {
        const a = (i / segs) * TAU, d = i === 0 ? 0 : 0.14, x = Math.cos(a) * d, y = Math.sin(a) * d;
        c.save(); c.translate(x, y); c.rotate(r() * TAU);
        c.strokeStyle = ["#ff7a8a", "#7ad0ff", "#ffd166", "#9aff8a"][i % 4]; c.lineWidth = 0.035;
        c.beginPath(); c.moveTo(-0.08, 0); c.bezierCurveTo(-0.03, -0.04, 0.03, 0.04, 0.08, 0); c.stroke();
        c.restore();
      }
    }
  },
  bacterium(c, o, p, r) {
    c.rotate(-0.35);
    // flagella
    c.strokeStyle = rgba(shadeHex(o.c, 0.2), 0.7); c.lineWidth = 1.4 / p; c.lineCap = "round";
    for (let i = 0; i < 5; i++) {
      const sx = -0.3 + i * 0.15, sy = i % 2 ? 0.16 : -0.16, dir = i < 2 ? -1 : (i % 2 ? 1 : -1);
      c.beginPath();
      for (let j = 0; j <= 50; j++) { const t = j / 50, x = sx - t * 0.55 * (i < 2 ? 1 : 0.3), y = sy + dir * t * 0.35 + Math.sin(j * 0.55 + i) * 0.035; j ? c.lineTo(x, y) : c.moveTo(x, y); }
      c.stroke();
    }
    // pili
    c.strokeStyle = rgba("#cfeaa8", 0.5); c.lineWidth = 0.7 / p;
    for (let i = 0; i < 70; i++) {
      const t = (i / 70) * TAU, x = Math.cos(t) * 0.45, y = Math.sin(t) * 0.17;
      c.beginPath(); c.moveTo(x, y); c.lineTo(x * 1.12, y * 1.35); c.stroke();
    }
    rrect(c, -0.45, -0.17, 0.9, 0.34, 0.17);
    const g = c.createLinearGradient(0, -0.17, 0, 0.17);
    g.addColorStop(0, shade(o.c, 0.4)); g.addColorStop(0.45, o.c); g.addColorStop(1, shade(o.c, -0.5));
    c.fillStyle = g; c.fill();
    c.strokeStyle = shade(o.c, -0.55); c.lineWidth = 0.014; c.stroke();
    rrect(c, -0.425, -0.145, 0.85, 0.29, 0.145); c.strokeStyle = rgba("#ffffff", 0.35); c.lineWidth = 0.006; c.stroke();
    c.save(); c.clip();
    // nucleoid (tangled DNA) and ribosomes
    c.strokeStyle = rgba("#2a5a18", 0.55); c.lineWidth = 0.008; c.beginPath();
    let x = 0, y = 0; c.moveTo(x, y);
    for (let i = 0; i < 90; i++) { x = clamp(x + (r() - 0.5) * 0.08, -0.22, 0.22); y = clamp(y + (r() - 0.5) * 0.06, -0.08, 0.08); c.lineTo(x, y); }
    c.stroke();
    c.fillStyle = rgba("#1a3a10", 0.45);
    for (let i = 0; i < 60; i++) { c.beginPath(); c.arc((r() - 0.5) * 0.82, (r() - 0.5) * 0.26, 0.007, 0, TAU); c.fill(); }
    c.fillStyle = rgba("#ffffff", 0.18); rrect(c, -0.38, -0.13, 0.6, 0.05, 0.025); c.fill();
    c.restore();
  },
  cell(c, o, p, r) {
    const egg = o.n.includes("egg");
    if (egg) {
      // corona radiata: a halo of small follicle cells
      for (let i = 0; i < 70; i++) {
        const a = r() * TAU, d = 0.44 + r() * 0.05;
        lumpy(c, r, 0.035 + r() * 0.015, 0.2, Math.cos(a) * d, Math.sin(a) * d);
        c.fillStyle = rgba("#f0d8c8", 0.55); c.fill(); c.strokeStyle = rgba("#a07060", 0.4); c.lineWidth = 0.004; c.stroke();
        c.fillStyle = rgba("#8a5a50", 0.6); c.beginPath(); c.arc(Math.cos(a) * d, Math.sin(a) * d, 0.012, 0, TAU); c.fill();
      }
      // zona pellucida
      c.fillStyle = rgba("#f4f0ff", 0.35); c.beginPath(); c.arc(0, 0, 0.4, 0, TAU); c.fill();
      c.strokeStyle = rgba("#ffffff", 0.5); c.lineWidth = 0.006; c.stroke();
      const g = c.createRadialGradient(-0.08, -0.08, 0, 0, 0, 0.34);
      g.addColorStop(0, "#fff4ea"); g.addColorStop(1, o.c2);
      c.fillStyle = g; c.beginPath(); c.arc(0, 0, 0.34, 0, TAU); c.fill();
      c.fillStyle = rgba("#a06040", 0.25);
      for (let i = 0; i < 260; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.32; c.beginPath(); c.arc(Math.cos(a) * d, Math.sin(a) * d, 0.004 + r() * 0.004, 0, TAU); c.fill(); }
      ball(c, "#d8a080", 0.09, 0.07, -0.05);
      c.fillStyle = "#a05a40"; c.beginPath(); c.arc(0.08, -0.06, 0.025, 0, TAU); c.fill();
      return;
    }
    // white blood cell: ruffled membrane, granules and a lobed nucleus
    c.beginPath();
    for (let i = 0; i <= 160; i++) {
      const t = (i / 160) * TAU, R = 0.45 + 0.025 * Math.sin(t * 23) + 0.015 * Math.sin(t * 41 + 1) + 0.02 * Math.sin(t * 5);
      i ? c.lineTo(Math.cos(t) * R, Math.sin(t) * R) : c.moveTo(Math.cos(t) * R, Math.sin(t) * R);
    }
    c.closePath();
    const g = c.createRadialGradient(-0.12, -0.12, 0, 0, 0, 0.5);
    g.addColorStop(0, "#ffffff"); g.addColorStop(0.7, o.c); g.addColorStop(1, shade(o.c, -0.3));
    c.fillStyle = g; c.fill();
    c.strokeStyle = shade(o.c, -0.35); c.lineWidth = 0.008; c.stroke();
    c.fillStyle = rgba("#b090d0", 0.55);
    for (let i = 0; i < 180; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.4; c.beginPath(); c.arc(Math.cos(a) * d, Math.sin(a) * d, 0.006 + r() * 0.006, 0, TAU); c.fill(); }
    const lobes = [[-0.12, -0.04, 0.11], [0.04, -0.1, 0.1], [0.14, 0.06, 0.1]];
    c.strokeStyle = o.c2; c.lineWidth = 0.04; c.beginPath(); c.moveTo(-0.12, -0.04); c.lineTo(0.04, -0.1); c.lineTo(0.14, 0.06); c.stroke();
    for (const [x, y, R] of lobes) {
      lumpy(c, r, R, 0.12, x, y);
      const ng = c.createRadialGradient(x - 0.03, y - 0.03, 0, x, y, R);
      ng.addColorStop(0, shade(o.c2, 0.3)); ng.addColorStop(1, shade(o.c2, -0.3));
      c.fillStyle = ng; c.fill();
    }
  },
  amoeba(c, o, p, r) {
    c.beginPath();
    const ph = r() * TAU;
    for (let i = 0; i <= 120; i++) {
      const t = (i / 120) * TAU;
      const R = 0.28 + 0.18 * Math.pow(Math.max(0, Math.sin(3 * t + ph)), 3) + 0.03 * Math.sin(7 * t) + 0.012 * Math.sin(19 * t);
      i ? c.lineTo(Math.cos(t) * R, Math.sin(t) * R) : c.moveTo(Math.cos(t) * R, Math.sin(t) * R);
    }
    c.closePath();
    c.fillStyle = rgba(o.c, 0.55); c.fill();
    c.strokeStyle = rgba("#5aa088", 0.9); c.lineWidth = 0.01; c.stroke();
    c.save(); c.clip();
    // granular endoplasm
    c.fillStyle = rgba("#4a8a70", 0.35);
    for (let i = 0; i < 400; i++) { const a = r() * TAU, d = Math.sqrt(r()) * 0.4; c.beginPath(); c.arc(Math.cos(a) * d, Math.sin(a) * d, 0.004, 0, TAU); c.fill(); }
    c.restore();
    for (let i = 0; i < 4; i++) { // food vacuoles
      const x = (r() - 0.5) * 0.3, y = (r() - 0.5) * 0.3;
      c.fillStyle = rgba("#e0f0e0", 0.6); c.beginPath(); c.arc(x, y, 0.035, 0, TAU); c.fill();
      c.fillStyle = rgba("#8a6a3a", 0.8); c.beginPath(); c.arc(x + 0.005, y + 0.005, 0.017, 0, TAU); c.fill();
    }
    c.fillStyle = rgba("#ffffff", 0.7); c.beginPath(); c.arc(0.12, 0.1, 0.045, 0, TAU); c.fill(); // contractile vacuole
    c.strokeStyle = rgba("#7ab0d0", 0.8); c.lineWidth = 0.004; c.stroke();
    ball(c, "#5a9a80", 0.075, -0.06, 0.02);
    c.fillStyle = "#2a6a50"; c.beginPath(); c.arc(-0.055, 0.025, 0.025, 0, TAU); c.fill();
  },
  hair(c, o, p, r) {
    const h = o.h / 2;
    const g = c.createLinearGradient(-0.5, 0, 0.5, 0);
    g.addColorStop(0, shade(o.c, -0.6)); g.addColorStop(0.3, shade(o.c, 0.35)); g.addColorStop(0.45, shade(o.c, 0.15)); g.addColorStop(1, shade(o.c, -0.65));
    c.fillStyle = g; c.fillRect(-0.5, -h, 1, h * 2);
    // overlapping cuticle scales with uneven free edges
    for (let y = -h + 0.05; y < h; y += 0.16) {
      c.beginPath(); c.moveTo(-0.5, y);
      for (let x = -0.5; x <= 0.5; x += 0.05) c.lineTo(x, y - Math.cos(x * 2.6) * 0.07 + (r() - 0.5) * 0.02);
      c.lineTo(0.5, y + 0.03); c.lineTo(-0.5, y + 0.03); c.closePath();
      c.fillStyle = rgba("#000000", 0.12); c.fill();
      c.strokeStyle = rgba("#ffffff", 0.25); c.lineWidth = 0.008;
      c.beginPath(); c.moveTo(-0.5, y);
      for (let x = -0.5; x <= 0.5; x += 0.05) c.lineTo(x, y - Math.cos(x * 2.6) * 0.07); c.stroke();
    }
  },
  cube(c, o, p, r) {
    const a = 0.43;
    const face = (pts, col) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fillStyle = col; c.fill(); c.strokeStyle = "rgba(255,255,255,0.6)"; c.lineWidth = 0.006; c.stroke(); };
    face([[0, -0.5], [a, -0.25], [0, 0], [-a, -0.25]], "rgba(255,255,255,0.95)");
    face([[-a, -0.25], [0, 0], [0, 0.5], [-a, 0.25]], "rgba(214,222,234,0.95)");
    face([[0, 0], [a, -0.25], [a, 0.25], [0, 0.5]], "rgba(178,190,206,0.95)");
    // hopper-crystal steps on the top face
    c.strokeStyle = "rgba(150,165,185,0.5)"; c.lineWidth = 0.004;
    for (let k = 0.2; k < 0.9; k += 0.15) { c.beginPath(); c.moveTo(0, -0.25 - 0.25 * k); c.lineTo(a * k, -0.25); c.lineTo(0, -0.25 + 0.25 * k); c.lineTo(-a * k, -0.25); c.closePath(); c.stroke(); }
    c.fillStyle = "rgba(255,255,255,0.8)";
    for (let i = 0; i < 12; i++) { c.beginPath(); c.arc(-a + r() * a, -0.2 + r() * 0.4, 0.006, 0, TAU); c.fill(); }
    c.strokeStyle = "rgba(255,255,255,0.9)"; c.lineWidth = 0.012; c.beginPath(); c.moveTo(-a + 0.02, -0.24); c.lineTo(-0.02, -0.02); c.stroke();
  },

  // ---- small creatures ----
  bug(c, o, p, r) {
    const dark = shade(o.c, -0.35);
    c.strokeStyle = dark; c.lineCap = "round"; c.lineJoin = "round";
    const leg = (x, s, spread, len) => {
      c.lineWidth = 0.022;
      c.beginPath(); c.moveTo(x, 0); c.lineTo(x + spread * 0.5, s * len * 0.45); c.lineTo(x + spread, s * len * 0.75); c.lineTo(x + spread * 1.4, s * len); c.stroke();
      c.fillStyle = dark; c.beginPath(); c.arc(x + spread * 0.5, s * len * 0.45, 0.012, 0, TAU); c.fill();
    };
    if (o.ant) {
      for (const s of [-1, 1]) { leg(0.0, s, -0.12, 0.38); leg(0.03, s, 0.02, 0.36); leg(0.06, s, 0.15, 0.36); }
      // gaster, petiole, thorax, head
      c.save(); c.translate(-0.28, 0); c.scale(1, 0.78); ball(c, o.c, 0.2); c.restore();
      c.strokeStyle = rgba("#ffffff", 0.12); c.lineWidth = 0.01;
      for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(-0.28, 0, 0.08 + i * 0.045, -1.2, 1.2); c.stroke(); }
      ball(c, o.c, 0.05, -0.08, 0);
      c.save(); c.translate(0.05, 0); c.scale(1.5, 0.75); ball(c, o.c, 0.07); c.restore();
      c.save(); c.translate(0.24, 0); c.scale(1.1, 0.95); ball(c, o.c, 0.1); c.restore();
      c.fillStyle = "#000"; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(0.27, s * 0.07, 0.03, 0.02, 0, 0, TAU); c.fill(); }
      c.strokeStyle = o.c; c.lineWidth = 0.02;
      for (const s of [-1, 1]) {
        c.beginPath(); c.moveTo(0.3, s * 0.04); c.lineTo(0.4, s * 0.12); c.lineTo(0.5, s * 0.08); c.stroke();
        c.beginPath(); c.moveTo(0.33, s * 0.02); c.quadraticCurveTo(0.38, s * 0.03, 0.37, -s * 0.0); c.stroke();
      }
      return;
    }
    // mite: eight hairy legs around a round body
    for (const s of [-1, 1]) for (let i = 0; i < 4; i++) leg(-0.1 + i * 0.07, s, (i - 1.5) * 0.12, 0.38);
    c.save(); c.scale(1, 0.82); ball(c, o.c, 0.26); c.restore();
    ball(c, shade(o.c, -0.1), 0.08, 0.26, 0);
    c.strokeStyle = rgba("#6a5a40", 0.7); c.lineWidth = 0.006;
    for (let i = 0; i < 40; i++) { const a = r() * TAU, d = 0.12 + r() * 0.12; c.beginPath(); c.moveTo(Math.cos(a) * d, Math.sin(a) * d * 0.82); c.lineTo(Math.cos(a) * (d + 0.08), Math.sin(a) * (d + 0.08) * 0.82); c.stroke(); }
    c.strokeStyle = rgba("#8a7050", 0.5); c.lineWidth = 0.008;
    for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(-0.22 + i * 0.1, -0.18); c.quadraticCurveTo(-0.24 + i * 0.1, 0, -0.22 + i * 0.1, 0.18); c.stroke(); }
  },
  ladybug(c, o, p) {
    c.strokeStyle = "#111"; c.lineWidth = 0.02; c.lineCap = "round";
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { c.beginPath(); c.moveTo(-0.12 + i * 0.14, 0); c.lineTo(-0.16 + i * 0.18, s * 0.38); c.lineTo(-0.22 + i * 0.22, s * 0.46); c.stroke(); }
    c.beginPath(); c.moveTo(-0.44, -0.05); c.quadraticCurveTo(-0.52, -0.1, -0.5, -0.17); c.moveTo(-0.44, 0.05); c.quadraticCurveTo(-0.52, 0.1, -0.5, 0.17); c.stroke();
    ball(c, "#151515", 0.12, -0.37, 0);
    // pronotum with white patches
    c.fillStyle = "#1a1a1a"; c.beginPath(); c.ellipse(-0.24, 0, 0.1, 0.22, 0, 0, TAU); c.fill();
    c.fillStyle = "#f2f2f2"; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(-0.27, s * 0.12, 0.04, 0.06, 0, 0, TAU); c.fill(); }
    ball(c, o.c, 0.38, 0.08, 0);
    c.strokeStyle = "#111"; c.lineWidth = 0.018; c.beginPath(); c.moveTo(-0.29, 0); c.lineTo(0.46, 0); c.stroke();
    c.fillStyle = "#111";
    for (const [x, y, rr] of [[0.0, -0.18, 0.07], [0.0, 0.18, 0.07], [0.22, -0.13, 0.075], [0.22, 0.13, 0.075], [0.32, -0.27, 0.045], [0.32, 0.27, 0.045], [-0.17, -0.08, 0.05], [-0.17, 0.08, 0.05]]) { c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill(); }
    c.fillStyle = "rgba(255,255,255,0.5)"; c.beginPath(); c.ellipse(-0.04, -0.2, 0.09, 0.04, -0.5, 0, TAU); c.fill();
    c.fillStyle = "#fff"; for (const s of [-1, 1]) { c.beginPath(); c.arc(-0.43, s * 0.06, 0.018, 0, TAU); c.fill(); }
  },
  bee(c, o, p, r) {
    c.strokeStyle = "#2a1a08"; c.lineWidth = 0.018; c.lineCap = "round";
    for (const [x, dx] of [[-0.15, -0.05], [-0.08, 0.03], [-0.02, 0.12]]) { c.beginPath(); c.moveTo(x, 0.08); c.lineTo(x + dx * 0.6, 0.2); c.lineTo(x + dx, 0.3); c.stroke(); }
    // wings with veins
    const wing = (x, y, rx, ry, rot) => {
      c.save(); c.translate(x, y); c.rotate(rot);
      c.fillStyle = "rgba(220,235,255,0.45)"; c.strokeStyle = "rgba(255,255,255,0.75)"; c.lineWidth = 0.006;
      c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, TAU); c.fill(); c.stroke();
      c.strokeStyle = "rgba(90,70,40,0.5)"; c.lineWidth = 0.004;
      c.beginPath(); c.moveTo(-rx, 0); c.lineTo(rx * 0.8, -ry * 0.2); c.moveTo(-rx * 0.4, 0); c.lineTo(rx * 0.3, ry * 0.7); c.moveTo(0, -0.1 * ry); c.lineTo(rx * 0.5, -ry * 0.8); c.stroke();
      c.restore();
    };
    wing(0.0, -0.26, 0.22, 0.09, -0.5); wing(0.15, -0.2, 0.15, 0.06, -0.3);
    // abdomen with stripes and fuzz
    c.save(); c.beginPath(); c.ellipse(0.14, 0.03, 0.27, 0.15, 0.1, 0, TAU); c.clip();
    const g = c.createLinearGradient(0, -0.15, 0, 0.18);
    g.addColorStop(0, shade(o.c, 0.35)); g.addColorStop(1, shade(o.c, -0.35));
    c.fillStyle = g; c.fillRect(-0.2, -0.2, 0.7, 0.45);
    c.fillStyle = "#1a1408"; for (let x = 0.05; x < 0.45; x += 0.11) { c.beginPath(); c.ellipse(x, 0.03, 0.03, 0.2, 0.1, 0, TAU); c.fill(); }
    c.fillStyle = rgba("#ffffff", 0.25); c.beginPath(); c.ellipse(0.12, -0.06, 0.15, 0.03, 0.1, 0, TAU); c.fill();
    c.restore();
    c.fillStyle = "#1a1408"; c.beginPath(); c.moveTo(0.4, 0.04); c.lineTo(0.5, 0.08); c.lineTo(0.4, 0.09); c.fill();
    // fuzzy thorax
    c.strokeStyle = "#c08a2a"; c.lineWidth = 0.006;
    for (let i = 0; i < 80; i++) { const a = r() * TAU; c.beginPath(); c.moveTo(-0.18 + Math.cos(a) * 0.08, 0.02 + Math.sin(a) * 0.08); c.lineTo(-0.18 + Math.cos(a) * 0.12, 0.02 + Math.sin(a) * 0.12); c.stroke(); }
    ball(c, "#6a4a1a", 0.1, -0.18, 0.02);
    ball(c, "#1a1408", 0.085, -0.34, 0.05);
    c.fillStyle = "#3a3a4a"; c.beginPath(); c.ellipse(-0.36, 0.02, 0.04, 0.055, 0.3, 0, TAU); c.fill();
    c.strokeStyle = "#1a1408"; c.lineWidth = 0.012; c.beginPath(); c.moveTo(-0.38, -0.02); c.quadraticCurveTo(-0.45, -0.12, -0.5, -0.1); c.stroke();
  },
  coin(c, o, p) {
    // reeded edge
    c.fillStyle = shade(o.c, -0.35); c.beginPath(); c.arc(0, 0, 0.5, 0, TAU); c.fill();
    c.strokeStyle = shade(o.c, 0.1); c.lineWidth = 0.006;
    for (let i = 0; i < 120; i++) { const a = (i / 120) * TAU; c.beginPath(); c.moveTo(Math.cos(a) * 0.47, Math.sin(a) * 0.47); c.lineTo(Math.cos(a) * 0.5, Math.sin(a) * 0.5); c.stroke(); }
    ball(c, o.c, 0.46);
    c.strokeStyle = shade(o.c, -0.25); c.lineWidth = 0.018; c.beginPath(); c.arc(0, 0, 0.41, 0, TAU); c.stroke();
    c.strokeStyle = shade(o.c, 0.35); c.lineWidth = 0.008; c.beginPath(); c.arc(0, 0, 0.4, Math.PI, 1.5 * Math.PI); c.stroke();
    // embossed star and lettering
    c.fillStyle = shade(o.c, -0.2);
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, R = i % 2 ? 0.07 : 0.17; i ? c.lineTo(Math.cos(a) * R, Math.sin(a) * R - 0.06) : c.moveTo(Math.cos(a) * R, Math.sin(a) * R - 0.06); }
    c.fill();
    c.fillStyle = shade(o.c, 0.3);
    c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, R = i % 2 ? 0.06 : 0.15; i ? c.lineTo(Math.cos(a) * R - 0.008, Math.sin(a) * R - 0.068) : c.moveTo(Math.cos(a) * R - 0.008, Math.sin(a) * R - 0.068); }
    c.fill();
    c.fillStyle = shade(o.c, -0.3); c.font = "bold 0.12px sans-serif"; c.textAlign = "center"; c.textBaseline = "middle";
    c.fillText("ONE", 0, 0.2);
    c.font = "0.06px sans-serif"; c.fillText("★ 2024 ★", 0, 0.31);
  },
  golf(c, o) {
    ball(c, o.c, 0.5);
    c.save(); c.beginPath(); c.arc(0, 0, 0.5, 0, TAU); c.clip();
    for (let i = 0; i < 260; i++) {
      const y = 1 - (2 * (i + 0.5)) / 260, rad = Math.sqrt(1 - y * y), th = i * 2.39996;
      const z = Math.sin(th) * rad; if (z < 0.05) continue;
      const x = Math.cos(th) * rad, s = 0.028 * Math.sqrt(z);
      c.save(); c.translate(x * 0.48, y * 0.48); c.rotate(Math.atan2(y, x)); c.scale(Math.max(z, 0.25), 1);
      c.fillStyle = "rgba(0,0,0,0.11)"; c.beginPath(); c.arc(0, 0, s * 1.1, 0, TAU); c.fill();
      c.fillStyle = "rgba(255,255,255,0.55)"; c.beginPath(); c.arc(s * 0.25, s * 0.25, s * 0.6, 0, TAU); c.fill();
      c.restore();
    }
    c.restore();
    c.fillStyle = "rgba(255,255,255,0.6)"; c.beginPath(); c.ellipse(-0.16, -0.2, 0.12, 0.07, -0.6, 0, TAU); c.fill();
  },
  tennis(c, o, p, r) {
    ball(c, o.c, 0.5);
    c.save(); c.beginPath(); c.arc(0, 0, 0.5, 0, TAU); c.clip();
    c.strokeStyle = rgba("#f4ffb0", 0.25); c.lineWidth = 0.004;
    for (let i = 0; i < 500; i++) { const x = (r() - 0.5), y = (r() - 0.5), a = r() * TAU; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 0.03, y + Math.sin(a) * 0.03); c.stroke(); }
    for (const [lw, col] of [[0.06, "rgba(0,0,0,0.12)"], [0.04, "#f8f8f0"]]) {
      c.strokeStyle = col; c.lineWidth = lw;
      c.beginPath(); c.arc(-0.62, 0, 0.45, -1, 1); c.stroke();
      c.beginPath(); c.arc(0.62, 0, 0.45, Math.PI - 1, Math.PI + 1); c.stroke();
    }
    c.restore();
    c.fillStyle = "rgba(0,0,0,0.6)"; c.font = "bold 0.08px sans-serif"; c.textAlign = "center"; c.fillText("PRO 1", 0.02, 0.05);
  },
  basket(c, o, p, r) {
    ball(c, o.c, 0.5);
    c.save(); c.beginPath(); c.arc(0, 0, 0.5, 0, TAU); c.clip();
    c.fillStyle = "rgba(0,0,0,0.12)";
    for (let i = 0; i < 900; i++) { c.beginPath(); c.arc(r() - 0.5, r() - 0.5, 0.006, 0, TAU); c.fill(); }
    c.strokeStyle = "#1a0f08"; c.lineWidth = 0.022;
    c.beginPath(); c.ellipse(0, 0, 0.5, 0.08, 0.15, 0, TAU); c.stroke();
    c.beginPath(); c.ellipse(0, 0, 0.1, 0.5, 0.15, 0, TAU); c.stroke();
    c.beginPath(); c.arc(-0.66, -0.1, 0.45, -1.3, 1.3); c.stroke();
    c.beginPath(); c.arc(0.66, 0.1, 0.45, Math.PI - 1.3, Math.PI + 1.3); c.stroke();
    c.restore();
    limbShade(c);
  },

  // ---- animals & people ----
  mouse(c, o, p) {
    const fur = o.c, dark = shade(fur, -0.3);
    c.strokeStyle = "#d8a0a0"; c.lineWidth = 0.022; c.lineCap = "round";
    c.beginPath(); c.moveTo(-0.2, 0.18); c.bezierCurveTo(-0.38, 0.28, -0.45, 0.05, -0.58, 0.14); c.stroke();
    c.fillStyle = "#e8b0b0";
    for (const x of [-0.12, 0.1]) { c.beginPath(); c.ellipse(x, 0.27, 0.04, 0.015, 0, 0, TAU); c.fill(); }
    const g = c.createRadialGradient(-0.02, 0.0, 0.02, 0, 0.1, 0.3);
    g.addColorStop(0, shade(fur, 0.35)); g.addColorStop(1, dark);
    c.fillStyle = g;
    c.beginPath(); c.moveTo(-0.22, 0.2); c.bezierCurveTo(-0.28, 0.0, -0.1, -0.05, 0.1, -0.02); c.bezierCurveTo(0.25, 0.0, 0.33, 0.06, 0.4, 0.13); c.quadraticCurveTo(0.35, 0.2, 0.2, 0.22); c.lineTo(-0.15, 0.25); c.quadraticCurveTo(-0.22, 0.24, -0.22, 0.2); c.fill();
    c.fillStyle = fur; c.beginPath(); c.arc(0.17, 0.0, 0.075, 0, TAU); c.fill();
    c.fillStyle = "#f0b8b8"; c.beginPath(); c.arc(0.17, 0.0, 0.05, 0, TAU); c.fill();
    c.fillStyle = "#111"; c.beginPath(); c.arc(0.28, 0.07, 0.022, 0, TAU); c.fill();
    c.fillStyle = "#fff"; c.beginPath(); c.arc(0.273, 0.063, 0.007, 0, TAU); c.fill();
    c.fillStyle = "#e88a9a"; c.beginPath(); c.arc(0.405, 0.13, 0.016, 0, TAU); c.fill();
    c.strokeStyle = "rgba(60,60,60,0.7)"; c.lineWidth = 0.004;
    for (const a of [-0.25, 0, 0.25]) { c.beginPath(); c.moveTo(0.38, 0.14); c.lineTo(0.38 + Math.cos(a) * 0.15, 0.14 + Math.sin(a) * 0.1); c.stroke(); }
  },
  cat(c, o, p, r) {
    const fur = o.c, dark = shade(fur, -0.3), light = shade(fur, 0.35), ground = 0.42;
    c.lineCap = "round"; c.lineJoin = "round";
    // far legs
    c.strokeStyle = dark; c.lineWidth = 0.06;
    c.beginPath(); c.moveTo(-0.2, 0.08); c.lineTo(-0.2, 0.25); c.lineTo(-0.23, ground); c.stroke();
    c.beginPath(); c.moveTo(0.22, 0.08); c.lineTo(0.23, ground); c.stroke();
    // tail
    c.strokeStyle = fur; c.lineWidth = 0.05;
    c.beginPath(); c.moveTo(-0.28, -0.02); c.bezierCurveTo(-0.45, -0.08, -0.46, -0.33, -0.36, -0.38); c.stroke();
    c.strokeStyle = dark; c.lineWidth = 0.05; c.setLineDash([0.03, 0.04]);
    c.beginPath(); c.moveTo(-0.33, -0.04); c.bezierCurveTo(-0.45, -0.08, -0.46, -0.33, -0.36, -0.38); c.stroke(); c.setLineDash([]);
    // body
    const body = new Path2D();
    body.moveTo(0.24, -0.1); body.quadraticCurveTo(0, -0.13, -0.26, -0.07);
    body.quadraticCurveTo(-0.36, 0.02, -0.29, 0.13); body.quadraticCurveTo(0, 0.19, 0.2, 0.13);
    body.quadraticCurveTo(0.3, 0.02, 0.24, -0.1);
    const g = c.createLinearGradient(0, -0.13, 0, 0.18);
    g.addColorStop(0, fur); g.addColorStop(0.7, fur); g.addColorStop(1, light);
    c.fillStyle = g; c.fill(body);
    // near legs with thighs
    c.fillStyle = fur; c.beginPath(); c.ellipse(-0.22, 0.07, 0.1, 0.11, 0.2, 0, TAU); c.fill();
    c.strokeStyle = fur; c.lineWidth = 0.065;
    c.beginPath(); c.moveTo(-0.2, 0.12); c.lineTo(-0.17, 0.28); c.lineTo(-0.18, ground); c.stroke();
    c.beginPath(); c.moveTo(0.17, 0.05); c.lineTo(0.17, ground); c.stroke();
    c.fillStyle = light; for (const x of [-0.17, 0.18]) { c.beginPath(); c.ellipse(x + 0.01, ground + 0.01, 0.045, 0.022, 0, 0, TAU); c.fill(); }
    // tabby stripes
    c.save(); c.clip(body);
    c.strokeStyle = dark; c.lineWidth = 0.025;
    for (let x = -0.24; x < 0.18; x += 0.065) { c.beginPath(); c.moveTo(x, -0.14); c.quadraticCurveTo(x + 0.03, -0.04, x - 0.01, 0.06); c.stroke(); }
    c.restore();
    // chest and head
    c.fillStyle = light; c.beginPath(); c.ellipse(0.24, 0.0, 0.075, 0.11, -0.2, 0, TAU); c.fill();
    c.fillStyle = fur;
    c.beginPath(); c.moveTo(0.25, -0.2); c.lineTo(0.25, -0.33); c.lineTo(0.31, -0.23); c.fill();
    c.beginPath(); c.moveTo(0.34, -0.23); c.lineTo(0.39, -0.33); c.lineTo(0.42, -0.19); c.fill();
    c.fillStyle = "#f0a0a0";
    c.beginPath(); c.moveTo(0.265, -0.22); c.lineTo(0.262, -0.3); c.lineTo(0.295, -0.235); c.fill();
    c.beginPath(); c.moveTo(0.36, -0.225); c.lineTo(0.385, -0.3); c.lineTo(0.405, -0.21); c.fill();
    const hg = c.createRadialGradient(0.31, -0.16, 0.01, 0.33, -0.12, 0.12);
    hg.addColorStop(0, light); hg.addColorStop(1, fur);
    c.fillStyle = hg; c.beginPath(); c.ellipse(0.33, -0.13, 0.105, 0.095, 0, 0, TAU); c.fill();
    c.strokeStyle = dark; c.lineWidth = 0.012;
    for (const dx of [-0.03, 0, 0.03]) { c.beginPath(); c.moveTo(0.33 + dx, -0.22); c.lineTo(0.33 + dx * 0.7, -0.18); c.stroke(); }
    c.fillStyle = "#fff4e8"; c.beginPath(); c.ellipse(0.41, -0.09, 0.05, 0.04, 0, 0, TAU); c.fill();
    c.fillStyle = "#9ac83a"; c.beginPath(); c.ellipse(0.37, -0.145, 0.024, 0.017, -0.15, 0, TAU); c.fill();
    c.fillStyle = "#111"; c.beginPath(); c.ellipse(0.373, -0.145, 0.006, 0.015, 0, 0, TAU); c.fill();
    c.fillStyle = "#fff"; c.beginPath(); c.arc(0.364, -0.152, 0.004, 0, TAU); c.fill();
    c.fillStyle = "#e88a8a"; c.beginPath(); c.moveTo(0.44, -0.115); c.lineTo(0.462, -0.115); c.lineTo(0.452, -0.1); c.fill();
    c.strokeStyle = "#7a4a3a"; c.lineWidth = 0.005; c.beginPath(); c.moveTo(0.452, -0.1); c.lineTo(0.452, -0.085); c.quadraticCurveTo(0.44, -0.075, 0.43, -0.082); c.stroke();
    c.strokeStyle = "rgba(255,255,255,0.8)"; c.lineWidth = 0.003;
    for (const a of [-0.2, 0, 0.2]) { c.beginPath(); c.moveTo(0.43, -0.09); c.lineTo(0.43 + Math.cos(a) * 0.14, -0.09 + Math.sin(a) * 0.08); c.stroke(); }
  },
  giraffe(c, o, p, r) {
    const ground = 0.49, cream = "#f3e2b8", patch = "#9a5a26";
    c.lineCap = "round"; c.lineJoin = "round";
    const legs = (xs, col) => {
      c.strokeStyle = col; c.lineWidth = 0.03;
      for (const [x0, x1] of xs) { c.beginPath(); c.moveTo(x0, 0.04); c.lineTo((x0 + x1) / 2, 0.27); c.lineTo(x1, ground - 0.02); c.stroke(); }
      c.fillStyle = "#3a2a1a"; for (const [, x1] of xs) c.fillRect(x1 - 0.02, ground - 0.025, 0.04, 0.025);
    };
    legs([[-0.15, -0.13], [0.1, 0.12]], "#d8c49a");
    // tail
    c.strokeStyle = "#c8a070"; c.lineWidth = 0.01; c.beginPath(); c.moveTo(-0.22, -0.02); c.quadraticCurveTo(-0.27, 0.08, -0.26, 0.2); c.stroke();
    c.fillStyle = "#2a1a10"; c.beginPath(); c.ellipse(-0.26, 0.22, 0.015, 0.035, 0, 0, TAU); c.fill();
    const shape = new Path2D();
    shape.moveTo(-0.23, -0.02); shape.quadraticCurveTo(-0.2, -0.1, 0.02, -0.13);
    shape.lineTo(0.24, -0.43); shape.quadraticCurveTo(0.29, -0.47, 0.32, -0.42);
    shape.lineTo(0.17, -0.03); shape.quadraticCurveTo(0.16, 0.09, 0.05, 0.08);
    shape.lineTo(-0.15, 0.08); shape.quadraticCurveTo(-0.25, 0.08, -0.23, -0.02);
    c.fillStyle = cream; c.fill(shape);
    c.save(); c.clip(shape);
    for (let y = -0.48; y < 0.1; y += 0.055) for (let x = -0.26; x < 0.34; x += 0.055) {
      const jx = x + (r() - 0.5) * 0.02 + ((Math.round(y / 0.055) % 2) * 0.027), jy = y + (r() - 0.5) * 0.02;
      lumpy(c, r, 0.022 + r() * 0.006, 0.3, jx, jy); c.fillStyle = shade(patch, (r() - 0.5) * 0.2); c.fill();
    }
    const sh = c.createLinearGradient(0, -0.1, 0, 0.09);
    sh.addColorStop(0, "rgba(0,0,0,0)"); sh.addColorStop(1, "rgba(0,0,0,0.25)");
    c.fillStyle = sh; c.fillRect(-0.3, -0.1, 0.5, 0.2);
    c.restore();
    // mane
    c.strokeStyle = "#7a4a20"; c.lineWidth = 0.018;
    c.beginPath(); c.moveTo(0.01, -0.135); c.lineTo(0.235, -0.44); c.stroke();
    legs([[-0.18, -0.19], [0.13, 0.15]], cream);
    for (const [x0, x1] of [[-0.18, -0.19], [0.13, 0.15]]) { c.fillStyle = patch; c.beginPath(); c.arc((x0 + x1) / 2, 0.12, 0.012, 0, TAU); c.fill(); }
    // head
    c.save(); c.translate(0.3, -0.44); c.rotate(0.35);
    c.fillStyle = cream; c.beginPath(); c.ellipse(0.04, 0, 0.075, 0.035, 0, 0, TAU); c.fill();
    c.fillStyle = "#e8c898"; c.beginPath(); c.ellipse(0.1, 0.008, 0.035, 0.028, 0, 0, TAU); c.fill();
    c.fillStyle = patch; c.beginPath(); c.arc(0.0, 0.0, 0.02, 0, TAU); c.fill();
    c.strokeStyle = "#c8a070"; c.lineWidth = 0.012;
    for (const dx of [-0.015, 0.01]) { c.beginPath(); c.moveTo(dx, -0.03); c.lineTo(dx - 0.01, -0.075); c.stroke(); c.fillStyle = "#3a2a1a"; c.beginPath(); c.arc(dx - 0.01, -0.078, 0.009, 0, TAU); c.fill(); }
    c.fillStyle = cream; c.beginPath(); c.ellipse(-0.04, -0.03, 0.025, 0.01, -0.6, 0, TAU); c.fill();
    c.fillStyle = "#111"; c.beginPath(); c.arc(0.045, -0.012, 0.008, 0, TAU); c.fill();
    c.fillStyle = "#4a2a1a"; c.beginPath(); c.arc(0.125, 0.0, 0.005, 0, TAU); c.fill();
    c.restore();
  },
  dino(c, o, p, r) {
    const g = 0.4, skin = o.c;
    c.lineCap = "round"; c.lineJoin = "round";
    c.strokeStyle = shade(skin, -0.45); c.lineWidth = 0.065;
    c.beginPath(); c.moveTo(-0.1, 0.0); c.lineTo(-0.08, 0.2); c.lineTo(-0.12, g); c.stroke();
    c.lineWidth = 0.02; c.beginPath(); c.moveTo(-0.12, g); c.lineTo(-0.04, g); c.moveTo(-0.12, g); c.lineTo(-0.06, g - 0.01); c.stroke();
    const body = new Path2D();
    body.moveTo(-0.5, -0.07);
    body.quadraticCurveTo(-0.25, -0.2, 0.0, -0.2);
    body.quadraticCurveTo(0.14, -0.2, 0.22, -0.3);
    body.quadraticCurveTo(0.3, -0.35, 0.42, -0.33);
    body.lineTo(0.48, -0.3); body.lineTo(0.47, -0.25); body.lineTo(0.42, -0.23); body.lineTo(0.46, -0.2);
    body.lineTo(0.44, -0.17); body.lineTo(0.3, -0.18);
    body.quadraticCurveTo(0.22, -0.1, 0.14, 0.02);
    body.quadraticCurveTo(0.0, 0.1, -0.15, 0.04);
    body.quadraticCurveTo(-0.3, -0.02, -0.5, -0.07);
    const gr = c.createLinearGradient(0, -0.3, 0, 0.1);
    gr.addColorStop(0, shade(skin, -0.25)); gr.addColorStop(0.6, skin); gr.addColorStop(1, "#c8c08a");
    c.fillStyle = gr; c.fill(body);
    c.save(); c.clip(body);
    c.strokeStyle = rgba("#2a3a1a", 0.35); c.lineWidth = 0.02;
    for (let x = -0.4; x < 0.2; x += 0.06) { c.beginPath(); c.moveTo(x, -0.25); c.lineTo(x + 0.04, -0.12); c.stroke(); }
    c.fillStyle = rgba("#ffffff", 0.06);
    for (let i = 0; i < 150; i++) { c.beginPath(); c.arc(-0.5 + r(), -0.3 + r() * 0.4, 0.006, 0, TAU); c.fill(); }
    c.restore();
    // teeth & jaw line
    c.fillStyle = "#f4f0e0";
    for (let x = 0.32; x < 0.45; x += 0.022) { c.beginPath(); c.moveTo(x, -0.235); c.lineTo(x + 0.008, -0.215); c.lineTo(x + 0.016, -0.235); c.fill(); }
    c.strokeStyle = shade(skin, -0.5); c.lineWidth = 0.006; c.beginPath(); c.moveTo(0.3, -0.235); c.lineTo(0.47, -0.235); c.stroke();
    c.fillStyle = "#e8c030"; c.beginPath(); c.arc(0.36, -0.29, 0.014, 0, TAU); c.fill();
    c.fillStyle = "#111"; c.beginPath(); c.ellipse(0.36, -0.29, 0.004, 0.011, 0, 0, TAU); c.fill();
    c.strokeStyle = shade(skin, -0.5); c.lineWidth = 0.01; c.beginPath(); c.moveTo(0.33, -0.31); c.lineTo(0.39, -0.315); c.stroke();
    c.fillStyle = "#111"; c.beginPath(); c.arc(0.465, -0.305, 0.006, 0, TAU); c.fill();
    // tiny arm
    c.strokeStyle = skin; c.lineWidth = 0.025; c.beginPath(); c.moveTo(0.15, -0.09); c.lineTo(0.2, -0.05); c.lineTo(0.22, -0.07); c.stroke();
    // near leg
    c.fillStyle = skin; c.beginPath(); c.ellipse(-0.03, 0.02, 0.09, 0.11, -0.3, 0, TAU); c.fill();
    c.strokeStyle = skin; c.lineWidth = 0.07;
    c.beginPath(); c.moveTo(-0.04, 0.0); c.lineTo(0.02, 0.2); c.lineTo(-0.02, g); c.stroke();
    c.lineWidth = 0.02; c.strokeStyle = shade(skin, -0.2);
    c.beginPath(); c.moveTo(-0.02, g); c.lineTo(0.07, g); c.moveTo(-0.02, g); c.lineTo(0.05, g - 0.015); c.moveTo(-0.02, g); c.lineTo(-0.06, g); c.stroke();
  },
  whale(c, o, p, r) {
    const body = new Path2D();
    body.moveTo(0.5, 0.02);
    body.bezierCurveTo(0.48, -0.12, 0.2, -0.13, -0.1, -0.08);
    body.quadraticCurveTo(-0.3, -0.04, -0.4, 0.0);
    body.lineTo(-0.5, -0.08); body.quadraticCurveTo(-0.46, 0.02, -0.5, 0.11); body.lineTo(-0.4, 0.03);
    body.quadraticCurveTo(-0.2, 0.08, 0.1, 0.09);
    body.bezierCurveTo(0.35, 0.1, 0.5, 0.08, 0.5, 0.02);
    const g = c.createLinearGradient(0, -0.12, 0, 0.1);
    g.addColorStop(0, shade(o.c, -0.3)); g.addColorStop(0.6, o.c); g.addColorStop(1, shade(o.c, 0.3));
    c.fillStyle = g; c.fill(body);
    c.save(); c.clip(body);
    c.fillStyle = rgba("#ffffff", 0.12);
    for (let i = 0; i < 120; i++) { c.beginPath(); c.ellipse(-0.4 + r() * 0.85, -0.1 + r() * 0.15, 0.004 + r() * 0.008, 0.003 + r() * 0.004, 0, 0, TAU); c.fill(); }
    c.fillStyle = shade(o.c, 0.4); c.beginPath(); c.moveTo(0.5, 0.04); c.quadraticCurveTo(0.2, 0.12, -0.05, 0.09); c.quadraticCurveTo(0.25, 0.06, 0.5, 0.04); c.fill();
    c.strokeStyle = rgba("#1a2a3a", 0.4); c.lineWidth = 0.003;
    for (let i = 0; i < 9; i++) { c.beginPath(); c.moveTo(0.48, 0.04 + i * 0.004); c.quadraticCurveTo(0.25, 0.08 + i * 0.004, 0.05, 0.075 + i * 0.002); c.stroke(); }
    c.restore();
    c.fillStyle = shade(o.c, -0.35);
    c.beginPath(); c.moveTo(0.2, 0.06); c.quadraticCurveTo(0.12, 0.13, 0.06, 0.15); c.quadraticCurveTo(0.12, 0.09, 0.15, 0.05); c.fill();
    c.beginPath(); c.moveTo(-0.22, -0.055); c.lineTo(-0.26, -0.08); c.lineTo(-0.26, -0.05); c.fill();
    c.fillStyle = "#111"; c.beginPath(); c.arc(0.33, 0.02, 0.007, 0, TAU); c.fill();
    c.fillStyle = shade(o.c, -0.5); c.beginPath(); c.ellipse(0.35, -0.11, 0.015, 0.005, 0, 0, TAU); c.fill();
  },
  person(c, o, p) {
    const skin = o.c, skinD = shade(skin, -0.22);
    c.fillStyle = "rgba(0,0,0,0.25)"; c.beginPath(); c.ellipse(0, 0.5, 0.13, 0.014, 0, 0, TAU); c.fill();
    // jeans
    const jeans = c.createLinearGradient(-0.09, 0, 0.09, 0);
    jeans.addColorStop(0, "#1e2b44"); jeans.addColorStop(0.3, "#38568a"); jeans.addColorStop(0.5, "#2a4068"); jeans.addColorStop(0.7, "#38568a"); jeans.addColorStop(1, "#1a2640");
    c.fillStyle = jeans;
    c.beginPath(); c.moveTo(-0.087, 0.0); c.lineTo(0.087, 0.0); c.lineTo(0.08, 0.47); c.lineTo(0.012, 0.47); c.lineTo(0.004, 0.11); c.lineTo(-0.004, 0.11); c.lineTo(-0.012, 0.47); c.lineTo(-0.08, 0.47); c.closePath(); c.fill();
    c.strokeStyle = "rgba(220,170,90,0.35)"; c.lineWidth = 0.003;
    for (const x of [-0.05, 0.05]) { c.beginPath(); c.moveTo(x, 0.03); c.lineTo(x * 0.95, 0.465); c.stroke(); }
    c.strokeStyle = "rgba(0,0,0,0.2)"; c.lineWidth = 0.004;
    for (const x of [-0.045, 0.045]) { c.beginPath(); c.moveTo(x - 0.02, 0.27); c.quadraticCurveTo(x, 0.285, x + 0.02, 0.27); c.stroke(); }
    // shoes
    for (const s of [-1, 1]) {
      c.fillStyle = "#2a2a2e"; rrect(c, s > 0 ? 0.008 : -0.09, 0.462, 0.082, 0.034, 0.014); c.fill();
      c.fillStyle = "#e8e8e8"; c.fillRect(s > 0 ? 0.008 : -0.09, 0.492, 0.082, 0.008);
    }
    // belt
    c.fillStyle = "#4a2e1c"; c.fillRect(-0.089, -0.008, 0.178, 0.024);
    c.strokeStyle = "#d8b860"; c.lineWidth = 0.004; c.strokeRect(-0.013, -0.005, 0.026, 0.018);
    // arms (behind torso edges)
    const shirtCol = "#3a74c8";
    for (const s of [-1, 1]) {
      c.fillStyle = shade(shirtCol, -0.12);
      c.beginPath(); c.moveTo(s * 0.095, -0.355); c.quadraticCurveTo(s * 0.138, -0.345, s * 0.14, -0.3); c.lineTo(s * 0.152, -0.12); c.lineTo(s * 0.154, -0.01); c.lineTo(s * 0.116, -0.01); c.lineTo(s * 0.113, -0.12); c.lineTo(s * 0.1, -0.27); c.closePath(); c.fill();
      c.fillStyle = shade(shirtCol, -0.3); c.fillRect(s > 0 ? 0.116 : -0.154, -0.02, 0.038, 0.012);
      const hg = c.createRadialGradient(s * 0.13, 0.02, 0, s * 0.135, 0.03, 0.035);
      hg.addColorStop(0, skin); hg.addColorStop(1, skinD);
      c.fillStyle = hg; c.beginPath(); c.ellipse(s * 0.135, 0.03, 0.021, 0.033, s * -0.1, 0, TAU); c.fill();
    }
    // shirt
    const shirt = c.createLinearGradient(-0.11, 0, 0.11, 0);
    shirt.addColorStop(0, shade(shirtCol, -0.25)); shirt.addColorStop(0.4, shade(shirtCol, 0.15)); shirt.addColorStop(1, shade(shirtCol, -0.3));
    c.fillStyle = shirt;
    c.beginPath(); c.moveTo(-0.07, -0.365); c.quadraticCurveTo(-0.112, -0.36, -0.113, -0.31); c.lineTo(-0.1, -0.005); c.lineTo(0.1, -0.005); c.lineTo(0.113, -0.31); c.quadraticCurveTo(0.112, -0.36, 0.07, -0.365); c.closePath(); c.fill();
    c.strokeStyle = "rgba(0,0,0,0.15)"; c.lineWidth = 0.004;
    c.beginPath(); c.moveTo(-0.06, -0.2); c.quadraticCurveTo(-0.03, -0.15, -0.065, -0.06); c.moveTo(0.055, -0.12); c.quadraticCurveTo(0.03, -0.07, 0.06, -0.02); c.stroke();
    c.beginPath(); c.moveTo(0, -0.34); c.lineTo(0, -0.01); c.stroke();
    c.fillStyle = "rgba(255,255,255,0.7)"; for (let y = -0.3; y < -0.02; y += 0.06) { c.beginPath(); c.arc(0.006, y, 0.004, 0, TAU); c.fill(); }
    // neck & collar
    c.fillStyle = skinD; c.fillRect(-0.02, -0.39, 0.04, 0.035);
    c.fillStyle = shade(shirtCol, -0.1);
    c.beginPath(); c.moveTo(-0.035, -0.37); c.lineTo(0, -0.335); c.lineTo(-0.012, -0.322); c.lineTo(-0.045, -0.36); c.fill();
    c.beginPath(); c.moveTo(0.035, -0.37); c.lineTo(0, -0.335); c.lineTo(0.012, -0.322); c.lineTo(0.045, -0.36); c.fill();
    // head
    c.fillStyle = skinD;
    for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 0.053, -0.428, 0.011, 0.019, 0, 0, TAU); c.fill(); }
    const fg = c.createRadialGradient(-0.012, -0.445, 0.005, 0, -0.43, 0.07);
    fg.addColorStop(0, shade(skin, 0.15)); fg.addColorStop(1, skinD);
    c.fillStyle = fg; c.beginPath(); c.ellipse(0, -0.43, 0.051, 0.064, 0, 0, TAU); c.fill();
    c.fillStyle = "#3a2414";
    c.beginPath(); c.moveTo(-0.056, -0.418); c.quadraticCurveTo(-0.064, -0.5, 0, -0.5); c.quadraticCurveTo(0.064, -0.5, 0.056, -0.418);
    c.quadraticCurveTo(0.05, -0.465, 0.01, -0.466); c.quadraticCurveTo(-0.03, -0.47, -0.05, -0.44); c.closePath(); c.fill();
    for (const s of [-1, 1]) {
      c.fillStyle = "#fff"; c.beginPath(); c.ellipse(s * 0.02, -0.432, 0.009, 0.006, 0, 0, TAU); c.fill();
      c.fillStyle = "#4a3020"; c.beginPath(); c.arc(s * 0.02, -0.432, 0.0045, 0, TAU); c.fill();
      c.strokeStyle = "#3a2414"; c.lineWidth = 0.004; c.beginPath(); c.moveTo(s * 0.01, -0.446); c.lineTo(s * 0.031, -0.448); c.stroke();
    }
    c.strokeStyle = skinD; c.lineWidth = 0.004; c.beginPath(); c.moveTo(0.001, -0.43); c.lineTo(0.005, -0.413); c.lineTo(-0.002, -0.411); c.stroke();
    c.strokeStyle = "#a04a3a"; c.lineWidth = 0.004; c.beginPath(); c.arc(0, -0.408, 0.016, 0.25 * Math.PI, 0.75 * Math.PI); c.stroke();
  },

  // ---- vehicles & machines ----
  vehicle(c, o, p) {
    const wheel = (x, y, R) => {
      c.fillStyle = "#151515"; c.beginPath(); c.arc(x, y, R, 0, TAU); c.fill();
      const g = c.createRadialGradient(x - R * 0.2, y - R * 0.2, 0, x, y, R * 0.6);
      g.addColorStop(0, "#e8ecf0"); g.addColorStop(1, "#7a8088");
      c.fillStyle = g; c.beginPath(); c.arc(x, y, R * 0.58, 0, TAU); c.fill();
      c.strokeStyle = "#555"; c.lineWidth = R * 0.08;
      for (let i = 0; i < 5; i++) { const a = (i * TAU) / 5; c.beginPath(); c.moveTo(x + Math.cos(a) * R * 0.15, y + Math.sin(a) * R * 0.15); c.lineTo(x + Math.cos(a) * R * 0.5, y + Math.sin(a) * R * 0.5); c.stroke(); }
      c.fillStyle = "#333"; c.beginPath(); c.arc(x, y, R * 0.12, 0, TAU); c.fill();
    };
    c.fillStyle = "rgba(0,0,0,0.3)"; c.beginPath(); c.ellipse(0, o.bus ? 0.225 : 0.205, 0.5, 0.02, 0, 0, TAU); c.fill();
    if (o.bus) {
      const g = c.createLinearGradient(0, -0.2, 0, 0.15);
      g.addColorStop(0, shade(o.c, 0.2)); g.addColorStop(1, shade(o.c, -0.2));
      c.fillStyle = g; rrect(c, -0.5, -0.2, 1, 0.34, 0.035); c.fill();
      c.fillStyle = "#1a1a1a"; c.fillRect(-0.5, 0.0, 1, 0.012); c.fillRect(-0.5, 0.05, 1, 0.012); c.fillRect(-0.5, 0.12, 1, 0.02);
      c.fillStyle = "#2a3a48"; rrect(c, 0.42, -0.17, 0.075, 0.14, 0.01); c.fill();
      for (let x = -0.44; x < 0.3; x += 0.085) {
        c.fillStyle = "#1a1a1a"; c.fillRect(x - 0.005, -0.165, 0.075, 0.11);
        const wg = c.createLinearGradient(x, -0.16, x + 0.06, -0.06);
        wg.addColorStop(0, "#d8eef8"); wg.addColorStop(1, "#7aa0b8");
        c.fillStyle = wg; c.fillRect(x, -0.16, 0.065, 0.1);
      }
      c.fillStyle = "#1a1a1a"; c.fillRect(0.33, -0.17, 0.075, 0.28);
      c.fillStyle = "#8ab0c8"; c.fillRect(0.34, -0.16, 0.025, 0.12); c.fillRect(0.372, -0.16, 0.025, 0.12);
      c.fillStyle = "#1a1a1a"; c.font = "bold 0.035px sans-serif"; c.textAlign = "center"; c.fillText("SCHOOL BUS", -0.05, -0.17);
      c.fillStyle = "#d02020"; c.beginPath(); for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + (i * TAU) / 8; c.lineTo(-0.42 + Math.cos(a) * 0.03, 0.03 + Math.sin(a) * 0.03); } c.fill();
      c.fillStyle = "#ff3a2a"; c.beginPath(); c.arc(-0.49, -0.17, 0.012, 0, TAU); c.fill();
      c.fillStyle = "#ffd88a"; c.beginPath(); c.arc(0.49, 0.08, 0.014, 0, TAU); c.fill();
      c.fillStyle = "#222"; c.beginPath(); c.arc(-0.33, 0.14, 0.1, Math.PI, TAU); c.fill(); c.beginPath(); c.arc(0.3, 0.14, 0.1, Math.PI, TAU); c.fill();
      wheel(-0.33, 0.14, 0.085); wheel(0.3, 0.14, 0.085);
      return;
    }
    const body = new Path2D();
    body.moveTo(-0.5, 0.1); body.lineTo(-0.5, 0.0); body.quadraticCurveTo(-0.49, -0.05, -0.4, -0.06);
    body.lineTo(-0.28, -0.07); body.quadraticCurveTo(-0.2, -0.17, -0.1, -0.175); body.lineTo(0.08, -0.175);
    body.quadraticCurveTo(0.17, -0.17, 0.25, -0.07); body.lineTo(0.43, -0.05); body.quadraticCurveTo(0.5, -0.03, 0.5, 0.04);
    body.lineTo(0.5, 0.1); body.closePath();
    const g = c.createLinearGradient(0, -0.18, 0, 0.11);
    g.addColorStop(0, shade(o.c, 0.45)); g.addColorStop(0.35, shade(o.c, 0.1)); g.addColorStop(0.5, shade(o.c, -0.15)); g.addColorStop(1, shade(o.c, -0.45));
    c.fillStyle = g; c.fill(body);
    // windows
    const win = c.createLinearGradient(-0.2, -0.17, 0.1, -0.07);
    win.addColorStop(0, "#e4f2fa"); win.addColorStop(0.5, "#8ab4cc"); win.addColorStop(1, "#4a6a80");
    c.fillStyle = win;
    c.beginPath(); c.moveTo(-0.25, -0.072); c.quadraticCurveTo(-0.18, -0.155, -0.1, -0.16); c.lineTo(-0.02, -0.16); c.lineTo(-0.02, -0.072); c.fill();
    c.beginPath(); c.moveTo(0.0, -0.072); c.lineTo(0.0, -0.16); c.lineTo(0.08, -0.16); c.quadraticCurveTo(0.15, -0.155, 0.21, -0.072); c.fill();
    c.fillStyle = "rgba(255,255,255,0.35)"; c.beginPath(); c.moveTo(-0.15, -0.075); c.lineTo(-0.1, -0.155); c.lineTo(-0.07, -0.155); c.lineTo(-0.12, -0.075); c.fill();
    // doors, handles, mirror, lights
    c.strokeStyle = rgba("#000000", 0.35); c.lineWidth = 0.004;
    c.beginPath(); c.moveTo(-0.01, -0.07); c.lineTo(-0.01, 0.08); c.moveTo(-0.25, -0.07); c.lineTo(-0.22, 0.08); c.moveTo(0.22, -0.07); c.lineTo(0.2, 0.08); c.stroke();
    c.fillStyle = shade(o.c, -0.4); c.fillRect(-0.09, -0.04, 0.04, 0.008); c.fillRect(0.13, -0.04, 0.04, 0.008);
    c.fillStyle = shade(o.c, -0.2); c.beginPath(); c.ellipse(-0.23, -0.075, 0.02, 0.012, 0, 0, TAU); c.fill();
    c.fillStyle = "#fff6c8"; c.beginPath(); c.ellipse(0.485, -0.02, 0.014, 0.02, 0, 0, TAU); c.fill();
    c.fillStyle = "#e02020"; c.fillRect(-0.5, -0.03, 0.015, 0.035);
    c.fillStyle = "#2a2a2a"; c.fillRect(-0.5, 0.07, 1, 0.03);
    c.fillStyle = "#1a1a1a";
    for (const x of [-0.3, 0.3]) { c.beginPath(); c.arc(x, 0.12, 0.1, Math.PI, TAU); c.fill(); }
    wheel(-0.3, 0.12, 0.085); wheel(0.3, 0.12, 0.085);
  },
  plane(c, o) {
    const metal = (x0, y0, x1, y1) => { const g = c.createLinearGradient(x0, y0, x1, y1); g.addColorStop(0, "#ffffff"); g.addColorStop(1, "#a8b0bc"); return g; };
    // wings
    c.fillStyle = metal(0, -0.46, 0, 0);
    c.beginPath(); c.moveTo(0.1, -0.03); c.lineTo(-0.16, -0.47); c.lineTo(-0.22, -0.47); c.lineTo(-0.12, -0.03); c.closePath(); c.fill();
    c.fillStyle = metal(0, 0, 0, 0.46);
    c.beginPath(); c.moveTo(0.1, 0.03); c.lineTo(-0.16, 0.47); c.lineTo(-0.22, 0.47); c.lineTo(-0.12, 0.03); c.closePath(); c.fill();
    c.strokeStyle = "rgba(0,0,0,0.18)"; c.lineWidth = 0.003;
    for (const s of [-1, 1]) for (let i = 1; i < 5; i++) { const t = i / 5; c.beginPath(); c.moveTo(-0.12 - t * 0.09, s * (0.03 + t * 0.44)); c.lineTo(-0.08 - t * 0.085, s * (0.03 + t * 0.44)); c.stroke(); }
    // engines
    for (const y of [-0.15, -0.3, 0.15, 0.3]) {
      const x = 0.0 - Math.abs(y) * 0.58;
      const eg = c.createLinearGradient(0, y - 0.02, 0, y + 0.02);
      eg.addColorStop(0, "#d0d4da"); eg.addColorStop(0.5, "#8a9098"); eg.addColorStop(1, "#5a6068");
      c.fillStyle = eg; rrect(c, x, y - 0.02, 0.09, 0.04, 0.015); c.fill();
      c.fillStyle = "#2a2e34"; c.fillRect(x + 0.085, y - 0.016, 0.006, 0.032);
    }
    // tailplane
    c.fillStyle = metal(0, -0.17, 0, 0.17);
    c.beginPath(); c.moveTo(-0.36, 0); c.lineTo(-0.47, -0.17); c.lineTo(-0.5, -0.17); c.lineTo(-0.46, 0); c.lineTo(-0.5, 0.17); c.lineTo(-0.47, 0.17); c.closePath(); c.fill();
    // fuselage with upper-deck hump
    c.fillStyle = metal(0, -0.045, 0, 0.045); rrect(c, -0.5, -0.042, 1, 0.084, 0.042); c.fill();
    c.fillStyle = "rgba(255,255,255,0.7)"; rrect(c, 0.18, -0.03, 0.28, 0.06, 0.03); c.fill();
    c.fillStyle = "#2a5aa8"; c.fillRect(-0.48, -0.006, 0.94, 0.012);
    c.fillStyle = "#c83a3a"; c.beginPath(); c.moveTo(-0.5, -0.01); c.lineTo(-0.42, -0.012); c.lineTo(-0.42, 0.012); c.lineTo(-0.5, 0.01); c.fill();
    c.fillStyle = "#2a3a50"; c.beginPath(); c.moveTo(0.47, -0.018); c.quadraticCurveTo(0.495, 0, 0.47, 0.018); c.lineTo(0.455, 0.012); c.lineTo(0.455, -0.012); c.fill();
  },
  station(c, o, p, r) {
    // truss with lattice
    c.fillStyle = "#9aa0a8"; c.fillRect(-0.5, -0.012, 1, 0.024);
    c.strokeStyle = "#5a6068"; c.lineWidth = 0.003;
    c.beginPath(); for (let x = -0.5; x < 0.5; x += 0.02) { c.moveTo(x, -0.012); c.lineTo(x + 0.02, 0.012); c.moveTo(x, 0.012); c.lineTo(x + 0.02, -0.012); } c.stroke();
    // solar wings with cells
    for (const x of [-0.45, -0.33, 0.33, 0.45]) for (const s of [-1, 1]) {
      const y0 = s > 0 ? 0.025 : -0.345;
      c.fillStyle = "#3a2a10"; c.fillRect(x - 0.048, y0, 0.096, 0.32);
      const g = c.createLinearGradient(x - 0.05, 0, x + 0.05, 0);
      g.addColorStop(0, "#c8902a"); g.addColorStop(0.5, "#e8b84a"); g.addColorStop(1, "#a87420");
      c.fillStyle = g; c.fillRect(x - 0.045, y0 + 0.004, 0.04, 0.312); c.fillRect(x + 0.005, y0 + 0.004, 0.04, 0.312);
      c.strokeStyle = "rgba(60,40,10,0.6)"; c.lineWidth = 0.002;
      c.beginPath(); for (let y = y0 + 0.015; y < y0 + 0.32; y += 0.012) { c.moveTo(x - 0.045, y); c.lineTo(x + 0.045, y); } c.stroke();
      c.strokeStyle = "#ccc"; c.lineWidth = 0.004; c.beginPath(); c.moveTo(x, s > 0 ? 0.012 : -0.012); c.lineTo(x, s > 0 ? 0.025 : -0.025); c.stroke();
    }
    // radiators
    c.fillStyle = "#f0f2f4";
    for (const x of [-0.18, 0.15]) { c.fillRect(x, 0.02, 0.04, 0.11); c.strokeStyle = "#bbb"; c.lineWidth = 0.002; for (let y = 0.03; y < 0.13; y += 0.02) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + 0.04, y); c.stroke(); } }
    // pressurized modules
    const mod = (x, y, w, h, vert) => {
      const g = vert ? c.createLinearGradient(x, 0, x + w, 0) : c.createLinearGradient(0, y, 0, y + h);
      g.addColorStop(0, "#ffffff"); g.addColorStop(0.5, "#c8ccd4"); g.addColorStop(1, "#7a808a");
      c.fillStyle = g; rrect(c, x, y, w, h, Math.min(w, h) / 2); c.fill();
      c.strokeStyle = "rgba(0,0,0,0.2)"; c.lineWidth = 0.002;
      if (vert) for (let yy = y + 0.02; yy < y + h; yy += 0.025) { c.beginPath(); c.moveTo(x, yy); c.lineTo(x + w, yy); c.stroke(); }
    };
    mod(-0.022, -0.2, 0.044, 0.38, true);
    mod(-0.12, 0.03, 0.24, 0.04, false);
    mod(-0.1, -0.08, 0.2, 0.035, false);
    mod(-0.016, 0.18, 0.032, 0.05, true);
    c.fillStyle = "#4a4a4a"; c.beginPath(); c.moveTo(-0.014, 0.23); c.lineTo(0.014, 0.23); c.lineTo(0.02, 0.26); c.lineTo(-0.02, 0.26); c.fill();
  },
  ship(c, o, p, r) {
    c.fillStyle = "#2a5a88"; c.fillRect(-0.5, 0.08, 1, 0.1);
    c.strokeStyle = "rgba(255,255,255,0.3)"; c.lineWidth = 0.003;
    for (let i = 0; i < 12; i++) { const x = -0.5 + r(); c.beginPath(); c.moveTo(x, 0.1 + r() * 0.07); c.lineTo(x + 0.04, 0.1 + r() * 0.07); c.stroke(); }
    const hull = c.createLinearGradient(0, -0.07, 0, 0.1);
    hull.addColorStop(0, "#8a929e"); hull.addColorStop(1, "#4a525e");
    c.fillStyle = hull;
    c.beginPath(); c.moveTo(-0.48, -0.06); c.lineTo(0.5, -0.07); c.lineTo(0.43, 0.1); c.lineTo(-0.45, 0.1); c.closePath(); c.fill();
    c.fillStyle = "#8a2a2a"; c.beginPath(); c.moveTo(-0.455, 0.075); c.lineTo(0.445, 0.075); c.lineTo(0.43, 0.1); c.lineTo(-0.45, 0.1); c.fill();
    c.fillStyle = "#3a3e46"; c.fillRect(-0.5, -0.085, 1.0, 0.022);
    c.fillStyle = "#fff"; c.font = "bold 0.05px sans-serif"; c.textAlign = "center"; c.fillText("70", 0.4, -0.02);
    c.strokeStyle = "#2a2e36"; c.lineWidth = 0.003;
    for (let x = -0.45; x < 0.45; x += 0.04) { c.beginPath(); c.arc(x, -0.03, 0.004, 0, TAU); c.stroke(); }
    // island superstructure
    c.fillStyle = "#7a828e"; c.fillRect(0.1, -0.16, 0.08, 0.08); c.fillRect(0.115, -0.2, 0.05, 0.04);
    c.fillStyle = "#1a2a3a"; c.fillRect(0.105, -0.15, 0.07, 0.012); c.fillRect(0.12, -0.19, 0.04, 0.01);
    c.strokeStyle = "#5a626e"; c.lineWidth = 0.004; c.beginPath(); c.moveTo(0.14, -0.2); c.lineTo(0.14, -0.27); c.moveTo(0.12, -0.25); c.lineTo(0.16, -0.25); c.stroke();
    c.fillStyle = "#9aa"; c.beginPath(); c.ellipse(0.14, -0.225, 0.02, 0.006, 0, 0, TAU); c.fill();
    // aircraft parked on deck
    c.fillStyle = "#a8b0bc";
    for (let x = -0.44; x < 0.05; x += 0.065) {
      c.beginPath(); c.moveTo(x, -0.087); c.lineTo(x + 0.045, -0.087); c.lineTo(x + 0.05, -0.095); c.lineTo(x + 0.02, -0.095); c.lineTo(x + 0.01, -0.112); c.lineTo(x + 0.003, -0.112); c.lineTo(x + 0.006, -0.095); c.lineTo(x, -0.093); c.fill();
    }
  },

  // ---- plants, buildings & landforms ----
  tree(c, o, p, r) {
    const trunk = c.createLinearGradient(-0.06, 0, 0.06, 0);
    trunk.addColorStop(0, "#5a2a18"); trunk.addColorStop(0.4, "#a8502e"); trunk.addColorStop(1, "#4a2214");
    c.fillStyle = trunk;
    c.beginPath(); c.moveTo(-0.09, 0.5); c.quadraticCurveTo(-0.04, 0.42, -0.035, 0.3); c.lineTo(-0.012, -0.45); c.lineTo(0.012, -0.45); c.lineTo(0.035, 0.3); c.quadraticCurveTo(0.04, 0.42, 0.09, 0.5); c.fill();
    c.strokeStyle = "rgba(40,15,5,0.5)"; c.lineWidth = 0.004;
    for (let i = 0; i < 9; i++) { const x = -0.03 + i * 0.0075; c.beginPath(); c.moveTo(x * 2.2, 0.5); c.lineTo(x, 0.3); c.lineTo(x * 0.4, -0.2); c.stroke(); }
    // branches and foliage clumps in a narrow cone
    c.strokeStyle = "#5a2a18"; c.lineWidth = 0.008;
    for (let i = 0; i < 14; i++) { const y = -0.42 + i * 0.045, s = i % 2 ? 1 : -1, w = 0.04 + i * 0.012; c.beginPath(); c.moveTo(0, y); c.quadraticCurveTo(s * w * 0.6, y - 0.01, s * w, y + 0.02); c.stroke(); }
    for (let i = 0; i < 90; i++) {
      const t = r(), y = -0.47 + t * 0.66, w = 0.03 + t * 0.15;
      const x = (r() - 0.5) * 2 * w, R = 0.025 + r() * 0.025;
      lumpy(c, r, R, 0.35, x, y);
      const lit = (x < 0 ? 0.1 : -0.15) + (r() - 0.5) * 0.15;
      c.fillStyle = shade(o.c, lit); c.fill();
    }
    c.fillStyle = "rgba(160,220,120,0.25)";
    for (let i = 0; i < 40; i++) { const t = r(), y = -0.47 + t * 0.66, w = 0.03 + t * 0.15; c.beginPath(); c.arc(-r() * w, y, 0.01, 0, TAU); c.fill(); }
  },
  statue(c, o, p, r) {
    // pedestal
    const ped = c.createLinearGradient(-0.17, 0, 0.17, 0);
    ped.addColorStop(0, "#c8bca8"); ped.addColorStop(1, "#8a7e6a");
    c.fillStyle = ped;
    c.beginPath(); c.moveTo(-0.18, 0.5); c.lineTo(-0.16, 0.3); c.lineTo(-0.13, 0.28); c.lineTo(-0.12, 0.06); c.lineTo(0.12, 0.06); c.lineTo(0.13, 0.28); c.lineTo(0.16, 0.3); c.lineTo(0.18, 0.5); c.fill();
    c.fillStyle = "rgba(0,0,0,0.18)";
    for (let y = 0.1; y < 0.27; y += 0.04) c.fillRect(-0.12, y, 0.24, 0.006);
    for (const x of [-0.08, 0, 0.08]) c.fillRect(x - 0.012, 0.12, 0.024, 0.12);
    c.fillStyle = "#d8ccb8"; c.fillRect(-0.14, 0.04, 0.28, 0.025);
    // robed figure
    const robe = c.createLinearGradient(-0.09, 0, 0.09, 0);
    robe.addColorStop(0, shade(o.c, 0.25)); robe.addColorStop(1, shade(o.c, -0.35));
    c.fillStyle = robe;
    c.beginPath(); c.moveTo(-0.1, 0.045); c.quadraticCurveTo(-0.08, -0.12, -0.055, -0.27); c.lineTo(0.055, -0.27); c.quadraticCurveTo(0.08, -0.12, 0.1, 0.045); c.fill();
    c.strokeStyle = shade(o.c, -0.4); c.lineWidth = 0.004;
    for (let i = 0; i < 6; i++) { const x = -0.07 + i * 0.028; c.beginPath(); c.moveTo(x * 0.7, -0.22); c.quadraticCurveTo(x * 1.1, -0.08, x * 1.3, 0.04); c.stroke(); }
    c.beginPath(); c.moveTo(-0.06, -0.2); c.quadraticCurveTo(0, -0.17, 0.06, -0.22); c.stroke();
    // tablet arm
    c.fillStyle = shade(o.c, -0.15); c.save(); c.translate(-0.075, -0.15); c.rotate(-0.25); c.fillRect(-0.025, -0.045, 0.05, 0.09); c.restore();
    // torch arm
    c.strokeStyle = o.c; c.lineWidth = 0.032; c.lineCap = "round";
    c.beginPath(); c.moveTo(0.04, -0.25); c.lineTo(0.07, -0.42); c.stroke();
    c.fillStyle = shade(o.c, -0.1); c.beginPath(); c.moveTo(0.055, -0.43); c.lineTo(0.09, -0.43); c.lineTo(0.08, -0.46); c.lineTo(0.065, -0.46); c.fill();
    const fl = c.createLinearGradient(0, -0.52, 0, -0.46);
    fl.addColorStop(0, "#fff0a0"); fl.addColorStop(1, "#e8a020");
    c.fillStyle = fl; c.beginPath(); c.moveTo(0.06, -0.46); c.quadraticCurveTo(0.055, -0.5, 0.074, -0.53); c.quadraticCurveTo(0.095, -0.5, 0.088, -0.46); c.fill();
    // head and crown
    const hg = c.createRadialGradient(-0.01, -0.315, 0, 0, -0.305, 0.04);
    hg.addColorStop(0, shade(o.c, 0.3)); hg.addColorStop(1, shade(o.c, -0.2));
    c.fillStyle = hg; c.beginPath(); c.arc(0, -0.305, 0.036, 0, TAU); c.fill();
    c.fillStyle = shade(o.c, -0.1); c.fillRect(-0.04, -0.34, 0.08, 0.012);
    c.fillStyle = o.c;
    for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.33; c.beginPath(); c.moveTo(Math.cos(a - 0.08) * 0.035, -0.33 + Math.sin(a - 0.08) * 0.035); c.lineTo(Math.cos(a) * 0.085, -0.33 + Math.sin(a) * 0.085); c.lineTo(Math.cos(a + 0.08) * 0.035, -0.33 + Math.sin(a + 0.08) * 0.035); c.fill(); }
  },
  pyramid(c, o, p, r) {
    c.fillStyle = "#d8c08a"; c.fillRect(-0.9, 0.49, 1.8, 0.02);
    const left = new Path2D(); left.moveTo(-0.82, 0.5); left.lineTo(0.05, -0.5); left.lineTo(0.18, 0.5); left.closePath();
    const right = new Path2D(); right.moveTo(0.18, 0.5); right.lineTo(0.05, -0.5); right.lineTo(0.82, 0.5); right.closePath();
    const gl = c.createLinearGradient(-0.5, -0.5, 0.1, 0.5); gl.addColorStop(0, shade(o.c, 0.2)); gl.addColorStop(1, shade(o.c, 0.0));
    c.fillStyle = gl; c.fill(left);
    c.fillStyle = shade(o.c, -0.3); c.fill(right);
    for (const [path, x0, x1] of [[left, -0.87, 0.13], [right, 0.13, 0.77]]) {
      c.save(); c.clip(path);
      c.strokeStyle = "rgba(60,40,10,0.18)"; c.lineWidth = 0.003;
      for (let i = 1; i < 40; i++) {
        const y = -0.5 + i / 40, t = i / 40;
        c.beginPath(); c.moveTo(0.05 + (x0 * t), y); c.lineTo(0.05 + x1 * t, y); c.stroke();
        for (let k = 0; k < 6; k++) { const x = 0.05 + (x0 + (x1 - x0) * r()) * t; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - 1 / 40); c.stroke(); }
      }
      c.fillStyle = "rgba(255,255,255,0.08)";
      for (let i = 0; i < 80; i++) { c.beginPath(); c.arc(-0.8 + r() * 1.6, -0.4 + r() * 0.9, 0.006, 0, TAU); c.fill(); }
      c.restore();
    }
    c.fillStyle = "rgba(255,240,200,0.6)"; c.beginPath(); c.moveTo(0.05, -0.5); c.lineTo(0.01, -0.45); c.lineTo(0.06, -0.45); c.fill();
  },
  eiffel(c, o, p) {
    const col = o.c, dark = shade(col, -0.35);
    c.lineCap = "round";
    const edge = (t, s) => { // outer leg profile: x half-width at height t (0 bottom, 1 top)
      const w = 0.24 * Math.pow(1 - t, 2.2) + 0.012;
      return s * w;
    };
    const yAt = (t) => 0.5 - t * 0.92;
    // legs as filled lattice strips
    for (const s of [-1, 1]) {
      c.fillStyle = col;
      c.beginPath();
      for (let i = 0; i <= 40; i++) { const t = i / 40; c.lineTo(edge(t, s), yAt(t)); }
      for (let i = 40; i >= 0; i--) { const t = i / 40; c.lineTo(edge(t, s) * (t < 0.3 ? 0.62 : 0.4 + t * 0.3), yAt(t)); }
      c.fill();
    }
    c.fillStyle = "rgba(0,0,0,0)";
    c.strokeStyle = dark; c.lineWidth = 0.004;
    for (let i = 0; i < 46; i++) {
      const t0 = i / 46, t1 = (i + 1) / 46;
      for (const s of [-1, 1]) {
        const xo0 = edge(t0, s), xo1 = edge(t1, s), xi0 = xo0 * (t0 < 0.3 ? 0.62 : 0.4 + t0 * 0.3), xi1 = xo1 * (t1 < 0.3 ? 0.62 : 0.4 + t1 * 0.3);
        c.beginPath(); c.moveTo(xo0, yAt(t0)); c.lineTo(xi1, yAt(t1)); c.moveTo(xi0, yAt(t0)); c.lineTo(xo1, yAt(t1)); c.stroke();
      }
    }
    // arch between the legs
    c.strokeStyle = col; c.lineWidth = 0.014;
    c.beginPath(); c.moveTo(-0.15, 0.5); c.quadraticCurveTo(0, 0.2, 0.15, 0.5); c.stroke();
    c.strokeStyle = dark; c.lineWidth = 0.004; c.beginPath(); c.moveTo(-0.13, 0.5); c.quadraticCurveTo(0, 0.25, 0.13, 0.5); c.stroke();
    // platforms
    for (const [t, h] of [[0.21, 0.03], [0.42, 0.02], [0.88, 0.015]]) {
      const w = Math.abs(edge(t, 1)) + 0.02;
      c.fillStyle = col; c.fillRect(-w, yAt(t) - h, w * 2, h);
      c.strokeStyle = dark; c.lineWidth = 0.003; c.beginPath(); for (let x = -w; x < w; x += 0.012) { c.moveTo(x, yAt(t) - h); c.lineTo(x + 0.006, yAt(t)); } c.stroke();
    }
    // antenna
    c.strokeStyle = col; c.lineWidth = 0.008; c.beginPath(); c.moveTo(0, yAt(0.92)); c.lineTo(0, -0.5); c.stroke();
    c.fillStyle = dark; c.fillRect(-0.012, yAt(0.92) - 0.012, 0.024, 0.012);
  },
  building(c, o, p, r) {
    const tiers = [[0.15, 0.5, 0.1], [0.115, 0.1, -0.24], [0.085, -0.24, -0.3], [0.06, -0.3, -0.36], [0.035, -0.36, -0.41]];
    for (const [w, y1, y2] of tiers) {
      const g = c.createLinearGradient(-w, 0, w, 0);
      g.addColorStop(0, shade(o.c, 0.2)); g.addColorStop(0.55, o.c); g.addColorStop(0.56, shade(o.c, -0.25)); g.addColorStop(1, shade(o.c, -0.4));
      c.fillStyle = g; c.fillRect(-w, y2, w * 2, y1 - y2);
      // vertical piers and lit windows
      for (let x = -w + 0.012; x < w - 0.008; x += 0.016) {
        c.fillStyle = "rgba(40,55,80,0.55)"; c.fillRect(x, y2 + 0.008, 0.007, y1 - y2 - 0.016);
        for (let y = y2 + 0.012; y < y1 - 0.01; y += 0.014) if (r() < 0.18) { c.fillStyle = "rgba(255,220,140,0.85)"; c.fillRect(x, y, 0.007, 0.008); }
      }
      c.fillStyle = shade(o.c, 0.3); c.fillRect(-w - 0.004, y2, w * 2 + 0.008, 0.006);
    }
    // art-deco crown and mast
    c.fillStyle = shade(o.c, 0.1);
    c.beginPath(); c.moveTo(-0.025, -0.41); c.lineTo(-0.012, -0.445); c.lineTo(0.012, -0.445); c.lineTo(0.025, -0.41); c.fill();
    c.strokeStyle = "#ccc"; c.lineWidth = 0.008; c.beginPath(); c.moveTo(0, -0.445); c.lineTo(0, -0.5); c.stroke();
    c.fillStyle = "#ff4a4a"; c.beginPath(); c.arc(0, -0.5, 0.004, 0, TAU); c.fill();
  },
  burj(c, o, p) {
    // three stepped wings around a central core, narrowing to a spire
    c.save();
    c.beginPath(); c.moveTo(-0.13, 0.5); c.lineTo(-0.012, -0.26); c.lineTo(0.012, -0.26); c.lineTo(0.14, 0.5); c.closePath(); c.clip();
    const wings = [[-1, 0.11, 22], [1, 0.13, 26], [0, 0.07, 30]];
    for (const [side, base, steps] of wings) {
      const g = c.createLinearGradient(-0.13, 0, 0.13, 0);
      g.addColorStop(0, shade(o.c, 0.3)); g.addColorStop(0.5, o.c); g.addColorStop(1, shade(o.c, -0.35));
      c.fillStyle = g;
      for (let i = 0; i < steps; i++) {
        const y = 0.5 - i * (0.75 / steps), w = base * (1 - i / steps) + 0.012;
        c.fillRect(side < 0 ? -w : side > 0 ? 0 : -w / 2, y - 0.75 / steps - 0.001, w, 0.75 / steps + 0.002);
      }
    }
    c.strokeStyle = "rgba(255,255,255,0.35)"; c.lineWidth = 0.003;
    for (let x = -0.1; x < 0.12; x += 0.012) { c.beginPath(); c.moveTo(x, 0.5); c.lineTo(x * 0.1, -0.25); c.stroke(); }
    c.strokeStyle = "rgba(60,80,100,0.35)"; c.lineWidth = 0.002;
    for (let y = 0.5; y > -0.25; y -= 0.015) { c.beginPath(); c.moveTo(-0.13, y); c.lineTo(0.14, y); c.stroke(); }
    c.restore();
    const sg = c.createLinearGradient(-0.012, 0, 0.012, 0);
    sg.addColorStop(0, shade(o.c, 0.3)); sg.addColorStop(1, shade(o.c, -0.3));
    c.fillStyle = sg; c.beginPath(); c.moveTo(-0.014, -0.25); c.lineTo(-0.003, -0.5); c.lineTo(0.003, -0.5); c.lineTo(0.014, -0.25); c.fill();
  },
  mountain(c, o, p, r) {
    const ridge = (n, amp, seedShift, peakY) => {
      const pts = [[-0.9, 0.5]];
      for (let i = 1; i < n; i++) {
        const x = -0.9 + (i * 1.8) / n, t = 1 - Math.abs(x) / 0.9;
        pts.push([x, 0.5 - t * (0.5 - peakY) * (0.95 + 0.05 * Math.sin(i * seedShift)) - (r() - 0.5) * amp * t]);
      }
      pts.push([0.9, 0.5]);
      return pts;
    };
    const path = (pts) => { c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); };
    // distant range
    c.save(); c.translate(0.25, 0); c.scale(0.8, 1);
    path(ridge(24, 0.12, 1.3, -0.15)); c.fillStyle = rgba(shadeHex(o.c, 0.35), 0.45); c.fill();
    c.restore();
    const main = ridge(36, 0.1, 2.1, -0.5);
    main[18] = [0, -0.5];
    path(main);
    const g = c.createLinearGradient(-0.4, 0, 0.4, 0);
    g.addColorStop(0, shade(o.c, 0.2)); g.addColorStop(0.5, o.c); g.addColorStop(0.52, shade(o.c, -0.3)); g.addColorStop(1, shade(o.c, -0.45));
    c.fillStyle = g; c.fill();
    c.save(); path(main); c.clip();
    // rock strata and gullies
    c.strokeStyle = "rgba(0,0,0,0.18)"; c.lineWidth = 0.004;
    for (let i = 0; i < 26; i++) { const x = -0.7 + r() * 1.4, y = -0.3 + r() * 0.75; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (x < 0 ? -0.04 : 0.04), y + 0.12 + r() * 0.1); c.stroke(); }
    c.strokeStyle = "rgba(255,255,255,0.08)";
    for (let i = 0; i < 10; i++) { const y = -0.2 + i * 0.07; c.beginPath(); c.moveTo(-0.9, y + 0.05); c.lineTo(0.9, y - 0.03); c.stroke(); }
    if (!o.mars) {
      // snow with lit and shaded sides
      c.beginPath(); c.moveTo(-0.5, -0.6);
      for (let x = -0.5; x <= 0.5; x += 0.025) c.lineTo(x, -0.2 + Math.abs(x) * -0.25 + Math.sin(x * 47) * 0.03 + (r() - 0.5) * 0.04);
      c.lineTo(0.5, -0.6); c.closePath();
      const sg = c.createLinearGradient(-0.2, 0, 0.2, 0);
      sg.addColorStop(0, "#ffffff"); sg.addColorStop(0.5, "#f0f4fa"); sg.addColorStop(0.52, "#b8c4d8"); sg.addColorStop(1, "#9aa8c0");
      c.fillStyle = sg; c.fill();
      c.fillStyle = "#f4f8ff";
      for (let i = 0; i < 14; i++) { const x = (r() - 0.5) * 0.9, y = -0.15 + r() * 0.3; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 0.02, y + 0.08 + r() * 0.08); c.lineTo(x + 0.035, y); c.fill(); }
    } else {
      c.fillStyle = shade(o.c, -0.4); c.beginPath(); c.ellipse(0, -0.44, 0.12, 0.03, 0, 0, TAU); c.fill();
      c.strokeStyle = shade(o.c, 0.2); c.lineWidth = 0.006; c.beginPath(); c.ellipse(0, -0.44, 0.12, 0.03, 0, 0, TAU); c.stroke();
    }
    c.restore();
  },

  // ---- exotic stars ----
  neutron(c, o, p) {
    c.save(); c.rotate(0.4);
    // magnetic field loops
    c.strokeStyle = rgba(o.c, 0.35); c.lineWidth = 0.006;
    for (let i = 1; i <= 4; i++) for (const s of [-1, 1]) { c.beginPath(); c.ellipse(s * 0.09 * i, 0, 0.09 * i, 0.12 * i + 0.05, 0, 0, TAU); c.stroke(); }
    const g = c.createLinearGradient(0, -0.6, 0, 0.6);
    g.addColorStop(0, rgba(o.c, 0)); g.addColorStop(0.42, rgba("#ffffff", 0.7)); g.addColorStop(0.58, rgba("#ffffff", 0.7)); g.addColorStop(1, rgba(o.c, 0));
    c.fillStyle = g;
    c.beginPath(); c.moveTo(0, 0); c.lineTo(-0.07, -0.6); c.lineTo(0.07, -0.6); c.closePath(); c.moveTo(0, 0); c.lineTo(-0.07, 0.6); c.lineTo(0.07, 0.6); c.closePath(); c.fill();
    c.restore();
    glow(c, o.c, 0.4, 0.6);
    ball(c, "#eef8ff", 0.17);
  },
  blackhole(c, o, p, r) {
    glow(c, o.c, 1.1, 0.22);
    const disk = (front) => {
      c.save(); c.rotate(-0.1);
      c.beginPath(); front ? c.rect(-2, 0, 4, 2) : c.rect(-2, -2, 4, 2); c.clip();
      for (let i = 0; i < 60; i++) {
        const rx = 0.56 + i * 0.01;
        // Doppler beaming: the approaching (left) side is brighter
        const g = c.createLinearGradient(-rx, 0, rx, 0);
        const a = (0.55 - i * 0.007) * (0.7 + r() * 0.3);
        g.addColorStop(0, rgba(i < 15 ? "#fff6d8" : o.c, Math.min(1, a * 1.5))); g.addColorStop(1, rgba(i < 15 ? "#ffd8a0" : shadeHex(o.c, -0.4), a * 0.4));
        c.strokeStyle = g; c.lineWidth = 0.012;
        c.beginPath(); c.ellipse(0, 0, rx, rx * 0.2, 0, 0, TAU); c.stroke();
      }
      c.restore();
    };
    disk(false);
    // light from the far side of the disk bent over and under the shadow
    c.save(); c.globalCompositeOperation = "lighter";
    for (let i = 0; i < 14; i++) {
      c.strokeStyle = rgba(i < 4 ? "#fff0c8" : o.c, 0.28 - i * 0.017); c.lineWidth = 0.014;
      c.beginPath(); c.ellipse(0, -0.01, 0.53 + i * 0.012, 0.52 + i * 0.016, 0, Math.PI * 1.02, Math.PI * 1.98); c.stroke();
      c.beginPath(); c.ellipse(0, 0.01, 0.52 + i * 0.008, 0.5 + i * 0.01, 0, Math.PI * 0.08, Math.PI * 0.92); c.stroke();
    }
    c.restore();
    c.strokeStyle = rgba("#fff4d0", 0.9); c.lineWidth = 0.01;
    c.beginPath(); c.arc(0, 0, 0.51, 0, TAU); c.stroke();
    c.fillStyle = "#000"; c.beginPath(); c.arc(0, 0, 0.5, 0, TAU); c.fill();
    disk(true);
  },
};

// Kinds that are expensive to draw get rendered once into a sprite.
const CACHED = { foam: 0.6, nebula: 0.6, cluster: 0.6, irregular: 0.6, galaxy: 0.6, elliptical: 0.6, group: 0.6, web: 0.6, oort: 0.6 };
const SPRITE = 900;
function sprite(o) {
  if (!o.sprite) {
    const R = CACHED[o.k], cv = document.createElement("canvas");
    cv.width = cv.height = SPRITE;
    const c = cv.getContext("2d"), p = SPRITE / (2 * R);
    c.translate(SPRITE / 2, SPRITE / 2); c.scale(p, p);
    K[o.k](c, o, p * 0.6, rng(o.seed));
    o.sprite = cv;
  }
  return o.sprite;
}


// Build an object's expensive caches ahead of time. Returns true if it did work.
function prepare(o) {
  if (CACHED[o.k]) { if (o.sprite) return false; sprite(o); return true; }
  if (o.k === "universe") { if (o.inner) return false; universeLayers(o); return true; }
  if (texFor(o)) { if (o.tex) return false; ensureTex(o); return true; }
  return false;
}
