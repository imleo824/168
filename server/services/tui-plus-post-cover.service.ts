import { TUI_PLUS_BENEFIT_ITEMS } from '../../shared/tuiPlusBenefits.mjs';

type TuiPlusBenefitItem = {
  key?: string;
  title?: string;
  description?: string;
};

function escapeSvgText(raw: unknown) {
  return String(raw || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function fitText(raw: unknown, maxLength: number) {
  const text = String(raw || '').replace(/\s+/g, ' ').trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function getCoverBenefits() {
  return (Array.isArray(TUI_PLUS_BENEFIT_ITEMS) ? TUI_PLUS_BENEFIT_ITEMS : [])
    .map((item: TuiPlusBenefitItem) => ({
      title: fitText(item.title, 22),
      description: fitText(item.description, 30),
    }))
    .filter((item) => item.title);
}

function renderBenefitCard(item: { title: string; description?: string }, index: number, layout: { x: number; y: number; width: number; height: number }) {
  const numberX = layout.x + 34;
  const titleX = layout.x + 76;
  const titleY = layout.y + layout.height * 0.43;
  const descriptionY = layout.y + layout.height * 0.72;
  return `
  <g>
    <rect x="${layout.x}" y="${layout.y}" width="${layout.width}" height="${layout.height}" rx="18" fill="rgba(255,255,255,0.070)"/>
    <rect x="${layout.x + 22}" y="${layout.y + 22}" width="28" height="28" rx="10" fill="rgba(249,217,120,0.18)"/>
    <text x="${numberX}" y="${layout.y + 45}" fill="#F9D978" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="20" font-weight="900" text-anchor="middle">${index + 1}</text>
    <text x="${titleX}" y="${titleY}" fill="#FFFFFF" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="32" font-weight="900">${escapeSvgText(item.title)}</text>
    ${item.description ? `<text x="${titleX}" y="${descriptionY}" fill="rgba(255,255,255,0.72)" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="22" font-weight="600">${escapeSvgText(item.description)}</text>` : ''}
  </g>`;
}

export function buildTuiPlusPostCoverSvg() {
  const benefits = getCoverBenefits();
  const columnCount = benefits.length <= 4 ? 1 : 2;
  const rowCount = Math.max(1, Math.ceil(benefits.length / columnCount));
  const left = 54;
  const top = 172;
  const gapX = 24;
  const gapY = 14;
  const availableWidth = 1092;
  const availableHeight = 424;
  const cardWidth = columnCount === 1 ? availableWidth : Math.floor((availableWidth - gapX) / 2);
  const cardHeight = Math.max(66, Math.min(88, Math.floor((availableHeight - gapY * (rowCount - 1)) / rowCount)));
  const cards = benefits.map((benefit, index) => {
    const column = columnCount === 1 ? 0 : index % 2;
    const row = columnCount === 1 ? index : Math.floor(index / 2);
    const x = left + column * (cardWidth + gapX);
    const y = top + row * (cardHeight + gapY);
    return renderBenefitCard(benefit, index, { x, y, width: cardWidth, height: cardHeight });
  }).join('');

  return `<svg width="1200" height="675" viewBox="0 0 1200 675" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="675" fill="url(#paint0_linear)"/>
  <circle cx="1032" cy="88" r="210" fill="rgba(255,205,89,0.13)"/>
  <circle cx="128" cy="632" r="248" fill="rgba(255,177,52,0.12)"/>
  <text x="600" y="102" fill="#F9D978" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="70" font-weight="950" text-anchor="middle" letter-spacing="1.4">Tui Plus</text>
  <text x="600" y="145" fill="rgba(255,255,255,0.82)" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="31" font-weight="750" text-anchor="middle">会员权益</text>
  ${cards}
  <text x="600" y="632" fill="rgba(255,255,255,0.62)" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="24" font-weight="600" text-anchor="middle">发现圈内事，就上推推 · tuitui888.com</text>
  <defs><linearGradient id="paint0_linear" x1="0" y1="0" x2="1200" y2="675" gradientUnits="userSpaceOnUse"><stop stop-color="#1F1708"/><stop offset="0.50" stop-color="#0E0E14"/><stop offset="1" stop-color="#2A1B08"/></linearGradient></defs>
</svg>`;
}
