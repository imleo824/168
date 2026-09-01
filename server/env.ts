import crypto from 'crypto';

export function getRequiredEnv(name: string, fallbackForDevelopment?: string) {
  const value = process.env[name];
  if (value) return value;

  if (name === 'JWT_SECRET') {
    const generated = crypto.randomBytes(32).toString('hex');
    process.env.JWT_SECRET = generated;
    console.warn('[env] JWT_SECRET is not set; using an ephemeral runtime secret. Set JWT_SECRET in production to keep sessions stable across restarts.');
    return generated;
  }

  if (process.env.NODE_ENV !== 'production' && fallbackForDevelopment) {
    return fallbackForDevelopment;
  }

  throw new Error(`Missing required environment variable: ${name}`);
}
