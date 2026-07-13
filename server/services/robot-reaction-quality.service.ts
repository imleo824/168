import { createHash } from 'node:crypto';

export type RobotReactionIntent = 'info' | 'emotional' | 'daily' | 'unsupported';
export type RobotReactionMode = 'comment' | 'quote';
export type RobotReactionKind = 'ask' | 'interest' | 'experience' | 'judgment' | 'empathy' | 'daily_echo';

type Scene =
  | 'job'
  | 'housing'
  | 'secondhand'
  | 'visa'
  | 'food'
  | 'promotion'
  | 'finance'
  | 'tech'
  | 'nightlife'
  | 'crypto'
  | 'apple'
  | 'exposure'
  | 'business'
  | 'trend'
  | 'emotion'
  | 'daily'
  | 'industry'
  | 'risk'
  | 'general'
  | 'unsupported';

export type RobotReactionPost = {
  id: string;
  title?: string | null;
  content?: string | null;
  location?: string | null;
  countryName?: string | null;
  category?: { name?: string | null; slug?: string | null } | null;
};

export type RobotReactionUser = {
  id: string;
  displayName?: string | null;
  bio?: string | null;
};

export type RobotReactionCandidate = {
  content: string;
  intent: RobotReactionIntent;
  kind: RobotReactionKind;
  score: number;
  reason?: string;
};

type ReactionStrategy = {
  scene: Scene;
  label: string;
  anchors: string[];
  commentMoves: string[];
  quoteMoves: string[];
  mustAvoid: string[];
  goodCommentExamples: string[];
  goodQuoteExamples: string[];
};

const ADMIN_OR_AI_SMELL = /建议|补充一下|核实|注意风险|信息太少|有信息点|大家才好判断|写实一点|标题能看出方向|正文最好|价格只是第一眼|真正要看的还是|不能只看承诺|更关键|责任边界|作为|整体来看|可以看出|总结|本文|该内容|用户可能|需要注意|值得关注|进一步了解|理性判断|综合来看|温馨提示|友情提醒|平台|社区|运营|机器人|AI|人工智能|该岗位|该房源|该信息|根据自身情况|结合实际需求|有一定参考价值|抱抱|加油|别想太多|都会过去/i;
const SPAM_OR_REDIRECT = /https?:\/\/|www\.|wechat|telegram|whatsapp|line|站外联系|私聊|私信|联系方式|付款|支付|转账|充值|usdt|银行卡|担保|定金|送彩金|返利|开户链接/i;
const SENSITIVE_SOURCE = /保关|捞人|特殊通道|灰色通道|包过|走关系|清关通道|绕关|关系通道|假护照|假签证|买通|贿赂|偷渡|洗钱|跑分|私彩|刷流水|成人视频|外围|裸聊|援交|毒品|枪支/i;
const GENERIC_SHORT = /^(不错|支持|顶一下|路过|看看|了解了|有道理|确实|可以|还行|注意安全|谨慎点|稳一点|真实|收藏了|马克一下|蹲后续)[。！!？?]*$/i;
const LOW_VALUE_SOURCE = /^(123+|111+|222+|333+|abc|test|demo|测试|招聘|租房|二手|签证|餐馆|新闻|出|收|求|有吗|人在吗|顶|dd)$/i;
const FLOATING_QUOTE = /^(这个|这种|这种事|这种情况|那种|这类|这条|这个信息|这个内容)(确实|还是|也|挺|很|要|最好|先|别|容易|看起来|值得|可以).{0,18}[。！？!?]?$/i;
const QUOTE_WEAK_START = /^(这个|这种|那种|这条|这类|确实|感觉|看起来|还是要|最好|建议|注意)/i;
const PROMISE_OR_ILLEGAL = /包过|稳赚|包赢|内部消息|带单|喊单|返利|送彩金|刷流水|开户|私彩|代办假证|买通|走关系|特殊通道|无门槛高薪|保底高薪/i;

