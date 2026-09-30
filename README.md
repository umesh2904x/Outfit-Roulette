# Outfit Roulette

Plan outfits around your day and the clothes you already own. Outfit Roulette can generate three ranked suggestions, read a wardrobe photo, and save favorite looks in your browser.

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

## GitHub and deployment

The `.gitignore` excludes `.env`, other local environment files, dependencies, logs and `index.BACKUP.html`. Upload the source files and `.env.example`, but never upload `.env` or an API key. The project is not uploaded by this setup.

GitHub Pages cannot run the Node API server. For a live AI-enabled site, deploy `server.mjs` and `index.html` to a Node-capable host and set `GROQ_API_KEY` in that host's environment settings. Set `PORT` there only if the host requires it.

## Security

An API key was previously included in frontend/backup code and shared in chat. Revoke that key in Groq and use a newly generated key. Never commit or share API keys.
