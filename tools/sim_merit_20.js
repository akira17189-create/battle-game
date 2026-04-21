/**
 * 第一章通关战功蒙特卡洛模拟（非浏览器内真实对战）。
 * 复刻 main.js 中 computeChapterMerit 的 turn_merit_sum + chapterBonus 与档位判定口径。
 * 运行：node tools/sim_merit_20.js [局数]，默认 100。
 */
/* eslint-disable no-console */

const MERIT_SCORE_SCALE = 10;

const MERIT_GRADE_RULES_DESC = [
  { minScore: 90000, grade: "神将" },
  { minScore: 80000, grade: "飞将" },
  { minScore: 70000, grade: "名将" },
  { minScore: 55000, grade: "骁将" },
  { minScore: 45000, grade: "健将" },
  { minScore: 40001, grade: "勇将" },
];

function meritGradeFromChapterScore(finalMeritScore) {
  const v = Number(finalMeritScore);
  const score = Number.isFinite(v) ? v : 0;
  if (score >= 100000) return "天命";
  if (score <= 40000) return "战将";
  for (const r of MERIT_GRADE_RULES_DESC) {
    if (score >= r.minScore) return r.grade;
  }
  return "战将";
}

function meritSumWithFloor0(logs) {
  let v = 0;
  for (const r of logs || []) {
    v = Math.max(0, v + (r?.turnMeritDelta || 0));
  }
  return v;
}

function computeChapterMeritNumeric(state) {
  const logs = Array.isArray(state.chapterMeritLog) ? state.chapterMeritLog : [];
  const turn_merit_sum = meritSumWithFloor0(logs);

  let chapterBonus = 0;
  const totalTurnCount = logs.reduce(
    (a, r) => a + (r?.battleId && !r.meta?.victoryRestoration ? 1 : 0),
    0,
  );
  const S = MERIT_SCORE_SCALE;
  if (totalTurnCount <= 35 && totalTurnCount > 0) chapterBonus += 80 * S;

  const total_death_retry = Object.values(state.meritChapter?.retries || {}).reduce((a, x) => a + (x || 0), 0);
  if (total_death_retry === 0) chapterBonus += 100 * S;

  const bossTurns = logs.filter((r) => r?.battleId === "BOSS");
  if (bossTurns.length) {
    const bossHadBroken = bossTurns.some((r) => (r.negativeEvents || []).some((e) => e.code === "self_broken"));
    const bossHadExecTaken = bossTurns.some((r) =>
      (r.negativeEvents || []).some((e) => e.code === "boss_execute_taken"),
    );
    const bossWinHpOk =
      state.meritChapter?.records?.BOSS?.max_hp > 0 &&
      state.meritChapter.records.BOSS.win_hp >= Math.floor(state.meritChapter.records.BOSS.max_hp * 0.5);
    if (bossWinHpOk && !bossHadBroken && !bossHadExecTaken) chapterBonus += 120 * S;
  }

  const execCount = logs.reduce(
    (a, r) =>
      a +
      (r?.positiveEvents || []).filter((e) => ["execute_normal", "execute_elite", "execute_boss"].includes(e.code))
        .length,
    0,
  );
  if (execCount >= 5) chapterBonus += 60 * S;

  const prof = state.chapterHeroProfile;
  if (
    prof &&
    (prof.actions.attack || 0) >= 1 &&
    (prof.actions.heavy || 0) >= 1 &&
    (prof.actions.defend || 0) >= 1 &&
    (prof.actions.block || 0) >= 1 &&
    (prof.actions.rest || 0) >= 1
  ) {
    chapterBonus += 80 * S;
  }

  let maxMomentumChapter = 0;
  for (const r of logs) {
    if (r?.meta?.victoryRestoration) continue;
    const m = Number(r?.momentumAfter);
    if (Number.isFinite(m)) maxMomentumChapter = Math.max(maxMomentumChapter, m);
  }
  if (maxMomentumChapter >= 4) chapterBonus += 120 * S;

  const final_merit_score = turn_merit_sum + chapterBonus;
  const grade = meritGradeFromChapterScore(final_merit_score);

  return {
    final_merit_score,
    turn_merit_sum,
    chapterBonus,
    grade,
    total_turn_count: totalTurnCount,
  };
}

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const BATTLES = [
  { id: "B1", limit: 10 },
  { id: "B2", limit: 10 },
  { id: "E1", limit: 10 },
  { id: "B3", limit: 15 },
  { id: "BOSS", limit: 15 },
];

/** 单回合显示战功：偏右的长尾，与常见逐回合结算量级相近 */
function sampleTurnDelta(rng) {
  const u = rng();
  const base = 180 + Math.floor(rng() * 3200);
  const spike = u > 0.92 ? Math.floor(rng() * 4000) : 0;
  return base + spike;
}

