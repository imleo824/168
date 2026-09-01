CREATE TABLE "UserJoinedTopic" (
    "userId" TEXT NOT NULL,
    "topicId" TEXT NOT NULL,
    "topicName" TEXT NOT NULL,
    "topicType" TEXT NOT NULL DEFAULT 'topic',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserJoinedTopic_pkey" PRIMARY KEY ("userId", "topicId")
);

ALTER TABLE "UserJoinedTopic"
    ADD CONSTRAINT "UserJoinedTopic_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "idx_user_joined_topic_user_created_desc"
    ON "UserJoinedTopic"("userId", "createdAt" DESC, "topicId" DESC);

CREATE INDEX "idx_user_joined_topic_topic_created_desc"
    ON "UserJoinedTopic"("topicId", "createdAt" DESC, "userId" DESC);
