# Docker Deployment & Containerization Guide

## 1. Quick Start with Docker Compose
```bash
# Development
docker-compose up --build

# Production
docker-compose -f docker-compose.prod.yml up -d --build
```

## 2. Multi-Stage Build Optimizations
- Stage 1 (`deps`): Installs production npm packages.
- Stage 2 (`builder`): Compiles Next.js bundle with SWC minification.
- Stage 3 (`runner`): Executes application as unprivileged non-root user (`nextjs:1001`).
