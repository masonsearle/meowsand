/* MEOWSAND — one in a thousand, meowsand.
 * A static, no-backend Krillion-style game. Data lives in data/prompts.json
 * (built by tools/build_data.py). Every answer carries "n" = estimated 1-in-N rarity.
 */
(() => {
"use strict";

const ROUNDS = 7, SECONDS = 25, LAUNCH = "2026-11-16";
const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem("meowsand:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("meowsand:" + k, JSON.stringify(v)); } catch {} },
};

/* ---------- rarity helpers ---------- */
const metres = (n) => Math.max(1, Math.round(Math.log10(n) * 40));
const TIERS = [
  { max: 10, name: "PURR-DICTABLE", emo: "⬜", cls: "t0" },
  { max: 50, name: "COMMON", emo: "🟩", cls: "t1" },
  { max: 200, name: "UNCOMMON", emo: "🟦", cls: "t2" },
  { max: 1000, name: "RARE", emo: "🟨", cls: "t3" },
  { max: Infinity, name: "ONE IN A MEOWSAND", emo: "🟪", cls: "t4" },
];
const tierOf = (n) => TIERS.find((t) => n < t.max);
const fmt = (n) => n.toLocaleString("en-GB");
const pct = (n) => { const p = 100 / n; return p >= 1 ? p.toFixed(0) + "%" : p >= 0.1 ? p.toFixed(1) + "%" : "<0.1%"; };

/* ---------- answer matching ---------- */
function norm(s) {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim()
    .replace(/^the /, "").trim();
}
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]; let best = i;
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1;
    prev = cur;
  }
  return prev[b.length];
}
function indexPrompt(p) {
  if (p.idx) return p.idx;
  p.idx = new Map();
  p.answers.forEach((a, i) => a.k.forEach((k) => {
    if (!p.idx.has(k)) p.idx.set(k, i);
    const c = k.replace(/ /g, "");
    if (!p.idx.has(c)) p.idx.set(c, i);
  }));
  return p.idx;
}
function findAnswer(p, raw) {
  const idx = indexPrompt(p), k = norm(raw);
  if (!k) return null;
  const tries = [k, k.replace(/ /g, ""), k.replace(/es$/, ""), k.replace(/s$/, ""), k + "s", k.replace(/ies$/, "y")];
  for (const t of tries) if (idx.has(t)) return p.answers[idx.get(t)];
  if (k.length < 4) return null;
  const max = k.length >= 9 ? 2 : 1;
  let best = null, bd = max + 1;
  for (const [key, i] of idx) {
    if (key.length < 4) continue;
    const d = lev(k, key, max);
    if (d < bd || (d === bd && best && p.answers[i].n < best.n)) { bd = d; best = p.answers[i]; }
  }
  return bd <= max ? best : null;
}

/* ---------- seeded randomness ---------- */
function hash(str) { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; }
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle(arr, r = Math.random) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const dayNumber = () => Math.floor((new Date(today()) - new Date(LAUNCH)) / 864e5) + 1;

/* ---------- game state ---------- */
let DATA = null;
let game = null; // {mode, prompts:[idx], round, results:[], total}
let timer = null, deadline = 0, locked = false;

function pickDaily() {
  const r = rng(hash("meowsand-" + today()));
  return shuffle(DATA.prompts.map((_, i) => i), r).slice(0, ROUNDS);
}
function pickUnlimited() {
  let deck = store.get("deck", []);
  if (!Array.isArray(deck) || deck.some((i) => i >= DATA.prompts.length)) deck = [];
  const out = [];
  while (out.length < ROUNDS) {
    if (!deck.length) deck = shuffle(DATA.prompts.map((_, i) => i)).filter((i) => !out.includes(i));
    out.push(deck.shift());
  }
  store.set("deck", deck);
  return out;
}

function show(id) { document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id)); }

function start(mode) {
  if (mode === "daily") {
    const saved = store.get("daily:" + today());
    if (saved) { game = saved; scene.reset(); scene.rollTo(game.total, 0.01); return showEnd(); }
  }
  game = { mode, day: today(), prompts: mode === "daily" ? pickDaily() : pickUnlimited(), round: 0, results: [], total: 0 };
  scene.reset();
  $("mode").textContent = mode === "daily" ? `DAILY #${dayNumber()}` : "UNLIMITED";
  show("play");
  nextRound();
}