function sampleVictoryRestoration(rng) {
  return Math.round(rng() * 420);
}

function generateOneRun(rng) {
  const logs = [];
  let execTagged = 0;

  for (const b of BATTLES) {
    const minT = 3;
    const turns = minT + Math.floor(rng() * (b.limit - minT + 1));
    for (let i = 0; i < turns; i++) {
      const pos = [];
      if (execTagged < 8 && rng() > 0.55) {
        const kinds = b.id === "BOSS" ? ["execute_boss", "execute_elite", "execute_normal"] : ["execute_normal"];
        pos.push({ code: kinds[Math.floor(rng() * kinds.length)], value: 1 });
        execTagged++;
      }
      const neg = [];
      if (b.id === "BOSS" && rng() < 0.08) neg.push({ code: "self_broken", value: 1 });
      if (b.id === "BOSS" && rng() < 0.03) neg.push({ code: "boss_execute_taken", value: 1 });

      const mom =
        rng() < 0.35 ? Math.min(5, 2 + Math.floor(rng() * 4)) : Math.floor(rng() * 3);

      logs.push({
        battleId: b.id,
        turnMeritDelta: sampleTurnDelta(rng),
        positiveEvents: pos,
        negativeEvents: neg,
        momentumAfter: mom,
        meta: { action: ["attack", "heavy", "defend", "block", "rest"][Math.floor(rng() * 5)] },
      });
    }
    logs.push({
      battleId: b.id,
      turnMeritDelta: sampleVictoryRestoration(rng),
      positiveEvents: [],
      negativeEvents: [],
      meta: { victoryRestoration: true },
    });
  }

  const state = {
    chapterMeritLog: logs,
    meritChapter: {
      retries: { B1: 0, B2: 0, E1: 0, B3: 0, BOSS: 0 },
      records: {
        BOSS: {
          max_hp: 100,
          win_hp: rng() < 0.15 ? 30 : 60,
        },
      },
    },
    chapterHeroProfile: {
      actions:
        rng() < 0.88
          ? { attack: 1, heavy: 1, defend: 1, block: 1, rest: 1, execute: 1 }
          : { attack: 1, heavy: 1, defend: 1, block: 0, rest: 1, execute: 1 },
    },
  };

  return computeChapterMeritNumeric(state);
}

const seed = 20260418;
const rng = mulberry32(seed);

const N = Math.max(1, Math.min(100000, parseInt(String(process.argv[2] || "100"), 10) || 100));

const rows = [];
for (let i = 1; i <= N; i++) {
  const r = generateOneRun(rng);
  rows.push({ run: i, ...r });
}

const scores = rows.map((x) => x.final_merit_score);
const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
const min = Math.min(...scores);
const max = Math.max(...scores);

const gradeCount = {};
for (const r of rows) {
  gradeCount[r.grade] = (gradeCount[r.grade] || 0) + 1;
}

const sorted = [...scores].sort((a, b) => a - b);
const p50 = sorted[Math.floor((N - 1) * 0.5)];
const p90 = sorted[Math.floor((N - 1) * 0.9)];

console.log(`模拟：第一章通关 × ${N}（随机种子 ${seed}；非真实对战，仅数值口径演示）\n`);
const over100k = scores.filter((s) => s > 100000).length;
const over90k = scores.filter((s) => s >= 90000).length;
console.log(`平均 ${avg.toFixed(1)}｜最低 ${min}｜最高 ${max}｜P50 ${p50}｜P90 ${p90}`);
console.log(`≥90000（神将线）：${over90k} 局｜>100000：${over100k} 局`);
console.log("档位分布：" + JSON.stringify(gradeCount));
console.log("");

const showTable = N <= 30;
if (showTable) {
  console.log("| # | 总战功 | 逐回合累计 | 章节加成 | 交手回合 | 档位 |");
  console.log("|---:|---:|---:|---:|---:|---|");
  for (const r of rows) {
    console.log(
      `| ${r.run} | ${r.final_merit_score} | ${r.turn_merit_sum} | ${r.chapterBonus} | ${r.total_turn_count} | ${r.grade} |`,
    );
  }
} else {
  console.log("（局数>30，不逐行打印；前5局与后5局示例）\n");
  const sample = [...rows.slice(0, 5), ...rows.slice(-5)];
  console.log("| # | 总战功 | 逐回合累计 | 章节加成 | 交手回合 | 档位 |");
  console.log("|---:|---:|---:|---:|---:|---|");
  for (const r of sample) {
    console.log(
      `| ${r.run} | ${r.final_merit_score} | ${r.turn_merit_sum} | ${r.chapterBonus} | ${r.total_turn_count} | ${r.grade} |`,
    );
  }
}
