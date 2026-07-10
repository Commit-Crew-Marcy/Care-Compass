# CareCompass

An AI-powered healthcare benefits navigator that helps older adults, people
with disabilities, and low-income individuals discover healthcare programs
they may qualify for.

Team Commit Crew — Zoulkarnein (Project Lead), Ashar (Scrum Master), Ibrahima (Tech Lead)

## How it works

1. The user completes a 5-step questionnaire (age, income, state, household
   size, disability/veteran status, current insurance).
2. The FastAPI backend runs the answers through a rules-based eligibility
   engine (`backend/engine/rules.py`) against programs stored in the database.
3. The React frontend shows matched programs as cards, each opening a detail
   page with a plain-language description, why the user may qualify, required
   documents, and the official application link.
4. (Stretch) An AI assistant explains benefits in plain language via the
   Anthropic API — the Python engine decides eligibility, Claude only explains.

## Project structure

```
carecompass/
├── backend/
│   ├── main.py               FastAPI app entry — CORS + router registration
│   ├── requirements.txt
│   ├── .env.example          Copy to .env for Postgres / AI key config
│   ├── routers/
│   │   ├── eligibility.py    POST /api/eligibility/check
│   │   ├── benefits.py       GET /api/benefits, GET /api/benefits/:id
│   │   └── ai.py             POST /api/ai/chat (stretch)
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
            ├── Questionnaire.jsx   5-step wizard, bottom progress bar
            ├── Results.jsx         Matched benefit cards
            └── BenefitDetail.jsx   Description, reasons, requirements, apply link
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

## Switching to PostgreSQL (for the final)

The app uses SQLite by default so it runs with zero setup. To switch:

1. Create a database: `createdb carecompass`
2. Copy `backend/.env.example` to `backend/.env` and set
   `DATABASE_URL=postgresql://user:password@localhost:5432/carecompass`
3. Export it before running (`export DATABASE_URL=...` or use python-dotenv)
4. Re-run `python -m db.seed`

No code changes needed — `db/database.py` reads the env var.

## Enabling the AI assistant (stretch)

Set `ANTHROPIC_API_KEY` in your environment, restart the API, and
POST /api/ai/chat becomes live. Without the key it returns the 503 from the
API contract, so the MVP works fine without it.

## Testing the API directly

```bash
curl -X POST http://localhost:8000/api/eligibility/check \
  -H "Content-Type: application/json" \
  -d '{"age":67,"income":18000,"state":"CA","householdSize":2,"currentCoverage":["medicare"]}'
```

## Notes

- Income limits in `db/seed.py` are approximations of 2025 federal
  guidelines. Verify current numbers before the final demo — they change
  every year.
- CareCompass is an informational guide, not an official eligibility
  determination (this disclaimer is shown in the UI).
