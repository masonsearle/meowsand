/* MEOWSAND 1v1 BATTLE
 * Two players, same prompts. Both answer, then compare: the metre difference
 * (x a multiplier that grows 1.5x every 7 prompts) comes off the lower scorer's
 * health. First cat to 0 loses.
 *
 * Networking: Supabase Realtime (presence + broadcast), using the same
 * config.js as the leaderboard. No database tables needed for battles.
 * Add ?mock to the URL to test with two tabs on one computer, no server.
 */
(() => {
"use strict";
const C = window.MeowCore;
const { $, store, esc, fmt } = C;
const HP = 300, Q_PER_SET = 7, MULT = 1.5, SECS = 25;
const MOCK = /[?&]mock\b/.test(location.search);
const ONLINE = MOCK || !!(C.CFG.supabaseUrl && C.CFG.supabaseAnonKey);
const ME = (!MOCK && store.get("battleId")) || Math.random().toString(36).slice(2, 10); // mock: each tab is its own player
if (!MOCK) store.set("battleId", ME);
let nameNow = MOCK ? "" : store.get("battleName", "");

/* ---------------- transport ---------------- */
let sb = null;
function loadSupabase() {
  if (window.supabase) return Promise.resolve();
  return new Promise((res, rej) => {
    const s = document.createElement("script");
    s.src = "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2";
    s.onload = res; s.onerror = () => rej(new Error("couldn't load supabase"));
    document.head.appendChild(s);
  });
}
// A channel: presence (who's here + their state) and messages.
async function openChannel(name, onPresence, onMsg) {
  if (MOCK) return mockChannel(name, onPresence, onMsg);
  await loadSupabase();
  sb = sb || window.supabase.createClient(C.CFG.supabaseUrl, C.CFG.supabaseAnonKey);
  const ch = sb.channel(name, { config: { broadcast: { self: false }, presence: { key: ME } } });
  ch.on("presence", { event: "sync" }, () => onPresence(Object.values(ch.presenceState()).map((arr) => arr[0])));
  ch.on("broadcast", { event: "msg" }, ({ payload }) => onMsg(payload));
  await new Promise((res, rej) => {
    const to = setTimeout(() => rej(new Error("timeout")), 10000);
    ch.subscribe((status) => { if (status === "SUBSCRIBED") { clearTimeout(to); res(); } if (status === "CHANNEL_ERROR") { clearTimeout(to); rej(new Error(status)); } });
  });
  return {
    track: (state) => ch.track(Object.assign({ id: ME }, state)),
    send: (payload) => ch.send({ type: "broadcast", event: "msg", payload: Object.assign({ from: ME }, payload) }),
    leave: () => { try { ch.untrack(); sb.removeChannel(ch); } catch {} },
  };
}
// Same interface, using BroadcastChannel between tabs (for testing).
function mockChannel(name, onPresence, onMsg) {
  const bc = new BroadcastChannel("mock:" + name), peers = new Map();
  let mine = null, alive = true;
  const emit = () => onPresence([...peers.values()].map((p) => p.state).concat(mine ? [mine] : []));
  bc.onmessage = ({ data }) => {
    if (data.kind === "pres") { const had = JSON.stringify((peers.get(data.id) || {}).state); peers.set(data.id, { state: data.state, at: Date.now() }); if (had !== JSON.stringify(data.state)) emit(); }
    if (data.kind === "bye") { peers.delete(data.id); emit(); }
    if (data.kind === "hello" && mine) bc.postMessage({ kind: "pres", id: ME, state: mine });
    if (data.kind === "msg") onMsg(data.payload);
  };
  const beat = setInterval(() => {
    if (!alive) return;
    if (mine) bc.postMessage({ kind: "pres", id: ME, state: mine });
    let changed = false;
    for (const [id, p] of peers) if (Date.now() - p.at > 3500) { peers.delete(id); changed = true; }
    if (changed) emit();
  }, 1000);
  bc.postMessage({ kind: "hello" });
  setTimeout(emit, 50);
  return Promise.resolve({
    track: (state) => { mine = Object.assign({ id: ME }, state); bc.postMessage({ kind: "pres", id: ME, state: mine }); emit(); },
    send: (payload) => bc.postMessage({ kind: "msg", payload: Object.assign({ from: ME }, payload) }),
    leave: () => { alive = false; clearInterval(beat); bc.postMessage({ kind: "bye", id: ME }); bc.close(); },
  });
}

/* ---------------- state ---------------- */
let lobbyCh = null, roomCh = null, lobbies = [], players = [];
let room = null; // { id, host, pack, isHost }
let B = null;    // battle state
const myName = () => (nameNow || "").trim();
const myCat = () => Object.assign({ breed: "shorthair", coat: "ginger" }, store.get("cat", {}));
const clean = (s) => s.replace(/[^\w .'-]/g, "").trim().slice(0, 12);
const multFor = (q) => Math.pow(MULT, Math.floor(q / Q_PER_SET));
const multText = (m) => "×" + (Math.round(m * 100) / 100).toString();

/* ---------------- lobby list ---------------- */
async function openLobby() {
  if (!ONLINE) { C.show("lobby"); renderLobby(); $("lobbyMsg").innerHTML = "1v1 needs the free Supabase setup in <b>config.js</b> (README → Leaderboard setup). Then this lights up."; return; }
  C.show("lobby");
  $("bName").value = myName();
  renderLobby();
  $("lobbyMsg").textContent = "connecting…";
  try {
    if (!lobbyCh) lobbyCh = await openChannel("meowsand-lobbies", (list) => { lobbies = list.filter((l) => l.room); renderLobby(); }, () => {});
    $("lobbyMsg").textContent = "";
  } catch (e) { $("lobbyMsg").textContent = "couldn't connect. Check config.js and try again."; lobbyCh = null; }
}
function renderLobby() {
  const pack = store.get("battlePack", C.PACK);
  document.querySelectorAll(".bpack").forEach((b) => b.classList.toggle("on", b.dataset.pack === pack));
  const ul = $("lobbyList");
  ul.innerHTML = "";
  const open = lobbies.filter((l) => l.host !== ME);
  if (!open.length) ul.innerHTML = `<li class="empty">no open lobbies yet. Create one and tell your friend!</li>`;
  for (const l of open) {
    const li = document.createElement("li");
    const full = l.players >= 2 || l.status !== "waiting";
    li.innerHTML = `<b>${l.pack === "movies" ? "🎬" : "🧶"}</b><span>${esc(l.hostName)}'s lobby</span><button class="mid" ${full ? "disabled" : ""}>${full ? (l.status === "playing" ? "IN BATTLE" : "FULL") : "JOIN"}</button>`;
    if (!full) li.querySelector("button").onclick = () => joinRoom(l);
    ul.appendChild(li);
  }
}
function needName() {
  const n = clean($("bName").value);
  if (!n) { $("lobbyMsg").textContent = "pick a display name first"; $("bName").focus(); return null; }
  nameNow = n; if (!MOCK) store.set("battleName", n);
  return n;
}
function advertise() { // the host lists their room in the lobby
  if (!lobbyCh || !room || !room.isHost) return;
  lobbyCh.track({ room: room.id, host: ME, hostName: myName(), pack: room.pack, players: players.length, status: B ? "playing" : "waiting" });
}

/* ---------------- rooms ---------------- */
async function createRoom() {
  if (!needName()) return;
  const pack = store.get("battlePack", C.PACK);
  room = { id: Math.random().toString(36).slice(2, 8), host: ME, pack, isHost: true };
  await enterRoom();
}
async function joinRoom(l) {
  if (!needName()) return;
  room = { id: l.room, host: l.host, pack: l.pack, isHost: false };
  await enterRoom();
}
async function enterRoom() {
  C.show("room");
  $("roomMsg").textContent = "connecting…";
  $("bStart").classList.toggle("hidden", !room.isHost);
  await C.usePack(room.pack);
  try {
    roomCh = await openChannel("meowsand-room-" + room.id, onRoomPresence, onRoomMsg);
    roomCh.track({ name: myName(), cat: myCat(), host: room.isHost });
    advertise();
  } catch (e) { $("roomMsg").textContent = "couldn't connect to the lobby."; }
}
function onRoomPresence(list) {
  players = list.filter((p) => p && p.id).slice(0, 2);
  const others = list.filter((p) => p.id !== ME);
  if (B && !B.over && !others.length) { opponentLeft(); return; }
  if (!B) {
    if (!room.isHost && !list.some((p) => p.host)) { $("roomMsg").textContent = "the host left this lobby."; }
    renderRoom();
    // joined late? the host's presence carries the battle seed
  }
  // joined late or missed the start message? the host's presence carries the battle seed
  const host = list.find((p) => p.host && p.seed);
  if (!room.isHost && host && host.seed !== (B && B.seed) && (!B || B.over)) startBattle(host.seed, host.pack);
  advertise();
}
function renderRoom() {
  const box = $("roomPlayers");
  box.innerHTML = "";
  const me = players.find((p) => p.id === ME), them = players.find((p) => p.id !== ME);
  for (const p of [me, them]) {
    const d = document.createElement("div");
    d.className = "slot";
    if (p) {
      const cv = document.createElement("canvas"); cv.width = 120; cv.height = 75;
      d.appendChild(cv); C.scene.preview(cv, p.cat);
      d.insertAdjacentHTML("beforeend", `<b>${esc(p.name)}</b><small>${p.host ? "host" : "challenger"}</small>`);
    } else d.innerHTML = `<div class="waitcat">?</div><b>waiting…</b><small>share: “${esc(myName())}'s lobby”</small>`;
    box.appendChild(d);
    if (p === me) box.insertAdjacentHTML("beforeend", `<div class="vs">VS</div>`);
  }
  const ready = players.length >= 2;
  $("bStart").disabled = !ready;
  $("roomMsg").textContent = room.isHost ? (ready ? "ready when you are!" : "waiting for your friend to join…") : (ready ? "waiting for the host to start…" : "");
  $("roomPack").textContent = room.pack === "movies" ? "🎬 MOVIES PACK" : "🧶 CLASSIC PACK";
}
function leaveRoom(toLobby = true) {
  clearInterval(B && B.timer); clearInterval(B && B.resend); clearTimeout(B && B.nextTO);
  if (roomCh) roomCh.leave();
  roomCh = null; B = null; players = [];
  if (lobbyCh && room && room.isHost) lobbyCh.track({});
  room = null;
  if (toLobby) openLobby(); else { C.renderTitle(); C.show("title"); }
}

/* ---------------- battle ---------------- */
function hostStart() {
  if (!room || !room.isHost || players.length < 2) return;
  const seed = Math.random().toString(36).slice(2, 10);
  roomCh.track({ name: myName(), cat: myCat(), host: true, seed, pack: room.pack });
  roomCh.send({ t: "start", seed, pack: room.pack });
  startBattle(seed, room.pack);
}
function onRoomMsg(m) {
  if (m.t === "start" && (!B || B.seed !== m.seed)) startBattle(m.seed, m.pack);
  if (m.t === "ans" && B && m.seed === B.seed) { (B.ans[m.q] = B.ans[m.q] || {})[m.from] = m; checkBoth(); }
}
function idsForSet(seed, set) {
  return C.shuffle(C.BASE_IDS, C.rng(C.hash("battle-" + seed + "-" + set))).slice(0, Q_PER_SET);
}
async function startBattle(seed, pack) {
  clearInterval(B && B.timer); clearInterval(B && B.resend); clearTimeout(B && B.nextTO);
  await C.usePack(pack);
  const opp = players.find((p) => p.id !== ME) || { id: "?", name: "???", cat: {} };
  B = { seed, pack, q: -1, hp: { [ME]: HP, [opp.id]: HP }, opp, ans: {}, log: [], over: false, total: 0 };
  advertise();
  C.scene.setTheme(pack); C.scene.jumpTo(0);
  C.show("battle");
  drawFighters();
  nextQuestion();
}
function drawFighters() {
  const set = (el, p) => {
    C.scene.preview(el.querySelector("canvas"), p.cat);
    el.querySelector(".fname").textContent = p.name;
    const hp = Math.max(0, B.hp[p.id]);
    el.querySelector(".hp i").style.width = (hp / HP) * 100 + "%";
    el.querySelector(".hp i").className = hp < HP * 0.3 ? "low" : "";
    el.querySelector(".hptext").textContent = `${Math.ceil(hp)} / ${HP}`;
  };
  set($("fMe"), { id: ME, name: myName(), cat: myCat() });
  set($("fThem"), B.opp);
}
async function nextQuestion() {
  B.q++;
  const set = Math.floor(B.q / Q_PER_SET), idx = B.q % Q_PER_SET;
  const ids = idsForSet(B.seed, set);
  await C.loadPrompts(ids);
  if (!B) return;
  const p = C.getPrompt(ids[idx]);
  B.prompt = p;
  const mult = multFor(B.q);
  $("bRound").textContent = `PROMPT ${B.q + 1}`;
  $("bMult").textContent = `damage ${multText(mult)}` + (idx === 0 && set > 0 ? " ⬆" : "");
  $("bMult").classList.toggle("up", idx === 0 && set > 0);
  $("bPrompt").textContent = p.q;
  $("bAnswer").value = ""; $("bAnswer").disabled = false;
  $("bForm").classList.remove("hidden");
  $("bFeedback").textContent = "";
  $("bWait").classList.add("hidden");
  $("bResult").classList.add("hidden");
  $("bAnswer").focus();
  B.deadline = performance.now() + SECS * 1000; B.mine = null;
  clearInterval(B.timer);
  B.timer = setInterval(tick, 100); tick();
}
function tick() {
  if (!B) return;
  const left = Math.max(0, B.deadline - performance.now());
  $("bTimer").style.width = (left / (SECS * 1000)) * 100 + "%";
  $("bTimer").classList.toggle("low", left < 6000);
  if (left <= 0 && !B.mine) lockIn(null);
}
function submit(e) {
  e.preventDefault();
  if (!B || B.mine) return;
  const raw = $("bAnswer").value;
  if (!C.norm(raw)) return;
  const hit = C.findAnswer(B.prompt, raw);
  if (!hit) {
    $("bFeedback").textContent = `“${raw.trim()}” isn't on our list. Try another!`;
    const c = $("bAnswer"); c.classList.remove("shake"); void c.offsetWidth; c.classList.add("shake"); c.select();
    return;
  }
  lockIn(hit);
}
function lockIn(hit) {
  clearInterval(B.timer);
  const m = hit ? C.metres(hit.n) : 0;
  B.mine = { t: "ans", seed: B.seed, q: B.q, a: hit ? hit.a : null, n: hit ? hit.n : 0, m, from: ME };
  (B.ans[B.q] = B.ans[B.q] || {})[ME] = B.mine;
  roomCh.send(B.mine);
  B.total += m;
  C.scene.rollTo(B.total, m, hit ? C.tierOf(hit.n).lvl : -1);
  $("bForm").classList.add("hidden");
  $("bFeedback").textContent = "";
  $("bWait").classList.remove("hidden");
  $("bWait").innerHTML = `you said <b>${esc(hit ? hit.a : "nothing 😿")}</b>${hit ? ` (+${m}m)` : ""}<br><span class="dots">waiting for ${esc(B.opp.name)}</span>`;
  clearInterval(B.resend);
  B.resend = setInterval(() => { if (B && B.mine) roomCh.send(B.mine); }, 2500); // heals a dropped message
  checkBoth();
}
function checkBoth() {
  if (!B || B.over) return;
  const a = B.ans[B.q] || {}, mine = a[ME], theirs = a[B.opp.id];
  if (!mine || !theirs || B.shown === B.q) return;
  B.shown = B.q;
  clearInterval(B.resend);
  const mult = multFor(B.q), diff = Math.abs(mine.m - theirs.m), dmg = Math.round(diff * mult);
  let loser = null;
  if (mine.m > theirs.m) loser = B.opp.id; else if (theirs.m > mine.m) loser = ME;
  if (loser) B.hp[loser] -= dmg;
  B.log.push({ q: B.prompt.q, me: mine, them: theirs, dmg, loser });
  const line = (who, x, cls) => `<div class="side ${cls}"><small>${esc(who)}</small><b>${esc(x.a ? x.a : "—")}</b><span>${x.a ? `1 in ${fmt(x.n)} · ` : ""}${x.m}m</span></div>`;
  const top = (B.prompt.answers || []).slice(0, 3).map((x) => x.a).join(" · ");
  $("bWait").classList.add("hidden");
  $("bResult").classList.remove("hidden");
  $("bResult").innerHTML = `<div class="duel">${line("you", mine, loser === B.opp.id ? "win" : loser === ME ? "lose" : "")}<div class="vs">VS</div>${line(B.opp.name, theirs, loser === ME ? "win" : loser === B.opp.id ? "lose" : "")}</div>
    <div class="dmg">${loser ? `${esc(loser === ME ? "your cat" : B.opp.name + "'s cat")} takes <b>${dmg}</b> damage${mult > 1 ? ` <small>(${diff} ${multText(mult)})</small>` : ""}!` : "a draw, no damage!"}</div>
    <div class="res-top">most said: ${esc(top)}</div><div class="nextin"></div>`;
  if (loser) hitFx(loser === ME ? "fMe" : "fThem");
  drawFighters();
  const dead = [ME, B.opp.id].filter((id) => B.hp[id] <= 0);
  let n = dead.length ? 4 : 6;
  const count = () => { const el = $("bResult").querySelector(".nextin"); if (el) el.textContent = dead.length ? "…" : `next prompt in ${n}`; };
  count();
  const step = () => { if (!B) return; n--; count(); if (n <= 0) { dead.length ? endBattle() : nextQuestion(); } else B.nextTO = setTimeout(step, 1000); };
  B.nextTO = setTimeout(step, 1000);
}
function hitFx(id) { const el = $(id); el.classList.remove("hit"); void el.offsetWidth; el.classList.add("hit"); }
function opponentLeft() {
  if (!B || B.over) return;
  B.over = true; clearInterval(B.timer); clearInterval(B.resend); clearTimeout(B.nextTO);
  showEnd(true, `${B.opp.name} left the battle`);
}
function endBattle() {
  if (!B) return;
  B.over = true;
  const meHp = B.hp[ME], themHp = B.hp[B.opp.id];
  const won = themHp <= 0 && meHp > themHp;
  const draw = meHp <= 0 && themHp <= 0 && meHp === themHp;
  showEnd(won, draw ? "it's a draw!" : null);
}
function showEnd(won, note) {
  const st = store.get("battleStats", {}), key = B.opp.name;
  st[key] = st[key] || { w: 0, l: 0 };
  if (!note) won ? st[key].w++ : st[key].l++;
  store.set("battleStats", st);
  $("beTitle").textContent = note || (won ? "VICTORY!" : "DEFEAT");
  $("beTitle").className = "total " + (won ? "t4" : "");
  C.scene.preview($("beCat"), won ? myCat() : B.opp.cat);
  $("beSub").textContent = note ? "" : `${won ? myName() : B.opp.name}'s cat wins after ${B.q + 1} prompts`;
  $("beRecord").textContent = `you vs ${B.opp.name}: ${st[key].w} wins · ${st[key].l} losses`;
  const best = B.log.flatMap((r) => [r.me, r.them]).filter((x) => x.a).sort((a, b) => b.n - a.n)[0];
  $("beBest").textContent = best ? `rarest answer: ${best.a} (1 in ${fmt(best.n)}) by ${best.from === ME ? "you" : B.opp.name}` : "";
  $("beRematch").classList.toggle("hidden", !room || !room.isHost || !!note);
  $("beWaitHost").classList.toggle("hidden", !room || room.isHost || !!note);
  C.show("battleEnd");
  B.seedDone = B.seed;
}
function rematch() {
  if (!room || !room.isHost) return;
  B = null; hostStart();
}

/* ---------------- wiring ---------------- */
$("btnBattle").addEventListener("click", openLobby);
$("bCreate").addEventListener("click", createRoom);
$("bLobbyBack").addEventListener("click", () => { if (lobbyCh) { lobbyCh.leave(); lobbyCh = null; } C.renderTitle(); C.show("title"); });
$("bStart").addEventListener("click", hostStart);
$("bRoomLeave").addEventListener("click", () => leaveRoom(true));
$("bForm").addEventListener("submit", submit);
$("bQuit").addEventListener("click", () => { if (confirmQuit()) leaveRoom(true); });
$("beRematch").addEventListener("click", rematch);
$("beLeave").addEventListener("click", () => leaveRoom(true));
$("bName").addEventListener("change", () => { const n = clean($("bName").value); $("bName").value = n; if (n) { nameNow = n; if (!MOCK) store.set("battleName", n); } });
document.querySelectorAll(".bpack").forEach((b) => b.addEventListener("click", () => { store.set("battlePack", b.dataset.pack); renderLobby(); }));
addEventListener("pagehide", () => { if (roomCh) roomCh.leave(); if (lobbyCh) lobbyCh.leave(); });
let quitArmed = 0;
function confirmQuit() { // tap twice to forfeit
  if (Date.now() - quitArmed < 2500) return true;
  quitArmed = Date.now(); $("bFeedback").textContent = "tap QUIT again to forfeit"; return false;
}
if (MOCK) window.battleDebug = { get B() { return B; }, get players() { return players; }, get lobbies() { return lobbies; } };
})();
