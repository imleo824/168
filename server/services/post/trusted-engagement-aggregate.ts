import { Prisma } from '@prisma/client';

import prisma from '../../db';
import { POST_UUID_PATTERN } from './post-identifiers';

type TrustedAggregateMetric = 'Like' | 'Share' | 'Comment' | 'Quote';
type TrustedAggregateClient = Pick<typeof prisma, '$executeRaw'>;

function isValidPostId(postId: string) {
  return POST_UUID_PATTERN.test(String(postId || ''));
}

function normalMetricColumn(metric: TrustedAggregateMetric) {
  return `normal${metric}Count`;
}

function verifiedMetricColumn(metric: TrustedAggregateMetric) {
  if (metric === 'Like') return 'verifiedLikeCount';
  if (metric === 'Share') return 'verifiedShareCount';
  return '';
}

async function applyTrustedAggregateDelta(
  postId: string,
  metric: TrustedAggregateMetric,
  delta: 1 | -1,
  client: TrustedAggregateClient = prisma,
) {
  if (!isValidPostId(postId)) return false;
  const normalColumn = normalMetricColumn(metric);
  const verifiedColumn = verifiedMetricColumn(metric);
  const now = new Date();

  if (delta > 0 && verifiedColumn) {
    await client.$executeRaw(Prisma.sql`
      INSERT INTO "PostEngagementAggregate" (
        "postId",
        ${Prisma.raw(`"${verifiedColumn}"`)},
        ${Prisma.raw(`"${normalColumn}"`)},
        "updatedAt"
      )
      VALUES (${postId}, 1, 1, ${now})
      ON CONFLICT ("postId") DO UPDATE SET
        ${Prisma.raw(`"${verifiedColumn}"`)} = "PostEngagementAggregate".${Prisma.raw(`"${verifiedColumn}"`)} + 1,
        ${Prisma.raw(`"${normalColumn}"`)} = "PostEngagementAggregate".${Prisma.raw(`"${normalColumn}"`)} + 1,
        "updatedAt" = EXCLUDED."updatedAt"
    `);
    return true;
  }

  if (delta > 0) {
    await client.$executeRaw(Prisma.sql`
      INSERT INTO "PostEngagementAggregate" (
        "postId",
        ${Prisma.raw(`"${normalColumn}"`)},
        "updatedAt"
      )
      VALUES (${postId}, 1, ${now})
      ON CONFLICT ("postId") DO UPDATE SET
        ${Prisma.raw(`"${normalColumn}"`)} = "PostEngagementAggregate".${Prisma.raw(`"${normalColumn}"`)} + 1,
        "updatedAt" = EXCLUDED."updatedAt"
    `);
    return true;
  }

  if (verifiedColumn) {
    await client.$executeRaw(Prisma.sql`
      UPDATE "PostEngagementAggregate"
      SET
        ${Prisma.raw(`"${verifiedColumn}"`)} = GREATEST(${Prisma.raw(`"${verifiedColumn}"`)} - 1, 0),
        ${Prisma.raw(`"${normalColumn}"`)} = GREATEST(${Prisma.raw(`"${normalColumn}"`)} - 1, 0),
        "updatedAt" = ${now}
      WHERE "postId" = ${postId}
    `);
    return true;
  }

  await client.$executeRaw(Prisma.sql`
    UPDATE "PostEngagementAggregate"
    SET
      ${Prisma.raw(`"${normalColumn}"`)} = GREATEST(${Prisma.raw(`"${normalColumn}"`)} - 1, 0),
      "updatedAt" = ${now}
    WHERE "postId" = ${postId}
  `);
  return true;
}

export function incrementNormalLikeAggregate(postId: string, client?: TrustedAggregateClient) {
  return applyTrustedAggregateDelta(postId, 'Like', 1, client);
}

export function decrementNormalLikeAggregate(postId: string, client?: TrustedAggregateClient) {
  return applyTrustedAggregateDelta(postId, 'Like', -1, client);
}

export function incrementNormalShareAggregate(postId: string, client?: TrustedAggregateClient) {
  return applyTrustedAggregateDelta(postId, 'Share', 1, client);
}

export function decrementNormalShareAggregate(postId: string, client?: TrustedAggregateClient) {
  return applyTrustedAggregateDelta(postId, 'Share', -1, client);
}

export function incrementNormalCommentAggregate(postId: string, client?: TrustedAggregateClient) {
  return applyTrustedAggregateDelta(postId, 'Comment', 1, client);
}

export function decrementNormalCommentAggregate(postId: string, client?: TrustedAggregateClient) {
  return applyTrustedAggregateDelta(postId, 'Comment', -1, client);
}

export function incrementNormalQuoteAggregate(postId: string, client?: TrustedAggregateClient) {
  return applyTrustedAggregateDelta(postId, 'Quote', 1, client);
}

export function decrementNormalQuoteAggregate(postId: string, client?: TrustedAggregateClient) {
  return applyTrustedAggregateDelta(postId, 'Quote', -1, client);
}
