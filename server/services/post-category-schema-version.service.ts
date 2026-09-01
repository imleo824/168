import prisma, { isDbConfigured } from '../db';

let ensurePostPublishStorageReadyPromise: Promise<void> | null = null;

export async function ensurePostPublishStorageReady() {
  if (!isDbConfigured()) return;
  if (ensurePostPublishStorageReadyPromise) return ensurePostPublishStorageReadyPromise;

  // Schema changes are deployed by Prisma before the process starts. Runtime
  // requests only verify the contract so publishing never performs DDL.
  ensurePostPublishStorageReadyPromise = prisma.$queryRawUnsafe(
    'SELECT "categoryMetaSchemaVersion", "clientNonce" FROM "Post" LIMIT 0',
  ).then((): undefined => undefined).catch((error): never => {
    ensurePostPublishStorageReadyPromise = null;
    throw error;
  });

  return ensurePostPublishStorageReadyPromise;
}

export async function ensurePostCategorySchemaVersionColumn() {
  return ensurePostPublishStorageReady();
}
