// Front Office on the open web: when the page is not running inside Claude, this provides the same
// window.claude.use('db' | 'user') interface backed by Firebase (Firestore + Google sign-in).
// Documents are stored as one JSON string field (j) so nested arrays and large objects just work.
(function () {
  const CFG = {
    apiKey: "AIzaSyALf4RDAqcUOg7aC2OheNO-1RR8ZN9XO4U",
    authDomain: "front-office-924b5.firebaseapp.com",
    projectId: "front-office-924b5",
    storageBucket: "front-office-924b5.firebasestorage.app",
    messagingSenderId: "240853317074",
    appId: "1:240853317074:web:154eba6ca6eece4354440b"
  };
  if (window.claude || /(^|\.)claude\.ai$|claudeusercontent|anthropic/.test(location.hostname) || location.protocol === 'file:') return;
  const V = '10.12.2', BASE = 'https://www.gstatic.com/firebasejs/' + V + '/';
  let ready = null;
  const ls = { get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch (e) { /* private mode */ } }, del: k => { try { localStorage.removeItem(k); } catch (e) { /* */ } } };

  function gate(onGoogle) {
    return new Promise(resolve => {
      const el = document.createElement('div');
      el.className = 'gate';
      el.innerHTML = '<div class="gatecard"><div class="gateball" aria-hidden="true"></div><h1>Front Office</h1>' +
        '<p>Run a big-league club against your friends: trades, lineups, the money, and a GM Race to settle who is best.</p>' +
        '<button class="btn primary big" type="button" data-g="google"><span class="gico" aria-hidden="true">G</span>Continue with Google</button>' +
        '<button class="btn" type="button" data-g="solo">Play solo on this device</button>' +
        '<p class="small muted" id="gateMsg">Signing in lets you join friends\' leagues and keeps your seasons on every device.</p></div>';
      document.body.appendChild(el);
      el.addEventListener('click', async e => {
        const b = e.target.closest('[data-g]'); if (!b) return;
        if (b.dataset.g === 'solo') { ls.set('fo-solo', '1'); el.remove(); resolve(null); return; }
        b.disabled = true; el.querySelector('#gateMsg').textContent = 'Opening Google sign-in…';
        try { const u = await onGoogle(); ls.del('fo-solo'); el.remove(); resolve(u); }
        catch (err) { b.disabled = false; el.querySelector('#gateMsg').textContent = err && err.code === 'auth/popup-closed-by-user' ? 'Sign-in was closed. Try again, or play solo.' : 'Could not sign in (' + ((err && err.code) || 'error') + '). Try again.'; }
      });
    });
  }

  function load() {
    if (ready) return ready;
    ready = (async () => {
      const [appM, authM, fs] = await Promise.all([import(BASE + 'firebase-app.js'), import(BASE + 'firebase-auth.js'), import(BASE + 'firebase-firestore.js')]);
      const app = appM.initializeApp(CFG), auth = authM.getAuth(app), fdb = fs.getFirestore(app);
      const provider = new authM.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      const google = async () => { const r = await authM.signInWithPopup(auth, provider); return r.user; };
      window.foSignIn = async () => { try { await google(); ls.del('fo-solo'); location.reload(); } catch (e) { /* closed */ } };
      window.foSignOut = async () => { await authM.signOut(auth); ls.set('fo-solo', '1'); location.reload(); };
      let user = await new Promise(res => { const un = authM.onAuthStateChanged(auth, u => { un(); res(u); }); });
      if (!user && !ls.get('fo-solo')) user = await gate(google);
      if (user) { // public profile so friends see your name
        try { await fs.setDoc(fs.doc(fdb, 'profiles/' + user.uid), { j: JSON.stringify({ name: user.displayName || 'GM', avatarUrl: user.photoURL || '' }), ts: Date.now() }); } catch (e) { /* rules not set yet */ }
      }
      return { fs, fdb, user };
    })();
    return ready;
  }

  function makeDb(r) {
    const { fs, fdb } = r;
    const enc = d => { const j = JSON.stringify(d === undefined ? null : d); if (j.length > 1000000) console.warn('Front Office: document near the 1MB limit', j.length); return { j, ts: d && typeof d.ts === 'number' ? d.ts : 0 }; };
    const dec = s => { const x = s.data(); return x && typeof x.j === 'string' ? JSON.parse(x.j) : x; };
    const dsnap = s => ({ exists: s.exists(), id: s.id, data: () => dec(s) });
    const qsnap = s => ({ docs: s.docs.map(d => ({ id: d.id, exists: true, data: () => dec(d) })), size: s.size, empty: s.empty });
    function docRef(path) {
      const ref = fs.doc(fdb, path);
      return {
        id: ref.id, path,
        get: async () => dsnap(await fs.getDoc(ref)),
        set: async d => { await fs.setDoc(ref, enc(d)); },
        update: async d => { const cur = await fs.getDoc(ref); await fs.setDoc(ref, enc(Object.assign({}, cur.exists() ? dec(cur) : {}, d))); },
        delete: async () => { await fs.deleteDoc(ref); },
        onSnapshot: (fn, err) => fs.onSnapshot(ref, s => fn(dsnap(s)), e => { if (err) err(e); }),
        acquire: async ({ holder, ttlMs }) => {
          try {
            const ok = await fs.runTransaction(fdb, async tx => {
              const s = await tx.get(ref), v = s.exists() ? dec(s) : null, now = Date.now();
              if (v && v.holder !== holder && v.until > now) return false;
              tx.set(ref, enc({ holder, until: now + (ttlMs || 60000) })); return true;
            });
            return { acquired: ok, release: async () => { try { await fs.deleteDoc(ref); } catch (e) { /* expires anyway */ } } };
          } catch (e) { return { acquired: true, release: async () => {} }; }
        },
        collection: c => colRef(path + '/' + c),
      };
    }
    function colRef(path, q) {
      q = q || {};
      const build = () => { const cons = []; if (q.order) cons.push(fs.orderBy(q.order[0], q.order[1] || 'asc')); if (q.limit) cons.push(fs.limit(q.limit)); const c = fs.collection(fdb, path); return cons.length ? fs.query(c, ...cons) : c; };
      return {
        path,
        doc: id => docRef(path + '/' + id),
        orderBy: (f, dir) => colRef(path, Object.assign({}, q, { order: [f, dir] })),
        limit: n => colRef(path, Object.assign({}, q, { limit: n })),
        get: async () => qsnap(await fs.getDocs(build())),
        onSnapshot: (fn, err) => fs.onSnapshot(build(), s => fn(qsnap(s)), e => { if (err) err(e); }),
      };
    }
    return { doc: docRef, collection: colRef };
  }
  function makeUser(r) {
    const { fs, fdb, user } = r;
    return {
      me: async () => ({ id: user.uid, name: user.displayName || 'GM', avatarUrl: user.photoURL || '' }),
      can: async () => true,
      profiles: async ids => {
        const out = {};
        await Promise.all([...new Set(ids)].filter(Boolean).map(async id => {
          try { const s = await fs.getDoc(fs.doc(fdb, 'profiles/' + id)); if (s.exists()) { const x = s.data(); out[id] = typeof x.j === 'string' ? JSON.parse(x.j) : x; } } catch (e) { /* unknown */ }
        }));
        return out;
      },
    };
  }
  window.foWeb = true;
  window.claude = {
    use: async name => {
      const r = await load();
      if (!r.user) throw new Error('Playing solo on this device');
      if (name === 'db') return makeDb(r);
      if (name === 'user') return makeUser(r);
      throw new Error('Not available here: ' + name);
    },
  };
})();
