-- Add thread-level pin support for wish posts
ALTER TABLE "feedback_threads"
ADD COLUMN IF NOT EXISTS "isPinned" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "feedback_threads_isPinned_createdAt_idx"
ON "feedback_threads"("isPinned", "createdAt");
