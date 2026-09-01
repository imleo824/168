export function isOptionalFeedDependencyUnavailable(error: unknown) {
  const code = String((error as any)?.code || '');
  const message = String((error as any)?.message || '');
  return (
    ['P2021', 'P2022'].includes(code) ||
    /relation .*does not exist|table .*does not exist|column .*does not exist|PostRankingScore|promotionBooking|PromotionBooking/i.test(message)
  );
}
