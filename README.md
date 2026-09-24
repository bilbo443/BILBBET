bilbbet
A fake-currency fantasy betting page: H2H markets, division/Roddy/FA Cup/ECL
futures, specials, and an admin panel.
See `COMPETITION_RULES.md` for the current fixture calendar, conference finals,
and promotion decisions still awaiting confirmation. Review the current
schedule and simulation code before changing the published data.
Current handoff (2026-09-23)
`files (1).zip` takes precedence over same-named files in `files (4).zip`.
The priority archive contains the latest supplied `app.js`, `styles.css`,
`index.html`, `sw.js`, `manifest.json`, icons, logos and six JSON files; it is
not a complete deployable repository. The older archive supplies the
pipeline, documentation and remaining data files. For the repository layout,
`index.html` points to `css/styles.css`, `js/app.js`,
`assets/icons/`, `assets/logos/`, and `app.js` loads JSON from `data/`.
Place the priority copies at those paths when assembling a repository; do
not assume the flat archive paths can be served unchanged. Confirm the rest
of the repository's files are present before deploying.
The current app loads 16 named JSON inputs: `futures`, `h2h_history`,
`h2h_divisions`, `h2h_shift`, `h2h_cup_shift`, `h2h_variance_widen`,
`h2h_schedule`, `leading_at`, `special_markets`, `h2h_record`,
`cup_calendar`, `carry_balances`, `round_dates`,
`div23_schedule_exceptions`, `real_results`, and
`aleague_round_projection`. A missing `real_results.json` is allowed before
live results exist; other missing or badly shaped inputs are reported.
The latest frontend also contains committee election markets, Round 1
Mr Median tipping for Div 2/3, weekly median and unknown-opponent betting
markets, an install prompt and service worker, fixture import, and a round
countdown. See `BETTING_FORMULAS.md` and the new handoff section in
`PRESEASON_TESTING.md` for mechanics and checks.
Setting up real persistence with Supabase (recommended)
By default, if nothing else is configured, the app stores accounts and bets
in memory for the current browser tab only -- everything resets on reload.
Supabase gives you a real, free, hosted database instead, and needs no
backend code of your own: the app already routes every read and write
through one small set of functions (`sget`/`sset`), so this is a five
minute setup, not a rewrite.
Go to supabase.com, sign up (free tier is plenty for this), and
create a new project.
In your project, open SQL Editor -> New query, paste in the entire
contents of `supabase/schema.sql` from this repo, and click Run.
That creates the one table the whole app uses.
Go to Project Settings -> API. Copy your Project URL and your
anon public key (not the service_role key -- that one should never
go in client-side code).
Open `js/app.js` and find these two lines near the top:
```js
   const SUPABASE_URL = '<your project URL>';
   const SUPABASE_ANON_KEY = '<your publishable key>';
   ```
The supplied priority `app.js` already has a project URL and a publishable
key configured. Only change these when moving to a different project.
That's it -- reload the page and accounts/bets now persist for real,
for everyone who visits, whether that's via GitHub Pages, your own
domain, or Claude's artifact panel.
Worth knowing: the SQL sets up the table so anyone with your public
anon key can read and write it -- there's no real authentication layer
here, same as everywhere else in this app (PINs are for convenience,
not security). That's an intentional, low-stakes tradeoff for a mates'
fake-currency book. If this ever needs to be genuinely secure, that's
the first thing to change -- Supabase supports proper row-level auth,
this schema just doesn't use it.
If the project settings are absent or the client library does not load, the app automatically falls back to `window.storage` (inside
Claude's artifact panel) or in-memory (everywhere else) -- nothing
breaks, you just don't get persistence until you fill them in.
Running and persistence
Serve the project over HTTP because `app.js` fetches JSON. The supplied
priority frontend includes a configured Supabase project and a publishable
key; accounts and bets can persist when that service and its schema are
available. Without the client or configuration, the app falls back to
`window.storage` where available or memory for the current tab. The
browser's remembered username is a convenience feature, not account
storage. Confirm actual database connectivity in a deployed environment.
Step-by-step: getting this into GitHub
Option A -- no git experience needed (web upload)
Go to github.com, log in, and click the + in the top right →
New repository.
Name it (e.g. `bilbbet`), leave it Public or Private as you prefer,
and click Create repository (don't add a README/gitignore here --
you already have one).
On the empty repo page, click uploading an existing file.
Drag in `index.html`, then create the folder structure by typing the
path directly into the file name when uploading -- GitHub will create
`css/`, `js/`, and `data/` automatically if you name files like
`css/styles.css`, `js/app.js`, `data/futures.json`, etc. Do this for
every referenced file, including all 16 JSON inputs, icons, logos,
manifest and service worker. The two archives do not by themselves
prove the assembled repository is complete.
Scroll down, add a commit message like "Initial upload", and click
Commit changes.
Option B -- using git on the command line
```bash
# 1. Create the repo on github.com first (New repository, no README), then:
git clone https://github.com/<your-username>/bilbbet.git
cd bilbbet

# 2. Copy in the files from this folder, preserving the structure:
#    index.html, css/styles.css, js/app.js, data/*.json

git add .
git commit -m "Initial commit"
git push origin main
```
Viewing it locally before pushing (recommended)
Don't just double-click `index.html` -- start a tiny local server from
inside the folder instead, so `fetch()` can actually load the data files:
```bash
# Python (already on most machines):
python3 -m http.server 8000
# then open http://localhost:8000 in your browser

# or, if you have Node:
npx serve .
```
Hosting it live with GitHub Pages (optional)
In your repo, go to Settings → Pages.
Under "Build and deployment", set Source to `Deploy from a branch`,
branch `main`, folder `/ (root)`, then Save.
GitHub gives you a URL like `https://<username>.github.io/bilbbet/`
within a minute or two -- that's a shareable link anyone can open.
Remember: this is the "no persistent storage" mode described above.
Updating a market later
Each data file is independent, so if you re-run the simulation and just
want to refresh, say, the futures odds, you only need to replace
`data/futures.json` and re-commit -- no need to touch `app.js` or the
other data files unless the underlying logic itself changes.
