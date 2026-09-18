# RicozCalendar — Demo App (split source)

The same demo as before, now split into its natural parts instead of one
combined file:

| File | What it is |
|---|---|
| `index.html` | Page structure — the sidebar/main shell, links to the CSS and JS below |
| `styles.css` | All styling — layout, light/dark theme tokens, components |
| `app.js` | All behavior — mock data, scheduling/availability logic, rendering, event handlers |

Covers the four core RicozCalendar features from the PRD:
- Individual and team calendar (month view + day agenda)
- Meeting scheduling with availability intelligence (computes real shared free slots)
- Conference room booking with live conflict checking
- Calendar sharing & delegation (per-person access levels, single enforced delegate)

## How to run

No build step or server required — open `index.html` in any modern browser
(keep all three files in the same folder, since `index.html` loads the other
two by relative path).

### Running in VS Code

`app.js` is **browser code** — it uses `window`, `document`, and
`localStorage`, which only exist inside a web page. If you try to execute it
directly as a script (e.g. VS Code's "Run Code" / Code Runner on `app.js`, or
`node app.js`), it will fail, because Node has none of those globals.

To actually run the app:
1. Install the **Live Server** extension in VS Code.
2. Right-click `index.html` → **Open with Live Server**.
3. It opens in your browser at a `localhost` address with everything wired up.

Alternatively, just double-click `index.html` to open it directly in a
browser — no VS Code needed at all.

A `jsconfig.json` is included so VS Code's editor stops flagging `window` /
`document` / `localStorage` as "undefined" while you're editing `app.js` —
that's an editor-only IntelliSense fix and doesn't change how the app runs.

Data is mock/seeded on first load and persisted to your browser's local
storage, so bookings and sharing changes stick around between visits on the
same device/browser.
