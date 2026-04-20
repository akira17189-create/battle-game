/**
 * 105 将魂：总战功→战评档→将魂 Lv；主行为由「主行为定相系统」在 raw 分上作稀有加权、反重复惩罚、领先锁定或候选池加权随机；(主行为,Lv) 查表；综合等级仅展示。
 * 依赖：GeneralSoul105Lookup、GeneralSoul105Comment
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

  /** 主行为 → 天命之魂（仅 7 条行为有 Lv8 天命池；与「行为概览」一致） */
  const BEHAVIOR_TO_DESTINY_SOUL = {
    疾袭先登: "霍去病",
    破军重斩: "项羽",
    铁壁守御: "岳飞",
    乘隙收命: "白起",
    持局定军: "孙武",
    奇兵诡势: "韩信",
    中军主宰: "姜子牙",
  };

  const DESTINY_SOUL_INTROS = {
    项羽: "力拔山兮，霸王临阵。",
    韩信: "背水为阵，兵仙定局。",
    孙武: "未战先定，动则必中。",
    白起: "杀势既成，不留回军之路。",
    霍去病: "长驱万里，封狼居胥。",
    岳飞: "精忠之气，可镇全军。",
    姜子牙: "钓而不争，一出而定天下。",
  };

  const DESTINY_OPENING_LINES = [
    "此战已破人间名将之限。",
    "十万战功，已非凡将可尽述。",
    "此局之势，已超寻常武魂所能载。",
  ];

  function pickDestinyOpeningLine(finalMerit) {
    const lines = DESTINY_OPENING_LINES;
    const n = Math.floor(Math.abs(Number(finalMerit) || 0) % lines.length);
    return lines[n];
  }

  /**
   * Lv8：主行为阶名取 Lv7 阶名作展示；不查 105 表。
   * @param {string} behavior
   * @param {string} behaviorStageName
   * @param {number} finalMerit
   * @param {string} destinyName
   */
  function buildDestinyHeroVerdict(behavior, behaviorStageName, finalMerit, destinyName) {
    const intro = DESTINY_SOUL_INTROS[destinyName] || "华夏史诗，兵道绝顶。";
    const rawTitle =
      behaviorStageName != null && String(behaviorStageName).trim() !== "" && String(behaviorStageName).trim() !== "—"
        ? String(behaviorStageName).trim()
        : "";
    const behaviorLine = rawTitle && rawTitle !== "—" ? `${behavior} · ${rawTitle}` : behavior;
    const opening = pickDestinyOpeningLine(finalMerit);
    return {
      soulMode: true,
      isDestinyTier: true,
      destinySoul: {
        name: destinyName,
        title: "天命之魂",
        intro,
      },
      soulHook: "",
      soulVerdictQi: opening,
      soulTraitLine: intro,
      soulBattleAnchor: "",
      soulResembleQual: "",
      soulMappingExplain: "",
      heroPrimaryName: destinyName,
      soulPlayerEval: "",
      soulHeroPoem: "",
      soulSkillName: "",
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
      soulOverallLevelDisplay: "—",
      soulHeroStats: /** @type {any} */ (null),
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

    let fm = finalMeritScore;
    if (fm == null || Number.isNaN(Number(fm))) fm = profile?.totals?.finalMerit ?? 0;
    const g = meritGrade != null ? String(meritGrade) : "—";

    const logs = Array.isArray(state.chapterMeritLog) ? state.chapterMeritLog : [];
    const agg = aggregateSoulLogs(logs);
    const rawScores = computeBehaviorScores(profile, agg, logs);
    const phaseSig = `${fm}|${logs.length}|${agg.totalMeritAbs | 0}`;
    let winner;
    let phaseLock;
    if (
      state?._behaviorPhaseLockSnapshot &&
      state._behaviorPhaseLockSnapshot.sig === phaseSig &&
      state._behaviorPhaseLockSnapshot.phaseLock
    ) {
      winner = state._behaviorPhaseLockSnapshot.winner;
      phaseLock = state._behaviorPhaseLockSnapshot.phaseLock;
    } else {
      const r = resolveBehaviorPhaseLock(rawScores, profile, agg, state);
      winner = r.winner;
      phaseLock = r.phaseLock;
      if (state) {
        state._behaviorPhaseLockSnapshot = { sig: phaseSig, winner, phaseLock };
      }
    }
    const mainRawScore = rawScores[winner] ?? 0;
    const stageMap = Lu.BEHAVIOR_LEVEL_NAMES && Lu.BEHAVIOR_LEVEL_NAMES[winner];

    const topRawScores = {};
    for (const k of BEHAVIOR_ORDER) {
      topRawScores[k] = rawScores[k] ?? 0;
    }

    const T = Math.max(1, profile?.totals?.totalTurns | 0);
    const nd = agg.noDamageMeritTurns | 0;
    const lowTakenBs = clamp(1 - Math.min(1, agg.damageTaken / Math.max(1, T * 45)), 0, 1);
    const bsRawFormulaParts = {
      nd,
      totalTurns: T,
      ndOverT: nd / T,
      termNd: Math.round((nd / T) * 62),
      damageTaken: agg.damageTaken,
      lowTaken01: lowTakenBs,
      termLowTaken: Math.round(lowTakenBs * 38),
      rawSumApprox: Math.min(100, Math.round((nd / T) * 62 + lowTakenBs * 38)),
    };

    const sortedRows = BEHAVIOR_ORDER.map((k) => ({
      behavior: k,
      raw: topRawScores[k] ?? 0,
    })).sort((a, b) => b.raw - a.raw);

    const maxRawAll = Math.max(...BEHAVIOR_ORDER.map((k) => topRawScores[k] ?? 0));
    const tiedTop = sortedRows.filter((r) => r.raw === maxRawAll);
    const winnerScoreEqualsGlobalMax = (topRawScores[winner] ?? -1) === maxRawAll;
    const sortFirstIfTieByRaw = sortedRows[0]?.behavior ?? "—";
    const tiebreakDiffersFromSort =
      winnerScoreEqualsGlobalMax && tiedTop.length > 1 && sortFirstIfTieByRaw !== winner;

    if (Number(fm) >= DESTINY_MERIT_SCORE_MIN && BEHAVIOR_TO_DESTINY_SOUL[winner]) {
      const destinyName = BEHAVIOR_TO_DESTINY_SOUL[winner];
      const behaviorStageNameDest = (stageMap && stageMap.Lv7) || "";
      const heroVerdict = buildDestinyHeroVerdict(winner, behaviorStageNameDest, fm, destinyName);
      const lines = [
        "=== Lv8 天命之魂（总战功≥" + DESTINY_MERIT_SCORE_MIN + "；不查 105 将魂表）===",
        `finalMerit=${fm} 战评档=天命 → soulSeq=8（展示）`,
        `主行为定相 → "${winner}" raw=${mainRawScore} → 天命之魂「${destinyName}」`,
        `阶名展示用 Lv7：${behaviorStageNameDest || "—"}`,
        "",
        "--- 15 条线 raw（0~100，按 raw 降序）---",
      ];
      sortedRows.forEach((r, i) => {
        const mark = r.behavior === winner ? " ←主行为(定相)" : "";
        lines.push(
          `${String(i + 1).padStart(2, " ")}. ${r.behavior.padEnd(10, " ")}  raw=${String(r.raw).padStart(3, " ")}${mark}`,
        );
      });
      lines.push("");
      lines.push("--- 主行为定相 ---");
      lines.push(JSON.stringify(phaseLock, null, 0));
      lines.push("");
      lines.push(
        JSON.stringify({
          isDestinyTier: true,
          destinySoul: destinyName,
          behaviorStageLv7: behaviorStageNameDest,
        }),
      );
      const asText = lines.join("\n");
      const debug = {
        finalMeritScore: fm,
        meritGrade: g,
        meritGradeLine: meritGradeLine != null ? String(meritGradeLine) : "",
        isDestinyTier: true,
        destinySoul: destinyName,
        destinyIntro: DESTINY_SOUL_INTROS[destinyName] || "",
        soulSeqFromMerit: 8,
        rawBehaviorScores: topRawScores,
        phaseLock,
        sortedByRaw: sortedRows,
        winnerBehavior: winner,
        mainBehaviorRawScore: mainRawScore,
        winnerLevel: "Lv8",
        lookupResolvedLevel: "—",
        lookupKey: ["天命之魂", winner, destinyName],
        resolvedHero: destinyName,
        overallLevelDisplay: "—",
        lookupFailed: false,
        winnerScoreEqualsGlobalMax,
        sortFirstIfTieByRaw,
        tiebreakDiffersFromSort,
        tiedForFirstRaw: tiedTop,
        bsRawBreakdown: bsRawFormulaParts,
        aggregateSoul: {
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
        },
        asText,
      };
      try {
        window.__lastSoulBehaviorDebug = debug;
      } catch {
        /* non-browser */
      }
      if (shouldLogDebug()) {
        console.log("[GeneralSoul105 Lv8 天命]", debug);
        console.log(asText);
      }
      return {
        heroVerdict,
        debug,
        scores: topRawScores,
        rawScores: topRawScores,
        behaviorId: BEHAVIOR_SLUG[winner] || "soul_unknown",
        behaviorName: winner,
      };
    }

    const soulSeqLv = meritGradeToSoulSeqLv(g);
    const behaviorStageName = (stageMap && stageMap[`Lv${soulSeqLv}`]) || "";

    const lk = Lu.lookupSoulRow(Lu.soulMap, winner, soulSeqLv);
    const row = lk.row;
    const lore =
      Lore && typeof Lore.get === "function"
        ? Lore.get(row.武将)
        : { hook: "莫不成…………？", trait: "", poem: "" };
    const heroVerdict = buildSoulHeroVerdict(
      winner,
      soulSeqLv,
      row,
      { lookupFailed: !!lk.lookupFailed },
      g,
      lore,
      behaviorStageName,
    );

    const lines = [
      "=== GeneralSoul105 行为分（主行为=raw 最高；将魂 Lv=战评档）===",
      `finalMerit=${fm} 战评档→将魂序列 Lv${soulSeqLv}（神将=7…战将=1）`,
      `主行为 pickWinnerBehavior(raw 0~100) → "${winner}" 该线 raw=${mainRawScore} globalMaxRaw=${maxRawAll}`,
      `校验 winnerScoreEqualsGlobalMax=${winnerScoreEqualsGlobalMax} 并列最高 raw(${tiedTop.length}条): ${tiedTop.map((r) => `${r.behavior}(${r.raw})`).join(", ")}`,
      `若仅按 raw 排序第一为「${sortFirstIfTieByRaw}」；平局破同与 sort 可能不一致=${tiebreakDiffersFromSort}`,
      `查表 key (${winner}, Lv${soulSeqLv}) → resolvedLv=${lk.resolvedLv} hero=${row.武将}`,
      "",
      "--- 15 条线 raw（0~100，按 raw 降序）---",
    ];
    sortedRows.forEach((r, i) => {
      const mark = r.behavior === winner ? " ←主行为(定相)" : "";
      lines.push(
        `${String(i + 1).padStart(2, " ")}. ${r.behavior.padEnd(10, " ")}  raw=${String(r.raw).padStart(3, " ")}${mark}`,
      );
    });
    lines.push("");
    lines.push("--- 主行为定相 ---");
    lines.push(JSON.stringify(phaseLock, null, 0));
    lines.push("");
    lines.push("---「不伤而胜」分项（供调权重参考）---");
    lines.push(JSON.stringify(bsRawFormulaParts));
    lines.push("");
    lines.push("--- aggregateSoulLogs 摘要 ---");
    lines.push(
      JSON.stringify({
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
      }),
    );
    lines.push("");
    lines.push(
      "说明: 将魂 Lv 仅由总战功/战评档决定；主行为由定相系统（稀有加权、反重复、领先锁定或候选池加权随机）；综合等级仅展示。",
    );
    const asText = lines.join("\n");

    const debug = {
      finalMeritScore: fm,
      meritGrade: g,
      meritGradeLine: meritGradeLine != null ? String(meritGradeLine) : "",
      isDestinyTier: false,
      soulSeqFromMerit: soulSeqLv,
      rawBehaviorScores: topRawScores,
      phaseLock,
      sortedByRaw: sortedRows,
      winnerBehavior: winner,
      mainBehaviorRawScore: mainRawScore,
      winnerLevel: `Lv${soulSeqLv}`,
      lookupResolvedLevel: `Lv${lk.resolvedLv}`,
      lookupKey: lk.key || [winner, `Lv${soulSeqLv}`],
      resolvedHero: row.武将,
      overallLevelDisplay: row.综合等级,
      lookupFailed: !!lk.lookupFailed || !!row._fallback,
      winnerScoreEqualsGlobalMax,
      sortFirstIfTieByRaw,
      tiebreakDiffersFromSort,
      tiedForFirstRaw: tiedTop,
      bsRawBreakdown: bsRawFormulaParts,
      aggregateSoul: {
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
      },
      asText,
    };

    try {
      window.__lastSoulBehaviorDebug = debug;
    } catch {
      /* non-browser */
    }

    if (shouldLogDebug()) {
      console.log("[GeneralSoul105]", debug);
      console.log("[主行为定相]", phaseLock);
      console.log(asText);
    }

    return {
      heroVerdict,
      debug,
      scores: topRawScores,
      rawScores: topRawScores,
      behaviorId: BEHAVIOR_SLUG[winner] || "soul_unknown",
      behaviorName: winner,
    };
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
  };
})();
