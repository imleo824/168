# Architecture Debt Report

Generated at: 2026-08-31T13:38:29.481Z

This report is generated from the project architecture audit scripts. It is intended to guide refactors and ratchet architecture baselines downward over time.

## Summary

| Audit | Status | Duration | Command |
|---|---:|---:|---|
| API Contract Audit | PASS | 306ms | `node scripts/api-contract-audit.mjs` |
| Code Quality Audit | PASS | 439ms | `node scripts/code-quality-audit.mjs` |
| Dead Code Audit | PASS | 337ms | `node scripts/dead-code-audit.mjs` |
| Cache Policy Audit | PASS | 75ms | `node scripts/cache-policy-audit.mjs` |
| Observability Audit | PASS | 74ms | `node scripts/observability-audit.mjs` |
| Database Schema Audit | PASS | 4534ms | `node scripts/db-schema-audit.mjs` |
| Bootstrap Boundary Guard | PASS | 79ms | `node scripts/bootstrap-boundary-guard.mjs` |
| Route Boundary Guard | PASS | 116ms | `node scripts/route-boundary-guard.mjs` |
| Frontend API Boundary Guard | PASS | 210ms | `node scripts/frontend-api-boundary-guard.mjs` |

## Details

### API Contract Audit
Status: **PASS**
#### stdout

