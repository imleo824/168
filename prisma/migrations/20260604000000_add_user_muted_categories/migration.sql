CREATE TABLE "UserMutedCategory" (
  "userId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserMutedCategory_pkey" PRIMARY KEY ("userId", "categoryId")
);

ALTER TABLE "UserMutedCategory"
  ADD CONSTRAINT "UserMutedCategory_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserMutedCategory"
  ADD CONSTRAINT "UserMutedCategory_categoryId_fkey"
  FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "idx_user_muted_category_category_created"
  ON "UserMutedCategory"("categoryId", "createdAt");
