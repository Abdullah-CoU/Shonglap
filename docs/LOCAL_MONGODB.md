# Local MongoDB Setup (Docker, Persistent)

MongoDB runs in Docker with a **bind mount** to `./docker-data/mongodb` on your PC, so data persists across container restarts.

## Start MongoDB

```bash
# Start Docker Desktop, then:
docker-compose up -d mongodb
```

Check it's healthy:
```bash
docker ps --filter name=shonglap-mongo
docker exec shonglap-mongo mongosh shonglap --quiet --eval "db.complaints.countDocuments()"
```

## Connection string

```
mongodb://localhost:27017/shonglap
```

Configured in `server/.env`:
```env
MONGODB_URI=mongodb://localhost:27017/shonglap
```

## Where the data lives

`./docker-data/mongodb/` — contains the `.wt` collection files, `journal/`, etc.
Deleting this folder resets the database. This folder is gitignored.

## Seed the database

```bash
cd server
npm run seed:demo   # 50 complaints, 4 users, 12 departments, 56 jurisdictions
npm run seed        # basic seed (departments, jurisdictions, 4 demo users)
```

## Stop / remove

```bash
docker-compose stop mongodb      # stop, keep data
docker-compose down              # stop and remove container (data stays on disk)
```

## Demo accounts (after seeding)

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@shonglap.gov.bd | admin123 |
| DNCC | dncc@shonglap.gov.bd | dept123 |
| DSCC | dscc@shonglap.gov.bd | dept123 |
| WASA | wasa@shonglap.gov.bd | dept123 |

## Notes
- Port 27017 is exposed on localhost. MongoDB 7.0 image.
- The server now uses this real MongoDB (not the in-memory test DB).
- Transcription uses Google Gemini (set `GEMINI_API_KEY` / `GOOGLE_API_KEY` in your environment); `MOCK_TRANSCRIPTION=false` in `server/.env`.