const STRATEGIES: Record<Exclude<Scene, 'unsupported'>, ReactionStrategy> = {
  job: {
    scene: 'job',
    label: '招聘/求职',
    anchors: ['工资', '薪资', '提成', '工时', '住宿', '试用期', '月结', '周结', '单休', '排班', '休息', '护照', '合同', '到手', '岗位'],
    commentMoves: ['追问薪资结构', '追问休息制度', '追问住宿条件', '追问结算周期'],
    quoteMoves: ['提醒别只看工资', '提醒试用期和结算', '提醒岗位边界写清'],
    mustAvoid: ['HR官方话术', '无依据承诺', '高薪诱导'],
    goodCommentExamples: ['月休和结算周期最好也写一下。', '住宿是几人间？这个会影响到手感受。'],
    goodQuoteExamples: ['招聘别只看工资，试用期、休息和结算周期才是后面容易扯的点。'],
  },
  housing: {
    scene: 'housing',
    label: '租房/房源',
    anchors: ['押金', '月租', '水电', '通勤', '合同', '房东', '合租', '楼层', '水压', '网络', '押一付一', '转租', '看房'],
    commentMoves: ['追问押金水电', '追问通勤', '追问合同', '追问是否转租'],
    quoteMoves: ['提醒总成本', '提醒押金退还', '提醒通勤成本'],
    mustAvoid: ['中介广告口吻', '替房源背书'],
    goodCommentExamples: ['押金和水电怎么算？月租只是第一眼。', '通勤到哪里，这个最好一起写清。'],
    goodQuoteExamples: ['租房最怕只看月租，押金、水电和通勤才是真成本。'],
  },
  secondhand: {
    scene: 'secondhand',
    label: '二手交易',
    anchors: ['验机', '解绑', '电池', '成色', '配件', '保修', '维修', '序列号', '面交', '自取', '瑕疵', '实拍', '型号', '价格'],
    commentMoves: ['追问实拍', '追问瑕疵', '追问电池维修', '追问能否面交'],
    quoteMoves: ['提醒先验机', '提醒 ID/解绑', '提醒成色不能只看照片'],
    mustAvoid: ['像商家广告', '无依据估价'],
    goodCommentExamples: ['能当面验吗？二手最怕只看描述。', '电池和维修记录最好一起放出来。'],
    goodQuoteExamples: ['二手别急着谈价格，验机、解绑和瑕疵先说清才稳。'],
  },
  visa: {
    scene: 'visa',
    label: '签证/证件',
    anchors: ['护照', '签证', '材料', '预约', '续签', '补办', '逾期', '入境', '周期', '拒签', '费用', '递交', '出境'],
    commentMoves: ['追问材料清单', '追问周期口径', '追问预约时间', '追问费用包含项'],
    quoteMoves: ['提醒材料和周期', '提醒官方口径', '提醒别听包过'],
    mustAvoid: ['包过暗示', '走关系暗示', '规避审查'],
    goodCommentExamples: ['这个周期是预约后算，还是递交后算？', '材料清单如果能列出来，就好判断很多。'],
    goodQuoteExamples: ['签证类信息最关键是材料和周期，少一个都会耽误事。'],
  },
  food: {
    scene: 'food',
    label: '餐馆/本地生活',
    anchors: ['人均', '营业', '招牌菜', '位置', '菜单', '口味', '外卖', '夜宵', '停车', '排队', '地址'],
    commentMoves: ['追问位置', '追问人均', '追问营业时间', '追问招牌菜'],
    quoteMoves: ['提醒带人均和位置', '提醒营业时间', '提醒不要只说好吃'],
    mustAvoid: ['硬广口吻', '无依据吹捧'],
    goodCommentExamples: ['位置在哪个区？晚一点还有没有营业。', '人均和招牌菜有吗？这个更实用。'],
    goodQuoteExamples: ['餐馆推荐最好带位置、人均和营业时间，不然只能靠猜。'],
  },
  promotion: {
    scene: 'promotion',
    label: '招商/推广/渠道',
    anchors: ['渠道', '转化', '素材', '预算', '流量', '风控', '平台', '封号', '结算', '返点', '代理', '保证金', '区域'],
    commentMoves: ['追问转化', '追问结算', '追问风控边界', '追问素材归属'],
    quoteMoves: ['提醒别只看量', '提醒结算和风控', '提醒合作边界'],
    mustAvoid: ['拉人开户', '返利诱导', '保证收益'],
    goodCommentExamples: ['转化和结算怎么说？只看渠道名看不出质量。', '风控边界不写清，后面很难算账。'],
    goodQuoteExamples: ['推广类别只讲量，素材、转化和结算边界不清都不好算。'],
  },
  finance: {
    scene: 'finance',
    label: '商业账务',
    anchors: ['财务', '对账', '流水', '结算', '报销', '账务', '收支', '凭证', '周期', '金额'],
    commentMoves: ['追问凭证', '追问结算周期', '追问对账口径'],
    quoteMoves: ['提醒留凭证', '提醒口径一致', '提醒周期写清'],
    mustAvoid: ['灰产金融', '代收代付'],
    goodCommentExamples: ['结算周期和凭证怎么留？财务这块最怕口头对账。'],
    goodQuoteExamples: ['涉及账务就别嫌麻烦，流水、截图和结算口径要先留清楚。'],
  },
  tech: {
    scene: 'tech',
    label: '技术/系统',
    anchors: ['权限', '服务器', '接口', '报错', '账号', '网络', '远程', 'bug', '环境', '日志', '域名', '部署'],
    commentMoves: ['追问报错截图', '追问环境', '追问权限', '追问复现路径'],
    quoteMoves: ['提醒先给环境和报错', '提醒权限边界', '提醒别只说不能用'],
    mustAvoid: ['装专家', '直接下结论'],
    goodCommentExamples: ['先看权限和报错截图吧，只说不能用很难判断。'],
    goodQuoteExamples: ['系统问题要把环境、权限和报错放出来，不然只能来回猜。'],
  },
  nightlife: {
    scene: 'nightlife',
    label: '夜场/本地岗位',
    anchors: ['夜场', '酒吧', 'KTV', '订台', '卡座', '礼仪', '抽成', '住宿', '薪资', '安全', '地点', '班次', '证件'],
    commentMoves: ['追问岗位边界', '追问薪资抽成', '追问住宿安全', '追问地点班次'],
    quoteMoves: ['提醒边界写清', '提醒住宿和安全', '提醒薪资抽成别模糊'],
    mustAvoid: ['低俗化', '擦边引导', '夸大高薪'],
    goodCommentExamples: ['班次和抽成怎么说？这类岗位边界要写清。'],
    goodQuoteExamples: ['夜场岗位最怕只写高薪，班次、抽成和住宿边界更要清楚。'],
  },
  crypto: {
    scene: 'crypto',
    label: '币圈/加密信息',
    anchors: ['BTC', 'ETH', 'USDT', 'U', '钱包', '交易所', '合约', 'KYC', '链上', '地址', '出入金', '风控', '代币', '空投'],
    commentMoves: ['追问信息来源', '追问链和钱包', '追问出入金限制', '追问 KYC'],
    quoteMoves: ['提醒别碰承诺收益', '提醒看链上和来源', '提醒出入金风控'],
    mustAvoid: ['带单喊单', '收益承诺', '开户链接'],
    goodCommentExamples: ['这个是链上数据还是群里消息？来源差很多。'],
    goodQuoteExamples: ['币圈信息先看来源和链上证据，别被一句内部消息带着走。'],
  },
  apple: {
    scene: 'apple',
    label: 'Apple/数码',
    anchors: ['iPhone', 'iPad', 'MacBook', 'Mac', '苹果', '电池', '维修', '序列号', 'ID锁', '国行', '美版', '港版', '保修', '验机', '屏幕'],
    commentMoves: ['追问电池维修', '追问版本', '追问 ID 锁', '追问保修'],
    quoteMoves: ['提醒别只看成色', '提醒 ID/维修/电池', '提醒版本差异'],
    mustAvoid: ['商家广告口吻', '无依据估价'],
    goodCommentExamples: ['电池健康和维修记录最好一起放，不然不好估。'],
    goodQuoteExamples: '二手 Apple 别只看成色，ID、维修和电池都要一起看。'.split('\n'),
  },
  exposure: {
    scene: 'exposure',
    label: '曝光/避坑',
    anchors: ['曝光', '避雷', '骗子', '欠款', '跑路', '金额', '聊天记录', '时间线', '账号', '证据', '实名', '纠纷', '转账'],
    commentMoves: ['追问证据链', '追问金额时间', '追问账号信息', '追问是否已处理'],
    quoteMoves: ['提醒证据链', '提醒时间金额对齐', '提醒不要直接定性'],
    mustAvoid: ['直接定罪', '煽动攻击', '泄露隐私'],
    goodCommentExamples: ['金额、时间线和聊天记录最好放完整。'],
    goodQuoteExamples: ['曝光帖最重要是证据链，时间、金额和聊天记录要能对上。'],
  },
  business: {
    scene: 'business',
    label: '商业/供需合作',
    anchors: ['公司', '项目', '合作', '渠道', '供应链', '报价', '交付', '周期', '验收', '售后', '合同', '资源', '代理'],
    commentMoves: ['追问交付边界', '追问报价包含项', '追问验收标准', '追问售后'],
    quoteMoves: ['提醒边界清楚', '提醒报价和验收', '提醒资源真实性'],
    mustAvoid: ['空泛招商', '保证收益'],
    goodCommentExamples: ['交付周期和验收标准写一下，合作才好谈。'],
    goodQuoteExamples: ['供需合作别只谈报价，交付和验收边界不清后面最容易扯。'],
  },
  trend: {
    scene: 'trend',
    label: '潮流/消费',
    anchors: ['尺码', '版本', '真假', '发售', '价格', '渠道', '球鞋', '服饰', '品牌', '成色', '面交'],
    commentMoves: ['追问尺码版本', '追问真假凭证', '追问渠道', '追问成色'],
    quoteMoves: ['提醒版本和渠道', '提醒别只看图片', '提醒真假凭证'],
    mustAvoid: ['带货硬广', '无依据鉴定'],
    goodCommentExamples: ['尺码和版本要写清，不然很难判断合不合适。'],
    goodQuoteExamples: ['潮流二手别只看图，版本、渠道和真假凭证才是重点。'],
  },
  industry: {
    scene: 'industry',
    label: '新闻/行业变化',
    anchors: ['政策', '新闻', '通报', '公告', '监管', '变化', '成本', '影响', '地区', '时间', '官方', '来源'],
    commentMoves: ['追问来源', '追问地区', '追问影响范围'],
    quoteMoves: ['提醒看官方来源', '提醒影响落地', '提醒别把传闻当结论'],
    mustAvoid: ['标题党', '无来源判断'],
    goodCommentExamples: ['这个是官方通报还是转述？来源会影响判断。'],
    goodQuoteExamples: ['新闻类先看来源和适用地区，别把转述直接当结论。'],
  },
  risk: {
    scene: 'risk',
    label: '风险/纠纷',
    anchors: ['先款', '定金', '转账', '押金不退', '跑路', '骗局', '隐私', '证件照', '口头承诺', '合同', '聊天记录', '金额'],
    commentMoves: ['追问证据', '追问合同', '追问金额时间'],
    quoteMoves: ['提醒留证据', '提醒别先款', '提醒口头承诺不稳'],
    mustAvoid: ['直接定罪', '鼓励报复'],
    goodCommentExamples: ['有没有合同或聊天记录？没有的话后面很难说清。'],
    goodQuoteExamples: ['先款、证件和口头承诺这几类，证据没留清就很被动。'],
  },
  emotion: {
    scene: 'emotion',
    label: '情绪/生活感受',
    anchors: ['累', '心累', '焦虑', '孤独', '委屈', '失落', '撑着', '睡不着', '情绪', '生活'],
    commentMoves: ['轻共鸣', '承接情绪', '不说教'],
    quoteMoves: ['保留情绪', '轻判断生活状态'],
    mustAvoid: ['鸡汤', '说教', '夸张安慰'],
    goodCommentExamples: ['这种累不是一件事，是很多小事堆起来。'],
    goodQuoteExamples: ['有些累不是大事本身，是一直没有确定感。'],
  },
  daily: {
    scene: 'daily',
    label: '日常/碎片',
    anchors: ['今天', '最近', '下班', '上班', '搬家', '天气', '生活', '日常', '城市', '烦', '无语'],
    commentMoves: ['轻接话', '共鸣细节', '不扩写'],
    quoteMoves: ['提炼生活感', '轻判断'],
    mustAvoid: ['硬总结', '过度共情'],
    goodCommentExamples: ['这种小烦最磨人，不大但会影响一整天。'],
    goodQuoteExamples: ['生活感很多时候就在这种小细节里。'],
  },
  general: {
    scene: 'general',
    label: '通用信息',
    anchors: ['条件', '价格', '时间', '地点', '周期', '材料', '要求', '方式', '范围'],
    commentMoves: ['追问关键缺失项', '轻判断信息完整度'],
    quoteMoves: ['提醒条件写完整', '提醒边界清楚'],
    mustAvoid: ['空泛总结', '平台口吻'],
    goodCommentExamples: ['时间和地点再具体一点，别人会更好接。'],
    goodQuoteExamples: ['这类信息把条件写完整，比反复私聊来回问更省事。'],
  },
};

