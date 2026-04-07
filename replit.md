# Cable Guy AI

A full-stack web application for WiFi and network diagnostics with an AI-driven chat interface.

## Architecture

- **Frontend**: Vanilla JavaScript, HTML5, CSS3 (Tailwind), served as static files by Express
- **Backend**: Node.js + Express.js REST API
- **Database**: PostgreSQL (Replit built-in)
- **AI**: Ollama API integration for network diagnostic chat responses
- **Auth**: JWT tokens + bcrypt password hashing

## Project Layout

```
.
├── client/         # Static frontend files (HTML, JS, CSS)
├── db/
│   └── schema.sql  # PostgreSQL schema (auto-applied on startup)
├── server/
│   ├── config.js   # Environment variable configuration
│   ├── index.js    # Express app entry point
│   ├── models/     # Database connection (db.js)
│   ├── routes/     # API routes
│   ├── controllers/# Business logic
│   ├── middleware/ # Auth/validation middleware
│   └── utils/      # AI utilities
├── uploads/        # User-uploaded files
└── package.json
```

## Environment Variables

- `DATABASE_URL` – PostgreSQL connection string (auto-set by Replit)
- `PORT` – Server port (set to 5000)
- `JWT_SECRET` – JWT signing secret (defaults to 'change-me-in-production')
- `SUPER_ADMIN_EMAIL` / `SUPER_ADMIN_PASSWORD` – Optional admin seed credentials
- `OLLAMA_API_URL` – Ollama AI endpoint (defaults to Railway-hosted endpoint)
- `UPLOAD_DIR` – File upload directory (set to ./uploads)

## Running the App

The app runs via the "Start application" workflow on port 5000.
The Express server serves both the API and static frontend files.
Database schema is automatically applied on startup via `db/schema.sql`.

## Deployment

Configured for autoscale deployment with `node server/index.js`.
