# AI-tutor

A series of interactive tutorials about how software actually works. Each tutorial is **one self-contained
HTML file** — plain HTML, CSS and JavaScript, no build step, no dependencies, no network requests. Save it,
open it, it runs. Written with an AI assistant, then reviewed and fixed by hand.

**Live site:** https://ssam-git.github.io/AI-tutor/

## Projects

| Tutorial | What it does |
|---|---|
| **[API Learning Sandbox](api-learning.html)** | Press Run and watch one API call travel through client code → the wire → server code → the wire → client code. The executing line is highlighted in both panes while a timestamped request/response trace builds below. Switch the same scenario between **REST, GraphQL, gRPC and WebSocket**, and between **Python, JavaScript, Java and C#** on each side. 6 scenarios: package search, OAuth token exchange, weather lookup (cache hit), image byte stream, 3 MB chunked video, live server push. Shows headers, status codes, `Content-Length`, TLS/keep-alive, TCP frames, `sendfile(2)`, bcrypt cost and cache hits. Step forward/back, slow-mo or instant, explanations toggle. Keyboard: <kbd>space</kbd> run, <kbd>→</kbd>/<kbd>←</kbd> step, <kbd>R</kbd> rebuild. Works on phones: one panel at a time, swipe between Client / Server / Trace. Loop bodies walk per iteration (read → write → read → write) and the highlight only ever walks *down* a pane — callbacks and resolvers are written inline where they run, so nothing jumps backwards. |

## Checking the step model

The trace is generated from a phase model (`PH_BASE` + `phases()`) plus per-language code generators, and those
two things drift apart as soon as anyone edits a snippet. `dev/check-steps.js` checks all 384 combinations
(6 scenarios × 4 API types × 4 client languages × 4 server languages) for three things: the highlighted line
never moves up inside a pane, a pane's source order always agrees with the phase numbers, and the wire events
stay causally between the right code steps.

```sh
CHROME=/path/to/chromium node dev/check-steps.js     # exits non-zero on any violation
```

It drives headless Chromium straight over CDP — no test framework, no dependencies. If you change a code
generator, a phase number or `buildSteps()`, run it before committing.

More tutorials are planned (regex engine step-through, git commit-graph visualiser, SQL query planner).

## Publishing

Static files only — `index.html` at the repo root is the site root.

1. GitHub → repo → **Settings → Pages → Source: Deploy from a branch → `main` / `Root`**.
2. `git push`. Pages rebuilds in under a minute.

`.nojekyll` is present so GitHub skips Jekyll processing entirely (faster builds, no `_`-prefixed-file
surprises).

## Adding a project

1. Drop the new single-file tutorial next to `index.html` (e.g. `regex-playground.html`).
2. In `index.html`, copy one `<a class="card">` block in the *Projects* grid, point `href` at the new file,
   set `--c1`/`--c2` (the colour strip), and rewrite the title, blurb, `<ul class="facts">` and pills. A
   commented template marker sits above the grid.
3. Move the matching card out of the *Planned* grid, and add a row to the table above.
4. The tutorial page itself links back with `<a class="back" href="./">← all projects</a>`.