function nextRound() {
  if (game.round >= ROUNDS) return finish();
  const p = DATA.prompts[game.prompts[game.round]];
  $("round").textContent = `${game.round + 1} / ${ROUNDS}`;
  $("prompt").textContent = p.q;
  $("answer").value = ""; $("answer").disabled = false;
  $("feedback").textContent = "";
  $("result").classList.add("hidden");
  $("answerForm").classList.remove("hidden");
  $("btnSkip").classList.remove("hidden");
  locked = false;
  $("answer").focus();
  deadline = performance.now() + SECONDS * 1000;
  clearInterval(timer);
  timer = setInterval(tick, 100);
  tick();
}
function tick() {
  const left = Math.max(0, deadline - performance.now());
  $("timerBar").style.width = (left / (SECONDS * 1000)) * 100 + "%";
  $("timerBar").classList.toggle("low", left < 6000);
  if (left <= 0) resolve(null, "time");
}

function submit(e) {
  e.preventDefault();
  if (locked) return;
  const raw = $("answer").value;
  if (!norm(raw)) return;
  const p = DATA.prompts[game.prompts[game.round]];
  const hit = findAnswer(p, raw);
  if (!hit) {
    $("feedback").textContent = `“${raw.trim()}” isn't on our list. Try another!`;
    const c = $("answer"); c.classList.remove("shake"); void c.offsetWidth; c.classList.add("shake"); c.select();
    return;
  }
  resolve(hit);
}

function resolve(hit, why) {
  if (locked) return;
  locked = true; clearInterval(timer);
  const p = DATA.prompts[game.prompts[game.round]];
  const m = hit ? metres(hit.n) : 0;
  game.results.push({ q: p.q, a: hit ? hit.a : null, n: hit ? hit.n : 0, m });
  game.total += m;
  $("dist").textContent = fmt(game.total);
  $("answerForm").classList.add("hidden");
  $("btnSkip").classList.add("hidden");
  $("feedback").textContent = "";

  const t = hit ? tierOf(hit.n) : null;
  $("resAnswer").textContent = hit ? hit.a.toUpperCase() : (why === "time" ? "TIME'S UP" : "SKIPPED");
  $("resOdds").textContent = hit ? `1 in ${fmt(hit.n)} would say that (${pct(hit.n)}) · +${m} m` : "the yarn didn't budge · +0 m";
  $("resTier").textContent = hit ? t.name : "😿";
  $("resTier").className = "res-tier " + (t ? t.cls : "t0");
  const top = p.answers.slice(0, 3).map((a) => `${a.a} (${pct(a.n)})`).join(" · ");
  $("resTop").textContent = "most said: " + top;
  $("result").classList.remove("hidden");
  $("btnNext").textContent = game.round + 1 >= ROUNDS ? "SEE RESULTS ▶" : "NEXT ▶";
  setTimeout(() => $("btnNext").focus(), 50);
  scene.rollTo(game.total, m);
}

function finish() {
  if (game.mode === "daily") {
    store.set("daily:" + game.day, game);
    const st = store.get("stats", { played: 0, best: 0, streak: 0, last: null });
    const yesterday = new Date(Date.now() - 864e5);
    const y = `${yesterday.getFullYear()}-${String(yesterday.getMonth() + 1).padStart(2, "0")}-${String(yesterday.getDate()).padStart(2, "0")}`;
    if (st.last !== game.day) { st.played++; st.streak = st.last === y ? st.streak + 1 : 1; st.last = game.day; }
    st.best = Math.max(st.best, game.total);
    store.set("stats", st);
  } else {
    const u = store.get("unlimitedBest", 0);
    if (game.total > u) store.set("unlimitedBest", game.total);
  }
  showEnd();
}

