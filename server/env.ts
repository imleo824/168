export function getRequiredEnv(name: string, fallbackForDevelopment?: string) {
  const value = process.env[name];
  if (value) return value;

  if (process.env.NODE_ENV !== 'production' && fallbackForDevelopment) {
    return fallbackForDevelopment;
  }

  throw new Error(`Missing required environment variable: ${name}`);
}
