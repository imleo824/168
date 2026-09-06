import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const root = path.resolve(path.dirname(__filename), '..');
const distRoot = path.join(root, 'dist');
const indexPath = path.join(distRoot, 'index.html');

const KIB = 1024;
const limits = {
  criticalCssGzip: 55 * KIB,
  synchronousJsGzip: 145 * KIB,
  criticalCssAndJsGzip: 200 * KIB,
  modulePreloads: 2,
  userRouteCssRaw: 90 * KIB,
};

function fail(message) {
  console.error(`[frontend-bundle-budget] ${message}`);
  process.exitCode = 1;
}

function assetsFor(html, relation) {
  const expression = relation === 'script'
    ? /<script\b[^>]*\btype=["']module["'][^>]*\bsrc=["']([^"']+)["'][^>]*>/gi
    : new RegExp(`<link\\b[^>]*\\brel=["']${relation}["'][^>]*\\bhref=["']([^"']+)["'][^>]*>`, 'gi');
  return [...html.matchAll(expression)].map((match) => match[1]);
}

function assetPath(publicPath) {
  return path.join(distRoot, publicPath.replace(/^\/+/, ''));
}

function gzipSize(publicPath) {
  const target = assetPath(publicPath);
  if (!fs.existsSync(target)) {
    fail(`missing build asset ${publicPath}`);
    return 0;
  }
  return gzipSync(fs.readFileSync(target)).byteLength;
}

function formatKib(bytes) {
  return `${(bytes / KIB).toFixed(2)} KiB gzip`;
}

if (!fs.existsSync(indexPath)) {
  fail('dist/index.html is missing; run the production frontend build first.');
} else {
  const html = fs.readFileSync(indexPath, 'utf8');
  const scripts = assetsFor(html, 'script');
  const modulePreloads = assetsFor(html, 'modulepreload');
  const stylesheets = assetsFor(html, 'stylesheet').filter((asset) => asset.endsWith('.css'));

  const synchronousJsGzip = [...scripts, ...modulePreloads].reduce((total, asset) => total + gzipSize(asset), 0);
  const criticalCssGzip = stylesheets.reduce((total, asset) => total + gzipSize(asset), 0);
  const combinedGzip = synchronousJsGzip + criticalCssGzip;

  if (criticalCssGzip > limits.criticalCssGzip) {
    fail(`critical CSS is ${formatKib(criticalCssGzip)}; budget is ${formatKib(limits.criticalCssGzip)}.`);
  }
  if (synchronousJsGzip > limits.synchronousJsGzip) {
    fail(`synchronous JS is ${formatKib(synchronousJsGzip)}; budget is ${formatKib(limits.synchronousJsGzip)}.`);
  }
  if (combinedGzip > limits.criticalCssAndJsGzip) {
    fail(`critical CSS + JS is ${formatKib(combinedGzip)}; budget is ${formatKib(limits.criticalCssAndJsGzip)}.`);
  }
  if (modulePreloads.length > limits.modulePreloads) {
    fail(`index.html has ${modulePreloads.length} modulepreloads; budget is ${limits.modulePreloads}.`);
  }

  const userRouteCss = fs.readdirSync(path.join(distRoot, 'assets'))
    .filter((name) => name.endsWith('.css') && !name.startsWith('index-') && !name.startsWith('Admin-'));
  for (const name of userRouteCss) {
    const bytes = fs.statSync(path.join(distRoot, 'assets', name)).size;
    if (bytes > limits.userRouteCssRaw) {
      fail(`user route CSS ${name} is ${(bytes / KIB).toFixed(2)} KiB raw; budget is ${(limits.userRouteCssRaw / KIB).toFixed(0)} KiB.`);
    }
  }

  if (!process.exitCode) {
    console.log(
      `[frontend-bundle-budget] passed: CSS ${formatKib(criticalCssGzip)}, JS ${formatKib(synchronousJsGzip)}, combined ${formatKib(combinedGzip)}, modulepreloads ${modulePreloads.length}.`,
    );
  }
}
