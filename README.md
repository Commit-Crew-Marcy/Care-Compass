# CareCompass

An AI-powered benefits navigator that helps people of every age, including
older adults, families with children, people with disabilities, low-income
individuals, and immigrants new to the United States, discover the government
programs they may qualify for.

Team Commit Crew — Zoulkarnein (Project Lead), Ashar (Scrum Master), Ibrahima (Tech Lead)

## How it works

1. The user completes an 8-step questionnaire (age, income, state and NYC
   residency, household
   size, household-member ages/relationships,
   disability/veteran status, pregnancy and children, immigration
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
4. In parallel, the backend runs the questionnaire household through the local
   PolicyEngine US package and adds the federal and state programs represented
   for the selected state. Model-supported results receive a preliminary
   eligibility rating and estimated annual amount when available; entries that
   need more information remain labeled “Check eligibility.” The catalog covers
   all 50 states and DC. This integration requires no Docker service or
   PolicyEngine API key.
5. The React frontend shows matched programs grouped by category, each
   opening a detail page with a plain-language description, why the user may
   qualify, required documents, and the official application link.
6. Users can create an account (register/login/logout with bcrypt-hashed
   passwords and JWT tokens) and save their screenings — a user-generated
   resource with full CRUD (create, read, update/rename, delete). Updating
   a screening's answers automatically re-runs the eligibility engine.
7. An AI assistant (floating "Ask a question" panel on results and detail
   pages) explains benefits in plain language in any language via the
   Gemini API — the Python engine decides eligibility, the AI only
   explains. Requires GEMINI_API_KEY on the server; the panel degrades
   gracefully when the key is not set.
8. The optional Chrome Browser Guide uses Gemini to explain the visible page
   in short, senior-friendly language and suggest one safe navigation action.
   If Gemini is unavailable, an optional Groq fallback can still provide a
   text-only answer. Page actions are validated by both the backend and
   extension, and clicks require confirmation.

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
│   │   ├── policyengine.py   State catalog + POST /api/policyengine/eligibility
│   │   ├── cms_marketplace.py POST /api/cms/marketplace/search
│   │   ├── benefits.py       GET /api/benefits, GET /api/benefits/:id
│   │   ├── nyc_benefits.py   GET /api/nyc-benefits/:id
│   │   └── ai.py             POST /api/ai/chat (stretch)
│   ├── services/
│   │   ├── gemini.py         Gemini text/function-calling adapter
│   │   ├── policyengine.py   PolicyEngine US household scoring + state catalog
│   │   ├── cms_marketplace.py CMS county, eligibility, and plan-search adapter
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
            ├── Questionnaire.jsx   8-step wizard, bottom progress bar
            ├── Results.jsx         Matched benefit cards + save results
            ├── BenefitDetail.jsx   Description, reasons, requirements, apply link
            ├── Login.jsx           Log in
            ├── Register.jsx        Create an account
            └── MyScreenings.jsx    Saved screenings: list, rename, delete
```

## Setup — backend (terminal 1)

Requires Python 3.12+ (PolicyEngine's compiled dependencies are tested with the
same Python version used by the deployed backend).

```bash
cd backend
python3.12 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python -m db.seed               # creates carecompass.db and seeds 4 programs
uvicorn main:app --reload       # API at http://localhost:8000
```

Interactive API docs (great for demos): http://localhost:8000/docs

PolicyEngine runs in the backend process, so there is no third service to start.
With the backend running, inspect any state directly:

```bash
curl http://localhost:8000/api/policyengine/programs/AZ
curl http://localhost:8000/api/policyengine/programs/NY
```

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

Current Marketplace plan estimates require `CMS_MARKETPLACE_API_KEY` in
`backend/.env`. The key stays server-side. Entering an optional ZIP code and
selecting Health and insurance (or all help) in the questionnaire returns up
to five of the lowest-premium current plans from CMS. If CMS is unavailable,
the rest of the screening still completes normally. For states that operate
their own Marketplace, such as Illinois and New York, CMS does not expose
plan-level prices; CareCompass shows the official state Marketplace and links
to its current plan-search experience instead of reporting an API failure.

## Switching to PostgreSQL (for the final)

The app uses SQLite by default so it runs with zero setup. To switch:

1. Create a database: `createdb carecompass`
2. Copy `backend/.env.example` to `backend/.env` and set
   `DATABASE_URL=postgresql://user:password@localhost:5432/carecompass`
3. Export it before running (`export DATABASE_URL=...` or use python-dotenv)
4. Re-run `python -m db.seed`

No code changes needed — `db/database.py` reads the env var.

## Enabling the AI features

Copy `backend/.env.example` to `backend/.env` and set `GEMINI_API_KEY` — it
powers both the website's floating assistant and the Chrome Browser Guide.
Both default to the stable `gemini-3.1-flash-lite` model. `GEMINI_MODEL`
configures the website chat, while `EXTENSION_GEMINI_MODEL` independently
configures the Browser Guide. Set `GROQ_API_KEY` to let the Browser Guide fall
back to Groq's `openai/gpt-oss-20b` for a text-only response when Gemini is
unavailable. Both keys remain on the backend and must never be placed in
extension JavaScript or `manifest.json`.

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
   `GEMINI_API_KEY` to enable the website assistant and Browser Guide, plus
   `GROQ_API_KEY` to enable the Browser Guide's fallback. Add
   `CMS_MARKETPLACE_API_KEY` to enable current Marketplace plan estimates.
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

**Backend deployment note.** The Render service was recreated and is now live at
https://care-compass-4gj5.onrender.com (replacing the old, now-dead
`care-compass-4gi5` URL referenced in earlier commits). The API responds
correctly, but its database has not been seeded yet — run `python -m db.seed`
from the Render dashboard's Shell tab for this service before the deployed
frontend or the Chrome extension's Automatic mode will return any benefits.
Local development against `http://localhost:8000` is unaffected.

## Notes

- Income limits in `db/seed.py` are approximations of 2025 federal
  guidelines. Verify current numbers before the final demo — they change
  every year.
- CareCompass is an informational guide, not an official eligibility
  determination (this disclaimer is shown in the UI).
