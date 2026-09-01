import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = process.cwd();
const generation = fs.readFileSync(path.join(root, 'server/services/robot-content-generation.service.ts'), 'utf8');

assert.match(generation, /EMOTIONAL_MATCH_RE/, 'robot comment generation must detect emotional/poetic source content.');
assert.match(generation, /EMOTIONAL_SOURCE_TERMS/, 'robot comment generation must extract emotional source terms.');
assert.match(generation, /EMOTIONAL_FIELD_TERMS/, 'robot comment generation must use emotional feeling terms instead of classified-info fields.');
assert.match(generation, /buildEmotionCommentPrompt/, 'robot comment generation must have a dedicated emotional comment prompt.');
assert.match(generation, /不要补价格、地点、费用、周期这类字段/, 'emotional posts must not be forced through classified-info field completion.');
assert.match(generation, /严禁复制原帖原句，连续 8 个字相同就算失败/, 'comment prompt must explicitly forbid source copying.');
assert.match(generation, /function copiedFromSource/, 'robot comment generation must reject candidates copied from source text.');
assert.match(generation, /source\.includes\(compact\.slice\(index, index \+ COPY_NGRAM_MIN\)\)/, 'copy guard must reject long n-gram overlap with source text.');
assert.match(generation, /const intent = isEmotionProfile\(profile\) \? 'emotional' : detectRobotReactionIntent\(post\)/, 'emotional posts must be scored as emotional reactions, not generic info.');
assert.doesNotMatch(generation, /目标：只补一个缺失字段短片段[\s\S]{0,300}(?:岁月|红尘|江湖)/, 'poetic terms must not be handled by the generic missing-field prompt.');

console.log('[robot-comment-generation-guards] passed');
