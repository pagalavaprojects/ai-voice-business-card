# Production Security Hardening

Headers configured in `next.config.mjs`:
- `Strict-Transport-Security`: Enforces HTTPS for 2 years (`max-age=63072000`).
- `X-Frame-Options`: Set to `DENY` to mitigate Clickjacking attacks.
- `X-Content-Type-Options`: Set to `nosniff`.
- `Referrer-Policy`: Set to `strict-origin-when-cross-origin`.
