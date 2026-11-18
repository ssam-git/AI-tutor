# AI-tutor

A series of interactive tutorials about how software actually works. Each tutorial is **one self-contained
HTML file** — plain HTML, CSS and JavaScript, no build step, no dependencies, no network requests. Save it,
open it, it runs. Written with an AI assistant, then reviewed and fixed by hand.

**Live site:** https://ssam-git.github.io/AI-tutor/

## Projects

| Tutorial | What it does |
|---|---|
| **[API Learning Sandbox](api-learning.html)** | Press Run and watch one API call travel through client code → the wire → server code → the wire → client code. The executing line is highlighted in both panes while a timestamped request/response trace builds below. Switch the same scenario between **REST, GraphQL, gRPC and WebSocket**, and between **Python, JavaScript, Java and C#** on each side. 6 scenarios: package search, OAuth token exchange, weather lookup (cache hit), image byte stream, 3 MB chunked video, live server push. Shows headers, status codes, `Content-Length`, TLS/keep-alive, TCP frames, `sendfile(2)`, bcrypt cost and cache hits. Step forward/back, slow-mo or instant, explanations toggle. Keyboard: <kbd>space</kbd> run, <kbd>→</kbd>/<kbd>←</kbd> step, <kbd>R</kbd> rebuild. Works on phones: one panel at a time, swipe between Client / Server / Trace. Loop bodies walk per iteration (read → write → read → write) and the highlight only ever walks *down* a pane — callbacks and resolvers are written inline where they run, so nothing jumps backwards. |
| **[MCP Learning Sandbox](mcp-learning.html)** | The same console pointed at the Model Context Protocol: one tool call walking **the model → the MCP client → JSON-RPC 2.0 on a transport → the MCP server → back**, with the actual message frames in the trace. Its reason for existing is the **protocol revision** selector: run the same scenario on `2025-03-26`, `2025-11-25` and the current `2026-07-28` and watch the `initialize` handshake, `notifications/initialized`, `Mcp-Session-Id` and server-initiated `elicitation/create` disappear, replaced by `server/discover`, per-request `_meta` and `input_required` retries. 4 scenarios (cold start, tool call, tool failure vs protocol failure, server-asks-a-human), **stdio vs Streamable HTTP** (`Mcp-Method` / `Mcp-Name` headers), server in Python (FastMCP) or the TypeScript SDK. Nothing is invented: `dev/check-mcp.js` asserts each revision shows only its own protocol shape. |

## Checking the step model

The trace is generated from a phase model (`PH_BASE` + `phases()`) plus per-language code generators, and those
two things drift apart as soon as anyone edits a snippet. So each tutorial gets a checker that drives headless
Chromium straight over CDP (`dev/cdp.js`) — no test framework, no dependencies — and exits non-zero on any
violation.

```sh
node dev/check-steps.js      # api-learning.html: 384 combos (6 scenarios x 4 API types x 4 x 4 languages)
node dev/check-mcp.js        # mcp-learning.html:  48 combos (4 scenarios x 2 transports x 3 revisions x 2 langs)
node dev/check-shared.js     # the ENGINE block copied into each page must stay byte-identical
node dev/check-layout.js     # every scenario at 390x844: no page may be wider than the viewport
CHROME=/path/to/chromium node dev/check-steps.js   # only if it cannot find a chromium to launch
W=320 H=640 node dev/check-layout.js               # small-phone pass
```

What they assert:

1. **line order** — the highlighted line never moves up inside a pane (`buildSteps()` keeps each side's source
   order while merging the client / server / message streams by phase number);
2. **phase order** — a pane's source order agrees with the phase map, otherwise the two sides interleave at the
   wrong moment;
3. **causal order** — the wire events sit between the right code steps: request bytes after the client writes
   them, dispatch after they land, the client's read after the response bytes arrive, and in the MCP sandbox a
   multi round-trip retry strictly after the human answered;
4. **protocol shape** (MCP only) — `2026-07-28` must show no `initialize` and no session id, older revisions must
   show no `server/discover`, `structuredContent` / `ttlMs` must be absent from `2025-03-26`, and stdio must
   carry no HTTP at all;
5. **no sideways pages** — `check-layout.js` emulates a 390 px phone, runs every combination to the end in all
   three views and asserts `document.scrollWidth` never exceeds the viewport. One long unbreakable token in a
   pre-formatted block (a base64 `requestState`, say) is enough to make the document 634 px wide, and the
   browser then scales the whole page down: it does not look scrolled, it looks broken. `overflow-wrap:anywhere`
   on the trace blocks is what keeps that from coming back.

If you change a code generator, a phase number or `buildSteps()`, run them before committing.

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
4. The tutorial page links back with `<a class="back" href="index.html">← all projects</a>`, and sideways to its
   sibling sandbox in the same `<span class="links">`.

If the new page steps through code, take the step engine rather than rewriting it: copy the block between
`/* ==== ENGINE START ==== */` and `/* ==== ENGINE END ==== */` out of an existing page, byte for byte, and
supply the things it calls — `phases(d)`, `REPEAT`, `STEP`, `wireEvents(d, P)`, `stepMs(s, d)`. `REPEAT` is a
function of the scenario (how many times a line runs); `STEP` is a plain number added per iteration, so a
repeating line has to be a *contiguous* loop body in the snippet. `dev/check-shared.js` compares the copies and
fails if they drift, which is the point: fix a bug once, then copy the block. Keep each file self-contained —
no shared `.js`/`.css` imports, because "save it, open it, it runs" is the whole promise.
