ALTER TABLE "Post" ADD COLUMN "showContact" BOOLEAN NOT NULL DEFAULT true;

UPDATE "Post"
SET "showContact" = false
WHERE COALESCE("contact", '') = '';