```txt

=== API Contract Audit ===
Frontend API literals: 108
Server API route literals: 182

Potential frontend API endpoints without an exact server shape:
  - ANY    /api/notifications/feed-counts${suffix                 src/services/api.ts:228, src/services/homeStartupApi.ts:70
  - ANY    /api/notifications/home-summary${suffix                src/services/api.ts:232, src/services/homeStartupApi.ts:75
  - ANY    /api/posts/:param/likes${suffix                        src/services/api.ts:261
  - ANY    /api/promotions/chat-ads                               src/services/api.ts:313, src/services/apiCore.ts:42
  - ANY    /api/me/promotion-effects${suffix                      src/services/api.ts:323

Write routes that deserve manual auth review:
  - POST   /api/internal/deposit-sweep-transactions/:param/complete server/routes/admin-deposit.routes.ts:112
  - POST   /api/rum/web-vitals                                    server/routes/rum.routes.ts:11

Reserved API prefix violations:
  - requires=adminOnly USE    /api/admin                                             server/routes/admin-middleware.routes.ts:6

Server route inventory:
  USE    /api/admin                                             server/routes/admin-middleware.routes.ts:6
  GET    /api/admin/auto-crawl/config                           server/routes/auto-crawl.routes.ts:153
  PATCH  /api/admin/auto-crawl/config                           server/routes/auto-crawl.routes.ts:163
  GET    /api/admin/auto-crawl/execution-logs                   server/routes/auto-crawl.routes.ts:213
  GET    /api/admin/auto-crawl/execution-logs/:param            server/routes/auto-crawl.routes.ts:223
  GET    /api/admin/auto-crawl/execution-logs/details           server/routes/auto-crawl.routes.ts:218
  GET    /api/admin/auto-crawl/items                            server/routes/auto-crawl.routes.ts:235
  POST   /api/admin/auto-crawl/reprocess                        server/routes/auto-crawl.routes.ts:203
  POST   /api/admin/auto-crawl/run-now                          server/routes/auto-crawl.routes.ts:195
  GET    /api/admin/auto-crawl/runs                             server/routes/auto-crawl.routes.ts:230
  POST   /api/admin/auto-crawl/sources                          server/routes/auto-crawl.routes.ts:172
  DELETE /api/admin/auto-crawl/sources/:param                   server/routes/auto-crawl.routes.ts:190
  PATCH  /api/admin/auto-crawl/sources/:param                   server/routes/auto-crawl.routes.ts:181
  GET    /api/admin/auto-crawl/status                           server/routes/auto-crawl.routes.ts:158
  GET    /api/admin/auto-like/config                            server/routes/admin-auto-like.routes.ts:29
  PATCH  /api/admin/auto-like/config                            server/routes/admin-auto-like.routes.ts:53
  POST   /api/admin/auto-like/run-now                           server/routes/admin-auto-like.routes.ts:58
  GET    /api/admin/auto-like/runs                              server/routes/admin-auto-like.routes.ts:39
  GET    /api/admin/auto-like/stats                             server/routes/admin-auto-like.routes.ts:34
  GET    /api/admin/auto-post/config                            server/routes/auto-post.routes.ts:43
  PATCH  /api/admin/auto-post/config                            server/routes/auto-post.routes.ts:53
  GET    /api/admin/auto-post/contents                          server/routes/auto-post.routes.ts:91
  PATCH  /api/admin/auto-post/contents/:param                   server/routes/auto-post.routes.ts:117
  POST   /api/admin/auto-post/contents/import                   server/routes/auto-post.routes.ts:108
  POST   /api/admin/auto-post/run-now                           server/routes/auto-post.routes.ts:65
  GET    /api/admin/auto-post/runs                              server/routes/auto-post.routes.ts:76
  GET    /api/admin/auto-post/stats                             server/routes/auto-post.routes.ts:48
  GET    /api/admin/automation/batches/:param                   server/routes/admin-automation.routes.ts:63
  GET    /api/admin/automation/heartbeats                       server/routes/admin-automation.routes.ts:72
  POST   /api/admin/automation/locks/:param/release             server/routes/admin-automation.routes.ts:80
  POST   /api/admin/automation/run-all                          server/routes/admin-automation.routes.ts:49
  GET    /api/admin/automation/status                           server/routes/admin-automation.routes.ts:44
  GET    /api/admin/chat/automation-status                      server/chat/chat.admin.routes.ts:122
  GET    /api/admin/chat/bots                                   server/chat/chat.admin.routes.ts:80
  POST   /api/admin/chat/bots                                   server/chat/chat.admin.routes.ts:84
  PATCH  /api/admin/chat/bots/:param                            server/chat/chat.admin.routes.ts:99
  GET    /api/admin/chat/config                                 server/chat/chat.admin.routes.ts:111
  PATCH  /api/admin/chat/config                                 server/chat/chat.admin.routes.ts:116
  PATCH  /api/admin/chat/messages/:param                        server/chat/chat.admin.routes.ts:56
  POST   /api/admin/chat/mutes                                  server/chat/chat.admin.routes.ts:63
  GET    /api/admin/chat/runs                                   server/chat/chat.admin.routes.ts:49
  GET    /api/admin/comment-publish/config                      server/routes/admin-comment-publish.routes.ts:30
  PATCH  /api/admin/comment-publish/config                      server/routes/admin-comment-publish.routes.ts:66
  POST   /api/admin/comment-publish/run-now                     server/routes/admin-comment-publish.routes.ts:72
  GET    /api/admin/comment-publish/runs                        server/routes/admin-comment-publish.routes.ts:52
  GET    /api/admin/comment-publish/stats                       server/routes/admin-comment-publish.routes.ts:40
  GET    /api/admin/comment-publish/status                      server/routes/admin-comment-publish.routes.ts:35
  GET    /api/admin/config                                      server/routes/config.routes.ts:268
  PATCH  /api/admin/config                                      server/routes/admin-config.routes.ts:37
  GET    /api/admin/deposit-addresses                           server/routes/admin-deposit.routes.ts:53
  POST   /api/admin/deposit-addresses                           server/routes/admin-deposit.routes.ts:134
  PATCH  /api/admin/deposit-addresses/:param                    server/routes/admin-deposit.routes.ts:162
  GET    /api/admin/deposit-addresses/stats                     server/routes/admin-deposit.routes.ts:70
  POST   /api/admin/deposit-sweep-jobs                          server/routes/admin-deposit.routes.ts:92
  GET    /api/admin/ops-report                                  server/routes/admin-report.routes.ts:300
  GET    /api/admin/orders                                      server/routes/admin-billing.routes.ts:143
  POST   /api/admin/orders/:param/credit                        server/routes/admin-billing.routes.ts:227
  GET    /api/admin/platform-ai/config                          server/routes/platform-ai.routes.ts:17
  PATCH  /api/admin/platform-ai/config                          server/routes/platform-ai.routes.ts:22
  GET    /api/admin/posts                                       server/routes/admin-post.routes.ts:37
  PATCH  /api/admin/posts/:param                                server/routes/admin-post.routes.ts:165
  DELETE /api/admin/posts/:param/permanent                      server/routes/admin-post.routes.ts:141
  PATCH  /api/admin/posts/:param/publish                        server/routes/admin-post.routes.ts:96
  GET    /api/admin/promotions                                  server/routes/admin-promotion.routes.ts:126
  DELETE /api/admin/promotions/:param                           server/routes/admin-promotion.routes.ts:308
  PATCH  /api/admin/promotions/:param                           server/routes/admin-promotion.routes.ts:245
  PATCH  /api/admin/promotions/:param/display-state             server/routes/admin-promotion.routes.ts:281
  POST   /api/admin/push/system                                 server/routes/push.routes.ts:108
  GET    /api/admin/quote-publish/config                        server/routes/quote-publish.routes.ts:46
  PATCH  /api/admin/quote-publish/config                        server/routes/quote-publish.routes.ts:75
  POST   /api/admin/quote-publish/run-now                       server/routes/quote-publish.routes.ts:81
  GET    /api/admin/quote-publish/runs                          server/routes/quote-publish.routes.ts:61
  GET    /api/admin/quote-publish/stats                         server/routes/quote-publish.routes.ts:56
  GET    /api/admin/quote-publish/status                        server/routes/quote-publish.routes.ts:51
  GET    /api/admin/recommendation-report                       server/routes/admin-report.routes.ts:120
  GET    /api/admin/referral-withdrawals                        server/routes/referral.routes.ts:99
  PATCH  /api/admin/referral-withdrawals/:param                 server/routes/referral.routes.ts:113
  GET    /api/admin/transactions                                server/routes/admin-billing.routes.ts:36
  GET    /api/admin/users                                       server/routes/admin-user.routes.ts:64
  PATCH  /api/admin/users/:param/disabled                       server/routes/admin-user.routes.ts:141
  POST   /api/admin/users/:param/points                         server/routes/admin-user.routes.ts:186
  POST   /api/auth/logout                                       server/routes/account-auth.routes.ts:112
  POST   /api/auth/password                                     server/routes/account-auth.routes.ts:28
  POST   /api/auth/register                                     server/routes/account-auth.routes.ts:58
  GET    /api/categories                                        server/routes/config.routes.ts:248
  GET    /api/chat/bootstrap                                    server/chat/chat.routes.ts:12
  GET    /api/chat/messages                                     server/chat/chat.routes.ts:31
  GET    /api/config                                            server/routes/config.routes.ts:236
  GET    /api/health                                            server/routes/health.routes.ts:107
  GET    /api/home/bootstrap                                    server/routes/config.routes.ts:254
  GET    /api/home/feed                                         server/routes/feed.routes.ts:284
  GET    /api/home/first-screen                                 server/routes/feed.routes.ts:148
  GET    /api/internal/deposit-sweep-jobs/next                  server/routes/admin-deposit.routes.ts:105
  POST   /api/internal/deposit-sweep-transactions/:param/complete server/routes/admin-deposit.routes.ts:112
  POST   /api/internal/deposit-sweep-transactions/:param/fail   server/routes/admin-deposit.routes.ts:125
  GET    /api/me                                                server/routes/account-profile.routes.ts:28
  PUT    /api/me/bio                                            server/routes/account-settings.routes.ts:123
  GET    /api/me/comments                                       server/routes/account-engagement.routes.ts:57
  GET    /api/me/fans                                           server/routes/user-social.routes.ts:92
  GET    /api/me/feed-muted-categories                          server/routes/account-settings.routes.ts:38
  PATCH  /api/me/feed-muted-categories                          server/routes/account-settings.routes.ts:44
  GET    /api/me/following                                      server/routes/user-social.routes.ts:24
  GET    /api/me/joined-topics                                  server/routes/joined-topic.routes.ts:71
  GET    /api/me/likes                                          server/routes/account-engagement.routes.ts:31
  PUT    /api/me/login-account                                  server/routes/account-settings.routes.ts:53
  GET    /api/me/notifications                                  server/routes/notifications.routes.ts:31
  POST   /api/me/notifications/:param/read                      server/routes/notifications.routes.ts:126
  POST   /api/me/notifications/read-all                         server/routes/notifications.routes.ts:114
  GET    /api/me/notifications/unread-count                     server/routes/notifications.routes.ts:104
  GET    /api/me/orders                                         server/routes/billing.routes.ts:264
  POST   /api/me/orders                                         server/routes/billing.routes.ts:74
  POST   /api/me/orders/:param/scan                             server/routes/billing.routes.ts:207
  PUT    /api/me/password                                       server/routes/account-settings.routes.ts:74
  PUT    /api/me/payment-password                               server/routes/account-settings.routes.ts:97
  PATCH  /api/me/profile                                        server/routes/account-settings.routes.ts:138
  GET    /api/me/promotion-effects                              server/routes/promotion.routes.ts:58
  GET    /api/me/promotions                                     server/routes/promotion.routes.ts:52
  GET    /api/me/transactions                                   server/routes/billing.routes.ts:43
  GET    /api/notification-preferences                          server/routes/notification-preference.routes.ts:32
  PATCH  /api/notification-preferences                          server/routes/notification-preference.routes.ts:38
  GET    /api/notifications/feed-counts                         server/routes/account-engagement.routes.ts:75
  GET    /api/notifications/home-summary                        server/routes/account-engagement.routes.ts:83
  GET    /api/posts                                             server/routes/post.routes.ts:54
  POST   /api/posts                                             server/routes/post-create.routes.ts:104
  DELETE /api/posts/:param                                      server/routes/post-actions.routes.ts:234
  GET    /api/posts/:param                                      server/routes/post-read.routes.ts:161
  GET    /api/posts/:param/comments                             server/routes/post-comments.routes.ts:85
  POST   /api/posts/:param/comments                             server/routes/post-comments.routes.ts:138
  DELETE /api/posts/:param/comments/:param                      server/routes/post-comments.routes.ts:199
  POST   /api/posts/:param/like                                 server/routes/post-actions.routes.ts:39
  GET    /api/posts/:param/likes                                server/routes/post-read.routes.ts:95
  PATCH  /api/posts/:param/publish                              server/routes/post-actions.routes.ts:195
  GET    /api/posts/:param/quotes                               server/routes/post-read.routes.ts:57
  POST   /api/posts/:param/recommendation-feedback              server/routes/post-actions.routes.ts:134
  POST   /api/posts/:param/share                                server/routes/post-actions.routes.ts:153
  POST   /api/posts/:param/telegram-sync                        server/routes/post-telegram-sync.routes.ts:34
  GET    /api/posts/contact-eligibility                         server/routes/post-create.routes.ts:90
  GET    /api/posts/following                                   server/routes/post-read.routes.ts:46
  POST   /api/posts/views                                       server/routes/post-read.routes.ts:200
  POST   /api/promotion/book-batch                              server/routes/promotion.routes.ts:72

Summary: {
  "frontendApiCount": 108,
  "serverRouteCount": 182,
  "potentialFrontendGaps": 5,
  "duplicateServerRoutes": 0,
  "deprecatedEndpointUsages": 0,
  "writeRoutesNeedingManualAuthReview": 2,
  "reservedPrefixViolations": 1
}
```

