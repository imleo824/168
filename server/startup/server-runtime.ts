import type { Express } from 'express';
import { createServer as createHttpServer } from 'node:http';

import { registerChatGateway } from '../chat/chat.gateway';
import { createChatBotService, ensureChatAutomationReady, startChatMaintenance } from '../chat/chat.bot.service';
import { ensureChatSchemaReady } from '../chat/chat.schema';
import { markChatStorageAvailable } from '../chat/chat.repository';
import type { ChatMessagePayload } from '../chat/chat.types';
import { createDefaultAutomationModules } from '../services/automation/default-automation-modules';
import { startAutomationRuntime } from '../services/automation/automation-runtime';
import type { AutoPostAfterPostCreated } from '../services/auto-post.service';
import type { QuotePublishAfterPostCreated } from '../services/quote-publish.service';
import { startTronDepositScanner, stopTronDepositScanner } from '../services/deposit-scanner.service';
import { ensurePostPublishStorageReady } from '../services/post-category-schema-version.service';
import { registerFrontendAssets } from './frontend-assets';

type PrismaLike = {
  $disconnect: () => Promise<unknown>;
};

export type ServerRuntimeDeps = {
  port: number;
  jwtSecret: string;
  prisma: PrismaLike;
  isDbConfigured: () => boolean;
  seedSuperpowerCategoryPosts: (prisma: PrismaLike, options: { useCompletionMarker: boolean }) => Promise<{
    skipped?: boolean;
    created?: number;
  }>;
  afterAutoPostCreated: AutoPostAfterPostCreated;
  afterQuotePublishPostCreated: QuotePublishAfterPostCreated;
  startPublicFeedWarmup: () => () => void;
  startTuiPlusEntitlementMaintenance?: () => () => void;
  setChatRuntime: (runtime: {
    getOnlineCount: () => number;
    broadcastPostCreatedChatMessage: (message: ChatMessagePayload) => void;
  }) => void;
};

export async function startServerRuntime(app: Express, deps: ServerRuntimeDeps) {
  const isProd = process.env.NODE_ENV === 'production';
  const server = createHttpServer(app);

  await registerFrontendAssets(app, isProd, server);

  if (deps.isDbConfigured()) {
    try {
      await ensurePostPublishStorageReady();
      console.log('[post-publish] Database schema ready.');
    } catch (e) {
      console.warn('[post-publish] Database schema readiness check failed; verify deployed migrations.', e);
    }

  }

  server.listen(deps.port, '0.0.0.0', () => {
    console.log(`Server listening on http://0.0.0.0:${deps.port} [${process.env.NODE_ENV || 'development'}]`);
  });
  server.requestTimeout = 40_000;
  server.headersTimeout = 35_000;
  server.keepAliveTimeout = 8_000;

  const chatGateway = registerChatGateway(server, { jwtSecret: deps.jwtSecret });
  deps.setChatRuntime({
    getOnlineCount: chatGateway.getOnlineCount,
    broadcastPostCreatedChatMessage: chatGateway.broadcastMessage,
  });

  const chatBotService = createChatBotService({
    broadcastMessage: chatGateway.broadcastMessage,
    getOnlineCount: chatGateway.getOnlineCount,
  });
  chatGateway.setBotService(chatBotService);

  const canStartDatabaseWorkers = deps.isDbConfigured();
  const stopChatIdleWarmup = canStartDatabaseWorkers ? chatBotService.startIdleWarmup() : () => {};
  const stopChatMaintenance = canStartDatabaseWorkers ? startChatMaintenance() : () => {};
  const stopAutomationRuntime = canStartDatabaseWorkers
    ? startAutomationRuntime(createDefaultAutomationModules({
      afterAutoPostCreated: deps.afterAutoPostCreated,
      afterQuotePostCreated: deps.afterQuotePublishPostCreated,
    }))
    : () => {};
  const stopPublicFeedWarmup = deps.startPublicFeedWarmup();
  const stopTuiPlusEntitlementMaintenance = deps.startTuiPlusEntitlementMaintenance?.() || (() => {});

  void bootstrapDatabaseRuntime(deps);

  process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    stopTronDepositScanner();
    stopChatIdleWarmup();
    stopChatMaintenance();
    stopAutomationRuntime();
    stopTuiPlusEntitlementMaintenance();
    chatGateway.close();
    stopPublicFeedWarmup();
    server.close(() => {
      console.log('Server closed');
      deps.prisma.$disconnect().catch(() => {});
      process.exit(0);
    });
  });
}

async function bootstrapDatabaseRuntime(deps: ServerRuntimeDeps) {
  if (!deps.isDbConfigured()) {
    console.log('Database not configured, skipping migrations/seeding.');
    return;
  }

  startTronDepositScanner();

  try {
    const chatSchemaReady = await ensureChatSchemaReady();
    if (chatSchemaReady) {
      markChatStorageAvailable();
      console.log('[chat] Database schema ready.');
    } else {
      console.warn('[chat] Database schema is not ready; chat will retry when used.');
    }
  } catch (e) {
    console.warn('Chat schema readiness check failed (non-critical):', e);
  }

  try {
    await ensureChatAutomationReady();
  } catch (e) {
    console.warn('Chat automation bootstrap failed (non-critical):', e);
  }

  try {
    const seedResult = await deps.seedSuperpowerCategoryPosts(deps.prisma, { useCompletionMarker: true });
    if (seedResult.skipped) {
      console.log('SuperPower category seed already completed.');
    } else {
      console.log(`SuperPower category seed completed (${seedResult.created} posts).`);
    }
  } catch (e) {
    console.warn('SuperPower category seed failed (non-critical):', e);
  }

}
