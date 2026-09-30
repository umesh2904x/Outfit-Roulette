# Outfit Roulette — Project Links

## Main links

- [GitHub repository](https://github.com/umesh2904x/Outfit-Roulette)
- [Local app](http://127.0.0.1:4173/) (opens only while the local server is running)
- [Project presentation](presentation.html)
- [Architecture and implementation report](PROJECT_REPORT.md)
- [GitHub Actions](https://github.com/umesh2904x/Outfit-Roulette/actions)
- [Latest successful CI run](https://github.com/umesh2904x/Outfit-Roulette/actions/runs/36761305575)

## Main project files

- [Application UI](../index.html)
- [Node.js API server](../server.mjs)
- [Dockerfile](../Dockerfile)
- [Docker Compose monitoring stack](../docker-compose.yml)
- [Prometheus configuration](../monitoring/prometheus.yml)
- [Grafana dashboard](../monitoring/grafana/dashboards/outfit-roulette.json)
- [Render deployment configuration](../render.yaml)
- [CI workflow](../.github/workflows/ci.yml)

## Docker image

The CI run builds `outfit-roulette:ci` and starts a temporary container to check the app. That image stays on GitHub's runner; it is **not currently published on Docker Hub**. To publish `umesh290406/outfit-roulette`, add a Docker Hub access token as the GitHub Actions secret `DOCKERHUB_TOKEN`.

To build and run it locally with Docker Desktop, from the project folder:

```powershell
docker build -t outfit-roulette .
docker run --rm --env-file .env -p 4174:4173 outfit-roulette
```

Then open http://127.0.0.1:4174. Docker Desktop is required; it is not installed in the current development environment.

## Current setup

- Public hosting: Render configuration is ready; the service still needs to be created and given a newly rotated Groq key.
- Monitoring: Prometheus and Grafana configuration is ready; run `docker compose up --build -d` on a machine with Docker to open the dashboard.
- Tests: `npm test` runs seven backend tests; `npm run check` checks server syntax.
- Security: the Groq key previously shared in chat should be revoked. Keep replacement keys in `.env` or the hosting provider's secret settings, never in source code.