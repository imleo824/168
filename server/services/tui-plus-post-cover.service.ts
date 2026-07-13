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
  const numberRadius = Math.max(18, Math.min(24, Math.floor(layout.height * 0.30)));
  const numberCx = layout.x + 40;
  const numberCy = layout.y + layout.height / 2;
  const titleY = layout.y + layout.height * 0.42;
  const descriptionY = layout.y + layout.height * 0.72;
  return `
  <g>
    <rect x="${layout.x}" y="${layout.y}" width="${layout.width}" height="${layout.height}" rx="24" fill="rgba(255,255,255,0.078)"/>
    <circle cx="${numberCx}" cy="${numberCy}" r="${numberRadius}" fill="rgba(249,217,120,0.18)"/>
    <text x="${numberCx}" y="${numberCy + 8}" fill="#F9D978" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="22" font-weight="900" text-anchor="middle">${index + 1}</text>
    <text x="${layout.x + 82}" y="${titleY}" fill="#FFFFFF" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="29" font-weight="900">${escapeSvgText(item.title)}</text>
    ${item.description ? `<text x="${layout.x + 82}" y="${descriptionY}" fill="rgba(255,255,255,0.72)" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="21" font-weight="600">${escapeSvgText(item.description)}</text>` : ''}
  </g>`;
}

export function buildTuiPlusPostCoverSvg() {
  const benefits = getCoverBenefits();
  const columnCount = benefits.length <= 4 ? 1 : 2;
  const rowCount = Math.max(1, Math.ceil(benefits.length / columnCount));
  const left = 78;
  const top = 188;
  const gapX = 28;
  const gapY = 16;
  const availableWidth = 1044;
  const availableHeight = 376;
  const cardWidth = columnCount === 1 ? availableWidth : Math.floor((availableWidth - gapX) / 2);
  const cardHeight = Math.max(66, Math.min(82, Math.floor((availableHeight - gapY * (rowCount - 1)) / rowCount)));
  const cards = benefits.map((benefit, index) => {
    const column = columnCount === 1 ? 0 : index % 2;
    const row = columnCount === 1 ? index : Math.floor(index / 2);
    const x = left + column * (cardWidth + gapX);
    const y = top + row * (cardHeight + gapY);
    return renderBenefitCard(benefit, index, { x, y, width: cardWidth, height: cardHeight });
  }).join('');

  return `<svg width="1200" height="675" viewBox="0 0 1200 675" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="1200" height="675" rx="48" fill="#0B0B0F"/>
  <rect x="44" y="44" width="1112" height="587" rx="40" fill="url(#paint0_linear)"/>
  <circle cx="1030" cy="112" r="192" fill="rgba(255,205,89,0.16)"/>
  <circle cx="168" cy="596" r="220" fill="rgba(255,177,52,0.13)"/>
  <text x="600" y="132" fill="#F9D978" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="64" font-weight="950" text-anchor="middle" letter-spacing="1.6">Tui Plus</text>
  <text x="600" y="178" fill="rgba(255,255,255,0.78)" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="30" font-weight="700" text-anchor="middle">会员权益</text>
  ${cards}
  <text x="600" y="602" fill="rgba(255,255,255,0.62)" font-family="Arial, 'PingFang SC', 'Microsoft YaHei', sans-serif" font-size="24" font-weight="600" text-anchor="middle">发现圈内事，就上推推 · tuitui888.com</text>
  <defs><linearGradient id="paint0_linear" x1="44" y1="44" x2="1115" y2="631" gradientUnits="userSpaceOnUse"><stop stop-color="#1C160A"/><stop offset="0.48" stop-color="#111118"/><stop offset="1" stop-color="#2A1B08"/></linearGradient></defs>
</svg>`;
}