### Code Quality Audit
Status: **PASS**
#### stdout

```txt

=== Code Quality Audit ===
Files scanned: 775
Findings: errors=0 warnings=7 info=0

Findings by rule:
  [warn] large-source-file: 7 — Large source file that should be split or justified: 1102 lines > 900
    server/bootstrap.ts:1
    server/promotion.service.ts:1
    server/routes/seo-fallback.routes.ts:1
    server/services/auto-crawl.service.ts:1
    server/services/post/index.ts:1
    src/features/admin/AdminPage.tsx:1
    src/features/post-create/PostCreatePage.tsx:1

Review target: resolve error-level findings immediately, triage warning-level findings, and keep informational markers from becoming stale.
```

### Dead Code Audit
Status: **PASS**
#### stdout

```txt

=== Dead Code Audit ===
Files scanned: 477
Potential orphan files: 8
Duplicate basenames: 4
Potential unused named exports: 567

Potential orphan files requiring manual verification:
  - server/chat/chat.admin.routes.ts
  - server/chat/chat.bot.service.ts
  - server/chat/chat.gateway.ts
  - server/chat/chat.routes.ts
  - src/features/post-create/postCreateSheets.tsx
  - src/hooks/useData.ts
  - src/services/adminApi.ts
  - src/utils/postCreateFocusBridge.ts

Duplicate basenames that can confuse imports and ownership:
  - index: server/modules/feed/index.ts, server/modules/post/index.ts, server/services/post/index.ts
  - accountCredentials: shared/accountCredentials.ts, src/utils/accountCredentials.ts
  - referral: shared/referral.ts, src/services/referral.ts
  - tuiPlusBenefits: shared/tuiPlusBenefits.mjs, src/features/tui-plus/tuiPlusBenefits.ts

Potential unused named exports requiring manual verification:
  - server/chat/chat.admin.routes.ts: registerChatAdminRoutes
  - server/chat/chat.bot.service.ts: createChatBotService
  - server/chat/chat.bot.service.ts: ensureChatAutomationReady
  - server/chat/chat.bot.service.ts: startChatMaintenance
  - server/chat/chat.gateway.ts: registerChatGateway
  - server/chat/chat.repository.ts: markChatStorageAvailable
  - server/chat/chat.routes.ts: registerChatRoutes
  - server/chat/chat.types.ts: ChatMessageAuthorType
  - server/chat/chat.types.ts: ChatMessageStatus
  - server/chat/chat.types.ts: ChatBotInvocationStatus
  - server/chat/chat.types.ts: ChatBotTrigger
  - server/chat/chat.types.ts: ChatPostCreatedMetadata
  - server/chat/chat.types.ts: ChatQuotedPostPreview
  - server/chat/chat.types.ts: ChatReplyMetadata
  - server/chat/chat.types.ts: ChatReplyCreatedMetadata
  - server/chat/chat.types.ts: ChatBotProfilePayload
  - server/chat/chat.types.ts: ChatEligibilityReason
  - server/config.service.ts: parseLocationPresetsForSave
  - server/config.service.ts: parseFeedRankProfileForSave
  - server/http/pagination.ts: CursorPaginationOptions
  - server/http/pagination.ts: CursorPaginationResult
  - server/http/pagination.ts: CursorPaginationHeaders
  - server/http/pagination.ts: StrictPaginationParseError
  - server/http/pagination.ts: StrictPaginationParams
  - server/http/pagination.ts: StrictPaginationParserOptions
  - server/http/pagination.ts: StrictPaginationRequestOptions
  - server/joined-topic.service.ts: JoinedTopicType
  - server/modules/feed/feed-hydrator.service.ts: FeedHydratorService
  - server/modules/feed/feed-hydrator.service.ts: FeedHydratorPinMeta
  - server/modules/feed/feed-hydrator.service.ts: FeedHydratablePostRow
  - server/modules/feed/feed-hydrator.service.ts: FeedHydratorDeps
  - server/modules/feed/feed-hydrator.service.ts: FeedHydratePostsParams
  - server/modules/feed/feed-observability.ts: recordFeedPerformance
  - server/modules/feed/feed-promotion-mixer.ts: getFeedPromotedPostIds
  - server/modules/feed/feed-promotion-mixer.ts: sortFeedPinnedRows
  - server/modules/feed/feed-promotion-mixer.ts: splitFeedPinnedAndRegularRows
  - server/modules/feed/feed-promotion-mixer.ts: mixFeedPinnedRows
  - server/modules/feed/feed-promotion-mixer.ts: buildFeedRegularWhereExclusion
  - server/modules/feed/feed-promotion-mixer.ts: FeedPromotionPinMeta
  - server/modules/feed/feed-promotion-mixer.ts: FeedPromotableRow
  - server/modules/feed/feed-promotion-mixer.ts: FeedPromotionMixResult
  - server/modules/feed/feed-query.service.ts: FeedQueryService
  - server/modules/feed/feed-query.service.ts: FeedQueryServiceDeps
  - server/modules/feed/feed-query.service.ts: HomeFeedQueryKind
  - server/modules/feed/feed-query.service.ts: HomeFeedQueryContext
  - server/modules/feed/feed-query.service.ts: HomeFeedQueryHandlers
  - server/modules/feed/feed-ranking.service.ts: getFeedRecommendationScore
  - server/modules/feed/feed-ranking.service.ts: getFeedAuthorDisplayPriority
  - server/modules/feed/feed-ranking.service.ts: applyFeedPromotedPostBoost
  - server/modules/feed/feed-ranking.service.ts: sortFeedHumanRankedRows
  - server/modules/feed/feed-ranking.service.ts: diversifyFeedRecommendedRows
  - server/modules/feed/feed-ranking.service.ts: DEFAULT_HUMAN_AUTHOR_DISPLAY_BOOST
  - server/modules/feed/feed-ranking.service.ts: FeedRankingAuthor
  - server/modules/feed/feed-ranking.service.ts: FeedRankingScore
  - server/modules/feed/feed-ranking.service.ts: FeedRankingRow
  - server/modules/feed/feed-ranking.service.ts: FeedRankingOptions
  - server/modules/post/post-contracts.ts: PublicPostDetailQuery
  - server/modules/post/post-contracts.ts: PublicPostDetailResult
  - server/modules/post/post-contracts.ts: PublicPostDetailCacheContext
  - server/modules/post/post-observability.ts: getSlowPostRouteThresholdMs
  - server/modules/post/post-observability.ts: recordPostRoutePerformance
  - server/platform-time.ts: PLATFORM_TIMEZONE_OFFSET_HOURS
  - server/platform-time.ts: PLATFORM_TIMEZONE_OFFSET_MS
  - server/platform-time.ts: PLATFORM_SQL_UTC_TIMEZONE
  - server/promotion-utils.ts: SlotOwnership
  - server/promotion-utils.ts: BookingCandidate
  - server/promotion-utils.ts: ActiveHomeAdsCache
  - server/promotion-utils.ts: ActivePromotedPostIdOptions
  - server/promotion-utils.ts: PromotionEffectDailyItem
  - server/public-feed-cache.ts: PublicFeedCacheKind
  - server/public-post-detail-cache.ts: PublicPostDetailCachedPayload
  - server/repositories/feed.repository.ts: FeedRepositoryDb
  - server/repositories/feed.repository.ts: FeedPostPageQuery
  - server/repositories/feed.repository.ts: FeedHumanRankedCandidateQuery
  - server/repositories/feed.repository.ts: FeedActivePinBookingQuery
  - server/repositories/feed.repository.ts: FeedPostsByIdsQuery
  - server/routes/feed.routes.ts: normalizeHomeFeedKind
  - server/routes/feed.routes.ts: normalizeHomeFeedCategorySlug
  - server/routes/feed.routes.ts: feedRouteModule
  - server/routes/feed.routes.ts: FeedRoutesDeps
  - server/routes/post-actions.routes.ts: PostActionsRoutesDeps
  - server/routes/post-read.routes.ts: PostReadRoutesDeps
  - server/routes/post-telegram-sync.routes.ts: TelegramSyncStatuses
  - server/routes/post-telegram-sync.routes.ts: PostTelegramSyncRoutesDeps
  - server/routes/post.routes.ts: postRouteModule
  - server/routes/post.routes.ts: PostRoutesDeps
  - server/routes/promotion.routes.ts: PromotionRoutesDeps
  - server/routes/route-module.ts: RouteModuleDeps
  - server/routes/upload.routes.ts: hasValidImageSignature
  - server/routes/upload.routes.ts: buildUploadStoragePath
  - server/routes/upload.routes.ts: writeLocalUploadFromBuffer
  - server/routes/upload.routes.ts: isSupabaseBucketMissingError
  - server/routes/upload.routes.ts: ensureUploadBucket
  - server/routes/upload.routes.ts: supabase
  - server/routes/upload.routes.ts: UPLOAD_BUCKET
  - server/routes/user-social.routes.ts: UserSocialRoutesDeps
  - server/services/auto-crawl-database-config.service.ts: AutoCrawlDatabaseCategory
  - server/services/auto-crawl-database-config.service.ts: AutoCrawlDatabaseConfig
  - server/services/auto-crawl-execution-log.service.ts: AutoCrawlExecutionLogLevel
  - server/services/auto-crawl-execution-log.service.ts: AutoCrawlExecutionLogScope
  - server/services/auto-crawl-execution-log.service.ts: AutoCrawlExecutionLogEvent
  - server/services/auto-crawl-execution-log.service.ts: AutoCrawlExecutionLogSummary
  - server/services/auto-crawl-fetch-parse.service.ts: parseTelegram
  - server/services/auto-crawl-fetch-parse.service.ts: selectAutoCrawlCandidates
  - server/services/auto-crawl-fetch-parse.service.ts: FetchAutoCrawlItemsResult
  - server/services/auto-crawl-media.service.ts: AutoCrawlMediaAudit
  - server/services/auto-crawl-normalize.ts: normalizeAutoCrawlSourceValue
  - server/services/auto-crawl-normalize.ts: normalizeType
  - server/services/auto-crawl-normalize.ts: normalizeCursor
  - server/services/auto-crawl-runtime-status.service.ts: AutoCrawlRuntimeStatus
  - server/services/auto-like.service.ts: DEFAULT_AUTO_LIKE_CONFIG
  - server/services/auto-like.service.ts: AutoLikeTrigger
  - server/services/auto-like.service.ts: AutoLikeRunStatus
  - server/services/auto-like.service.ts: AutoLikeRunResult
  - server/services/auto-like.service.ts: AutoLikeStats
  - server/services/auto-like.service.ts: AutoLikeConfig
  - server/services/auto-post.config.ts: AutoPostConfig
  - server/services/auto-post.config.ts: AutoPostTopicConfig
  - server/services/auto-post.service.ts: buildAutoPostContentHash
  - server/services/auto-post.service.ts: cleanupExpiredAutoPostRuns
  ... 447 more

Review target: verify candidates before deletion. This audit is intentionally advisory because dynamic imports, route registration, and generated references can produce false positives.
```

