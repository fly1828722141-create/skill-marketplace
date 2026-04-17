# Migration Notes

## New migration

- Directory: `prisma/migrations/20260417152000_reviews_analytics_dashboard`
- Scope:
  - `comments.like_count`
  - new tables: `comment_images`, `comment_likes`, `event_logs`
  - indexes for review sorting and analytics queries

## Deploy order (PostgreSQL)

1. Back up production database.
2. Ensure new env vars are configured (`POSTHOG_HOST`, `POSTHOG_PROJECT_API_KEY` optional).
3. Run:

```bash
npx prisma generate
npx prisma migrate deploy
```

4. Deploy application code.
5. Smoke test:
  - Google login
  - upload skill with summary >= 10 chars
  - review submit (text + image)
  - review like / unlike and top-order update
  - `/dashboard` data available

## Rollback

- App-level rollback: redeploy previous app version.
- DB rollback:
  - for critical emergency only, restore from backup snapshot.
  - avoid manual `DROP` in production without snapshot confirmation.
