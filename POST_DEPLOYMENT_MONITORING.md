# Post-Deployment Monitoring & Site Reliability

1. **Uptime Monitoring**: Ping `GET /api/health` every 60 seconds.
2. **Error Tracking**: Track uncaught exceptions via Sentry / PostHog.
3. **Structured Logs**: Monitor stdout JSON logs from Node.js serverless runtimes.