### Cache Policy Audit
Status: **PASS**
#### stdout

```txt

=== Cache Policy Audit ===
Route expectations checked: 7
Findings: 0

No cache policy drift detected.
```

### Observability Audit
Status: **PASS**
#### stdout

```txt

=== Observability Audit ===
Expectations checked: 3
Findings: 0

No request tracing drift detected.
```

### Database Schema Audit
Status: **PASS**
#### stdout

```txt

=== Database Schema Audit ===
Models: 41
Enums: 15
Source files scanned: 571

No critical API SLO index gaps detected.

Model usage inventory:
  Post                         refs= 365 delegate= 56 files=scripts/security-guards.mjs(21), server/routes/admin-report.routes.ts(19), server/services/comment-publish-v8.service.ts(16), +64
  User                         refs= 305 delegate= 35 files=server/routes/admin-report.routes.ts(52), server/routes/health.routes.ts(21), server/services/tui-plus.service.ts(16), +59
  Category                     refs=  85 delegate= 23 files=src/features/home/HomeTopicTabs.tsx(10), server/services/auto-crawl.service.ts(6), src/hooks/useHomeCategoryState.ts(5), +37
  AutoCrawlItem                refs=  79 delegate=  0 files=server/services/auto-crawl.service.ts(41), server/services/auto-crawl-fetch-parse.service.ts(11), server/services/auto-crawl-recovery.service.ts(8), +7
  AutoCrawlSource              refs=  71 delegate=  0 files=server/services/auto-crawl.service.ts(28), server/services/tui-plus-channel.service.ts(8), server/services/tui-plus-entitlements.service.ts(8), +6
  PostComment                  refs=  60 delegate=  1 files=server/routes/post-comments.routes.ts(12), server/services/comment-publish-v8.service.ts(12), server/services/quote-publish-v5.service.ts(10), +11
  Like                         refs=  43 delegate=  8 files=server/services/post/trusted-engagement-aggregate.ts(8), server/services/auto-like.service.ts(6), scripts/security-guards.mjs(6), +12
  PostEngagementAggregate      refs=  36 delegate=  1 files=server/services/post/post-engagement.ts(14), server/services/post/trusted-engagement-aggregate.ts(14), server/services/post/post-ranking-maintenance.ts(2), +4
  AutoCrawlConfig              refs=  34 delegate=  0 files=server/services/auto-crawl.service.ts(20), server/routes/auto-crawl.routes.ts(4), src/features/admin/AdminAutoCrawlPanel.tsx(3), +4
  AutoCrawlRun                 refs=  34 delegate=  0 files=server/services/auto-crawl.service.ts(10), server/services/auto-crawl-runtime-status.service.ts(8), server/services/auto-crawl-execution-log.service.ts(4), +5
  PromotionBooking             refs=  32 delegate=  1 files=src/features/promote/promotionDisplayUtils.ts(7), scripts/security-guards.mjs(5), src/services/api.ts(4), +8
  PostRankingScore             refs=  29 delegate=  9 files=scripts/main-chain-schema-guards.mjs(6), scripts/feed-performance-guards.mjs(4), scripts/feed-module-guards.mjs(3), +10
  Order                        refs=  27 delegate= 19 files=server/services/deposit-scanner.service.ts(7), server/services/admin-deposit.service.ts(6), server/routes/billing.routes.ts(4), +5
  SystemConfig                 refs=  27 delegate=  7 files=scripts/deploy-main-schema.mjs(8), server/config.service.ts(2), server/routes/health.routes.ts(2), +11
  ChatMessage                  refs=  25 delegate=  0 files=scripts/deploy-main-schema.mjs(7), src/services/api.ts(5), server/routes/admin-report.routes.ts(4), +5
  AutomationTaskLock           refs=  25 delegate=  0 files=server/services/automation-task-lock.service.ts(20), scripts/admin-report-guards.mjs(2), scripts/automation-chain-guards.mjs(2), +1
  Follow                       refs=  24 delegate= 10 files=server/routes/user-social.routes.ts(4), scripts/db-schema-audit.mjs(4), server/routes/admin-report.routes.ts(3), +10
  PostView                     refs=  24 delegate=  2 files=server/services/post/post-engagement.ts(7), scripts/prisma-schema-trusted-engagement-guards.mjs(6), server/routes/admin-report.routes.ts(4), +3
  PointTransaction             refs=  24 delegate=  5 files=server/routes/health.routes.ts(11), server/routes/admin-report.routes.ts(3), server/services/tui-plus.service.ts(2), +5
  PostShare                    refs=  20 delegate=  1 files=scripts/admin-report-guards.mjs(7), server/routes/admin-report.routes.ts(6), server/routes/admin-promotion.routes.ts(2), +3
  Block                        refs=  19 delegate= 11 files=server/routes/user-social.routes.ts(3), scripts/migrate-post-detail-route-registration.mjs(3), scripts/security-guards.mjs(3), +6
  AutoPostContent              refs=  16 delegate=  0 files=scripts/auto-post-guards.mjs(8), scripts/seed-auto-post-content.mjs(8)
  DepositAddress               refs=  14 delegate= 11 files=server/services/admin-deposit.service.ts(8), server/services/deposit-scanner.service.ts(3), scripts/security-guards.mjs(3)
  CommentPublishRun            refs=  14 delegate=  0 files=server/services/comment-publish-v8.service.ts(10), server/routes/health.routes.ts(2), scripts/automation-chain-guards.mjs(2)
  RobotContentSignature        refs=  14 delegate=  0 files=server/services/comment-publish-v8.service.ts(6), server/services/quote-publish-v5.service.ts(6), server/routes/health.routes.ts(2)
  AutomationBatchRun           refs=  13 delegate=  8 files=server/services/automation/automation-batch.service.ts(8), scripts/automation-one-click-guards.mjs(5)
  QuotePublishRun              refs=  12 delegate=  0 files=scripts/quote-publish-guards.mjs(8), server/routes/health.routes.ts(2), scripts/automation-chain-guards.mjs(2)
  AutoLikeRun                  refs=  12 delegate=  0 files=server/services/auto-like.service.ts(8), scripts/admin-report-guards.mjs(2), scripts/automation-chain-guards.mjs(2)
  UserJoinedTopic              refs=   9 delegate=  0 files=server/joined-topic.service.ts(4), scripts/deploy-main-schema.mjs(3), scripts/security-guards.mjs(2)
  AutomationHeartbeat          refs=   9 delegate=  0 files=server/services/automation-health.service.ts(4), scripts/admin-report-guards.mjs(2), scripts/automation-chain-guards.mjs(2), +1
  AutoPostRun                  refs=   9 delegate=  0 files=scripts/auto-post-guards.mjs(9)
  SweepJob                     refs=   8 delegate=  1 files=scripts/security-guards.mjs(7), server/services/admin-deposit.service.ts(1)
  ChatRoom                     refs=   8 delegate=  0 files=scripts/deploy-main-schema.mjs(4), server/chat/chat.schema.ts(2), server/routes/health.routes.ts(2)
  ChatBotInvocation            refs=   8 delegate=  0 files=scripts/deploy-main-schema.mjs(4), server/chat/chat.automation-runtime.ts(2), server/chat/chat.schema.ts(2)
  ChatMute                     refs=   6 delegate=  0 files=scripts/deploy-main-schema.mjs(4), server/chat/chat.schema.ts(2)
  UserRecommendationFeedback   refs=   4 delegate=  0 files=server/routes/admin-report.routes.ts(2), scripts/security-guards.mjs(2)
  PromotionCampaign            refs=   4 delegate=  0 files=src/types.ts(2), scripts/security-guards.mjs(2)
  SweepTransaction             refs=   3 delegate=  0 files=scripts/security-guards.mjs(3)
  UserMutedCategory            refs=   1 delegate=  1 files=server/services/post/index.ts(1)
  WebhookRequest               refs=   0 delegate=  0 files=-
  WebhookPostOperation         refs=   0 delegate=  0 files=-

Models with very low code signal; manual review before deleting:
  - UserMutedCategory: refs=1, files=server/services/post/index.ts(1)
  - WebhookRequest: refs=0, files=-
  - WebhookPostOperation: refs=0, files=-

Fields with low code signal; these are cleanup candidates only after runtime/data verification:
  Post:
    - quotedByPosts              Post[]             refs=0 files=-
    - recommendationFeedbacks    UserRecommendationFeedback[] refs=0 files=-
    - promotionCampaigns         PromotionCampaign[] refs=0 files=-
  User:
    - depositAddressRecord       DepositAddress?    refs=0 files=-
    - pointTransactions          PointTransaction[] refs=0 files=-
    - promotionCampaigns         PromotionCampaign[] refs=0 files=-
    - postViews                  PostView[]         refs=1 files=scripts/prisma-schema-trusted-engagement-guards.mjs(1)
    - mutedCategories            UserMutedCategory[] refs=0 files=-
    - recommendationFeedbacks    UserRecommendationFeedback[] refs=0 files=-
  Category:
    - mutedByUsers               UserMutedCategory[] refs=0 files=-
    - autoCrawlSources           AutoCrawlSource[]  refs=1 files=scripts/automation-chain-guards.mjs(1)
  AutoCrawlRun:
    - lockOwner                  String?            refs=1 files=server/services/auto-crawl.service.ts(1)
  Order:
    - amountRaw                  String?            refs=0 files=-
  PostView:
    - viewerUser                 User?              refs=1 files=scripts/prisma-schema-trusted-engagement-guards.mjs(1)
  WebhookRequest:
    - requestHash                String             refs=0 files=-
    - responseBody               Json?              refs=0 files=-
    - errorCode                  String?            refs=0 files=-

Summary: {
  "modelCount": 41,
  "enumCount": 15,
  "sourceFileCount": 571,
  "criticalIndexFindings": 0,
  "lowSignalModelCount": 3,
  "lowSignalFieldCount": 17
}
```

