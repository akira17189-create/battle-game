/**
 * 105 将魂：总战功→战评档→将魂序列 Lv；主行为在 15 条中随机，与对战侧写无关；(行为,Lv) 查表；综合等级仅展示。
 * 依赖：GeneralSoul105Lookup、GeneralSoul105Lore
 * 暴露：window.resolveGeneralSoul105
 */
(function () {
  const BEHAVIOR_ORDER = [
    "疾袭先登",
    "破军重斩",
    "铁壁守御",
    "反锋夺势",
    "养气持久",
    "乘隙收命",
    "连锋成势",
    "死地回天",
    "乱阵周旋",
    "血战压命",
    "不伤而胜",
    "持局定军",
    "奇兵诡势",
    "厚积骤发",
    "中军主宰",
  ];

  const BEHAVIOR_SLUG = {
    疾袭先登: "soul_jx",
    破军重斩: "soul_pj",
    铁壁守御: "soul_tb",
    反锋夺势: "soul_ff",
    养气持久: "soul_yq",
    乘隙收命: "soul_cx",
    连锋成势: "soul_lf",
    死地回天: "soul_ds",
    乱阵周旋: "soul_lz",
    血战压命: "soul_xz",
    不伤而胜: "soul_bs",
    持局定军: "soul_cj",
    奇兵诡势: "soul_qb",
    厚积骤发: "soul_hf",
    中军主宰: "soul_zj",
  };

  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }

  function stdev(nums) {
    const n = nums.length;
    if (n < 1) return 0;
    const m = nums.reduce((x, y) => x + y, 0) / n;
    let s = 0;
    for (const v of nums) s += (v - m) * (v - m);
    return Math.sqrt(s / n);
  }

  function n100(raw, denom) {
    return clamp(Math.round((raw / Math.max(1e-9, denom)) * 100), 0, 100);
  }

  /** @param {any[]} logs */
  function aggregateSoulLogs(logs) {
    const out = {
      damageDealt: 0,
      damageTaken: 0,
      heal: 0,
      noDamageMeritTurns: 0,
      counterQuickDefend: 0,
      turns2Enemies: 0,
      punishAdjust: 0,
      breakDefense: 0,
      meritDeltas: [],
    };
    for (const r of logs) {
      if (r?.meta?.victoryRestoration) continue;
      const m = r.meta || {};
      out.damageDealt += Number(m.damageDealtTotal || 0);
      out.damageTaken += Number(m.damageTakenThisTurn || 0);
      out.heal += Number(m.healDoneTotal || 0);
      out.meritDeltas.push(Number(r.turnMeritDelta || 0));
      if (m.counterQuickDefend) out.counterQuickDefend += 1;
      if (m.punishAdjust) out.punishAdjust += 1;
      if (m.breakDefense) out.breakDefense += 1;
      if ((m.aliveEnemyCountEnd || 0) >= 2) out.turns2Enemies += 1;
      const took = Number(m.damageTakenThisTurn || 0);
      const pos = Number(r.positiveBase || 0);
      if (took === 0 && pos > 0) out.noDamageMeritTurns += 1;
    }
    const md = out.meritDeltas;
    const n = md.length;
    let totalMerit = 0;
    for (const x of md) totalMerit += Math.abs(x);
    out.totalMeritAbs = totalMerit;
    if (n >= 6) {
      const mid = Math.floor(n / 2);
      out.firstHalfMerit = md.slice(0, mid).reduce((a, b) => a + b, 0);
      out.secondHalfMerit = md.slice(mid).reduce((a, b) => a + b, 0);
    } else {
      out.firstHalfMerit = n ? md[0] : 0;
      out.secondHalfMerit = n ? md[n - 1] : 0;
    }
    return out;
  }

  /**
   * @param {ReturnType<typeof createEmptyChapterHeroProfile>} p
   * @param {ReturnType<typeof aggregateSoulLogs>} agg
   * @param {any[]} logs
   */
  function computeBehaviorScores(p, agg, logs) {
    const T = Math.max(1, p.totals.totalTurns | 0);
    const acts = [p.actions.attack, p.actions.heavy, p.actions.defend, p.actions.block, p.actions.rest];
    const usedKinds = acts.filter((x) => x > 0).length;

    /** @type {Record<string, number>} */
    const s = {};

    s["疾袭先登"] = n100(p.actions.attack * 4 + p.outcomes.attackHit * 2 + p.outcomes.interruptHeavy * 12, T * 20);

    s["破军重斩"] = n100(p.actions.heavy * 4 + p.outcomes.heavyHit * 3 + p.outcomes.enemyBroken * 6, T * 22);

    s["铁壁守御"] = n100(p.actions.defend * 5 + agg.counterQuickDefend * 10, T * 14);

    s["反锋夺势"] = n100(p.actions.block * 4 + p.outcomes.counterHeavy * 10, T * 14);

    s["养气持久"] = n100(p.actions.rest * 6 + Math.min(agg.heal, T * 80), T * 10 + 40);

    s["乘隙收命"] = n100(
      p.actions.execute * 14 +
        p.special.executeBoss * 28 +
        p.special.executeElite * 16 +
        p.special.executeNormal * 8 +
        p.outcomes.enemyBroken * 3,
      T * 28,
    );

    s["连锋成势"] = n100(p.totals.maxComboReached * 24, T * 12 + 8);

    s["死地回天"] = n100(p.special.lowHpHit * 6 + p.special.lowHpExecute * 22, T * 8 + 20);

    s["乱阵周旋"] = n100(
      p.special.multiEnemyBreak * 12 + p.special.multiEnemyExecute * 16 + agg.turns2Enemies * 8,
      T * 18,
    );

    const tradeRaw = Math.sqrt(Math.max(1, agg.damageDealt) * Math.max(1, agg.damageTaken));
    s["血战压命"] = n100(tradeRaw, T * 35 + 20);

    const nd = agg.noDamageMeritTurns;
    const lowTaken = clamp(1 - Math.min(1, agg.damageTaken / Math.max(1, T * 45)), 0, 1);
    s["不伤而胜"] = clamp(Math.round((nd / T) * 62 + lowTaken * 38), 0, 100);

    const meanAct = acts.reduce((a, b) => a + b, 0) / 5;
    const sdAct = stdev(acts);
    s["持局定军"] = meanAct < 0.75 ? 0 : clamp(Math.round(meanAct * 16 - sdAct * 5), 0, 100);

    s["奇兵诡势"] = n100(agg.punishAdjust * 14 + agg.breakDefense * 10 + usedKinds * 12, T * 14);

    const surge = agg.secondHalfMerit - agg.firstHalfMerit;
    s["厚积骤发"] = n100(Math.max(0, surge) + agg.secondHalfMerit * 0.04, Math.max(250, agg.totalMeritAbs * 0.28));

    s["中军主宰"] =
      meanAct < 1 ? 0 : clamp(Math.round(meanAct * 14 - sdAct * 4.5 + usedKinds * 6), 0, 100);

    void logs;
    return s;
  }

  function primaryTie(name, p, agg) {
    switch (name) {
      case "疾袭先登":
        return p.outcomes.attackHit * 20 + p.outcomes.interruptHeavy * 80 + p.actions.attack * 5;
      case "破军重斩":
        return p.outcomes.heavyHit * 20 + p.outcomes.enemyBroken * 40 + p.actions.heavy * 6;
      case "铁壁守御":
        return p.actions.defend * 30 + agg.counterQuickDefend * 60 + p.outcomes.gotHitQuick * -2;
      case "反锋夺势":
        return p.outcomes.counterHeavy * 50 + p.actions.block * 25;
      case "养气持久":
        return p.actions.rest * 40 + agg.heal * 0.15;
      case "乘隙收命":
        return (
          p.special.executeBoss * 200 +
          p.special.executeElite * 120 +
          p.actions.execute * 40 +
          p.outcomes.enemyBroken * 25
        );
      case "连锋成势":
        return p.totals.maxComboReached * 100;
      case "死地回天":
        return p.special.lowHpExecute * 150 + p.special.lowHpHit * 40;
      case "乱阵周旋":
        return p.special.multiEnemyExecute * 120 + p.special.multiEnemyBreak * 80 + agg.turns2Enemies * 30;
      case "血战压命":
        return Math.sqrt(Math.max(1, agg.damageDealt) * Math.max(1, agg.damageTaken));
      case "不伤而胜":
        return agg.noDamageMeritTurns * 50 - agg.damageTaken * 0.05;
      case "持局定军":
        return p.totals.finalMerit * 0.02;
      case "奇兵诡势":
        return agg.punishAdjust * 80 + agg.breakDefense * 50;
      case "厚积骤发":
        return Math.max(0, agg.secondHalfMerit - agg.firstHalfMerit);
      case "中军主宰": {
        const acts = [p.actions.attack, p.actions.heavy, p.actions.defend, p.actions.block, p.actions.rest];
        const m = acts.reduce((a, b) => a + b, 0) / 5;
        return m * 40 - stdev(acts) * 25;
      }
      default:
        return 0;
    }
  }

  function highlightFor(name, p, agg) {
    switch (name) {
      case "乘隙收命":
        return p.special.executeBoss * 1000 + p.special.executeElite * 500 + p.actions.execute * 40;
      case "死地回天":
        return p.special.lowHpExecute * 800 + p.special.lowHpHit * 200;
      case "连锋成势":
        return p.totals.maxComboReached * 200 + (p.totals.finalMerit || 0) * 0.01;
      case "乱阵周旋":
        return p.special.multiEnemyExecute * 600 + p.special.multiEnemyBreak * 400;
      case "厚积骤发":
        return Math.max(0, agg.secondHalfMerit - agg.firstHalfMerit) * 2 + agg.secondHalfMerit;
      default:
        return (
          p.special.executeBoss * 400 +
          p.special.executeElite * 200 +
          p.totals.maxComboReached * 50 +
          p.special.multiEnemyExecute * 300
        );
    }
  }

  function pickWinnerBehavior(/** @type {Record<string, number>} */ scores, p, agg) {
    let max = -1;
    for (const k of BEHAVIOR_ORDER) {
      const v = scores[k] ?? 0;
      if (v > max) max = v;
    }
    if (max < 0) max = 0;
    const ties = BEHAVIOR_ORDER.filter((k) => (scores[k] ?? 0) === max);
    if (ties.length === 1) return { name: ties[0], maxScore: max };

    ties.sort((a, b) => {
      const pa = primaryTie(a, p, agg);
      const pb = primaryTie(b, p, agg);
      if (pa !== pb) return pb - pa;
      const ha = highlightFor(a, p, agg);
      const hb = highlightFor(b, p, agg);
      if (ha !== hb) return hb - ha;
      return BEHAVIOR_ORDER.indexOf(a) - BEHAVIOR_ORDER.indexOf(b);
    });
    return { name: ties[0], maxScore: max };
  }

  /** 按修正后分数排序（同分用 primaryTie / highlight / 行为序） */
  function sortBehaviorsByFinalScore(/** @type {Record<string, number>} */ scores, p, agg) {
    return BEHAVIOR_ORDER.map((k) => /** @type {[string, number]} */ ([k, scores[k] ?? 0])).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1];
      const pt = primaryTie(b[0], p, agg) - primaryTie(a[0], p, agg);
      if (pt !== 0) return pt;
      const hb = highlightFor(b[0], p, agg) - highlightFor(a[0], p, agg);
      if (hb !== 0) return hb;
      return BEHAVIOR_ORDER.indexOf(a[0]) - BEHAVIOR_ORDER.indexOf(b[0]);
    });
  }

  /**
   * 稀有事件加权：仅增强任务书列出的若干行为，单项 bonus ≤12。
   * @returns {Record<string, number>} 非零项为加分
   */
  function computeRareEventBonuses(p, agg) {
    const T = Math.max(1, p.totals.totalTurns | 0);
    void T;
    /** @type {Record<string, number>} */
    const bonus = {};
    const ih = p.outcomes.interruptHeavy | 0;
    if (ih >= 5) bonus["疾袭先登"] = 10;
    else if (ih >= 3) bonus["疾袭先登"] = 8;
    else if (ih >= 1) bonus["疾袭先登"] = 6;

    const hh = p.outcomes.heavyHit | 0;
    const hv = Math.max(1, p.actions.heavy | 0);
    const eb = p.outcomes.enemyBroken | 0;
    const heavyRatio = hh / hv;
    if (eb >= 4 || (heavyRatio >= 0.55 && (p.actions.heavy | 0) >= 6)) bonus["破军重斩"] = 10;
    else if (eb >= 2 || heavyRatio >= 0.45) bonus["破军重斩"] = 8;
    else if (eb >= 1 || hh >= 6) bonus["破军重斩"] = 6;

    const ch = p.outcomes.counterHeavy | 0;
    if (ch >= 5) bonus["反锋夺势"] = 12;
    else if (ch >= 3) bonus["反锋夺势"] = 10;
    else if (ch >= 1) bonus["反锋夺势"] = 8;

    const exb = p.special.executeBoss | 0;
    const exe = p.special.executeElite | 0;
    const exn = p.special.executeNormal | 0;
    const exScore = exb * 3 + exe * 2 + exn;
    if (exScore >= 10) bonus["乘隙收命"] = 10;
    else if (exScore >= 6) bonus["乘隙收命"] = 8;
    else if (exScore >= 3) bonus["乘隙收命"] = 6;

    const mc = p.totals.maxComboReached | 0;
    if (mc >= 5) bonus["连锋成势"] = 10;
    else if (mc >= 4) bonus["连锋成势"] = 8;
    else if (mc >= 3) bonus["连锋成势"] = 6;

    const meb = p.special.multiEnemyBreak | 0;
    const mex = p.special.multiEnemyExecute | 0;
    const t2 = agg.turns2Enemies | 0;
    if (mex >= 2 || meb >= 5) bonus["乱阵周旋"] = 12;
    else if (mex >= 1 || meb >= 3 || t2 >= 10) bonus["乱阵周旋"] = 10;
    else if (meb >= 1 || t2 >= 5) bonus["乱阵周旋"] = 8;

    const surge = (agg.secondHalfMerit || 0) - (agg.firstHalfMerit || 0);
    const denom = Math.max(1e-6, agg.totalMeritAbs || 1);
    const sr = surge / denom;
    if (sr > 0.18) bonus["厚积骤发"] = 10;
    else if (sr > 0.1) bonus["厚积骤发"] = 8;
    else if (surge > 0 && sr > 0.04) bonus["厚积骤发"] = 6;

    for (const k of Object.keys(bonus)) {
      bonus[k] = clamp(bonus[k], 0, 12);
    }
    return bonus;
  }

  /**
   * 最近 5 局内某行为出现次数 ×4，上限 16（仅对已出现过的行为记负分）。
   * @param {string[]} history
   */
  function computeRepeatPenalties(history) {
    const h = Array.isArray(history) ? history.filter((x) => typeof x === "string") : [];
    /** @type {Record<string, number>} */
    const pen = {};
    for (const b of BEHAVIOR_ORDER) {
      const c = h.filter((x) => x === b).length;
      if (c > 0) pen[b] = -Math.min(16, c * 4);
    }
    return pen;
  }

  function mergeFinalBehaviorScores(raw, bonus, penalty) {
    /** @type {Record<string, number>} */
    const out = {};
    for (const k of BEHAVIOR_ORDER) {
      const v = (raw[k] ?? 0) + (bonus[k] ?? 0) + (penalty[k] ?? 0);
      out[k] = clamp(Math.round(v), 0, 100);
    }
    return out;
  }

  /**
   * @param {Array<[string, number]>} pool [[name, score], ...] 至少 1 项
   */
  function weightedPickFromPool(pool) {
    if (pool.length === 1) return pool[0][0];
    const minS = pool[pool.length - 1][1];
    let totalW = 0;
    const weights = pool.map(([n, s]) => {
      const w = (s - minS + 1) * (s - minS + 1);
      totalW += w;
      return { n, w };
    });
    let r = Math.random() * totalW;
    for (const x of weights) {
      r -= x.w;
      if (r <= 0) return x.n;
    }
    return weights[weights.length - 1].n;
  }

  /**
   * 主行为定相系统
   * @returns {{ winner: string, phaseLock: object }}
   */
  function sparseNonZero(/** @type {Record<string, number>} */ rec) {
    /** @type {Record<string, number>} */
    const o = {};
    for (const k of Object.keys(rec)) {
      if (rec[k]) o[k] = rec[k];
    }
    return o;
  }

  function resolveBehaviorPhaseLock(rawScores, p, agg, state) {
    const bonusFull = computeRareEventBonuses(p, agg);
    const hist = Array.isArray(state?._mainBehaviorHistory) ? state._mainBehaviorHistory : [];
    const repeatFull = computeRepeatPenalties(hist);
    const finalBehaviorScores = mergeFinalBehaviorScores(rawScores, bonusFull, repeatFull);
    const sorted = sortBehaviorsByFinalScore(finalBehaviorScores, p, agg);
    const top1Name = sorted[0][0];
    const top1Score = sorted[0][1];
    const top2Name = sorted[1] ? sorted[1][0] : "—";
    const top2Score = sorted[1] ? sorted[1][1] : -999;
    const gap = top1Score - top2Score;
    const locked = gap >= 12;
    let winner = top1Name;
    /** @type {Array<[string, number]>} */
    let candidatePool = [[top1Name, top1Score]];

    if (!locked) {
      candidatePool = sorted.filter(([, s]) => s >= top1Score - 10).slice(0, 3);
      if (candidatePool.length === 0) {
        candidatePool = sorted.slice(0, 1);
      }
      winner = weightedPickFromPool(candidatePool);
    }

    const phaseLock = {
      rawBehaviorScores: { ...rawScores },
      bonusApplied: sparseNonZero(bonusFull),
      repeatPenaltyApplied: sparseNonZero(repeatFull),
      finalBehaviorScores,
      top1: top1Name,
      top2: top2Name,
      top1Score,
      top2Score,
      gap,
      locked,
      candidatePool: candidatePool.map(([n, s]) => [n, s]),
      finalChosenBehavior: winner,
    };
    return { winner, phaseLock };
  }

  function shouldLogDebug() {
    try {
      if (typeof window === "undefined") return false;
      if (window.__SOUL_DEBUG__) return true;
      if (typeof window.location !== "undefined" && String(window.location.search || "").includes("souldebug=1"))
        return true;
      if (window.localStorage && window.localStorage.getItem("debugSoul") === "1") return true;
    } catch {
      /* ignore */
    }
    return false;
  }

  const LEGACY_MERIT_GRADE_TO_NEW = {
    奇功: "神将",
    甲功: "名将",
    乙功: "健将",
    丙功: "勇将",
    丁功: "战将",
  };

  function canonMeritGradeLabel(grade) {
    const s = grade != null ? String(grade).trim() : "—";
    if (!s || s === "—") return s;
    return LEGACY_MERIT_GRADE_TO_NEW[s] || s;
  }

  /** 战评档（战将=1 … 神将=7）→ 将魂查表序列等级 Lv1～Lv7；天命=8 仅作展示，不查 105 表 */
  function meritGradeToSoulSeqLv(gradeLabel) {
    const g = canonMeritGradeLabel(gradeLabel);
    if (g === "天命") return 8;
    const order = ["战将", "勇将", "健将", "骁将", "名将", "飞将", "神将"];
    const i = order.indexOf(g);
    return i >= 0 ? i + 1 : 1;
  }

  /** 总战功 ≥ 此值时进入 Lv8 天命之魂池（不查 105） */
  const DESTINY_MERIT_SCORE_MIN = 100000;

  /** 主行为 → 天命之魂（15 条全齐；总战功≥DESTINY_MERIT_SCORE_MIN 时不查 105 表，与 120 人物总表「华夏天命」一致） */
  const BEHAVIOR_TO_DESTINY_SOUL = {
    疾袭先登: "霍去病",
    破军重斩: "项羽",
    铁壁守御: "岳飞",
    反锋夺势: "孙膑",
    养气持久: "勾践",
    乘隙收命: "白起",
    连锋成势: "卫青",
    死地回天: "韩信",
    乱阵周旋: "李靖",
    血战压命: "吴起",
    不伤而胜: "孙武",
    持局定军: "姜子牙",
    奇兵诡势: "张良",
    厚积骤发: "刘邦",
    中军主宰: "李世民",
  };

  const DESTINY_SOUL_INTROS = {
    霍去病: "长驱万里，封狼居胥。",
    项羽: "力拔山兮，霸王临阵。",
    岳飞: "精忠之气，可镇全军。",
    孙膑: "减灶增兵，以退为进。",
    勾践: "卧薪尝胆，十年生聚。",
    白起: "杀势既成，不留回军之路。",
    卫青: "七击匈奴，连捷朔漠。",
    韩信: "背水为阵，兵仙定局。",
    李靖: "奇正相生，一战定形。",
    吴起: "厉兵变法，与卒同苦。",
    孙武: "未战庙算，不战屈人。",
    姜子牙: "钓而不争，一出而定天下。",
    张良: "运筹帷幄，决胜千里。",
    刘邦: "隐忍蓄势，驭将如臂。",
    李世民: "天策神武，万方来同。",
  };

  /**
   * 天命之魂面板：五维、兵种适性、特技（与 105 将魂表字段一致，数值为 Lv8 史诗定位）。
   * 综 = 五维之和，供调试与扩展展示。
   */
  const DESTINY_SOUL_STAT_ROWS = {
    霍去病: {
      武将: "霍去病",
      统: 96,
      武: 98,
      智: 82,
      政: 66,
      魅: 86,
      综: 428,
      特技: "封狼",
      槍: "B",
      戟: "A",
      弩: "S",
      騎: "S",
      兵: "B",
      水: "C",
    },
    项羽: {
      武将: "项羽",
      统: 90,
      武: 100,
      智: 58,
      政: 38,
      魅: 92,
      综: 378,
      特技: "霸王",
      槍: "S",
      戟: "S",
      弩: "B",
      騎: "S",
      兵: "A",
      水: "C",
    },
    岳飞: {
      武将: "岳飞",
      统: 95,
      武: 92,
      智: 86,
      政: 82,
      魅: 94,
      综: 449,
      特技: "精忠",
      槍: "S",
      戟: "A",
      弩: "S",
      騎: "B",
      兵: "S",
      水: "B",
    },
    孙膑: {
      武将: "孙膑",
      统: 88,
      武: 46,
      智: 100,
      政: 90,
      魅: 78,
      综: 402,
      特技: "用間",
      槍: "B",
      戟: "B",
      弩: "A",
      騎: "B",
      兵: "S",
      水: "A",
    },
    勾践: {
      武将: "勾践",
      统: 90,
      武: 80,
      智: 92,
      政: 94,
      魅: 88,
      综: 444,
      特技: "卧薪",
      槍: "A",
      戟: "B",
      弩: "B",
      騎: "B",
      兵: "S",
      水: "S",
    },
    白起: {
      武将: "白起",
      统: 98,
      武: 92,
      智: 90,
      政: 58,
      魅: 70,
      综: 408,
      特技: "殲滅",
      槍: "S",
      戟: "S",
      弩: "A",
      騎: "B",
      兵: "S",
      水: "A",
    },
    卫青: {
      武将: "卫青",
      统: 97,
      武: 90,
      智: 84,
      政: 74,
      魅: 82,
      综: 427,
      特技: "遠征",
      槍: "A",
      戟: "B",
      弩: "A",
      騎: "S",
      兵: "B",
      水: "C",
    },
    韩信: {
      武将: "韩信",
      统: 98,
      武: 89,
      智: 100,
      政: 84,
      魅: 88,
      综: 459,
      特技: "兵仙",
      槍: "S",
      戟: "A",
      弩: "S",
      騎: "S",
      兵: "S",
      水: "A",
    },
    李靖: {
      武将: "李靖",
      统: 99,
      武: 93,
      智: 98,
      政: 88,
      魅: 90,
      综: 468,
      特技: "統御",
      槍: "S",
      戟: "A",
      弩: "S",
      騎: "S",
      兵: "S",
      水: "S",
    },
    吴起: {
      武将: "吴起",
      统: 96,
      武: 94,
      智: 96,
      政: 92,
      魅: 76,
      综: 454,
      特技: "变法",
      槍: "S",
      戟: "S",
      弩: "A",
      騎: "S",
      兵: "S",
      水: "B",
    },
    孙武: {
      武将: "孙武",
      统: 100,
      武: 72,
      智: 100,
      政: 96,
      魅: 90,
      综: 458,
      特技: "廟算",
      槍: "A",
      戟: "B",
      弩: "S",
      騎: "B",
      兵: "S",
      水: "S",
    },
    姜子牙: {
      武将: "姜子牙",
      统: 88,
      武: 68,
      智: 98,
      政: 96,
      魅: 94,
      综: 444,
      特技: "太公",
      槍: "B",
      戟: "B",
      弩: "A",
      騎: "B",
      兵: "S",
      水: "S",
    },
    张良: {
      武将: "张良",
      统: 82,
      武: 38,
      智: 100,
      政: 92,
      魅: 95,
      综: 407,
      特技: "運籌",
      槍: "C",
      戟: "C",
      弩: "B",
      騎: "C",
      兵: "A",
      水: "B",
    },
    刘邦: {
      武将: "刘邦",
      统: 90,
      武: 78,
      智: 94,
      政: 98,
      魅: 96,
      综: 456,
      特技: "駕馭",
      槍: "B",
      戟: "B",
      弩: "B",
      騎: "A",
      兵: "S",
      水: "B",
    },
    李世民: {
      武将: "李世民",
      统: 96,
      武: 95,
      智: 95,
      政: 93,
      魅: 98,
      综: 477,
      特技: "天策",
      槍: "S",
      戟: "S",
      弩: "S",
      騎: "S",
      兵: "S",
      水: "A",
    },
  };

  /**
   * Lv8：主行为阶名取 Lv7 阶名作展示；不查 105 表。文案与 105 将魂同构（Lore hook/trait/poem + 气/锚/神似）。
   * @param {string} behavior
   * @param {string} behaviorStageName
   * @param {number} _finalMerit
   * @param {string} destinyName
   * @param {{ hook?: string; trait?: string; poem?: string }} lore
   */
  function buildDestinyHeroVerdict(behavior, behaviorStageName, _finalMerit, destinyName, lore) {
    void _finalMerit;
    const LoreSafe = lore && typeof lore === "object" ? lore : {};
    const traitLine =
      String(LoreSafe.trait || "").trim() || DESTINY_SOUL_INTROS[destinyName] || "华夏史诗，兵道绝顶。";
    const statRow = DESTINY_SOUL_STAT_ROWS[destinyName] || null;
    const rawTitle =
      behaviorStageName != null && String(behaviorStageName).trim() !== "" && String(behaviorStageName).trim() !== "—"
        ? String(behaviorStageName).trim()
        : "";
    const behaviorLine = rawTitle && rawTitle !== "—" ? `${behavior} · ${rawTitle}` : behavior;
    const soulVerdictQi = pickVerdictQi(destinyName, behavior);
    const soulBattleAnchor = buildSoulBattleAnchor(behavior, rawTitle);
    const soulResembleQual = buildSoulResembleQual(behavior, destinyName);
    const skill =
      statRow && statRow.特技 != null && String(statRow.特技).trim() !== "" ? String(statRow.特技).trim() : "";
    return {
      soulMode: true,
      isDestinyTier: true,
      destinySoul: {
        name: destinyName,
        title: "天命之魂",
        intro: traitLine,
      },
      soulHook: String(LoreSafe.hook || "").trim(),
      soulVerdictQi,
      soulTraitLine: traitLine,
      soulBattleAnchor,
      soulResembleQual,
      soulMappingExplain: "",
      heroPrimaryName: destinyName,
      soulPlayerEval: "",
      soulHeroPoem: String(LoreSafe.poem || "").trim(),
      soulSkillName: skill,
      heroPrimaryLine: behaviorLine,
      heroPrimaryTitle: "",
      heroExplain: "",
      heroPoem: [],
      heroSecondaryName: "",
      heroSecondaryTitle: "",
      soulBehavior: behavior,
      soulBehaviorTitle: rawTitle,
      soulLevel: "Lv8",
      soulMeritGrade: "天命",
      soulOverallLevelDisplay: "天命",
      soulHeroStats: statRow ? { ...statRow } : /** @type {any} */ (null),
    };
  }

  /** 本局解释句：前半写气，后半点题「行为·阶名」 */
  const BATTLE_ANCHOR_LEAD = {
    疾袭先登: "快攻断势，先登夺步，",
    破军重斩: "重击破阵，锋势如山，",
    铁壁守御: "固守绵密，敌锋自折，",
    反锋夺势: "反制得先，锋回便转机，",
    养气持久: "调息得法，久战不乱，",
    乘隙收命: "乘隙一击，收束果决，",
    连锋成势: "连锋滚势，愈战愈凶，",
    死地回天: "绝地还手，气仍未绝，",
    乱阵周旋: "乱阵穿行，周旋有余，",
    血战压命: "换血不退，煞气压阵，",
    不伤而胜: "少伤而制胜，守静而不失势，",
    持局定军: "持局如山，进退有度，",
    奇兵诡势: "变招迭出，诡正相生，",
    厚积骤发: "厚积于前，骤发于后，",
    中军主宰: "诸艺兼备，坐镇中军，",
  };

  /** 定性句：收束为「故其神似某某」 */
  const RESEMBLE_HEAD = {
    疾袭先登: "奔袭如电，锋决先成，",
    破军重斩: "沉锋断阵，力压三军，",
    铁壁守御: "如山持重，敌莫能撼，",
    反锋夺势: "反锋夺机，气定乾坤，",
    养气持久: "气脉悠长，愈久愈锐，",
    乘隙收命: "见隙则断，不留余地，",
    连锋成势: "连势成雪，敌难翻身，",
    死地回天: "死地犹争，胆气夺人，",
    乱阵周旋: "乱中不乱，游刃有余，",
    血战压命: "血火不退，悍气压阵，",
    不伤而胜: "法理森然，秉节持正，",
    持局定军: "持重定军，中军如砥，",
    奇兵诡势: "奇正互用，敌莫能料，",
    厚积骤发: "藏锋蓄势，后发惊世，",
    中军主宰: "万方来攻，我自调度，",
  };

  function pickVerdictQi(heroName, behavior) {
    const h = heroName != null ? String(heroName) : "—";
    const b = behavior != null ? String(behavior) : "";
    let n = 0;
    for (let i = 0; i < h.length; i++) n = (n + h.charCodeAt(i) * (i + 3)) % 3;
    for (let i = 0; i < b.length; i++) n = (n + b.charCodeAt(i) * (i + 5)) % 3;
    if (n === 1) return `此战所显，近于${h}。`;
    if (n === 2) return `阵前气象，与${h}相近。`;
    return `观此局气，颇近${h}。`;
  }

  function buildSoulBattleAnchor(behavior, rawTitle) {
    const lead = BATTLE_ANCHOR_LEAD[behavior] || "战法脉络分明，";
    const inner =
      rawTitle && String(rawTitle).trim() !== "" && String(rawTitle).trim() !== "—"
        ? `${behavior}·${String(rawTitle).trim()}`
        : behavior;
    return `${lead}此战主轴正在「${inner}」。`;
  }

  function buildSoulResembleQual(behavior, heroName) {
    const h = heroName != null ? String(heroName) : "—";
    const head = RESEMBLE_HEAD[behavior] || "战法有宗，气派自见，";
    return `${head}故其神似${h}。`;
  }

  /**
   * @param {string} behaviorStageName 与战评档对应的阶名（BEHAVIOR_LEVEL_NAMES[行为][LvN]）
   */
  function buildSoulHeroVerdict(behavior, soulSeqLv, row, lookupInfo, meritGrade, lore, behaviorStageName) {
    const lvKey = `Lv${soulSeqLv}`;
    const rawTitle =
      behaviorStageName != null && String(behaviorStageName).trim() !== "" && String(behaviorStageName).trim() !== "—"
        ? String(behaviorStageName).trim()
        : "";
    const behaviorLine =
      rawTitle && rawTitle !== "—" ? `${behavior} · ${rawTitle}` : behavior;
    const overallLv =
      row.综合等级 != null && String(row.综合等级).trim() !== "" ? String(row.综合等级).trim() : "—";
    const skill =
      row.特技 != null && String(row.特技).trim() !== "" && String(row.特技) !== "—"
        ? String(row.特技).trim()
        : "";
    const failNote =
      lookupInfo.lookupFailed || row._fallback
        ? shouldLogDebug()
          ? "（卷籍偶阙，暂以旧档书之。）"
          : ""
        : "";
    const gradeStr = meritGrade != null && String(meritGrade).trim() !== "" ? String(meritGrade).trim() : "—";
    const heroDisp = row.武将 != null ? String(row.武将).trim() : "—";
    const soulVerdictQi = pickVerdictQi(heroDisp, behavior);
    const soulBattleAnchor = buildSoulBattleAnchor(behavior, rawTitle);
    const soulResembleQual = buildSoulResembleQual(behavior, heroDisp);
    return {
      soulMode: true,
      soulHook: lore.hook,
      soulVerdictQi,
      soulTraitLine: lore.trait,
      heroPrimaryLine: behaviorLine,
      soulBattleAnchor,
      soulResembleQual,
      soulMappingExplain: "",
      heroPrimaryName: row.武将,
      soulPlayerEval: failNote,
      soulHeroPoem: lore.poem,
      soulSkillName: skill,
      heroPrimaryTitle: "",
      heroExplain: "",
      heroPoem: [],
      heroSecondaryName: "",
      heroSecondaryTitle: "",
      soulBehavior: behavior,
      soulBehaviorTitle: rawTitle,
      soulLevel: lvKey,
      soulMeritGrade: gradeStr,
      soulOverallLevelDisplay: overallLv,
      soulHeroStats: row,
    };
  }

  /**
   * 与 main.js meritSumWithFloor0 口径一致，用于将魂结果缓存键（避免同局多次 computeChapterMerit 重复掷骰）。
   * @param {any[]} logs
   */
  function meritTurnSumForSoulCacheKey(logs) {
    let v = 0;
    for (const r of logs || []) {
      v = Math.max(0, v + (r?.turnMeritDelta || 0));
    }
    return v;
  }

  /**
   * 同一章节、同一战功快照下只解析一次将魂；结算 UI 与写榜各调一次 computeChapterMerit 时共用。
   * @param {any} state
   * @param {number} fm
   * @param {string} g
   */
  function soul105ResolutionCacheKey(state, fm, g) {
    if (!state) return null;
    const logs = Array.isArray(state.chapterMeritLog) ? state.chapterMeritLog : [];
    const turnSum = meritTurnSumForSoulCacheKey(logs);
    const retries = state.meritChapter?.retries ? JSON.stringify(state.meritChapter.retries) : "";
    return `${String(state.chapterId || "")}|${Number(fm)}|${g}|${turnSum}|${logs.length}|${retries}`;
  }

  /**
   * 战评档 → 将魂序列等级；展示用行为在 15 条中均匀随机，与侧写、战功日志无关。
   * 总战功≥DESTINY_MERIT_SCORE_MIN 时走「天命之魂」华夏天命表（15 行为随机 → 对应天命武将），不查 105 将魂表。
   * @param {any} state
   * @param {ReturnType<typeof createEmptyChapterHeroProfile>} profile
   * @param {number} [finalMeritScore]
   * @param {number} [meritScale] MERIT_SCORE_SCALE
   * @param {string} [meritGrade]
   * @param {string} [meritGradeLine]
   */
  function resolveGeneralSoul105(state, profile, finalMeritScore, meritScale, meritGrade, meritGradeLine) {
    void meritScale;
    const Lu = window.GeneralSoul105Lookup;
    const Lore = window.GeneralSoul105Lore;
    if (!Lu || typeof Lu.lookupSoulRow !== "function") {
      return null;
    }

    if (state) {
      state._behaviorPhaseLockSnapshot = null;
    }

    let fm = finalMeritScore;
    if (fm == null || Number.isNaN(Number(fm))) fm = profile?.totals?.finalMerit ?? 0;
    const g = meritGrade != null ? String(meritGrade) : "—";

    const cacheKey = soul105ResolutionCacheKey(state, fm, g);
    if (cacheKey && state && state._resolvedSoul105ForKey === cacheKey && state._resolvedSoul105Payload) {
      try {
        window.__lastSoulBehaviorDebug = state._resolvedSoul105Payload.debug;
      } catch {
        /* non-browser */
      }
      return state._resolvedSoul105Payload;
    }

    const pickIdx = Math.floor(Math.random() * BEHAVIOR_ORDER.length);
    const winner = BEHAVIOR_ORDER[pickIdx] || BEHAVIOR_ORDER[0];
    const stageMap = Lu.BEHAVIOR_LEVEL_NAMES && Lu.BEHAVIOR_LEVEL_NAMES[winner];

    const soulSeqLv = meritGradeToSoulSeqLv(g);
    /** 阶名表仅 Lv1～Lv7；天命档 soulSeq=8 时阶名取 Lv7 */
    const lvForStageName = Math.min(7, Math.max(1, soulSeqLv));
    const behaviorStageName = (stageMap && stageMap[`Lv${lvForStageName}`]) || "";

    /** 与旧接口兼容：无「行为 raw 分」 */
    const emptyScores = {};
    for (const k of BEHAVIOR_ORDER) emptyScores[k] = 0;

    const logs = Array.isArray(state?.chapterMeritLog) ? state.chapterMeritLog : [];
    const agg = aggregateSoulLogs(logs);

    const aggregateSoulBlock = {
      damageDealt: agg.damageDealt,
      damageTaken: agg.damageTaken,
      heal: agg.heal,
      noDamageMeritTurns: agg.noDamageMeritTurns,
      counterQuickDefend: agg.counterQuickDefend,
      turns2Enemies: agg.turns2Enemies,
      punishAdjust: agg.punishAdjust,
      breakDefense: agg.breakDefense,
      firstHalfMerit: agg.firstHalfMerit,
      secondHalfMerit: agg.secondHalfMerit,
      totalMeritAbs: agg.totalMeritAbs,
    };

    /** 天命之魂：总战功≥阈值，15 行为随机 → 华夏天命武将（不查 105 表） */
    if (Number(fm) >= DESTINY_MERIT_SCORE_MIN) {
      const destinyName = BEHAVIOR_TO_DESTINY_SOUL[winner];
      if (destinyName) {
        const behaviorStageNameDest = (stageMap && stageMap.Lv7) || "";
        const destinyLore =
          Lore && typeof Lore.get === "function"
            ? Lore.get(destinyName)
            : { hook: "", trait: DESTINY_SOUL_INTROS[destinyName] || "", poem: "" };
        const heroVerdict = buildDestinyHeroVerdict(winner, behaviorStageNameDest, fm, destinyName, destinyLore);
        const lines = [
          "=== 天命之魂（总战功≥" + DESTINY_MERIT_SCORE_MIN + "；15 行为随机）===",
          `finalMerit=${fm} 战评档=${g}`,
          `随机展示行为 [${pickIdx + 1}/15] →「${winner}」Lv7 阶名：${behaviorStageNameDest || "—"}`,
          `华夏天命 → ${destinyName}（不查 105 将魂表）`,
          "",
          "说明: 展示行为仍为 15 条均匀随机，与对战侧写无关；天命武将由该行为映射。",
        ];
        const asText = lines.join("\n");
        const debug = {
          finalMeritScore: fm,
          meritGrade: g,
          meritGradeLine: meritGradeLine != null ? String(meritGradeLine) : "",
          isDestinyTier: true,
          soulSeqFromMerit: soulSeqLv,
          randomBehaviorIndex: pickIdx,
          winnerBehavior: winner,
          destinySoul: destinyName,
          lookupResolvedLevel: "",
          lookupKey: [winner, "天命之魂"],
          resolvedHero: destinyName,
          overallLevelDisplay: "天命之魂",
          lookupFailed: false,
          aggregateSoul: aggregateSoulBlock,
          asText,
        };
        try {
          window.__lastSoulBehaviorDebug = debug;
        } catch {
          /* non-browser */
        }
        if (shouldLogDebug()) {
          console.log("[GeneralSoul105]", debug);
          console.log(asText);
        }
        const outDestiny = {
          heroVerdict,
          debug,
          scores: emptyScores,
          rawScores: emptyScores,
          behaviorId: BEHAVIOR_SLUG[winner] || "soul_unknown",
          behaviorName: winner,
        };
        if (cacheKey && state) {
          state._resolvedSoul105ForKey = cacheKey;
          state._resolvedSoul105Payload = outDestiny;
        }
        return outDestiny;
      }
    }

    const lk = Lu.lookupSoulRow(Lu.soulMap, winner, soulSeqLv);
    const row = lk.row;
    const lore =
      Lore && typeof Lore.get === "function"
        ? Lore.get(row.武将)
        : { hook: "莫不成…………？", trait: "", poem: "" };
    const heroVerdict = buildSoulHeroVerdict(
      winner,
      lk.resolvedLv,
      row,
      { lookupFailed: !!lk.lookupFailed },
      g,
      lore,
      behaviorStageName,
    );

    const lines = [
      "=== GeneralSoul105（展示行为随机；将魂 Lv=战评档）===",
      `finalMerit=${fm} 战评档=${g} → 将魂序列 Lv${soulSeqLv}（查表会落在 Lv1～Lv7）`,
      `随机展示行为 [${pickIdx + 1}/15] →「${winner}」阶名 Lv${lvForStageName}：${behaviorStageName || "—"}`,
      `查表 (${winner}, 请求Lv${soulSeqLv}) → resolvedLv=${lk.resolvedLv} 武将=${row.武将}`,
      "",
      "说明: 不再根据对战侧写判定主行为；仅战功评档 + 15 行为随机 + 表定武将/阶名。",
    ];
    const asText = lines.join("\n");

    const debug = {
      finalMeritScore: fm,
      meritGrade: g,
      meritGradeLine: meritGradeLine != null ? String(meritGradeLine) : "",
      isDestinyTier: false,
      soulSeqFromMerit: soulSeqLv,
      randomBehaviorIndex: pickIdx,
      winnerBehavior: winner,
      lookupResolvedLevel: `Lv${lk.resolvedLv}`,
      lookupKey: lk.key || [winner, `Lv${soulSeqLv}`],
      resolvedHero: row.武将,
      overallLevelDisplay: row.综合等级,
      lookupFailed: !!lk.lookupFailed || !!row._fallback,
      aggregateSoul: aggregateSoulBlock,
      asText,
    };

    try {
      window.__lastSoulBehaviorDebug = debug;
    } catch {
      /* non-browser */
    }

    if (shouldLogDebug()) {
      console.log("[GeneralSoul105]", debug);
      console.log(asText);
    }

    const out = {
      heroVerdict,
      debug,
      scores: emptyScores,
      rawScores: emptyScores,
      behaviorId: BEHAVIOR_SLUG[winner] || "soul_unknown",
      behaviorName: winner,
    };
    if (cacheKey && state) {
      state._resolvedSoul105ForKey = cacheKey;
      state._resolvedSoul105Payload = out;
    }
    return out;
  }

  window.resolveGeneralSoul105 = resolveGeneralSoul105;
  window.GeneralSoul105Scoring = {
    BEHAVIOR_ORDER,
    aggregateSoulLogs,
    computeBehaviorScores,
    meritGradeToSoulSeqLv,
    canonMeritGradeLabel,
    resolveBehaviorPhaseLock,
    computeRareEventBonuses,
    computeRepeatPenalties,
    DESTINY_MERIT_SCORE_MIN,
    BEHAVIOR_TO_DESTINY_SOUL,
    DESTINY_SOUL_STAT_ROWS,
  };
})();
