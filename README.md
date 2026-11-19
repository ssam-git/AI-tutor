# AI-tutor

A series of interactive tutorials about how software actually works. Each tutorial is **one self-contained
HTML file** — plain HTML, CSS and JavaScript, no build step, no dependencies, no network requests. Save it,
open it, it runs. Written with an AI assistant, then reviewed and fixed by hand.

**Live site:** https://ssam-git.github.io/AI-tutor/

## Projects

| Tutorial | What it does |
|---|---|
| **[API Learning Sandbox](api-learning.html)** | Press Run and watch one API call travel through client code → the wire → server code → the wire → client code. The executing line is highlighted in both panes while a timestamped request/response trace builds below. Switch the same scenario between **REST, GraphQL, gRPC and WebSocket**, and between **Python, JavaScript, Java and C#** on each side. 6 scenarios: package search, OAuth token exchange, weather lookup (cache hit), image byte stream, 3 MB chunked video, live server push. Shows headers, status codes, `Content-Length`, TLS/keep-alive, TCP frames, `sendfile(2)`, bcrypt cost and cache hits. Step forward/back, slow-mo or instant, explanations toggle. Keyboard: <kbd>space</kbd> run, <kbd>→</kbd>/<kbd>←</kbd> step, <kbd>R</kbd> rebuild. Works on phones: one panel at a time, swipe between Client / Server / Trace. Loop bodies walk per iteration (read → write → read → write) and the highlight only ever walks *down* a pane — callbacks and resolvers are written inline where they run, so nothing jumps backwards. |
| **[MCP Learning Sandbox](mcp-learning.html)** | The same console pointed at the Model Context Protocol: one tool call walking **the model → the MCP client → JSON-RPC 2.0 on a transport → the MCP server → back**, with the actual message frames in the trace. Its reason for existing is the **protocol revision** selector: run the same scenario on `2025-03-26`, `2025-11-25` and the current `2026-07-28` and watch the `initialize` handshake, `notifications/initialized`, `Mcp-Session-Id` and server-initiated `elicitation/create` disappear, replaced by `server/discover`, per-request `_meta` and `input_required` retries. 4 scenarios (cold start, tool call, tool failure vs protocol failure, server-asks-a-human), **stdio vs Streamable HTTP** (`Mcp-Method` / `Mcp-Name` headers), server in Python (FastMCP) or the TypeScript SDK — the Python signature is
`async def weather(city: str, units: Literal["metric", "imperial"] = "metric")` so the schema the model reads is
the one the code declares — client in the TypeScript SDK or the Python `mcp` SDK (`Client(...)`, `elicitation_callback`, plus `mode="legacy"` when the server is old enough to send requests back). Nothing is invented: `dev/check-mcp.js` asserts each revision shows only its own protocol shape, and the
python snippets were checked against a real `fastmcp` 3.4.11 process (where `ToolError` lives, how a tool
gets `isError:true`, what a plain dict return becomes, the `{"result": ...}` wrap-result trick). Where a
framework departs from the spec the page says so out loud: fastmcp 3.x answers an unknown tool with
`isError:true` where the spec wants `-32602`, and it has no multi round-trip support yet, so that pane is
labelled as the 4.x / spec shape. |

## Checking the step model

The trace is generated from a phase model (`PH_BASE` + `phases()`) plus per-language code generators, and those
two things drift apart as soon as anyone edits a snippet. So each tutorial gets a checker that drives headless
Chromium straight over CDP (`dev/cdp.js`) — no test framework, no dependencies — and exits non-zero on any
violation.

```sh
node dev/check-steps.js      # api-learning.html: 384 combos (6 scenarios x 4 API types x 4 x 4 languages)
node dev/check-mcp.js        # mcp-learning.html:  96 combos (4 scenarios x 2 transports x 3 revisions x 2 client x 2 server)
node dev/check-shared.js     # the ENGINE and SPLIT blocks copied into each page must stay byte-identical
node dev/check-layout.js     # every scenario at 390x844 AND 1100x760: no overflow, no drifting controls
node dev/check-resize.js api-learning.html mcp-learning.html   # drag the grips: they trade width, clamp, persist
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
   carry no HTTP at all. The client side is asserted too: a Python client that answers a pre-2026 server's
   backwards request must show `mode="legacy"` (the modern protocol has no back-channel), and must not show it
   on a 2026-07-28 session. The tool schema is asserted in both directions: a `tools/list` frame advertising
   `"enum": ["metric","imperial"]` has to come from a constraint the server snippet actually declares
   (`Literal[...]` in Python, `z.enum([...])` in TypeScript), and a declared constraint has to reach the wire.
   A loose `units: str = "metric"` cannot generate an `enum`, and the page used to claim it did.
   `outputSchema` is asserted the same way: the frame has to match how *that* language produces it
   (`z.object({...})` declared in TypeScript, a bare `{"type":"object","additionalProperties":true}`
   from a python `-> dict`);
5. **no sideways pages** — `check-layout.js` emulates a phone *and* a desktop window, runs every
   combination to the end in all three views and asserts `document.scrollWidth` never exceeds the
   viewport. One long unbreakable token in a pre-formatted block (a base64 `requestState`, say) is
   enough to make the document 634 px wide, and the browser then scales the whole page down: it does
   not look scrolled, it looks broken. `overflow-wrap:anywhere` on the trace blocks is what keeps
   that from coming back;
6. **controls that stay put** — the same check records the x of the back links, the scenario select
   and the Run button for every scenario and fails if any of them drifts by more than a pixel. They
   used to: a wrapping flex row's max-content width is the *sum* of its items, so the chips row under
   the run buttons resized the grid column beside it and picking "live server push" slid the links
   300 px left. The title row, the chips row and the scenario blurb now each span the whole top pane;
7. **resizing behaves** — the two code panes and the trace are resizable by dragging the grips between
   them. `check-resize.js` sends real pointer events and asserts that a drag *trades* width instead of
   growing the page, that both grips clamp at their floors (200 px per pane, 90 px of trace) instead of
   letting a pane vanish, that `ArrowLeft/Right/Up/Down` nudge a focused grip by 24 px while `ArrowRight`
   still steps the walkthrough when it is not focused, that `Home` resets, that the sizes come back after a
   reload, and that the grips are not laid out at all on a phone, where there is only one panel to resize.

To eyeball a change instead of reasoning about it, `dev/shot.js /tmp/jobs.json` drives the page with
an `eval` (pick a scenario, step to the end) and writes PNGs; add `clip:{x,y,width,height,scale}` to a job to
zoom into one widget — same zero-dependency CDP setup.

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
(`/* ==== ENGINE START ==== */` / `ENGINE END`, plus the `SPLIT` block that makes the panes resizable) out of
an existing page, byte for byte except for the one `const PAGE = '...'` line that keys localStorage, and
supply the things it calls — `phases(d)`, `REPEAT`, `STEP`, `wireEvents(d, P)`, `stepMs(s, d)`. `REPEAT` is a
function of the scenario (how many times a line runs); `STEP` is a plain number added per iteration, so a
repeating line has to be a *contiguous* loop body in the snippet. `dev/check-shared.js` compares the copies and
fails if they drift, which is the point: fix a bug once, then copy the block. Keep each file self-contained —
no shared `.js`/`.css` imports, because "save it, open it, it runs" is the whole promise.
