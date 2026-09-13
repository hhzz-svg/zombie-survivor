/**
 * Balance report. Runs the headless simulation across many seeds and operatives and prints a
 * markdown summary: win rate, survival, what the bot ends up holding, and what kills it.
 *
 * This is the project's most distinctive asset finally pointed at tuning instead of just
 * regression-catching. The numbers describe a scripted bot, not a human — treat them as a
 * comparison between builds and patches, not as absolute difficulty.
 *
 *   npm run balance                          # 30 seeds × 3 operatives × 260s
 *   npm run balance -- --seeds=100 --seconds=300
 *   npm run balance -- --ops=hunter --policy=first
 *   npm run balance -- --json=/tmp/balance.json
 */
import { writeFileSync } from 'node:fs';
import { runHeadless, type SimResult, type ChoicePolicy } from '../src/sim/headless';
import { OPERATIVES } from '../src/data/operatives';
import { WEAPONS } from '../src/data/weapons';
import { PASSIVES } from '../src/data/passives';
import { SKILLS } from '../src/data/skills';

function arg(name: string, fallback: string): string {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
}

const seeds = Number(arg('seeds', '30'));
const seconds = Number(arg('seconds', '260'));
const policy = arg('policy', 'greedy') as ChoicePolicy;
const opFilter = arg('ops', 'all');
const jsonOut = arg('json', '');
const ops = opFilter === 'all'
  ? OPERATIVES.map((o) => o.id)
  : opFilter.split(',').map((s) => s.trim()).filter(Boolean);

const pct = (n: number, of: number) => (of === 0 ? '—' : `${((n / of) * 100).toFixed(0)}%`);
const median = (xs: number[]) => {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const mean = (xs: number[]) => (xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length);
const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

const started = Date.now();
const all: SimResult[] = [];
for (const op of ops) {
  for (let i = 0; i < seeds; i++) {
    all.push(runHeadless(i + 1, seconds, { operative: op, policy }));
  }
}
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

const lines: string[] = [];
lines.push(`# 平衡报告`);
lines.push('');
lines.push(`${seeds} 个种子 × ${ops.length} 名干员 · 每局上限 ${seconds}s · 选牌策略 \`${policy}\` · 耗时 ${elapsed}s`);
lines.push('');
lines.push('> 数据来自脚本 AI，不是真人。用来横向比较版本与 build，不要当成绝对难度。');
lines.push('');

// --- per operative ----------------------------------------------------------
lines.push('## 干员');
lines.push('');
lines.push('| 干员 | 胜率 | 中位存活 | 平均存活 | 中位击杀 | 平均等级 | 进化达成 | 中位金币 |');
lines.push('|---|---|---|---|---|---|---|---|');
for (const op of ops) {
  const rows = all.filter((r) => r.operative === op);
  lines.push(`| ${op} | ${pct(rows.filter((r) => r.bossDead).length, rows.length)} `
    + `| ${mmss(median(rows.map((r) => r.survivedSec)))} `
    + `| ${mmss(mean(rows.map((r) => r.survivedSec)))} `
    + `| ${median(rows.map((r) => r.kills)).toFixed(0)} `
    + `| ${mean(rows.map((r) => r.level)).toFixed(1)} `
    + `| ${pct(rows.filter((r) => r.evolved).length, rows.length)} `
    + `| ${median(rows.map((r) => r.gold)).toFixed(0)} |`);
}
lines.push('');

// --- weapons ----------------------------------------------------------------
lines.push('## 武器出场率');
lines.push('');
lines.push('局末仍在配装里的比例。基础形态与进化形态分开统计——`—` 表示一次都没出现过。');
lines.push('');
lines.push('| 武器 | 出场率 | 平均等级 |');
lines.push('|---|---|---|');
for (const id of Object.keys(WEAPONS)) {
  const held = all.filter((r) => r.weapons.some((w) => w.startsWith(`${id}:`)));
  const levels = held.map((r) => Number(r.weapons.find((w) => w.startsWith(`${id}:`))!.split(':')[1]));
  lines.push(`| ${WEAPONS[id]!.name} \`${id}\` | ${held.length === 0 ? '—' : pct(held.length, all.length)} `
    + `| ${held.length === 0 ? '—' : mean(levels).toFixed(1)} |`);
}
lines.push('');

// --- passives ---------------------------------------------------------------
lines.push('## 强化出场率');
lines.push('');
lines.push('| 强化 | 出场率 | 平均等级 |');
lines.push('|---|---|---|');
for (const p of PASSIVES) {
  const held = all.filter((r) => r.passives.some((x) => x.startsWith(`${p.id}:`)));
  const levels = held.map((r) => Number(r.passives.find((x) => x.startsWith(`${p.id}:`))!.split(':')[1]));
  lines.push(`| ${p.name} \`${p.id}\` | ${held.length === 0 ? '—' : pct(held.length, all.length)} `
    + `| ${held.length === 0 ? '—' : mean(levels).toFixed(1)} |`);
}
lines.push('');

// --- skills -----------------------------------------------------------------
lines.push('## 主动技能购买率');
lines.push('');
lines.push('| 技能 | 购买率 |');
lines.push('|---|---|');
for (const skill of SKILLS) {
  const bought = all.filter((r) => r.skills.includes(skill.id));
  lines.push(`| ${skill.name} \`${skill.id}\` | ${bought.length === 0 ? '—' : pct(bought.length, all.length)} |`);
}
lines.push('');

// --- what kills the bot -----------------------------------------------------
lines.push('## 死亡原因');
lines.push('');
const causes = new Map<string, number>();
for (const r of all.filter((x) => x.died)) causes.set(r.cause, (causes.get(r.cause) ?? 0) + 1);
const deaths = all.filter((x) => x.died).length;
lines.push(`阵亡 ${deaths} / ${all.length} 局。`);
lines.push('');
lines.push('| 原因 | 占阵亡 |');
lines.push('|---|---|');
for (const [cause, n] of [...causes].sort((a, b) => b[1] - a[1])) {
  lines.push(`| ${cause} | ${pct(n, deaths)} |`);
}
lines.push('');

// --- how far runs get -------------------------------------------------------
lines.push('## 抵达阶段');
lines.push('');
lines.push('| 阶段 | 抵达比例 |');
lines.push('|---|---|');
for (let stage = 1; stage <= 5; stage++) {
  lines.push(`| ${stage} | ${pct(all.filter((r) => r.stage >= stage).length, all.length)} |`);
}
lines.push('');

const report = lines.join('\n');
process.stdout.write(`${report}\n`);
if (jsonOut) {
  writeFileSync(jsonOut, JSON.stringify(all, null, 2));
  process.stderr.write(`\nwrote ${all.length} runs to ${jsonOut}\n`);
}
