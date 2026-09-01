import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import { TUI_PLUS_BENEFIT_ITEMS } from '../shared/tuiPlusBenefits.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_PATH = path.join(ROOT, 'public', 'tui-plus-post-cover.svg');

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function renderBenefitCard(item, index) {
  const col = index % 2;
  const row = Math.floor(index / 2);
  const x = 54 + col * 558;
  const y = 172 + row * 102;
  const width = 534;
  const numberX = x + 34;
  const textX = x + 76;

  return `
  <g transform="translate(${x} ${y})">
    <rect width="${width}" height="88" rx="18" fill="rgba(255,255,255,0.070)"/>
    <rect x="22" y="22" width="28" height="28" rx="10" fill="rgba(249,217,120,0.18)"/>
    <text x="${numberX - x}" y="45" fill="#F9D978" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="20" font-weight="900" text-anchor="middle">${index + 1}</text>
    <text x="${textX - x}" y="38" fill="#FFFFFF" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="32" font-weight="900">${escapeXml(item.title)}</text>
    <text x="${textX - x}" y="63" fill="rgba(255,255,255,0.72)" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="22" font-weight="600">${escapeXml(item.description)}</text>
  </g>`;
}

function renderSvg() {
  const cards = TUI_PLUS_BENEFIT_ITEMS.map(renderBenefitCard).join('\n');

  return `<svg width="1200" height="675" viewBox="0 0 1200 675" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="675" fill="url(#paint0_linear)"/>
  <circle cx="1032" cy="88" r="210" fill="rgba(255,205,89,0.13)"/>
  <circle cx="128" cy="632" r="248" fill="rgba(255,177,52,0.12)"/>
  <text x="600" y="102" fill="#F9D978" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="70" font-weight="950" text-anchor="middle" letter-spacing="1.4">Tui Plus</text>
  <text x="600" y="145" fill="rgba(255,255,255,0.82)" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="31" font-weight="750" text-anchor="middle">会员权益</text>${cards}
  <text x="600" y="632" fill="rgba(255,255,255,0.62)" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="24" font-weight="600" text-anchor="middle">发现圈内事，就上推推 · tuitui888.com</text>
  <defs>
    <linearGradient id="paint0_linear" x1="0" y1="0" x2="1200" y2="675" gradientUnits="userSpaceOnUse">
      <stop stop-color="#1F1708"/>
      <stop offset="0.50" stop-color="#0E0E14"/>
      <stop offset="1" stop-color="#2A1B08"/>
    </linearGradient>
  </defs>
</svg>
`;
}

await writeFile(OUTPUT_PATH, renderSvg(), 'utf8');
console.log(`[tui-plus] generated ${path.relative(ROOT, OUTPUT_PATH)} from shared benefit copy`);
