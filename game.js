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
// "part two" / "ii" / "2" all mean the same; "ocean's twelve" == "oceans 12"
const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13 };
const ROMAN = { ii: 2, iii: 3, iv: 4, v: 5, vi: 6, vii: 7, viii: 8, ix: 9 };
function canon(k) {
  const w = k.split(" ").filter((x) => !["part", "chapter", "episode", "vol", "volume", "pt"].includes(x));
  return w.map((x, i) => (i > 0 && (NUMW[x] || (ROMAN[x] && (x !== "v" || i === w.length - 1)))) ? String(NUMW[x] || ROMAN[x]) : x).join(" ");
}
function indexOf(p) {
  if (p.idx) return p.idx;
  p.idx = new Map();
  const add = (k, i) => { for (const v of [k, k.replace(/ /g, ""), canon(k)]) if (!p.idx.has(v)) p.idx.set(v, i); };
  p.answers.forEach((a, i) => add(norm(a.a), i));            // exact titles win over aliases
  p.answers.forEach((a, i) => keysOf(a).forEach((k) => add(k, i)));
  return p.idx;
}
const digits = (s) => (s.match(/\d+/g) || []).join(",");
function findAnswer(p, raw) {
  const idx = indexOf(p), k = norm(raw);
  if (!k) return null;
  for (const t of [k, k.replace(/ /g, ""), canon(k), k.replace(/es$/, ""), k.replace(/s$/, ""), k + "s", k.replace(/ies$/, "y")])
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

/* ---------- packs: an index plus one file per prompt, loaded only when played ---------- */
const PACKS = {
  classic: { dir: "data/classic", name: "CLASSIC", pfx: "", tag: "THE DAILY CHASE" },
  movies: { dir: "data/movies", name: "🎬 MOVIES", pfx: "movies:", tag: "MOVIE NIGHT" },
};
let PACK = store.get("pack", "classic"); if (!PACKS[PACK]) PACK = "classic";
const K = (k, pack = PACK) => PACKS[pack].pfx + k; // per-pack storage key
const LOADED = {};
let DATA = null, BASE_IDS = [], TOTAL_ANSWERS = 0, cache = new Map();

function buildPool(d) {
  return { DATA: d, BASE_IDS: d.prompts.map((_, i) => String(i)), TOTAL_ANSWERS: d.total, cache: new Map() };
}
function usePack(name) {
  PACK = name; store.set("pack", name);
  const apply = (pool) => ({ DATA, BASE_IDS, TOTAL_ANSWERS, cache } = pool);
  if (LOADED[name]) { apply(LOADED[name]); return Promise.resolve(); }
  return fetch(PACKS[name].dir + "/index.json").then((r) => r.json()).then((d) => { LOADED[name] = buildPool(d); if (PACK === name) apply(LOADED[name]); });
}
function getPrompt(id) { return cache.get(id); }
const validIds = (ids) => Array.isArray(ids) && ids.every((id) => /^\d+$/.test(id) && +id < BASE_IDS.length);
function loadPrompts(ids) {
  const dir = PACKS[PACK].dir, c = cache;
  return Promise.all(ids.filter((id) => validIds([id]) && !c.has(id)).map((id) =>
    fetch(`${dir}/${id}.json`).then((r) => r.json()).then((p) => c.set(id, { id, q: p.q, answers: p.answers }))));
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
  return shuffle(BASE_IDS, r).slice(0, ROUNDS);
}
function pickUnlimited() {
  let deck = store.get(K("deck"), []);
  if (!Array.isArray(deck) || deck.some((i) => !BASE_IDS.includes(i))) deck = [];
  const out = [];
  while (out.length < ROUNDS) {
    if (!deck.length) deck = shuffle(BASE_IDS).filter((i) => !out.includes(i));
    out.push(deck.shift());
  }
  store.set(K("deck"), deck);
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

async function start(mode) {
  if (mode === "daily") {
    const done = store.get(K("daily:" + today()));
    if (done) { game = done; await loadPrompts(game.ids || []); scene.jumpTo(0); scene.rollTo(game.total, 0); return showEnd(); }
    const saved = store.get(K("save:daily:" + today()));
    if (saved && validIds(saved.ids)) return resume(saved);
    game = { pack: PACK, mode, day: today(), ids: pickDaily(), round: 0, results: [], total: 0, startM: 0, remaining: SECONDS * 1000 };
  } else {
    const journey = store.get(K("journey"), 0);
    game = { pack: PACK, mode, day: today(), ids: pickUnlimited(), round: 0, results: [], total: 0, startM: journey, remaining: SECONDS * 1000 };
  }
  await loadPrompts(game.ids);
  scene.jumpTo(game.startM);
  enterPlay();
  nextRound();
}
async function resume(saved) {
  if (!validIds(saved.ids)) { store.del(saveKey(saved)); return start(saved.mode); } // from an older version
  game = saved;
  await loadPrompts(game.ids);
  scene.jumpTo(game.startM); scene.rollTo(game.startM + game.total, 0);
  enterPlay();
  if (game.results.length > game.round) { game.round++; game.remaining = SECONDS * 1000; }
  nextRound(Math.max(3000, game.remaining || 0));
}
function enterPlay() {
  scene.setTheme(game.pack || "classic");
  $("mode").textContent = (game.pack === "movies" ? "🎬 " : "") + (game.mode === "daily" ? `DAILY #${dayNum(game.day)}` : "UNLIMITED");
  $("dist").textContent = fmt(game.total);
  paused = false;
  show("play");
}

function nextRound(ms = SECONDS * 1000) {
  if (game.round >= ROUNDS) return finish();
  const p = getPrompt(game.ids[game.round]);
  $("round").textContent = `${game.round + 1} / ${ROUNDS}`;
  $("prompt").textContent = p.q;
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
    $("feedback").textContent = `“${raw.trim()}” isn't on our list. Try another!`;
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
  updateSubmit();
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
  scene.setTheme(PACK);
  document.querySelectorAll(".packtab").forEach((b) => b.classList.toggle("on", b.dataset.pack === PACK));
  $("tagline").textContent = PACKS[PACK].tag;
  const st = store.get(K("stats"), null), ub = store.get(K("unlimitedBest"), 0), jr = store.get(K("journey"), 0);
  const parts = [];
  if (st) parts.push(`streak ${st.streak} · daily best ${fmt(st.best)} m`);
  if (ub) parts.push(`unlimited best ${fmt(ub)} m · journey ${fmt(jr)} m`);
  $("stats").textContent = parts.join("  ·  ");
  $("count").textContent = DATA ? `${fmt(BASE_IDS.length)} prompts · ${fmt(TOTAL_ANSWERS)} answers` : "loading…";

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

/* ======================= CAT LOOKS ======================= */
const COATS = {
  ginger: { name: "Ginger", o: "#f29b38", d: "#c4661c", w: "#fff4e0" },
  black: { name: "Black", o: "#2a2a33", d: "#1d1d25", w: "#2a2a33", k: "#ffd166" },
  white: { name: "White", o: "#f5f2ea", d: "#e2ddd0", w: "#ffffff", k: "#4fb3ff" },
  grey: { name: "Grey", o: "#8b95a7", d: "#6a7388", w: "#cfd5df" },
  tuxedo: { name: "Tuxedo", o: "#26262e", d: "#26262e", w: "#ffffff", k: "#9be15d" },
  calico: { name: "Calico", o: "#fbf6ee", d: "#f29b38", w: "#ffffff", patch: "#2a2a33" },
  tortie: { name: "Tortie", o: "#3a2a22", d: "#c4661c", w: "#3a2a22", patch: "#d9822b", k: "#ffd166" },
  brown: { name: "Brown tabby", o: "#9b7653", d: "#5e4430", w: "#e8dccb" },
  silver: { name: "Silver tabby", o: "#c9ccd3", d: "#5b6170", w: "#eef0f4" },
  cream: { name: "Cream", o: "#f1d7a6", d: "#d9b47a", w: "#fff6e6" },
  chocolate: { name: "Chocolate", o: "#6b4430", d: "#4a2e20", w: "#8a6048" },
  lilac: { name: "Lilac", o: "#bfb0bd", d: "#9c8d9a", w: "#e6dde4" },
  galaxy: { name: "Galaxy ✨", o: "#4b3fa8", d: "#ff5c8a", w: "#5ee6f0", k: "#ffd166" },
};
const BREEDS = {
  shorthair: { name: "Shorthair" },
  mainecoon: { name: "Maine Coon", tufts: 1, fluffyTail: 1, fluff: 1 },
  persian: { name: "Persian", fluff: 1, folded: 1, fluffyTail: 1 },
  scottishfold: { name: "Scottish Fold", folded: 1 },
  siamese: { name: "Siamese", bigEars: 1, points: 1 },
  bengal: { name: "Bengal", spots: 1 },
  sphynx: { name: "Sphynx", bigEars: 1, skin: { o: "#e9b9a9", d: "#d79e8e", w: "#f4d3c8" } },
  munchkin: { name: "Munchkin", shortLegs: 1 },
};

/* ======================= SCENE ======================= */
const scene = (() => {
  const cv = $("scene"), ctx = cv.getContext("2d");
  let PX = 3; const PPM = 2, CYCLE = 1500;
  let W = 0, H = 0, ground = 0, t = 0;
  let yarnX = 40, yarnFrom = 40, yarnTo = 40, rollT = 1, rollDur = 1, spin = 0, pendingFx = -1, pendingFloat = null;
  let catX = 26, camX = 0, catFrame = 0, running = false, jump = 0, shake = 0, lastBiome = -1;
  const parts = [];

  /* biomes: every 1500 m the world loops */
  const B_CLASSIC = [
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
  // the Movies pack runs through Hollywood instead
  const B_MOVIES = [
    { at: 0, name: "MEOWLYWOOD HILLS", sky: ["#f7a26b", "#ffe3b3"], far: "#c98a5e", near: "#a8704a", g1: "#c9a66b", g2: "#d4b47a", top: "#e8cf95", dirt: "#9c7a4a", line: "#86683d", amp: 1.3, stars: 0, orb: "sun", deco: "hwHills", sign: 1 },
    { at: 150, name: "THE RED CARPET", sky: ["#1a0f2e", "#4a2350"], far: "#2a1838", near: "#22122e", g1: "#b3122e", g2: "#c8173a", top: "#ffd166", dirt: "#3a0a14", line: "#ffd166", amp: 0, stars: 0.5, orb: "none", deco: "carpet", fx: "flash", beams: 1, facade: 1 },
    { at: 300, name: "STUDIO LOT", sky: ["#7fc4ea", "#e6f3f8"], far: "#d9cdb3", near: "#c4b597", g1: "#8f8f8f", g2: "#9a9a9a", top: "#b5b5b5", dirt: "#6e6e6e", line: "#ffd166", amp: 0, stars: 0, orb: "sun", deco: "studio", stages: 1 },
    { at: 450, name: "WALK OF FAME", sky: ["#ff9a76", "#ffd9a8"], far: "#7a5a8a", near: "#5c4470", g1: "#c9c3c0", g2: "#d3cdca", top: "#e6e1de", dirt: "#a9a3a0", line: "#ff7aa2", amp: 0.2, stars: 0, orb: "sun", deco: "walk", walkStars: 1 },
    { at: 600, name: "THE DRIVE-IN", sky: ["#0b1033", "#2c2a5a"], far: "#1d2347", near: "#151a38", g1: "#2b2b33", g2: "#303039", top: "#4a4a55", dirt: "#1c1c22", line: "#ffd166", amp: 0.3, stars: 1, orb: "moon", deco: "drivein", screen: 1 },
    { at: 750, name: "WILD WEST SET", sky: ["#f6a64e", "#ffe4a8"], far: "#d08a4c", near: "#b8743c", g1: "#d9a865", g2: "#e2b574", top: "#efc98e", dirt: "#b98a4e", line: "#a57a43", amp: 0.6, stars: 0, orb: "sun", deco: "western" },
    { at: 900, name: "SCI-FI SOUNDSTAGE", sky: ["#05051a", "#1b1240"], far: "#2a2050", near: "#1f1840", g1: "#2e2e48", g2: "#35355a", top: "#5ee6f0", dirt: "#1a1a2e", line: "#5ee6f0", amp: 0.4, stars: 1, orb: "planet", deco: "scifi", grid: 0.6 },
    { at: 1100, name: "MOVIE PALACE", sky: ["#2a0d1e", "#5a1838"], far: "#3a1228", near: "#2c0d1e", g1: "#5a1a2a", g2: "#661f31", top: "#ffd166", dirt: "#2a0a14", line: "#ffd166", amp: 0, stars: 0.4, orb: "none", deco: "palace", fx: "popcorn", marquee: 1 },
    { at: 1300, name: "PREMIERE NIGHT", sky: ["#05081c", "#1e2a5a"], far: "#141c3e", near: "#0f1530", g1: "#1a1a26", g2: "#20202e", top: "#ffd166", dirt: "#101018", line: "#ffd166", amp: 0, stars: 1, orb: "none", deco: "premiere", beams: 1, fx: "flash" },
  ];
  const THEMES = { classic: B_CLASSIC, movies: B_MOVIES };
  let B = B_CLASSIC, theme = "classic";
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
  let CAT = null; // built below by buildCat()
  const BODY = ["o..............o..o.", "o.............oooooo", ".o............okooko", ".o............ooowpo", "..o.ddoddoddooowwwo.", "..ooooooooooooowww..", "...ooodoodoodoooo...", "...oooooooooooooo..."];
  const LEGS = [["..oo..........oo....", ".oo............oo..."], ["....oo......oo......", "....oo......oo......"]];
  const SIT = ["...............o..o.", "..............oooooo", "..............okooko", "..............ooowpo", "............oooowwwo", "..o.......ooodoowww.", ".o.......oooodooww..", ".o......ooooooooo...", "..oo....ooo.oo.oo...", "....ooooooo.oo.oo..."];
  const sprite = (rows, x, y) => rows.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const c = catColour(CAT, r[i], i, j); if (c) { ctx.fillStyle = c; ctx.fillRect(x + i, y + j, 1, 1); } } });
  function catColour(c, ch, i, j) {
    const col = c.pal[ch];
    if (!col) return null;
    if (c.patch && ch === "o" && ((i >> 2) + (j >> 1)) % 3 === 0) return c.patch; // calico / tortie patches
    return col;
  }
  const addRow = (rows, cols, ch) => [cols.reduce((r, c) => r.slice(0, c) + ch + r.slice(c + 1), ".".repeat(rows[0].length))].concat(rows);
  function buildCat(cfg) {
    cfg = cfg || {};
    const coat = Object.assign({}, PAL, COATS[cfg.coat] || COATS.ginger);
    const br = BREEDS[cfg.breed] || BREEDS.shorthair;
    if (br.skin) Object.assign(coat, br.skin);
    let body = BODY.slice(), sit = SIT.slice(), legs = LEGS.map((f) => f.slice()), top = 0;
    const map = (rows, fn) => rows.map((r, j) => [...r].map((ch, i) => fn(ch, i, j, rows)).join(""));
    if (br.folded) { body = map(body, (ch, i, j) => (j === 0 && i > 10 ? "." : ch)); sit = map(sit, (ch, i, j) => (j === 0 ? "." : ch)); }
    if (br.points) {
      body = map(body, (ch, i, j) => (ch === "o" && (j === 0 || i < 3 || (j === 3 && i > 14)) ? "d" : ch));
      sit = map(sit, (ch, i, j) => (ch === "o" && (j === 0 || (i < 3 && j > 4) || (j === 3 && i > 14) || j >= 8) ? "d" : ch));
      legs = legs.map((f) => f.map((r) => r.replace(/o/g, "d")));
    }
    if (br.spots) {
      const sp = (ch, i, j) => (ch === "d" ? "o" : ch === "o" && j >= 4 && i > 2 && i < 15 && (i * 3 + j * 2) % 5 === 0 ? "d" : ch);
      body = map(body, sp); sit = map(sit, (ch, i, j) => (j >= 5 && i < 12 ? sp(ch, i, j) : ch === "d" ? "o" : ch));
    }
    if (br.fluff) {
      const grow = (rows, from) => map(rows, (ch, i, j, rs) => (ch === "." && j >= from && j < rs.length - 1 && (rs[j][i - 1] === "o" || rs[j][i + 1] === "o") ? "o" : ch));
      body = grow(body, 4); sit = grow(sit, 4);
    }
    if (br.fluffyTail) {
      body = map(body, (ch, i, j, rs) => (ch === "." && i < 4 && j < 5 && rs[j][i - 1] === "o" ? "o" : ch));
      sit = map(sit, (ch, i, j, rs) => (ch === "." && i < 3 && j > 4 && j < 9 && rs[j][i + 1] === "o" ? "o" : ch));
    }
    if (br.tufts) { body = addRow(body, [15, 18], "d"); sit = addRow(sit, [15, 18], "d"); top = 1; }
    if (br.bigEars) { body = addRow(body, [15, 18], br.points ? "d" : "o"); sit = addRow(sit, [15, 18], br.points ? "d" : "o"); top = 1; }
    if (br.shortLegs) { legs = legs.map((f) => [f[1]]); sit = sit.filter((_, j) => j !== sit.length - 2); }
    return { pal: coat, patch: (COATS[cfg.coat] || {}).patch && !br.skin ? COATS[cfg.coat].patch : null, BODY: body, SIT: sit, LEGS: legs, top };
  }
  const px = (x, y, w, h, c) => { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), w, h); };
  const disc = (cx, cy, r, c) => { ctx.fillStyle = c; for (let y = -r; y <= r; y++) { const w = Math.floor(Math.sqrt(r * r - y * y + r * 0.6)); ctx.fillRect(Math.round(cx - w), Math.round(cy + y), w * 2 + 1, 1); } };
  const rnd = (k, s = 0) => (hash("d" + k + ":" + s) % 1000) / 1000;

  CAT = buildCat(store.get("cat", {}));
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
    if (orb === "planet") { disc(ox, oy, 8, "#d9822b"); disc(ox - 2, oy - 2, 3, "#f2b36b"); for (let i = -14; i <= 14; i++) px(ox + i, oy + Math.round(i * 0.25), 1, 1, "#ffe0a3"); }
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
  function drawBeams(L) {
    if (!L.main.beams) return;
    ctx.globalAlpha = 0.13;
    for (let b = 0; b < 4; b++) {
      const bx = ((b * 160 - camX * 0.3) % (W + 160) + W + 160) % (W + 160) - 80, ang = Math.sin(t * 0.7 + b * 1.7) * 0.6;
      for (let y = 0; y < ground; y += 2) {
        const d = ground - y, cx = bx + Math.sin(ang) * d, w = 2 + d * 0.12;
        px(cx - w / 2, y, w, 2, "#fff6c2");
      }
    }
    ctx.globalAlpha = 1;
  }
  const BIG = { M: "1000111011101011000110001", E: "111100111100111", O: "111101101101111", W: "1000110001101011101110001", L: "100100100100111", Y: "101101010010010", D: "110101101101110",
    N: "101111111111101", S: "111100111001111", H: "101101111101101", I: "111010010010111", G: "111100101101111", T: "111010010010010", A: "111101111101101", R: "110101110101101", C: "111100100100111", P: "111101111100100", V: "101101101101010" };
  function bigText(str, x, y, sc, col, shadow) {
    let cx = x;
    for (const ch of str) {
      const g = BIG[ch]; if (!g) { cx += 3 * sc; continue; }
      const w = g.length / 5;
      for (let i = 0; i < g.length; i++) if (g[i] === "1") {
        if (shadow) px(cx + (i % w) * sc + 1, y + ((i / w) | 0) * sc + 1, sc, sc, shadow);
        px(cx + (i % w) * sc, y + ((i / w) | 0) * sc, sc, sc, col);
      }
      cx += (w + 1) * sc;
    }
  }
  function drawSets(L) { // big background pieces for the Hollywood biomes
    const m = L.main;
    const loop = (x0, par, w) => { const per = W + w + 20; return (((x0 - camX * par) % per) + per) % per - w; };
    if (m.sign) { const sx = loop(W * 0.45, 0.12, 140); bigText("MEOWLYWOOD", sx, ground - 44, 3, "#ffffff", "#8a5a3a"); for (let i = 0; i < 10; i++) px(sx + i * 13 + 4, ground - 29, 1, 9, "#8a5a3a"); }
    if (m.stages) for (let i = 0; i < 6; i++) {
      const bx = ((i * 110 - camX * 0.35) % (W + 120) + W + 120) % (W + 120) - 60;
      px(bx, ground - 36, 70, 36, "#e8dcc2"); px(bx - 2, ground - 40, 74, 5, "#cbbd9e"); px(bx + 25, ground - 18, 20, 18, "#8f7f63");
      bigText("", 0, 0, 1, "#000");
      text(String(i + 1), bx + 60, ground - 12, "#3a3f5a");
    }
    if (m.screen) { const sx = loop(W * 0.5, 0.12, 104); px(sx - 2, ground - 50, 104, 46, "#2a2a33"); px(sx, ground - 48, 100, 40, "#fdf7e6");
      const f = Math.floor(t * 2) % 3; ctx.globalAlpha = 0.85; px(sx + 30 + f * 4, ground - 36, 30, 16, ["#ff5c8a", "#5ee6f0", "#ffd166"][f]); disc(sx + 45 + f * 4, ground - 40, 5, "#1b2235"); ctx.globalAlpha = 1;
      px(sx + 48, ground - 8, 4, 8, "#2a2a33"); }
    if (m.facade || m.marquee) for (let i = 0; i < 5; i++) {
      const bx = ((i * 150 - camX * 0.3) % (W + 160) + W + 160) % (W + 160) - 80;
      px(bx, ground - 44, 90, 44, m.marquee ? "#4a1426" : "#2a1838"); px(bx + 10, ground - 34, 70, 14, "#ffd166"); px(bx + 12, ground - 32, 66, 10, "#1b0f1f");
      bigText(m.marquee ? "NOW SHOWING" : "PREMIERE", bx + 14, ground - 31, 1, "#ff5c8a");
      for (let k = 0; k < 18; k++) if ((k + Math.floor(t * 6)) % 3) px(bx + 10 + k * 4, ground - 36, 1, 1, "#fff6c2");
      px(bx + 36, ground - 16, 18, 16, "#1b0f1f");
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
    if (L.main.walkStars) for (let x = -((camX % 30) + 30); x < W + 30; x += 30) { px(x, ground + 3, 22, 9, "#2a2a33"); bigStar(x + 11, ground + 7, "#ff9ac2", "#ffd166"); }
    if (L.main.deco === "carpet" || L.main.deco === "premiere") { px(0, ground + 2, W, 1, "#ffd166"); px(0, ground + 13, W, 1, "#ffd166"); }
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
  function bigStar(cx, cy, fill, edge) {
    px(cx - 1, cy - 3, 3, 1, edge); px(cx - 4, cy - 2, 9, 2, fill); px(cx - 2, cy, 5, 1, fill); px(cx - 3, cy + 1, 2, 2, fill); px(cx + 2, cy + 1, 2, 2, fill); px(cx, cy - 4, 1, 1, edge);
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
  Object.assign(DECO, {
    hwHills(x, g, r) { if (r < 0.5) DECO.beach(x, g, 0.1); else if (r < 0.75) disc(x, g - 3, 4, "#9a7a4a"); else { px(x, g - 12, 1, 12, "#5a4a3a"); px(x - 4, g - 13, 9, 2, "#ffd166"); } },
    carpet(x, g, r) {
      if (r < 0.6) { for (const dx of [0, 14]) { px(x + dx, g - 9, 2, 9, "#ffd166"); px(x + dx - 1, g - 10, 4, 2, "#ffd166"); } for (let i = 0; i < 13; i++) px(x + 2 + i, g - 8 + Math.round(Math.sin((i / 12) * Math.PI) * 3), 1, 1, "#7a0f24"); }
      else { px(x, g - 12, 4, 7, "#1b1b22"); disc(x + 1, g - 14, 2, "#e9b9a9"); px(x + 3, g - 11, 3, 2, "#3a3a44"); if ((t * 3 + x) % 4 < 0.3) disc(x + 6, g - 11, 3, "#ffffff"); px(x, g - 5, 1, 5, "#1b1b22"); px(x + 3, g - 5, 1, 5, "#1b1b22"); }
    },
    studio(x, g, r) {
      if (r < 0.3) { px(x, g - 7, 7, 1, "#7a0f24"); px(x, g - 11, 1, 5, "#7a0f24"); px(x + 6, g - 11, 1, 5, "#7a0f24"); px(x + 1, g - 10, 5, 3, "#1b1b22"); px(x, g - 6, 1, 6, "#5a3a20"); px(x + 6, g - 6, 1, 6, "#5a3a20"); }
      else if (r < 0.6) { px(x - 4, g - 15, 9, 6, "#1b1b22"); disc(x - 4, g - 17, 3, "#2a2a33"); disc(x + 3, g - 17, 3, "#2a2a33"); px(x + 5, g - 13, 3, 2, "#5a5a66"); px(x, g - 9, 1, 9, "#5a5a66"); px(x - 4, g, 9, 1, "#5a5a66"); }
      else if (r < 0.8) { px(x, g - 7, 9, 6, "#1b1b22"); for (let i = 0; i < 9; i += 2) px(x + i, g - 9, 1, 2, "#ffffff"); px(x, g - 9, 9, 1, "#1b1b22"); px(x + 1, g - 5, 7, 1, "#ffffff"); }
      else { px(x, g - 16, 1, 16, "#5a5a66"); px(x - 3, g - 19, 7, 4, "#2a2a33"); ctx.globalAlpha = 0.2; disc(x + 6, g - 12, 6, "#fff6c2"); ctx.globalAlpha = 1; }
    },
    walk(x, g, r) { if (r < 0.45) DECO.beach(x, g, 0.1); else if (r < 0.7) { px(x, g - 18, 1, 18, "#2b2b3b"); px(x - 2, g - 19, 5, 2, "#2b2b3b"); disc(x, g - 16, 1, "#fff3b0"); } },
    drivein(x, g, r) {
      if (r < 0.55) { const col = ["#d93a68", "#5ee6f0", "#ffd166", "#7ee081"][Math.floor(r * 40) % 4]; px(x - 8, g - 6, 18, 4, col); px(x - 4, g - 9, 10, 3, col); px(x - 3, g - 8, 3, 2, "#9fd3ea"); px(x + 2, g - 8, 3, 2, "#9fd3ea"); disc(x - 4, g - 2, 2, "#1b1b22"); disc(x + 6, g - 2, 2, "#1b1b22"); }
      else if (r < 0.75) { px(x, g - 8, 1, 8, "#5a5a66"); px(x - 1, g - 9, 3, 3, "#8a8a99"); }
    },
    western(x, g, r) {
      if (r < 0.35) { px(x - 8, g - 20, 18, 20, "#9b6a3c"); px(x - 8, g - 20, 18, 2, "#6e4a28"); px(x - 6, g - 15, 5, 4, "#2a1a10"); px(x + 3, g - 15, 5, 4, "#2a1a10"); px(x - 2, g - 9, 6, 9, "#2a1a10"); px(x - 9, g - 10, 20, 1, "#6e4a28"); }
      else if (r < 0.6) DECO.desert(x, g, 0.1);
      else if (r < 0.8) { px(x - 3, g - 7, 7, 7, "#8a5a2c"); px(x - 3, g - 5, 7, 1, "#5a3a1a"); px(x - 3, g - 2, 7, 1, "#5a3a1a"); }
      else { const tx = x + ((t * 25) % 80) - 40; disc(tx, g - 3, 3, "#b98a52"); px(tx - 1, g - 4, 1, 1, "#8a6a3a"); }
    },
    scifi(x, g, r) {
      if (r < 0.35) { px(x, g - 8, 1, 8, "#5a5a66"); px(x - 7, g - 12, 15, 3, "#9aa3b5"); px(x - 3, g - 15, 7, 3, "#5ee6f0"); for (let i = -6; i <= 6; i += 3) px(x + i, g - 10, 1, 1, (t * 4 + i) % 2 < 1 ? "#ffd166" : "#ff5c8a"); }
      else if (r < 0.6) { px(x - 3, g - 12, 7, 7, "#9aa3b5"); px(x - 2, g - 10, 2, 2, "#ff5c8a"); px(x + 1, g - 10, 2, 2, "#ff5c8a"); px(x - 2, g - 5, 2, 5, "#7a8294"); px(x + 1, g - 5, 2, 5, "#7a8294"); px(x, g - 14, 1, 2, "#5ee6f0"); }
      else if (r < 0.8) { px(x, g - 14, 1, 14, "#5a5a66"); px(x + 10, g - 14, 1, 14, "#5a5a66"); if (Math.sin(t * 9) > -0.3) for (let y = g - 13; y < g; y += 3) px(x + 1, y, 9, 1, "#ff3fd8"); }
    },
    palace(x, g, r) {
      if (r < 0.4) { px(x - 3, g - 9, 7, 9, "#ffffff"); for (let i = -3; i < 4; i += 2) px(x + i, g - 9, 1, 9, "#d93a3a"); disc(x, g - 11, 3, "#fff3b0"); disc(x - 2, g - 12, 1, "#ffe27a"); }
      else if (r < 0.65) { disc(x, g - 7, 6, "#2a2a33"); for (let a = 0; a < 6; a++) disc(x + Math.round(Math.cos(a + t) * 3.5), g - 7 + Math.round(Math.sin(a + t) * 3.5), 1, "#9aa3b5"); disc(x, g - 7, 1, "#9aa3b5"); }
      else if (r < 0.85) { px(x - 2, g - 10, 5, 10, "#d93a3a"); px(x - 2, g - 10, 5, 2, "#ffffff"); px(x, g - 13, 1, 3, "#ffffff"); }
    },
    premiere(x, g, r) {
      if (r < 0.35) { px(x - 4, g - 6, 9, 6, "#2a2a33"); px(x - 1, g - 12, 3, 6, "#ffd166"); disc(x, g - 14, 2, "#ffd166"); px(x - 2, g - 17, 1, 2, "#ffd166"); px(x + 2, g - 17, 1, 2, "#ffd166"); }
      else if (r < 0.6) DECO.carpet(x, g, 0.1);
      else if (r < 0.8) { px(x - 14, g - 6, 30, 5, "#1b1b22"); px(x - 6, g - 9, 14, 3, "#1b1b22"); px(x - 5, g - 8, 5, 2, "#3a4a6a"); px(x + 2, g - 8, 5, 2, "#3a4a6a"); disc(x - 9, g - 1, 2, "#2a2a33"); disc(x + 11, g - 1, 2, "#2a2a33"); }
      else { px(x - 3, g - 5, 7, 5, "#5a5a66"); px(x - 2, g - 8, 5, 3, "#9aa3b5"); }
    },
  });
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
    if (ex <= sx) return;
    if (theme === "movies") { px(sx, ground - 3, ex - sx, 3, "#1b1b22"); for (let x = sx - ((sx + camX) % 4); x < ex; x += 4) { px(x, ground - 3, 1, 1, "#e8e2d0"); px(x, ground - 1, 1, 1, "#e8e2d0"); } }
    else px(sx, ground - 1, ex - sx, 1, "#ff5c8a");
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
    const c = CAT, tp = c.top, legH = c.LEGS[0].length;
    if (running || jump > 0) { const bob = catFrame ? 1 : 0; sprite(c.BODY, x - 20, y + bob - tp + (2 - legH)); sprite(c.LEGS[jump > 0 ? 0 : catFrame], x - 20, y + 8 + bob + (2 - legH)); }
    else { const wag = Math.sin(t * 4) > 0; sprite(wag ? c.SIT.map((r, j) => (j === 6 + tp || j === 7 + tp ? "." + r.slice(1).replace(/^\.o/, "o.") : r)) : c.SIT, x - 20, y - tp); }
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
    if (fx === "flash" && Math.random() < 0.06) { const fx2 = Math.random() * W, fy = ground - 8 - Math.random() * 10; for (let i = 0; i < 6; i++) parts.push({ x: fx2, y: fy, vx: (Math.random() - 0.5) * 30, vy: (Math.random() - 0.5) * 30, g: 0, life: 0.18, c: "#ffffff", s: 2 }); }
    if (fx === "popcorn" && Math.random() < 0.25) parts.push({ x: Math.random() * W, y: -2, vx: (Math.random() - 0.5) * 8, vy: 20 + Math.random() * 15, g: 10, life: 6, c: Math.random() < 0.7 ? "#fff6dc" : "#ffd166", s: 2, wob: 0.5 });
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
    const onTitle = $("title").classList.contains("active");
    camX += ((onTitle ? yarnX - W * 0.2 : Math.max(0, yarnX - W * 0.6)) - camX) * Math.min(1, dt * 3);

    const L = look((camX + W * 0.5) / PPM);
    const bi = biomeIdx(yarnX / PPM);
    if (bi !== lastBiome) { if (lastBiome !== -1 && rollT < 1) banner(B[bi].name); lastBiome = bi; }
    ctx.save();
    if (shake > 0) { shake -= dt; ctx.translate(Math.round((Math.random() - 0.5) * 4), Math.round((Math.random() - 0.5) * 3)); }
    drawSky(L); drawBeams(L); drawHills(L); drawSets(L); drawGround(L); weather(L); drawDeco(); drawSigns(); drawThread(); drawYarn(); drawCat(); drawParts(dt);
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
    catScreen() { return { x: (catX - camX - 20) * PX, y: (ground - 10 - (CAT.top || 0)) * PX, w: 20 * PX, h: (10 + (CAT.top || 0)) * PX }; },
    poke() { if (!running && jump === 0) jump = 0.001; },
    setTheme(name) { if (THEMES[name] && B !== THEMES[name]) { B = THEMES[name]; theme = name; lastBiome = biomeIdx(yarnX / PPM); } },
    setCat(cfg) { CAT = buildCat(cfg); },
    preview(canvas, cfg) {
      const c = buildCat(cfg), g = canvas.getContext("2d"), sc = Math.floor(canvas.width / 24);
      g.clearRect(0, 0, canvas.width, canvas.height);
      c.SIT.forEach((r, j) => { for (let i = 0; i < r.length; i++) { const col = catColour(c, r[i], i, j); if (col) { g.fillStyle = col; g.fillRect(i * sc + sc * 2, j * sc + (canvas.height - c.SIT.length * sc) / 2, sc, sc); } } });
    },
  };
})();

/* ---------- the title-screen cat: pet it, dress it ---------- */
const MEOWS = ["meow!", "mrrp?", "MEOW", "purrr…", "mew", "nya~", "feed me", "mrow!", "*slow blink*", "pspsps?", "meow meow", "🐟?", "chase time?", "🧶!!"];
function meowSound() {
  try {
    const ac = meowSound.ac || (meowSound.ac = new (window.AudioContext || window.webkitAudioContext)());
    const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain(), t0 = ac.currentTime, p = 0.85 + Math.random() * 0.4;
    o.type = "sawtooth"; f.type = "bandpass"; f.Q.value = 3;
    o.frequency.setValueAtTime(480 * p, t0); o.frequency.linearRampToValueAtTime(800 * p, t0 + 0.14); o.frequency.linearRampToValueAtTime(430 * p, t0 + 0.45);
    f.frequency.setValueAtTime(1000, t0); f.frequency.linearRampToValueAtTime(2300, t0 + 0.14); f.frequency.linearRampToValueAtTime(800, t0 + 0.45);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(0.16, t0 + 0.04); g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.5);
    o.connect(f); f.connect(g); g.connect(ac.destination); o.start(t0); o.stop(t0 + 0.55);
  } catch {}
}
let bubbleTO;
function petCat() {
  const b = $("bubble"), c = scene.catScreen();
  b.textContent = MEOWS[Math.floor(Math.random() * MEOWS.length)];
  b.style.left = c.x + c.w * 0.6 + "px"; b.style.top = c.y - 6 + "px";
  b.classList.remove("show"); void b.offsetWidth; b.classList.add("show");
  clearTimeout(bubbleTO); bubbleTO = setTimeout(() => b.classList.remove("show"), 1600);
  scene.poke(); meowSound();
}
(function trackCat() {
  const hit = $("catHit"), onTitle = $("title").classList.contains("active") && $("catPanel").classList.contains("hidden") && $("boardPanel").classList.contains("hidden");
  hit.style.display = onTitle ? "block" : "none";
  if (onTitle) { const c = scene.catScreen(); Object.assign(hit.style, { left: c.x + "px", top: c.y + "px", width: c.w + "px", height: c.h + "px" }); }
  requestAnimationFrame(trackCat);
})();
$("catHit").addEventListener("click", petCat);

