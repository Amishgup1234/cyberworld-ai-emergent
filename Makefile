# CyberWorld AI - Makefile
# Common development commands

.PHONY: help setup dev test build lint typecheck clean

# Default target
help:
	@echo "CyberWorld AI - Development Commands"
	@echo ""
	@echo "Setup:"
	@echo "  make setup        - Install all dependencies (backend + frontend)"
	@echo ""
	@echo "Development:"
	@echo "  make dev          - Start both frontend and backend in development mode"
	@echo "  make dev-backend  - Start backend only"
	@echo "  make dev-frontend - Start frontend only"
	@echo ""
	@echo "Testing:"
	@echo "  make test         - Run all tests (backend + frontend)"
	@echo "  make test-backend - Run backend tests only"
	@echo "  make test-frontend - Run frontend tests only"
	@echo ""
	@echo "Building:"
	@echo "  make build        - Build frontend for production"
	@echo ""
	@echo "Code Quality:"
	@echo "  make lint         - Run linters (backend + frontend)"
	@echo "  make typecheck    - Run type checkers (backend + frontend)"
	@echo ""
	@echo "Cleanup:"
	@echo "  make clean        - Remove build artifacts and caches"

# Setup - install all dependencies
setup: setup-backend setup-frontend

setup-backend:
	python3 -m venv .venv
	.venv/bin/pip install --upgrade pip
	.venv/bin/pip install -r backend/requirements.txt

setup-frontend:
	cd frontend && pnpm install

# Development - uses app.main with --app-dir backend (consistent with tests, loads trained model when artifacts present via alias handling)
dev:
	@echo "Starting backend and frontend..."
	@echo "Backend: http://localhost:8000"
	@echo "Frontend: http://localhost:5173"
	@echo "Press Ctrl+C to stop both"
	@trap 'kill %1; kill %2' INT; \
	.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir backend & \
	cd frontend && pnpm dev & \
	wait

dev-backend:
	.venv/bin/uvicorn app.main:app --reload --host 0.0.0.0 --port 8000 --app-dir backend

dev-frontend:
	cd frontend && pnpm dev

# Testing
test: test-backend test-frontend

test-backend:
	.venv/bin/python -m pytest backend/tests -v

test-frontend:
	cd frontend && pnpm test:run

# Building
build:
	cd frontend && pnpm build

# Code Quality
lint: lint-backend lint-frontend

lint-backend:
	.venv/bin/ruff check backend/

lint-frontend:
	cd frontend && pnpm lint

typecheck: typecheck-backend typecheck-frontend

typecheck-backend:
	MYPYPATH=backend .venv/bin/mypy -p app
	MYPYPATH=backend .venv/bin/mypy backend/tests --no-namespace-packages

typecheck-frontend:
	cd frontend && pnpm typecheck

# Cleanup
clean:
	rm -rf .venv
	rm -rf frontend/node_modules
	rm -rf frontend/dist
	rm -rf frontend/build
	rm -rf frontend/.vite
	rm -rf frontend/coverage
	rm -rf backend/__pycache__
	rm -rf backend/.pytest_cache
	rm -rf backend/.mypy_cache
	rm -rf backend/.ruff_cache
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true
	find . -type f -name "*.pyc" -delete 2>/dev/null || true