function showEnd() {
  $("endTitle").textContent = game.mode === "daily" ? `DAILY CHASE #${Math.floor((new Date(game.day) - new Date(LAUNCH)) / 864e5) + 1}` : "UNLIMITED CHASE";
  $("endDist").textContent = fmt(game.total);
  const rarest = game.results.reduce((b, r) => (r.n > (b ? b.n : 0) ? r : b), null);
  const best = rarest && rarest.n ? tierOf(rarest.n) : null;
  $("endTier").innerHTML = best ? `rarest find: <span class="${best.cls}">${rarest.a.toUpperCase()} · 1 in ${fmt(rarest.n)}</span>` : "the cat is unimpressed";
  const list = $("endList"); list.innerHTML = "";
  game.results.forEach((r, i) => {
    const p = DATA.prompts.find((x) => x.q === r.q);
    const t = r.n ? tierOf(r.n) : null;
    const rare = p ? p.answers[Math.floor(p.answers.length * (0.7 + Math.random() * 0.25))] : null;
    const li = document.createElement("li");
    li.innerHTML = `<span class="q">${i + 1}. ${esc(r.q)}</span>
      <span class="a ${t ? t.cls : "t0"}">${r.a ? esc(r.a) : "—"} ${r.n ? `<small>(1 in ${fmt(r.n)})</small>` : ""}</span>
      <span class="m">+${r.m}m</span>
      ${rare ? `<span class="hint">rare pick you could've had: ${esc(rare.a)} (1 in ${fmt(rare.n)})</span>` : ""}`;
    list.appendChild(li);
  });
  $("btnAgain").textContent = game.mode === "daily" ? "∞ PLAY UNLIMITED" : "∞ NEXT CHASE";
  $("shareMsg").textContent = "";
  show("end");
}

function shareText() {
  const squares = game.results.map((r) => (r.n ? tierOf(r.n).emo : "⬛")).join("");
  const head = game.mode === "daily" ? `MEOWSAND #${Math.floor((new Date(game.day) - new Date(LAUNCH)) / 864e5) + 1}` : "MEOWSAND ∞";
  return `${head} 🧶\n🐈 ${fmt(game.total)} m\n${squares}\n${location.origin + location.pathname}`;
}
async function share() {
  const text = shareText();
  try {
    if (navigator.share && matchMedia("(pointer:coarse)").matches) { await navigator.share({ text }); return; }
    await navigator.clipboard.writeText(text);
    $("shareMsg").textContent = "copied to clipboard!";
  } catch { $("shareMsg").textContent = text; }
}
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function renderStats() {
  const st = store.get("stats", null), ub = store.get("unlimitedBest", 0);
  const parts = [];
  if (st) parts.push(`daily played ${st.played} · streak ${st.streak} · best ${fmt(st.best)} m`);
  if (ub) parts.push(`unlimited best ${fmt(ub)} m`);
  if (store.get("daily:" + today())) parts.push("✓ today's chase done");
  $("stats").textContent = parts.join("  ·  ");
}

