import { spawn } from 'node:child_process';

const directUrl = String(process.env.DIRECT_URL || '').trim();

if (directUrl) {
  process.env.DATABASE_URL = directUrl;
  console.log('[prisma:migrate] Using DIRECT_URL for migrations.');
} else {
  console.log('[prisma:migrate] DIRECT_URL is not set; using DATABASE_URL.');
}

const child = spawn('prisma', ['migrate', 'deploy'], {
  env: process.env,
  shell: process.platform === 'win32',
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    console.error(`[prisma:migrate] terminated by ${signal}`);
    process.exit(1);
  }
  process.exit(code ?? 1);
});
