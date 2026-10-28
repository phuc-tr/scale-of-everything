(() => {
"use strict";

const MIN_V = -35.5, MAX_V = 27.5; // log10 of meters spanned by the shorter screen side
const LY = 9.4607e15;

const canvas = document.getElementById("c");
const ctx = canvas.getContext("2d");
const slider = document.getElementById("slider");
const $ = (id) => document.getElementById(id);

let W = 0, H = 0, M = 1, DPR = 1;
let V = 0.35, targetV = 0.35;
let focus = null;          // object whose info card is open
let playDir = 0;
let hovered = null;
let visible = [];
let interacted = false;

// Shared helpers (clamp, rng, rgba, shade, …) and all drawings live in art.js.

const SUP = { "-": "⁻", 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
const sup = (n) => String(n).split("").map((c) => SUP[c]).join("");
function num(x, digits = 3) {
  return (+x.toPrecision(digits)).toLocaleString("en-US", { maximumFractionDigits: 3 });
}
function bigWords(x, unit, digits) {
  if (x >= 1e9) return num(x / 1e9, digits) + " billion " + unit;
  if (x >= 1e6) return num(x / 1e6, digits) + " million " + unit;
  return num(x, digits) + " " + unit;
}
function sci(m) {
  const e = Math.floor(Math.log10(m));
  const mant = m / Math.pow(10, e);
  return (Math.abs(mant - 1) < 0.05 ? "" : mant.toFixed(1) + " × ") + "10" + sup(e) + " m";
}
const UNITS = [[1e-15, "fm"], [1e-12, "pm"], [1e-9, "nm"], [1e-6, "µm"], [1e-3, "mm"], [1e-2, "cm"], [1, "m"], [1e3, "km"], [LY * 0.1, "ly"]];
function unitFor(m) {
  let u = null;
  for (const x of UNITS) if (m >= x[0] * 0.9999) u = x;
  return u && u[1] === "ly" ? [LY, "ly"] : u;
}
function formatLen(m, digits = 3) {
  const u = unitFor(m);
  if (!u) return sci(m);
  const [f, name] = u, v = m / f;
  if (name === "ly") return bigWords(v, +v.toPrecision(digits) === 1 ? "light-year" : "light-years", digits);
  if (name === "km") return bigWords(v, "km", digits);
  return num(v, digits) + " " + name;
}

// ---------- layout ----------
const KIND_W = { person: 0.35, statue: 0.4, tree: 0.45, eiffel: 0.5, building: 0.3, burj: 0.3, blackhole: 2.2,
  bar: 1, quad: 1, dna: 1.1, hair: 1, neutron: 1.2, star: 1.3 };
const KIND_H = { bar: 0.25, vehicle: 0.5, ship: 0.35, plane: 1, wave: 0.6, saturn: 0.7, blackhole: 0.9, whale: 0.5, dino: 0.85 };

// Fixed layout around the screen center, like the original: each object sits
// at an offset proportional to its own size, so zooming pivots on the middle
// and things grow out of / shrink into the center. Offsets are picked greedily
// (anywhere in 2D, nearest to center first) so similar-scale objects never overlap.
OBJECTS.sort((a, b) => a.s - b.s);
const FILL = 0.42; // fraction of the view a focused object occupies
const LABEL = 0.22; // room below each object for its label, in object sizes
{
  // candidate offsets in object sizes, nearest first; the screen is wider than
  // tall, so vertical distance counts a bit more
  const cands = [];
  for (let v = -1.6; v <= 1.6 + 1e-9; v += 0.08) for (let u = -2.4; u <= 2.4 + 1e-9; u += 0.08) cands.push([u, v, Math.hypot(u, v * 1.5)]);
  cands.sort((a, b) => a[2] - b[2]);
  const placed = [];
  for (const o of OBJECTS) {
    o.w = o.w || KIND_W[o.k] || 1;
    o.h = o.h || KIND_H[o.k] || 1;
    o.seed = hash(o.n);
    // zoom level that frames it (pinned objects can't be panned to, so just go to the end)
    o.fv = o.pos ? MAX_V : Math.log10(o.s * Math.max(o.w, o.h) / FILL);
    if (o.pos) { [o.x, o.y] = o.pos; continue; }
    const near = placed.filter((q) => q.s >= o.s / 100); // smaller ones are too tiny to matter
    let best = cands[0], bestOv = Infinity;
    for (const cand of cands) {
      const x = cand[0] * o.s, y = cand[1] * o.s;
      let ov = 0;
      for (const q of near) {
        const dx = (q.s * q.w + o.s * o.w) / 2 * 1.06 - Math.abs(q.x - x);
        // boxes span from the top of the drawing to the bottom of the label
        const top = Math.max(y - o.s * o.h / 2, q.y - q.s * q.h / 2);
        const bot = Math.min(y + o.s * (o.h / 2 + LABEL), q.y + q.s * (q.h / 2 + LABEL));
        if (dx > 0 && bot > top) ov += Math.min(dx, bot - top) / o.s;
      }
      if (ov < bestOv) { bestOv = ov; best = cand; if (ov === 0) break; }
    }
    o.x = o.center ? 0 : best[0] * o.s;
    o.y = o.center ? 0 : best[1] * o.s;
    placed.push(o);
  }
}

// ---------- background ----------
const BG = [[-36, "#1d0f33"], [-25, "#170f38"], [-16, "#0f1840"], [-11, "#0b2238"], [-7, "#0f2e33"], [-4, "#163a3a"],
  [-1.5, "#1d3b55"], [1, "#27496e"], [3.5, "#1d3658"], [5.5, "#0e1a33"], [7.5, "#04060d"], [20, "#05050c"], [28, "#0a0612"]];
function bgColor(v) {
  for (let i = 0; i < BG.length - 1; i++) {
    const [v0, c0] = BG[i], [v1, c1] = BG[i + 1];
    if (v <= v1) {
      const t = clamp((v - v0) / (v1 - v0), 0, 1), a = rgbOf(c0), b = rgbOf(c1);
      return a.map((x, j) => Math.round(x + (b[j] - x) * t));
    }
  }
  return rgbOf(BG[BG.length - 1][1]);
}
const STARS = (() => { const r = rng(42), s = []; for (let i = 0; i < 500; i++) s.push([r(), r(), 0.4 + r() * 1.2, 0.3 + r() * 0.7]); return s; })();

function drawBackground() {
  const [r, g, b] = bgColor(V);
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, `rgb(${Math.min(255, r + 14)},${Math.min(255, g + 14)},${Math.min(255, b + 18)})`);
  grad.addColorStop(1, `rgb(${r * 0.7 | 0},${g * 0.7 | 0},${b * 0.7 | 0})`);
  ctx.fillStyle = grad; ctx.fillRect(0, 0, W, H);

  const starA = smooth(5.5, 8, V);
  if (starA > 0) {
    // Two star layers that slowly drift apart as you zoom, for a sense of depth.
    const f = V - Math.floor(V);
    for (let layer = 0; layer < 2; layer++) {
      const k = Math.pow(10, (f + layer) * 0.15);
      ctx.fillStyle = "#fff";
      for (let i = layer; i < STARS.length; i += 2) {
        const [sx, sy, sz, sa] = STARS[i];
        const x = W / 2 + (sx - 0.5) * W * 1.4 * k, y = H / 2 + (sy - 0.5) * H * 1.4 * k;
        if (x < 0 || y < 0 || x > W || y > H) continue;
        ctx.globalAlpha = starA * sa * 0.8;
        ctx.fillRect(x, y, sz, sz);
      }
    }
    ctx.globalAlpha = 1;
  }
}

// ---------- main render ----------
function drawRuler() {
  const target = Math.pow(10, V) * 0.22;
  const f = (unitFor(target) || [1])[0];
  const e = Math.floor(Math.log10(target / f)), base = Math.pow(10, e) * f;
  const nice = [5, 2, 1].map((m) => m * base).find((v) => v <= target * 1.0001);
  const len = (nice / Math.pow(10, V)) * M;
  const x0 = 24, y = H - 100;
  ctx.strokeStyle = "rgba(255,255,255,0.6)"; ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(x0, y - 5); ctx.lineTo(x0, y); ctx.lineTo(x0 + len, y); ctx.lineTo(x0 + len, y - 5); ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.font = "12px system-ui, sans-serif"; ctx.textAlign = "left"; ctx.textBaseline = "bottom";
  ctx.fillText(formatLen(nice), x0, y - 8);
}

function render() {
  drawBackground();
  const unit = Math.pow(10, V);
  const scale = M / unit;
  const cy = H * 0.48;
  visible = [];
  for (let i = OBJECTS.length - 1; i >= 0; i--) {
    const o = OBJECTS[i];
    const p = o.s * scale;
    if (p < 3 || p > 5 * M) continue;
    const sx = W / 2 + (o.x / unit) * M;
    const sy = cy + (o.y / unit) * M;
    const halfW = p * Math.max(o.w, 1.2) / 2;
    if (sx + halfW < -50 || sx - halfW > W + 50 || sy + p * o.h < -50 || sy - p * o.h > H + 50) continue;
    const alpha = smooth(3, 22, p) * (1 - smooth(1.6 * M, 5 * M, p));
    if (alpha <= 0.01) continue;
    visible.push({ o, sx, sy, p, alpha });
    ctx.save();
    ctx.globalAlpha = alpha;
    if (CACHED[o.k]) {
      const R = CACHED[o.k];
      ctx.drawImage(sprite(o), sx - p * R, sy - p * R, p * 2 * R, p * 2 * R);
    } else {
      ctx.translate(sx, sy); ctx.scale(p, p);
      K[o.k](ctx, o, p, rng(o.seed));
    }
    ctx.restore();
  }

  // labels
  ctx.textAlign = "center"; ctx.textBaseline = "top";
  const taken = [];
  const byPriority = [...visible].sort((a, b) => (b.o === hovered || b.o === focus) - (a.o === hovered || a.o === focus) || b.p - a.p);
  for (const v of byPriority) {
    const { o, sx, p } = v;
    const la = v.alpha * smooth(14, 40, p) * (1 - smooth(0.85 * M, 1.4 * M, p));
    if (la <= 0.02) continue;
    const y = Math.min(v.sy + p * o.h / 2 + 12, H - 130);
    ctx.font = "600 13px system-ui, sans-serif";
    const tw = Math.max(ctx.measureText(o.n).width, 60) / 2 + 6;
    if (taken.some(([x1, x2, y1, y2]) => sx + tw > x1 && sx - tw < x2 && y + 30 > y1 && y < y2)) continue;
    taken.push([sx - tw, sx + tw, y, y + 30]);
    const hl = v.o === hovered || v.o === focus;
    ctx.globalAlpha = la;
    ctx.font = `${hl ? 700 : 600} 13px system-ui, sans-serif`;
    ctx.fillStyle = hl ? "#ffffff" : "rgba(255,255,255,0.92)";
    ctx.shadowColor = "rgba(0,0,0,0.8)"; ctx.shadowBlur = 4;
    ctx.fillText(hearts.has(o.n) ? `♥ ${o.n}` : o.n, sx, y);
    ctx.font = "11px system-ui, sans-serif";
    ctx.fillStyle = "rgba(200,220,255,0.75)";
    ctx.fillText(o.sizeText || formatLen(o.s), sx, y + 16);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
  drawRuler();
}

// ---------- UI sync ----------
const readMain = $("readout-main"), readExp = $("readout-exp");
let lastReadout = "";
function updateReadout() {
  const txt = formatLen(Math.pow(10, V), 2);
  const e = Math.round(V);
  if (txt + e === lastReadout) return;
  lastReadout = txt + e;
  readMain.textContent = txt;
  readExp.innerHTML = `≈ 10<sup>${e}</sup> meters across`;
}

function showInfo(o) {
  $("info-name").textContent = o.n;
  $("info-size").textContent = o.sizeText || `${formatLen(o.s)}  ·  ${sci(o.s)}`;
  $("info-desc").textContent = o.d;
  const src = $("info-src");
  src.hidden = !o.src;
  if (o.src) { src.href = o.src; src.textContent = `Source: ${o.pub || new URL(o.src).hostname} ↗`; }
  updateHeartButton();
  $("info").hidden = false;
}

// ---------- hearts (saved per browser) ----------
const HEART_KEY = "scale-hearts";
const hearts = new Set((() => { try { return JSON.parse(localStorage.getItem(HEART_KEY)) || []; } catch { return []; } })());
function saveHearts() { try { localStorage.setItem(HEART_KEY, JSON.stringify([...hearts])); } catch { /* storage unavailable */ } }
function updateHeartButton() {
  const on = !!focus && hearts.has(focus.n), b = $("info-heart");
  b.textContent = on ? "♥" : "♡";
  b.classList.toggle("on", on);
  b.setAttribute("aria-pressed", on);
}
// Each hearted object sits on the scale bar at the zoom level that frames it.
// A clickable tiny picture of a hearted object, with its name on hover.
function pinButton(o, size) {
  const b = document.createElement("button"), tip = document.createElement("span");
  b.className = "pin"; b.setAttribute("aria-label", `Go to ${o.n}`);
  tip.className = "tip"; tip.textContent = o.n;
  b.append(thumbnail(o, size), tip);
  b.onclick = () => { focusOn(o); markInteracted(); };
  return b;
}
// Hearted objects sit on the scale bar at their zoom level. Ones too close to
// fit side by side share a folder that fans them out on hover (or tap).
const PIN = 14, PIN_GAP = 4, FAN_PIN = 20;
function renderHearts() {
  const box = $("hearts"), width = box.clientWidth;
  box.replaceChildren();
  const at = (o) => (clamp(o.fv, MIN_V, MAX_V) - MIN_V) / (MAX_V - MIN_V);
  const groups = [];
  for (const o of OBJECTS.filter((o) => hearts.has(o.n)).sort((a, b) => a.fv - b.fv)) {
    const g = groups[groups.length - 1];
    if (g && (at(o) - g.end) * width < PIN + PIN_GAP) { g.items.push(o); g.end = at(o); }
    else groups.push({ items: [o], start: at(o), end: at(o) });
  }
  for (const { items, start, end } of groups) {
    let el;
    if (items.length === 1) el = pinButton(items[0], PIN);
    else {
      el = document.createElement("div"); el.className = "folder";
      const face = document.createElement("button"), count = document.createElement("span"), fan = document.createElement("div");
      face.className = "face"; face.setAttribute("aria-label", `${items.length} hearted: ${items.map((o) => o.n).join(", ")}`);
      count.className = "count"; count.textContent = items.length;
      face.append(thumbnail(items[0], PIN), count);
      face.onclick = () => el.classList.toggle("open");
      fan.className = "fan";
      for (const o of items) fan.append(pinButton(o, FAN_PIN));
      el.append(face, fan);
    }
    el.style.left = `${((start + end) / 2) * 100}%`;
    box.appendChild(el);
  }
}

// A small standalone picture of an object, using the same artwork as the scene.
function thumbnail(o, size) {
  const cv = document.createElement("canvas"), dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width = cv.height = size * dpr;
  const c = cv.getContext("2d");
  const p = (size * dpr * 0.82) / Math.max(o.w, o.h, 1);
  c.translate((size * dpr) / 2, (size * dpr) / 2);
  prepare(o);
  if (CACHED[o.k]) {
    const R = CACHED[o.k];
    c.drawImage(sprite(o), -p * R, -p * R, p * 2 * R, p * 2 * R);
  } else {
    c.scale(p, p);
    K[o.k](c, o, p, rng(o.seed));
  }
  return cv;
}
function toggleHeart() {
  if (!focus) return;
  hearts.has(focus.n) ? hearts.delete(focus.n) : hearts.add(focus.n);
  saveHearts(); updateHeartButton(); renderHearts();
}
function focusOn(o) {
  focus = o; playDir = 0; updatePlayButtons();
  targetV = clamp(o.fv, MIN_V, MAX_V);
  showInfo(o);
}

// ---------- loop ----------
let last = performance.now();
let sliderDragging = false;
let fling = 0, dragVel = 0, lastMoveT = 0; // touch drags keep coasting after release, in powers of ten per second
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  if (playDir) {
    targetV = clamp(targetV + playDir * dt * 0.7, MIN_V, MAX_V);
    if (targetV === MIN_V || targetV === MAX_V) { playDir = 0; updatePlayButtons(); }
  }
  if (fling) {
    targetV = clamp(targetV + fling * dt, MIN_V, MAX_V);
    fling *= Math.exp(-dt * 3.5);
    if (Math.abs(fling) < 0.05 || targetV === MIN_V || targetV === MAX_V) fling = 0;
  }
  V += (targetV - V) * (1 - Math.exp(-dt * 7));
  if (Math.abs(targetV - V) < 1e-5) V = targetV;


  if (!sliderDragging) slider.value = V;
  updateReadout();
  render();
  requestAnimationFrame(frame);
}

// ---------- input ----------
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight; M = Math.min(W, H);
  canvas.width = W * DPR; canvas.height = H * DPR;
  canvas.style.width = W + "px"; canvas.style.height = H + "px";
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener("resize", () => { resize(); renderHearts(); });

if (matchMedia("(pointer: coarse)").matches)
  $("hint").textContent = "Pinch or swipe up/down to zoom · Tap anything to learn about it";

function markInteracted() {
  if (interacted) return;
  interacted = true;
  $("hint").style.transition = "opacity 1.5s"; $("hint").style.opacity = "0";
}
function zoomBy(d) { fling = 0; targetV = clamp(targetV + d, MIN_V, MAX_V); playDir = 0; updatePlayButtons(); markInteracted(); }

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const d = e.deltaMode === 1 ? e.deltaY * 40 : e.deltaY;
  zoomBy(clamp(d, -200, 200) * 0.0018);
}, { passive: false });

