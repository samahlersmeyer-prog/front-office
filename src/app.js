(function () {
'use strict';
const FO = window.FO;
{ const af = FO.applyFarm; FO.applyFarm = function (a, b, c) { af(a, b, c); try { applyDynNow(); } catch (e) { /* early */ } }; }
const TEAM = FO.TEAM, TEAMS = FO.TEAMS;
let W = null, P = null, curEra = null;
function initWorld(era) {
  if (curEra === era && W) return;
  FO.setEra(era); curEra = era;
  W = FO.buildWorld(document.getElementById(era === '2026' ? 'rosters26' : 'rosters').textContent);
  P = W.P; schedSeed = null; if (typeof invalidate === 'function') invalidate();
  if (typeof syncFarm === 'function') syncFarm();
  try { applyDynNow(); } catch (e) { /* early */ }
}
const ERA = () => FO.ERA;
const SC = () => FO.ERA.scale;
const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt3 = x => (isFinite(x) ? x.toFixed(3).replace(/^0/, '') : '.000');
const money = x => (x < 0 ? '−' : '') + '$' + (Math.abs(x) >= 1e6 ? (Math.abs(x) / 1e6).toFixed(1) + 'M' : Math.round(Math.abs(x) / 1e3) + 'K');
const ipStr = outs => Math.floor(outs / 3) + '.' + (outs % 3);
const posShort = p => p.t === 'P' ? (p.role === 'SP' ? 'SP' : p.role === 'CL' ? 'CL' : 'RP') : (p.elig && p.elig.length ? p.elig.join('/') : p.pos);
const utilTag = p => p && p.util ? ' <span class="tag" title="Plays 3 or more positions">UTIL</span>' : '';
const gloveLine = p => p.t === 'H' && p.defAt ? Object.entries(p.defAt).filter(([k]) => k !== 'DH').map(([k, v]) => `${k} ${v}`).join(' · ') : '';

// ---------------- app state ----------------
let db = null, user = null, mode = 'loading';
let me = { id: null, name: '', avatar: '', canWrite: true };
let meta = null, S = null, box = null, docs = {}, trades = [], bids = {}, farm = null, farmLoaded = false;
let profiles = {};
let marketView = 'trade', faFilter = 'all', tab = 'desk', lgView = 'AL', statView = 'bat', teamView = null, tradePartner = null, tradeGive = new Set(), tradeGet = new Set();
let simming = null; // {label, pct}
const LS = 'fo97-local-v1';

function myTeam() { for (const t of TEAMS) if (docs[t.id] && docs[t.id].owner && docs[t.id].owner === me.id) return t.id; return null; }
function isCommish() { return !!meta && (meta.commish === me.id || mode === 'local'); }
function locked() { return !!(meta && meta.locked) && !isCommish(); }
function canSim() { return !!meta && (isCommish() || meta.openSim); }
let setupCache = {}, pteamCache = null;
function setup(tid) { return setupCache[tid] || (setupCache[tid] = FO.teamSetup(W, tid, docs[tid])); }
function playerTeam(id) { if (!pteamCache) { pteamCache = {}; TEAMS.forEach(t => setup(t.id).roster.forEach(p => { pteamCache[p] = t.id; })); } return pteamCache[id] || 'FA'; }
let faCache = null;
function invalidate() { setupCache = {}; pteamCache = null; faCache = null; forgCache = null; }
function freeAgents() { if (!faCache) { playerTeam(0); farmOrg(-1); faCache = P.filter(p => p && !p.dup && !(p.id in pteamCache) && !(p.id in forgCache) && !isRetired(p.id)).map(p => p.id); } return faCache; }
function salFor(id, tid) { tid = tid || playerTeam(id); return TEAM[tid] ? FO.salOf(W, setup(tid).con, id) : P[id].sal; }
function endFor(id, tid) { tid = tid || playerTeam(id); return TEAM[tid] ? FO.endOf(W, setup(tid).con, id) : 0; }
const LEN = () => (S && S.len) || 162;
const SEASON_LENS = [[162, 'Full season · 162 games'], [81, 'Half season · 81 games'], [60, 'Sprint · 60 games'], [40, 'Quick · 40 games']];
function seasonNo() { return (meta && meta.season) || 1; }
function yearOf(season) { return FO.ERA.year - 1 + season; }
function cashOf(tid) { return S.fin[tid][0] + ((docs[tid] && docs[tid].cashAdj) || 0) + loanOf(tid); }
function openingCash(tid) { return (S.open && S.open[tid] != null) ? S.open[tid] : FO.ERA.fin.start; }
function rosterOf(tid) { return setup(tid).roster; }
function ownerOf(tid) { return docs[tid] && docs[tid].owner || null; }

// ---------------- leagues: solo, main and friend leagues share one app ----------------
let league = { kind: 'main', id: 'main', name: 'Main league' }, unsubs = [], leagueList = {};
try { const sv = JSON.parse(localStorage.getItem('fo-league') || 'null'); if (sv && sv.kind) league = sv; } catch (e) { /* storage unavailable */ }
function L(path) {
  if (league.kind === 'solo') return 'data/users/' + me.id + '/solo/' + path;
  if (league.kind === 'custom') return 'leagues/' + league.id + '/' + path;
  return path;
}
const dref = p => db.doc(L(p)), cref = p => db.collection(L(p));
function leagueLabel() { return league.kind === 'solo' ? 'Solo' : league.name || 'League'; }
// ---------------- persistence ----------------
const queues = {};
function queued(key, fn) { const q = (queues[key] || Promise.resolve()).then(fn, fn); queues[key] = q.catch(() => {}); return q; }
async function writeDoc(path, data) {
  if (mode === 'local') { saveLocal(); return; }
  const full = L(path);
  return queued(full, () => db.doc(full).set(data)).catch(e => { if (e && e.code === 'invalid_argument') { me.canWrite = false; render(); toast('You have view-only access, so nothing can be saved. Ask the app owner to make you an Editor from the Share menu.'); } else toast('Could not save. Check your connection and try again.'); throw e; });
}
function teamWrite(tid, patch) {
  const next = Object.assign({}, docs[tid] || {}, patch);
  Object.keys(next).forEach(k => { if (next[k] === undefined) delete next[k]; });
  docs[tid] = next; invalidate(); render();
  return writeDoc('teams/' + tid, next);
}
function saveLocal() { try { localStorage.setItem(LS, JSON.stringify({ meta, S, box, docs, trades, bids, hist, farm, board, draft, dyn })); } catch (e) { /* storage unavailable */ } }
function loadLocal() { try { const o = JSON.parse(localStorage.getItem(LS) || 'null'); if (o) { meta = o.meta; S = o.S; box = o.box; docs = o.docs || {}; trades = o.trades || []; bids = o.bids || {}; hist = o.hist || { seasons: [] }; farm = o.farm || null; board = o.board || {}; draft = o.draft || null; dyn = o.dyn || null; } } catch (e) { /* ignore */ } farmLoaded = true; }
const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));

// ---------------- boot ----------------
async function boot() {
  renderTabs(); render(); startClock();
  try { db = await window.claude.use('db'); } catch (e) { db = null; }
  try { user = await window.claude.use('user'); } catch (e) { user = null; }
  if (db && user) {
    const m = await user.me();
    if (m.id) { me = { id: m.id, name: m.name, avatar: m.avatarUrl, canWrite: (await user.can('data.write')) !== false }; mode = 'shared'; }
  }
  if (mode !== 'shared') { mode = 'local'; me = { id: 'local', name: 'You', avatar: '', canWrite: true }; loadLocal(); loadCareer(); if (meta) initWorld(meta.era || '1997'); try { restoreMultiOwner(); } catch (e) { /* ignore */ } render(); return; }
  db.collection('leagues').onSnapshot(q => { const o = {}; q.docs.forEach(x => { o[x.id] = clone(x.data()); }); leagueList = o; if (league.kind === 'custom' && o[league.id]) league.name = o[league.id].name; render(); }, dbErr);
  watchFeedback();
  subscribeLeague();
  render();
}
function subscribeLeague() {
  unsubs.forEach(f => { try { f(); } catch (e) { /* ignore */ } }); unsubs = [];
  const on = (ref, fn) => { unsubs.push(ref.onSnapshot(fn, dbErr)); };
  on(dref('league/meta'), s => { meta = s.exists ? clone(s.data()) : null; if (meta) { initWorld(meta.era || '1997'); syncFarm(); } render(); });
  on(dref('league/dyn'), s => { dyn = s.exists ? clone(s.data()) : null; applyDynNow(); render(); });
  on(dref('league/farm'), s => { farm = s.exists ? clone(s.data()) : null; farmLoaded = true; syncFarm(); render(); });
  on(dref('league/state'), s => { if (!simming) { S = s.exists ? clone(s.data()) : null; render(); } });
  on(dref('league/box'), s => { box = s.exists ? clone(s.data()) : null; render(); });
  on(cref('teams'), q => { const d = {}; q.docs.forEach(x => { d[x.id] = clone(x.data()); }); docs = d; resolveProfiles(); try { restoreMultiOwner(); } catch (e) { /* ignore */ } render(); });
  on(dref('league/history'), s => { hist = s.exists ? clone(s.data()) : { seasons: [] }; if (legacyBook().length) setTimeout(() => { ensureBook(); }, 0); syncCareer(); if (tab === 'league' && leagueSub === 'history') render(); });
  loadCareer();
  on(cref('board'), q => { const b = {}; q.docs.forEach(x => { b[x.id] = clone(x.data()); }); board = b; render(); });
  on(cref('bids'), q => { const b = {}; q.docs.forEach(x => { b[x.id] = clone(x.data()); }); bids = b; render(); });
  on(dref('league/draft'), s => { draft = s.exists ? clone(s.data()) : null; ensureDraftPlayers(); if (draftOpen) paintDraft(); render(); });
  on(dref('league/gov'), s => { gov = s.exists ? clone(s.data()) : {}; render(); });
  on(cref('clog').orderBy('ts', 'desc').limit(60), q => { clog = q.docs.map(x => Object.assign({ id: x.id }, clone(x.data()))); if (tab === 'league' && leagueSub === 'rules') render(); });
  on(cref('trades').orderBy('ts', 'desc').limit(60), q => { trades = q.docs.map(x => Object.assign({ id: x.id }, clone(x.data()))); resolveProfiles(); render(); });
}
function recentLeagues() {
  let r = []; try { r = JSON.parse(localStorage.getItem('fo-recent') || '[]'); } catch (e) { r = []; }
  const mine = Object.entries(leagueList).filter(([, x]) => !x.closed && (x.commish === me.id || (x.members || []).includes(me.id))).map(([id, x]) => ({ kind: 'custom', id, name: x.name }));
  const all = [{ kind: 'solo', id: 'solo', name: 'Solo' }].concat(r, mine, [{ kind: 'main', id: 'main', name: 'Main league' }]);
  const seen = new Set(), out = [];
  for (const x of all) { const k = x.kind + ':' + x.id; if (seen.has(k)) continue; if (x.kind === 'custom' && leagueList[x.id] && leagueList[x.id].closed) continue; seen.add(k); out.push(x); }
  return out.slice(0, 5);
}
function leagueSwitcher() {
  if (mode !== 'shared') return accessBanner();
  if (WEB && !localGet(claimedKey())) return importCard() + leagueSwitcherBar();
  return leagueSwitcherBar();
}
function leagueSwitcherBar() {
  const chips = recentLeagues().map(x => { const on = league.kind === x.kind && (x.kind !== 'custom' || league.id === x.id); return `<button type="button" class="lgpill${on ? ' on' : ''}" ${on ? 'aria-current="true"' : `data-act="pickleague" data-k="${x.kind}" data-id="${esc(x.id)}" data-name="${esc(x.name)}"`}>${x.kind === 'solo' ? '👤' : '👥'} ${esc(x.kind === 'custom' && leagueList[x.id] ? leagueList[x.id].name : x.name)}</button>`; }).join('');
  return accessBanner() + `<div class="lgbar" role="group" aria-label="Your leagues">${chips}<button type="button" class="lgpill more" data-act="leagues">All leagues…</button></div>`;
}
function accessBanner() {
  if (mode === 'local') return WEB ? `<section class="card alert"><div class="pad row wrap" style="padding-top:12px;gap:10px"><span class="small" style="flex:1;min-width:200px"><b>Playing solo on this device.</b> Sign in to join friends' leagues and keep your seasons on every device.</span><button class="btn primary sm" type="button" onclick="window.foSignIn&&window.foSignIn()">Sign in with Google</button></div></section>` : `<section class="card alert"><div class="pad small" style="padding-top:12px"><b>Playing on this device only.</b> This is a private league saved in this browser. To play solo across devices or join friends' leagues, open the app while signed in to Claude, with the app shared to you as an <b>Editor</b>.</div></section>`;
  if (!me.canWrite) return `<section class="card alert"><div class="pad small" style="padding-top:12px"><b>View only.</b> You can look around, but you can't play yet: no solo league, no claiming a club. Ask the person who shared the app to change your access to <b>Editor</b> from the Share menu, then reload.</div></section>`;
  return '';
}
function switchLeague(lg) {
  if (mode !== 'shared' || simming || busy) return;
  try { const r = JSON.parse(localStorage.getItem('fo-recent') || '[]').filter(x => !(x.kind === lg.kind && x.id === lg.id)); r.unshift({ kind: lg.kind, id: lg.id, name: lg.name }); localStorage.setItem('fo-recent', JSON.stringify(r.slice(0, 6))); } catch (e) { /* ignore */ }
  league = lg;
  try { localStorage.setItem('fo-league', JSON.stringify(lg)); } catch (e) { /* ignore */ }
  meta = null; S = null; box = null; docs = {}; trades = []; bids = {}; hist = { seasons: [] }; farm = null; farmLoaded = false; board = {}; dyn = null;
  anaCache = null; raceProjCache = null; lastRecap = null; tradeGive.clear(); tradeGet.clear(); tradeCash = 0; tradePartner = null; teamView = null; nego = null; bidDraft = null;
  tab = 'desk'; closeModal(); invalidate();
  subscribeLeague(); renderTabs(); render(); window.scrollTo(0, 0);
  toast('Now playing: ' + leagueLabel() + '.');
}
function makeCode() { const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let c = ''; for (let i = 0; i < 5; i++) c += A[Math.floor(Math.random() * A.length)]; return Object.values(leagueList).some(x => x.code === c) ? makeCode() : c; }
async function createLeague() {
  const inp = $('#newLg'), name = ((inp && inp.value) || '').trim().slice(0, 40);
  if (!name) { toast('Give the league a name first.'); return; }
  const id = 'L' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
  const rec = { name, commish: me.id, created: Date.now(), code: makeCode(), members: [me.id] };
  try { await db.doc('leagues/' + id).set(rec); } catch (e) { toast('Could not create the league. You need edit access to this app.'); return; }
  leagueList[id] = rec;
  switchLeague({ kind: 'custom', id, name });
  setTimeout(() => openInvite(), 400);
}
function joinByCode() {
  const c = (($('#joinCode') && $('#joinCode').value) || '').trim().toUpperCase();
  const hit = Object.entries(leagueList).find(([, x]) => x.code === c && !x.closed);
  if (!hit) { toast('No league with that code. Check it with your commissioner.'); return; }
  switchLeague({ kind: 'custom', id: hit[0], name: hit[1].name });
}
// remember who belongs to a friends league, so it shows under "Your leagues"
async function noteMember() {
  if (mode !== 'shared' || league.kind !== 'custom') return;
  const rec = leagueList[league.id]; if (!rec || (rec.members || []).includes(me.id)) return;
  const next = Object.assign({}, rec, { members: (rec.members || []).concat([me.id]) });
  leagueList[league.id] = next;
  try { await db.doc('leagues/' + league.id).set(next); } catch (e) { /* not fatal */ }
}
const WEB = !!window.foWeb;
const APP_URL = WEB ? location.origin + location.pathname : '';
function inviteText(rec) { return WEB ? `Join my baseball league "${rec.name}" in Front Office: ${APP_URL} Sign in with Google, tap the league button at the top, and enter code ${rec.code}.` : `Join my baseball league "${rec.name}" in Front Office. Open the app, tap the league button at the top, and enter code ${rec.code}.`; }
function openInvite() {
  if (league.kind !== 'custom') { openLeaguePicker(); return; }
  const rec = leagueList[league.id]; if (!rec) return;
  const mine = rec.commish === me.id;
  openModal('Invite friends', `<div class="pad" style="padding-top:12px;display:grid;gap:12px">
    <div class="small">League code for <b>${esc(rec.name)}</b></div>
    <div class="code num">${esc(rec.code || '—')}</div>
    <textarea id="invTxt" readonly rows="4" style="width:100%;font:inherit;padding:10px;border:1px solid var(--line);border-radius:8px;background:var(--paper);color:var(--ink)">${esc(inviteText(rec))}</textarea>
    <div class="row wrap"><button class="btn primary" type="button" data-act="copyinv">Copy invite message</button></div>
    <ol class="small" style="margin:0;padding-left:18px;display:grid;gap:4px"><li>Send them the message by text or email.</li><li>${WEB ? 'They open the link and sign in with Google.' : "They need access to this app: the app's owner shares it with them as an <b>Editor</b> from the Share menu."}</li><li>They tap the league button at the top, enter the code and claim a club.</li>${mine ? '<li>Once everyone is in, lock the league from League → Standings.</li>' : ''}</ol></div>`);
}
async function copyInvite() {
  const t = $('#invTxt'); if (!t) return;
  try { await navigator.clipboard.writeText(t.value); toast('Invite copied.'); }
  catch (e) { t.focus(); t.select(); try { document.execCommand('copy'); toast('Invite copied.'); } catch (x) { toast('Select the text and copy it.'); } }
}
async function closeLeague(id) {
  const rec = leagueList[id]; if (!rec || rec.commish !== me.id) return;
  const el = document.querySelector(`[data-act="closelg"][data-id="${id}"]`);
  if (el && el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.textContent = 'Tap again to close'; return; }
  const next = Object.assign({}, rec, { closed: true }); leagueList[id] = next;
  try { await db.doc('leagues/' + id).set(next); } catch (e) { toast('Could not close it.'); return; }
  if (league.kind === 'custom' && league.id === id) switchLeague({ kind: 'solo', id: 'solo', name: 'Solo' });
  else openLeaguePicker();
  toast(`${rec.name} is closed.`);
}
async function reopenLeague(id) {
  const rec = leagueList[id]; if (!rec || rec.commish !== me.id) return;
  const next = Object.assign({}, rec); delete next.closed; leagueList[id] = next;
  try { await db.doc('leagues/' + id).set(next); } catch (e) { toast('Could not reopen it.'); return; }
  toast(`${rec.name} is open again.`); openLeaguePicker();
}
// Permanently erase a friends league: every saved document under it, then its listing.
async function deleteLeague(id, dopts) {
  const rec = leagueList[id]; if (!rec || rec.commish !== me.id || busy || simming) return;
  const others = (rec.members || []).filter(m => m !== me.id).length;
  const el = document.querySelector(`[data-act="dellg"][data-id="${id}"]`);
  if (el && el.dataset.confirm !== '1' && !(dopts && dopts.voted)) { el.dataset.confirm = '1'; el.textContent = others && !rec.closed ? 'Tap again to ask the league' : 'Tap again: erase everything'; return; }
  if (others && !rec.closed && !(dopts && dopts.voted)) {
    if (league.kind === 'custom' && league.id === id) { closeModal(); await proposeVote('delete', { id }, `delete ${rec.name} for good`); }
    else toast(`Open ${rec.name} first. Its other GMs vote on deleting it, or close it so it can be deleted.`);
    return;
  }
  if (league.kind === 'custom' && league.id === id) switchLeague({ kind: 'solo', id: 'solo', name: 'Solo' });
  busy = true; toast(`Deleting ${rec.name}…`);
  try {
    const base = 'leagues/' + id + '/';
    for (const c of ['teams', 'trades', 'bids', 'board', 'fa', 'clog']) {
      try { const q = await db.collection(base + c).get(); for (const d of q.docs) { try { await db.doc(base + c + '/' + d.id).delete(); } catch (e) { /* keep going */ } } } catch (e) { /* empty or unreadable */ }
    }
    for (const d of ['meta', 'state', 'box', 'history', 'farm', 'lock', 'clock', 'gov', 'draft']) { try { await db.doc(base + 'league/' + d).delete(); } catch (e) { /* not there */ } }
    await db.doc('leagues/' + id).delete();
    delete leagueList[id];
    try { const r = JSON.parse(localStorage.getItem('fo-recent') || '[]').filter(x => x.id !== id); localStorage.setItem('fo-recent', JSON.stringify(r)); } catch (e) { /* ignore */ }
    toast(`${rec.name} was deleted for good.`);
  } catch (e) { toast('Could not finish deleting. Try again.'); } finally { busy = false; }
  render(); openLeaguePicker();
}
function openLeaguePicker() {
  if (mode !== 'shared') return;
  const cur = (k, id) => league.kind === k && (k !== 'custom' || league.id === id);
  const all = Object.entries(leagueList).filter(([, x]) => !x.closed).sort((a, b) => (b[1].created || 0) - (a[1].created || 0));
  const isMine = x => x.commish === me.id || (x.members || []).includes(me.id);
  const row = (k, id, name, sub, extra) => `<div class="item"><div class="nm"><b>${esc(name)}</b><span class="s">${sub}</span></div><span class="ctrls">${extra || ''}${cur(k, id) ? '<span class="tag mine">Playing</span>' : `<button class="btn sm primary" type="button" data-act="pickleague" data-k="${k}" data-id="${esc(id)}" data-name="${esc(name)}">Open</button>`}</span></div>`;
  const lgRow = ([id, x]) => row('custom', id, x.name || 'League', `${x.commish === me.id ? 'You are the commissioner' : 'Commissioner: ' + esc(ownerName(x.commish))} · ${(x.members || []).length} GM${(x.members || []).length === 1 ? '' : 's'}${x.commish === me.id ? ' · code ' + esc(x.code || '') : ''}`, x.commish === me.id ? `<button class="btn sm ghost" type="button" data-act="closelg" data-id="${esc(id)}">Close</button><button class="btn sm ghost danger" type="button" data-act="dellg" data-id="${esc(id)}">Delete</button>` : '');
  const closedMine = Object.entries(leagueList).filter(([, x]) => x.closed && x.commish === me.id);
  const closedRow = ([id, x]) => `<div class="item"><div class="nm"><b>${esc(x.name || 'League')}</b><span class="s">Closed · ${(x.members || []).length} GM${(x.members || []).length === 1 ? '' : 's'}</span></div><span class="ctrls"><button class="btn sm" type="button" data-act="reopenlg" data-id="${esc(id)}">Reopen</button><button class="btn sm ghost danger" type="button" data-act="dellg" data-id="${esc(id)}">Delete forever</button></span></div>`;
  const mine = all.filter(([, x]) => isMine(x)), others = all.filter(([, x]) => !isMine(x));
  const body = `<div class="pad small muted" style="padding-top:12px">Every league has its own rosters, standings, money and GM Race. Anyone can start one and be its commissioner.</div>
    <h4 class="h2" style="font-size:15px;padding-top:14px">Your leagues</h4><div class="list">
      ${row('solo', 'solo', 'Solo league', 'Private: only you can see it.')}
      ${row('main', 'main', 'Main league', 'The original league for everyone with access to this app.')}
      ${mine.map(lgRow).join('')}</div>
    <div class="pad" style="display:grid;gap:8px;padding-top:14px"><b>Join with a code</b><div class="row"><input type="text" id="joinCode" maxlength="5" placeholder="ABCDE" style="flex:1;min-width:0;text-transform:uppercase;letter-spacing:.15em"><button class="btn" type="button" data-act="joincode">Join</button></div></div>
    <div class="pad" style="display:grid;gap:8px;padding-top:14px"><b>Start a new league</b><div class="row"><input type="text" id="newLg" maxlength="40" placeholder="Name it, like “Thursday Night League”" style="flex:1;min-width:0"><button class="btn primary" type="button" data-act="createleague">Create</button></div><span class="small muted">You'll be its commissioner and get a code to invite friends.</span></div>
    ${closedMine.length ? `<h4 class="h2" style="font-size:15px;padding-top:14px">Closed leagues you started</h4><div class="pad small muted" style="padding-top:0;padding-bottom:6px">Reopen one to bring it back with everything saved, or delete it forever to erase rosters, standings, trades and history for everyone.</div><div class="list">${closedMine.map(closedRow).join('')}</div>` : ''}
    ${others.length ? `<details class="pad" style="padding-top:14px"><summary class="small" style="cursor:pointer"><b>Browse other leagues</b> (${others.length})</summary><div class="list" style="margin-top:8px">${others.map(lgRow).join('')}</div></details>` : ''}
    ${league.kind === 'custom' && leagueList[league.id] ? `<div class="pad" style="padding-top:14px"><button class="btn" type="button" data-act="invite">Invite friends to ${esc(leagueLabel())}</button></div>` : ''}`;
  const ids = all.map(([, x]) => x.commish).filter(Boolean);
  if (ids.length) resolveProfilesFor(ids);
  openModal('Your leagues', body + (!WEB ? `<div class="pad small row wrap" style="padding-top:12px;border-top:1px solid var(--line);gap:8px"><span style="flex:1;min-width:180px"><b>Moving to the new site?</b> Send your solo league over so it comes with you.</span><button class="btn sm" type="button" data-act="sendsolo">Send my solo league</button></div>` : '') + (WEB ? `<div class="pad small muted row wrap" style="padding-top:12px;border-top:1px solid var(--line);gap:8px"><span style="flex:1">Signed in as <b>${esc(me.name || 'you')}</b></span><button class="btn sm ghost" type="button" onclick="window.foSignOut&&window.foSignOut()">Sign out</button></div>` : ''));
}
async function resolveProfilesFor(ids) { if (!user || !ids.length) return; try { const ps = await user.profiles(ids.filter(Boolean)); Object.assign(profiles, ps); } catch (e) { /* ignore */ } }
function dbErr(e) { if (e && e.code === 'revoked') toast('This league is no longer shared with you.'); }
async function resolveProfiles() {
  if (!user) return;
  const ids = new Set(); TEAMS.forEach(t => { const o = ownerOf(t.id); if (o) ids.add(o); }); if (meta && meta.commish) ids.add(meta.commish);
  if (!ids.size) return;
  profiles = await user.profiles([...ids]); render();
}
const ownerName = id => id === me.id ? 'You' : ((profiles[id] && profiles[id].name) || 'A friend');
const ownerAv = id => (profiles[id] && profiles[id].avatarUrl) || '';

// ---------------- league lifecycle ----------------
// Commissioner: wipe the league and start fresh with either set of rosters. GMs keep their club when it exists in both.
async function resetLeague(era, el, ropts) {
  if (!isCommish() || busy) return;
  if (el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.textContent = multiGM() && !(ropts && ropts.voted) ? 'Tap again to ask the league' : 'Tap again to start over'; return; }
  const keepBox = $('#keepClubs'), keep = keepBox && !(ropts && ropts.voted) ? keepBox.checked : el.dataset.keep === '1';
  if (multiGM() && !(ropts && ropts.voted)) { closeModal(); await proposeVote('reset', { era, keep }, `start the league over with ${era === '1997' ? '1997' : '2026'} rosters${keep ? '' : ' (everyone picks a club again)'}`); return; }
  if (mode === 'shared') logC(`Reset the league with ${era === '1997' ? '1997' : '2026'} rosters`);
  busy = true; toast('Starting a new league…');
  try {
    const oldDocs = Object.assign({}, docs);
    FO.setEra(era === '1997' ? '1997' : '2026');
    const keepIds = new Set(FO.TEAMS.map(t => t.id));
    curEra = null; W = null;
    for (const k of Object.keys(bids)) { delete bids[k]; await deleteDoc('bids/' + k); }
    for (const t of trades.slice()) { await deleteDoc('trades/' + t.id); }
    for (const k of Object.keys(board)) { delete board[k]; await deleteDoc('board/' + k); }
    draft = null; if (mode !== 'local') await deleteDoc('league/draft');
    trades = []; hist = { seasons: [], book: (hist && hist.book) || [], gm: (hist && hist.gm) || {} }; lastRecap = null; anaCache = null; raceProjCache = null; // the record book and all-time GM totals survive a reset
    if (mode !== 'local') await writeDoc('league/history', hist);
    const nd = {};
    for (const id of Object.keys(oldDocs)) {
      const o = oldDocs[id] && oldDocs[id].owner;
      if (o && keep && keepIds.has(id)) { nd[id] = { owner: o }; if (mode !== 'local') await dref('teams/' + id).set({ owner: o }); }
      else if (mode !== 'local') await deleteDoc('teams/' + id);
    }
    docs = nd;
    const locked = meta && meta.locked, openSim = meta && meta.openSim;
    const keepLen = meta && meta.len;
    await startLeague(era, { locked, openSim, quiet: true, len: keepLen });
    closeModal(); tab = 'desk'; renderTabs(); render(); window.scrollTo(0, 0);
    toast('New league started with ' + (era === '1997' ? '1997' : '2026') + ' rosters.' + (keep ? '' : ' Pick your club.'));
    if (!keep) setTimeout(() => openClaim(), 300);
  } finally { busy = false; }
}
function openReset() {
  if (!isCommish()) return;
  const where = mode === 'local' ? 'this device' : league.kind === 'solo' ? 'your solo league' : esc(leagueLabel());
  openModal('Start over', `<div class="pad" style="padding-top:12px;display:grid;gap:12px"><p class="small" style="margin:0">This wipes <b>${where}</b>: standings, stats, trades, contracts, money, the farm and the GM Race for this season. Other leagues aren't touched.</p>
    <label class="sw"><span class="nm"><b>Keep everyone on their clubs</b><span class="s">Off: everyone, you included, picks a club again after the reset.</span></span><input type="checkbox" role="switch" id="keepClubs" ${TEAMS.filter(t => ownerOf(t.id)).length > 1 ? 'checked' : ''}><i aria-hidden="true"></i></label>
    <p class="small muted" style="margin:0">Tap a button twice to confirm.</p>
    <div class="row wrap"><button class="btn primary" type="button" data-act="reset" data-era="2026">New season, 2026 rosters</button><button class="btn" type="button" data-act="reset" data-era="1997">New season, 1997 rosters</button></div></div>`);
}
async function startLeague(era, opts) {
  era = era === '1997' ? '1997' : '2026';
  initWorld(era);
  const seed = (Math.random() * 4294967295) >>> 0;
  opts = opts || {};
  meta = { commish: me.id, seed, created: Date.now(), openSim: !!opts.openSim, locked: !!opts.locked, season: 1, era, len: opts.len || 162 };
  const lenSel = document.getElementById('lenSel'); if (lenSel) meta.len = +lenSel.value;
  S = FO.newState(seed, meta.len || 162); box = { day: 0, games: [] };
  farm = null; farmLoaded = true; syncFarm();
  if (mode === 'local') { saveLocal(); render(); if (!opts.quiet) openClaim(); return; }
  await writeDoc('league/meta', meta); await writeDoc('league/state', S); await writeDoc('league/box', box);
  render(); if (!opts.quiet) openClaim();
}
async function newSeason() {
  const seed = (Math.random() * 4294967295) >>> 0;
  meta = Object.assign({}, meta, { seed, season: (meta.season || 1) + 1 });
  S = FO.newState(seed); box = null;
  if (mode === 'local') { saveLocal(); render(); return; }
  await writeDoc('league/meta', meta); await writeDoc('league/state', S); await writeDoc('league/box', { day: 0, games: [] });
  toast('New season started. Rosters and trades carry over.');
}
var schedSeed = null;
function sched() { if (!meta) return null; if (schedSeed !== meta.seed) { W.sched = FO.buildSchedule(meta.seed); schedSeed = meta.seed; } return W.sched; }

async function claim(tid) {
  if (locked()) { toast('The commissioner has locked the league. Ask them to unlock it to change teams.'); return; }
  if (ownerOf(tid) && ownerOf(tid) !== me.id) { toast(TEAM[tid].city + ' already has a GM.'); return; }
  const mine = myTeam();
  if (mode === 'shared') {
    const ref = dref('teams/' + tid);
    const lease = await ref.acquire({ holder: me.id, ttlMs: 5000 });
    if (!lease.acquired) { toast('Someone is claiming that team right now.'); return; }
    const cur = await ref.get();
    const d = cur.exists ? clone(cur.data()) : {};
    if (d.owner && d.owner !== me.id) { toast(TEAM[tid].city + ' was just claimed.'); return; }
    if (mine && mine !== tid) await teamWrite(mine, { owner: null });
    docs[tid] = d; await teamWrite(tid, { owner: me.id });
  } else {
    if (mine && mine !== tid) await teamWrite(mine, { owner: null });
    await teamWrite(tid, { owner: me.id });
  }
  closeModal(); teamView = tid; tab = 'team'; renderTabs(); render();
  noteMember();
  toast('You are now the GM of ' + TEAM[tid].city + '.');
}
async function release() { const m = myTeam(); if (!m) return; if (locked()) { toast('The league is locked. Ask the commissioner if you want to step down.'); return; } await teamWrite(m, { owner: null, lineup: undefined, rotation: undefined, closer: undefined }); closeModal(); toast('You stepped down. The computer runs that club again.'); }

// ---------------- sim ----------------
async function sim(days, opts) {
  opts = opts || {};
  if (simming || !S || (!canSim() && !opts.auto)) return;
  if (!opts.auto && !opts.call && needsCall('sim')) { callSim('sim', days); return; }
  sched();
  let lock = null;
  if (mode === 'shared') {
    lock = await dref('league/lock').acquire({ holder: me.id, ttlMs: 120000 });
    if (!lock.acquired) { toast('Another sim is already running.'); return; }
    const fresh = await dref('league/state').get(); if (fresh.exists) S = clone(fresh.data());
  }
  const work = clone(S);
  const pre = recapBefore(myTeam());
  if (pre) { const rr = raceTable().sort((a, b) => b.total - a.total); pre.rank = rr.findIndex(r => r.tid === pre.tid) + 1; pre.ready = farmOf(pre.tid).filter(id => isReady(id)); }
  clearSimNotes();
  const prePaper = { champ: S.post && S.post.champ, ws: !!(S.post && S.post.rounds.some(r => r.name === 'World Series')), phase: S.phase, day: S.day, streak: {} };
  TEAMS.forEach(t => { const m = ((S.res && S.res[t.id]) || '').match(/W+$/); prePaper.streak[t.id] = m ? m[0].length : 0; });
  let lastBoxes = null, lastDay = work.day;
  const total = days;
  simming = { label: 'Simulating…', pct: 0 }; render();
  for (let i = 0; i < total; i++) {
    let b = null;
    if (work.phase === 'season') { lastDay = work.day; b = FO.simDay(W, work, docs); }
    else if (work.phase === 'post') { lastDay = work.day; b = FO.simPostGame(W, work, docs); }
    else break;
    if (b) { lastBoxes = b; recapGame(pre, b); try { countRivalry(work, b); } catch (e) { /* optional */ } }
    if (i % 4 === 3 || i === total - 1) { simming = { label: work.phase === 'season' ? 'Through ' + FO.dateOf(work.day - 1) : 'Postseason', pct: (i + 1) / total }; paintSimBar(); await new Promise(r => setTimeout(r, 0)); }
    if (work.phase === 'post' && S.phase === 'season' && total > 1 && days !== 999) break; // stop at end of regular season
  }
  S = work; simming = null;
  try { snapRace(); } catch (e) { /* optional */ }
  let fresh = [];
  try { fresh = makePapers(prePaper); if (fresh.length) S.papers = (S.papers || []).concat(fresh).slice(-40); } catch (e) { fresh = []; }
  box = { day: lastDay, post: S.phase !== 'season' && lastDay >= LEN(), games: lastBoxes || [] };
  try { await aiActivity(days); } catch (e) { /* AI moves are optional */ }
  if (mode === 'local') { saveLocal(); }
  else { try { await writeDoc('league/state', S); await writeDoc('league/box', box); } catch (e) { /* toast shown */ } }
  render();
  try { await runAutopilot(); } catch (e) { /* optional */ }
  const mine = fresh.filter(p => p.tid === myTeam() || p.kind === 'champ' || p.kind === 'wsset');
  if (pre && pre.games.length) { try { lastRecap = buildRecap(pre, days); lastRecap.fresh = !!mine.length; } catch (e) { lastRecap = null; } }
  try { simNotes(pre, mine, days); } catch (e) { /* notes are optional */ }
  if (!opts.auto && multiGM()) logC(`Simmed ${days >= 999 ? 'to the end of the stretch' : days + ' game day' + (days > 1 ? 's' : '')}, now ${S.phase === 'season' ? FO.dateOf(Math.max(0, S.day - 1)) : S.phase}`);
  render();
  if (opts.watch) { const wi = myGameIndex(myTeam()); if (wi >= 0) { watchGame(wi); return; } }
  if (!opts.auto && unseenNotes(tab)) window.scrollTo({ top: 0, behavior: 'smooth' });
}
function paintSimBar() { const b = $('#simbar'); if (b && simming) { b.style.width = Math.round(simming.pct * 100) + '%'; const l = $('#simlabel'); if (l) l.textContent = simming.label; } }

// ---------------- helpers for stats ----------------
function batLine(id) { return (S && S.bat[id]) || null; }
function pitLine(id) { return (S && S.pit[id]) || null; }
function quickBat(id) { const a = batLine(id); if (!a || !a[2]) return '—'; return `${fmt3(a[4] / a[2])} ${a[7]} HR ${a[8]} RBI`; }
function quickPit(id) { const a = pitLine(id); if (!a || !a[5]) return '—'; return `${a[2]}-${a[3]} ${(a[7] * 27 / a[5]).toFixed(2)} ERA${a[4] ? ' ' + a[4] + ' SV' : ''}`; }
function quick(id) { return P[id].t === 'H' ? quickBat(id) : quickPit(id); }
function ovrClass(o) { return o >= 85 ? 'ovr top' : o >= 72 ? 'ovr hi' : 'ovr'; }
function payroll(tid) { const su = setup(tid); return su.roster.concat(su.minors || []).reduce((a, id) => a + FO.salOf(W, su.con, id), 0); }
function minorsOf(tid) { return (docs[tid] && docs[tid].minors) || []; }
const canOption = id => P[id] && (P[id].pros || P[id].age <= 27);
function rec(tid) { const s = S ? S.std[tid] : null; return s ? s[0] + '-' + s[1] : '0-0'; }
function teamLabel(tid) { return `<span class="abbr">${esc(tid)}</span> <span class="muted small city">${esc(TEAM[tid].city)}</span>`; }

// ---------------- render ----------------
function render() {
  invalidate();
  const d = $('#date');
  const yr = yearOf(seasonNo());
  if (S) d.textContent = S.phase === 'season' ? (S.day === 0 ? 'Preseason · Opening Day ' + FO.dateOf(0) + ', ' + yr : FO.dateOf(S.day - 1) + ', ' + yr + ' · Day ' + S.day + '/' + LEN()) : S.phase === 'post' ? 'October ' + yr + ' · Postseason' : S.phase === 'offseason' ? 'Winter ' + yr + ' · Free agency' : 'Season complete';
  else d.textContent = 'Pick a season to play';
  document.querySelectorAll('.brand span, .sidebrand span').forEach(x => { x.textContent = "'" + String(meta ? yearOf(1) : 1997).slice(2); });
  const rc = $('#resetChip'); if (rc) rc.hidden = !(meta && isCommish());
  const lc = $('#lgChip'); if (lc) { lc.hidden = mode !== 'shared'; lc.innerHTML = `${league.kind === 'solo' ? '👤' : '👥'} <span>${esc(leagueLabel())}</span> ▾`; }
  const chip = $('#meChip'), mt = myTeam();
  chip.hidden = !meta;
  chip.innerHTML = (me.avatar ? `<img alt="" src="${esc(me.avatar)}">` : '') + (mt ? `<span class="abbr">${esc(mt)}</span>` : 'Pick a team');
  const m = $('#main');
  if (mode === 'loading') { m.innerHTML = `<section class="card"><div class="empty">Loading rosters…</div></section>`; return; }
  if (!simming) markSeen(tab);
  if (tab === 'team' || tab === 'trade' || tab === 'office') localSet('seen-' + tab, '1');
  try { touchSeen(); } catch (e) { /* optional */ }
  renderSimBar(); renderTabs();
  if (!meta || !S) { m.innerHTML = viewStart(); return; }
  if ((S.phase === 'done' || S.phase === 'offseason') && S.std && !TEAMS.some(t => !S.std[t.id])) setTimeout(() => { ensureBook(); }, 0);
  if (TEAMS.some(t => !S.std[t.id])) { m.innerHTML = `<section class="card"><div class="empty">Loading the new league…</div></section>`; return; } // era switch in flight
  sched();
  const v = { desk: viewDesk, office: viewOffice, feedback: viewFeedback, team: viewTeam, league: viewLeagueHub, trade: viewMarket, race: () => viewRace() + viewPastRaces() }[tab] || viewDesk;
  const dkey = (d, i) => tab + ':' + d.className + ':' + i, openNow = new Set([...m.querySelectorAll('details')].map((d, i) => d.open ? dkey(d, i) : '').filter(Boolean));
  m.innerHTML = (myTeam() ? notesHTML(tab) : '') + v();
  if (openNow.size) m.querySelectorAll('details').forEach((d, i) => { if (openNow.has(dkey(d, i))) d.open = true; }); // keep open sections open across updates
  paintSimBar();
  if (!simming && myTeam() && (autoOf(myTeam()).biz || autoOf(myTeam()).farm)) setTimeout(() => { runAutopilot(); }, 50);
  if (autoOn() && !clockBusy && (meta.auto.done || 0) < dueUpdates()) setTimeout(() => { clockTick(); }, 400);
}

function viewStart() {
  const reg = league.kind === 'custom' ? leagueList[league.id] : null;
  const can = me.canWrite && (!reg || reg.commish === me.id);
  return leagueSwitcher() + `<section class="board">
    <div class="meta">${mode === 'local' ? 'Solo league on this device' : league.kind === 'solo' ? 'Solo league · private to you' : esc(leagueLabel()) + ' · with friends'}</div>
    <div class="big">Pick your season</div>
    <div class="small" style="color:var(--board-dim)">Claim a club, set the lineup, work the phones for trades, sign free agents and watch the gate. ${WEB ? 'Friends who open the link and sign in can claim the other clubs' : 'Friends you share this page with can claim the other clubs'}; the computer runs the rest.</div>
    ${can ? `<label class="small" style="color:var(--board-dim);display:grid;gap:4px;max-width:260px">Season length<select id="lenSel">${SEASON_LENS.map(([v, l]) => `<option value="${v}" ${v === 162 ? 'selected' : ''}>${l}</option>`).join('')}</select></label><div class="row wrap"><button class="btn primary" data-act="start" data-era="2026" type="button">Start with 2026 rosters</button><button class="btn" data-act="start" data-era="1997" type="button">Classic 1997 rosters</button></div>` : `<div class="small" style="color:var(--board-dim)">Waiting for the commissioner${reg ? ' (' + esc(ownerName(reg.commish)) + ')' : ''} to start the league.</div>`}
  ${mode === 'shared' ? `<div class="small" style="color:var(--board-dim)">${league.kind === 'solo' ? 'Only you can see this league.' : 'Anyone you share this app with can open this league and claim a club.'} <button class="lnk" type="button" data-act="leagues" style="color:inherit">Switch league</button></div>` : ''}
  </section>
  <section class="card"><h2>The two seasons</h2><div class="pad small">
    <p style="margin:0 0 8px"><b>2026:</b> all 30 clubs as they finished the 2026 season, rated from their real 2026 stats. Universal DH, 12-team playoffs with a Wild Card Series, and modern payrolls.</p>
    <p style="margin:0 0 8px"><b>1997:</b> the 28 clubs of 1997, rated from that season's stats. DH in AL parks only, 8-team playoffs.</p>
    <p class="muted" style="margin:0">Salaries are estimates scaled to each club's payroll. Whoever starts the league is the commissioner and runs the calendar.</p>
  </div></section>`;
}

// ---- League tab
function viewLeague() {
  const mt = myTeam();
  let h = viewSimBoard();
  if (!mt && locked()) h += `<section class="card"><h2>League is full</h2><div class="pad small">The commissioner has locked this league, so every club is spoken for. You can still follow the standings, scores and leaders.</div></section>`;
  else if (!mt) h += `<section class="card"><h2>Pick your club</h2><div class="pad small"><p style="margin:0 0 10px">Every team without a GM is run by the computer. Grab one to start managing.</p><button class="btn primary" data-act="claim-open" type="button">Choose a team</button></div></section>`;
  if (S.post) h += viewBracket();
  if (box && box.games && box.games.length) {
    h += `<section class="card"><h2>${box.post ? 'Postseason scores' : 'Scores'}<span class="sub">${box.post ? '' : esc(FO.dateOf(box.day))}</span></h2><div class="scores">` +
      box.games.map((g, i) => {
        const aw = g.as > g.hs, mine = mt && (g.h === mt || g.a === mt);
        return `<button type="button" class="score${mine ? ' mineScore' : ''}" data-act="box" data-i="${i}">
          <span class="ln ${aw ? 'w' : 'l'}"><span>${esc(g.a)}</span><span>${g.as}</span></span>
          <span class="ln ${aw ? 'l' : 'w'}"><span>${esc(g.h)}</span><span>${g.hs}</span></span>
          <span class="f">${g.inn > 9 ? 'F/' + g.inn : 'Final'} · W ${esc(lastName(g.dec[0]))}</span></button>`;
      }).join('') + `</div></section>`;
  }
  h += viewStandings();
  if (S.news.length || trades.length) h += viewFeed();
  h += viewOwners();
  return h;
}
function lastName(id) { if (id == null || !P[id]) return ''; const n = P[id].name.split(' '); return n.length > 1 ? n.slice(1).join(' ').replace(/ Jr\.$/, '') : n[0]; }
function viewSimBoard() {
  const s = S, can = canSim();
  let title, sub;
  if (s.phase === 'season') { title = s.day === 0 ? 'Opening Day' : FO.dateOf(s.day - 1); sub = `${LEN() - s.day} days left in the regular season`; }
  else if (s.phase === 'post') { const rd = s.post.rounds[s.post.cur]; title = rd.name; sub = 'Postseason in progress'; }
  else if (s.phase === 'offseason') { title = 'Free agency'; sub = `${freeAgents().length} players on the market · ${Object.keys(bids).length} offers in`; }
  else { title = TEAM[s.post.champ].city + ' win it all'; sub = yearOf(seasonNo()) + ' World Series champions'; }
  const mt = myTeam();
  let next = '';
  if (mt && s.phase === 'season' && W.sched[s.day]) {
    const g = W.sched[s.day].find(x => x[0] === mt || x[1] === mt);
    if (g) { const home = g[0] === mt, opp = home ? g[1] : g[0]; const su = setup(mt); const sp = su.rotation[(s.gp[mt] || 0) % su.rotation.length]; next = `Next: ${home ? 'vs' : 'at'} ${esc(TEAM[opp].city)} · ${esc(P[sp].name)} starts`; }
  }
  let ctl = '';
  if (simming) ctl = `<div class="meta" id="simlabel">${esc(simming.label)}</div><div class="prog"><i id="simbar"></i></div>`;
  else if (can && s.phase === 'season') ctl = `<div class="row wrap"><button class="btn primary" data-act="sim" data-n="1" type="button">Sim 1 day</button><button class="btn" data-act="sim" data-n="7" type="button">Week</button><button class="btn" data-act="sim" data-n="30" type="button">Month</button><button class="btn" data-act="sim" data-n="${LEN() - s.day}" type="button">Rest of season</button></div>`;
  else if (can && s.phase === 'post') ctl = `<div class="row wrap"><button class="btn primary" data-act="sim" data-n="1" type="button">Play next games</button><button class="btn" data-act="sim" data-n="999" type="button">Finish the postseason</button></div>`;
  else if (s.phase === 'done' && isCommish()) ctl = `<div class="row wrap"><button class="btn primary" data-act="openoff" type="button">Open the offseason</button></div><div class="small" style="color:var(--board-dim)">Contracts that end after ${yearOf(seasonNo())} expire and those players hit the market. GMs then make offers.</div>`;
  else if (s.phase === 'offseason' && isCommish()) ctl = `<div class="row wrap"><button class="btn primary" data-act="closefa" type="button">Close free agency, start ${yearOf(seasonNo() + 1)}</button><button class="btn" data-act="market" type="button">See the market</button></div><div class="small" style="color:var(--board-dim)">Players sign with the best offer, computer clubs bid too, and every club fills out a legal roster. Cash carries over.</div>`;
  else if (s.phase === 'offseason') ctl = `<div class="row wrap"><button class="btn primary" data-act="market" type="button">Make offers</button></div><div class="small" style="color:var(--board-dim)">The commissioner closes free agency and starts the next season.</div>`;
  else if (!can && s.phase !== 'done') ctl = `<div class="small" style="color:var(--board-dim)">The commissioner, ${esc(ownerName(meta.commish))}, advances the calendar.</div>`;
  const opt = isCommish() && mode === 'shared' && (s.phase === 'season' || s.phase === 'post') ? `<label class="small row" style="color:var(--board-dim)"><input type="checkbox" id="openSim" ${meta.openSim ? 'checked' : ''}> Let any GM advance the calendar</label>` : '';
  return `<section class="board"><div class="meta">${mt ? esc(TEAM[mt].city) + ' · ' + rec(mt) : yearOf(seasonNo()) + ' season'}</div><div class="big">${esc(title)}</div><div class="meta">${esc(sub)}</div>${next ? `<div class="small">${next}</div>` : ''}${ctl}${opt}</section>`;
}
function viewStandings() {
  const st = FO.standings(S), mt = myTeam();
  let h = `<section class="card"><h2>Standings<span class="sub"></span></h2><div class="pad"><div class="seg" role="group" aria-label="League"><button type="button" data-act="lg" data-v="AL" aria-pressed="${lgView === 'AL'}">American League</button><button type="button" data-act="lg" data-v="NL" aria-pressed="${lgView === 'NL'}">National League</button></div></div>`;
  for (const div of ['East', 'Central', 'West']) {
    const rows = st[lgView + ' ' + div];
    h += `<div class="scroll"><table><thead><tr><th>${esc(div)}</th><th>W</th><th>L</th><th>Pct</th><th>GB</th><th>Diff</th><th>Strk</th></tr></thead><tbody>` +
      rows.map(r => { const o = ownerOf(r.id); return `<tr class="${r.id === mt ? 'mine' : ''}"><td class="name"><button class="lnk" type="button" data-act="team" data-t="${r.id}">${teamLabel(r.id)}</button>${o ? ` <span class="tag ${o === me.id ? 'red' : 'gold'}">${o === me.id ? 'YOU' : 'GM'}</span>` : ''}</td><td>${r.w}</td><td>${r.l}</td><td>${fmt3(FO.pctOf(r.w, r.l))}</td><td>${r.gb ? r.gb.toFixed(1).replace('.0', '') : '—'}</td><td>${(r.rs - r.ra > 0 ? '+' : '') + (r.rs - r.ra)}</td><td>${r.stk ? (r.stk > 0 ? 'W' + r.stk : 'L' + -r.stk) : '—'}</td></tr>`; }).join('') + `</tbody></table></div>`;
  }
  return h + `</section>`;
}
function viewBracket() {
  const p = S.post;
  return `<section class="card"><h2>Postseason${p.champ ? `<span class="sub">Champion: ${esc(TEAM[p.champ].city)}</span>` : ''}</h2><div class="bracket">` +
    p.rounds.map(rd => `<div class="rd">${esc(rd.name)} · best of ${rd.best}</div>` + rd.series.map(se => `<div class="ser"><span>${esc(se.hi)} <span class="muted">vs</span> ${esc(se.lo)}</span><span>${se.w[0]}–${se.w[1]}</span></div>`).join('')).reverse().join('') + `</div></section>`;
}
function viewFeed() {
  const items = S.news.slice(0, 12).map(n => [n[0] === 0 ? 'Winter' : n[0] <= LEN() ? FO.dateOf(n[0] - 1) : 'Oct', esc(n[1])]);
  const moves = trades.filter(t => (t.status === 'signed' || t.status === 'released') && P[t.pid]).slice(0, 6).map(t => [t.status === 'signed' ? 'Signed' : 'Release', `${esc(TEAM[t.from].city)} ${t.status === 'signed' ? 'sign free agent' : 'release'} ${esc(P[t.pid].name)}`]);
  const tx = moves.concat(trades.filter(t => t.status === 'accepted').slice(0, 8).map(t => ['Trade', `${esc(t.from)} send ${esc(t.give.map(id => P[id].name).join(', '))} to ${esc(t.to)} for ${esc(t.get.map(id => P[id].name).join(', '))}`]));
  return `<section class="card"><h2>Around the league</h2><div class="news">${tx.concat(items).map(([d, t]) => `<div><span class="d">${d}</span><span>${t}</span></div>`).join('')}</div></section>`;
}
function viewOwners() {
  const gms = TEAMS.filter(t => ownerOf(t.id));
  const cm = isCommish() && mode === 'shared';
  const lockCtl = cm ? `<div class="pad row wrap" style="padding-top:12px;border-top:1px solid var(--soft)"><span class="small" style="flex:1;min-width:180px">${meta.locked ? '<b>Locked.</b> Nobody can claim, switch or give up a club. You can still remove a GM.' : '<b>Open.</b> Anyone you share the page with can claim a free club.'}</span><button class="btn sm ${meta.locked ? '' : 'primary'}" type="button" data-act="lock">${meta.locked ? 'Unlock league' : 'Lock league'}</button></div>` : '';
  const schedCtl = isCommish() ? `<div class="pad row wrap" style="padding-top:12px;border-top:1px solid var(--soft)"><span class="small" style="flex:1;min-width:180px"><b>League schedule:</b> ${autoOn() ? 'runs itself. Next update ' + whenText(nextUpdateAt()) + '.' : 'played by hand.'}${tradeDeadlineDay() ? ' Trade deadline ' + FO.dateOf(tradeDeadlineDay() - 1) + '.' : ''}</span><button class="btn sm" type="button" data-act="schedule">${autoOn() ? 'Edit schedule' : 'Set a schedule'}</button></div>` : '';
  const inviteCtl = mode === 'shared' && league.kind === 'custom' && leagueList[league.id] ? `<div class="pad row wrap" style="padding-top:12px;border-top:1px solid var(--soft)"><span class="small" style="flex:1;min-width:180px">League code <b class="num">${esc(leagueList[league.id].code || '')}</b>. Friends enter it from the league button at the top.</span><button class="btn sm" type="button" data-act="invite">Invite friends</button></div>` : '';
  const eraNow = (meta && meta.era) || '1997';
  const resetCtl = isCommish() ? `<div class="pad" style="padding-top:12px;border-top:1px solid var(--soft);display:grid;gap:8px"><span class="small"><b>Start a new league.</b> Wipes standings, stats, trades and contracts. GMs keep their club if it exists in the new rosters. This league uses ${eraNow} rosters.</span><span class="row wrap"><button class="btn sm" type="button" data-act="reset" data-era="2026" data-keep="1">New league, 2026 rosters</button><button class="btn sm" type="button" data-act="reset" data-era="1997" data-keep="1">New league, 1997 rosters</button><button class="btn sm ghost" type="button" data-act="resetopen">More reset options</button></span></div>` : '';
  return `<section class="card"><h2>General managers<span class="sub">${meta.locked ? '<span class="tag gold">Locked</span> ' : ''}${gms.length} of ${TEAMS.length} clubs</span></h2>
    <div class="list">${gms.length ? gms.map(t => { const o = ownerOf(t.id); return `<div class="item">${ownerAv(o) ? `<img class="av" alt="" src="${esc(ownerAv(o))}">` : `<span class="av" style="background:var(--soft);display:inline-block"></span>`}<div class="nm"><b>${esc(ownerName(o))}</b><span class="s">${esc(t.city)} · ${rec(t.id)}</span></div><span class="row"><span class="abbr">${t.id}</span>${cm && o !== me.id ? `<button class="btn sm ghost" type="button" data-act="kick" data-t="${t.id}">Remove</button>` : ''}</span></div>`; }).join('') : '<div class="empty">No GMs yet.</div>'}</div>${schedCtl}${inviteCtl}${lockCtl}${resetCtl}
    <div class="pad small muted" style="padding-top:10px">${mode === 'local' ? 'This is a solo league saved in this browser.' : `${WEB ? 'To invite friends, send them the link. Each friend signs in with Google and claims a club.' : 'To invite friends, share this page with them as editors. Each friend opens the link and claims a club.'}${isCommish() ? '' : ` Commissioner: ${esc(ownerName(meta.commish))}.`}`}</div></section>`;
}

// ---- Team tab
function viewTeam() {
  const mt = myTeam();
  const tid = teamView || mt || 'SEA';
  const su = setup(tid), edit = tid === mt && S.phase !== 'done';
  const s = S.std[tid], o = ownerOf(tid);
  const hit = su.roster.filter(id => P[id].t === 'H');
  const inLine = new Set(su.lineup.map(x => x[0]));
  const bench = hit.filter(id => !inLine.has(id)).sort((a, b) => P[b].ovr - P[a].ovr);
  const custom = docs[tid] && (docs[tid].lineup || docs[tid].rotation || docs[tid].closer != null);
  let h = `<section class="card"><div class="pad" style="padding-top:12px"><label class="small muted" for="teamSel">Club</label>
    <select id="teamSel" style="width:100%;margin-top:4px">${TEAMS.map(t => `<option value="${t.id}" ${t.id === tid ? 'selected' : ''}>${t.city} (${t.id})${t.id === mt ? ' — yours' : ''}</option>`).join('')}</select></div>
    <div class="kv"><div><span>Record</span><b>${s[0]}-${s[1]}</b></div><div><span>Run diff</span><b>${(s[2] - s[3] > 0 ? '+' : '') + (s[2] - s[3])}</b></div><div><span>Payroll</span><b>${money(payroll(tid))}</b></div><div><span>GM</span><b style="font:600 15px var(--body)">${o ? esc(ownerName(o)) : 'Computer'}</b></div></div>
    ${edit ? `<div class="pad row wrap" style="padding-top:12px"><span class="small muted" style="flex:1;min-width:160px">${custom ? 'You are setting this lineup and staff.' : 'Lineup and staff are on auto. Change anything to take over.'}</span>${custom ? `<button class="btn sm" data-act="auto" type="button">Back to auto</button>` : ''}${locked() ? '' : '<button class="btn sm" data-act="claim-open" type="button">Change club</button><button class="btn sm ghost" data-act="release" type="button">Step down</button>'}</div>`
      : (!mt && !locked() ? `<div class="pad" style="padding-top:12px">${o ? '' : `<button class="btn primary" data-act="claim" data-t="${tid}" type="button">Become GM of ${esc(TEAM[tid].city)}</button>`}</div>` : '')}
  </section>`;
  h += `<section class="card"><div class="pad" style="padding-top:12px"><div class="seg" role="group" aria-label="Roster view"><button type="button" data-act="rm" data-v="depth" aria-pressed="${rosterMode === 'depth'}">Depth chart</button><button type="button" data-act="rm" data-v="sheet" aria-pressed="${rosterMode === 'sheet'}">Ratings sheet</button></div></div></section>`;
  if (rosterMode === 'sheet') return h + viewRatings(tid) + viewFarm(tid);
  const hurtInLineup = su.lineup.filter(([id]) => injDays(id));
  if (edit) h += coachCard(tid, custom);
  const plan = edit && custom ? coachPlan(tid) : null;
  const startTip = {}; if (plan) { for (const x of plan.lu) if (!x.moving) startTip[x.pid] = x.pos; }
  // lineup
  const posOpts = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
  const covered = new Set(su.lineup.map(x => x[1]));
  const missing = posOpts.filter(p => !covered.has(p));
  h += `<section class="card"><h2>Batting order<span class="sub">${edit ? 'Drag ⠿ to reorder or onto the bench · ' : ''}${TEAM[tid].lg === 'AL' ? 'DH used at home' : 'Pitcher bats in NL parks'}</span></h2>${missing.length ? `<div class="pad warn" style="padding-bottom:8px">Nobody is playing ${missing.join(', ')}.</div>` : ''}${hurtInLineup.length ? `<div class="pad warn" style="padding-bottom:8px">${hurtInLineup.map(([id]) => esc(P[id].name)).join(', ')} ${hurtInLineup.length > 1 ? 'are' : 'is'} hurt. The best healthy bench player fills in until ${hurtInLineup.length > 1 ? 'they return' : 'he returns'}.</div>` : ''}<div class="list" data-zone="lu">` +
    su.lineup.map(([id, pos], i) => {
      const p = P[id], fit = FO.canPlay(p, pos) ? '' : ' <span class="tag red">Out of position</span>';
      const ctl = edit ? `<div class="ctrls"><select aria-label="Position for ${esc(p.name)}" data-act="pos" data-i="${i}">${posOpts.map(x => `<option value="${x}" ${x === pos ? 'selected' : ''}>${x}${FO.canPlay(p, x) ? (x !== 'DH' && p.defAt && p.defAt[x] != null ? ' · ' + p.defAt[x] : '') : ' ✕'}</option>`).join('')}</select><button class="grip" type="button" data-drag="lu" data-i="${i}" aria-label="Reorder ${esc(p.name)}. Drag, or use the arrow keys."><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="3" r="1.4"/><circle cx="11" cy="3" r="1.4"/><circle cx="5" cy="8" r="1.4"/><circle cx="11" cy="8" r="1.4"/><circle cx="5" cy="13" r="1.4"/><circle cx="11" cy="13" r="1.4"/></svg></button></div>` : `<span class="tag">${pos}</span>`;
      return `<div class="item" data-row="lu" data-i="${i}" data-p="${id}" data-pos="${pos}"><span class="slot">${i + 1}</span><div class="nm"><button class="lnk" type="button" data-act="player" data-p="${id}"><b>${esc(p.name)}</b></button> <span class="muted small">${posShort(p)}</span>${utilTag(p)}${fit}${ilTag(id)}<span class="s">${quickBat(id)}</span></div>${ctl}</div>`;
    }).join('') + `</div><p class="pad small muted" style="padding-top:8px;margin:0">The position menu shows each player's glove rating at the spots he can play. ✕ means out of position.</p></section>`;
  // bench
  h += `<section class="card"><h2>Bench<span class="sub">${bench.length} players${edit ? ' · drag ⠿ onto a starter to swap' : ''}</span></h2><div class="list" data-zone="bn">` +
    (bench.length ? bench.map(id => {
      const p = P[id];
      const tip = startTip[id];
      const ctl = edit ? `<div class="ctrls benchctl">${tip ? `<button class="btn sm primary" type="button" data-act="coach-lu" data-p="${id}" data-pos="${tip}">Start at ${tip}</button>` : ''}<select aria-label="Put ${esc(p.name)} into the lineup" data-act="swapin" data-p="${id}"><option value="">Start for…</option>${su.lineup.map(([lid, pos], i) => `<option value="${i}">${pos} · ${esc(lastName(lid))}${FO.canPlay(p, pos) ? (pos !== 'DH' ? ' · glove ' + FO.defAt(p, pos) : '') : ' ✕'}</option>`).join('')}</select><button class="grip" type="button" data-drag="bn" data-p="${id}" aria-label="Drag ${esc(p.name)} onto a starter to swap them"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="3" r="1.4"/><circle cx="11" cy="3" r="1.4"/><circle cx="5" cy="8" r="1.4"/><circle cx="11" cy="8" r="1.4"/><circle cx="5" cy="13" r="1.4"/><circle cx="11" cy="13" r="1.4"/></svg></button></div>` : '';
      return `<div class="item${edit ? ' stack' : ''}${tip ? ' rec' : ''}" data-row="bn" data-p="${id}"><span class="${ovrClass(sOvr(id))}">${sOvr(id)}</span><div class="nm"><button class="lnk" type="button" data-act="player" data-p="${id}"><b>${esc(p.name)}</b></button> <span class="muted small">${posShort(p)}</span>${tip ? ' <span class="tag gold">Should start</span>' : ''}${utilTag(p)}${ilTag(id)}<span class="s">${quickBat(id)}</span></div>${ctl}</div>`;
    }).join('') : '<div class="empty">Everyone is in the lineup.</div>') + `</div></section>`;
  // rotation
  h += `<section class="card"><h2>Rotation${edit ? '<span class="sub">Drag ⠿ to reorder or into the pen</span>' : ''}</h2><div class="list" data-zone="ru">` + su.rotation.map((id, i) => {
    const p = P[id];
    const ctl = edit ? `<div class="ctrls"><button class="btn sm" type="button" data-act="topen" data-p="${id}" ${su.rotation.length <= 4 ? 'disabled' : ''}>To pen</button><button class="grip" type="button" data-drag="ru" data-i="${i}" aria-label="Reorder ${esc(p.name)}. Drag, or use the arrow keys."><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="3" r="1.4"/><circle cx="11" cy="3" r="1.4"/><circle cx="5" cy="8" r="1.4"/><circle cx="11" cy="8" r="1.4"/><circle cx="5" cy="13" r="1.4"/><circle cx="11" cy="13" r="1.4"/></svg></button></div>` : '';
    return `<div class="item" data-row="ru" data-i="${i}" data-p="${id}"><span class="slot">${i + 1}</span><div class="nm"><button class="lnk" type="button" data-act="player" data-p="${id}"><b>${esc(p.name)}</b></button> <span class="${ovrClass(sOvr(id))}" style="display:inline-grid;width:30px;height:24px;font-size:15px;vertical-align:middle">${sOvr(id)}</span>${ilTag(id)}<span class="s">${quickPit(id)}</span></div>${ctl}</div>`;
  }).join('') + `</div></section>`;
  // bullpen
  const pen = su.pen.slice().sort((a, b) => (b === su.closer) - (a === su.closer) || P[b].ovr - P[a].ovr);
  h += `<section class="card"><h2>Bullpen<span class="sub">${su.closer != null ? 'Closer: ' + esc(P[su.closer].name) : 'No closer set'}${edit ? ' · drag ⠿ to the rotation or onto the closer' : ''}</span></h2><div class="list" data-zone="bp">` + pen.map(id => {
    const p = P[id], isCl = id === su.closer;
    const ctl = edit ? `<div class="ctrls">${isCl ? '<span class="tag red">Closer</span>' : `<button class="btn sm" type="button" data-act="closer" data-p="${id}">Make closer</button>`}<button class="btn sm" type="button" data-act="torot" data-p="${id}">To rotation</button><button class="grip" type="button" data-drag="bp" data-p="${id}" aria-label="Drag ${esc(p.name)} to the rotation or onto the closer"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="5" cy="3" r="1.4"/><circle cx="11" cy="3" r="1.4"/><circle cx="5" cy="8" r="1.4"/><circle cx="11" cy="8" r="1.4"/><circle cx="5" cy="13" r="1.4"/><circle cx="11" cy="13" r="1.4"/></svg></button></div>` : (isCl ? '<span class="tag red">CL</span>' : '');
    return `<div class="item${edit ? ' stack' : ''}" data-row="bp" data-p="${id}"${isCl ? ' data-cl="1"' : ''}><span class="${ovrClass(sOvr(id))}">${sOvr(id)}</span><div class="nm"><button class="lnk" type="button" data-act="player" data-p="${id}"><b>${esc(p.name)}</b></button> <span class="muted small">${posShort(p)}</span>${ilTag(id)}<span class="s">${quickPit(id)}</span></div>${ctl}</div>`;
  }).join('') + `</div></section>`;
  return h + viewFarm(tid);
}
function editLineup(fn) {
  const tid = myTeam(); if (!tid) return;
  const su = setup(tid); const lu = su.lineup.map(x => x.slice());
  fn(lu); teamWrite(tid, { lineup: lu });
}
function editStaff(fn) {
  const tid = myTeam(); if (!tid) return;
  const su = setup(tid); const st = { rotation: su.rotation.slice(), closer: su.closer };
  fn(st, su);
  st.rotation = st.rotation.slice(0, 6);
  if (st.rotation.includes(st.closer)) st.closer = null;
  teamWrite(tid, { rotation: st.rotation, closer: st.closer == null ? undefined : st.closer });
}

// ---------------- lineup coach ----------------
const hurtNow = id => injDays(id) > 0;
function luScore(id, pos) { return FO.luScore(P[id], pos) - (hurtNow(id) ? 20000 : 0); }
const U_PER_WIN = 20; // lineup score units per win over a full season (about 10 runs)
function bestCloserOf(ids) { return ids.filter(id => !hurtNow(id)).sort((a, b) => (sOvr(b) + (P[b].role === 'CL' ? 2 : 0)) - (sOvr(a) + (P[a].role === 'CL' ? 2 : 0)))[0]; }
// The lineup that would actually take the field today (hurt starters replaced the way the sim does it)
function effLineup(su) {
  const used = new Set(su.lineup.map(s => s[0]));
  return su.lineup.map(([id, pos]) => {
    if (!hurtNow(id)) return [id, pos];
    const bench = su.roster.filter(x => P[x].t === 'H' && !used.has(x) && !hurtNow(x));
    const pick = bench.filter(x => FO.canPlay(P[x], pos)).sort((a, b) => P[b].w - P[a].w)[0] ?? bench.sort((a, b) => P[b].w - P[a].w)[0];
    if (pick == null) return [id, pos];
    used.add(pick); return [pick, pos];
  });
}
// realistic value of a player at a spot (out of position = weak glove plus a misplay penalty, not "impossible")
const luReal = (id, pos) => FO.luScore(P[id], pos) + (FO.canPlay(P[id], pos) ? 0 : 10000 - 15);
const luTotal = l => l.reduce((t, [id, pos]) => t + luReal(id, pos), 0);
function coachPlan(tid) {
  const su = setup(tid), healthy = su.roster.filter(id => !hurtNow(id));
  const out = { lu: [], rot: [], cl: null, order: false, best: null, staff: null, gapWins: 0, watch: [] };
  const best = FO.autoLineup(P, healthy);
  if (best.length === 9) {
    out.best = best;
    const bestAt = {}; best.forEach(([id, pos]) => { bestAt[id] = pos; });
    const byPos = {}; best.forEach(([id, pos]) => { byPos[pos] = id; });
    const gap = luTotal(best) - luTotal(effLineup(su));
    out.gapWins = Math.max(0, gap / U_PER_WIN);
    const broken = su.lineup.some(([id, pos]) => hurtNow(id) || !FO.canPlay(P[id], pos)) || new Set(su.lineup.map(s => s[1])).size < 9;
    if (gap >= 2 || broken) {
      for (const [bid, pos] of best) {
        const i = su.lineup.findIndex(s => s[1] === pos), cur = i >= 0 ? su.lineup[i][0] : null;
        if (cur === bid) continue;
        const gain = cur == null ? 99 : hurtNow(cur) ? 50 : luReal(bid, pos) - luReal(cur, pos);
        let why;
        if (cur == null) why = `Nobody is playing ${pos}.`;
        else if (hurtNow(cur)) why = `${esc(lastName(cur))} is hurt (${injDays(cur)} days).`;
        else if (!FO.canPlay(P[cur], pos)) why = `${esc(lastName(cur))} can't play ${pos}.`;
        else if (gain > 0) {
          const bat = Math.round((P[bid].w - P[cur].w) * 1000), glove = pos === 'DH' ? 0 : FO.defAt(P[bid], pos) - FO.defAt(P[cur], pos);
          why = [bat > 0 ? 'Better bat' : '', glove >= 5 ? `${bat > 0 ? 'better' : 'Better'} glove at ${pos} (+${glove})` : ''].filter(Boolean).join(', ') || 'Better fit';
          why += ` · about +${(gain / U_PER_WIN).toFixed(1)} wins a season.`;
        } else why = bestAt[cur] ? `Lets ${esc(lastName(cur))} move to ${bestAt[cur]}.` : 'Part of the best overall fit.';
        out.lu.push({ pid: bid, pos, cur, why, gain, moving: su.lineup.some(s => s[0] === bid) });
      }
      out.lu.sort((a, b) => b.gain - a.gain);
    }
    const ord = FO.battingOrder(P, su.lineup);
    out.order = ord.some((s, k) => s[0] !== su.lineup[k][0]) && !out.lu.length;
    // bench watch: good players who aren't starting
    const inLu = new Set(su.lineup.map(s => s[0]));
    const starters = su.lineup.map(s => s[0]).filter(id => !hurtNow(id));
    const floor = Math.min(...starters.map(sOvr));
    for (const id of healthy.filter(x => P[x].t === 'H' && !inLu.has(x))) {
      const o = sOvr(id);
      if (!bestAt[id] && o < Math.max(65, floor + 3)) continue;
      if (bestAt[id]) { out.watch.push({ id, start: bestAt[id] }); continue; }
      const spots = (P[id].elig || [P[id].pos]).filter(x => x !== 'DH').concat(['DH']);
      let pick = null;
      for (const pos of spots) { const s0 = byPos[pos]; if (s0 == null) continue; const d = luReal(id, pos) - luReal(s0, pos); if (!pick || d > pick.d) pick = { pos, over: s0, d }; }
      if (!pick) continue;
      const ov = P[pick.over], bat = P[pick.over].w > P[id].w;
      const reason = bat ? `${esc(lastName(pick.over))} (${sOvr(pick.over)}) is the better hitter` : `${esc(lastName(pick.over))} (${sOvr(pick.over)}) has the better glove there`;
      out.watch.push({ id, pos: pick.pos, over: pick.over, cost: -pick.d / U_PER_WIN, reason, glovey: P[id].w < ov.w && o > sOvr(pick.over) });
    }
    out.watch.sort((a, b) => sOvr(b.id) - sOvr(a.id));
  }
  const pit = healthy.filter(id => P[id].t === 'P');
  const st = FO.autoStaff(P, pit);
  out.staff = st;
  const notBest = su.rotation.filter(id => !st.rotation.includes(id)).sort((a, b) => (hurtNow(b) - hurtNow(a)) || sOvr(a) - sOvr(b));
  for (const z of st.rotation) {
    if (su.rotation.includes(z)) continue;
    const w = notBest.shift();
    if (w == null) { if (su.rotation.length < 5) out.rot.push({ pid: z, out: null, why: 'Your rotation is short a starter.' }); continue; }
    const rel = P[w].role !== 'SP';
    if (!hurtNow(w) && !rel && sOvr(z) - sOvr(w) < 3) continue;
    out.rot.push({ pid: z, out: w, why: hurtNow(w) ? `${esc(lastName(w))} is hurt (${injDays(w)} days).` : rel ? `${esc(lastName(w))} is a reliever and tires early.` : `+${sOvr(z) - sOvr(w)} rating.` });
  }
  const bc = bestCloserOf(su.pen);
  if (bc != null && bc !== su.closer) {
    if (su.closer == null) out.cl = { pid: bc, why: 'Nobody is closing games.' };
    else if (hurtNow(su.closer)) out.cl = { pid: bc, why: `${esc(lastName(su.closer))} is hurt.` };
    else if (sOvr(bc) - sOvr(su.closer) >= 4) out.cl = { pid: bc, why: `+${sOvr(bc) - sOvr(su.closer)} over ${esc(lastName(su.closer))}.` };
  }
  return out;
}
const isCustom = tid => !!(docs[tid] && (docs[tid].lineup || docs[tid].rotation || docs[tid].closer != null));
function coachCount(tid) { const c = coachPlan(tid); return { n: c.lu.length + c.rot.length + (c.cl ? 1 : 0), c }; }
function benchWatchHTML(c, edit) {
  const shown = new Set(c.lu.map(x => x.pid)), list = c.watch.filter(w => !(w.start && shown.has(w.id)));
  if (!list.length) return '';
  return `<div class="watch"><div class="small muted" style="padding:8px 14px 2px;font-weight:600;letter-spacing:.04em">BENCH WATCH</div>${list.map(w => {
    const o = sOvr(w.id);
    if (w.start) return `<div class="item crow"><span class="${ovrClass(o)}" style="width:32px;height:28px;font-size:16px">${o}</span><div class="nm"><b>${esc(P[w.id].name)}</b> <span class="tag gold">Should start</span><span class="s">He belongs at ${w.start} in your best lineup.</span></div>${edit ? `<button class="btn sm primary" type="button" data-act="coach-lu" data-p="${w.id}" data-pos="${w.start}">Start at ${w.start}</button>` : ''}</div>`;
    return `<div class="item crow"><span class="${ovrClass(o)}" style="width:32px;height:28px;font-size:16px">${o}</span><div class="nm"><b>${esc(P[w.id].name)}</b> <span class="muted small">${posShort(P[w.id])}</span><span class="s">Sits because ${w.reason}. Starting him at ${w.pos} costs about ${Math.max(0.1, w.cost).toFixed(1)} wins a season.${w.glovey ? ' His rating leans on his glove.' : ''}${o >= 65 ? ' Good trade chip.' : ''}</span></div>${edit ? `<button class="btn sm" type="button" data-act="coach-lu" data-p="${w.id}" data-pos="${w.pos}">Start anyway</button>` : ''}</div>`;
  }).join('')}</div>`;
}
function coachCard(tid, custom) {
  const su = setup(tid), c = coachPlan(tid);
  if (!custom) {
    const hurt = su.lineup.filter(([id]) => hurtNow(id)).length + su.rotation.filter(hurtNow).length;
    return `<section class="card coach"><h2>Lineup coach<span class="sub">on auto · optimal</span></h2><div class="pad small" style="padding-top:2px">The best healthy lineup, rotation and closer play every day${hurt ? ', and hurt players sit automatically' : ''}. Drag a player or tap a button below to take over.</div>${benchWatchHTML(c, true)}</section>`;
  }
  const n = c.lu.length + c.rot.length + (c.cl ? 1 : 0);
  const face = id => `<span class="${ovrClass(sOvr(id))}" style="width:32px;height:28px;font-size:16px">${sOvr(id)}</span>`;
  const glove = (id, pos) => pos && pos !== 'DH' && P[id].t === 'H' ? ` · glove ${FO.defAt(P[id], pos)}` : '';
  const row = (inId, outId, pos, why, btn) => `<div class="item crow">${face(inId)}<div class="nm"><b>${esc(P[inId].name)}</b> <span class="tag">${pos}</span>${outId != null ? ` <span class="muted small">for ${esc(lastName(outId))} (${sOvr(outId)})</span>` : ''}<span class="s">${why}${glove(inId, pos)}</span></div>${btn}</div>`;
  let h = '';
  for (const s of c.lu) h += row(s.pid, s.cur, s.pos, s.why, `<button class="btn sm primary" type="button" data-act="coach-lu" data-p="${s.pid}" data-pos="${s.pos}">${s.moving ? 'Move' : 'Start'}</button>`);
  for (const s of c.rot) h += row(s.pid, s.out, 'SP', s.why, `<button class="btn sm primary" type="button" data-act="coach-rot" data-p="${s.pid}" data-out="${s.out == null ? '' : s.out}">Start</button>`);
  if (c.cl) h += row(c.cl.pid, su.closer, 'CL', c.cl.why, `<button class="btn sm primary" type="button" data-act="closer" data-p="${c.cl.pid}">Make closer</button>`);
  const pct = c.gapWins < 0.05 ? 100 : Math.max(0, Math.round(100 - c.gapWins * 8));
  const meter = c.best ? `<div class="pad" style="padding-top:2px"><div class="lumeter"><i style="width:${pct}%" class="${pct >= 98 ? 'ok' : pct >= 90 ? 'mid' : 'low'}"></i></div><div class="small ${c.gapWins >= 0.3 ? 'warn' : 'muted'}" style="margin-top:4px">${c.lu.length && c.gapWins < 0.05 ? 'Someone is out of position. Fix the spots below.' : c.gapWins < 0.05 ? 'Lineup strength: optimal. No better combination exists on your roster.' : `Your lineup leaves about <b>${c.gapWins.toFixed(1)} wins</b> a season on the bench.`}</div></div>` : '';
  const status = n ? `${n} change${n > 1 ? 's' : ''} would make you better` : (c.order ? 'Lineup is right. The order could be better.' : 'Your best lineup is on the field ✓');
  return `<section class="card coach"><h2>Lineup coach<span class="sub">${status}</span></h2>${meter}${h ? `<div class="list">${h}</div>` : ''}${benchWatchHTML(c, true)}
    <div class="pad row wrap" style="padding-top:10px;gap:6px">${n ? `<button class="btn primary" type="button" data-act="coach-all">Use best lineup</button>` : ''}${c.order ? `<button class="btn" type="button" data-act="coach-order">Sort batting order</button>` : ''}<button class="btn ghost sm" type="button" data-act="auto">Let the assistant pick daily</button></div></section>`;
}
function coachStart(pid, pos) {
  editLineup(l => {
    let i = l.findIndex(s => s[1] === pos); const j = l.findIndex(s => s[0] === pid);
    if (i < 0) { // nobody at that spot: take over a doubled-up position, else the weakest slot
      const seen = {}; l.forEach((s, k) => { seen[s[1]] = (seen[s[1]] || 0) + 1; });
      i = l.findIndex(s => seen[s[1]] > 1 && s[0] !== pid);
      if (i < 0) i = l.map((s, k) => k).filter(k => k !== j).sort((a, b) => luScore(l[a][0], l[a][1]) - luScore(l[b][0], l[b][1]))[0];
      l[i][1] = pos;
    }
    if (j >= 0 && j !== i) l[j][0] = l[i][0];
    l[i][0] = pid;
  });
  toast(`${P[pid].name} starts at ${pos}.`);
}
function coachRot(pid, outId) {
  editStaff(st => { const k = st.rotation.indexOf(outId); if (k >= 0) st.rotation[k] = pid; else st.rotation.push(pid); if (st.closer === pid) st.closer = null; });
  toast(`${P[pid].name} joins the rotation.`);
}
function coachAll() {
  const tid = myTeam(); if (!tid) return;
  const c = coachPlan(tid), su = setup(tid), w = {};
  if (c.best) w.lineup = c.best.map(x => x.slice());
  const rot = su.rotation.slice(); for (const s of c.rot) { const k = rot.indexOf(s.out); if (k >= 0) rot[k] = s.pid; else rot.push(s.pid); }
  w.rotation = rot.slice(0, 6);
  const cl = c.cl ? c.cl.pid : su.closer; w.closer = cl == null || w.rotation.includes(cl) ? undefined : cl;
  teamWrite(tid, w); toast('Best lineup and staff set.');
}

// ---- Trade tab
function inOrg(id, tid) { return rosterOf(tid).includes(id) || farmOrg(id) === tid; }
const mlbOf = (ids, tid) => ids.filter(id => rosterOf(tid).includes(id));
// Years of salary still owed after today (current season counts during the season)
function owedOf(id, tid) {
  if (!rosterOf(tid).includes(id)) return 0;
  const yrs = Math.max(0, endFor(id, tid) - seasonNo() + (S.phase === 'offseason' || S.phase === 'done' ? 0 : 1));
  return salFor(id, tid) * yrs;
}
function seasonLine(id) {
  const p = P[id];
  if (p.t === 'H') { const a = batLine(id); if (!a || !a[2]) return null; const obp = a[1] ? (a[4] + a[9]) / a[1] : 0, slg = (a[4] + a[5] + 2 * a[6] + 3 * a[7]) / a[2]; return `${fmt3(a[4] / a[2])} · ${a[7]} HR · ${a[8]} RBI · ${fmt3(obp + slg)} OPS`; }
  const a = pitLine(id); if (!a || !a[5]) return null; return `${a[2]}-${a[3]} · ${(a[7] * 27 / a[5]).toFixed(2)} ERA · ${ipStr(a[5])} IP${a[4] ? ' · ' + a[4] + ' SV' : ''} · ${a[9]} SO`;
}
function priorLine(id) {
  const p = P[id];
  if (p.pros) return null;
  if (p.t === 'H') return p.AB ? `${fmt3(p.AVG)} · ${p.HR} HR · ${p.SB} SB in ${p.AB} AB` : null;
  return p.outs ? `${p.W}-${p.L} · ${p.ERA.toFixed(2)} ERA · ${ipStr(p.outs)} IP${p.SV ? ' · ' + p.SV + ' SV' : ''}` : null;
}
function cmpCard(id, tid, editSide) {
  const p = P[id], farmGuy = farmOrg(id) === tid;
  const cur = seasonLine(id), prior = priorLine(id);
  const con = farmGuy ? 'Minor-league deal, no payroll' : `${money(salFor(id, tid))} a year · through ${yearOf(endFor(id, tid))}`;
  const owed = owedOf(id, tid);
  return `<div class="pc"><div class="pn"><span class="${ovrClass(sOvr(id))}">${sOvr(id)}</span><span class="nm"><button class="lnk" type="button" data-act="player" data-p="${id}"><b>${esc(p.name)}</b></button>${ilTag(id)}<span class="s">${posShort(p)} · age ${p.age}${p.pros ? ' · ' + potTag(id) : ''}${farmGuy ? ` · ${esc(etaText(id))}` : ''}</span></span></div>
    ${editSide ? `<div class="pcact"><button class="btn sm" type="button" data-act="dswap" data-p="${id}" data-side="${editSide}">⇄ Swap</button><button class="btn sm ghost" type="button" data-act="dremove" data-p="${id}" data-side="${editSide}" aria-label="Remove ${esc(p.name)} from the deal">✕ Remove</button></div>` : ''}
    <dl><dt>This league</dt><dd>${cur ? esc(cur) : farmGuy ? 'In the minors' : 'No stats yet'}</dd>${prior ? `<dt>Real ${FO.ERA.year}</dt><dd>${esc(prior)}</dd>` : ''}<dt>Contract</dt><dd>${con}</dd>${owed ? `<dt>Still owed</dt><dd>${money(owed)}</dd>` : ''}</dl></div>`;
}
// Two columns: what you send and what you get, with contract and value totals.
// send/get are ids; sendTid/getTid own them now; cashOut > 0 means you pay cash.
function dealCompare(send, get, sendTid, getTid, cashOut, edit) {
  const side = (ids, tid, cashHere, label, cls) => {
    const sd = cls === 'out' ? 'give' : 'get';
    const sal = ids.reduce((a, id) => a + (rosterOf(tid).includes(id) ? salFor(id, tid) : 0), 0);
    const owed = ids.reduce((a, id) => a + owedOf(id, tid), 0);
    const val = myValue(ids, tid !== myTeam()) + cashHere / 1e6 / SC() * FO.CASH_UNIT;
    return `<div class="cside"><div class="clab ${cls}">${label}<span>${esc(TEAM[tid].city)}</span></div>${ids.map(id => cmpCard(id, tid, edit ? sd : null)).join('') || (edit ? '' : '<div class="pc muted small">No players</div>')}${edit ? `<div class="pc addpc"><button class="btn sm addbtn" type="button" data-act="addopen" data-side="${sd}">＋ Add ${sd === 'give' ? 'your player' : 'their player'}</button></div>` : ''}${cashHere ? `<div class="pc"><b>${money(cashHere)} cash</b></div>` : ''}
      ${ids.length || cashHere ? `<dl class="ctot"><dt>Salary this year</dt><dd>${money(sal)}</dd><dt>Total still owed</dt><dd>${money(owed)}</dd><dt>Trade value</dt><dd>${Math.round(val)}</dd></dl>` : ''}</div>`;
  };
  const salSend = send.reduce((a, id) => a + (rosterOf(sendTid).includes(id) ? salFor(id, sendTid) : 0), 0);
  const salGet = get.reduce((a, id) => a + (rosterOf(getTid).includes(id) ? salFor(id, getTid) : 0), 0);
  const d = salGet - salSend;
  const sum = `<div class="csum small"><span>Your payroll ${d > 0 ? 'goes up' : d < 0 ? 'goes down' : 'stays the same'}${d ? ' <b class="num">' + money(Math.abs(d)) + '</b>' : ''}</span><span class="muted">Values for other clubs' players come from your scouts.</span></div>`;
  return `<div class="cmp">${side(send, sendTid, Math.max(0, cashOut), 'You send', 'out')}${side(get, getTid, Math.max(0, -cashOut), 'You get', 'in')}</div>${send.length + get.length ? sum : ''}`;
}
// ---------------- trade advice (offers and trade talks) ----------------
// send: ids leaving my org; get: ids coming in; cashOut > 0 = I pay cash. otherTid: the other club.
function autoSetup(tid, roster) { return FO.teamSetup(W, tid, Object.assign({}, docs[tid] || {}, { roster, lineup: undefined, rotation: undefined, closer: undefined })); }
function tradeAdvice(send, get, otherTid, cashOut) {
  const mt = myTeam(); if (!mt || !S) return null;
  const mineNow = rosterOf(mt);
  const sendM = send.filter(id => mineNow.includes(id)), getM = get.filter(id => rosterOf(otherTid).includes(id));
  const after = mineNow.filter(id => !sendM.includes(id)).concat(getM);
  if (FO.rosterOk(P, after)) return { verdict: 'Not legal', cls: 'bad', points: [`This would leave your ${FO.rosterOk(P, after)}.`] };
  const u0 = unitRatings(mt, autoSetup(mt, mineNow)), u1 = unitRatings(mt, autoSetup(mt, after));
  const live = S.phase === 'season', s = S.std[mt], left = live ? LEN() - s[0] - s[1] : LEN();
  const dRating = teamRating(u1) - teamRating(u0);
  const dWins = dRating * 0.013 * left;
  // value: my scouts' view of what I get vs true value of what I send
  const vSend = myValue(send, false) + Math.max(0, cashOut) / 1e6 / SC() * FO.CASH_UNIT;
  const vGet = myValue(get, true) + Math.max(0, -cashOut) / 1e6 / SC() * FO.CASH_UNIT;
  const vPct = (vGet - vSend) / Math.max(1, vSend);
  // stance
  const a = analysis(mt), stance = a.stance;
  const avgAge = ids => ids.length ? ids.reduce((x, id) => x + P[id].age, 0) / ids.length : 0;
  const ageSend = avgAge(send), ageGet = avgAge(get);
  // money
  const salOut = sendM.reduce((x, id) => x + salFor(id, mt), 0), salIn = getM.reduce((x, id) => x + salFor(id, otherTid), 0);
  const dPay = salIn - salOut;
  const owedOut = sendM.reduce((x, id) => x + owedOf(id, mt), 0), owedIn = getM.reduce((x, id) => x + owedOf(id, otherTid), 0);
  const cashAfter = cashOf(mt) - cashOut;
  const points = [];
  // on-field
  if (Math.abs(dWins) >= 0.3) points.push([dWins > 0 ? 'good' : 'bad', `${dWins > 0 ? 'Makes you better' : 'Makes you worse'} now: about <b>${dWins > 0 ? '+' : '−'}${Math.abs(dWins).toFixed(1)} wins</b> over the ${live ? `${left} games left` : 'next season'}.`]);
  else points.push(['', 'Barely changes how good your club is right now.']);
  // holes
  const gaps = [];
  for (const k of POS9.concat(['SP', 'RP'])) {
    const b0 = u0[k] ? u0[k].ovr : 40, b1 = u1[k] ? u1[k].ovr : 40;
    if (b1 - b0 >= 4) gaps.push(['good', `Upgrades ${POS_NAME[k]} (${Math.round(b0)} → ${Math.round(b1)}).`]);
    if (b0 - b1 >= 4) gaps.push(['bad', `Opens a hole at ${POS_NAME[k]} (${Math.round(b0)} → ${Math.round(b1)}).`]);
  }
  points.push(...gaps.slice(0, 3));
  // value
  points.push([vPct >= 0.05 ? 'good' : vPct <= -0.15 ? 'bad' : '', vPct >= 0.05 ? `You win the trade on value by about ${Math.round(vPct * 100)}%, by your scouts' count.` : vPct <= -0.15 ? `You give up about ${Math.round(-vPct * 100)}% more value than you get back.` : 'Roughly even on value.']);
  // future
  const pros = get.filter(id => P[id].pros), prosOut = send.filter(id => P[id].pros);
  if (prosOut.length) points.push([stance === 'sell' ? 'bad' : '', `Costs you prospect${prosOut.length > 1 ? 's' : ''} ${prosOut.map(id => `${esc(P[id].name)} (potential ${potGrade(id)})`).join(', ')}.`]);
  if (pros.length) points.push(['good', `Adds prospect${pros.length > 1 ? 's' : ''} ${pros.map(id => `${esc(P[id].name)} (potential ${potGrade(id)})`).join(', ')}.`]);
  if (ageGet && ageSend && Math.abs(ageGet - ageSend) >= 3) points.push([(ageGet < ageSend) === (stance === 'sell') ? 'good' : '', `You get ${ageGet < ageSend ? 'younger' : 'older'}: average age ${Math.round(ageSend)} out, ${Math.round(ageGet)} in.`]);
  // money
  if (Math.abs(dPay) >= FO.ERA.minSal) points.push([dPay < 0 ? 'good' : cashAfter - Math.max(0, dPay) < 0 ? 'bad' : '', `Payroll ${dPay > 0 ? 'up' : 'down'} ${money(Math.abs(dPay))} a year${owedIn || owedOut ? `; you take on ${money(owedIn)} in future salary and shed ${money(owedOut)}` : ''}.`]);
  if (cashOut) points.push([cashOut > 0 ? '' : 'good', cashOut > 0 ? `You pay ${money(cashOut)} in cash.` : `You receive ${money(-cashOut)} in cash.`]);
  if (cashAfter - Math.max(0, dPay) < 0) points.push(['bad', 'This would leave you short on cash.']);
  // verdict
  let score = 0;
  if (stance === 'sell') score += vPct * 4 + (ageGet < ageSend ? 0.5 : -0.3) + (dPay < 0 ? 0.4 : -0.2) + pros.length * 0.5;
  else score += dWins * (stance === 'buy' ? 0.6 : 0.45) + vPct * 2 + (dPay > 0 && cashAfter - dPay < 0 ? -1 : 0) - prosOut.length * (stance === 'buy' ? 0.1 : 0.3);
  if (vPct < -0.35) score -= 1;
  const verdict = score >= 1 ? ['Take it', 'goodc'] : score >= -0.2 ? ['Worth a look', 'warnc'] : ['Pass', 'bad'];
  const lens = stance === 'buy' ? 'You are a contender, so wins now count most.' : stance === 'bubble' ? 'You are on the bubble: help now matters, but not at any price.' : stance === 'sell' ? 'You are building for next year, so youth, prospects and saving money count most.' : 'Judged on value and roster fit for next season.';
  return { verdict: verdict[0], cls: verdict[1], points, lens, dWins };
}
function adviceBox(adv, title) {
  if (!adv) return '';
  return `<div class="advice"><div class="row" style="gap:8px;align-items:center"><b style="flex:1">${title || 'Front office take'}</b><span class="pill ${adv.cls}">${adv.verdict}</span></div>
    <ul>${adv.points.map(([c, t]) => `<li class="${c}">${t}</li>`).join('')}</ul>${adv.lens ? `<div class="small muted">${adv.lens}</div>` : ''}</div>`;
}
function viewTrade() {
  const mt = myTeam();
  if (!mt) return `<section class="card"><h2>Trades</h2><div class="pad small"><p style="margin:0 0 10px">You need a club before you can make deals.</p><button class="btn primary" data-act="claim-open" type="button">Choose a team</button></div></section>`;
  if (S.phase === 'post' || S.phase === 'done') return `<section class="card"><h2>Trades</h2><div class="empty">The trade window reopens in the offseason.</div></section>` + viewOffers(mt);
  if (tradesClosed()) return `<section class="card"><h2>Trades</h2><div class="empty">The trade deadline (${FO.dateOf(tradeDeadlineDay() - 1)}) has passed. Trades reopen in the offseason. You can still sign free agents and call up prospects.</div></section>` + viewOffers(mt);
  if (!tradePartner || tradePartner === mt) tradePartner = TEAMS.find(t => t.id !== mt).id;
  const mine = rosterOf(mt), theirs = rosterOf(tradePartner), myFarm = farmOf(mt).filter(id => !minorsOf(mt).includes(id)), theirFarm = farmOf(tradePartner).filter(id => !minorsOf(tradePartner).includes(id));
  [...tradeGive].forEach(id => { if (!inOrg(id, mt)) tradeGive.delete(id); });
  [...tradeGet].forEach(id => { if (!inOrg(id, tradePartner)) tradeGet.delete(id); });
  const po = ownerOf(tradePartner);
  const give = [...tradeGive], get = [...tradeGet];
  const legal = FO.evalTrade(W, mine, theirs, mlbOf(give, mt), mlbOf(get, tradePartner));
  let warn = '';
  if (legal.errFrom) warn = `Your ${legal.errFrom}.`;
  else if (legal.errTo) warn = `${TEAM[tradePartner].city}'s ${legal.errTo}.`;
  else if (tradeCash > 0 && tradeCash > cashOf(mt)) warn = `You only have ${money(cashOf(mt))} in cash.`;
  const row = (id, set, side) => {
    const p = P[id], on = set.has(id), fg = !!farmOrg(id);
    const tid = side === 'give' ? mt : tradePartner;
    const sub = fg ? `${posShort(p)} · ${p.age} · ${potGrade(id)} pot` : `${posShort(p)} · ${p.age} · ${money(salFor(id, tid))} '${String(yearOf(endFor(id, tid))).slice(2)}`;
    return `<label class="check${on ? ' on' : ''}"><input class="vh" type="checkbox" data-act="pick" data-side="${side}" data-p="${id}" ${on ? 'checked' : ''}><span class="${ovrClass(sOvr(id))}">${sOvr(id)}</span><span class="nm"><b>${esc(p.name)}</b>${ilTag(id)}<span class="s">${sub}</span><span class="s q">${fg ? esc(etaText(id)) : quick(id)}</span></span></label>`;
  };
  const list = (ids, farmIds, set, side) => {
    const srt = a => a.slice().sort((x, y) => sOvr(y) - sOvr(x));
    const H = srt(ids.filter(id => P[id].t === 'H')), Pi = srt(ids.filter(id => P[id].t === 'P'));
    return `<div class="grp">Hitters</div>${H.map(id => row(id, set, side)).join('')}<div class="grp">Pitchers</div>${Pi.map(id => row(id, set, side)).join('')}${farmIds.length ? `<div class="grp">Farm</div>${farmIds.slice().sort((a, b) => potSeen(b) - potSeen(a)).map(id => row(id, set, side)).join('')}` : ''}`;
  };
  const canSend = (give.length + get.length > 0) && !warn;
  const hint = !po && showHint ? `<div class="hintbox"><b>What ${esc(TEAM[tradePartner].city)} values</b><ul>${FO.aiHint(W, ctxFor(tradePartner)).map(x => `<li>${esc(x)}</li>`).join('')}</ul></div>` : '';
  const fb = lastFeedback && lastFeedback.to === tradePartner ? `<div class="feedback ${lastFeedback.accept ? 'okb' : 'nob'}"><b>${esc(TEAM[lastFeedback.to].city)}'s GM:</b> ${lastFeedback.reasons.map(r => '“' + esc(r) + '”').join(' ')}</div>` : '';
  const cashCtl = `<div class="cashrow"><span class="small" style="flex:1">Cash in the deal</span><span class="cashctl"><button class="btn icon" type="button" data-act="cashstep" data-d="-1" aria-label="More cash to you">−</button><b class="num" style="min-width:128px;text-align:center">${tradeCash === 0 ? 'None' : tradeCash > 0 ? 'You send ' + money(tradeCash) : 'You get ' + money(-tradeCash)}</b><button class="btn icon" type="button" data-act="cashstep" data-d="1" aria-label="More cash from you">+</button></span></div>`;
  const deal = (give.length + get.length || tradeCash ? '' : `<div class="pad small muted" style="padding-top:12px">Tap <b>＋ Add</b> on either side. Start with who you want, and your scouts will point you to what ${esc(TEAM[tradePartner].city)} would take.</div>`) + dealCompare(give, get, mt, tradePartner, tradeCash, true) + (give.length + get.length ? `<div class="pad" style="padding-top:10px">${adviceBox(tradeAdvice(give, get, tradePartner, tradeCash), 'Your scouts on this deal')}</div>` : '');
  return `<section class="card"><h2>Trade talks</h2><div class="pad"><label class="small muted" for="partner">Trade with</label><select id="partner" style="width:100%;margin-top:4px">${TEAMS.filter(t => t.id !== mt).map(t => `<option value="${t.id}" ${t.id === tradePartner ? 'selected' : ''}>${t.city} (${t.id}) · ${rec(t.id)} · ${ownerOf(t.id) ? 'GM: ' + esc(ownerName(ownerOf(t.id))) : 'computer'}</option>`).join('')}</select></div>
    ${deal}${get.length && !give.length ? dealBuilderCard(mt, tradePartner, get) : get.length ? `<div class="pad" style="padding-top:8px">${builderOpen === bKey(tradePartner, get) ? dealBuilderCard(mt, tradePartner, get) : `<button class="btn sm" type="button" data-act="buildopen">Find other packages</button>`}</div>` : ''}
    <div class="meter">${cashCtl}
    ${warn ? `<div class="warn">${esc(warn)}</div>` : ''}${!warn ? cashSway(mt, tradePartner, give, get) : ''}${fb}${hint}
    <div class="row wrap"><button class="btn primary" type="button" data-act="propose" ${canSend ? '' : 'disabled'}>${po ? 'Send offer to ' + esc(ownerName(po)) : 'Propose trade'}</button>${!po ? `<button class="btn" type="button" data-act="hint">${showHint ? 'Hide hint' : 'Hint'}</button>` : ''}${give.length + get.length + (tradeCash ? 1 : 0) ? '<button class="btn ghost" type="button" data-act="clearpick">Clear</button>' : ''}</div></div></section>
    <details class="rosters"${rostersOpen ? ' open' : ''}><summary>Browse both full rosters</summary><div class="split two"><section class="card"><h2>${esc(mt)}<span class="sub">yours · ${give.length} picked</span></h2>${list(mine, myFarm, tradeGive, 'give')}</section>
    <section class="card"><h2>${esc(tradePartner)}<span class="sub">${get.length} picked</span></h2>${list(theirs, theirFarm, tradeGet, 'get')}</section></div></details>` + viewOffers(mt);
}
function offerCard(t, mt) {
  const incoming = t.to === mt;
  const send = incoming ? t.get : t.give, get = incoming ? t.give : t.get;
  const sendTid = incoming ? t.to : t.from, getTid = incoming ? t.from : t.to;
  const cashOut = incoming ? -(t.cash || 0) : (t.cash || 0);
  const who = incoming ? (t.ai ? `${esc(TEAM[t.from].city)}'s GM calls` : `${esc(ownerName(ownerOf(t.from)))} (${esc(t.from)}) offers`) : `Your offer to ${esc(ownerOf(t.to) ? ownerName(ownerOf(t.to)) : TEAM[t.to].city)}`;
  const still = send.every(x => inOrg(x, sendTid)) && get.every(x => inOrg(x, getTid));
  const btns = incoming ? `<button class="btn sm primary" type="button" data-act="accept" data-id="${t.id}" ${still ? '' : 'disabled'}>Accept</button><button class="btn sm" type="button" data-act="decline" data-id="${t.id}">Decline</button><button class="btn sm ghost" type="button" data-act="counter" data-id="${t.id}">Counter</button>${t.ai ? '<span class="small muted">Expires after 10 days</span>' : ''}`
    : `<span class="small muted" style="flex:1">Waiting on ${esc(ownerName(ownerOf(t.to)))}</span><button class="btn sm" type="button" data-act="cancel" data-id="${t.id}">Withdraw</button>`;
  const adv = incoming && still ? adviceBox(tradeAdvice(send, get, getTid, cashOut), 'Should you take it?') : '';
  return `<div class="offer"><div class="pad" style="padding-top:12px;padding-bottom:4px"><b>${who}</b>${still ? '' : ' <span class="tag red">Rosters changed</span>'}</div>${dealCompare(send, get, sendTid, getTid, cashOut)}${adv ? `<div class="pad" style="padding-top:10px">${adv}</div>` : ''}<div class="pad row wrap" style="padding-top:4px">${btns}</div></div>`;
}
function viewOffers(mt) {
  const inc = trades.filter(t => t.to === mt && t.status === 'pending'), out = trades.filter(t => t.from === mt && t.status === 'pending');
  const done = trades.filter(t => t.give && (t.to === mt || t.from === mt) && t.status !== 'pending' && t.status !== 'rejected').slice(0, 6);
  if (!inc.length && !out.length && !done.length) return '';
  const live = inc.filter(t => !offerStale(t)), stale = inc.filter(t => offerStale(t));
  return `<section class="card" id="offers"><h2>Offers<span class="sub">${live.length ? live.length + ' waiting on you' : ''}</span></h2>` +
    live.map(t => offerCard(t, mt)).join('') + out.map(t => offerCard(t, mt)).join('') +
    (stale.length || done.length ? `<div class="news">${stale.map(t => `<div><span class="d">Expired</span><span>${tradeDesc(t)}</span></div>`).join('')}${done.map(t => `<div><span class="d">${esc(t.status)}</span><span>${tradeDesc(t)}</span></div>`).join('')}</div>` : '') + `</section>`;
}
function newId() { return 't' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
async function propose() {
  const mt = myTeam(); if (!mt) return;
  if (tradesClosed()) { toast('The trade deadline has passed. Trades reopen in the offseason.'); return; }
  const give = [...tradeGive], get = [...tradeGet], to = tradePartner, cash = tradeCash;
  const legal = FO.evalTrade(W, rosterOf(mt), rosterOf(to), mlbOf(give, mt), mlbOf(get, to));
  if (legal.errFrom || legal.errTo) return;
  if (cash > 0 && cash > cashOf(mt)) { toast("You don't have that much cash to send."); return; }
  const t = { from: mt, to, give, get, cash, by: me.id, ts: Date.now(), status: 'pending', day: S.day };
  if (!ownerOf(to)) {
    const ev = FO.aiEvaluate(W, ctxFor(to), give.map(pinfo), get.map(pinfo), cash);
    lastFeedback = { to, accept: ev.accept, reasons: ev.reasons };
    if (!ev.accept) {
      t.status = 'rejected'; t.reasons = ev.reasons;
      const id = newId(); trades.unshift(Object.assign({ id }, t)); render();
      if (mode === 'local') saveLocal(); else await writeDoc('trades/' + id, t).catch(() => {});
      return;
    }
    if (cash < 0 && ctxFor(to).cash < -cash) { toast(TEAM[to].city + " can't afford that cash."); return; }
    t.status = 'accepted'; t.feedback = ev.reasons[0];
    await executeTrade(t, legal);
    S.news.unshift([S.day, `Trade: ${TEAM[mt].city} send ${give.map(id => P[id].name).join(' and ') || 'cash'} to ${TEAM[to].city} for ${get.map(id => P[id].name).join(' and ') || 'cash'}.`, 'trade', mt]);
    if (mode !== 'local') writeDoc('league/state', S).catch(() => {});
    toast('Deal done with ' + TEAM[to].city + '.');
  } else toast('Offer sent to ' + ownerName(ownerOf(to)) + '.');
  const id = newId(); trades.unshift(Object.assign({ id }, t));
  tradeGive.clear(); tradeGet.clear(); tradeCash = 0; showHint = false; render();
  if (mode === 'local') saveLocal(); else await writeDoc('trades/' + id, t);
}
async function executeTrade(t, ev) {
  const fGive = t.give.filter(id => farmOrg(id) === t.from), fGet = t.get.filter(id => farmOrg(id) === t.to);
  if (fGive.length || fGet.length) {
    const next = clone(farm);
    next.by[t.from] = (next.by[t.from] || []).filter(x => !fGive.includes(x)).concat(fGet);
    next.by[t.to] = (next.by[t.to] || []).filter(x => !fGet.includes(x)).concat(fGive);
    await setFarm(next);
  }
  const cf = Object.assign({}, (docs[t.from] && docs[t.from].con) || {}), ct = Object.assign({}, (docs[t.to] && docs[t.to].con) || {});
  t.give.forEach(id => { if (cf[id]) { ct[id] = cf[id]; delete cf[id]; } });
  t.get.forEach(id => { if (ct[id]) { cf[id] = ct[id]; delete ct[id]; } });
  const cash = t.cash || 0;
  const adjF = ((docs[t.from] && docs[t.from].cashAdj) || 0) - cash, adjT = ((docs[t.to] && docs[t.to].cashAdj) || 0) + cash;
  await teamWrite(t.from, Object.assign(fixPatch(t.from, ev.newFrom), { con: cf }, cash ? { cashAdj: adjF } : {}));
  await teamWrite(t.to, Object.assign(fixPatch(t.to, ev.newTo), { con: ct }, cash ? { cashAdj: adjT } : {}));
}
async function answer(id, accept) {
  const t = trades.find(x => x.id === id); if (!t) return;
  if (accept && tradesClosed()) { toast("The trade deadline has passed. This deal can't go through."); return; }
  const next = Object.assign({}, t); delete next.id;
  if (accept) {
    const ev = FO.evalTrade(W, rosterOf(t.from), rosterOf(t.to), mlbOf(t.give, t.from), mlbOf(t.get, t.to));
    const still = t.give.every(x => inOrg(x, t.from)) && t.get.every(x => inOrg(x, t.to));
    const cash = t.cash || 0;
    const broke = (cash > 0 && cashOf(t.from) < cash) || (cash < 0 && cashOf(t.to) < -cash);
    if (offerStale(t)) { next.status = 'expired'; toast('That offer has expired.'); }
    else if (!still || ev.errFrom || ev.errTo || broke) { next.status = 'expired'; toast('That deal no longer works with the current rosters or cash.'); }
    else {
      await executeTrade(t, ev); next.status = 'accepted'; toast('Trade accepted.');
      S.news.unshift([S.day, `Trade: ${TEAM[t.from].city} send ${t.give.map(x => P[x].name).join(' and ')} to ${TEAM[t.to].city} for ${t.get.map(x => P[x].name).join(' and ')}.`, 'trade', t.to]);
      if (mode !== 'local') writeDoc('league/state', S).catch(() => {});
    }
  } else next.status = accept === null ? 'withdrawn' : 'declined';
  Object.assign(t, next); render();
  if (mode === 'local') saveLocal(); else await writeDoc('trades/' + id, next);
}

// ---- Money tab
function adjNow(tid) { const d = docs[tid] || {}; return (d.cashAdj || 0) - ((S.adj0 && S.adj0[tid]) || 0); }
function viewMoney() {
  const mt = myTeam();
  const tid = mt || teamView || 'SEA';
  const f = S.fin[tid], su = setup(tid), t = TEAM[tid];
  const avg = f[7] ? Math.round(f[6] / f[7]) : 0;
  const nextHome = (() => { for (let d = S.day; d < Math.min(LEN(), S.day + 10); d++) { const g = W.sched[d] && W.sched[d].find(x => x[0] === tid); if (g) return g[1]; } return null; })();
  const proj = p => nextHome ? FO.attendance(W, S, tid, nextHome, p, () => 0.5) : 0;
  const pr = su.price, a = proj(pr);
  const rev = f[1] + f[2] + f[3], exp = f[4] + f[5];
  let h = `<section class="card"><h2>${esc(t.city)} finances<span class="sub">${mt ? '' : 'Viewing'}</span></h2>
    <div class="kv"><div><span>Cash</span><b>${money(cashOf(tid))}</b></div><div><span>Profit this year</span><b style="color:${cashOf(tid) - openingCash(tid) >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(cashOf(tid) - openingCash(tid))}</b></div><div><span>Avg attendance</span><b>${avg.toLocaleString()}</b></div><div><span>Capacity</span><b>${t.cap.toLocaleString()}</b></div></div>
    <div class="scroll"><table><tbody>
      <tr><td>Ticket sales</td><td>${money(f[1])}</td></tr><tr><td>Concessions &amp; parking</td><td>${money(f[2])}</td></tr><tr><td>Broadcast &amp; national revenue</td><td>${money(f[3])}</td></tr>
      <tr><td><b>Revenue</b></td><td><b>${money(rev)}</b></td></tr>
      <tr><td>Player payroll paid</td><td>−${money(f[4])}</td></tr><tr><td>Stadium &amp; operations</td><td>−${money(f[5])}</td></tr>${adjNow(tid) ? `<tr><td>Signing bonuses &amp; buyouts</td><td>${money(adjNow(tid))}</td></tr>` : ''}
      <tr><td><b>Net</b></td><td><b>${money(rev - exp + adjNow(tid))}</b></td></tr></tbody></table></div></section>`;
  if (mt && (S.phase === 'season' || S.phase === 'offseason')) h += `<section class="card"><h2>Ticket price<span class="sub"></span></h2><div class="pad"><div class="price"><button class="btn icon" type="button" data-act="price" data-d="-1" aria-label="Lower price">−</button><b class="num">$${pr.toFixed(2)}</b><button class="btn icon" type="button" data-act="price" data-d="1" aria-label="Raise price">+</button></div>
    <p class="small" style="margin:10px 0 0">${nextHome ? `Next home game vs ${esc(TEAM[nextHome].city)}: about <b class="num">${a.toLocaleString()}</b> fans (${Math.round(a / t.cap * 100)}% full), <b class="num">${money(a * pr)}</b> at the gate.` : 'No home games in the next ten days.'}</p>
    <p class="small muted" style="margin:6px 0 0">Winning fills seats. Higher prices bring in more per fan but thin the crowd, and every empty seat is lost concession money.</p></div></section>`;
  // payroll
  const ros = su.roster.slice().sort((a, b) => salFor(b, tid) - salFor(a, tid));
  h += `<section class="card"><h2>Payroll<span class="sub">${money(payroll(tid))}</span></h2><div class="list">${ros.slice(0, 10).map(id => `<div class="item"><span class="${ovrClass(P[id].ovr)}">${P[id].ovr}</span><div class="nm"><button class="lnk" type="button" data-act="player" data-p="${id}"><b>${esc(P[id].name)}</b></button><span class="s">${posShort(P[id])} · age ${P[id].age} · through ${yearOf(endFor(id, tid))}</span></div><span class="num">${money(salFor(id, tid))}</span></div>`).join('')}</div></section>`;
  // league table
  const rows = TEAMS.map(x => ({ id: x.id, att: S.fin[x.id][7] ? S.fin[x.id][6] / S.fin[x.id][7] : 0, pay: payroll(x.id), pro: cashOf(x.id) - openingCash(x.id) })).sort((a, b) => b.pro - a.pro);
  h += `<section class="card"><h2>League business</h2><div class="scroll"><table><thead><tr><th>Club</th><th>Avg att</th><th>Payroll</th><th>Profit</th></tr></thead><tbody>${rows.map(r => `<tr class="${r.id === mt ? 'mine' : ''}"><td><span class="abbr">${r.id}</span></td><td>${Math.round(r.att).toLocaleString()}</td><td>${money(r.pay)}</td><td style="color:${r.pro >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(r.pro)}</td></tr>`).join('')}</tbody></table></div></section>`;
  return h;
}

// ---- Stats tab
function viewStats() {
  const gp = Math.max(1, Math.round(TEAMS.reduce((a, t) => a + S.gp[t.id], 0) / 28));
  const teamOf = id => playerTeam(+id);
  const top = (arr, f, fmt, n = 8) => arr.slice().sort((a, b) => f(b) - f(a)).slice(0, n).map(x => [x.id, fmt(f(x)), x]);
  let boards = [];
  if (statView === 'bat') {
    const all = Object.entries(S.bat).map(([id, a]) => ({ id: +id, a }));
    const q = all.filter(x => x.a[1] >= gp * 3.1);
    const obp = a => (a[4] + a[9]) / Math.max(1, a[1]), slg = a => (a[4] + a[5] + 2 * a[6] + 3 * a[7]) / Math.max(1, a[2]);
    boards = [['Batting average', top(q, x => x.a[4] / x.a[2], fmt3)], ['Home runs', top(all, x => x.a[7], String)], ['Runs batted in', top(all, x => x.a[8], String)], ['On-base plus slugging', top(q, x => obp(x.a) + slg(x.a), fmt3)], ['Stolen bases', top(all, x => x.a[11], String)], ['Hits', top(all, x => x.a[4], String)]];
  } else {
    const all = Object.entries(S.pit).map(([id, a]) => ({ id: +id, a }));
    const q = all.filter(x => x.a[5] >= gp * 3);
    boards = [['Earned run average', top(q, x => -x.a[7] * 27 / x.a[5], v => (-v).toFixed(2))], ['Wins', top(all, x => x.a[2], String)], ['Strikeouts', top(all, x => x.a[9], String)], ['Saves', top(all, x => x.a[4], String)], ['Innings', top(all, x => x.a[5], v => ipStr(v))], ['WHIP', top(q, x => -(x.a[6] + x.a[8]) * 3 / x.a[5], v => (-v).toFixed(2))]];
  }
  const mt = myTeam();
  let h = `<section class="card"><div class="pad" style="padding-top:12px"><div class="seg" role="group" aria-label="Stat type"><button type="button" data-act="sv" data-v="bat" aria-pressed="${statView === 'bat'}">Hitting</button><button type="button" data-act="sv" data-v="pit" aria-pressed="${statView === 'pit'}">Pitching</button></div></div></section>`;
  if (!Object.keys(statView === 'bat' ? S.bat : S.pit).length) return h + `<section class="card"><div class="empty">Leaders appear after the first day of games.</div></section>`;
  h += boards.map(([title, rows]) => `<section class="card"><h2>${title}</h2><div class="list">${rows.map(([id, v], i) => { const tm = teamOf(id); return `<div class="item${tm === mt ? ' mine' : ''}"><span class="slot">${i + 1}</span><div class="nm"><button class="lnk" type="button" data-act="player" data-p="${id}"><b>${esc(P[id].name)}</b></button><span class="s">${tm}${tm === mt ? ' · yours' : ''}</span></div><span class="num" style="font-weight:600;font-size:16px">${v}</span></div>`; }).join('') || '<div class="empty">Not enough playing time yet.</div>'}</div></section>`).join('');
  return h;
}

// ---------------- modals ----------------
function openModal(title, body, extra) {
  $('#modal').innerHTML = `<div class="scrim" data-act="close"><div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}"><div class="hd"><h3>${esc(title)}</h3>${extra || ''}<button class="btn icon ghost" type="button" data-act="close" aria-label="Close">✕</button></div>${body}</div></div>`;
}
function closeModal() { $('#modal').innerHTML = ''; }
function openClaim() {
  const mt = myTeam();
  const body = `<div class="list">` + TEAMS.map(t => {
    const o = ownerOf(t.id), mine = o === me.id;
    return `<div class="item"><span class="abbr" style="width:38px">${t.id}</span><div class="nm"><b>${esc(t.city)}</b><span class="s">${t.lg} ${t.div} · payroll ≈ $${t.pay97}M · ${rec(t.id)}</span></div>${mine ? '<span class="tag mine">Yours</span>' : o ? `<span class="small muted">${esc(ownerName(o))}</span>` : locked() ? '<span class="small muted">Computer</span>' : `<button class="btn sm ${mt ? '' : 'primary'}" type="button" data-act="claim" data-t="${t.id}">${mt ? 'Switch' : 'Claim'}</button>`}</div>`;
  }).join('') + `</div>`;
  openModal(locked() ? 'Clubs' : 'Choose your club', (locked() ? '<p class="pad small muted" style="padding-top:12px;margin:0">The commissioner has locked the league. Team changes are closed.</p>' : '') + body);
}
function openPlayer(id) {
  const p = P[id], farmT = playerTeam(id) === 'FA' ? farmOrg(id) : null;
  if (p.pros && farmT && !minorsOf(farmT).includes(id)) return openProspect(id);
  const tid = farmT || playerTeam(id);
  const bars = Object.entries(p.rt).map(([k, v0], i) => { const v = seenR(id, v0, i + 1); return `<span class="lab">${({ con: 'Contact', pow: 'Power', eye: 'Eye', spd: 'Speed', def: 'Defense', stf: 'Stuff', ctl: 'Control', mov: 'Movement', sta: 'Stamina' })[k]}</span><span class="bar"><i class="${v >= 80 ? 'top' : v >= 65 ? 'hi' : ''}" style="width:${v}%"></i></span><span class="num">${v}</span>`; }).join('');
  let real, simL;
  if (p.t === 'H') {
    real = p.pros ? '' : `<tr><td>${FO.ERA.year} actual</td><td>${p.AB}</td><td>${fmt3(p.AVG)}</td><td>${p.HR}</td><td>${p.BB}</td><td>${p.SO}</td><td>${p.SB}</td></tr>`;
    const a = batLine(id);
    simL = a ? `<tr><td>This league</td><td>${a[2]}</td><td>${fmt3(a[4] / Math.max(1, a[2]))}</td><td>${a[7]}</td><td>${a[9]}</td><td>${a[10]}</td><td>${a[11]}</td></tr>` : '';
    real = `<div class="scroll"><table><thead><tr><th></th><th>AB</th><th>AVG</th><th>HR</th><th>BB</th><th>SO</th><th>SB</th></tr></thead><tbody>${real}${simL}</tbody></table></div>`;
  } else {
    const a = pitLine(id);
    real = p.pros ? '' : `<tr><td>${FO.ERA.year} actual</td><td>${ipStr(p.outs)}</td><td>${p.W}-${p.L}</td><td>${p.ERA.toFixed(2)}</td><td>${p.SO}</td><td>${p.BB}</td><td>${p.SV}</td></tr>`;
    simL = a ? `<tr><td>This league</td><td>${ipStr(a[5])}</td><td>${a[2]}-${a[3]}</td><td>${(a[7] * 27 / Math.max(1, a[5])).toFixed(2)}</td><td>${a[9]}</td><td>${a[8]}</td><td>${a[4]}</td></tr>` : '';
    real = `<div class="scroll"><table><thead><tr><th></th><th>IP</th><th>W-L</th><th>ERA</th><th>SO</th><th>BB</th><th>SV</th></tr></thead><tbody>${real}${simL}</tbody></table></div>`;
  }
  const fogged = myTeam() && tid !== myTeam() && formerTeam(id) !== myTeam() && fogErr();
  const hrows = historyRows(id);
  const histT = hrows.length ? `<div class="scroll"><table><thead><tr><th>In this league</th>${p.t === 'H' ? '<th>AB</th><th>AVG</th><th>HR</th><th>RBI</th><th>SB</th>' : '<th>IP</th><th>W-L</th><th>ERA</th><th>SO</th><th>SV</th>'}</tr></thead><tbody>${hrows.join('')}</tbody></table></div>` : '';
  const body = `${dynPlayerBits(id)}${injDays(id) ? `<p class="pad warn" style="padding-top:12px;margin:0">On the injured list, out about ${injDays(id)} more days.</p>` : ''}<div class="kv"><div><span>Overall${fogged ? ' (scouted)' : ''}</span><b>${sOvr(id)}${fogged ? `<span class="muted small"> ±${fogErr()}</span>` : ''}</b></div><div><span>Plays</span><b>${posShort(p)}</b></div><div><span>Age · ${p.t === 'H' ? 'Bats' : 'Throws'}</span><b>${p.age} · ${p.t === 'H' ? p.bats : p.throws}</b></div><div><span>${tid === 'FA' ? (isRetired(id) ? 'Status' : 'Asking') : 'Salary · through'}</span><b>${tid === 'FA' ? (isRetired(id) ? 'Retired' : money(FO.faAsk(p))) : money(salFor(id, tid)) + ' · ' + "'" + String(yearOf(endFor(id, tid))).slice(2)}</b></div></div>${p.pros ? `<div class="pad small" style="padding-top:12px">Came up through the farm. Potential ${potTag(id)}${p.gap > 0 ? ', still developing' : ', fully developed'}.</div>` : ''}${gloveLine(p) ? `<p class="pad small" style="padding-top:10px;margin:0"><b>Glove by position:</b> ${gloveLine(p)}${p.util ? ' <span class="tag">Utility</span>' : ''}</p>` : ''}<div class="bars">${bars}</div>${real}${histT}${farmT ? '' : playerActions(id, tid)}${farmActions(id)}`;
  openModal(p.name, body, `<span class="abbr">${esc(tid === 'FA' ? (isRetired(id) ? 'RETIRED' : 'FREE AGENT') : farmT ? tid + ' MINORS' : tid)}</span>`);
}
function openProspect(id) {
  const p = P[id], org = farmOrg(id), mt = myTeam();
  const bars = Object.entries(p.rt).map(([k, v0], i) => { const v = seenR(id, v0, i + 1); return `<span class="lab">${({ con: 'Contact', pow: 'Power', eye: 'Eye', spd: 'Speed', def: 'Defense', stf: 'Stuff', ctl: 'Control', mov: 'Movement', sta: 'Stamina' })[k]}</span><span class="bar"><i class="${v >= 80 ? 'top' : v >= 65 ? 'hi' : ''}" style="width:${v}%"></i></span><span class="num">${v}</span>`; }).join('');
  const fog = org !== mt && fogErr();
  const body = `<div class="kv"><div><span>Overall now${fog ? ' (scouted)' : ''}</span><b>${sOvr(id)}</b></div><div><span>Potential</span><b>${potGrade(id)}<span class="muted small"> ~${potSeen(id)}</span></b></div><div><span>Position · Age</span><b>${posShort(p)} · ${p.age}</b></div><div><span>${p.t === 'H' ? 'Bats' : 'Throws'}</span><b>${p.t === 'H' ? p.bats : p.throws}</b></div></div>
    <p class="pad small" style="padding-top:12px;margin:0"><b>${esc(etaText(id))}.</b> ${esc(TEAM[org].city)} prospect. The bars show what he can do today; he grows toward his potential every winter.${fog ? ` Your scouts' read on other clubs' prospects is accurate to about ±${fogErr()}.` : ''}</p>
    <div class="bars">${bars}</div>${farmActions(id)}`;
  openModal(p.name, body, `<span class="abbr">${esc(org)} FARM</span>`);
}
function openBox(i) {
  const g = box.games[i]; if (!g) return;
  const n = Math.max(g.ln[0].length, g.ln[1].length);
  const line = `<div class="scroll"><table><thead><tr><th></th>${Array.from({ length: n }, (_, k) => `<th>${k + 1}</th>`).join('')}<th>R</th></tr></thead><tbody>
    <tr><td><span class="abbr">${g.a}</span></td>${g.ln[0].map(x => `<td>${x}</td>`).join('')}${'<td></td>'.repeat(n - g.ln[0].length)}<td><b>${g.as}</b></td></tr>
    <tr><td><span class="abbr">${g.h}</span></td>${g.ln[1].map(x => `<td>${x}</td>`).join('')}${'<td></td>'.repeat(n - g.ln[1].length)}<td><b>${g.hs}</b></td></tr></tbody></table></div>`;
  const dec = id => id === g.dec[0] ? ' (W)' : id === g.dec[1] ? ' (L)' : id === g.dec[2] ? ' (S)' : '';
  const side = (tid, s) => `<h4 class="h2" style="font-size:16px;padding-top:16px">${esc(TEAM[tid].city)}</h4><div class="scroll"><table><thead><tr><th>Batting</th><th>AB</th><th>R</th><th>H</th><th>RBI</th><th>BB</th><th>SO</th><th>HR</th></tr></thead><tbody>${s.bat.map(b => `<tr><td class="name">${esc(P[b[0]].name)} <span class="muted small">${b[1]}</span></td>${b.slice(2).map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>
    <div class="scroll"><table><thead><tr><th>Pitching</th><th>IP</th><th>H</th><th>R</th><th>BB</th><th>SO</th><th>HR</th></tr></thead><tbody>${s.pit.map(r => `<tr><td class="name">${esc(P[r[0]].name)}<b>${dec(r[0])}</b></td><td>${ipStr(r[1])}</td>${r.slice(2).map(x => `<td>${x}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
  openModal(`${g.a} ${g.as}, ${g.h} ${g.hs}`, (g.log ? `<div class="pad" style="padding-top:10px"><button class="btn primary" type="button" data-act="watch" data-i="${i}">▶ Watch this game</button></div>` : '') + line + side(g.a, g.ab) + side(g.h, g.hb) + `<p class="pad small muted" style="padding-top:12px">Attendance ${g.att.toLocaleString()} at ${esc(TEAM[g.h].city)}.</p>`);
}

// ---------------- events ----------------
function renderTabs() {
  const fd = $('#fbDot'); if (fd) { const n = fbUnreadSafe(); fd.hidden = !n; fd.textContent = n; }
  const ic = {
    desk: '<path d="M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-5h4v5"/>',
    office: '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M9 7V4h6v3M3 12h18"/>',
    team: '<path d="M4 6h16M4 12h16M4 18h10"/>',
    league: '<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>',
    stats: '<path d="M5 20V10M12 20V4M19 20v-7"/>',
    trade: '<path d="M4 8h14l-3-3M20 16H6l3 3"/>',
    news: '<path d="M5 4h11v16H6a1 1 0 0 1-1-1zM16 8h3v11a1 1 0 0 1-2 0M8 8h5M8 12h5M8 16h3"/>',
    race: '<path d="M8 4h8v5a4 4 0 0 1-8 0zM8 6H5v1a3 3 0 0 0 3 3M16 6h3v1a3 3 0 0 1-3 3M12 13v4M8 20h8M9.5 17h5"/>',
    feedback: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9h8M8 12h5"/>',
  };
  const names = { desk: 'Desk', team: 'Team', trade: 'Moves', league: 'League', race: 'GM Race', office: 'Office' };
  const mt = myTeam();
  let teamBadge = 0; try { if (mt && S && W && isCustom(mt) && S.phase !== 'done') teamBadge = coachCount(mt).n; } catch (x) { /* ignore */ }
  const badge = mt && S ? trades.filter(t => t.to === mt && t.status === 'pending' && !offerStale(t)).length : 0;
  $('#tabs').innerHTML = `<div class="sidebrand">Front Office <span>'${String(meta && W ? yearOf(1) : 1997).slice(2)}</span></div>` + Object.keys(names).map(k => `<button class="tab" type="button" data-tab="${k}" ${tab === k ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${ic[k]}</svg>${names[k]}${k === 'trade' && badge ? `<span class="badge">${badge}</span>` : ''}${k === 'team' && (teamBadge || unseenNotes(k)) ? `<span class="badge" title="Updates">${unseenNotes(k) || teamBadge}</span>` : ''}${k !== 'team' && !(k === 'trade' && badge) && unseenNotes(k) ? `<span class="badge">${unseenNotes(k)}</span>` : ''}</button>`).join('');
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => { t.hidden = true; }, 3200); }

document.addEventListener('click', e => {
  const tb = e.target.closest('[data-tab]');
  if (tb) { if ((tb.dataset.tab === 'office' || tb.dataset.tab === 'feedback') && tab !== 'office' && tab !== 'feedback') lastTabBeforeOffice = tab; tab = tb.dataset.tab; if (tb.dataset.sub) leagueSub = tb.dataset.sub; renderTabs(); render(); window.scrollTo(0, 0); return; }
  if (e.target.id === 'meChip' || e.target.closest('#meChip')) { openClaim(); return; }
  if (e.target.id === 'lgChip' || e.target.closest('#lgChip')) { openLeaguePicker(); return; }
  if (e.target.id === 'resetChip' || e.target.closest('#resetChip')) { openReset(); return; }
  const el = e.target.closest('[data-act]'); if (!el) return;
  const a = el.dataset.act;
  if (a === 'close') { if (e.target === el || el.tagName === 'BUTTON') closeModal(); return; }
  if (el.tagName === 'SELECT' || (el.tagName === 'INPUT' && el.type === 'checkbox')) return;
  const i = +el.dataset.i, pid = el.dataset.p != null ? +el.dataset.p : null;
  switch (a) {
    case 'start': startLeague(el.dataset.era); break;
    case 'newseason': newSeason(); break;
    case 'openoff': openOffseason(); break;
    case 'closefa': closeFreeAgency(); break;
    case 'reset': resetLeague(el.dataset.era, el); break;
    case 'nextfa': marketDay(false); break;
    case 'extend': extendPlayer(pid); break;
    case 'market': tab = 'trade'; marketView = 'fa'; renderTabs(); render(); window.scrollTo(0, 0); break;
    case 'mv': marketView = el.dataset.v; render(); break;
    case 'faf': faFilter = el.dataset.v; render(); break;
    case 'fa': openPlayer(pid); break;
    case 'sign': signFA(pid); break;
    case 'bid': saveBid(pid); break;
    case 'unbid': withdrawBid(pid); break;
    case 'bidstep': bidStep(+el.dataset.d); break;
    case 'negstep': negStep(+el.dataset.d); break;
    case 'negotiate': negotiate(pid); break;
    case 'release': if (pid != null) { releasePlayer(pid, el); break; } release(); break;
    case 'claim-open': openClaim(); break;
    case 'claim': claim(el.dataset.t); break;
    case 'lock': meta = Object.assign({}, meta, { locked: !meta.locked }); writeDoc('league/meta', meta); logC(meta.locked ? 'Locked club changes' : 'Unlocked club changes'); render(); toast(meta.locked ? 'League locked. Team changes are closed.' : 'League unlocked. Free clubs can be claimed.'); break;
    case 'kick': { const t = el.dataset.t; const idle = inactiveDays(t) >= 14; if (el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.textContent = idle || !multiGM() ? 'Tap again to remove' : 'Tap again to ask the league'; break; }
      if (multiGM() && !idle) { proposeVote('kick', { tid: t }, `remove ${ownerName(ownerOf(t))} as GM of ${TEAM[t].city}`); break; }
      logC(`Removed ${ownerName(ownerOf(t))} from ${TEAM[t].city}${idle ? ` (inactive ${Math.floor(inactiveDays(t))} days)` : ''}`);
      teamWrite(t, { owner: null, lineup: undefined, rotation: undefined, closer: undefined }); toast('Removed. The computer runs ' + TEAM[t].city + ' now.'); break; }
    case 'vote': castVote(el.dataset.v === '1'); break;
    case 'pstab': psTab = el.dataset.v; render(); break;
    case 'hsub': histSub = el.dataset.v; render(); break;
    case 'importopen': openImport(); break;
    case 'gsearch': openSearch(); break;
    case 'multiopen': openMultiSim(); break;
    case 'msgo': runMulti(+el.dataset.n); break;
    case 'msstop': if (multi) { multi.stop = true; el.disabled = true; el.textContent = 'Stopping after this season…'; } break;
    case 'fbkind': { const t = $('#fbText'); if (t) fbDraft = t.value; fbKind = el.dataset.v; refreshFb(); break; }
    case 'fbsend': { const t = $('#fbText'); if (t) fbDraft = t.value; el.disabled = true; sendFeedback(); break; }
    case 'fbopen': openFeedback(); break;
    case 'fbmore': fbSent = 0; refreshFb(); break;
    case 'fbshowdone': fbShowDone = !fbShowDone; refreshFb(); break;
    case 'fbdone': db.doc('feedback/' + el.dataset.id).update({ done: el.dataset.v === '1' }).catch(() => toast('Could not update.')); break;
    case 'addopen': openAddPick(el.dataset.side); break;
    case 'addpick': addPick(pid, el.dataset.side); break;
    case 'dremove': { (el.dataset.side === 'give' ? tradeGive : tradeGet).delete(pid); builderOpen = ''; lastFeedback = null; closeModal(); render(); break; }
    case 'dswap': openSwap(pid, el.dataset.side); break;
    case 'swapdo': swapDo(pid, +el.dataset.n, el.dataset.side); break;
    case 'cashset': tradeCash = +el.dataset.v; lastFeedback = null; render(); break;
    case 'buildopen': { builderOpen = bKey(tradePartner, [...tradeGet]); el.disabled = true; el.textContent = 'Your scouts are working the phones…'; setTimeout(() => render(), 30); break; }
    case 'buildclose': builderOpen = ''; render(); break;
    case 'builduse': useDeal(i); break;
    case 'sendsolo': sendSoloToWeb(); break;
    case 'importskip': localSet(claimedKey(), 'skip'); render(); break;
    case 'importdo': doImport(el.dataset.id); break;
    case 'draft': openDraft(); break;
    case 'dtab': draftTab = el.dataset.v; paintDraft(); break;
    case 'dpos': draftPos = el.dataset.v; paintDraft(); break;
    case 'dpick': el.disabled = true; makePick(myTeam(), pid, 'gm'); break;
    case 'tour': openTour(true); break;
    case 'tournext': tourI++; paintTour(); break;
    case 'startx': localSet('start:' + leagueKeyNow(), 'x'); render(); break;
    case 'watch': watchGame(i); break;
    case 'watchnext': playAndWatch(); break;
    case 'w-skip': if (wRun) { wRun.fast = true; clearTimeout(wRun.t); wRun.step(); } break;
    case 'history': closeModal(); tab = 'league'; leagueSub = 'history'; histSub = el.dataset.v || 'book'; renderTabs(); render(); window.scrollTo(0, 0); break;
    case 'pscat': psCat = el.dataset.v; render(); break;
    case 'odready': odReady(); break;
    case 'unvote': withdrawVote(); break;
    case 'ready': setReady(); break;
    case 'uncall': cancelCall(); break;
    case 'sim': sim(+el.dataset.n); break;
    case 'lg': lgView = el.dataset.v; render(); break;
    case 'sv': statView = el.dataset.v; render(); break;
    case 'team': teamView = el.dataset.t; tab = 'team'; renderTabs(); render(); window.scrollTo(0, 0); break;
    case 'box': openBox(i); break;
    case 'player': openPlayer(pid); break;
    case 'lu': editLineup(l => { [l[i - 1], l[i]] = [l[i], l[i - 1]]; }); break;
    case 'ld': editLineup(l => { [l[i + 1], l[i]] = [l[i], l[i + 1]]; }); break;
    case 'ru': editStaff(s => { [s.rotation[i - 1], s.rotation[i]] = [s.rotation[i], s.rotation[i - 1]]; }); break;
    case 'rd': editStaff(s => { [s.rotation[i + 1], s.rotation[i]] = [s.rotation[i], s.rotation[i + 1]]; }); break;
    case 'topen': editStaff(s => { s.rotation = s.rotation.filter(x => x !== pid); }); break;
    case 'torot': editStaff(s => { if (s.rotation.length >= 6) { toast('The rotation holds six starters at most.'); return; } if (s.closer === pid) s.closer = null; s.rotation.push(pid); }); break;
    case 'closer': editStaff(s => { s.closer = pid; }); break;
    case 'coach-lu': coachStart(pid, el.dataset.pos); break;
    case 'coach-rot': coachRot(pid, +el.dataset.out); break;
    case 'coach-order': editLineup(l => { const o = FO.battingOrder(P, l); l.splice(0, 9, ...o.map(x => x.slice())); }); toast('Batting order sorted.'); break;
    case 'coach-all': coachAll(); break;
    case 'recover': openRecovery(); break;
    case 'recapply': el.disabled = true; recApply(el.dataset.g, +el.dataset.i); break;
    case 'recall': el.disabled = true; recAll(); break;
    case 'tb-play': el.disabled = true; playTiebreak(); break;
    case 'tb-watch': watchTiebreak(); break;
    case 'tb-skip': if (tbRun) { tbRun.fast = true; clearTimeout(tbRun.t); tbRun.step(); } break;
    case 'note-x': { const L = notesNow(), k = L.findIndex(n => n.id === el.dataset.id); if (k >= 0) L.splice(k, 1); render(); break; }
    case 'note-clear': { const t = el.dataset.t; notesBy[noteKey()] = notesNow().filter(n => n.tab !== t); render(); break; }
    case 'auto':teamWrite(myTeam(), { lineup: undefined, rotation: undefined, closer: undefined }); break;
    case 'price': { const tid = myTeam(); const cur = setup(tid).price; teamWrite(tid, { price: Math.max(3, Math.min(60, Math.round((cur + 0.5 * +el.dataset.d) * 2) / 2)) }); break; }
    case 'propose': propose(); break;
    case 'rm': rosterMode = el.dataset.v; render(); break;
    case 'sort': { const k = el.dataset.k; rSort = rSort.k === k ? { k, d: -rSort.d } : { k, d: k === 'name' || k === 'pos' || k === 'slot' || k === 'era' ? 1 : -1 }; render(); break; }
    case 'lv': leagueView = el.dataset.v; render(); break;
    case 'stsub': stSub = el.dataset.v; render(); break;
    case 'stlg': stLg = el.dataset.v; render(); break;
    case 'stsort': { const k = el.dataset.k; stSort = stSort.k === k ? { k, d: -stSort.d } : { k, d: -1 }; render(); break; }
    case 'stsortp': { const k = el.dataset.k; stSortP = stSortP.k === k ? { k, d: -stSortP.d } : { k, d: (k === 'era' || k === 'whip' || k === 'l' || k === 'h' || k === 'r' || k === 'bb' || k === 'hr') ? 1 : -1 }; render(); break; }
    case 'nf': newsFilter = el.dataset.v; render(); break;
    case 'hint': showHint = !showHint; render(); break;
    case 'cashstep': { const st = 250000 * (SC() > 1 ? 4 : 1); tradeCash = Math.round((tradeCash + st * +el.dataset.d) / st) * st; tradeCash = Math.max(-20e6 * SC(), Math.min(20e6 * SC(), tradeCash)); render(); break; }
    case 'goto-offers': tab = 'trade'; marketView = 'trade'; renderTabs(); render(); setTimeout(() => { const o = $('#offers'); if (o) o.scrollIntoView(); }, 0); break;
    case 'clearpick': tradeGive.clear(); tradeGet.clear(); tradeCash = 0; render(); break;
    case 'accept': answer(el.dataset.id, true); break;
    case 'counter': { const t = trades.find(x => x.id === el.dataset.id); if (!t) break; tradePartner = t.from; tradeGive = new Set(t.get); tradeGet = new Set(t.give); tradeCash = -(t.cash || 0); showHint = false; lastFeedback = null; marketView = 'trade'; render(); window.scrollTo(0, 0); toast('Their offer is loaded. Change it and send it back.'); break; }
    case 'callup': callUp(pid); break;
    case 'ov': officeView = el.dataset.v; if (el.dataset.go) { tab = 'office'; renderTabs(); } render(); window.scrollTo(0, 0); break;
    case 'lsub': leagueSub = el.dataset.v; render(); break;
    case 'span': simSpan = el.dataset.v; try { localStorage.setItem('fo-span', simSpan); } catch (x) { /* ignore */ } closeModal(); renderSimBar(); break;
    case 'spanpick': openSpanPicker(); break;
    case 'play': closeModal(); sim(spanDays(simSpan)); break;
    case 'recap': showRecap(); break;
    case 'paper': openPaper(el.dataset.id); break;
    case 'leagues': openLeaguePicker(); break;
    case 'resetopen': openReset(); break;
    case 'pickleague': { const k = el.dataset.k; switchLeague(k === 'solo' ? { kind: 'solo', id: 'solo', name: 'Solo' } : k === 'main' ? { kind: 'main', id: 'main', name: 'Main league' } : { kind: 'custom', id: el.dataset.id, name: el.dataset.name }); break; }
    case 'createleague': createLeague(); break;
    case 'schedule': openSchedule(); break;
    case 'saveclock': saveSchedule(); break;
    case 'joincode': joinByCode(); break;
    case 'invite': openInvite(); break;
    case 'copyinv': copyInvite(); break;
    case 'closelg': closeLeague(el.dataset.id); break;
    case 'reopenlg': reopenLeague(el.dataset.id); break;
    case 'dellg': deleteLeague(el.dataset.id); break;
    case 'promo': setBiz({ promo: +el.dataset.v }); break;
    case 'spon': setBiz({ spon: +el.dataset.v }); break;
    case 'tv': chooseTV(el.dataset.v); break;
    case 'build': buildProject(el.dataset.k); break;
    case 'borrow': loanStep(1); break;
    case 'repay': loanStep(-1); break;
    case 'fw': findWhere = el.dataset.v; render(); break;
    case 'fp': findPos = el.dataset.v; render(); break;
    case 'tradefor': tradeFor(pid); break;
    case 'loadidea': loadIdea(String(el.dataset.i)[0] === 'h' ? el.dataset.i : i); break;
    case 'bizapply': applyAdvice(i); break;
    case 'bpost': postBoard(el.dataset.v); break;
    case 'unpost': unpost(el.dataset.id); break;
    case 'tradewith': { const t = el.dataset.t; if (tradePartner !== t) { tradeGet.clear(); tradeGive.clear(); tradeCash = 0; } tradePartner = t; showHint = !ownerOf(t); lastFeedback = null; marketView = 'trade'; render(); window.scrollTo(0, 0); break; }
    case 'senddown': sendDown(pid); break;
    case 'decline': answer(el.dataset.id, false); break;
    case 'cancel': answer(el.dataset.id, null); break;
  }
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.id === 'teamSel') { teamView = el.value; render(); return; }
  if (el.id === 'stTeam') { stTeam = el.value; render(); return; }
  if (el.id === 'findSort') { findSort = el.value; render(); return; }
  if (el.id === 'faSort') { faSort = el.value; render(); return; }
  if (el.id === 'clkPreset') { const p = CLOCK_PRESETS[el.value]; const n = $('#clkNote'); if (n) n.textContent = p ? p.note : 'Pick how often and how many games.'; const c = $('#clkCustom'); if (c) c.hidden = !!p; return; }
  if (el.dataset && el.dataset.auto) { setAuto(el.dataset.auto, el.checked); return; }
  if (el.dataset && el.dataset.autodraft) { teamWrite(myTeam(), { autoDraft: el.checked || undefined }); toast(el.checked ? 'Your scouts will pick for you.' : 'You make your own picks.'); return; }
  if (el.id === 'negYrs' && nego) { nego.yrs = +el.value; return; }
  if (el.id === 'bneed') { boardNeed = el.value; return; }
  if (el.id === 'bpid') { boardPid = el.value; return; }
  if (el.id === 'stQual') { stQual = el.checked; render(); return; }
  if (el.id === 'partner') { tradePartner = el.value; tradeGet.clear(); showHint = false; render(); return; }
  if (el.dataset && el.dataset.biz) { bizInput(el, true); return; }
  if (el.id === 'openSim') { if (charterLocked()) { const want = el.checked; el.checked = !want; proposeVote('rule', { meta: { openSim: want } }, want ? 'let any GM advance the calendar' : 'let only the commissioner advance the calendar'); return; } meta = Object.assign({}, meta, { openSim: el.checked }); writeDoc('league/meta', meta); logC(el.checked ? 'Let any GM advance the calendar' : 'Only the commissioner advances the calendar'); render(); return; }
  const a = el.dataset.act;
  if (a === 'pos') { const i = +el.dataset.i; editLineup(l => { l[i][1] = el.value; }); }
  if (a === 'swapin' && el.value !== '') { const i = +el.value, pid = +el.dataset.p; editLineup(l => { l[i][0] = pid; }); }
  if (a === 'pick') { const set = el.dataset.side === 'give' ? tradeGive : tradeGet, pid = +el.dataset.p; if (el.checked) set.add(pid); else set.delete(pid); render(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
document.addEventListener('input', e => {
  const el = e.target;
  if (el.id === 'bnote') { boardNote = el.value; return; }
  if (el.id === 'fbText') { fbDraft = el.value; return; }
  if (el.id === 'gQ') { gQ = el.value; const r = $('#gRes'); if (r) r.innerHTML = gsearchResults(); return; }
  if (el.id === 'findQ') { findQ = el.value; const r = $('#findRes'); if (r) r.innerHTML = findResultsHTML(); return; }
  const mt = myTeam(); if (!mt || !S) return;
  if (el.dataset && el.dataset.biz) bizInput(el, false);
});


// ---------------- drag and drop (lineup, bench, rotation, bullpen) ----------------
function moveSlot(kind, from, to) {
  if (from === to) return;
  if (kind === 'lu') editLineup(l => { const [x] = l.splice(from, 1); l.splice(to, 0, x); });
  else editStaff(st => { const [x] = st.rotation.splice(from, 1); st.rotation.splice(to, 0, x); });
}
// What happens when a dragged row (src) lands on a target row or list (dst). Returns a label, or null if not allowed.
function dropPlan(src, dst) {
  const sk = src.kind, dk = dst.kind, onRow = dst.p != null;
  const nm = id => lastName(id);
  if (sk === 'lu' && dk === 'lu' && onRow && dst.i !== src.i) return { label: `Bat ${dst.i + 1}${['st', 'nd', 'rd'][dst.i] || 'th'}`, go: () => moveSlot('lu', src.i, dst.i) };
  if (sk === 'bn' && dk === 'lu' && onRow) return { label: `Start at ${dst.pos} for ${nm(dst.p)}${FO.canPlay(P[src.p], dst.pos) ? '' : ' (out of position)'}`, go: () => { editLineup(l => { l[dst.i][0] = src.p; }); toast(`${P[src.p].name} starts at ${dst.pos}.`); } };
  if (sk === 'lu' && dk === 'bn') {
    if (onRow) return { label: `Bench ${nm(src.p)} for ${nm(dst.p)}`, go: () => { editLineup(l => { l[src.i][0] = dst.p; }); toast(`${P[dst.p].name} starts at ${src.pos}.`); } };
    const su = setup(myTeam()), inL = new Set(su.lineup.map(x => x[0]));
    const sub = su.roster.filter(id => P[id].t === 'H' && !inL.has(id) && !hurtNow(id)).sort((x, y) => luScore(y, src.pos) - luScore(x, src.pos))[0];
    if (sub == null) return null;
    return { label: `Bench him · ${nm(sub)} plays ${src.pos}`, go: () => { editLineup(l => { l[src.i][0] = sub; }); toast(`${P[sub].name} starts at ${src.pos}.`); } };
  }
  if (sk === 'ru' && dk === 'ru' && onRow && dst.i !== src.i) return { label: `Start game ${dst.i + 1}`, go: () => moveSlot('ru', src.i, dst.i) };
  if (sk === 'bp' && dk === 'ru') {
    if (onRow) return { label: `Start instead of ${nm(dst.p)}`, go: () => { editStaff(st => { st.rotation[dst.i] = src.p; if (st.closer === src.p) st.closer = null; }); toast(`${P[src.p].name} joins the rotation.`); } };
    if (setup(myTeam()).rotation.length >= 6) return null;
    return { label: 'Add to the rotation', go: () => { editStaff(st => { st.rotation.push(src.p); if (st.closer === src.p) st.closer = null; }); toast(`${P[src.p].name} joins the rotation.`); } };
  }
  if (sk === 'ru' && dk === 'bp') {
    if (onRow && dst.cl) return { label: `Make him closer · ${nm(dst.p)} starts`, go: () => { editStaff(st => { st.rotation[src.i] = dst.p; st.closer = src.p; }); toast(`${P[src.p].name} is your closer.`); } };
    if (onRow) return { label: `Swap with ${nm(dst.p)}`, go: () => editStaff(st => { st.rotation[src.i] = dst.p; }) };
    if (setup(myTeam()).rotation.length <= 4) return null;
    return { label: 'Move to the bullpen', go: () => editStaff(st => { st.rotation.splice(src.i, 1); }) };
  }
  if (sk === 'bp' && dk === 'bp' && onRow && dst.cl && dst.p !== src.p) return { label: 'Make closer', go: () => { editStaff(st => { st.closer = src.p; }); toast(`${P[src.p].name} is your closer.`); } };
  return null;
}
function rowInfo(el) {
  if (!el) return null;
  const r = el.closest('[data-row]');
  if (r) return { kind: r.dataset.row, el: r, p: +r.dataset.p, i: r.dataset.i != null ? +r.dataset.i : null, pos: r.dataset.pos, cl: r.dataset.cl === '1' };
  const z = el.closest('[data-zone]');
  return z ? { kind: z.dataset.zone, el: z, p: null } : null;
}
let dragS = null;
function clearDrop() { document.querySelectorAll('.droptarget').forEach(x => x.classList.remove('droptarget')); }
document.addEventListener('pointerdown', e => {
  const g = e.target.closest('[data-drag]'); if (!g || e.button > 0) return;
  const src = rowInfo(g); if (!src || !src.el.dataset.row) return;
  e.preventDefault();
  const rect = src.el.getBoundingClientRect();
  dragS = { src, g, id: e.pointerId, x0: e.clientX, y0: e.clientY, dx: e.clientX - rect.left, dy: e.clientY - rect.top, w: rect.width, ghost: null, plan: null, x: e.clientX, y: e.clientY, raf: 0 };
  try { g.setPointerCapture(e.pointerId); } catch (x) { /* ignore */ }
});
function dragFrame() {
  const d = dragS; if (!d) return;
  const hd = document.querySelector('header.top'), nv = document.querySelector('nav.tabs');
  const top = hd ? Math.max(0, hd.getBoundingClientRect().bottom) : 0;
  const nb = nv && innerWidth < 900 ? nv.getBoundingClientRect().top : innerHeight, bot = Math.min(innerHeight, nb > 0 ? nb : innerHeight);
  const edge = 64, vy = d.y < top + edge ? -Math.min(24, (top + edge - d.y) / 3) : d.y > bot - edge ? Math.min(24, (d.y - bot + edge) / 3) : 0;
  if (vy) { window.scrollBy(0, vy); dragTarget(); }
  d.raf = requestAnimationFrame(dragFrame);
}
function dragTarget() {
  const d = dragS; if (!d || !d.ghost) return;
  const el = document.elementFromPoint(d.x, d.y), dst = rowInfo(el);
  clearDrop();
  d.plan = dst && dst.el !== d.src.el ? dropPlan(d.src, dst) : null;
  if (d.plan) dst.el.classList.add('droptarget');
  d.hint.textContent = d.plan ? d.plan.label : 'Drop on a highlighted spot';
  d.hint.classList.toggle('no', !d.plan);
}
document.addEventListener('pointermove', e => {
  const d = dragS; if (!d || e.pointerId !== d.id) return;
  e.preventDefault();
  d.x = e.clientX; d.y = e.clientY;
  if (!d.ghost) {
    if (Math.hypot(d.x - d.x0, d.y - d.y0) < 4) return;
    const id = d.src.p, gh = document.createElement('div'); gh.className = 'dragghost';
    const pos = d.src.pos || (P[id].t === 'P' ? (d.src.kind === 'ru' ? 'SP' : d.src.el.dataset.cl ? 'CL' : 'RP') : posShort(P[id]));
    gh.innerHTML = `<span class="${ovrClass(sOvr(id))}">${sOvr(id)}</span><div><b>${esc(P[id].name)}</b> <span class="tag">${pos}</span><div class="draghint"></div></div>`;
    document.body.appendChild(gh); d.ghost = gh; d.hint = gh.querySelector('.draghint'); d.gw = gh.offsetWidth;
    d.src.el.classList.add('dragsrc'); document.body.classList.add('dragging-on');
    d.raf = requestAnimationFrame(dragFrame);
  }
  const gx = Math.max(8, Math.min(innerWidth - d.gw - 8, d.x - d.gw / 2)), gy = Math.max(4, d.y - 84);
  d.ghost.style.transform = `translate(${gx}px,${gy}px)`;
  dragTarget();
}, { passive: false });
function endDrag(e) {
  const d = dragS; if (!d || (e && e.pointerId !== d.id)) return;
  dragS = null; cancelAnimationFrame(d.raf);
  clearDrop(); d.src.el.classList.remove('dragsrc'); document.body.classList.remove('dragging-on');
  if (d.ghost) d.ghost.remove();
  if (d.plan && e && e.type === 'pointerup') d.plan.go();
}
document.addEventListener('pointerup', endDrag);
document.addEventListener('pointercancel', endDrag);
document.addEventListener('keydown', e => {
  const g = e.target.closest && e.target.closest('[data-drag="lu"],[data-drag="ru"]'); if (!g || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return;
  e.preventDefault();
  const i = +g.dataset.i, n = g.dataset.drag === 'lu' ? 9 : setup(myTeam()).rotation.length, to = Math.max(0, Math.min(n - 1, i + (e.key === 'ArrowUp' ? -1 : 1)));
  if (to === i) return;
  moveSlot(g.dataset.drag, i, to);
  setTimeout(() => { const n2 = document.querySelector(`[data-drag="${g.dataset.drag}"][data-i="${to}"]`); if (n2) n2.focus(); }, 30);
});

// ---------------- free agency ----------------
let bidDraft = null, busy = false, faSort = 'ovr';
const FA_DAYS = 5;
async function deleteDoc(path) {
  if (mode === 'local') { saveLocal(); return; }
  const full = L(path);
  return queued(full, () => db.doc(full).delete()).catch(() => toast('Could not save. Check your connection and try again.'));
}
function logTx(t) { const id = newId(); t.ts = Date.now(); trades.unshift(Object.assign({ id }, t)); if (mode === 'local') saveLocal(); else writeDoc('trades/' + id, t).catch(() => {}); }
function fixPatch(tid, roster) {
  const d = docs[tid] || {}, rs = new Set(roster), patch = { roster };
  if (d.lineup && d.lineup.some(s => !rs.has(s[0]))) patch.lineup = undefined;
  if (d.rotation) patch.rotation = d.rotation.filter(id => rs.has(id));
  if (d.closer != null && !rs.has(d.closer)) patch.closer = undefined;
  return patch;
}
const marketOpen = () => S && (S.phase === 'season' || S.phase === 'offseason');
function bidsFor(pid) { return Object.values(bids).filter(b => b.pid === pid && ownerOf(b.tid)); }
function myBid(pid) { const mt = myTeam(); return mt ? bids[mt + '-' + pid] : null; }
function faDay() { return (S && S.fa && S.fa.day) || 0; }
function formerTeam(pid) { return (S && S.fa && S.fa.prev && S.fa.prev[pid]) || null; }
function wasTeam(id) { const f = formerTeam(id); if (f) return 'was ' + f; if (P[id].pros) return 'Former prospect'; return P[id].team === 'FA' ? 'Minors' : 'was ' + P[id].team; }
// Today's asking price. In the offseason prices slide about 8% a day; a player's former club gets 10% off.
function askNow(pid, tid) {
  let a = FO.faAsk(P[pid]);
  if (S.phase === 'offseason') a *= Math.max(0.6, 1 - 0.08 * faDay());
  if (tid && formerTeam(pid) === tid) a *= 0.9;
  return Math.max(FO.ERA.minSal, Math.round(a / 10000) * 10000);
}
function expiring(tid) { const s = seasonNo(); return rosterOf(tid).filter(id => endFor(id, tid) <= s).sort((a, b) => P[b].ovr - P[a].ovr); }

function viewMarket() {
  return `<section class="card"><div class="pad" style="padding-top:12px"><div class="seg" role="group" aria-label="Market"><button type="button" data-act="mv" data-v="trade" aria-pressed="${marketView === 'trade'}">Trades</button><button type="button" data-act="mv" data-v="fa" aria-pressed="${marketView === 'fa'}">Free agents</button><button type="button" data-act="mv" data-v="find" aria-pressed="${marketView === 'find'}">Search</button><button type="button" data-act="mv" data-v="board" aria-pressed="${marketView === 'board'}">Rumors</button></div></div></section>` + (marketView === 'fa' ? viewFA() : marketView === 'find' ? viewFind() : marketView === 'board' ? viewBoard() : viewTrade());
}
function faRow(id, mt, opts) {
  const p = P[id], off = S.phase === 'offseason', mb = myBid(id), nb = off ? bidsFor(id).length : 0;
  const price = askNow(id, mt);
  const line = quick(id) !== '—' ? quick(id) : p.pros ? 'Potential ' + potGrade(id) : (p.t === 'H' ? `${fmt3(p.AVG)}, ${p.HR} HR in ${FO.ERA.year}` : `${p.ERA.toFixed(2)} ERA in ${FO.ERA.year}`);
  const tags = (mb ? `<span class="tag mine">Your offer ${money(mb.sal)}</span> ` : '') + (nb && !mb ? `<span class="tag gold">${nb} OFFER${nb > 1 ? 'S' : ''}</span> ` : '') + (mt && formerTeam(id) === mt ? '<span class="tag">10% OFF</span>' : '');
  const btns = mt && marketOpen() ? `<span class="ctrls"><button class="btn sm primary" type="button" data-act="fa" data-p="${id}">${opts && opts.label || 'Sign'}</button></span>` : '';
  const fv = mt ? faVerdict(id, mt) : null;
  const val = `<span class="s"><b>${fmtWar(warOf(id))} WAR</b>${fv ? (fv.fit.gain >= 0.3 ? ` · <span class="goodt">+${fv.fit.wins.toFixed(1)} wins for you</span> · <span class="${fv.cls === 'bad' ? 'badt' : fv.cls === 'warnc' ? '' : 'goodt'}">${fv.txt.toLowerCase()}</span>` : ' · depth only') : ''}</span>`;
  return `<div class="item farow"><span class="${ovrClass(sOvr(id))}">${sOvr(id)}</span><div class="nm"><button class="lnk" type="button" data-act="fa" data-p="${id}"><b>${esc(p.name)}</b></button> <span class="muted small">${posShort(p)} · ${p.age}</span><span class="s">${esc(wasTeam(id))} · ${line}</span>${val}${tags ? `<span class="s">${tags}</span>` : ''}</div><span class="faprice"><b class="num">${money(price)}</b><span class="small muted">${off ? 'today' : 'a year'}</span>${btns}</span></div>`;
}
function viewFA() {
  const mt = myTeam(), off = S.phase === 'offseason', season = seasonNo();
  let intro;
  if (off) intro = `<b>Day ${Math.min(faDay() + 1, FA_DAYS)} of ${FA_DAYS}.</b> Two ways to land a player. <b>Sign now</b> at today's price and he's yours on the spot. Or <b>make an offer</b> for less and wait: when the commissioner moves to the next day, each player takes his best offer of at least 80% of the day's price, and computer clubs bid too. Prices drop about 8% a day, so waiting is cheaper but riskier. If you lose someone, you'll see it in News and can go after the next name.`;
  else if (S.phase === 'season') intro = `Sign anyone on the spot at the asking price. You pay a ${Math.round(FO.BONUS * 100)}% signing bonus up front, then his salary. Players whose contracts run out after this season hit the open market in the offseason, so extend the ones you want to keep.`;
  else intro = 'The market reopens when the commissioner opens the offseason. You can still extend players whose contracts are running out.';
  let h = `<section class="card"><h2>${off ? 'Free agency' : 'Free agents'}<span class="sub">${freeAgents().length} available</span></h2><div class="pad small">${intro}</div>`;
  if (mt) {
    const n = rosterOf(mt).length;
    h += `<div class="kv"><div><span>Your cash</span><b>${money(cashOf(mt))}</b></div><div><span>Payroll</span><b>${money(payroll(mt))}</b></div><div><span>Roster</span><b>${n} / 28</b></div>${off ? `<div><span>Your offers</span><b>${Object.values(bids).filter(b => b.tid === mt).length}</b></div>` : ''}</div>`;
  }
  h += `</section>`;
  // Your free agents
  if (mt) {
    if (off) {
      const mine = freeAgents().filter(id => formerTeam(id) === mt).sort((a, b) => P[b].ovr - P[a].ovr);
      h += `<section class="card"><h2>Your free agents<span class="sub">${mine.length ? 'left your roster this winter' : ''}</span></h2>${mine.length ? `<div class="pad small muted" style="padding-bottom:6px">These players' contracts ran out. You get 10% off to bring them back, but anyone can sign them.</div><div class="list">${mine.map(id => faRow(id, mt, { label: 'Re-sign' })).join('')}</div>` : '<div class="empty">None of your players are on the market right now.</div>'}</section>`;
      const lostRecent = trades.filter(t => t.status === 'outbid' && t.from === mt && t.season === season).slice(0, 5);
      if (lostRecent.length) h += `<section class="card alert"><h2>Missed out</h2><div class="news">${lostRecent.map(t => `<div><span class="d">Day ${t.day}</span><span>${esc(P[t.pid].name)} signed with ${t.winner ? esc(TEAM[t.winner].city) + ' for ' + money(t.wsal) + ' a year' : 'another club'}. Your offer was ${money(t.sal)}.</span></div>`).join('')}</div></section>`;
    } else {
      const ex = expiring(mt);
      h += `<section class="card"><h2>Contracts ending after ${yearOf(season)}<span class="sub">${ex.length} players</span></h2>${ex.length ? `<div class="pad small muted" style="padding-bottom:6px">Extend now or they hit the open market in the offseason.</div><div class="list">${ex.map(id => { const p = P[id]; return `<div class="item farow"><span class="${ovrClass(p.ovr)}">${p.ovr}</span><div class="nm"><button class="lnk" type="button" data-act="player" data-p="${id}"><b>${esc(p.name)}</b></button> <span class="muted small">${posShort(p)} · ${p.age}</span><span class="s">Now ${money(salFor(id, mt))} · ${quick(id)}</span></div><span class="faprice"><b class="num">${money(FO.faAsk(p))}</b><span class="small muted">to extend</span><span class="ctrls"><button class="btn sm" type="button" data-act="player" data-p="${id}">Extend</button></span></span></div>`; }).join('')}</div>` : '<div class="empty">Nobody on your roster is in the last year of his deal.</div>'}</section>`;
    }
  }
  const fopts = [['all', 'All'], ['need', 'My needs'], ['C', 'C'], ['1B', '1B'], ['2B', '2B'], ['3B', '3B'], ['SS', 'SS'], ['LF', 'LF'], ['CF', 'CF'], ['RF', 'RF'], ['DH', 'DH'], ['SP', 'SP'], ['RP', 'RP']].concat(off && mt ? [['mine', 'My offers']] : []);
  h += `<section class="card"><div class="pad" style="padding-top:12px;display:grid;gap:10px"><div class="seg scrollseg" role="group" aria-label="Filter by position">${fopts.map(([k, l]) => `<button type="button" data-act="faf" data-v="${k}" aria-pressed="${faFilter === k}">${l}</button>`).join('')}</div>
    <label class="row small" for="faSort" style="gap:8px"><span class="muted">Sort by</span><select id="faSort" style="flex:1">${[['ovr', 'Overall'], ['war', 'WAR'], ['fit', 'Wins added for you'], ['value', 'Best value (cost per win)'], ['price', 'Cheapest'], ['young', 'Youngest']].map(([k, l]) => `<option value="${k}" ${faSort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label></div>`;
  let list = freeAgents().slice();
  const OFP = ['LF', 'CF', 'RF', 'OF'];
  if (['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF'].includes(faFilter)) list = list.filter(id => P[id].t === 'H' && FO.canPlay(P[id], faFilter));
  if (faFilter === 'DH') list = list.filter(id => P[id].t === 'H' && (P[id].pos === 'DH' || P[id].pos === '1B'));
  if (faFilter === 'H') list = list.filter(id => P[id].t === 'H');
  if (faFilter === 'SP') list = list.filter(id => P[id].t === 'P' && P[id].role === 'SP');
  if (faFilter === 'RP') list = list.filter(id => P[id].t === 'P' && P[id].role !== 'SP');
  if (faFilter === 'mine') list = list.filter(id => myBid(id));
  if (faFilter === 'need' && mt) list = list.filter(id => fitFor(id, mt).gain >= 0.3);
  void OFP;
  const fitC = {}, fit = id => fitC[id] || (fitC[id] = mt ? fitFor(id, mt) : { gain: 0, wins: 0 });
  const key = { ovr: id => sOvr(id), war: id => warOf(id), fit: id => fit(id).gain, value: id => fit(id).gain >= 0.3 ? -askNow(id, mt) / fit(id).gain : -1e12, price: id => -askNow(id, mt), young: id => -P[id].age }[faSort] || (id => sOvr(id));
  list.sort((a, b) => key(b) - key(a) || sOvr(b) - sOvr(a));
  const shown = list.slice(0, 60);
  h += `<div class="list">` + (shown.length ? shown.map(id => faRow(id, mt)).join('') : '<div class="empty">Nobody here right now.</div>') + `</div>${list.length > 60 ? `<div class="pad small muted" style="padding-top:10px">Showing the top 60 of ${list.length}.</div>` : ''}</section>`;
  return h;
}

function playerActions(id, tid) {
  const mt = myTeam(); if (!mt) return '';
  const p = P[id], season = seasonNo(), off = S.phase === 'offseason';
  if (tid === 'FA') {
    if (!marketOpen()) return `<p class="pad small muted" style="padding-top:12px">Free agents can be signed during the season or in the offseason.</p>`;
    const price = askNow(id, mt), maxY = off ? 5 : FO.faYears(p);
    const base = off ? season + 1 : season;
    const yrOpts = n => Array.from({ length: maxY }, (_, i) => `<option value="${i + 1}" ${i + 1 === n ? 'selected' : ''}>${i + 1} season${i ? 's' : ''} · through ${yearOf(base + i)}</option>`).join('');
    const n = rosterOf(mt).length, bonus = Math.round(price * FO.BONUS);
    const blocked = n >= 28 ? 'Your roster is full (28). Release or trade someone first.' : cashOf(mt) < bonus ? `You need ${money(bonus)} in cash for the signing bonus.` : '';
    let h = `<div class="pad" style="padding-top:12px">${faInsight(id, mt)}</div><div class="meter"><b>Sign now</b><div class="row small"><span style="flex:1">${off ? "Today's price" : 'Salary'}${formerTeam(id) === mt ? ' (10% off, he played for you)' : ''}</span><b class="num">${money(price)} a year</b></div><div class="row small"><span style="flex:1">Signing bonus now</span><b class="num">${money(bonus)}</b></div>
      <label class="small muted" for="faYrs">Contract length</label><select id="faYrs">${yrOpts(Math.min(FO.faYears(p), maxY))}</select>
      ${blocked ? `<div class="warn">${blocked}</div>` : ''}<div><button class="btn primary" type="button" data-act="sign" data-p="${id}" ${blocked ? 'disabled' : ''}>Sign ${esc(p.name)} now</button></div></div>`;
    h += negoView(id, mt);
    if (off) {
      const mb = myBid(id);
      if (!bidDraft || bidDraft.pid !== id) bidDraft = { pid: id, sal: mb ? mb.sal : Math.round(price * 0.85 / 10000) * 10000, yrs: mb ? mb.yrs : Math.min(FO.faYears(p), 5) };
      const low = bidDraft.sal < price * 0.8;
      h += `<div class="meter"><b>Or make an offer and wait</b><div class="row small"><span style="flex:1">Offers so far</span><b class="num">${bidsFor(id).length}</b></div>
      <div class="price" style="justify-content:space-between"><button class="btn icon" type="button" data-act="bidstep" data-d="-1" aria-label="Lower offer">−</button><b class="num" id="bidSal" style="font-size:28px">${money(bidDraft.sal)}</b><button class="btn icon" type="button" data-act="bidstep" data-d="1" aria-label="Raise offer">+</button></div>
      <label class="small muted" for="bidYrs">Contract length</label><select id="bidYrs">${yrOpts(bidDraft.yrs)}</select>
      <div class="small ${low ? 'warn' : 'muted'}" id="bidNote">${low ? "Under 80% of today's price. He'll pass unless his price falls." : `He decides when the commissioner moves to the next day. Bonus if he signs: ${money(Math.round(bidDraft.sal * FO.BONUS))}.`}</div>
      <div class="row"><button class="btn" type="button" data-act="bid" data-p="${id}">${mb ? 'Update offer' : 'Send offer'}</button>${mb ? `<button class="btn ghost" type="button" data-act="unbid" data-p="${id}">Withdraw</button>` : ''}</div></div>`;
    }
    return h;
  }
  if (TEAM[tid] && tid !== mt && marketOpen()) return `<div class="pad" style="padding-top:12px"><button class="btn" type="button" data-act="tradefor" data-p="${id}">Trade for ${esc(p.name)}</button></div>`;
  if (tid === mt && S.phase !== 'post') {
    let h = '';
    const end = endFor(id, tid);
    if (end <= season && S.phase !== 'offseason') {
      const ask = FO.faAsk(p);
      const yrOpts = Array.from({ length: 5 }, (_, i) => `<option value="${i + 1}" ${i + 1 === FO.faYears(p) ? 'selected' : ''}>${i + 1} more season${i ? 's' : ''} · through ${yearOf(season + i + 1)}</option>`).join('');
      h += `<div class="meter"><b>Extend his contract</b><div class="small">His deal ends after ${yearOf(season)}. Extend now at <b class="num">${money(ask)}</b> a year starting today, or he becomes a free agent in the offseason.</div>
        <label class="small muted" for="extYrs">Extension</label><select id="extYrs">${yrOpts}</select>
        <div><button class="btn primary" type="button" data-act="extend" data-p="${id}">Extend ${esc(p.name)}</button></div></div>`;
    }
    if (marketOpen()) {
      const sal = salFor(id, tid);
      const rest = S.phase === 'season' ? (LEN() - S.day) / LEN() : 0;
      const future = Math.max(0, end - season);
      const buyout = Math.round(0.5 * sal * (rest + future));
      const err = FO.rosterOk(P, rosterOf(tid).filter(x => x !== id));
      h += `<div class="meter"><div class="small">Releasing him costs <b class="num">${money(buyout)}</b>, half of what is left on his contract. He goes to the free-agent market.</div>${err ? `<div class="warn">You can't release him: your ${err}.</div>` : ''}<div><button class="btn" type="button" data-act="release" data-p="${id}" data-buyout="${buyout}" ${err ? 'disabled' : ''}>Release ${esc(p.name)}</button></div></div>`;
    }
    return h;
  }
  return '';
}
function bidStep(d) {
  if (!bidDraft) return;
  const price = askNow(bidDraft.pid, myTeam());
  const step = price >= 20e6 ? 1e6 : price >= 3e6 ? 250000 : price >= 1e6 ? 100000 : 50000;
  bidDraft.sal = Math.max(FO.ERA.minSal, Math.min(FO.ERA.maxSal * 1.5, bidDraft.sal + d * step));
  const s = $('#bidSal'); if (s) s.textContent = money(bidDraft.sal);
  const n = $('#bidNote'); if (n) { const low = bidDraft.sal < price * 0.8; n.className = 'small ' + (low ? 'warn' : 'muted'); n.textContent = low ? "Under 80% of today's price. He'll pass unless his price falls." : `He decides when the commissioner moves to the next day. Bonus if he signs: ${money(Math.round(bidDraft.sal * FO.BONUS))}.`; }
}
async function saveBid(pid) {
  const mt = myTeam(); if (!mt || S.phase !== 'offseason' || !bidDraft || bidDraft.pid !== pid) return;
  const yrs = +($('#bidYrs') && $('#bidYrs').value) || 1;
  const b = { tid: mt, pid, sal: bidDraft.sal, yrs, by: me.id, ts: Date.now() };
  bids[mt + '-' + pid] = b; closeModal(); render();
  toast('Offer sent to ' + P[pid].name + '.');
  await writeDoc('bids/' + mt + '-' + pid, b);
}
async function withdrawBid(pid) {
  const mt = myTeam(); if (!mt) return;
  delete bids[mt + '-' + pid]; bidDraft = null; closeModal(); render();
  await deleteDoc('bids/' + mt + '-' + pid);
}
async function signFA(pid, deal) {
  const mt = myTeam(); if (!mt || !marketOpen()) return;
  const p = P[pid], price = deal ? deal.price : askNow(pid, mt), bonus = Math.round(price * FO.BONUS);
  const yrs = deal ? deal.yrs : (+($('#faYrs') && $('#faYrs').value) || 1);
  const off = S.phase === 'offseason';
  if (mode === 'shared') {
    const lease = await dref('fa/' + pid).acquire({ holder: me.id, ttlMs: 8000 });
    if (!lease.acquired) { toast('Another club is signing him right now.'); return; }
  }
  invalidate();
  if (!freeAgents().includes(pid)) { toast(p.name + ' already signed elsewhere.'); closeModal(); return; }
  if (rosterOf(mt).length >= 28 || cashOf(mt) < bonus) return;
  const d = docs[mt] || {};
  const end = (off ? seasonNo() : seasonNo() - 1) + yrs;
  const con = Object.assign({}, d.con || {}); con[pid] = [price, end];
  closeModal();
  await teamWrite(mt, { roster: rosterOf(mt).concat([pid]), con, cashAdj: (d.cashAdj || 0) - bonus });
  // any offers on him are void now
  for (const k of Object.keys(bids)) if (bids[k].pid === pid) { delete bids[k]; await deleteDoc('bids/' + k); }
  toast(deal ? `Deal! ${p.name} signs for ${money(price)} a year through ${yearOf(end)}.` : p.name + ' signed through ' + yearOf(end) + '.');
  logTx({ type: 'sign', from: mt, pid, sal: price, status: 'signed', season: seasonNo() });
}
async function extendPlayer(pid) {
  const mt = myTeam(); if (!mt) return;
  const yrs = +($('#extYrs') && $('#extYrs').value) || 1;
  const p = P[pid], ask = FO.faAsk(p), d = docs[mt] || {};
  const con = Object.assign({}, d.con || {}); con[pid] = [ask, seasonNo() + yrs];
  closeModal();
  await teamWrite(mt, { con });
  toast(`${p.name} extended through ${yearOf(seasonNo() + yrs)} at ${money(ask)} a year.`);
  logTx({ type: 'extend', from: mt, pid, sal: ask, status: 'extended', season: seasonNo() });
}
async function releasePlayer(pid, el) {
  const mt = myTeam(); if (!mt || !marketOpen()) return;
  if (el.dataset.confirm !== '1') { el.dataset.confirm = '1'; el.textContent = 'Tap again to release'; return; }
  const roster = rosterOf(mt).filter(x => x !== pid);
  if (FO.rosterOk(P, roster)) return;
  const buyout = +el.dataset.buyout || 0, d = docs[mt] || {};
  const con = Object.assign({}, d.con || {}); delete con[pid];
  closeModal();
  await teamWrite(mt, Object.assign(fixPatch(mt, roster), { con, cashAdj: (d.cashAdj || 0) - buyout }));
  toast(P[pid].name + ' released.');
  logTx({ type: 'release', from: mt, pid, sal: buyout, status: 'released', season: seasonNo() });
}

// ---------------- offseason (commissioner) ----------------
async function openOffseason(opts) {
  if (busy || (!isCommish() && !(opts && opts.auto)) || S.phase !== 'done') return;
  if (!(opts && (opts.auto || opts.call)) && needsCall('openoff')) { callSim('openoff'); return; }
  if (!(opts && opts.auto) && multiGM()) logC('Opened the offseason');
  busy = true; toast('Opening the offseason…');
  try {
    const season = seasonNo(), teams = {};
    TEAMS.forEach(t => { const su = setup(t.id); teams[t.id] = { roster: su.roster.slice(), con: su.con }; });
    const ex = FO.expireContracts(W, season, teams);
    // optioned players whose deals are up leave the minors and hit free agency
    if (farmLive()) {
      let nf = null;
      for (const t of TEAMS) {
        const mn = minorsOf(t.id); if (!mn.length) continue;
        const con = Object.assign({}, (docs[t.id] && docs[t.id].con) || {}), gone = mn.filter(id => !con[id] || con[id][1] <= season);
        if (!gone.length) continue;
        gone.forEach(id => { delete con[id]; ex.pool[id] = { prev: t.id }; });
        nf = nf || clone(farm); nf.by[t.id] = (nf.by[t.id] || []).filter(x => !gone.includes(x));
        await teamWrite(t.id, { con, minors: mn.filter(x => !gone.includes(x)) });
        if (ex.teams[t.id]) ex.teams[t.id].con = Object.assign({}, ex.teams[t.id].con); gone.forEach(id => { if (ex.teams[t.id]) delete ex.teams[t.id].con[id]; });
      }
      if (nf) await setFarm(nf);
    }
    // players age a year; some free agents retire; the greats go to the Hall of Fame
    const dres = runDynWinter(season, Object.keys(ex.pool).concat(freeAgents()), id => (ex.pool[id] && ex.pool[id].prev) || formerTeam(id) || playerTeam(id));
    dres.retired.forEach(id => { delete ex.pool[id]; });
    await saveDyn(dres.dyn);
    const fw = runFarmWinter(season, ex.teams);
    for (const t of TEAMS) {
      const nt = ex.teams[t.id];
      if (nt.roster.length !== teams[t.id].roster.length) await teamWrite(t.id, Object.assign(fixPatch(t.id, nt.roster), { con: nt.con }));
    }
    if (fw.farm) await setFarm(fw.farm);
    if (fw.draftKs) { await startDraft(season, fw.order, fw.draftKs); }
    const S2 = clone(S); S2.phase = 'offseason';
    if (fw.draftKs) S2.news.unshift([S2.day, `Draft night is open: ${fw.draftKs.length} prospects, two rounds, worst record picks first.`, 'fa']);
    if (fw.order) {
      const first = fw.picks[fw.order[0]] && fw.picks[fw.order[0]][0];
      fw.promoted.filter(([, id]) => P[id].ovr >= 58).slice(0, 4).forEach(([tid, id]) => S2.news.unshift([S2.day, `${TEAM[tid].city} call up top prospect ${P[id].name}.`, 'fa', tid]));
      if (first != null) S2.news.unshift([S2.day, `The draft: ${TEAM[fw.order[0]].city} take ${P[first].name} (${posShort(P[first])}, ${P[first].age}) first overall.`, 'fa', fw.order[0]]);
      for (const [tid, id] of (fw.grew || [])) if (ownerOf(tid) && P[id] && P[id].pb >= 3 && farmOrg(id) === tid) logTx({ type: 'farm', from: tid, pid: id, status: 'grew', season });
      for (const t of TEAMS) if (ownerOf(t.id) && fw.picks[t.id]) fw.picks[t.id].forEach((id, rd) => logTx({ type: 'farm', from: t.id, pid: id, status: 'drafted', season, pick: rd * fw.order.length + fw.order.indexOf(t.id) + 1, rd: rd + 1 }));
    }
    const prev = {}; for (const id in ex.pool) prev[id] = ex.pool[id].prev;
    S2.fa = { day: 0, prev };
    const n = Object.keys(ex.pool).length;
    S2.news.unshift([S2.day, `The offseason is open. ${n} players with expiring contracts are free agents.`, 'fa']);
    const wp = dynNews(S2, dres, season);
    wp.forEach(p => addNote('league', { icon: p.kind === 'hof' ? '🏛️' : '👋', title: 'Extra! ' + esc(p.head), body: esc(p.sub || ''), btn: ['paper', 'Read it', p.id] }));
    S = S2; invalidate();
    if (mode === 'local') saveLocal(); else await writeDoc('league/state', S);
    marketView = 'fa'; render();
  } finally { busy = false; }
}
// One market day: players take their best qualifying offer. final=true also fills every roster and starts the next season.
async function marketDay(final, opts) {
  if (busy || (!isCommish() && !(opts && opts.auto)) || S.phase !== 'offseason') return;
  if (!(opts && (opts.auto || opts.call)) && needsCall(final ? 'closefa' : 'nextfa')) { callSim(final ? 'closefa' : 'nextfa'); return; }
  if (!(opts && opts.auto) && multiGM()) logC(final ? 'Closed free agency and started the new season' : 'Advanced free agency one day');
  busy = true; toast(final ? 'Closing free agency…' : 'Players are weighing offers…');
  try {
    if (final) await finishDraft(true);
    invalidate();
    const season = seasonNo(), day = faDay(), pool = {}, teams = {};
    freeAgents().forEach(id => { pool[id] = { ask: askNow(id), yrs: FO.faYears(P[id]) }; });
    TEAMS.forEach(t => { const su = setup(t.id); teams[t.id] = { roster: su.roster.slice(), con: su.con, owner: ownerOf(t.id), cash: cashOf(t.id), pct: S.std[t.id][0] / Math.max(1, S.std[t.id][0] + S.std[t.id][1]) }; });
    // a former club's offers count 10% richer
    const list = Object.values(bids).filter(b => ownerOf(b.tid) && pool[b.pid] && teams[b.tid]).map(b => Object.assign({}, b, { sal: b.sal }));
    const pool2 = {}; for (const id in pool) pool2[id] = pool[id];
    list.forEach(b => { if (formerTeam(b.pid) === b.tid) b.sal = Math.round(b.sal / 0.9); });
    const res = FO.resolveFreeAgency(W, season, teams, pool2, list, FO.rng((meta.seed ^ (season * 7919) ^ (day * 104729)) >>> 0), final ? {} : { fill: false, cpuSkip: 0.5, slotFrac: 0.3 });
    // undo the scoring bump for the stored contract
    res.signed.forEach(s => { const b = list.find(x => x.pid === s.pid && x.tid === s.tid); if (b && formerTeam(s.pid) === s.tid) { const orig = bids[s.tid + '-' + s.pid]; if (orig) { s.sal = orig.sal; res.teams[s.tid].con[s.pid][0] = orig.sal; } } });
    const adj = {};
    for (const t of TEAMS) {
      const nt = res.teams[t.id], d = docs[t.id] || {};
      adj[t.id] = (d.cashAdj || 0) - (res.spent[t.id] || 0);
      if (nt.roster.length !== teams[t.id].roster.length || res.spent[t.id]) await teamWrite(t.id, Object.assign(fixPatch(t.id, nt.roster), { con: nt.con, cashAdj: adj[t.id] }));
    }
    // signings by human clubs and missed targets go to each club's front-office log
    for (const s of res.signed) if (ownerOf(s.tid)) logTx({ type: 'sign', from: s.tid, pid: s.pid, sal: s.sal, status: 'signed', season });
    for (const l of res.lost) if (ownerOf(l.tid)) logTx({ type: 'outbid', from: l.tid, pid: l.pid, sal: l.sal, winner: l.winner, wsal: l.wsal, status: 'outbid', season, day: day + 1 });
    // clear offers on players who are gone; everything else stays on the table
    const gone = new Set(res.signed.map(s => s.pid));
    for (const k of Object.keys(bids)) if (final || gone.has(bids[k].pid)) { delete bids[k]; await deleteDoc('bids/' + k); }
    const big = res.signed.slice().sort((x, y) => y.sal - x.sal).slice(0, final ? 10 : 6);
    if (!final) {
      const S2 = clone(S);
      S2.fa = Object.assign({}, S2.fa, { day: day + 1 });
      big.reverse().forEach(s => S2.news.unshift([S2.day, `${P[s.pid].name} signs with ${TEAM[s.tid].city}: ${money(s.sal)} a year for ${s.yrs} season${s.yrs > 1 ? 's' : ''}.`, 'fa', s.tid]));
      S2.news.unshift([S2.day, `Free agency day ${day + 1}: ${res.signed.length} players signed.`, 'fa']);
      S = S2; invalidate();
      if (mode === 'local') saveLocal(); else await writeDoc('league/state', S);
      render();
      const mine = res.lost.filter(l => l.tid === myTeam()).length;
      toast(`Day ${day + 1} done: ${res.signed.length} signings.${mine ? ` You missed out on ${mine}.` : ''}`);
      return;
    }
    const seed = (Math.random() * 4294967295) >>> 0;
    await saveHistory();
    const S2 = FO.newState(seed, (meta && meta.len) || 162); S2.open = {}; S2.adj0 = {};
    TEAMS.forEach(t => { S2.fan[t.id] = Math.round((1 + (fanOf(t.id) - 1) * 0.6) * 1000) / 1000; });
    for (const t of TEAMS) { const b = docs[t.id] && docs[t.id].biz; if (b && b.tv === 'advance' && (b.tvFor || 0) < season + 1) await teamWrite(t.id, { biz: Object.assign({}, b, { tv: 'safe', tvLump: undefined }) }); }
    TEAMS.forEach(t => { S2.fin[t.id][0] = S.fin[t.id][0]; S2.adj0[t.id] = adj[t.id]; S2.open[t.id] = S.fin[t.id][0] + adj[t.id]; });
    big.reverse().forEach(s => S2.news.unshift([0, `${P[s.pid].name} signs with ${TEAM[s.tid].city}: ${money(s.sal)} a year for ${s.yrs} season${s.yrs > 1 ? 's' : ''}.`, 'fa', s.tid]));
    S2.news.push([0, `Free agency closed. ${res.signed.length} more players signed on the final day.`, 'fa']);
    meta = Object.assign({}, meta, { seed, season: season + 1 });
    S = S2; box = { day: 0, games: [] }; invalidate();
    if (farmLive()) FO.applyFarm(W, farm, seasonNo());
    if (mode === 'local') saveLocal();
    else { await writeDoc('league/meta', meta); await writeDoc('league/state', S); await writeDoc('league/box', box); }
    tab = 'desk'; renderTabs(); render();
    toast('Free agency is closed. Welcome to ' + yearOf(season + 1) + '.');
  } finally { busy = false; }
}
async function closeFreeAgency(opts) { return marketDay(true, opts); }

// ---------------- farm system ----------------
// Each club keeps up to 8 prospects. They develop on their own every winter (faster with a bigger
// scouting & development budget), a two-round draft refills the farm, and you can call a prospect up,
// send a young player down, or put prospects in trades. Nothing else to manage.
let forgCache = null;
function farmSig() { return meta ? String(meta.created || meta.seed) : ''; }
function farmLive() { return !!(farm && W && farm.lid === farmSig() && farm.era === curEra); }
function farmOrg(id) {
  if (!forgCache) { forgCache = {}; if (farmLive()) for (const t in farm.by) (farm.by[t] || []).forEach(x => { forgCache[x] = t; }); }
  return forgCache[id] || null;
}
function farmOf(tid) { return farmLive() ? (farm.by[tid] || []).filter(id => P[id]) : []; }
function orgOf(id) { const t = playerTeam(id); return t !== 'FA' ? t : (farmOrg(id) || 'FA'); }
function syncFarm() {
  if (!W || !meta) return;
  if (!farmLive()) {
    if (!farmLoaded || !me.canWrite) return;
    farm = FO.newFarm(W, (Number(meta.created || meta.seed) % 4294967296) >>> 0, curEra);
    farm.lid = farmSig();
    saveFarm();
  }
  FO.applyFarm(W, farm, seasonNo()); invalidate();
}
function saveFarm() { if (mode === 'local') { saveLocal(); return Promise.resolve(); } return writeDoc('league/farm', farm).catch(() => {}); }
function setFarm(next) { farm = next; FO.applyFarm(W, farm, seasonNo()); invalidate(); render(); return saveFarm(); }
const GRADES = [[80, 'A'], [75, 'A-'], [70, 'B+'], [65, 'B'], [60, 'B-'], [55, 'C+'], [0, 'C']];
function potSeen(id) { const p = P[id]; return p && p.peak ? seenR(id, p.peak.ovr, 9) : (p ? p.ovr : 0); }
function potGrade(id) { const v = potSeen(id); return GRADES.find(g => v >= g[0])[1]; }
function isReady(id) { const p = P[id]; return !!(p && p.pros && p.gap <= FO.READY_GAP); }
function etaText(id) {
  const p = P[id]; if (!p || !p.pros) return '';
  if (p.gap <= FO.READY_GAP) return 'Ready now';
  const yrs = Math.max(1, Math.ceil((p.gap - FO.READY_GAP) / 0.17));
  return 'ETA ' + yearOf(seasonNo() + (S && S.phase === 'offseason' ? yrs : yrs));
}
function potTag(id) { const g = potGrade(id); return `<span class="tag ${g[0] === 'A' ? 'gold' : ''}" title="Potential">POT ${g}</span>`; }
function prospectLine(id) { const p = P[id]; return `${posShort(p)} · ${p.age} · ${etaText(id)}`; }

function viewFarm(tid) {
  const mt = myTeam(), mine = tid === mt, ids = farmOf(tid).slice().sort((a, b) => (isReady(b) - isReady(a)) || potSeen(b) - potSeen(a));
  if (!farmLive()) return '';
  const can = mine && S.phase !== 'post';
  const room = rosterOf(tid).length < 28;
  const rows = ids.map(id => {
    const p = P[id];
    const btn = can ? `<span class="ctrls"><button class="btn sm${isReady(id) ? ' primary' : ''}" type="button" data-act="callup" data-p="${id}" ${room ? '' : 'disabled'}>Call up</button></span>` : '';
    const opt = minorsOf(tid).includes(id);
    return `<div class="item"><span class="${ovrClass(sOvr(id))}">${sOvr(id)}</span><div class="nm"><button class="lnk" type="button" data-act="player" data-p="${id}"><b>${esc(p.name)}</b></button> ${opt ? '<span class="tag">Optioned</span>' : potTag(id)}${isReady(id) ? ' <span class="tag mine">Ready</span>' : ''}<span class="s">${opt ? `${posShort(p)} · ${p.age} · ${money(salFor(id, tid))} a year` : esc(prospectLine(id))}</span></div>${btn}</div>`;
  }).join('');
  const note = mine ? `To send a player down, tap his name on your roster and choose Send to the minors (27 and under). Prospects develop on their own every winter. A bigger scouting &amp; development budget speeds them up. You draft two new players each offseason, and the farm holds ${FO.FARM_MAX}.${room ? '' : ' Your big-league roster is full, so make room before calling someone up.'}` : `${esc(TEAM[tid].city)}'s top prospects${fogErr() ? '. Potential grades come from your scouts' : ''}.`;
  return `<section class="card"><h2>Farm system<span class="sub">${ids.length} of ${FO.FARM_MAX} · OVR now, POT = ceiling</span></h2><div class="pad small muted" style="padding-bottom:6px">${note}</div><div class="list">${rows || '<div class="empty">No prospects right now.</div>'}</div></section>`;
}

async function callUp(pid) {
  const mt = myTeam(); if (!mt || farmOrg(pid) !== mt || busy) return;
  if (rosterOf(mt).length >= 28) { toast('Your roster is full (28). Release or trade someone first.'); return; }
  busy = true;
  try {
    const off = S.phase === 'offseason', end = (off ? seasonNo() : seasonNo() - 1) + 3;
    const d = docs[mt] || {}, con = Object.assign({}, d.con || {}), optioned = minorsOf(mt).includes(pid);
    if (!optioned || !con[pid]) con[pid] = [FO.ERA.minSal, end];
    const roster = rosterOf(mt).concat([pid]);
    const next = clone(farm); next.by[mt] = (next.by[mt] || []).filter(x => x !== pid);
    closeModal();
    await setFarm(next);
    await teamWrite(mt, { roster, con, minors: minorsOf(mt).filter(x => x !== pid) });
    toast(optioned ? `${P[pid].name} is back in the majors.` : `${P[pid].name} is called up: minimum salary through ${yearOf(end)}.`);
    logTx({ type: 'farm', from: mt, pid, status: 'called up', season: seasonNo() });
  } finally { busy = false; }
}
async function sendDown(pid) {
  const mt = myTeam(); if (!mt || playerTeam(pid) !== mt || !canOption(pid) || busy) return;
  const roster = rosterOf(mt).filter(x => x !== pid), err = FO.rosterOk(P, roster);
  if (err) { toast('You can\'t send him down: your ' + err + '.'); return; }
  if (farmOf(mt).length >= FO.FARM_MAX) { toast(`Your farm is full (${FO.FARM_MAX}). Call someone up first.`); return; }
  busy = true;
  try {
    const d = docs[mt] || {}, con = Object.assign({}, d.con || {});
    // farm-grown players on a minimum deal go back to prospect status; anyone else keeps his contract
    const homegrown = P[pid].pros && (!con[pid] || con[pid][0] <= FO.ERA.minSal);
    const patch = {};
    if (homegrown) delete con[pid];
    else { if (!con[pid]) con[pid] = [salFor(pid, mt), endFor(pid, mt)]; patch.minors = minorsOf(mt).filter(x => x !== pid).concat([pid]); }
    const next = clone(farm); (next.by[mt] = next.by[mt] || []).push(pid);
    closeModal();
    await teamWrite(mt, Object.assign(fixPatch(mt, roster), { con }, patch));
    await setFarm(next);
    toast(homegrown ? `${P[pid].name} is back on the farm.` : `${P[pid].name} is in the minors. His salary still counts.`);
    logTx({ type: 'farm', from: mt, pid, status: 'sent down', season: seasonNo() });
  } finally { busy = false; }
}
function farmActions(id) {
  const mt = myTeam(), p = P[id]; if (!mt) return '';
  if (!p.pros) {
    if (farmOrg(id) === mt && S.phase !== 'post') { const full = rosterOf(mt).length >= 28; return `<div class="meter"><b>In the minors</b><div class="small">He keeps his contract (${money(salFor(id, mt))} a year through ${yearOf(endFor(id, mt))}) and his salary still counts against your payroll. Bring him back whenever you have a spot.</div>${full ? '<div class="warn">Your roster is full (28). Make room first.</div>' : ''}<div><button class="btn primary" type="button" data-act="callup" data-p="${id}" ${full ? 'disabled' : ''}>Call up ${esc(p.name)}</button></div></div>`; }
    if (playerTeam(id) === mt && S.phase !== 'post') {
      if (!canOption(id)) return `<p class="pad small muted" style="padding-top:10px;margin:0">At ${p.age} he's out of minor-league options. Only players 27 and under can be sent down.</p>`;
      return `<div class="meter"><b>Send to the minors</b><div class="small">Frees a roster spot. He keeps his contract and his salary still counts. Call him back up any time.</div><div><button class="btn" type="button" data-act="senddown" data-p="${id}">Send ${esc(p.name)} down</button></div></div>`;
    }
    return '';
  }
  if (farmOrg(id) === mt && S.phase !== 'post') {
    const full = rosterOf(mt).length >= 28;
    return `<div class="meter"><b>${isReady(id) ? 'Ready for the majors' : 'Still developing'}</b><div class="small">${isReady(id) ? 'His development is about done. Call him up and he plays at the level you see.' : `He plays at about ${p.ovr} today and keeps growing every winter on the farm. Calling him up early is allowed. He keeps developing in the majors too.`} He signs for the minimum, ${money(FO.ERA.minSal)}, for three seasons.</div>${full ? '<div class="warn">Your roster is full (28). Make room first.</div>' : ''}<div><button class="btn primary" type="button" data-act="callup" data-p="${id}" ${full ? 'disabled' : ''}>Call up ${esc(p.name)}</button></div></div>`;
  }
  if (playerTeam(id) === mt && S.phase !== 'post') {
    return `<div class="meter"><b>Send to the minors</b><div class="small">He came up through the farm, so you can send him back down. ${salFor(id, mt) <= FO.ERA.minSal ? 'His minimum deal comes off your payroll and he goes back to developing as a prospect.' : 'He keeps his contract and it still counts.'}</div><div><button class="btn" type="button" data-act="senddown" data-p="${id}">Send ${esc(p.name)} down</button></div></div>`;
  }
  return '';
}

// Winter: development, CPU call-ups and the draft. Called by openOffseason with rosters after contracts expire.
function runFarmWinter(season, teams) {
  if (!farmLive()) return { teams, picks: {}, promoted: [] };
  const pct = tid => S.std[tid][0] / Math.max(1, S.std[tid][0] + S.std[tid][1]);
  const order = TEAMS.map(t => t.id).sort((a, b) => pct(a) - pct(b));
  const devFrac = tid => Math.min(1, setup(tid).biz.dev / FO.ERA.fin.devMax);
  const scoutFrac = tid => Math.min(1, setup(tid).scout / FO.ERA.scoutMax);
  const res = FO.farmWinter(W, farm, season, order, devFrac, id => orgOf(id) === 'FA' ? null : orgOf(id), scoutFrac, { noDraft: true });
  const next = res.farm; FO.applyFarm(W, next, season);
  const promoted = [];
  // computer clubs promote ready prospects into open roster spots
  for (const t of TEAMS) {
    if (ownerOf(t.id)) continue;
    const nt = teams[t.id]; if (!nt) continue;
    const ready = (next.by[t.id] || []).filter(id => W.P[id].gap <= FO.READY_GAP).sort((a, b) => W.P[b].ovr - W.P[a].ovr);
    for (const id of ready.slice(0, 3)) {
      if (nt.roster.length >= 25) break;
      nt.roster.push(id); nt.con = Object.assign({}, nt.con); nt.con[id] = [FO.ERA.minSal, season + 3];
      next.by[t.id] = next.by[t.id].filter(x => x !== id); promoted.push([t.id, id]);
    }
  }
  return { teams, farm: next, picks: res.picks, order, promoted, grew: res.grew, draftKs: res.draftKs };
}

// ---------------- Business (Office → Business) ----------------
// Theme-park style levers: prices, promotions, marketing, sponsors, TV deal, ballpark projects, a bank loan.
let officeView = 'overview';
function bizDoc(tid) { return Object.assign({}, (docs[tid] && docs[tid].biz) || {}); }
function setBiz(patch) {
  const mt = myTeam(); if (!mt) return Promise.resolve();
  const b = Object.assign(bizDoc(mt), patch);
  return teamWrite(mt, { biz: b });
}
function loanOf(tid) { return (docs[tid] && docs[tid].biz && docs[tid].biz.loan) || 0; }
function fanOf(tid) { return (S && S.fan && S.fan[tid]) || 1; }
function fanScore(v) { return Math.round(Math.max(0, Math.min(100, 50 + (v - 1) / 0.45 * 50))); }
function nextHomeOf(tid) { if (!S || S.phase !== 'season') return null; for (let d = S.day; d < Math.min(LEN(), S.day + 12); d++) { const g = W.sched[d] && W.sched[d].find(x => x[0] === tid); if (g) return g[1]; } return null; }
// Projected crowd and money for the next home game with a candidate setup
function previewGame(tid, over) {
  const su0 = setup(tid), opp = nextHomeOf(tid) || TEAMS.find(t => t.id !== tid).id;
  const su = Object.assign({}, su0, { price: over && over.price != null ? over.price : su0.price, biz: Object.assign({}, su0.biz, over && over.biz || {}) });
  const att = FO.attendance(W, S, tid, opp, su.price, () => 0.5, su);
  const m = FO.gameMoney(W, S, tid, su, att);
  return { att, m, cap: FO.capOf(tid, su.biz), opp, su };
}
function previewText(tid, over) {
  const { att, m, cap } = previewGame(tid, over);
  const tot = m.gate + m.conc + m.park + m.merch - m.promo;
  return `Typical home game: <b class="num">${att.toLocaleString()}</b> fans (${Math.round(att / cap * 100)}% full) · tickets <b class="num">${money(m.gate)}</b> · food <b class="num">${money(m.conc)}</b> · parking <b class="num">${money(m.park)}</b> · merch &amp; suites <b class="num">${money(m.merch)}</b>${m.promo ? ` · promos −${money(m.promo)}` : ''} = <b class="num">${money(tot)}</b>`;
}
const pctTxt = v => (v >= 0 ? '+' : '−') + Math.abs(Math.round(v * 100)) + '%';
function viewFanCard(mt) {
  const su = setup(mt), cur = fanOf(mt), tgt = FO.fanTarget(W, S, mt, su), sc = fanScore(cur), ts = fanScore(tgt);
  const parts = FO.fanParts(W, S, mt, su).filter(p => Math.abs(p[1]) >= 0.005).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  const dir = ts > sc + 1 ? 'rising' : ts < sc - 1 ? 'falling' : 'steady';
  return `<section class="card"><h2>Fan interest<span class="sub">${dir === 'rising' ? '▲ rising' : dir === 'falling' ? '▼ falling' : 'steady'}</span></h2>
    <div class="pad"><div class="fanmeter" role="img" aria-label="Fan interest ${sc} out of 100, heading to ${ts}"><i style="width:${sc}%"></i><b style="left:${ts}%" title="Where it's heading"></b></div>
    <div class="row small" style="margin-top:6px"><span style="flex:1"><b class="num" style="font-size:22px">${sc}</b><span class="muted"> / 100 · heading to ${ts}</span></span><span class="muted">Crowds ${pctTxt(cur - 1)} vs normal</span></div>
    <p class="small muted" style="margin:8px 0 6px">Fan interest moves a little every day toward where your club is heading. It fills seats, sells merch and drives a ratings-based TV deal.</p>
    <div class="drivers">${parts.map(([l, v]) => `<span>${esc(l)}</span><span class="num ${v > 0 ? 'goodt' : 'badt'}">${v > 0 ? '+' : '−'}${Math.abs(Math.round(v * 100))}</span>`).join('') || '<span class="muted">Nothing moving it right now.</span>'}</div></div></section>`;
}
function slider(id, label, val, min, max, step, txt, note, dis) {
  return `<label for="${id}" class="row" style="margin-top:12px"><span style="flex:1">${label}</span><b class="num" id="${id}v">${txt}</b></label>
    <input type="range" id="${id}" data-biz="${id}" min="${min}" max="${max}" step="${step}" value="${val}" ${dis ? 'disabled' : ''}>${note ? `<p class="small muted" id="${id}n" style="margin:2px 0 0">${note}</p>` : ''}`;
}
const concLabel = m => m <= 0.8 ? 'Bargain' : m <= 1.05 ? 'Normal' : m <= 1.3 ? 'Pricey' : m <= 1.6 ? 'Steep' : 'Stadium gouge';
function viewBusiness() {
  const mt = myTeam(), su = setup(mt), b = su.biz, F = FO.ERA.fin, t = TEAM[mt];
  const live = S.phase === 'season' || S.phase === 'offseason';
  let h = viewFanCard(mt);
  // pricing
  h += `<section class="card"><h2>Ballpark prices</h2><div class="pad sliders">
    ${slider('tix', 'Tickets', su.price, FO.ERA.price[0], FO.ERA.price[1], SC() > 1 ? 1 : 0.5, '$' + su.price.toFixed(2), `Normal for ${esc(t.city)} is about $${t.price0}. Fans start to grumble above $${Math.round(t.price0 * 1.2)}.`, !live)}
    ${slider('conc', 'Food &amp; drinks', b.conc, 0.6, 2, 0.05, concLabel(b.conc) + ' · ' + Math.round(b.conc * 100) + '%', 'Higher prices make more per fan until they stop buying. Above "Pricey" fans get annoyed.', !live)}
    ${slider('park', 'Parking', b.park, 0, F.park0 * 3, SC() > 1 ? 1 : 0.5, '$' + b.park.toFixed(2), `Normal is $${F.park0}. ${b.builds.garage ? 'Your garage softens complaints.' : 'Steep parking keeps some fans home.'}`, !live)}
    <p class="small" id="bizprev" style="margin:12px 0 0">${previewText(mt)}</p></div></section>`;
  // marketing
  const seg = (act, opts, cur) => `<div class="seg scrollseg" role="group">${opts.map((o, i) => `<button type="button" data-act="${act}" data-v="${i}" aria-pressed="${cur === i}">${esc(o)}</button>`).join('')}</div>`;
  const sponTxt = Math.round(F.spon * Math.pow(t.mkt, 0.3));
  h += `<section class="card"><h2>Marketing &amp; promotions</h2><div class="pad sliders">
    <span class="small"><b>Promotion nights</b> · ${money(F.promo)} per home game per level. Bobbleheads, fireworks, dollar dogs: more fans and a bit more interest.</span>${seg('promo', FO.PROMOS, b.promo)}
    ${slider('ads', 'Ad campaign', b.ads / 1e6, 0, F.adsMax / 1e6, SC() > 1 ? 1 : 0.25, money(b.ads) + ' a year', 'TV spots and billboards build fan interest over time. The first dollars do the most.')}
    <span class="small" style="margin-top:12px;display:block"><b>Sponsorships</b> · about ${money(sponTxt)} a year per level. Easy money, but fans dislike ads on everything.</span>${seg('spon', ['None', 'Some', 'Lots', 'Everywhere'], b.spon)}</div></section>`;
  // TV
  const lt = FO.localTV(mt), canTV = S.phase === 'offseason' || (S.phase === 'season' && S.day === 0);
  const tvFor = S.phase === 'offseason' ? seasonNo() + 1 : seasonNo();
  const ratingsNow = FO.tvMult(S, mt, Object.assign({}, su, { biz: Object.assign({}, b, { tv: 'ratings' }) }));
  const tvOpt = (k, title, body) => `<button type="button" class="tvopt${b.tv === k ? ' on' : ''}" data-act="tv" data-v="${k}" ${canTV && b.tv !== k ? '' : 'disabled'}><b>${title}</b><span class="small">${body}</span>${b.tv === k ? '<span class="tag mine">Current</span>' : ''}</button>`;
  h += `<section class="card"><h2>Local TV deal<span class="sub">${canTV ? `Choose for ${yearOf(tvFor)}` : 'Locked for this season'}</span></h2><div class="pad" style="display:grid;gap:8px">
    ${tvOpt('safe', 'Fixed deal', `${money(lt)} a season, win or lose.`)}
    ${tvOpt('ratings', 'Ratings deal', `Pays with your record and fan interest: 50% to 170%. Right now it would pay about ${money(lt * ratingsNow)}.`)}
    ${tvOpt('advance', 'Cash advance', `Get ${money(lt * 0.75)} today. Your local TV pays only 25% that season.`)}
    ${canTV ? '' : '<p class="small muted" style="margin:0">You can change it in the offseason or before Opening Day.</p>'}</div></section>`;
  // budgets
  h += `<section class="card"><h2>Scouting, development &amp; medical</h2><div class="pad sliders">
    ${slider('scout', 'Scouting', su.scout / 1e6, 0, FO.ERA.scoutMax / 1e6, SC() > 1 ? 1 : 0.25, money(su.scout) + ' a year', scoutNote(su.scout))}
    ${slider('dev', 'Player development', b.dev / 1e6, 0, F.devMax / 1e6, SC() > 1 ? 1 : 0.25, money(b.dev) + ' a year', devNote(b.dev))}
    ${slider('med', 'Medical staff', b.med / 1e6, 0, F.devMax / 1e6, SC() > 1 ? 1 : 0.25, money(b.med) + ' a year', medNote(b.med))}</div></section>`;
  // projects
  const cash = cashOf(mt);
  h += `<section class="card"><h2>Ballpark projects<span class="sub">permanent · 3% a year upkeep</span></h2><div class="list">${Object.keys(FO.BUILDS).map(k => {
    const B = FO.BUILDS[k], cost = FO.buildCost(k), done = !!b.builds[k];
    return `<div class="item farow"><div class="nm"><b>${esc(B.name)}</b><span class="s">${esc(B.blurb)}</span></div><span class="faprice">${done ? '<span class="tag gold">Built</span>' : `<b class="num">${money(cost)}</b><span class="ctrls"><button class="btn sm" type="button" data-act="build" data-k="${k}" ${cash >= cost && live ? '' : 'disabled'}>Build</button></span>`}</span></div>`;
  }).join('')}</div>${Object.keys(FO.BUILDS).some(k => !b.builds[k] && cash < FO.buildCost(k)) ? '<p class="pad small muted" style="padding-top:8px">Short on cash? Borrow from the bank below and pay it back from the profits.</p>' : ''}</section>`;
  // bank
  const loan = b.loan, room = F.loanMax - loan, step = F.loanMax / 10;
  h += `<section class="card"><h2>Bank</h2><div class="kv"><div><span>Loan balance</span><b>${money(loan)}</b></div><div><span>Credit left</span><b>${money(room)}</b></div><div><span>Interest</span><b>${Math.round(F.rate * 100)}% · ${money(loan * F.rate)} a yr</b></div><div><span>Cash</span><b style="color:${cash < 0 ? 'var(--bad)' : 'var(--ink)'}">${money(cash)}</b></div></div>
    <div class="pad row wrap" style="padding-top:12px"><button class="btn" type="button" data-act="borrow" ${room >= step ? '' : 'disabled'}>Borrow ${money(step)}</button><button class="btn" type="button" data-act="repay" ${loan > 0 && cash > 0 ? '' : 'disabled'}>Repay ${money(Math.min(loan, step))}</button></div>
    <p class="pad small muted" style="padding-top:8px;margin:0">Interest comes out a little every day. Borrowed cash counts toward signing bonuses, projects and trades.</p></section>`;
  return h;
}
function devNote(v) {
  const f = v / FO.ERA.fin.devMax;
  return f >= 0.75 ? 'Elite coaching. Prospects grow fast and their ceilings keep rising.' : f >= 0.4 ? 'Good coaching. Prospects develop a bit faster and can raise their ceilings.' : f >= 0.15 ? 'Average coaching.' : 'Bare-bones coaching. Prospects develop slowly.';
}
async function buildProject(k) {
  const mt = myTeam(); if (!mt || busy) return;
  const cost = FO.buildCost(k), b = bizDoc(mt), d = docs[mt] || {};
  if ((b.builds || {})[k]) return;
  if (cashOf(mt) < cost) { toast('Not enough cash. Borrow from the bank first.'); return; }
  busy = true;
  try {
    b.builds = Object.assign({}, b.builds || {}, { [k]: seasonNo() });
    await teamWrite(mt, { biz: b, cashAdj: (d.cashAdj || 0) - cost });
    toast(FO.BUILDS[k].name + ' is open for business.');
    logTx({ type: 'biz', from: mt, status: 'built', k, sal: cost, season: seasonNo() });
  } finally { busy = false; }
}
async function loanStep(dir) {
  const mt = myTeam(); if (!mt || busy) return;
  const F = FO.ERA.fin, b = bizDoc(mt), step = F.loanMax / 10, loan = b.loan || 0;
  let amt = dir > 0 ? Math.min(step, F.loanMax - loan) : -Math.min(step, loan);
  if (dir < 0 && cashOf(mt) < -amt) amt = -Math.max(0, Math.floor(cashOf(mt) / 1e5) * 1e5);
  if (!amt) return;
  busy = true;
  try { b.loan = Math.max(0, loan + amt); await teamWrite(mt, { biz: b }); toast(amt > 0 ? `Borrowed ${money(amt)}.` : `Repaid ${money(-amt)}.`); } finally { busy = false; }
}
async function chooseTV(k) {
  const mt = myTeam(); if (!mt || busy) return;
  const canTV = S.phase === 'offseason' || (S.phase === 'season' && S.day === 0); if (!canTV) return;
  const b = bizDoc(mt), d = docs[mt] || {}, cur = b.tv || 'safe';
  if (cur === k) return;
  const lump = Math.round(FO.localTV(mt) * 0.75 / 1e5) * 1e5;
  const patch = {};
  // undo an advance taken for the same season before switching away
  if (cur === 'advance') patch.cashAdj = (d.cashAdj || 0) - (b.tvLump || 0);
  b.tv = k; b.tvFor = S.phase === 'offseason' ? seasonNo() + 1 : seasonNo();
  if (k === 'advance') { b.tvLump = lump; patch.cashAdj = (patch.cashAdj != null ? patch.cashAdj : (d.cashAdj || 0)) + lump; } else delete b.tvLump;
  busy = true;
  try { await teamWrite(mt, Object.assign(patch, { biz: b })); toast(k === 'advance' ? `${money(lump)} advance received.` : FO.TV[k] + ' signed.'); } finally { busy = false; }
}
// live slider labels; values are saved on change
function bizInput(el, commit) {
  const mt = myTeam(); if (!mt) return;
  const k = el.dataset.biz, v = +el.value, F = FO.ERA.fin;
  const over = { biz: {} };
  if (k === 'tix') { $('#tixv').textContent = '$' + v.toFixed(2); over.price = v; }
  if (k === 'conc') { $('#concv').textContent = concLabel(v) + ' · ' + Math.round(v * 100) + '%'; over.biz.conc = v; }
  if (k === 'park') { $('#parkv').textContent = '$' + v.toFixed(2); over.biz.park = v; }
  if (k === 'ads') { $('#adsv').textContent = money(v * 1e6) + ' a year'; }
  if (k === 'scout') { $('#scoutv').textContent = money(v * 1e6) + ' a year'; $('#scoutn').textContent = scoutNote(v * 1e6); }
  if (k === 'dev') { $('#devv').textContent = money(v * 1e6) + ' a year'; $('#devn').textContent = devNote(v * 1e6); }
  if (k === 'med') { $('#medv').textContent = money(v * 1e6) + ' a year'; $('#medn').textContent = medNote(v * 1e6); }
  const pv = $('#bizprev'); if (pv && (k === 'tix' || k === 'conc' || k === 'park')) pv.innerHTML = previewText(mt, over);
  if (!commit) return;
  if (k === 'tix') teamWrite(mt, { price: v });
  else if (k === 'scout') teamWrite(mt, { scout: Math.round(v * 4) / 4 * 1e6 });
  else if (k === 'ads' || k === 'dev' || k === 'med') setBiz({ [k]: Math.round(v * 4) / 4 * 1e6 });
  else if (k === 'conc') setBiz({ conc: Math.round(v * 100) / 100 });
  else if (k === 'park') setBiz({ park: v });
  void F;
}

// ---------------- Player search (Market → Search) ----------------
let findQ = '', findPos = 'all', findWhere = 'all', findSort = 'ovr';
const ATTRS = { con: ['Contact', 'H', 1], pow: ['Power', 'H', 2], eye: ['Eye', 'H', 3], spd: ['Speed', 'H', 4], def: ['Defense', 'H', 5], stf: ['Stuff', 'P', 1], ctl: ['Control', 'P', 2], mov: ['Movement', 'P', 3], sta: ['Stamina', 'P', 4] };
function attrOf(id, k) { const a = ATTRS[k], p = P[id]; if (!a || p.t !== a[1] || !p.rt || p.rt[k] == null) return null; return seenR(id, p.rt[k], a[2]); }
function sortVal(id) {
  if (findSort === 'ovr') return sOvr(id);
  if (findSort === 'pot') return P[id].pros ? potSeen(id) : sOvr(id);
  if (findSort === 'young') return -P[id].age;
  if (findSort === 'cheap') { const o = orgOf(id); return -(o === 'FA' ? askNow(id, myTeam()) : farmOrg(id) ? FO.ERA.minSal : salFor(id, o)); }
  const v = attrOf(id, findSort); return v == null ? -1 : v;
}
function findMatches() {
  const mt = myTeam(), q = findQ.trim().toLowerCase();
  const fa = new Set(freeAgents());
  let ids = P.filter(p => p && p.name).map(p => p.id);
  ids = ids.filter(id => {
    const org = orgOf(id);
    if (org === mt) return false;
    if (findWhere === 'fa' && !fa.has(id)) return false;
    if (findWhere === 'clubs' && (fa.has(id) || farmOrg(id))) return false;
    if (findWhere === 'farm' && !farmOrg(id)) return false;
    if (org === 'FA' && !fa.has(id)) return false;
    const p = P[id];
    if (findPos === 'H' && p.t !== 'H') return false;
    if (findPos === 'SP' && !(p.t === 'P' && p.role === 'SP')) return false;
    if (findPos === 'RP' && !(p.t === 'P' && p.role !== 'SP')) return false;
    if (['C', '1B', '2B', '3B', 'SS', 'OF'].includes(findPos) && (p.t !== 'H' || !FO.canPlay(p, findPos))) return false;
    if (q && !p.name.toLowerCase().includes(q)) return false;
    if (ATTRS[findSort] && p.t !== ATTRS[findSort][1]) return false;
    return true;
  });
  return ids.sort((a, b) => sortVal(b) - sortVal(a) || sOvr(b) - sOvr(a));
}
function findRow(id, mt) {
  const p = P[id], org = orgOf(id), fa = org === 'FA', fg = !!farmOrg(id);
  const where = fa ? `Free agent · asks ${money(askNow(id, mt))}` : fg ? `${esc(org)} farm · ${potGrade(id)} potential · ${esc(etaText(id))}` : `${esc(TEAM[org].city)} · ${money(salFor(id, org))} through ${yearOf(endFor(id, org))}`;
  const btn = !mt || !marketOpen() ? '' : fa ? `<button class="btn sm primary" type="button" data-act="fa" data-p="${id}">Sign</button>` : `<button class="btn sm" type="button" data-act="tradefor" data-p="${id}">Trade for</button>`;
  const line = quick(id) !== '—' ? quick(id) : p.pros ? '' : (p.t === 'H' ? `${fmt3(p.AVG)}, ${p.HR} HR in ${FO.ERA.year}` : `${p.ERA.toFixed(2)} ERA in ${FO.ERA.year}`);
  const av = ATTRS[findSort] ? attrOf(id, findSort) : null;
  const chip = av != null ? ` <span class="tag ${av >= 80 ? 'gold' : ''}">${ATTRS[findSort][0].toUpperCase()} ${av}</span>` : '';
  return `<div class="item farow"><span class="${ovrClass(sOvr(id))}">${sOvr(id)}</span><div class="nm"><button class="lnk" type="button" data-act="player" data-p="${id}"><b>${esc(p.name)}</b></button> <span class="muted small">${posShort(p)} · ${p.age}</span>${chip}${ilTag(id)}<span class="s">${where}</span>${line ? `<span class="s">${esc(line)}</span>` : ''}</div><span class="ctrls">${btn}</span></div>`;
}
function findResultsHTML() {
  const mt = myTeam(), list = findMatches(), shown = list.slice(0, 50);
  return (shown.length ? shown.map(id => findRow(id, mt)).join('') : '<div class="empty">No players match.</div>') + (list.length > 50 ? `<div class="pad small muted" style="padding-top:10px">Top 50 of ${list.length} by rating. Type more of a name to narrow it down.</div>` : '');
}
function viewFind() {
  const seg = (act, opts, cur) => `<div class="seg scrollseg" role="group">${opts.map(([v, l]) => `<button type="button" data-act="${act}" data-v="${v}" aria-pressed="${cur === v}">${l}</button>`).join('')}</div>`;
  return `<section class="card"><h2>Find a player</h2><div class="pad" style="display:grid;gap:10px">
    <input type="search" id="findQ" placeholder="Search by name" value="${esc(findQ)}" autocomplete="off" aria-label="Search players by name">
    <label class="row small" for="findSort" style="gap:8px"><span class="muted">Sort by</span><select id="findSort" style="flex:1">${[['ovr', 'Overall'], ['pot', 'Potential'], ['young', 'Youngest'], ['cheap', 'Cheapest']].concat(Object.entries(ATTRS).map(([k, a]) => [k, a[0] + (a[1] === 'H' ? ' (hitters)' : ' (pitchers)')])).map(([k, l]) => `<option value="${k}" ${findSort === k ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    ${seg('fw', [['all', 'Everyone'], ['fa', 'Free agents'], ['clubs', 'On clubs'], ['farm', 'Prospects']], findWhere)}
    ${seg('fp', [['all', 'All'], ['H', 'Hitters'], ['SP', 'SP'], ['RP', 'RP'], ['C', 'C'], ['1B', '1B'], ['2B', '2B'], ['3B', '3B'], ['SS', 'SS'], ['OF', 'OF']], findPos)}
    <p class="small muted" style="margin:0">Ratings for other clubs' players come from your scouts. <b>Sign</b> opens the contract; <b>Trade for</b> starts a deal with his club.</p></div>
    <div class="list" id="findRes">${findResultsHTML()}</div></section>`;
}
function tradeFor(pid) {
  const mt = myTeam(), org = orgOf(pid); if (!mt || !TEAM[org] || org === mt) return;
  if (tradePartner !== org) { tradeGet.clear(); tradeGive.clear(); tradeCash = 0; }
  tradePartner = org; tradeGet.add(pid); showHint = false; lastFeedback = null;
  closeModal(); marketView = 'trade'; tab = 'trade'; renderTabs(); render(); window.scrollTo(0, 0);
  toast(`${P[pid].name} is in the deal. Pick what you'll send.`);
}

// ---------------- Rumor mill & trading block (Market → Rumors) ----------------
// GMs post what they need and who they'd move; computer clubs' needs and sellers are read from their situation.
let board = {}, boardNeed = 'SP', boardPid = '', boardNote = '';
const NEED_OPTS = [['SP', 'Starting pitcher'], ['RP', 'Relief pitcher'], ['C', 'Catcher'], ['1B', 'First base'], ['2B', 'Second base'], ['3B', 'Third base'], ['SS', 'Shortstop'], ['OF', 'Outfielder'], ['BAT', 'Any big bat'], ['CASH', 'Cash / salary relief']];
const needLabel = k => (NEED_OPTS.find(x => x[0] === k) || [k, k])[1];
function boardPosts() { return Object.entries(board).map(([id, b]) => Object.assign({ id }, b)).filter(b => TEAM[b.tid] && ownerOf(b.tid) && (b.kind !== 'avail' || orgOf(b.pid) === b.tid)).sort((a, b) => b.ts - a.ts); }
function myBlock(tid) { return boardPosts().filter(b => b.tid === tid && b.kind === 'avail').map(b => b.pid); }
function myNeeds(tid) { return boardPosts().filter(b => b.tid === tid && b.kind === 'need').map(b => b.need); }
async function postBoard(kind) {
  const mt = myTeam(); if (!mt) return;
  const note = (($('#bnote') && $('#bnote').value) || '').trim().slice(0, 90);
  const rec = { tid: mt, kind, by: me.id, ts: Date.now(), season: seasonNo(), note };
  if (kind === 'need') { rec.need = ($('#bneed') && $('#bneed').value) || 'SP'; if (myNeeds(mt).includes(rec.need)) { toast('You already posted that need.'); return; } }
  else { const pid = +(($('#bpid') && $('#bpid').value) || -1); if (!P[pid] || orgOf(pid) !== mt) { toast('Pick a player to put on the block.'); return; } if (myBlock(mt).includes(pid)) { toast('He is already on the block.'); return; } rec.pid = pid; }
  const id = 'b' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  board[id] = rec; boardNote = ''; render();
  toast(kind === 'need' ? 'Posted. Other clubs will call with offers.' : `${P[rec.pid].name} is on the block. Expect calls.`);
  if (mode === 'local') saveLocal(); else await writeDoc('board/' + id, rec);
}
async function unpost(id) {
  const b = board[id]; if (!b || b.tid !== myTeam()) return;
  delete board[id]; render();
  await deleteDoc('board/' + id);
}
// computer clubs' situation for the rumor mill
function cpuRumors(mt) {
  const out = [];
  for (const t of TEAMS) {
    if (t.id === mt || ownerOf(t.id)) continue;
    const ctx = ctxFor(t.id), su = setup(t.id);
    let avail = [];
    if (ctx.mode === 'rebuild') avail = su.roster.filter(id => !ctx.core.includes(id) && P[id].age >= 29 && P[id].ovr >= 58).sort((a, b) => P[b].ovr - P[a].ovr).slice(0, 3);
    else if (ctx.mode === 'neutral') avail = su.roster.filter(id => !ctx.core.includes(id) && P[id].age >= 31 && P[id].ovr >= 60 && endFor(id, t.id) <= seasonNo()).sort((a, b) => P[b].ovr - P[a].ovr).slice(0, 2);
    out.push({ tid: t.id, mode: ctx.mode, needs: ctx.needs, avail, cash: ctx.cashMult > 1.1 });
  }
  return out;
}
function viewBoard() {
  const mt = myTeam();
  let h = '';
  if (mt) {
    const mine = boardPosts().filter(b => b.tid === mt);
    const roster = rosterOf(mt).concat(farmOf(mt)).slice().sort((a, b) => P[b].ovr - P[a].ovr);
    h += `<section class="card"><h2>Your posts<span class="sub">computer GMs read these</span></h2><div class="pad" style="display:grid;gap:10px">
      <div class="row wrap"><select id="bneed" aria-label="What you need" style="flex:1;min-width:160px">${NEED_OPTS.map(([k, l]) => `<option value="${k}" ${k === boardNeed ? 'selected' : ''}>${l}</option>`).join('')}</select><button class="btn" type="button" data-act="bpost" data-v="need">Post a need</button></div>
      <div class="row wrap"><select id="bpid" aria-label="Player to make available" style="flex:1;min-width:160px"><option value="">Choose a player…</option>${roster.map(id => `<option value="${id}" ${String(id) === String(boardPid) ? 'selected' : ''}>${esc(P[id].name)} · ${posShort(P[id])} · ${P[id].ovr}${farmOrg(id) ? ' · prospect' : ''}</option>`).join('')}</select><button class="btn" type="button" data-act="bpost" data-v="avail">Put on the block</button></div>
      <input type="text" id="bnote" maxlength="90" placeholder="Optional note, like “want a lefty” or “will eat salary”" value="${esc(boardNote)}" aria-label="Note">
      <p class="small muted" style="margin:0">Computer clubs call more often while you have posts up. Their offers go after players on your block and include players that fill your needs.</p></div>
      ${mine.length ? `<div class="list">${mine.map(b => `<div class="item"><span class="tag ${b.kind === 'need' ? 'gold' : 'red'}">${b.kind === 'need' ? 'NEED' : 'BLOCK'}</span><div class="nm"><b>${b.kind === 'need' ? esc(needLabel(b.need)) : esc(P[b.pid].name)}</b><span class="s">${b.kind === 'avail' ? posShort(P[b.pid]) + ' · ' + P[b.pid].ovr + ' · ' : ''}${esc(b.note || '')}</span></div><button class="btn sm ghost" type="button" data-act="unpost" data-id="${b.id}">Remove</button></div>`).join('')}</div>` : ''}</section>`;
  }
  // other GMs' posts
  const others = boardPosts().filter(b => b.tid !== mt);
  h += `<section class="card"><h2>Bulletin board<span class="sub">friends' posts</span></h2>${others.length ? `<div class="list">${others.map(b => {
    const btn = b.kind === 'avail' && mt && marketOpen() ? `<button class="btn sm" type="button" data-act="tradefor" data-p="${b.pid}">Trade for</button>` : mt && b.tid !== mt && marketOpen() ? `<button class="btn sm ghost" type="button" data-act="tradewith" data-t="${b.tid}">Make an offer</button>` : '';
    return `<div class="item"><span class="abbr" style="width:38px">${esc(b.tid)}</span><div class="nm">${b.kind === 'need' ? `<b>Needs ${esc(needLabel(b.need).toLowerCase())}</b>` : `<button class="lnk" type="button" data-act="player" data-p="${b.pid}"><b>${esc(P[b.pid].name)}</b></button> <span class="muted small">${posShort(P[b.pid])} · ${sOvr(b.pid)}</span><span class="s">On the block</span>`}<span class="s">${esc(ownerName(ownerOf(b.tid)))}${b.note ? ' · “' + esc(b.note) + '”' : ''}</span></div>${btn}</div>`;
  }).join('')}</div>` : '<div class="empty">No posts from other GMs yet.</div>'}</section>`;
  // rumor mill
  const myBl = mt ? myBlock(mt) : [];
  const rum = cpuRumors(mt).map(r => Object.assign(r, { fit: myBl.filter(id => r.needs.includes(FO.needOf(P[id]))).length })).sort((a, b) => b.fit - a.fit || (b.avail.length - a.avail.length) || (a.mode === 'contend' ? -1 : 1));
  const modeTag = m => m === 'contend' ? '<span class="tag gold">Buying</span>' : m === 'rebuild' ? '<span class="tag red">Selling</span>' : '<span class="tag">Holding</span>';
  const NL = { SP: 'starter', RP: 'bullpen', C: 'catcher', '1B': '1B', '2B': '2B', '3B': '3B', SS: 'SS', OF: 'outfield' };
  h += `<section class="card"><h2>Rumor mill<span class="sub">computer clubs</span></h2><div class="pad small muted" style="padding-bottom:6px">Buyers pay up for players that fill a need. Sellers move veterans for younger players and cash.${myBl.length ? ' Clubs that need someone on your block are listed first.' : ''}</div><div class="list">${rum.map(r => `<div class="item"><span class="abbr" style="width:38px">${esc(r.tid)}</span><div class="nm">${modeTag(r.mode)} ${r.fit ? '<span class="tag red">Fits your block</span>' : ''}${r.cash ? ' <span class="tag">Tight on cash</span>' : ''}<span class="s">${r.needs.length ? 'Need: ' + r.needs.slice(0, 3).map(n => NL[n] || n).join(', ') : 'No big holes'}</span>${r.avail.length ? `<span class="s">Shopping: ${r.avail.map(id => `<button class="lnk" type="button" data-act="player" data-p="${id}">${esc(P[id].name)}</button> (${posShort(P[id])} ${sOvr(id)})`).join(', ')}</span>` : ''}</div>${mt && marketOpen() ? `<button class="btn sm ghost" type="button" data-act="tradewith" data-t="${r.tid}">Talk</button>` : ''}</div>`).join('')}</div></section>`;
  return h;
}

// ---------------- GM Analysis (Office → Analysis) ----------------
// Playoff odds from a quick simulation of the rest of the schedule, a position-by-position diagnosis,
// and trade ideas that the other club's GM would actually accept.
let anaCache = null;
const POS9 = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
const POS_NAME = { C: 'catcher', '1B': 'first base', '2B': 'second base', '3B': 'third base', SS: 'shortstop', LF: 'left field', CF: 'center field', RF: 'right field', DH: 'designated hitter', SP: 'starting rotation', RP: 'bullpen' };
function unitRatings(tid, su0) {
  const su = su0 || setup(tid), out = {};
  su.lineup.forEach(([id, pos]) => { out[pos] = { id, ovr: P[id].ovr }; });
  const rot = su.rotation.slice(0, 5).map(id => P[id].ovr);
  out.SP = { ovr: rot.length ? rot.reduce((a, b) => a + b, 0) / rot.length : 40, ids: su.rotation.slice(0, 5) };
  const pen = su.pen.slice().sort((a, b) => P[b].ovr - P[a].ovr).slice(0, 5);
  out.RP = { ovr: pen.length ? pen.reduce((a, b) => a + P[b].ovr, 0) / pen.length : 40, ids: pen };
  return out;
}
function teamRating(u) {
  const bat = POS9.reduce((a, p) => a + (u[p] ? u[p].ovr : 40), 0) / 9;
  return bat * 0.52 + u.SP.ovr * 0.33 + u.RP.ovr * 0.15;
}
function strengths() {
  const units = {}, rat = {};
  TEAMS.forEach(t => { units[t.id] = unitRatings(t.id); rat[t.id] = teamRating(units[t.id]); });
  const avg = TEAMS.reduce((a, t) => a + rat[t.id], 0) / TEAMS.length;
  const pct = {};
  TEAMS.forEach(t => {
    const s = S.std[t.id], g = s[0] + s[1];
    const talent = Math.max(0.3, Math.min(0.7, 0.5 + (rat[t.id] - avg) * 0.013));
    const py = g ? Math.pow(s[2], 1.83) / (Math.pow(s[2], 1.83) + Math.pow(s[3], 1.83) || 1) : 0.5;
    const w = g / (g + 70);
    pct[t.id] = talent * (1 - w) + (isFinite(py) ? py : 0.5) * w;
  });
  return { units, rat, avg, pct };
}
// Simulate the rest of the regular season many times
function playoffOdds(pct) {
  const N = 400, slots = FO.ERA.post === '1997' ? 1 : 3;
  const res = {}; TEAMS.forEach(t => { res[t.id] = { po: 0, div: 0, ws: 0, w: 0 }; });
  const games = [];
  if (S.phase === 'season') for (let d = S.day; d < LEN(); d++) (W.sched[d] || []).forEach(g => games.push(g));
  const R = FO.rng((S.day * 7919 + 13) >>> 0);
  const lgs = { AL: TEAMS.filter(t => t.lg === 'AL'), NL: TEAMS.filter(t => t.lg === 'NL') };
  for (let n = 0; n < N; n++) {
    const w = {}; TEAMS.forEach(t => { w[t.id] = S.std[t.id][0]; });
    for (const [h, a] of games) {
      const ph = pct[h], pa = pct[a], p = (ph * (1 - pa)) / (ph * (1 - pa) + pa * (1 - ph)) + 0.04;
      if (R() < p) w[h]++; else w[a]++;
    }
    const field = [];
    for (const lg of ['AL', 'NL']) {
      const ts = lgs[lg], divs = {};
      ts.forEach(t => { (divs[t.div] = divs[t.div] || []).push(t.id); });
      const winners = Object.values(divs).map(ids => ids.slice().sort((x, y) => w[y] - w[x] || R() - 0.5)[0]);
      winners.forEach(id => { res[id].div++; });
      const rest = ts.map(t => t.id).filter(id => !winners.includes(id)).sort((x, y) => w[y] - w[x] || R() - 0.5).slice(0, slots);
      winners.concat(rest).forEach(id => { res[id].po++; field.push(id); });
    }
    // champion: weighted by strength among playoff teams
    const wt = field.map(id => Math.pow(pct[id] / (1 - pct[id]), 3)), tot = wt.reduce((a, b) => a + b, 0);
    let u = R() * tot; for (let i = 0; i < field.length; i++) { u -= wt[i]; if (u <= 0) { res[field[i]].ws++; break; } }
    TEAMS.forEach(t => { res[t.id].w += w[t.id]; });
  }
  TEAMS.forEach(t => { const r = res[t.id]; r.po /= N; r.div /= N; r.ws /= N; r.w /= N; });
  return res;
}
// my units vs league average at each spot
function diagnose(mt, st) {
  const out = [];
  for (const k of POS9.concat(['SP', 'RP'])) {
    const vals = TEAMS.map(t => st.units[t.id][k] ? st.units[t.id][k].ovr : 40).sort((a, b) => b - a);
    const mine = st.units[mt][k] ? st.units[mt][k].ovr : 40, avg = vals.reduce((a, b) => a + b, 0) / vals.length;
    out.push({ k, mine, avg, gap: mine - avg, rank: vals.indexOf(mine) + 1, id: st.units[mt][k] && st.units[mt][k].id });
  }
  return out;
}
const fitsSpot = (p, k) => k === 'SP' ? p.t === 'P' && p.role === 'SP' : k === 'RP' ? p.t === 'P' && p.role !== 'SP' : p.t === 'H' && (k === 'DH' || FO.canPlay(p, k));
// Find a package the other club's GM accepts for `target`, giving up as little as we can
function findPackage(mt, tgtTid, target, protect) {
  const ctx = ctxFor(tgtTid);
  const mine = rosterOf(mt).filter(id => !protect.has(id)), farmIds = farmOf(mt);
  const pool = mine.concat(farmIds).filter(id => !injDays(id));
  const mv = id => myValue([id], false);
  const cands = pool.slice().sort((a, b) => (ctx.needs.includes(FO.needOf(P[b])) - ctx.needs.includes(FO.needOf(P[a]))) || mv(a) - mv(b)).slice(0, 14);
  const ok = (give, cash) => {
    const legal = FO.evalTrade(W, rosterOf(mt), rosterOf(tgtTid), mlbOf(give, mt), [target]);
    if (legal.errFrom || legal.errTo) return false;
    return FO.aiEvaluate(W, ctx, give.map(pinfo), [pinfo(target)], cash).accept;
  };
  let best = null;
  const consider = (give, cash) => { const cost = give.reduce((a, id) => a + mv(id), 0) + cash / 1e6 / SC() * FO.CASH_UNIT; if ((!best || cost < best.cost) && ok(give, cash)) best = { give, cash, cost }; };
  for (const a of cands) consider([a], 0);
  if (!best) for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) consider([cands[i], cands[j]], 0);
  if (!best && cashOf(mt) > 0) {
    const step = 1e6 * SC();
    for (const a of cands.slice(0, 8)) for (let c = step; c <= Math.min(cashOf(mt), 8 * step); c += step) { consider([a], c); if (best) break; }
  }
  return best ? Object.assign(best, { ctx }) : null;
}
function buyIdeas(mt, st, diag) {
  const ideas = [], used = new Set();
  const top = rosterOf(mt).slice().sort((a, b) => P[b].ovr - P[a].ovr).slice(0, 3);
  const weak = diag.filter(d => d.gap < -2).sort((a, b) => a.gap - b.gap).slice(0, 4);
  for (const d of weak) {
    const need = d.k, cur = d.mine;
    const targets = [];
    for (const t of TEAMS) {
      if (t.id === mt || ownerOf(t.id)) continue;
      for (const id of rosterOf(t.id)) { const p = P[id]; if (fitsSpot(p, need) && p.ovr >= cur + 6 && !injDays(id) && !used.has(id)) targets.push({ id, tid: t.id, gain: p.ovr - cur }); }
    }
    targets.sort((a, b) => (ctxFor(b.tid).mode === 'rebuild') - (ctxFor(a.tid).mode === 'rebuild') || b.gain - a.gain);
    for (const tg of targets.slice(0, 7)) {
      const protect = new Set(top); if (need !== 'SP' && need !== 'RP' && d.id != null) protect.delete(d.id);
      const pk = findPackage(mt, tg.tid, tg.id, protect);
      if (!pk) continue;
      used.add(tg.id);
      ideas.push({ kind: 'buy', need, gain: need === 'SP' || need === 'RP' ? Math.round((P[tg.id].ovr - cur) / 5) : tg.gain, target: tg.id, tid: tg.tid, give: pk.give, cash: pk.cash, mode: pk.ctx.mode });
      break;
    }
    if (ideas.length >= 3) break;
  }
  return ideas;
}
// One trade (and, if there is one, an affordable free agent) for a single spot on the roster chart
function spotFix(mt, d, used, gave) {
  const need = d.k, cur = d.mine, top = rosterOf(mt).slice().sort((a, b) => P[b].ovr - P[a].ovr).slice(0, 3);
  const out = { d, idea: null, fa: null };
  if (!tradesClosed() && S.phase !== 'post' && S.phase !== 'done') {
    const targets = [];
    for (const t of TEAMS) { if (t.id === mt || ownerOf(t.id)) continue; for (const id of rosterOf(t.id)) { const p = P[id]; if (fitsSpot(p, need) && p.ovr >= cur + 4 && !injDays(id) && !used.has(id)) targets.push({ id, tid: t.id, gain: p.ovr - cur }); } }
    targets.sort((a, b) => (ctxFor(b.tid).mode === 'rebuild') - (ctxFor(a.tid).mode === 'rebuild') || b.gain - a.gain);
    for (const tg of targets.slice(0, 14)) {
      const protect = new Set(top.concat([...(gave || [])])); if (need !== 'SP' && need !== 'RP' && d.id != null) protect.delete(d.id);
      const pk = findPackage(mt, tg.tid, tg.id, protect); if (!pk || (gave && pk.give.some(g => gave.has(g)))) continue;
      used.add(tg.id); if (gave) pk.give.forEach(g => gave.add(g));
      out.idea = { kind: 'buy', need, gain: need === 'SP' || need === 'RP' ? Math.round((P[tg.id].ovr - cur) / 5) : tg.gain, target: tg.id, tid: tg.tid, give: pk.give, cash: pk.cash, mode: pk.ctx.mode };
      break;
    }
  }
  if (S.phase === 'season' || S.phase === 'offseason') { const cash = cashOf(mt); out.fa = freeAgents().filter(id => fitsSpot(P[id], need) && P[id].ovr >= cur + 3 && askNow(id, mt) * FO.BONUS <= Math.max(0, cash)).sort((a, b) => P[b].ovr - P[a].ovr)[0]; }
  return out;
}
function holeFixes(mt, a) {
  if (a.holes) return a.holes;
  const sorted = a.diag.slice().sort((x, y) => x.gap - y.gap);
  let spots = sorted.filter(x => x.gap < -2).slice(0, 4);
  if (!spots.length) spots = sorted.slice(0, 2); // no real holes: show how to upgrade the two weakest spots
  const used = new Set(), gave = new Set(); // each fix uses different players, so you could make them all
  a.holes = spots.map(d => spotFix(mt, d, used, gave));
  return a.holes;
}
function sellIdeas(mt) {
  const ideas = [], used = new Set();
  const stars = rosterOf(mt).slice().sort((a, b) => P[b].ovr - P[a].ovr).slice(0, 2);
  const vets = rosterOf(mt).filter(id => !stars.includes(id) && P[id].age >= 29 && P[id].ovr >= 58 && !injDays(id)).sort((a, b) => (endFor(a, mt) - endFor(b, mt)) || P[b].ovr - P[a].ovr).slice(0, 5);
  for (const v of vets) {
    const buyers = TEAMS.filter(t => t.id !== mt && !ownerOf(t.id)).map(t => ({ tid: t.id, ctx: ctxFor(t.id) })).filter(b => b.ctx.mode !== 'rebuild').sort((a, b) => (b.ctx.needs.includes(FO.needOf(P[v])) - a.ctx.needs.includes(FO.needOf(P[v]))) || (b.ctx.mode === 'contend') - (a.ctx.mode === 'contend'));
    let done = false;
    for (const b of buyers.slice(0, 8)) {
      const young = farmOf(b.tid).concat(rosterOf(b.tid).filter(id => P[id].age <= 25)).filter(id => !b.ctx.core.includes(id)).sort((x, y) => (P[y].pros ? P[y].peak.ovr : P[y].ovr) - (P[x].pros ? P[x].peak.ovr : P[x].ovr));
      for (const y of young.filter(id => !used.has(id)).slice(0, 6)) {
        const legal = FO.evalTrade(W, rosterOf(mt), rosterOf(b.tid), [v], mlbOf([y], b.tid));
        if (legal.errFrom || legal.errTo) continue;
        if (FO.aiEvaluate(W, b.ctx, [pinfo(v)], [pinfo(y)], 0).accept) { ideas.push({ kind: 'sell', target: y, tid: b.tid, give: [v], cash: 0, mode: b.ctx.mode, need: FO.needOf(P[v]) }); used.add(y); done = true; break; }
      }
      if (done) break;
    }
    if (ideas.length >= 3) break;
  }
  return ideas;
}
function quickMoves(mt, diag) {
  const out = [];
  for (const id of farmOf(mt)) {
    if (!isReady(id)) continue;
    const spot = diag.filter(d => fitsSpot(P[id], d.k)).sort((a, b) => a.mine - b.mine)[0];
    if (spot && P[id].ovr > spot.mine) out.push(`Call up <button class="lnk" type="button" data-act="player" data-p="${id}">${esc(P[id].name)}</button> (${P[id].ovr}). He's already better than your ${POS_NAME[spot.k]} (${Math.round(spot.mine)}).`);
  }
  const weak = diag.filter(d => d.gap < -3).sort((a, b) => a.gap - b.gap);
  const cash = cashOf(mt);
  for (const d of weak.slice(0, 2)) {
    const fa = freeAgents().filter(id => fitsSpot(P[id], d.k) && P[id].ovr > d.mine + 3 && askNow(id, mt) * FO.BONUS < cash).sort((a, b) => P[b].ovr - P[a].ovr)[0];
    if (fa != null) out.push(`Free agent <button class="lnk" type="button" data-act="fa" data-p="${fa}">${esc(P[fa].name)}</button> (${sOvr(fa)}) would upgrade ${POS_NAME[d.k]} for ${money(askNow(fa, mt))} a year.`);
  }
  if (cash < 0) out.push('Cash is negative. Borrow from the bank on the Business page or move a big contract before you add salary.');
  return out;
}
function analysis(mt) {
  const key = [S.day, S.phase, seasonNo(), trades.length, Object.values(docs).map(d => (d.roster || []).join('.')).join('|').length, farm ? Object.keys(farm.g || {}).length : 0].join(':');
  if (anaCache && anaCache.key === key && anaCache.mt === mt) return anaCache;
  const st = strengths(), odds = S.phase === 'season' ? playoffOdds(st.pct) : null, diag = diagnose(mt, st);
  const o = odds && odds[mt];
  const early = S.day < 30;
  const stance = !odds ? 'build' : o.po >= (early ? 0.7 : 0.6) ? 'buy' : o.po >= (early ? 0.1 : 0.2) ? 'bubble' : 'sell';
  const ideas = stance === 'sell' ? sellIdeas(mt) : buyIdeas(mt, st, diag);
  anaCache = { key, mt, st, odds, diag, stance, ideas, quick: quickMoves(mt, diag) };
  return anaCache;
}
function ratedChip(id, tid) {
  const p = P[id], o = sOvr(id), farmP = !rosterOf(tid).includes(id);
  return `<div class="rc"><span class="${ovrClass(o)}">${o}</span><div class="nm"><button class="lnk" type="button" data-act="player" data-p="${id}"><b>${esc(p.name)}</b></button>${p.pros || farmP ? ' ' + potTag(id) : ''}<span class="s">${posShort(p)} · ${p.age} · ${farmP ? 'prospect' : money(salFor(id, tid)) + '/yr'}${injDays(id) ? ' · IL' : ''}</span></div></div>`;
}
function ideaCur(x, mt) { const u = unitRatings(mt); const k = x.need; return k && u[k] && u[k].id != null ? u[k].id : null; }
function ideaCard(x, mt, i) {
  const cashTxt = x.cash ? ` plus ${money(x.cash)}` : '';
  const head = x.kind === 'buy' ? `Upgrade ${POS_NAME[x.need]}` : `Sell high on ${esc(P[x.give[0]].name)}`;
  const why = x.kind === 'buy' ? `${esc(P[x.target].name)} is a ${sOvr(x.target)} at ${posShort(P[x.target])}${x.need === 'SP' || x.need === 'RP' ? '' : `, about +${x.gain} over what you play there now`}. ${esc(TEAM[x.tid].city)} ${x.mode === 'rebuild' ? 'are selling' : x.mode === 'contend' ? 'are contending, so it costs more' : 'will listen'}.`
    : `${esc(TEAM[x.tid].city)} are ${x.mode === 'contend' ? 'in the race' : 'looking to add'} and need ${({ SP: 'a starter', RP: 'bullpen help', C: 'a catcher', OF: 'an outfielder', '1B': 'a first baseman', '2B': 'a second baseman', '3B': 'a third baseman', SS: 'a shortstop' })[x.need] || 'help'}. You get ${esc(P[x.target].name)} (${posShort(P[x.target])}, ${P[x.target].age}${P[x.target].pros ? ', potential ' + potGrade(x.target) : ', ' + sOvr(x.target)}) for the future.`;
  const salIn = rosterOf(x.tid).includes(x.target) ? salFor(x.target, x.tid) : 0, salOut = x.give.reduce((a, id) => a + (rosterOf(mt).includes(id) ? salFor(id, mt) : 0), 0);
  return `<div class="idea"><div class="row" style="gap:8px;align-items:baseline"><b style="flex:1">${head}</b><span class="tag gold">They'd say yes</span></div>
    <div class="idealegs"><div class="leg"><span class="lh">You send</span>${x.give.map(id => ratedChip(id, mt)).join('')}${x.cash ? `<div class="rc"><span class="ovr">$</span><div class="nm"><b>${money(x.cash)}</b><span class="s">cash</span></div></div>` : ''}</div><div class="leg"><span class="lh">${esc(TEAM[x.tid].city)} sends</span>${ratedChip(x.target, x.tid)}${x.kind === 'buy' && ideaCur(x, mt) != null ? `<span class="s small muted">Replaces ${esc(P[ideaCur(x, mt)].name)} (${sOvr(ideaCur(x, mt))})</span>` : ''}</div></div>
    <div class="small muted">${why} Payroll ${salIn - salOut >= 0 ? '+' : '−'}${money(Math.abs(salIn - salOut))}.</div>
    ${salIn - salOut > Math.max(0, cashOf(mt)) ? `<div class="warn">That much added salary is more than the cash you have. Check your budget first.</div>` : ''}
    <div><button class="btn sm primary" type="button" data-act="loadidea" data-i="${i}">Set up this trade</button></div></div>`;
}
function viewAnalysis() {
  const mt = myTeam(), a = analysis(mt), o = a.odds && a.odds[mt], s = S.std[mt];
  const pctTxt = v => v >= 0.995 ? '>99%' : v < 0.005 ? '<1%' : Math.round(v * 100) + '%';
  let h = '';
  if (o) {
    const verdict = a.stance === 'buy' ? ['Contender', 'goodc', `You're in good shape. Add one or two pieces at your weakest spots and you're a real threat in October.`]
      : a.stance === 'bubble' ? ['On the bubble', 'warnc', `You're in the mix but not safe. Fixing your biggest hole is the difference. Don't trade away the future for a rental.`]
        : ['Long shot', 'bad', `The playoffs are unlikely this year. Sell veterans to contenders for young players and prospects, and cut salary.`];
    const left = LEN() - s[0] - s[1];
    h += `<section class="card"><h2>Outlook<span class="sub"><span class="pill ${verdict[1]}">${verdict[0]}</span></span></h2>
      <div class="kv"><div><span>Playoff odds</span><b>${pctTxt(o.po)}</b></div><div><span>Win division</span><b>${pctTxt(o.div)}</b></div><div><span>Win World Series</span><b>${pctTxt(o.ws)}</b></div><div><span>Projected record</span><b>${Math.round(o.w)}-${LEN() - Math.round(o.w)}</b></div></div>
      <p class="pad small" style="padding-top:12px;margin:0">${verdict[2]}${left > 0 ? ` ${left} games left.` : ''}</p>
      <p class="pad small muted" style="padding-top:6px;margin:0">From 400 simulations of the rest of the schedule, using every club's roster and how it has played so far.</p></section>`;
  } else {
    h += `<section class="card"><h2>Outlook</h2><p class="pad small" style="padding-top:12px;margin:0">${S.phase === 'offseason' ? 'The offseason is the time to fix holes. Here is how your roster stacks up against the league right now.' : 'The season is over. Here is how your roster stacks up for next year.'}</p></section>`;
  }
  // diagnosis
  const d = a.diag.slice().sort((x, y) => x.gap - y.gap);
  h += `<section class="card"><h2>Roster vs the league<span class="sub">rank of 30 · your rating vs average</span></h2><div class="diag">${a.diag.map(x => {
    const w = Math.max(4, Math.min(100, 50 + x.gap * 3));
    return `<span class="lab">${x.k === 'SP' ? 'Rotation' : x.k === 'RP' ? 'Bullpen' : x.k}</span><span class="dbar"><i class="${x.gap >= 3 ? 'g' : x.gap <= -3 ? 'b' : ''}" style="width:${w}%"></i></span><span class="num small">${Math.round(x.mine)} <span class="muted">#${x.rank}</span></span>`;
  }).join('')}</div>
    <p class="pad small" style="padding-top:8px;margin:0">${d[0].gap < -2 ? `Biggest holes: <b>${d.filter(x => x.gap < -2).slice(0, 3).map(x => POS_NAME[x.k]).join(', ')}</b>. ` : 'No glaring holes. '}${d[d.length - 1].gap > 3 ? `Strengths: ${d.slice(-2).reverse().filter(x => x.gap > 3).map(x => POS_NAME[x.k]).join(' and ')}.` : ''} Runs: ${s[2]} scored, ${s[3]} allowed.</p></section>`;
  // fixes for each hole, right under the chart
  const holes = holeFixes(mt, a), anyHole = a.diag.some(x => x.gap < -2);
  h += `<section class="card"><h2>${anyHole ? 'Fix the holes' : 'Upgrade your weakest spots'}<span class="sub">deals their GMs would take today</span></h2>${holes.map((x, i) => `<div class="holefix"><div class="hhead"><b>${esc(POS_NAME[x.d.k] || x.d.k)}</b><span class="small muted">#${x.d.rank} of 30 · ${Math.round(x.d.mine)} vs ${Math.round(x.d.avg)} average${x.d.id != null && P[x.d.id] ? ` · now ${esc(P[x.d.id].name)}` : ''}</span></div>
    ${x.idea ? ideaCard(x.idea, mt, 'h' + i) : `<div class="small muted pad" style="padding-top:2px">${tradesClosed() ? 'The trade deadline has passed.' : S.phase === 'post' || S.phase === 'done' ? 'Trades reopen in the offseason.' : 'No computer club would make a fair deal here right now. Try adding cash, or post the need on the Rumors board.'}</div>`}
    ${x.fa != null ? `<div class="small pad" style="padding-top:6px">Or sign free agent <button class="lnk" type="button" data-act="fa" data-p="${x.fa}">${esc(P[x.fa].name)}</button> (${sOvr(x.fa)}, ${posShort(P[x.fa])}) for about ${money(askNow(x.fa, mt))} a year. You can afford him.</div>` : ''}</div>`).join('')}</section>`;
  // ideas
  const title = a.stance === 'sell' ? 'More trade ideas: build for next year' : 'More trade ideas';
  const shown = new Set(holes.filter(x => x.idea).map(x => x.idea.target)), rest = a.ideas.map((x, i) => [x, i]).filter(([x]) => !shown.has(x.target));
  if (rest.length || !a.ideas.length) h += `<section class="card"><h2>${title}<span class="sub">checked with each GM</span></h2>${rest.length ? rest.map(([x, i]) => ideaCard(x, mt, i)).join('') : `<div class="empty">${S.phase === 'post' || S.phase === 'done' ? 'The trade window is closed until the offseason.' : 'No deals the other GMs would take right now. Try adding cash, or post a need on the Rumors board.'}</div>`}
    <p class="pad small muted" style="padding-top:8px;margin:0">Ratings for other clubs' players come from your scouts. Deals can change as rosters and standings move.</p></section>`;
  h += viewPnL(mt) + viewBizAdvice(mt);
  if (a.quick.length) h += `<section class="card"><h2>Other moves</h2><div class="news">${a.quick.map(q => `<div><span class="d">Idea</span><span>${q}</span></div>`).join('')}</div></section>`;
  // league odds table
  if (a.odds) {
    const rows = TEAMS.map(t => ({ id: t.id, o: a.odds[t.id] })).sort((x, y) => y.o.po - x.o.po || y.o.w - x.o.w);
    h += `<section class="card"><h2>League playoff odds</h2><div class="scroll"><table><thead><tr><th>Club</th><th>Proj W</th><th>Playoffs</th><th>Div</th><th>Title</th></tr></thead><tbody>${rows.map(r => `<tr class="${r.id === mt ? 'mine' : ''}"><td><span class="abbr">${r.id}</span> <span class="muted small city">${esc(TEAM[r.id].city)}</span></td><td>${Math.round(r.o.w)}</td><td>${pctTxt(r.o.po)}</td><td>${pctTxt(r.o.div)}</td><td>${pctTxt(r.o.ws)}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
  return h;
}
function loadIdea(i) {
  const mt = myTeam(), x = anaCache && (String(i)[0] === 'h' ? (anaCache.holes && anaCache.holes[+String(i).slice(1)] || {}).idea : anaCache.ideas[i]); if (!mt || !x) return;
  tradePartner = x.tid; tradeGive = new Set(x.give); tradeGet = new Set([x.target]); tradeCash = x.cash || 0; showHint = false; lastFeedback = null;
  tab = 'trade'; marketView = 'trade'; renderTabs(); render(); window.scrollTo(0, 0);
  toast('Deal loaded. Check the comparison, then propose it.');
}

// ---------------- GM race: how friends compete ----------------
// Each season is worth up to 100 points: Winning 50 (record 30 + postseason 20), Business 30, Fans 20.
const clamp01 = x => Math.max(0, Math.min(1, x));
function postResult(tid, post) {
  if (!post || !post.rounds) return { inPO: false, wins: 0, champ: false, out: false };
  let inPO = !!(post.seeds && Object.values(post.seeds).some(a => a.includes(tid))), wins = 0, out = false;
  for (const r of post.rounds) for (const se of r.series || []) {
    if (se.hi !== tid && se.lo !== tid) continue;
    inPO = true;
    const need = Math.ceil((r.best || 5) / 2);
    if (se.w[0] >= need) { if (se.hi === tid) wins++; else out = true; }
    if (se.w[1] >= need) { if (se.lo === tid) wins++; else out = true; }
  }
  return { inPO, wins, champ: post.champ === tid, out };
}
function gmScore(tid) {
  const s = S.std[tid], g = s[0] + s[1], pct = g ? s[0] / g : 0.5;
  const rec = 30 * clamp01((pct - 0.35) / 0.3);
  const pr = postResult(tid, S.post);
  const post = Math.min(20, (pr.inPO ? 6 : 0) + 3 * pr.wins + (pr.champ ? 5 : 0));
  const f = S.fin[tid], v = i => f[i] || 0;
  const R = v(1) + v(2) + v(3) + v(9) + v(10) + Math.max(0, v(14)), E = v(4) + v(5) + v(8) + v(11) + v(12) + v(13) - Math.min(0, v(14));
  const margin = R ? (R - E) / R : 0;
  const red = cashOf(tid) < 0 ? 5 : 0;
  const biz = Math.max(0, 30 * clamp01((margin + 0.1) / 0.4) - red);
  const fs = fanScore(fanOf(tid)), fans = 20 * clamp01((fs - 30) / 50);
  if (!g) return { tid, rec: 0, post: 0, win: 0, biz: 0, fans: 0, total: 0, pct, margin: 0, fs, pr, red, g };
  return { tid, rec, post, win: rec + post, biz, fans, total: rec + post + biz + fans, pct, margin, fs, pr, red, g };
}
function raceTable() {
  const allTime = (hist && hist.gm) || {};
  const rows = TEAMS.filter(t => ownerOf(t.id)).map(t => { const sc = gmScore(t.id), o = ownerOf(t.id), at = allTime[o] || { pts: 0, seasons: 0, titles: 0 }; return Object.assign(sc, { owner: o, atPts: at.pts, atSeasons: at.seasons, titles: at.titles }); });
  return rows;
}
// one point per sim on the season chart: [day, {tid: score}]
function snapRace() {
  const owned = TEAMS.filter(t => ownerOf(t.id)); if (!owned.length || !S) return;
  const d = S.phase === 'season' ? S.day : LEN() + (S.post ? S.post.rounds.length : 0);
  const pts = {}; owned.forEach(t => { pts[t.id] = Math.round(gmScore(t.id).total * 10) / 10; });
  S.race = (S.race || []).filter(x => x[0] !== d); S.race.push([d, pts]);
  if (S.phase === 'season') { const wl = {}; owned.forEach(t => { wl[t.id] = [S.std[t.id][0], S.std[t.id][1]]; }); S.prog = (S.prog || []).filter(x => x[0] !== S.day); S.prog.push([S.day, wl]); if (S.prog.length > 120) S.prog = S.prog.filter((x, i) => i % 2 === 0 || i > S.prog.length - 20); }
  if (S.race.length > 120) S.race = S.race.filter((x, i) => i % 2 === 0 || i > S.race.length - 20);
}
// projected final and max still possible
let raceProjCache = null;
function raceProjections() {
  const key = [S.day, S.phase, seasonNo(), S.post ? S.post.rounds.length + ':' + S.post.cur : ''].join('|');
  if (raceProjCache && raceProjCache.key === key) return raceProjCache.v;
  const out = {}, rounds = FO.ERA.post === '1997' ? 3 : 4;
  const live = S.phase === 'season', st = live ? strengths() : null, odds = live ? playoffOdds(st.pct) : null;
  for (const t of TEAMS) {
    if (!ownerOf(t.id)) continue;
    const sc = gmScore(t.id), s = S.std[t.id], left = live ? LEN() - s[0] - s[1] : 0;
    // max: win every remaining game, sweep October, perfect business and fans
    const pctMax = (s[0] + left) / Math.max(1, s[0] + s[1] + left);
    const recMax = 30 * clamp01((pctMax - 0.35) / 0.3);
    let postMax;
    if (live) postMax = odds[t.id].po > 0 || left > 20 ? 20 : 0;
    else if (S.phase === 'post') postMax = sc.pr.inPO && !sc.pr.out && !S.post.champ ? 20 : sc.post;
    else postMax = sc.post;
    const max = live || S.phase === 'post' ? recMax + postMax + 30 + 20 : sc.total;
    // projection
    let proj = sc.total;
    if (live) {
      const o = odds[t.id], pw = o.w / LEN();
      const rec = 30 * clamp01((pw - 0.35) / 0.3);
      const post = Math.min(20, o.po * 6 + o.ws * (5 + 3 * rounds) + Math.max(0, o.po - o.ws) * 1.5);
      const tgt = FO.fanTarget(W, S, t.id, setup(t.id)), cur = fanOf(t.id), fe = tgt + (cur - tgt) * Math.pow(1 - 0.035, left);
      const fans = 20 * clamp01((fanScore(fe) - 30) / 50);
      proj = rec + post + (s[0] + s[1] ? sc.biz : 15) + fans;
    }
    out[t.id] = { proj, max: Math.max(max, sc.total) };
  }
  raceProjCache = { key, v: out };
  return out;
}
function raceChart(rows, mt) {
  const pts = (S.race || []).filter(x => x[0] > 0);
  if (pts.length < 2) return '';
  const W0 = 600, H0 = 240, xmax = Math.max(LEN(), ...pts.map(p => p[0])), ymax = Math.max(40, Math.ceil(Math.max(...pts.flatMap(p => Object.values(p[1]))) / 10) * 10 + 10);
  const x = d => 44 + (d / xmax) * (W0 - 54), y = v => H0 - 28 - (v / ymax) * (H0 - 40);
  const pal = ['var(--accent)', 'var(--good)', 'var(--gold)', '#6b8afd', '#c06bd6', '#3fb8b0', '#d6884b', '#8a8f98'];
  const ids = rows.map(r => r.tid).sort((a, b) => (b === mt) - (a === mt));
  const color = {}; let ci = 1; ids.forEach(id => { color[id] = id === mt ? pal[0] : pal[ci++ % pal.length]; });
  const grid = [0, 0.25, 0.5, 0.75, 1].map(f => Math.round(ymax * f)).map(v => `<line x1="44" x2="${W0 - 10}" y1="${y(v)}" y2="${y(v)}" stroke="var(--soft)"/><text x="36" y="${y(v) + 6}" text-anchor="end" font-size="18" fill="var(--muted)">${v}</text>`).join('');
  const lines = ids.map(id => { const d = pts.filter(p => p[1][id] != null).map(p => `${x(p[0]).toFixed(1)},${y(p[1][id]).toFixed(1)}`); return d.length > 1 ? `<polyline fill="none" stroke="${color[id]}" stroke-width="${id === mt ? 3 : 2}" stroke-linejoin="round" points="${d.join(' ')}"/>` : ''; }).join('');
  const lx = `<text x="${x(0)}" y="${H0 - 4}" font-size="18" fill="var(--muted)">Opening Day</text><text x="${x(LEN())}" y="${H0 - 4}" font-size="18" fill="var(--muted)" text-anchor="end">Game ${LEN()}</text>`;
  return `<div class="pad" style="padding-top:12px"><svg viewBox="0 0 ${W0} ${H0}" class="racechart" role="img" aria-label="Points through the season">${grid}${lines}${lx}</svg>
    <div class="legend small">${ids.map(id => `<span><i style="background:${color[id]}"></i>${esc(ownerName(ownerOf(id)))} (${esc(id)})</span>`).join('')}</div></div>`;
}
function viewRace() {
  const mt = myTeam(), rows = raceTable(), done = S.phase === 'done' || S.phase === 'offseason';
  const label = done ? `${yearOf(seasonNo())} final` : S.phase === 'post' ? 'postseason' : S.day ? `after ${S.day} of ${LEN()} days` : 'Opening Day';
  const cpuBest = TEAMS.filter(t => !ownerOf(t.id)).map(t => gmScore(t.id)).sort((a, b) => b.total - a.total)[0];
  const r1 = x => Math.round(x);
  const pj = rows.length ? raceProjections() : {};
  const bySeason = raceOrder(rows);
  const tbw = tbOf() && tbOf().winner;
  const anyHistory = rows.some(r => r.atSeasons > 0);
  let h = tbCard() + `<section class="card"><h2>GM race<span class="sub">${label}</span></h2>`;
  if (!rows.length) return h + `<div class="empty">No GMs yet. Claim a club and invite friends to start the race.</div></section>`;
  h += `<div class="scroll"><table class="race"><thead><tr><th class="name">GM</th><th>Win</th><th>Biz</th><th>Fans</th><th class="now">Now</th>${done ? '' : '<th>Proj</th><th>Max</th>'}${anyHistory ? '<th>All</th>' : ''}</tr></thead><tbody>${bySeason.map((r, i) => {
    const p = pj[r.tid] || { proj: r.total, max: r.total };
    return `<tr class="${r.tid === mt ? 'mine' : ''}"><td class="name"><b>${i + 1}. ${esc(ownerName(r.owner))}</b> <span class="abbr">${esc(r.tid)}</span>${r.tid === tbw ? ' <span class="tag gold">Won Game 163</span>' : ''}<span class="s">${S.std[r.tid][0]}-${S.std[r.tid][1]}${r.pr.champ ? ' · champs' : r.pr.inPO ? ' · playoffs' : ''} · margin ${Math.round(r.margin * 100)}% · fans ${r.fs}${r.titles ? ` · ${r.titles}× title` : ''}</span></td><td>${r1(r.win)}</td><td>${r1(r.biz)}</td><td>${r1(r.fans)}</td><td class="now"><b>${r1(r.total)}</b></td>${done ? '' : `<td>${r1(p.proj)}</td><td class="muted">${r1(p.max)}</td>`}${anyHistory ? `<td>${r1(r.atPts + (done ? 0 : r.total))}</td>` : ''}</tr>`;
  }).join('')}</tbody></table></div>`;
  if (!done) h += `<p class="pad small" style="padding-top:10px;margin:0"><b>Now</b> is your score if the season ended today. <b>Proj</b> is where you're heading, using playoff odds, your profit pace and where fan interest is trending. <b>Max</b> is the most you can still reach: win every remaining game, run the table in October, and max out business and fans. Every season can be worth up to 100.</p>`;
  h += raceChart(rows, mt);
  const rv = rivalsCard(mt);
  h += `<div class="pad small" style="padding-top:8px"><button class="lnk" type="button" data-act="history" data-v="book">Past champions</button> · <button class="lnk" type="button" data-act="history" data-v="career">Your career</button></div>`;
  h += `<p class="pad small" style="padding-top:10px;margin:0">${bySeason.length > 1 ? (tieFor1st() && !tbw ? `<b>Dead heat</b> at the top. Game 163 decides it.` : `<b>${esc(ownerName(bySeason[0].owner))}</b> ${bySeason[0].owner === me.id ? (done ? 'win' : 'lead') : (done ? 'wins' : 'leads')} this season.`) : 'Invite friends to claim clubs and the race is on.'}${cpuBest && cpuBest.g ? ` For reference, the best computer club (${esc(cpuBest.tid)}) is at ${r1(cpuBest.total)}.` : ''}</p>`;
  h += `<p class="pad small muted" style="padding-top:4px;margin:0">${done ? 'Final scores lock in when the commissioner closes free agency and adds them to the all-time totals.' : 'Scores move every time the league sims and lock in at the end of the season.'}</p></section>`;
  h += rv;
  // rubric
  h += `<section class="card"><details class="rubric"><summary><h2 class="h2">How the race is scored</h2></summary><div class="pad small">
    <p>Every season is worth up to <b>100 points</b>. You win by being good at all three parts of the job, not just one. A champion who goes broke can lose to a smart, profitable contender with a packed ballpark.</p>
    <h4>Winning · up to 50</h4>
    <ul><li><b>Regular season, 30:</b> scaled on winning percentage. A .350 team gets 0, a .500 team gets 15, a .650 team gets the full 30.</li>
    <li><b>Postseason, 20:</b> 6 for making the playoffs, 3 for every series you win, and 5 more for the World Series title.</li></ul>
    <h4>Business · up to 30</h4>
    <ul><li>Scaled on your <b>operating margin</b>: operating profit divided by revenue, from the Profit &amp; loss in GM Analysis. A −10% margin gets 0, +10% gets 15, +30% or better gets 30.</li>
    <li>Margin is fair to small markets. A small club running a tight ship scores like a big one.</li>
    <li>One-time costs (signing bonuses, ballpark projects) don't count against the margin, so investing isn't punished. Finishing with <b>negative cash costs 5 points</b>.</li></ul>
    <h4>Fans · up to 20</h4>
    <ul><li>Based on fan interest (0–100) at the end of the season. 30 or below gets 0, 55 gets 10, 80 or above gets 20.</li>
    <li>Fans respond to winning, star players, marketing, promotions and fair prices. Gouge them and you lose points here.</li></ul>
    <h4>Seasons and the all-time table</h4>
    <ul><li>Scores move live during the season and lock in when the commissioner closes free agency.</li>
    <li>Season points add up into an <b>all-time total</b> that follows the GM, even if they switch clubs.</li>
    <li>Tip: GM Analysis on the Office tab shows playoff odds, your profit and loss, and fan interest, so you can see which part of your score to work on.</li></ul>
  </div></details></section>`;
  return h;
}
function viewPastRaces() {
  const ss = (hist.seasons || []).filter(x => x.gm && Object.keys(x.gm).length).slice().reverse();
  if (!ss.length) return '';
  return `<section class="card"><h2>Past seasons</h2>${ss.map(x => { const rows = Object.entries(x.gm).sort((a, b) => (b[0] === x.raceW) - (a[0] === x.raceW) || b[1].total - a[1].total); return `<div class="pad small" style="padding-top:12px"><b>${x.year}</b>${x.champ ? ` · ${esc(TEAM[x.champ] ? TEAM[x.champ].city : x.champ)} won it all` : ''}<div class="scroll"><table class="race"><thead><tr><th class="name">GM</th><th>Win</th><th>Biz</th><th>Fans</th><th>Total</th></tr></thead><tbody>${rows.map(([tid, r], i) => `<tr><td class="name">${i === 0 ? '🏆 ' : ''}${esc(ownerName(r.owner))} <span class="abbr">${esc(tid)}</span>${i === 0 && x.g163 ? ' <span class="small muted">won Game 163</span>' : ''}</td><td>${r.win}</td><td>${r.biz}</td><td>${r.fans}</td><td><b>${r.total}</b></td></tr>`).join('')}</tbody></table></div></div>`; }).join('')}</section>`;
}
// ---------------- mini P&L (inside GM Analysis) ----------------
function pnlOf(tid) {
  const f = S.fin[tid], g = (x) => f[x] || 0;
  const rev = [['Tickets', g(1)], ['Food & drinks', g(2)], ['Parking', g(9)], ['Merch, suites & sponsors', g(10)], ['TV, radio & national', g(3)]];
  if (g(14) > 0) rev.push(['Luxury tax share', g(14)]);
  const exp = [['Player payroll', g(4)], ['Ballpark operations', g(5)], ['Promotions & marketing', g(11)], ['Scouting & development', g(8) + g(12)], ['Medical staff', g(15)], ['Interest & upkeep', g(13)]];
  if (g(14) < 0) exp.push(['Luxury tax', -g(14)]);
  const R = rev.reduce((a, x) => a + x[1], 0), E = exp.reduce((a, x) => a + x[1], 0);
  return { rev, exp, R, E, op: R - E, one: adjNow(tid) };
}
function viewPnL(mt) {
  const p = pnlOf(mt), gp = S.gp[mt] || 0, inSeason = S.phase === 'season' && gp > 0 && gp < LEN();
  const k = inSeason ? LEN() / gp : 1;
  const ranks = TEAMS.map(t => ({ id: t.id, op: pnlOf(t.id).op })).sort((a, b) => b.op - a.op);
  const rank = ranks.findIndex(r => r.id === mt) + 1;
  const row = (l, v, cls) => `<tr class="${cls || ''}"><td>${esc(l)}</td><td>${money(v)}</td>${inSeason ? `<td>${money(v * k)}</td>` : ''}</tr>`;
  const neg = (l, v) => `<tr><td>${esc(l)}</td><td>−${money(v)}</td>${inSeason ? `<td>−${money(v * k)}</td>` : ''}</tr>`;
  const margin = p.R ? p.op / p.R : 0, payShare = p.R ? (p.exp[0][1] / p.R) : 0;
  const big = p.rev.slice().sort((a, b) => b[1] - a[1])[0];
  if (!gp && !p.R) return `<section class="card"><h2>Profit &amp; loss</h2><div class="empty">Numbers show up after the first game.</div></section>`;
  return `<section class="card"><h2>Profit &amp; loss<span class="sub">${S.phase === 'season' ? `${gp} games in` : yearOf(seasonNo()) + ' final'} · #${rank} of 30</span></h2>
    <div class="scroll"><table class="pnl"><thead><tr><th></th><th>${inSeason ? 'So far' : 'Season'}</th>${inSeason ? '<th>Full-season pace</th>' : ''}</tr></thead><tbody>
    <tr class="sec"><td colspan="${inSeason ? 3 : 2}">Revenue</td></tr>${p.rev.map(x => row(x[0], x[1])).join('')}${row('Total revenue', p.R, 'tot')}
    <tr class="sec"><td colspan="${inSeason ? 3 : 2}">Expenses</td></tr>${p.exp.filter(x => x[1] > 0).map(x => neg(x[0], x[1])).join('')}${row('Total expenses', -p.E, 'tot')}
    <tr class="tot big"><td>Operating profit</td><td style="color:${p.op >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(p.op)}</td>${inSeason ? `<td style="color:${p.op >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(p.op * k)}</td>` : ''}</tr>
    ${p.one ? `<tr><td>One-time: signings, trades, projects</td><td>${money(p.one)}</td>${inSeason ? `<td>${money(p.one)}</td>` : ''}</tr><tr class="tot"><td>Net</td><td>${money(p.op + p.one)}</td>${inSeason ? `<td>${money(p.op * k + p.one)}</td>` : ''}</tr>` : ''}
    </tbody></table></div>
    <p class="pad small" style="padding-top:10px;margin:0">Margin <b class="num">${Math.round(margin * 100)}%</b> · payroll is <b class="num">${Math.round(payShare * 100)}%</b> of revenue${payShare > 0.6 ? ' (high: most clubs that make money keep it under 55%)' : payShare < 0.4 ? ' (lean: room to add talent)' : ''} · biggest earner: ${esc(big[0])}.</p>
    <p class="pad small muted" style="padding-top:4px;margin:0">${inSeason ? 'Pace assumes the rest of the season looks like the games so far. ' : ''}Ranked by operating profit among all 30 clubs.</p></section>`;
}
// ---------------- Business advice (inside GM Analysis) ----------------
function perGame(tid, over) {
  const { att, m, cap } = previewGame(tid, over), sh = FO.ERA.fin.share || 0;
  return { att, cap, net: m.gate * (1 - sh) + m.conc + m.park + m.merch - m.promo };
}
function bestOf(tid, vals, mk) { let best = null; for (const v of vals) { const r = perGame(tid, mk(v)).net; if (!best || r > best.r) best = { v, r }; } return best; }
function range(a, b, step) { const out = []; for (let x = a; x <= b + 1e-9; x += step) out.push(Math.round(x * 100) / 100); return out; }
function businessAdvice(mt) {
  const su = setup(mt), b = su.biz, F = FO.ERA.fin, t = TEAM[mt], out = [];
  const base = perGame(mt).net, games = 81, cash = cashOf(mt), fan = fanOf(mt);
  const live = S.phase === 'season' || S.phase === 'offseason';
  const add = (score, title, body, act) => out.push({ score, title, body, act });
  // pricing: best values that don't anger fans
  const tStep = SC() > 1 ? 1 : 0.5;
  const tix = bestOf(mt, range(Math.max(FO.ERA.price[0], t.price0 * 0.7), Math.min(FO.ERA.price[1], t.price0 * 1.2), tStep), v => ({ price: v }));
  if (live && Math.abs(tix.v - su.price) >= tStep && tix.r - base > base * 0.015) add((tix.r - base) * games, `${tix.v > su.price ? 'Raise' : 'Lower'} tickets to $${tix.v.toFixed(2)}`, `${tix.v > su.price ? 'Fans will still come at that price' : 'A fuller park sells more food, parking and merch'}: about <b class="num">+${money((tix.r - base) * games)}</b> over a season.`, { k: 'price', v: tix.v });
  const conc = bestOf(mt, range(0.8, 1.25, 0.05), v => ({ biz: { conc: v } }));
  if (live && Math.abs(conc.v - b.conc) >= 0.05 && conc.r - base > base * 0.01) add((conc.r - base) * games, `Set food & drinks to ${Math.round(conc.v * 100)}%`, `The sweet spot before fans get annoyed: about <b class="num">+${money((conc.r - base) * games)}</b> a season.`, { k: 'conc', v: conc.v });
  else if (b.conc > 1.25) add(F.conc * 30000, 'Food prices are hurting fan interest', `At ${Math.round(b.conc * 100)}% fans are grumbling. Bring them back to about 120%.`, { k: 'conc', v: 1.2 });
  const pStep = SC() > 1 ? 1 : 0.5;
  const park = bestOf(mt, range(F.park0 * 0.6, F.park0 * 1.3, pStep), v => ({ biz: { park: v } }));
  if (live && Math.abs(park.v - b.park) >= pStep && park.r - base > base * 0.01) add((park.r - base) * games, `Set parking to $${park.v.toFixed(2)}`, `About <b class="num">+${money((park.r - base) * games)}</b> a season.`, { k: 'park', v: park.v });
  // promotions: compare levels
  const promo = bestOf(mt, [0, 1, 2, 3], v => ({ biz: { promo: v } }));
  if (live && promo.v !== b.promo && promo.r - base > base * 0.01) add((promo.r - base) * games, promo.v > b.promo ? `More promotion nights: ${FO.PROMOS[promo.v].toLowerCase()}` : `Cut back promotions to ${FO.PROMOS[promo.v].toLowerCase()}`, `${promo.v > b.promo ? 'The extra fans more than pay for the giveaways' : 'The giveaways cost more than the extra fans bring in'}: about <b class="num">+${money((promo.r - base) * games)}</b> a season.`, { k: 'promo', v: promo.v });
  // fan interest & marketing
  if (fanScore(fan) < 45 && cash > F.adsMax * 0.3 && b.ads < F.adsMax * 0.4) add(F.adsMax * 0.4, 'Rebuild fan interest with marketing', `Fan interest is ${fanScore(fan)}/100. Raising the ad campaign to about ${money(F.adsMax * 0.4)} a year lifts crowds, merch and a ratings TV deal over time.`, { k: 'ads', v: F.adsMax * 0.4 });
  if (b.spon >= 2 && fanScore(FO.fanTarget(W, S, mt, su)) < 45) add(F.spon, 'Fans are tired of the ads', 'Your sponsorship level is dragging fan interest down. Dropping a level costs a little money but helps crowds.', { k: 'spon', v: b.spon - 1 });
  if (cash < F.start * 0.2 && b.spon < 2) add(F.spon * Math.pow(t.mkt, 0.3), 'Sell more sponsorships', `Money is tight. One more sponsorship level adds about ${money(F.spon * Math.pow(t.mkt, 0.3))} a year for a small hit to fan interest.`, { k: 'spon', v: b.spon + 1 });
  // TV deal
  const canTV = S.phase === 'offseason' || (S.phase === 'season' && S.day === 0);
  if (canTV) {
    const rm = FO.tvMult(S, mt, Object.assign({}, su, { biz: Object.assign({}, b, { tv: 'ratings' }) })), lt = FO.localTV(mt);
    if (cash < 0 && b.tv !== 'advance') add(lt * 0.75, 'Take the TV cash advance', `You're in the red. The advance puts ${money(lt * 0.75)} in the bank today, at the cost of most of next season's local TV money.`, { k: 'tv', v: 'advance' });
    else if (rm > 1.08 && b.tv !== 'ratings') add(lt * (rm - 1), 'Switch to the ratings-based TV deal', `With your record and fan interest it would pay about ${money(lt * rm)} vs ${money(lt)} fixed.`, { k: 'tv', v: 'ratings' });
    else if (rm < 0.95 && b.tv === 'ratings') add(lt * (1 - rm), 'Lock in the fixed TV deal', `The ratings deal is only paying about ${money(lt * rm)}. The fixed deal pays ${money(lt)}.`, { k: 'tv', v: 'safe' });
  }
  // projects: payback
  const pg = previewGame(mt), m = pg.m, full = pg.att >= pg.cap * 0.97;
  const yearly = {
    suites: F.suite * fan * games, food: m.conc / (b.builds.food ? 1.2 : 1) * 0.2 * games, garage: m.park * 0.25 * games, store: (m.merch - (b.builds.suites ? F.suite * fan : 0)) * 0.5 * games,
    board: perGame(mt).net * games * 0.05, seats: full ? 4000 * (m.gate + m.conc + m.park) / Math.max(1, pg.att) * games * 0.6 : 0,
  };
  let bestP = null;
  for (const k of Object.keys(FO.BUILDS)) {
    if (b.builds[k]) continue;
    const cost = FO.buildCost(k), net = yearly[k] - cost * 0.03, pay = net > 0 ? cost / net : 99;
    if (!bestP || pay < bestP.pay) bestP = { k, cost, net, pay };
  }
  if (bestP && bestP.pay < 6) {
    const afford = cash >= bestP.cost, loanRoom = F.loanMax - b.loan;
    add(bestP.net * 2, `Build the ${FO.BUILDS[bestP.k].name.toLowerCase()}`, `Costs ${money(bestP.cost)} and should bring in about ${money(bestP.net)} a year after upkeep. It pays for itself in about ${bestP.pay.toFixed(1)} seasons.${afford ? '' : loanRoom >= bestP.cost - cash ? ' Borrow the difference from the bank: it earns more than the 7% interest.' : ' Save up for it first.'}`, afford ? { k: 'build', v: bestP.k } : null);
  }
  // bank
  const step = F.loanMax / 10;
  if (b.loan > 0 && cash > step * 2) add(Math.min(b.loan, step) * F.rate * 3, 'Pay down the loan', `You have ${money(cash)} in cash and owe ${money(b.loan)} at 7%. Repaying saves interest every day.`, { k: 'repay' });
  if (cash < 0 && b.loan < F.loanMax) add(1e12, 'Borrow to get back in the black', `Cash is ${money(cash)}, so you can't sign free agents. A bank loan gets you moving again. Pay it back from profits.`, { k: 'borrow' });
  // budgets when money is tight
  const wk = weekly(mt);
  if (cash < F.start * 0.15 && wk.w.length && wk.net < 0) add(su.scout * 0.5 + b.dev * 0.3, 'Trim spending while money is tight', `You're losing about ${money(-wk.net)} a week. Scouting is ${money(su.scout)} and development ${money(b.dev)} a year, so cutting them buys time. Payroll is ${money(payroll(mt))}; moving a big contract helps most.`, null);
  if (cash > F.start * 1.5 && b.dev < F.devMax * 0.5) add(F.devMax * 0.2, 'Invest in player development', `You have plenty of cash. A bigger development budget grows your prospects faster and raises their ceilings.`, { k: 'dev', v: F.devMax * 0.6 });
  // projection
  const left = S.phase === 'season' ? LEN() - S.day : 0;
  const proj = wk.w.length ? cash + wk.net / wk.w.length * left : cash;
  return { list: out.sort((a, b) => b.score - a.score).slice(0, 6), proj, left, base };
}
function viewBizAdvice(mt) {
  const a = businessAdvice(mt);
  const btn = (x, i) => x.act ? `<button class="btn sm" type="button" data-act="bizapply" data-i="${i}">${x.act.k === 'build' ? 'Build it' : x.act.k === 'borrow' ? 'Borrow' : x.act.k === 'repay' ? 'Repay' : 'Apply'}</button>` : '';
  bizAdviceCache = a.list;
  return (cashOf(mt) < 0 ? `<section class="card redalert"><div class="pad row wrap" style="gap:10px;align-items:center;padding-top:12px"><div style="flex:1;min-width:180px"><b>You're in the red: ${money(cashOf(mt))}</b><div class="small muted">Your recovery plan ranks every fix with an Apply button.</div></div><button class="btn primary" type="button" data-act="recover">Fix it</button></div></section>` : '') + `<section class="card"><h2>Business advice<span class="sub">tested on your numbers</span></h2>
    <div class="pad small" style="padding-top:12px">A typical home game nets you <b class="num">${money(a.base)}</b>${a.left ? `. At this week's pace you'll end the season with about <b class="num" style="color:${a.proj >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(a.proj)}</b> in cash` : ''}.</div>
    ${a.list.length ? a.list.map((x, i) => `<div class="idea"><b>${x.title}</b><div class="small muted">${x.body}</div>${x.act ? `<div>${btn(x, i)}</div>` : ''}</div>`).join('') : '<div class="empty">The business is well tuned. Keep winning and fan interest will do the rest.</div>'}</section>`;
}
let bizAdviceCache = [];
async function applyAdvice(i) {
  const x = bizAdviceCache[i]; if (!x || !x.act) return;
  const { k, v } = x.act, mt = myTeam();
  if (k === 'price') await teamWrite(mt, { price: v });
  else if (k === 'conc' || k === 'park' || k === 'promo' || k === 'spon' || k === 'ads' || k === 'dev') await setBiz({ [k]: v });
  else if (k === 'tv') await chooseTV(v);
  else if (k === 'build') await buildProject(v);
  else if (k === 'borrow') await loanStep(1);
  else if (k === 'repay') await loanStep(-1);
  if (k !== 'build' && k !== 'borrow' && k !== 'repay' && k !== 'tv') toast('Done: ' + x.title.replace(/<[^>]+>/g, '') + '.');
}

// ---------------- free agent value (WAR) & negotiation ----------------
// WAR from a rating: hitters' ratings include position value; replacement level is about 2 WAR below average.
function warFromOvr(p, o) {
  if (p.t === 'H') return ((o - 60) / 0.8 + 20) / 10;
  if (p.role === 'SP') return ((o - 60) / 0.85 + 20) / 10;
  return ((o - 55) / 1.5 + 6) / 10;
}
function warOf(id, exact) { const p = P[id]; return Math.max(-1, warFromOvr(p, exact ? p.ovr : sOvr(id))); }
const fmtWar = v => (v >= 0 ? '' : '−') + Math.abs(v).toFixed(1);
const perWin = () => FO.ERA.year >= 2000 ? 8e6 : 1.6e6;
// Where a player would fit on your club and how many wins he adds
function fitFor(id, mt) {
  const p = P[id], u = unitRatings(mt), mine = warOf(id);
  let best = null;
  const consider = (spot, curId) => { const cur = curId != null ? warOf(curId, true) : 0; const g = mine - cur; if (!best || g > best.gain) best = { spot, curId, gain: g }; };
  if (p.t === 'H') { for (const k of POS9) if (u[k] && fitsSpot(p, k)) consider(k, u[k].id); }
  else {
    const ids = (p.role === 'SP' ? u.SP.ids : u.RP.ids).slice();
    const worst = ids.sort((a, b) => P[a].ovr - P[b].ovr)[0];
    consider(p.role === 'SP' ? 'SP' : 'RP', ids.length >= 5 ? worst : null);
  }
  const frac = S.phase === 'season' ? Math.max(0, LEN() - S.day) / LEN() : 1;
  const gain = best ? Math.max(0, best.gain) : 0;
  return { war: mine, spot: best && best.spot, curId: best && best.curId, gain, wins: gain * frac, frac };
}
// What he'd really settle for (hidden). Leftover free agents in season want a job; contenders get a discount.
function settleFor(pid, mt, yrs) {
  const p = P[pid], ask = askNow(pid, mt), off = S.phase === 'offseason';
  let f = off ? 0.9 - 0.025 * faDay() : 0.8 - (S.day > 60 ? 0.08 : 0) - (S.day > 120 ? 0.07 : 0);
  if (off) f += Math.min(0.15, 0.05 * bidsFor(pid).filter(b => b.tid !== mt).length);
  if (p.age >= 33) f -= 0.05;
  const want = FO.faYears(p);
  if (yrs > want) f -= (p.age >= 30 ? 0.03 : 0.01) * Math.min(3, yrs - want);
  if (yrs < want) f += (p.age <= 29 ? 0.04 : 0.015) * (want - yrs);
  if (mt) { const s = S.std[mt], g = s[0] + s[1]; if (g >= 20) { const pct = s[0] / g; if (pct >= 0.55) f -= 0.05; else if (pct < 0.45) f += 0.05; } }
  const h = (((pid * 2654435761) ^ (seasonNo() * 40503)) >>> 0) % 1000 / 1000;
  f *= 0.94 + h * 0.12;
  return Math.max(FO.ERA.minSal, Math.round(ask * Math.max(0.55, Math.min(1.05, f)) / 10000) * 10000);
}
function settleRange(pid, mt, yrs) {
  const r = settleFor(pid, mt, yrs), e = 0.04 + fogErr() / 12 * 0.14;
  const step = r >= 1e7 ? 5e5 : r >= 1e6 ? 1e5 : 1e4;
  return [Math.max(FO.ERA.minSal, Math.floor(r * (1 - e) / step) * step), Math.ceil(r * (1 + e) / step) * step];
}
function faVerdict(pid, mt) {
  const fit = fitFor(pid, mt), price = askNow(pid, mt), rate = perWin();
  if (fit.gain < 0.3) return { fit, txt: 'Depth only', cls: '', note: `He wouldn't start for you. Worth it only as cheap depth.` };
  const cpw = price / fit.gain;
  const r = cpw / rate;
  const txt = r < 0.6 ? 'Bargain' : r < 1.2 ? 'Fair price' : r < 2 ? 'Pricey' : 'Overpay';
  const cls = r < 0.6 ? 'goodc' : r < 1.2 ? 'goodc' : r < 2 ? 'warnc' : 'bad';
  return { fit, txt, cls, cpw, note: `${money(cpw)} per win added vs about ${money(rate)} on the open market.` };
}
function faInsight(pid, mt) {
  const p = P[pid], v = faVerdict(pid, mt), f = v.fit;
  const spotTxt = f.spot ? (f.spot === 'SP' ? 'your rotation' : f.spot === 'RP' ? 'your bullpen' : POS_NAME[f.spot]) : '';
  const repl = f.curId != null ? `${esc(P[f.curId].name)} (${fmtWar(warOf(f.curId, true))} WAR)` : 'an open spot';
  const [lo, hi] = settleRange(pid, mt, FO.faYears(p));
  return `<div class="advice"><div class="row" style="gap:8px;align-items:center"><b style="flex:1">GM insight</b><span class="pill ${v.cls}">${v.txt}</span></div>
    <ul><li>Worth about <b>${fmtWar(f.war)} WAR</b> over a full season${fogErr() ? ' (your scouts\' read)' : ''}.</li>
    ${f.gain >= 0.3 ? `<li class="good">Would take over ${spotTxt} from ${repl}: about <b>+${f.wins.toFixed(1)} wins</b>${S.phase === 'season' ? ' the rest of this season' : ' next season'}.</li>` : `<li>Wouldn't beat ${repl} for a starting job.</li>`}
    ${v.cpw ? `<li class="${v.cls === 'bad' ? 'bad' : v.cls === 'goodc' ? 'good' : ''}">${v.note}</li>` : ''}
    <li>Your scouts think he'd settle for about <b>${money(lo)}–${money(hi)}</b> a year on a ${FO.faYears(p)}-year deal${fogErr() > 6 ? '. A bigger scouting budget tightens this guess' : ''}.</li></ul></div>`;
}
// negotiation
let nego = null; const negoTries = {};
function negoKey(pid) { return pid + ':' + seasonNo() + ':' + (S.phase === 'offseason' ? 'o' + faDay() : 's' + S.day); }
function negoView(pid, mt) {
  const p = P[pid], price = askNow(pid, mt);
  if (!nego || nego.pid !== pid) nego = { pid, sal: Math.round(settleRange(pid, mt, FO.faYears(p))[0] / 10000) * 10000, yrs: FO.faYears(p), msg: '' };
  const off = S.phase === 'offseason', maxY = 5, base = off ? seasonNo() + 1 : seasonNo();
  const tries = negoTries[negoKey(pid)] || 0, done = tries >= 3;
  const yrOpts = Array.from({ length: maxY }, (_, i) => `<option value="${i + 1}" ${i + 1 === nego.yrs ? 'selected' : ''}>${i + 1} season${i ? 's' : ''} · through ${yearOf(base + i)}</option>`).join('');
  return `<div class="meter" id="negoBox"><b>Negotiate</b><div class="small muted">He's asking ${money(price)} a year. Make your pitch. He'll take it, counter, or walk away until ${off ? 'the next market day' : 'tomorrow'} after three tries.</div>
    <div class="price" style="justify-content:space-between"><button class="btn icon" type="button" data-act="negstep" data-d="-1" aria-label="Lower offer">−</button><b class="num" id="negSal" style="font-size:28px">${money(nego.sal)}</b><button class="btn icon" type="button" data-act="negstep" data-d="1" aria-label="Raise offer">+</button></div>
    <label class="small muted" for="negYrs">Contract length</label><select id="negYrs">${yrOpts}</select>
    <div class="small" id="negMsg">${nego.msg || ''}</div>
    <div class="row"><button class="btn primary" type="button" data-act="negotiate" data-p="${pid}" ${done ? 'disabled' : ''}>${done ? 'He\'s done talking for now' : 'Make offer'}</button><span class="small muted">${done ? '' : `${3 - tries} tr${3 - tries === 1 ? 'y' : 'ies'} left`}</span></div></div>`;
}
function negStep(d) {
  if (!nego) return;
  const price = askNow(nego.pid, myTeam());
  const step = price >= 20e6 ? 5e5 : price >= 3e6 ? 250000 : price >= 1e6 ? 50000 : 10000;
  nego.sal = Math.max(FO.ERA.minSal, Math.min(price * 1.2, nego.sal + d * step));
  const s = $('#negSal'); if (s) s.textContent = money(nego.sal);
}
async function negotiate(pid) {
  const mt = myTeam(); if (!mt || !nego || nego.pid !== pid) return;
  const key = negoKey(pid); if ((negoTries[key] || 0) >= 3) return;
  nego.yrs = +($('#negYrs') && $('#negYrs').value) || nego.yrs;
  const res = settleFor(pid, mt, nego.yrs), ask = askNow(pid, mt), p = P[pid];
  negoTries[key] = (negoTries[key] || 0) + 1;
  if (nego.sal >= res) {
    const bonus = Math.round(nego.sal * FO.BONUS);
    if (rosterOf(mt).length >= 28) { nego.msg = '<span class="warn">He\'d take it, but your roster is full (28).</span>'; refreshNego(pid); return; }
    if (cashOf(mt) < bonus) { nego.msg = `<span class="warn">He'd take it, but you need ${money(bonus)} in cash for the signing bonus.</span>`; refreshNego(pid); return; }
    await signFA(pid, { price: nego.sal, yrs: nego.yrs });
    nego = null; return;
  }
  const left = 3 - negoTries[key];
  const gap = (res - nego.sal) / res;
  let counter = gap < 0.12 ? res : Math.round((res + ask) / 2 / 10000) * 10000;
  counter = Math.max(counter, res);
  const yrsNote = nego.yrs !== FO.faYears(p) ? (nego.yrs > FO.faYears(p) ? ' The extra years help.' : ` He'd rather have ${FO.faYears(p)} years.`) : '';
  nego.msg = left <= 0 ? `<span class="warn">“We're too far apart. Call me ${S.phase === 'offseason' ? 'after the next market day' : 'tomorrow'}.”</span>`
    : gap > 0.3 ? `<span class="warn">“That's not a serious offer.”</span> He wants about <b>${money(counter)}</b>.${yrsNote}`
      : gap < 0.12 ? `“Close. Get me to <b>${money(counter)}</b> and we have a deal.”${yrsNote}` : `“We're getting somewhere. I'm looking for about <b>${money(counter)}</b>.”${yrsNote}`;
  refreshNego(pid);
}
function refreshNego(pid) { const b = $('#negoBox'); if (b) b.outerHTML = negoView(pid, myTeam()); }

// ================= Redesign: Desk, hubs, Play bar, recap, autopilot =================
let leagueSub = 'standings', simSpan = 'series', lastRecap = null;
try { simSpan = localStorage.getItem('fo-span') || 'series'; } catch (e) { /* storage unavailable */ }

// ---------- League hub: standings, scores, stats, news, GM race ----------
function viewLeagueHub() {
  if (leagueSub === 'race') leagueSub = 'standings';
  const subs = [['standings', 'Standings'], ['history', 'History'], ['scores', 'Scores'], ['stats', 'Stats'], ['news', 'News']].concat(mode === 'shared' && league.kind !== 'solo' ? [['rules', 'Rules']] : []);
  const seg = `<section class="card"><div class="pad" style="padding-top:12px"><div class="seg scrollseg" role="group" aria-label="League">${subs.map(([k, l]) => `<button type="button" data-act="lsub" data-v="${k}" aria-pressed="${leagueSub === k}">${l}</button>`).join('')}</div></div></section>`;
  if (leagueSub === 'stats') return seg + viewStatsTab();
  if (leagueSub === 'news') return seg + viewPapers() + viewNews();
  if (leagueSub === 'rules') return seg + viewRules();
  if (leagueSub === 'history') return seg + viewHistory();
  if (leagueSub === 'race') return seg + viewRace() + viewPastRaces();
  if (leagueSub === 'scores') return seg + viewScores();
  return seg + (S.post ? viewBracket() : '') + viewStandings() + viewOwners();
}
function goLeague(sub) { tab = 'league'; leagueSub = sub; renderTabs(); render(); window.scrollTo(0, 0); }
function goOffice(sub) { tab = 'office'; officeView = sub; renderTabs(); render(); window.scrollTo(0, 0); }
function goMoves(sub) { tab = 'trade'; marketView = sub; renderTabs(); render(); window.scrollTo(0, 0); }

// ---------- Desk ----------
function lastGameOf(tid) {
  if (!box || !box.games) return null;
  const g = box.games.find(x => x.h === tid || x.a === tid); if (!g) return null;
  const home = g.h === tid, my = home ? g.hs : g.as, their = home ? g.as : g.hs;
  return { g, i: box.games.indexOf(g), opp: home ? g.a : g.h, home, my, their, win: my > their };
}
function streakOf(tid) { const r = (S.res && S.res[tid]) || ''; if (!r) return ''; const c = r[r.length - 1]; let n = 0; for (let i = r.length - 1; i >= 0 && r[i] === c; i--) n++; return (c === 'W' ? 'Won ' : 'Lost ') + n; }
function deskCards(mt) {
  const cards = [], add = (pri, icon, title, body, btn) => cards.push({ pri, icon, title, body, btn });
  const su = setup(mt), auto = autoOf(mt), season = seasonNo();
  const dl = tradeDeadlineDay();
  if (dl && S.phase === 'season' && S.day < dl && dl - S.day <= 10) add(97, '⏰', `Trade deadline in ${dl - S.day} game days`, `After ${FO.dateOf(dl - 1)} no trades until the offseason. Make your moves now.`, ['market', 'Moves']);
  const up = unseenPaper(mt);
  if (up) add(98, '📰', 'Extra! Extra! ' + esc(up.head), esc(up.sub), ['paper', 'Read it', up.id]);
  // trade offers
  const inc = trades.filter(x => x.to === mt && x.status === 'pending' && !offerStale(x));
  if (inc.length) add(100, '⇄', `${inc.length} trade offer${inc.length > 1 ? 's' : ''} on your desk`, inc[0].ai ? `${esc(TEAM[inc[0].from].city)}'s GM is calling. Your scouts have a take on it.` : `${esc(ownerName(ownerOf(inc[0].from)))} sent you a deal.`, ['goto-offers', 'Review']);
  { const dcard = draftDeskCard(mt); if (dcard) cards.push(dcard); }
  // GM Race dead heat
  { const tie = tieFor1st(), tb = tbOf();
    if (tie && !tb) add(101, '🏆', `Dead heat in the GM Race at ${tie.pts}`, `${tie.rows.map(r => esc(ownerName(r.owner))).join(' and ')} are tied. Settle it with Game 163.`, canStartTb(tie) ? ['tb-play', 'Play Game 163'] : ['tab', 'GM Race', 'race']);
    else if (tb && tb.ts > (+(localGet('tbSeen:' + noteKey())) || 0) && tb.by !== me.id) add(101, '🏆', 'Game 163 is final', `The ${yearOf(seasonNo())} GM Race was decided on the field. Watch how it happened.`, ['tb-watch', 'Watch it']);
  }
  // money trouble
  const cash = cashOf(mt);
  if (cash < 0) { const rp = recoveryPlan(mt), first = rp.instant.concat(rp.ongoing).sort((a, b) => b.now - a.now)[0]; add(99, '$', `You are in the red: ${money(cash)}`, `You can't sign free agents until it's positive.${first ? ` Quickest fix: ${first.title.replace(/<[^>]+>/g, '').toLowerCase()}.` : ''} Your recovery plan is ready.`, ['recover', 'Fix it']); }
  else { const wk = weekly(mt), left = S.phase === 'season' ? LEN() - S.day : 0; if (left > 14 && wk.w.length >= 2 && cash + wk.net / wk.w.length * left / 7 < 0) add(80, '$', 'Heading for the red', `At this pace you'll run out of cash in about ${Math.max(1, Math.round(cash / (-wk.net / wk.w.length)))} weeks.`, ['recover', 'See the plan']); }
  // lineup coach
  if (S.phase === 'season' || S.phase === 'post') {
    const { n, c } = coachCount(mt), star = c.watch.find(w => w.start);
    if (isCustom(mt) && n) add(93, '⚾', star ? `${esc(P[star.id].name)} (${sOvr(star.id)}) should be starting` : `Your lineup needs ${n} fix${n > 1 ? 'es' : ''}`, `${c.gapWins >= 0.05 ? `You're leaving about ${c.gapWins.toFixed(1)} wins a season on the bench. ` : ''}${c.lu.slice(0, 2).map(x => `${esc(lastName(x.pid))} at ${x.pos}`).concat(c.rot.slice(0, 1).map(x => `${esc(lastName(x.pid))} to the rotation`)).join(', ')}${c.cl ? (c.lu.length || c.rot.length ? ', ' : '') + esc(lastName(c.cl.pid)) + ' closing' : ''}.`, ['coach-all', 'Use best lineup']);
    else { const w = c.watch.find(x => !x.start && sOvr(x.id) >= 70); if (w) add(30, '⚾', `${esc(P[w.id].name)} (${sOvr(w.id)}) is on your bench`, `${w.reason[0].toUpperCase() + w.reason.slice(1)} at ${w.pos}. Start him anyway, or shop him for help elsewhere.`, ['tab', 'Team', 'team']); }
  }
  // injuries in lineup / rotation
  const hurt = su.lineup.map(x => x[0]).concat(su.rotation).filter(id => injDays(id));
  if (hurt.length) add(70, '✚', `${hurt.length === 1 ? esc(P[hurt[0]].name) + ' is' : hurt.length + ' starters are'} on the injured list`, `${hurt.map(id => `${esc(P[id].name)} (${injDays(id)}d)`).join(', ')}. Healthy players fill in automatically.`, ['tab', 'Team', 'team']);
  // offseason
  if (S.phase === 'offseason') {
    const mine = freeAgents().filter(id => formerTeam(id) === mt).sort((a, b) => P[b].ovr - P[a].ovr);
    add(90, '✎', `Free agency, day ${Math.min(faDay() + 1, FA_DAYS)} of ${FA_DAYS}`, mine.length ? `${mine.length} of your players are on the market, led by ${esc(P[mine[0]].name)}. You get 10% off to bring them back.` : 'Sign players now, or make offers and wait for prices to drop.', ['market', 'Free agents']);
  }
  // expiring contracts late in the season
  if (S.phase === 'season' && S.day >= 100) {
    const ex = expiring(mt).filter(id => P[id].ovr >= 62);
    if (ex.length) add(60, '✎', `${ex.length} key contract${ex.length > 1 ? 's' : ''} ending`, `${ex.slice(0, 3).map(id => esc(P[id].name)).join(', ')} can walk after the season. Extend now or let them test the market.`, ['market', 'Extend']);
  }
  // prospects ready
  if (!auto.farm) {
    const diag = (anaCache && anaCache.mt === mt) ? anaCache.diag : null;
    const ready = farmOf(mt).filter(id => isReady(id));
    if (ready.length) add(55, '★', `${ready.length} prospect${ready.length > 1 ? 's are' : ' is'} ready`, `${ready.slice(0, 2).map(id => `${esc(P[id].name)} (${P[id].ovr})`).join(', ')} could help now.`, ['callup', 'Call up ' + esc(lastName(ready[0])), ready[0]]);
    void diag;
  }
  // business tip
  if (!auto.biz && (S.phase === 'season' || S.phase === 'offseason')) {
    const tip = businessAdvice(mt).list[0];
    if (tip) { bizAdviceCache = businessAdvice(mt).list; add(tip.act && tip.act.k === 'borrow' ? 94 : 40, '$', tip.title.replace(/<[^>]+>/g, ''), tip.body, tip.act ? ['bizapply', 'Do it', 0] : ['ov', 'Business', 'business']); }
  }
  // fan interest falling
  const ft = FO.fanTarget(W, S, mt, su), fc = fanOf(mt);
  if (S.phase === 'season' && fanScore(ft) < fanScore(fc) - 4) add(45, '♥', 'Fan interest is sliding', `Heading from ${fanScore(fc)} to ${fanScore(ft)}. Prices, losing and too many ads all hurt.`, ['ov', 'See why', 'business']);
  // trade idea (only once the season is underway)
  if (S.phase === 'season' && S.day >= 20) {
    const a = analysis(mt), x = a.ideas[0];
    if (x) add(35, '⇄', a.stance === 'sell' ? `Sell ${esc(P[x.give[0]].name)} while he has value` : `Upgrade ${POS_NAME[x.need] || 'your roster'}`, `${esc(TEAM[x.tid].city)} would send ${esc(P[x.target].name)} for ${x.give.map(id => esc(P[id].name)).join(' + ')}${x.cash ? ' plus ' + money(x.cash) : ''}. Their GM would say yes.`, ['loadidea', 'Set it up', 0]);
  }
  return cards.sort((a, b) => b.pri - a.pri);
}
function cardBtn(b) {
  if (!b) return '';
  const [act, label, v] = b;
  const attrs = act === 'ov' ? `data-act="ov" data-v="${v}" data-go="office"` : act === 'tab' ? `data-tab="${v}"` : act === 'paper' ? `data-act="paper" data-id="${v}"` : act === 'callup' ? `data-act="callup" data-p="${v}"` : act === 'bizapply' || act === 'loadidea' || act === 'watch' ? `data-act="${act}" data-i="${v}"` : `data-act="${act}"`;
  return `<button class="btn sm primary" type="button" ${attrs}>${label}</button>`;
}
function deskRace(mt) {
  const rows = raceTable().sort((a, b) => b.total - a.total);
  if (rows.length < 2) return '';
  const pj = raceProjections();
  return `<section class="card"><h2>GM Race<span class="sub">${S.phase === 'offseason' || S.phase === 'done' ? yearOf(seasonNo()) + ' final' : 'this season'}</span></h2><div class="list">${rows.slice(0, 8).map((r, i) => `<button class="item paperrow${r.tid === mt ? ' mine' : ''}" type="button" data-tab="race"><span class="slot">${i + 1}</span><div class="nm"><b>${esc(ownerName(r.owner))}</b> <span class="abbr">${esc(r.tid)}</span><span class="s">${S.std[r.tid][0]}-${S.std[r.tid][1]} · win ${Math.round(r.win)} · biz ${Math.round(r.biz)} · fans ${Math.round(r.fans)}</span></div><span class="num" style="text-align:right"><b style="font-size:18px">${Math.round(r.total)}</b><span class="small muted" style="display:block">proj ${Math.round((pj[r.tid] || r).proj || r.total)}</span></span></button>`).join('')}</div></section>`;
}
function viewDesk() {
  const mt = myTeam();
  if (!mt) {
    const h = leagueSwitcher() + (locked() ? `<section class="card"><h2>League is full</h2><div class="pad small">The commissioner has locked this league, so every club is spoken for. You can still follow along on the League tab.</div></section>`
      : `<section class="board"><div class="meta">Front office</div><div class="big">Pick your club</div><div class="small" style="color:var(--board-dim)">Every team without a GM is run by the computer. Claim one to set lineups, make trades and run the business.</div><div><button class="btn primary" data-act="claim-open" type="button">Choose a team</button></div></section>`);
    return h + viewOwners();
  }
  const t = TEAM[mt], s = S.std[mt];
  // scoreboard
  let next = '';
  if (S.phase === 'season' && W.sched[S.day]) {
    const g = W.sched[S.day].find(x => x[0] === mt || x[1] === mt);
    if (g) { const home = g[0] === mt, opp = home ? g[1] : g[0]; next = `<div class="nextup"><span class="meta">Next</span><span>${home ? 'vs' : 'at'} <b>${esc(TEAM[opp].city)}</b> (${rec(opp)})${rivalTag(mt, opp)}</span><span class="small" style="color:var(--board-dim)">${esc(P[probable(mt)].name)} vs ${esc(P[probable(opp)].name)}</span>${canSim() && !needsCall('sim') && !simming ? `<button class="btn sm primary" type="button" data-act="watchnext">▶ Play &amp; watch</button>` : ''}</div>`; }
  }
  const lg = lastGameOf(mt);
  const last = lg ? `<button class="lastg ${lg.win ? 'w' : 'l'}" type="button" data-act="box" data-i="${lg.i}"><span class="meta">Last game</span><b>${lg.win ? 'W' : 'L'} ${lg.my}-${lg.their}</b><span class="small">${lg.home ? 'vs' : 'at'} ${esc(lg.opp)}</span></button>` : '';
  const race = raceTable().sort((a, b) => b.total - a.total), ri = race.findIndex(r => r.tid === mt);
  const sc = gmScore(mt);
  let h = leagueSwitcher() + (isPreseason() ? viewPreseason(mt) : '') + `<section class="board desk"><div class="meta">${esc(t.city)} · ${yearOf(seasonNo())}</div>
    <div class="row wrap" style="align-items:flex-end;gap:14px"><div class="big num" style="font-family:var(--display)">${s[0]}-${s[1]}</div><div class="meta" style="padding-bottom:4px">${S.phase === 'offseason' ? 'Offseason' : esc(divPlace(mt))}${streakOf(mt) ? ' · ' + streakOf(mt) : ''}</div></div>
    <div class="deskrow">${last}<button class="lastg" type="button" data-tab="race"><span class="meta">GM Race</span><b>${Math.round(sc.total)} pts</b><span class="small">${race.length > 1 ? `#${ri + 1} of ${race.length}` : 'season score'}</span></button><button class="lastg" type="button" data-act="ov" data-v="business" data-go="office"><span class="meta">Cash</span><b>${money(cashOf(mt))}</b><span class="small">fans ${fanScore(fanOf(mt))}</span></button></div>${next}</section>`;
  h += voteCard();
  // to-do: the three most important up front, the rest one tap away
  const cards = deskCards(mt), dc = c => `<div class="dcard"><span class="dic" aria-hidden="true">${c.icon}</span><div class="nm"><b>${c.title}</b><span class="s">${c.body}</span></div>${cardBtn(c.btn)}</div>`;
  h += `<section class="card"><h2>On your desk<span class="sub">${cards.length ? cards.length + ' item' + (cards.length > 1 ? 's' : '') : 'all clear'}</span></h2>${cards.length ? `<div class="desklist">${cards.slice(0, 3).map(dc).join('')}</div>${cards.length > 3 ? `<details class="more"><summary class="pad small"><span class="lnk">${cards.length - 3} more</span></summary><div class="desklist">${cards.slice(3).map(dc).join('')}</div></details>` : ''}` : `<div class="empty">Nothing needs you right now. Hit <b>Play</b> and see what happens.</div>`}</section>`;
  h += startChecklist(mt);
  if (!notesNow().some(n => n.tab === 'desk')) h += awayCard(mt);
  if (lastRecap && lastRecap.tid === mt && !notesNow().some(n => n.tab === 'desk')) h += `<section class="card"><h2>Last stretch<span class="sub">${esc(lastRecap.label)}</span></h2><div class="pad small" style="padding-top:12px">${lastRecap.summary} <button class="lnk" type="button" data-act="recap">See the recap</button></div></section>`;
  h += deskRace(mt) + (isCommish() && multiGM() ? scheduleStrip() : '');
  h += `<section class="card"><details class="assist"><summary><h2 class="h2">Assistant GM<span class="sub">${assistantSummary(mt)}</span></h2></summary>${viewAssistant(mt).replace(/^<section class="card"><h2>[\s\S]*?<\/h2>/, '').replace(/<\/section>$/, '')}</details></section>`;
  if (!localGet('tour')) setTimeout(() => openTour(), 400);
  return h;
}

// ---------- Autopilot ----------
function autoOf(tid) { const a = (docs[tid] && docs[tid].auto) || {}; const d = docs[tid] || {}; return { lineup: !(d.lineup || d.rotation || d.closer != null), biz: !!a.biz, farm: !!a.farm }; }
function viewAssistant(mt) {
  const a = autoOf(mt);
  const sw = (k, title, body) => `<label class="sw"><span class="nm"><b>${title}</b><span class="s">${body}</span></span><input type="checkbox" role="switch" data-auto="${k}" ${a[k] ? 'checked' : ''}><i aria-hidden="true"></i></label>`;
  return `<section class="card"><h2>Your assistant GM<span class="sub">turn on what you'd rather not manage</span></h2><div class="pad" style="display:grid;gap:4px;padding-top:4px">
    ${sw('lineup', 'Lineup &amp; pitching staff', 'Picks the best healthy lineup, rotation and closer every day. Change anything on the Team tab to take over.')}
    ${sw('biz', 'Run the business', 'Tunes ticket, food and parking prices, promotions and the TV deal after each sim, builds projects that pay off fast, and handles the bank.')}
    ${sw('farm', 'Run the farm', 'Calls up prospects as soon as they are better than your current starter.')}</div></section>`;
}
async function setAuto(k, on) {
  const mt = myTeam(); if (!mt) return;
  if (k === 'lineup') {
    if (on) await teamWrite(mt, { lineup: undefined, rotation: undefined, closer: undefined });
    else { const su = setup(mt); await teamWrite(mt, { lineup: su.lineup.map(x => x.slice()), rotation: su.rotation.slice(), closer: su.closer == null ? undefined : su.closer }); }
    toast(on ? 'Your assistant sets the lineup and staff now.' : 'You set the lineup and staff now.');
    return;
  }
  const a = Object.assign({}, (docs[mt] && docs[mt].auto) || {}, { [k]: on });
  await teamWrite(mt, { auto: a });
  toast(on ? (k === 'biz' ? 'Your assistant runs the business now.' : 'Your assistant runs the farm now.') : 'You are back in charge of that.');
  if (on) runAutopilot(true);
}
let autoBusy = false;
async function runAutopilot(force) {
  const mt = myTeam(); if (!mt || autoBusy || !S || !(S.phase === 'season' || S.phase === 'offseason')) return;
  const a = autoOf(mt); if (!a.biz && !a.farm) return;
  const stamp = seasonNo() + ':' + S.phase + ':' + S.day + ':' + faDay();
  const d = docs[mt] || {};
  if (!force && d.auto && d.auto.stamp === stamp) return;
  autoBusy = true;
  const did = [];
  try {
    if (a.farm) {
      const diag = analysis(mt).diag;
      for (const id of farmOf(mt).filter(x => isReady(x) && !minorsOf(mt).includes(x))) {
        if (rosterOf(mt).length >= 26) break;
        const spot = diag.filter(x => fitsSpot(P[id], x.k)).sort((p, q) => p.mine - q.mine)[0];
        if (spot && P[id].ovr > spot.mine) { await callUp(id); did.push('called up ' + P[id].name); }
      }
    }
    if (a.biz) {
      const list = businessAdvice(mt).list, patch = {}, biz = bizDoc(mt);
      for (const x of list) {
        if (!x.act) continue;
        const { k, v } = x.act;
        if (k === 'price') { patch.price = v; did.push(`tickets $${v}`); }
        else if (k === 'conc' || k === 'park' || k === 'promo' || k === 'spon' || k === 'ads' || k === 'dev') { biz[k] = v; did.push(x.title.replace(/<[^>]+>/g, '').toLowerCase()); }
        else if (k === 'tv' && v !== 'advance') { await chooseTV(v); did.push(FO.TV[v].toLowerCase()); }
        else if (k === 'build' && cashOf(mt) >= FO.buildCost(v) * 2) { await buildProject(v); did.push('built ' + FO.BUILDS[v].name.toLowerCase()); }
        else if (k === 'repay') { await loanStep(-1); did.push('paid down the loan'); }
        else if (k === 'borrow') { await loanStep(1); did.push('borrowed to cover cash'); }
      }
      patch.biz = biz;
      patch.auto = Object.assign({}, (docs[mt] && docs[mt].auto) || {}, { stamp });
      await teamWrite(mt, patch);
    } else await teamWrite(mt, { auto: Object.assign({}, (docs[mt] && docs[mt].auto) || {}, { stamp }) });
  } finally { autoBusy = false; }
  if (did.length) { addNote('office', { icon: '🤝', title: 'Your assistant made moves', body: did.slice(0, 5).join(', ') + (did.length > 5 ? '…' : '') + '.' }); if (force) toast('Assistant: ' + did.slice(0, 3).join(', ') + (did.length > 3 ? '…' : '') + '.'); else if (tab === 'office') render(); else renderTabs(); }
  return did;
}


// ---------------- tab notifications ----------------
// News from each sim lands at the top of the tab it belongs to (no pop-ups). Tabs show a badge until visited.
const notesBy = {};
const noteKey = () => (league.kind || '') + ':' + (league.id || '') + ':' + (myTeam() || '');
const notesNow = () => (notesBy[noteKey()] = notesBy[noteKey()] || []);
let noteSeq = 0;
function addNote(t, n) { notesNow().push(Object.assign({ id: 'n' + (++noteSeq), tab: t, seen: tab === t && !simming }, n)); }
function clearSimNotes() { notesBy[noteKey()] = notesNow().filter(n => n.keep); }
function unseenNotes(t) { return notesNow().filter(n => n.tab === t && !n.seen).length; }
function markSeen(t) { notesNow().forEach(n => { if (n.tab === t) n.seen = true; }); }
function noteBtn(b) { return b ? cardBtn(b).replace('btn sm primary', 'btn sm ' + (b[3] || 'primary')) : ''; }
function notesHTML(t) {
  const list = notesNow().filter(n => n.tab === t);
  if (!list.length) return '';
  return `<section class="card notes" aria-label="Updates from your last sim"><h2>Since your last sim<span class="sub"><button class="lnk" type="button" data-act="note-clear" data-t="${t}">Clear</button></span></h2>${list.map(n => n.html
    ? `<div class="note big"><div class="nhead"><span class="dic" aria-hidden="true">${n.icon}</span><b>${n.title}</b><button class="nx" type="button" data-act="note-x" data-id="${n.id}" aria-label="Dismiss">✕</button></div>${n.html}${n.btn ? `<div class="pad row" style="padding-top:8px">${noteBtn(n.btn)}</div>` : ''}</div>`
    : `<div class="note ${n.tone ? 't-' + n.tone : ''}"><span class="dic" aria-hidden="true">${n.icon}</span><div class="nm"><b>${n.title}</b>${n.body ? `<span class="s">${n.body}</span>` : ''}</div><button class="nx" type="button" data-act="note-x" data-id="${n.id}" aria-label="Dismiss">✕</button>${n.btn ? `<div class="nbtn">${noteBtn(n.btn)}</div>` : ''}</div>`).join('')}</section>`;
}
// Build the notes after a sim
function simNotes(pre, fresh, days) {
  const mt = myTeam(); if (!mt || !pre) return;
  // Desk: the recap itself
  if (lastRecap && pre.games.length) { const wi = myGameIndex(mt); addNote('desk', { icon: '⚾', title: `${esc(lastRecap.label)}`, html: lastRecap.body, btn: wi >= 0 ? ['watch', '▶ Watch your last game', wi] : null }); }
  // League: newspapers
  for (const p of fresh) addNote('league', { icon: '📰', title: 'Extra! ' + esc(p.head), body: esc(p.sub || ''), btn: ['paper', 'Read it', p.id] });
  // Team: injuries, returns, lineup fixes, prospects
  const newInj = Object.keys(S.inj || {}).map(Number).filter(id => S.inj[id] > 0 && !(pre.inj[id] > 0) && rosterOf(mt).includes(id));
  for (const id of newInj) addNote('team', { icon: '✚', tone: 'bad', title: `${esc(P[id].name)} is hurt`, body: `Out about ${S.inj[id]} days. ${isCustom(mt) ? 'Check the lineup coach for the best fill-in.' : 'The best healthy player fills in automatically.'}` });
  const back = Object.keys(pre.inj || {}).map(Number).filter(id => pre.inj[id] > 0 && !(S.inj && S.inj[id] > 0) && rosterOf(mt).includes(id));
  for (const id of back) addNote('team', { icon: '✓', tone: 'good', title: `${esc(P[id].name)} is back from the injured list`, body: isCustom(mt) ? 'He is not in your lineup until you put him back.' : 'He is back in the lineup.' });
  if (S.phase === 'season' && isCustom(mt)) { const { n, c } = coachCount(mt); if (n) addNote('team', { icon: '⚾', tone: 'warn', title: `Lineup coach: ${n} fix${n > 1 ? 'es' : ''}`, body: c.gapWins >= 0.05 ? `Your lineup leaves about ${c.gapWins.toFixed(1)} wins a season on the bench.` : 'Your staff could be better.', btn: ['coach-all', 'Use best lineup'] }); }
  if (!autoOf(mt).farm) { const ready = farmOf(mt).filter(id => isReady(id)); const was = pre.ready || []; const nw = ready.filter(id => !was.includes(id)); if (nw.length) addNote('team', { icon: '★', title: `${esc(P[nw[0]].name)} (${P[nw[0]].ovr}) is ready for the majors`, body: nw.length > 1 ? `${nw.length - 1} more prospect${nw.length > 2 ? 's are' : ' is'} ready too.` : 'Your scouts say he can help now.', btn: ['callup', 'Call up', nw[0]] }); }
  // Office: money and fans
  const dCash = cashOf(mt) - pre.cash, dFan = fanScore(fanOf(mt)) - pre.fan;
  if (pre.games.length) addNote('office', { icon: '$', tone: dCash >= 0 ? 'good' : 'bad', title: `Cash ${dCash >= 0 ? 'up' : 'down'} ${money(Math.abs(dCash))}`, body: `Now ${money(cashOf(mt))}.${dFan ? ` Fan interest ${dFan > 0 ? 'up' : 'down'} ${Math.abs(dFan)} to ${fanScore(fanOf(mt))}.` : ''}${cashOf(mt) < 0 ? ' You are in the red.' : ''}`, btn: cashOf(mt) < 0 ? ['recover', 'Fix it'] : ['ov', 'Business', 'business', 'ghost'] });
  // GM Race
  const rows = raceTable().sort((a, b) => b.total - a.total), ri = rows.findIndex(r => r.tid === mt), dS = gmScore(mt).total - pre.score;
  if (pre.games.length && ri >= 0) addNote('race', { icon: '🏆', tone: dS >= 0 ? 'good' : '', title: `${dS >= 0 ? '+' : '−'}${Math.abs(dS).toFixed(1)} points · now ${Math.round(gmScore(mt).total)}`, body: rows.length > 1 ? `You're #${ri + 1} of ${rows.length}${pre.rank && pre.rank !== ri + 1 ? ` (was #${pre.rank})` : ''}.${ri > 0 ? ` ${Math.round(rows[ri - 1].total - rows[ri].total)} behind ${esc(ownerName(rows[ri - 1].owner))}.` : ''}` : '' });
  // League: awards when the season ends
  if (pre.phase === 'post' && S.phase === 'done') { try { addNote('league', { icon: '🏅', title: `The ${yearOf(seasonNo())} awards are in`, html: awardsHTML(seasonAwards()) }); } catch (e) { /* optional */ } }
  // GM Race: how you did against the other GMs
  const vs = {}; for (const g of pre.games) { const o = ownerOf(g.opp); if (o && o !== me.id) { const r = vs[g.opp] || (vs[g.opp] = [0, 0]); r[g.win ? 0 : 1]++; } }
  for (const [opp, r] of Object.entries(vs)) { const [w, l] = h2hOf(mt, opp); addNote('race', { icon: '⚔️', tone: r[0] > r[1] ? 'good' : r[0] < r[1] ? 'bad' : '', title: `You went ${r[0]}-${r[1]} against ${esc(ownerName(ownerOf(opp)))}`, body: `Season series ${w}-${l}. ${w > l ? 'Bragging rights are yours, for now.' : w < l ? 'Time to get even.' : 'Dead even.'}` }); }
  // Moves: trade deadline
  const dl = tradeDeadlineDay();
  if (dl && S.phase === 'season' && S.day < dl && dl - S.day <= 10) addNote('trade', { icon: '⏰', tone: 'warn', title: `Trade deadline in ${dl - S.day} game days`, body: `No trades after ${FO.dateOf(dl - 1)} until the offseason.` });
}

// ---------- Play bar ----------
const SPANS = [['game', 'Game'], ['series', 'Series'], ['week', 'Week'], ['month', 'Month'], ['rest', 'Rest of season']];
function spanDays(k) { const left = LEN() - (S ? S.day : 0); return Math.max(1, Math.min(left, k === 'game' ? 1 : k === 'series' ? seriesDays() : k === 'week' ? 7 : k === 'month' ? 30 : left)); }
function openSpanPicker() {
  const body = `<div class="list">${SPANS.map(([k, l]) => `<button class="item spanopt${simSpan === k ? ' on' : ''}" type="button" data-act="span" data-v="${k}"><div class="nm"><b>Play ${l.toLowerCase()}</b><span class="s">${spanDays(k)} day${spanDays(k) > 1 ? 's' : ''}${k === 'series' ? ' · finish this series' : ''}</span></div>${simSpan === k ? '<span class="tag mine">Default</span>' : ''}</button>`).join('')}</div><p class="pad small muted" style="padding-top:10px">Your pick becomes the Play button's default.</p>`;
  openModal('How far to play', body + (canMultiSim() ? `<div class="list"><button class="item spanopt" type="button" data-act="multiopen"><div class="nm"><b>Several seasons…</b><span class="s">Fast-forward years at a time. Solo leagues only.</span></div></button></div>` : ''));
}

// ---------- Recap ----------
function recapBefore(mt) {
  if (!mt || !S) return null;
  const ids = rosterOf(mt);
  const bat = {}, pit = {}; ids.forEach(id => { if (S.bat[id]) bat[id] = S.bat[id].slice(); if (S.pit[id]) pit[id] = S.pit[id].slice(); });
  return { tid: mt, std: S.std[mt].slice(), cash: cashOf(mt), score: gmScore(mt).total, fan: fanScore(fanOf(mt)), bat, pit, inj: Object.assign({}, S.inj || {}), day: S.day, phase: S.phase, games: [] };
}
function recapGame(pre, boxes) {
  if (!pre || !boxes) return;
  for (const g of boxes) {
    if (g.h !== pre.tid && g.a !== pre.tid) continue;
    const home = g.h === pre.tid, my = home ? g.hs : g.as, their = home ? g.as : g.hs;
    pre.games.push({ opp: home ? g.a : g.h, home, my, their, win: my > their });
  }
}
function buildRecap(pre, days) {
  const mt = pre.tid, s = S.std[mt], w = s[0] - pre.std[0], l = s[1] - pre.std[1];
  const label = pre.phase === 'post' ? 'Postseason' : days >= 60 ? 'Season recap' : days >= 25 ? 'Month recap' : days >= 5 ? 'Week recap' : days >= 2 ? 'Series recap' : 'Game recap';
  // hot hitter and pitcher
  let hb = null, hp = null;
  for (const id of rosterOf(mt)) {
    const a = S.bat[id], b0 = pre.bat[id] || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    if (a && P[id].t === 'H') { const ab = a[2] - (b0[2] || 0), hh = a[4] - (b0[4] || 0), hr = a[7] - (b0[7] || 0), rbi = a[8] - (b0[8] || 0); const sc = hh + 2 * hr + 0.5 * rbi; if (ab > 0 && (!hb || sc > hb.sc)) hb = { id, ab, hh, hr, rbi, sc }; }
    const q = S.pit[id], p0 = pre.pit[id] || [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    if (q) { const outs = q[5] - (p0[5] || 0), r = q[7] - (p0[7] || 0), so = q[9] - (p0[9] || 0), wn = q[2] - (p0[2] || 0), ls = q[3] - (p0[3] || 0), sv = q[4] - (p0[4] || 0); const sc = outs / 3 * 1.2 - r * 2 + so * 0.4 + sv * 2; if (outs > 0 && (!hp || sc > hp.sc)) hp = { id, outs, r, so, wn, ls, sv, sc }; }
  }
  const newInj = Object.keys(S.inj || {}).map(Number).filter(id => S.inj[id] > 0 && !(pre.inj[id] > 0) && rosterOf(mt).includes(id));
  const ms = S.news.filter(n => n[0] > pre.day && n[3] === mt && n[2] === 'milestone').slice(0, 3);
  const dCash = cashOf(mt) - pre.cash, dScore = gmScore(mt).total - pre.score, dFan = fanScore(fanOf(mt)) - pre.fan;
  const recW = w + '-' + l;
  const head = w + l === 0 ? 'No games played.' : w > l ? (l === 0 && w >= 3 ? 'A clean sweep!' : 'A winning stretch.') : w === l ? 'Treading water.' : (w === 0 && l >= 3 ? 'Rough going: swept.' : 'A losing stretch.');
  const games = pre.games.slice(-15);
  const more = pre.games.length > 15 ? `<span class="small muted">Last 15 of ${pre.games.length} games</span>` : '';
  const strip = games.length ? more + `<div class="gstrip">${games.map(g => `<span class="${g.win ? 'w' : 'l'}" title="${g.home ? 'vs' : 'at'} ${g.opp}">${g.win ? 'W' : 'L'}<small>${g.my}-${g.their}</small></span>`).join('')}</div>` : '';
  const sign = v => (v >= 0 ? '+' : '−');
  const body = `<div class="recap"><div class="rbig"><b class="num">${recW}</b><span>${head}</span></div>${strip}
    <div class="kv"><div><span>Record</span><b>${s[0]}-${s[1]}</b></div><div><span>Standing</span><b style="font:600 14px var(--body)">${S.phase === 'season' || pre.phase === 'season' ? esc(divPlace(mt)) : 'Postseason'}</b></div><div><span>Cash</span><b style="color:${dCash >= 0 ? 'var(--good)' : 'var(--bad)'}">${sign(dCash)}${money(Math.abs(dCash))}</b></div><div><span>GM Race</span><b>${Math.round(gmScore(mt).total)} pts${pre.std[0] + pre.std[1] ? `<small class="muted"> ${sign(dScore)}${Math.abs(dScore).toFixed(1)}</small>` : ''}</b></div></div>
    <ul class="rlist">${hb ? `<li><span class="tag gold">Hot bat</span> <button class="lnk" type="button" data-act="player" data-p="${hb.id}">${esc(P[hb.id].name)}</button>: ${hb.hh}-for-${hb.ab}${hb.hr ? `, ${hb.hr} HR` : ''}${hb.rbi ? `, ${hb.rbi} RBI` : ''}</li>` : ''}
    ${hp ? `<li><span class="tag gold">Arm</span> <button class="lnk" type="button" data-act="player" data-p="${hp.id}">${esc(P[hp.id].name)}</button>: ${ipStr(hp.outs)} IP, ${hp.r} R, ${hp.so} K${hp.wn ? `, ${hp.wn}-${hp.ls}` : ''}${hp.sv ? `, ${hp.sv} SV` : ''}</li>` : ''}
    ${newInj.map(id => `<li><span class="tag red">IL</span> ${esc(P[id].name)} is out about ${S.inj[id]} days.</li>`).join('')}
    ${ms.map(n => `<li><span class="tag">★</span> ${esc(n[1])}</li>`).join('')}
    ${dFan ? `<li>Fan interest ${dFan > 0 ? 'up' : 'down'} ${Math.abs(dFan)} to ${fanScore(fanOf(mt))}.</li>` : ''}</ul></div>`;
  const n = pre.games.length;
  const summary = `${recW} over ${n} game${n === 1 ? '' : 's'}, now ${s[0]}-${s[1]}. Cash ${sign(dCash)}${money(Math.abs(dCash))}, GM Race ${Math.round(gmScore(mt).total)} pts.`;
  return { tid: mt, label, body, summary, days };
}
function showRecap() {
  if (!lastRecap) return;
  const again = S.phase === 'season' ? `<button class="btn primary" type="button" data-act="play">▶ Play ${SPANS.find(x => x[0] === simSpan)[1].toLowerCase()}</button>` : S.phase === 'post' ? '<button class="btn primary" type="button" data-act="sim" data-n="1">Next games</button>' : '';
  openModal(lastRecap.label, lastRecap.body + `<div class="pad row wrap" style="padding-top:12px">${again}<button class="btn" type="button" data-act="close">Done</button></div>`);
}

// ---------------- The Dugout Dispatch: newspaper front pages ----------------
// Editions are created during sims for big moments and saved in the shared league state (S.papers).
const PAPER = 'The Dugout Dispatch';
const MONTHS = ['April', 'May', 'June', 'July', 'August', 'September'];
function teamLeaders(tid) {
  const ids = rosterOf(tid);
  const bat = ids.filter(id => S.bat[id] && S.bat[id][2] >= 60);
  const hr = bat.slice().sort((a, b) => S.bat[b][7] - S.bat[a][7])[0];
  const avg = bat.filter(id => S.bat[id][2] >= 150).sort((a, b) => S.bat[b][4] / S.bat[b][2] - S.bat[a][4] / S.bat[a][2])[0];
  const pit = ids.filter(id => S.pit[id] && S.pit[id][5] >= 90);
  const ace = pit.slice().sort((a, b) => (S.pit[b][2] - S.pit[a][2]) || (S.pit[a][7] / S.pit[a][5] - S.pit[b][7] / S.pit[b][5]))[0];
  const line = id => { const a = S.bat[id]; return `${P[id].name} (${fmt3(a[4] / a[2])}, ${a[7]} HR, ${a[8]} RBI)`; };
  const pline = id => { const a = S.pit[id]; return `${P[id].name} (${a[2]}-${a[3]}, ${(a[7] * 27 / a[5]).toFixed(2)} ERA, ${a[9]} K)`; };
  return { hr: hr != null ? line(hr) : null, avg: avg != null && avg !== hr ? line(avg) : null, ace: ace != null ? pline(ace) : null, hrId: hr, aceId: ace };
}
function divTable(tid) {
  const rows = FO.standings(S)[TEAM[tid].lg + ' ' + TEAM[tid].div];
  return rows.map(r => [r.id, r.w, r.l, r.gb]);
}
function seriesPath(tid) {
  if (!S.post) return [];
  const out = [];
  for (const r of S.post.rounds) for (const se of r.series || []) {
    if (se.hi !== tid && se.lo !== tid) continue;
    const mine = se.hi === tid ? 0 : 1, opp = se.hi === tid ? se.lo : se.hi;
    out.push(`${r.name}: ${se.w[mine] > se.w[1 - mine] ? 'beat' : 'lost to'} ${opp} ${se.w[mine]}-${se.w[1 - mine]}`);
  }
  return out;
}
function newPaper(kind, tid, f) {
  const s = tid ? S.std[tid] : null;
  return Object.assign({ id: 'p' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), kind, tid, season: seasonNo(), year: yearOf(seasonNo()), day: S.day, owner: tid ? ownerOf(tid) : null, rec: s ? [s[0], s[1]] : null, lead: tid ? teamLeaders(tid) : null, briefs: paperBriefs(tid) }, f);
}
// "Around the league": a few short items from the wire for the side column
function paperBriefs(tid) {
  const out = [];
  const keys = new Set();
  for (const n of (S && S.news) || []) {
    if (n[2] === 'injury' || (tid && n[3] === tid)) continue;
    const lo = n[1].toLowerCase(), k = /world series/.test(lo) ? 'ws' : /pennant/.test(lo) ? 'pen' : lo.replace(/[^a-z ]/g, '').split(' ').filter(w => w.length > 3).slice(0, 4).sort().join(' ');
    if (keys.has(k) || out.includes(n[1])) continue; keys.add(k); out.push(n[1]); if (out.length >= 4) break;
  }
  return out;
}
// compare the league before and after a sim and write editions for the big moments
function makePapers(pre) {
  if (!pre) return [];
  const out = [], humans = TEAMS.filter(t => ownerOf(t.id)).map(t => t.id);
  const W2 = (tid) => S.std[tid];
  // World Series set: pennant winners
  const hasWS = S.post && S.post.rounds.some(r => r.name === 'World Series');
  if (hasWS && !pre.ws) {
    const ws = S.post.rounds.find(r => r.name === 'World Series').series[0];
    for (const t of [ws.hi, ws.lo]) {
      const opp = t === ws.hi ? ws.lo : ws.hi;
      if (humans.includes(t)) out.push(newPaper('pennant', t, { head: 'PENNANT!', sub: `${TEAM[t].city} win the ${TEAM[t].lg} crown and head to the World Series against ${TEAM[opp].city}`, opp, path: seriesPath(t) }));
    }
    if (!humans.includes(ws.hi) && !humans.includes(ws.lo)) out.push(newPaper('wsset', ws.hi, { head: 'FALL CLASSIC SET', sub: `${TEAM[ws.hi].city} and ${TEAM[ws.lo].city} meet in the World Series`, opp: ws.lo, owner: null }));
  }
  // World Series champion
  if (S.post && S.post.champ && !pre.champ) {
    const c = S.post.champ, ws = S.post.rounds[S.post.rounds.length - 1].series[0], opp = ws.hi === c ? ws.lo : ws.hi, mine = ws.hi === c ? 0 : 1;
    out.push(newPaper('champ', c, { head: 'CHAMPIONS!', sub: `${TEAM[c].city} win the ${yearOf(seasonNo())} World Series, ${ws.w[mine]} games to ${ws.w[1 - mine]} over ${TEAM[opp].city}`, opp, path: seriesPath(c) }));
  }
  // end of the regular season: clinched or not
  if (pre.phase === 'season' && S.phase !== 'season') {
    for (const t of humans) {
      const pr = postResult(t, S.post), s = W2(t);
      if (pr.inPO) out.push(newPaper('clinch', t, { head: 'POSTSEASON BOUND', sub: `${TEAM[t].city} finish ${s[0]}-${s[1]} and punch their ticket to October`, place: divPlace(t), table: divTable(t) }));
      else out.push(newPaper('missed', t, { head: 'WAIT TILL NEXT YEAR', sub: `${TEAM[t].city} finish ${s[0]}-${s[1]}, ${divPlace(t)}`, place: divPlace(t), table: divTable(t) }));
    }
  }
  if (S.phase === 'season') {
    for (const t of humans) {
      // winning streak of 8+, once per streak
      const r = (S.res && S.res[t]) || '', m = r.match(/W+$/), n = m ? m[0].length : 0;
      const before = pre.streak[t] || 0;
      if (n >= 8 && before < 8) out.push(newPaper('streak', t, { head: `${n} STRAIGHT!`, sub: `${TEAM[t].city} win ${n} in a row and improve to ${W2(t)[0]}-${W2(t)[1]}`, n, place: divPlace(t) }));
      // big milestone
      const big = S.news.filter(x => x[0] > pre.day && x[3] === t && x[2] === 'milestone').map(x => ({ x, m: x[1].match(/^(.*) \((\w+)\) reached (\d+) (.+)\.$/) })).filter(o => o.m && (({ 'home runs': 40, hits: 200, 'stolen bases': 60, RBIs: 130, wins: 20, saves: 40, strikeouts: 250 })[o.m[4]] || 999) <= +o.m[3]);
      if (big.length) { const o = big[0], nm = o.m[1]; out.push(newPaper('milestone', t, { head: `${nm.split(' ').slice(-1)[0].toUpperCase()} REACHES ${o.m[3]}`, sub: `${nm} becomes the first ${TEAM[t].city} player this season to reach ${o.m[3]} ${o.m[4]}`, star: nm, stat: o.m[3] + ' ' + o.m[4] })); }
      // monthly report on the 30-day marks
      const mk = [30, 60, 90, 120, 150].find(d => pre.day < d && S.day >= d);
      if (mk && !out.some(p => p.tid === t)) {
        const s = W2(t), place = divPlace(t), first = place.startsWith('1st');
        out.push(newPaper('month', t, { head: first ? `${TEAM[t].city.toUpperCase().replace(/ \(.+\)/, '')} ON TOP` : s[0] >= s[1] ? 'IN THE HUNT' : 'GROWING PAINS', sub: `${MONTHS[mk / 30 - 1]} report: ${TEAM[t].city} stand ${s[0]}-${s[1]}, ${place}`, month: MONTHS[mk / 30 - 1], place, table: divTable(t) }));
      }
    }
  }
  return out;
}
// ---- drawing ----
function paperArt(kind, tid) {
  const ab = esc(tid || '');
  const ink = '#1b1a17';
  const frame = inner => `<svg viewBox="0 0 200 140" class="part" role="img" aria-label="Illustration"><defs><pattern id="ht" width="4" height="4" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="0.9" fill="${ink}" opacity=".35"/></pattern></defs><rect width="200" height="140" fill="url(#ht)"/>${inner}</svg>`;
  if (kind === 'champ') return frame(`<g fill="#fffaf0" stroke="${ink}" stroke-width="3"><path d="M70 30h60v18c0 22-14 36-30 36S70 70 70 48z"/><path d="M70 38H54c0 16 8 24 18 26M130 38h16c0 16-8 24-18 26" fill="none"/><path d="M92 84h16v14H92z"/><path d="M78 98h44v10H78z"/></g><text x="100" y="62" text-anchor="middle" font-family="serif" font-weight="900" font-size="18" fill="${ink}">${ab}</text><g fill="${ink}"><circle cx="40" cy="28" r="3"/><circle cx="160" cy="24" r="2.5"/><circle cx="150" cy="110" r="3"/><circle cx="34" cy="104" r="2"/></g>`);
  if (kind === 'pennant' || kind === 'wsset') return frame(`<path d="M50 20v104" stroke="${ink}" stroke-width="4"/><path d="M52 24l110 26-110 26z" fill="#fffaf0" stroke="${ink}" stroke-width="3"/><text x="88" y="56" text-anchor="middle" font-family="serif" font-weight="900" font-size="20" fill="${ink}">${ab}</text>`);
  if (kind === 'clinch') return frame(`<g stroke="${ink}" stroke-width="7" stroke-linecap="round"><path d="M60 118L140 26"/><path d="M140 118L60 26"/></g><circle cx="100" cy="70" r="22" fill="#fffaf0" stroke="${ink}" stroke-width="3"/><path d="M86 56c8 6 8 22 0 28M114 56c-8 6-8 22 0 28" fill="none" stroke="${ink}" stroke-width="2"/>`);
  if (kind === 'missed') return frame(`<g fill="#fffaf0" stroke="${ink}" stroke-width="2.5">${[0, 1, 2, 3].map(r => [0, 1, 2, 3, 4, 5].map(c => `<rect x="${26 + c * 26}" y="${34 + r * 22}" width="20" height="14" rx="3"/>`).join('')).join('')}</g><path d="M30 26c20-14 120-14 140 0" fill="none" stroke="${ink}" stroke-width="3"/>`);
  if (kind === 'hof') return frame(`<g fill="#fffaf0" stroke="${ink}" stroke-width="3"><path d="M40 52h120L100 22z"/><rect x="48" y="52" width="104" height="8"/><rect x="56" y="62" width="12" height="44"/><rect x="82" y="62" width="12" height="44"/><rect x="108" y="62" width="12" height="44"/><rect x="134" y="62" width="12" height="44"/><rect x="42" y="106" width="116" height="10"/></g>`);
  if (kind === 'retire') return frame(`<g fill="#fffaf0" stroke="${ink}" stroke-width="3"><path d="M52 84c0-26 20-42 48-42s48 16 48 42z"/><path d="M40 84h128c0 8-6 12-14 12H54c-8 0-14-4-14-12z"/></g><path d="M100 42v42" stroke="${ink}" stroke-width="2"/><text x="100" y="124" text-anchor="middle" font-family="serif" font-style="italic" font-size="14" fill="${ink}">thanks for the memories</text>`);
  if (kind === 'month') return frame(`<g fill="#fffaf0" stroke="${ink}" stroke-width="3"><rect x="40" y="70" width="22" height="46"/><rect x="74" y="50" width="22" height="66"/><rect x="108" y="36" width="22" height="80"/><rect x="142" y="22" width="22" height="94"/></g><path d="M30 118h150" stroke="${ink}" stroke-width="3"/>`);
  return frame(`<circle cx="100" cy="70" r="44" fill="#fffaf0" stroke="${ink}" stroke-width="3"/><path d="M74 36c14 18 14 50 0 68M126 36c-14 18-14 50 0 68" fill="none" stroke="#b3261e" stroke-width="2.5" stroke-dasharray="4 3"/>`);
}
function paperBody(p) {
  const city = TEAM[p.tid] ? TEAM[p.tid].city : '';
  const gm = p.owner ? ownerName(p.owner) : null, L = p.lead || {};
  const rec = p.rec ? `${p.rec[0]}-${p.rec[1]}` : '';
  const leaders = [L.hr ? `${L.hr} carried the lineup` : null, L.avg ? `${L.avg} set the table` : null, L.ace ? `${L.ace} anchored the staff` : null].filter(Boolean);
  const lp = leaders.length ? `${leaders.join(', ')}.` : '';
  const isMe = p.owner && p.owner === me.id, gmName = isMe ? (me.name || '') : gm;
  const verb = p.kind === 'missed' ? 'faces a long winter of decisions' : p.kind === 'month' ? 'is keeping a close eye on the standings' : 'is taking a well-earned bow';
  const gmLine = gm ? `In the front office, ${gmName && gmName !== 'You' ? 'general manager ' + esc(gmName) : 'the general manager'} ${verb}.` : '';
  const oc = TEAM[p.opp] ? TEAM[p.opp].city : 'their opponent', tc = TEAM[p.tid] ? TEAM[p.tid].city : '', lg = TEAM[p.tid] ? TEAM[p.tid].lg : '';
  const P1 = ({
    champ: () => `${city} are champions of baseball. The club closed out ${oc} to finish a ${rec} season with a parade-worthy October run.`,
    pennant: () => `${city} are going to the World Series. The ${rec} club won the ${lg} pennant and now meets ${oc} with a title on the line.`,
    wsset: () => `It's ${tc} against ${oc} for all the marbles, and the whole league will be watching.`,
    clinch: () => `Pop the champagne: ${city} are headed to the postseason after a ${rec} regular season, ${esc(p.place || '')}.`,
    missed: () => `The season is over for ${city}. A ${rec} record, ${esc(p.place || '')}, wasn't enough for October.`,
    streak: () => `${city} can't lose. The club has won ${p.n} straight, climbing to ${rec}, ${esc(p.place || '')}.`,
    milestone: () => `${esc(p.star || '')} reached ${esc(p.stat || '')} for ${city}, the kind of season fans will talk about for years.`,
    month: () => `${esc(p.month || '')} is in the books, and ${city} stand ${rec}, ${esc(p.place || '')}.`,
    hof: () => (p.hof || []).length > 1 ? `Cooperstown welcomes ${p.hof.length} new members this winter: ${esc(p.hof.map(h => h[0]).join(', '))}. Each made the kind of mark on the game that earns a bronze plaque.` : `${esc((p.hof || [['']])[0][0])} is a Hall of Famer. The voters made it official this winter, and the plaque is already being cast.`,
    retire: () => `${esc(p.star || '')} is calling it a career.${p.line ? ` In this league alone: ${esc(p.line)}.` : ''} The clubhouse won't be the same.`,
  }[p.kind] || (() => ''))();
  return `<p class="lede">${P1}</p>${lp ? `<p>${esc(lp)}</p>` : ''}${gmLine ? `<p>${gmLine}</p>` : ''}`;
}
function paperHTML(p) {
  const city = TEAM[p.tid] ? TEAM[p.tid].city : '';
  const brief = (p.briefs || []).length ? `<div class="pbox"><b>Around the league</b>${p.briefs.map(x => `<div>${esc(x)}</div>`).join('')}</div>` : '';
  const side0 = p.hof ? `<div class="pbox"><b>The class</b>${p.hof.map(h => `<div>${esc(h[0])} · ${esc(h[1])} · peak ${h[2]}</div>`).join('')}</div>` : p.kind === 'retire' && (p.others || []).length ? `<div class="pbox"><b>Also retiring</b>${p.others.map(x => `<div>${esc(x)}</div>`).join('')}</div>` : '';
  const side = side0 ? side0 : p.path && p.path.length ? `<div class="pbox"><b>Road to the title</b>${p.path.map(x => `<div>${esc(x)}</div>`).join('')}</div>`
    : p.table ? `<div class="pbox"><b>${esc(TEAM[p.tid].lg + ' ' + TEAM[p.tid].div)}</b><table>${p.table.map(([id, w, l, gb]) => `<tr class="${id === p.tid ? 'us' : ''}"><td>${esc(id)}</td><td>${w}-${l}</td><td>${gb ? gb.toFixed(1) : '—'}</td></tr>`).join('')}</table></div>`
      : p.lead && (p.lead.hr || p.lead.ace) ? `<div class="pbox"><b>By the numbers</b>${p.rec ? `<div>Record: ${p.rec[0]}-${p.rec[1]}</div>` : ''}${p.lead.hr ? `<div>${esc(p.lead.hr)}</div>` : ''}${p.lead.ace ? `<div>${esc(p.lead.ace)}</div>` : ''}</div>` : '';
  const date = p.kind === 'month' ? `${p.month} ${p.year}` : p.day > 0 && p.day <= LEN() ? FO.dateOf(Math.min(161, p.day - 1)) + ', ' + p.year : 'October ' + p.year;
  return `<article class="paper"><header class="mast"><div class="mtop"><span>${esc(city ? city + ' edition' : 'League edition')}</span><span>${esc(date)}</span><span>Season ${p.season}</span></div><h1>${PAPER}</h1><div class="mrule"></div></header>
    <h2 class="hl">${esc(p.head)}</h2><div class="dek">${esc(p.sub)}</div>
    <div class="pcols"><figure>${paperArt(p.kind, p.tid)}<figcaption>${esc(p.kind === 'champ' ? 'The trophy heads home.' : p.kind === 'missed' ? 'Empty seats at the ballpark.' : p.kind === 'month' ? 'Climbing the standings.' : p.kind === 'pennant' || p.kind === 'wsset' ? 'Flying the flag.' : p.kind === 'hof' ? 'The hall in Cooperstown.' : p.kind === 'retire' ? 'Hanging up the cap.' : 'Dispatch staff illustration.')}</figcaption></figure>
    <div class="ptext">${paperBody(p)}${side}${brief}</div></div>
    <footer class="pfoot">${PAPER} · fictional league coverage · ${p.year}</footer></article>`;
}
function openPaper(id) {
  const p = (S.papers || []).find(x => x.id === id); if (!p) return;
  const more = pendingPapers.filter(x => x !== id);
  const btns = more.length ? `<button class="btn primary" type="button" data-act="paper" data-id="${more[0]}">Next edition</button>` : lastRecap && lastRecap.fresh ? `<button class="btn primary" type="button" data-act="recap">Continue to recap</button>` : '';
  pendingPapers = more; markPaperSeen(p.id);
  openModal('Extra! Extra!', `<div class="pwrap">${paperHTML(p)}</div><div class="pad row wrap" style="padding-top:12px">${btns}<button class="btn" type="button" data-act="close">Close</button></div>`);
}
let pendingPapers = [];
function viewPapers() {
  const ps = (S.papers || []).slice().reverse();
  if (!ps.length) return `<section class="card"><h2>${PAPER}</h2><div class="empty">The presses are quiet. Big moments, like a pennant, a title, a long streak or a monthly report, make the front page.</div></section>`;
  const mt = myTeam();
  return `<section class="card"><h2>${PAPER}<span class="sub">${ps.length} edition${ps.length > 1 ? 's' : ''}</span></h2><div class="list">${ps.slice(0, 30).map(p => `<button class="item paperrow${p.tid === mt ? ' mine' : ''}" type="button" data-act="paper" data-id="${p.id}"><span class="abbr" style="width:38px">${esc(p.tid || '')}</span><div class="nm"><b>${esc(p.head)}</b><span class="s">${esc(p.sub)} · ${p.year}</span></div><span class="small muted">Read</span></button>`).join('')}</div></section>`;
}

function seenKey() { return 'fo-paper-' + (typeof league !== 'undefined' ? league.kind + ':' + league.id : 'local'); }
function markPaperSeen(id) { try { localStorage.setItem(seenKey(), id); } catch (e) { /* ignore */ } }
function unseenPaper(mt) {
  const ps = (S && S.papers) || []; if (!ps.length) return null;
  let seen = null; try { seen = localStorage.getItem(seenKey()); } catch (e) { /* ignore */ }
  const idx = seen ? ps.findIndex(p => p.id === seen) : -1;
  const fresh = ps.slice(idx + 1).filter(p => p.tid === mt || p.kind === 'champ' || p.kind === 'wsset' || p.kind === 'hof' || p.kind === 'retire');
  return fresh.length ? fresh[fresh.length - 1] : null;
}

// ---------------- League clock: scheduled updates that run whenever anyone opens the app ----------------
// meta.auto = { on, every (hours), games (per update), start (ms of first update), done (updates run), pause (stop after the World Series) }
// meta.rules = { deadline: game day after which trades are closed, or null }
const CLOCK_PRESETS = {
  month: { label: 'Season in about a month', every: 24, games: 7, note: '7 games every day. About 24 days of regular season, then a playoff round a day and a week of free agency.' },
  twoweeks: { label: 'Season in about two weeks', every: 24, games: 12, note: '12 games every day. Fast and frantic.' },
  twice: { label: 'Twice a day', every: 12, games: 4, note: '4 games every 12 hours. A season in about 3 weeks, with more chances to react.' },
  weekly: { label: 'Weekly game night', every: 168, games: 30, note: 'A month of games once a week. Great if you get together on the same night.' },
};
let clockBusy = false, clockTimer = null;
const autoOn = () => !!(meta && meta.auto && meta.auto.on);
function clockInterval() { return (meta.auto.every || 24) * 3600e3; }
// update k happens at start + k intervals; whole-day intervals follow the local clock across daylight saving changes
function slotTime(k) {
  const a = meta.auto, ev = a.every || 24;
  if (ev % 24 === 0) { const d = new Date(a.start); d.setDate(d.getDate() + k * ev / 24); return d.getTime(); }
  return a.start + k * ev * 3600e3;
}
function dueUpdates(now) {
  const a = meta.auto; if (!a || !a.on || !a.start) return 0;
  const t = now || Date.now(); if (t < a.start) return 0;
  let k = Math.max(0, Math.floor((t - a.start) / clockInterval()) - 1);
  while (slotTime(k + 1) <= t) k++;
  return k + 1;
}
function nextUpdateAt() { const a = meta.auto; if (!a || !a.on) return null; const k = Math.max(a.done || 0, dueUpdates()); return slotTime(k); }
function whenText(ts) {
  const d = new Date(ts), now = new Date();
  const day = d.toDateString() === now.toDateString() ? 'Today' : new Date(now.getTime() + 864e5).toDateString() === d.toDateString() ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  return `${day} at ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;
}
function nextUpdateLabel() {
  if (!S) return '';
  if (S.phase === 'season') return `${Math.min(meta.auto.games, LEN() - S.day)} games`;
  if (S.phase === 'post') return 'the next playoff round';
  if (S.phase === 'done') return 'free agency opens';
  if (S.phase === 'offseason') return faDay() < FA_DAYS ? `free agency day ${faDay() + 1}` : (meta.auto.pause ? 'free agency closes (league pauses)' : 'free agency closes, new season starts');
  return '';
}
// one scheduled update
async function runOneUpdate() {
  const a = meta.auto;
  if (S.phase === 'season') { await sim(Math.max(1, Math.min(a.games || 7, LEN() - S.day)), { auto: true }); return; }
  if (S.phase === 'post') {
    const r0 = S.post ? S.post.rounds.length : 0;
    for (let i = 0; i < 12 && S.phase === 'post'; i++) { await sim(1, { auto: true }); if (S.post && (S.post.rounds.length !== r0 || S.post.champ)) break; }
    return;
  }
  if (S.phase === 'done') { await openOffseason({ auto: true }); return; }
  if (S.phase === 'offseason') {
    if (faDay() < FA_DAYS) await marketDay(false, { auto: true });
    else { const pause = !!a.pause; await marketDay(true, { auto: true }); if (pause) { meta = Object.assign({}, meta, { auto: Object.assign({}, meta.auto, { on: false }) }); await writeDoc('league/meta', meta); toast('The season is complete. The league clock is paused until the commissioner restarts it.'); } }
  }
}
async function clockTick() {
  if (clockBusy || simming || busy || !meta || !S || !autoOn() || !me.canWrite) return;
  if ((meta.auto.done || 0) >= dueUpdates()) return;
  clockBusy = true;
  let ran = 0;
  try {
    if (mode === 'shared') {
      const lease = await dref('league/clock').acquire({ holder: me.id, ttlMs: 180000 });
      if (!lease.acquired) return;
      const fm = await dref('league/meta').get(); if (fm.exists) meta = clone(fm.data());
      const fs = await dref('league/state').get(); if (fs.exists) S = clone(fs.data());
      invalidate();
    }
    while (autoOn() && (meta.auto.done || 0) < dueUpdates() && ran < 60) {
      const before = (meta.auto.done || 0);
      await runOneUpdate();
      meta = Object.assign({}, meta, { auto: Object.assign({}, meta.auto, { done: before + 1 }) });
      if (mode === 'local') saveLocal(); else await writeDoc('league/meta', meta);
      ran++;
    }
  } catch (e) { /* try again on the next tick */ } finally { clockBusy = false; }
  if (ran) { render(); toast(`League clock: ${ran} update${ran > 1 ? 's' : ''} played.`); }
}
function startClock() { if (clockTimer) return; clockTimer = setInterval(() => { clockTick(); }, 60000); }
// commissioner settings
function openSchedule() {
  if (!isCommish()) return;
  const a = (meta && meta.auto) || {}, r = (meta && meta.rules) || {};
  const preset = Object.keys(CLOCK_PRESETS).find(k => CLOCK_PRESETS[k].every === a.every && CLOCK_PRESETS[k].games === a.games) || (a.every ? 'custom' : 'month');
  const hour = a.start ? new Date(a.start).getHours() : 20;
  const opt = (v, l, cur) => `<option value="${v}" ${String(v) === String(cur) ? 'selected' : ''}>${l}</option>`;
  const hours = Array.from({ length: 24 }, (_, h) => opt(h, new Date(2000, 0, 1, h).toLocaleTimeString(undefined, { hour: 'numeric' }), hour)).join('');
  const dl = [['', 'No deadline']].concat([['Jul', 31, 'July 31'], ['Aug', 15, 'August 15'], ['Aug', 31, 'August 31']].map(([m, d, l]) => [gameDayOn(m, d), l]));
  openModal('League schedule', `<div class="pad" style="padding-top:12px;display:grid;gap:12px">
    <p class="small" style="margin:0">The league plays on its own schedule. Whenever anyone in the league opens the app, it catches up to where the clock says it should be, so nobody has to remember to hit Play. Everyone can still trade, sign players and set lineups between updates.</p>
    <label class="sw"><span class="nm"><b>Run the league on a schedule</b><span class="s">${a.on ? 'On. ' + (nextUpdateAt() ? 'Next update ' + whenText(nextUpdateAt()) + '.' : '') : 'Off. You play it by hand.'}</span></span><input type="checkbox" role="switch" id="clkOn" ${a.on ? 'checked' : ''}><i aria-hidden="true"></i></label>
    <label class="small muted" for="clkPreset">Pace</label><select id="clkPreset">${Object.entries(CLOCK_PRESETS).map(([k, x]) => opt(k, x.label, preset)).join('')}${opt('custom', 'Custom', preset)}</select>
    <div id="clkNote" class="small muted">${(CLOCK_PRESETS[preset] || { note: '' }).note}</div>
    <div class="row wrap" id="clkCustom" ${preset === 'custom' ? '' : 'hidden'}><label class="small" style="flex:1;min-width:140px">Every<select id="clkEvery" style="width:100%">${[[6, '6 hours'], [12, '12 hours'], [24, 'day'], [48, '2 days'], [72, '3 days'], [168, 'week']].map(([v, l]) => opt(v, l, a.every || 24)).join('')}</select></label><label class="small" style="flex:1;min-width:140px">Games each time<select id="clkGames" style="width:100%">${[1, 3, 5, 7, 10, 14, 30].map(v => opt(v, v + (v === 1 ? ' game' : ' games'), a.games || 7)).join('')}</select></label></div>
    <label class="small muted" for="clkHour">Update time (your time zone)</label><select id="clkHour">${hours}</select>
    <label class="small muted" for="clkDl">Trade deadline</label><select id="clkDl">${dl.map(([v, l]) => opt(v, l, r.deadline || '')).join('')}</select>
    <label class="small muted" for="clkLen">Season length</label><select id="clkLen">${SEASON_LENS.map(([v, l]) => opt(v, l, (meta && meta.len) || 162)).join('')}</select>
    <div class="small muted" style="margin-top:-6px">${S && S.phase === 'season' && S.day === 0 ? 'Changes this season too, since it has not started.' : 'Takes effect next season.'} Shorter seasons keep friends leagues moving: playoffs, money and the GM Race all scale.</div>
    <label class="small muted" for="clkDraft">Draft night: time per pick</label><select id="clkDraft">${DRAFT_CLOCKS.map(([v, l]) => opt(v, l, draftClock())).join('')}</select>
    <label class="small muted" for="clkNotice">Ready check before a manual sim</label><select id="clkNotice">${NOTICE.map(([v, l]) => opt(v, v ? 'Wait for everyone, at most ' + l : l, noticeMin())).join('')}</select>
    ${charterLocked() ? '<div class="small warn">The season has started, so these rules are locked. Saving posts a league vote instead.</div>' : ''}
    <label class="sw"><span class="nm"><b>Pause after the World Series</b><span class="s">Off: free agency runs and the next season starts automatically.</span></span><input type="checkbox" role="switch" id="clkPause" ${a.pause ? 'checked' : ''}><i aria-hidden="true"></i></label>
    <div class="row wrap"><button class="btn primary" type="button" data-act="saveclock">Save schedule</button></div></div>`);
}
async function saveSchedule() {
  if (!isCommish()) return;
  const on = $('#clkOn').checked, preset = $('#clkPreset').value;
  const p = CLOCK_PRESETS[preset];
  const every = p ? p.every : +$('#clkEvery').value, games = p ? p.games : +$('#clkGames').value;
  const hour = +$('#clkHour').value, dl = $('#clkDl').value;
  const old = (meta && meta.auto) || {};
  let start = old.start, done = old.done || 0;
  const changed = !old.on || old.every !== every || new Date(old.start || 0).getHours() !== hour;
  if (on && changed) { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(hour); if (d.getTime() <= Date.now()) d.setTime(d.getTime() + 864e5); start = d.getTime(); done = 0; }
  const nLen = +$('#clkLen').value;
  const nAuto = { on, every, games, start, done, pause: $('#clkPause').checked }, nRules = Object.assign({}, meta.rules || {}, { deadline: dl ? +dl : null, notice: +$('#clkNotice').value, draftClock: +$('#clkDraft').value });
  if (charterLocked()) { closeModal(); await proposeVote('rule', { meta: { auto: nAuto, rules: nRules, len: nLen } }, `change the league rules: ${on ? 'schedule ' + ((CLOCK_PRESETS[preset] || {}).label || 'custom') : 'played by hand'}, deadline ${dl ? FO.dateOf(+dl - 1) : 'none'}, Ready check ${(NOTICE.find(x => x[0] === nRules.notice) || [0, 'off'])[1]}`); return; }
  const lenChanged = nLen !== ((meta && meta.len) || 162);
  meta = Object.assign({}, meta, { auto: nAuto, rules: nRules, len: nLen });
  if (lenChanged && S && S.phase === 'season' && S.day === 0) { S.len = nLen; if (mode === 'local') saveLocal(); else await writeDoc('league/state', S); }
  if (lenChanged) logC(`Set the season length to ${nLen} games${S && S.phase === 'season' && S.day === 0 ? '' : ' starting next season'}`);
  logC(`Changed the league rules: ${on ? 'runs on a schedule' : 'played by hand'}, trade deadline ${dl ? FO.dateOf(+dl - 1) : 'none'}, Ready check ${(NOTICE.find(x => x[0] === nRules.notice) || [0, 'off'])[1]}`);
  closeModal();
  await writeDoc('league/meta', meta);
  render();
  toast(on ? `Schedule saved. First update ${whenText(nextUpdateAt())}.` : 'Schedule saved. The league is played by hand.');
}
function scheduleStrip() {
  if (!meta) return '';
  const a = meta.auto, cm = isCommish();
  if (!a || !a.on) return cm ? `<section class="card"><div class="pad row wrap" style="padding-top:12px"><span class="small" style="flex:1;min-width:180px"><b>Played by hand.</b> Set a schedule and the league runs itself, even when you forget.</span><button class="btn sm" type="button" data-act="schedule">Set a schedule</button></div></section>` : '';
  const nx = nextUpdateAt();
  return `<section class="card clock"><div class="pad row wrap" style="padding-top:12px"><span class="clockic" aria-hidden="true">⏱</span><span class="small" style="flex:1;min-width:180px"><b>Next update ${nx ? whenText(nx) : 'soon'}</b><br><span class="muted">${esc(nextUpdateLabel())} · ${esc(CLOCK_PRESETS[Object.keys(CLOCK_PRESETS).find(k => CLOCK_PRESETS[k].every === a.every && CLOCK_PRESETS[k].games === a.games)] ? CLOCK_PRESETS[Object.keys(CLOCK_PRESETS).find(k => CLOCK_PRESETS[k].every === a.every && CLOCK_PRESETS[k].games === a.games)].label : a.games + ' games every ' + a.every + ' hours')}${tradeDeadlineDay() ? ' · trade deadline ' + FO.dateOf(tradeDeadlineDay() - 1) : ''}</span></span>${cm ? '<button class="btn sm ghost" type="button" data-act="schedule">Edit</button>' : ''}</div></section>`;
}
// trade deadline
// first game day on or after a calendar date this season
function gameDayOn(mon, day) {
  const MO = { Mar: 3, Apr: 4, May: 5, Jun: 6, Jul: 7, Aug: 8, Sep: 9, Oct: 10 };
  for (let d = 1; d <= 162; d++) { const [m, dd] = FO.dateOf(d - 1).split(' '); if (MO[m] > MO[mon] || (MO[m] === MO[mon] && +dd >= day)) return d; }
  return 162;
}
function tradeDeadlineDay() { const d = meta && meta.rules && meta.rules.deadline; return d ? Math.max(2, Math.round(d * LEN() / 162)) : null; } // stored on the 162-game calendar, scaled to the season length
function tradesClosed() { const d = tradeDeadlineDay(); return !!(d && S && S.phase === 'season' && S.day >= d); }
// what happened since your last visit
function awayKey() { return 'fo-away-' + league.kind + ':' + league.id; }
function awayCard(mt) {
  if (!S || !mt) return '';
  const s = S.std[mt], now = { season: seasonNo(), day: S.day, phase: S.phase, w: s[0], l: s[1], cash: cashOf(mt), pts: Math.round(gmScore(mt).total) };
  let last = null; try { last = JSON.parse(localStorage.getItem(awayKey()) || 'null'); } catch (e) { last = null; }
  setTimeout(() => { try { localStorage.setItem(awayKey(), JSON.stringify(now)); } catch (e) { /* ignore */ } }, 0);
  if (!last || last.season !== now.season || (last.day === now.day && last.phase === now.phase)) return '';
  const dw = now.w - last.w, dl = now.l - last.l, dc = now.cash - last.cash, dp = now.pts - last.pts;
  if (dw + dl === 0 && last.phase === now.phase) return '';
  const sign = v => (v >= 0 ? '+' : '−');
  return `<section class="card"><h2>While you were away<span class="sub">${last.phase === 'season' ? 'since day ' + last.day : 'since your last visit'}</span></h2><div class="pad small" style="padding-top:12px">${dw + dl ? `Your club went <b>${dw}-${dl}</b> and is now ${now.w}-${now.l}, ${esc(divPlace(mt))}. ` : ''}${last.phase !== now.phase ? `The league moved on to ${now.phase === 'post' ? 'the postseason' : now.phase === 'offseason' ? 'free agency' : now.phase === 'done' ? 'the end of the season' : 'a new season'}. ` : ''}Cash ${sign(dc)}${money(Math.abs(dc))}, GM Race ${now.pts} pts (${sign(dp)}${Math.abs(dp)}). <button class="lnk" type="button" data-tab="league" data-sub="news">Read the news</button></div></section>`;
}

// ---------------- League governance: commissioner log, charter, votes, Ready check ----------------
// Pathfinder's rule for a GM who also plays: the GM's character never makes the big calls, never outshines the
// players, and never plays on what only the GM knows. Here: big league actions go to a vote, the rules lock when
// the season starts, every commissioner action is logged for all to see, and manual sims wait for a Ready check.
let gov = {}, clog = [];
const ownersAll = () => [...new Set(TEAMS.map(t => ownerOf(t.id)).filter(Boolean))];
const multiGM = () => mode === 'shared' && ownersAll().length >= 2;
const noticeMin = () => { const n = meta && meta.rules && meta.rules.notice; return n == null ? 15 : n; };
const NOTICE = [[15, '15 minutes'], [60, '1 hour'], [480, '8 hours'], [0, 'No Ready check']];
function charterLocked() { return multiGM() && !!S && ((S.phase === 'season' && S.day > 0) || S.phase === 'post'); }
async function logC(txt) {
  if (mode !== 'shared') return;
  const id = newId(), rec = { ts: Date.now(), by: me.id, txt, comm: isCommish() };
  clog.unshift(Object.assign({ id }, rec));
  try { await writeDoc('clog/' + id, rec); } catch (e) { /* best effort */ }
}
async function saveGov(patch) { gov = Object.assign({}, gov, patch); if (mode === 'shared') { try { await writeDoc('league/gov', gov); } catch (e) { /* toast shown */ } } }

// ---- votes ----
function voteNeed(by) { const n = ownersAll().filter(o => o !== by).length; return Math.max(1, Math.ceil(n / 2)); }
function openVote() { const v = gov.vote; if (!v || v.status !== 'open') return null; if (Date.now() - v.ts > 48 * 3600e3) return null; return v; }
async function proposeVote(kind, args, label) {
  if (openVote()) { toast('Another vote is still open. Let it finish first.'); return; }
  const v = { id: newId(), kind, args, label, by: me.id, ts: Date.now(), yes: [me.id], no: [], need: voteNeed(me.id), status: 'open' };
  await saveGov({ vote: v });
  await logC(`Proposed a vote: ${label}`);
  render(); toast('Vote posted. The other GMs decide.');
}
async function castVote(yes) {
  const v = openVote(); if (!v || v.by === me.id || v.yes.includes(me.id) || v.no.includes(me.id)) return;
  const nv = Object.assign({}, v, { yes: yes ? v.yes.concat([me.id]) : v.yes, no: yes ? v.no : v.no.concat([me.id]) });
  const others = ownersAll().filter(o => o !== v.by).length;
  const yesOthers = nv.yes.filter(o => o !== v.by).length;
  if (yesOthers >= v.need) nv.status = 'passed';
  else if (nv.no.length > others - v.need) nv.status = 'failed';
  await saveGov({ vote: nv });
  await logC(`${yes ? 'Voted yes' : 'Voted no'} on: ${v.label}${nv.status !== 'open' ? ` (vote ${nv.status})` : ''}`);
  render();
}
async function withdrawVote() { const v = openVote(); if (!v || v.by !== me.id) return; await saveGov({ vote: Object.assign({}, v, { status: 'withdrawn' }) }); await logC(`Withdrew the vote: ${v.label}`); render(); }
let voteBusy = false;
async function runPassedVote() {
  const v = gov.vote; if (!v || v.status !== 'passed' || v.done || voteBusy) return;
  const runner = v.kind === 'reset' ? isCommish() : (v.by === me.id || isCommish());
  if (!runner) return;
  voteBusy = true;
  try {
    await saveGov({ vote: Object.assign({}, v, { done: Date.now() }) });
    await logC(`Carried out the vote: ${v.label}`);
    if (v.kind === 'reset') await resetLeague(v.args.era, { dataset: { confirm: '1', keep: v.args.keep ? '1' : '0' } }, { voted: true });
    else if (v.kind === 'kick') { await teamWrite(v.args.tid, { owner: null, lineup: undefined, rotation: undefined, closer: undefined }); toast('Removed. The computer runs ' + TEAM[v.args.tid].city + ' now.'); }
    else if (v.kind === 'rule') { meta = Object.assign({}, meta, v.args.meta); if (v.args.meta.auto) meta.auto = Object.assign({}, v.args.meta.auto); await writeDoc('league/meta', meta); toast('New league rules are in effect.'); }
    else if (v.kind === 'delete') { await deleteLeague(v.args.id, { voted: true }); }
  } finally { voteBusy = false; }
  render();
}
function voteCard() {
  const v = gov.vote; if (!v) return '';
  const fresh = Date.now() - (v.done || v.ts) < 24 * 3600e3;
  if (v.status !== 'open' && !fresh) return '';
  if (v.status === 'open' && !openVote()) return '';
  const mine = v.by === me.id, voted = v.yes.includes(me.id) || v.no.includes(me.id);
  const tally = `${v.yes.filter(o => o !== v.by).length} yes · ${v.no.length} no · needs ${v.need} yes`;
  const status = v.status === 'open' ? (mine ? 'Waiting on the other GMs' : voted ? 'You voted' : 'Your vote') : v.status === 'passed' ? (v.done ? 'Passed and done' : 'Passed') : v.status === 'failed' ? 'Voted down' : 'Withdrawn';
  return `<section class="card votecard ${v.status}"><div class="pad" style="padding-top:12px;display:grid;gap:6px"><div class="row" style="gap:8px;align-items:center"><span class="tag ${v.status === 'open' ? 'gold' : v.status === 'passed' ? '' : 'red'}">League vote</span><span class="small muted" style="flex:1">${status}</span></div>
    <b>${esc(ownerName(v.by))} ${mine ? 'want' : 'wants'} to ${esc(v.label)}</b><span class="small muted">${tally}. ${v.status === 'open' ? `Open until ${new Date(v.ts + 48 * 3600e3).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.` : ''}</span>
    ${v.status === 'open' && !mine && !voted ? `<div class="row" style="gap:8px"><button class="btn primary" type="button" data-act="vote" data-v="1">Yes</button><button class="btn" type="button" data-act="vote" data-v="0">No</button></div>` : ''}
    ${v.status === 'open' && mine ? `<div><button class="btn sm ghost" type="button" data-act="unvote">Withdraw</button></div>` : ''}</div></section>`;
}

// ---- Ready check before manual sims ----
const callLive = () => { const c = gov.call; return c && !c.done && Date.now() - c.ts < 7 * 864e5 ? c : null; };
const readyOf = (o, c) => { if (!c) return false; if (o === c.by) return true; const t = TEAMS.find(x => ownerOf(x.id) === o); const d = t && docs[t.id]; return !!(d && (d.ready === c.id || (c.kind === 'sim' && S && S.phase === 'season' && S.day === 0 && d.odReady === seasonNo()))); };
function callStatus(c) { const os = ownersAll(); const r = os.filter(o => readyOf(o, c)); return { all: os, ready: r, left: Math.max(0, c.at - Date.now()), go: r.length >= os.length || Date.now() >= c.at }; }
function needsCall(kind) { return multiGM() && noticeMin() > 0 && !autoOn() && (kind !== 'sim' || S.phase === 'season' || S.phase === 'post'); }
const CALL_LABEL = { sim: n => (n >= 999 ? 'the rest of the season' : n === 1 ? 'one game day' : n + ' game days'), nextfa: () => 'the next free agency day', closefa: () => 'closing free agency and starting the season', openoff: () => 'opening the offseason' };
async function callSim(kind, n) {
  if (callLive()) { toast('A sim is already called. Waiting on the Ready check.'); return; }
  const c = { id: newId(), kind, n: n || 0, by: me.id, ts: Date.now(), at: Date.now() + noticeMin() * 60e3 };
  await saveGov({ call: c });
  await logC(`Called a sim: ${CALL_LABEL[kind](n)} (Ready check, ${noticeMin()} min notice)`);
  render(); toast(`Called. It runs when every GM is ready, or in ${noticeMin() >= 60 ? noticeMin() / 60 + ' hour' + (noticeMin() > 60 ? 's' : '') : noticeMin() + ' minutes'}.`);
}
async function setReady() { const c = callLive(), mt = myTeam(); if (!c || !mt) return; await teamWrite(mt, { ready: c.id }); toast("You're ready."); }
async function cancelCall() { const c = callLive(); if (!c || (c.by !== me.id && !isCommish())) return; await saveGov({ call: Object.assign({}, c, { done: Date.now(), cancelled: true }) }); await logC('Cancelled the called sim'); render(); }
let callBusy = false;
async function callTick() {
  const c = callLive(); if (!c || callBusy || simming || busy) return;
  if (!callStatus(c).go) { paintCall(); return; }
  const can = c.kind === 'sim' ? canSim() : isCommish(); if (!can) return;
  callBusy = true;
  try {
    await saveGov({ call: Object.assign({}, c, { done: Date.now() }) });
    if (c.kind === 'sim') await sim(c.n, { call: true });
    else if (c.kind === 'nextfa') await marketDay(false, { call: true });
    else if (c.kind === 'closefa') await marketDay(true, { call: true });
    else if (c.kind === 'openoff') await openOffseason({ call: true });
  } finally { callBusy = false; }
}
function callBar() {
  const c = callLive(); if (!c) return '';
  const st = callStatus(c), me1 = readyOf(me.id, c), mm = Math.floor(st.left / 60e3), ss = Math.floor(st.left % 60e3 / 1e3);
  const who = st.all.map(o => `<span class="rdy ${readyOf(o, c) ? 'on' : ''}" title="${esc(ownerName(o))}">${readyOf(o, c) ? '✓' : '…'} ${esc(ownerName(o))}</span>`).join('');
  return `<div class="callbar" id="callBar"><div class="cb1"><b>⏳ ${esc(ownerName(c.by))} called a sim: ${esc(CALL_LABEL[c.kind](c.n))}</b><span class="small" id="callLeft">${st.go ? 'Starting…' : `${mm >= 60 ? Math.floor(mm / 60) + 'h ' + (mm % 60) + 'm' : mm + ':' + String(ss).padStart(2, '0')} left · ${st.ready.length} of ${st.all.length} ready`}</span></div><div class="cb2">${who}</div><div class="cb3">${myTeam() && !me1 ? `<button class="btn sm primary" type="button" data-act="ready">I'm ready</button>` : ''}${c.by === me.id || isCommish() ? `<button class="btn sm ghost" type="button" data-act="uncall">Cancel</button>` : ''}</div></div>`;
}
function paintCall() { const b = $('#callBar'); if (b) b.outerHTML = callBar(); }
setInterval(() => { if (callLive()) callTick(); if (gov.vote && gov.vote.status === 'passed' && !gov.vote.done) runPassedVote(); }, 1000);

// ---- charter: the rules lock when the season starts ----
function charterHTML() {
  const a = (meta && meta.auto) || {}, r = (meta && meta.rules) || {};
  const pace = a.on ? (CLOCK_PRESETS[Object.keys(CLOCK_PRESETS).find(k => CLOCK_PRESETS[k].every === a.every && CLOCK_PRESETS[k].games === a.games)] || { label: `every ${a.every}h, ${a.games} games` }).label : 'Played by hand';
  const rows = [
    ['Season length', `${(meta && meta.len) || 162} games${S && S.len && S.len !== ((meta && meta.len) || 162) ? ` (this season ${S.len})` : ''}`],
    ['Schedule', pace],
    ['Trade deadline', r.deadline ? FO.dateOf(r.deadline - 1) : 'None'],
    ['Who can sim', meta.openSim ? 'Any GM' : 'Commissioner'],
    ['Draft pick clock', (DRAFT_CLOCKS.find(x => x[0] === draftClock()) || [0, draftClock() + ' min'])[1]],
    ['Ready check before manual sims', noticeMin() ? `Yes · runs after ${(NOTICE.find(x => x[0] === noticeMin()) || [0, noticeMin() + ' min'])[1]} at most` : 'Off'],
    ['Club changes', meta.locked ? 'Locked' : 'Open'],
    ['Big decisions (reset, remove a GM, delete)', multiGM() ? `League vote: ${voteNeed(meta.commish)} of the other GMs` : 'Commissioner (no other GMs yet)'],
  ];
  return `<section class="card"><h2>League charter<span class="sub">${charterLocked() ? '🔒 locked for the season' : 'open for changes'}</span></h2><div class="kv charter">${rows.map(([k, v]) => `<div><span>${k}</span><b>${esc(v)}</b></div>`).join('')}</div>
    <div class="pad small muted" style="padding-top:10px">${charterLocked() ? 'The rules froze on Opening Day so nobody, the commissioner included, can change them mid-race. A change now needs a league vote.' : 'The rules can change freely until Opening Day. Then they lock for the season.'} The commissioner can't edit anyone's roster, cash, ratings or contracts.${isCommish() ? ` <button class="lnk" type="button" data-act="schedule">${charterLocked() ? 'Propose a change' : 'Edit the rules'}</button>` : ''}</div></section>`;
}
function viewRules() {
  const rows = clog.slice(0, 40).map(x => `<div><span class="d">${new Date(x.ts).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span><span><b>${esc(ownerName(x.by))}</b>${x.comm ? ' <span class="tag">Commissioner</span>' : ''} ${esc(x.txt)}</span></div>`).join('');
  return voteCard() + charterHTML() + `<section class="card"><h2>Commissioner log<span class="sub">every league action, for everyone to see</span></h2>${rows ? `<div class="news">${rows}</div>` : '<div class="empty">Nothing yet. Sims, rule changes, votes and roster removals show up here.</div>'}</section>`;
}
// keep "last seen" so inactive GMs can be removed without a vote
let seenStamp = 0;
function touchSeen() {
  const mt = myTeam(); if (!mt || mode !== 'shared' || Date.now() - seenStamp < 6 * 3600e3) return;
  seenStamp = Date.now();
  if (!docs[mt] || !docs[mt].seen || Date.now() - docs[mt].seen > 6 * 3600e3) teamWrite(mt, { seen: Date.now() });
}
const inactiveDays = tid => { const s = docs[tid] && docs[tid].seen; return s ? (Date.now() - s) / 864e5 : 0; };

// ---------------- Preseason: spring training hub (before Opening Day) ----------------
// Day 0 of every season. Last year's leaders, the best prospects in every farm system, projections,
// a camp report for your club, and a Ready-for-Opening-Day check for leagues with friends.
let psTab = 'camp', psCat = 'ops';
const isPreseason = () => !!S && S.phase === 'season' && S.day === 0;
function lastYearInfo() {
  const prev = (hist.seasons || []).filter(x => x.season === seasonNo() - 1).pop();
  return prev ? { label: `${prev.year} leaders`, note: `From your league's ${prev.year} season.`, prev } : { label: `${FO.ERA.year} leaders`, note: `The real ${FO.ERA.year} MLB numbers your players' ratings are built on.`, prev: null };
}
const f3 = v => v.toFixed(3).replace(/^0/, '');
const CATS = {
  avg: { l: 'AVG', t: 'H', fmt: f3 }, hr: { l: 'HR', t: 'H', fmt: v => v }, ops: { l: 'OPS', t: 'H', fmt: f3 }, sb: { l: 'SB', t: 'H', fmt: v => v }, rbi: { l: 'RBI', t: 'H', fmt: v => v, simOnly: true },
  w: { l: 'W', t: 'P', fmt: v => v }, era: { l: 'ERA', t: 'P', fmt: v => v.toFixed(2), low: true }, so: { l: 'K', t: 'P', fmt: v => v }, sv: { l: 'SV', t: 'P', fmt: v => v },
};
function leaderList(cat) {
  const ly = lastYearInfo(), c = CATS[cat], rows = [];
  if (ly.prev) {
    if (c.t === 'H') for (const id in ly.prev.bat || {}) {
      const a = ly.prev.bat[id]; if (!P[id] || !a[2]) continue; // [G, PA, AB, R, H, 2B, 3B, HR, RBI, BB, SO, SB, CS]
      const q = a[1] >= 450, obp = (a[4] + a[9]) / Math.max(1, a[2] + a[9]), slg = (a[4] + a[5] + 2 * a[6] + 3 * a[7]) / a[2];
      const v = { avg: q ? a[4] / a[2] : null, hr: a[7], ops: q ? obp + slg : null, sb: a[11], rbi: a[8] }[cat];
      if (v != null) rows.push({ id: +id, v, line: `${f3(a[4] / a[2])}, ${a[7]} HR, ${a[8]} RBI` });
    } else for (const id in ly.prev.pit || {}) {
      const a = ly.prev.pit[id]; if (!P[id] || !a[5]) continue; // [G, GS, W, L, SV, OUTS, H, R, BB, SO, HR]
      const era = a[7] * 27 / a[5], v = { w: a[2], era: a[5] >= 450 ? era : null, so: a[9], sv: a[4] }[cat];
      if (v != null) rows.push({ id: +id, v, line: `${a[2]}-${a[3]}, ${era.toFixed(2)} ERA, ${a[9]} K` });
    }
  } else {
    if (c.simOnly) return [];
    for (const p of P) {
      if (!p || p.dup || p.pros || p.t !== c.t) continue;
      if (c.t === 'H') {
        if (!p.AB) continue;
        const H = Math.round(p.AB * p.AVG), q = p.AB >= 400, obp = (H + p.BB) / (p.AB + p.BB), slg = (H + p.D + 2 * p.T + 3 * p.HR) / p.AB;
        const v = { avg: q ? H / p.AB : null, hr: p.HR, ops: q ? obp + slg : null, sb: p.SB }[cat];
        if (v != null) rows.push({ id: p.id, v, line: `${f3(H / p.AB)}, ${p.HR} HR, ${p.SB} SB` });
      } else {
        if (!p.outs) continue;
        const v = { w: p.W, era: p.outs >= 450 ? p.ERA : null, so: p.SO, sv: p.SV }[cat];
        if (v != null) rows.push({ id: p.id, v, line: `${p.W}-${p.L}, ${p.ERA.toFixed(2)} ERA, ${p.SO} K${p.SV ? `, ${p.SV} SV` : ''}` });
      }
    }
  }
  return rows.sort((a, b) => c.low ? a.v - b.v : b.v - a.v).slice(0, 10);
}
function whereNow(id, mt) {
  const org = orgOf(id);
  if (org === mt) return { tag: '<span class="tag mine">Yours</span>', btn: '' };
  if (TEAM[org]) return { tag: `<span class="abbr">${org}</span>`, btn: mt ? `<button class="btn sm" type="button" data-act="tradefor" data-p="${id}">Trade for</button>` : '' };
  return { tag: '<span class="tag gold">Free agent</span>', btn: `<button class="btn sm primary" type="button" data-act="fa" data-p="${id}">Sign</button>` };
}
function psLeaders(mt) {
  const ly = lastYearInfo(), hit = ['avg', 'hr', 'ops', 'sb'].concat(ly.prev ? ['rbi'] : []), pit = ['w', 'era', 'so', 'sv'];
  if (!CATS[psCat] || (CATS[psCat].simOnly && !ly.prev)) psCat = 'ops';
  const chips = (list, lab) => `<div class="pchips" role="group" aria-label="${lab}">${list.map(k => `<button type="button" class="pchip" data-act="pscat" data-v="${k}" aria-pressed="${psCat === k}">${CATS[k].l}</button>`).join('')}</div>`;
  const rows = leaderList(psCat).map((r, i) => { const w = whereNow(r.id, mt), p = P[r.id]; return `<div class="item"><span class="slot">${i + 1}</span><div class="nm"><button class="lnk" type="button" data-act="player" data-p="${r.id}"><b>${esc(p.name)}</b></button> ${w.tag} <span class="muted small">${posShort(p)} · ${p.age}</span><span class="s">${esc(r.line)}</span></div><span class="ctrls"><b class="num psv">${CATS[psCat].fmt(r.v)}</b>${w.btn}</span></div>`; }).join('');
  return `<div class="pad small muted" style="padding-top:10px">${esc(ly.note)} Tap a name for the full card. Where he plays now is shown next to his name.</div>
    <div class="pad" style="padding-top:8px;display:grid;gap:6px"><div class="small" style="font-weight:600">Hitting</div>${chips(hit, 'Hitting categories')}<div class="small" style="font-weight:600">Pitching</div>${chips(pit, 'Pitching categories')}</div>
    <div class="list">${rows || '<div class="empty">No qualified players.</div>'}</div>`;
}
function psProspects(mt) {
  const all = []; TEAMS.forEach(t => farmOf(t.id).forEach(id => all.push({ id, tid: t.id })));
  all.sort((a, b) => potSeen(b.id) - potSeen(a.id));
  const rows = all.slice(0, 15).map((x, i) => { const p = P[x.id], mine = x.tid === mt; return `<div class="item"><span class="slot">${i + 1}</span><div class="nm"><button class="lnk" type="button" data-act="player" data-p="${x.id}"><b>${esc(p.name)}</b></button> ${potTag(x.id)}${isReady(x.id) ? ' <span class="tag mine">Ready</span>' : ''} ${mine ? '<span class="tag mine">Yours</span>' : `<span class="abbr">${x.tid}</span>`}<span class="s">OVR ${sOvr(x.id)} now · ${esc(prospectLine(x.id))}</span></div><span class="ctrls">${mine ? (isReady(x.id) ? `<button class="btn sm primary" type="button" data-act="callup" data-p="${x.id}">Call up</button>` : '') : mt ? `<button class="btn sm" type="button" data-act="tradefor" data-p="${x.id}">Trade for</button>` : ''}</span></div>`; }).join('');
  return `<div class="pad small muted" style="padding-top:10px">The 15 best prospects in baseball by ceiling${fogErr() ? ', graded by your scouts (a bigger scouting budget sharpens these)' : ''}. Young, cheap and controllable: the best trade targets to build around. READY means he can help a big-league club now.</div><div class="list">${rows || '<div class="empty">Farm systems fill up after the first offseason draft.</div>'}</div>`;
}
function psProjections(mt) {
  const a = analysis(mt), odds = a.odds || {}, ly = lastYearInfo();
  const rows = TEAMS.map(t => ({ id: t.id, w: odds[t.id] ? odds[t.id].w : 81, po: odds[t.id] ? odds[t.id].po : 0, ws: odds[t.id] ? odds[t.id].ws : 0 })).sort((x, y) => y.w - x.w);
  return `<div class="pad small muted" style="padding-top:10px">Projected from every club's roster as it stands today, played out 400 times. Make a move and the numbers update.</div><div class="scroll"><table class="race proj"><thead><tr><th class="name">Club</th><th>Proj</th><th>Playoffs</th><th>Title</th>${ly.prev && ly.prev.std ? '<th>Last yr</th>' : ''}</tr></thead><tbody>${rows.map((r, i) => `<tr class="${r.id === mt ? 'mine' : ''}"><td class="name"><b>${i + 1}. ${esc(TEAM[r.id].city)}</b>${ownerOf(r.id) ? ` <span class="small muted">${esc(ownerName(ownerOf(r.id)))}</span>` : ''}</td><td>${Math.round(r.w)}-${LEN() - Math.round(r.w)}</td><td>${Math.round(r.po * 100)}%</td><td>${(r.ws * 100).toFixed(r.ws < 0.1 ? 1 : 0)}%</td>${ly.prev && ly.prev.std ? `<td>${ly.prev.std[r.id] ? ly.prev.std[r.id][0] + '-' + ly.prev.std[r.id][1] : ''}</td>` : ''}</tr>`).join('')}</tbody></table></div>`;
}
function psCamp(mt) {
  const a = analysis(mt), o = (a.odds || {})[mt], diag = a.diag.slice().sort((x, y) => x.gap - y.gap);
  const weak = diag.filter(d => d.gap < -2).slice(0, 3), strong = diag.slice().sort((x, y) => y.gap - x.gap).slice(0, 2);
  const name = k => POS_NAME[k] || k;
  const coachN = isCustom(mt) ? coachCount(mt).n : 0, cash = cashOf(mt);
  const faFits = weak.map(d => ({ d, id: freeAgents().filter(id => fitsSpot(P[id], d.k) && P[id].ovr > d.mine + 2 && askNow(id, mt) * FO.BONUS <= Math.max(0, cash)).sort((x, y) => P[y].ovr - P[x].ovr)[0] })).filter(x => x.id != null);
  const list = [];
  for (const d of weak) list.push(`<li><b>${name(d.k)}</b> ranks ${d.rank} of ${TEAMS.length} (${Math.round(d.mine)} vs ${Math.round(d.avg)} league average). ${faFits.find(x => x.d === d) ? `Free agent <button class="lnk" type="button" data-act="fa" data-p="${faFits.find(x => x.d === d).id}">${esc(P[faFits.find(x => x.d === d).id].name)}</button> (${sOvr(faFits.find(x => x.d === d).id)}) fits and you can afford him.` : 'Look for a trade.'}</li>`);
  return `<div class="pad" style="padding-top:12px;display:grid;gap:10px">
    ${o ? `<div class="kv"><div><span>Projected</span><b>${Math.round(o.w)}-${LEN() - Math.round(o.w)}</b></div><div><span>Playoff odds</span><b>${Math.round(o.po * 100)}%</b></div><div><span>Title odds</span><b>${(o.ws * 100).toFixed(1)}%</b></div><div><span>Cash</span><b style="color:${cash >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(cash)}</b></div></div>` : ''}
    <div class="small"><b>Strengths:</b> ${strong.map(d => `${name(d.k)} (#${d.rank})`).join(', ')}.</div>
    ${list.length ? `<div class="small"><b>Holes to fix before Opening Day</b><ul style="margin:6px 0 0;padding-left:18px;display:grid;gap:6px">${list.join('')}</ul></div>` : '<div class="small good">No real holes. This roster is ready.</div>'}
    ${coachN ? `<div class="small warn">Your lineup coach has ${coachN} fix${coachN > 1 ? 'es' : ''}. <button class="lnk" type="button" data-act="coach-all">Use the best lineup</button></div>` : '<div class="small">✓ Best lineup and staff are set.</div>'}
    ${cash < 0 ? `<div class="small bad">You start the year in the red. <button class="lnk" type="button" data-act="recover">See the recovery plan</button></div>` : ''}
  </div>${a.ideas.length ? `<h4 class="h2 rsec">A trade their GM would take</h4>${ideaCard(a.ideas[0], mt, 0)}${a.ideas.length > 1 ? `<div class="pad small" style="padding-top:6px"><button class="lnk" type="button" data-act="ov" data-v="analysis" data-go="office">${a.ideas.length - 1} more trade idea${a.ideas.length > 2 ? 's' : ''} in GM Analysis</button></div>` : ''}` : ''}`;
}
function readyODList() {
  if (!multiGM()) return '';
  const os = ownersAll(), c = callLive();
  const ok = o => { const t = TEAMS.find(x => ownerOf(x.id) === o); return !!(t && docs[t.id] && (docs[t.id].odReady === seasonNo() || (c && docs[t.id].ready === c.id))); };
  const mt = myTeam(), meReady = mt && ok(me.id), n = os.filter(ok).length;
  return `<div class="odready"><div class="small" style="color:var(--board-dim)">Ready for Opening Day: <b style="color:var(--board-ink)">${n} of ${os.length}</b></div><div class="cb2">${os.map(o => `<span class="rdy ${ok(o) ? 'on' : ''}">${ok(o) ? '✓' : '…'} ${esc(ownerName(o))}</span>`).join('')}</div>${mt && !meReady ? `<button class="btn primary" type="button" data-act="odready">I'm ready for Opening Day</button>` : mt ? `<span class="small" style="color:var(--board-dim)">You're set. ${n < os.length ? 'Waiting on the others.' : (isCommish() || meta.openSim ? 'Everyone is in. Hit Play ball.' : 'Everyone is in. The commissioner starts the season.')}</span>` : ''}</div>`;
}
function viewPreseason(mt) {
  const tabs = [['camp', 'Camp report'], ['leaders', lastYearInfo().label], ['prospects', 'Top prospects'], ['proj', 'Projections']];
  const body = psTab === 'leaders' ? psLeaders(mt) : psTab === 'prospects' ? psProspects(mt) : psTab === 'proj' ? psProjections(mt) : psCamp(mt);
  return `<section class="board spring"><div class="meta">Spring training · ${yearOf(seasonNo())}</div><div class="big">Opening Day ${esc(FO.dateOf(0))}</div><div class="small" style="color:var(--board-dim)">Scout last year's stars, find prospects, fix your holes and set your lineup before the games count.</div>${readyODList()}</section>
    <section class="card"><div class="pad" style="padding-top:12px"><div class="seg scrollseg" role="group" aria-label="Preseason">${tabs.map(([k, l]) => `<button type="button" data-act="pstab" data-v="${k}" aria-pressed="${psTab === k}">${esc(l)}</button>`).join('')}</div></div>${body}</section>`;
}
async function odReady() { const mt = myTeam(); if (!mt) return; const c = callLive(); await teamWrite(mt, Object.assign({ odReady: seasonNo() }, c ? { ready: c.id } : {})); toast("You're ready for Opening Day."); }

// ---------------- History: league record book + your career ----------------
// League record book (league/history → book): one compact entry per finished season, kept forever and
// kept through resets. Your career (private doc data/users/<you>/career): every season you've managed in
// any league, so your history survives resets, removals and deleted leagues.
let career = { entries: {} }, careerLoaded = false, histSub = 'book';
const realName = o => o === me.id ? (me.name || 'You') : ((profiles[o] && profiles[o].name) || 'A friend');
const leagueKeyNow = () => league.kind + ':' + (league.id || '');
function topList(cat) {
  const out = [];
  if (cat === 'hr' || cat === 'avg' || cat === 'rbi') for (const id in S.bat) { const a = S.bat[id]; if (!P[id] || !a[2]) continue; const v = cat === 'hr' ? a[7] : cat === 'rbi' ? a[8] : (a[1] >= 450 ? a[4] / a[2] : null); if (v != null) out.push([+id, v]); }
  else for (const id in S.pit) { const a = S.pit[id]; if (!P[id] || !a[5]) continue; const v = cat === 'w' ? a[2] : cat === 'so' ? a[9] : cat === 'sv' ? a[4] : (a[5] >= 450 ? a[7] * 27 / a[5] : null); if (v != null) out.push([+id, v]); }
  out.sort((x, y) => cat === 'era' ? x[1] - y[1] : y[1] - x[1]);
  const t = out[0]; if (!t) return null;
  return [P[t[0]].name, playerTeam(t[0]), cat === 'avg' ? f3(t[1]) : cat === 'era' ? t[1].toFixed(2) : t[1]];
}
function postLabel(tid) {
  const pr = postResult(tid, S.post), post = S.post, last = post && post.rounds && post.rounds[post.rounds.length - 1];
  if (pr.champ) return 'Won the World Series';
  if (last && last.name === 'World Series' && (last.series || []).some(se => se.hi === tid || se.lo === tid)) return 'Lost the World Series';
  if (!pr.inPO) return 'Missed the playoffs';
  const r = (post.rounds || []).slice().reverse().find(rd => (rd.series || []).some(se => se.hi === tid || se.lo === tid));
  return r ? `Out in the ${r.name}` : 'Made the playoffs';
}
function seasonSummary() {
  const post = S.post, last = post && post.rounds && post.rounds[post.rounds.length - 1];
  const ws = last && last.name === 'World Series' && last.series && last.series[0];
  const champ = post && post.champ, ru = ws ? (ws.hi === champ ? ws.lo : ws.hi) : null;
  const order = raceOrder(raceTable()), gm = {};
  order.forEach((r, i) => { gm[r.tid] = { owner: r.owner, name: realName(r.owner), total: Math.round(r.total * 10) / 10, rank: i + 1, w: S.std[r.tid][0], l: S.std[r.tid][1], place: divPlace(r.tid), post: postLabel(r.tid), win: Math.round(r.win), biz: Math.round(r.biz), fans: Math.round(r.fans) }; });
  const std = {}; TEAMS.forEach(t => { std[t.id] = [S.std[t.id][0], S.std[t.id][1]]; });
  const best = TEAMS.slice().sort((a, b) => (S.std[b.id][0] - S.std[b.id][1]) - (S.std[a.id][0] - S.std[a.id][1]))[0].id;
  const leaders = {}; ['hr', 'avg', 'rbi', 'w', 'era', 'so', 'sv'].forEach(k => { const x = topList(k); if (x) leaders[k] = x; });
  return { key: (meta.created || 0) + ':' + seasonNo(), run: meta.created || 0, season: seasonNo(), year: yearOf(seasonNo()), era: meta.era || '1997', champ: champ || null, champCity: champ ? TEAM[champ].city : '', ru, ruCity: ru ? TEAM[ru].city : '', wsScore: ws ? [Math.max(...ws.w), Math.min(...ws.w)] : null, best, bestRec: std[best], gm, leaders, std, raceW: order[0] ? order[0].tid : null, g163: !!tbOf(), prog: (S.prog || []).slice(-80), h2h: S.h2h || {}, awards: (() => { try { return seasonAwards(); } catch (e) { return null; } })(), ts: Date.now() };
}
// seasons finished before the record book existed: rebuild entries from the saved season summaries
function legacyBook() {
  const book = (hist && hist.book) || [], have = new Set(book.map(b => b.year + ':' + b.season));
  return (hist.seasons || []).filter(x => !have.has(x.year + ':' + x.season) && x.champ).map(x => {
    const rows = Object.entries(x.gm || {}).sort((a, b) => b[1].total - a[1].total), gm = {};
    rows.forEach(([tid, g], i) => { gm[tid] = { owner: g.owner, name: realName(g.owner), total: g.total, rank: i + 1, w: x.std && x.std[tid] ? x.std[tid][0] : null, l: x.std && x.std[tid] ? x.std[tid][1] : null, post: x.champ === tid ? 'Won the World Series' : '', place: '' }; });
    return { key: 'legacy:' + x.season + ':' + x.year, run: 0, season: x.season, year: x.year, era: (meta && meta.era) || '', champ: x.champ, champCity: TEAM[x.champ] ? TEAM[x.champ].city : x.champ, ru: null, gm, leaders: {}, raceW: x.raceW || (rows[0] && rows[0][0]) || null, g163: !!x.g163, ts: x.season };
  });
}
let bookBusy = false;
async function ensureBook() {
  const leg = legacyBook();
  if (leg.length && !bookBusy && (mode === 'local' || me.canWrite)) { hist = Object.assign({}, hist, { book: (hist.book || []).concat(leg) }); try { if (mode === 'local') saveLocal(); else await writeDoc('league/history', hist); } catch (e) { /* retry later */ } syncCareer(); }
  if (bookBusy || simming || !meta || !S || !(S.phase === 'done' || S.phase === 'offseason') || !S.post || !S.post.champ) return;
  const key = (meta.created || 0) + ':' + seasonNo(), book = (hist && hist.book) || [], cur = book.find(b => b.key === key);
  const rw = raceOrder(raceTable())[0];
  if (cur && cur.raceW === (rw ? rw.tid : null) && cur.g163 === !!tbOf()) { syncCareer(); return; }
  if (mode === 'shared' && !me.canWrite) return;
  bookBusy = true;
  try {
    const entry = seasonSummary();
    hist = Object.assign({}, hist, { book: book.filter(b => b.key !== key).concat([entry]) });
    if (mode === 'local') saveLocal(); else await writeDoc('league/history', hist);
    syncCareer();
  } catch (e) { /* retry on the next render */ } finally { bookBusy = false; }
}
// ---- your career (private, follows you across leagues) ----
const careerRef = () => (db && me.id && mode === 'shared') ? db.doc('data/users/' + me.id + '/career') : null;
function loadCareer() {
  if (mode !== 'shared') { try { career = JSON.parse(localStorage.getItem('fo-career') || 'null') || { entries: {} }; } catch (e) { career = { entries: {} }; } careerLoaded = true; return; }
  const r = careerRef(); if (!r) return;
  unsubs.push(r.onSnapshot(s => { career = s.exists ? clone(s.data()) : { entries: {} }; career.entries = career.entries || {}; careerLoaded = true; syncCareer(); }, () => { careerLoaded = true; }));
}
let careerBusy = false;
async function syncCareer() {
  if (!careerLoaded || careerBusy || !hist || !hist.book) return;
  const add = {};
  for (const b of hist.book) {
    for (const [tid, g] of Object.entries(b.gm || {})) {
      if (g.owner !== me.id) continue;
      const k = leagueKeyNow() + '|' + b.key;
      if (career.entries[k] && career.entries[k].raceRank === g.rank) continue;
      add[k] = { league: leagueLabel(), kind: league.kind, year: b.year, era: b.era, tid, city: TEAM[tid] ? TEAM[tid].city : tid, w: g.w || 0, l: g.l || 0, place: g.place || '', post: g.post || '', pts: g.total, raceRank: g.rank, raceOf: Object.keys(b.gm).length, champ: b.champ === tid, raceWin: b.raceW === tid, ts: b.ts };
    }
  }
  if (!Object.keys(add).length) return;
  careerBusy = true;
  try {
    career = { entries: Object.assign({}, career.entries, add) };
    if (mode === 'shared') { const r = careerRef(); if (r) await r.set(career); } else localStorage.setItem('fo-career', JSON.stringify(career));
  } catch (e) { /* best effort */ } finally { careerBusy = false; }
}
// ---- views ----
function progChart(tid) {
  const pts = (S.prog || []).filter(p => p[1][tid]).map(p => [p[0], p[1][tid][0] - p[1][tid][1]]);
  if (pts.length < 2) return '<div class="empty">Your progress chart fills in as you play.</div>';
  const W0 = 600, H0 = 200, lo = Math.min(-10, ...pts.map(p => p[1])), hi = Math.max(10, ...pts.map(p => p[1]));
  const x = d => 40 + d / LEN() * (W0 - 50), y = v => 14 + (hi - v) / (hi - lo) * (H0 - 40);
  const line = pts.map(p => `${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join(' ');
  const last = pts[pts.length - 1];
  return `<svg viewBox="0 0 ${W0} ${H0}" class="racechart" role="img" aria-label="Games over .500 through the season"><line x1="40" x2="${W0 - 10}" y1="${y(0)}" y2="${y(0)}" stroke="var(--line)" stroke-dasharray="4 4"/><text x="34" y="${y(0) + 6}" text-anchor="end" font-size="18" fill="var(--muted)">.500</text><text x="34" y="${y(hi) + 6}" text-anchor="end" font-size="18" fill="var(--muted)">+${hi}</text><text x="34" y="${y(lo) + 6}" text-anchor="end" font-size="18" fill="var(--muted)">${lo}</text>
    <polyline fill="none" stroke="var(--accent)" stroke-width="3" stroke-linejoin="round" points="${line}"/><circle cx="${x(last[0])}" cy="${y(last[1])}" r="5" fill="var(--accent)"/><text x="${Math.min(W0 - 60, x(last[0]) + 8)}" y="${y(last[1]) - 8}" font-size="18" font-weight="700" fill="var(--ink)">${last[1] > 0 ? '+' : ''}${last[1]}</text>
    <text x="40" y="${H0 - 4}" font-size="16" fill="var(--muted)">Opening Day</text><text x="${W0 - 10}" y="${H0 - 4}" font-size="16" fill="var(--muted)" text-anchor="end">Game ${LEN()}</text></svg>`;
}
function viewCareer() {
  const mt = myTeam(), list = Object.values(career.entries || {}).sort((a, b) => b.ts - a.ts);
  const n = list.length, wins = list.reduce((a, x) => a + x.w, 0), losses = list.reduce((a, x) => a + x.l, 0);
  const titles = list.filter(x => x.champ).length, races = list.filter(x => x.raceWin && x.raceOf > 1).length, po = list.filter(x => !/Missed/.test(x.post)).length;
  const bestS = list.slice().sort((a, b) => (b.w - b.l) - (a.w - a.l))[0];
  let h = '';
  if (mt && S && S.phase === 'season' && S.day > 0) h += `<section class="card"><h2>This season<span class="sub">${esc(TEAM[mt].city)} · ${rec(mt)} · games over .500</span></h2><div class="pad" style="padding-top:8px">${progChart(mt)}</div></section>`;
  h += `<section class="card"><h2>Your career<span class="sub">saved to your account, across every league</span></h2>${n ? `<div class="kv"><div><span>Seasons</span><b>${n}</b></div><div><span>Record</span><b>${wins}-${losses}</b></div><div><span>Titles</span><b>${titles ? '🏆 ' + titles : 0}</b></div><div><span>Playoffs</span><b>${po} of ${n}</b></div>${races ? `<div><span>GM Races won</span><b>${races}</b></div>` : ''}${bestS ? `<div><span>Best season</span><b style="font:600 14px var(--body)">${bestS.w}-${bestS.l} · ${esc(bestS.city)} ${bestS.year}</b></div>` : ''}</div>
    <div class="list">${list.map(x => `<div class="item"><span class="slot" style="width:44px">${x.year}</span><div class="nm"><b>${esc(x.city)}</b> <span class="muted small">${esc(x.league)}</span>${x.champ ? ' <span class="tag gold">World Series champs</span>' : ''}${x.raceWin && x.raceOf > 1 ? ' <span class="tag gold">GM Race winner</span>' : ''}<span class="s">${x.w}-${x.l} · ${esc(x.place || '')} · ${esc(x.post)}</span></div><span class="num" style="text-align:right"><b>${Math.round(x.pts)}</b><span class="small muted" style="display:block">${x.raceOf > 1 ? `#${x.raceRank} of ${x.raceOf}` : 'pts'}</span></span></div>`).join('')}</div>`
    : `<div class="empty">Finish a season and it's saved here for good: your record, playoff run and GM Race finish. It stays with your account even if a league is reset or deleted.</div>`}</section>`;
  return h;
}
function viewBook() {
  const book = ((hist && hist.book) || []).slice().sort((a, b) => b.ts - a.ts);
  const runs = [...new Set(book.map(b => b.run))];
  if (!book.length) return `<section class="card"><h2>Record book</h2><div class="empty">The first World Series champion goes up here when this season ends. Every season after that is kept, even if the league starts over.</div></section>`;
  const L = (k, lab, b) => b.leaders && b.leaders[k] ? `<span><b>${lab}</b> ${esc(b.leaders[k][0])} <span class="abbr">${esc(b.leaders[k][1])}</span> ${b.leaders[k][2]}</span>` : '';
  return `<section class="card"><h2>World Series champions<span class="sub">${book.length} season${book.length > 1 ? 's' : ''}</span></h2><div class="list">${book.map(b => {
    const rw = b.raceW && b.gm[b.raceW];
    return `<details class="bookrow"><summary class="item"><span class="slot" style="width:44px">${b.year}</span><div class="nm"><b>🏆 ${esc(b.champCity)}</b>${b.gm[b.champ] ? ` <span class="small muted">GM ${esc(b.gm[b.champ].owner === me.id ? 'You' : b.gm[b.champ].name)}</span>` : ''}<span class="s">${b.ru ? `beat ${esc(b.ruCity)} ${b.wsScore ? b.wsScore.join('-') : ''}` : ''}${rw && Object.keys(b.gm).length > 1 ? ` · GM Race: ${esc(rw.owner === me.id ? 'You' : rw.name)}${b.g163 ? ' (Game 163)' : ''}` : ''}${runs.length > 1 ? ` · ${b.era} rosters` : ''}</span></div><span class="chev" aria-hidden="true">▾</span></summary>
      <div class="pad small" style="display:grid;gap:8px;padding-top:4px">
        <div><b>Best record:</b> ${esc(TEAM[b.best] ? TEAM[b.best].city : b.best)} ${b.bestRec ? b.bestRec.join('-') : ''}</div>
        ${b.awards ? awardsHTML(b.awards, true) : ''}
        <div class="leadline">${L('hr', 'HR', b)}${L('avg', 'AVG', b)}${L('rbi', 'RBI', b)}${L('w', 'W', b)}${L('era', 'ERA', b)}${L('so', 'K', b)}${L('sv', 'SV', b)}</div>
        ${Object.keys(b.gm).length ? `<div class="scroll"><table class="race"><thead><tr><th class="name">GM</th><th>Record</th><th>Finish</th><th>Pts</th></tr></thead><tbody>${Object.entries(b.gm).sort((x, y) => x[1].rank - y[1].rank).map(([tid, g]) => `<tr class="${g.owner === me.id ? 'mine' : ''}"><td class="name">${g.rank === 1 && Object.keys(b.gm).length > 1 ? '🏆 ' : ''}<b>${esc(g.owner === me.id ? 'You' : g.name)}</b> <span class="abbr">${esc(tid)}</span></td><td>${g.w != null ? g.w + '-' + g.l : ''}</td><td>${esc(g.post || '')}</td><td><b>${Math.round(g.total)}</b></td></tr>`).join('')}</tbody></table></div>` : ''}
      </div></details>`;
  }).join('')}</div></section>`;
}
function viewHistory() {
  const seg = `<section class="card"><div class="pad" style="padding-top:12px"><div class="seg" role="group" aria-label="History"><button type="button" data-act="hsub" data-v="book" aria-pressed="${histSub === 'book'}">Record book</button><button type="button" data-act="hsub" data-v="career" aria-pressed="${histSub === 'career'}">Your career</button><button type="button" data-act="hsub" data-v="hof" aria-pressed="${histSub === 'hof'}">Hall of Fame</button></div></div></section>`;
  return seg + (histSub === 'career' ? viewCareer() : histSub === 'hof' ? viewHof() : viewBook() + viewPastRaces());
}

// ---------------- Live games: watch any game a GM's club played ----------------
// Games involving a human GM carry a play-by-play log (engine), so they can be replayed pitch by pitch
// on the ballpark scoreboard. "Play & watch" sims one day and opens your game straight away.
let wRun = null;
function myGameIndex(mt) { if (!box || !box.games) return -1; return box.games.findIndex(g => (g.h === mt || g.a === mt) && g.log && g.log.length); }
function watchGame(i) {
  const b = box && box.games && box.games[i]; if (!b || !b.log) { if (b) openBox(i); return; }
  const g = { home: b.h, away: b.a, box: b, log: b.log, winner: b.hs > b.as ? b.h : b.a };
  if (wRun) clearTimeout(wRun.t);
  wRun = { i: 0, t: null, feed: [], fast: false, g };
  const mt = myTeam(), nameOf = id => lastName(id);
  openModal(`${b.a} at ${b.h}${box.post ? ' · Postseason' : ''}`, `<div id="wStage"></div>`);
  const hp = b.hb.pit[0][0], ap = b.ab.pit[0][0];
  const intro = `<div class="tbintro"><div class="tbmatch"><span>${esc(TEAM[b.a].city)}<small>${esc(P[ap].name)}</small></span><b>at</b><span>${esc(TEAM[b.h].city)}<small>${esc(P[hp].name)}</small></span></div></div>`;
  const paint = () => {
    const el = $('#wStage'); if (!el) { if (wRun) clearTimeout(wRun.t); wRun = null; return; }
    el.innerHTML = intro + tbBoardHTML(g, wRun.i) + `<div class="tbfeed" aria-live="polite">${wRun.feed.slice(-5).reverse().map((f, k) => `<div class="${f.cls}${k === 0 ? ' new' : ''}">${f.txt}</div>`).join('')}</div>
      <div class="pad row" style="gap:8px;padding-top:10px"><button class="btn" type="button" data-act="w-skip">Skip to the end ▸▸</button></div>`;
  };
  const finale = () => {
    const el = $('#wStage'); if (!el) return;
    const won = mt && g.winner === mt, lost = mt && (b.h === mt || b.a === mt) && !won;
    const walk = g.winner === b.h && b.log.length && b.log[b.log.length - 1][1] === 1 && b.log[b.log.length - 1][4] > 0 && b.log[b.log.length - 1][0] >= 9;
    const stars = [];
    for (const [tid, side] of [[b.a, b.ab], [b.h, b.hb]]) for (const r of side.bat) if (r[8] >= 1 || r[4] >= 3) stars.push(`${esc(P[r[0]].name)} <span class="abbr">${tid}</span> ${r[4]}-for-${r[2]}${r[8] ? `, ${r[8]} HR` : ''}${r[5] ? `, ${r[5]} RBI` : ''}`);
    const dec = b.dec;
    el.innerHTML = tbBoardHTML(g, b.log.length) + `<div class="wfinal ${won ? 'won' : lost ? 'lost' : ''}"><div class="tbbig">${won ? (walk ? 'Walk-off win!' : 'Win!') : lost ? 'Tough loss' : esc(TEAM[g.winner].city) + ' win'}</div><div class="small">${esc(TEAM[b.a].city)} ${b.as}, ${esc(TEAM[b.h].city)} ${b.hs}${b.inn > 9 ? ` in ${b.inn}` : ''} · W: ${esc(P[dec[0]].name)} · L: ${esc(P[dec[1]].name)}${dec[2] != null ? ` · S: ${esc(P[dec[2]].name)}` : ''}</div>${stars.length ? `<div class="small" style="margin-top:8px;display:grid;gap:3px">${stars.slice(0, 4).map(x => `<span>⭐ ${x}</span>`).join('')}</div>` : ''}</div>
      <div class="pad row wrap" style="gap:8px;padding-top:10px">${S.phase === 'season' && canSim() && !needsCall('sim') ? `<button class="btn primary" type="button" data-act="watchnext">▶ Play &amp; watch the next one</button>` : ''}<button class="btn" type="button" data-act="box" data-i="${i}">Box score</button><button class="btn ghost" type="button" data-act="close">Done</button></div>`;
    if (won) el.querySelector('.wfinal').insertAdjacentHTML('afterbegin', `<div class="confetti" aria-hidden="true">${Array.from({ length: 24 }, (_, k) => `<i style="left:${(k * 41) % 100}%;animation-delay:${(k % 8) * 0.1}s;background:${['var(--accent)', 'var(--gold)', '#2f8f5b'][k % 3]}"></i>`).join('')}</div>`);
    if (wRun) clearTimeout(wRun.t); wRun = null;
  };
  const step = () => {
    if (!wRun) return;
    if (wRun.fast) { finale(); return; }
    if (wRun.i >= b.log.length) { finale(); return; }
    const e = b.log[wRun.i], prev = b.log[wRun.i - 1];
    wRun.i++;
    if (!prev || prev[0] !== e[0] || prev[1] !== e[1]) wRun.feed.push({ txt: `<b>${e[1] ? 'Bottom' : 'Top'} ${e[0]}</b> · ${esc(P[e[8]].name)} pitching`, cls: 'half' });
    else if (prev[8] !== e[8]) wRun.feed.push({ txt: `Pitching change: ${esc(P[e[8]].name)}`, cls: 'half' });
    const notable = e[4] > 0 || e[3] === 'hr' || e[3] === 'd' || e[3] === 't' || (e[3] === 'k' && e[7] === 3) || e[0] >= 9;
    if (notable) wRun.feed.push({ txt: playText(e, nameOf), cls: e[4] > 0 ? 'run' : '' });
    paint();
    const close = Math.abs(e[5] - e[6]) <= 2 && e[0] >= 7, nx = b.log[wRun.i], halfEnd = !nx || nx[0] !== e[0] || nx[1] !== e[1];
    wRun.t = setTimeout(step, e[4] > 0 ? 1200 : halfEnd ? 800 : close ? 550 : 230);
  };
  wRun.step = step;
  paint(); wRun.t = setTimeout(step, 1200);
}
async function playAndWatch() {
  const mt = myTeam(); if (!mt || !canSim() || simming) return;
  closeModal();
  await sim(1, { watch: true });
}

// ---------------- Awards (MVP, Cy Young, Rookie of the Year, GM of the Year) and rivalries ----------------
const POS_RUNS = { C: 10, SS: 7, '2B': 3, CF: 3, '3B': 2, RF: -6, LF: -6, '1B': -10, DH: -14 };
function hitVal(a, p) { // season batting line → runs above average
  const pa = a[1]; if (!pa) return null;
  const s1 = a[4] - a[5] - a[6] - a[7], w = (0.69 * a[9] + 0.89 * s1 + 1.27 * a[5] + 1.62 * a[6] + 2.1 * a[7]) / pa;
  return { w, pa, pos: (p.elig && p.elig[0]) || p.pos };
}
function seasonAwards() {
  const len = LEN(), qPA = Math.round(3.1 * len * 0.8), qOuts = Math.round(len * 3 * 0.8);
  const prev = (hist.seasons || []).filter(x => x.season === seasonNo() - 1).pop();
  const rookie = id => { const p = P[id]; if (p.age > 26) return false; if (prev) return !((prev.bat && prev.bat[id] && prev.bat[id][1] >= 130) || (prev.pit && prev.pit[id] && prev.pit[id][5] >= 150)); return !!p.pros || ((p.AB || 0) < 130 && (p.outs || 0) < 150); };
  let tw = 0, tpa = 0; for (const id in S.bat) { const v = P[id] && hitVal(S.bat[id], P[id]); if (v) { tw += v.w * v.pa; tpa += v.pa; } }
  const lgW = tpa ? tw / tpa : 0.315;
  let tr = 0, to = 0; for (const id in S.pit) { const a = S.pit[id]; tr += a[7]; to += a[5]; }
  const lgERA = to ? tr * 27 / to : 4.2;
  const hit = [], pit = [];
  for (const id in S.bat) {
    const p = P[id], a = S.bat[id]; if (!p || p.t !== 'H') continue; const v = hitVal(a, p); if (!v) continue;
    const raa = (v.w - lgW) / 1.2 * v.pa + (POS_RUNS[v.pos] || 0) * v.pa / 600 + 0.2 * a[11];
    hit.push({ id: +id, val: raa, q: v.pa >= qPA, rk: v.pa >= qPA * 0.5 && rookie(+id), line: `${f3(a[4] / Math.max(1, a[2]))}, ${a[7]} HR, ${a[8]} RBI${a[11] >= 15 ? `, ${a[11]} SB` : ''}` });
  }
  for (const id in S.pit) {
    const p = P[id], a = S.pit[id]; if (!p || !a[5]) continue; const era = a[7] * 27 / a[5];
    const val = (lgERA - era) * a[5] / 27 + a[4] * 0.25 + a[2] * 0.4;
    pit.push({ id: +id, val, q: a[5] >= qOuts || (a[4] >= len * 0.2), rk: a[5] >= qOuts * 0.4 && rookie(+id), line: `${a[2]}-${a[3]}, ${era.toFixed(2)} ERA, ${a[9]} K${a[4] ? `, ${a[4]} SV` : ''}` });
  }
  const lgOf = id => { const t = playerTeam(id); return TEAM[t] ? TEAM[t].lg : null; };
  const pick = (arr, lg, f) => { const x = arr.filter(r => f(r) && lgOf(r.id) === lg).sort((a, b) => b.val - a.val)[0]; return x ? [P[x.id].name, playerTeam(x.id), x.line, x.id] : null; };
  const out = {};
  for (const lg of ['AL', 'NL']) {
    const roy = [...hit.filter(r => r.rk && lgOf(r.id) === lg), ...pit.filter(r => r.rk && lgOf(r.id) === lg).map(r => Object.assign({}, r, { val: r.val * 1.1 }))].sort((a, b) => b.val - a.val)[0];
    out[lg] = { mvp: pick(hit, lg, r => r.q), cy: pick(pit, lg, r => r.q), roy: roy ? [P[roy.id].name, playerTeam(roy.id), roy.line, roy.id] : null };
  }
  // GM of the Year: biggest jump in winning percentage among human GMs (best record in a league's first season)
  const prevStd = prev && prev.std, gms = TEAMS.filter(t => ownerOf(t.id));
  const pctOf = s => s[0] / Math.max(1, s[0] + s[1]);
  const scored = gms.map(t => ({ tid: t.id, owner: ownerOf(t.id), d: prevStd && prevStd[t.id] ? pctOf(S.std[t.id]) - pctOf(prevStd[t.id]) : pctOf(S.std[t.id]) - 0.5 }));
  const g = scored.sort((a, b) => b.d - a.d)[0];
  if (g) out.gmoy = [realName(g.owner), g.tid, prevStd && prevStd[g.tid] ? `${prevStd[g.tid][0]}-${prevStd[g.tid][1]} → ${S.std[g.tid][0]}-${S.std[g.tid][1]}` : `${S.std[g.tid][0]}-${S.std[g.tid][1]}`, g.owner];
  return out;
}
function awardsHTML(aw, compact) {
  if (!aw) return '';
  const one = (lab, x) => x ? `<div class="aw"><span class="awl">${lab}</span><span><b>${esc(x[0])}</b> <span class="abbr">${esc(x[1])}</span>${compact ? '' : `<span class="s">${esc(x[2])}</span>`}</span></div>` : '';
  const lgs = ['AL', 'NL'].filter(l => aw[l]);
  return `<div class="awards">${lgs.map(l => `<div class="awcol"><div class="awh">${l}</div>${one('MVP', aw[l].mvp)}${one('Cy Young', aw[l].cy)}${one('Rookie of the Year', aw[l].roy)}</div>`).join('')}</div>${aw.gmoy ? `<div class="aw gm"><span class="awl">GM of the Year</span><span><b>${esc(aw.gmoy[3] === me.id ? 'You' : aw.gmoy[0])}</b> <span class="abbr">${esc(aw.gmoy[1])}</span><span class="s">${esc(aw.gmoy[2])}</span></span></div>` : ''}`;
}
// ---- rivalries: head-to-head between human GMs ----
const h2hKey = (a, b) => [a, b].sort().join('|');
function countRivalry(st, boxes) {
  for (const g of boxes || []) {
    const oh = ownerOf(g.h), oa = ownerOf(g.a); if (!oh || !oa || oh === oa) continue;
    st.h2h = st.h2h || {}; const k = h2hKey(g.h, g.a), r = st.h2h[k] || [0, 0];
    const winner = g.hs > g.as ? g.h : g.a; r[[g.h, g.a].sort()[0] === winner ? 0 : 1]++; st.h2h[k] = r;
  }
}
function h2hOf(a, b, st) { const r = ((st || S).h2h || {})[h2hKey(a, b)]; if (!r) return [0, 0]; return [a, b].sort()[0] === a ? [r[0], r[1]] : [r[1], r[0]]; }
function h2hAllTime(o1, o2) { // across seasons by GM, not club
  let w = 0, l = 0;
  for (const b of (hist && hist.book) || []) for (const [k, r] of Object.entries(b.h2h || {})) {
    const [x, y] = k.split('|'), ox = b.gm[x] && b.gm[x].owner, oy = b.gm[y] && b.gm[y].owner;
    if (ox === o1 && oy === o2) { w += r[0]; l += r[1]; } else if (ox === o2 && oy === o1) { w += r[1]; l += r[0]; }
  }
  return [w, l];
}
function rivalTag(mt, opp) {
  const o = ownerOf(opp); if (!mt || !o || o === ownerOf(mt)) return '';
  const [w, l] = h2hOf(mt, opp);
  return ` <span class="tag red">Rivalry</span> <span class="small" style="color:var(--board-dim)">${esc(ownerName(o))} · season ${w}-${l}</span>`;
}
function rivalsCard(mt) {
  if (!mt) return '';
  const others = TEAMS.filter(t => ownerOf(t.id) && ownerOf(t.id) !== me.id);
  if (!others.length) return '';
  return `<section class="card"><h2>Head to head<span class="sub">your games against the other GMs</span></h2><div class="list">${others.map(t => { const [w, l] = h2hOf(mt, t.id), [aw, al] = h2hAllTime(me.id, ownerOf(t.id)); return `<div class="item"><span class="abbr" style="width:38px">${t.id}</span><div class="nm"><b>${esc(ownerName(ownerOf(t.id)))}</b><span class="s">This season ${w}-${l}${aw + al ? ` · all-time ${aw + w}-${al + l}` : ''}</span></div><span class="tag ${w > l ? 'gold' : w < l ? 'red' : ''}">${w > l ? 'YOU LEAD' : w < l ? 'TRAILING' : 'EVEN'}</span></div>`; }).join('')}</div></section>`;
}

// ---------------- Welcome tour + getting started ----------------
const TOUR = [
  ['⚾', 'Welcome to the front office', mt => `You're the GM of <b>${esc(TEAM[mt].city)}</b>. Win games, run a profitable club and keep the fans coming. Those three add up to your <b>GM Race</b> score, which is how you beat your friends.`],
  ['🗂️', 'The Desk is home base', () => `Anything that needs you shows up under <b>On your desk</b>, most important first. After every sim, news lands at the top of the tab it belongs to, and a red number on a tab means something new is waiting there.`],
  ['📋', 'Team: who plays', () => `Set your lineup, rotation and closer. The <b>Lineup coach</b> spots better choices and fixes them in one tap, or drag players ⠿ around yourself. Rather not bother? Your assistant GM can do it every day.`],
  ['⇄', 'Moves: build the roster', () => `Trade with any club, sign free agents and check the rumor mill. Your scouts suggest deals the other GM would take and tell you whether an offer is any good.`],
  ['▶', 'Play ball', () => `Hit <b>Play</b> to sim a game, a series or more. Tap <b>Play &amp; watch</b> on the Desk to see your next game pitch by pitch. In leagues with friends, everyone gets a Ready check before the commissioner sims.`],
];
let tourI = 0;
function openTour(force) {
  const mt = myTeam(); if (!mt) return;
  if (!force && (localGet('tour') || ($('#modal') && $('#modal').innerHTML))) return;
  localSet('tour', '1');
  tourI = 0; paintTour();
}
function paintTour() {
  const mt = myTeam(), st = TOUR[tourI]; if (!st) { closeModal(); return; }
  const last = tourI === TOUR.length - 1;
  openModal('How to play', `<div class="tour"><div class="tourico" aria-hidden="true">${st[0]}</div><h4>${st[1]}</h4><p>${st[2](mt)}</p>
    <div class="tourdots" aria-label="Step ${tourI + 1} of ${TOUR.length}">${TOUR.map((_, k) => `<i class="${k === tourI ? 'on' : ''}"></i>`).join('')}</div>
    <div class="row" style="gap:8px;justify-content:center">${last ? '' : `<button class="btn ghost" type="button" data-act="close">Skip</button>`}<button class="btn primary" type="button" data-act="tournext">${last ? "Let's play" : 'Next'}</button></div></div>`);
}
function startChecklist(mt) {
  const key = 'start:' + leagueKeyNow();
  if (localGet(key) === 'x') return '';
  const items = [
    ['Claim a club', true, ''],
    ['Check your lineup', !!localGet('seen-team'), `<button class="btn sm" type="button" data-tab="team">Team</button>`],
    ['Look at trade ideas', !!localGet('seen-trade') || !!localGet('seen-office'), `<button class="btn sm" type="button" data-act="ov" data-v="analysis" data-go="office">GM Analysis</button>`],
    ['Play your first games', (S.gp[mt] || 0) > 0 || S.phase !== 'season', `<button class="btn sm primary" type="button" data-act="watchnext">▶ Play &amp; watch</button>`],
  ];
  if (mode === 'shared' && league.kind !== 'solo') items.push(['Get a friend in the league', multiGM(), `<button class="btn sm" type="button" data-act="${league.kind === 'custom' ? 'invite' : 'leagues'}">Invite</button>`]);
  const done = items.filter(x => x[1]).length;
  if (done === items.length) return '';
  return `<section class="card start"><h2>Getting started<span class="sub">${done} of ${items.length} · <button class="lnk" type="button" data-act="tour">How to play</button> · <button class="lnk" type="button" data-act="startx">Hide</button></span></h2><div class="list">${items.map(([t, ok, btn]) => `<div class="item"><span class="chk ${ok ? 'on' : ''}" aria-hidden="true">${ok ? '✓' : ''}</span><div class="nm"><b style="${ok ? 'color:var(--muted);font-weight:500' : ''}">${t}</b></div>${ok ? '' : btn}</div>`).join('')}</div></section>`;
}
function assistantSummary(mt) {
  const a = autoOf(mt), on = ['lineup', 'biz', 'farm'].filter(k => a[k]).map(k => ({ lineup: 'lineup', biz: 'business', farm: 'farm' })[k]);
  return on.length ? `handles your ${on.join(', ')}` : 'off: you run everything';
}

// ---------------- Draft night ----------------
// Opening the offseason reserves a draft class (2 rounds, worst record picks first). GMs pick live in the
// Draft room; computer clubs pick on their own; a GM whose clock runs out gets their scouts' top choice.
// Picks live in league/draft and join the farm when the draft ends (or when free agency closes).
let draft = null, draftOpen = false, draftTab = 'avail', draftPos = 'all';
const DRAFT_CLOCKS = [[60, '1 hour'], [240, '4 hours'], [720, '12 hours'], [5, '5 minutes']];
const draftClock = () => (meta && meta.rules && meta.rules.draftClock) || 60;
const draftLive = () => !!draft && draft.status === 'open' && draft.season === seasonNo();
function draftPoolIds() { const taken = new Set(draft.picks.map(x => x[1])); return draft.ks.filter(k => !taken.has(k)).map(k => W.base + k); }
function ensureDraftPlayers() { if (!draft || !farm || !W) return; for (const k of draft.ks) { const id = W.base + k; if (P[id] && P[id].pros && P[id].ovr != null) continue; if (farm.g && farm.g[id] != null) continue; const p = FO.makeProspect(W, farm.seed, k); W.P[id] = p; FO.setDev(W, p, Math.round((0.6 + 0.35 * ((FO.hash32(farm.seed >>> 0, k + 7) % 1000) / 1000)) * 100) / 100, draft.season + 1, draft.season); } }
function scoutView(tid, id) { // how a club's scouts see a prospect's ceiling (bigger budget = sharper)
  const frac = Math.min(1, setup(tid).scout / FO.ERA.scoutMax), err = 16 * Math.pow(1 - frac, 1.2);
  return P[id].peak.ovr + (((FO.hash32(id, tid.charCodeAt(0) * 31 + tid.charCodeAt(1)) % 1000) / 1000) - 0.5) * 2 * err;
}
function bestFor(tid) { return draftPoolIds().sort((a, b) => scoutView(tid, b) - scoutView(tid, a))[0]; }
async function startDraft(season, order, ks) {
  if (!ks || !ks.length) return;
  draft = { season, ks, order: order.concat(order), picks: [], cur: 0, at: Date.now() + draftClock() * 60e3, status: 'open', ts: Date.now() };
  ensureDraftPlayers();
  if (mode === 'local') saveLocal(); else await writeDoc('league/draft', draft);
}
async function saveDraft() { if (mode === 'local') saveLocal(); else { try { await writeDoc('league/draft', draft); } catch (e) { /* retry next tick */ } } }
async function makePick(tid, id, how) {
  if (!draftLive() || draft.order[draft.cur] !== tid) return;
  const k = id - W.base; if (!draft.ks.includes(k) || draft.picks.some(x => x[1] === k)) return;
  draft = Object.assign({}, draft, { picks: draft.picks.concat([[tid, k, how || 'gm']]), cur: draft.cur + 1, at: Date.now() + draftClock() * 60e3 });
  if (draft.cur >= draft.order.length) draft.status = 'done';
  await saveDraft();
  if (draft.status === 'done') await finishDraft();
  if (draftOpen) paintDraft();
  render();
}
let draftBusy = false, draftLast = 0;
async function draftTick() {
  if (!draftLive() || draftBusy || (mode === 'shared' && !me.canWrite)) return;
  if (Date.now() - draftLast < (draftOpen ? 1300 : 200)) return; // let people watch the computer picks land
  const tid = draft.order[draft.cur], o = ownerOf(tid);
  const auto = !o || (docs[tid] && docs[tid].autoDraft) || (multiGM() && Date.now() >= draft.at) || (!multiGM() && o !== me.id);
  if (!auto) { if (draftOpen) paintClock(); return; }
  draftBusy = true; draftLast = Date.now();
  try { const id = bestFor(tid); if (id != null) await makePick(tid, id, o ? 'scouts' : 'cpu'); } finally { draftBusy = false; }
}
setInterval(() => { draftTick(); }, 400);
async function finishDraft(force) {
  if (!draft || draft.season !== seasonNo()) return;
  if (force && draft.status === 'open') { // closing free agency: everyone left gets their scouts' pick
    while (draft.cur < draft.order.length) { const tid = draft.order[draft.cur], id = bestFor(tid); if (id == null) break; draft.picks.push([tid, id - W.base, ownerOf(tid) ? 'scouts' : 'cpu']); draft.cur++; }
    draft.status = 'done';
  }
  if (draft.status !== 'done' || draft.applied || !farm) return;
  const res = FO.applyDraftPicks(W, farm, seasonNo(), draft.picks.map(x => [x[0], x[1]]));
  draft = Object.assign({}, draft, { applied: Date.now() });
  await saveDraft();
  await setFarm(res.farm);
  const first = draft.picks[0];
  if (first) { S.news.unshift([S.day, `The draft: ${TEAM[first[0]].city} take ${P[W.base + first[1]].name} first overall.`, 'fa', first[0]]); if (mode === 'local') saveLocal(); else writeDoc('league/state', S).catch(() => {}); }
  for (const [tid, k] of draft.picks) if (ownerOf(tid)) logTx({ type: 'farm', from: tid, pid: W.base + k, status: 'drafted', season: seasonNo() });
}
// ---- the room ----
function pickLabel(i) { const n = draft.order.length / 2; return `Round ${i < n ? 1 : 2}, pick ${(i % n) + 1}`; }
function clockText() { const ms = Math.max(0, draft.at - Date.now()), m = Math.floor(ms / 60e3), s = Math.floor(ms % 60e3 / 1e3); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}:${String(s).padStart(2, '0')}`; }
function myNextPick(mt) { for (let i = draft.cur; i < draft.order.length; i++) if (draft.order[i] === mt) return i; return -1; }
function draftRow(id, mt, onClock) {
  const p = P[id];
  return `<div class="item"><span class="${ovrClass(sOvr(id))}">${sOvr(id)}</span><div class="nm"><button class="lnk" type="button" data-act="player" data-p="${id}"><b>${esc(p.name)}</b></button> ${potTag(id)}<span class="s">${posShort(p)} · age ${p.age} · ${esc(etaText(id))}</span></div>${onClock ? `<button class="btn sm primary" type="button" data-act="dpick" data-p="${id}">Draft</button>` : ''}</div>`;
}
function draftBody() {
  ensureDraftPlayers();
  const mt = myTeam(), live = draftLive(), tid = live ? draft.order[draft.cur] : null, onClock = live && tid === mt;
  const nxt = mt && live ? myNextPick(mt) : -1;
  const head = live ? `<div class="dhead ${onClock ? 'me' : ''}"><div class="small">${pickLabel(draft.cur)} · ${draft.cur + 1} of ${draft.order.length}</div><b>${onClock ? "You're on the clock!" : `On the clock: ${esc(TEAM[tid].city)}${ownerOf(tid) ? ' · ' + esc(ownerName(ownerOf(tid))) : ''}`}</b><div class="small" id="dclock">${ownerOf(tid) && multiGM() ? `${clockText()} left, then their scouts pick` : !ownerOf(tid) ? 'Computer club picking…' : ''}</div>${nxt > draft.cur ? `<div class="small">Your next pick: ${pickLabel(nxt)} (${nxt - draft.cur} away)</div>` : ''}</div>`
    : `<div class="dhead"><b>The ${yearOf(seasonNo())} draft is complete</b><div class="small">Drafted players have joined their farm systems.</div></div>`;
  const tabs = `<div class="seg" role="group" aria-label="Draft view" style="margin:10px 14px 0"><button type="button" data-act="dtab" data-v="avail" aria-pressed="${draftTab === 'avail'}">Best available</button><button type="button" data-act="dtab" data-v="board" aria-pressed="${draftTab === 'board'}">Draft board</button><button type="button" data-act="dtab" data-v="mine" aria-pressed="${draftTab === 'mine'}">Your picks</button></div>`;
  let list = '';
  if (draftTab === 'avail') {
    const pos = ['all', 'H', 'SP', 'RP'], filt = id => draftPos === 'all' || (draftPos === 'H' ? P[id].t === 'H' : draftPos === 'SP' ? P[id].role === 'SP' : P[id].t === 'P' && P[id].role !== 'SP');
    const pool = live ? draftPoolIds().filter(filt).sort((a, b) => potSeen(b) - potSeen(a) || P[b].ovr - P[a].ovr) : [];
    list = `<div class="pchips" style="padding:10px 14px 0">${pos.map(k => `<button type="button" class="pchip" data-act="dpos" data-v="${k}" aria-pressed="${draftPos === k}">${({ all: 'All', H: 'Hitters', SP: 'Starters', RP: 'Relievers' })[k]}</button>`).join('')}</div><div class="small muted" style="padding:6px 14px 0">Sorted by your scouts' read on each ceiling${fogErr() ? ' (a bigger scouting budget sharpens it)' : ''}.</div><div class="list">${pool.slice(0, 30).map(id => draftRow(id, mt, onClock)).join('') || '<div class="empty">Nobody left.</div>'}</div>`;
  } else if (draftTab === 'board') {
    list = `<div class="list">${draft.picks.slice().reverse().map(([t, k, how], j) => { const i = draft.picks.length - 1 - j, id = W.base + k; return `<div class="item ${t === mt ? 'mine' : ''}"><span class="slot" style="width:34px">${i + 1}</span><div class="nm"><b>${esc(P[id].name)}</b> ${potTag(id)}<span class="s">${esc(TEAM[t].city)}${ownerOf(t) ? ' · ' + esc(ownerName(ownerOf(t))) : ''}${how === 'scouts' ? ' · scouts\' pick' : ''} · ${posShort(P[id])}, ${P[id].age}</span></div></div>`; }).join('') || '<div class="empty">No picks yet.</div>'}</div>`;
  } else {
    const mine = draft.picks.filter(x => x[0] === mt);
    list = `<div class="list">${mine.map(([, k]) => draftRow(W.base + k, mt, false)).join('') || '<div class="empty">No picks yet.</div>'}</div>`;
  }
  const auto = mt && docs[mt] && docs[mt].autoDraft;
  return head + tabs + list + (mt && live ? `<div class="pad"><label class="sw"><span class="nm"><b>Let my scouts pick for me</b><span class="s">They take the best player on your board the moment you're up.</span></span><input type="checkbox" role="switch" data-autodraft="1" ${auto ? 'checked' : ''}><i aria-hidden="true"></i></label></div>` : '');
}
function openDraft() { if (!draft) return; draftOpen = true; openModal('Draft night', `<div id="draftRoom">${draftBody()}</div>`); }
function paintDraft() { const r = $('#draftRoom'); if (!r) { draftOpen = false; return; } r.innerHTML = draftBody(); }
function paintClock() { const c = $('#dclock'); if (c && draftLive() && ownerOf(draft.order[draft.cur]) && multiGM()) c.textContent = `${clockText()} left, then their scouts pick`; if (!$('#draftRoom')) draftOpen = false; }
function draftDeskCard(mt) {
  if (!draft || draft.season !== seasonNo() || !mt) return null;
  if (draftLive()) {
    const on = draft.order[draft.cur] === mt, nxt = myNextPick(mt);
    return { pri: 102, icon: '🎓', title: on ? "Draft night: you're on the clock!" : 'Draft night is live', body: on ? `${pickLabel(draft.cur)}. ${multiGM() ? clockText() + ' left before your scouts pick for you.' : 'Take your time. The draft waits for you.'}` : nxt >= 0 ? `Pick ${draft.cur + 1} of ${draft.order.length}. You're up in ${nxt - draft.cur} pick${nxt - draft.cur > 1 ? 's' : ''}.` : `Pick ${draft.cur + 1} of ${draft.order.length}. Your picks are in.`, btn: ['draft', on ? 'Make your pick' : 'Watch the draft'] };
  }
  if (Date.now() - (draft.applied || 0) < 3 * 864e5) { const mine = draft.picks.filter(x => x[0] === mt).map(x => P[W.base + x[1]]).filter(Boolean); if (mine.length) return { pri: 50, icon: '🎓', title: 'Your draft class', body: mine.map(p => `${esc(p.name)} (${posShort(p)})`).join(', ') + ' joined your farm.', btn: ['draft', 'Draft recap'] }; }
  return null;
}

// ---------------- Bring leagues over from the Claude version (web only) ----------------
// import/claude.json holds the leagues as they were on Claude. Each GM says which club was theirs; their old
// Claude id is swapped for their new account everywhere, the league is copied in once, and their solo league
// comes along too.
let importData = null;
async function loadImport() { if (importData) return importData; const r = await fetch('import/claude.json', { cache: 'no-store' }); if (!r.ok) throw new Error('missing'); importData = await r.json(); return importData; }
const claimedKey = () => 'claude-claimed:' + me.id;
function importCard() {
  if (!WEB || mode !== 'shared' || localGet(claimedKey())) return '';
  return `<section class="card import"><div class="pad row wrap" style="padding-top:14px;gap:12px"><span style="flex:1;min-width:200px"><b>Played on the Claude version?</b><span class="small muted" style="display:block">Bring your leagues and seasons over in one tap.</span></span><button class="btn primary sm" type="button" data-act="importopen">Bring them over</button><button class="btn ghost sm" type="button" data-act="importskip">Not me</button></div></section>`;
}
async function openImport() {
  let d; try { d = await loadImport(); } catch (e) { toast('Nothing to bring over right now.'); return; }
  const rows = Object.entries(d.people).map(([id, p]) => `<button class="item improw" type="button" data-act="importdo" data-id="${esc(id)}"><span class="abbr" style="width:40px">${esc(p.tid)}</span><div class="nm"><b>${esc(p.label)}</b><span class="s">${d.solo[id] ? 'Includes your solo league' : 'League seasons and history'}</span></div><span class="chev" aria-hidden="true">›</span></button>`).join('');
  openModal('Bring your leagues over', `<div class="pad small" style="padding-top:12px">Which club was yours? Pick yourself and everything comes with you: your club, your seasons and records${Object.keys(d.solo).length ? ', and your solo league' : ''}.</div><div class="list">${rows}</div><div class="pad small muted" style="padding-top:10px">Only pick your own club. Each club can be claimed once.</div>`);
}
async function doImport(cid) {
  const d = await loadImport(), p = d.people[cid]; if (!p || busy) return;
  busy = true; toast('Bringing your leagues over…');
  const swap = obj => JSON.parse(JSON.stringify(obj).split(cid).join(me.id));
  try {
    for (const [lid, L] of Object.entries(d.leagues)) {
      const reg = await db.doc('leagues/' + lid).get();
      if (!reg.exists) { // first GM in: copy the whole league
        for (const [path, doc] of Object.entries(L.docs)) await db.doc('leagues/' + lid + '/' + path).set(swap(doc));
        await db.doc('leagues/' + lid).set(swap(L.registry));
      } else { // already copied by a friend: just swap my old id for my account
        const r = reg.data(); if (JSON.stringify(r).includes(me.id) && !JSON.stringify(r).includes(cid)) { /* already mine */ }
        await db.doc('leagues/' + lid).set(swap(r));
        for (const path of Object.keys(L.docs).filter(x => x.startsWith('teams/') || x === 'league/meta' || x === 'league/history')) {
          const s = await db.doc('leagues/' + lid + '/' + path).get(); if (s.exists && JSON.stringify(s.data()).includes(cid)) await db.doc('leagues/' + lid + '/' + path).set(swap(s.data()));
        }
        const h = await db.doc('leagues/' + lid + '/league/history').get(); if (h.exists && JSON.stringify(h.data()).includes(cid)) await db.doc('leagues/' + lid + '/league/history').set(swap(h.data()));
      }
    }
    const solo = d.solo[cid];
    if (solo) {
      const cur = await db.doc('data/users/' + me.id + '/solo/league/meta').get();
      if (!cur.exists || confirm('Replace your current solo league with the one from the Claude version?')) for (const [path, doc] of Object.entries(solo.docs)) await db.doc('data/users/' + me.id + '/solo/' + path).set(swap(doc));
    }
    localSet(claimedKey(), cid);
    closeModal();
    busy = false;
    if (p.league && d.leagues[p.league]) switchLeague({ kind: 'custom', id: p.league, name: d.leagues[p.league].registry.name });
    toast('Welcome back. Your leagues are here.');
  } catch (e) { toast('Could not finish bringing them over. Try again.'); } finally { busy = false; render(); }
}

// ---------------- Claude version: send your private solo league to the new site ----------------
async function sendSoloToWeb() {
  if (WEB || mode !== 'shared' || busy) return;
  busy = true; toast('Packing up your solo league…');
  try {
    const base = 'data/users/' + me.id + '/solo/', out = {};
    for (const d of ['meta', 'state', 'box', 'farm', 'history', 'draft']) { const s = await db.doc(base + 'league/' + d).get(); if (s.exists) out['league/' + d] = s.data(); }
    const t = await db.collection(base + 'teams').get(); t.docs.forEach(x => { out['teams/' + x.id] = x.data(); });
    if (!out['league/meta']) { toast("You don't have a solo league to send."); return; }
    await db.doc('transfer/' + me.id).set({ docs: out, name: me.name || '', ts: Date.now() });
    toast('Sent. Tell Sam it is ready to bring over.');
  } catch (e) { toast('Could not send it. Try again.'); } finally { busy = false; }
}
// ---------------- Deal builder: "who do I give up?" ----------------
// Pick the player(s) you want; your scouts try every sensible package from your roster and farm, keep the
// ones the other GM accepts, and rank them by what each does to your team this season.
let builder = null; // { key, opts }
function rosterRating(mt, roster) {
  const r = roster.filter(id => P[id] && !injDays(id));
  const lineup = FO.autoLineup(P, r), st = FO.autoStaff(P, r);
  const pen = r.filter(id => P[id].t === 'P' && !st.rotation.includes(id));
  const u = unitRatings(mt, { lineup, rotation: st.rotation, pen, closer: st.closer });
  const bat = POS9.reduce((a, p) => a + (u[p] ? u[p].ovr : 40), 0) / 9;
  return { bat: bat * 0.52, pit: u.SP.ovr * 0.33 + u.RP.ovr * 0.15, lineup, st };
}
const WINS_PER_PT = () => 0.013 * LEN(); // matches the projection model: one point of team rating ≈ 2 wins over 162
function dealImpact(mt, give, get) {
  const now = rosterOf(mt), after = now.filter(id => !give.includes(id)).concat(get.filter(id => !farmOrg(id)));
  const a = rosterRating(mt, now), b = rosterRating(mt, after);
  const k = WINS_PER_PT();
  return { hit: (b.bat - a.bat) * k, pit: (b.pit - a.pit) * k, total: (b.bat + b.pit - a.bat - a.pit) * k };
}
function buildDeals(mt, tid, get) {
  const key = [mt, tid, get.slice().sort().join('.'), S.day, seasonNo(), rosterOf(mt).length, cashOf(mt) > 0].join('|');
  if (builder && builder.key === key) return builder.opts;
  const human = !!ownerOf(tid), ctx = ctxFor(tid);
  const healthy = rosterOf(mt).filter(id => !injDays(id));
  const best = rosterRating(mt, healthy), lineupIds = new Set(best.lineup.map(x => x[0])), rot = new Set(best.st.rotation);
  const top3 = new Set(healthy.slice().sort((a, b) => P[b].ovr - P[a].ovr).slice(0, 3));
  const farmPool = farmOf(mt).filter(id => !minorsOf(mt).includes(id));
  const spare = healthy.filter(id => !lineupIds.has(id) && !rot.has(id) && id !== best.st.closer);
  const starters = healthy.filter(id => !top3.has(id) && !spare.includes(id));
  const mv = id => myValue([id], false);
  const fcost = id => farmOrg(id) ? potSeen(id) : Math.max(sOvr(id), P[id].pros ? potSeen(id) : 0); // what it feels like to give him up
  const accepts = (give, cash) => {
    const legal = FO.evalTrade(W, rosterOf(mt), rosterOf(tid), mlbOf(give, mt), mlbOf(get, tid));
    if (legal.errFrom || legal.errTo) return false;
    if (cash > 0 && cash > cashOf(mt)) return false;
    return FO.aiEvaluate(W, ctx, give.map(pinfo), get.map(pinfo), cash).accept;
  };
  // try singles, pairs and a few triples from a pool; keep every package the other GM would take
  const search = (pool, cashSteps) => {
    const all = [...new Set(pool)], c = all.slice().sort((a, b) => mv(b) - mv(a)).slice(0, 16), found = []; // most valuable pieces first: stars cost real players
    const tryIt = (give, cash) => { if (accepts(give, cash)) found.push({ give, cash }); };
    for (const cash of cashSteps) {
      for (const a of all) tryIt([a], cash);
      for (let i = 0; i < c.length; i++) for (let j = i + 1; j < c.length; j++) tryIt([c[i], c[j]], cash);
      if (found.length < 3) for (let i = 0; i < Math.min(10, c.length); i++) for (let j = i + 1; j < Math.min(10, c.length); j++) for (let l = j + 1; l < Math.min(10, c.length); l++) tryIt([c[i], c[j], c[l]], cash);
      if (found.length) break;
    }
    return found;
  };
  const step = 1e6 * SC(), cashLadder = [0].concat(cashOf(mt) > step ? [2, 4, 6, 8].map(n => n * step).filter(v => v <= cashOf(mt)) : []);
  const strategies = [
    { k: 'now', title: 'Best for this season', why: 'Keeps your team as strong as possible right now.', pool: spare.concat(farmPool, starters), cash: [0] },
    { k: 'spare', title: 'Spare parts only', why: 'Bench players, extra arms and prospects. Your starters stay put.', pool: spare.concat(farmPool), cash: [0] },
    { k: 'kids', title: 'Prospect package', why: 'Pay with the farm and keep the whole big-league roster.', pool: farmPool, cash: [0] },
    { k: 'cash', title: 'Add cash', why: 'Use money to give up less talent.', pool: spare.concat(farmPool), cash: cashLadder.slice(1) },
  ];
  const opts = [], seen = new Set(), misses = [], allFound = [];
  for (const s of strategies) {
    if (!s.pool.length || !s.cash.length) continue;
    const found = search(s.pool, s.cash);
    if (!found.length) { misses.push(s.title.toLowerCase()); continue; }
    // rank by effect on this season, then by future value given up
    const scored = found.map(f => Object.assign(f, { imp: dealImpact(mt, f.give, get), val: f.give.reduce((a, id) => a + fcost(id), 0) + f.cash / step * 3 }));
    allFound.push(...scored);
    scored
      .sort((x, y) => (s.k === 'kids' || s.k === 'cash' ? x.val - y.val : 0) || y.imp.total - x.imp.total || x.val - y.val);
    const pick = scored.find(f => !seen.has(f.give.slice().sort().join('.') + ':' + f.cash));
    if (!pick) continue;
    seen.add(pick.give.slice().sort().join('.') + ':' + pick.cash);
    const salIn = get.reduce((a, id) => a + (rosterOf(tid).includes(id) ? salFor(id, tid) : 0), 0), salOut = pick.give.reduce((a, id) => a + (rosterOf(mt).includes(id) ? salFor(id, mt) : 0), 0);
    opts.push(Object.assign({}, s, pick, { pay: salIn - salOut, human }));
  }
  // "Best for this season" is the single best package found by any route
  const bestNow = allFound.slice().sort((x, y) => y.imp.total - x.imp.total || x.val - y.val)[0];
  const sig = f => f.give.slice().sort().join('.') + ':' + f.cash;
  let final = opts.filter(o => o.k !== 'now');
  if (bestNow) {
    const s0 = strategies[0], salIn = get.reduce((a, id) => a + (rosterOf(tid).includes(id) ? salFor(id, tid) : 0), 0), salOut = bestNow.give.reduce((a, id) => a + (rosterOf(mt).includes(id) ? salFor(id, mt) : 0), 0);
    final = [Object.assign({}, s0, bestNow, { pay: salIn - salOut, human })].concat(final.filter(o => sig(o) !== sig(bestNow)));
  }
  // drop packages that another option beats: same or better this season for less future talent
  final = final.filter((b, i) => !final.some((a, j) => j !== i && a.imp.total >= b.imp.total - 0.05 && a.val <= b.val && (a.val < b.val || j < i)));
  opts.length = 0; final.forEach(o => opts.push(o));
  opts.misses = misses.filter(m => m !== strategies[0].title.toLowerCase());
  builder = { key, opts };
  return opts;
}
let builderOpen = ''; // key of the target set the builder is open for
const bKey = (tid, get) => tid + ':' + get.slice().sort().join('.');
function dealBuilderCard(mt, tid, get) {
  if (!get.length || !mt || tid === mt) return '';
  const names = get.map(id => esc(P[id].name)).join(' + ');
  if (builderOpen !== bKey(tid, get)) return `<div class="builder pad"><button class="btn primary big" type="button" data-act="buildopen" style="width:100%">Build this deal for me</button><div class="small muted" style="margin-top:6px;text-align:center">Your scouts find packages for ${names} that won't wreck your team.</div></div>`;
  const opts = buildDeals(mt, tid, get), human = !!ownerOf(tid);
  const fmtW = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1);
  const body = opts.length ? opts.map((o, i) => `<div class="bopt">
      <div class="row" style="gap:8px;align-items:baseline"><b style="flex:1">${o.title}</b><span class="tag ${o.imp.total >= 0 ? 'mine' : 'red'}">${fmtW(o.imp.total)} wins</span></div>
      <div class="small muted">${o.why}</div>
      <div class="idealegs" style="grid-template-columns:1fr"><div class="leg"><span class="lh">You send</span>${o.give.map(id => ratedChip(id, mt)).join('')}${o.cash ? `<div class="rc"><span class="ovr">$</span><div class="nm"><b>${money(o.cash)}</b><span class="s">cash</span></div></div>` : ''}</div></div>
      <div class="small">This season: hitting ${fmtW(o.imp.hit)}, pitching ${fmtW(o.imp.pit)} wins · payroll ${o.pay >= 0 ? '+' : '−'}${money(Math.abs(o.pay))}${human ? '' : ` · <b>${esc(TEAM[tid].city)} says yes</b>`}</div>
      <div><button class="btn sm primary" type="button" data-act="builduse" data-i="${i}">Use this deal</button></div></div>`).join('')
    : `<div class="small pad">Your scouts couldn't find a package ${esc(TEAM[tid].city)} would take for ${names}. ${cashOf(mt) <= 0 ? 'Getting your cash above zero opens up cash deals.' : 'Try a less expensive target, or add one of your better players yourself.'}</div>`;
  const miss = opts.length && opts.misses && opts.misses.length ? `<div class="small muted pad" style="padding-top:8px">No luck with ${opts.misses.join(', ')}: ${esc(TEAM[tid].city)} wants more than that for ${names}.</div>` : '';
  return `<div class="builder"><div class="row pad" style="padding-top:12px;gap:8px"><b style="flex:1">Deals for ${names}</b><button class="btn ghost sm" type="button" data-act="buildclose">Hide</button></div>${human ? `<div class="small muted pad" style="padding-top:0">${esc(ownerName(ownerOf(tid)))} decides for real. These are fair by the computer GMs' standards.</div>` : ''}${body}${miss}</div>`;
}
function useDeal(i) {
  const o = builder && builder.opts[i]; if (!o) return;
  tradeGive = new Set(o.give); tradeCash = o.cash || 0; builderOpen = ''; lastFeedback = null;
  render(); toast('Deal loaded. Review it, then propose.');
}

// ---------------- Search any player from the header ----------------
let gQ = '';
function gsearchResults() {
  const mt = myTeam(), q = gQ.trim().toLowerCase();
  if (q.length < 2) return '<div class="empty">Type at least two letters of a name.</div>';
  const fa = new Set(freeAgents());
  const ids = P.filter(p => p && p.name && !p.dup && p.name.toLowerCase().includes(q)).map(p => p.id).filter(id => { const o = orgOf(id); return o !== 'FA' || fa.has(id); })
    .sort((a, b) => sOvr(b) - sOvr(a)).slice(0, 30);
  if (!ids.length) return `<div class="empty">No player named “${esc(gQ)}”.</div>`;
  return ids.map(id => {
    const p = P[id], org = orgOf(id), isFa = org === 'FA', fg = !!farmOrg(id), mine = org === mt;
    const where = mine ? 'Your club' + (fg ? ' · farm' : '') : isFa ? `Free agent · asks ${money(askNow(id, mt))}` : `${esc(TEAM[org].city)}${fg ? ' farm · ' + potGrade(id) + ' potential' : ' · ' + money(salFor(id, org)) + '/yr'}`;
    const btn = !mt || mine ? (mine ? '<span class="tag mine">Yours</span>' : '') : isFa ? `<button class="btn sm primary" type="button" data-act="fa" data-p="${id}">Sign</button>` : marketOpen() ? `<button class="btn sm" type="button" data-act="tradefor" data-p="${id}">Trade for</button>` : '';
    return `<div class="item"><span class="${ovrClass(sOvr(id))}">${sOvr(id)}</span><div class="nm"><button class="lnk" type="button" data-act="player" data-p="${id}"><b>${esc(p.name)}</b></button> <span class="muted small">${posShort(p)} · ${p.age}</span>${ilTag(id)}<span class="s">${where}</span></div>${btn}</div>`;
  }).join('');
}
function openSearch() {
  if (!S || !W) return;
  openModal('Find a player', `<div class="pad" style="padding-top:12px"><input type="search" id="gQ" placeholder="Search any player by name" value="${esc(gQ)}" autocomplete="off" aria-label="Search players by name" style="width:100%"></div><div class="list" id="gRes">${gsearchResults()}</div>`);
  setTimeout(() => { const i = $('#gQ'); if (i) { i.focus(); i.select(); } }, 50);
}
// ---------------- Flexible deals: remove or swap anyone ----------------
function dealSides() { return { give: [...tradeGive], get: [...tradeGet] }; }
function acceptsNow(give, get, cash) {
  const mt = myTeam(), tid = tradePartner;
  const legal = FO.evalTrade(W, rosterOf(mt), rosterOf(tid), mlbOf(give, mt), mlbOf(get, tid));
  if (legal.errFrom || legal.errTo) return null;
  if (cash > 0 && cash > cashOf(mt)) return null;
  if (cash < 0 && ctxFor(tid).cash < -cash) return null;
  return FO.aiEvaluate(W, ctxFor(tid), give.map(pinfo), get.map(pinfo), cash).accept;
}
function openSwap(pid, side) {
  const mt = myTeam(), tid = side === 'give' ? mt : tradePartner, d = dealSides(), inDeal = new Set(d.give.concat(d.get));
  const pool = rosterOf(tid).concat(farmOf(tid).filter(id => !minorsOf(tid).includes(id))).filter(id => !inDeal.has(id) && !injDays(id));
  const v0 = myValue([pid], side === 'get');
  const alts = pool.sort((a, b) => (P[b].t === P[pid].t) - (P[a].t === P[pid].t) || Math.abs(myValue([a], side === 'get') - v0) - Math.abs(myValue([b], side === 'get') - v0)).slice(0, 14);
  const human = !!ownerOf(tradePartner);
  const rows = alts.map(id => {
    const give = side === 'give' ? d.give.map(x => x === pid ? id : x) : d.give, get = side === 'get' ? d.get.map(x => x === pid ? id : x) : d.get;
    const ok = human ? null : acceptsNow(give, get, tradeCash), imp = dealImpact(mt, give, get);
    const verdict = human ? '' : ok ? '<span class="tag mine">They say yes</span>' : ok === false ? '<span class="tag">Not enough</span>' : '<span class="tag red">Roster rules</span>';
    return `<div class="item"><span class="${ovrClass(sOvr(id))}">${sOvr(id)}</span><div class="nm"><b>${esc(P[id].name)}</b> <span class="muted small">${posShort(P[id])} · ${P[id].age}</span> ${verdict}<span class="s">${farmOrg(id) ? potGrade(id) + ' potential · prospect' : money(salFor(id, tid)) + '/yr'} · your season ${imp.total >= 0 ? '+' : '−'}${Math.abs(imp.total).toFixed(1)} wins</span></div><button class="btn sm primary" type="button" data-act="swapdo" data-p="${pid}" data-n="${id}" data-side="${side}">Swap in</button></div>`;
  }).join('');
  openModal(`Swap out ${P[pid].name}`, `<div class="pad small" style="padding-top:12px">${side === 'give' ? 'Send one of these instead.' : `Ask ${esc(TEAM[tid].city)} for one of these instead.`} Closest in value first${human ? '' : ', with what their GM would say'}.</div><div class="list">${rows || '<div class="empty">Nobody else to swap in.</div>'}</div>
    <div class="pad row" style="padding-top:10px"><button class="btn ghost" type="button" data-act="dremove" data-p="${pid}" data-side="${side}">Just remove ${esc(lastName(pid))}</button></div>`);
}
function swapDo(pid, nid, side) {
  const set = side === 'give' ? tradeGive : tradeGet;
  set.delete(pid); set.add(nid); builderOpen = ''; lastFeedback = null; closeModal(); render();
  toast(`${P[nid].name} is in the deal.`);
}
// ---------------- Cash: what would money do? ----------------
function cashSway(mt, tid, give, get) {
  if (ownerOf(tid) || !give.length && !get.length) return '';
  const step = 500000 * SC(), now = acceptsNow(give, get, tradeCash);
  if (now === null) return '';
  if (!now) {
    const cap = Math.min(cashOf(mt), 40 * step * 2);
    for (let c = Math.max(step, Math.ceil(Math.max(0, tradeCash) / step) * step + step); c <= cap; c += step) {
      if (acceptsNow(give, get, c)) return `<div class="sway"><span>💰 Add <b>${money(c)}</b> in cash and ${esc(TEAM[tid].city)} says yes.</span><button class="btn sm primary" type="button" data-act="cashset" data-v="${c}">Add ${money(c)}</button></div>`;
    }
    return `<div class="sway no"><span>💰 ${cashOf(mt) > step ? `Even ${money(cap)} in cash won't get this done. Add a better player.` : 'You need cash above zero before money can sweeten a deal.'}</span></div>`;
  }
  // they already say yes: how much would they pay you on top?
  let best = 0;
  for (let c = -step; c >= -40 * step; c -= step) { if (acceptsNow(give, get, c)) best = c; else break; }
  if (best < Math.min(0, tradeCash) - 1) return `<div class="sway"><span>💰 They'd say yes and still send you up to <b>${money(-best)}</b>.</span><button class="btn sm" type="button" data-act="cashset" data-v="${best}">Ask for ${money(-best)}</button></div>`;
  return `<div class="sway ok"><span>✅ ${esc(TEAM[tid].city)} says yes to this as it stands.</span></div>`;
}

// ---------------- Add a player to the deal (with recommendations) ----------------
function addPickRows(side) {
  const mt = myTeam(), tid = side === 'give' ? mt : tradePartner, human = !!ownerOf(tradePartner);
  const give = [...tradeGive], get = [...tradeGet], inDeal = new Set(give.concat(get));
  const mlb = rosterOf(tid).filter(id => !inDeal.has(id) && !injDays(id));
  const farm = farmOf(tid).filter(id => !minorsOf(tid).includes(id) && !inDeal.has(id));
  const base = rosterRating(mt, rosterOf(mt).filter(id => !injDays(id))), k = WINS_PER_PT();
  const startSpot = (r, id) => { const l = r.lineup.find(x => x[0] === id); return l ? 'Starts at ' + l[1] : r.st.rotation.includes(id) ? 'Joins your rotation' : r.st.closer === id ? 'Your new closer' : ''; };
  const rate = id => {
    const g2 = side === 'give' ? give.concat(id) : give, t2 = side === 'get' ? get.concat(id) : get;
    const after = rosterOf(mt).filter(x => !g2.includes(x) && !injDays(x)).concat(t2.filter(x => !farmOrg(x) && !injDays(x)));
    const r = rosterRating(mt, after), w = (r.bat + r.pit - base.bat - base.pit) * k;
    return { id, w, ok: human ? null : acceptsNow(g2, t2, tradeCash), fit: side === 'get' && !farmOrg(id) ? startSpot(r, id) : '', v: myValue([id], side === 'get') };
  };
  const rows = mlb.map(rate), kids = farm.map(id => ({ id, w: 0, ok: human ? null : acceptsNow(side === 'give' ? give.concat(id) : give, side === 'get' ? get.concat(id) : get, tradeCash), v: myValue([id], side === 'get'), kid: true }));
  let picks;
  if (side === 'get') { // who helps you most this season, then the best prospects
    rows.sort((a, b) => b.w - a.w);
    picks = rows.filter(r => r.w > 0.3).slice(0, 4);
  } else { // what gets the deal done and hurts you least
    rows.sort((a, b) => (b.ok === true) - (a.ok === true) || b.w - a.w || b.v - a.v);
    kids.sort((a, b) => (b.ok === true) - (a.ok === true) || a.v - b.v);
    picks = rows.concat(kids).filter(r => r.ok === true).sort((a, b) => b.w - a.w || a.v - b.v).slice(0, 4);
    if (!picks.length) picks = rows.filter(r => r.w > -0.4).sort((a, b) => b.v - a.v).slice(0, 4);
  }
  kids.sort((a, b) => potSeen(b.id) - potSeen(a.id));
  const pickSet = new Set(picks.map(r => r.id));
  const fmtW = v => (v >= 0 ? '+' : '−') + Math.abs(v).toFixed(1);
  const why = r => {
    const out = [];
    if (r.ok === true) out.push(`<span class="tag mine">${side === 'give' ? 'Gets it done' : 'They still say yes'}</span>`);
    else if (r.ok === null && !human) out.push('<span class="tag red">Roster rules</span>');
    if (r.fit) out.push(`<span class="tag">${esc(r.fit)}</span>`);
    return out.join(' ');
  };
  const row = r => {
    const p = P[r.id], sub = r.kid ? `${potGrade(r.id)} potential · ${esc(etaText(r.id))}` : `${money(salFor(r.id, tid))}/yr · ${give.length + get.length ? 'whole deal' : 'your season'} <b>${fmtW(r.w)}</b> wins`;
    return `<div class="item"><span class="${ovrClass(sOvr(r.id))}">${sOvr(r.id)}</span><div class="nm"><b>${esc(p.name)}</b> <span class="muted small">${posShort(p)} · ${p.age}</span> ${why(r)}<span class="s">${sub}</span></div><button class="btn sm${pickSet.has(r.id) ? ' primary' : ''}" type="button" data-act="addpick" data-p="${r.id}" data-side="${side}">Add</button></div>`;
  };
  const rest = rows.filter(r => !pickSet.has(r.id)).sort((a, b) => sOvr(b.id) - sOvr(a.id));
  const recTitle = side === 'get' ? 'Best fits for your club' : human ? 'Cost you the least' : `What ${esc(TEAM[tradePartner].city)} would take`;
  const recNote = side === 'get' ? 'Who adds the most wins to your team this season.' : human ? 'Players you can spare without hurting this season.' : (picks.some(r => r.ok) ? 'Each of these makes the deal work on its own, and costs you the fewest wins.' : 'No one player gets this done alone. These are worth the most to them without gutting your team.');
  return `${picks.length ? `<div class="grp">${recTitle}</div><div class="small muted pad" style="padding-top:0">${recNote}</div>${picks.map(row).join('')}` : ''}
    <div class="grp">${side === 'give' ? 'Your roster' : esc(TEAM[tid].city) + ' roster'}</div>${rest.map(row).join('') || '<div class="empty">Nobody else.</div>'}
    ${kids.filter(r => !pickSet.has(r.id)).length ? `<div class="grp">Farm</div>${kids.filter(r => !pickSet.has(r.id)).map(row).join('')}` : ''}`;
}
function openAddPick(side) {
  if (!tradePartner) return;
  openModal(side === 'give' ? 'Add one of your players' : `Add from ${TEAM[tradePartner].city}`, `<div class="list">${addPickRows(side)}</div>`);
}
function addPick(pid, side) {
  (side === 'give' ? tradeGive : tradeGet).add(pid); builderOpen = ''; lastFeedback = null; closeModal(); render();
  toast(`${P[pid].name} added to the deal.`);
}
// ---------------- Hold +/− to keep stepping ----------------
const HOLD_ACTS = new Set(['cashstep', 'bidstep', 'negstep', 'price']);
let holdS = null, holdSuppress = 0;
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('[data-act][data-d]'); if (!b || !HOLD_ACTS.has(b.dataset.act) || e.button > 0) return;
  const sel = `[data-act="${b.dataset.act}"][data-d="${b.dataset.d}"]`, slow = b.dataset.act === 'price' ? 140 : 0;
  holdS = { n: 0 }; holdSuppress = 0;
  const tick = () => {
    const el = document.querySelector(sel); if (!el || !holdS || el.disabled) return;
    holdS.n++; holdS.firing = true; el.click(); holdS.firing = false;
    holdS.t = setTimeout(tick, Math.max(45 + slow, 170 - holdS.n * 10));
  };
  holdS.t = setTimeout(tick, 400);
});
const holdEnd = () => { if (!holdS) return; clearTimeout(holdS.t); if (holdS.n) holdSuppress = Date.now() + 400; holdS = null; };
['pointerup', 'pointercancel', 'blur'].forEach(ev => window.addEventListener(ev, holdEnd));
document.addEventListener('click', e => { // the release after a hold shouldn't count as one more tap
  if (holdS && holdS.firing) return;
  if (holdSuppress > Date.now() && e.target.closest('[data-act][data-d]')) { holdSuppress = 0; e.stopImmediatePropagation(); e.preventDefault(); }
}, true);

// ---------------- Feedback: friends send ideas, Sam reads them ----------------
const FB_ADMIN_ID = 'u_2oMsl4DOTWcSKpu9XbhK_A';
let fbDraft = '', fbKind = 'idea', fbSent = 0, fbInbox = null, fbUnsub = null, fbShowDone = false;
const FB_KINDS = { idea: ['💡', 'Idea'], issue: ['🐞', 'Issue'], love: ['❤️', 'Love it'] };
function isAdmin() { return mode === 'shared' && (me.id === FB_ADMIN_ID || !!window.foAdmin); }
function fbSeen() { return +(localGet('fb-seen') || 0); }
function fbUnreadSafe() { try { return fbUnread(); } catch (e) { return 0; } }
function fbUnread() { return isAdmin() && fbInbox ? fbInbox.filter(x => !x.done && x.ts > fbSeen()).length : 0; }
function watchFeedback() {
  if (!isAdmin() || fbUnsub) return;
  fbUnsub = db.collection('feedback').orderBy('ts', 'desc').limit(200).onSnapshot(q => { fbInbox = q.docs.map(d => Object.assign({ id: d.id }, d.data())); renderTabs(); refreshFb(); }, () => { fbInbox = []; });
}
function feedbackForm() {
  if (mode !== 'shared') return `<div class="pad small">${WEB ? 'Sign in with Google to send feedback.' : 'Feedback needs the shared version of the game.'}</div>`;
  if (fbSent && Date.now() - fbSent < 8000) return `<div class="pad"><div class="sway ok"><span>✅ Thanks! Sam will read it.</span></div><div style="margin-top:10px"><button class="btn sm" type="button" data-act="fbmore">Send more</button></div></div>`;
  return `<div class="pad"><div class="seg" role="group" aria-label="Kind of feedback">${Object.entries(FB_KINDS).map(([k, [ic, lab]]) => `<button type="button" data-act="fbkind" data-v="${k}" aria-pressed="${fbKind === k}">${ic} ${lab}</button>`).join('')}</div>
    <textarea id="fbText" rows="5" maxlength="2000" placeholder="${fbKind === 'issue' ? 'What happened, and where? (e.g. the trade screen cut off a button)' : fbKind === 'love' ? 'What do you like? It helps to know what to keep.' : 'What would make the game better or easier?'}" aria-label="Your feedback" style="width:100%;margin-top:10px">${esc(fbDraft)}</textarea>
    <div class="row" style="margin-top:8px;align-items:center"><span class="small muted" style="flex:1">Goes straight to Sam with your name.</span><button class="btn primary" type="button" data-act="fbsend">Send</button></div></div>`;
}
async function sendFeedback() {
  const text = fbDraft.trim();
  if (text.length < 3) { toast('Write a few words first.'); return; }
  try {
    const id = 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    await db.doc('feedback/' + id).set({ by: me.id, name: me.name || 'GM', kind: fbKind, text: text.slice(0, 2000), ts: Date.now(), tab: tab, league: leagueLabel(), team: myTeam() || '', era: meta && meta.era || '', app: WEB ? 'web' : 'claude' });
    fbDraft = ''; fbSent = Date.now(); refreshFb();
  } catch (e) { toast('Could not send. Try again in a minute.'); }
}
let lastTabBeforeOffice = 'desk';
function feedbackInbox() {
  if (!fbInbox) return '<div class="empty">Loading feedback…</div>';
  const list = fbInbox.filter(x => fbShowDone || !x.done), seen = fbSeen();
  const dt = ts => new Date(ts).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const rows = list.map(x => `<div class="item fbitem${x.done ? ' done' : ''}"><span class="fbic" aria-hidden="true">${(FB_KINDS[x.kind] || FB_KINDS.idea)[0]}</span><div class="nm"><b>${esc(x.name || 'GM')}</b>${x.ts > seen && !x.done ? ' <span class="tag mine">New</span>' : ''} <span class="muted small">${dt(x.ts)}</span><div class="fbtext">${esc(x.text || '')}</div><span class="s">${esc([x.team, x.league, x.era, x.app === 'web' ? 'website' : 'Claude', x.tab && 'from the ' + ({ desk: 'Desk', team: 'Team', trade: 'Moves', league: 'League', race: 'GM Race', office: 'Office' }[x.tab] || x.tab) + ' tab'].filter(Boolean).join(' · '))}</span></div><div class="col" style="gap:6px"><button class="btn sm" type="button" data-act="fbdone" data-id="${x.id}" data-v="${x.done ? 0 : 1}">${x.done ? 'Reopen' : 'Done'}</button></div></div>`).join('');
  return `<div class="pad row" style="padding-top:8px;align-items:center"><span class="small muted" style="flex:1">${fbInbox.filter(x => !x.done).length} open · ${fbInbox.length} total</span><button class="btn sm ghost" type="button" data-act="fbshowdone">${fbShowDone ? 'Hide done' : 'Show done'}</button></div><div class="list">${rows || (fbInbox.length ? '<div class="empty">All caught up.</div>' : '<div class="empty">Nothing yet. When friends send feedback it lands here.</div>')}</div>`;
}
function openFeedback() { openModal('Feedback', `<div id="fbBody">${viewFeedback()}</div>`); }
function refreshFb() { const b = $('#fbBody'); if (b) b.innerHTML = viewFeedback(); else if (tab === 'feedback') render(); }
function viewFeedback() {
  let h = `<section class="card"><h2>Send feedback</h2><div class="pad small muted" style="padding-top:0">Ideas, things that feel clunky, bugs, or what you love. Anything helps.</div>${feedbackForm()}</section>`;
  if (isAdmin()) {
    h += `<section class="card"><h2>Feedback inbox<span class="sub">only you see this</span></h2>${feedbackInbox()}</section>`;
    if (fbInbox && fbInbox.length) setTimeout(() => { const mx = Math.max(...fbInbox.map(x => x.ts)); if (mx > fbSeen()) { localSet('fb-seen', String(mx)); renderTabs(); } }, 1500);
  }
  return h;
}

// ---------------- Dynasty: aging, retirements, the Hall of Fame, medical staff, multi-season sims ----------------
// league/dyn holds every player's rating change since the league began, careers in this league, retirements and
// the Hall of Fame. The commissioner's client writes it once a winter when the offseason opens.
let dyn = null;
function dynSig() { return meta ? String(meta.created || meta.seed) : ''; }
function dynLive() { return !!(dyn && W && dyn.lid === dynSig() && dyn.era === curEra); }
function dynSeed() { return (Number((meta && (meta.created || meta.seed)) || 1) % 4294967296) >>> 0; }
function isRetired(id) { return dynLive() && dyn.ret && dyn.ret[id] != null; }
function hofEntry(id) { return dynLive() ? (dyn.hof || []).find(h => h.id === +id) || null : null; }
function applyDynNow() {
  try { if (!W) return; FO.applyDyn(W, dynLive() ? dyn : null); } catch (e) { /* not loaded yet, or keep base ratings */ }
  try { invalidate(); anaCache = null; raceProjCache = null; builder = null; } catch (e) { /* caches not ready yet */ }
}
function saveDyn(d) {
  dyn = d; applyDynNow();
  if (mode === 'local') { saveLocal(); return Promise.resolve(); }
  return writeDoc('league/dyn', d).catch(() => {});
}
// the winter step, run while opening the offseason. cands = free agents who might retire.
function runDynWinter(season, cands, prevOf) {
  const base = dynLive() ? dyn : { lid: dynSig(), era: curEra };
  const r = FO.winterDyn(W, base, S, season, dynSeed(), [...new Set(cands.map(Number))], { lastTeam: id => prevOf(id) || null });
  r.dyn.lid = dynSig(); r.dyn.era = curEra;
  return r;
}
const lastOf = n => String(n).split(' ').filter(x => !/^(Jr\.|Sr\.|II|III)$/.test(x)).pop();
function careerLine(id) {
  const c = dynLive() && dyn.car && dyn.car[id]; if (!c) return '';
  const p = P[id];
  if (p.t === 'H') return `${c[0]} season${c[0] > 1 ? 's' : ''}, ${c[2] ? fmt3(c[3] / c[2]) : '.000'}, ${c[4]} HR, ${c[5]} RBI, ${c[3]} hits`;
  return `${c[0]} season${c[0] > 1 ? 's' : ''}, ${c[2]}-${c[3]}, ${c[5] ? (c[7] * 27 / c[5]).toFixed(2) : '0.00'} ERA, ${c[6]} K${c[4] ? ', ' + c[4] + ' saves' : ''}`;
}
// news and front pages for the winter
function dynNews(S2, r, season) {
  const yr = yearOf(season + 1);
  const notable = r.retired.slice().sort((a, b) => FO.hofScore(W, r.dyn, b) - FO.hofScore(W, r.dyn, a));
  notable.slice(0, 6).reverse().forEach(id => { const p = P[id]; S2.news.unshift([S2.day, `${p.name} retires at ${p.age}${careerLine(id) ? ' after ' + careerLine(id) + ' in this league' : ''}.`, 'tx']); });
  if (r.retired.length) S2.news.unshift([S2.day, `${r.retired.length} player${r.retired.length > 1 ? 's' : ''} announced ${r.retired.length > 1 ? 'their' : 'his'} retirement this winter.`, 'tx']);
  r.inducted.slice().reverse().forEach(e => S2.news.unshift([S2.day, `Hall of Fame: ${e.name} is inducted with the class of ${yr}.`, 'milestone']));
  const papers = [];
  if (r.inducted.length) papers.push(newPaper('hof', null, { head: r.inducted.length > 1 ? `CLASS OF ${yr}` : `${lastOf(r.inducted[0].name).toUpperCase()} HEADS TO THE HALL`, sub: r.inducted.length > 1 ? `${r.inducted.map(e => e.name).join(', ')} enter the Hall of Fame` : `${r.inducted[0].name} enters the Hall of Fame with the class of ${yr}`, hof: r.inducted.map(e => [e.name, e.pos, e.peak, e.id]), owner: null }));
  const inHof = new Set(r.inducted.map(e => e.id)), star = notable.find(id => !inHof.has(id));
  if (star != null && (P[star].ovr >= 60 || FO.hofScore(W, r.dyn, star) >= 30)) papers.push(newPaper('retire', null, { head: `FAREWELL, ${lastOf(P[star].name).toUpperCase()}`, sub: `${P[star].name} hangs up the spikes at ${P[star].age}`, star: P[star].name, starId: star, line: careerLine(star), others: notable.filter(id => id !== star).slice(0, 5).map(id => P[id].name + (inHof.has(id) ? ' (Hall of Fame)' : '')), owner: null }));
  if (papers.length) S2.papers = (S2.papers || []).concat(papers).slice(-40);
  return papers;
}
// ---- Hall of Fame page ----
function viewHof() {
  if (!dynLive() || !(dyn.hof || []).length) {
    const ret = dynLive() ? Object.keys(dyn.ret || {}).length : 0;
    return `<section class="card"><h2>Hall of Fame</h2><div class="empty">No one has been inducted yet. Every winter, players whose contracts are up may retire, and the greats go straight to the Hall.${ret ? ` ${ret} have retired so far.` : ''}</div></section>` + retiredCard();
  }
  const list = dyn.hof.slice().reverse();
  return `<section class="card"><h2>Hall of Fame<span class="sub">${list.length} inducted</span></h2><div class="hofgrid">${list.map(e => `<button class="plaque" type="button" data-act="player" data-p="${e.id}"><span class="py">Class of ${e.y}</span><b>${esc(e.name)}</b><span class="pp">${esc(e.pos)}${e.last && TEAM[e.last] ? ' · ' + esc(TEAM[e.last].city) : ''}</span>${careerLine(e.id) ? `<span class="pc2">${esc(careerLine(e.id))} in this league</span>` : '<span class="pc2">Made his name before this league began</span>'}<span class="pk">Peak rating ${e.peak}</span></button>`).join('')}</div></section>` + retiredCard();
}
function retiredCard() {
  if (!dynLive()) return '';
  const ids = Object.keys(dyn.ret || {}).map(Number).filter(id => P[id]);
  if (!ids.length) return '';
  const by = ids.sort((a, b) => dyn.ret[b] - dyn.ret[a] || FO.hofScore(W, dyn, b) - FO.hofScore(W, dyn, a)).slice(0, 40);
  return `<section class="card"><h2>Recently retired<span class="sub">${ids.length} in all</span></h2><div class="list">${by.map(id => `<div class="item"><span class="slot" style="width:44px">${yearOf(dyn.ret[id] + 1)}</span><div class="nm"><button class="lnk" type="button" data-act="player" data-p="${id}"><b>${esc(P[id].name)}</b></button>${hofEntry(id) ? ' <span class="tag gold">Hall of Fame</span>' : ''}<span class="s">${posShort(P[id])} · retired at ${P[id].age}${careerLine(id) ? ' · ' + esc(careerLine(id)) : ''}</span></div></div>`).join('')}</div></section>`;
}
// ---- player card extras ----
function dynPlayerBits(id) {
  if (!dynLive()) return '';
  const bits = [];
  const h = hofEntry(id);
  if (h) bits.push(`<span class="tag gold">Hall of Fame · class of ${h.y}</span>`);
  else if (isRetired(id)) bits.push(`<span class="tag">Retired after ${yearOf(dyn.ret[id])}</span>`);
  const p = P[id], d = dyn.d && dyn.d[id];
  if (p && p.b0 && d && !p.pros) bits.push(`<span class="small muted">${d > 0 ? 'Up' : 'Down'} ${Math.abs(d)} from his ${FO.ERA.year} rating of ${p.b0.ovr}</span>`);
  const cl = careerLine(id);
  return `${bits.length ? `<div class="pad row wrap" style="padding-top:10px;gap:6px;align-items:center">${bits.join('')}</div>` : ''}${cl ? `<p class="pad small" style="padding-top:6px;margin:0"><b>Career in this league:</b> ${esc(cl)}.</p>` : ''}`;
}
// ---- medical staff ----
function medNote(v) {
  const f = Math.max(0, Math.min(1, v / FO.ERA.fin.devMax)), r = FO.medRisk(f), d = FO.medDays(f);
  const often = Math.round((r - 1) * 100), back = Math.round((1 - d) * 100);
  return `${often > 2 ? `Injuries about ${often}% more often` : often < -2 ? `Injuries about ${-often}% less often` : 'Normal injury risk'}${back > 2 ? `, players back ${back}% sooner` : back < -2 ? `, recoveries ${-back}% slower` : ''}.`;
}
// ---- several seasons at once (solo leagues only) ----
let multi = null;
// if the app closed in the middle of a multi-season sim, give the club back
function restoreMultiOwner() {
  const t = localGet('ms-team'); if (multi || !t || !TEAM[t] || myTeam()) return;
  localSet('ms-team', ''); if (!ownerOf(t)) teamWrite(t, { owner: me.id });
}
function canMultiSim() { return !!(meta && S && (mode === 'local' || league.kind === 'solo') && isCommish()); }
function openMultiSim() {
  if (!canMultiSim()) { toast('Multi-season sims are for solo leagues, so nobody fast-forwards a friend\'s club.'); return; }
  const mt = myTeam(), city = mt ? TEAM[mt].city : 'your club';
  openModal('Sim several seasons', `<div class="pad"><p style="margin:0 0 10px">Watch the years fly by. Your assistant GM runs <b>${esc(city)}</b> the whole way: lineups, call-ups, the business, the draft and free agency. Players age, stars retire, and the greats go to the Hall of Fame.</p>
    <div class="msgrid">${[1, 3, 5, 10].map(n => `<button class="btn${n === 5 ? ' primary' : ''}" type="button" data-act="msgo" data-n="${n}">${n} season${n > 1 ? 's' : ''}</button>`).join('')}</div>
    <p class="small muted" style="margin:10px 0 0">You can stop after any season. ${S.phase === 'season' && S.day > 0 ? 'The current season finishes first and counts as one.' : ''}</p></div>`);
}
function paintMulti(label) {
  const m = $('#msprog'); if (!m || !multi) return;
  m.innerHTML = `<b>Season ${Math.min(multi.total, multi.done + 1)} of ${multi.total}</b> · ${esc(label || '')}<div class="msbar"><i style="width:${Math.round(multi.done / multi.total * 100)}%"></i></div>`;
}
async function runMulti(n) {
  if (multi || !canMultiSim()) return;
  const mt = myTeam(), keepAuto = mt ? clone((docs[mt] && docs[mt].auto) || {}) : null;
  const start = { season: seasonNo(), hof: dynLive() ? (dyn.hof || []).length : 0, ret: dynLive() ? Object.keys(dyn.ret || {}).length : 0 };
  multi = { total: n, done: 0, stop: false, rows: [] };
  openModal('Simulating seasons', `<div class="pad"><div id="msprog"></div><div class="row" style="margin-top:12px"><button class="btn" type="button" data-act="msstop">Stop after this season</button></div></div>`);
  paintMulti('Getting started');
  // the computer runs your club for the stretch (trades, re-signings, free agency), then hands it back
  if (mt) { localSet('ms-team', mt); await teamWrite(mt, { owner: null }); }
  let guard = 0;
  try {
    while (multi.done < multi.total && guard++ < 400) {
      const ph = S.phase, sn = seasonNo();
      paintMulti(`${yearOf(sn)} ${ph === 'season' ? 'regular season' : ph === 'post' ? 'postseason' : 'offseason'}`);
      if (ph === 'season') await sim(Math.max(1, LEN() - S.day), { auto: true });
      else if (ph === 'post') await sim(999, { auto: true });
      else if (ph === 'done') { await ensureBook().catch(() => {}); if (mt) multi.rows.push({ y: yearOf(sn), w: S.std[mt][0], l: S.std[mt][1], post: postLabel(mt), champ: S.post && S.post.champ }); await openOffseason({ auto: true }); }
      else if (ph === 'offseason') {
        if (faDay() < FA_DAYS) await marketDay(false, { auto: true });
        else { await marketDay(true, { auto: true }); multi.done++; if (multi.stop) break; }
      }
      if (S.phase === ph && seasonNo() === sn && ph !== 'offseason' && ph !== 'season') break; // nothing moved: stop rather than spin
      await new Promise(r => setTimeout(r, 0));
    }
  } finally {
    if (mt) { await teamWrite(mt, { owner: me.id, auto: keepAuto }); localSet('ms-team', ''); }
    const res = multi; multi = null; closeModal(); render();
    const newHof = dynLive() ? (dyn.hof || []).slice(start.hof) : [], newRet = dynLive() ? Object.keys(dyn.ret || {}).length - start.ret : 0;
    openModal(`${res.done} season${res.done === 1 ? '' : 's'} in the books`, `<div class="pad">${res.rows.length ? `<div class="scroll"><table><thead><tr><th>Year</th><th>${esc(mt || '')}</th><th>Finish</th><th>Champion</th></tr></thead><tbody>${res.rows.map(r => `<tr><td>${r.y}</td><td>${r.w}-${r.l}</td><td>${esc(r.post || '')}</td><td>${r.champ ? esc(TEAM[r.champ].city) : '—'}</td></tr>`).join('')}</tbody></table></div>` : ''}
      <p style="margin:12px 0 0">${newRet} player${newRet === 1 ? '' : 's'} retired${newHof.length ? `, and ${newHof.length} went into the Hall of Fame: ${newHof.map(e => esc(e.name)).join(', ')}` : ''}.</p>
      <div class="row wrap" style="margin-top:12px"><button class="btn primary" type="button" data-act="history" data-v="hof">See the Hall of Fame</button><button class="btn" type="button" data-act="close">Close</button></div></div>`);
  }
}

// ---------------- In the red: recovery plan ----------------
// Ranks every way to get cash positive (instant cash, ongoing savings) with one-tap Apply buttons,
// plus "Apply the recovery plan" for the safe combination: revenue tweaks, budget trims, and a loan for what's left.
let recCache = null;
function salaryDumps(mt) {
  if (tradesClosed() || !(S.phase === 'season' || S.phase === 'offseason')) return [];
  const frac = S.phase === 'season' ? Math.max(0, LEN() - S.day) / LEN() : 1, out = [];
  const big = rosterOf(mt).filter(id => !injDays(id) && salFor(id, mt) >= FO.ERA.minSal * 4).sort((a, b) => salFor(b, mt) / Math.max(0.5, warOf(b, true)) - salFor(a, mt) / Math.max(0.5, warOf(a, true))).slice(0, 8); // worst value per dollar first
  const cpus = TEAMS.filter(t => t.id !== mt && !ownerOf(t.id)).map(t => ({ tid: t.id, ctx: ctxFor(t.id) }));
  for (const v of big) {
    const sal = salFor(v, mt); if (sal < FO.ERA.minSal * 4) continue;
    let deal = null;
    for (const b of cpus.sort((x, y) => (y.ctx.needs.includes(FO.needOf(P[v])) - x.ctx.needs.includes(FO.needOf(P[v]))))) {
      const tries = [[]].concat(rosterOf(b.tid).filter(id => P[id].t === P[v].t && salFor(id, b.tid) <= FO.ERA.minSal * 1.5).sort((x, y) => P[y].ovr - P[x].ovr).slice(0, 2).map(id => [id]));
      for (const get of tries) {
        const legal = FO.evalTrade(W, rosterOf(mt), rosterOf(b.tid), [v], get);
        if (legal.errFrom || legal.errTo) continue;
        if (!FO.aiEvaluate(W, b.ctx, [pinfo(v)], get.map(pinfo), 0).accept) continue;
        const back = get.reduce((a, id) => a + salFor(id, b.tid), 0);
        deal = { kind: 'dump', give: v, get, tid: b.tid, now: (sal - back) * frac, yearly: sal - back };
        break;
      }
      if (deal) break;
    }
    if (deal) out.push(deal);
    if (out.length >= 2) break;
  }
  return out;
}
function recoveryPlan(mt) {
  const F = FO.ERA.fin, su = setup(mt), b = su.biz, cash = cashOf(mt), wk = weekly(mt);
  const left = S.phase === 'season' ? Math.max(0, LEN() - S.day) : LEN(), frac = left / LEN();
  const perWeek = wk.w.length ? wk.net / wk.w.length : 0;
  const proj = cash + perWeek * left / 7;
  const instant = [], ongoing = [];
  // ongoing: revenue tweaks that the business model says pay
  const adv = businessAdvice(mt).list.filter(x => x.act && ['price', 'conc', 'park', 'promo', 'spon'].includes(x.act.k));
  for (const x of adv) ongoing.push({ kind: 'biz', title: x.title.replace(/<[^>]+>/g, ''), body: x.body, act: x.act, yearly: x.score, now: x.score * frac, safe: true });
  // ongoing: trim budgets
  const scoutTo = Math.round(FO.ERA.scoutDef * 0.4 / 1e5) * 1e5;
  if (su.scout > scoutTo) ongoing.push({ kind: 'cut', title: `Trim scouting to ${money(scoutTo)} a year`, body: `Saves ${money(su.scout - scoutTo)} a year. Your scouting reports get fuzzier (ratings and free-agent asks are less exact).`, act: { k: 'scout', v: scoutTo }, yearly: su.scout - scoutTo, now: (su.scout - scoutTo) * frac, safe: true });
  const devTo = Math.round(F.devDef * 0.4 / 1e5) * 1e5;
  if (b.dev > devTo) ongoing.push({ kind: 'cut', title: `Trim player development to ${money(devTo)} a year`, body: `Saves ${money(b.dev - devTo)} a year. Prospects grow a bit slower until you raise it again.`, act: { k: 'dev', v: devTo }, yearly: b.dev - devTo, now: (b.dev - devTo) * frac, safe: true });
  if (b.ads > F.adsDef && fanScore(fanOf(mt)) >= 45) ongoing.push({ kind: 'cut', title: `Scale the ad campaign back to ${money(F.adsDef)}`, body: `Saves ${money(b.ads - F.adsDef)} a year. Fan interest is healthy (${fanScore(fanOf(mt))}), so it can coast.`, act: { k: 'ads', v: F.adsDef }, yearly: b.ads - F.adsDef, now: (b.ads - F.adsDef) * frac, safe: true });
  if (b.promo >= 2) ongoing.push({ kind: 'cut', title: 'Cut promotions back to weekends', body: 'Giveaway nights cost money every game. Weekends keep most of the crowd boost.', act: { k: 'promo', v: 1 }, yearly: F.promo * 81 * (b.promo - 1) * Math.pow(TEAM[mt].mkt, 0.3), now: F.promo * 81 * (b.promo - 1) * frac, safe: !ongoing.some(o => o.act && o.act.k === 'promo') });
  // instant: salary dumps
  for (const d of salaryDumps(mt)) instant.push({ kind: 'dump', title: `Trade ${esc(P[d.give].name)} to ${esc(TEAM[d.tid].city)}${d.get.length ? ` for ${esc(P[d.get[0]].name)}` : ' for nothing'}`, body: `Takes ${money(salFor(d.give, mt))} a year off your payroll: about <b class="num">${money(d.now)}</b> saved ${S.phase === 'season' ? 'the rest of this season' : 'next season'}. He's rated ${sOvr(d.give)} (about ${fmtWar(warOf(d.give))} WAR), ${warOf(d.give) >= 2.5 ? "so you'll feel it on the field" : 'so your team barely misses him'}. ${esc(TEAM[d.tid].city)} has already said yes.`, deal: d, now: d.now, yearly: d.yearly });
  // instant: TV advance
  const canTV = S.phase === 'offseason' || (S.phase === 'season' && S.day === 0);
  if (canTV && b.tv !== 'advance') { const lump = Math.round(FO.localTV(mt) * 0.75 / 1e5) * 1e5; instant.push({ kind: 'tv', title: 'Take the TV cash advance', body: `${money(lump)} today, but you give up most of next season's local TV money.`, act: { k: 'tv', v: 'advance' }, now: lump, yearly: 0 }); }
  // instant: loan for what's left
  const savings = ongoing.filter(o => o.safe).reduce((a, o) => a + o.now, 0);
  const step = F.loanMax / 10, room = F.loanMax - (b.loan || 0);
  const gap = Math.max(0, -cash) + Math.max(0, -(proj + savings)) * 0.5 + (cash < 0 ? step * 0.5 : 0);
  const steps = Math.min(Math.floor(room / step), Math.ceil(gap / step));
  if (steps > 0 && (cash < 0 || proj < 0)) instant.push({ kind: 'loan', title: `Borrow ${money(steps * step)} from the bank`, body: `Gets you back in the black today so you can sign players again. Costs about ${money(steps * step * F.rate)} a year in interest; pay it back from profits.${room - steps * step <= 0 ? ' That maxes out your credit line.' : ''}`, steps, now: steps * step, yearly: -steps * step * F.rate });
  return { cash, perWeek, proj, left, instant, ongoing, savings, steps, room, step };
}
function openRecovery() {
  const mt = myTeam(); if (!mt || !S) return;
  const r = recoveryPlan(mt); recCache = r;
  const row = (x, i, grp) => `<div class="idea"><div class="row" style="gap:8px;align-items:flex-start"><b style="flex:1">${x.title}</b><span class="num ${x.now >= 0 ? 'good' : 'bad'}" style="white-space:nowrap">+${money(Math.max(0, x.now))}</span></div><div class="small muted">${x.body}</div><div><button class="btn sm ${x.kind === 'dump' ? '' : 'primary'}" type="button" data-act="recapply" data-g="${grp}" data-i="${i}">${x.kind === 'loan' ? 'Borrow' : x.kind === 'dump' ? 'Make the trade' : x.kind === 'tv' ? 'Take it' : 'Apply'}</button></div></div>`;
  const after = r.proj + r.savings + (r.steps ? r.steps * r.step : 0);
  const body = `<div class="recov"><div class="kv"><div><span>Cash now</span><b style="color:${r.cash >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(r.cash)}</b></div><div><span>Weekly pace</span><b style="color:${r.perWeek >= 0 ? 'var(--good)' : 'var(--bad)'}">${r.perWeek >= 0 ? '+' : ''}${money(r.perWeek)}</b></div><div><span>Season-end if nothing changes</span><b style="color:${r.proj >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(r.proj)}</b></div><div><span>With the plan</span><b style="color:${after >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(after)}</b></div></div>
    <div class="pad"><button class="btn primary big" type="button" data-act="recall" style="width:100%">Apply the recovery plan</button><div class="small muted" style="margin-top:6px">Does the safe moves at once: ${[r.ongoing.filter(o => o.kind === 'biz').length ? 'tune prices' : '', r.ongoing.filter(o => o.kind === 'cut').length ? 'trim budgets' : '', r.steps ? `borrow ${money(r.steps * r.step)}` : ''].filter(Boolean).join(', ') || 'nothing needed'}. It won't trade anyone; that's your call below.</div></div>
    ${r.instant.length ? `<h4 class="h2 rsec">Cash today</h4>${r.instant.map((x, i) => row(x, i, 'i')).join('')}` : ''}
    ${r.ongoing.length ? `<h4 class="h2 rsec">Stop the bleeding</h4>${r.ongoing.map((x, i) => row(x, i, 'o')).join('')}` : ''}
    ${!r.instant.length && !r.ongoing.length ? '<div class="empty">No quick fixes left. Winning more and moving a big contract in the offseason are the way out.</div>' : ''}
    <p class="pad small muted" style="margin:0">Amounts are estimates for ${S.phase === 'season' ? 'the rest of this season' : 'next season'} from your own numbers. Payroll is ${money(payroll(mt))}, usually the biggest lever.</p></div>`;
  openModal('Get back in the black', body);
}
async function recApply(grp, i) {
  const r = recCache, x = r && (grp === 'i' ? r.instant : r.ongoing)[i]; if (!x) return;
  await recDo(x);
  openRecovery();
}
async function recDo(x) {
  const mt = myTeam();
  if (x.kind === 'loan') { for (let k = 0; k < x.steps; k++) await loanStep(1); return; }
  if (x.kind === 'tv') { await chooseTV('advance'); return; }
  if (x.kind === 'dump') {
    const d = x.deal; tradePartner = d.tid; tradeGive = new Set([d.give]); tradeGet = new Set(d.get); tradeCash = 0;
    await propose(); return;
  }
  const { k, v } = x.act;
  if (k === 'scout') await teamWrite(mt, { scout: v });
  else if (k === 'price') await teamWrite(mt, { price: v });
  else await setBiz({ [k]: v });
}
async function recAll() {
  const r = recCache || recoveryPlan(myTeam());
  const seen = new Set();
  for (const x of r.ongoing.filter(o => o.safe)) { const key = x.act && x.act.k; if (seen.has(key)) continue; seen.add(key); await recDo(x); }
  const loan = r.instant.find(x => x.kind === 'loan'); if (loan) await recDo(loan);
  closeModal();
  toast(cashOf(myTeam()) >= 0 ? `Back in the black: ${money(cashOf(myTeam()))}.` : 'Plan applied. Check the Office for what else you can do.');
  render();
}

// ---------------- GM Race tiebreaker: Game 163 ----------------
// A dead heat for first at season's end is settled on the field: a one-game playoff, aces on the mound.
// The better exact (unrounded) score gets home field. Three or more tied: a stepladder (lowest seeds play first).
const raceFinal = () => !!S && (S.phase === 'done' || S.phase === 'offseason');
function tieFor1st() {
  if (!raceFinal()) return null;
  const rows = raceTable().sort((a, b) => b.total - a.total);
  if (rows.length < 2) return null;
  const top = Math.round(rows[0].total), tied = rows.filter(r => Math.round(r.total) === top);
  return tied.length >= 2 ? { pts: top, rows: tied } : null;
}
const tbOf = () => (S && S.tb && S.tb.season === seasonNo()) ? S.tb : null;
function raceOrder(rows) {
  const out = rows.slice().sort((a, b) => b.total - a.total), tb = tbOf();
  if (tb && tb.winner) { const k = out.findIndex(r => r.tid === tb.winner); if (k > 0) out.unshift(out.splice(k, 1)[0]); }
  return out;
}
const canStartTb = tie => tie && (tie.rows.some(r => r.owner === me.id) || isCommish());
function aceOf(tid) { const id = setup(tid).rotation[0]; return id; }
function aceLine(id) { const a = S.pit[id]; return a && a[5] ? `${a[2]}-${a[3]}, ${(a[7] * 27 / a[5]).toFixed(2)} ERA` : ''; }
function tbCard() {
  const tie = tieFor1st(), tb = tbOf();
  if (!tie && !tb) return '';
  const yr = yearOf(seasonNo());
  if (tb) {
    const g = tb.games[tb.games.length - 1], w = tb.winner, lo = g.home === w ? g.away : g.home;
    const ws = g.home === w ? g.box.hs : g.box.as, ls = g.home === w ? g.box.as : g.box.hs, inn = g.box.inn;
    return `<section class="card tbcard done"><div class="tbhead"><span class="tbbadge">Game 163 final</span><b>${ownerOf(w) === me.id ? 'You win' : esc(ownerName(ownerOf(w))) + ' wins'} the ${yr} GM Race</b><span class="small">${esc(TEAM[w].city)} ${ws}, ${esc(TEAM[lo].city)} ${ls}${inn > 9 ? ` in ${inn}` : ''}${tb.games.length > 1 ? ` · ${tb.games.length}-game stepladder` : ''}</span></div><div class="pad row wrap" style="gap:8px;padding-top:4px"><button class="btn primary" type="button" data-act="tb-watch">▶ Watch the replay</button></div></section>`;
  }
  const [a, b] = tie.rows, edge = a.total - b.total;
  const side = r => { const ace = aceOf(r.tid); return `<div class="tbside"><div class="tbtid">${esc(r.tid)}</div><b>${esc(ownerName(r.owner))}</b><span class="small">${S.std[r.tid][0]}-${S.std[r.tid][1]} · run diff ${(S.std[r.tid][2] - S.std[r.tid][3] > 0 ? '+' : '') + (S.std[r.tid][2] - S.std[r.tid][3])}</span><div class="tbsplit"><span>Win <b>${Math.round(r.win)}</b></span><span>Biz <b>${Math.round(r.biz)}</b></span><span>Fans <b>${Math.round(r.fans)}</b></span></div><span class="small">Ace: <b>${esc(P[ace].name)}</b>${aceLine(ace) ? ` (${aceLine(ace)})` : ''}</span></div>`; };
  const more = tie.rows.length > 2 ? `<p class="pad small" style="margin:0">${tie.rows.length} GMs are tied. They play a stepladder: the two lowest exact scores meet first, and the winner moves up to face the next.</p>` : '';
  return `<section class="card tbcard"><div class="tbhead"><span class="tbbadge">Dead heat</span><b>Tied at ${tie.pts} points</b><span class="small">${edge >= 0.05 ? `On paper ${a.owner === me.id ? 'you lead' : esc(ownerName(a.owner)) + ' leads'} by ${edge.toFixed(1)}, so ${esc(TEAM[a.tid].city)} gets home field.` : `Even to the decimal. ${esc(TEAM[a.tid].city)} wins the coin toss for home field.`} Now settle it on the field.</span></div>
    <div class="tbvs">${side(a)}<div class="tbx">VS</div>${side(b)}</div>${more}
    <div class="pad row wrap" style="gap:8px;padding-top:4px">${canStartTb(tie) ? `<button class="btn primary big" type="button" data-act="tb-play">⚾ Play Game 163</button>` : `<span class="small muted">Waiting for one of the tied GMs to start Game 163.</span>`}</div>
    <p class="pad small muted" style="margin:0;padding-top:6px">One game. Everyone healthy, aces on the mound, DH for both clubs, extra innings until someone wins. Winner takes the season's GM Race title.</p></section>`;
}
async function playTiebreak() {
  const tie = tieFor1st(); if (!tie || tbOf() || !canStartTb(tie)) return;
  let lock = null;
  if (mode === 'shared') {
    lock = await dref('league/lock').acquire({ holder: me.id, ttlMs: 20000 });
    if (!lock.acquired) { toast('Game 163 is already starting.'); return; }
    const fresh = await dref('league/state').get(); if (fresh.exists) S = clone(fresh.data());
    if (tbOf()) { try { lock.release && await lock.release(); } catch (e) { /* ttl */ } render(); watchTiebreak(); return; }
  }
  const ids = tie.rows.map(r => r.tid), games = [];
  let cur = ids[ids.length - 1];
  const seed = ((S.seed || 1) * 31 + seasonNo() * 7919 + (Date.now() & 0xffff)) >>> 0;
  for (let k = ids.length - 2; k >= 0; k--) {
    const home = ids[k], away = cur, r = FO.showdown(W, S, docs, home, away, seed + k * 101);
    games.push({ home, away, box: r.box, log: r.log, winner: r.winner });
    cur = r.winner;
  }
  S.tb = { season: seasonNo(), pts: tie.pts, ids, games, winner: cur, by: me.id, ts: Date.now() };
  logC(`Started Game 163 (${ids.join(' vs ')})`);
  const last = games[games.length - 1], lo = last.home === cur ? last.away : last.home;
  S.news.unshift([S.day, `GAME 163: ${ownerName(ownerOf(cur))} (${TEAM[cur].city}) beat ${ownerName(ownerOf(lo))} (${TEAM[lo].city}) ${Math.max(last.box.hs, last.box.as)}-${Math.min(last.box.hs, last.box.as)} to win the GM Race.`, 'season', cur]);
  if (mode === 'local') saveLocal(); else { try { await writeDoc('league/state', S); } catch (e) { /* toast shown */ } try { lock && lock.release && await lock.release(); } catch (e) { /* ttl */ } }
  render(); watchTiebreak();
}
// ---- the broadcast ----
let tbRun = null;
function playText(e, nameOf) {
  const [, , bat, ev, runs] = e, n = esc(nameOf(bat)), rr = runs > 1 ? `${runs} runs score` : runs ? 'a run scores' : '';
  if (ev === 'hr') return runs >= 4 ? `💥 GRAND SLAM! ${n} clears the bases!` : `💥 ${n} homers!${runs > 1 ? ` ${runs} runs score.` : ''}`;
  if (ev === 't') return `${n} triples${rr ? ', ' + rr : ''}!`;
  if (ev === 'd') return `${n} doubles${rr ? ', ' + rr : ''}.`;
  if (ev === 's') return `${n} singles${rr ? ', ' + rr : ''}.`;
  if (ev === 'bb') return `${n} walks${rr ? ', ' + rr : ''}.`;
  if (ev === 'k') return `${n} strikes out.`;
  return runs ? `${n} puts it in play, ${rr}.` : `${n} is out.`;
}
function tbBoardHTML(g, upto, cur) {
  // upto = number of log entries revealed
  const log = g.log.slice(0, upto), doneNow = upto >= g.log.length, maxInn = Math.max(9, doneNow ? g.box.inn : (log.length ? log[log.length - 1][0] : 1)); // no spoilers: extra innings appear when they happen
  const runsBy = [{}, {}], hits = [0, 0];
  let lastInn = 0, lastTop = 0;
  for (const e of log) { const s = e[1]; runsBy[s][e[0]] = (runsBy[s][e[0]] || 0) + e[4]; if ('s d t hr'.split(' ').includes(e[3])) hits[s]++; lastInn = e[0]; lastTop = e[1]; }
  const done = upto >= g.log.length, score = log.length ? [log[log.length - 1][5], log[log.length - 1][6]] : [0, 0];
  const cell = (s, i) => {
    const started = i < lastInn || (i === lastInn && s <= lastTop) || (done && i <= g.box.inn);
    if (done && s === 1 && i === g.box.inn && g.box.ln[1][i - 1] === 'x') return '<td>x</td>';
    const live = !done && i === lastInn && s === lastTop;
    return `<td class="${live ? 'live' : ''}">${started ? (runsBy[s][i] || 0) : ''}</td>`;
  };
  const row = (s, tid) => `<tr><th><span class="abbr">${tid}</span> <span class="tbgm">${ownerOf(tid) ? esc(ownerName(ownerOf(tid))) : ''}</span></th>${Array.from({ length: maxInn }, (_, k) => cell(s, k + 1)).join('')}<td class="r">${score[s]}</td><td class="h">${hits[s]}</td></tr>`;
  const outs = log.length && !done ? log[log.length - 1][7] : 0;
  const half = log.length ? `${lastTop ? 'Bottom' : 'Top'} ${lastInn}${lastInn === 1 ? 'st' : lastInn === 2 ? 'nd' : lastInn === 3 ? 'rd' : 'th'}` : 'First pitch';
  return `<div class="tbboard"><div class="tbmeta"><span>${done ? 'FINAL' + (g.box.inn > 9 ? '/' + g.box.inn : '') : half}</span>${done ? '' : `<span class="outs" aria-label="${outs} outs">${[0, 1, 2].map(k => `<i class="${k < outs % 3 || (outs >= 3 && k < 3) ? 'on' : ''}"></i>`).join('')}</span>`}</div><div class="scroll"><table><thead><tr><th></th>${Array.from({ length: maxInn }, (_, k) => `<th>${k + 1}</th>`).join('')}<th class="r">R</th><th class="h">H</th></tr></thead><tbody>${row(0, g.away)}${row(1, g.home)}</tbody></table></div></div>`;
}
function watchTiebreak() {
  const tb = tbOf(); if (!tb) return;
  if (tbRun) clearTimeout(tbRun.t);
  tbRun = { gi: 0, i: 0, t: null, feed: [], fast: false };
  const nameOf = id => lastName(id);
  openModal(`Game 163 · ${yearOf(seasonNo())} GM Race`, `<div id="tbStage"></div>`);
  const stage = () => $('#tbStage');
  const intro = gi => {
    const g = tb.games[gi], b = tb.games.length > 1 ? `Game ${gi + 1} of ${tb.games.length} · ` : '';
    const hp = g.box.hb.pit[0][0], ap = g.box.ab.pit[0][0];
    return `<div class="tbintro"><div class="small">${b}${esc(TEAM[g.home].city)} has home field</div><div class="tbmatch"><span>${esc(ownerName(ownerOf(g.away)))}<small>${g.away} · ${esc(P[ap].name)}</small></span><b>at</b><span>${esc(ownerName(ownerOf(g.home)))}<small>${g.home} · ${esc(P[hp].name)}</small></span></div></div>`;
  };
  const paint = () => {
    const el = stage(); if (!el) { clearTimeout(tbRun.t); tbRun = null; return; }
    const g = tb.games[tbRun.gi];
    el.innerHTML = intro(tbRun.gi) + tbBoardHTML(g, tbRun.i) + `<div class="tbfeed" aria-live="polite">${tbRun.feed.slice(-5).reverse().map((f, k) => `<div class="${f.cls}${k === 0 ? ' new' : ''}">${f.txt}</div>`).join('')}</div>` +
      `<div class="pad row" style="gap:8px;padding-top:10px"><button class="btn" type="button" data-act="tb-skip">Skip to the end ▸▸</button></div>`;
  };
  const finale = () => {
    const el = stage(); if (!el) return;
    const w = tb.winner, g = tb.games[tb.games.length - 1], lo = g.home === w ? g.away : g.home;
    const ws = g.home === w ? g.box.hs : g.box.as, ls = g.home === w ? g.box.as : g.box.hs;
    const dec = g.box.dec, walkoff = g.winner === g.home && g.log.length && g.log[g.log.length - 1][1] === 1 && g.log[g.log.length - 1][4] > 0 && g.log[g.log.length - 1][0] >= 9;
    const conf = Array.from({ length: 36 }, (_, k) => `<i style="left:${(k * 37) % 100}%;animation-delay:${(k % 9) * 0.12}s;background:${['var(--accent)', 'var(--gold)', '#2f8f5b', 'var(--ink)'][k % 4]}"></i>`).join('');
    el.innerHTML = tbBoardHTML(g, g.log.length) + `<div class="tbwin"><div class="confetti" aria-hidden="true">${conf}</div><div class="tbtrophy" aria-hidden="true">🏆</div><div class="tbbig">${esc(ownerName(ownerOf(w)))}</div><div>${ownerOf(w) === me.id ? 'win' : 'wins'} the ${yearOf(seasonNo())} GM Race</div><div class="small" style="margin-top:6px">${walkoff ? '<b>WALK-OFF!</b> ' : ''}${esc(TEAM[w].city)} ${ws}, ${esc(TEAM[lo].city)} ${ls}${g.box.inn > 9 ? ` in ${g.box.inn} innings` : ''}. W: ${esc(P[dec[0]].name)} · L: ${esc(P[dec[1]].name)}${dec[2] != null ? ` · S: ${esc(P[dec[2]].name)}` : ''}</div></div>
      <div class="tbfeed">${tbRun ? tbRun.feed.filter(f => f.big).slice(-4).reverse().map(f => `<div class="${f.cls}">${f.txt}</div>`).join('') : ''}</div>
      <div class="pad row" style="gap:8px;padding-top:10px"><button class="btn" type="button" data-act="tb-watch">Watch again</button><button class="btn primary" type="button" data-act="close">Done</button></div>`;
    if (tbRun) clearTimeout(tbRun.t);
    tbRun = null;
  };
  const step = () => {
    if (!tbRun) return;
    const g = tb.games[tbRun.gi];
    if (tbRun.fast) { // jump to end of all games, keep the big moments
      for (; tbRun.gi < tb.games.length; tbRun.gi++, tbRun.i = 0) { const gg = tb.games[tbRun.gi]; for (; tbRun.i < gg.log.length; tbRun.i++) { const e = gg.log[tbRun.i]; if (e[4] > 0) tbRun.feed.push({ txt: `${e[1] ? 'B' : 'T'}${e[0]} · ${playText(e, nameOf)}`, cls: 'run', big: true }); } }
      finale(); return;
    }
    if (tbRun.i >= g.log.length) {
      if (tbRun.gi < tb.games.length - 1) {
        const w = g.winner; tbRun.feed.push({ txt: `<b>${esc(ownerName(ownerOf(w)))} moves on!</b>`, cls: 'run', big: true });
        tbRun.gi++; tbRun.i = 0; paint(); tbRun.t = setTimeout(step, 2200); return;
      }
      finale(); return;
    }
    const e = g.log[tbRun.i], prev = g.log[tbRun.i - 1];
    tbRun.i++;
    if (!prev || prev[0] !== e[0] || prev[1] !== e[1]) tbRun.feed.push({ txt: `<b>${e[1] ? 'Bottom' : 'Top'} ${e[0]}</b> · ${esc(P[e[8]].name)} pitching`, cls: 'half' });
    const notable = e[4] > 0 || e[3] === 'hr' || e[3] === 'd' || e[3] === 't' || (e[3] === 'k' && e[7] === 3);
    if (notable || e[0] >= 8) tbRun.feed.push({ txt: playText(e, nameOf), cls: e[4] > 0 ? 'run' : '', big: e[4] > 0 });
    paint();
    const close = Math.abs(e[5] - e[6]) <= 2 && e[0] >= 8;
    const nxt = g.log[tbRun.i], halfEnd = !nxt || nxt[0] !== e[0] || nxt[1] !== e[1];
    tbRun.t = setTimeout(step, e[4] > 0 ? 1300 : halfEnd ? 900 : close ? 650 : 280);
  };
  tbRun.step = step;
  localSet('tbSeen:' + noteKey(), String(tb.ts));
  paint(); tbRun.t = setTimeout(step, 1600);
}
function localGet(k) { try { return localStorage.getItem('fo-' + k); } catch (e) { return null; } }
function localSet(k, v) { try { localStorage.setItem('fo-' + k, v); } catch (e) { /* ignore */ } }

// ---------------- scouting fog ----------------
function scoutBudget(tid) { return setup(tid).scout; }
function fogErr() { const mt = myTeam(); if (!mt) return 0; return Math.round(12 * Math.pow(1 - scoutBudget(mt) / FO.ERA.scoutMax, 1.3)); }
function seenR(id, v, k) {
  const mt = myTeam(); if (!mt || playerTeam(id) === mt || farmOrg(id) === mt || formerTeam(id) === mt) return v;
  const e = fogErr(); if (!e) return v;
  const h = (((id * 31 + (k || 0) * 7 + (mt.charCodeAt(0) * 3 + mt.charCodeAt(1)) * 101) * 2654435761) >>> 0) % 1000 / 1000;
  return Math.max(15, Math.min(99, Math.round(v + (h - 0.5) * 2 * e)));
}
function sOvr(id) { return seenR(id, P[id].ovr, 0); }
function injDays(id) { return (S && S.inj && S.inj[id]) || 0; }
function ilTag(id) { const d = injDays(id); return d ? ` <span class="tag red" title="Injured list">IL ${d}d</span>` : ''; }

// ---------------- sim bar ----------------
function renderSimBar() {
  const el = $('#simrow'); if (!el) return;
  if (!meta || !S) { el.hidden = true; return; }
  el.hidden = false;
  const s = S, can = canSim();
  let status, btns = '';
  if (s.phase === 'season') status = s.day === 0 ? `Opening Day · ${LEN()} games to play` : `${LEN() - s.day} games left`;
  else if (s.phase === 'post') status = s.post.rounds[s.post.cur].name;
  else if (s.phase === 'offseason') status = `Free agency · day ${Math.min(faDay() + 1, FA_DAYS)} of ${FA_DAYS} · ${Object.keys(bids).length} offers in`;
  else status = `${TEAM[s.post.champ].city} won the ${yearOf(seasonNo())} World Series`;
  if (simming) btns = `<div class="simprog"><span id="simlabel">${esc(simming.label)}</span><span class="prog"><i id="simbar"></i></span></div>`;
  else if (can && s.phase === 'season') { const sp = SPANS.find(x => x[0] === simSpan) || SPANS[1]; btns = `<div class="playgrp"><button class="btn primary play" data-act="play" type="button"><span aria-hidden="true">▶</span> Play ${sp[1].toLowerCase()}<small>${spanDays(sp[0])} day${spanDays(sp[0]) > 1 ? 's' : ''}</small></button><button class="btn primary chev" data-act="spanpick" type="button" aria-label="Choose how far to play">▾</button></div>`; }
  else if (can && s.phase === 'post') btns = `<button class="btn primary" data-act="sim" data-n="1" type="button">Next games</button><button class="btn" data-act="sim" data-n="999" type="button">Finish postseason</button>`;
  else if (s.phase === 'done' && isCommish()) btns = `<button class="btn primary" data-act="openoff" type="button">Open the offseason</button>`;
  else if (s.phase === 'offseason' && isCommish()) btns = (faDay() < FA_DAYS ? `<button class="btn primary" data-act="nextfa" type="button">Next free agency day</button>` : '') + `<button class="btn${faDay() < FA_DAYS ? '' : ' primary'}" data-act="closefa" type="button">Close free agency, start ${yearOf(seasonNo() + 1)}</button><button class="btn" data-act="market" type="button">Market</button>`;
  else if (s.phase === 'offseason') btns = `<button class="btn primary" data-act="market" type="button">Make offers</button>`;
  else btns = `<span class="small" style="color:var(--board-dim)">${esc(ownerName(meta.commish))} runs the calendar</span>`;
  if (callLive() && !simming) btns = '';
  el.innerHTML = `<div class="simin"><div class="simstat">${esc(status)}</div><div class="simbtns">${btns}</div></div>` + callBar();
}

// days left in the current series for your club (3 games vs the same opponent)
function seriesDays() {
  const tid = myTeam() || TEAMS[0].id; if (!S || S.phase !== 'season' || !sched()) return 1;
  const opp = d => { const g = W.sched[d] && W.sched[d].find(x => x[0] === tid || x[1] === tid); return g ? (g[0] === tid ? g[1] : g[0]) : null; };
  const o = opp(S.day); if (!o) return 1;
  let d = S.day; while (d + 1 < LEN() && opp(d + 1) === o) d++;
  return d - S.day + 1;
}
// ---------------- Office ----------------
function divPlace(tid) {
  const rows = FO.standings(S)[TEAM[tid].lg + ' ' + TEAM[tid].div];
  const i = rows.findIndex(r => r.id === tid), r = rows[i];
  const ord = ['1st', '2nd', '3rd', '4th', '5th'][i];
  return `${ord} in ${TEAM[tid].lg} ${TEAM[tid].div}${r.gb ? `, ${r.gb.toFixed(1)} back` : ''}`;
}
function weekly(tid) { const w = (S.wk && S.wk[tid]) || []; const rev = w.reduce((a, x) => a + x[0], 0), exp = w.reduce((a, x) => a + x[1], 0); return { w, rev, exp, net: rev - exp }; }
function health(tid) {
  const c = cashOf(tid), wk = weekly(tid);
  if (c < 0) return ['In the red', 'bad', 'Cash is negative. You can\'t sign free agents until it recovers. Borrow from the bank on the Business page, cut costs or dump salary in a trade.'];
  if (wk.w.length && wk.net < 0 && c < 10e6) return ['Tight', 'warnc', 'Losing money this week with a thin cushion. Watch payroll and ticket prices.'];
  if (wk.w.length && wk.net < 0) return ['Spending', 'warnc', 'Losing money this week, but there is cash in the bank.'];
  return ['Healthy', 'goodc', 'Making money with room to add salary.'];
}
function probable(tid) { const su = FO.teamSetup(W, tid, docs[tid], S.inj || {}); return su.rotation[(S.gp[tid] || 0) % su.rotation.length]; }
function viewOffice() {
  const mt = myTeam();
  if (!mt) {
    let h = locked() ? `<section class="card"><h2>League is full</h2><div class="pad small">The commissioner has locked this league, so every club is spoken for. You can still follow along on the League and News tabs.</div></section>`
      : `<section class="board"><div class="meta">Front office</div><div class="big">Pick your club</div><div class="small" style="color:var(--board-dim)">Every team without a GM is run by the computer. Claim one to set lineups, make trades and run the business.</div><div><button class="btn primary" data-act="claim-open" type="button">Choose a team</button></div></section>`;
    return h + viewOwners();
  }
  const t = TEAM[mt], s = S.std[mt], f = S.fin[mt], su = setup(mt);
  const [hl, hc, hd] = health(mt), wk = weekly(mt);
  const oseg = `<section class="card"><div class="pad" style="padding-top:12px"><div class="seg seg4" role="group" aria-label="Office view"><button type="button" data-act="ov" data-v="overview" aria-pressed="${officeView === 'overview'}">Finances</button><button type="button" data-act="ov" data-v="business" aria-pressed="${officeView === 'business'}">Business</button><button type="button" data-act="ov" data-v="analysis" aria-pressed="${officeView === 'analysis'}">Analysis</button></div></div></section>`;
  if (officeView === 'business') return oseg + viewBusiness();
  if (officeView === 'analysis') return oseg + viewAnalysis();
  if (officeView === 'feedback') return oseg + viewFeedback();
  let next = '';
  if (S.phase === 'season' && W.sched[S.day]) {
    const g = W.sched[S.day].find(x => x[0] === mt || x[1] === mt);
    if (g) { const home = g[0] === mt, opp = home ? g[1] : g[0]; next = `<div class="nextup"><span class="meta">Next game</span><span>${home ? 'vs' : 'at'} <b>${esc(TEAM[opp].city)}</b> (${rec(opp)})</span><span class="small" style="color:var(--board-dim)">${esc(P[probable(mt)].name)} vs ${esc(P[probable(opp)].name)}</span></div>`; }
  }
  const inc = trades.filter(x => x.to === mt && x.status === 'pending' && !offerStale(x));
  let h = oseg;
  void next; void inc;
  const spark = wk.w.length ? (() => {
    const mx = Math.max(1, ...wk.w.map(x => Math.abs(x[0] - x[1])));
    return `<svg class="spark" viewBox="0 0 140 40" role="img" aria-label="Daily profit, last ${wk.w.length} days"><line x1="0" y1="20" x2="140" y2="20" stroke="var(--line)"/>${wk.w.map((x, i) => { const v = x[0] - x[1], hgt = Math.max(1, Math.abs(v) / mx * 18); return `<rect x="${i * 20 + 3}" y="${v >= 0 ? 20 - hgt : 20}" width="14" height="${hgt}" rx="2" fill="${v >= 0 ? 'var(--good)' : 'var(--bad)'}"/>`; }).join('')}</svg>`;
  })() : '';
  h += `<div class="cols">`;
  h += `<section class="card"><h2>Finances<span class="sub"><span class="pill ${hc}">${hl}</span></span></h2>
    <div class="kv"><div><span>Cash balance</span><b>${money(cashOf(mt))}</b></div><div><span>Payroll</span><b>${money(payroll(mt))}</b></div><div><span>Last 7 days revenue</span><b>${money(wk.rev)}</b></div><div><span>Last 7 days net</span><b style="color:${wk.net >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(wk.net)}</b></div></div>
    <div class="pad row" style="padding-top:12px;align-items:center">${spark}<span class="small muted" style="flex:1;min-width:0">${esc(hd)}</span></div></section>`;
  // ledger
  const rev = f[1] + f[2] + f[3] + (f[9] || 0) + (f[10] || 0) + Math.max(0, f[14] || 0), exp = f[4] + f[5] + (f[8] || 0) + (f[11] || 0) + (f[12] || 0) + (f[13] || 0) + (f[15] || 0) - Math.min(0, f[14] || 0), avg = f[7] ? Math.round(f[6] / f[7]) : 0;
  h += `<section class="card"><h2>Season ledger<span class="sub">Avg crowd ${avg.toLocaleString()} of ${t.cap.toLocaleString()}</span></h2><div class="scroll"><table><tbody>
      <tr><td>Ticket sales</td><td>${money(f[1])}</td></tr><tr><td>Food &amp; drinks</td><td>${money(f[2])}</td></tr><tr><td>Parking</td><td>${money(f[9] || 0)}</td></tr><tr><td>Merch, suites &amp; sponsors</td><td>${money(f[10] || 0)}</td></tr><tr><td>TV, radio &amp; national revenue</td><td>${money(f[3])}</td></tr>${(f[14] || 0) > 0 ? `<tr><td>Luxury tax share</td><td>${money(f[14])}</td></tr>` : ''}
      <tr><td><b>Revenue</b></td><td><b>${money(rev)}</b></td></tr>
      <tr><td>Player payroll paid</td><td>−${money(f[4])}</td></tr><tr><td>Stadium &amp; operations</td><td>−${money(f[5])}</td></tr><tr><td>Promotions &amp; marketing</td><td>−${money(f[11] || 0)}</td></tr><tr><td>Scouting &amp; development</td><td>−${money((f[8] || 0) + (f[12] || 0))}</td></tr>${f[15] ? `<tr><td>Medical staff</td><td>−${money(f[15])}</td></tr>` : ''}${f[13] ? `<tr><td>Loan interest &amp; upkeep</td><td>−${money(f[13])}</td></tr>` : ''}${(f[14] || 0) < 0 ? `<tr><td>Luxury tax paid</td><td>−${money(-f[14])}</td></tr>` : ''}${adjNow(mt) ? `<tr><td>Signings, trades, projects &amp; TV advance</td><td>${money(adjNow(mt))}</td></tr>` : ''}
      <tr><td><b>Profit this season</b></td><td><b style="color:${rev - exp + adjNow(mt) >= 0 ? 'var(--good)' : 'var(--bad)'}">${money(rev - exp + adjNow(mt))}</b></td></tr></tbody></table></div></section>`;
  const ros = su.roster.slice().sort((a, b) => salFor(b, mt) - salFor(a, mt));
  h += `<section class="card"><h2>Biggest contracts</h2><div class="list">${ros.slice(0, 8).map(id => `<div class="item"><span class="${ovrClass(P[id].ovr)}">${P[id].ovr}</span><div class="nm"><button class="lnk" type="button" data-act="player" data-p="${id}"><b>${esc(P[id].name)}</b></button>${ilTag(id)}<span class="s">${posShort(P[id])} · age ${P[id].age} · through ${yearOf(endFor(id, mt))}</span></div><span class="num">${money(salFor(id, mt))}</span></div>`).join('')}</div></section>`;
  h += `</div>`;
  const rows = TEAMS.map(x => ({ id: x.id, att: S.fin[x.id][7] ? S.fin[x.id][6] / S.fin[x.id][7] : 0, pay: payroll(x.id), cash: cashOf(x.id) })).sort((a, b) => b.cash - a.cash);
  h += `<section class="card"><h2>League business</h2><div class="scroll"><table><thead><tr><th>Club</th><th>Avg crowd</th><th>Payroll</th><th>Cash</th></tr></thead><tbody>${rows.map(r => `<tr class="${r.id === mt ? 'mine' : ''}"><td><span class="abbr">${r.id}</span> <span class="muted small city">${esc(TEAM[r.id].city)}</span></td><td>${Math.round(r.att).toLocaleString()}</td><td>${money(r.pay)}</td><td style="color:${r.cash >= 0 ? 'var(--ink)' : 'var(--bad)'}">${money(r.cash)}</td></tr>`).join('')}</tbody></table></div></section>`;
  return h;
}
function ticketNote(tid, price, nextHome) {
  if (!nextHome) return '<span class="muted">No home games in the next ten days.</span>';
  const a = FO.attendance(W, S, tid, nextHome, price, () => 0.5), cap = TEAM[tid].cap;
  return `Next home game vs ${esc(TEAM[nextHome].city)}: about <b class="num">${a.toLocaleString()}</b> fans (${Math.round(a / cap * 100)}% full), <b class="num">${money(a * (price + 6))}</b> with concessions.`;
}
function scoutNote(b) {
  const e = Math.round(12 * Math.pow(1 - b / FO.ERA.scoutMax, 1.3));
  return e ? `Other clubs' players and free agents show ratings accurate to about ±${e}. A bigger budget sharpens the picture.` : 'Your scouts see every rating exactly.';
}

// ---------------- Roster spreadsheet ----------------
let rosterMode = 'depth', rSort = { k: 'ovr', d: -1 };
function viewRatings(tid) {
  const su = setup(tid), slot = {}; su.lineup.forEach(([id], i) => { slot[id] = i + 1; });
  const H = su.roster.filter(id => P[id].t === 'H'), Pi = su.roster.filter(id => P[id].t === 'P');
  const r = (id, k, i) => seenR(id, P[id].rt[k], i);
  const sorter = (ids, cols) => { const c = cols.find(x => x.k === rSort.k) || cols.find(x => x.k === 'ovr'); return ids.slice().sort((a, b) => { const va = c.v(a), vb = c.v(b); return (typeof va === 'string' ? va.localeCompare(vb) : va - vb) * rSort.d; }); };
  const bl = id => batLine(id) || [];
  const hc = [
    { k: 'slot', t: '#', v: id => slot[id] || 99, f: id => slot[id] || '' },
    { k: 'name', t: 'Name', v: id => P[id].name, f: id => `<button class="lnk" type="button" data-act="player" data-p="${id}">${esc(P[id].name)}</button>${ilTag(id)}`, c: 'name' },
    { k: 'pos', t: 'Pos', v: id => P[id].pos, f: id => posShort(P[id]) },
    { k: 'age', t: 'Age', v: id => P[id].age, f: id => P[id].age },
    { k: 'ovr', t: 'OVR', v: id => sOvr(id), f: id => `<b>${sOvr(id)}</b>` },
    { k: 'con', t: 'Con', v: id => r(id, 'con', 1), f: id => r(id, 'con', 1) },
    { k: 'pow', t: 'Pow', v: id => r(id, 'pow', 2), f: id => r(id, 'pow', 2) },
    { k: 'eye', t: 'Eye', v: id => r(id, 'eye', 3), f: id => r(id, 'eye', 3) },
    { k: 'spd', t: 'Spd', v: id => r(id, 'spd', 4), f: id => r(id, 'spd', 4) },
    { k: 'def', t: 'Def', v: id => r(id, 'def', 5), f: id => r(id, 'def', 5) },
    { k: 'avg', t: 'AVG', v: id => bl(id)[2] ? bl(id)[4] / bl(id)[2] : 0, f: id => bl(id)[2] ? fmt3(bl(id)[4] / bl(id)[2]) : '—' },
    { k: 'hr', t: 'HR', v: id => bl(id)[7] || 0, f: id => bl(id)[7] || 0 },
    { k: 'rbi', t: 'RBI', v: id => bl(id)[8] || 0, f: id => bl(id)[8] || 0 },
    { k: 'sal', t: 'Salary', v: id => salFor(id, tid), f: id => money(salFor(id, tid)) },
    { k: 'thru', t: 'Thru', v: id => endFor(id, tid), f: id => "'" + String(yearOf(endFor(id, tid))).slice(2) },
  ];
  const pl = id => pitLine(id) || [];
  const pc = [
    { k: 'name', t: 'Name', v: id => P[id].name, f: id => `<button class="lnk" type="button" data-act="player" data-p="${id}">${esc(P[id].name)}</button>${ilTag(id)}`, c: 'name' },
    { k: 'pos', t: 'Role', v: id => (su.rotation.includes(id) ? 'SP' : id === su.closer ? 'CL' : 'RP'), f: id => (su.rotation.includes(id) ? 'SP' + (su.rotation.indexOf(id) + 1) : id === su.closer ? 'CL' : 'RP') },
    { k: 'age', t: 'Age', v: id => P[id].age, f: id => P[id].age },
    { k: 'ovr', t: 'OVR', v: id => sOvr(id), f: id => `<b>${sOvr(id)}</b>` },
    { k: 'stf', t: 'Stf', v: id => r(id, 'stf', 1), f: id => r(id, 'stf', 1) },
    { k: 'ctl', t: 'Ctl', v: id => r(id, 'ctl', 2), f: id => r(id, 'ctl', 2) },
    { k: 'mov', t: 'Mov', v: id => r(id, 'mov', 3), f: id => r(id, 'mov', 3) },
    { k: 'sta', t: 'Sta', v: id => r(id, 'sta', 4), f: id => r(id, 'sta', 4) },
    { k: 'wl', t: 'W-L', v: id => (pl(id)[2] || 0) - (pl(id)[3] || 0), f: id => `${pl(id)[2] || 0}-${pl(id)[3] || 0}` },
    { k: 'era', t: 'ERA', v: id => pl(id)[5] ? pl(id)[7] * 27 / pl(id)[5] : 99, f: id => pl(id)[5] ? (pl(id)[7] * 27 / pl(id)[5]).toFixed(2) : '—' },
    { k: 'so', t: 'SO', v: id => pl(id)[9] || 0, f: id => pl(id)[9] || 0 },
    { k: 'sv', t: 'SV', v: id => pl(id)[4] || 0, f: id => pl(id)[4] || 0 },
    { k: 'sal', t: 'Salary', v: id => salFor(id, tid), f: id => money(salFor(id, tid)) },
    { k: 'thru', t: 'Thru', v: id => endFor(id, tid), f: id => "'" + String(yearOf(endFor(id, tid))).slice(2) },
  ];
  const table = (title, ids, cols) => `<section class="card"><h2>${title}<span class="sub">${ids.length} players · tap a column to sort</span></h2><div class="scroll"><table class="sheet-t"><thead><tr>${cols.map(c => `<th class="${c.c || ''}"><button type="button" class="sorth${rSort.k === c.k ? ' on' : ''}" data-act="sort" data-k="${c.k}">${c.t}${rSort.k === c.k ? (rSort.d < 0 ? ' ▾' : ' ▴') : ''}</button></th>`).join('')}</tr></thead><tbody>${sorter(ids, cols).map(id => `<tr>${cols.map(c => `<td class="${c.c || ''}">${c.f(id)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></section>`;
  return table('Position players', H, hc) + table('Pitchers', Pi, pc) + (myTeam() && tid !== myTeam() && fogErr() ? `<p class="small muted" style="margin:0">Ratings for other clubs come from your scouts and are accurate to about ±${fogErr()}.</p>` : '');
}

// ---------------- trade AI glue ----------------
let tradeCash = 0, showHint = false, lastFeedback = null, rostersOpen = false;
document.addEventListener('toggle', e => { if (e.target.classList && e.target.classList.contains('rosters')) rostersOpen = e.target.open; }, true);
function pinfo(id) { const tid = playerTeam(id); if (tid === 'FA' && farmOrg(id)) return { id, sal: 0, yrs: 1 }; return { id, sal: salFor(id, tid), yrs: Math.max(1, endFor(id, tid) - seasonNo() + (S.phase === 'offseason' ? 0 : 1)) }; }
function ctxFor(tid, st) { const SS = st || S; return FO.teamCtx(W, SS, tid, setup(tid), SS === S ? cashOf(tid) : SS.fin[tid][0] + ((docs[tid] && docs[tid].cashAdj) || 0), SS.phase); }
function offerStale(t) { return t.ai && S && S.phase === 'season' && t.day != null && S.day - t.day > 10; }
function myValue(ids, scouted) {
  return ids.reduce((a, id) => { const p = P[id], o = scouted ? sOvr(id) : p.ovr, pk = p.peak ? (scouted ? potSeen(id) : p.peak.ovr) : o; return a + FO.tradeValue(Object.assign({}, p, { ovr: o, proj: FO.projOvr(p, o, pk), sal: farmOrg(id) ? 0 : salFor(id) })); }, 0);
}
function tradeDesc(t) {
  const cash = t.cash ? (t.cash > 0 ? ` plus ${money(t.cash)} from ${esc(t.from)}` : ` plus ${money(-t.cash)} from ${esc(t.to)}`) : '';
  return `<b>${esc(t.from)}</b> send ${esc(t.give.map(id => P[id].name).join(', ') || 'nothing')} · <b>${esc(t.to)}</b> send ${esc(t.get.map(id => P[id].name).join(', ') || 'nothing')}${cash}`;
}

// AI general managers make offers and deal with each other after a week or more of games
async function aiActivity(days) {
  if (S.phase !== 'season' || tradesClosed()) return;
  if (days < 7 && Math.random() > days / 7) return;
  const season = seasonNo(), cpu = TEAMS.filter(t => !ownerOf(t.id)).map(t => t.id);
  const humans = TEAMS.filter(t => ownerOf(t.id)).map(t => t.id);
  const R = Math.random;
  for (const h of humans) {
    if (trades.some(t => t.ai && t.to === h && t.status === 'pending' && !offerStale(t))) continue;
    const block = myBlock(h), needs = myNeeds(h).map(n => n === 'BAT' ? null : n).filter(Boolean);
    const posted = block.length || myNeeds(h).length;
    if (R() > (posted ? 0.85 : 0.5) || !cpu.length) continue;
    for (let tries = 0; tries < (posted ? 8 : 4); tries++) {
      const c = cpu[Math.floor(R() * cpu.length)];
      const o = FO.aiOffer(W, ctxFor(c), setup(c), setup(h), id => pinfo(id), R, farmOf(c), { prefer: block, needs: myNeeds(h).includes('BAT') ? needs.concat(['1B', 'OF', '3B']) : needs });
      if (!o) continue;
      const t = { from: c, to: h, give: o.give, get: o.get, cash: o.cash, status: 'pending', ai: true, by: 'ai', day: S.day, ts: Date.now() };
      const id = newId(); trades.unshift(Object.assign({ id }, t));
      if (mode !== 'local') await writeDoc('trades/' + id, t).catch(() => {});
      if (h === myTeam()) addNote('trade', { icon: '⇄', title: `${esc(TEAM[c].city)}'s GM sent you a trade offer`, body: `They want ${o.get.map(x => esc(P[x].name)).join(' + ')}. Your scouts have a take on it.`, btn: ['goto-offers', 'Review'] });
      break;
    }
  }
  if (cpu.length >= 2 && R() < 0.4) {
    for (let tries = 0; tries < 5; tries++) {
      const a = cpu[Math.floor(R() * cpu.length)], b = cpu[Math.floor(R() * cpu.length)];
      if (a === b) continue;
      const o = FO.aiOffer(W, ctxFor(a), setup(a), setup(b), id => pinfo(id), R, farmOf(a));
      if (!o) continue;
      const ev = FO.aiEvaluate(W, ctxFor(b), o.give.map(pinfo), o.get.map(pinfo), o.cash);
      if (!ev.accept) continue;
      const t = { from: a, to: b, give: o.give, get: o.get, cash: o.cash, status: 'accepted', ai: true, by: 'ai', day: S.day, ts: Date.now() };
      const legal = FO.evalTrade(W, rosterOf(a), rosterOf(b), mlbOf(t.give, a), mlbOf(t.get, b));
      if (legal.errFrom || legal.errTo) continue;
      await executeTrade(t, legal);
      S.news.unshift([S.day, `Trade: ${TEAM[a].city} send ${t.give.map(id => P[id].name).join(' and ')}${t.cash ? ` and ${money(t.cash)}` : ''} to ${TEAM[b].city} for ${t.get.map(id => P[id].name).join(' and ')}.`, 'trade', a]);
      const id = newId(); trades.unshift(Object.assign({ id }, t));
      if (mode !== 'local') await writeDoc('trades/' + id, t).catch(() => {});
      break;
    }
  }
}

// ---------------- News ----------------
let newsFilter = 'all';
function viewNews() {
  const mt = myTeam();
  const seg = [['all', 'All'], ['mine', 'My club'], ['tx', 'Transactions'], ['injury', 'Injuries'], ['milestone', 'Milestones']].map(([k, l]) => `<button type="button" data-act="nf" data-v="${k}" aria-pressed="${newsFilter === k}">${l}</button>`).join('');
  let h = `<section class="card"><div class="pad" style="padding-top:12px"><div class="seg scrollseg" role="group" aria-label="Filter news">${seg}</div></div></section>`;
  const dayLbl = d => d === 0 ? 'Winter' : d <= LEN() ? FO.dateOf(d - 1) : 'Oct';
  // front office desk: your feedback and transactions
  const tx = trades.filter(t => t.status !== 'pending').filter(t => newsFilter === 'tx' || newsFilter === 'all' || (newsFilter === 'mine' && (t.from === mt || t.to === mt)));
  const txRows = tx.filter(t => t.status !== 'rejected' || t.from === mt).slice(0, 25).map(t => {
    if (t.status === 'rejected') return ['Front office', `<b>${esc(TEAM[t.to].city)}</b> passed on your offer. ${(t.reasons || []).map(r => '“' + esc(r) + '”').join(' ')}`, 'warnline'];
    if (t.status === 'signed' && P[t.pid]) return ['Signing', `${esc(TEAM[t.from].city)} signed free agent ${esc(P[t.pid].name)} for ${money(t.sal)} a year.`];
    if (t.status === 'released' && P[t.pid]) return ['Release', `${esc(TEAM[t.from].city)} released ${esc(P[t.pid].name)}.`];
    if (t.status === 'extended' && P[t.pid]) return ['Extension', `${esc(TEAM[t.from].city)} extended ${esc(P[t.pid].name)} at ${money(t.sal)} a year.`];
    if (t.type === 'biz' && t.status === 'built') return t.from === mt ? ['Ballpark', `${esc(FO.BUILDS[t.k] ? FO.BUILDS[t.k].name : 'Project')} opened. Cost ${money(t.sal)}.`] : null;
    if (t.type === 'farm' && t.status === 'grew' && P[t.pid]) return t.from === mt ? ['Farm', `Your coaches raised ${esc(P[t.pid].name)}'s ceiling. Potential now ${potGrade(t.pid)}.`] : null;
    if (t.type === 'farm' && P[t.pid]) return t.status === 'drafted' ? (t.from === mt ? ['Draft', `You drafted ${esc(P[t.pid].name)} (${posShort(P[t.pid])}, ${P[t.pid].age}, potential ${potGrade(t.pid)}) in round ${t.rd || 1}, pick No. ${t.pick}.`] : null) : ['Farm', `${esc(TEAM[t.from].city)} ${t.status === 'called up' ? 'called up' : 'sent down'} ${esc(P[t.pid].name)}.`];
    if (t.status === 'outbid' && P[t.pid]) return t.from === mt ? ['Missed', `${esc(P[t.pid].name)} signed with ${t.winner ? esc(TEAM[t.winner].city) + ' for ' + money(t.wsal) + ' a year' : 'another club'}. Your offer was ${money(t.sal)}.`, 'warnline'] : null;
    if (t.give) return [t.status === 'accepted' ? 'Trade' : t.status[0].toUpperCase() + t.status.slice(1), tradeDesc(t) + (t.feedback ? ` <span class="muted">${esc(t.feedback)}</span>` : '')];
    return null;
  }).filter(Boolean);
  if ((newsFilter === 'all' || newsFilter === 'tx' || newsFilter === 'mine') && txRows.length) h += `<section class="card"><h2>Transactions &amp; front office</h2><div class="news">${txRows.map(([d, t, c]) => `<div class="${c || ''}"><span class="d">${d}</span><span>${t}</span></div>`).join('')}</div></section>`;
  if (newsFilter !== 'tx') {
    let wire = S.news;
    if (newsFilter === 'mine') wire = wire.filter(n => n[3] === mt);
    else if (newsFilter !== 'all') wire = wire.filter(n => n[2] === newsFilter);
    h += `<section class="card"><h2>League wire<span class="sub">${wire.length} items</span></h2><div class="news">${wire.length ? wire.slice(0, 80).map(n => `<div class="${n[3] && n[3] === mt ? 'mineline' : ''}"><span class="d">${dayLbl(n[0])}</span><span>${n[2] === 'injury' ? '<span class="tag red">IL</span> ' : n[2] === 'milestone' ? '<span class="tag gold">★</span> ' : n[2] === 'trade' ? '<span class="tag">Trade</span> ' : ''}${esc(n[1])}</span></div>`).join('') : '<div class="empty" style="display:block">Nothing yet. Sim some games.</div>'}</div></section>`;
  }
  return h;
}

// ---------------- League (standings, scores, leaders) ----------------
let leagueView = 'standings';
function viewLeagueTab() {
  const seg = `<section class="card"><div class="pad" style="padding-top:12px"><div class="seg" role="group" aria-label="League view"><button type="button" data-act="lv" data-v="standings" aria-pressed="${leagueView === 'standings'}">Standings</button><button type="button" data-act="lv" data-v="scores" aria-pressed="${leagueView === 'scores'}">Scores</button></div></div></section>`;
  if (leagueView === 'leaders') return seg + viewStats();
  if (leagueView === 'scores') return seg + viewScores() + viewOwners();
  return seg + (S.post ? viewBracket() : '') + viewStandings() + viewOwners();
}
function viewScores() {
  const mt = myTeam();
  if (!box || !box.games || !box.games.length) return `<section class="card"><div class="empty">Scores show up after the first sim.</div></section>`;
  return `<section class="card"><h2>${box.post ? 'Postseason scores' : 'Scores'}<span class="sub">${box.post ? '' : esc(FO.dateOf(box.day))}</span></h2><div class="scores">` +
    box.games.map((g, i) => {
      const aw = g.as > g.hs, mine = mt && (g.h === mt || g.a === mt);
      return `<button type="button" class="score${mine ? ' mineScore' : ''}" data-act="box" data-i="${i}"><span class="ln ${aw ? 'w' : 'l'}"><span>${esc(g.a)}</span><span>${g.as}</span></span><span class="ln ${aw ? 'l' : 'w'}"><span>${esc(g.h)}</span><span>${g.hs}</span></span><span class="f">${g.inn > 9 ? 'F/' + g.inn : 'Final'} · W ${esc(lastName(g.dec[0]))}</span></button>`;
    }).join('') + `</div></section>`;
}

// ---------------- history ----------------
let hist = { seasons: [] };
function historyRows(id) {
  const p = P[id], rows = [];
  for (const s of hist.seasons || []) {
    if (p.t === 'H') { const a = s.bat && s.bat[id]; if (a && a[2]) rows.push(`<tr><td>${s.year}</td><td>${a[2]}</td><td>${fmt3(a[4] / a[2])}</td><td>${a[7]}</td><td>${a[8]}</td><td>${a[11]}</td></tr>`); }
    else { const a = s.pit && s.pit[id]; if (a && a[5]) rows.push(`<tr><td>${s.year}</td><td>${ipStr(a[5])}</td><td>${a[2]}-${a[3]}</td><td>${(a[7] * 27 / a[5]).toFixed(2)}</td><td>${a[9]}</td><td>${a[4]}</td></tr>`); }
  }
  return rows;
}
async function saveHistory() {
  const keepB = {}, keepP = {};
  for (const id in S.bat) if (S.bat[id][1] >= 20) keepB[id] = S.bat[id];
  for (const id in S.pit) if (S.pit[id][5] >= 15) keepP[id] = S.pit[id];
  const gmRows = {}, gm = Object.assign({}, (hist && hist.gm) || {});
  for (const t of TEAMS) {
    const o = ownerOf(t.id); if (!o) continue;
    const sc = gmScore(t.id), pts = Math.round(sc.total * 10) / 10;
    gmRows[t.id] = { owner: o, win: Math.round(sc.win), biz: Math.round(sc.biz), fans: Math.round(sc.fans), total: pts };
    const g = gm[o] || { pts: 0, seasons: 0, titles: 0, best: 0 };
    gm[o] = { pts: Math.round((g.pts + pts) * 10) / 10, seasons: g.seasons + 1, titles: g.titles + (sc.pr.champ ? 1 : 0), best: Math.max(g.best || 0, pts) };
  }
  const rw = raceOrder(raceTable())[0];
  const seasons = (hist.seasons || []).concat([{ season: seasonNo(), year: yearOf(seasonNo()), champ: S.post && S.post.champ, bat: keepB, pit: keepP, gm: gmRows, raceW: rw ? rw.tid : null, g163: !!tbOf(), std: clone(S.std) }]).slice(-4);
  const bk = (hist.book || []).slice(), key = (meta.created || 0) + ':' + seasonNo();
  if (S.post && S.post.champ && !bk.some(b => b.key === key)) { try { bk.push(seasonSummary()); } catch (e) { /* optional */ } }
  hist = { seasons, gm, book: bk };
  if (mode === 'local') saveLocal(); else await writeDoc('league/history', hist).catch(() => {});
}

// ---------------- Stats tab ----------------
let stSub = 'leaders', stLg = 'ALL', stTeam = '', stQual = true, stSort = { k: 'ops', d: -1 }, stSortP = { k: 'era', d: 1 };
function teamGames() { return Math.max(1, Math.round(TEAMS.reduce((a, t) => a + (S.gp[t.id] || 0), 0) / TEAMS.length)); }
function batRows() {
  const gp = teamGames();
  return Object.entries(S.bat).map(([id, a]) => {
    id = +id; const tm = playerTeam(id);
    const tb = a[4] + a[5] + 2 * a[6] + 3 * a[7];
    const avg = a[2] ? a[4] / a[2] : 0, obp = a[1] ? (a[4] + a[9]) / a[1] : 0, slg = a[2] ? tb / a[2] : 0;
    return { id, tm, q: a[1] >= gp * 3.1, g: a[0], pa: a[1], ab: a[2], r: a[3], h: a[4], d: a[5], t: a[6], hr: a[7], rbi: a[8], bb: a[9], so: a[10], sb: a[11], avg, obp, slg, ops: obp + slg };
  });
}
function pitRows() {
  const gp = teamGames();
  return Object.entries(S.pit).map(([id, a]) => {
    id = +id; const tm = playerTeam(id), ip = a[5] / 3;
    return { id, tm, q: a[5] >= gp * 3, g: a[0], gs: a[1], w: a[2], l: a[3], sv: a[4], outs: a[5], h: a[6], r: a[7], bb: a[8], so: a[9], hr: a[10], era: ip ? a[7] * 9 / ip : 99, whip: ip ? (a[6] + a[8]) / ip : 99, k9: ip ? a[9] * 9 / ip : 0 };
  });
}
function stFilter(rows) {
  return rows.filter(r => (stLg === 'ALL' || (TEAM[r.tm] && TEAM[r.tm].lg === stLg)) && (!stTeam || r.tm === stTeam));
}
function viewStatsTab() {
  const mt = myTeam();
  const seg = `<div class="seg" role="group" aria-label="Stats view"><button type="button" data-act="stsub" data-v="leaders" aria-pressed="${stSub === 'leaders'}">Leaders</button><button type="button" data-act="stsub" data-v="bat" aria-pressed="${stSub === 'bat'}">Batting</button><button type="button" data-act="stsub" data-v="pit" aria-pressed="${stSub === 'pit'}">Pitching</button></div>`;
  const lgSeg = `<div class="seg" role="group" aria-label="League"><button type="button" data-act="stlg" data-v="ALL" aria-pressed="${stLg === 'ALL'}">MLB</button><button type="button" data-act="stlg" data-v="AL" aria-pressed="${stLg === 'AL'}">AL</button><button type="button" data-act="stlg" data-v="NL" aria-pressed="${stLg === 'NL'}">NL</button></div>`;
  const teamSel = `<select id="stTeam" aria-label="Club"><option value="">All clubs</option>${TEAMS.map(t => `<option value="${t.id}" ${stTeam === t.id ? 'selected' : ''}>${esc(t.city)} (${t.id})</option>`).join('')}</select>`;
  let h = `<section class="card"><h2>${yearOf(seasonNo())} stats<span class="sub">${S.phase === 'offseason' ? 'final' : teamGames() + ' games per club'}</span></h2><div class="pad stfilters">${seg}<div class="row wrap">${lgSeg}${teamSel}${stSub !== 'leaders' ? `<label class="small row"><input type="checkbox" id="stQual" ${stQual ? 'checked' : ''}> Qualified only</label>` : ''}</div></div></section>`;
  if (!Object.keys(S.bat).length) return h + `<section class="card"><div class="empty">Stats appear after the first day of games.</div></section>`;
  if (stSub === 'leaders') return h + viewLeaderCards(mt);
  return h + (stSub === 'bat' ? viewBatTable(mt) : viewPitTable(mt));
}
function viewLeaderCards(mt) {
  const B = stFilter(batRows()), Pr = stFilter(pitRows());
  const top = (rows, f, fmt, asc) => rows.slice().sort((a, b) => asc ? f(a) - f(b) : f(b) - f(a)).slice(0, 5).map(r => [r.id, r.tm, fmt(f(r))]);
  const qb = B.filter(r => r.q), qp = Pr.filter(r => r.q);
  const cards = [
    ['Batting average', top(qb, r => r.avg, fmt3)], ['Home runs', top(B, r => r.hr, String)], ['Runs batted in', top(B, r => r.rbi, String)],
    ['On-base plus slugging', top(qb, r => r.ops, fmt3)], ['Stolen bases', top(B, r => r.sb, String)], ['Hits', top(B, r => r.h, String)],
    ['Earned run average', top(qp, r => r.era, v => v.toFixed(2), true)], ['Wins', top(Pr, r => r.w, String)], ['Strikeouts', top(Pr, r => r.so, String)],
    ['Saves', top(Pr, r => r.sv, String)], ['WHIP', top(qp, r => r.whip, v => v.toFixed(2), true)], ['Innings pitched', top(Pr, r => r.outs, v => ipStr(v))],
  ];
  return `<div class="leadgrid">` + cards.map(([title, rows]) => `<section class="card"><h2>${title}</h2><div class="list">${rows.length ? rows.map(([id, tm, v], i) => `<div class="item${tm === mt ? ' mine' : ''}"><span class="slot">${i + 1}</span><div class="nm"><button class="lnk" type="button" data-act="player" data-p="${id}"><b>${esc(P[id].name)}</b></button><span class="s">${tm === 'FA' ? 'Free agent' : esc(tm)}${tm === mt ? ' · yours' : ''}</span></div><span class="num" style="font-weight:600;font-size:16px">${v}</span></div>`).join('') : '<div class="empty">Not enough playing time yet.</div>'}</div></section>`).join('') + `</div>`;
}
function statTable(rows, cols, sort, act, mt) {
  const c = cols.find(x => x.k === sort.k) || cols[2];
  rows = rows.slice().sort((a, b) => (c.v(a) - c.v(b)) * sort.d);
  const shown = rows.slice(0, 50);
  return `<section class="card"><div class="scroll"><table class="sheet-t stat-t"><thead><tr><th class="name">#</th><th class="name">Player</th><th>Club</th>${cols.map(x => `<th><button type="button" class="sorth${sort.k === x.k ? ' on' : ''}" data-act="${act}" data-k="${x.k}">${x.t}${sort.k === x.k ? (sort.d < 0 ? ' ▾' : ' ▴') : ''}</button></th>`).join('')}</tr></thead><tbody>${shown.map((r, i) => `<tr class="${r.tm === mt ? 'mine' : ''}"><td class="name">${i + 1}</td><td class="name"><button class="lnk" type="button" data-act="player" data-p="${r.id}">${esc(P[r.id].name)}</button></td><td>${r.tm === 'FA' ? 'FA' : esc(r.tm)}</td>${cols.map(x => `<td>${x.f(r)}</td>`).join('')}</tr>`).join('') || `<tr><td class="name" colspan="${cols.length + 3}">Nobody matches these filters yet.</td></tr>`}</tbody></table></div>${rows.length > 50 ? `<p class="pad small muted" style="padding-top:10px;margin:0">Showing 50 of ${rows.length}. Tap a column to sort.</p>` : ''}</section>`;
}
function viewBatTable(mt) {
  let rows = stFilter(batRows()); if (stQual) rows = rows.filter(r => r.q);
  const n = k => ({ k, v: r => r[k], f: r => r[k] });
  const rate = k => ({ k, v: r => r[k], f: r => fmt3(r[k]) });
  const cols = [Object.assign(n('g'), { t: 'G' }), Object.assign(n('pa'), { t: 'PA' }), Object.assign(n('ab'), { t: 'AB' }), Object.assign(n('r'), { t: 'R' }), Object.assign(n('h'), { t: 'H' }), Object.assign(n('d'), { t: '2B' }), Object.assign(n('t'), { t: '3B' }), Object.assign(n('hr'), { t: 'HR' }), Object.assign(n('rbi'), { t: 'RBI' }), Object.assign(n('bb'), { t: 'BB' }), Object.assign(n('so'), { t: 'SO' }), Object.assign(n('sb'), { t: 'SB' }), Object.assign(rate('avg'), { t: 'AVG' }), Object.assign(rate('obp'), { t: 'OBP' }), Object.assign(rate('slg'), { t: 'SLG' }), Object.assign(rate('ops'), { t: 'OPS' })];
  return statTable(rows, cols, stSort, 'stsort', mt);
}
function viewPitTable(mt) {
  let rows = stFilter(pitRows()); if (stQual) rows = rows.filter(r => r.q);
  const n = (k, t) => ({ k, t, v: r => r[k], f: r => r[k] });
  const cols = [n('g', 'G'), n('gs', 'GS'), n('w', 'W'), n('l', 'L'), n('sv', 'SV'), { k: 'outs', t: 'IP', v: r => r.outs, f: r => ipStr(r.outs) }, n('h', 'H'), n('r', 'R'), n('bb', 'BB'), n('so', 'SO'), n('hr', 'HR'), { k: 'era', t: 'ERA', v: r => r.era, f: r => r.era < 99 ? r.era.toFixed(2) : '—' }, { k: 'whip', t: 'WHIP', v: r => r.whip, f: r => r.whip < 99 ? r.whip.toFixed(2) : '—' }, { k: 'k9', t: 'K/9', v: r => r.k9, f: r => r.k9.toFixed(1) }];
  return statTable(rows, cols, stSortP, 'stsortp', mt);
}

boot();
})();
