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
  const isWide = index === 6;
  const col = index % 2;
  const row = Math.floor(index / 2);
  const x = isWide ? 130 : col === 0 ? 130 : 620;
  const y = isWide ? 515 : 260 + row * 78;
  const width = isWide ? 940 : 450;
  const numberX = x + 34;
  const textX = x + 70;

  return `
  <g transform="translate(${x} ${y})">
    <rect width="${width}" height="62" rx="22" fill="rgba(255,255,255,0.085)" stroke="rgba(255,226,166,0.20)"/>
    <circle cx="34" cy="31" r="17" fill="rgba(249,217,120,0.16)" stroke="rgba(249,217,120,0.28)"/>
    <text x="${numberX - x}" y="38" fill="#F9D978" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="18" font-weight="800" text-anchor="middle">${index + 1}</text>
    <text x="${textX - x}" y="27" fill="#FFFFFF" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="25" font-weight="800">${escapeXml(item.title)}</text>
    <text x="${textX - x}" y="50" fill="rgba(255,255,255,0.66)" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="18" font-weight="500">${escapeXml(item.description)}</text>
  </g>`;
}

function renderSvg() {
  const cards = TUI_PLUS_BENEFIT_ITEMS.map(renderBenefitCard).join('\n');

  return `<svg width="1200" height="675" viewBox="0 0 1200 675" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="675" rx="48" fill="#0B0B0F"/>
  <rect x="44" y="44" width="1112" height="587" rx="40" fill="url(#paint0_linear)" stroke="rgba(255,255,255,0.14)" stroke-width="2"/>
  <circle cx="1030" cy="112" r="192" fill="rgba(255,205,89,0.16)"/>
  <circle cx="168" cy="596" r="220" fill="rgba(255,177,52,0.13)"/>
  <path d="M96 116C96 88.4 118.4 66 146 66H1054C1081.6 66 1104 88.4 1104 116V559C1104 586.6 1081.6 609 1054 609H146C118.4 609 96 586.6 96 559V116Z" fill="rgba(8,8,12,0.70)" stroke="rgba(255,255,255,0.11)"/>
  <text x="600" y="142" fill="#F9D978" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="48" font-weight="900" text-anchor="middle" letter-spacing="1.8">Tui Plus</text>
  <text x="600" y="202" fill="#FFFFFF" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="54" font-weight="900" text-anchor="middle">会员权益已开启</text>
  <text x="600" y="238" fill="rgba(255,255,255,0.70)" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="24" font-weight="500" text-anchor="middle">提升曝光 · 主页转化 · 官方频道分发 · 专属身份标识</text>${cards}
  <text x="600" y="594" fill="rgba(255,255,255,0.58)" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="21" text-anchor="middle">发现圈内事，就上推推 · tuitui888.com</text>
  <defs>
    <linearGradient id="paint0_linear" x1="44" y1="44" x2="1115" y2="631" gradientUnits="userSpaceOnUse">
      <stop stop-color="#1C160A"/>
      <stop offset="0.48" stop-color="#111118"/>
      <stop offset="1" stop-color="#2A1B08"/>
    </linearGradient>
  </defs>
</svg>
`;
}

await writeFile(OUTPUT_PATH, renderSvg(), 'utf8');
console.log(`[tui-plus] generated ${path.relative(ROOT, OUTPUT_PATH)} from shared benefit copy`);
