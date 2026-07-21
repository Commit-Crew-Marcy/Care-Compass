# CareCompass

An AI-powered benefits navigator that helps people of every age, including
older adults, families with children, people with disabilities, low-income
individuals, and immigrants new to the United States, discover the government
programs they may qualify for.

Team Commit Crew — Zoulkarnein (Project Lead), Ashar (Scrum Master), Ibrahima (Tech Lead)

## How it works

1. The user completes a 7-step questionnaire (age, income, state and NYC
   residency, household
   size, disability/veteran status, pregnancy and children, immigration
   status with a "prefer not to say" option, current insurance, and the kinds
   of help they want).
2. The FastAPI backend runs the answers through a rules-based eligibility
   engine (`backend/engine/rules.py`) against 18 programs stored in the
   database: Medicare Parts A, B, C, and D, Medigap, Extra Help, Medicare
   Savings Program, Medicaid, Emergency Medicaid, CHIP, the ACA
   Marketplace, SNAP, WIC, TANF, SSI, LIHEAP, school meals, and Head Start.
   The engine understands the federal 5-year waiting period for green card
   holders, the refugee/asylee exemption, and programs open to everyone
   regardless of status (WIC, Emergency Medicaid, school meals, Head Start).
3. For users who confirm that they live in New York City, the backend also
   adds a short, category-filtered list from NYC's current Benefits and
   Programs Open Data directory. Directory records are labeled separately
   because they are suggestions, not eligibility determinations.
4. The React frontend shows matched programs grouped by category, each
   opening a detail page with a plain-language description, why the user may
   qualify, required documents, and the official application link.
5. Users can create an account (register/login/logout with bcrypt-hashed
   passwords and JWT tokens) and save their screenings — a user-generated
   resource with full CRUD (create, read, update/rename, delete). Updating
   a screening's answers automatically re-runs the eligibility engine.
6. An AI assistant (floating "Ask a question" panel on results and detail
   pages) explains benefits in plain language in any language via the
   Anthropic API — the Python engine decides eligibility, Claude only
   explains. Requires ANTHROPIC_API_KEY on the server; the panel degrades
   gracefully when the key is not set.
7. The optional Chrome Browser Guide uses Gemini to explain the visible page
   in short, senior-friendly language and suggest one safe navigation action.
   Page actions are validated by both the backend and extension, and clicks
   require confirmation.

## Project structure

```
carecompass/
├── backend/
│   ├── main.py               FastAPI app entry — CORS + router registration
│   ├── requirements.txt
│   ├── .env.example          Copy to .env for Postgres / AI key config
│   ├── core/
│   │   └── security.py       Password hashing (bcrypt) + JWT tokens
│   ├── routers/
│   │   ├── auth.py           POST /api/auth/{register,login,logout}, GET /api/auth/me
│   │   ├── screenings.py     Full CRUD on saved screenings (auth required)
│   │   ├── eligibility.py    POST /api/eligibility/check
│   │   ├── benefits.py       GET /api/benefits, GET /api/benefits/:id
│   │   ├── nyc_benefits.py   GET /api/nyc-benefits/:id
│   │   └── ai.py             POST /api/ai/chat (stretch)
│   ├── services/
│   │   ├── gemini.py         Gemini text/function-calling adapter
│   │   └── nyc_benefits.py   Cached NYC Open Data adapter and ranking
│   ├── engine/
│   │   └── rules.py          Pure-Python eligibility engine (OR-logic rules)
│   ├── models/
│   │   └── schemas.py        Pydantic validation, camelCase <-> snake_case
│   └── db/
│       ├── database.py       SQLAlchemy setup (SQLite default, Postgres via env)
│       ├── models.py         benefits / eligibility_rules / requirements tables
│       └── seed.py           Seeds Medicaid, Medicare Part B, MSP, Extra Help
└── frontend/
    └── src/
        ├── App.jsx           Routes
        ├── api.js            All backend calls in one place
        ├── index.css         Blue & white palette, senior-friendly sizing
        └── pages/
            ├── Questionnaire.jsx   7-step wizard, bottom progress bar
            ├── Results.jsx         Matched benefit cards + save results
            ├── BenefitDetail.jsx   Description, reasons, requirements, apply link
            ├── Login.jsx           Log in
            ├── Register.jsx        Create an account
            └── MyScreenings.jsx    Saved screenings: list, rename, delete
```

