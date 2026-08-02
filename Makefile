# fastify-gateway — common tasks. Run `make` or `make help` for the list.
# A shell equivalent lives at scripts/tasks.sh for environments without make.

.DEFAULT_GOAL := help
SHELL := /usr/bin/env bash

.PHONY: help install dev start start-prod build lint format typecheck \
        test test-watch test-cov test-e2e check \
        docker-build docker-run up down sonar-up sonar-down clean

help: ## Show this help
	@grep -E '^[a-zA-Z0-9_-]+:.*?## ' $(MAKEFILE_LIST) | \
		awk 'BEGIN{FS=":.*?## "}{printf "  \033[36m%-14s\033[0m %s\n", $$1, $$2}'

install: ## Install dependencies (sets up git hooks)
	npm install

dev: ## Run in watch mode
	npm run start:dev

start: ## Run once from source
	npm run start

start-prod: build ## Run the compiled build
	npm run start:prod

build: ## Compile to dist/
	npm run build

lint: ## Lint and auto-fix
	npm run lint

format: ## Format with Prettier
	npm run format

typecheck: ## Type-check without emitting
	npm run typecheck

test: ## Run unit + integration tests
	npm test

test-watch: ## Run tests in watch mode
	npm run test:watch

test-cov: ## Run tests with coverage
	npm run test:cov

test-e2e: ## Build, then run the live end-to-end suite
	npm run test:e2e

check: ## Full local gate: format, lint, typecheck, coverage
	npm run format:check && npm run lint:check && npm run typecheck && npm run test:cov

docker-build: ## Build the Docker image
	docker build -t fastify-gateway .

docker-run: docker-build ## Run the image from .env
	docker run --rm -p 8080:8080 --env-file .env fastify-gateway

up: ## Start the Compose stack (gateway, upstreams, redis)
	docker compose up --build

down: ## Stop the Compose stack
	docker compose down

sonar-up: ## Start a local SonarQube server
	docker compose -f sonar-compose.yaml up -d

sonar-down: ## Stop the local SonarQube server
	docker compose -f sonar-compose.yaml down

clean: ## Remove build output and coverage
	rm -rf dist coverage
