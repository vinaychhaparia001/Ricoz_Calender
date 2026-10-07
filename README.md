# RicozCalendar

```
RicozCalendar/
├── frontend/                 Static web app (no build step)
│   ├── index.html            Page markup only
│   ├── css/styles.css        All styles
│   ├── js/
│   │   ├── config.js         API base URL (edit here to point at another backend)
│   │   ├── api.js            fetch wrapper for the backend
│   │   └── app.js            UI, views and state
│   ├── dev-server.js         Zero-dependency local static server
│   └── vercel.json           Proxies /api/* to the backend project
└── backend/                  Express + SQLite REST API
    ├── api/[...path].js      Vercel serverless entry
    ├── src/
    │   ├── server.js         Local entry point
    │   ├── app.js            Express app wiring
    │   ├── config.js, db.js, seed.js
    │   ├── routes/           people, events, availability, rooms, sharing
    │   ├── services/         business logic
    │   ├── middleware/, lib/
    ├── test/api.test.js
    ├── vercel.json
    └── .env.example
```

## Run locally

Terminal 1 — backend (http://localhost:3000/api):
```bash
cd backend
npm install
cp .env.example .env     # optional
npm start
```

Terminal 2 — frontend (http://localhost:5173):
```bash
cd frontend
npm start
```
On `localhost:5173` the frontend automatically talks to `http://localhost:3000/api`.

Run backend tests: `cd backend && npm test`

## Deploy to Vercel (two projects)

1. **Backend**: import the repo, set *Root Directory* = `backend`, Framework = Other.
   Note the URL, e.g. `https://my-ricoz-api.vercel.app`.
2. **Frontend**: import the same repo again, *Root Directory* = `frontend`, Framework = Other.
   Edit `frontend/vercel.json` and replace `YOUR-BACKEND-PROJECT.vercel.app` with the backend URL.
   (Alternatively set `window.RICOZ_API_BASE` in `js/config.js` and rely on CORS.)

The browser keeps calling relative `/api/...`; Vercel forwards those to the backend.

## Database note

The backend uses SQLite (`better-sqlite3`). On Vercel it writes to `/tmp`, which is ephemeral — data
resets when the function is recreated. Fine for a demo; for production swap in a hosted
database (Postgres/Supabase/Neon) behind the same API.
