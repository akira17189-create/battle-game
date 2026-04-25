/**
 * 将魂结果蒙特卡洛：复用 sim_merit_20 的战功生成口径，并累计 chapterHeroProfile + 实调 resolveGeneralSoul105。
 * 运行：node tools/sim_soul_runs.js [局数]，默认 100。
 * 导出表：加 --csv 写入项目根目录 soul_100_runs.csv（已 .gitignore）；或 --out=D:\\path\\x.csv
 */
/* eslint-disable no-console */

const fs = require("fs");
const path = require("path");
const vm = require("vm");

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

  const bossTurns = logs.filter((r) => r?.battleId === "B5");
  if (bossTurns.length) {
    const bossHadBroken = bossTurns.some((r) => (r.negativeEvents || []).some((e) => e.code === "self_broken"));
    const bossHadExecTaken = bossTurns.some((r) =>
      (r.negativeEvents || []).some((e) => e.code === "boss_execute_taken"),
    );
    const bossWinHpOk =
      state.meritChapter?.records?.B5?.max_hp > 0 &&
      state.meritChapter.records.B5.win_hp >= Math.floor(state.meritChapter.records.B5.max_hp * 0.5);
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
  { id: "B3", limit: 10 },
  { id: "B4", limit: 15 },
  { id: "B5", limit: 15 },
];

function sampleTurnDelta(rng) {
  const u = rng();
  const base = 180 + Math.floor(rng() * 3200);
  const spike = u > 0.92 ? Math.floor(rng() * 4000) : 0;
  return base + spike;
}

function sampleVictoryRestoration(rng) {
  return Math.round(rng() * 420);
}

function createEmptyProfile() {
  return {
    actions: { attack: 0, heavy: 0, defend: 0, block: 0, rest: 0, execute: 0 },
    outcomes: {
      attackHit: 0,
      heavyHit: 0,
      counterHeavy: 0,
      interruptHeavy: 0,
      enemyBroken: 0,
      selfBroken: 0,
      gotHitQuick: 0,
      gotHitHeavy: 0,
      blockFailVsQuick: 0,
      restHit: 0,
    },
    special: {
      lowHpHit: 0,
      lowHpExecute: 0,
      multiEnemyBreak: 0,
      multiEnemyExecute: 0,
      bossExecuteTaken: 0,
      executeNormal: 0,
      executeElite: 0,
      executeBoss: 0,
    },
    totals: {
      totalTurns: 0,
      totalBattles: 0,
      maxComboReached: 0,
      finalMerit: 0,
    },
  };
}

function countEvent(prof, code, n = 1) {
  const o = prof.outcomes;
  const s = prof.special;
  switch (code) {
    case "attack_hit":
      o.attackHit += n;
      break;
    case "heavy_hit":
      o.heavyHit += n;
      break;
    case "counter_heavy":
      o.counterHeavy += n;
      break;
    case "interrupt_heavy":
      o.interruptHeavy += n;
      break;
    case "enemy_broken":
      o.enemyBroken += n;
      break;
    case "self_broken":
      o.selfBroken += n;
      break;
    case "got_hit_quick":
      o.gotHitQuick += n;
      break;
    case "got_hit_heavy":
      o.gotHitHeavy += n;
      break;
    case "block_fail_vs_quick":
      o.blockFailVsQuick += n;
      break;
    case "rest_hit":
      o.restHit += n;
      break;
    case "lowhp_hit_bonus":
      s.lowHpHit += n;
      break;
    case "lowhp_execute_bonus":
      s.lowHpExecute += n;
      break;
    case "multi_enemy_break_bonus":
      s.multiEnemyBreak += n;
      break;
    case "multi_enemy_execute_bonus":
      s.multiEnemyExecute += n;
      break;
    case "boss_execute_taken":
      s.bossExecuteTaken += n;
      break;
    case "execute_normal":
      s.executeNormal += n;
      break;
    case "execute_elite":
      s.executeElite += n;
      break;
    case "execute_boss":
      s.executeBoss += n;
      break;
    default:
      break;
  }
}

function recordHeroProfileFromTurnRecord(prof, rec) {
  if (!rec || rec.meta?.victoryRestoration || rec.meta?.battleRemainTurnBonus) return;
  const act = rec.meta?.action;
  if (act === "attack" || act === "heavy" || act === "defend" || act === "block" || act === "rest") {
    prof.actions[act] += 1;
  } else if (act === "execute") {
    const pos = rec.positiveEvents || [];
    if (pos.some((e) => ["execute_normal", "execute_elite", "execute_boss"].includes(e.code))) {
      prof.actions.execute += 1;
    }
  }
  for (const e of rec.positiveEvents || []) countEvent(prof, e.code, 1);
  for (const e of rec.negativeEvents || []) countEvent(prof, e.code, 1);
}

