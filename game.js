/* MEOWSAND — one in a thousand, meowsand.
 * Static, no-backend Krillion-style game. data/prompts.json is built by tools/build_data.py.
 * Every answer carries n = estimated "1 in N" rarity.
 */
(() => {
"use strict";

const ROUNDS = 7, SECONDS = 25, LAUNCH = "2026-11-16";
const $ = (id) => document.getElementById(id);
const store = {
  get(k, d) { try { const v = localStorage.getItem("meowsand:" + k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem("meowsand:" + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem("meowsand:" + k); } catch {} },
};

/* ---------- rarity ---------- */
const metres = (n) => Math.max(1, Math.round(Math.log10(n) * 40));
const TIERS = [
  { max: 10, name: "PURR-DICTABLE", emo: "⬜", cls: "t0", lvl: 0 },
  { max: 50, name: "COMMON", emo: "🟩", cls: "t1", lvl: 1 },
  { max: 200, name: "UNCOMMON", emo: "🟦", cls: "t2", lvl: 2 },
  { max: 1000, name: "RARE", emo: "🟨", cls: "t3", lvl: 3 },
  { max: Infinity, name: "ONE IN A MEOWSAND", emo: "🟪", cls: "t4", lvl: 4 },
];
const tierOf = (n) => TIERS.find((t) => n < t.max);
const fmt = (n) => Math.round(n).toLocaleString("en-GB");
const pct = (n) => { const p = 100 / n; return p >= 1 ? p.toFixed(0) + "%" : p >= 0.1 ? p.toFixed(1) + "%" : "<0.1%"; };
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

/* ---------- matching ---------- */
function norm(s) {
  return s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase()
    .replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim().replace(/^the /, "").trim();
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
const keysOf = (a) => a.k || (a.k = [norm(a.a)]);
function indexOf(p) {
  if (p.idx) return p.idx;
  p.idx = new Map();
  const add = (k, i) => { if (!p.idx.has(k)) p.idx.set(k, i); const c = k.replace(/ /g, ""); if (!p.idx.has(c)) p.idx.set(c, i); };
  p.answers.forEach((a, i) => add(norm(a.a), i));            // exact titles win over aliases
  p.answers.forEach((a, i) => keysOf(a).forEach((k) => add(k, i)));
  return p.idx;
}
const digits = (s) => (s.match(/\d+/g) || []).join(",");
function findAnswer(p, raw) {
  const idx = indexOf(p), k = norm(raw);
  if (!k) return null;
  for (const t of [k, k.replace(/ /g, ""), k.replace(/es$/, ""), k.replace(/s$/, ""), k + "s", k.replace(/ies$/, "y")])
    if (idx.has(t)) return p.answers[idx.get(t)];
  if (k.length < 4) return null;
  const max = k.length >= 9 ? 2 : 1;
  let best = null, bd = max + 1;
  const kd = digits(k);
  for (const [key, i] of idx) {
    if (key.length < 4 || digits(key) !== kd) continue; // never fuzz "toy story 2" into "toy story 3"
    const d = lev(k, key, max);
    if (d < bd || (d === bd && best && p.answers[i].n < best.n)) { bd = d; best = p.answers[i]; }
  }
  return bd <= max ? best : null;
}

/* ---------- packs & prompt pool: base prompts + "starting with X" remixes ---------- */
const PACKS = {
  classic: { file: "data/prompts.json", name: "CLASSIC", pfx: "", tag: "THE DAILY CHASE" },
  movies: { file: "data/movies.json", name: "🎬 MOVIES", pfx: "movies:", tag: "MOVIE NIGHT" },
};
let PACK = store.get("pack", "classic"); if (!PACKS[PACK]) PACK = "classic";
const K = (k, pack = PACK) => PACKS[pack].pfx + k; // per-pack storage key
const LOADED = {};
let DATA = null, BASE_IDS = [], VARIANT_IDS = [], TOTAL_ANSWERS = 0, cache = new Map();
const NO_REMIX = /rhymes with|starting with|in its title|one-word/i;

function buildPool(d) {
  const pool = { DATA: d, BASE_IDS: d.prompts.map((_, i) => String(i)), VARIANT_IDS: [], TOTAL_ANSWERS: 0, cache: new Map() };
  d.prompts.forEach((p, i) => {
    pool.TOTAL_ANSWERS += p.answers.length;
    if (NO_REMIX.test(p.q)) return;
    const counts = {};
    p.answers.forEach((a) => new Set(keysOf(a).map((k) => k[0])).forEach((c) => { if (/[a-z]/.test(c)) counts[c] = (counts[c] || 0) + 1; }));
    for (const [c, n] of Object.entries(counts).sort()) if (n >= 8 && n <= p.answers.length * 0.5) pool.VARIANT_IDS.push(i + ":" + c);
  });
  return pool;
}
function usePack(name) {
  PACK = name; store.set("pack", name);
  const apply = (pool) => ({ DATA, BASE_IDS, VARIANT_IDS, TOTAL_ANSWERS, cache } = pool);
  if (LOADED[name]) { apply(LOADED[name]); return Promise.resolve(); }
  return fetch(PACKS[name].file).then((r) => r.json()).then((d) => { LOADED[name] = buildPool(d); if (PACK === name) apply(LOADED[name]); });
}
function getPrompt(id) {
  if (cache.has(id)) return cache.get(id);
  const [bi, letter] = id.split(":");
  const base = DATA.prompts[+bi];
  let p;
  if (!letter) p = { id, q: base.q, answers: base.answers, base };
  else {
    const sub = base.answers.filter((a) => keysOf(a).some((k) => k[0] === letter));
    const sum = sub.reduce((s, a) => s + 1 / a.n, 0);
    const answers = sub.map((a) => {
      const disp = norm(a.a)[0] === letter ? a.a : keysOf(a).find((k) => k[0] === letter);
      return { a: disp, k: keysOf(a).filter((k) => k[0] === letter), n: Math.max(2, Math.round(sum * a.n)) };
    }).sort((x, y) => x.n - y.n);
    p = { id, q: `${base.q} starting with ${letter.toUpperCase()}`, answers, base, letter };
  }
  cache.set(id, p);
  return p;
}

/* ---------- seeded randomness ---------- */
function hash(str) { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } return h >>> 0; }
function rng(seed) { return () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function shuffle(arr, r = Math.random) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const today = () => ymd(new Date());
const dayNum = (day) => Math.floor((new Date(day) - new Date(LAUNCH)) / 864e5) + 1;

function pickDaily() {
  const r = rng(hash("meowsand-" + PACKS[PACK].pfx + today()));
  const base = shuffle(BASE_IDS, r).slice(0, 5);
  const used = new Set(base);
  const vars = shuffle(VARIANT_IDS, r).filter((v) => !used.has(v.split(":")[0])).slice(0, 2);
  return shuffle(base.concat(vars), r);
}
function pickUnlimited() {
  let deck = store.get(K("deck"), []);
  if (!Array.isArray(deck) || deck.some((i) => !BASE_IDS.includes(i))) deck = [];
  let recent = store.get(K("recentVar"), []);
  const out = [];
  while (out.length < ROUNDS) {
    if (Math.random() < 0.6 || !VARIANT_IDS.length) {
      if (!deck.length) deck = shuffle(BASE_IDS);
      const id = deck.shift();
      if (!out.includes(id)) out.push(id);
    } else {
      let id, tries = 0;
      do { id = VARIANT_IDS[Math.floor(Math.random() * VARIANT_IDS.length)]; } while ((recent.includes(id) || out.includes(id)) && ++tries < 50);
      out.push(id); recent.push(id);
    }
  }
  store.set(K("deck"), deck); store.set(K("recentVar"), recent.slice(-300));
  return out;
}

/* ---------- game state & saving ---------- */
let game = null, timer = null, deadline = 0, locked = false, paused = false;
const saveKey = (g) => K(g.mode === "daily" ? "save:daily:" + g.day : "save:unlimited", g.pack || "classic");
function persist() {
  if (!game || game.done) return;
  if (!locked && !paused) game.remaining = Math.max(0, deadline - performance.now());
  store.set(saveKey(game), game);
}

function show(id) { document.querySelectorAll(".screen").forEach((s) => s.classList.toggle("active", s.id === id)); }

function start(mode) {
  if (mode === "daily") {
    const done = store.get(K("daily:" + today()));
    if (done) { game = done; scene.jumpTo(0); scene.rollTo(game.total, 0); return showEnd(); }
    const saved = store.get(K("save:daily:" + today()));
    if (saved) return resume(saved);
    game = { pack: PACK, mode, day: today(), ids: pickDaily(), round: 0, results: [], total: 0, startM: 0, remaining: SECONDS * 1000 };
  } else {
    const journey = store.get(K("journey"), 0);
    game = { pack: PACK, mode, day: today(), ids: pickUnlimited(), round: 0, results: [], total: 0, startM: journey, remaining: SECONDS * 1000 };
  }
  scene.jumpTo(game.startM);
  enterPlay();
  nextRound();
}
function resume(saved) {
  game = saved;
  scene.jumpTo(game.startM); scene.rollTo(game.startM + game.total, 0);
  enterPlay();
  if (game.results.length > game.round) { game.round++; game.remaining = SECONDS * 1000; }
  nextRound(Math.max(3000, game.remaining || 0));
}
function enterPlay() {
  $("mode").textContent = (game.pack === "movies" ? "🎬 " : "") + (game.mode === "daily" ? `DAILY #${dayNum(game.day)}` : "UNLIMITED");
  $("dist").textContent = fmt(game.total);
  paused = false;
  show("play");
}

function nextRound(ms = SECONDS * 1000) {
  if (game.round >= ROUNDS) return finish();
  const p = getPrompt(game.ids[game.round]);
  $("round").textContent = `${game.round + 1} / ${ROUNDS}`;
  $("prompt").innerHTML = p.letter ? esc(p.base.q) + ` <span class="letter">starting with ${p.letter.toUpperCase()}</span>` : esc(p.q);
  $("answer").value = ""; $("answer").disabled = false;
  $("feedback").textContent = "";
  $("result").classList.add("hidden");
  $("answerForm").classList.remove("hidden");
  $("btnSkip").classList.remove("hidden");
  locked = false;
  $("answer").focus();
  deadline = performance.now() + ms;
  game.remaining = ms;
  clearInterval(timer);
  timer = setInterval(tick, 100);
  tick(); persist();
}
function tick() {
  if (paused) return;
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
  const p = getPrompt(game.ids[game.round]);
  const hit = findAnswer(p, raw);
  if (!hit) {
    const wrongLetter = p.letter && findAnswer(p.base, raw);
    $("feedback").textContent = wrongLetter
      ? `“${raw.trim()}” doesn't start with ${p.letter.toUpperCase()}!`
      : `“${raw.trim()}” isn't on our list. Try another!`;
    const c = $("answer"); c.classList.remove("shake"); void c.offsetWidth; c.classList.add("shake"); c.select();
    return;
  }
  resolve(hit);
}

function resolve(hit, why) {
  if (locked) return;
  locked = true; clearInterval(timer);
  const p = getPrompt(game.ids[game.round]);
  const m = hit ? metres(hit.n) : 0;
  const t = hit ? tierOf(hit.n) : null;
  game.results.push({ id: p.id, q: p.q, a: hit ? hit.a : null, n: hit ? hit.n : 0, m });
  game.total += m;
  $("dist").textContent = fmt(game.total);
  $("answerForm").classList.add("hidden");
  $("btnSkip").classList.add("hidden");
  $("feedback").textContent = "";
  $("resAnswer").textContent = hit ? hit.a.toUpperCase() : why === "time" ? "TIME'S UP" : "SKIPPED";
  $("resOdds").textContent = hit ? `1 in ${fmt(hit.n)} would say that (${pct(hit.n)}) · +${m} m` : "the yarn didn't budge · +0 m";
  $("resTier").textContent = hit ? t.name : "😿";
  $("resTier").className = "res-tier " + (t ? t.cls : "t0");
  $("resTop").textContent = "most said: " + p.answers.slice(0, 3).map((a) => `${a.a} (${pct(a.n)})`).join(" · ");
  $("result").classList.remove("hidden");
  $("btnNext").textContent = game.round + 1 >= ROUNDS ? "SEE RESULTS ▶" : "NEXT ▶";
  setTimeout(() => $("btnNext").focus(), 50);
  scene.rollTo(game.startM + game.total, m, t ? t.lvl : -1);
  persist();
}

function quitToTitle() {
  if (!game) return show("title");
  if ($("play").classList.contains("active")) {
    if (!locked) game.remaining = Math.max(0, deadline - performance.now());
    paused = true; clearInterval(timer);
    persist();
  }
  renderTitle();
  show("title");
}

function finish() {
  game.done = true;
  store.del(saveKey(game));
  if (game.mode === "daily") {
    store.set(K("daily:" + game.day), game);
    const st = store.get(K("stats"), { played: 0, best: 0, streak: 0, last: null });
    const y = ymd(new Date(Date.now() - 864e5));
    if (st.last !== game.day) { st.played++; st.streak = st.last === y ? st.streak + 1 : 1; st.last = game.day; }
    st.best = Math.max(st.best, game.total);
    store.set(K("stats"), st);
  } else {
    store.set(K("journey"), game.startM + game.total);
    if (game.total > store.get(K("unlimitedBest"), 0)) store.set(K("unlimitedBest"), game.total);
    store.set(K("unlimitedChases"), store.get(K("unlimitedChases"), 0) + 1);
  }
  showEnd();
}

function showEnd() {
  $("endTitle").textContent = (game.pack === "movies" ? "🎬 " : "") + (game.mode === "daily" ? `DAILY CHASE #${dayNum(game.day)}` : "UNLIMITED CHASE");
  $("endDist").textContent = fmt(game.total);
  const rarest = game.results.reduce((b, r) => (r.n > (b ? b.n : 0) ? r : b), null);
  const best = rarest && rarest.n ? tierOf(rarest.n) : null;
  $("endTier").innerHTML = best ? `rarest find: <span class="${best.cls}">${esc(rarest.a.toUpperCase())} · 1 in ${fmt(rarest.n)}</span>` : "the cat is unimpressed";
  const list = $("endList"); list.innerHTML = "";
  game.results.forEach((r, i) => {
    let p = null; try { p = getPrompt(r.id); } catch {}
    const t = r.n ? tierOf(r.n) : null;
    const rare = p && p.answers.length ? p.answers[Math.floor(p.answers.length * (0.7 + Math.random() * 0.25))] : null;
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
  const head = (game.pack === "movies" ? "MEOWSAND 🎬 " : "MEOWSAND ") + (game.mode === "daily" ? `#${dayNum(game.day)}` : "∞");
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

function renderTitle() {
  document.querySelectorAll(".packtab").forEach((b) => b.classList.toggle("on", b.dataset.pack === PACK));
  $("tagline").textContent = PACKS[PACK].tag;
  const st = store.get(K("stats"), null), ub = store.get(K("unlimitedBest"), 0), jr = store.get(K("journey"), 0);
  const parts = [];
  if (st) parts.push(`streak ${st.streak} · daily best ${fmt(st.best)} m`);
  if (ub) parts.push(`unlimited best ${fmt(ub)} m · journey ${fmt(jr)} m`);
  $("stats").textContent = parts.join("  ·  ");
  $("count").textContent = DATA ? `${fmt(BASE_IDS.length + VARIANT_IDS.length)} prompts · ${fmt(TOTAL_ANSWERS)} answers` : "loading…";

  const dDone = store.get(K("daily:" + today())), dSave = store.get(K("save:daily:" + today()));
  $("btnDaily").innerHTML = dDone ? "✓ DAILY DONE · SEE RESULTS" : dSave ? `▶ RESUME DAILY <small>${dSave.results.length}/7 · ${fmt(dSave.total)}m</small>` : "▶ DAILY CHASE ◀";
  const uSave = store.get(K("save:unlimited"));
  $("btnResume").classList.toggle("hidden", !uSave);
  if (uSave) $("btnResume").innerHTML = `▶ RESUME UNLIMITED <small>${uSave.results.length}/7 · ${fmt(uSave.total)}m</small>`;
  $("btnUnlimited").innerHTML = uSave ? "∞ NEW UNLIMITED CHASE" : `∞ UNLIMITED <span class="pill">endless</span>`;
}

/* ---------- floating text, banners ---------- */
function floater(text, cls) {
  const el = document.createElement("div");
  el.className = "floater " + (cls || "");
  el.textContent = text;
  const pos = scene.yarnScreen();
  el.style.left = pos.x + "px"; el.style.top = pos.y - 30 + "px";
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1600);
}
let bannerTO;
function banner(name) {
  if (!$("play").classList.contains("active")) return;
  const b = $("banner");
  b.innerHTML = `<small>ENTERING</small>${esc(name)}`;
  b.classList.remove("show"); void b.offsetWidth; b.classList.add("show");
  clearTimeout(bannerTO); bannerTO = setTimeout(() => b.classList.remove("show"), 2600);
}

/* ======================= SCENE ======================= */
const scene = (() => {
  const cv = $("scene"), ctx = cv.getContext("2d");
  let PX = 3; const PPM = 2, CYCLE = 1500;
  let W = 0, H = 0, ground = 0, t = 0;
  let yarnX = 40, yarnFrom = 40, yarnTo = 40, rollT = 1, rollDur = 1, spin = 0, pendingFx = -1, pendingFloat = null;
  let catX = 26, camX = 0, catFrame = 0, running = false, jump = 0, shake = 0, lastBiome = -1;
  const parts = [];

  /* biomes: every 1500 m the world loops */
  const B = [
    { at: 0, name: "MEADOW MILE", sky: ["#8fcfe8", "#d9f0f2"], far: "#7fb7a4", near: "#5f9e78", g1: "#4f8a3c", g2: "#5a9844", top: "#7cc35a", dirt: "#3d6b2f", line: "#33592a", amp: 1, stars: 0, orb: "sun", deco: "meadow" },
    { at: 150, name: "SANDY SHORES", sky: ["#6cc4f0", "#fde8c8"], far: "#45b3d6", near: "#2a8fb8", g1: "#e9cf8f", g2: "#f0d99c", top: "#fff1c4", dirt: "#d9b878", line: "#c9a463", amp: 0.08, stars: 0, orb: "sun", deco: "beach" },
    { at: 300, name: "AUTUMN WOODS", sky: ["#f2a873", "#fbe3c4"], far: "#b5653a", near: "#8c4a2c", g1: "#8a6a2f", g2: "#967538", top: "#e0952f", dirt: "#5e4423", line: "#4f381c", amp: 1.2, stars: 0, orb: "sun", deco: "autumn", fx: "leaves" },
    { at: 450, name: "DUSTY DUNES", sky: ["#f59a52", "#ffe0a3"], far: "#e0a15a", near: "#cf8a44", g1: "#e8b86a", g2: "#efc47a", top: "#f7d79a", dirt: "#c9924d", line: "#b37f3f", amp: 0.8, stars: 0, orb: "sun", deco: "desert" },
    { at: 600, name: "SNOWY PEAKS", sky: ["#9fc0e6", "#eef5fb"], far: "#c9d8ea", near: "#a7bcd6", g1: "#eef4fb", g2: "#e2ebf6", top: "#ffffff", dirt: "#c3d3e6", line: "#b0c3da", amp: 2.4, stars: 0, orb: "sun", deco: "snow", fx: "snow" },
    { at: 750, name: "MOONLIT MOORS", sky: ["#0b1230", "#2b3a6b"], far: "#253159", near: "#1a2447", g1: "#1f3b3a", g2: "#234441", top: "#3d6e5f", dirt: "#152a29", line: "#0f2120", amp: 1, stars: 1, orb: "moon", deco: "night", fx: "fireflies", aurora: 1 },
    { at: 900, name: "NEON ALLEY", sky: ["#12002b", "#6b1d78"], far: "#2a0a4a", near: "#1c0636", g1: "#140422", g2: "#1a052c", top: "#ff3fd8", dirt: "#0c0216", line: "#5ee6f0", amp: 0, stars: 0.6, orb: "synth", deco: "neon", grid: 1 },
    { at: 1100, name: "CANDY CANYON", sky: ["#ffb8dc", "#fff0f7"], far: "#ff9ccf", near: "#f77bbd", g1: "#ffd1ea", g2: "#ffdff0", top: "#ffffff", dirt: "#f7a8d2", line: "#ee8fc2", amp: 1.4, stars: 0, orb: "sun", deco: "candy", fx: "sparkle" },
    { at: 1300, name: "THE MOON", sky: ["#000008", "#0b0b24"], far: "#3a3a4e", near: "#2c2c3c", g1: "#8d8d99", g2: "#9a9aa6", top: "#c4c4cf", dirt: "#6e6e7a", line: "#5d5d69", amp: 0.5, stars: 1, orb: "earth", deco: "moon" },
  ];
  const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, k) => { const x = hex(a), y = hex(b); return `rgb(${x.map((v, i) => Math.round(v + (y[i] - v) * k)).join(",")})`; };
  const biomeIdx = (m) => { const c = ((m % CYCLE) + CYCLE) % CYCLE; let i = 0; while (i + 1 < B.length && c >= B[i + 1].at) i++; return i; };
  function look(m) { // blended palette at metre m
    const c = ((m % CYCLE) + CYCLE) % CYCLE, i = biomeIdx(m), a = B[i], b = B[(i + 1) % B.length];
    const nextAt = i + 1 < B.length ? b.at : CYCLE, k = Math.min(1, Math.max(0, (c - (nextAt - 35)) / 35));
    const L = { k, a, b, main: k < 0.5 ? a : b };
    for (const key of ["far", "near", "g1", "g2", "top", "dirt", "line"]) L[key] = mix(a[key], b[key], k);
    L.sky = [mix(a.sky[0], b.sky[0], k), mix(a.sky[1], b.sky[1], k)];
    for (const key of ["amp", "stars", "grid", "aurora"]) L[key] = (a[key] || 0) * (1 - k) + (b[key] || 0) * k;
    return L;
  }

  /* sprites */
  const PAL = { o: "#f29b38", d: "#c4661c", w: "#fff4e0", k: "#1b2235", p: "#ff7aa2" };
  const BODY = ["o..............o..o.", "o.............oooooo", ".o............okooko", ".o............ooowpo", "..o.ddoddoddooowwwo.", "..ooooooooooooowww..", "...ooodoodoodoooo...", "...oooooooooooooo..."];
  const LEGS = [["..oo..........oo....", ".oo............oo..."], ["....oo......oo......", "....oo......oo......"]];
  const SIT = ["...............o..o.", "..............oooooo", "..............okooko", "..............ooowpo", "............oooowwwo", "..o.......ooodoowww.", ".o.......oooodooww..", ".o......ooooooooo...", "..oo....ooo.oo.oo...", "....ooooooo.oo.oo..."];
  const sprite = (rows, x, y) => rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = PAL[r[i]]; if (c) { ctx.fillStyle = c; ctx.fillRect(x + i, y + j, 1, 1); } } });
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const disc = (cx, cy, r, c) => { ctx.fillStyle = c; for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(r * r - y * y + r * 0.6)); ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1); } };
  const rnd = (k, s = 0) => (hash("d" + k + ":" + s) % 1000) / 1000;

  function resize() {
    PX = innerWidth > 900 ? 4 : 3;
    W = Math.ceil(innerWidth / PX); H = Math.ceil(innerHeight / PX);
    cv.width = W; cv.height = H; ground = Math.round(H * 0.66);
    ctx.imageSmoothingEnabled = false;
  }

  /* layers */
  function drawSky(L) {
    const g = ctx.createLinearGradient(0, 0, 0, ground);
    g.addColorStop(0, L.sky[0]); g.addColorStop(1, L.sky[1]);
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, ground);
    if (L.stars > 0.05) for (let i = 0; i < 90; i++) {
      const sx = (rnd(i, 1) * W * 1.5 - camX * 0.02) % W, sy = rnd(i, 2) * ground * 0.8;
      const tw = 0.5 + 0.5 * Math.sin(t * 2 + i);
      ctx.globalAlpha = L.stars * (0.4 + 0.6 * tw); px((sx + W) % W, sy, 1, 1, "#ffffff");
    }
    ctx.globalAlpha = 1;
    if (L.aurora > 0.05) {
      ctx.globalAlpha = 0.25 * L.aurora;
      for (let x = 0; x < W; x += 2) {
        const y = 20 + Math.sin(x / 23 + t * 0.6) * 8 + Math.sin(x / 9 + t) * 3;
        px(x, y, 2, 14 + Math.sin(x / 15 + t) * 6, x % 6 ? "#5effa8" : "#5ee6f0");
      }
      ctx.globalAlpha = 1;
    }
    const orb = L.main.orb, ox = W * 0.78, oy = ground * 0.28;
    if (orb === "sun") { disc(ox, oy, 9, "#fff3b0"); disc(ox, oy, 7, "#ffe27a"); }
    if (orb === "moon") { disc(ox, oy, 8, "#f2efd8"); disc(ox + 3, oy - 2, 2, "#d8d3b8"); disc(ox - 3, oy + 3, 1, "#d8d3b8"); }
    if (orb === "earth") { disc(ox, oy, 9, "#2f7fd6"); disc(ox - 3, oy - 2, 3, "#4fb04a"); disc(ox + 4, oy + 3, 2, "#4fb04a"); px(ox - 6, oy - 7, 6, 1, "#ffffff"); }
    if (orb === "synth") {
      for (let y = -14; y <= 14; y++) {
        if (y > 2 && (y + Math.floor(t * 4)) % 4 === 0) continue;
        const w = Math.floor(Math.sqrt(196 - y * y));
        px(ox - w, oy + 6 + y, w * 2, 1, mix("#ffe066", "#ff3fd8", (y + 14) / 28));
      }
    }
    if (!L.stars || L.stars < 0.8) {
      ctx.globalAlpha = 1 - (L.stars || 0);
      for (let i = 0; i < 9; i++) {
        const s = 0.5 + rnd(i, 3), w = 18 + rnd(i, 4) * 22, y = 8 + rnd(i, 5) * 45;
        const x = ((i * 90 - camX * 0.1 * s + t * 2 * s) % (W + 80) + W + 80) % (W + 80) - 40;
        const col = L.main.deco === "candy" ? "#ffffff" : L.main.deco === "neon" ? "#ff7ae0" : "#ffffff";
        px(x, y, w, 4, col); px(x + 4, y - 3, w - 10, 3, col);
      }
      ctx.globalAlpha = 1;
    }
  }
  function drawHills(L) {
    const layers = [[0.15, ground - 18, 10, L.far], [0.35, ground - 8, 6, L.near]];
    for (const [par, base, amp, col] of layers) {
      ctx.fillStyle = col;
      for (let x = 0; x < W; x++) {
        const wx = x + camX * par;
        const h = (Math.sin(wx / 37) * amp + Math.sin(wx / 13) * amp * 0.3) * L.amp + (L.amp > 2 ? Math.abs(Math.sin(wx / 21)) * 10 : 0);
        const top = Math.round(base - h);
        ctx.fillRect(x, top, 1, ground - top);
        if (L.amp > 2 && h > amp * 1.5) { ctx.fillStyle = "#ffffff"; ctx.fillRect(x, top, 1, 2); ctx.fillStyle = col; }
      }
    }
    if (L.main.deco === "beach") for (let i = 0; i < 25; i++) if (Math.sin(t * 3 + i * 7) > 0.7) px(rnd(i, 9) * W, ground - 3 - rnd(i, 8) * 12, 2, 1, "#ffffff");
    if (L.main.deco === "neon") for (let i = 0; i < 26; i++) {
      const bw = 8 + rnd(i, 1) * 14, bh = 14 + rnd(i, 2) * 34, bx = ((i * 26 - camX * 0.3) % (W + 60) + W + 60) % (W + 60) - 30;
      px(bx, ground - bh, bw, bh, "#1d0838");
      for (let wy = ground - bh + 3; wy < ground - 3; wy += 4) for (let wx = bx + 2; wx < bx + bw - 2; wx += 3)
        if (rnd(i * 97 + wx * 3 + wy, 4) > 0.55) px(wx, wy, 1, 2, rnd(wx + wy, 5) > 0.5 ? "#ff3fd8" : "#5ee6f0");
    }
  }
  function drawGround(L) {
    px(0, ground, W, H - ground, L.g1);
    const stripe = 10 * PPM;
    for (let x = -((camX % (stripe * 2)) + stripe * 2); x < W; x += stripe * 2) px(x, ground + 1, stripe, 13, L.g2);
    px(0, ground, W, 1, L.top);
    px(0, ground + 14, W, H - ground - 14, L.dirt);
    for (let x = -((camX * 1.6) % 24); x < W; x += 24) px(x, ground + 18 + ((x / 24) % 2) * 6, 6, 1, L.line);
    if (L.grid > 0.05) { // synthwave floor
      ctx.globalAlpha = L.grid;
      for (let k = 1; k < 12; k++) px(0, ground + 1 + k * k * 0.9, W, 1, "#ff3fd8");
      const vp = W / 2;
      for (let i = -20; i <= 20; i++) {
        const x0 = vp + i * 6 - ((camX * 0.5) % 6), x1 = vp + (x0 - vp) * 8;
        for (let s = 0; s <= 1; s += 0.02) px(x0 + (x1 - x0) * s, ground + 1 + s * (H - ground), 1, 1, "#5ee6f0");
      }
      ctx.globalAlpha = 1;
    }
  }
  function drawSigns() {
    const first = Math.floor(camX / (25 * PPM)) * 25;
    for (let m = Math.max(0, first); m * PPM - camX < W + 40; m += 25) {
      const sx = Math.round(m * PPM - camX); if (sx < -30) continue;
      const label = m + "m", w = label.length * 4 + 3;
      px(sx, ground - 10, 1, 12, "#6b4a2b");
      px(sx - (w >> 1), ground - 18, w, 9, m % 100 === 0 ? "#ffd166" : "#f7f1e3");
      px(sx - (w >> 1), ground - 18, w, 1, "#6b4a2b");
      text(label, sx - (w >> 1) + 2, ground - 16, "#1b2235");
    }
  }
  const GLYPH = { 0: "111101101101111", 1: "010110010010111", 2: "111001111100111", 3: "111001111001111", 4: "101101111001001", 5: "111100111001111", 6: "111100111101111", 7: "111001010010010", 8: "111101111101111", 9: "111101111001111", m: "000000111111101" };
  function text(str, x, y, col) { ctx.fillStyle = col; [...str].forEach((ch, n) => { const g = GLYPH[ch]; if (g) for (let i = 0; i < 15; i++) if (g[i] === "1") ctx.fillRect(x + n * 4 + (i % 3), y + ((i / 3) | 0), 1, 1); }); }

  /* scenery props, chosen by the biome where each one stands */
  const DECO = {
    meadow(x, g, r) {
      if (r < 0.35) { px(x, g - 9, 2, 9, "#6b4a2b"); disc(x + 1, g - 13, 6, "#3f8a3a"); disc(x - 1, g - 15, 3, "#56a64a"); }
      else if (r < 0.65) disc(x, g - 2, 3, "#3f7f33");
      else for (let i = 0; i < 4; i++) { px(x + i * 3, g - 3, 1, 3, "#3f7f33"); px(x + i * 3 - 1, g - 4, 3, 1, ["#ff5c8a", "#ffd166", "#ffffff", "#b48cff"][i]); }
    },
    beach(x, g, r) {
      if (r < 0.4) { for (let i = 0; i < 16; i++) px(x + Math.sin(i / 5) * 2, g - i, 2, 1, "#8a6236"); [-1, 1].forEach((d) => { for (let i = 0; i < 7; i++) px(x + 1 + d * i, g - 16 + Math.abs(i - 3) * 0.6, 1, 1, "#2f8f3a"); }); px(x - 1, g - 17, 4, 2, "#2f8f3a"); }
      else if (r < 0.7) { px(x, g - 12, 1, 12, "#ffffff"); for (let i = -6; i <= 6; i++) px(x + i, g - 13 + Math.abs(i) * 0.4, 1, 2, Math.floor((i + 6) / 3) % 2 ? "#ff5c8a" : "#ffffff"); }
      else { px(x, g - 2, 3, 2, "#ffb3c8"); px(x + 5, g - 1, 2, 1, "#ffffff"); }
    },
    autumn(x, g, r) {
      if (r < 0.5) { px(x, g - 10, 2, 10, "#5a3a20"); disc(x + 1, g - 14, 6, r < 0.25 ? "#d9541e" : "#e8a02a"); disc(x - 2, g - 16, 3, "#c43d1a"); }
      else if (r < 0.75) { disc(x, g - 3, 3, "#f08a24"); px(x, g - 7, 1, 2, "#3f6b2f"); }
      else { px(x, g - 3, 1, 3, "#f7f1e3"); px(x - 2, g - 5, 5, 2, "#d93a3a"); px(x - 1, g - 5, 1, 1, "#ffffff"); }
    },
    desert(x, g, r) {
      if (r < 0.45) { px(x, g - 14, 3, 14, "#3f8a4a"); px(x - 3, g - 9, 3, 2, "#3f8a4a"); px(x - 3, g - 12, 1, 4, "#3f8a4a"); px(x + 3, g - 7, 3, 2, "#3f8a4a"); px(x + 5, g - 11, 1, 5, "#3f8a4a"); }
      else if (r < 0.7) disc(x, g - 2, 3, "#b98a52");
      else { const tx = x + ((t * 20) % 60) - 30; disc(tx, g - 3, 3, "#a87a44"); }
    },
    snow(x, g, r) {
      if (r < 0.55) { px(x, g - 3, 2, 3, "#5a3a20"); for (let i = 0; i < 4; i++) { px(x - 6 + i * 1.5, g - 6 - i * 4, 14 - i * 3, 4, "#2f6b52"); px(x - 6 + i * 1.5, g - 6 - i * 4, 14 - i * 3, 1, "#ffffff"); } }
      else if (r < 0.75) { disc(x, g - 4, 4, "#ffffff"); disc(x, g - 10, 3, "#ffffff"); px(x - 1, g - 11, 1, 1, "#1b2235"); px(x + 1, g - 11, 1, 1, "#1b2235"); px(x + 1, g - 10, 2, 1, "#f08a24"); px(x - 3, g - 14, 7, 1, "#1b2235"); px(x - 2, g - 17, 5, 3, "#1b2235"); }
    },
    night(x, g, r) {
      if (r < 0.35) { px(x, g - 18, 1, 18, "#2b2b3b"); px(x - 2, g - 19, 5, 2, "#2b2b3b"); ctx.globalAlpha = 0.25 + 0.1 * Math.sin(t * 3); disc(x, g - 16, 6, "#ffd166"); ctx.globalAlpha = 1; px(x - 1, g - 17, 3, 2, "#fff3b0"); }
      else if (r < 0.65) { px(x - 3, g - 8, 7, 8, "#3a4256"); px(x - 2, g - 9, 5, 1, "#3a4256"); }
      else { px(x, g - 3, 1, 3, "#c9e4ff"); disc(x, g - 4, 2, "#7af0ff"); }
    },
    neon(x, g, r) {
      if (r < 0.4) { for (let i = 0; i < 18; i++) px(x + Math.sin(i / 5) * 2, g - i, 1, 1, "#ff3fd8"); for (let i = 0; i < 7; i++) { px(x + i, g - 18 + i * 0.5, 1, 1, "#5ee6f0"); px(x - i, g - 18 + i * 0.5, 1, 1, "#5ee6f0"); } }
      else if (r < 0.6) { px(x - 4, g - 12, 9, 6, "#0c0216"); px(x - 4, g - 12, 9, 1, "#5ee6f0"); px(x - 4, g - 7, 9, 1, "#5ee6f0"); px(x, g - 6, 1, 6, "#5ee6f0"); }
    },
    candy(x, g, r) {
      if (r < 0.4) { px(x, g - 14, 1, 14, "#ffffff"); disc(x, g - 17, 5, "#ff5c8a"); disc(x, g - 17, 3, "#ffd166"); disc(x, g - 17, 1, "#5ee6f0"); }
      else if (r < 0.7) { for (let i = 0; i < 14; i++) px(x, g - i, 2, 1, i % 4 < 2 ? "#ff3f5a" : "#ffffff"); px(x + 2, g - 15, 2, 1, "#ff3f5a"); px(x + 4, g - 14, 1, 3, "#ffffff"); }
      else disc(x, g - 3, 3, ["#7ee081", "#b48cff", "#ffd166"][Math.floor(r * 30) % 3]);
    },
    moon(x, g, r) {
      if (r < 0.35) { px(x - 6, g + 2, 13, 2, "#6e6e7a"); px(x - 4, g + 1, 9, 1, "#5d5d69"); }
      else if (r < 0.5) { px(x, g - 14, 1, 14, "#cccccc"); px(x + 1, g - 14, 7, 4, "#ff5c8a"); px(x + 1, g - 12, 7, 1, "#ffffff"); }
      else if (r < 0.7) disc(x, g - 2, 3, "#7a7a86");
    },
  };
  function drawDeco() {
    const step = 22, k0 = Math.floor((camX - 40) / step);
    for (let k = k0; k * step - camX < W + 40; k++) {
      const wx = k * step + rnd(k, 7) * 10; if (wx < 60) continue;
      const r = rnd(k, 8); if (r > 0.82) continue;
      const b = B[biomeIdx(wx / PPM)];
      DECO[b.deco](Math.round(wx - camX), ground, r / 0.82);
    }
  }
  function drawThread() {
    const sx = Math.max(0, -camX), ex = Math.min(W, yarnX - camX);
    if (ex > sx) px(sx, ground - 1, ex - sx, 1, "#ff5c8a");
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
    const x = Math.round(catX - camX), y = ground - 10 - Math.round(Math.sin(Math.min(1, jump) * Math.PI) * 9);
    if (running || jump > 0) { const bob = catFrame ? 1 : 0; sprite(BODY, x - 20, y + bob); sprite(LEGS[jump > 0 ? 0 : catFrame], x - 20, y + 8 + bob); }
    else { const tail = Math.sin(t * 4) > 0; sprite(tail ? SIT.map((r, j) => (j === 6 || j === 7 ? "." + r.slice(1).replace(/^\.o/, "o.") : r)) : SIT, x - 20, y); }
  }

  /* particles */
  function burst(lvl) {
    const n = [0, 6, 16, 30, 60][lvl] || 0, cx = yarnX, cy = ground - 6;
    const cols = lvl >= 4 ? ["#ff5c8a", "#5ee6f0", "#ffd166", "#b48cff", "#ffffff"] : ["#ffd166", "#ffffff", "#5ee6f0"];
    for (let i = 0; i < n; i++) parts.push({ w: 1, x: cx, y: cy, vx: (Math.random() - 0.5) * 90, vy: -30 - Math.random() * 70, g: 120, life: 1 + Math.random(), c: cols[i % cols.length], s: Math.random() < 0.3 ? 2 : 1 });
    if (lvl >= 4) shake = 0.5;
  }
  function weather(L) {
    const fx = L.main.fx;
    if (fx === "snow" && Math.random() < 0.6) parts.push({ x: Math.random() * W, y: -2, vx: -6, vy: 14 + Math.random() * 10, g: 0, life: 6, c: "#ffffff", s: 1, wob: 1 });
    if (fx === "leaves" && Math.random() < 0.12) parts.push({ x: Math.random() * W, y: -2, vx: -10, vy: 12, g: 0, life: 6, c: ["#e8a02a", "#d9541e", "#c43d1a"][Math.floor(Math.random() * 3)], s: 2, wob: 2 });
    if (fx === "fireflies" && Math.random() < 0.08) parts.push({ x: Math.random() * W, y: ground - Math.random() * 30, vx: (Math.random() - 0.5) * 6, vy: -2, g: 0, life: 3, c: "#e8ff7a", s: 1, glow: 1 });
    if (fx === "sparkle" && Math.random() < 0.15) parts.push({ x: Math.random() * W, y: Math.random() * ground, vx: 0, vy: 0, g: 0, life: 0.6, c: "#ffffff", s: 1 });
  }
  function drawParts(dt) {
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      p.life -= dt; if (p.life <= 0 || p.y > H) { parts.splice(i, 1); continue; }
      p.vy += (p.g || 0) * dt; p.x += (p.vx + (p.wob ? Math.sin(t * 3 + i) * 8 * p.wob : 0)) * dt; p.y += p.vy * dt;
      if (p.w && p.y > ground - 1) { p.y = ground - 1; p.vy *= -0.4; p.vx *= 0.6; }
      const sx = p.w ? p.x - camX : p.x;
      ctx.globalAlpha = Math.min(1, p.life * (p.glow ? 0.7 + 0.3 * Math.sin(t * 8 + i) : 1));
      px(sx, p.y, p.s, p.s, p.c);
    }
    ctx.globalAlpha = 1;
  }

  let last = performance.now();
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000); last = now; t += dt;
    if (rollT < 1) {
      rollT = Math.min(1, rollT + dt / rollDur);
      const e = 1 - Math.pow(1 - rollT, 3), nx = yarnFrom + (yarnTo - yarnFrom) * e;
      if (nx - yarnX > 0.8 && Math.random() < 0.6) parts.push({ w: 1, x: yarnX - 5, y: ground - 1, vx: -10 - Math.random() * 10, vy: -8 - Math.random() * 6, g: 30, life: 0.5, c: "rgba(255,255,255,.7)", s: 1 });
      spin += (nx - yarnX) / 6; yarnX = nx;
      if (rollT >= 1) { if (pendingFx >= 0) burst(pendingFx); pendingFx = -1; if (pendingFloat) { floater(...pendingFloat); pendingFloat = null; } }
    }
    const dx = yarnX - 14 - catX;
    running = Math.abs(dx) > 1.5;
    if (running) { catX += Math.sign(dx) * Math.min(Math.abs(dx), Math.max(40, Math.abs(dx) * 2.2) * dt); catFrame = Math.floor(t * 12) % 2; if (Math.abs(yarnX - 14 - catX) <= 1.5 && rollT >= 1 && rollDur > 0.3) jump = 0.001; }
    if (jump > 0) { jump += dt * 2.2; if (jump >= 1) jump = 0; }
    camX += (Math.max(0, yarnX - W * 0.6) - camX) * Math.min(1, dt * 3);

    const L = look((camX + W * 0.5) / PPM);
    const bi = biomeIdx(yarnX / PPM);
    if (bi !== lastBiome) { if (lastBiome !== -1 && rollT < 1) banner(B[bi].name); lastBiome = bi; }
    ctx.save();
    if (shake > 0) { shake -= dt; ctx.translate(Math.round((Math.random() - 0.5) * 4), Math.round((Math.random() - 0.5) * 3)); }
    drawSky(L); drawHills(L); drawGround(L); weather(L); drawDeco(); drawSigns(); drawThread(); drawYarn(); drawCat(); drawParts(dt);
    ctx.restore();
    requestAnimationFrame(frame);
  }
  addEventListener("resize", resize); resize();
  requestAnimationFrame(frame);
  return {
    jumpTo(m) { pendingFloat = null; pendingFx = -1; yarnX = yarnFrom = yarnTo = 40 + m * PPM; catX = yarnX - 14; camX = Math.max(0, yarnX - W * 0.6); rollT = 1; lastBiome = biomeIdx(yarnX / PPM); parts.length = 0; },
    rollTo(totalM, gained, lvl = -1) {
      yarnFrom = yarnX; yarnTo = 40 + totalM * PPM; rollT = 0;
      rollDur = gained ? Math.max(0.5, Math.min(2.8, 0.5 + gained / 55)) : 0.01;
      pendingFx = lvl;
      pendingFloat = gained ? [`+${gained}m`, lvl >= 0 ? TIERS[lvl].cls : ""] : null;
    },
    yarnScreen() { return { x: (yarnX - camX) * PX, y: (ground - 8) * PX }; },
  };
