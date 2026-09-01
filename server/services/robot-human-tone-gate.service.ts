export type RobotHumanToneMode = 'comment' | 'quote';

const EXACT_BAD_TEXTS = [
  '招聘别只看工资。',
  '租房别只看月租。',
  '二手别急着谈价格。',
  '二手 Apple 别只看成色。',
  '月休和结算周期写一下。',
  '押金和水电怎么算？',
  '材料清单如果能列出来。',
  '电池健康和维修记录最好一起放。',
  '建议大家理性判断。',
  '整体来看还是值得关注的。',
  '该内容有一定参考价值。',
  '可以进一步了解具体情况。',
  '注意风险，谨慎选择。',
  '信息点比较明确。',
  '根据自身情况决定。',
  '这个确实不错。',
];

const HUMAN_TONE_BLOCKERS: Array<[RegExp, string]> = [
  [/最怕/, 'formula_zuipa'],
  [/别只看/, 'formula_biezhikan'],
  [/别急着/, 'formula_biejizhe'],
  [/最好/, 'formula_zuihao'],
  [/写清|问清|放出来|列出来|说明一下|写一下/, 'reviewer_action_tone'],
  [/这个会影响/, 'formula_zhege_hui_yingxiang'],
  [/不然|很难判断|不好判断|好判断/, 'reviewer_judgment_tone'],
  [/才是真|才是重点|才是关键|真正要看/, 'knowledge_card_tone'],
  [/后面容易|后面最容易|容易扯|容易踩坑/, 'template_risk_tone'],
  [/更实用|更好接|值得关注|理性判断|进一步了解|信息点/, 'platform_tone'],
  [/建议|注意|核实|谨慎|风险|整体|综合|总结|参考|作为|平台|社区|运营|管理员|客服|机器人|AI|人工智能/, 'ai_or_admin_tone'],
  [/(^|[，。！？!?\s])(这|那|这个|那个|这种|那种|这类|那类|这条|那条|这事|那事|这信息|那信息)/, 'deictic_pronoun'],
  [/[啊呀哈呵嘛呢吧哦噢呗啦哇～~]{1,}$/, 'tone_particle'],
  [/难道|不就是|谁会|怎么可能|还不如|不是.*吗|不.*吗|何必|凭什么|哪有.*的/, 'rhetorical_question'],
  [/(怎么算|怎么说|有没有|能不能|可以吗|行不行|稳不稳|哪里|哪边|哪儿)[？?。]?$/, 'basic_question'],
];

const QUOTE_ONLY_BLOCKERS: Array<[RegExp, string]> = [
  [/^(这个|这种|那种|这类|这条|确实|感觉|看起来|还是要|最好|建议|注意)/, 'floating_quote_start'],
  [/[？?]$/, 'quote_question'],
];

function normalize(text: unknown) {
  return String(text || '').replace(/\s+/g, '').trim();
}

export function detectRobotHumanToneViolation(text: unknown, mode: RobotHumanToneMode) {
  const raw = String(text || '').trim();
  const compact = normalize(raw);
  if (!compact) return 'empty';
  if (EXACT_BAD_TEXTS.some((item) => normalize(item) === compact)) return 'exact_bad_template';
  for (const [pattern, reason] of HUMAN_TONE_BLOCKERS) {
    if (pattern.test(raw)) return reason;
  }
  if (mode === 'quote') {
    for (const [pattern, reason] of QUOTE_ONLY_BLOCKERS) {
      if (pattern.test(raw)) return reason;
    }
  }
  return '';
}

export function isRobotHumanToneAcceptable(text: unknown, mode: RobotHumanToneMode) {
  return !detectRobotHumanToneViolation(text, mode);
}