/** 与 main 一致：随机动作 + 战功元数据，供 aggregateSoulLogs 使用 */
function generateOneRun(rng) {
  const logs = [];
  let execTagged = 0;

  for (const b of BATTLES) {
    const minT = 3;
    const turns = minT + Math.floor(rng() * (b.limit - minT + 1));
    for (let i = 0; i < turns; i++) {
      const pos = [];
      if (execTagged < 8 && rng() > 0.55) {
        const kinds = b.id === "B5" ? ["execute_boss", "execute_elite", "execute_normal"] : ["execute_normal"];
        pos.push({ code: kinds[Math.floor(rng() * kinds.length)], value: 1 });
        execTagged++;
      }
      const neg = [];
      if (b.id === "B5" && rng() < 0.08) neg.push({ code: "self_broken", value: 1 });
      if (b.id === "B5" && rng() < 0.03) neg.push({ code: "boss_execute_taken", value: 1 });

      const mom = rng() < 0.35 ? Math.min(5, 2 + Math.floor(rng() * 4)) : Math.floor(rng() * 3);

      const delta = sampleTurnDelta(rng);
      const dmgT = rng() < 0.28 ? 0 : Math.floor(rng() * 45);
      if (rng() < 0.12 && pos.length === 0) {
        if (rng() < 0.33) pos.push({ code: "attack_hit", value: 1 });
        else if (rng() < 0.5) pos.push({ code: "heavy_hit", value: 1 });
        else if (rng() < 0.66) pos.push({ code: "enemy_broken", value: 1 });
        else pos.push({ code: "counter_heavy", value: 1 });
      }

      logs.push({
        battleId: b.id,
        turnMeritDelta: delta,
        positiveBase: Math.max(0, delta),
        positiveEvents: pos,
        negativeEvents: neg,
        momentumAfter: mom,
        meta: {
          action: ["attack", "heavy", "defend", "block", "rest"][Math.floor(rng() * 5)],
          damageDealtTotal: Math.floor(rng() * 900 + 40),
          damageTakenThisTurn: dmgT,
          healDoneTotal: rng() < 0.1 ? Math.floor(rng() * 100) : 0,
          aliveEnemyCountEnd: rng() < 0.2 ? 2 : 1,
          counterQuickDefend: rng() < 0.07,
          punishAdjust: rng() < 0.05,
          breakDefense: rng() < 0.06,
        },
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

  const prof = createEmptyProfile();
  for (const rec of logs) {
    recordHeroProfileFromTurnRecord(prof, rec);
  }

  const state = {
    chapterId: "chapter1",
    chapterMeritLog: logs,
    meritChapter: {
      retries: { B1: 0, B2: 0, B3: 0, B4: 0, B5: 0 },
      records: {
        B5: {
          max_hp: 100,
          win_hp: rng() < 0.15 ? 30 : 60,
        },
      },
    },
    chapterHeroProfile: prof,
    _behaviorPhaseLockSnapshot: null,
    _mainBehaviorHistory: [],
  };

  const report = computeChapterMeritNumeric(state);
  let maxM = 0;
  for (const r of logs) {
    if (r?.meta?.victoryRestoration) continue;
    const m = Number(r?.momentumAfter);
    if (Number.isFinite(m)) maxM = Math.max(maxM, m);
  }
  prof.totals.totalTurns = report.total_turn_count || 0;
  prof.totals.totalBattles = Object.keys(state.meritChapter?.records || {}).length;
  prof.totals.maxComboReached = maxM;
  prof.totals.finalMerit = report.final_merit_score;

  return { state, report };
}

// —— 加载浏览器将魂脚本 ——
global.window = global;
const root = path.join(__dirname, "..");
function loadSoulScript(rel) {
  const code = fs.readFileSync(path.join(root, rel), "utf8");
  vm.runInThisContext(code, { filename: rel });
}
loadSoulScript("general_soul_lookup.js");
loadSoulScript("general_soul_lore_105.js");
loadSoulScript("general_soul_scoring.js");

const resolveGeneralSoul105 = global.resolveGeneralSoul105;
const BEHAVIOR_TO_DESTINY_SOUL = global.GeneralSoul105Scoring.BEHAVIOR_TO_DESTINY_SOUL;
const DESTINY_MERIT_SCORE_MIN = global.GeneralSoul105Scoring.DESTINY_MERIT_SCORE_MIN;

const seed = 20260421;
const rng = mulberry32(seed);

const argv = process.argv.slice(2);
let N = 100;
let csvOutPath = /** @type {string|null} */ (null);
for (const a of argv) {
  if (a === "--csv") {
    csvOutPath = path.join(root, "soul_100_runs.csv");
  } else if (a.startsWith("--out=")) {
    csvOutPath = path.resolve(a.slice(6));
  } else if (/^\d+$/.test(a)) {
    N = Math.max(1, Math.min(50000, parseInt(a, 10)));
  }
}
N = Math.max(1, Math.min(50000, N || 100));

function csvEscape(cell) {
  const s = String(cell ?? "");
  if (/[",\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

const rows = [];
const behaviorCount = {};
const heroCount = {};
const gradeCount = {};
let destinyHits = 0;

for (let i = 1; i <= N; i++) {
  const { state, report } = generateOneRun(rng);
  state._behaviorPhaseLockSnapshot = null;
  const soul = resolveGeneralSoul105(
    state,
    state.chapterHeroProfile,
    report.final_merit_score,
    MERIT_SCORE_SCALE,
    report.grade,
    "",
  );
  const v = soul && soul.heroVerdict ? soul.heroVerdict : {};
  const hero = String(v.heroPrimaryName || "—").trim();
  const behavior = soul && soul.behaviorName ? soul.behaviorName : "—";
  const isDest = !!v.isDestinyTier;
  const tier = isDest ? "天命之魂" : "105将魂表";

  heroCount[hero] = (heroCount[hero] || 0) + 1;
  behaviorCount[behavior] = (behaviorCount[behavior] || 0) + 1;
  gradeCount[report.grade] = (gradeCount[report.grade] || 0) + 1;
  if (isDest) destinyHits++;

  rows.push({
    run: i,
    finalMerit: report.final_merit_score,
    grade: report.grade,
    mainBehavior: behavior,
    hero,
    tier,
    destiny: isDest,
  });
}

console.log(`将魂模拟 × ${N}（种子 ${seed}；战功/侧写口径同 sim_merit_20 + main 累计逻辑）\n`);
console.log(`天命线：总战功≥${DESTINY_MERIT_SCORE_MIN} 且走天命之魂池。本批「天命之魂」出现：${destinyHits} / ${N}\n`);

console.log("战评档分布：" + JSON.stringify(gradeCount, null, 0));
console.log("");
console.log("主行为（定相）分布（次数）：");
Object.keys(behaviorCount)
  .sort((a, b) => behaviorCount[b] - behaviorCount[a])
  .forEach((k) => console.log(`  ${k}：${behaviorCount[k]}`));
console.log("");
console.log("将魂（武将）分布（次数）：");
Object.keys(heroCount)
  .sort((a, b) => heroCount[b] - heroCount[a])
  .forEach((k) => console.log(`  ${k}：${heroCount[k]}`));
console.log("");

const showAll = N <= 100;
if (showAll) {
  console.log("| # | 总战功 | 战评 | 主行为 | 将魂 | 类型 |");
  console.log("|---:|---:|---|---|---|---|");
  for (const r of rows) {
    console.log(
      `| ${r.run} | ${r.finalMerit} | ${r.grade} | ${r.mainBehavior} | ${r.hero} | ${r.tier}${r.destiny ? " ★" : ""} |`,
    );
  }
} else {
  console.log("（局数>100，仅列前 15 行示例）\n");
  console.log("| # | 总战功 | 战评 | 主行为 | 将魂 | 类型 |");
  console.log("|---:|---:|---|---|---|---|");
  for (const r of rows.slice(0, 15)) {
    console.log(
      `| ${r.run} | ${r.finalMerit} | ${r.grade} | ${r.mainBehavior} | ${r.hero} | ${r.tier}${r.destiny ? " ★" : ""} |`,
    );
  }
}

if (csvOutPath) {
  const header = ["场次", "总战功", "战评", "主行为", "将魂", "类型", "是否天命", "随机种子"];
  const lines = [
    "\ufeff" + header.map(csvEscape).join(","),
    ...rows.map((r) =>
      [r.run, r.finalMerit, r.grade, r.mainBehavior, r.hero, r.tier, r.destiny ? "是" : "否", seed]
        .map(csvEscape)
        .join(","),
    ),
  ];
  fs.writeFileSync(csvOutPath, lines.join("\r\n"), "utf8");
  console.log(`\n已导出 CSV：${csvOutPath}`);
}