// Fingers are blunter than a mouse: give touch taps a bigger target and more wiggle room.
let touchInput = false;
function pick(mx, my) {
  const minHit = touchInput ? 24 : 10;
  for (let i = visible.length - 1; i >= 0; i--) {
    const { o, sx, sy, p, alpha } = visible[i];
    if (alpha < 0.3 || p > 1.6 * M) continue;
    const hw = Math.max(p * o.w / 2, minHit), hh = Math.max(p * o.h / 2, minHit);
    if (Math.abs(mx - sx) < hw && Math.abs(my - sy) < hh) return o;
  }
  return null;
}

const pointers = new Map();
let dragging = false, downX = 0, downY = 0, moved = false, pinchDist = 0;
canvas.addEventListener("pointerdown", (e) => {
  touchInput = e.pointerType !== "mouse";
  fling = 0; dragVel = 0;
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 1) { dragging = true; moved = false; downX = e.clientX; downY = e.clientY; }
  else if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinchDist = Math.hypot(a[0] - b[0], a[1] - b[1]); moved = true; }
});
canvas.addEventListener("pointermove", (e) => {
  const prev = pointers.get(e.pointerId);
  if (!prev) {
    if (e.pointerType !== "mouse") return;
    hovered = pick(e.clientX, e.clientY);
    canvas.classList.toggle("hover", !!hovered);
    return;
  }
  pointers.set(e.pointerId, [e.clientX, e.clientY]);
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()]; const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
    if (pinchDist > 0) zoomBy(-2.5 * Math.log10(d / pinchDist)); // 1:1 pinching is far too slow across 60 powers of ten
    pinchDist = d;
    return;
  }
  if (moved || Math.hypot(e.clientX - downX, e.clientY - downY) > (touchInput ? 14 : 5)) {
    if (!moved) { moved = true; canvas.classList.add("dragging"); }
    // a full-height swipe on a phone covers about 7 powers of ten
    const d = (e.clientY - prev[1]) * (touchInput ? 7 / H : 0.004);
    zoomBy(d);
    const t = e.timeStamp, dt = Math.max(1, t - lastMoveT) / 1000;
    if (lastMoveT && dt < 0.1) dragVel = dragVel * 0.6 + (d / dt) * 0.4;
    lastMoveT = t;
  }
});
function endPointer(e) {
  pointers.delete(e.pointerId);
  if (pointers.size === 0) {
    if (dragging && !moved) {
      const o = pick(e.clientX, e.clientY);
      if (o) { focusOn(o); markInteracted(); } else closeInfo();
    }
    else if (dragging && touchInput && e.timeStamp - lastMoveT < 80) fling = clamp(dragVel, -12, 12);
    dragging = false; canvas.classList.remove("dragging"); dragVel = 0; lastMoveT = 0;
  }
  pinchDist = 0;
}
canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);

