#!/usr/bin/env bash
#
# Task runner mirroring the Makefile, for environments without `make`.
# Usage: ./scripts/tasks.sh <command>   (run with no argument for the list)
set -euo pipefail
cd "$(dirname "$0")/.."

usage() {
  cat <<'EOF'
fastify-gateway tasks

  install       Install dependencies (sets up git hooks)
  dev           Run in watch mode
  start         Run once from source
  start-prod    Build, then run the compiled build
  build         Compile to dist/
  lint          Lint and auto-fix
  format        Format with Prettier
  typecheck     Type-check without emitting
  test          Run unit + integration tests
  test-watch    Run tests in watch mode
  test-cov      Run tests with coverage
  test-e2e      Build, then run the live end-to-end suite
  check         Full local gate: format, lint, typecheck, coverage
  docker-build  Build the Docker image
  docker-run    Run the image from .env
  up            Start the Compose stack (gateway, upstreams, redis)
  down          Stop the Compose stack
  sonar-up      Start a local SonarQube server
  sonar-down    Stop the local SonarQube server
  clean         Remove build output and coverage
EOF
}

case "${1:-help}" in
  install)      npm install ;;
  dev)          npm run start:dev ;;
  start)        npm run start ;;
  start-prod)   npm run build && npm run start:prod ;;
  build)        npm run build ;;
  lint)         npm run lint ;;
  format)       npm run format ;;
  typecheck)    npm run typecheck ;;
  test)         npm test ;;
  test-watch)   npm run test:watch ;;
  test-cov)     npm run test:cov ;;
  test-e2e)     npm run test:e2e ;;
  check)        npm run format:check && npm run lint:check && npm run typecheck && npm run test:cov ;;
  docker-build) docker build -t fastify-gateway . ;;
  docker-run)   docker build -t fastify-gateway . && docker run --rm -p 8080:8080 --env-file .env fastify-gateway ;;
  up)           docker compose up --build ;;
  down)         docker compose down ;;
  sonar-up)     docker compose -f sonar-compose.yaml up -d ;;
  sonar-down)   docker compose -f sonar-compose.yaml down ;;
  clean)        rm -rf dist coverage ;;
  help|-h|--help) usage ;;
  *)            echo "Unknown command: $1" >&2; echo >&2; usage; exit 1 ;;
esac