function catPanel() {
  const cfg = Object.assign({ breed: "shorthair", coat: "ginger" }, store.get("cat", {}));
  const draw = () => { scene.preview($("catPreview"), cfg); scene.setCat(cfg); store.set("cat", cfg); };
  const chips = (el, items, key, swatch) => {
    el.innerHTML = "";
    for (const [id, it] of Object.entries(items)) {
      const b = document.createElement("button");
      b.innerHTML = (swatch ? `<i style="background:linear-gradient(135deg,${it.o} 55%,${it.d} 55%)"></i>` : "") + esc(it.name);
      b.classList.toggle("on", cfg[key] === id);
      b.onclick = () => { cfg[key] = id; el.querySelectorAll("button").forEach((x) => x.classList.toggle("on", x === b)); draw(); };
      el.appendChild(b);
    }
  };
  chips($("breedList"), BREEDS, "breed"); chips($("coatList"), COATS, "coat", true);
  draw();
  $("catPanel").classList.remove("hidden");
}
$("btnCat").addEventListener("click", catPanel);
$("btnCatDone").addEventListener("click", () => { $("catPanel").classList.add("hidden"); petCat(); });

/* ---------- daily leaderboard (optional, needs config.js) ---------- */
const CFG = window.MEOWSAND_CONFIG || {};
const LB_ON = !!(CFG.supabaseUrl && CFG.supabaseAnonKey);
const MAX_SCORE = 1600; // 7 rounds can't physically exceed this
function lb(path, opts = {}) {
  return fetch(CFG.supabaseUrl.replace(/\/$/, "") + "/rest/v1/" + path, Object.assign({}, opts, {
    headers: Object.assign({ apikey: CFG.supabaseAnonKey, Authorization: "Bearer " + CFG.supabaseAnonKey, "Content-Type": "application/json" }, opts.headers || {}),
  }));
}
const cleanName = (s) => s.toUpperCase().replace(/[^A-Z0-9 _-]/g, "").trim().slice(0, 10);
async function showBoard(pack = PACK) {
  $("boardPanel").classList.remove("hidden");
  document.querySelectorAll(".boardtab").forEach((b) => b.classList.toggle("on", b.dataset.pack === pack));
  $("boardTitle").textContent = `TOP CHASERS · ${today()}`;
  const list = $("boardList"); list.innerHTML = "<li>loading…</li>"; $("boardMsg").textContent = "";
  try {
    const r = await lb(`scores?select=name,score&day=eq.${today()}&pack=eq.${pack}&order=score.desc,created_at.asc&limit=25`);
    if (!r.ok) throw new Error(r.status);
    const rows = await r.json(), mine = store.get(K("submitted:" + today(), pack));
    list.innerHTML = rows.length ? "" : "<li>no scores yet today. Be the first!</li>";
    rows.forEach((row, i) => {
      const li = document.createElement("li");
      li.innerHTML = `<b>${i + 1}.</b><span>${esc(row.name)}</span><span>${fmt(row.score)} m</span>`;
      if (mine && mine.name === row.name && mine.score === row.score) li.className = "me";
      list.appendChild(li);
    });
  } catch (e) { list.innerHTML = ""; $("boardMsg").textContent = "couldn't reach the leaderboard right now."; }
}
async function submitScore(e) {
  e.preventDefault();
  const name = cleanName($("lbName").value);
  if (!name) { $("submitMsg").textContent = "type a name first (letters & numbers, 10 max)"; return; }
  if (!game || game.mode !== "daily" || game.day !== today()) return;
  const key = K("submitted:" + game.day, game.pack || "classic");
  if (store.get(key)) return;
  $("submitMsg").textContent = "submitting…";
  try {
    const r = await lb("scores", { method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ day: game.day, pack: game.pack || "classic", name, score: Math.min(MAX_SCORE, Math.round(game.total)) }) });
    if (!r.ok) throw new Error(r.status);
    store.set(key, { name, score: Math.round(game.total) });
    store.set("lbName", name);
    $("submitForm").classList.add("hidden");
    $("submitMsg").textContent = "submitted! 🏆";
    showBoard(game.pack || "classic");
  } catch (err) { $("submitMsg").textContent = "couldn't submit. Try again in a moment."; }
}
function updateSubmit() {
  const can = LB_ON && game && game.mode === "daily" && game.day === today() && !store.get(K("submitted:" + game.day, game.pack || "classic"));
  $("submitForm").classList.toggle("hidden", !can);
  $("submitMsg").textContent = "";
  if (can) $("lbName").value = store.get("lbName", "");
}
$("btnBoard").classList.toggle("hidden", !LB_ON);
$("btnBoard").addEventListener("click", () => showBoard(PACK));
$("btnBoardClose").addEventListener("click", () => $("boardPanel").classList.add("hidden"));
document.querySelectorAll(".boardtab").forEach((b) => b.addEventListener("click", () => showBoard(b.dataset.pack)));
$("submitForm").addEventListener("submit", submitScore);
$("lbName").addEventListener("input", (e) => { const v = cleanName(e.target.value); if (v !== e.target.value.toUpperCase()) e.target.value = v; });

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
  if (e.key === "Escape" && !$("catPanel").classList.contains("hidden")) { $("catPanel").classList.add("hidden"); return; }
  if (e.key === "Escape" && !$("boardPanel").classList.contains("hidden")) { $("boardPanel").classList.add("hidden"); return; }
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
if (location.hash === "#debug") window.meow = { scene, getPrompt, loadPrompts, findAnswer, usePack, get DATA() { return DATA; }, get game() { return game; } };
})();