window.addEventListener("keydown", (e) => {
  if (e.target === $("search")) return;
  if (e.key === "ArrowUp" || e.key === "+" || e.key === "=" || e.key === "PageUp") { zoomBy(e.key === "PageUp" ? 3 : 0.25); e.preventDefault(); }
  else if (e.key === "ArrowDown" || e.key === "-" || e.key === "_" || e.key === "PageDown") { zoomBy(e.key === "PageDown" ? -3 : -0.25); e.preventDefault(); }
  else if (e.key === "Escape") closeInfo();
  else if (e.key === "m" || e.key === "M") toggleMusic();
  else if ((e.key === "h" || e.key === "H") && !$("info").hidden) toggleHeart();
  else if (e.key === " ") { playDir = playDir ? 0 : 1; updatePlayButtons(); e.preventDefault(); }
});

slider.addEventListener("input", () => { sliderDragging = true; targetV = +slider.value; playDir = 0; updatePlayButtons(); markInteracted(); });
slider.addEventListener("change", () => { sliderDragging = false; });
slider.addEventListener("pointerup", () => { sliderDragging = false; });

$("btn-in").onclick = () => zoomBy(-1);
$("btn-out").onclick = () => zoomBy(1);
function updatePlayButtons() {
  $("btn-play-in").classList.toggle("active", playDir < 0);
  $("btn-play-out").classList.toggle("active", playDir > 0);
}
$("btn-play-in").onclick = () => { playDir = playDir < 0 ? 0 : -1; updatePlayButtons(); markInteracted(); };
$("btn-play-out").onclick = () => { playDir = playDir > 0 ? 0 : 1; updatePlayButtons(); markInteracted(); };
function closeInfo() { $("info").hidden = true; focus = null; }
$("info-close").onclick = closeInfo;
$("info-heart").onclick = toggleHeart;
renderHearts();

