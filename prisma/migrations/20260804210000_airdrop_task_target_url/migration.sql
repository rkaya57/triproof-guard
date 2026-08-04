ALTER TABLE "AirdropTask" ADD COLUMN IF NOT EXISTS "targetUrl" TEXT;

UPDATE "AirdropTask"
SET "targetUrl" = 'https://x.com/TriProof_'
WHERE "slug" IN ('x-follow-triproof', 'x-quote-triproof-post')
  AND "targetUrl" IS NULL;

UPDATE "AirdropTask"
SET "targetUrl" = 'https://t.me/+MuFX4GKruRU1YTRk'
WHERE "slug" = 'join-triproof-telegram'
  AND "targetUrl" IS NULL;