## Setup — backend (terminal 1)

Requires Python 3.10+.

```bash
cd backend
python -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
pip install -r requirements.txt
python -m db.seed               # creates carecompass.db and seeds 4 programs
uvicorn main:app --reload       # API at http://localhost:8000
```

Interactive API docs (great for demos): http://localhost:8000/docs

## Setup — frontend (terminal 2)

Requires Node 18+.

```bash
cd frontend
npm install
npm run dev                     # app at http://localhost:5173
```

Open http://localhost:5173, fill in the questionnaire (try age 67, income
18000, household 2, has Medicare) and you should get 4 matches.

The NYC Benefits and Programs dataset does not require an API key. For a
deployed app, you can create a free Socrata app token and set
`NYC_OPEN_DATA_APP_TOKEN` to receive higher request limits. CareCompass caches
the directory for one hour and keeps the existing rule-based results working
if NYC Open Data is temporarily unavailable.

## Switching to PostgreSQL (for the final)

The app uses SQLite by default so it runs with zero setup. To switch:

1. Create a database: `createdb carecompass`
2. Copy `backend/.env.example` to `backend/.env` and set
   `DATABASE_URL=postgresql://user:password@localhost:5432/carecompass`
3. Export it before running (`export DATABASE_URL=...` or use python-dotenv)
4. Re-run `python -m db.seed`

No code changes needed — `db/database.py` reads the env var.

## Enabling the AI features

Copy `backend/.env.example` to `backend/.env`. Set `ANTHROPIC_API_KEY` for the
website's floating assistant and `GEMINI_API_KEY` for the Chrome Browser Guide.
The extension defaults to the stable `gemini-3.5-flash` model; override it with
`GEMINI_MODEL` if needed. Keys remain on the backend and must never be placed
in extension JavaScript or `manifest.json`.

## Testing the API directly

```bash
curl -X POST http://localhost:8000/api/eligibility/check \
  -H "Content-Type: application/json" \
  -d '{"age":67,"income":18000,"state":"CA","householdSize":2,"currentCoverage":["medicare"]}'
```


## Deployment (Render + Vercel, both free)

### Backend on Render
1. Go to https://render.com, sign in with GitHub, click New → Web Service
2. Select the Commit-Crew-Marcy/Care-Compass repo
3. Settings: Root Directory `backend`, Build Command `pip install -r requirements.txt`,
   Start Command `uvicorn main:app --host 0.0.0.0 --port $PORT`
4. Add environment variable `SECRET_KEY` set to any long random string. Add
   `GEMINI_API_KEY` to enable the Chrome Browser Guide and
   `ANTHROPIC_API_KEY` only if you also want the website assistant.
5. Deploy, then open the Render shell and run `python -m db.seed` once
6. Copy your Render URL (e.g. https://carecompass-api.onrender.com)

### Frontend on Vercel
1. In the Vercel project settings, add `VITE_API_BASE_URL` with your live
   Render backend URL, then redeploy the frontend
2. In `backend/main.py` add your Vercel URL to the CORS allow_origins list
3. Go to https://vercel.com, sign in with GitHub, click Add New → Project
4. Select the repo, set Root Directory to `frontend`, deploy
5. Put the Vercel link at the top of this README for the assignment

## Assignment checklist
- [x] Python + FastAPI backend
- [x] User authentication: register, login, logout, profile (GET /api/auth/me)
- [x] User-generated resource with full CRUD: saved screenings
- [x] GitHub repo with README containing the product spec
- [x] Deployment link: https://care-compass-three.vercel.app (frontend, Vercel)

**Backend deployment is currently down.** The Render service referenced in
`extension/manifest.json` (https://care-compass-4gi5.onrender.com) returns 404
on every route as of 2026-07-21 — it needs to be redeployed (or a new service
created) following the Render steps above before the deployed frontend or the
Chrome extension's Automatic mode will work end to end. Local development
against `http://localhost:8000` is unaffected.

## Notes

- Income limits in `db/seed.py` are approximations of 2025 federal
  guidelines. Verify current numbers before the final demo — they change
  every year.
- CareCompass is an informational guide, not an official eligibility
  determination (this disclaimer is shown in the UI).
