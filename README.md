# Outfit Roulette

[![CI](https://github.com/umesh2904x/Outfit-Roulette/actions/workflows/ci.yml/badge.svg)](https://github.com/umesh2904x/Outfit-Roulette/actions/workflows/ci.yml)

Plan outfits around your day and the clothes you already own. Outfit Roulette can generate three ranked suggestions, read a wardrobe photo, and save favorite looks in your browser.

See the [project report](docs/PROJECT_REPORT.md) for architecture, screenshots, verification evidence, and deferred deliverables.

## Requirements

- Node.js 20 or newer
- A Groq API key for outfit generation and wardrobe photo analysis

## Run locally

Clone or download the project, then open PowerShell in the project folder. On a fresh checkout, create your local environment file:

```powershell
Copy-Item .env.example .env
```

If `.env` already exists, edit it instead. Add a newly generated Groq key as `GROQ_API_KEY` and keep the file private. Then start the app:

```powershell
npm start
```

Open http://127.0.0.1:4173. Stop the server with `Ctrl+C` in its terminal. If that port is already occupied, stop the other server or change `PORT` in `.env` (for example, `PORT=4174`) and restart.

## Run with Docker

Requires Docker Desktop or another Docker Engine. Build the image from the project folder:

```powershell
docker build -t outfit-roulette .
```

Set `GROQ_API_KEY` in your shell or deployment environment, then run the container:

```powershell
docker run --rm -p 4173:4173 --env GROQ_API_KEY outfit-roulette
```

Open http://127.0.0.1:4173. The image runs as the unprivileged `node` user and includes a health check. Local `.env` files and backups are excluded from the Docker build context.

## Features

- Schedule-aware outfit suggestions with optional Women's, Men's, neutral or mixed styling direction.
- Optional wardrobe list or photo scanning, with wardrobe items enforced as a closed set.
- Save, copy and manage outfit ideas in the browser-based lookbook.
- Responsive layout and local persistence for the form and saved looks.

## Tech stack

- Frontend: HTML, CSS and JavaScript in `index.html`.
- Backend: dependency-free Node.js HTTP server in `server.mjs`.
- AI: Groq Chat Completions API. Outfit suggestions use `openai/gpt-oss-120b`; photo scanning uses `qwen/qwen3.8-27b`.
- Storage: `localStorage` and IndexedDB in the user's browser.

The backend keeps the Groq key out of browser code. Schedule and wardrobe-photo requests are sent to Groq; saved looks and form data stay in the browser.

## Tests and CI

Run the built-in Node.js tests and syntax check locally:

```powershell
npm test
npm run check
```

GitHub Actions runs the checks, builds the Docker image, and starts a container for an HTTP smoke test on pushes to `main` and on pull requests. No Groq API key or third-party test dependency is needed for CI.

## GitHub and deployment

The `.gitignore` excludes `.env`, other local environment files, dependencies, logs and `index.BACKUP.html`; `.dockerignore` excludes secrets and backup files from image builds. Commit source files and `.env.example`, but never commit `.env` or an API key.

On pushes to `main`, CI also publishes `umesh290406/outfit-roulette:latest` and a commit-SHA tag when the repository has a `DOCKERHUB_TOKEN` Actions secret. Create a Docker Hub access token and add it under **Settings → Secrets and variables → Actions**. The workflow uses the public username `umesh290406`; never put the token in a file or commit.

GitHub Pages cannot run the Node API server. For a live AI-enabled site, deploy `server.mjs` and `index.html` to a Node-capable host and set `GROQ_API_KEY` in that host's environment settings. Set `PORT` there only if the host requires it.

## Security

An API key was previously included in frontend/backup code and shared in chat. Revoke that key in Groq and use a newly generated key. Never commit or share API keys.
