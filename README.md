# Front Office

A phone-first baseball GM sim in the spirit of Baseball Mogul '98, built to play with friends.
Run a club with 2026 or classic 1997 rosters: set lineups, make trades, sign free agents, run the
business, draft prospects, and race your friends in the GM Race.

**Play:** https://samahlersmeyer-prog.github.io/front-office/

## How it works

- A single page (`index.html`) with no build tools needed to run it.
- Sign in with Google to create or join leagues with friends. Leagues live in Firebase (Firestore);
  your solo league and career history are private to your account.
- "Play solo on this device" works without an account and saves in the browser.

## Editing

Source lives in `src/`:

| File | What it is |
|---|---|
| `src/engine.js` | The simulation: ratings, games, finances, playoffs, farm and draft |
| `src/app.js` | The interface and league logic |
| `src/shell.html` | Page structure and all styles |
| `src/firebase_adapter.js` | Sign-in and the shared league database on Firebase |
| `src/rosters26.txt`, `src/rosters97.txt` | Roster data and real stat lines |

After changing anything in `src/`, run `python3 build.py` and commit the rebuilt `index.html`.
`build.py` also writes `front-office-claude.html`, the version that runs as a Claude artifact.

## Firebase

Project `front-office-924b5`. Security rules are in `firestore.rules` (paste into
Firestore → Rules). The web config in `src/firebase_adapter.js` is public by design;
the rules are what protect the data.
