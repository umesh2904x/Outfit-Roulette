# Outfit Roulette — Deliverables and Evidence

**Project:** Outfit Roulette  
**Repository:** [GitHub source](https://github.com/umesh2904x/Outfit-Roulette)  
**Latest source:** `main` branch  
**CI evidence:** [GitHub Actions runs](https://github.com/umesh2904x/Outfit-Roulette/actions)

This page maps the assignment requirements to the project files and available evidence. “Configured” does not mean a public service is already running.

| Requirement | Status | Evidence |
| --- | --- | --- |
| Working application source | Complete | [Frontend](../index.html), [Node.js server](../server.mjs) |
| GitHub repository and commit history | Complete | [Repository](https://github.com/umesh2904x/Outfit-Roulette), [commit history](https://github.com/umesh2904x/Outfit-Roulette/commits/main) |
| CI pipeline | Complete | [GitHub Actions workflow](../.github/workflows/ci.yml), [workflow runs](https://github.com/umesh2904x/Outfit-Roulette/actions) |
| Automated tests | Complete locally: 7 passed | [Backend integration tests](../tests/server.test.mjs); CI result appears in the workflow-runs link after the latest push |
| Dockerfile and image build | Configured | [Dockerfile](../Dockerfile); CI builds the image on a GitHub-hosted runner |
| Running Docker container / HTTP evidence | CI smoke test configured | Workflow starts the container and checks `/api/health` and `/`; this is an ephemeral CI container, not a permanent deployment |
| Prometheus metrics | Implemented | [Server `/metrics` endpoint](../server.mjs), [Prometheus scrape config](../monitoring/prometheus.yml) |
| Grafana dashboard | Configured, runtime not yet launched | [Dashboard JSON](../monitoring/grafana/dashboards/outfit-roulette.json), [Compose stack](../docker-compose.yml) |
| Deployment configuration | Configured, not publicly deployed | [Render Blueprint](../render.yaml), secret-gated [Render deploy job](../.github/workflows/ci.yml) |
| Architecture, steps, screenshots, tests and conclusions | Complete | [Project report](PROJECT_REPORT.md), [home screenshot](screenshots/home.png), [form screenshot](screenshots/outfit-form.png) |
| Final presentation | Complete as an HTML deck | [Open project presentation](presentation.html) |

## Evidence Notes

- Seven backend integration tests and `npm run check` pass locally. Tests use a mocked Groq upstream and do not need an API key.
- Docker was not installed in the development environment. The GitHub Actions workflow is configured to validate Compose, build the image, start a container, and smoke-test its health and homepage. Check the latest Actions run for its result.
- The Grafana dashboard and Prometheus scrape configuration are in source control, but the stack has not been launched locally because Docker is unavailable.
- No public app deployment is claimed. Render requires a service setup, a newly rotated `GROQ_API_KEY` in Render's private settings, and a `RENDER_DEPLOY_HOOK` GitHub Actions secret.
- Docker Hub publishing is configured for `umesh290406/outfit-roulette`, but requires a `DOCKERHUB_TOKEN` GitHub Actions secret.
- The previously exposed Groq key should be revoked. Never commit API keys or share them in chat.

## Deferred Live Steps

1. Create the Render service from `render.yaml`, add a new Groq key in Render, and configure `RENDER_DEPLOY_HOOK` in GitHub repository secrets.
2. Add a Docker Hub access token as `DOCKERHUB_TOKEN` if the image should be published to Docker Hub.
3. On a Docker-enabled machine, run `docker compose up --build -d`, then open Grafana at `http://127.0.0.1:3000` and inspect the provisioned service-health dashboard.
4. Present the project using the linked HTML deck and demonstrate the deployed service after the public deployment is active.
