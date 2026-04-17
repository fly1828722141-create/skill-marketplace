-- Reviews + Analytics + Dashboard schema upgrade

-- 1) Comments: add like counter and ensure relations
ALTER TABLE "comments"
  ADD COLUMN IF NOT EXISTS "like_count" INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comments_userId_fkey'
  ) THEN
    ALTER TABLE "comments"
      ADD CONSTRAINT "comments_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comments_skillId_fkey'
  ) THEN
    ALTER TABLE "comments"
      ADD CONSTRAINT "comments_skillId_fkey"
      FOREIGN KEY ("skillId") REFERENCES "skills"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END
$$;

-- 2) Comment images
CREATE TABLE IF NOT EXISTS "comment_images" (
  "id" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "url" TEXT NOT NULL,
  "fileName" TEXT,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "comment_images_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comment_images_commentId_fkey'
  ) THEN
    ALTER TABLE "comment_images"
      ADD CONSTRAINT "comment_images_commentId_fkey"
      FOREIGN KEY ("commentId") REFERENCES "comments"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- 3) Comment likes
CREATE TABLE IF NOT EXISTS "comment_likes" (
  "id" TEXT NOT NULL,
  "commentId" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "comment_likes_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comment_likes_commentId_fkey'
  ) THEN
    ALTER TABLE "comment_likes"
      ADD CONSTRAINT "comment_likes_commentId_fkey"
      FOREIGN KEY ("commentId") REFERENCES "comments"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'comment_likes_userId_fkey'
  ) THEN
    ALTER TABLE "comment_likes"
      ADD CONSTRAINT "comment_likes_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END
$$;

-- 4) Event logs
CREATE TABLE IF NOT EXISTS "event_logs" (
  "id" TEXT NOT NULL,
  "eventName" TEXT NOT NULL,
  "page" TEXT,
  "module" TEXT,
  "action" TEXT,
  "userId" TEXT,
  "skillId" TEXT,
  "categoryId" TEXT,
  "sessionId" TEXT,
  "anonymousId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "event_logs_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_logs_userId_fkey'
  ) THEN
    ALTER TABLE "event_logs"
      ADD CONSTRAINT "event_logs_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "users"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_logs_skillId_fkey'
  ) THEN
    ALTER TABLE "event_logs"
      ADD CONSTRAINT "event_logs_skillId_fkey"
      FOREIGN KEY ("skillId") REFERENCES "skills"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_logs_categoryId_fkey'
  ) THEN
    ALTER TABLE "event_logs"
      ADD CONSTRAINT "event_logs_categoryId_fkey"
      FOREIGN KEY ("categoryId") REFERENCES "skill_categories"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END
$$;

-- 5) Indexes
CREATE INDEX IF NOT EXISTS "comments_skillId_like_count_idx"
  ON "comments"("skillId", "like_count");

CREATE INDEX IF NOT EXISTS "comments_skillId_createdAt_idx"
  ON "comments"("skillId", "createdAt");

CREATE INDEX IF NOT EXISTS "comment_images_commentId_sortOrder_idx"
  ON "comment_images"("commentId", "sortOrder");

CREATE UNIQUE INDEX IF NOT EXISTS "comment_likes_commentId_userId_key"
  ON "comment_likes"("commentId", "userId");

CREATE INDEX IF NOT EXISTS "comment_likes_userId_idx"
  ON "comment_likes"("userId");

CREATE INDEX IF NOT EXISTS "event_logs_eventName_createdAt_idx"
  ON "event_logs"("eventName", "createdAt");

CREATE INDEX IF NOT EXISTS "event_logs_userId_createdAt_idx"
  ON "event_logs"("userId", "createdAt");

CREATE INDEX IF NOT EXISTS "event_logs_skillId_createdAt_idx"
  ON "event_logs"("skillId", "createdAt");

CREATE INDEX IF NOT EXISTS "event_logs_categoryId_createdAt_idx"
  ON "event_logs"("categoryId", "createdAt");
