/* Front Office '97 — simulation engine. Plain script: defines globalThis.FO. */
(function (G) {
  'use strict';

  // ---------- teams ----------
  // id, city, lg, div, metro pop (M), capacity, park run factor, 1997 attendance (M), est payroll ($M), default ticket $
  const TEAM_ROWS = [
    ['BAL','Baltimore','AL','East',2.5,48262,0.98,3.71,58,15],
    ['NYY','New York (A)','AL','East',20,57545,0.98,2.58,59,16],
    ['DET','Detroit','AL','East',5.2,52416,1.02,1.37,17,10],
    ['BOS','Boston','AL','East',5.8,33871,1.05,2.23,43,16],
    ['TOR','Toronto','AL','East',4.3,50516,1.00,2.59,47,14],
    ['CLE','Cleveland','AL','Central',2.9,43368,1.01,3.40,57,15],
    ['CWS','Chicago (A)','AL','Central',8.6,44321,1.00,1.86,55,13],
    ['MIL','Milwaukee','AL','Central',1.6,53192,0.98,1.44,25,10],
    ['MIN','Minnesota','AL','Central',2.8,48678,1.03,1.41,32,10],
    ['KC','Kansas City','AL','Central',1.7,40625,1.02,1.52,33,10],
    ['SEA','Seattle','AL','West',3.3,59166,1.03,3.19,41,13],
    ['ANA','Anaheim','AL','West',3.0,45050,0.97,1.77,31,11],
    ['TEX','Texas','AL','West',4.5,49115,1.04,2.95,55,13],
    ['OAK','Oakland','AL','West',3.0,43662,0.94,1.26,25,10],
    ['ATL','Atlanta','NL','East',3.6,50091,1.02,3.46,53,14],
    ['FLA','Florida','NL','East',3.5,42531,0.96,2.36,48,12],
    ['NYM','New York (N)','NL','East',20,55777,0.96,1.77,39,13],
    ['MON','Montreal','NL','East',3.3,46500,0.98,1.50,19,9],
    ['PHI','Philadelphia','NL','East',5.9,62382,1.00,1.49,35,12],
    ['HOU','Houston','NL','Central',4.0,54313,0.93,2.05,32,11],
    ['PIT','Pittsburgh','NL','Central',2.4,47972,0.98,1.66,9,9],
    ['CIN','Cincinnati','NL','Central',1.9,52953,1.02,1.79,46,10],
    ['STL','St. Louis','NL','Central',2.5,57673,0.98,2.63,46,12],
    ['CHC','Chicago (N)','NL','Central',8.6,38765,1.04,2.19,39,14],
    ['SF','San Francisco','NL','West',6.5,63000,0.94,1.69,35,12],
    ['LAD','Los Angeles','NL','West',15,56000,0.93,3.32,45,12],
    ['COL','Colorado','NL','West',2.4,50200,1.22,3.89,46,13],
    ['SD','San Diego','NL','West',2.7,46510,0.95,2.09,37,11],
  ];
  // 2026: est. 2026 payroll ($M), 2025 attendance (M), avg ticket $
  const TEAM_ROWS_26 = [
    ['BAL','Baltimore','AL','East',2.8,45971,1.00,1.95,165,38],
    ['BOS','Boston','AL','East',4.9,37755,1.05,2.6,200,60],
    ['NYY','New York (A)','AL','East',20,46537,1.02,3.3,300,65],
    ['TB','Tampa Bay','AL','East',3.2,25025,0.95,0.9,95,30],
    ['TOR','Toronto','AL','East',6.7,41500,1.00,3.0,260,45],
    ['CLE','Cleveland','AL','Central',2.1,34830,0.97,1.9,105,32],
    ['CWS','Chicago (A)','AL','Central',9.5,40615,1.00,1.4,85,30],
    ['DET','Detroit','AL','Central',4.4,41083,0.98,2.4,160,35],
    ['KC','Kansas City','AL','Central',2.2,37903,1.03,1.8,130,30],
    ['MIN','Minnesota','AL','Central',3.7,38544,1.00,1.8,110,35],
    ['ATH','Sacramento','AL','West',2.4,14014,1.08,0.8,80,35],
    ['HOU','Houston','AL','West',7.3,41168,1.00,2.7,225,45],
    ['LAA','Los Angeles (A)','AL','West',3.2,45517,1.00,2.4,200,38],
    ['SEA','Seattle','AL','West',4.1,47929,0.93,2.7,165,42],
    ['TEX','Texas','AL','West',7.9,40300,0.97,2.5,210,42],
    ['ATL','Atlanta','NL','East',6.3,41084,1.00,2.9,230,45],
    ['MIA','Miami','NL','East',6.1,36742,0.96,1.1,70,30],
    ['NYM','New York (N)','NL','East',20,41922,0.96,2.9,330,55],
    ['PHI','Philadelphia','NL','East',6.2,42901,1.02,3.3,290,48],
    ['WSH','Washington','NL','East',6.4,41339,1.00,1.9,120,40],
    ['CHC','Chicago (N)','NL','Central',9.5,41649,1.02,2.9,230,55],
    ['CIN','Cincinnati','NL','Central',2.2,43500,1.10,2.0,120,32],
    ['MIL','Milwaukee','NL','Central',1.6,41900,1.00,2.6,130,35],
    ['PIT','Pittsburgh','NL','Central',2.4,38747,0.97,1.6,100,30],
    ['STL','St. Louis','NL','Central',2.8,44494,0.98,2.4,150,40],
    ['ARI','Arizona','NL','West',5.0,48405,1.02,2.4,185,38],
    ['COL','Colorado','NL','West',3.0,50144,1.25,2.4,130,35],
    ['LAD','Los Angeles (N)','NL','West',13,56000,1.00,4.0,340,60],
    ['SD','San Diego','NL','West',3.3,40222,0.95,3.4,210,50],
    ['SF','San Francisco','NL','West',4.7,41915,0.95,2.5,200,50],
  ];
  const ERAS = {
    '1997': { id: '1997', year: 1997, rows: TEAM_ROWS, dh: 'AL', post: '1997', scale: 1, minSal: 150000, maxSal: 11.5e6, open: [3, 1],
      fin: { nat: 14e6, lb: 2e6, lm: 2.8e6, conc: 6, ops: 20e6, seat: 110, cbt: 51e6, tax: 0.35, start: 15e6, park0: 6, merch: 2, suite: 40000, spon: 1.2e6, promo: 20000, adsMax: 4e6, adsDef: 0.5e6, devMax: 4e6, devDef: 1e6, bscale: 1, loanMax: 20e6, rate: 0.07 }, price: [4, 40], faScale: 0.9, scoutMax: 5e6, scoutDef: 1e6, cal: { hit: 0.965, hr: 0.85, sb: 0.9 } },
    '2026': { id: '2026', year: 2026, rows: TEAM_ROWS_26, dh: 'all', post: '2022', scale: 7, minSal: 780000, maxSal: 50e6, open: [2, 26],
      fin: { nat: 45e6, lb: 15e6, lm: 14e6, conc: 12, ops: 52e6, seat: 280, cbt: 244e6, tax: 0.3, start: 60e6, share: 0.3, park0: 25, merch: 7, suite: 240000, spon: 7e6, promo: 110000, adsMax: 25e6, adsDef: 3e6, devMax: 25e6, devDef: 5e6, bscale: 6, loanMax: 120e6, rate: 0.07 }, price: [15, 150], faScale: 4, scoutMax: 25e6, scoutDef: 5e6, cal: { hit: 1.0, hr: 0.93, sb: 0.9 } },
  };
  let ERA = ERAS['1997'];
  const TEAMS = [], TEAM = {};
  function setEra(id) {
    ERA = ERAS[id] || ERAS['1997'];
    TEAMS.length = 0; for (const k in TEAM) delete TEAM[k];
    ERA.rows.forEach((r, i) => { const t = { id: r[0], city: r[1], lg: r[2], div: r[3], mkt: r[4], cap: r[5], pf: r[6], att97: r[7], pay97: r[8], price0: r[9], idx: i }; TEAMS.push(t); TEAM[t.id] = t; });
    G.FO && (G.FO.ERA = ERA);
    return ERA;
  }
  setEra('1997');

  // ---------- rng ----------
  function rng(seed) {
    let a = seed >>> 0;
    const f = function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    f.state = () => a; return f;
  }

  // ---------- parse rosters ----------
  const ipToOuts = ip => { const s = String(ip).split('.'); return (+s[0]) * 3 + (s[1] ? +s[1] : 0); };
  function parse(text) {
    const players = []; let team = null;
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith('#')) { const id = line.slice(1).trim(); if (TEAM[id] || id === 'FA') team = id; continue; }
      const f = line.split('|');
      if (f[0] === 'H') {
        players.push({ t: 'H', name: f[1], pos: f[2], bats: f[3], age: +f[4], team, AB: +f[5], AVG: +f[6], D: +f[7], T: +f[8], HR: +f[9], BB: +f[10], SO: +f[11], SB: +f[12], CS: +f[13] });
      } else if (f[0] === 'P') {
        players.push({ t: 'P', name: f[1], pos: 'P', throws: f[2], role: f[3], age: +f[4], team, G: +f[5], GS: +f[6], outs: ipToOuts(f[7]), W: +f[8], L: +f[9], SV: +f[10], ERA: +f[11], SO: +f[12], BB: +f[13] });
      }
    }
    players.forEach((p, i) => { p.id = i; });
    return players;
  }

  // ---------- ratings ----------
  const EV = ['bb', 'k', 's', 'd', 't', 'hr', 'o'];
  const W_OBA = { bb: 0.70, s: 0.89, d: 1.27, t: 1.62, hr: 2.10 };
  const POS_ADJ = { C: 10, SS: 7, '2B': 3, CF: 3, '3B': 2, RF: -6, LF: -6, OF: -5, '1B': -10, DH: -14 };
  const PITCHER_BAT = { bb: 0.045, k: 0.33, s: 0.105, d: 0.018, t: 0.002, hr: 0.004 };
  PITCHER_BAT.o = 1 - (PITCHER_BAT.bb + PITCHER_BAT.k + PITCHER_BAT.s + PITCHER_BAT.d + PITCHER_BAT.t + PITCHER_BAT.hr);

  function woba(r) { return W_OBA.bb * r.bb + W_OBA.s * r.s + W_OBA.d * r.d + W_OBA.t * r.t + W_OBA.hr * r.hr; }
  function baseRunsPerOut(r) {
    // r = per-PA rates; returns runs per out (BaseRuns)
    const H = r.s + r.d + r.t + r.hr, TB = r.s + 2 * r.d + 3 * r.t + 4 * r.hr;
    const A = H + r.bb - r.hr, B = (1.4 * TB - 0.6 * H - 3 * r.hr + 0.1 * r.bb) * 1.02, C = r.k + r.o, D = r.hr;
    return (A * B / (B + C) + D) / C;
  }

  function buildRatings(players) {
    const hitters = players.filter(p => p.t === 'H'), pitchers = players.filter(p => p.t === 'P');
    // neutralize park: half games at home
    const pfOf = p => TEAM[p.team] ? TEAM[p.team].pf : 1;
    const parkH = p => (1 + Math.sqrt(pfOf(p))) / 2, parkHR = p => (1 + Math.pow(pfOf(p), 1.3)) / 2;
    // raw per-PA hitter rates
    let tot = { pa: 0, bb: 0, k: 0, s: 0, d: 0, t: 0, hr: 0 };
    hitters.forEach(p => {
      const H = Math.round(p.AB * p.AVG), HBP = Math.round(p.AB * 0.009), SF = Math.round(p.AB * 0.008);
      const PA = p.AB + p.BB + HBP + SF;
      const ph = parkH(p), phr = parkHR(p);
      const r = { pa: PA, bb: p.BB + HBP, k: p.SO, s: Math.max(0, H - p.D - p.T - p.HR) / ph, d: p.D / ph, t: p.T / ph, hr: p.HR / phr };
      p.raw = r; p.PA = PA; p.H = H;
      if (p.team !== 'FA') for (const k in tot) tot[k] += r[k];
    });
    const L = {}; ['bb', 'k', 's', 'd', 't', 'hr'].forEach(k => { L[k] = tot[k] / tot.pa; });
    L.o = 1 - (L.bb + L.k + L.s + L.d + L.t + L.hr);
    const lgW = woba(L);
    // regress hitters toward slightly-below-average
    const PRIOR = 150;
    hitters.forEach(p => {
      const r = {}; let sum = 0;
      ['bb', 'k', 's', 'd', 't', 'hr'].forEach(k => {
        const prior = (k === 'k') ? L[k] * 1.05 : L[k] * 0.93;
        r[k] = (p.raw[k] + prior * PRIOR) / (p.raw.pa + PRIOR); sum += r[k];
      });
      r.o = 1 - sum; p.r = r;
      const onFirst = (p.raw.s + p.raw.bb) || 1;
      p.sbAtt = Math.min(0.40, (p.SB + p.CS) / onFirst * 1.15);
      p.sbPct = (p.SB + 2) / (p.SB + p.CS + 3);
      const spdRaw = (p.SB * 0.6 + p.T * 4) / Math.max(150, p.PA) * 100; // ~0..8
      p.spd = Math.max(0.75, Math.min(1.35, 0.85 + spdRaw * 0.07));
      p.w = woba(r);
      const runs600 = (p.w - lgW) / 1.2 * 600 + (POS_ADJ[p.pos] || 0) + (0.2 * p.SB - 0.4 * p.CS) * 600 / Math.max(300, p.PA);
      p.val = runs600;
      p.ovr = Math.round(Math.max(25, Math.min(99, 60 + 0.8 * runs600)));
      // display sub-ratings 20..99
      const bip = 1 - r.bb - r.k;
      const cont = (r.s + r.d + r.t + r.hr) / (r.s + r.d + r.t + r.hr + r.o + r.k);
      p.rt = {
        con: clampR(50 + (cont - 0.265) * 600),
        pow: clampR(50 + ((r.d + 2 * r.t + 3 * r.hr) / bip - 0.20) * 260),
        eye: clampR(50 + (r.bb - L.bb) * 600 - (r.k - L.k) * 150),
        spd: clampR(50 + (p.spd - 1) * 150),
      };
      const hsh = ((p.id + 13) * 2246822519 >>> 0) % 1000 / 1000;
      const DEF_BASE = { C: 58, SS: 62, '2B': 57, CF: 60, '3B': 55, RF: 51, LF: 47, OF: 50, '1B': 45, DH: 35 };
      p.def = clampR((DEF_BASE[p.pos] || 50) + (p.spd - 1) * 45 + (28 - p.age) * 0.7 + (hsh - 0.5) * 22);
      p.rt.def = p.def;
      posProfile(p);
      void bip;
    });

    // pitchers: league ERA and fit hit-quality factor h
    let ipTot = 0, erTot = 0, kTot = 0, bbTot = 0;
    pitchers.forEach(p => { if (p.team === 'FA') return; ipTot += p.outs / 3; erTot += p.ERA * p.outs / 27; kTot += p.SO; bbTot += p.BB; });
    const lgERA = erTot / ipTot * 9;
    const bipL = 1 - L.bb - L.k;
    const scale = (lgERA / 9) / (baseRunsPerOut(L) * 3); // ERA per run conversion
    const ratesFor = (k, bb, h) => {
      const rem = 1 - k - bb;
      let s = L.s / bipL * rem * h, d = L.d / bipL * rem * h, t = L.t / bipL * rem * h, hr = L.hr / bipL * rem * Math.pow(h, 1.4);
      return { bb, k, s, d, t, hr, o: 1 - bb - k - s - d - t - hr };
    };
    pitchers.forEach(p => {
      posProfile(p);
      const IP = p.outs / 3, PRI = 45;
      const era = (p.ERA * IP + lgERA * 1.04 * PRI) / (IP + PRI);
      const ph = (1 + pfOf(p)) / 2;
      const eraN = era / ph;
      // per-out K and BB, regressed
      const kpo = (p.SO + (kTot / (ipTot * 3)) * PRI * 3) / (p.outs + PRI * 3);
      const bbpo = (p.BB * 1.08 + (bbTot * 1.08 / (ipTot * 3)) * PRI * 3) / (p.outs + PRI * 3);
      let lo = 0.55, hi = 1.9, best = null;
      for (let it = 0; it < 40; it++) {
        const h = (lo + hi) / 2;
        // iterate BF per out
        let bfpo = 1.45, r;
        for (let j = 0; j < 6; j++) { r = ratesFor(kpo / bfpo, bbpo / bfpo, h); bfpo = 1 / (r.k + r.o); }
        const e = baseRunsPerOut(r) * 27 * scale / 3 * 3;
        best = { h, r };
        if (e > eraN) hi = h; else lo = h;
      }
      p.h = best.h; p.r = best.r;
      const ipPerG = IP / Math.max(1, p.G);
      if (p.role === 'SP') {
        const relG = p.G - p.GS, ipStart = p.GS ? Math.max(3, (IP - relG * 1.3) / p.GS) : ipPerG;
        p.stam = Math.max(16, Math.min(33, Math.round(ipStart * 4.25)));
      } else {
        p.stam = Math.max(4, Math.min(12, Math.round(ipPerG * 4.3 + 1)));
      }
      p.eraN = eraN;
      if (p.role === 'SP') { const runs = (lgERA - eraN) * 200 / 9; p.val = runs; p.ovr = Math.round(Math.max(25, Math.min(99, 60 + 0.85 * runs))); }
      else { const runs = (lgERA - eraN) * 75 / 9; p.val = runs * 1.3; p.ovr = Math.round(Math.max(25, Math.min(97, 55 + 1.5 * runs))); }
      p.rt = {
        stf: clampR(50 + (p.r.k - L.k) * 330),
        ctl: clampR(50 - (p.r.bb - L.bb) * 500),
        mov: clampR(50 - (p.h - 1) * 160),
        sta: p.role === 'SP' ? clampR(20 + (p.stam - 16) * 4.3) : clampR(15 + p.stam * 4),
      };
    });
    return { L, lgERA, lgW, scale, bipL };
  }
  function clampR(x) { return Math.round(Math.max(15, Math.min(99, x))); }

  // ---------- salaries (estimated, scaled to approx 1997 team payrolls) ----------
  function buildSalaries(players) {
    const byTeam = {};
    players.forEach(p => { (byTeam[p.team] = byTeam[p.team] || []).push(p); });
    for (const id in byTeam) {
      if (id === 'FA') continue;
      const list = byTeam[id];
      const w = list.map(p => {
        const v = Math.max(0, p.ovr - 45);
        const vet = p.age >= 30 ? 1.25 : p.age >= 27 ? 1.0 : p.age >= 25 ? 0.55 : 0.3;
        return Math.pow(v, 1.45) * vet + 3;
      });
      const sum = w.reduce((a, b) => a + b, 0);
      const target = TEAM[id].pay97 * 1e6 - list.length * ERA.minSal;
      list.forEach((p, i) => { p.sal = Math.min(ERA.maxSal, Math.round((ERA.minSal + Math.max(0, target) * w[i] / sum) / 10000) * 10000); });
    }
  }

  // ---------- default team setups ----------
  const POS_ORDER = ['C', 'SS', '2B', 'CF', '3B', 'RF', 'LF', '1B'];
  const isOF = p => ['LF', 'CF', 'RF', 'OF'].includes(p);

  // Real multi-position players (both eras). Primary position still comes from the roster data.
  const KNOWN_POS = {
    // 2026
    'Mookie Betts': ['SS', '2B', 'RF'], 'Tommy Edman': ['2B', 'SS', 'CF', '3B', 'LF'], 'Ketel Marte': ['2B', 'CF'], 'Max Muncy|3B': ['3B', '2B', '1B'],
    'Jake Cronenworth': ['2B', '1B', 'SS', '3B'], 'Brendan Donovan': ['2B', 'LF', '3B', '1B', 'RF'], 'Zach McKinstry': ['3B', '2B', 'SS', 'RF', 'LF'],
    'Willi Castro': ['2B', '3B', 'SS', 'LF', 'RF', 'CF'], 'Javier Báez': ['SS', '2B', '3B', 'CF'], 'Enrique Hernández': ['2B', '3B', 'SS', 'CF', 'LF', '1B'], 'Kiké Hernández': ['2B', '3B', 'SS', 'CF', 'LF', '1B'],
    'Mauricio Dubón': ['2B', 'SS', '3B', 'CF', 'LF'], 'Isiah Kiner-Falefa': ['SS', '3B', '2B'], 'Luis Rengifo': ['3B', '2B', 'SS', 'LF'], 'José Caballero': ['SS', '2B', '3B', 'RF', 'CF'],
    'Chris Taylor': ['LF', 'SS', '2B', 'CF'], 'Gleyber Torres': ['2B', 'SS'], 'Jorge Polanco': ['2B', '3B', 'SS', '1B'], 'Andy Ibáñez': ['3B', '2B', '1B'], 'Spencer Steer': ['1B', '3B', 'LF', '2B'],
    'Jonathan India': ['2B', '3B', 'LF'], 'Bobby Witt Jr.': ['SS', '3B'], 'Cody Bellinger': ['CF', '1B', 'RF', 'LF'], 'Jarren Duran': ['LF', 'CF', 'RF'], 'Brice Turang': ['2B', 'SS'],
    'Ha-Seong Kim': ['SS', '2B', '3B'], 'Matt McLain': ['2B', 'SS'], 'Gavin Lux': ['2B', '3B', 'LF'], 'Oswaldo Cabrera': ['3B', '2B', 'SS', 'LF', 'RF'], 'Ezequiel Duran': ['2B', '3B', 'SS', 'LF', 'RF'],
    'Daulton Varsho': ['CF', 'LF', 'RF'], 'Ryan McMahon': ['3B', '2B'], 'Kyle Farmer': ['SS', '2B', '3B'], 'Josh Smith': ['3B', 'SS', '2B', 'LF', 'RF'], 'Nick Gonzales': ['2B', 'SS'],
    'Freddie Freeman': ['1B'], 'Pete Alonso': ['1B'], 'Paul Goldschmidt': ['1B'], 'Christian Walker': ['1B'], 'Shohei Ohtani': [], 'Kyle Schwarber': ['LF'], 'Yordan Alvarez': ['LF'],
    'Marcus Semien': ['2B', 'SS'], 'Trea Turner': ['SS', '2B'], 'Francisco Lindor': ['SS'], 'Xander Bogaerts': ['SS', '2B'], 'Corey Seager': ['SS'], 'Manny Machado': ['3B', 'SS'],
    'Alex Bregman': ['3B', '2B'], 'Jose Altuve': ['2B', 'LF'], 'Nolan Arenado': ['3B'], 'Rafael Devers': ['3B', '1B'], 'Luis Arraez': ['1B', '2B'], 'Willy Adames': ['SS'],
    'Ozzie Albies': ['2B'], 'Michael Busch': ['1B'], 'Nico Hoerner': ['2B', 'SS'], 'Dansby Swanson': ['SS'], 'Miguel Rojas': ['SS', '2B', '3B', '1B'], 'Amed Rosario': ['SS', '2B', '3B', 'LF', 'RF'],
    'Ryan Mountcastle': ['1B'], 'Wilmer Flores': ['1B', '3B', '2B'], 'Dylan Moore': ['2B', 'SS', '3B', 'LF', 'RF', 'CF'], 'Mark Vientos': ['3B', '1B'], 'Jeff McNeil': ['2B', 'LF', 'RF'],
    // 1997
    'Tony Phillips': ['LF', '2B', '3B', 'RF', 'CF'], 'Mark Loretta': ['SS', '2B', '3B', '1B'], 'Lenny Harris': ['3B', '1B', '2B', 'LF', 'RF'], 'Craig Biggio': ['2B'],
    'Chipper Jones': ['3B', 'SS', 'LF'], 'Bobby Bonilla': ['3B', 'RF', '1B', 'LF'], 'Todd Zeile': ['3B', '1B'], 'Kevin Seitzer': ['3B', '1B'], 'Dave Hansen': ['3B', '1B', '2B'],
    'Luis Alicea': ['2B', '3B'], 'Bip Roberts': ['2B', 'LF', '3B'], 'Jose Vizcaino': ['SS', '2B'], 'Tony Fernandez': ['2B', 'SS', '3B'], 'Mike Lansing': ['2B', 'SS'],
    'Derek Bell': ['RF', 'CF'], 'Jeff Bagwell': ['1B'], 'Mark McGwire': ['1B'], 'Frank Thomas': ['1B'], 'Dave Magadan': ['3B', '1B'], 'Damion Easley': ['2B', 'SS'],
    'Jeff Kent': ['2B', '3B', '1B'], 'Joe Randa': ['3B', '2B'], 'Ed Sprague': ['3B', '1B'], 'Gregg Jefferies': ['LF', '1B'], 'B.J. Surhoff': ['LF', '3B', '1B', 'RF'],
    'Craig Counsell': ['2B', 'SS'], 'Jose Offerman': ['2B', 'SS', '1B'], 'Tim Bogar': ['SS', '3B', '2B', '1B'], 'Luis Sojo': ['2B', 'SS', '3B'], 'Manny Alexander': ['SS', '2B'],
    'Jose Hernandez': ['SS', '3B', '2B'], 'Cal Ripken Jr.': ['3B', 'SS'], 'Cal Ripken': ['3B', 'SS'], 'Alex Rodriguez': ['SS'], 'Derek Jeter': ['SS'], 'Paul Molitor': ['1B', '3B'],
    'Edgar Martinez': ['1B', '3B'], 'Ken Griffey Jr.': ['CF'], 'Barry Bonds': ['LF'], 'Mike Piazza': ['C'], 'Ivan Rodriguez': ['C'], 'Wade Boggs': ['3B', '1B'], 'Rafael Palmeiro': ['1B'],
    'Robin Ventura': ['3B', '1B'], 'Matt Williams': ['3B'], 'Larry Walker': ['RF', 'CF'], 'Brian McRae': ['CF', 'LF'], 'Shawon Dunston': ['SS', 'CF'], 'Mickey Morandini': ['2B'],
    'Kevin Stocker': ['SS'], 'Dmitri Young': ['1B', 'LF'], 'Ellis Burks': ['CF', 'LF', 'RF'], 'Dante Bichette': ['LF', 'RF'], 'Eric Young': ['2B'], 'Vinny Castilla': ['3B'],
  };
  // ---------- positional versatility ----------
  // Each hitter gets the positions he can handle, with a defensive rating at each.
  // Moving down the defensive spectrum (SS -> 2B/3B -> 1B) is easy; moving up costs more.
  const SPECTRUM = { DH: 0, '1B': 1, LF: 2, RF: 3, '3B': 4, '2B': 5, CF: 6, SS: 7, C: 8 };
  function posProfile(p) {
    if (p.t !== 'H') { p.elig = ['P']; p.defAt = {}; return; }
    const h = k => (((p.id + 1) * 2654435761 + k * 40503) >>> 0) % 1000 / 1000;
    const known = KNOWN_POS[p.name + '|' + p.pos] || KNOWN_POS[p.name];
    let prim = p.pos === 'OF' ? (h(1) < 0.5 ? 'LF' : 'RF') : p.pos;
    const DEFB = { C: 58, SS: 62, '2B': 57, CF: 60, '3B': 55, RF: 51, LF: 47, OF: 50, '1B': 45, DH: 35 };
    // a listed DH who really plays the field: use his main glove position
    if (prim === 'DH' && known && known.length) { p.def = Math.round((p.def || 35) - DEFB.DH + DEFB[known[0]]); prim = known[0]; }
    const extra = [];
    const add = (pos, chance, k) => { if (h(k) < chance) extra.push(pos); };
    const fast = (p.spd || 1) >= 1.08, glove = (p.def || 50) >= 55;
    if (known) extra.push(...known);
    else switch (prim) {
      // only natural moves: infielders around the infield, outfielders around the outfield, anyone to 1B
      case 'C': add('1B', 0.2, 2); break;
      case 'SS': extra.push('2B', '3B'); break;
      case '2B': add('1B', 0.4, 7); add('3B', 0.45, 2); add('SS', glove ? 0.3 : 0.1, 3); break;
      case '3B': add('1B', 0.7, 7); add('2B', 0.25, 2); add('SS', glove ? 0.12 : 0.03, 5); break;
      case '1B': break;
      case 'CF': extra.push('LF', 'RF'); break;
      case 'LF': extra.push('RF'); add('CF', fast ? 0.35 : 0.08, 2); add('1B', 0.2, 3); break;
      case 'RF': extra.push('LF'); add('CF', fast ? 0.35 : 0.08, 2); add('1B', 0.2, 3); break;
      case 'DH': add('1B', 0.4, 2); break;
    }
    p.elig = [prim].concat(extra.filter((x, i) => x !== prim && x !== 'DH' && extra.indexOf(x) === i));
    p.defAt = {};
    const base = p.def || 50, s0 = SPECTRUM[prim] || 0;
    for (const pos of p.elig) {
      const d = (SPECTRUM[pos] || 0) - s0;
      const adj = pos === prim ? 0 : d > 0 ? -4 * d : 2;
      p.defAt[pos] = Math.max(15, Math.min(99, Math.round(base + adj + (pos === prim ? 0 : (h(10 + (SPECTRUM[pos] || 0)) - 0.5) * 8))));
    }
    p.util = p.elig.filter(x => x !== 'DH').length >= 3;
  }
  function canPlay(p, pos) {
    if (pos === 'DH') return true;
    if (!p.elig) return p.pos === pos || (isOF(pos) && isOF(p.pos));
    if (pos === 'OF') return p.elig.some(x => isOF(x));
    return p.elig.includes(pos);
  }
  function defAt(p, pos) { if (pos === 'DH') return 50; if (p.defAt && p.defAt[pos] != null) return p.defAt[pos]; return Math.max(15, (p.def || 50) - 25); }
  // Fill the field with the best combination: hitting first, glove as a tiebreaker, scarce spots first.
  // Fill the field with the best possible combination (exact search over who plays where):
  // hitting first, glove as a tiebreaker, never out of position when anyone eligible exists.
  const LU_POS = ['C', '1B', '2B', '3B', 'SS', 'LF', 'CF', 'RF', 'DH'];
  const OFS = { LF: 1, CF: 1, RF: 1, OF: 1 };
  function luScore(p, pos) {
    if (pos === 'DH') return p.w * 1000;
    if (!canPlay(p, pos)) return p.w * 1000 - 10000;
    const prim = p.elig ? p.elig[0] : p.pos, cross = !!OFS[prim] !== !!OFS[pos] && pos !== '1B' && prim !== '1B' && prim !== 'DH';
    return p.w * 1000 + (defAt(p, pos) - 50) * 0.6 - (pos === prim ? 0 : cross ? 12 : 3);
  }
  function autoLineup(P, roster) {
    const hit = roster.map(id => P[id]).filter(p => p && p.t === 'H');
    const N = LU_POS.length, M = 1 << N, H = hit.length, NEG = -1e15;
    const sc = hit.map(p => LU_POS.map(pos => luScore(p, pos)));
    // layer i: best value having considered hitters 0..i-1 with positions in mask filled
    const val = [new Float64Array(M).fill(NEG)], pick = [];
    val[0][0] = 0;
    for (let i = 0; i < H; i++) {
      const prev = val[i], cur = Float64Array.from(prev), ch = new Int8Array(M).fill(-1);
      for (let mask = 0; mask < M; mask++) {
        const v0 = prev[mask]; if (v0 === NEG) continue;
        for (let k = 0; k < N; k++) {
          if (mask & (1 << k)) continue;
          const m2 = mask | (1 << k), v = v0 + sc[i][k];
          if (v > cur[m2]) { cur[m2] = v; ch[m2] = k; }
        }
      }
      val.push(cur); pick.push(ch);
    }
    let end = -1, bc = -1;
    for (let mask = 0; mask < M; mask++) { if (val[H][mask] === NEG) continue; const c = popc(mask); if (c > bc || (c === bc && val[H][mask] > val[H][end])) { bc = c; end = mask; } }
    const at = [];
    for (let i = H - 1, mask = end; i >= 0 && mask > 0; i--) { const k = pick[i][mask]; if (k >= 0) { at.push([hit[i].id, LU_POS[k]]); mask &= ~(1 << k); } }
    return battingOrder(P, at.reverse());
  }
  const popc = m => { let c = 0; while (m) { c += m & 1; m >>= 1; } return c; };
  function battingOrder(P, slots) {
    const s = slots.slice().sort((a, b) => P[b[0]].w - P[a[0]].w);
    if (s.length < 9) return s;
    const top = s.slice(0, 4), rest = s.slice(4);
    // leadoff: best obp*speed among rest + #4
    const pool = rest.concat([top[3]]);
    pool.sort((a, b) => (obp(P[b[0]]) * P[b[0]].spd) - (obp(P[a[0]]) * P[a[0]].spd));
    const lead = pool[0];
    const others = s.filter(x => x !== lead && x !== top[0] && x !== top[1]);
    // order: lead, others[0], top0, top1, then remaining by w
    return [lead, others[0], top[0], top[1]].concat(others.slice(1));
  }
  const obp = p => p.r.bb + p.r.s + p.r.d + p.r.t + p.r.hr;
  function autoStaff(P, roster) {
    const pit = roster.map(id => P[id]).filter(p => p && p.t === 'P');
    const sp = pit.filter(p => p.role === 'SP').sort((a, b) => b.ovr - a.ovr);
    const rp = pit.filter(p => p.role !== 'SP').sort((a, b) => b.ovr - a.ovr);
    const rotation = sp.slice(0, 5).map(p => p.id);
    let extra = sp.slice(5);
    const pen = rp.slice();
    while (rotation.length < 5 && pen.length) { pen.sort((a, b) => b.stam - a.stam); rotation.push(pen.shift().id); }
    const cl = pen.filter(p => p.role === 'CL').sort((a, b) => b.ovr - a.ovr)[0] || pen.slice().sort((a, b) => b.ovr - a.ovr)[0];
    return { rotation, closer: cl ? cl.id : null, extra: extra.map(p => p.id) };
  }

  // Resolve a team's effective setup from its doc (or defaults)
  function teamSetup(W, tid, doc, inj) {
    const P = W.P;
    const roster = (doc && Array.isArray(doc.roster) && doc.roster.length) ? doc.roster.filter(id => P[id]) : W.defRoster[tid];
    const rset = new Set(roster);
    let lineup = null;
    if (doc && Array.isArray(doc.lineup) && doc.lineup.length === 9) {
      const ok = doc.lineup.every(s => Array.isArray(s) && rset.has(s[0]) && P[s[0]].t === 'H') && new Set(doc.lineup.map(s => s[0])).size === 9;
      if (ok) lineup = doc.lineup.map(s => [s[0], s[1]]);
    }
    if (!lineup) lineup = autoLineup(P, roster);
    const auto = autoStaff(P, roster);
    let rotation = (doc && Array.isArray(doc.rotation)) ? doc.rotation.filter(id => rset.has(id) && P[id].t === 'P') : null;
    if (!rotation || rotation.length < 4) rotation = auto.rotation;
    let closer = (doc && rset.has(doc.closer) && P[doc.closer].t === 'P' && !rotation.includes(doc.closer)) ? doc.closer : null;
    if (closer == null) closer = rotation.includes(auto.closer) ? null : auto.closer;
    const pen = roster.filter(id => P[id].t === 'P' && !rotation.includes(id));
    const price = (doc && typeof doc.price === 'number') ? Math.max(ERA.price[0], Math.min(ERA.price[1], doc.price)) : TEAM[tid].price0;
    const con = (doc && doc.con && typeof doc.con === 'object') ? doc.con : {};
    const scout = (doc && typeof doc.scout === 'number') ? Math.max(0, Math.min(ERA.scoutMax, doc.scout)) : ERA.scoutDef;
    let pen2 = pen;
    if (inj) { // injured players sit; best healthy fill-ins take their place for the day
      const hurt = id => inj[id] > 0;
      const used = new Set(lineup.map(s => s[0]));
      lineup = lineup.map(([id, pos]) => {
        if (!hurt(id)) return [id, pos];
        const bench = roster.filter(x => P[x].t === 'H' && !used.has(x) && !hurt(x));
        const pick = bench.filter(x => canPlay(P[x], pos)).sort((a, b) => P[b].w - P[a].w)[0] || bench.sort((a, b) => P[b].w - P[a].w)[0];
        if (pick == null) return [id, pos];
        used.add(pick); return [pick, pos];
      });
      rotation = rotation.filter(id => !hurt(id));
      pen2 = pen.filter(id => !hurt(id));
      if (rotation.length < 4) { const extra = pen2.slice().sort((a, b) => P[b].stam - P[a].stam); while (rotation.length < 4 && extra.length) { const x = extra.shift(); rotation.push(x); pen2 = pen2.filter(y => y !== x); } }
      if (closer != null && hurt(closer)) closer = null;
      if (closer != null && !pen2.includes(closer)) closer = null;
    }
    const minors = (doc && Array.isArray(doc.minors)) ? doc.minors.filter(id => P[id] && !rset.has(id)) : [];
    return { tid, roster, lineup, rotation, closer, pen: pen2, price, con, scout, biz: bizOf(doc), minors };
  }

  // ---------- the business side ----------
  // Ballpark projects: one-time cost (x ERA.fin.bscale), 3% a year upkeep, permanent effect.
  const BUILDS = {
    suites: { name: 'Luxury suites', cost: 8e6, blurb: 'Corporate suites sell out every home game. Steady money that grows with fan interest.' },
    board: { name: 'Giant video board', cost: 5e6, blurb: 'Replays and noise. Fans like coming back: fan interest climbs.' },
    food: { name: 'Food hall & beer garden', cost: 6e6, blurb: 'Fans spend about 20% more on food and drinks.' },
    garage: { name: 'Parking garage', cost: 7e6, blurb: '25% more parking spots, and fans grumble less about the price.' },
    store: { name: 'Flagship team store', cost: 3e6, blurb: 'Merchandise sales up 50%.' },
    seats: { name: 'Bleacher expansion', cost: 12e6, blurb: '4,000 more seats. Only pays off if you sell out.' },
  };
  const PROMOS = ['None', 'Weekend giveaways', 'Most nights', 'Every night'];
  const TV = { safe: 'Fixed local TV deal', ratings: 'Ratings-based deal', advance: 'Cash advance' };
  function bizOf(doc) {
    const F = ERA.fin, b = (doc && doc.biz) || {};
    const num = (v, d, lo, hi) => typeof v === 'number' && isFinite(v) ? Math.max(lo, Math.min(hi, v)) : d;
    return {
      conc: num(b.conc, 1, 0.6, 2), park: num(b.park, F.park0, 0, F.park0 * 3), promo: num(b.promo, 1, 0, 3) | 0,
      ads: num(b.ads, F.adsDef, 0, F.adsMax), dev: num(b.dev, F.devDef, 0, F.devMax), spon: num(b.spon, 1, 0, 3) | 0,
      med: num(b.med, F.devMax * 0.25, 0, F.devMax), tv: TV[b.tv] ? b.tv : 'safe', builds: (b.builds && typeof b.builds === 'object') ? b.builds : {}, loan: num(b.loan, 0, 0, F.loanMax),
    };
  }
  const buildCost = k => BUILDS[k].cost * ERA.fin.bscale;
  function capOf(tid, biz) { return TEAM[tid].cap + (biz && biz.builds.seats ? 4000 : 0); }
  function starsOf(W, su) { return su.roster.filter(id => W.P[id] && W.P[id].ovr >= 80).length; }
  // Where fan interest is heading (1 = normal). Winning, marketing, promotions, stars and a nice park raise it; gouging lowers it.
  function fanParts(W, S, tid, su) {
    const st = S.std[tid], pct = (st[0] + 10) / (st[0] + st[1] + 20), b = su.biz, F = ERA.fin, t = TEAM[tid];
    const parts = [];
    parts.push(['Winning', 1.1 * (pct - 0.5)]);
    parts.push(['Marketing', 0.14 * Math.sqrt(b.ads / F.adsMax) - 0.05]);
    parts.push(['Promotions', 0.02 * b.promo - 0.02]);
    if (b.builds.board) parts.push(['Video board', 0.05]);
    const stars = Math.min(4, starsOf(W, su)); parts.push(['Star players', 0.015 * stars - 0.015]);
    if (b.spon) parts.push(['Ads all over the park', -0.025 * b.spon + 0.025]);
    const pr = su.price / t.price0; parts.push(['Ticket prices', pr > 1.2 ? -0.25 * (pr - 1.2) : pr < 0.85 ? 0.02 : 0]);
    parts.push(['Food prices', b.conc > 1.25 ? -0.12 * (b.conc - 1.25) : b.conc < 0.85 ? 0.015 : 0]);
    const pk = b.park / F.park0; parts.push(['Parking prices', pk > 1.3 ? -(b.builds.garage ? 0.04 : 0.08) * (pk - 1.3) : pk < 0.6 ? 0.01 : 0]);
    return parts;
  }
  function fanTarget(W, S, tid, su) {
    const x = 1 + fanParts(W, S, tid, su).reduce((a, p) => a + p[1], 0);
    return Math.max(0.6, Math.min(1.45, x));
  }
  function tvMult(S, tid, su) {
    const b = su.biz; if (b.tv === 'advance') return 0.25;
    if (b.tv !== 'ratings') return 1;
    const st = S.std[tid], pct = (st[0] + 10) / (st[0] + st[1] + 20), fan = (S.fan && S.fan[tid]) || 1;
    return Math.max(0.5, Math.min(1.7, 1 + 1.3 * (fan - 1) + 1.6 * (pct - 0.5)));
  }
  function localTV(tid) { return ERA.fin.lm * Math.pow(TEAM[tid].mkt, 0.75); }
  // per-fan spending at a concession price multiplier m (1 = normal)
  const concPerFan = (b) => ERA.fin.conc * b.conc * Math.exp(-0.5 * (b.conc - 1)) * (b.builds.food ? 1.2 : 1);
  const parkPerFan = (b) => b.park / 2.7 * (b.builds.garage ? 1.25 : 1);
  const merchPerFan = (b, fan, stars) => ERA.fin.merch * fan * (b.builds.store ? 1.5 : 1) * (1 + 0.05 * Math.min(4, stars));
  // projected money from one home game (used by the app's previews)
  function gameMoney(W, S, tid, su, att) {
    const b = su.biz, fan = (S.fan && S.fan[tid]) || 1, stars = starsOf(W, su);
    return { gate: att * su.price, conc: att * concPerFan(b), park: att * parkPerFan(b), merch: att * merchPerFan(b, fan, stars) + (b.builds.suites ? ERA.fin.suite * fan : 0), promo: b.promo * ERA.fin.promo };
  }

  // ---------- schedule ----------
  function buildSchedule(seed) {
    const r = rng(seed ^ 0x5eed);
    const AL = TEAMS.filter(t => t.lg === 'AL').map(t => t.id), NL = TEAMS.filter(t => t.lg === 'NL').map(t => t.id);
    const rounds = ids => {
      const n = ids.length, arr = ids.slice(), out = [];
      for (let rd = 0; rd < n - 1; rd++) {
        const pairs = [];
        for (let i = 0; i < n / 2; i++) { const a = arr[i], b = arr[n - 1 - i]; pairs.push((rd + i) % 2 ? [a, b] : [b, a]); }
        out.push(pairs);
        arr.splice(1, 0, arr.pop());
      }
      return out;
    };
    const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
    if (AL.length % 2) return schedule15(AL, NL, rounds, shuffle);
    const series = []; // each: array of [home, away]
    const ra = rounds(AL), rn = rounds(NL);
    const flip = ps => ps.map(([h, a]) => [a, h]);
    const leagueSeries = [];
    for (let c = 0; c < 4; c++) {
      const order = shuffle([...Array(13).keys()]);
      for (const i of order) {
        if (c === 3 && leagueSeries.length >= 49) break;
        leagueSeries.push((c % 2 ? flip(ra[i]) : ra[i]).concat(c % 2 ? flip(rn[i]) : rn[i]));
      }
    }
    const nlS = shuffle(NL.slice());
    const inter = [];
    for (let k = 0; k < 5; k++) inter.push(AL.map((a, i) => { const n = nlS[(i + k * 3) % 14]; return (i + k) % 2 ? [a, n] : [n, a]; }));
    // insert interleague in mid-season (June)
    for (let i = 0; i < 49; i++) { series.push(leagueSeries[i]); if (i === 22) series.push(...inter); }
    const days = [];
    series.forEach(s => { for (let g = 0; g < 3; g++) days.push(s); });
    return days; // 162 days, each 14 games [home, away]
  }

  // ---------- game sim ----------
  function makeGame(W, S, setups, home, away, day, R, opts) {
    const P = W.P, L = W.lg.L;
    const dh = opts && opts.dh != null ? opts.dh : (ERA.dh === 'all' || TEAM[home].lg === 'AL');
    const fat = S.fat;
    const side = (tid) => {
      const su = setups[tid];
      // starter
      let start = null;
      const rot = su.rotation;
      const gi = opts && opts.starterIdx != null ? opts.starterIdx : (S.gp[tid] || 0);
      for (let k = 0; k < rot.length; k++) {
        const id = rot[(gi + k) % rot.length];
        const f = fat[id];
        if (!f || day - f[0] >= 4) { start = id; break; }
      }
      if (start == null) start = rot[gi % rot.length];
      let order = su.lineup.map(s => ({ id: s[0], pos: s[1] }));
      if (!dh) {
        const i = order.findIndex(s => s.pos === 'DH');
        if (i >= 0) order.splice(i, 1);
        order.push({ id: start, pos: 'P' });
      } else if (!order.some(s => s.pos === 'DH') && order.length < 9) {
        // no DH in lineup (shouldn't happen) — fine
      }
      const field = order.filter(s => s.pos !== 'DH' && s.pos !== 'P');
      const dv = field.length ? field.reduce((a, s) => a + defAt(P[s.id], s.pos), 0) / field.length : 55;
      const defF = 1 - (dv - 55) * 0.003;
      return { tid, su, order, bi: 0, pit: start, pitLine: null, used: [], bat: {}, pl: {}, starter: start, defF };
    };
    const g = { home, away, dh, sides: { [home]: side(home), [away]: side(away) }, line: { [home]: [], [away]: [] }, score: { [home]: 0, [away]: 0 }, day };
    return g;
  }

  function rel(g, s, P, fat, day, lead, inning, R) {
    // choose a reliever for side s
    const avail = s.su.pen.filter(id => !s.used.includes(id) && relAvail(fat[id], day));
    if (!avail.length) {
      const any = s.su.pen.filter(id => !s.used.includes(id));
      return any.length ? any[0] : null;
    }
    const cl = s.su.closer;
    if (inning >= 9 && lead >= 1 && lead <= 3 && avail.includes(cl)) return cl;
    const byQ = avail.filter(id => id !== cl).sort((a, b) => P[b].ovr - P[a].ovr);
    if (!byQ.length) return avail[0];
    if (inning >= 7 && Math.abs(lead) <= 2) return byQ[0];
    if (inning <= 5) { const long = byQ.slice().sort((a, b) => P[b].stam - P[a].stam); return long[0]; }
    if (lead <= -4 || lead >= 5) return byQ[byQ.length - 1];
    return byQ[Math.min(byQ.length - 1, 1 + Math.floor(R() * 2))];
  }
  function relAvail(f, day) { if (!f) return true; if (f[0] < day - 1) return true; if (f[0] === day - 1) return f[1] <= 12 && f[2] < 2; return false; }

  function pline(s, id) { return s.pl[id] || (s.pl[id] = { id, outs: 0, h: 0, r: 0, bb: 0, so: 0, hr: 0, bf: 0, entryLead: 0, start: false }); }
  function bline(s, id) { return s.bat[id] || (s.bat[id] = { id, ab: 0, r: 0, h: 0, d: 0, t: 0, hr: 0, rbi: 0, bb: 0, so: 0, sb: 0, cs: 0, pa: 0 }); }

  function outcome(P, L, bat, pit, park, R, fatigueMult, isPitcherBatting, defF) {
    defF = defF || 1;
    const b = isPitcherBatting ? PITCHER_BAT : bat.r, p = pit.r;
    let sum = 0; const x = {};
    const hits = Math.sqrt(park), hrm = Math.pow(park, 1.3);
    const plat = (!isPitcherBatting && bat.bats !== 'S' && bat.bats === pit.throws) ? 0.94 : (isPitcherBatting ? 1 : 1.03);
    for (const e of EV) {
      let v = b[e] * p[e] / L[e];
      if (e === 's' || e === 'd' || e === 't') v *= hits * plat * fatigueMult * ERA.cal.hit * defF;
      if (e === 'hr') v *= hrm * plat * fatigueMult * ERA.cal.hr;
      if (e === 'bb') v *= fatigueMult;
      x[e] = v; sum += v;
    }
    let u = R() * sum;
    for (const e of EV) { u -= x[e]; if (u <= 0) return e; }
    return 'o';
  }

  function playGame(W, S, g, R) {
    const P = W.P, L = W.lg.L, park = TEAM[g.home].pf, day = g.day;
    const H = g.sides[g.home], A = g.sides[g.away];
    [H, A].forEach(s => { const l = pline(s, s.pit); l.start = true; s.used.push(s.pit); });
    let inning = 1, decided = false;
    let lastLeader = null; // team currently leading
    let wCand = { [g.home]: null, [g.away]: null }, lCand = { [g.home]: null, [g.away]: null };
    const lead = tid => g.score[tid] - g.score[tid === g.home ? g.away : g.home];
    const updateLead = () => {
      const d = g.score[g.home] - g.score[g.away];
      const leader = d > 0 ? g.home : d < 0 ? g.away : null;
      if (leader !== lastLeader) {
        if (leader) {
          const other = leader === g.home ? g.away : g.home;
          wCand[leader] = g.sides[leader].pit; // pitcher of record
          lCand[other] = g.sides[other].pit;
          wCand.final = leader;
        }
        lastLeader = leader;
      }
    };
    const pitchHalf = (off, def, top) => {
      let outs = 0, runs = 0;
      const bases = [null, null, null];
      const defSide = def, offSide = off;
      const checkPitch = (startOfInning) => {
        const cur = defSide.pit, l = pline(defSide, cur), p = P[cur];
        const isStarter = l.start;
        const ld = lead(defSide.tid);
        let pull = false;
        if (isStarter) {
          if (l.bf >= p.stam + 2) pull = true;
          else if (l.bf >= p.stam - 3 && (l.r >= 4 || (inning >= 7 && Math.abs(ld) <= 2 && startOfInning))) pull = true;
          else if (l.r >= 6 && inning >= 3) pull = true;
          else if (startOfInning && inning >= 9 && ld >= 1 && ld <= 3 && defSide.su.closer != null && !defSide.used.includes(defSide.su.closer) && relAvail(S.fat[defSide.su.closer], day)) pull = true;
        } else {
          if (cur === defSide.su.closer) { if (l.bf >= p.stam + 4 || (l.r >= 3)) pull = true; }
          else if (startOfInning && l.outs >= 3 && (l.bf >= p.stam * 0.7 || (inning >= 8 && Math.abs(ld) <= 3))) pull = true;
          else if (l.bf >= p.stam + 3 || l.r >= 4) pull = true;
          if (startOfInning && inning >= 9 && ld >= 1 && ld <= 3 && cur !== defSide.su.closer && defSide.su.closer != null && !defSide.used.includes(defSide.su.closer) && relAvail(S.fat[defSide.su.closer], day)) pull = true;
        }
        if (pull) {
          const nx = rel(g, defSide, P, S.fat, day, ld, inning, R);
          if (nx != null) { defSide.pit = nx; defSide.used.push(nx); const nl = pline(defSide, nx); nl.entryLead = ld; nl.entryInn = inning; }
        }
      };
      checkPitch(true);
      let guard = 0;
      while (outs < 3 && guard++ < 60) {
        // stolen base attempt
        if (bases[0] && !bases[1] && outs < 2) {
          const rn = P[bases[0].id];
          if (rn.t === 'H' && R() < rn.sbAtt * ERA.cal.sb) {
            const bl = bline(offSide, rn.id);
            if (R() < rn.sbPct) { bases[1] = bases[0]; bases[0] = null; bl.sb++; }
            else { bases[0] = null; bl.cs++; outs++; pline(defSide, defSide.pit).outs++; if (outs >= 3) break; }
          }
        }
        if (outs < 3) checkPitch(false);
        const bs = offSide.order[offSide.bi % offSide.order.length]; offSide.bi++;
        const bat = P[bs.id], pit = P[defSide.pit], pl = pline(defSide, defSide.pit), bl = bline(offSide, bs.id);
        const over = Math.max(0, pl.bf - pit.stam);
        const fm = 1 + 0.035 * over;
        const ev = outcome(P, L, bat, pit, park, R, fm, bs.pos === 'P', defSide.defF);
        pl.bf++; bl.pa++;
        let scored = [];
        const spd = x => (x && P[x.id].spd) || 1;
        const runner = { id: bs.id, resp: defSide.pit };
        if (ev === 'bb') {
          bl.bb++; pl.bb++;
          if (bases[0]) { if (bases[1]) { if (bases[2]) scored.push(bases[2]); bases[2] = bases[1]; } bases[1] = bases[0]; }
          bases[0] = runner;
        } else if (ev === 'k') {
          bl.ab++; bl.so++; pl.so++; outs++; pl.outs++;
        } else if (ev === 'hr') {
          bl.ab++; bl.h++; bl.hr++; pl.h++; pl.hr++;
          bases.forEach(b => b && scored.push(b)); scored.push(runner); bases[0] = bases[1] = bases[2] = null;
        } else if (ev === 't') {
          bl.ab++; bl.h++; bl.t++; pl.h++;
          bases.forEach(b => b && scored.push(b)); bases[0] = bases[1] = null; bases[2] = runner;
        } else if (ev === 'd') {
          bl.ab++; bl.h++; bl.d++; pl.h++;
          if (bases[2]) scored.push(bases[2]); if (bases[1]) scored.push(bases[1]);
          let n3 = null;
          if (bases[0]) { if (R() < (outs === 2 ? 0.6 : 0.42) * spd(bases[0])) scored.push(bases[0]); else n3 = bases[0]; }
          bases[0] = null; bases[1] = runner; bases[2] = n3;
        } else if (ev === 's') {
          bl.ab++; bl.h++; pl.h++;
          if (bases[2]) scored.push(bases[2]);
          let n3 = null, n2 = null;
          if (bases[1]) { if (R() < (outs === 2 ? 0.75 : 0.58) * spd(bases[1])) scored.push(bases[1]); else n3 = bases[1]; }
          if (bases[0]) { if (!n3 && R() < (outs === 2 ? 0.35 : 0.27) * spd(bases[0])) n3 = bases[0]; else n2 = bases[0]; }
          bases[0] = runner; bases[1] = n2; bases[2] = n3;
        } else { // ball in play out
          bl.ab++;
          const u = R();
          if (u < 0.017) { // error
            pl.bf; if (bases[2]) scored.push(bases[2]); bases[2] = bases[1]; bases[1] = bases[0]; bases[0] = runner;
            scored.forEach(x => x.unearned = true);
          } else if (R() < 0.46) { // ground ball
            if (bases[0] && outs < 2 && R() < 0.36) { // double play
              outs += 2; pl.outs += 2;
              if (outs < 3) { if (bases[2]) scored.push(bases[2]); bases[2] = bases[1]; bases[1] = null; }
              bases[0] = null; scored.forEach(x => x.noRbi = true);
            } else if (bases[0] && outs < 2 && R() < 0.25) { // fielder's choice: lead runner forced at 2nd
              outs++; pl.outs++;
              if (bases[1]) { if (bases[2]) scored.push(bases[2]); bases[2] = bases[1]; }
              bases[1] = null; bases[0] = runner;
            } else {
              outs++; pl.outs++;
              if (outs < 3) {
                if (bases[2] && R() < 0.5) { scored.push(bases[2]); bases[2] = null; }
                if (bases[1] && !bases[2] && R() < 0.55) { bases[2] = bases[1]; bases[1] = null; }
                if (bases[0] && !bases[1]) { bases[1] = bases[0]; bases[0] = null; }
              }
            }
          } else { // fly / line / pop
            outs++; pl.outs++;
            if (outs < 3) {
              if (bases[2] && R() < 0.5 * spd(bases[2])) { scored.push(bases[2]); bases[2] = null; }
              if (bases[1] && !bases[2] && R() < 0.22) { bases[2] = bases[1]; bases[1] = null; }
            }
          }
        }
        if (outs >= 3 && (ev === 'o' || ev === 'k')) scored = scored.filter(() => false);
        // score runs
        const nRuns = scored.length;
        for (const sr of scored) {
          runs++; g.score[offSide.tid]++;
          bline(offSide, sr.id).r++;
          const rl = pline(defSide, sr.resp); rl.r++;
          if (!sr.noRbi && !sr.unearned) bl.rbi++;
          updateLead();
          // walk-off
          if (!top && inning >= 9 && g.score[g.home] > g.score[g.away]) { decided = true; break; }
        }
        if (g.log) g.log.push([inning, top ? 0 : 1, bs.id, ev, nRuns, g.score[g.away], g.score[g.home], outs, defSide.pit]);
        if (decided) break;
      }
      return runs;
    };
    while (true) {
      const r1 = pitchHalf(A, H, true); g.line[g.away].push(r1);
      if (inning >= 9 && g.score[g.home] > g.score[g.away]) { g.line[g.home].push('x'); break; }
      const r2 = pitchHalf(H, A, false); g.line[g.home].push(r2);
      if (inning >= 9 && g.score[g.home] !== g.score[g.away]) break;
      if (inning >= 24) { g.score[g.home]++; g.line[g.home][g.line[g.home].length - 1]++; updateLead(); break; }
      inning++;
    }
    g.innings = inning;
    // decisions
    const winner = g.score[g.home] > g.score[g.away] ? g.home : g.away, loser = winner === g.home ? g.away : g.home;
    const ws = g.sides[winner], ls = g.sides[loser];
    let wp = wCand[winner];
    const wl = pline(ws, wp);
    if (wl.start && wl.outs < 15) {
      // starter didn't qualify: best reliever who followed
      const relievers = ws.used.filter(id => !ws.pl[id].start);
      relievers.sort((a, b) => (ws.pl[b].outs - ws.pl[b].r * 3) - (ws.pl[a].outs - ws.pl[a].r * 3));
      wp = relievers[0] || wp;
    }
    const lp = lCand[loser] != null ? lCand[loser] : ls.starter;
    let sv = null;
    const fin = ws.used[ws.used.length - 1];
    if (fin !== wp) {
      const fl = ws.pl[fin];
      if (fl.entryLead >= 1 && fl.entryLead <= 3 && fl.outs >= 1) sv = fin;
      else if (fl.outs >= 9) sv = fin;
    }
    g.dec = { W: wp, L: lp, S: sv };
    g.winner = winner;
    return g;
  }

  // A one-off game (GM Race tiebreaker): everyone healthy and rested, aces on the mound, full play log.
  function showdown(W, S, docs, home, away, seed) {
    const R = rng(seed >>> 0);
    const setups = { [home]: teamSetup(W, home, docs[home]), [away]: teamSetup(W, away, docs[away]) };
    const S2 = Object.assign({}, S, { fat: {} });
    const g = makeGame(W, S2, setups, home, away, 999, R, { starterIdx: 0, dh: true });
    g.log = [];
    playGame(W, S2, g, R);
    return { box: compactBox(g), log: g.log, winner: g.winner };
  }

  // ---------- state ----------
  function newState(seed, len) {
    const st = { v: 2, len: len || 162, seed: seed >>> 0, rs: (seed * 2654435761) >>> 0, day: 0, phase: 'season', std: {}, bat: {}, pit: {}, fat: {}, fin: {}, gp: {}, news: [], post: null, inj: {}, wk: {} };
    st.fan = {};
    TEAMS.forEach(t => { st.std[t.id] = [0, 0, 0, 0, 0, 0, 0]; st.fin[t.id] = [ERA.fin.start, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; st.wk[t.id] = []; st.gp[t.id] = 0; st.fan[t.id] = 1; });
    return st;
  }
  // std: [W, L, RS, RA, homeW, homeL, streak(+/-)]
  // fin: [cash, gate, concessions, media, payroll paid, operations, attendance, home games]

  function recordGame(W, S, g, stats) {
    const P = W.P;
    if (!S.res) S.res = {};
    if (g.score && g.home && g.away) { const hw = g.score[g.home] > g.score[g.away]; for (const [tid, win] of [[g.home, hw], [g.away, !hw]]) S.res[tid] = ((S.res[tid] || '') + (win ? 'W' : 'L')).slice(-20); }
    for (const tid of [g.home, g.away]) {
      const s = g.sides[tid];
      for (const id in s.bat) {
        const b = s.bat[id];
        if (P[id].t !== 'H') continue;
        const a = S.bat[id] || (S.bat[id] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        // [G, PA, AB, R, H, 2B, 3B, HR, RBI, BB, SO, SB, CS]
        milestone(S, P[id], tid, a[7], a[7] + b.hr, [20, 30, 40, 50, 60, 70], 'home runs');
        milestone(S, P[id], tid, a[4], a[4] + b.h, [100, 150, 200, 225], 'hits');
        milestone(S, P[id], tid, a[11], a[11] + b.sb, [40, 60, 80, 100], 'stolen bases');
        milestone(S, P[id], tid, a[8], a[8] + b.rbi, [100, 130, 150], 'RBIs');
        a[0]++; a[1] += b.pa; a[2] += b.ab; a[3] += b.r; a[4] += b.h; a[5] += b.d; a[6] += b.t; a[7] += b.hr; a[8] += b.rbi; a[9] += b.bb; a[10] += b.so; a[11] += b.sb; a[12] += b.cs;
      }
      for (const id in s.pl) {
        const l = s.pl[id];
        const a = S.pit[id] || (S.pit[id] = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
        // [G, GS, W, L, SV, OUTS, H, R, BB, SO, HR]
        a[0]++; if (l.start) a[1]++; a[5] += l.outs; a[6] += l.h; a[7] += l.r; a[8] += l.bb; a[9] += l.so; a[10] += l.hr;
        const f = S.fat[id];
        S.fat[id] = [g.day, l.bf, f && f[0] === g.day - 1 ? f[2] + 1 : 1];
      }
    }
    const d = g.dec;
    const wt = g.winner, lt = wt === g.home ? g.away : g.home;
    if (S.pit[d.W]) milestone(S, P[d.W], wt, S.pit[d.W][2], S.pit[d.W][2] + 1, [10, 15, 20, 25], 'wins');
    if (d.S != null && S.pit[d.S]) milestone(S, P[d.S], wt, S.pit[d.S][4], S.pit[d.S][4] + 1, [30, 40, 50], 'saves');
    for (const tid of [g.home, g.away]) for (const id in g.sides[tid].pl) { const a = S.pit[id]; if (a) milestone(S, P[id], tid, a[9] - g.sides[tid].pl[id].so, a[9], [200, 250, 300], 'strikeouts'); }
    void lt;
    if (S.pit[d.W]) S.pit[d.W][2]++;
    if (S.pit[d.L]) S.pit[d.L][3]++;
    if (d.S != null && S.pit[d.S]) S.pit[d.S][4]++;
    // standings
    const hs = g.score[g.home], as = g.score[g.away];
    const H = S.std[g.home], A = S.std[g.away];
    H[2] += hs; H[3] += as; A[2] += as; A[3] += hs;
    if (hs > as) { H[0]++; H[4]++; A[1]++; H[6] = H[6] > 0 ? H[6] + 1 : 1; A[6] = A[6] < 0 ? A[6] - 1 : -1; }
    else { A[0]++; H[1]++; H[5]++; A[6] = A[6] > 0 ? A[6] + 1 : 1; H[6] = H[6] < 0 ? H[6] - 1 : -1; }
    S.gp[g.home]++; S.gp[g.away]++;
  }

  // ---------- finances ----------
  function attendance(W, S, home, away, price, R, su) {
    const t = TEAM[home], st = S.std[home], b = su ? su.biz : null;
    const gpl = st[0] + st[1];
    const pct = (st[0] + 10) / (gpl + 20);
    const base = t.att97 * 1e6 / 81;
    const winF = Math.max(0.55, 1 + 1.6 * (pct - 0.5));
    const priceF = Math.exp(-0.6 * (price / t.price0 - 1));
    const draw = 0.94 + 0.06 * (TEAM[away].att97 / 2.3) + 0.04 * (TEAM[away].mkt > 10 ? 1 : 0);
    const day = S.day; // month effect: summer bump
    const season = 0.9 + 0.2 * Math.sin(Math.PI * Math.min(1, day / 162));
    let bizF = 1;
    if (b) {
      bizF = ((S.fan && S.fan[home]) || 1) * [1, 1.05, 1.09, 1.12][b.promo];
      bizF *= Math.exp(-(b.builds.garage ? 0.08 : 0.15) * (b.park / ERA.fin.park0 - 1)) * Math.exp(-0.12 * (b.conc - 1));
    }
    const a = base * winF * priceF * draw * season * bizF * (0.88 + R() * 0.24);
    return Math.round(Math.min(capOf(home, b), Math.max(3500, a)));
  }
  // fin: [cash, gate, concessions, media, payroll paid, operations, attendance, home games, scouting,
  //       parking, merch+suites+sponsors, promotions+marketing, development, interest+upkeep]
  function dailyFinance(W, S, setups, games, R) {
    const dayAtt = {}, F = ERA.fin, home = {};
    if (!S.fan) S.fan = {};
    for (const g of games) {
      const su = setups[g.home];
      const att = attendance(W, S, g.home, g.away, su.price, R, su);
      const f = S.fin[g.home], m = gameMoney(W, S, g.home, su, att);
      f[0] += m.gate + m.conc + m.park + m.merch - m.promo; f[1] += m.gate; f[2] += m.conc; f[6] += att; f[7]++;
      f[9] = (f[9] || 0) + m.park; f[10] = (f[10] || 0) + m.merch; f[11] = (f[11] || 0) + m.promo;
      dayAtt[g.home] = att; home[g.home] = m;
      g.att = att;
    }
    if (F.share) { // revenue sharing: part of every gate goes into a pool split evenly
      let pool = 0;
      for (const g of games) { const cut = g.att * setups[g.home].price * F.share; S.fin[g.home][0] -= cut; S.fin[g.home][1] -= cut; pool += cut; if (home[g.home]) home[g.home].gate -= cut; }
      const each = pool / TEAMS.length;
      for (const t of TEAMS) { S.fin[t.id][0] += each; S.fin[t.id][3] += each; }
    }
    // luxury tax: payroll over the threshold is taxed; the money goes to clubs under it
    const pays = {}; let taxPool = 0, under = 0;
    for (const t of TEAMS) { const su = setups[t.id]; pays[t.id] = su.roster.concat(su.minors || []).reduce((a, id) => a + salOf(W, su.con, id), 0); if (F.cbt && pays[t.id] > F.cbt) taxPool += (pays[t.id] - F.cbt) * F.tax / 162; else under++; }
    for (const t of TEAMS) {
      const f = S.fin[t.id], su = setups[t.id], b = su.biz;
      const tax = F.cbt ? (pays[t.id] > F.cbt ? -(pays[t.id] - F.cbt) * F.tax / 162 : taxPool / Math.max(1, under)) : 0;
      f[0] += tax; f[14] = (f[14] || 0) + tax;
      const media = (F.nat + F.lb + localTV(t.id) * tvMult(S, t.id, su)) / 162;
      const pay = su.roster.concat(su.minors || []).reduce((a, id) => a + salOf(W, su.con, id), 0) / 162;
      const ops = (F.ops + t.cap * F.seat) / 162;
      const scout = (su.scout != null ? su.scout : ERA.scoutDef) / 162;
      const spon = b.spon * F.spon * Math.pow(t.mkt, 0.3) / 162;
      const mkt = b.ads / 162, dev = b.dev / 162, med = (b.med != null ? b.med : F.devMax * 0.25) / 162;
      const upkeep = Object.keys(b.builds).filter(k => b.builds[k] && BUILDS[k]).reduce((a, k) => a + buildCost(k) * 0.03, 0) / 162;
      const interest = b.loan * F.rate / 162;
      f[0] += media + spon - pay - ops - scout - mkt - dev - med - upkeep - interest; f[15] = (f[15] || 0) + med;
      f[3] += media; f[4] += pay; f[5] += ops; f[8] = (f[8] || 0) + scout;
      f[10] = (f[10] || 0) + spon; f[11] = (f[11] || 0) + mkt; f[12] = (f[12] || 0) + dev; f[13] = (f[13] || 0) + upkeep + interest;
      const m = home[t.id];
      const rev = media + spon + (m ? m.gate + m.conc + m.park + m.merch : 0);
      const exp = pay + ops + scout + mkt + dev + med + upkeep + interest + (m ? m.promo : 0) - tax;
      if (!S.wk) S.wk = {};
      const w = S.wk[t.id] || (S.wk[t.id] = []);
      w.push([Math.round(rev), Math.round(exp)]); if (w.length > 7) w.shift();
      // fan interest drifts toward its target
      const cur = S.fan[t.id] || 1;
      S.fan[t.id] = Math.round((cur + (fanTarget(W, S, t.id, su) - cur) * 0.035) * 1000) / 1000;
    }
    return dayAtt;
  }

  // ---------- day sim ----------
  function simDay(W, S, docs) {
    const LEN = S.len || 162;
    if (S.phase !== 'season' || S.day >= LEN) return null;
    const R = rng(S.rs);
    if (!S.inj) S.inj = {};
    for (const id in S.inj) { S.inj[id]--; if (S.inj[id] <= 0) { delete S.inj[id]; const t = teamOfPlayer(W, docs, +id); if (t) news(S, `${W.P[id].name} (${t}) is back from the injured list.`, 'injury', t); } }
    const setups = {}; TEAMS.forEach(t => { setups[t.id] = teamSetup(W, t.id, docs[t.id], S.inj); });
    const sched = W.sched[S.day];
    const games = [];
    for (const [home, away] of sched) {
      const g = makeGame(W, S, setups, home, away, S.day, R);
      if ((docs[home] && docs[home].owner) || (docs[away] && docs[away].owner)) g.log = []; // GMs can watch their games
      playGame(W, S, g, R);
      games.push(g);
    }
    for (const g of games) recordGame(W, S, g);
    for (const g of games) injuries(W, S, g, R, setups);
    dailyFinance(W, S, setups, games, R);
    // notable news
    for (const g of games) noteGame(W, S, g);
    S.day++;
    S.rs = R.state();
    if (S.day >= LEN) startPost(W, S);
    return games.map(compactBox);
  }

  function noteGame(W, S, g) {
    const P = W.P;
    for (const tid of [g.home, g.away]) {
      const s = g.sides[tid];
      for (const id in s.bat) { const b = s.bat[id]; if (b.hr >= 3) news(S, `${P[id].name} (${tid}) hit ${b.hr} home runs in one game.`, 'milestone', tid); else if (b.h >= 5) news(S, `${P[id].name} (${tid}) went ${b.h}-for-${b.ab}.`, 'game', tid); }
      const st = s.pl[s.starter];
      if (st && st.outs >= 27 && st.h === 0) news(S, `${P[s.starter].name} (${tid}) threw a no-hitter!`, 'milestone', tid);
      else if (st && st.so >= 13) news(S, `${P[s.starter].name} (${tid}) struck out ${st.so} in one game.`, 'game', tid);
    }
  }
  function news(S, t, type, tid) { S.news.unshift([S.day + 1, t, type || 'game', tid || null]); if (S.news.length > 90) S.news.length = 90; }
  function milestone(S, p, tid, before, after, marks, label) {
    for (const m of marks) if (before < m && after >= m) news(S, `${p.name} (${tid}) reached ${m} ${label}.`, 'milestone', tid);
  }
  function teamOfPlayer(W, docs, id) {
    for (const t of TEAMS) { const d = docs[t.id]; const r = (d && Array.isArray(d.roster) && d.roster.length) ? d.roster : W.defRoster[t.id]; if (r.includes(id)) return t.id; }
    return null;
  }
  // medical staff: 0 = none, 1 = the most money can buy. Default spending (a quarter of the max) is normal risk.
  function medFrac(su) { const F = ERA.fin, m = su && su.biz && su.biz.med != null ? su.biz.med : F.devMax * 0.25; return Math.max(0, Math.min(1, m / F.devMax)); }
  function medRisk(f) { return 1.15 - 0.6 * f; }
  function medDays(f) { return 1.1 - 0.4 * f; }
  function injuries(W, S, g, R, setups) {
    const P = W.P;
    for (const tid of [g.home, g.away]) {
      const s = g.sides[tid], mf = medFrac(setups && setups[tid]);
      const ids = s.order.filter(o => o.pos !== 'P').map(o => o.id).concat([s.starter]);
      for (const id of ids) {
        if (S.inj[id]) continue;
        const risk = (id === s.starter ? 0.0045 : 0.0026) * medRisk(mf);
        if (R() >= risk) continue;
        const u = R(), days = Math.max(2, Math.round((u < 0.55 ? 3 + R() * 12 : u < 0.88 ? 15 + R() * 20 : 35 + R() * 45) * medDays(mf)));
        S.inj[id] = days;
        news(S, `${P[id].name} (${tid}) went on the injured list, out about ${days} days.`, 'injury', tid);
      }
    }
  }

  function compactBox(g) {
    const side = tid => {
      const s = g.sides[tid];
      return {
        bat: s.order.map(o => { const b = s.bat[o.id] || {}; return [o.id, o.pos, b.ab || 0, b.r || 0, b.h || 0, b.rbi || 0, b.bb || 0, b.so || 0, b.hr || 0]; }),
        pit: s.used.map(id => { const l = s.pl[id]; return [id, l.outs, l.h, l.r, l.bb, l.so, l.hr]; }),
      };
    };
    const out = { h: g.home, a: g.away, hs: g.score[g.home], as: g.score[g.away], ln: [g.line[g.away], g.line[g.home]], inn: g.innings, dec: [g.dec.W, g.dec.L, g.dec.S], att: g.att || 0, hb: side(g.home), ab: side(g.away) };
    if (g.log) out.log = g.log;
    return out;
  }

  // ---------- standings helpers ----------
  function standings(S) {
    const out = {};
    for (const lg of ['AL', 'NL']) for (const div of ['East', 'Central', 'West']) {
      const rows = TEAMS.filter(t => t.lg === lg && t.div === div).map(t => ({ id: t.id, w: S.std[t.id][0], l: S.std[t.id][1], rs: S.std[t.id][2], ra: S.std[t.id][3], stk: S.std[t.id][6] }));
      rows.sort((a, b) => (b.w - b.l) - (a.w - a.l) || (b.rs - b.ra) - (a.rs - a.ra));
      const top = rows[0];
      rows.forEach(r => { r.gb = ((top.w - r.w) + (r.l - top.l)) / 2; });
      out[lg + ' ' + div] = rows;
    }
    return out;
  }
  const pctOf = (w, l) => (w + l) ? w / (w + l) : 0;

  // ---------- postseason ----------
  // 15-team leagues: each round-robin round leaves one club per league idle; the two idle clubs meet. Plus 15 all-interleague rounds.
  function schedule15(AL, NL, rounds, shuffle) {
    const rA = rounds(AL.concat(['-'])), rN = rounds(NL.concat(['-']));
    const flip = ps => ps.map(([h, a]) => [a, h]);
    const intra = [];
    for (let c = 0; c < 3; c++) {
      const order = shuffle([...Array(15).keys()]);
      for (const i of order) {
        if (intra.length >= 39) break;
        const pa = (c % 2 ? flip(rA[i]) : rA[i]), pn = (c % 2 ? flip(rN[i]) : rN[i]);
        const games = pa.concat(pn).filter(([h, a]) => h !== '-' && a !== '-');
        const ia = pa.find(p => p.includes('-')), inn = pn.find(p => p.includes('-'));
        const ta = ia[0] === '-' ? ia[1] : ia[0], tn = inn[0] === '-' ? inn[1] : inn[0];
        games.push((c + i) % 2 ? [ta, tn] : [tn, ta]);
        intra.push(games);
      }
    }
    const nlS = shuffle(NL.slice()), inter = [];
    for (let k = 0; k < 15; k++) inter.push(AL.map((a, i) => { const n = nlS[(i + k) % 15]; return (i + k) % 2 ? [a, n] : [n, a]; }));
    const series = [];
    let ii = 0;
    for (let i = 0; i < 39; i++) { series.push(intra[i]); if (i % 3 === 1 && ii < 15) series.push(inter[ii++]); }
    while (ii < 15) series.push(inter[ii++]);
    const days = [];
    series.forEach(s => { for (let g = 0; g < 3; g++) days.push(s); });
    return days;
  }
  function startPost(W, S) {
    const fmt = S.pfmt || ERA.post;
    if (fmt === '2022') return startPost2022(W, S);
    if (fmt === '2012') return startPost2012(W, S);
    const st = standings(S);
    const seeds = {};
    for (const lg of ['AL', 'NL']) {
      const winners = ['East', 'Central', 'West'].map(d => st[lg + ' ' + d][0]);
      winners.sort((a, b) => pctOf(b.w, b.l) - pctOf(a.w, a.l) || (b.rs - b.ra) - (a.rs - a.ra));
      const wset = new Set(winners.map(r => r.id));
      const all = TEAMS.filter(t => t.lg === lg).map(t => ({ id: t.id, w: S.std[t.id][0], l: S.std[t.id][1], rd: S.std[t.id][2] - S.std[t.id][3] })).filter(r => !wset.has(r.id));
      all.sort((a, b) => pctOf(b.w, b.l) - pctOf(a.w, a.l) || b.rd - a.rd);
      const wc = all[0].id;
      let s1 = winners[0].id, s2 = winners[1].id, s3 = winners[2].id;
      // wild card can't face its own division winner in DS
      let ds1 = [s1, wc], ds2 = [s2, s3];
      if (TEAM[wc].div === TEAM[s1].div) { ds1 = [s2, wc]; ds2 = [s1, s3]; }
      seeds[lg] = { ds: [ds1, ds2], wc };
    }
    S.phase = 'post';
    S.post = {
      rounds: [
        { name: 'Division Series', best: 5, series: [seeds.AL.ds[0], seeds.AL.ds[1], seeds.NL.ds[0], seeds.NL.ds[1]].map(([a, b]) => ({ hi: a, lo: b, w: [0, 0], games: [] })) },
      ], cur: 0, champ: null,
    };
    news(S, `Regular season complete. Postseason field: ${['AL', 'NL'].map(lg => seeds[lg].ds.flat().join(', ')).join(' / ')}`, 'season');
  }
  // 2012-2019: three division winners plus two wild cards per league; the wild cards play one game
  function startPost2012(W, S) {
    const st = standings(S), seeds = {};
    const rowOf = id => ({ id, w: S.std[id][0], l: S.std[id][1], rd: S.std[id][2] - S.std[id][3] });
    const byRec = (a, b) => pctOf(b.w, b.l) - pctOf(a.w, a.l) || b.rd - a.rd;
    for (const lg of ['AL', 'NL']) {
      const winners = ['East', 'Central', 'West'].map(d => rowOf(st[lg + ' ' + d][0].id)).sort(byRec);
      const wset = new Set(winners.map(r => r.id));
      const wc = TEAMS.filter(t => t.lg === lg && !wset.has(t.id)).map(t => rowOf(t.id)).sort(byRec).slice(0, 2);
      seeds[lg] = winners.concat(wc).map(r => r.id);
    }
    S.phase = 'post';
    const mk = ([a, b]) => ({ hi: a, lo: b, w: [0, 0], games: [] });
    S.post = { fmt: '2012', seeds, rounds: [{ name: 'Wild Card Game', best: 1, series: [[seeds.AL[3], seeds.AL[4]], [seeds.NL[3], seeds.NL[4]]].map(mk) }], cur: 0, champ: null };
    news(S, `Regular season complete. Wild Card Games: ${seeds.AL[3]} host ${seeds.AL[4]}, ${seeds.NL[3]} host ${seeds.NL[4]}. Winners face ${seeds.AL[0]} and ${seeds.NL[0]}.`, 'season');
  }
  function startPost2022(W, S) {
    const st = standings(S), seeds = {};
    const rowOf = id => ({ id, w: S.std[id][0], l: S.std[id][1], rd: S.std[id][2] - S.std[id][3] });
    const byRec = (a, b) => pctOf(b.w, b.l) - pctOf(a.w, a.l) || b.rd - a.rd;
    for (const lg of ['AL', 'NL']) {
      const winners = ['East', 'Central', 'West'].map(d => rowOf(st[lg + ' ' + d][0].id)).sort(byRec);
      const wset = new Set(winners.map(r => r.id));
      const wc = TEAMS.filter(t => t.lg === lg && !wset.has(t.id)).map(t => rowOf(t.id)).sort(byRec).slice(0, 3);
      seeds[lg] = winners.concat(wc).map(r => r.id);
    }
    S.phase = 'post';
    const mk = ([a, b]) => ({ hi: a, lo: b, w: [0, 0], games: [] });
    S.post = { fmt: '2022', seeds, rounds: [{ name: 'Wild Card Series', best: 3, series: [[seeds.AL[2], seeds.AL[5]], [seeds.AL[3], seeds.AL[4]], [seeds.NL[2], seeds.NL[5]], [seeds.NL[3], seeds.NL[4]]].map(mk) }], cur: 0, champ: null };
    news(S, `Regular season complete. Byes: ${seeds.AL[0]}, ${seeds.AL[1]}, ${seeds.NL[0]}, ${seeds.NL[1]}. Wild Card Series: ${seeds.AL[2]}-${seeds.AL[5]}, ${seeds.AL[3]}-${seeds.AL[4]}, ${seeds.NL[2]}-${seeds.NL[5]}, ${seeds.NL[3]}-${seeds.NL[4]}.`, 'season');
  }
  function seriesDone(se, best) { const need = Math.ceil(best / 2); return se.w[0] >= need || se.w[1] >= need; }
  function homeFor(n, best) { // returns true if hi seed hosts game n (0-based)
    const pat = best === 1 ? [1] : best === 3 ? [1, 1, 1] : best === 5 ? [1, 1, 0, 0, 1] : [1, 1, 0, 0, 0, 1, 1];
    return !!pat[n];
  }
  function simPostGame(W, S, docs) {
    if (S.phase !== 'post') return null;
    const R = rng(S.rs);
    const setups = {}; TEAMS.forEach(t => { setups[t.id] = teamSetup(W, t.id, docs[t.id], S.inj); });
    const rd = S.post.rounds[S.post.cur];
    const boxes = [];
    for (const se of rd.series) {
      if (seriesDone(se, rd.best)) continue;
      const n = se.games.length;
      const hiHome = homeFor(n, rd.best);
      const home = hiHome ? se.hi : se.lo, away = hiHome ? se.lo : se.hi;
      // 4-man playoff rotation
      const g = makeGame(W, S, setups, home, away, S.day, R, { starterIdx: 0 });
      if ((docs[home] && docs[home].owner) || (docs[away] && docs[away].owner)) g.log = [];
      const pick = (tid) => { const s = g.sides[tid]; const idx = se.games.length % Math.min(4, s.su.rotation.length); s.pit = s.starter = s.su.rotation[idx]; if (!g.dh) s.order[s.order.length - 1] = { id: s.pit, pos: 'P' }; };
      pick(home); pick(away);
      playGame(W, S, g, R);
      const hiWon = g.winner === se.hi;
      se.w[hiWon ? 0 : 1]++;
      se.games.push([home, g.score[home], away, g.score[away]]);
      // postseason revenue
      const att = Math.min(TEAM[home].cap, Math.round(TEAM[home].cap * (0.97 + R() * 0.03)));
      S.fin[home][0] += att * setups[home].price * 1.8; S.fin[home][1] += att * setups[home].price * 1.8; S.fin[home][6] += 0;
      g.att = att;
      boxes.push(compactBox(g));
      if (seriesDone(se, rd.best)) news(S, `${se.w[0] > se.w[1] ? se.hi : se.lo} win the ${rd.name} over ${se.w[0] > se.w[1] ? se.lo : se.hi}, ${Math.max(...se.w)}-${Math.min(...se.w)}`, 'season', winnerOf(se));
    }
    S.day++;
    S.rs = R.state();
    if (rd.series.every(se => seriesDone(se, rd.best))) advancePost(W, S);
    return boxes;
  }
  function winnerOf(se) { return se.w[0] > se.w[1] ? se.hi : se.lo; }
  function advancePost(W, S) {
    const p = S.post, rd = p.rounds[p.cur];
    const better = (a, b) => { const A = S.std[a], B = S.std[b]; return pctOf(A[0], A[1]) >= pctOf(B[0], B[1]) ? [a, b] : [b, a]; };
    if (p.fmt === '2012' && rd.name === 'Wild Card Game') {
      const w = rd.series.map(winnerOf), sd = p.seeds;
      p.rounds.push({ name: 'Division Series', best: 5, series: [[sd.AL[0], w[0]], [sd.AL[1], sd.AL[2]], [sd.NL[0], w[1]], [sd.NL[1], sd.NL[2]]].map(([a, b]) => ({ hi: a, lo: b, w: [0, 0], games: [] })) });
      p.cur++;
    } else if (p.fmt === '2022' && rd.name === 'Wild Card Series') {
      const w = rd.series.map(winnerOf), sd = p.seeds;
      p.rounds.push({ name: 'Division Series', best: 5, series: [[sd.AL[0], w[1]], [sd.AL[1], w[0]], [sd.NL[0], w[3]], [sd.NL[1], w[2]]].map(([a, b]) => ({ hi: a, lo: b, w: [0, 0], games: [] })) });
      p.cur++;
    } else if (rd.name === 'Division Series') {
      const w = rd.series.map(winnerOf);
      p.rounds.push({ name: 'League Championship Series', best: 7, series: [better(w[0], w[1]), better(w[2], w[3])].map(([a, b]) => ({ hi: a, lo: b, w: [0, 0], games: [] })) });
      p.cur++;
    } else if (rd.name === 'League Championship Series') {
      const w = rd.series.map(winnerOf);
      p.rounds.push({ name: 'World Series', best: 7, series: [better(w[0], w[1])].map(([a, b]) => ({ hi: a, lo: b, w: [0, 0], games: [] })) });
      p.cur++;
    } else {
      p.champ = winnerOf(rd.series[0]);
      S.phase = 'done';
      news(S, `${TEAM[p.champ].city} win the World Series!`, 'season', p.champ);
    }
  }

  // ---------- trade AI ----------
  function tradeValue(p) {
    const base = Math.pow(Math.max(0, (p.proj != null ? p.proj : p.ovr) - 40), 1.7);
    const ageF = p.age <= 24 ? 1.35 : p.age <= 27 ? 1.15 : p.age <= 30 ? 1.0 : p.age <= 33 ? 0.8 : p.age <= 36 ? 0.6 : 0.45;
    return Math.max(1, base * ageF - p.sal / 1e6 / ERA.scale * 4);
  }
  function rosterOk(P, ids) {
    const h = ids.filter(id => P[id].t === 'H').length, p = ids.length - h;
    const c = ids.filter(id => P[id].pos === 'C').length;
    if (ids.length < 22) return 'roster would drop below 22 players';
    if (ids.length > 28) return 'roster would exceed 28 players';
    if (h < 11) return 'needs at least 11 position players';
    if (p < 9) return 'needs at least 9 pitchers';
    if (c < 1) return 'needs at least one catcher';
    return null;
  }
  function evalTrade(W, fromRoster, toRoster, give, get) {
    const P = W.P;
    const nf = fromRoster.filter(id => !give.includes(id)).concat(get);
    const nt = toRoster.filter(id => !get.includes(id)).concat(give);
    const e1 = rosterOk(P, nf), e2 = rosterOk(P, nt);
    const vGive = give.reduce((a, id) => a + tradeValue(P[id]), 0);
    const vGet = get.reduce((a, id) => a + tradeValue(P[id]), 0);
    return { vGive, vGet, errFrom: e1, errTo: e2, newFrom: nf, newTo: nt };
  }
  function cpuAccepts(W, ev) { // CPU is the "to" side: receives give, sends get
    if (ev.errTo || ev.errFrom) return false;
    return ev.vGive >= ev.vGet * 1.12 + 2;
  }

  // ---------- world ----------
  let W_fa = [];
  function buildWorld(text) {
    const P = parse(text + '\n' + minorLeaguers());
    const lg = buildRatings(P);
    buildSalaries(P);
    P.forEach(p => { // default contract length in seasons (season 1 = 1997)
      const h = ((p.id + 7) * 2654435761 >>> 0) % 100 / 100;
      p.yrs = p.age <= 24 ? 3 + Math.floor(h * 3) : p.age <= 29 ? 1 + Math.floor(h * 4) : p.age <= 33 ? 1 + Math.floor(h * 3) : 1 + Math.floor(h * 2);
    });
    const defRoster = {}; TEAMS.forEach(t => { defRoster[t.id] = []; });
    P.forEach(p => { if (p.team === 'FA') p.sal = faAsk(p); else defRoster[p.team].push(p.id); });
    // a two-way player's second stat line can show up in the free-agent section: hide those copies
    const onClubs = new Set(P.filter(p => p.team !== 'FA').map(p => p.name));
    P.forEach(p => { if (p.team === 'FA' && onClubs.has(p.name)) p.dup = true; });
    W_fa = P.filter(p => p.team === 'FA' && !p.dup).map(p => p.id);
    return { P, lg, defRoster, TEAMS, TEAM, faStart: W_fa, base: P.length };
  }

  // 1997 calendar: day 0 = Apr 1
  function dateOf(day) {
    const d = new Date(Date.UTC(1997, ERA.open[0], ERA.open[1] + Math.floor(day * 1.12)));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  }

  // Fictional minor-league depth so every club can always fill a roster
  function minorLeaguers() {
    const R = rng(1997);
    const first = ['Ray','Dusty','Mel','Curt','Hank','Lou','Rudy','Gil','Vic','Al','Benny','Clint','Rusty','Earl','Moose','Chet','Duane','Wes','Lyle','Tito','Marv','Ozzie','Sal','Buddy','Jody','Pete','Jimmy','Randy','Tommy','Eddie'];
    const last = ['Kessler','Ortega','Pruitt','Vance','Haskins','Delgado','Mabe','Tolliver','Barnhart','Quinlan','Fentress','Shoop','Varga','Ledbetter','Ruelas','Gattis','Montross','Pickard','Sandoval','Whitlock','Ambrose','Coker','Dunleavy','Escalona','Fairchild','Grubb','Hollins','Iorg','Jaramillo','Kirkpatrick','Lusk','Mahler','Noriega','Oyler','Pinson'];
    const pick = a => a[Math.floor(R() * a.length)];
    const used = new Set(), name = () => { let n; do { n = pick(first) + ' ' + pick(last); } while (used.has(n)); used.add(n); return n; };
    const out = ['#FA'];
    const pos = ['C','C','C','C','C','C','C','C','1B','1B','2B','2B','2B','3B','3B','SS','SS','SS','LF','LF','CF','CF','CF','RF','RF','OF','OF','1B','3B','2B','C','SS'];
    pos.forEach(ps => {
      const ab = 220 + Math.floor(R() * 160), avg = (0.212 + R() * 0.04).toFixed(3), hr = Math.floor(R() * (ps === 'SS' || ps === '2B' || ps === 'C' ? 6 : 11));
      out.push(['H', name(), ps, R() < 0.3 ? 'L' : R() < 0.15 ? 'S' : 'R', 23 + Math.floor(R() * 10), ab, avg, Math.floor(ab * (0.035 + R() * 0.03)), Math.floor(R() * 4), hr, Math.floor(ab * (0.06 + R() * 0.06)), Math.floor(ab * (0.15 + R() * 0.08)), Math.floor(R() * 9), Math.floor(R() * 4)].join('|'));
    });
    for (let i = 0; i < 34; i++) {
      const sp = i < 14, ip = sp ? 70 + Math.floor(R() * 60) : 40 + Math.floor(R() * 35), era = (4.7 + R() * 1.6).toFixed(2);
      out.push(['P', name(), R() < 0.3 ? 'L' : 'R', sp ? 'SP' : 'RP', 23 + Math.floor(R() * 11), sp ? 16 + Math.floor(R() * 8) : 35 + Math.floor(R() * 25), sp ? 14 + Math.floor(R() * 8) : 0, ip + '.0', Math.floor(R() * 7), Math.floor(R() * 9), 0, era, Math.floor(ip * (0.5 + R() * 0.3)), Math.floor(ip * (0.35 + R() * 0.15))].join('|'));
    }
    return out.join('\n');
  }

  // ---------- contracts & free agency ----------
  function salOf(W, con, id) { const c = con && con[id]; return c ? c[0] : W.P[id].sal; }
  function endOf(W, con, id) { const c = con && con[id]; return c ? c[1] : W.P[id].yrs; }
  function faAsk(p) {
    const v = Math.pow(Math.max(0, p.ovr - 45), 1.6) * 0.025e6;
    const ageF = p.age >= 36 ? 0.55 : p.age >= 33 ? 0.75 : p.age <= 25 ? 0.9 : 1;
    return Math.round(Math.max(ERA.minSal, Math.min(ERA.maxSal, v * ageF * (ERA.faScale || ERA.scale))) / 10000) * 10000;
  }
  function faYears(p) { return p.age <= 28 ? 4 : p.age <= 31 ? 3 : p.age <= 34 ? 2 : 1; }
  const BONUS = 0.2; // signing bonus = 20% of first-year salary, paid from cash

  // Contracts ending after `season` leave their clubs. teams: {tid:{roster,con}} (mutated copies returned)
  function expireContracts(W, season, teams) {
    const out = {}, pool = {};
    for (const tid in teams) {
      const t = teams[tid], keep = [], con = Object.assign({}, t.con || {});
      for (const id of t.roster) {
        if (endOf(W, con, id) <= season) { pool[id] = { ask: faAsk(W.P[id]), yrs: faYears(W.P[id]), prev: tid }; delete con[id]; }
        else keep.push(id);
      }
      out[tid] = { roster: keep, con };
    }
    return { teams: out, pool };
  }

  // CPU clubs' offers for the offseason market
  function cpuBids(W, season, teams, pool, R, skip, slotFrac) {
    if (skip == null) skip = 0.35;
    if (slotFrac == null) slotFrac = 1;
    const P = W.P, bids = [];
    const ids = Object.keys(pool).map(Number).sort((a, b) => P[b].ovr - P[a].ovr);
    for (const tid in teams) {
      const t = teams[tid]; if (t.owner) continue;
      const payroll = t.roster.reduce((a, id) => a + salOf(W, t.con, id), 0);
      let budget = TEAM[tid].pay97 * 1e6 * (1.0 + R() * 0.15) - payroll;
      const h = t.roster.filter(id => P[id].t === 'H'), c = h.filter(id => P[id].pos === 'C').length, p = t.roster.length - h.length;
      let slots = Math.ceil((Math.max(0, 25 - t.roster.length) + 1) * slotFrac);
      let needP = Math.max(0, 11 - p), needH = Math.max(0, 13 - h.length), needC = Math.max(0, 2 - c);
      for (const id of ids) {
        if (slots <= 0) break;
        const pl = P[id], ask = pool[id].ask;
        const fits = (needC && pl.pos === 'C') || (needP && pl.t === 'P') || (needH && pl.t === 'H') || (!needP && !needH && !needC);
        if (!fits || ask > budget * 0.55 || R() < skip) continue;
        const sal = Math.round(ask * (0.92 + R() * 0.3) / 10000) * 10000;
        bids.push({ tid, pid: id, sal, yrs: pool[id].yrs });
        budget -= sal; slots--;
        if (pl.pos === 'C') needC = Math.max(0, needC - 1);
        if (pl.t === 'P') needP = Math.max(0, needP - 1); else needH = Math.max(0, needH - 1);
      }
    }
    return bids;
  }

  // Resolve offseason market. teams: {tid:{roster,con,owner,cash,pct}}; pool: {pid:{ask,yrs}}; bids: [{tid,pid,sal,yrs}]
  function resolveFreeAgency(W, season, teams, pool, bids, R, opts) {
    opts = opts || {};
    const fill = opts.fill !== false;
    const P = W.P, T = JSON.parse(JSON.stringify(teams)), signed = [], spent = {};
    const left = Object.assign({}, pool);
    const all = bids.concat(cpuBids(W, season, T, left, R, opts.cpuSkip, opts.slotFrac));
    const by = {}; all.forEach(b => { if (left[b.pid]) (by[b.pid] = by[b.pid] || []).push(b); });
    const order = Object.keys(by).map(Number).sort((a, b) => P[b].ovr - P[a].ovr);
    const sign = (tid, pid, sal, yrs) => {
      const t = T[tid]; t.roster.push(pid); t.con = t.con || {}; t.con[pid] = [sal, season + Math.max(1, Math.min(5, yrs))];
      const bonus = Math.round(sal * BONUS); t.cash -= bonus; spent[tid] = (spent[tid] || 0) + bonus;
      signed.push({ pid, tid, sal, yrs }); delete left[pid];
    };
    for (const pid of order) {
      const ask = left[pid].ask, want = left[pid].yrs;
      const offers = by[pid].filter(b => b.sal >= ask * 0.8).map(b => ({ b, score: b.sal * (1 + 0.07 * (Math.min(b.yrs, want) - 1)) * (1 + 0.2 * ((T[b.tid].pct || 0.5) - 0.5)) * (0.97 + R() * 0.06) }));
      offers.sort((x, y) => y.score - x.score);
      for (const { b } of offers) {
        const t = T[b.tid];
        if (t.roster.length >= 28 || t.cash < b.sal * BONUS) continue;
        sign(b.tid, pid, b.sal, b.yrs); break;
      }
    }
    const won = new Set(signed.map(s => s.pid + ':' + s.tid));
    const lost = bids.filter(b => !left[b.pid] && !won.has(b.pid + ':' + b.tid)).map(b => { const w = signed.find(s => s.pid === b.pid); return { tid: b.tid, pid: b.pid, sal: b.sal, winner: w ? w.tid : null, wsal: w ? w.sal : 0 }; });
    if (!fill) return { teams: T, signed, pool: left, spent, fills: [], lost };
    // every club must field a legal roster: fill from the cheapest useful leftovers
    const fills = [];
    for (const tid in T) {
      const t = T[tid];
      const target = t.owner ? { n: 22, h: 11, p: 9, c: 1 } : { n: 24, h: 12, p: 11, c: 2 };
      let guard = 0;
      while (guard++ < 30) {
        const h = t.roster.filter(id => P[id].t === 'H'), c = h.filter(id => P[id].pos === 'C').length, p = t.roster.length - h.length;
        const needs = [];
        if (c < target.c) needs.push(x => P[x].pos === 'C');
        if (p < target.p) needs.push(x => P[x].t === 'P');
        if (h.length < target.h) needs.push(x => P[x].t === 'H');
        if (t.roster.length < target.n) needs.push(() => true);
        if (!needs.length) break;
        let cand = null;
        for (const want of needs) {
          cand = Object.keys(left).map(Number).filter(want).sort((a, b) => (P[b].ovr - left[b].ask / 2.5e5) - (P[a].ovr - left[a].ask / 2.5e5))[0];
          if (cand != null) break;
        }
        if (cand == null) break;
        const sal = Math.max(ERA.minSal, Math.round(left[cand].ask * 0.8 / 10000) * 10000);
        sign(tid, cand, sal, 1); fills.push(tid + ':' + cand);
      }
    }
    // leftovers lower their price for in-season pickups
    for (const pid in left) left[pid] = { ask: Math.max(ERA.minSal, Math.round(left[pid].ask * 0.7 / 10000) * 10000), yrs: 1, prev: left[pid].prev };
    return { teams: T, signed, pool: left, spent, fills, lost };
  }

  // ---------- farm system ----------
  // Prospects are generated players with a ceiling (peak) and a development gap (1 = raw, 0 = fully grown).
  // Their current ability is a blend of the ceiling and replacement level. Shared state lives in league/farm:
  // { era, seed, next, g:{id:gap}, born:{id:season}, by:{tid:[ids]} }
  const FARM_MAX = 8, READY_GAP = 0.2;
  const P_FIRST = ['Jace','Brody','Kade','Colt','Tanner','Ryder','Cruz','Beckett','Mateo','Nico','Gage','Bryce','Luis','Andres','Kai','Wyatt','Jett','Rhys','Dax','Easton','Hudson','Carter','Owen','Diego','Rafael','Theo','Cade','Maddox','Bo','Sawyer','Hayden','Miles','Ezra','Jonah','Rowan','Emilio','Tate','Knox','Brennan','Yordy'];
  const P_LAST = ['Ashby','Bracken','Castellanos','Dorsey','Ellison','Faber','Galloway','Halvorsen','Ibarra','Jansen','Kurtz','Lacroix','Medrano','Nunley','Oduya','Prather','Quintero','Rasmussen','Stroud','Tavares','Ueda','Valdivia','Wexler','Yandel','Zamora','Burkhart','Cisneros','Delacruz','Espino','Fenwick','Gutierrez','Hargrove','Kilbride','Lockhart','Marchetti','Navarro','Pardo','Rinehart','Solano','Thibodeaux','Vickers','Whitfield','Abreu','Brandt','Coyle'];
  function hash32(a, b) { let h = (a ^ Math.imul(b + 0x9e3779b9, 0x85ebca6b)) >>> 0; h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0; h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0; return (h ^ (h >>> 16)) >>> 0; }
  function prospectRates(lg, p, gap) {
    const L = lg.L, g = gap;
    if (p.t === 'H') {
      const rep = { bb: L.bb * 0.7, k: L.k * 1.45, s: L.s * 0.85, d: L.d * 0.7, t: L.t * 0.8, hr: L.hr * 0.4 };
      const r = {}; let sum = 0;
      ['bb', 'k', 's', 'd', 't', 'hr'].forEach(k => { r[k] = p.peak.r[k] * (1 - g) + rep[k] * g; sum += r[k]; });
      r.o = 1 - sum; return r;
    }
    const k = p.peak.k * (1 - g) + L.k * 0.72 * g, bb = p.peak.bb * (1 - g) + L.bb * 1.4 * g, h = p.peak.h * (1 - g) + 1.2 * g;
    return pitchRates(lg, k, bb, h);
  }
  function pitchRates(lg, k, bb, h) {
    const L = lg.L, bipL = lg.bipL, rem = 1 - k - bb;
    const s = L.s / bipL * rem * h, d = L.d / bipL * rem * h, t = L.t / bipL * rem * h, hr = L.hr / bipL * rem * Math.pow(h, 1.4);
    return { bb, k, s, d, t, hr, o: 1 - bb - k - s - d - t - hr, h };
  }
  const pitchERA = (lg, r) => baseRunsPerOut(r) * 27 * lg.scale;
  // derive ovr and display ratings from p.r (same formulas as real players)
  function deriveProspect(lg, p) {
    const L = lg.L, r = p.r;
    if (p.t === 'H') {
      p.w = woba(r);
      const runs600 = (p.w - lg.lgW) / 1.2 * 600 + (POS_ADJ[p.pos] || 0);
      p.val = runs600; p.ovr = Math.round(Math.max(25, Math.min(99, 60 + 0.8 * runs600)));
      const bip = 1 - r.bb - r.k, cont = (r.s + r.d + r.t + r.hr) / (r.s + r.d + r.t + r.hr + r.o + r.k);
      p.rt = { con: clampR(50 + (cont - 0.265) * 600), pow: clampR(50 + ((r.d + 2 * r.t + 3 * r.hr) / bip - 0.20) * 260), eye: clampR(50 + (r.bb - L.bb) * 600 - (r.k - L.k) * 150), spd: clampR(50 + (p.spd - 1) * 150), def: p.def };
    } else {
      p.h = r.h; p.eraN = pitchERA(lg, r);
      if (p.role === 'SP') { const runs = (lg.lgERA - p.eraN) * 200 / 9; p.val = runs; p.ovr = Math.round(Math.max(25, Math.min(99, 60 + 0.85 * runs))); }
      else { const runs = (lg.lgERA - p.eraN) * 75 / 9; p.val = runs * 1.3; p.ovr = Math.round(Math.max(25, Math.min(97, 55 + 1.5 * runs))); }
      p.rt = { stf: clampR(50 + (r.k - L.k) * 330), ctl: clampR(50 - (r.bb - L.bb) * 500), mov: clampR(50 - (p.h - 1) * 160), sta: p.role === 'SP' ? clampR(20 + (p.stam - 16) * 4.3) : clampR(15 + p.stam * 4) };
    }
  }
  // Build prospect number k for a league seed. Deterministic, so every client builds the same player.
  function makeProspect(W, seed, k, bonus) {
    const R = rng(hash32(seed >>> 0, k + 1)), lg = W.lg, L = lg.L;
    const pick = a => a[Math.floor(R() * a.length)];
    const id = W.base + k, hitter = R() < 0.52;
    // ceiling: most land 55-70, a few become stars
    const u = R(), tal = 47 + 40 * Math.pow(u, 2.8) + (bonus || 0);
    const p = { id, k, pros: true, team: 'FARM', name: pick(P_FIRST) + ' ' + pick(P_LAST), age0: 18 + Math.floor(R() * 5), AB: 0, AVG: 0, D: 0, T: 0, HR: 0, BB: 0, SO: 0, SB: 0, CS: 0, G: 0, GS: 0, outs: 0, W: 0, L: 0, SV: 0, ERA: 0 };
    p.age = p.age0;
    if (hitter) {
      p.t = 'H'; p.pos = pick(['C', 'C', '1B', '2B', '2B', '3B', '3B', 'SS', 'SS', 'SS', 'LF', 'CF', 'CF', 'RF', 'RF']);
      p.bats = R() < 0.3 ? 'L' : R() < 0.1 ? 'S' : 'R';
      const prem = ['SS', 'CF', '2B'].includes(p.pos);
      p.spd = Math.max(0.8, Math.min(1.35, 0.95 + (prem ? 0.12 : 0) + (R() - 0.5) * 0.35));
      p.sbAtt = Math.max(0.02, Math.min(0.35, (p.spd - 0.85) * 0.5)); p.sbPct = Math.min(0.85, 0.55 + (p.spd - 0.9) * 0.6);
      p.def = clampR(({ C: 58, SS: 62, '2B': 57, CF: 60, '3B': 55, RF: 51, LF: 47, '1B': 45 }[p.pos] || 50) + (p.spd - 1) * 45 + (R() - 0.5) * 24);
      const wT = lg.lgW + ((tal - 60) / 0.8 - (POS_ADJ[p.pos] || 0)) * 1.2 / 600;
      const pw = R(), base = { bb: L.bb * (0.8 + 0.5 * R()), k: L.k * (1.15 - 0.35 * R() + 0.2 * pw), s: L.s * (1.05 - 0.15 * pw), d: L.d * (0.9 + 0.3 * pw), t: L.t * (p.spd), hr: L.hr * (0.5 + 1.1 * pw) };
      let lo = 0.5, hi = 1.8, r;
      for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; r = { bb: base.bb * m, k: base.k, s: base.s * m, d: base.d * m, t: base.t * m, hr: base.hr * m }; if (woba(r) > wT) hi = m; else lo = m; }
      r.o = 1 - (r.bb + r.k + r.s + r.d + r.t + r.hr);
      p.peak = { r };
    } else {
      p.t = 'P'; p.pos = 'P'; p.throws = R() < 0.3 ? 'L' : 'R'; p.role = R() < 0.62 ? 'SP' : 'RP';
      p.stam = p.role === 'SP' ? 21 + Math.floor(R() * 9) : 5 + Math.floor(R() * 5);
      const eraT = p.role === 'SP' ? lg.lgERA - (tal - 60) / 0.85 * 9 / 200 : lg.lgERA - (tal - 55) / 1.5 * 9 / 75;
      const k = L.k * (0.8 + 0.55 * R()), bb = L.bb * (1.25 - 0.5 * R());
      let lo = 0.5, hi = 1.6, h = 1;
      for (let i = 0; i < 40; i++) { h = (lo + hi) / 2; if (pitchERA(lg, pitchRates(lg, k, bb, h)) > eraT) hi = h; else lo = h; }
      p.peak = { k, bb, h };
    }
    p.sal = ERA.minSal; p.yrs = 0; p.pb = bonus || 0;
    posProfile(p);
    setDev(W, p, 1, 1, 1);
    p.peak.ovr = (() => { const q = Object.assign({}, p, { rt: null }); q.r = prospectRates(lg, p, 0); deriveProspect(lg, q); return q.ovr; })();
    return p;
  }
  function setDev(W, p, gap, born, season) {
    p.gap = gap; p.age = p.age0 + Math.max(0, season - born);
    p.r = prospectRates(W.lg, p, gap); deriveProspect(W.lg, p);
  }
  // Make sure every prospect in the farm doc exists in W.P with today's development.
  function applyFarm(W, farm, season) {
    if (!farm || !farm.g) return;
    for (const id in farm.g) {
      const n = +id; let p = W.P[n];
      const pb = (farm.pb && farm.pb[id]) || 0;
      if (!p || !p.pros || p.pb !== pb) { p = makeProspect(W, farm.seed, n - W.base, pb); W.P[n] = p; }
      setDev(W, p, farm.g[id], (farm.born && farm.born[id]) || 1, season);
    }
  }
  // New farm: six prospects per club, a spread of ages and readiness.
  function newFarm(W, seed, era) {
    const farm = { era, seed, next: 0, g: {}, born: {}, by: {} };
    const R = rng(hash32(seed >>> 0, 77));
    TEAMS.forEach(t => {
      farm.by[t.id] = [];
      for (let i = 0; i < 6; i++) {
        const k = farm.next++, id = W.base + k;
        farm.g[id] = Math.round((0.15 + 0.8 * R()) * 100) / 100; farm.born[id] = 1; farm.by[t.id].push(id);
      }
    });
    return farm;
  }
  function devStep(age, R, devF) {
    const ageF = age <= 20 ? 1.25 : age <= 22 ? 1.1 : age <= 24 ? 0.95 : age <= 26 ? 0.7 : 0.4;
    return (0.12 + 0.12 * R()) * ageF * devF;
  }
  // Winter: everyone develops, then each club drafts two players (worst record picks first).
  // devF(tid) gives a club's development multiplier. order: team ids worst to best.
  // devFrac(tid), scoutFrac(tid): 0..1 shares of the max player-development and scouting budgets
  function farmWinter(W, farm, season, order, devFrac, orgOf, scoutFrac, opts) {
    const f = JSON.parse(JSON.stringify(farm)), R = rng(hash32(farm.seed >>> 0, 1000 + season));
    if (!f.pb) f.pb = {};
    const grew = [];
    for (const id in f.g) {
      if (f.g[id] <= 0) continue;
      const p = W.P[+id]; const age = p ? p.age0 + (season + 1 - (f.born[id] || 1)) : 22;
      const org = orgOf(+id), d = org ? devFrac(org) : 0.2;
      f.g[id] = Math.max(0, Math.round((f.g[id] - devStep(age, R, 0.75 + 0.6 * d)) * 100) / 100);
      // good coaching raises a young player's ceiling: up to about +3 a winter, +9 in all
      const up = Math.floor(R() * (d * 4 + 0.6));
      if (up > 0 && (f.pb[id] || 0) < 9) { f.pb[id] = Math.min(9, (f.pb[id] || 0) + up); if (org) grew.push([org, +id, up]); }
    }
    // draft night: just reserve the class; the GMs pick it live in the app
    if (opts && opts.noDraft) { const ks = []; for (let i = 0; i < order.length * 2; i++) ks.push(f.next++); return { farm: f, picks: {}, released: [], grew, draftKs: ks }; }
    // draft class: 2 per club
    const cls = [];
    for (let i = 0; i < order.length * 2; i++) { const k = f.next++; const p = makeProspect(W, f.seed, k); cls.push(p); }
    // each club takes the best player its scouts can see: a small scouting budget means a fuzzy board
    const picks = {}, released = [], avail = cls.slice();
    for (let rd = 0; rd < 2; rd++) order.forEach((tid, i) => {
      const err = 16 * Math.pow(1 - (scoutFrac ? scoutFrac(tid) : 0.2), 1.2);
      const seen = q => q.peak.ovr + (((hash32(q.id, tid.charCodeAt(0) * 31 + tid.charCodeAt(1)) % 1000) / 1000) - 0.5) * 2 * err;
      avail.sort((a, b) => seen(b) - seen(a));
      const p = avail.shift(); if (!p) return;
      W.P[p.id] = p; f.g[p.id] = Math.round((0.6 + 0.35 * R()) * 100) / 100; f.born[p.id] = season + 1;
      (f.by[tid] = f.by[tid] || []).push(p.id); (picks[tid] = picks[tid] || []).push(p.id);
    });
    // farm cap: release the least promising
    for (const tid in f.by) {
      const list = f.by[tid];
      while (list.length > FARM_MAX) {
        const worst = list.slice().sort((a, b) => prospectScore(W, a, f) - prospectScore(W, b, f))[0];
        list.splice(list.indexOf(worst), 1); released.push([tid, worst]);
      }
    }
    return { farm: f, picks, released, grew };
  }
  // add drafted players to the farm (deterministic, so any client can apply it), then trim to the cap
  function applyDraftPicks(W, farm, season, picks) {
    const f = JSON.parse(JSON.stringify(farm)), released = [];
    for (const [tid, k] of picks) {
      const id = W.base + k; if (f.g[id] != null) continue;
      const p = makeProspect(W, f.seed, k); W.P[id] = p;
      f.g[id] = Math.round((0.6 + 0.35 * ((hash32(f.seed >>> 0, k + 7) % 1000) / 1000)) * 100) / 100; f.born[id] = season + 1;
      (f.by[tid] = f.by[tid] || []).push(id);
    }
    for (const tid in f.by) { const list = f.by[tid]; while (list.length > FARM_MAX) { const worst = list.slice().sort((a, b) => prospectScore(W, a, f) - prospectScore(W, b, f))[0]; list.splice(list.indexOf(worst), 1); released.push([tid, worst]); } }
    return { farm: f, released };
  }
  function prospectScore(W, id, farm) { const p = W.P[id]; if (!p) return 0; if (!p.peak) return 999; const g = farm.g[id] || 0; return p.peak.ovr - g * 12 - Math.max(0, p.age - 23) * 2; }
  // Trade value of a prospect counts much of his ceiling
  function projOvr(p, ovr, peak) { return p && p.pros ? ovr + (peak - ovr) * 0.55 : ovr; }

  // ---------- front-office AI ----------
  const CASH_UNIT = 9; // trade value of $1M
  const NEED_LABEL = { SP: 'starting pitching', RP: 'bullpen help', C: 'a catcher', '1B': 'a first baseman', '2B': 'a second baseman', '3B': 'a third baseman', SS: 'a shortstop', OF: 'an outfielder' };
  function needOf(p) { if (p.t === 'P') return p.role === 'SP' ? 'SP' : 'RP'; return isOF(p.pos) ? 'OF' : p.pos; }
  function teamCtx(W, S, tid, su, cash, phase) {
    const P = W.P, st = S.std[tid], g = st[0] + st[1];
    const pct = (st[0] + 10) / (g + 20);
    const row = standings(S)[TEAM[tid].lg + ' ' + TEAM[tid].div].find(r => r.id === tid);
    const gb = row ? row.gb : 0;
    let mode = 'neutral';
    if (phase === 'offseason' || phase === 'done') mode = pct >= 0.53 ? 'contend' : pct < 0.46 ? 'rebuild' : 'neutral';
    else if (g >= 20) mode = (pct >= 0.53 || gb <= 4) ? 'contend' : (pct < 0.47 && gb >= 8) ? 'rebuild' : 'neutral';
    const H = su.roster.filter(id => P[id].t === 'H'), Pi = su.roster.filter(id => P[id].t === 'P');
    const needs = [];
    for (const pos of ['C', 'SS', '2B', '3B', '1B']) { const best = Math.max(0, ...H.filter(id => P[id].pos === pos || (pos !== 'C' && canPlay(P[id], pos) && P[id].pos !== 'C')).map(id => P[id].ovr)); if (best < 56) needs.push(pos); }
    const of = H.filter(id => isOF(P[id].pos)).map(id => P[id].ovr).sort((a, b) => b - a);
    if ((of[2] || 0) < 55) needs.push('OF');
    if (Pi.filter(id => P[id].role === 'SP' && P[id].ovr >= 58).length < 4) needs.push('SP');
    const rp = Pi.filter(id => P[id].role !== 'SP').map(id => P[id].ovr).sort((a, b) => b - a).slice(0, 4);
    if (Pi.length < 10 || (rp.length ? rp.reduce((a, b) => a + b, 0) / rp.length : 0) < 55) needs.push('RP');
    const cs = ERA.fin.start / 15e6; const cashMult = cash < 5e6 * cs ? 1.8 : cash < 12e6 * cs ? 1.2 : cash > 30e6 * cs ? 0.6 : 1;
    let core;
    if (mode === 'rebuild') core = su.roster.filter(id => P[id].age <= 26 && P[id].ovr >= 62).sort((a, b) => P[b].ovr - P[a].ovr).slice(0, 3);
    else core = su.roster.slice().sort((a, b) => P[b].ovr - P[a].ovr).slice(0, mode === 'contend' ? 3 : 2);
    return { tid, mode, needs, cash, cashMult, core, pct };
  }
  function aiValue(W, ctx, id, sal, yrsLeft) {
    const p = W.P[id];
    const base = Math.pow(Math.max(0, projOvr(p, p.ovr, p.peak ? p.peak.ovr : p.ovr) - 40), 1.7);
    const a = p.age, m = ctx.mode;
    const ageF = m === 'contend' ? (a <= 24 ? 1.0 : a <= 30 ? 1.15 : a <= 33 ? 1.0 : a <= 36 ? 0.8 : 0.6)
      : m === 'rebuild' ? (a <= 24 ? 1.6 : a <= 27 ? 1.3 : a <= 30 ? 0.85 : a <= 33 ? 0.5 : 0.3)
        : (a <= 24 ? 1.35 : a <= 27 ? 1.15 : a <= 30 ? 1.0 : a <= 33 ? 0.8 : a <= 36 ? 0.6 : 0.45);
    const need = ctx.needs.includes(needOf(p)) ? 1.3 : 1;
    const salPen = sal / 1e6 / ERA.scale * (m === 'rebuild' ? 5 : m === 'contend' ? 1.5 : 3) * Math.min(Math.max(1, yrsLeft), 3) * (ctx.cashMult > 1.1 ? 1.4 : 1);
    return Math.max(1, base * ageF * need - salPen);
  }
  // AI side receives `gets` + cashIn (negative: AI pays), gives `gives`. Players are {id, sal, yrs}.
  function aiEvaluate(W, ctx, gets, gives, cashIn) {
    const P = W.P;
    const vPlayers = gets.reduce((a, x) => a + aiValue(W, ctx, x.id, x.sal, x.yrs), 0);
    const vCash = (cashIn >= 0 ? cashIn / 1e6 * CASH_UNIT * ctx.cashMult : cashIn / 1e6 * CASH_UNIT * Math.max(1, ctx.cashMult)) / ERA.scale;
    const vIn = vPlayers + vCash;
    const vOut = gives.reduce((a, x) => a + aiValue(W, ctx, x.id, x.sal, x.yrs) * (ctx.core.includes(x.id) ? 1.6 : 1), 0);
    const need = vOut * 1.08 + 3;
    const accept = vIn >= need && (cashIn >= 0 || ctx.cash + cashIn > 0);
    const reasons = [], city = TEAM[ctx.tid].city;
    const fills = gets.filter(x => ctx.needs.includes(needOf(P[x.id])));
    const needTxt = ctx.needs.slice(0, 2).map(n => NEED_LABEL[n]).join(' and ');
    if (accept) reasons.push(fills.length ? `Deal. ${P[fills[0].id].name} gives us the ${NEED_LABEL[needOf(P[fills[0].id])].replace(/^an? /, '')} we were missing.` : 'Deal. We like the value on our side.');
    else {
      const coreOut = gives.filter(x => ctx.core.includes(x.id));
      if (coreOut.length) reasons.push(`${P[coreOut[0].id].name} is part of our core. It would take a lot more to move him.`);
      if (ctx.mode === 'rebuild' && gets.some(x => P[x.id].age >= 31)) reasons.push(`We're rebuilding. Players over 30 don't help us.`);
      if (ctx.mode === 'contend' && gets.length && gets.every(x => P[x.id].ovr < 56)) reasons.push(`We're in a pennant race. We need players who help now.`);
      if (ctx.needs.length && !fills.length) {
        if (cashIn > 0 && vCash >= vIn * 0.5) reasons.push(`We need ${needTxt}, not cash.`);
        else reasons.push(`What we really need is ${needTxt}.`);
      }
      const salIn = gets.reduce((a, x) => a + x.sal, 0), salOut = gives.reduce((a, x) => a + x.sal, 0);
      if (ctx.cashMult > 1.1 && salIn > salOut + 2e6) reasons.push(`We can't take on that much salary right now.`);
      if (cashIn < 0 && ctx.cash + cashIn <= 0) reasons.push(`We don't have that kind of cash.`);
      const short = need - vIn;
      if (vIn >= need * 0.82 && short > 0) reasons.push(`We're close. Add about $${Math.max(0.1, short / CASH_UNIT / ctx.cashMult * ERA.scale).toFixed(1)}M or a little more talent and you have a deal.`);
      else if (short > 0) reasons.push(`That isn't close to enough value for us.`);
    }
    return { accept, vIn, vOut, reasons, city };
  }
  function aiHint(W, ctx) {
    const P = W.P, out = [];
    out.push(ctx.mode === 'contend' ? 'In the race. Values proven players who help now and doesn\'t mind salary.'
      : ctx.mode === 'rebuild' ? 'Rebuilding. Wants players 27 and under on cheap deals. Veterans with big contracts are a hard sell.'
        : 'Middle of the pack. Pays fair value for good players at any age.');
    out.push(ctx.needs.length ? 'Biggest needs: ' + ctx.needs.slice(0, 3).map(n => NEED_LABEL[n]).join(', ') + '. Players there are worth about 30% more to them.' : 'No glaring holes on the roster.');
    out.push(ctx.cashMult > 1.1 ? 'Short on cash. Money sweetens a deal, and they won\'t take on salary.' : ctx.cashMult < 0.9 ? 'Flush with cash. Money barely moves them.' : 'Will take cash to balance a deal.');
    if (ctx.core.length) out.push('Hardest to pry loose: ' + ctx.core.map(id => P[id].name).join(', ') + '.');
    out.push('They want to come out about 8% ahead on value.');
    return out;
  }
  // AI club `ai` builds an offer for a player on club `other`. Returns {give (ai sends), get (other sends), cash (ai -> other)} or null.
  // opts.prefer: players the other club has put on the block; opts.needs: positions the other club asked for
  function aiOffer(W, ctx, suAI, suOther, info, R, farmAI, opts) {
    opts = opts || {};
    const P = W.P;
    const pick = arr => arr[Math.floor(R() * arr.length)];
    let targets = suOther.roster.filter(id => ctx.needs.includes(needOf(P[id])) && P[id].ovr >= 55 && P[id].ovr <= 84);
    if (!targets.length) targets = suOther.roster.filter(id => P[id].ovr >= 58 && P[id].ovr <= 80);
    targets.sort((a, b) => P[b].ovr - P[a].ovr);
    const pf = (opts.prefer || []).filter(id => suOther.roster.includes(id) && P[id] && P[id].ovr >= 45);
    if (pf.length) targets = pf;
    if (!targets.length) return null;
    const target = pick(targets.slice(0, 5));
    const tv = aiValue(W, ctx, target, info(target).sal, info(target).yrs);
    const budget = tv / 1.06;
    const cands = suAI.roster.filter(id => !ctx.core.includes(id) && needOf(P[id]) !== needOf(P[target]) || (!ctx.core.includes(id) && P[id].t !== P[target].t))
      .concat((farmAI || []).filter(id => P[id] && P[id].pros));
    const val = id => aiValue(W, ctx, id, info(id).sal, info(id).yrs);
    const fit = ids => (opts.needs && opts.needs.length && ids.some(id => opts.needs.includes(needOf(P[id])))) ? 1.3 : 1;
    let best = null;
    for (const a of cands) { const v = val(a); if (v <= budget && v >= tv * 0.55 && (!best || v * fit([a]) > best.s)) best = { ids: [a], v, s: v * fit([a]) }; }
    if (!best || best.v < tv * 0.8) {
      for (let i = 0; i < cands.length; i++) for (let j = i + 1; j < cands.length; j++) {
        const v = val(cands[i]) + val(cands[j]), sc = v * fit([cands[i], cands[j]]);
        if (v <= budget && (!best || sc > best.s)) best = { ids: [cands[i], cands[j]], v, s: sc };
      }
    }
    if (!best) return null;
    let cash = 0;
    const gap = budget - best.v;
    if (gap > 2 && ctx.cash > ERA.fin.start) cash = Math.min(3e6 * ERA.scale, Math.round(gap / CASH_UNIT * ERA.scale * 10) / 10 * 1e6);
    const mlb = best.ids.filter(id => suAI.roster.includes(id));
    const newAI = suAI.roster.filter(id => !mlb.includes(id)).concat([target]);
    const newOther = suOther.roster.filter(id => id !== target).concat(mlb);
    if (rosterOk(P, newAI) || rosterOk(P, newOther)) return null;
    return { give: best.ids, get: [target], cash };
  }

  // ---------- dynasty: aging, retirement & the Hall of Fame ----------
  // league/dyn = { lid, era, aged (winters applied), d:{id: rating change}, ret:{id: season retired}, war:{id}, car:{id:[...]}, hof:[...], log:[...] }
  // Every player keeps his original ratings in p.b0; aging moves his overall by d[id] points and rebuilds his rates to match.
  function snap0(p, fresh) {
    if (!p.b0 || fresh) p.b0 = { r: Object.assign({}, p.r), ovr: p.ovr, val: p.val, w: p.w, rt: Object.assign({}, p.rt), h: p.h, eraN: p.eraN, age: p.age, def: p.def, spd: p.spd, defAt: p.defAt ? Object.assign({}, p.defAt) : null };
    return p.b0;
  }
  function restore0(p) { const b = p.b0; p.r = Object.assign({}, b.r); p.ovr = b.ovr; p.val = b.val; p.w = b.w; p.rt = Object.assign({}, b.rt); p.h = b.h; p.eraN = b.eraN; p.def = b.def; p.spd = b.spd; if (b.defAt) p.defAt = Object.assign({}, b.defAt); }
  function setAge(W, p, delta, years) {
    const b = snap0(p), lg = W.lg, L = lg.L;
    if (years != null) p.age = b.age + years;
    restore0(p);
    if (!delta) return;
    const T = Math.max(25, Math.min(99, b.ovr + delta));
    if (p.t === 'H') {
      const extra = b.val - ((b.w - lg.lgW) / 1.2 * 600 + (POS_ADJ[p.pos] || 0));
      const want = (T - 60) / 0.8;
      const mk = m => { const r = { bb: b.r.bb * m, k: Math.min(0.45, b.r.k / Math.sqrt(m)), s: b.r.s * m, d: b.r.d * m, t: b.r.t * m, hr: b.r.hr * m }; r.o = 1 - (r.bb + r.k + r.s + r.d + r.t + r.hr); return r; };
      let lo = 0.3, hi = 2.2, r = b.r;
      for (let i = 0; i < 36; i++) { const m = (lo + hi) / 2; r = mk(m); if (r.o < 0.2 || (woba(r) - lg.lgW) / 1.2 * 600 + (POS_ADJ[p.pos] || 0) + extra > want) hi = m; else lo = m; }
      p.r = r; p.w = woba(r); p.val = (p.w - lg.lgW) / 1.2 * 600 + (POS_ADJ[p.pos] || 0) + extra;
      p.ovr = Math.round(Math.max(25, Math.min(99, 60 + 0.8 * p.val)));
      const bip = 1 - r.bb - r.k, cont = (r.s + r.d + r.t + r.hr) / (r.s + r.d + r.t + r.hr + r.o + r.k);
      const slow = Math.min(0, delta);
      p.spd = Math.max(0.75, b.spd * (1 + slow * 0.006));
      p.def = clampR(b.def + slow * 0.45);
      p.rt = { con: clampR(50 + (cont - 0.265) * 600), pow: clampR(50 + ((r.d + 2 * r.t + 3 * r.hr) / bip - 0.20) * 260), eye: clampR(50 + (r.bb - L.bb) * 600 - (r.k - L.k) * 150), spd: clampR(50 + (p.spd - 1) * 150), def: p.def };
      if (b.defAt) { p.defAt = {}; for (const k in b.defAt) p.defAt[k] = clampR(b.defAt[k] + slow * 0.45); }
    } else {
      const sp = p.role === 'SP';
      const eraT = sp ? lg.lgERA - (T - 60) / 0.85 * 9 / 200 : lg.lgERA - (T - 55) / 1.5 * 9 / 75;
      const k = Math.max(0.05, Math.min(0.4, b.r.k * (1 + delta * 0.006))), bb = Math.max(0.03, Math.min(0.2, b.r.bb * (1 - delta * 0.004)));
      let lo = 0.4, hi = 2.4, h = 1, r = null;
      for (let i = 0; i < 36; i++) { h = (lo + hi) / 2; r = pitchRates(lg, k, bb, h); if (pitchERA(lg, r) > eraT) hi = h; else lo = h; }
      p.h = h; p.r = r; p.eraN = pitchERA(lg, r);
      if (sp) { const runs = (lg.lgERA - p.eraN) * 200 / 9; p.val = runs; p.ovr = Math.round(Math.max(25, Math.min(99, 60 + 0.85 * runs))); }
      else { const runs = (lg.lgERA - p.eraN) * 75 / 9; p.val = runs * 1.3; p.ovr = Math.round(Math.max(25, Math.min(97, 55 + 1.5 * runs))); }
      p.rt = Object.assign({}, b.rt, { stf: clampR(50 + (r.k - L.k) * 330), ctl: clampR(50 - (r.bb - L.bb) * 500), mov: clampR(50 - (h - 1) * 160) });
    }
  }
  const isVet = (W, p) => p && !p.pros && p.id < W.base;
  // put a league's aging on the world (call after applyFarm)
  function applyDyn(W, dyn) {
    const d = (dyn && dyn.d) || {}, yrs = (dyn && dyn.aged) || 0;
    for (const p of W.P) {
      if (!p) continue;
      if (isVet(W, p)) { if (p.b0 || d[p.id] || yrs) setAge(W, p, d[p.id] || 0, yrs); }
      else if (p.pros && d[p.id]) { snap0(p, true); setAge(W, p, d[p.id], null); }
    }
  }
  // how much a player changes over one winter, by the age he will play next season at
  function ageStep(age, R) {
    const base = age <= 22 ? 4 : age <= 24 ? 3 : age <= 26 ? 1.5 : age <= 28 ? 0.5 : age <= 30 ? -0.5 : age <= 32 ? -1.5 : age <= 34 ? -3 : age <= 36 ? -4 : -5;
    const noise = (R() + R() + R() - 1.5) * 3.2; // about ±2.5, sometimes more
    return base + noise;
  }
  const CAR_H = 8, CAR_P = 8; // hitters: [seasons, G, AB, H, HR, RBI, SB, BB] · pitchers: [seasons, G, W, L, SV, OUTS, SO, R]
  function seasonValue(p, bat, pit) {
    const v = Math.max(0, (p.ovr - 55) / 5);
    if (p.t === 'H') return bat ? v * Math.min(1, bat[1] / 650) : 0;
    if (!pit) return 0;
    return p.role === 'SP' ? v * Math.min(1, pit[5] / 650) : v * 0.55 * Math.min(1, pit[5] / 210);
  }
  // Rough career value (wins above replacement, rounded) piled up before each era's league begins, for the
  // stars whose real careers the starting ratings can't see. Everyone else gets an estimate from age and ratings.
  const LEGENDS = {
    '1997': { 'Rickey Henderson': 100, 'Barry Bonds': 95, 'Cal Ripken Jr.': 85, 'Wade Boggs': 86, 'Roger Clemens': 80, 'Paul Molitor': 68, 'Ryne Sandberg': 67, 'Eddie Murray': 66, 'Tony Gwynn': 62, 'Tim Raines': 62, 'Dennis Eckersley': 60, 'Greg Maddux': 57, 'Mark McGwire': 46, 'Ken Griffey Jr.': 46, 'Barry Larkin': 50, 'Frank Thomas': 45, 'Orel Hershiser': 50, 'Dennis Martinez': 45, 'Randy Johnson': 40, 'John Smoltz': 42, 'Tom Glavine': 40, 'Fred McGriff': 42, 'Jose Canseco': 38, 'Harold Baines': 34, 'Edgar Martinez': 36, 'Lee Smith': 29, 'Ozzie Smith': 75, 'Craig Biggio': 38, 'Jeff Bagwell': 33, 'Larry Walker': 30, 'Mike Piazza': 24, 'Ivan Rodriguez': 20, 'Roberto Alomar': 40, 'Kevin Brown': 35, 'David Cone': 45, 'Chuck Finley': 38, 'Kenny Lofton': 30, 'Jim Thome': 14, 'Mark Grace': 34, 'Will Clark': 46, 'Gary Sheffield': 30, 'Brett Butler': 49, 'Chili Davis': 35, 'Andre Dawson': 64, 'Dave Winfield': 64, 'Jack McDowell': 25 },
    '2026': { 'Mike Trout': 87, 'Max Scherzer': 75, 'Mookie Betts': 70, 'Paul Goldschmidt': 62, 'Freddie Freeman': 62, 'Manny Machado': 62, 'Nolan Arenado': 58, 'Jose Altuve': 55, 'Chris Sale': 55, 'Bryce Harper': 52, 'Francisco Lindor': 52, 'Aaron Judge': 54, 'Shohei Ohtani': 48, 'Gerrit Cole': 46, 'Giancarlo Stanton': 46, 'Jacob deGrom': 46, 'Carlos Correa': 46, 'Xander Bogaerts': 40, 'Corey Seager': 38, 'Salvador Perez': 32, 'Craig Kimbrel': 25, 'Kenley Jansen': 27, 'Aaron Nola': 33, 'Juan Soto': 37 },
  };
  function preValue(W, p) {
    if (!isVet(W, p)) return 0;
    const b = p.b0 || p, leg = (LEGENDS[ERA.id] || {})[p.name];
    if (leg != null) return leg;
    const yrs = Math.max(0, b.age - 22.5), per = Math.max(0, (b.ovr - 55) / 5) * (p.t === 'P' && p.role !== 'SP' ? 0.4 : 0.7);
    return Math.round(Math.min(35, yrs * per) * 10) / 10;
  }
  // One winter. Adds the season's stats to careers, ages every active player, retires some free agents and inducts the best.
  // candidates: ids who may retire this winter (free agents). Returns { dyn, retired:[ids], inducted:[entries] }.
  function winterDyn(W, dyn0, S, season, seed, candidates, opts) {
    const dyn = JSON.parse(JSON.stringify(dyn0 || {}));
    dyn.d = dyn.d || {}; dyn.ret = dyn.ret || {}; dyn.war = dyn.war || {}; dyn.car = dyn.car || {}; dyn.hof = dyn.hof || []; dyn.aged = dyn.aged || 0;
    const P = W.P, year = ERA.year - 1 + season;
    // 1. careers from the season just played
    for (const id in S.bat) { const p = P[id], a = S.bat[id]; if (!p || p.t !== 'H') continue; const c = dyn.car[id] || (dyn.car[id] = new Array(CAR_H).fill(0)); c[0]++; c[1] += a[0]; c[2] += a[2]; c[3] += a[4]; c[4] += a[7]; c[5] += a[8]; c[6] += a[11]; c[7] += a[9]; }
    for (const id in S.pit) { const p = P[id], a = S.pit[id]; if (!p || p.t !== 'P') continue; const c = dyn.car[id] || (dyn.car[id] = new Array(CAR_P).fill(0)); c[0]++; c[1] += a[0]; c[2] += a[2]; c[3] += a[3]; c[4] += a[4]; c[5] += a[5]; c[6] += a[9]; c[7] += a[7]; }
    const seen = new Set(Object.keys(S.bat).concat(Object.keys(S.pit)));
    for (const id of seen) { const p = P[id]; if (!p) continue; dyn.war[id] = Math.round(((dyn.war[id] || 0) + seasonValue(p, S.bat[id], S.pit[id])) * 10) / 10; }
    // 2. aging (catch up any winters a league played before aging existed)
    const target = season; // after this winter, ratings belong to season+1, i.e. `season` winters applied
    while (dyn.aged < target) {
      const w = dyn.aged + 1, R = rng(hash32(seed >>> 0, 0xA6E + w * 977));
      for (const p of P) {
        if (!p || dyn.ret[p.id] != null || p.dup) continue;
        if (isVet(W, p)) {
          const ageNext = (p.b0 ? p.b0.age : p.age) + w;
          const cur = (p.b0 ? p.b0.ovr : p.ovr) + (dyn.d[p.id] || 0);
          const ch = ageStep(ageNext, R);
          dyn.d[p.id] = Math.round(Math.max(25, Math.min(99, cur + ch)) - (p.b0 ? p.b0.ovr : p.ovr));
        } else if (p.pros) {
          const ageNext = p.age + (target - w) + 1; // prospects: decline only once they are past their prime
          if (ageNext >= 30) { const ch = ageStep(ageNext, R); if (ch < 0) dyn.d[p.id] = Math.round((dyn.d[p.id] || 0) + ch); }
        }
      }
      dyn.aged = w;
    }
    applyDyn(W, dyn);
    // 3. retirements among free agents (contracts up or unsigned)
    const R2 = rng(hash32(seed >>> 0, 0x5E7 + season * 131)), retired = [], inducted = [];
    for (const id of candidates || []) {
      const p = P[id]; if (!p || dyn.ret[id] != null || p.dup) continue;
      const a = p.age, o = p.ovr;
      let pr = a >= 41 ? 0.92 : a >= 39 ? 0.6 : a >= 37 ? (o < 62 ? 0.5 : 0.18) : a >= 35 ? (o < 55 ? 0.4 : o < 62 ? 0.15 : 0.04) : a >= 33 ? (o < 48 ? 0.35 : 0.02) : 0;
      if (opts && opts.minorOnly && o >= 50) pr *= 0.5;
      if (R2() < pr) { dyn.ret[id] = season; retired.push(+id); }
    }
    // 4. Hall of Fame
    const hofSet = new Set(dyn.hof.map(h => h.id));
    for (const id of retired) {
      const p = P[id], score = Math.round((preValue(W, p) + (dyn.war[id] || 0)) * 10) / 10;
      if (score >= HOF_BAR && !hofSet.has(id)) {
        const e = { id, name: p.name, pos: p.t === 'P' ? (p.role === 'SP' ? 'SP' : 'RP') : p.pos, t: p.t, y: year + 1, score, peak: Math.max(p.b0 ? p.b0.ovr : p.ovr, p.ovr), car: dyn.car[id] || null, last: opts && opts.lastTeam ? opts.lastTeam(id) : null };
        dyn.hof.push(e); inducted.push(e);
      }
    }
    return { dyn, retired, inducted };
  }
  const HOF_BAR = 65;
  function hofScore(W, dyn, id) { const p = W.P[id]; return p ? Math.round((preValue(W, p) + ((dyn && dyn.war && dyn.war[id]) || 0)) * 10) / 10 : 0; }

  G.FO = { medFrac, medRisk, medDays, applyDyn, winterDyn, setAge, hofScore, HOF_BAR, preValue, showdown, TEAMS, TEAM, buildWorld, buildSchedule, newState, simDay, simPostGame, standings, teamSetup, autoLineup, luScore, autoStaff, defAt, posProfile, battingOrder, evalTrade, cpuAccepts, tradeValue, rosterOk, canPlay, pctOf, dateOf, attendance, rng, salOf, endOf, faAsk, faYears, BONUS, expireContracts, cpuBids, resolveFreeAgency, setEra, ERAS, ERA, teamCtx, aiValue, aiEvaluate, aiHint, aiOffer, needOf, CASH_UNIT, makeProspect, applyFarm, applyDraftPicks, hash32, newFarm, farmWinter, setDev, prospectScore, projOvr, FARM_MAX, READY_GAP, BUILDS, PROMOS, TV, fanParts, bizOf, buildCost, capOf, fanTarget, tvMult, localTV, gameMoney, starsOf, concPerFan, parkPerFan };
})(typeof globalThis !== 'undefined' ? globalThis : window);