function chars(text: string) {
  return Array.from(text || '');
}

function cut(text: string, limit: number) {
  return chars(text).slice(0, limit).join('');
}

export function cleanRobotReactionText(raw: unknown, max = 260) {
  const text = String(raw || '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
  return chars(text).length > max ? `${cut(text, max - 1)}…` : text;
}

export function compactRobotReactionText(raw: unknown) {
  return cleanRobotReactionText(raw, 500).replace(/[\s。.!！?？,，、；;：:"'“”‘’《》【】()[\]（）{}<>]/g, '').toLowerCase();
}

function stableIndex(seed: string, length: number) {
  let hash = 0;
  for (const char of seed) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
  return Math.abs(hash) % Math.max(1, length);
}

function textOf(post: RobotReactionPost) {
  return `${post.category?.slug || ''} ${post.category?.name || ''} ${post.title || ''} ${post.content || ''} ${post.location || ''} ${post.countryName || ''}`;
}

function displayText(post: RobotReactionPost) {
  return cleanRobotReactionText(`${post.title || ''}。${post.content || ''}。${post.location || ''}`, 700);
}

function anchor(post: RobotReactionPost, max = 14) {
  const title = cleanRobotReactionText(post.title, 100).replace(/[<>《》【】[\]()（）"'“”]/g, ' ').trim();
  if (title && !/^无标题$/i.test(title)) return cut(title, max);
  const body = cleanRobotReactionText(post.content, 180).replace(/[<>《》【】[\]()（）"'“”]/g, ' ').trim();
  return body ? cut(body, max) : '';
}

function extractNumbers(text: string) {
  return Array.from(new Set((text.match(/(?:\d+(?:\.\d+)?\s*(?:k|K|万|千|元|刀|美金|人民币|peso|比索|฿|₱|\$)?|\d+\s*(?:天|周|个月|年|小时|h|H)|押\d付\d|\d+\s*(?:室\d*厅?|人间|分钟|公里|km|KM)|[A-Z]{2,5}\s*\d{1,4})/g) || [])
    .map((item) => item.replace(/\s+/g, '').trim())
    .filter(Boolean)))
    .slice(0, 4);
}

function detectScene(post: RobotReactionPost): Scene {
  const raw = textOf(post);
  const compact = compactRobotReactionText(raw);
  if (SENSITIVE_SOURCE.test(raw)) return 'unsupported';
  if (/夜场|night|KTV|酒吧|订台|卡座|DJ|礼仪|会所|足疗|抽成|班次/i.test(raw)) return 'nightlife';
  if (/BTC|ETH|USDT|\bU\b|Bitcoin|Ethereum|Solana|DeFi|NFT|Layer2|空投|主网|智能合约|链上|代币|交易所|监管|加密|钱包|KYC|合约|出入金/i.test(raw)) return 'crypto';
  if (/Apple|iPhone|iPad|MacBook|\bMac\b|苹果|二手苹果|维修|换屏|美版|国行|港版|ID锁/i.test(raw)) return 'apple';
  if (/曝光|悬赏|跑路|卷款|欠款|偷盗|勒索|辟谣|缉拿|不守信用|失联|骗子|实名举报|避雷|纠纷|证据链|聊天记录/i.test(raw)) return 'exposure';
  if (/business|商业|公司|项目|合作|渠道|市场|品牌|供应链|投资|办公|园区|招商|加盟|代理|分销|联营|入驻|招募|合伙|区域代理|供需|供应|采购|承接|外包|对接|报价|交付|验收|售后/i.test(raw)) return 'business';
  if (/潮流|穿搭|球鞋|服饰|品牌|新品|发售|街头|时尚|尺码|真假|版本/i.test(raw)) return 'trend';
  if (/job|招聘|求职|岗位|薪资|工资|提成|工时|住宿|团队|上班|休息|试用期|入职|客服|销售|运营/i.test(raw)) return 'job';
  if (/housing|租房|房源|公寓|合租|押金|水电|楼层|通勤|月租|看房|房东|合同|水压|治安|转租/i.test(raw)) return 'housing';
  if (/secondhand|二手|手机|电脑|数码|成色|配件|验机|保修|解绑|办公椅|折叠桌|电动车|家具|电池|试骑|桌椅|自取|面交/i.test(raw)) return 'secondhand';
  if (/document|证件|签证|护照|材料|预约|出入境|周期|续签|补办|入境|逾期|拒签|递交/i.test(raw)) return 'visa';
  if (/restaurant|餐厅|美食|餐馆|吃|市场|人均|营业|菜|价位|招牌菜|菜单|外卖|夜宵/i.test(raw)) return 'food';
  if (/推广|流量|素材|转化|获客|投放|预算|账号|封号|风控|平台/i.test(raw)) return 'promotion';
  if (/财务|对账|流水|工资延迟|报销|账务|结算|收支|凭证/i.test(raw)) return 'finance';
  if (/技术|系统|网络|权限|服务器|电脑|远程|账号|bug|接口|部署|域名|日志|报错/i.test(raw)) return 'tech';
  if (/整顿|政策|新闻|风向|行情|市场|行业|收紧|大环境|变化|通报|公告|监管|官方/i.test(raw)) return 'industry';
  if (/先款|定金|转账|押金不退|跑路|骗局|隐私|证件照|包过|口头承诺/i.test(raw)) return 'risk';
  if (/希望|痛苦|难过|心累|累了|孤独|委屈|焦虑|遗憾|失落|撑着|emo|人生|命运|自由|后来|以前|突然|沉默|夜里|睡不着|放下|情绪|内耗/.test(compact)) return 'emotion';
  if (/今天|最近|刚刚|下班|上班路上|吃饭|天气|生活|日常|又是|还是|真的|突然|有点|烦|无语|吐槽|唠叨|碎碎念|记录一下|搬家/.test(compact)) return 'daily';
  return 'general';
}

export function detectRobotReactionIntent(post: RobotReactionPost): RobotReactionIntent {
  const scene = detectScene(post);
  if (scene === 'unsupported') return 'unsupported';
  if (scene === 'emotion') return 'emotional';
  if (scene === 'daily') return 'daily';
  if (scene === 'general') return hasSubstance(post) ? 'info' : 'unsupported';
  return 'info';
}

function strategyForScene(scene: Scene): ReactionStrategy | null {
  if (scene === 'unsupported') return null;
  return STRATEGIES[scene] || STRATEGIES.general;
}

export function getRobotReactionStrategy(post: RobotReactionPost) {
  return strategyForScene(detectScene(post)) || STRATEGIES.general;
}

export function getRobotReactionSignals(post: RobotReactionPost) {
  const raw = displayText(post);
  const compact = compactRobotReactionText(raw);
  const strategy = getRobotReactionStrategy(post);
  const matched = strategy.anchors.filter((word) => {
    const value = compactRobotReactionText(word);
    return value && compact.includes(value);
  });
  return Array.from(new Set([...matched, ...extractNumbers(raw)])).slice(0, 10);
}

export function describeRobotReactionStrategy(post: RobotReactionPost) {
  const strategy = getRobotReactionStrategy(post);
  return {
    scene: strategy.scene,
    label: strategy.label,
    anchors: strategy.anchors.slice(0, 14),
    matchedSignals: getRobotReactionSignals(post),
    commentMoves: strategy.commentMoves,
    quoteMoves: strategy.quoteMoves,
    mustAvoid: strategy.mustAvoid,
    goodCommentExamples: strategy.goodCommentExamples,
    goodQuoteExamples: strategy.goodQuoteExamples,
  };
}

function personaHint(robot: RobotReactionUser) {
  const raw = `${robot.displayName || ''} ${robot.bio || ''}`;
  if (/招聘|HR|岗位|薪资|客服|销售|运营/.test(raw)) return 'job';
  if (/租房|房东|搬家|通勤|水电/.test(raw)) return 'housing';
  if (/二手|验机|设备|技术|电脑|数码|Apple|苹果/.test(raw)) return 'secondhand';
  if (/签证|护照|材料|预约|行程|出入境/.test(raw)) return 'visa';
  if (/推广|渠道|市场|流量|转化|素材|招商|供需/.test(raw)) return 'promotion';
  if (/财务|对账|流水|报销/.test(raw)) return 'finance';
  if (/情绪|焦虑|上岸|稳定|慢热/.test(raw)) return 'emotion';
  return 'general';
}

function mk(kind: RobotReactionKind, content: string): Omit<RobotReactionCandidate, 'intent' | 'score'> {
  return { kind, content: cleanRobotReactionText(content, 120) };
}

function naturalize(content: string, mode: RobotReactionMode) {
  let text = cleanRobotReactionText(content, mode === 'quote' ? 86 : 52)
    .replace(/。{2,}/g, '。')
    .replace(/[，,、；;：:\s]+$/g, '')
    .trim();
  if (!/[。！？!?]$/.test(text)) text += /[?？]$/.test(text) ? '' : '。';
  return text;
}

function hasSubstance(post: RobotReactionPost) {
  const compact = `${compactRobotReactionText(post.title)}${compactRobotReactionText(post.content)}`;
  const raw = textOf(post);
  if (!compact) return false;
  if (SENSITIVE_SOURCE.test(raw)) return false;
  if (/测试|test|demo|样例|草稿|占位|随便发/.test(compact)) return false;
  if (LOW_VALUE_SOURCE.test(compact)) return false;
  if (compact.length < 12) return false;
  if (new Set(chars(compact)).size <= 4) return false;
  return true;
}

export function isLowSubstanceRobotSource(post: RobotReactionPost) {
  return !hasSubstance(post);
}

function sceneCandidates(scene: Scene, mode: RobotReactionMode, post: RobotReactionPost, robot: RobotReactionUser) {
  const a = anchor(post, 12);
  const signals = getRobotReactionSignals(post);
  const firstSignal = signals[0] || a || '条件';
  const secondSignal = signals.find((item) => item !== firstSignal) || '';
  const persona = personaHint(robot);
  const quoteLead = mode === 'quote' && a ? `${a}这类信息，` : '';
  const commentAsk = mode === 'comment';
  const out: Array<Omit<RobotReactionCandidate, 'intent' | 'score'>> = [];

  switch (scene) {
    case 'job':
      out.push(
        mk('ask', commentAsk ? `月休和结算周期写一下，工资才好判断。` : `${quoteLead}招聘别只看工资，试用期、休息和结算周期才是后面容易扯的点。`),
        mk('ask', `住宿是几人间？这个会影响到手感受。`),
        mk('judgment', `岗位边界和${secondSignal || '结算'}写清楚，比一句高薪更实用。`),
      );
      if (persona === 'job') out.unshift(mk('experience', `这种我会先看试用期和结算，口头说得再好也要落到条款。`));
      break;
    case 'housing':
      out.push(
        mk('ask', `押金和水电怎么算？月租只是第一眼。`),
        mk('ask', `通勤到哪里，这个最好一起写清。`),
        mk('judgment', `${quoteLead}租房最怕只看月租，押金、水电和通勤才是真成本。`),
        mk('experience', `便宜房源我会先看通勤和水压，不然住进去才难受。`),
      );
      break;
    case 'secondhand':
      out.push(
        mk('ask', `能当面验吗？二手最怕只看描述。`),
        mk('ask', `有没有实拍和瑕疵说明？这个比一句成色好更有用。`),
        mk('judgment', `${quoteLead}二手别急着谈价格，验机、解绑和瑕疵先说清才稳。`),
        mk('experience', `${firstSignal === '电池' ? '电池' : '成色'}要现场看，照片好看不一定代表没问题。`),
      );
      break;
    case 'visa':
      out.push(
        mk('ask', `这个周期是预约后算，还是递交后算？`),
        mk('ask', `材料清单如果能列出来，就好判断很多。`),
        mk('judgment', `${quoteLead}签证类信息最关键是材料和周期，少一个都会耽误事。`),
        mk('experience', `流程如果说得太满，我反而会先慢一点看。`),
      );
      break;
    case 'food':
      out.push(
        mk('ask', `位置在哪个区？晚一点还有没有营业。`),
        mk('ask', `人均和招牌菜有吗？这个更实用。`),
        mk('judgment', `${quoteLead}餐馆推荐最好带位置、人均和营业时间，不然只能靠猜。`),
      );
      break;
    case 'promotion':
      out.push(
        mk('ask', `转化和结算怎么说？只看渠道名看不出质量。`),
        mk('ask', `风控边界不写清，后面很难算账。`),
        mk('judgment', `${quoteLead}推广类别只讲量，素材、转化和结算边界不清都不好算。`),
      );
      break;
    case 'finance':
      out.push(
        mk('ask', `结算周期和凭证怎么留？财务这块最怕口头对账。`),
        mk('judgment', `${quoteLead}涉及账务就别嫌麻烦，流水、截图和结算口径要先留清楚。`),
      );
      break;
    case 'tech':
      out.push(
        mk('ask', `先看权限和报错截图吧，只说不能用很难判断。`),
        mk('judgment', `${quoteLead}系统问题要把环境、权限和报错放出来，不然只能来回猜。`),
      );
      break;
    case 'nightlife':
      out.push(
        mk('ask', `班次和抽成怎么说？这类岗位边界要写清。`),
        mk('ask', `住宿和地点如果能写明，判断会稳很多。`),
        mk('judgment', `${quoteLead}夜场岗位最怕只写高薪，班次、抽成和住宿边界更要清楚。`),
      );
      break;
    case 'crypto':
      out.push(
        mk('ask', `这个是链上数据还是群里消息？来源差很多。`),
        mk('ask', `出入金和 KYC 限制有没有说？这个别忽略。`),
        mk('judgment', `${quoteLead}币圈信息先看来源和链上证据，别被一句内部消息带着走。`),
      );
      break;
    case 'apple':
      out.push(
        mk('ask', `电池健康和维修记录最好一起放，不然不好估。`),
        mk('ask', `有没有 ID 锁和序列号信息？Apple 二手这个很关键。`),
        mk('judgment', `${quoteLead}二手 Apple 别只看成色，ID、维修和电池都要一起看。`),
      );
      break;
    case 'exposure':
      out.push(
        mk('ask', `金额、时间线和聊天记录最好放完整。`),
        mk('ask', `账号信息和证据链能对上吗？这点很关键。`),
        mk('judgment', `${quoteLead}曝光帖最重要是证据链，时间、金额和聊天记录要能对上。`),
      );
      break;
    case 'business':
      out.push(
        mk('ask', `交付周期和验收标准写一下，合作才好谈。`),
        mk('ask', `报价包含哪些内容？这个不写清后面容易扯。`),
        mk('judgment', `${quoteLead}供需合作别只谈报价，交付和验收边界不清后面最容易扯。`),
      );
      break;
    case 'trend':
      out.push(
        mk('ask', `尺码和版本要写清，不然很难判断合不合适。`),
        mk('ask', `有真假凭证或购买渠道吗？这个比图更关键。`),
        mk('judgment', `${quoteLead}潮流二手别只看图，版本、渠道和真假凭证才是重点。`),
      );
      break;
    case 'industry':
      out.push(
        mk('ask', `这个是官方通报还是转述？来源会影响判断。`),
        mk('judgment', `${quoteLead}新闻类先看来源和适用地区，别把转述直接当结论。`),
      );
      break;
    case 'risk':
      out.push(
        mk('ask', `有没有合同或聊天记录？没有的话后面很难说清。`),
        mk('judgment', `${quoteLead}先款、证件和口头承诺这几类，证据没留清就很被动。`),
      );
      break;
    case 'emotion':
      out.push(
        mk('empathy', `这种累不是一件事，是很多小事堆起来。`),
        mk('empathy', `这句没说满，反而挺真实。`),
        mk('empathy', mode === 'quote' ? `有些累不是大事本身，是一直没有确定感。` : `一直没有确定感，确实很耗人。`),
      );
      break;
    case 'daily':
      out.push(
        mk('daily_echo', `这种小烦最磨人，不大但会影响一整天。`),
        mk('daily_echo', `生活感很多时候就在这种小细节里。`),
      );
      break;
    case 'general':
      out.push(
        mk('ask', `${firstSignal || '时间'}再具体一点，别人会更好接。`),
        mk('judgment', `${quoteLead}这类信息把条件写完整，比反复私聊来回问更省事。`),
      );
      break;
  }

  return out.map((item) => ({ ...item, content: naturalize(item.content, mode) }));
}

function baseCandidates(post: RobotReactionPost, robot: RobotReactionUser, mode: RobotReactionMode) {
  const scene = detectScene(post);
  const intent = detectRobotReactionIntent(post);
  if (intent === 'unsupported' || scene === 'unsupported') return [];
  return sceneCandidates(scene, mode, post, robot).map((item) => ({ ...item, intent, score: 0 }));
}

export function robotReactionSignature(text: string) {
  return createHash('sha256').update(compactRobotReactionText(text).replace(/[“”"'《》【】()[\]（）]/g, '')).digest('hex');
}

function hasConcreteContext(post: RobotReactionPost, content: string) {
  const signals = getRobotReactionSignals(post);
  const scene = detectScene(post);
  if (signals.length === 0) return ['emotion', 'daily', 'general'].includes(scene);
  const compact = compactRobotReactionText(content);
  return signals.some((signal) => {
    const value = compactRobotReactionText(signal);
    return value.length >= 2 && compact.includes(value.slice(0, Math.min(5, value.length)));
  });
}

function hasCategoryAnchor(post: RobotReactionPost, content: string) {
  const strategy = getRobotReactionStrategy(post);
  const compact = compactRobotReactionText(content);
  return strategy.anchors.some((word) => {
    const value = compactRobotReactionText(word);
    return value.length >= 2 && compact.includes(value.slice(0, Math.min(5, value.length)));
  });
}

function tooManyActions(content: string) {
  const markers = [/先/, /再/, /同时/, /另外/, /还要/, /最好/, /应该/, /必须/, /建议/].filter((pattern) => pattern.test(content)).length;
  return markers >= 3;
}

function tooManyQuestions(content: string) {
  return (content.match(/[?？]/g) || []).length >= 2;
}

function quoteStandaloneBad(content: string) {
  if (FLOATING_QUOTE.test(content)) return true;
  if (QUOTE_WEAK_START.test(content) && chars(content).length < 28) return true;
  if (/^(这个|这种|这条|这类)/.test(content) && !/(招聘|租房|二手|Apple|签证|证件|餐馆|渠道|推广|供需|合作|曝光|证据|币圈|夜场|岗位|房源|押金|工资|材料|验机|电池|结算|合同|水电)/.test(content)) return true;
  return false;
}

function categoryBanned(post: RobotReactionPost, content: string) {
  const scene = detectScene(post);
  if (PROMISE_OR_ILLEGAL.test(content)) return true;
  if (scene === 'crypto' && /(稳赚|带单|喊单|百倍|内部消息|开户链接|合约群|老师)/i.test(content)) return true;
  if (scene === 'nightlife' && /(裸聊|外围|特殊服务|出台|低俗|擦边)/i.test(content)) return true;
  if ((scene === 'visa' || scene === 'risk') && /(包过|走关系|买通|绕关|特殊通道)/i.test(content)) return true;
  if (scene === 'exposure' && /(一定是骗子|直接人肉|网暴|弄死|搞他|她就是)/i.test(content)) return true;
  return false;
}

export function scoreRobotReaction(post: RobotReactionPost, candidate: RobotReactionCandidate, mode: RobotReactionMode) {
  const reasons: string[] = [];
  let score = 0;
  const content = cleanRobotReactionText(candidate.content, 140);
  const len = chars(content).length;
  const scene = detectScene(post);
  const strategy = getRobotReactionStrategy(post);

  if (isLowSubstanceRobotSource(post)) reasons.push('low_substance_source');
  if (candidate.intent === 'unsupported' || scene === 'unsupported') reasons.push('unsupported_source_intent');
  if (!content.trim()) reasons.push('empty_generated_content');
  if (len < (mode === 'quote' ? 18 : 10)) reasons.push('too_short'); else score += 2;
  if (len > (mode === 'quote' ? 78 : 48)) reasons.push('too_long'); else score += 1;
  if (SPAM_OR_REDIRECT.test(content)) reasons.push('blocked_redirect_or_payment');
  if (GENERIC_SHORT.test(content)) reasons.push('generic_short');
  if (ADMIN_OR_AI_SMELL.test(content)) reasons.push('admin_or_ai_smell');
  if (categoryBanned(post, content)) reasons.push('category_banned_tone');
  if (tooManyActions(content)) reasons.push('too_many_actions');
  if (tooManyQuestions(content)) reasons.push('too_many_questions');
  if (!hasConcreteContext(post, content)) reasons.push('not_tied_to_source'); else score += 3;
  if (hasCategoryAnchor(post, content)) score += 4; else if (candidate.intent === 'info') reasons.push('missing_category_anchor');

  if (mode === 'comment') {
    if (/[?？]/.test(content)) score += 3;
    if (/怎么|多少|多久|有没有|能不能|写一下|放出来|怎么算|哪儿|哪个|几人间|周期|口径|边界|验收|凭证/.test(content)) score += 3;
    if (/总结|整体|值得关注|参考一下|进一步了解|理性判断/.test(content)) reasons.push('comment_too_editorial');
  }

  if (mode === 'quote') {
    if (quoteStandaloneBad(content)) reasons.push('quote_not_standalone'); else score += 3;
    if (/[?？]$/.test(content)) reasons.push('quote_should_not_be_pure_question');
    if (/别只|最怕|关键|成本|边界|写清|说清|先看|证据链|周期|结算|押金|验机|材料|来源|交付|验收/.test(content)) score += 4;
    if (!/(招聘|租房|二手|Apple|签证|证件|餐馆|渠道|推广|供需|合作|曝光|证据|币圈|夜场|岗位|房源|押金|工资|材料|验机|电池|结算|合同|水电|交付|验收|来源|链上)/.test(content) && !['emotion', 'daily'].includes(scene)) reasons.push('quote_lacks_scene_word');
  }

  if ((candidate.intent === 'emotional' || candidate.intent === 'daily') && /不是|主要|一直|反而|真实|没说满|心里|情绪|生活|磨人|放大|确定感|撑|细节/.test(content)) score += 5;
  if (/[，。！？!?]$/.test(content)) score += 1; else reasons.push('incomplete_end');
  if (/^(这个|这种|那种).{0,6}[。！？!?]?$/.test(content)) reasons.push('too_vague');
  if (strategy.mustAvoid.some((item) => content.includes(item))) reasons.push('strategy_must_avoid');

  return { ok: reasons.length === 0 && score >= (mode === 'quote' ? 13 : 11), score, reason: reasons.join(',') || undefined };
}

export function buildRobotReactionCandidates(post: RobotReactionPost, robot: RobotReactionUser, mode: RobotReactionMode) {
  const seeded = baseCandidates(post, robot, mode);
  const offset = seeded.length ? stableIndex(`${post.id}:${robot.id}:${mode}:${personaHint(robot)}`, seeded.length) : 0;
  const rotated = seeded.slice(offset).concat(seeded.slice(0, offset));
  return rotated.map((item) => {
    const content = naturalize(item.content, mode);
    const next = { ...item, content };
    const quality = scoreRobotReaction(post, next, mode);
    return { ...next, score: quality.score, reason: quality.reason };
  }).sort((a, b) => b.score - a.score);
}

export function pickBestRobotReaction(post: RobotReactionPost, robot: RobotReactionUser, mode: RobotReactionMode) {
  const candidates = buildRobotReactionCandidates(post, robot, mode);
  for (const candidate of candidates) {
    const quality = scoreRobotReaction(post, candidate, mode);
    if (quality.ok) return { ...candidate, score: quality.score, reason: quality.reason };
  }
  const fallback = candidates[0];
  if (!fallback) return { content: '', intent: detectRobotReactionIntent(post), kind: 'judgment' as RobotReactionKind, score: 0, reason: 'no_reaction_candidate' };
  const quality = scoreRobotReaction(post, fallback, mode);
  return { ...fallback, score: quality.score, reason: quality.reason || 'quality_gate_rejected' };
}