/* ======================= SCENE (pixel-art canvas) ======================= */
const scene = (() => {
  const cv = $("scene"), ctx = cv.getContext("2d");
  const PX = 3, PPM = 2; // screen px per art px; art px per metre
  let W = 0, H = 0, ground = 0, t = 0;
  let yarnX = 0, yarnFrom = 0, yarnTo = 0, rollT = 1, rollDur = 1, spin = 0;
  let catX = -26, camX = 0, catFrame = 0, running = false;
  const clouds = Array.from({ length: 9 }, (_, i) => ({ x: i * 90 + Math.random() * 60, y: 8 + Math.random() * 50, s: 0.6 + Math.random() * 0.8, w: 18 + Math.random() * 22 }));

  // 20x10 ginger cat, facing right. o=fur d=stripe w=white k=eye p=pink
  const PAL = { o: "#f29b38", d: "#c4661c", w: "#fff4e0", k: "#1b2235", p: "#ff7aa2" };
  const BODY = [
    "o..............o..o.",
    "o.............oooooo",
    ".o............okooko",
    ".o............ooowpo",
    "..o.ddoddoddooowwwo.",
    "..ooooooooooooowww..",
    "...ooodoodoodoooo...",
    "...oooooooooooooo...",
  ];
  const LEGS = [
    ["..oo..........oo....", ".oo............oo..."],
    ["....oo......oo......", "....oo......oo......"],
  ];
  const SIT = [
    "...............o..o.",
    "..............oooooo",
    "..............okooko",
    "..............ooowpo",
    "............oooowwwo",
    "..o.......ooodoowww.",
    ".o.......oooodooww..",
    ".o......ooooooooo...",
    "..oo....ooo.oo.oo...",
    "....ooooooo.oo.oo...",
  ];
  function sprite(rows, x, y) {
    rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = PAL[r[i]]; if (c) { ctx.fillStyle = c; ctx.fillRect(x + i, y + j, 1, 1); } } });
  }
  function resize() {
    W = Math.ceil(innerWidth / PX); H = Math.ceil(innerHeight / PX);
    cv.width = W; cv.height = H; ground = Math.round(H * 0.66);
    ctx.imageSmoothingEnabled = false;
  }
  function px(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); }

  function drawSky() {
    const g = ctx.createLinearGradient(0, 0, 0, ground);
    g.addColorStop(0, "#8fcfe8"); g.addColorStop(1, "#d9f0f2");
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, ground);
    for (const c of clouds) {
      const x = ((c.x - camX * 0.1 * c.s + t * 2 * c.s) % (W + 80) + W + 80) % (W + 80) - 40;
      px(x, c.y, c.w, 4, "#ffffff"); px(x + 4, c.y - 3, c.w - 10, 3, "#ffffff"); px(x + 2, c.y + 4, c.w - 4, 2, "#e6f3f8");
    }
  }
  function drawHills() {
    for (const [par, base, amp, col] of [[0.15, ground - 18, 10, "#7fb7a4"], [0.35, ground - 8, 6, "#5f9e78"]]) {
      ctx.fillStyle = col;
      for (let x = 0; x < W; x++) {
        const wx = x + camX * par;
        const h = Math.sin(wx / 37) * amp + Math.sin(wx / 13) * amp * 0.3;
        ctx.fillRect(x, Math.round(base - h), 1, ground - Math.round(base - h));
      }
    }
  }
  function drawGround() {
    px(0, ground, W, H - ground, "#4f8a3c");
    // mowed stripes every 10 m, receding plane
    const stripe = 10 * PPM;
    for (let x = -((camX % (stripe * 2)) + stripe * 2); x < W; x += stripe * 2) px(x, ground + 1, stripe, H - ground, "#5a9844");
    px(0, ground, W, 1, "#7cc35a");
    px(0, ground + 14, W, H - ground - 14, "#3d6b2f");
    for (let x = -((camX * 1.6) % 24); x < W; x += 24) px(x, ground + 18 + ((x / 24) % 2) * 6, 6, 1, "#33592a");
    // signposts every 25 m
    const first = Math.floor(camX / (25 * PPM)) * 25;
    for (let m = Math.max(0, first); m * PPM - camX < W + 40; m += 25) {
      const sx = Math.round(m * PPM - camX);
      if (sx < -30) continue;
      const label = m + "m", w = label.length * 4 + 3;
      px(sx, ground - 10, 1, 12, "#6b4a2b");
      px(sx - (w >> 1), ground - 18, w, 9, m % 100 === 0 ? "#ffd166" : "#f7f1e3");
      px(sx - (w >> 1), ground - 18, w, 1, "#6b4a2b");
      text(label, sx - (w >> 1) + 2, ground - 16, "#1b2235");
    }
  }
  // 3x5 bitmap font for signposts
  const GLYPH = { 0:"111101101101111",1:"010110010010111",2:"111001111100111",3:"111001111001111",4:"101101111001001",
    5:"111100111001111",6:"111100111101111",7:"111001010010010",8:"111101111101111",9:"111101111001111",m:"000000111111101" };
  function text(str, x, y, col) {
    ctx.fillStyle = col;
    [...str].forEach((ch, n) => { const g = GLYPH[ch]; if (!g) return;
      for (let i = 0; i < 15; i++) if (g[i] === "1") ctx.fillRect(x + n * 4 + (i % 3), y + ((i / 3) | 0), 1, 1); });
  }
  function drawThread() {
    const sx = 0 - camX, ex = yarnX - camX;
    if (ex > sx) px(Math.max(sx, 0), ground - 1, Math.min(ex, W) - Math.max(sx, 0), 1, "#ff5c8a");
  }
  function drawYarn() {
    const cx = Math.round(yarnX - camX), cy = ground - 6, r = 6;
    for (let y = -r; y <= r; y++) for (let x = -r; x <= r; x++) if (x * x + y * y <= r * r + 2) {
      const a = Math.atan2(y, x) + spin, band = Math.sin(a * 2 + Math.hypot(x, y) * 0.9);
      px(cx + x, cy + y, 1, 1, band > 0.4 ? "#ffb3c8" : band < -0.5 ? "#d93a68" : "#ff5c8a");
    }
    px(cx - 2, cy - 4, 2, 1, "#ffe0ea");
  }
  function drawCat() {
    const x = Math.round(catX - camX), y = ground - 10;
    if (running) {
      const bob = catFrame ? 1 : 0;
      sprite(BODY, x - 20, y - 0 + bob);
      sprite(LEGS[catFrame], x - 20, y + 8 + bob);
    } else {
      const tail = Math.sin(t * 4) > 0;
      const s = SIT.map((r, j) => (j === 6 || j === 7) && tail ? "." + r.slice(1).replace(/^\.o/, "o.") : r);
      sprite(s, x - 20, y);
    }
  }
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    if (rollT < 1) {
      rollT = Math.min(1, rollT + dt / rollDur);
      const e = 1 - Math.pow(1 - rollT, 3);
      const nx = yarnFrom + (yarnTo - yarnFrom) * e;
      spin += (nx - yarnX) / 6; yarnX = nx;
    }
    const want = yarnX - 14;
    const dx = want - catX;
    running = Math.abs(dx) > 1.5;
    if (running) { catX += Math.sign(dx) * Math.min(Math.abs(dx), Math.max(40, Math.abs(dx) * 2.2) * dt); catFrame = Math.floor(t * 12) % 2; }
    const camWant = Math.max(0, yarnX - W * 0.6);
    camX += (camWant - camX) * Math.min(1, dt * 3);
    drawSky(); drawHills(); drawGround(); drawThread(); drawYarn(); drawCat();
    requestAnimationFrame(frame);
  }
  addEventListener("resize", resize); resize();
  requestAnimationFrame(frame);
  return {
    reset() { yarnX = yarnFrom = yarnTo = 40; catX = 26; camX = 0; rollT = 1; },
    rollTo(totalM, gained) { yarnFrom = yarnX; yarnTo = 40 + totalM * PPM; rollT = 0; rollDur = Math.max(0.4, Math.min(2.6, 0.5 + gained / 60)); },
  };
})();
scene.reset();

/* ---------- wiring ---------- */
$("answerForm").addEventListener("submit", submit);
$("btnNext").addEventListener("click", () => { game.round++; nextRound(); });
$("btnSkip").addEventListener("click", () => resolve(null, "skip"));
$("btnDaily").addEventListener("click", () => start("daily"));
$("btnUnlimited").addEventListener("click", () => start("unlimited"));
$("btnAgain").addEventListener("click", () => start("unlimited"));
$("btnHome").addEventListener("click", () => { renderStats(); scene.reset(); show("title"); });
$("btnShare").addEventListener("click", share);
document.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !$("result").classList.contains("hidden") && $("play").classList.contains("active") && document.activeElement !== $("btnNext")) {
    e.preventDefault(); $("btnNext").click();
  }
});
$("btnDaily").disabled = $("btnUnlimited").disabled = true;
fetch("data/prompts.json").then((r) => r.json()).then((d) => {
  DATA = d;
  $("loading").remove();
  $("btnDaily").disabled = $("btnUnlimited").disabled = false;
  renderStats();
}).catch(() => { $("loading").textContent = "couldn't load prompts — if you opened index.html directly, run a local server (see README)."; });
})();
