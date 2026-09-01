export function normalizeCreateTopicName(value: string) {
  return value.replace(/^#+\s*/, '').trim();
}

export function formatCreateTopicLabel(value: string) {
  const topic = normalizeCreateTopicName(value);
  return topic ? `#${topic}` : '#';
}