### Bootstrap Boundary Guard
Status: **PASS**
#### stdout

```txt

=== Bootstrap Boundary Guard ===
Boundary config: config/architecture-boundaries.json#bootstrap
Allowed top-level concerns: environment loading, express app creation, security middleware composition, route module registration, scheduler startup, http server startup
server/bootstrap.ts lines: 1102 / 1315
server/bootstrap.ts /api route literals: 0 / 0
server/bootstrap.ts direct app route calls: 0 / 0
server/bootstrap.ts inline Prisma business-operation hints: 5

No bootstrap boundary growth detected.

Refactor target: reduce config/architecture-boundaries.json#bootstrap after each route extraction until bootstrap only composes modules.
```

### Route Boundary Guard
Status: **PASS**
#### stdout

```txt

=== Route Boundary Guard ===
Boundary config: config/architecture-boundaries.json#routes
Route files scanned: 46
Route files with direct Prisma business queries: 19 / 6
Route files with large handlers: 1 / 2
Route files with local HTTP helper redefinitions: 0 / 0
Route files starting background schedulers: 0 / 0
Account route implementation leaks: 0 / 0
Account aggregator direct route registrations: 0 / 0
Long handler threshold: 180 lines

Route file inventory:
  server/routes/user-social.routes.ts
    routes=8 prismaOps=8 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/me/following | GET /api/me/fans | POST /api/users/:id/follow | DELETE /api/users/:id/follow | GET /api/users/:id/follow-status | POST /api/users/:id/block | DELETE /api/users/:id/block | GET /api/users/:id/block-status
  server/routes/admin-report.routes.ts
    routes=2 prismaOps=7 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/admin/recommendation-report | GET /api/admin/ops-report
    largeHandlers=line 120: 181 lines, line 300: 249 lines
  server/routes/admin-post.routes.ts
    routes=4 prismaOps=6 transactions=2 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/admin/posts | PATCH /api/admin/posts/:id/publish | DELETE /api/admin/posts/:id/permanent | PATCH /api/admin/posts/:id
  server/routes/seo.routes.ts
    routes=5 prismaOps=5 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
  server/routes/billing.routes.ts
    routes=4 prismaOps=4 transactions=1 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/me/transactions | POST /api/me/orders | POST /api/me/orders/:id/scan | GET /api/me/orders
  server/routes/post-telegram-sync.routes.ts
    routes=1 prismaOps=4 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=POST /api/posts/:id/telegram-sync
  server/routes/seo-fallback.routes.ts
    routes=8 prismaOps=3 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
  server/routes/post-actions.routes.ts
    routes=5 prismaOps=3 transactions=3 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=POST /api/posts/:id/like | POST /api/posts/:id/recommendation-feedback | POST /api/posts/:id/share | PATCH /api/posts/:id/publish | DELETE /api/posts/:id
  server/routes/post-read.routes.ts
    routes=5 prismaOps=3 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/posts/following | GET /api/posts/:id/quotes | GET /api/posts/:id/likes | GET /api/posts/:id | POST /api/posts/views
  server/routes/admin-user.routes.ts
    routes=3 prismaOps=3 transactions=1 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/admin/users | PATCH /api/admin/users/:id/disabled | POST /api/admin/users/:id/points
  server/routes/auto-crawl.routes.ts
    routes=13 prismaOps=2 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/admin/auto-crawl/config | GET /api/admin/auto-crawl/status | PATCH /api/admin/auto-crawl/config | POST /api/admin/auto-crawl/sources | PATCH /api/admin/auto-crawl/sources/:id | DELETE /api/admin/auto-crawl/sources/:id | POST /api/admin/auto-crawl/run-now | POST /api/admin/auto-crawl/reprocess | GET /api/admin/auto-crawl/execution-logs | GET /api/admin/auto-crawl/execution-logs/details | GET /api/admin/auto-crawl/execution-logs/:runId | GET /api/admin/auto-crawl/runs
  server/routes/push.routes.ts
    routes=5 prismaOps=2 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/push/vapid-public-key | GET /api/push/status | POST /api/push/subscribe | POST /api/push/unsubscribe | POST /api/admin/push/system
  server/routes/config.routes.ts
    routes=4 prismaOps=2 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/config | GET /api/categories | GET /api/home/bootstrap | GET /api/admin/config
  server/routes/joined-topic.routes.ts
    routes=4 prismaOps=2 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/me/joined-topics | GET /api/topics/:id/join-status | POST /api/topics/:id/join | DELETE /api/topics/:id/join
  server/routes/admin-billing.routes.ts
    routes=3 prismaOps=2 transactions=1 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/admin/transactions | GET /api/admin/orders | POST /api/admin/orders/:id/credit
  server/routes/admin-promotion.routes.ts
    routes=4 prismaOps=1 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/admin/promotions | PATCH /api/admin/promotions/:id | PATCH /api/admin/promotions/:id/display-state | DELETE /api/admin/promotions/:id
  server/routes/post-create.routes.ts
    routes=2 prismaOps=1 transactions=1 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/posts/contact-eligibility | POST /api/posts
  server/routes/admin-config.routes.ts
    routes=1 prismaOps=1 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=PATCH /api/admin/config
  server/routes/avatar-media.routes.ts
    routes=1 prismaOps=1 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
  server/routes/tui-plus.routes.ts
    routes=14 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/tui-plus/post-cover.svg | GET /api/tui-plus/status | GET /api/tui-plus/plans | POST /api/tui-plus/trial/start | POST /api/tui-plus/purchase | POST /api/tui-plus/channels | PATCH /api/tui-plus/channels/:id | DELETE /api/tui-plus/channels/:id | POST /api/tui-plus/websites | PATCH /api/tui-plus/websites/:id | DELETE /api/tui-plus/websites/:id | POST /api/tui-plus/contacts
  server/chat/chat.admin.routes.ts
    routes=10 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/admin/chat/runs | PATCH /api/admin/chat/messages/:id | POST /api/admin/chat/mutes | GET /api/admin/chat/bots | POST /api/admin/chat/bots | PATCH /api/admin/chat/bots/:id | GET /api/admin/chat/config | PATCH /api/admin/chat/config | GET /api/admin/chat/automation-status
  server/routes/referral.routes.ts
    routes=9 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/referrals/summary | GET /api/referrals/invite-code | GET /api/referrals/relations | GET /api/referrals/commissions | GET /api/referrals/withdrawals | POST /api/referrals/convert-points | POST /api/referrals/withdrawals | GET /api/admin/referral-withdrawals | PATCH /api/admin/referral-withdrawals/:id
  server/routes/admin-deposit.routes.ts
    routes=8 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/admin/deposit-addresses | GET /api/admin/deposit-addresses/stats | POST /api/admin/deposit-sweep-jobs | GET /api/internal/deposit-sweep-jobs/next | POST /api/internal/deposit-sweep-transactions/:id/complete | POST /api/internal/deposit-sweep-transactions/:id/fail | POST /api/admin/deposit-addresses | PATCH /api/admin/deposit-addresses/:id
  server/routes/auto-post.routes.ts
    routes=8 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/admin/auto-post/config | GET /api/admin/auto-post/stats | PATCH /api/admin/auto-post/config | POST /api/admin/auto-post/run-now | GET /api/admin/auto-post/runs | GET /api/admin/auto-post/contents | POST /api/admin/auto-post/contents/import | PATCH /api/admin/auto-post/contents/:id
  server/routes/account-settings.routes.ts
    routes=7 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/me/feed-muted-categories | PATCH /api/me/feed-muted-categories | PUT /api/me/login-account | PUT /api/me/password | PUT /api/me/payment-password | PUT /api/me/bio | PATCH /api/me/profile
  server/routes/admin-comment-publish.routes.ts
    routes=6 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/admin/comment-publish/config | GET /api/admin/comment-publish/status | GET /api/admin/comment-publish/stats | GET /api/admin/comment-publish/runs | PATCH /api/admin/comment-publish/config | POST /api/admin/comment-publish/run-now
  server/routes/promotion.routes.ts
    routes=6 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/promotion/slots-batch | GET /api/promotions/home-ads | GET /api/me/promotions | GET /api/me/promotion-effects | POST /api/promotion/book-batch | PUT /api/promotion/bookings/:id/ad-creative
  server/routes/quote-publish.routes.ts
    routes=6 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/admin/quote-publish/config | GET /api/admin/quote-publish/status | GET /api/admin/quote-publish/stats | GET /api/admin/quote-publish/runs | PATCH /api/admin/quote-publish/config | POST /api/admin/quote-publish/run-now
  server/routes/admin-auto-like.routes.ts
    routes=5 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/admin/auto-like/config | GET /api/admin/auto-like/stats | GET /api/admin/auto-like/runs | PATCH /api/admin/auto-like/config | POST /api/admin/auto-like/run-now
  server/routes/admin-automation.routes.ts
    routes=5 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/admin/automation/status | POST /api/admin/automation/run-all | GET /api/admin/automation/batches/:id | GET /api/admin/automation/heartbeats | POST /api/admin/automation/locks/:module/release
  server/routes/account-engagement.routes.ts
    routes=4 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/me/likes | GET /api/me/comments | GET /api/notifications/feed-counts | GET /api/notifications/home-summary
  server/routes/health.routes.ts
    routes=4 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/health | GET /api/readyz
  server/routes/notifications.routes.ts
    routes=4 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/me/notifications | GET /api/me/notifications/unread-count | POST /api/me/notifications/read-all | POST /api/me/notifications/:id/read
  server/routes/account-auth.routes.ts
    routes=3 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=POST /api/auth/password | POST /api/auth/register | POST /api/auth/logout
  server/routes/account-profile.routes.ts
    routes=3 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/me | GET /api/session | GET /api/users/:id
  server/routes/post-comments.routes.ts
    routes=3 prismaOps=0 transactions=2 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/posts/:id/comments | POST /api/posts/:id/comments | DELETE /api/posts/:postId/comments/:commentId
  server/chat/chat.routes.ts
    routes=2 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/chat/bootstrap | GET /api/chat/messages
  server/routes/feed.routes.ts
    routes=2 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/home/first-screen | GET /api/home/feed
  server/routes/notification-preference.routes.ts
    routes=2 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/notification-preferences | PATCH /api/notification-preferences
  server/routes/platform-ai.routes.ts
    routes=2 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/admin/platform-ai/config | PATCH /api/admin/platform-ai/config
  server/routes/upload.routes.ts
    routes=2 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=POST /api/upload
  server/routes/admin-middleware.routes.ts
    routes=1 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=USE /api/admin
  server/routes/post.routes.ts
    routes=1 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=GET /api/posts
  server/routes/rum.routes.ts
    routes=1 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
    sample=POST /api/rum/web-vitals
  server/routes/account.routes.ts
    routes=0 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0
  server/routes/public-feed-response.ts
    routes=0 prismaOps=0 transactions=0 localHttpHelpers=0 schedulerStartups=0 accountImplementationLeaks=0 accountAggregatorRoutes=0

Boundary violations:
  - route files with direct Prisma business queries=19, baseline max=6

Refactor target: move route-level Prisma work into server/services or server/repositories, keep HTTP params/pagination in server/http helpers, keep background schedulers in startup modules, then lower config/architecture-boundaries.json#routes. Keep persistence and crypto implementation out of all server/routes/account*.routes.ts modules, and keep account.routes.ts as a submodule aggregator only.
```