// Music is on by default and remembers the visitor's choice. Browsers only allow
// sound after an interaction, so it starts silently and becomes audible on the
// first click, tap or key press.
const MUSIC_KEY = "scale-music";
function showMusicState(on) {
  $("btn-music").classList.toggle("active", on);
  $("btn-music").setAttribute("aria-pressed", on);
}
function toggleMusic() {
  const on = Music.toggle();
  showMusicState(on);
  try { localStorage.setItem(MUSIC_KEY, on ? "on" : "off"); } catch { /* storage unavailable */ }
}
$("btn-music").onclick = toggleMusic;
if ((() => { try { return localStorage.getItem(MUSIC_KEY) !== "off"; } catch { return true; } })()) {
  showMusicState(Music.toggle());
}
for (const type of ["pointerdown", "keydown", "touchend"]) window.addEventListener(type, () => Music.unlock(), { capture: true });

const search = $("search"), list = $("names");
for (const o of OBJECTS) { if (o.secret) continue; const opt = document.createElement("option"); opt.value = o.n; list.appendChild(opt); }
function doSearch() {
  const q = search.value.trim().toLowerCase();
  if (!q) return;
  const findable = OBJECTS.filter((x) => !x.secret);
  const o = findable.find((x) => x.n.toLowerCase() === q) || findable.find((x) => x.n.toLowerCase().includes(q));
  if (o) { focusOn(o); markInteracted(); search.blur(); }
}
search.addEventListener("change", doSearch);
search.addEventListener("keydown", (e) => { if (e.key === "Enter") doSearch(); });

// Build textures and sprites in the background, nearest to the current zoom
// first, so a planet doesn't stutter the first time it comes into view.
function warmUp() {
  const byNearness = [...OBJECTS].sort((a, b) => Math.abs(a.fv - V) - Math.abs(b.fv - V));
  if (byNearness.some(prepare)) setTimeout(warmUp, 30);
}

resize();
requestAnimationFrame(frame);
setTimeout(warmUp, 300);
})();