if (location.hash === "#debug") window.meow = { scene, getPrompt, findAnswer, usePack, get DATA() { return DATA; }, get game() { return game; } };
})();

/* ---------- wiring ---------- */
$("answerForm").addEventListener("submit", submit);
$("btnNext").addEventListener("click", () => { game.round++; nextRound(); });
$("btnSkip").addEventListener("click", () => resolve(null, "skip"));
$("btnBack").addEventListener("click", quitToTitle);
$("btnDaily").addEventListener("click", () => start("daily"));
$("btnUnlimited").addEventListener("click", () => { store.del(K("save:unlimited")); start("unlimited"); });
$("btnResume").addEventListener("click", () => { const s = store.get(K("save:unlimited")); if (s) resume(s); });
const setButtons = (on) => ["btnDaily", "btnUnlimited", "btnResume"].forEach((b) => ($(b).disabled = !on));
document.querySelectorAll(".packtab").forEach((b) => b.addEventListener("click", () => {
  if (b.dataset.pack === PACK && DATA) return;
  setButtons(false); DATA = null; PACK = b.dataset.pack; renderTitle();
  usePack(b.dataset.pack).then(() => { setButtons(true); renderTitle(); }).catch(() => ($("count").textContent = "couldn't load this pack"));
}));
$("btnAgain").addEventListener("click", () => { if (game && game.pack && game.pack !== PACK) { usePack(game.pack).then(() => start("unlimited")); } else start("unlimited"); });
$("btnHome").addEventListener("click", () => { renderTitle(); show("title"); });
$("btnShare").addEventListener("click", share);
document.addEventListener("keydown", (e) => {
  const playing = $("play").classList.contains("active");
  if (e.key === "Escape" && playing) { e.preventDefault(); quitToTitle(); }
  if (e.key === "Enter" && playing && !$("result").classList.contains("hidden") && document.activeElement !== $("btnNext")) { e.preventDefault(); $("btnNext").click(); }
});
addEventListener("pagehide", () => { if ($("play").classList.contains("active")) persist(); });
document.addEventListener("visibilitychange", () => { if (document.hidden && $("play").classList.contains("active")) persist(); });

setButtons(false);
renderTitle();
usePack(PACK).then(() => {
  $("loading").remove();
  setButtons(true);
  scene.jumpTo(0);
  renderTitle();
}).catch((e) => { console.error(e); $("loading").textContent = "couldn't load prompts. If you opened index.html directly, run a local server (see README)."; });
if (location.hash === "#debug") window.meow = { scene, getPrompt, findAnswer, usePack, get DATA() { return DATA; }, get game() { return game; } };
})();