### Frontend API Boundary Guard
Status: **PASS**
#### stdout

```txt

=== Frontend API Boundary Guard ===
Boundary config: config/architecture-boundaries.json#frontendApi
Files containing /api literals: 20
Files outside allowed API layers: 11 / 11
API literals outside allowed API layers: 90 / 90

Frontend files to migrate toward src/services/api.ts or feature service layers:
  src/features/admin/AdminPage.tsx
    line  116 /api/admin/config
    line  140 /api/config
    line  141 /api/categories
    line  142 /api/home/bootstrap
    line  187 /api/admin/ops-report
    line  214 /api/admin/deposit-addresses/stats
    line  227 /api/admin/deposit-addresses
    line  247 /api/admin/deposit-addresses/${id}
  src/features/admin/AdminAutoCrawlPanel.tsx
    line  119 /api/admin/auto-crawl/config
    line  134 /api/admin/auto-crawl/config
    line  192 /api/admin/auto-crawl/sources/${editingSourceId}
    line  192 /api/admin/auto-crawl/sources
    line  229 /api/admin/auto-crawl/sources/${source.id}
    line  249 /api/admin/auto-crawl/sources/${source.id}
    line  119 /api/admin/auto-crawl/config
    line  134 /api/admin/auto-crawl/config
  src/features/admin/AdminModelConfigPanel.tsx
    line   33 /api/admin/comment-publish/config
    line   34 /api/admin/quote-publish/config
    line   60 /api/admin/comment-publish/config
    line   65 /api/admin/quote-publish/config
    line   33 /api/admin/comment-publish/config
    line   34 /api/admin/quote-publish/config
    line   60 /api/admin/comment-publish/config
    line   65 /api/admin/quote-publish/config
  src/features/admin/AdminAutoCrawlExecutionLogsCompactPanel.tsx
    line  404 /api/admin/auto-crawl/execution-logs/details?limit=20
    line  429 /api/admin/auto-crawl/run-now
    line  404 /api/admin/auto-crawl/execution-logs/details?limit=20
    line  429 /api/admin/auto-crawl/run-now
  src/features/admin/AdminAutoLikePanel.tsx
    line   43 /api/admin/auto-like/config
    line   61 /api/admin/auto-like/config
    line   43 /api/admin/auto-like/config
    line   61 /api/admin/auto-like/config
  src/features/admin/AdminAutoPostPanel.tsx
    line   53 /api/admin/auto-post/config
    line   85 /api/admin/auto-post/config
    line   53 /api/admin/auto-post/config
    line   85 /api/admin/auto-post/config
  src/features/admin/AdminCommentPublishPanel.tsx
    line   45 /api/admin/comment-publish/config
    line   48 /api/admin/comment-publish/config
    line   45 /api/admin/comment-publish/config
    line   48 /api/admin/comment-publish/config
  src/features/admin/AdminQuotePublishPanel.tsx
    line   41 /api/admin/quote-publish/config
    line   44 /api/admin/quote-publish/config
    line   41 /api/admin/quote-publish/config
    line   44 /api/admin/quote-publish/config
  src/features/admin/AdminReferralWithdrawalPanel.tsx
    line   74 /api/admin/referral-withdrawals?${params.toString()}
    line  101 /api/admin/referral-withdrawals/${item.id}
    line   74 /api/admin/referral-withdrawals?${params.toString()}
    line  101 /api/admin/referral-withdrawals/${item.id}
  src/features/admin/AdminInteractionConfigPanel.tsx
    line  172 /api/admin/${module}/runs?limit=20
    line  190 /api/admin/${module}/run-now
    line  190 /api/admin/${module}/run-now
  src/platform/rum.ts
    line   10 /api/rum/web-vitals

No frontend API boundary growth detected.

Refactor target: move raw API paths out of pages/components and lower config/architecture-boundaries.json#frontendApi.
```
