// B1：边寨外哨 — 纯前端规则原型（无依赖，可直接打开 index.html 运行）

/** @typedef {"attack"|"heavy"|"defend"|"block"|"execute"|"rest"} PlayerAction */
/** @typedef {"quick"|"heavy"|"defend"|"block"|"adjust"} EnemyIntent */
/** @typedef {"A"|"B"|"C"} EnemyId */
/** @typedef {"N"|"B"|"E"|"R"|"S"} NodeType */

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

/** 名号：汉字至多 6 个，拉丁字母至多 12 个（不计空格与数字等，输入时会被丢弃） */
const MAX_PLAYER_NAME_HAN = 6;
const MAX_PLAYER_NAME_LATIN = 12;

/** @param {string} raw */
function clampPlayerNameValue(raw) {
  let han = 0;
  let latin = 0;
  const out = [];
  for (const ch of Array.from(String(raw || ""))) {
    if (/\p{Script=Han}/u.test(ch)) {
      if (han < MAX_PLAYER_NAME_HAN) {
        han++;
        out.push(ch);
      }
    } else if (/[a-zA-Z]/.test(ch)) {
      if (latin < MAX_PLAYER_NAME_LATIN) {
        latin++;
        out.push(ch);
      }
    }
  }
  return out.join("");
}

// 数值缩放：仅 HP / 伤害 / 治疗 / 减伤 / 打击基伤（strikeBase）等用基础值×10 存算；失衡（累积与上限、每次增减）不×10。
const NUM_SCALE = 10;
function ns(n) {
  return Math.round(n * NUM_SCALE);
}

/**
 * 意图 UI 标签。注意：不是四种各有一套独立「攻防面板」——
 * - 快攻/重击：共用 `strikeBase`（打击基伤）；**同基伤档则意图名一致**，高一档（≥ ns(3)）用「快攻·疾 / 重击·沉」与标准档区分。
 * - 防御/盾反/调整：规则全局一致，**名称不因角色而变**（无独立防御面板数值）。
 */
const INTENT_NAME = {
  quick: "快攻",
  heavy: "重击",
  defend: "防御",
  block: "盾反",
  adjust: "调整",
};

/** 打击基伤 ≥ 此值时，快攻/重击在 UI 上用带后缀名称（与 ns(2) 标准档区分） */
const ENEMY_STRIKE_BASE_HIGH_TIER = ns(3);

/** 高打击基伤档：快攻/重击显示名（头目、精英亲兵盾等与 ns(3) 基伤一致） */
const INTENT_NAME_STRIKE_HIGH = {
  quick: "快攻·疾",
  heavy: "重击·沉",
};

/**
 * @param {{ fighter?: { strikeBase?: number } } | null | undefined} enemyObj
 * @param {string} [intent]
 */
function intentNameForEnemy(enemyObj, intent) {
  const k = intent || "adjust";
  const base = enemyObj?.fighter?.strikeBase ?? ns(2);
  const highTier = base >= ENEMY_STRIKE_BASE_HIGH_TIER;
  if ((k === "quick" || k === "heavy") && highTier) {
    return INTENT_NAME_STRIKE_HIGH[k] || INTENT_NAME[k] || "—";
  }
  return INTENT_NAME[k] || "—";
}

/** 敌方快攻对玩家造成的失衡（不×10，与 UI 数字一致） */
const ENEMY_STRIKE_QUICK_STAGGER_TO_PLAYER = 1;
/** 敌方重击相对快攻的额外伤害（叠在 strikeBase 上，×10 体系） */
const ENEMY_STRIKE_HEAVY_EXTRA_DAMAGE = ns(1);
/** 敌方重击对玩家造成的失衡（不×10） */
const ENEMY_STRIKE_HEAVY_STAGGER_TO_PLAYER = 2;
/** 盾反落空再被快攻追击时的额外失衡（不×10） */
const ENEMY_BLOCK_FAIL_EXTRA_STAGGER = 1;

const NODETYPE_NAME = {
  N: "推进",
  B: "战斗",
  E: "精英",
  R: "成长",
  S: "结算",
};

/** 快攻打断重击：己方快攻对敌方重击、敌方快攻对己方重击，双方统一判定概率 */
const INTERRUPT_QUICK_VS_HEAVY = 0.5;

/** 调息：每次使用后需再经过若干玩家回合才能再次使用 */
const REST_COOLDOWN_TURNS = 3;

/** @type {{ id:string, perk:string, title:string, desc:string, primary:"offense"|"defense"|"sustain"|"tempo", extraTags:string[] }[]} */
const SKILL_CARDS =
  typeof SkillCardsConfig !== "undefined" && typeof SkillCardsConfig.buildSkillCards === "function"
    ? SkillCardsConfig.buildSkillCards(ns)
    : [];
/** 第一章属性卡池，见 skill_cards_config.js */
const ATTR_CARDS =
  SkillCardsConfig && Array.isArray(SkillCardsConfig.ATTR_CARDS) ? SkillCardsConfig.ATTR_CARDS : [];

function techPrimaryLabel(primary) {
  if (primary === "offense") return "进攻";
  if (primary === "defense") return "防守";
  if (primary === "sustain") return "续航";
  if (primary === "tempo") return "节奏";
  return "技法";
}

function techExtraTagsLine(c) {
  const xs = Array.isArray(c?.extraTags) ? c.extraTags.filter(Boolean) : [];
  if (!xs.length) return "";
  return xs.join(" / ");
}

function techTagCssForPerk(perk) {
  const c = perkCardById(perk);
  const p = c?.primary;
  if (p === "offense") return "offense";
  if (p === "defense") return "defense";
  if (p === "sustain") return "sustain";
  if (p === "tempo") return "tempo";
  return "tech";
}

function cardIsOffenseLeanTech(c) {
  return !!c && c.primary === "offense";
}

/** R1：与“进攻/防守侧”对应的非进攻牌（防守/续航/节奏都算另一侧） */
function cardIsNonOffenseLeanTech(c) {
  return !!c && c.primary !== "offense";
}

function removeMany(arr, toRemove) {
  const set = new Set(toRemove);
  return arr.filter((x) => !set.has(x));
}

function pickRandomDistinct(arr, n) {
  const uniq = [...new Set((arr || []).filter(Boolean))];
  const a = uniq.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a.slice(0, Math.max(0, Math.min(n, a.length)));
}

/** 技法池：去重 + 排除已入手 perk，避免三选一里出现重复或已拥有卡 */
function skillDraftPool(state) {
  const owned = new Set(state.perks || []);
  return [...new Set((state.skillDeckRemaining || []).filter((x) => x && !owned.has(x)))];
}

/** 属性卡池：已选过的属性卡不再进入后续成长选项 */
function attrDraftPool(state) {
  const taken = state._pickedAttrCardIds || {};
  return ATTR_CARDS.map((c) => c.id).filter((id) => !taken[id]);
}

function perkCardById(perk) {
  return SKILL_CARDS.find((c) => c.perk === perk) || { perk, title: perk, desc: "" };
}

function ensureDraftOffer(state, nodeId, fromPool, drawN) {
  state.draftOffers = state.draftOffers || {};
  if (Array.isArray(state.draftOffers[nodeId]) && state.draftOffers[nodeId].length) return state.draftOffers[nodeId];
  const offer = pickRandomDistinct(fromPool, drawN);
  state.draftOffers[nodeId] = offer;
  return offer;
}

/**
 * R1 技法卡三选一：轻约束（v0.1）
 * - 至少 1 张偏进攻
 * - 至少 1 张偏防守 / 容错
 */
function ensureR1TechOffer(state) {
  const nodeId = "R1_DRAFT";
  state.draftOffers = state.draftOffers || {};
  if (Array.isArray(state.draftOffers[nodeId]) && state.draftOffers[nodeId].length) return state.draftOffers[nodeId];

  const pool = skillDraftPool(state);
  const maxTry = 24;
  for (let t = 0; t < maxTry; t++) {
    const pick = pickRandomDistinct(pool, 3);
    const cards = pick.map((perk) => SKILL_CARDS.find((c) => c.perk === perk)).filter(Boolean);
    const hasOff = cards.some(cardIsOffenseLeanTech);
    const hasOther = cards.some(cardIsNonOffenseLeanTech);
    if (pick.length === 3 && hasOff && hasOther) {
      state.draftOffers[nodeId] = pick;
      return pick;
    }
  }
  const fallback = pickRandomDistinct(pool, 3);
  state.draftOffers[nodeId] = fallback;
  return fallback;
}

/**
 * R3 技法卡三选一：与 R1 相同的轻约束（至少 1 进攻向 + 至少 1 非纯进攻向）
 * draft key 使用节点 id `R3_LOOT`，与 applyGrowthOption 中按 node.id 移除候选池一致。
 */
function ensureR3TechOffer(state) {
  const nodeId = "R3_LOOT";
  state.draftOffers = state.draftOffers || {};
  if (Array.isArray(state.draftOffers[nodeId]) && state.draftOffers[nodeId].length) return state.draftOffers[nodeId];

  const pool = skillDraftPool(state);
  const maxTry = 24;
  for (let t = 0; t < maxTry; t++) {
    const pick = pickRandomDistinct(pool, 3);
    const cards = pick.map((perk) => SKILL_CARDS.find((c) => c.perk === perk)).filter(Boolean);
    const hasOff = cards.some(cardIsOffenseLeanTech);
    const hasOther = cards.some(cardIsNonOffenseLeanTech);
    if (pick.length === 3 && hasOff && hasOther) {
      state.draftOffers[nodeId] = pick;
      return pick;
    }
  }
  const fallback = pickRandomDistinct(pool, 3);
  state.draftOffers[nodeId] = fallback;
  return fallback;
}

function applyStatGrowth(state, kind) {
  const p = state.player;
  if (!p) return;
  if (kind === "atk") p.atkBonus = (p.atkBonus || 0) + ns(1);
  // v0.3：取消 DEF 常驻面板；防御成长改为“防御时额外减伤 +1”
  if (kind === "def") p.defendMitigationBonus = (p.defendMitigationBonus || 0) + 1;
  if (kind === "hp") {
    p.hpMax += ns(2);
    p.hp = Math.min(p.hp + ns(2), p.hpMax);
  }
  if (kind === "stg") {
    p.staggerThreshold += 1;
    if (p.stagger > p.staggerThreshold) p.stagger = p.staggerThreshold;
  }
}

function ensureR3Loot(state) {
  // 《设计表》v0.1：精英必掉 1 张装备卡；20% 概率额外掉 1 张“另一类”装备卡；若额外掉落触发，两张都必须拿
  if (state.lootR3) return state.lootR3;

  const weaponPool = [
    { id: "W01", title: "青釭副刃", desc: "ATK +10", w: 50, kind: "weapon", eff: { atk: ns(1) } },
    { id: "W02", title: "古锭刀", desc: "ATK +10；重击额外 +1 失衡", w: 30, kind: "weapon", eff: { atk: ns(1), heavyStg: 1 } },
    { id: "W03", title: "倚天残锋", desc: "ATK +20", w: 20, kind: "weapon", eff: { atk: ns(2) } },
  ];
  const armorPool = [
    { id: "R01", title: "亮银胸甲", desc: "防御时额外减伤 +10", w: 35, kind: "armor", eff: { defendMit: 1 } },
    { id: "R02", title: "狮蛮宝带", desc: "Max HP +20", w: 35, kind: "armor", eff: { hp: ns(2) } },
    { id: "R03", title: "连环锁甲", desc: "失衡上限 +1", w: 30, kind: "armor", eff: { stg: 1 } },
  ];

  const dropKind = Math.random() < 0.5 ? "weapon" : "armor";
  const pickFrom = (pool) => {
    const k = rngPickWeighted(pool.map((x) => ({ k: x.id, w: x.w })), nowR01());
    return pool.find((x) => x.id === k) || pool[0];
  };
  const primary = dropKind === "weapon" ? pickFrom(weaponPool) : pickFrom(armorPool);
  const extraTriggered = Math.random() < 0.2;
  const drops = [primary];
  if (extraTriggered) {
    const other = dropKind === "weapon" ? pickFrom(armorPool) : pickFrom(weaponPool);
    drops.push(other);
  }

  /** @type {{ drops: any[], taken: Record<string, boolean>, mustTakeAll: boolean }} */
  const out = { drops, taken: {}, mustTakeAll: drops.length >= 2 };
  for (const d of drops) out.taken[d.id] = false;
  state.lootR3 = out;
  return out;
}

function rngPickWeighted(items, r01) {
  // items: [{k, w}]
  const sum = items.reduce((a, it) => a + it.w, 0);
  let t = r01 * sum;
  for (const it of items) {
    t -= it.w;
    if (t <= 0) return it.k;
  }
  return items[items.length - 1].k;
}

function percent(n) {
  const v = Number.isFinite(n) ? clamp(n, 0, 1) : 0;
  // 用小数避免“数值与条长不一致”的观感（尤其是 1/3、2/3 这类分段）
  return `${(v * 100).toFixed(2)}%`;
}

function nowR01() {
  return Math.random();
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Boss 警戒说明：关键短语加大加亮（仅用于节点配置原文，分段转义） */
function bossAlertFlavorHighlightHtml(body) {
  const raw = body || "";
  const hits = [
    { needle: "盾反你的重击", cls: "boss-alert__hl boss-alert__hl--block" },
    { needle: "处决你", cls: "boss-alert__hl boss-alert__hl--exec" },
  ];
  const parts = [];
  let i = 0;
  while (i < raw.length) {
    let nextAt = -1;
    /** @type {{ needle: string, cls: string } | null} */
    let use = null;
    for (const h of hits) {
      const p = raw.indexOf(h.needle, i);
      if (p !== -1 && (nextAt === -1 || p < nextAt)) {
        nextAt = p;
        use = h;
      }
    }
    if (nextAt === -1 || !use) {
      parts.push(escapeHtml(raw.slice(i)));
      break;
    }
    if (nextAt > i) parts.push(escapeHtml(raw.slice(i, nextAt)));
    parts.push(`<span class="${use.cls}">${escapeHtml(use.needle)}</span>`);
    i = nextAt + use.needle.length;
  }
  return parts.join("");
}

function toRichHtml(text) {
  // supports tokens: {g}...{/g}, {r}...{/r}
  let html = escapeHtml(text);
  html = html
    .replaceAll("\n", "<br>")
    .replace(/\{g\}([\s\S]*?)\{\/g\}/g, '<span class="good">$1</span>')
    .replace(/\{r\}([\s\S]*?)\{\/r\}/g, '<span class="bad">$1</span>')
    .replace(/\{o\}([\s\S]*?)\{\/o\}/g, '<span class="orange">$1</span>');
  return html;
}

/**
 * 行动键下方说明：第 1 条加成金色，第 2 条及以后橙色（已转义）
 * @param {number} tierIndex 0=金，≥1=橙
 */
function hintBonusTier(text, tierIndex) {
  const cls = tierIndex <= 0 ? "action-effect-bonus" : "action-effect-bonus--t2";
  return `<span class="${cls}">${escapeHtml(text)}</span>`;
}

/** 快攻/重击「伤」：base 为基础档（2/3），atkBonus 为已×10 的加成存值；显示与 HP 一致 */
function hintShangWithAtkHighlight(baseDmgDesign, atkBonusScaled) {
  const n = ns(baseDmgDesign) + (atkBonusScaled || 0);
  if (!atkBonusScaled || atkBonusScaled <= 0) return `伤${n}`;
  return `伤${hintBonusTier(String(n), 0)}`;
}

function hintBonusLabel(text) {
  return hintBonusTier(text, 0);
}

function mkFighter({ name, hp, stagger, staggerThreshold, level = 1 }) {
  return {
    name,
    hp,
    hpMax: hp,
    stagger,
    staggerThreshold,
    level,
    /** 打击基伤：敌方仅「快攻/重击」意图使用；我方未用该字段（我方出手为固定档 + atkBonus） */
    strikeBase: ns(2),
    broken: false,
    brokenTurnsLeft: 0, // 进入破绽后持续回合数（到期强制清零）
  };
}

// 第一章·边寨首功（章节节点数据，先内嵌在 main.js）
const CHAPTERS = {
  chapter1: {
    id: "chapter1",
    title: "第一章·边寨首功",
    startNodeId: "B1",
    nodes: {
      N0: {
        id: "N0",
        type: /** @type {NodeType} */ ("N"),
        title: "乱世将启",
        subtitle: "",
        body: "",
        objective: "",
        options: [{ id: "start", title: "乱世将启", desc: "进入外哨战斗。", next: "N1" }],
      },
      N1: {
        id: "N1",
        type: /** @type {NodeType} */ ("N"),
        title: "上马入阵",
        subtitle: "",
        body: "",
        objective: "",
        options: [{ id: "ack", title: "进入外哨", desc: "开始战斗。", next: "B1" }],
      },
      B1: {
        id: "B1",
        type: /** @type {NodeType} */ ("B"),
        title: "边寨外哨",
        subtitle: "初试锋镝",
        body: "边寨之外，两名守兵已察觉你的行踪。前者当面拦路，后者伏于侧后，伺机而动。此战虽小，亦是你乱世立名的第一步。",
        objective: "击破外哨，取首功。",
        battle: {
          waves: [
            {
              name: "外哨",
              sequentialTwoSlots: true,
              slots: [
                {
                  name: "守卫刀兵甲",
                  archetype: "sentryA",
                  hp: ns(4),
                  staggerThreshold: 3,
                  atk: ns(2),
                  ai: { quick: 35, heavy: 25, defend: 20, adjust: 20 },
                },
                {
                  name: "守卫刀兵乙",
                  archetype: "sentryB",
                  hp: ns(4),
                  staggerThreshold: 3,
                  atk: ns(2),
                  ai: { quick: 45, heavy: 20, defend: 15, adjust: 20 },
                },
              ],
              reserve: [],
            },
          ],
          onWinNext: "R1_DRAFT",
          reward: { merit: 1 },
          tutorial: ["B1_turn1_intent", "B1_block_vs_heavy", "B1_block_vs_quick", "B1_broken_execute"],
        },
      },
      R1_DRAFT: {
        id: "R1_DRAFT",
        type: /** @type {NodeType} */ ("R"),
        title: "初悟战法",
        subtitle: "择一技傍身",
        body: "",
        objective: "",
        options: [],
      },
      B2: {
        id: "B2",
        type: /** @type {NodeType} */ ("B"),
        title: "寨门拒战",
        subtitle: "刀枪并至",
        body: "寨门火光摇动，刀兵与枪兵轮番压来。若只知硬拼，顷刻便会失了阵脚。",
        objective: "破寨门守兵。",
        battle: {
          waves: [
            {
              name: "寨门",
              slots: [
                { name: "守卫刀兵", archetype: "saber", hp: ns(4), staggerThreshold: 3, atk: ns(2), ai: { quick: 25, heavy: 25, defend: 30, adjust: 20 } },
                { name: "守卫枪兵", archetype: "spear", hp: ns(4), staggerThreshold: 4, atk: ns(2), ai: { quick: 55, heavy: 15, defend: 10, adjust: 20 } },
              ],
              reserve: [],
            },
          ],
          onWinNext: "R2_STAT",
          reward: { merit: 1 },
          tutorial: ["B2_feel_growth"],
        },
      },
      R2_STAT: {
        id: "R2_STAT",
        type: /** @type {NodeType} */ ("R"),
        title: "益其筋骨",
        subtitle: "强体稳势，再增锋芒",
        body: "",
        objective: "",
        options: [],
      },
      E1: {
        id: "E1",
        type: /** @type {NodeType} */ ("E"),
        title: "仓廪之前",
        subtitle: "伍长拦路",
        body: "仓区之外，伍长持盾立于正中，另有刀兵游走一侧。此战不止看勇，更看读势。",
        objective: "斩伍长，破其阵。",
        battle: {
          waves: [
            {
              name: "伍长",
              slots: [
                {
                  name: "亲兵盾",
                  archetype: "elite_shield",
                  hp: ns(7),
                  staggerThreshold: 6,
                  atk: ns(3),
                  canBlockHeavy: true,
                  ai: { quick: 10, heavy: 28, defend: 26, block: 22, adjust: 14 },
                },
                { name: "守卫刀兵", archetype: "saber", hp: ns(4), staggerThreshold: 3, atk: ns(2), ai: { quick: 30, heavy: 20, defend: 30, adjust: 20 } },
              ],
              reserve: [],
            },
          ],
          onWinNext: "R3_LOOT",
          reward: { merit: 2 },
          tutorial: ["E1_exam"],
        },
      },
      R3_LOOT: {
        id: "R3_LOOT",
        type: /** @type {NodeType} */ ("R"),
        title: "缴获军械",
        subtitle: "择其战法，为我所用",
        body: "",
        objective: "",
        options: [],
      },
      B3: {
        id: "B3",
        type: /** @type {NodeType} */ ("B"),
        title: "亲兵合围",
        subtitle: "三面压阵",
        body: "盾兵当先，刀兵与枪兵自两翼迫近，三人合势而来。若不能先断其一角，便要被其层层压住。",
        objective: "破亲兵围阵。",
        battle: {
          waves: [
            {
              name: "亲兵",
              slots: [
                {
                  name: "亲兵盾",
                  archetype: "shield",
                  hp: ns(7),
                  staggerThreshold: 6,
                  atk: ns(2),
                  canBlockHeavy: true,
                  ai: { quick: 8, heavy: 28, defend: 24, block: 25, adjust: 15 },
                },
                { name: "亲兵刀", archetype: "saber", hp: ns(5), staggerThreshold: 3, atk: ns(2), ai: { quick: 30, heavy: 25, defend: 25, adjust: 20 } },
                { name: "亲兵枪", archetype: "spear", hp: ns(6), staggerThreshold: 4, atk: ns(2), ai: { quick: 55, heavy: 15, defend: 10, adjust: 20 } },
              ],
              reserve: [],
            },
          ],
          onWinNext: "R4_DRAFT",
          reward: { merit: 2 },
          tutorial: ["B3_mixed_problem"],
        },
      },
      R4_DRAFT: {
        id: "R4_DRAFT",
        type: /** @type {NodeType} */ ("R"),
        title: "再悟战法",
        subtitle: "更进一步",
        body: "",
        objective: "",
        options: [],
      },
      N4: {
        id: "N4",
        type: /** @type {NodeType} */ ("N"),
        title: "头目当前",
        subtitle: "",
        body: "",
        objective: "",
        options: [{ id: "boss", title: "进入Boss战", desc: "开始Boss战。", next: "BOSS" }],
      },
      BOSS: {
        id: "BOSS",
        type: /** @type {NodeType} */ ("E"),
        title: "边寨渠帅",
        subtitle: "此战定名",
        body: "边寨渠帅亲自出手，刀法沉狠，且善以守制攻。你若失衡露隙，他必乘机取命。此战若胜，方称首功。",
        objective: "斩渠帅，夺军需。",
        battle: {
          waves: [
            {
              name: "头目",
              slots: [
                {
                  name: "边寨渠帅",
                  archetype: "boss",
                  hp: ns(10),
                  staggerThreshold: 8,
                  atk: ns(3),
                  ai: { quick: 30, heavy: 25, defend: 15, block: 20, adjust: 10 },
                  canExecutePlayer: true,
                  canBlockHeavy: true,
                },
                { name: "亲兵刀", archetype: "saber", hp: ns(5), staggerThreshold: 3, atk: ns(2), ai: { quick: 35, heavy: 20, defend: 25, adjust: 20 } },
              ],
              reserve: [],
            },
          ],
          onWinNext: "S1",
          reward: { merit: 3 },
          tutorial: ["BOSS_full_loop"],
        },
      },
      S1: {
        id: "S1",
        type: /** @type {NodeType} */ ("S"),
        title: "战罢",
        subtitle: "",
        body: "",
        objective: "",
        options: [{ id: "hook", title: "结束并查看结果", desc: "进入结束页。", next: "HOOK" }],
      },
      HOOK: {
        id: "HOOK",
        type: /** @type {NodeType} */ ("N"),
        title: "军报既成",
        subtitle: "",
        body: "",
        objective: "",
        options: [{ id: "restart", title: "再入乱世", desc: "回到开场。", next: "N0" }],
      },
    },
  },
};

/** 第一章战功：单战配置与章节聚合（终版 v1.0） */
const MERIT_BATTLES = {
  B1: {
    base_score: 60,
    turn_target: 5,
    turn_score_max: 30,
    turn_penalty_per_extra: 6,
    survival_score_max: 20,
    break_score_max: 15,
    break_penalty_each: 8,
    /** 玩家行动次数上限（与战功逐回合 `turnIndex` 对齐；超限判负） */
    merit_turn_limit: 10,
  },
  B2: {
    base_score: 80,
    turn_target: 5,
    turn_score_max: 30,
    turn_penalty_per_extra: 6,
    survival_score_max: 20,
    break_score_max: 15,
    break_penalty_each: 8,
    merit_turn_limit: 10,
  },
  E1: {
    base_score: 100,
    turn_target: 6,
    turn_score_max: 40,
    turn_penalty_per_extra: 5,
    survival_score_max: 30,
    break_score_max: 20,
    break_penalty_each: 10,
    merit_turn_limit: 10,
  },
  B3: {
    base_score: 110,
    turn_target: 8,
    turn_score_max: 40,
    turn_penalty_per_extra: 5,
    survival_score_max: 30,
    break_score_max: 20,
    break_penalty_each: 10,
    merit_turn_limit: 15,
  },
  BOSS: {
    base_score: 150,
    turn_target: 8,
    turn_score_max: 60,
    turn_penalty_per_extra: 6,
    survival_score_max: 50,
    break_score_max: 30,
    break_penalty_each: 15,
    merit_turn_limit: 15,
  },
};

const MERIT_RAPID_TURN_BUDGET = 35;

/**
 * 章节末「剩余回合」奖励：每场通关时，按本战 `merit_turn_limit − 已用战功回合` 补分，
 * 使少回合速通的总分与多回合磨血更接近（与 MERIT_SCORE_SCALE 同步）。
 */
const MERIT_REMAINING_TURN_RAW_PER = 32;

/** @param {string | null | undefined} battleNodeId */
function meritBattleTurnLimit(battleNodeId) {
  const c = MERIT_BATTLES[battleNodeId];
  return c?.merit_turn_limit ?? null;
}

/** 战功统一放大系数（显示、累计、章节奖励与评级区间同步 ×10） */
const MERIT_SCORE_SCALE = 10;

/** 战功战中阵亡：与本战即时战功撤销后，自累计中再扣（与界面 `runMeritScore` 同口径）；败阵当场在 `finish(lose)` 结算 */
const DEATH_MERIT_PENALTY = 2000;
/** 「再战此阵」时军功簿数字向下收敛的时长（略长于普通跳字） */
const RUN_MERIT_DEATH_PENALTY_ANIM_MS = 820;

/**
 * 战功评价（7 档）：按章节总战功 `final_merit_score` 绝对值划档（与界面累计同口径，已含 MERIT_SCORE_SCALE）。
 * 从高到低取第一条满足「总分 ≥ minScore」的规则；否则为战将。
 *
 * | Lv | 总战功 |
 * |----|--------|
 * | 8 天命 | ≥ 100000（破格层，不查 105 将魂池） |
 * | 7 神将 | ≥ 90000 |
 * | 6 飞将 | ≥ 80000 |
 * | 5 名将 | ≥ 70000 |
 * | 4 骁将 | ≥ 55000 |
 * | 3 健将 | ≥ 45000 |
 * | 2 勇将 | ≥ 40001（严格大于 40000） |
 * | 1 战将 | ≤ 40000 |
 */
const MERIT_GRADE_RULES_DESC = [
  { minScore: 90000, grade: "神将", gradeLine: "冠绝一时，几近传奇。" },
  { minScore: 80000, grade: "飞将", gradeLine: "锋芒绝伦，势若奔雷。" },
  { minScore: 70000, grade: "名将", gradeLine: "章法大成，已成名望。" },
  { minScore: 55000, grade: "骁将", gradeLine: "勇锐强横，锋势正盛。" },
  { minScore: 45000, grade: "健将", gradeLine: "能战善战，发挥稳定。" },
  { minScore: 40001, grade: "勇将", gradeLine: "已有勇名，尚待打磨。" },
];

const DESTINY_GRADE_LINES = [
  "此战已破人间名将之限。",
  "十万战功，已非凡将可尽述。",
  "此局之势，已超寻常武魂所能载。",
];

function meritGradeFromChapterScore(finalMeritScore, meritScale) {
  void meritScale;
  const v = Number(finalMeritScore);
  const score = Number.isFinite(v) ? v : 0;
  if (score >= 100000) {
    const i = Math.floor(Math.abs(score) % DESTINY_GRADE_LINES.length);
    return { grade: "天命", gradeLine: DESTINY_GRADE_LINES[i] };
  }
  if (score <= 40000) {
    return { grade: "战将", gradeLine: "可堪披甲，已具战阵之形。" };
  }
  for (const r of MERIT_GRADE_RULES_DESC) {
    if (score >= r.minScore) {
      return { grade: r.grade, gradeLine: r.gradeLine };
    }
  }
  return { grade: "战将", gradeLine: "可堪披甲，已具战阵之形。" };
}

/** 旧版「丁功～奇功」字 → 7 档正式版（展示、徽章配色与存档兼容） */
const MERIT_GRADE_LEGACY_TO_NEW = {
  奇功: "神将",
  甲功: "名将",
  乙功: "健将",
  丙功: "勇将",
  丁功: "战将",
};

function normalizeMeritGradeLabel(grade) {
  if (grade == null) return "";
  const g = String(grade).trim();
  if (!g || g === "—") return g;
  return MERIT_GRADE_LEGACY_TO_NEW[g] || g;
}

const BATTLE_MERIT_FX_MS = 1300;
const BATTLE_MERIT_FX_STRONG_MS = 1700;
// 《第一章即时战功系统》V2：五层结构（武伤 / 压制 / 对策 / 风格 / 处决 − 失误）× 倍率，再 × MERIT_SCORE_SCALE
const TURN_MERIT_EVENT_POINTS = {
  // 对策（离散）
  defend_success: 18,
  block_success: 26,
  counter_heavy: 26,
  counter_quick_defend: 18,
  break_defense: 22,
  punish_adjust: 18,
  interrupt_heavy: 24,
  interrupt_to_break: 30,
  enemy_broken: 45,
  // 处决
  execute_normal: 60,
  execute_elite: 120,
  execute_boss: 300,
  execute_finish_bonus: 25,
  // 风格（离散）
  rest_success: 10,
  lowhp_hit_bonus: 16,
  lowhp_execute_bonus: 30,
  multi_enemy_break_bonus: 20,
  multi_enemy_execute_bonus: 28,
  recover_hit_bonus: 16,
  recover_break_bonus: 24,
  style_no_damage_positive: 10,
  style_no_damage_tactic: 18,
  style_variety_2: 12,
  style_variety_3: 20,
  // 仅用于战后整备条等
  victory_restoration: 0,
  remaining_turn_merit: 0,
  // 负向（失误 raw）
  got_hit_quick: 12,
  got_hit_heavy: 18,
  block_fail_vs_quick: 20,
  heavy_interrupted: 18,
  block_whiff: 8,
  self_broken: 50,
  boss_execute_taken: 300,
  rest_hit: 16,
  empty_turn: 8,
};

const MERIT_V2_TACTIC_CODES = new Set([
  "defend_success",
  "block_success",
  "counter_heavy",
  "counter_quick_defend",
  "break_defense",
  "punish_adjust",
  "interrupt_heavy",
  "interrupt_to_break",
  "enemy_broken",
]);
const MERIT_V2_STYLE_CODES = new Set([
  "rest_success",
  "lowhp_hit_bonus",
  "lowhp_execute_bonus",
  "multi_enemy_break_bonus",
  "multi_enemy_execute_bonus",
  "recover_hit_bonus",
  "recover_break_bonus",
  "style_no_damage_positive",
  "style_no_damage_tactic",
  "style_variety_2",
  "style_variety_3",
]);
const MERIT_V2_EXECUTE_CODES = new Set([
  "execute_normal",
  "execute_elite",
  "execute_boss",
  "execute_finish_bonus",
]);

function getMomentumMultiplier(momentum) {
  const map = [1.0, 1.2, 1.5, 1.9, 2.4, 3.0];
  const m = Math.max(0, Math.min(5, momentum | 0));
  return map[m] || 1.0;
}

function getMistakeMultiplier(chain) {
  const c = chain | 0;
  if (c <= 1) return 1.0;
  if (c === 2) return 1.35;
  if (c === 3) return 1.7;
  return 2.2;
}

function getClutchMultiplier(flags) {
  const count =
    (flags?.lowHp ? 1 : 0) + (flags?.multiEnemy ? 1 : 0) + (flags?.justRecovered ? 1 : 0);
  if (count <= 0) return 1.0;
  if (count === 1) return 1.25;
  if (count === 2) return 1.4;
  return 1.6;
}

function mkMeritEvent(code, value) {
  return { code, value };
}

/** 顶部 tooltip / 结算用：分项一行（已含 MERIT_SCORE_SCALE） */
function meritBreakdownOneLinerFromRecord(record) {
  const bs = record?.breakdownScaled;
  if (!bs) return "";
  const w = bs.woundScore | 0;
  const p = bs.pressureScore | 0;
  const t = bs.tacticScore | 0;
  const st = bs.styleScore | 0;
  const ex = bs.executeScore | 0;
  const m = bs.mistakeScore | 0;
  return `武伤 ${w}｜压制 ${p}｜对策 ${t}｜风格 ${st}｜处决 ${ex}｜失误 ${m}`;
}

/** 战中即时层：只列非零分项，便于扫读 */
function meritBreakdownFxText(record) {
  const bs = record?.breakdownScaled;
  if (!bs) return "";
  const lines = [];
  if (bs.woundScore) lines.push(`武伤 +${bs.woundScore}`);
  if (bs.pressureScore) lines.push(`压制 +${bs.pressureScore}`);
  if (bs.tacticScore) lines.push(`对策 +${bs.tacticScore}`);
  if (bs.styleScore) lines.push(`风格 +${bs.styleScore}`);
  if (bs.executeScore) lines.push(`处决 +${bs.executeScore}`);
  if (bs.mistakeScore) lines.push(`失误 -${bs.mistakeScore}`);
  return lines.join("\n");
}

/** 累计对敌 HP 伤害与「击中前已有失衡」次数（用于 V2 武伤分；staggerBefore/brokenBefore 须为出手前快照） */
function meritAccPlayerToEnemyHit(meritTurn, r, staggerBefore, brokenBefore) {
  if (!meritTurn || !r) return;
  meritTurn.damageDealtTotal = (meritTurn.damageDealtTotal || 0) + (r.eDmg || 0);
  if (r.hit && !brokenBefore && (staggerBefore | 0) > 0) {
    meritTurn.hitsOnStaggeredEnemy = (meritTurn.hitsOnStaggeredEnemy || 0) + 1;
  }
}

function sumEvents(evts) {
  return (evts || []).reduce((a, e) => a + (e?.value || 0), 0);
}

function meritSumWithFloor0(logs) {
  let v = 0;
  for (const r of logs || []) {
    v = Math.max(0, v + (r?.turnMeritDelta || 0));
  }
  return v;
}

/** 补齐 V2 pack 字段（连打变化、压制层数等），须在 collect / compute 之前调用 */
function enrichMeritPackV2BeforeCompute(state, ctx, pack) {
  const st = Number(pack.enemyStaggerGainedTotal ?? pack.staggerAddedTotal ?? 0);
  pack.staggerAddedTotal = st;
  pack.damageDealtTotal = Number(pack.damageDealtTotal || 0);
  pack.damageMitigatedTotal = Number(pack.damageMitigatedTotal || 0);
  pack.healDoneTotal = Number(pack.healDoneTotal || 0);
  pack.hitsOnStaggeredEnemy = Number(pack.hitsOnStaggeredEnemy || 0);

  const ps = ctx?._sameTargetPressureStreak | 0;
  pack.sameTargetPressureLevel = ps >= 3 ? 3 : ps >= 2 ? 2 : 0;

  const prev = ctx?._prevPositiveAction || null;
  const streak = ctx?._varietyStreak | 0;
  if (prev && pack.action && prev !== pack.action && streak >= 2) pack.varietyStreakLevel = 3;
  else if (prev && pack.action && prev !== pack.action && streak >= 1) pack.varietyStreakLevel = 2;
  else pack.varietyStreakLevel = 0;

  const hadMeritActivity =
    !!pack.hadPlayerHit ||
    !!pack.executeKind ||
    !!pack.interruptHeavy ||
    !!pack.counterHeavy ||
    !!pack.breakDefense ||
    !!pack.punishAdjust ||
    !!pack.anyEnemyBrokenNew ||
    (pack.action === "defend" && pack.damageTakenThisTurn === 0 && !pack.defendFailedThisTurn) ||
    (pack.action === "block" && !!pack.anyBlockSuccess) ||
    (pack.action === "rest" && pack.damageTakenThisTurn === 0);

  pack.noDamagePositiveTurn = pack.damageTakenThisTurn === 0 && hadMeritActivity;

  pack.didTacticSuccess =
    !!pack.counterHeavy ||
    !!pack.counterQuickDefend ||
    !!pack.interruptHeavy ||
    !!pack.breakDefense ||
    !!pack.punishAdjust ||
    !!pack.anyEnemyBrokenNew ||
    (!!pack.anyBlockSuccess && !!pack.anyHeavyIntent);

  const lowHp =
    (pack.playerHpEnd || 0) > 0 && (pack.playerHpMax || 1) > 0
      ? pack.playerHpEnd <= Math.floor(pack.playerHpMax * 0.3)
      : false;
  pack.didStyleSuccess =
    (!!pack.noDamagePositiveTurn && !!pack.didTacticSuccess) ||
    (lowHp && (!!pack.hadPlayerHit || !!pack.executeKind)) ||
    (!!pack.justRecoveredFromBroken && !!pack.hadPlayerHit);
}

function collectTurnMeritEvents(state, pack) {
  const pos = [];
  const neg = [];
  const pts = TURN_MERIT_EVENT_POINTS;

  const addPos = (code, n = 1) => {
    const v = (pts[code] || 0) * Math.max(1, n | 0);
    if (v > 0) pos.push(mkMeritEvent(code, v));
  };
  const addNeg = (code, n = 1) => {
    const v = (pts[code] || 0) * Math.max(1, n | 0);
    if (v > 0) neg.push(mkMeritEvent(code, v));
  };

  const hadHit = !!pack.hadPlayerHit;
  const hadEnemyBroken = !!pack.anyEnemyBrokenNew;
  const multiEnemy = (pack.aliveEnemyCountEnd || 0) >= 2;
  const lowHp = (pack.playerHpEnd || 0) > 0 && (pack.playerHpMax || 1) > 0
    ? pack.playerHpEnd <= Math.floor(pack.playerHpMax * 0.3)
    : false;

  // 对策（武伤由 HP/失衡/减伤/治疗连续量另行计算）
  if (pack.action === "defend" && pack.damageTakenThisTurn === 0 && !pack.defendFailedThisTurn) {
    if (pack.counterQuickDefend) addPos("counter_quick_defend");
    else addPos("defend_success");
  }
  if (pack.action === "block" && pack.anyBlockSuccess) {
    if (pack.counterHeavy) addPos("counter_heavy");
    else addPos("block_success");
  }
  if (pack.action === "rest" && pack.damageTakenThisTurn === 0) addPos("rest_success");

  if (pack.breakDefense) addPos("break_defense");
  if (pack.punishAdjust) addPos("punish_adjust");
  if (pack.interruptHeavy) addPos("interrupt_heavy");
  if (pack.interruptHeavy && hadEnemyBroken) addPos("interrupt_to_break");
  if (hadEnemyBroken) addPos("enemy_broken");

  if (pack.executeKind) {
    addPos(pack.executeKind);
    if (pack.executeFinishBonus) addPos("execute_finish_bonus");
  }

  // 风格
  if (pack.noDamagePositiveTurn) {
    if (pack.didTacticSuccess) addPos("style_no_damage_tactic");
    else addPos("style_no_damage_positive");
  }
  if (pack.varietyStreakLevel === 3) addPos("style_variety_3");
  else if (pack.varietyStreakLevel === 2) addPos("style_variety_2");
  if (lowHp && hadHit) addPos("lowhp_hit_bonus");
  if (lowHp && pack.executeKind) addPos("lowhp_execute_bonus");
  if (multiEnemy && hadEnemyBroken) addPos("multi_enemy_break_bonus");
  if (multiEnemy && pack.executeKind) addPos("multi_enemy_execute_bonus");
  if (pack.justRecoveredFromBroken && hadHit) addPos("recover_hit_bonus");
  if (pack.justRecoveredFromBroken && hadEnemyBroken) addPos("recover_break_bonus");

  // 负向
  if (pack.gotHitQuick) addNeg("got_hit_quick");
  if (pack.gotHitHeavy) addNeg("got_hit_heavy");
  if (pack.blockFailVsQuick) addNeg("block_fail_vs_quick");
  if (pack.heavyInterrupted) addNeg("heavy_interrupted");
  if (pack.blockWhiff) addNeg("block_whiff");
  if (pack.selfBrokenThisTurn) addNeg("self_broken");
  if (pack.bossExecuteTaken) addNeg("boss_execute_taken");
  if (pack.action === "rest" && pack.damageTakenThisTurn > 0) addNeg("rest_hit");

  if (!pos.length && !neg.length) addNeg("empty_turn");

  return { positiveEvents: pos, negativeEvents: neg, flags: { lowHp, multiEnemy } };
}

function sumMeritEventsByCodeSet(evts, set) {
  let s = 0;
  for (const e of evts || []) {
    if (e && set.has(e.code)) s += e.value || 0;
  }
  return s;
}

function computeTurnMerit(state, ctx, eventPack, meta) {
  enrichMeritPackV2BeforeCompute(state, ctx, eventPack);
  const turnEvents = collectTurnMeritEvents(state, eventPack);

  const H = NUM_SCALE;
  const dmg = Math.max(0, Number(eventPack.damageDealtTotal || 0));
  const stg = Math.max(0, Number(eventPack.staggerAddedTotal || 0));
  const mit = Math.max(0, Number(eventPack.damageMitigatedTotal || 0));
  const heal = Math.max(0, Number(eventPack.healDoneTotal || 0));
  const stHit = Math.max(0, Number(eventPack.hitsOnStaggeredEnemy || 0));

  const woundScore =
    Math.floor(dmg / H) * 12 +
    Math.floor(stg) * 9 +
    Math.floor(mit / H) * 6 +
    Math.floor(heal / H) * 5 +
    stHit * 6;

  const pressureScore =
    eventPack.sameTargetPressureLevel >= 3 ? 22 : eventPack.sameTargetPressureLevel >= 2 ? 14 : 0;

  const tacticScore = sumMeritEventsByCodeSet(turnEvents.positiveEvents, MERIT_V2_TACTIC_CODES);
  const styleScore = sumMeritEventsByCodeSet(turnEvents.positiveEvents, MERIT_V2_STYLE_CODES);
  const executeScore = sumMeritEventsByCodeSet(turnEvents.positiveEvents, MERIT_V2_EXECUTE_CODES);
  const mistakeScore = sumEvents(turnEvents.negativeEvents);

  const positiveBase = woundScore + pressureScore + tacticScore + styleScore + executeScore;

  const clutchMultiplier = getClutchMultiplier({
    lowHp: turnEvents.flags.lowHp,
    multiEnemy: turnEvents.flags.multiEnemy,
    justRecovered: !!eventPack.justRecoveredFromBroken,
  });
  const momentumMultiplier = getMomentumMultiplier(ctx.momentum);
  const mistakeMultiplier = getMistakeMultiplier(ctx.mistakeChain);

  const positiveFinal = Math.floor(positiveBase * clutchMultiplier * momentumMultiplier);
  const negativeFinal = Math.floor(mistakeScore * mistakeMultiplier);
  const turnMeritDeltaRaw = positiveFinal - negativeFinal;

  const innerPos = Math.floor(positiveBase * clutchMultiplier * momentumMultiplier);
  const allocateInnerMeritProportional = (innerTotal, weights) => {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (innerTotal <= 0 || sum <= 0) return weights.map(() => 0);
    const frac = weights.map((w) => (innerTotal * w) / sum);
    const base = frac.map((f) => Math.floor(f));
    let diff = innerTotal - base.reduce((a, b) => a + b, 0);
    const order = frac.map((f, i) => ({ i, rem: f - base[i] })).sort((a, b) => b.rem - a.rem);
    for (let k = 0; diff > 0 && k < order.length; k++) {
      base[order[k].i] += 1;
      diff--;
    }
    return base;
  };
  const [woundPart, pressurePart, tacticPart, stylePart, executePart] = allocateInnerMeritProportional(
    Math.max(0, innerPos),
    [woundScore, pressureScore, tacticScore, styleScore, executeScore],
  );

  const S = MERIT_SCORE_SCALE;
  for (const e of turnEvents.positiveEvents) e.value = Math.round((e.value || 0) * S);
  for (const e of turnEvents.negativeEvents) e.value = Math.round((e.value || 0) * S);

  const breakdownScaled = {
    woundScore: Math.round(woundPart * S),
    pressureScore: Math.round(pressurePart * S),
    tacticScore: Math.round(tacticPart * S),
    styleScore: Math.round(stylePart * S),
    executeScore: Math.round(executePart * S),
    mistakeScore: Math.round(negativeFinal * S),
  };

  const positiveBaseScaled = Math.round(positiveBase * S);
  const negativeBaseScaled = Math.round(mistakeScore * S);
  const positiveFinalScaled = Math.round(positiveFinal * S);
  const negativeFinalScaled = Math.round(negativeFinal * S);
  const turnMeritDelta = Math.round(turnMeritDeltaRaw * S);

  const meritBefore = state.runMeritScore ?? 0;
  const meritAfter = Math.max(0, meritBefore + turnMeritDelta);

  return {
    record: {
      battleId: ctx.battleId,
      turnIndex: ctx.turnIndex,
      positiveEvents: turnEvents.positiveEvents,
      negativeEvents: turnEvents.negativeEvents,
      positiveBase: positiveBaseScaled,
      negativeBase: negativeBaseScaled,
      clutchMultiplier,
      momentumMultiplier,
      mistakeMultiplier,
      positiveFinal: positiveFinalScaled,
      negativeFinal: negativeFinalScaled,
      turnMeritDelta,
      meritBefore,
      meritAfter,
      momentumBefore: ctx.momentum,
      mistakeBefore: ctx.mistakeChain,
      meta: meta || {},
      breakdown: {
        woundScore,
        pressureScore,
        tacticScore,
        styleScore,
        executeScore,
        mistakeScore,
      },
      breakdownScaled,
    },
    delta: turnMeritDelta,
    meritAfter,
  };
}

function updateMeritContextAfterTurn(ctx, pack, record) {
  const momentumBefore = ctx.momentum | 0;
  const mistakeBefore = ctx.mistakeChain | 0;

  const hasPosKey =
    (record.positiveBase || 0) > 0 ||
    (record.positiveEvents || []).some((e) =>
      ["counter_heavy", "break_defense", "interrupt_heavy", "enemy_broken"].includes(e.code) ||
      String(e.code || "").startsWith("execute_"),
    ) ||
    false;
  const hasNegAny = (record.negativeEvents || []).length > 0;
  const hasDmgNeg = (record.negativeEvents || []).some((e) =>
    ["got_hit_quick", "got_hit_heavy", "block_fail_vs_quick", "heavy_interrupted"].includes(e.code),
  );
  const hasClearMomentum = (record.negativeEvents || []).some((e) =>
    ["self_broken", "boss_execute_taken"].includes(e.code),
  );

  // momentum
  let momentumAfter = momentumBefore;
  if (hasClearMomentum) momentumAfter = 0;
  else if (hasDmgNeg) momentumAfter = Math.max(0, momentumAfter - 1);
  else if (hasPosKey || (pack.damageTakenThisTurn === 0 && !!pack.hadPlayerHit)) momentumAfter = Math.min(5, momentumAfter + 1);

  // mistake chain
  let mistakeAfter = mistakeBefore;
  if (record.positiveEvents?.some((e) => String(e.code || "").startsWith("execute_"))) mistakeAfter = 0;
  else if (!hasNegAny && !!pack.hadPlayerHit) mistakeAfter = 0;
  else if (hasNegAny) mistakeAfter = Math.min(4, mistakeAfter + 1);

  ctx.momentum = momentumAfter;
  ctx.mistakeChain = mistakeAfter;
  ctx.lastTurnNoDamage = pack.damageTakenThisTurn === 0;
  ctx.lastTurnHadHit = !!pack.hadPlayerHit;
  ctx.justRecoveredFromBroken = !!pack.justRecoveredFromBrokenNext;
  // 处决不计入「回合」：战功回合序号与限回合判负均不因此推进
  if (pack.action !== "execute") ctx.turnIndex += 1;

  const dMerit = record.turnMeritDelta || 0;
  const act = pack.action;
  if (dMerit > 0 && act) {
    if (ctx._prevPositiveAction && ctx._prevPositiveAction !== act) ctx._varietyStreak = (ctx._varietyStreak || 0) + 1;
    else ctx._varietyStreak = 1;
    ctx._prevPositiveAction = act;
  } else if (dMerit <= 0) {
    ctx._varietyStreak = 0;
    ctx._prevPositiveAction = null;
  }
  if (pack.pressureChain) ctx._sameTargetPressureStreak = (ctx._sameTargetPressureStreak || 1) + 1;
  else if (pack.hadPlayerHit && pack.targetId) ctx._sameTargetPressureStreak = 1;
  else ctx._sameTargetPressureStreak = 0;

  record.momentumAfter = momentumAfter;
  record.mistakeAfter = mistakeAfter;
}

function formatTurnMeritBreakdownLines(record) {
  const lines = [];
  const delta = record.turnMeritDelta || 0;
  const head = delta >= 0 ? `{g}战功 +${delta}{/g}` : `{r}战功 ${delta}{/r}`;
  lines.push(head);

  for (const e of record.positiveEvents || []) {
    const pts = e.value || 0;
    lines.push(`{g}${escapeHtml(turnMeritEventLabel(e.code))} +${pts}{/g}`);
  }
  for (const e of record.negativeEvents || []) {
    const pts = e.value || 0;
    lines.push(`{r}${escapeHtml(turnMeritEventLabel(e.code))} -${pts}{/r}`);
  }

  if ((record.positiveBase || 0) > 0) {
    if ((record.clutchMultiplier || 1) > 1) lines.push(`高压倍率 ×${record.clutchMultiplier}`);
    if ((record.momentumMultiplier || 1) > 1) lines.push(`连势倍率 ×${record.momentumMultiplier}`);
  }
  if ((record.negativeBase || 0) > 0 && (record.mistakeMultiplier || 1) > 1) {
    lines.push(`连续失手倍率 ×${record.mistakeMultiplier}`);
  }
  // 追加一个“本回合汇总”，帮助玩家快速理解净变化来源
  if ((record.positiveBase || 0) > 0 || (record.negativeBase || 0) > 0) {
    lines.push(
      `本回合：正向 ${record.positiveFinal}（基${record.positiveBase}）｜负向 ${record.negativeFinal}（基${record.negativeBase}）`,
    );
  }
  const bd = meritBreakdownOneLinerFromRecord(record);
  if (bd) lines.push(bd);
  return lines.join("\n");
}

function buildBattleMeritVisualEvents(record) {
  const pos = Array.isArray(record?.positiveEvents) ? record.positiveEvents : [];
  const neg = Array.isArray(record?.negativeEvents) ? record.negativeEvents : [];
  const hasPos = (codes) => pos.some((e) => codes.includes(e.code));
  const hasNeg = (codes) => neg.some((e) => codes.includes(e.code));

  /** @type {{ judgement: string, delta: number, combo: number, tone: "normal"|"gold"|"red"|"execute", strong: boolean, breakdownText?: string }[]} */
  const out = [];
  const comboAfter = Math.max(0, record?.momentumAfter || 0);
  const delta = record?.turnMeritDelta || 0;
  const breakdownText = meritBreakdownFxText(record);

  if (hasPos(["execute_boss", "execute_elite", "execute_normal"])) {
    out.push({ judgement: "处决", delta, combo: comboAfter, tone: "execute", strong: true, breakdownText });
  } else if (hasPos(["counter_heavy", "block_success", "counter_quick_defend"])) {
    out.push({ judgement: "反制", delta, combo: comboAfter, tone: "gold", strong: true, breakdownText });
  } else if (hasPos(["interrupt_to_break"])) {
    out.push({ judgement: "断势", delta, combo: comboAfter, tone: "gold", strong: true, breakdownText });
  } else if (hasPos(["interrupt_heavy"])) {
    out.push({ judgement: "打断", delta, combo: comboAfter, tone: "gold", strong: true, breakdownText });
  } else if (hasPos(["enemy_broken"])) {
    out.push({ judgement: "破绽", delta, combo: comboAfter, tone: "gold", strong: true, breakdownText });
  } else if (
    hasPos(["attack_hit", "heavy_hit"]) ||
    ((record.positiveBase || 0) > 0 && ["attack", "heavy"].includes(record.meta?.action))
  ) {
    out.push({ judgement: "命中", delta, combo: comboAfter, tone: "normal", strong: false, breakdownText });
  } else if (hasNeg(["boss_execute_taken"])) {
    out.push({ judgement: "COMBO BREAK", delta: 0, combo: 0, tone: "red", strong: true, breakdownText });
  } else if (hasNeg(["self_broken"])) {
    out.push({ judgement: "失手", delta, combo: comboAfter, tone: "red", strong: false, breakdownText });
  } else if (hasNeg(["block_fail_vs_quick", "heavy_interrupted"])) {
    out.push({ judgement: "被破", delta, combo: comboAfter, tone: "red", strong: false, breakdownText });
  } else if (delta !== 0) {
    out.push({
      judgement: delta > 0 ? "得势" : "失势",
      delta,
      combo: comboAfter,
      tone: delta > 0 ? "normal" : "red",
      strong: false,
      breakdownText,
    });
  }

  const momentumBefore = Math.max(0, record?.momentumBefore || 0);
  const momentumAfter = Math.max(0, record?.momentumAfter || 0);
  if (momentumBefore > 0 && momentumAfter === 0 && !out.some((x) => x.judgement === "COMBO BREAK")) {
    out.push({ judgement: "COMBO BREAK", delta: 0, combo: 0, tone: "red", strong: true, breakdownText });
  }

  if (!out.length) return out;
  // 第一版：同回合最多展示主反馈 + COMBO BREAK，一共不超过两条
  const main = out[0];
  if (!main.breakdownText && breakdownText) main.breakdownText = breakdownText;
  const breakEvent = out.find((x) => x.judgement === "COMBO BREAK");
  if (breakEvent && breakEvent !== main) return [main, breakEvent];
  return [main];
}

function enqueueBattleMeritFx(state, events) {
  if (!events?.length) return;
  state.battleMeritFxQueue = state.battleMeritFxQueue || [];
  state.battleMeritFxQueue.push(...events);
  if (state.battleMeritFxQueue.length > 3) {
    state.battleMeritFxQueue = state.battleMeritFxQueue.slice(-3);
  }
}

function clearBattleMeritFx(ui) {
  if (!ui?.battleMeritFxLayer) return;
  ui.battleInfoPanel?.classList.remove("battle-info-panel--merit-fx-active");
  ui.battleMeritFxLayer.hidden = true;
  ui.battleMeritFxLayer.setAttribute("aria-hidden", "true");
  ui.battleMeritFxLayer.className = "battle-merit-fx-layer";
  if (ui.battleMeritJudgement) ui.battleMeritJudgement.textContent = "";
  if (ui.battleMeritDelta) ui.battleMeritDelta.textContent = "";
  if (ui.battleMeritCombo) {
    ui.battleMeritCombo.textContent = "";
    ui.battleMeritCombo.className = "battle-merit-combo";
  }
  if (ui.battleMeritBreakdown) {
    ui.battleMeritBreakdown.textContent = "";
    ui.battleMeritBreakdown.setAttribute("aria-hidden", "true");
  }
}

function syncBattleResolutionAnchor(ui) {
  const panelRect = ui?.battleInfoPanel?.getBoundingClientRect();
  const dividerRect = ui?.dividerAfterEnemies?.getBoundingClientRect();
  let anchorY = null;
  if (panelRect && dividerRect) {
    anchorY = dividerRect.top - panelRect.top + dividerRect.height / 2;
  } else if (panelRect) {
    anchorY = panelRect.height * 0.5;
  }
  if (anchorY == null) return;
  const px = `${Math.round(anchorY)}px`;
  ui.battleInfoPanel?.style.setProperty("--resolution-anchor-y", px);
  ui.resolutionLayer?.style.setProperty("--resolution-anchor-y", px);
  ui.battleMeritFxLayer?.style.setProperty("--resolution-anchor-y", px);
}

function renderBattleMeritFx(ui, event) {
  if (!ui?.battleMeritFxLayer || !event) return;
  syncBattleResolutionAnchor(ui);
  const layer = ui.battleMeritFxLayer;
  const ms = event.strong ? BATTLE_MERIT_FX_STRONG_MS : BATTLE_MERIT_FX_MS;
  const toneClass = `battle-merit--${event.tone || "normal"}`;
  layer.style.setProperty("--battle-merit-ms", `${ms}ms`);
  ui.battleInfoPanel?.classList.add("battle-info-panel--merit-fx-active");
  layer.className = `battle-merit-fx-layer ${toneClass}${event.strong ? " battle-merit--strong" : ""} is-active`;
  layer.hidden = false;
  layer.setAttribute("aria-hidden", "false");
  if (ui.battleMeritJudgement) ui.battleMeritJudgement.textContent = event.judgement || "";
  if (ui.battleMeritDelta) {
    const d = Number(event.delta || 0);
    ui.battleMeritDelta.textContent = d > 0 ? `+${d}` : d < 0 ? `${d}` : "";
  }
  if (ui.battleMeritCombo) {
    const c = Math.max(0, Number(event.combo || 0));
    ui.battleMeritCombo.className = "battle-merit-combo";
    if (c > 0) {
      ui.battleMeritCombo.textContent = `COMBO x${c}`;
      if (c >= 4) ui.battleMeritCombo.classList.add("is-x4");
      else if (c === 3) ui.battleMeritCombo.classList.add("is-x3");
      else if (c === 2) ui.battleMeritCombo.classList.add("is-x2");
    } else if (event.judgement === "COMBO BREAK") {
      ui.battleMeritCombo.textContent = "连势中断";
    } else {
      ui.battleMeritCombo.textContent = "";
    }
  }
  if (ui.battleMeritBreakdown) {
    const t = String(event.breakdownText || "").trim();
    ui.battleMeritBreakdown.textContent = t;
    ui.battleMeritBreakdown.setAttribute("aria-hidden", t ? "false" : "true");
  }
}

function playNextBattleMeritFx(state, ui) {
  if (!ui?.battleMeritFxLayer) return;
  if (state.battleMeritFxPlaying) return;
  const queue = state.battleMeritFxQueue || [];
  if (!queue.length) return;
  const ev = queue.shift();
  state.battleMeritFxQueue = queue;
  state.battleMeritFxPlaying = true;
  state.visibleCombo = Math.max(0, Number(ev?.combo || 0));
  renderBattleMeritFx(ui, ev);
  const ms = ev?.strong ? BATTLE_MERIT_FX_STRONG_MS : BATTLE_MERIT_FX_MS;
  window.setTimeout(() => {
    clearBattleMeritFx(ui);
    state.battleMeritFxPlaying = false;
    playNextBattleMeritFx(state, ui);
  }, ms);
}

function applyTurnMeritResult(state, ui, ctx, turnPack) {
  if (!ctx) return;
  const computed = computeTurnMerit(state, ctx, turnPack, { action: turnPack.action });
  const rec = computed.record;

  // 更新累计战功（并触发顶部跳字）
  const from = state.runMeritScore ?? 0;
  const to = computed.meritAfter ?? from;
  state.runMeritScore = to;
  if (ui?.runMeritValue) {
    state._runMeritAnimating = true;
    ui.runMeritValue.textContent = String(from);
    requestAnimationFrame(() => animateRunMeritValue(ui, state, from, to));
  }

  // 写日志：战功明细只进结算日志，不进战斗日志
  state.turnMeritLog = state.turnMeritLog || [];
  state.chapterMeritLog = state.chapterMeritLog || [];
  state.turnMeritLog.push(rec);
  state.chapterMeritLog.push(rec);
  recordHeroProfileFromTurnRecord(state, rec);
  state.settleLog.push(formatTurnMeritBreakdownLines(rec));

  // 更新上下文（连势/失手链/下一回合标志）
  updateMeritContextAfterTurn(ctx, turnPack, rec);
  const visualEvents = buildBattleMeritVisualEvents(rec);
  enqueueBattleMeritFx(state, visualEvents);
  playNextBattleMeritFx(state, ui);
}

function meritLogPlayerExecute(state, tgt, clinchKill) {
  if (!state._meritSession || !state.battle?.battleNodeId) return;
  const bid = state.battle.battleNodeId;
  /** @type {"normal"|"elite"|"boss"} */
  let kind = "normal";
  if (bid === "E1") kind = "elite";
  else if (bid === "BOSS" && tgt.archetype === "boss" && clinchKill) kind = "boss";
  state._meritSession.executeLog.push(kind);
}

function recordMeritBattleWin(state, battleNodeId, winHp) {
  const cfg = MERIT_BATTLES[battleNodeId];
  if (!cfg || !state._meritSession) return;
  state.meritChapter = state.meritChapter || { retries: {}, records: {}, battleRemainGranted: {} };
  const turnCount = Math.max(0, state.globalTurn - 1);
  const ctx = state._meritTurnContext;
  /** 与战功逐回合 `turnIndex` 对齐的已出手次数（胜局结算后 = turnIndex−1） */
  const merit_turns_used = ctx ? Math.max(0, (ctx.turnIndex || 1) - 1) : turnCount;
  state.meritChapter.records[battleNodeId] = {
    battle_id: battleNodeId,
    turn_count: turnCount,
    merit_turns_used,
    win_hp: Math.max(0, winHp),
    max_hp: state._meritSession.maxHpAtStart || state.player.hpMax,
    break_count: state._meritSession.breakCount,
    execute_log: state._meritSession.executeLog.slice(),
    boss_execute_player: state._meritSession.bossExecutePlayer ? 1 : 0,
    death_retry_count: state.meritChapter.retries[battleNodeId] || 0,
  };
  state._meritSession = null;
}

/** 单场战功分项（与章节聚合算法一致；处决分为本场累计 raw，全章再 cap 到 50） */
function meritPointsForBattleRecord(cfg, rec) {
  const extraTurns = Math.max(0, rec.turn_count - cfg.turn_target);
  const turnPart = Math.max(0, cfg.turn_score_max - extraTurns * cfg.turn_penalty_per_extra);
  const maxHp = Math.max(1, rec.max_hp);
  const winHp = Math.max(0, rec.win_hp);
  const survivalPart = Math.floor((cfg.survival_score_max * winHp) / maxHp);
  const breakPart = Math.max(0, cfg.break_score_max - rec.break_count * cfg.break_penalty_each);
  let executePart = 0;
  for (const k of rec.execute_log || []) {
    if (k === "boss") executePart += 20;
    else if (k === "elite") executePart += 10;
    else executePart += 5;
  }
  return {
    base: cfg.base_score,
    turnPart,
    survivalPart,
    breakPart,
    executePart,
  };
}

function meritSubtotalFromParts(p) {
  return p.base + p.turnPart + p.survivalPart + p.breakPart + p.executePart;
}

function formatChapterSettleBehaviorAxis(v) {
  if (!v) return "";
  const b = v.soulBehavior != null ? String(v.soulBehavior).trim() : "";
  const rawT = v.soulBehaviorTitle != null ? String(v.soulBehaviorTitle).trim() : "";
  const t = rawT && rawT !== "—" ? rawT : "";
  if (b && t) return `${b} · ${t}`;
  return String(v.heroPrimaryLine || "").trim();
}

function buildEmptyHeroVerdict() {
  return {
    soulMode: false,
    isDestinyTier: false,
    destinySoul: null,
    heroPrimaryName: "",
    heroPrimaryTitle: "",
    heroPrimaryLine: "",
    soulBehavior: "",
    soulBehaviorTitle: "",
    soulVerdictQi: "",
    soulBattleAnchor: "",
    soulResembleQual: "",
    soulMappingExplain: "",
    soulOverallLevelDisplay: "",
    heroExplain: "",
    heroPoem: /** @type {string[]} */ ([]),
    heroSecondaryName: "",
    heroSecondaryTitle: "",
  };
}

/** 五维数值：90+ / 80–89 / 70–79 / <70 四档，便于玩家理解「优势项」 */
function soulStatNumClass(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return "soul-stat-num soul-stat-num--t1";
  if (v >= 90) return "soul-stat-num soul-stat-num--t4";
  if (v >= 80) return "soul-stat-num soul-stat-num--t3";
  if (v >= 70) return "soul-stat-num soul-stat-num--t2";
  return "soul-stat-num soul-stat-num--t1";
}

function soulWeaponGradeClass(g) {
  const s = String(g || "").trim();
  if (s === "S") return "soul-wp-val soul-wp-val--s";
  if (s === "A") return "soul-wp-val soul-wp-val--a";
  if (s === "B") return "soul-wp-val soul-wp-val--b";
  return "soul-wp-val soul-wp-val--c";
}

/** 兵种适性 chip 修饰（S/A/B/C） */
function soulWpChipTierClass(g) {
  const s = String(g || "").trim();
  if (s === "S") return "soul-wp-chip--s";
  if (s === "A") return "soul-wp-chip--a";
  if (s === "B") return "soul-wp-chip--b";
  return "soul-wp-chip--c";
}

/**
 * 结算/战报共用：将魂底蕴 + 五维格 + 兵种 chip（名将面板结构）
 * @param {string} [wrapperClass] 外层 class，如 chapter-settle-soul-stats / merit-soul-stats
 */
function buildSoulDossierStatsHtml(st, wrapperClass = "chapter-settle-soul-stats") {
  if (!st || !st.武将 || st._fallback) return "";
  const five = [
    ["统", st.统],
    ["武", st.武],
    ["智", st.智],
    ["政", st.政],
    ["魅", st.魅],
  ];
  const fiveHtml = five
    .map(
      ([lb, val]) => `<div class="soul-attr-cell">
      <span class="soul-attr-cell__name">${lb}</span>
      <b class="soul-attr-cell__val ${soulStatNumClass(val)}">${escapeHtml(String(val))}</b>
    </div>`,
    )
    .join("");
  const wps = [
    ["槍", st.槍],
    ["戟", st.戟],
    ["弩", st.弩],
    ["騎", st.騎],
    ["兵", st.兵],
    ["水", st.水],
  ];
  const wpHtml = wps
    .map(([lb, g]) => {
      const gr = String(g ?? "").trim();
      const tier = soulWpChipTierClass(gr);
      return `<span class="soul-wp-chip ${tier}" role="presentation"><span class="soul-wp-chip__weapon">${lb}</span><span class="soul-wp-chip__grade">${escapeHtml(gr)}</span></span>`;
    })
    .join("");
  return `<div class="${wrapperClass}">
  <div class="soul-dossier-panel">
    <div class="soul-dossier-kicker">将魂底蕴</div>
    <div class="soul-five-panel">${fiveHtml}</div>
    <div class="soul-weapon-head">
      <span class="soul-weapon-head__label" aria-hidden="true">兵种适性</span>
      <div class="soul-weapon-chips">${wpHtml}</div>
    </div>
  </div>
</div>`;
}

const MERIT_SETTLE_STACK_GRADE_CLASSES = [
  "grade-tianming",
  "grade-shenjiang",
  "grade-feijiang",
  "grade-mingjiang",
  "grade-xiaojiang",
  "grade-jianjiang",
  "grade-yongjiang",
  "grade-zhanjiang",
];

/** 结算条整体跟随战功档配色（铁灰/金紫等），供 .chapter-settle-stack 挂载 */
function applyChapterSettleStackGradeTheme(stackEl, grade) {
  if (!stackEl) return;
  for (const c of MERIT_SETTLE_STACK_GRADE_CLASSES) {
    stackEl.classList.remove(c);
  }
  const tier = meritGradeTierClass(grade);
  stackEl.classList.add(tier || "grade-zhanjiang");
}

/** 第一章内嵌结算第一层：大号评级 + 一句档内描述 */
function buildChapterSettleMeritHeroPanelHtml(grade, gradeLine) {
  const raw = grade != null && String(grade).trim() !== "" ? String(grade).trim() : "—";
  const display = raw === "—" ? "—" : normalizeMeritGradeLabel(raw);
  const tier = meritGradeTierClass(grade);
  const bigClass = tier
    ? `chapter-settle-merit-grade-display ${tier}`
    : "chapter-settle-merit-grade-display merit-grade--unknown";
  const flavor = String(gradeLine || "").trim() || "—";
  return `<div class="chapter-settle-merit-grade-block">
  <div class="chapter-settle-merit-grade-kicker" aria-hidden="true">战评</div>
  <div class="${bigClass}">${escapeHtml(display)}</div>
  <p class="chapter-settle-merit-grade-flavor">${escapeHtml(flavor)}</p>
</div>`;
}

function buildChapterSettleSoulHtml(v) {
  if (!v || !v.soulMode || !v.heroPrimaryName) return "";
  if (v.isDestinyTier) {
    const st = v.soulHeroStats;
    const qi = escapeHtml(v.soulVerdictQi || "");
    const parts = [
      `<div class="chapter-settle-soul-layer-kicker chapter-settle-soul-layer-kicker--destiny">天命之魂</div>`,
      `<div class="soul-showcase soul-showcase--destiny" role="group" aria-label="主行为与天命之魂">`,
      `<p class="soul-showcase-row"><span class="soul-showcase-k">主行为</span> <span class="soul-showcase-v">${escapeHtml(v.heroPrimaryLine || "")}</span></p>`,
      `<p class="soul-showcase-row soul-showcase-row--hero soul-showcase-row--destiny-hero"><span class="soul-showcase-k">天命之魂</span> <span class="chapter-settle-soul-hero chapter-settle-destiny-name soul-showcase-hero ${soulHeroFactionClass(v.heroPrimaryName)}">${escapeHtml(v.heroPrimaryName || "")}</span></p>`,
      `</div>`,
      qi ? `<div class="chapter-settle-soul-layer-head"><p class="chapter-settle-soul-qi">${qi}</p></div>` : "",
    ];
    if (v.soulTraitLine) {
      parts.push(`<p class="chapter-settle-soul-trait-one">${escapeHtml(v.soulTraitLine)}</p>`);
    }
    if (v.soulBattleAnchor) {
      parts.push(`<p class="chapter-settle-soul-anchor">${escapeHtml(v.soulBattleAnchor)}</p>`);
    }
    if (v.soulResembleQual) {
      parts.push(`<p class="chapter-settle-soul-resemble">${escapeHtml(v.soulResembleQual)}</p>`);
    }
    if (v.soulHeroPoem) {
      parts.push(`<p class="chapter-settle-soul-poem">${escapeHtml(v.soulHeroPoem)}</p>`);
    }
    if (v.soulOverallLevelDisplay && String(v.soulOverallLevelDisplay).trim() !== "" && v.soulOverallLevelDisplay !== "—") {
      parts.push(
        `<p class="chapter-settle-soul-overall">天资统览 <span class="chapter-settle-soul-overall-val">${escapeHtml(String(v.soulOverallLevelDisplay).trim())}</span></p>`,
      );
    }
    if (st && st.武将 && !st._fallback) {
      parts.push(buildSoulDossierStatsHtml(st, "chapter-settle-soul-stats"));
    }
    if (v.soulSkillName) {
      parts.push(
        `<div class="soul-skill-capsule" role="group" aria-label="特技"><span class="soul-skill-capsule-pre">特技</span><span class="soul-skill-capsule-name">${escapeHtml(v.soulSkillName)}</span></div>`,
      );
    }
    return parts.join("");
  }
  const st = v.soulHeroStats;
  const qi = escapeHtml(v.soulVerdictQi || "");
  const parts = [
    `<div class="chapter-settle-soul-layer-kicker">武魂鉴语</div>`,
    `<div class="soul-showcase" role="group" aria-label="主行为与武魂">`,
    `<p class="soul-showcase-row"><span class="soul-showcase-k">主行为</span> <span class="soul-showcase-v">${escapeHtml(v.heroPrimaryLine || "")}</span></p>`,
    `<p class="soul-showcase-row soul-showcase-row--hero"><span class="soul-showcase-k">武魂</span> <span class="chapter-settle-soul-hero soul-showcase-hero ${soulHeroFactionClass(v.heroPrimaryName)}">${escapeHtml(v.heroPrimaryName || "")}</span></p>`,
    `</div>`,
    qi
      ? `<div class="chapter-settle-soul-layer-head"><p class="chapter-settle-soul-qi">${qi}</p></div>`
      : "",
  ];
  if (v.soulTraitLine) {
    parts.push(`<p class="chapter-settle-soul-trait-one">${escapeHtml(v.soulTraitLine)}</p>`);
  }
  if (v.soulBattleAnchor) {
    parts.push(`<p class="chapter-settle-soul-anchor">${escapeHtml(v.soulBattleAnchor)}</p>`);
  }
  if (v.soulResembleQual) {
    parts.push(`<p class="chapter-settle-soul-resemble">${escapeHtml(v.soulResembleQual)}</p>`);
  }
  if (v.soulHeroPoem) {
    parts.push(`<p class="chapter-settle-soul-poem">${escapeHtml(v.soulHeroPoem)}</p>`);
  }
  if (v.soulOverallLevelDisplay && String(v.soulOverallLevelDisplay).trim() !== "" && v.soulOverallLevelDisplay !== "—") {
    parts.push(
      `<p class="chapter-settle-soul-overall">天资统览 <span class="chapter-settle-soul-overall-val">${escapeHtml(String(v.soulOverallLevelDisplay).trim())}</span></p>`,
    );
  }
  if (st && st.武将 && !st._fallback) {
    parts.push(buildSoulDossierStatsHtml(st, "chapter-settle-soul-stats"));
  }
  if (v.soulSkillName) {
    parts.push(
      `<div class="soul-skill-capsule" role="group" aria-label="特技"><span class="soul-skill-capsule-pre">特技</span><span class="soul-skill-capsule-name">${escapeHtml(v.soulSkillName)}</span></div>`,
    );
  }
  if (v.soulPlayerEval) {
    parts.push(`<p class="chapter-settle-soul-eval chapter-settle-soul-eval--note">${escapeHtml(v.soulPlayerEval)}</p>`);
  }
  return parts.join("");
}

function computeChapterMerit(state) {
  // v1.0：逐回合即时战功汇总为章节总战功
  const logs = Array.isArray(state.chapterMeritLog) ? state.chapterMeritLog : [];
  // 与顶部累计战功同口径：逐回合结算且累计最低不低于 0
  const turn_merit_sum = meritSumWithFloor0(logs);

  // 章节末额外奖励（权重低于逐回合累计）
  let chapterBonus = 0;
  const totalTurnCount = logs.reduce(
    (a, r) =>
      a + (r?.battleId && !r.meta?.victoryRestoration && !r.meta?.battleRemainTurnBonus ? 1 : 0),
    0,
  );
  const S = MERIT_SCORE_SCALE;
  if (totalTurnCount <= 35 && totalTurnCount > 0) chapterBonus += 80 * S;

  const total_death_retry = Object.values(state.meritChapter?.retries || {}).reduce((a, x) => a + (x || 0), 0);
  if (total_death_retry === 0) chapterBonus += 100 * S;

  const bossTurns = logs.filter((r) => r?.battleId === "BOSS");
  if (bossTurns.length) {
    const bossHadBroken = bossTurns.some((r) => (r.negativeEvents || []).some((e) => e.code === "self_broken"));
    const bossHadExecTaken = bossTurns.some((r) => (r.negativeEvents || []).some((e) => e.code === "boss_execute_taken"));
    const bossWinHpOk =
      state.meritChapter?.records?.BOSS?.max_hp > 0 &&
      state.meritChapter.records.BOSS.win_hp >= Math.floor(state.meritChapter.records.BOSS.max_hp * 0.5);
    if (bossWinHpOk && !bossHadBroken && !bossHadExecTaken) chapterBonus += 120 * S;
  }

  const execCount = logs.reduce(
    (a, r) =>
      a +
      (r?.positiveEvents || []).filter((e) =>
        ["execute_normal", "execute_elite", "execute_boss"].includes(e.code),
      ).length,
    0,
  );
  if (execCount >= 5) chapterBonus += 60 * S;

  const prof = ensureChapterHeroProfile(state);
  if (
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
    if (r?.meta?.victoryRestoration || r?.meta?.battleRemainTurnBonus) continue;
    const m = Number(r?.momentumAfter);
    if (Number.isFinite(m)) maxMomentumChapter = Math.max(maxMomentumChapter, m);
  }
  if (maxMomentumChapter >= 4) chapterBonus += 120 * S;

  let chapter_bonus_remaining_turns = 0;
  const recs = state.meritChapter?.records || {};
  for (const bid of Object.keys(MERIT_BATTLES)) {
    const cfg = MERIT_BATTLES[bid];
    const lim = Number(cfg?.merit_turn_limit) || 0;
    if (lim <= 0) continue;
    const rec = recs[bid];
    if (!rec) continue;
    const used =
      rec.merit_turns_used != null
        ? Math.max(0, Number(rec.merit_turns_used) || 0)
        : Math.max(0, Number(rec.turn_count) || 0);
    const remaining = Math.max(0, lim - used);
    const theoretical = remaining * MERIT_REMAINING_TURN_RAW_PER * S;
    const granted = Number(state.meritChapter?.battleRemainGranted?.[bid] || 0);
    chapter_bonus_remaining_turns += Math.max(0, theoretical - granted);
  }
  chapterBonus += chapter_bonus_remaining_turns;

  const chapter_bonus_other = chapterBonus - chapter_bonus_remaining_turns;

  const final_merit_score = turn_merit_sum + chapterBonus;

  const { grade, gradeLine } = meritGradeFromChapterScore(final_merit_score, S);

  const chapterHeroProfile = finalizeChapterHeroProfile(state, {
    final_merit_score,
    total_turn_count: totalTurnCount,
  });
  let soulMeta = null;
  let heroVerdict = buildEmptyHeroVerdict();
  if (state.chapterId === "chapter1" && typeof window.resolveGeneralSoul105 === "function") {
    soulMeta = window.resolveGeneralSoul105(state, chapterHeroProfile, final_merit_score, S, grade, gradeLine);
    if (soulMeta?.heroVerdict) heroVerdict = soulMeta.heroVerdict;
  }

  return {
    final_merit_score,
    // 兼容旧字段名：结算页展示用
    turn_merit_sum,
    chapterBonus,
    chapter_bonus_remaining_turns,
    chapter_bonus_other,
    grade,
    gradeLine,
    total_turn_count: totalTurnCount,
    total_death_retry,
    heroVerdict,
    isDestinyTier: !!heroVerdict.isDestinyTier,
    destinySoul: heroVerdict.destinySoul || null,
    _heroArchetype: soulMeta
      ? {
          primary: {
            id: heroVerdict.isDestinyTier
              ? `destiny_${String(heroVerdict.heroPrimaryName || "").trim() || "soul"}`
              : soulMeta.behaviorId || "soul",
            name: heroVerdict.heroPrimaryName,
            title: heroVerdict.heroPrimaryLine || "",
          },
        }
      : null,
    _soulResolution: soulMeta?.debug || null,
  };
}

/** 全章各场「允许回合 − 已用战功回合」之和，与章节剩余回合奖励计数一致 */
function totalMeritRemainingTurnsCount(state) {
  let n = 0;
  const recs = state.meritChapter?.records || {};
  for (const bid of Object.keys(MERIT_BATTLES)) {
    const cfg = MERIT_BATTLES[bid];
    const lim = Number(cfg?.merit_turn_limit) || 0;
    if (lim <= 0) continue;
    const rec = recs[bid];
    if (!rec) continue;
    const used =
      rec.merit_turns_used != null
        ? Math.max(0, Number(rec.merit_turns_used) || 0)
        : Math.max(0, Number(rec.turn_count) || 0);
    n += Math.max(0, lim - used);
  }
  return n;
}

/** 将 total 均分为 n 份，余数摊到前几档，避免「前几段很小、最后一大跳」的不均匀感 */
function splitMeritIntChunks(total, n) {
  if (n <= 0 || total <= 0) return [];
  const base = Math.floor(total / n);
  const rem = total % n;
  const out = [];
  for (let i = 0; i < n; i++) {
    out.push(base + (i < rem ? 1 : 0));
  }
  return out;
}

/** 单颗光点飞行时长（ms），与 .merit-fly-particle 默认一致 */
const MERIT_FLY_SINGLE_MS = 272;
/** 兼容旧版：短间隔节奏（现由「总时长均分」替代，仅保留作参考） */
const MERIT_FLY_STAGGER_MS = 52;
/** 每「档」飞线拆分的光点颗数（总颗数 = 档数 × 此值，再平分到整条动画时间） */
const MERIT_FLY_PARTICLE_BURST = 3;
/**
 * 每一档战功读数爬升时长（ms）；与旧版「三颗错峰 + 单颗飞行」总占位一致，便于与分档逻辑对齐。
 * 例：52×2 + 272 = 376ms
 */
const CHAPTER_REMAIN_MERIT_FLY_MS =
  MERIT_FLY_STAGGER_MS * (MERIT_FLY_PARTICLE_BURST - 1) + MERIT_FLY_SINGLE_MS;
const CHAPTER_REMAIN_MERIT_STEP_GAP_MS = 85;

/** 多档飞线整条动画的墙钟时长（每档一段爬升 + 档间间隔） */
function meritFlyChainWallClockMs(stepCount) {
  const n = Math.max(0, Math.floor(stepCount));
  if (n <= 0) return 0;
  return n * CHAPTER_REMAIN_MERIT_FLY_MS + Math.max(0, n - 1) * CHAPTER_REMAIN_MERIT_STEP_GAP_MS;
}

/**
 * 光点总数 = particleCount，在 totalSpanMs 内按均等间隔依次发射（先算总颗数再平分时间，整条更顺）。
 * @param {{ fixedStart?: boolean }} [opts] fixedStart：起点始终为 (fromCX,fromCY)，不做扇形偏移（避免「起点逐渐横移」的错觉）
 */
function spawnMeritFlyParticlesEvenSpread(fromCX, fromCY, toCX, toCY, particleCount, totalSpanMs, opts) {
  const n = Math.max(0, Math.floor(particleCount));
  if (n <= 0) return;
  const span = Math.max(MERIT_FLY_SINGLE_MS, Number(totalSpanMs) || meritFlyChainWallClockMs(Math.ceil(n / MERIT_FLY_PARTICLE_BURST)));
  const stagger = span / n;

  const ox = 5;
  const oy = 5;
  const dx = toCX - fromCX;
  const dy = toCY - fromCY;
  const dist = Math.hypot(dx, dy) || 1;
  const ux = dx / dist;
  const uy = dy / dist;
  const px = -uy;
  const py = ux;
  const spreadFrom = 12;
  const spreadTo = 10;
  const alongJitter = 3;
  const fixedStart = !!(opts && opts.fixedStart);

  const launch = (k) => {
    const slot = k - (n - 1) / 2;
    const along = fixedStart ? 0 : (k % 2 === 0 ? 1 : -1) * alongJitter * 0.35 * Math.abs(slot);
    const fx = fixedStart
      ? fromCX
      : fromCX + px * slot * spreadFrom + ux * along;
    const fy = fixedStart
      ? fromCY
      : fromCY + py * slot * spreadFrom + uy * along;
    const tx = toCX + px * slot * spreadTo + ux * along * 0.45;
    const ty = toCY + py * slot * spreadTo + uy * along * 0.45;
    const dot = document.createElement("div");
    dot.className = `merit-fly-particle merit-fly-particle--seq merit-fly-particle--i${k}`;
    dot.setAttribute("aria-hidden", "true");
    dot.style.setProperty("--merit-fly-dur", `${MERIT_FLY_SINGLE_MS}ms`);
    document.body.appendChild(dot);
    dot.style.left = `${fx - ox}px`;
    dot.style.top = `${fy - oy}px`;
    dot.style.opacity = "0.88";
    dot.style.transform = "scale(0.72)";
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        dot.style.left = `${tx - ox}px`;
        dot.style.top = `${ty - oy}px`;
        dot.style.opacity = "1";
        dot.style.transform = "scale(1.06)";
      });
    });
    window.setTimeout(() => {
      dot.style.opacity = "0";
      dot.style.transform = "scale(0.55)";
    }, Math.max(0, MERIT_FLY_SINGLE_MS - 48));
    window.setTimeout(() => dot.remove(), MERIT_FLY_SINGLE_MS + 80);
  };

  for (let k = 0; k < n; k++) {
    window.setTimeout(() => launch(k), k * stagger);
  }
}

/** 单波（默认 3 颗）在一段总时长内均分发射，供单点飞入军功簿等复用 */
function spawnMeritFlyBurstPixels(fromCX, fromCY, toCX, toCY) {
  spawnMeritFlyParticlesEvenSpread(
    fromCX,
    fromCY,
    toCX,
    toCY,
    MERIT_FLY_PARTICLE_BURST,
    CHAPTER_REMAIN_MERIT_FLY_MS,
  );
}

/**
 * 飞线期间战功读数线性爬升（军功簿 + 章节内嵌得分同步）。
 * @param {(state: any, ui: any) => void} [onDone]
 */
function runMeritDisplayLinearRamp(ui, state, fromVal, toVal, durationMs, onDone) {
  const from = Number(fromVal);
  const to = Number(toVal);
  const setStr = (s) => {
    if (ui.runMeritValue) ui.runMeritValue.textContent = s;
    if (ui.chapterSettleScoreVal) ui.chapterSettleScoreVal.textContent = s;
  };
  if (!Number.isFinite(from) || !Number.isFinite(to)) {
    if (typeof onDone === "function") onDone();
    return;
  }
  if (durationMs <= 0 || Math.round(from) === Math.round(to)) {
    setStr(String(Math.round(to)));
    if (typeof onDone === "function") onDone();
    return;
  }
  const t0 = typeof performance !== "undefined" ? performance.now() : Date.now();
  let lastLb = 0;
  function tick(now) {
    const u = Math.min(1, (now - t0) / durationMs);
    const v = Math.round(from + (to - from) * u);
    setStr(String(v));
    if (state && ui && now - lastLb > 96) {
      lastLb = now;
      renderLocalLeaderboardToSettlePanel(ui, state);
    }
    if (u < 1) {
      requestAnimationFrame(tick);
    } else {
      setStr(String(Math.round(to)));
      if (state && ui) renderLocalLeaderboardToSettlePanel(ui, state);
      if (typeof onDone === "function") onDone();
    }
  }
  requestAnimationFrame(tick);
}

/** @param {(state: any, ui: any) => void} [onDone] */
function playChapterRemainMeritSettlementAnim(ui, state, p, onDone) {
  const { meritDisplayFrom, to, remPts, remN, otherPts } = p;
  state._runMeritAnimating = true;

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const chunks = splitMeritIntChunks(remPts, remN);
  let merit = meritDisplayFrom;

  const targetWidget = ui.runMeritWidget;
  /** 须从通关结算「此战得分」锚盒起飞，勿用对阵中央 VS（位置与语义均不符） */
  const flySrcEl =
    ui.chapterSettleMeritFlyAnchor ||
    ui.chapterSettleScoreVal ||
    ui.chapterSettleScoreRow ||
    ui.chapterSettleBody;

  if (reduceMotion) {
    if (otherPts > 0) merit += otherPts;
    merit = to;
    const s = String(merit);
    if (ui.runMeritValue) ui.runMeritValue.textContent = s;
    if (ui.chapterSettleScoreVal) ui.chapterSettleScoreVal.textContent = s;
    state._runMeritAnimating = false;
    state._chapterRemainMeritAnimating = false;
    state._chapterSettleRemainAnimDone = true;
    state._chapterRemainMeritAnimScheduled = false;
    if (typeof onDone === "function") onDone(state, ui);
    return;
  }

  const setBothScores = (v) => {
    const s = String(v);
    if (ui.runMeritValue) ui.runMeritValue.textContent = s;
    if (ui.chapterSettleScoreVal) ui.chapterSettleScoreVal.textContent = s;
  };

  const applyOther = () => {
    merit += otherPts;
    setBothScores(merit);
    if (otherPts > 0 && ui.runMeritWidget) {
      ui.runMeritWidget.classList.add("run-merit-widget--tick");
      window.setTimeout(() => ui.runMeritWidget?.classList.remove("run-merit-widget--tick"), 420);
    }
  };

  const runStep = (i) => {
    if (i >= remN) {
      merit = to;
      setBothScores(merit);
      state._runMeritAnimating = false;
      state._chapterRemainMeritAnimating = false;
      state._chapterSettleRemainAnimDone = true;
      state._chapterRemainMeritAnimScheduled = false;
      if (typeof onDone === "function") onDone(state, ui);
      return;
    }

    const src = flySrcEl;
    const dst = targetWidget || ui.runMeritValue;
    const chunk = chunks[i] || 0;
    const meritStart = merit;
    const meritEnd = merit + chunk;

    if (!src || !dst) {
      runMeritDisplayLinearRamp(ui, state, meritStart, meritEnd, CHAPTER_REMAIN_MERIT_FLY_MS, () => {
        merit = meritEnd;
        setBothScores(merit);
        window.setTimeout(() => runStep(i + 1), CHAPTER_REMAIN_MERIT_STEP_GAP_MS);
      });
      return;
    }
    runMeritDisplayLinearRamp(ui, state, meritStart, meritEnd, CHAPTER_REMAIN_MERIT_FLY_MS, () => {
      merit = meritEnd;
      setBothScores(merit);
      window.setTimeout(() => runStep(i + 1), CHAPTER_REMAIN_MERIT_STEP_GAP_MS);
    });
  };

  if (otherPts > 0) applyOther();
  else setBothScores(merit);

  const kickoffRemainFly = () => {
    const src = flySrcEl;
    const dst = targetWidget || ui.runMeritValue;
    if (remN > 0 && src && dst) {
      const a = src.getBoundingClientRect();
      const b = dst.getBoundingClientRect();
      const totalParticles = remN * MERIT_FLY_PARTICLE_BURST;
      const totalMs = meritFlyChainWallClockMs(remN);
      spawnMeritFlyParticlesEvenSpread(
        a.left + a.width / 2,
        a.top + a.height / 2,
        b.left + b.width / 2,
        b.top + b.height / 2,
        totalParticles,
        totalMs,
        { fixedStart: true },
      );
    }
    runStep(0);
  };

  window.setTimeout(() => kickoffRemainFly(), otherPts > 0 ? 220 : 60);
}

/** @returns {ReturnType<typeof createEmptyChapterHeroProfile>} */
function createEmptyChapterHeroProfile() {
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

function ensureChapterHeroProfile(state) {
  if (!state.chapterHeroProfile) state.chapterHeroProfile = createEmptyChapterHeroProfile();
  return state.chapterHeroProfile;
}

/**
 * 截断战功日志后，按剩余记录重算武魂侧写（阵亡撤销本战回合时调用）。
 */
function rebuildChapterHeroProfileFromMeritLog(state) {
  if (state.chapterId !== "chapter1") return;
  const prof = createEmptyChapterHeroProfile();
  state.chapterHeroProfile = prof;
  const logs = Array.isArray(state.chapterMeritLog) ? state.chapterMeritLog : [];
  for (const rec of logs) {
    recordHeroProfileFromTurnRecord(state, rec);
  }
}

/**
 * 战功战败阵：撤销本场写入 chapterMeritLog 的即时战功，再扣除阵亡惩罚（与 DEATH_MERIT_PENALTY 同口径，已含倍率）。
 * 不再累加 _deathMeritPenaltyPending（当场已扣）。
 */
function applyMeritBattleDeathRollback(state, ui) {
  const keep = state._chapterMeritLogLenAtBattleEnter | 0;
  const logs = Array.isArray(state.chapterMeritLog) ? state.chapterMeritLog : [];
  if (logs.length > keep) {
    state.chapterMeritLog = logs.slice(0, keep);
  }
  state._resolvedSoul105ForKey = null;
  state._resolvedSoul105Payload = null;
  rebuildChapterHeroProfileFromMeritLog(state);
  let base = 0;
  if (state.chapterMeritLog.length) {
    const last = state.chapterMeritLog[state.chapterMeritLog.length - 1];
    base = Number(last.meritAfter) || 0;
  }
  state.runMeritScore = Math.max(0, base - DEATH_MERIT_PENALTY);
  state._deathMeritPenaltyPending = 0;
  if (ui?.runMeritValue) {
    ui.runMeritValue.textContent = String(state.runMeritScore);
  }
}

/**
 * 从单回合战功记录累计武魂侧写（不含战后整备条等非交手回合）。
 * 动作次数与 meta.action 对齐；处决仅在成功处决（execute_* 正向事件）时记一次。
 */
function recordHeroProfileFromTurnRecord(state, rec) {
  if (state.chapterId !== "chapter1" || !rec || rec.meta?.victoryRestoration || rec.meta?.battleRemainTurnBonus)
    return;
  const prof = ensureChapterHeroProfile(state);
  const act = rec.meta?.action;
  if (act === "attack" || act === "heavy" || act === "defend" || act === "block" || act === "rest") {
    prof.actions[act] += 1;
  } else if (act === "execute") {
    const pos = rec.positiveEvents || [];
    if (pos.some((e) => ["execute_normal", "execute_elite", "execute_boss"].includes(e.code))) {
      prof.actions.execute += 1;
    }
  }

  const countEvent = (code, n = 1) => {
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
  };

  for (const e of rec.positiveEvents || []) countEvent(e.code, 1);
  for (const e of rec.negativeEvents || []) countEvent(e.code, 1);
}

/** 章节结算前写入 totals（连势峰值取自本章逐回合记录的 momentumAfter） */
function finalizeChapterHeroProfile(state, report) {
  const prof = ensureChapterHeroProfile(state);
  const logs = Array.isArray(state.chapterMeritLog) ? state.chapterMeritLog : [];
  let maxM = 0;
  for (const r of logs) {
    if (r?.meta?.victoryRestoration || r?.meta?.battleRemainTurnBonus) continue;
    const m = Number(r?.momentumAfter);
    if (Number.isFinite(m)) maxM = Math.max(maxM, m);
  }
  prof.totals.totalTurns = report.total_turn_count || 0;
  prof.totals.totalBattles = Object.keys(state.meritChapter?.records || {}).length;
  prof.totals.maxComboReached = maxM;
  prof.totals.finalMerit = report.final_merit_score || 0;
  return prof;
}

function buildMeritHeroVerdictHtml(v) {
  if (!v || !v.heroPrimaryLine) return "";
  if (v.soulMode) {
    if (v.isDestinyTier) {
      const st = v.soulHeroStats;
      let stats = "";
      if (st && st.武将 && !st._fallback) {
        stats = buildSoulDossierStatsHtml(st, "merit-soul-stats");
      }
      const cap =
        v.soulSkillName &&
        `<div class="soul-skill-capsule merit-soul-cap" role="group" aria-label="特技"><span class="soul-skill-capsule-pre">特技</span><span class="soul-skill-capsule-name">${escapeHtml(v.soulSkillName)}</span></div>`;
      const showcase = `<div class="merit-soul-showcase merit-soul-showcase--destiny" role="group" aria-label="主行为与天命之魂">
  <p class="merit-soul-showcase-row"><span class="merit-soul-showcase-k">主行为</span> <span class="merit-soul-showcase-v">${escapeHtml(v.heroPrimaryLine || "")}</span></p>
  <p class="merit-soul-showcase-row merit-soul-showcase-row--hero merit-soul-showcase-row--destiny"><span class="merit-soul-showcase-k">天命之魂</span> <strong class="merit-hero-name merit-destiny-name ${soulHeroFactionClass(v.heroPrimaryName)}">${escapeHtml(v.heroPrimaryName || "")}</strong></p>
</div>`;
      const qiP = v.soulVerdictQi ? `<p class="merit-soul-qi">${escapeHtml(v.soulVerdictQi)}</p>` : "";
      const traitOne = v.soulTraitLine ? `<p class="merit-hero-trait-one">${escapeHtml(v.soulTraitLine)}</p>` : "";
      const anchorP = v.soulBattleAnchor ? `<p class="merit-soul-anchor">${escapeHtml(v.soulBattleAnchor)}</p>` : "";
      const resembleP = v.soulResembleQual ? `<p class="merit-soul-resemble">${escapeHtml(v.soulResembleQual)}</p>` : "";
      const poemP = v.soulHeroPoem ? `<p class="merit-hero-poem-inline">${escapeHtml(v.soulHeroPoem)}</p>` : "";
      const overallP =
        v.soulOverallLevelDisplay && String(v.soulOverallLevelDisplay).trim() !== "" && v.soulOverallLevelDisplay !== "—"
          ? `<p class="merit-hero-overall">天资统览 ${escapeHtml(String(v.soulOverallLevelDisplay).trim())}</p>`
          : "";
      return `
<div class="merit-report-section merit-hero-verdict merit-hero-verdict--soul merit-hero-verdict--destiny grade-tianming">
  <div class="merit-report-kicker merit-report-kicker--destiny">天命之魂</div>
  ${showcase}
  ${qiP}
  ${traitOne}
  ${anchorP}
  ${resembleP}
  ${poemP}
  ${overallP}
  ${stats}
  ${cap || ""}
</div>`;
    }
    const st = v.soulHeroStats;
    let stats = "";
    if (st && st.武将 && !st._fallback) {
      stats = buildSoulDossierStatsHtml(st, "merit-soul-stats");
    }
    const qiP = v.soulVerdictQi ? `<p class="merit-soul-qi">${escapeHtml(v.soulVerdictQi)}</p>` : "";
    const cap =
      v.soulSkillName &&
      `<div class="soul-skill-capsule merit-soul-cap" role="group" aria-label="特技"><span class="soul-skill-capsule-pre">特技</span><span class="soul-skill-capsule-name">${escapeHtml(v.soulSkillName)}</span></div>`;
    const traitOne = v.soulTraitLine ? `<p class="merit-hero-trait-one">${escapeHtml(v.soulTraitLine)}</p>` : "";
    const anchorP = v.soulBattleAnchor ? `<p class="merit-soul-anchor">${escapeHtml(v.soulBattleAnchor)}</p>` : "";
    const resembleP = v.soulResembleQual ? `<p class="merit-soul-resemble">${escapeHtml(v.soulResembleQual)}</p>` : "";
    const evalP = v.soulPlayerEval ? `<p class="merit-hero-eval merit-hero-eval--note">${escapeHtml(v.soulPlayerEval)}</p>` : "";
    const poemP = v.soulHeroPoem ? `<p class="merit-hero-poem-inline">${escapeHtml(v.soulHeroPoem)}</p>` : "";
    const overallP =
      v.soulOverallLevelDisplay && String(v.soulOverallLevelDisplay).trim() !== "" && v.soulOverallLevelDisplay !== "—"
        ? `<p class="merit-hero-overall">天资统览 ${escapeHtml(String(v.soulOverallLevelDisplay).trim())}</p>`
        : "";
    const showcase = `<div class="merit-soul-showcase" role="group" aria-label="主行为与武魂">
  <p class="merit-soul-showcase-row"><span class="merit-soul-showcase-k">主行为</span> <span class="merit-soul-showcase-v">${escapeHtml(v.heroPrimaryLine || "")}</span></p>
  <p class="merit-soul-showcase-row merit-soul-showcase-row--hero"><span class="merit-soul-showcase-k">武魂</span> <strong class="merit-hero-name ${soulHeroFactionClass(v.heroPrimaryName)}">${escapeHtml(v.heroPrimaryName || "")}</strong></p>
</div>`;
    return `
<div class="merit-report-section merit-hero-verdict merit-hero-verdict--soul">
  <div class="merit-report-kicker">武魂鉴语</div>
  ${showcase}
  ${qiP}
  ${traitOne}
  ${anchorP}
  ${resembleP}
  ${poemP}
  ${overallP}
  ${stats}
  ${cap || ""}
  ${evalP}
</div>`;
  }
  const poem = (v.heroPoem || [])
    .map((ln) => `<div class="merit-hero-poem-line">${escapeHtml(ln)}</div>`)
    .join("");
  const sub =
    v.heroSecondaryName && v.heroSecondaryTitle
      ? `<p class="merit-hero-secondary">次倾向：${escapeHtml(v.heroSecondaryName)}（${escapeHtml(v.heroSecondaryTitle)}）</p>`
      : "";
  return `
<div class="merit-report-section merit-hero-verdict">
  <div class="merit-report-kicker">武魂判辞</div>
  <p class="merit-hero-line">${escapeHtml(v.heroPrimaryLine)}</p>
  <p class="merit-hero-explain">${escapeHtml(v.heroExplain)}</p>
  <div class="merit-hero-poem" aria-label="赞诗">${poem}</div>
  ${sub}
</div>`;
}

/** 将累计战功与「本章总战功」对齐（S1 结算 / 败阵提前结算回营共用） */
function syncRunMeritToChapterFinal(state, ui) {
  const report = computeChapterMerit(state);
  if (!state._runMeritSyncedToFinal) {
    state._runMeritSyncedToFinal = true;
    const from = state.runMeritScore ?? 0;
    const to = report.final_merit_score ?? from;
    const remPts = report.chapter_bonus_remaining_turns ?? 0;
    const remN = totalMeritRemainingTurnsCount(state);
    const otherPts = report.chapter_bonus_other ?? 0;
    state.runMeritScore = to;
    if (remPts > 0 && remN > 0 && ui?.runMeritValue) {
      ui.runMeritValue.textContent = String(from);
      state._runMeritAnimating = true;
      state._chapterRemainMeritAnimPending = {
        meritDisplayFrom: from,
        to,
        remPts,
        remN,
        otherPts,
      };
    } else if (ui.runMeritValue) {
      state._runMeritAnimating = true;
      ui.runMeritValue.textContent = String(from);
      requestAnimationFrame(() => animateRunMeritValue(ui, state, from, to));
    }
  } else {
    const to = report.final_merit_score ?? state.runMeritScore ?? 0;
    state.runMeritScore = to;
    if (ui.runMeritValue && !state._runMeritAnimating && !state._chapterRemainMeritAnimating) {
      ui.runMeritValue.textContent = String(state.runMeritScore ?? 0);
    }
  }
  return report;
}

/** 第一章 S1：内嵌于「阵前形势」下方的通关结算（不含排行榜） */
function populateChapterSettleInline(state, ui) {
  const report = syncRunMeritToChapterFinal(state, ui);
  if (state.meritChapter?.records?.BOSS) ensureChapter1LeaderboardRecord(state);

  applyChapterSettleStackGradeTheme(ui.chapterSettleStack, report.grade);
  if (ui.chapterSettleStack) {
    ui.chapterSettleStack.classList.toggle("chapter-settle-stack--early", !state.meritChapter?.records?.BOSS);
  }
  if (ui.chapterSettleMeritHero) {
    ui.chapterSettleMeritHero.innerHTML = buildChapterSettleMeritHeroPanelHtml(report.grade, report.gradeLine);
  }

  if (ui.chapterSettleScoreVal) {
    if (state._chapterRemainMeritAnimating) {
      /* 与右上角军功簿同步由光点动画写入 */
    } else if (state._chapterRemainMeritAnimPending) {
      ui.chapterSettleScoreVal.textContent = String(state._chapterRemainMeritAnimPending.meritDisplayFrom);
    } else {
      ui.chapterSettleScoreVal.textContent = String(report.final_merit_score ?? 0);
    }
  }
  if (ui.chapterSettleScoreHintWrap && ui.chapterSettleScoreHintPrimary && ui.chapterSettleScoreHintBonus) {
    const gDisp = normalizeMeritGradeLabel(report.grade);
    const remPts = report.chapter_bonus_remaining_turns ?? 0;
    const remN = totalMeritRemainingTurnsCount(state);
    const hasPrimary = !!(gDisp && gDisp !== "—");
    const hasBonus = remPts > 0 && remN > 0;
    ui.chapterSettleScoreHintPrimary.textContent = hasPrimary ? `完此战功，评定为${gDisp}。` : "";
    if (hasBonus) {
      ui.chapterSettleScoreHintBonus.textContent = `速胜奖补 · 节余 ${remN} 档，共 ${remPts} 战功入账。`;
    } else {
      ui.chapterSettleScoreHintBonus.textContent = "";
    }
    ui.chapterSettleScoreHintBonus.hidden = !hasBonus;
    const showWrap = hasPrimary || hasBonus;
    ui.chapterSettleScoreHintWrap.hidden = !showWrap;
    ui.chapterSettleScoreHintWrap.setAttribute("aria-hidden", showWrap ? "false" : "true");
  }

  const v = report.heroVerdict;
  if (ui.chapterSettleHeroBlock) {
    ui.chapterSettleHeroBlock.classList.toggle("chapter-settle-soul-layer--destiny", !!(v && v.isDestinyTier));
    const soulHtml = v && v.soulMode ? buildChapterSettleSoulHtml(v) : "";
    if (soulHtml) {
      ui.chapterSettleHeroBlock.innerHTML = soulHtml;
    } else if (v && v.heroPrimaryLine) {
      ui.chapterSettleHeroBlock.innerHTML = [
        `<div class="chapter-settle-hero-kicker">三国将魂</div>`,
        `<p class="chapter-settle-hero-line">${escapeHtml(v.heroPrimaryLine)}</p>`,
        `<p class="chapter-settle-hero-name">${escapeHtml(v.heroPrimaryName)}${v.heroPrimaryTitle ? `（${escapeHtml(v.heroPrimaryTitle)}）` : ""}</p>`,
        `<p class="chapter-settle-hero-explain">${escapeHtml(v.heroExplain)}</p>`,
      ].join("");
    } else {
      ui.chapterSettleHeroBlock.innerHTML = `<p class="chapter-settle-hero-empty">—</p>`;
    }
  }
  if (ui.chapterSettleVictory) {
    const kicker = ui.chapterSettleVictory.querySelector(".win-kicker");
    const winText = ui.chapterSettleVictory.querySelector(".win-text");
    if (state.meritChapter?.records?.BOSS) {
      if (kicker) kicker.textContent = "VICTORY";
      if (winText) winText.textContent = "此战得胜";
    } else {
      if (kicker) kicker.textContent = "封卷";
      if (winText) winText.textContent = "提前结算回营";
    }
  }

  if (
    state._chapterRemainMeritAnimPending &&
    !state._chapterSettleRemainAnimDone &&
    !state._chapterRemainMeritAnimScheduled
  ) {
    state._chapterRemainMeritAnimScheduled = true;
    state._chapterRemainMeritAnimating = true;
    const payload = state._chapterRemainMeritAnimPending;
    delete state._chapterRemainMeritAnimPending;
    requestAnimationFrame(() => {
      playChapterRemainMeritSettlementAnim(ui, state, payload, () => {
        if (ui.runMeritHint) ui.runMeritHint.innerHTML = buildRunMeritTooltipHtml(state);
      });
    });
  }
}

function buildMeritReportHtml(report) {
  const r = report;
  const heroBlock = buildMeritHeroVerdictHtml(r.heroVerdict);
  return `
<div class="merit-report-head">
  <p class="merit-report-total">第一章总战功：<strong>${r.final_merit_score}</strong></p>
  <p class="merit-report-grade">战评：${meritGradeSpanHtml(r.grade)}</p>
  <p class="merit-report-flavor soul-grade-desc">${escapeHtml(r.gradeLine)}</p>
</div>
${heroBlock}
<div class="merit-report-section">
  <div class="merit-report-kicker">分项明细</div>
  <ul class="merit-report-list">
    <li>逐回合即时战功累计：${r.turn_merit_sum ?? 0}</li>
    <li>剩余回合奖励：${r.chapter_bonus_remaining_turns ?? 0}</li>
    <li>章节末其他加成：${r.chapter_bonus_other ?? (r.chapterBonus ?? 0) - (r.chapter_bonus_remaining_turns ?? 0)}</li>
    <li>章节奖励合计：${r.chapterBonus ?? 0}</li>
  </ul>
</div>
<p class="merit-report-meta soul-grade-meta">全章总回合数 ${r.total_turn_count || 0}｜累计失败重开 ${r.total_death_retry || 0} 次</p>`;
}

/**
 * 战功榜排序：总战功降序；同分则按提交时间升序（先达成者名次靠前，后来者排在其后）。
 * @param {{ finalMerit?: number, at?: number }} a
 * @param {{ finalMerit?: number, at?: number }} b
 */
function compareMeritLeaderboardEntries(a, b) {
  const dm = (b.finalMerit || 0) - (a.finalMerit || 0);
  if (dm !== 0) return dm;
  return (a.at || 0) - (b.at || 0);
}

function loadChapter1MeritLeaderboard() {
  // 机器人数据已移除，改用在线排行榜
  try {
    const raw = localStorage.getItem(CH1_MERIT_LEADERBOARD_KEY);
    const arr = raw ? JSON.parse(raw) : [];
    const list = Array.isArray(arr) ? arr : [];
    list.sort(compareMeritLeaderboardEntries);
    return list;
  } catch {
    return [];
  }
}

function buildIntroTop10HtmlFromList(list) {
  const arr = (Array.isArray(list) ? list : []).filter((e) => e && typeof e === "object");
  const rows = [];
  for (let i = 0; i < 10; i++) {
    const e = arr[i];
    const rank = i + 1;
    const vacant = !e;
    const name = vacant ? escapeHtml("虚位以待") : escapeHtml(e?.name || "—");
    const score = vacant ? "—" : escapeHtml(String(e?.finalMerit ?? "—"));
    const icon =
      rank === 1
        ? `<span class="medal medal--gold" aria-hidden="true"></span>`
        : rank === 2
          ? `<span class="medal medal--silver" aria-hidden="true"></span>`
          : rank === 3
            ? `<span class="medal medal--bronze" aria-hidden="true"></span>`
            : `<span class="intro-top3-rank-spacer" aria-hidden="true">#</span>`;
    const rowCls = vacant ? "intro-top3-row intro-top3-row--vacant" : "intro-top3-row";
    const soulLine = vacant ? "" : introTop3SoulNameHtml(e?.finalMerit ?? 0, e?.heroName);
    rows.push(
      `
<div class="${rowCls}">
  <span class="intro-top3-left">${icon}<span class="intro-top3-rank">${rank}</span></span>
  <span class="intro-top3-name-stack">
    <span class="intro-top3-name">${name}</span>
    ${soulLine ? `<span class="intro-top3-soul-wrap">${soulLine}</span>` : ""}
  </span>
  <span class="intro-top3-score">${score}</span>
  <span class="intro-top3-grade">${vacant ? meritGradeSpanHtml(null) : meritGradeSpanHtml(meritGradeLabelFromFinalScore(e?.finalMerit ?? 0))}</span>
</div>`,
    );
  }
  return rows.join("");
}

function buildIntroTop3Html() {
  return buildIntroTop10HtmlFromList(loadChapter1MeritLeaderboard());
}

/** 从在线数据列表构建首页前三 HTML */
function _buildIntroTop3HtmlFromList(list) {
  return buildIntroTop10HtmlFromList(list);
}

/** 异步构建在线排行榜 HTML，失败时降级到本地 */
async function buildOnlineMeritLeaderboardHtml() {
  if (typeof OnlineLeaderboard !== "undefined" && OnlineLeaderboard.isConfigured()) {
    const online = await OnlineLeaderboard.fetchLeaderboard(30);
    if (online && online.length > 0) {
      const rows = online.map((e, i) => {
        const t = e.at ? new Date(e.at) : null;
        const dateStr = t && !Number.isNaN(t.getTime())
          ? `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`
          : "—";
        const name = escapeHtml(e.name || "—");
        const region = e.province ? escapeHtml(e.province + (e.city && e.city !== e.province ? "·" + e.city : "")) : "";
        return `<tr><td>${i + 1}</td><td>${name}</td><td>${region}</td><td><strong>${escapeHtml(String(e.finalMerit ?? "—"))}</strong></td><td>${meritGradeSpanHtml(meritGradeLabelFromFinalScore(e.finalMerit ?? 0))}</td><td>${escapeHtml(String(e.runSum ?? "—"))}</td><td class="merit-lb-date">${escapeHtml(dateStr)}</td></tr>`;
      }).join("");
      return `
<div class="merit-report-section merit-lb-section">
  <div class="merit-report-kicker">天下英雄榜（在线）</div>
  <table class="merit-report-table merit-lb-table">
    <thead><tr><th>#</th><th>昵称</th><th>地区</th><th>总战功</th><th>评级</th><th>场次累计</th><th>时间</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
    }
  }
  return buildLocalMeritLeaderboardHtml();
}

function roadmapMeritLabelForId(id) {
  const order = CHAPTER_ROADMAP.chapter1 || [];
  const s = order.find((x) => x.id === id);
  return s?.label || id;
}

function turnMeritEventLabel(code) {
  const map = {
    attack_hit: "快攻命中",
    heavy_hit: "重击命中",
    defend_success: "防御成功挡住伤害",
    block_success: "盾反成功",
    rest_success: "调息成功且未被命中",
    counter_heavy: "对敌方重击成功盾反",
    counter_quick_defend: "对敌方快攻防御稳住",
    style_no_damage_positive: "无伤得势",
    style_no_damage_tactic: "无伤且战术得手",
    style_variety_2: "连番变招（二）",
    style_variety_3: "连番变招（三）",
    break_defense: "重击压制防御",
    punish_adjust: "惩罚调整",
    interrupt_heavy: "快攻打断重击",
    stagger_plus_1: "敌人失衡增加",
    enemy_broken: "本回合打入破绽",
    execute_normal: "处决（普通敌）",
    execute_elite: "处决（精英）",
    execute_boss: "处决（渠帅）",
    execute_finish_bonus: "处决收束额外奖励",
    pressure_chain: "连续压制链",
    interrupt_to_break: "一回合内打断并打入破绽",
    lowhp_hit_bonus: "残血命中奖励",
    lowhp_execute_bonus: "残血处决奖励",
    multi_enemy_break_bonus: "多敌打入破绽奖励",
    multi_enemy_execute_bonus: "多敌处决奖励",
    recover_hit_bonus: "刚脱离破绽后命中奖励",
    recover_break_bonus: "刚脱离破绽后打入破绽奖励",
    victory_restoration: "战后整备",
    remaining_turn_merit: "回合节余",

    got_hit_quick: "被快攻击中",
    got_hit_heavy: "被重击命中",
    block_fail_vs_quick: "对快攻盾反失败",
    heavy_interrupted: "重击被快攻打断",
    block_whiff: "对非重击盾反挥空",
    self_broken: "进入破绽",
    boss_execute_taken: "被渠帅处决",
    rest_hit: "调息时仍被命中",
    empty_turn: "无有效收益空回合",
  };
  return map[code] || code;
}

function buildRunMeritTooltipHtml(state) {
  const ctx = state._meritTurnContext;
  const meritLimUi = meritBattleTurnLimit(ctx?.battleId);
  const turnDispUi =
    meritLimUi != null
      ? `本战 ${Math.max(0, (ctx?.turnIndex || 1) - 1)}/${meritLimUi} 回合（用尽判负）`
      : `回合 ${Math.max(0, (ctx?.turnIndex || 1) - 1)}`;
  const runSum = state.runMeritScore ?? 0;
  const last =
    Array.isArray(state.turnMeritLog) && state.turnMeritLog.length
      ? state.turnMeritLog[state.turnMeritLog.length - 1]
      : null;
  const battleSum = meritSumWithFloor0(state.turnMeritLog);
  const chapterSum = meritSumWithFloor0(state.chapterMeritLog);

  const lastLines = last
    ? (() => {
        const d = last.turnMeritDelta || 0;
        const lastHead = last.meta?.victoryRestoration
          ? "战后整备："
          : last.meta?.battleRemainTurnBonus
            ? "回合节余："
            : "最近一回合：";
        const head = `<div class="rm-line"><span class="rm-k">${lastHead}</span><span class="rm-v"><strong>${d >= 0 ? "+" : ""}${d}</strong>（${last.meritBefore} → ${last.meritAfter}）</span></div>`;
        const pos = (last.positiveEvents || [])
          .map((e) => `<div class="rm-line"><span class="rm-k">${escapeHtml(turnMeritEventLabel(e.code))}</span><span class="rm-v">+${e.value}</span></div>`)
          .join("");
        const neg = (last.negativeEvents || [])
          .map((e) => `<div class="rm-line"><span class="rm-k">${escapeHtml(turnMeritEventLabel(e.code))}</span><span class="rm-v">-${e.value}</span></div>`)
          .join("");
        const mult = `<div class="rm-line"><span class="rm-k">倍率</span><span class="rm-v">高压 ×${last.clutchMultiplier}｜连势 ×${last.momentumMultiplier}｜失手 ×${last.mistakeMultiplier}</span></div>`;
        const sums = `<div class="rm-line"><span class="rm-k">本回合</span><span class="rm-v">正向 ${last.positiveFinal}（基${last.positiveBase}）｜负向 ${last.negativeFinal}（基${last.negativeBase}）</span></div>`;
        const bdLine = meritBreakdownOneLinerFromRecord(last);
        const bd = bdLine
          ? `<div class="rm-line"><span class="rm-k">分项</span><span class="rm-v">${escapeHtml(bdLine)}</span></div>`
          : "";
        return [head, pos || "", neg || "", mult, sums, bd].join("");
      })()
    : `<div class="rm-muted">尚无回合战功记录。</div>`;

  return `
<div class="rm-head">即时战功</div>
<div class="rm-muted">每回合结算后根据事件得分与倍率即时增减；军功簿累计最低不低于 0。</div>
<div class="rm-head rm-head--sp">当前状态</div>
<div class="rm-line"><span class="rm-k">军功簿累计：</span><span class="rm-v"><strong>${runSum}</strong></span></div>
<div class="rm-line"><span class="rm-k">连势 / 失手链：</span><span class="rm-v"><strong>${ctx?.momentum ?? 0}</strong> / <strong>${ctx?.mistakeChain ?? 0}</strong></span></div>
<div class="rm-line"><span class="rm-k">当前战斗：</span><span class="rm-v"><strong>${escapeHtml(roadmapMeritLabelForId(ctx?.battleId || "—"))}</strong>｜${turnDispUi}</span></div>
${lastLines}
<div class="rm-sum rm-sum--small">本战小计：<strong>${battleSum}</strong>｜本章即时累计：<strong>${chapterSum}</strong></div>
`;
}

/** 第一章结算页：写入英雄榜（每通关一次记一条） */
function ensureChapter1LeaderboardRecord(state) {
  if (state.chapterId !== "chapter1" || state._leaderboardSavedForThisRun) return;
  state._leaderboardSavedForThisRun = true;
  const report = computeChapterMerit(state);
  const heroPrimaryId = report._heroArchetype?.primary?.id || "";
  const list = loadChapter1MeritLeaderboard();
  const entryAt = Date.now();
  const origName = (state._playerName || "").trim() || "无名侠客";
  const heroNameSnap = String(report.heroVerdict?.heroPrimaryName || "").trim();
  state._chapterSettleLbEntryAt = entryAt;
  state._chapter1LbRowDisplayPatch = {
    finalMerit: report.final_merit_score,
    runSum: state.runMeritScore ?? 0,
    retries: report.total_death_retry,
    heroName: heroNameSnap,
    origName,
  };
  list.push({
    name: origName,
    at: entryAt,
    finalMerit: report.final_merit_score,
    grade: report.grade,
    heroId: heroPrimaryId,
    heroName: report.heroVerdict?.heroPrimaryName || "",
    runSum: state.runMeritScore ?? 0,
    retries: report.total_death_retry,
    faction: normalizeFactionKey(state._playerFaction || "qun"),
    province: String(state._playerProvince || "").trim() || "",
    city: String(state._playerCity || "").trim() || "",
    country: String(state._playerCountry || "").trim() || "",
  });
  list.sort(compareMeritLeaderboardEntries);
  try {
    localStorage.setItem(CH1_MERIT_LEADERBOARD_KEY, JSON.stringify(list.slice(0, 30)));
  } catch {
    /* 存储满或禁用时忽略 */
  }
  appendMainBehaviorHistory(state, report.heroVerdict?.soulBehavior);
  // 同步提交在线排行榜（异步，不阻塞）
  if (typeof OnlineLeaderboard !== "undefined" && OnlineLeaderboard.isConfigured()) {
    OnlineLeaderboard.submitScore({
      name: (state._playerName || "").trim() || "无名侠客",
      finalMerit: report.final_merit_score,
      grade: report.grade,
      runSum: state.runMeritScore ?? 0,
      retries: report.total_death_retry,
      faction: normalizeFactionKey(state._playerFaction || "qun"),
      province: String(state._playerProvince || "").trim() || "",
      city: String(state._playerCity || "").trim() || "",
      country: String(state._playerCountry || "").trim() || "",
      heroName: String(report.heroVerdict?.heroPrimaryName || "").trim(),
    }).catch(() => {});
  }
}

/** 败阵「结算回营」：未通关渠帅也可按当前战功写入英雄榜（每局至多一次） */
function ensureChapter1EarlyCampLeaderboardRecord(state) {
  if (state.chapterId !== "chapter1" || state._leaderboardEarlyCampSaved) return;
  state._leaderboardEarlyCampSaved = true;
  const report = computeChapterMerit(state);
  const heroPrimaryId = report._heroArchetype?.primary?.id || "";
  const list = loadChapter1MeritLeaderboard();
  const entryAt = Date.now();
  const origName = (state._playerName || "").trim() || "无名侠客";
  const heroNameSnap = String(report.heroVerdict?.heroPrimaryName || "").trim();
  state._chapterSettleLbEntryAt = entryAt;
  state._chapter1LbRowDisplayPatch = {
    finalMerit: report.final_merit_score,
    runSum: state.runMeritScore ?? 0,
    retries: report.total_death_retry,
    heroName: heroNameSnap,
    origName,
  };
  list.push({
    name: origName,
    at: entryAt,
    finalMerit: report.final_merit_score,
    grade: report.grade,
    heroId: heroPrimaryId,
    heroName: report.heroVerdict?.heroPrimaryName || "",
    runSum: state.runMeritScore ?? 0,
    retries: report.total_death_retry,
    faction: normalizeFactionKey(state._playerFaction || "qun"),
    province: String(state._playerProvince || "").trim() || "",
    city: String(state._playerCity || "").trim() || "",
    country: String(state._playerCountry || "").trim() || "",
  });
  list.sort(compareMeritLeaderboardEntries);
  try {
    localStorage.setItem(CH1_MERIT_LEADERBOARD_KEY, JSON.stringify(list.slice(0, 30)));
  } catch {
    /* 存储满或禁用时忽略 */
  }
  appendMainBehaviorHistory(state, report.heroVerdict?.soulBehavior);
  if (typeof OnlineLeaderboard !== "undefined" && OnlineLeaderboard.isConfigured()) {
    OnlineLeaderboard.submitScore({
      name: (state._playerName || "").trim() || "无名侠客",
      finalMerit: report.final_merit_score,
      grade: report.grade,
      runSum: state.runMeritScore ?? 0,
      retries: report.total_death_retry,
      faction: normalizeFactionKey(state._playerFaction || "qun"),
      province: String(state._playerProvince || "").trim() || "",
      city: String(state._playerCity || "").trim() || "",
      country: String(state._playerCountry || "").trim() || "",
      heroName: String(report.heroVerdict?.heroPrimaryName || "").trim(),
    }).catch(() => {});
  }
}

/** 结算后改名：更新本机英雄榜条目的昵称 */
function patchChapterSettleLeaderboardLocalRowName(state, newName) {
  const at = state._chapterSettleLbEntryAt;
  if (at == null) return;
  const list = loadChapter1MeritLeaderboard();
  const i = list.findIndex((e) => e && e.at === at);
  if (i < 0) return;
  list[i] = { ...list[i], name: newName };
  try {
    localStorage.setItem(CH1_MERIT_LEADERBOARD_KEY, JSON.stringify(list.slice(0, 30)));
  } catch {
    /* ignore */
  }
}

/**
 * 战后侧栏榜：本局成绩在改名后显示当前档案昵称（本机 at 命中，在线行按战功指纹覆盖显示）。
 * @param {object} e
 * @param {object} state
 */
function applyChapter1LbDisplayNamePatch(e, state) {
  const p = state?._chapter1LbRowDisplayPatch;
  const nick = String(state?._playerName || "").trim();
  if (!p || !nick) return e;
  if (state._chapterSettleLbEntryAt != null && e && e.at === state._chapterSettleLbEntryAt) {
    return { ...e, name: nick };
  }
  if (
    e &&
    (e.finalMerit ?? 0) === (p.finalMerit ?? 0) &&
    (e.runSum ?? 0) === (p.runSum ?? 0) &&
    (e.retries ?? 0) === (p.retries ?? 0) &&
    String(e.heroName || "") === String(p.heroName || "") &&
    String(e.name || "") === String(p.origName || "")
  ) {
    return { ...e, name: nick };
  }
  return e;
}

/**
 * 在线榜行用本机快照对齐昵称（改名后本机已更新，服务端可能仍为旧名或未同步）。
 * 按战功+将魂名+场次累计+重试次数匹配，命中则采用本机条目的 `name`。
 */
function enrichOnlineLbRowsWithLocalNames(rows) {
  if (!Array.isArray(rows) || !rows.length) return rows;
  const local = loadChapter1MeritLeaderboard();
  if (!Array.isArray(local) || !local.length) return rows;
  return rows.map((e) => {
    const hit = local.find(
      (l) =>
        l &&
        (l.finalMerit ?? 0) === (e.finalMerit ?? 0) &&
        String(l.heroName || "").trim() === String(e.heroName || "").trim() &&
        (l.runSum ?? 0) === (e.runSum ?? 0) &&
        (l.retries ?? 0) === (e.retries ?? 0),
    );
    if (hit && String(hit.name || "").trim()) {
      return { ...e, name: hit.name };
    }
    return e;
  });
}

function buildLocalMeritLeaderboardHtml() {
  const top = loadChapter1MeritLeaderboard().slice(0, 10);
  const rows = top.length
    ? top
        .map((e, i) => {
          const t = e.at ? new Date(e.at) : null;
          const dateStr =
            t && !Number.isNaN(t.getTime())
              ? `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`
              : "—";
          const name = escapeHtml(e.name || "—");
          return `<tr><td>${i + 1}</td><td>${name}</td><td><strong>${escapeHtml(String(e.finalMerit ?? "—"))}</strong></td><td>${meritGradeSpanHtml(meritGradeLabelFromFinalScore(e.finalMerit ?? 0))}</td><td>${escapeHtml(String(e.runSum ?? "—"))}</td><td class="merit-lb-date">${escapeHtml(dateStr)}</td></tr>`;
        })
        .join("")
    : `<tr><td colspan="6">暂无记录。完成第一章结算后将自动写入。</td></tr>`;
  return `
<div class="merit-report-section merit-lb-section">
  <div class="merit-report-kicker">天下英雄榜（本机记录，至多保留 30 条）</div>
  <table class="merit-report-table merit-lb-table">
    <thead><tr><th>#</th><th>昵称</th><th>总战功</th><th>评级</th><th>场次累计</th><th>时间</th></tr></thead>
    <tbody>${rows}</tbody>
  </table>
</div>`;
}

function getLiveMeritScoreForRankDisplay(ui, state) {
  if (state?._endingHealAnimating && ui?.runMeritValue) {
    const n = Number(String(ui.runMeritValue.textContent).trim());
    if (Number.isFinite(n)) return Math.max(0, Math.round(n));
  }
  return Math.max(0, Math.round(state?.runMeritScore ?? 0));
}

/** 英雄榜单行 HTML（rank 为 1-based 名次） */
function buildHeroRankRowHtml(e, rank, opts) {
  const i = rank - 1;
  const medal =
    i === 0
      ? `<span class="medal medal--gold" aria-hidden="true"></span>`
      : i === 1
        ? `<span class="medal medal--silver" aria-hidden="true"></span>`
        : i === 2
          ? `<span class="medal medal--bronze" aria-hidden="true"></span>`
          : "";
  const score = e.finalMerit ?? 0;
  const gradeLabel = meritGradeLabelFromFinalScore(score);
  const nameText =
    e.kind === "live"
      ? `${escapeHtml(e.name || "你")}<span class="rank-live-badge">本局</span>`
      : escapeHtml(e.name || "—");
  const nameInner = `<span class="rank-name-text">${nameText}</span>`;
  const soulHtml = introTop3SoulNameHtml(score, e.heroName);
  const nameBody = soulHtml
    ? `${nameInner}<span class="rank-soul-line">${soulHtml}</span>`
    : nameInner;
  const nameCls = soulHtml ? "rank-name rank-name--with-soul" : "rank-name";
  const name = `<span class="${nameCls}">${nameBody}</span>`;
  const gradeHtml = meritGradeSpanHtml(gradeLabel);
  const rowCls = e.kind === "live" ? "rank-row rank-row--live-preview" : "rank-row";
  const liveAttrs =
    e.kind === "live"
      ? ` data-live-row="1" data-live-preview="1" role="status" aria-label="本局名次 ${rank}，战功 ${score}，评价 ${escapeHtml(gradeLabel)}"`
      : "";
  const introNameAttr =
    opts && opts.markIntroRow && e.kind !== "live"
      ? ` data-hero-name="${escapeHtml(String(e.name ?? ""))}"`
      : "";
  return `<div class="${rowCls}"${liveAttrs}${introNameAttr}><span class="rank-left">${medal}<span class="rank-num${e.kind === "live" ? " rank-num--live" : ""}">${rank}</span></span>${name}<span class="rank-score">${escapeHtml(String(score))}</span><span class="rank-grade">${gradeHtml}</span></div>`;
}

function normalizeHeroNameKey(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

/** 公开部署主页：左侧「刷新排行榜」跳转用 */
const BATTLE_GAME_HOME_URL = "https://akira17189-create.github.io/battle-game/";

/** 战后军报侧英雄榜：将滚动条居中到本局行 */
function scrollSettleRankListToLiveRow(box) {
  if (!box) return;
  const liveRow = box.querySelector("[data-live-row='1']");
  if (!liveRow) return;
  const boxRect = box.getBoundingClientRect();
  const rowRect = liveRow.getBoundingClientRect();
  const contentY = box.scrollTop + (rowRect.top - boxRect.top);
  const viewH = box.clientHeight;
  const rowH = liveRow.offsetHeight || rowRect.height;
  let nextTop = contentY - viewH / 2 + rowH / 2;
  const max = Math.max(0, box.scrollHeight - viewH);
  nextTop = Math.max(0, Math.min(max, nextTop));
  try {
    box.scrollTo({ top: nextTop, behavior: "smooth" });
  } catch {
    box.scrollTop = nextTop;
  }
}

function syncMeritGradeUpgradeBannerVisibility(ui, state) {
  if (!ui?.meritGradeUpgradeBanner) return;
  if (state.phase === "fight") return;
  if (state._meritGradeBannerTimer) {
    window.clearTimeout(state._meritGradeBannerTimer);
    state._meritGradeBannerTimer = null;
  }
  ui.meritGradeUpgradeBanner.classList.remove("is-visible");
  ui.meritGradeUpgradeBanner.hidden = true;
  ui.meritGradeUpgradeBanner.setAttribute("aria-hidden", "true");
}

/** 战斗中：本局评价升档时阵前横幅提示 */
function pulseMeritGradeUpgradeBanner(ui, state, gradeLabel) {
  const el = ui?.meritGradeUpgradeBanner;
  if (!el || state.phase !== "fight") return;
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (state._meritGradeBannerTimer) {
    window.clearTimeout(state._meritGradeBannerTimer);
    state._meritGradeBannerTimer = null;
  }
  el.textContent = `评价提升！${gradeLabel}`;
  el.hidden = false;
  el.setAttribute("aria-hidden", "false");
  if (reduced) {
    state._meritGradeBannerTimer = window.setTimeout(() => {
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
      state._meritGradeBannerTimer = null;
    }, 2200);
    return;
  }
  el.classList.remove("is-visible");
  void el.offsetWidth;
  el.classList.add("is-visible");
  state._meritGradeBannerTimer = window.setTimeout(() => {
    el.classList.remove("is-visible");
    state._meritGradeBannerTimer = window.setTimeout(() => {
      el.hidden = true;
      el.setAttribute("aria-hidden", "true");
      state._meritGradeBannerTimer = null;
    }, 400);
  }, 2600);
}

/** 缓存在线排行榜数据，避免每帧重复请求 */
let _onlineLeaderboardCache = null;
let _onlineLeaderboardFetching = false;
function resetOnlineLeaderboardCache() {
  _onlineLeaderboardCache = null;
  _onlineLeaderboardFetching = false;
}
function ensureOnlineLeaderboardCache(callback) {
  if (_onlineLeaderboardCache !== null) {
    callback(_onlineLeaderboardCache);
    return;
  }
  if (_onlineLeaderboardFetching) return;
  if (typeof OnlineLeaderboard === "undefined" || !OnlineLeaderboard.isConfigured()) return;
  _onlineLeaderboardFetching = true;
  const fallbackLocal = () => loadChapter1MeritLeaderboard().slice(0, 30);
  OnlineLeaderboard.fetchLeaderboard(30)
    .then((data) => {
      _onlineLeaderboardFetching = false;
      if (Array.isArray(data)) {
        _onlineLeaderboardCache = data;
      } else {
        _onlineLeaderboardCache = fallbackLocal();
      }
      callback(_onlineLeaderboardCache);
    })
    .catch(() => {
      _onlineLeaderboardFetching = false;
      _onlineLeaderboardCache = fallbackLocal();
      callback(_onlineLeaderboardCache);
    });
}

/** 左侧英雄榜：单列表滚动；混排逻辑不变 */
function renderLocalLeaderboardToSettlePanel(ui, state) {
  const box = ui.settleRank;
  if (!box) return;
  // 重开/回主界面后：避免先展示上一轮榜单 DOM（闪屏），首帧先清空，等数据可用再首次渲染
  if (state && !state._leaderboardPrimed) {
    box.innerHTML = "";
    box.scrollTop = 0;
    // 本地数据已就绪：允许本帧继续渲染本地榜，避免空白停留
    state._leaderboardPrimed = true;
  }
  const meritDisp = getLiveMeritScoreForRankDisplay(ui, state);
  const localSaved = loadChapter1MeritLeaderboard().slice(0, 30);
  const onlineOk = typeof OnlineLeaderboard !== "undefined" && OnlineLeaderboard.isConfigured();
  /** 已配置在线榜时：在缓存就绪前不用本机快照，避免先本地一帧再被在线覆盖（闪屏） */
  let saved;
  if (onlineOk) {
    if (_onlineLeaderboardCache !== null) {
      saved = _onlineLeaderboardCache;
  } else {
    saved = [];
    ensureOnlineLeaderboardCache(() => {
      /* 首帧用空榜已消费 _anchorSettleRankToLive；在线数据抵达后再锚定本局行，避免仍停在顶部 */
      if (state && (state.phase === "fight" || state.phase === "ending")) {
        state._anchorSettleRankToLive = true;
      }
      renderLocalLeaderboardToSettlePanel(ui, state);
    });
  }
  } else {
    saved = localSaved;
  }
  if (state && state._chapter1LbRowDisplayPatch) {
    saved = saved.map((e) => applyChapter1LbDisplayNamePatch(e, state));
  } else if (onlineOk && Array.isArray(saved) && saved.length) {
    saved = enrichOnlineLbRowsWithLocalNames(saved);
  }
  const nick = (state?._playerName || "").trim() || "你";
  const reduced =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const items = saved.map((e) => ({ kind: /** @type {"saved"} */ ("saved"), ...e }));
  items.push({
    kind: "live",
    name: nick,
    finalMerit: meritDisp,
  });
  items.sort((a, b) => {
    const sa = a.finalMerit ?? 0;
    const sb = b.finalMerit ?? 0;
    if (sb !== sa) return sb - sa;
    const ta =
      a.kind === "live"
        ? state?._chapterSettleLbEntryAt != null
          ? state._chapterSettleLbEntryAt
          : Number.MAX_SAFE_INTEGER
        : a.at || 0;
    const tb =
      b.kind === "live"
        ? state?._chapterSettleLbEntryAt != null
          ? state._chapterSettleLbEntryAt
          : Number.MAX_SAFE_INTEGER
        : b.at || 0;
    if (ta !== tb) return ta - tb;
    if (a.kind === "live" && b.kind !== "live") return 1;
    if (b.kind === "live" && a.kind !== "live") return -1;
    return 0;
  });

  let liveRank = 0;
  const rowParts = items.map((e, i) => {
    const rank = i + 1;
    if (e.kind === "live") liveRank = rank;
    return buildHeroRankRowHtml(e, rank);
  });
  const html = rowParts.join("");

  const prevRank = state?._liveMeritRankPrev;
  const prevGradeTier = state?._liveMeritGradeTierPrev;
  const improved = !!(state && prevRank != null && liveRank > 0 && liveRank < prevRank);
  const prevScrollTop = box.scrollTop;
  const liveDispGrade = meritGradeLabelFromFinalScore(meritDisp);
  const liveTierNow = meritGradeTierOrderIndex(liveDispGrade);
  const gradeTierUp = !!(
    state &&
    prevGradeTier != null &&
    liveTierNow > 0 &&
    prevGradeTier > 0 &&
    liveTierNow > prevGradeTier
  );

  box.innerHTML = html;
  if (state) state._leaderboardPrimed = true;

  if (state) {
    state._liveMeritRankPrev = liveRank;
    state._liveMeritGradeTierPrev = liveTierNow;
    state._settleLbLastMerit = meritDisp;
    state._settleLbLastRank = liveRank;

    if (gradeTierUp && state.phase === "fight" && liveTierNow > 0) {
      pulseMeritGradeUpgradeBanner(ui, state, liveDispGrade);
      const liveRow = box.querySelector(".rank-row--live-preview");
      if (liveRow) {
        liveRow.classList.remove("rank-row--grade-tier-up");
        void liveRow.offsetWidth;
        liveRow.classList.add("rank-row--grade-tier-up");
        window.setTimeout(() => liveRow.classList.remove("rank-row--grade-tier-up"), 1200);
      }
    }

    if (improved && !reduced) {
      const numEl = box.querySelector(".rank-row--live-preview .rank-num--live");
      if (numEl) {
        numEl.classList.remove("is-rising");
        void numEl.offsetWidth;
        numEl.classList.add("is-rising");
        if (state._liveRankRiseTimer) window.clearTimeout(state._liveRankRiseTimer);
        state._liveRankRiseTimer = window.setTimeout(() => {
          numEl.classList.remove("is-rising");
          state._liveRankRiseTimer = null;
        }, 720);
      }
    }

    const anchorLive = !!state._anchorSettleRankToLive;
    if (anchorLive) state._anchorSettleRankToLive = false;

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (anchorLive) {
          scrollSettleRankListToLiveRow(box);
          return;
        }
        const max = Math.max(0, box.scrollHeight - box.clientHeight);
        box.scrollTop = Math.min(max, prevScrollTop);
      });
    });
  }
}

function animateRunMeritValue(ui, state, from, to, onComplete, durationMs) {
  const el = ui.runMeritValue;
  const ms = typeof durationMs === "number" ? durationMs : RUN_MERIT_ANIM_MS;
  if (!el) {
    state._runMeritAnimating = false;
    if (typeof onComplete === "function") onComplete();
    return;
  }
  state._runMeritAnimating = true;
  state._runMeritAnimGen = (state._runMeritAnimGen || 0) + 1;
  const gen = state._runMeritAnimGen;
  el.classList.add("run-merit-value--pulse");
  const t0 = performance.now();
  function step(now) {
    if (gen !== state._runMeritAnimGen) return;
    const u = Math.min(1, (now - t0) / ms);
    el.textContent = String(Math.round(from + (to - from) * u));
    if (u < 1) {
      requestAnimationFrame(step);
    } else {
      el.textContent = String(to);
      state._runMeritAnimating = false;
      window.setTimeout(() => el.classList.remove("run-merit-value--pulse"), 320);
      if (typeof onComplete === "function") onComplete();
    }
  }
  requestAnimationFrame(step);
}

/** 重新开始第一章：清空技法、装备进度、战功档案与累计战功显示 */
function resetChapter1NewGame(state) {
  state._runMeritAnimGen = (state._runMeritAnimGen || 0) + 1;
  state._runMeritAnimating = false;
  delete state._pendingRunMeritAnim;
  state._liveMeritRankPrev = null;
  state._liveMeritGradeTierPrev = null;
  state._anchorSettleRankToLive = false;
  if (state._meritGradeBannerTimer) {
    window.clearTimeout(state._meritGradeBannerTimer);
    state._meritGradeBannerTimer = null;
  }
  state._settleLbLastMerit = null;
  state._settleLbLastRank = null;
  state._leaderboardPrimed = false;
  state._introHeroLbDone = false;
  state._introLeftHeroSession = (state._introLeftHeroSession || 0) + 1;
  state._introLeftHeroLoading = false;
  resetOnlineLeaderboardCache();
  if (state._liveRankRiseTimer) {
    window.clearTimeout(state._liveRankRiseTimer);
    state._liveRankRiseTimer = null;
  }
  state._runMeritSyncedToFinal = false;
  state._chapterSettleRemainAnimDone = false;
  state._chapterRemainMeritAnimScheduled = false;
  delete state._chapterRemainMeritAnimPending;
  const p = state.player;
  const fresh = mkFighter({ name: "我", hp: ns(6), stagger: 0, staggerThreshold: 4, level: 1 });
  p.hp = fresh.hp;
  p.hpMax = fresh.hpMax;
  p.stagger = 0;
  p.staggerThreshold = fresh.staggerThreshold;
  p.broken = false;
  p.brokenTurnsLeft = 0;
  p.atkBonus = 0;
  p.defendMitigationBonus = 0;
  p.heavyStgBonus = 0;
  p.executeHealBonus = 0;
  p.restCooldownLeft = 0;
  state.perks = [];
  state.skillDeckRemaining = [...new Set((state.skillDeckAll || SKILL_CARDS.map((c) => c.perk)).slice())];
  state.draftOffers = {};
  state._pickedAttrCardIds = {};
  state.merit = 0;
  state.runMeritScore = 0;
  state.meritChapter = { retries: {}, records: {}, battleRemainGranted: {} };
  state._deathMeritPenaltyPending = 0;
  state._deathPenaltyRetryBusy = false;
  state._runMeritAtBattleEnter = null;
  state._chapterMeritLogLenAtBattleEnter = null;
  state.chapterHeroProfile = createEmptyChapterHeroProfile();
  state.turnMeritLog = [];
  state.chapterMeritLog = [];
  state._resolvedSoul105ForKey = null;
  state._resolvedSoul105Payload = null;
  state._behaviorPhaseLockSnapshot = null;
  state.lootR3 = null;
  state.orangeLoot = null;
  state.support = null;
  state.supportUses = {};
  state.chapterRoadmapCleared = {};
  state.growthRevealed = {};
  state.growthPickId = {};
  state._attrGrowthLog = [];
  state._meritSession = null;
  state._leaderboardSavedForThisRun = false;
  state._leaderboardEarlyCampSaved = false;
  state._chapterSettleLbEntryAt = null;
  state._chapter1LbRowDisplayPatch = null;
  state.battle = null;
  state.battleLog = [];
  state.settleLog = [];
  state.pendingRetryBattleNodeId = null;
  state.battleSnapshot = null;
  state.tips = [];
  state.tutorialSeen = {};
  state.tipsHighlightDismissed = false;
  state.introDismissed = false;
  state.firstQuickAttackBonusPending = false;
  state._mainBehaviorHistory = [];
  applyStoredPlayerProfileToState(state);
  state._nameDialogMode = null;
  state.battleMeritFxQueue = [];
  state.battleMeritFxPlaying = false;
  state.visibleCombo = 0;
  state.winGrowthEmbed = false;
  state.winGrowthEmbedNodeId = null;
  state.winGrowthPendingAdvance = null;
}

/** 章节剧情顺序（含非战斗节点）：用于战斗线路图判断「未到 / 未来」 */
const CHAPTER_STORY_ORDER = {
  chapter1: [
    "N0",
    "N1",
    "B1",
    "R1_DRAFT",
    "B2",
    "R2_STAT",
    "E1",
    "R3_LOOT",
    "B3",
    "R4_DRAFT",
    "N4",
    "BOSS",
    "S1",
    "HOOK",
  ],
};

/** 标题栏线路图：仅战斗节点；头目略大（见 CSS .roadmap-step--boss） */
const CHAPTER_ROADMAP = {
  chapter1: [
    { id: "B1", label: "外哨", title: "边寨外哨", boss: false },
    { id: "B2", label: "寨门", title: "寨门拒战", boss: false },
    { id: "E1", label: "精英", title: "仓廪之前", boss: false },
    { id: "B3", label: "合围", title: "亲兵合围", boss: false },
    { id: "BOSS", label: "渠帅", title: "边寨渠帅", boss: true },
  ],
};

/** @param {{ chapterRoadmapCleared?: Record<string, boolean> }} state */
function markRoadmapNodeDone(state, nodeId) {
  if (!nodeId) return;
  if (!state.chapterRoadmapCleared) state.chapterRoadmapCleared = {};
  state.chapterRoadmapCleared[nodeId] = true;
}

function winGrowthNextShortLabel(chapter, nextId) {
  if (!chapter || !nextId) return "";
  const order = CHAPTER_ROADMAP[chapter.id];
  const step = order?.find((s) => s.id === nextId);
  if (step?.label) return step.label;
  const n = chapter.nodes[nextId];
  return n?.title || String(nextId);
}

function armWinGrowthPendingAdvance(state, chapter, node, nextId) {
  state.winGrowthPendingAdvance = {
    chapterId: chapter.id,
    fromNodeId: node.id,
    nextId,
    label: winGrowthNextShortLabel(chapter, nextId),
  };
}

function renderChapterRoadmap(state, ui) {
  const nav = ui.chapterRoadmap;
  if (!nav) return;
  const order = CHAPTER_ROADMAP[state.chapterId];
  if (!order?.length) {
    nav.innerHTML = "";
    nav.hidden = true;
    if (ui.runMeritWidget) ui.runMeritWidget.hidden = true;
    return;
  }
  nav.hidden = false;
  if (ui.runMeritWidget) ui.runMeritWidget.hidden = false;
  const storyOrder = CHAPTER_STORY_ORDER[state.chapterId] || [];
  const storyIdx = storyOrder.indexOf(state.nodeId);
  const inner = document.createElement("div");
  inner.className = "chapter-roadmap-inner";
  inner.setAttribute("role", "list");
  order.forEach((step, i) => {
    if (i > 0) {
      const line = document.createElement("span");
      line.className = "roadmap-connector";
      line.setAttribute("aria-hidden", "true");
      inner.appendChild(line);
    }
    const done = !!state.chapterRoadmapCleared?.[step.id];
    const cur = state.nodeId === step.id;
    const stepStoryIdx = storyOrder.indexOf(step.id);
    const isFuture = storyIdx >= 0 && stepStoryIdx > storyIdx && !done;
    const div = document.createElement("div");
    div.className = [
      "roadmap-step",
      step.boss ? "roadmap-step--boss" : "",
      done ? "roadmap-step--done" : "",
      cur ? "roadmap-step--current" : "",
      isFuture ? "roadmap-step--future" : "",
    ]
      .filter(Boolean)
      .join(" ");
    div.title = step.title;
    div.setAttribute("role", "listitem");
    if (cur) div.setAttribute("aria-current", "step");
    div.innerHTML = `<span class="roadmap-dot" aria-hidden="true"></span><span class="roadmap-label">${escapeHtml(step.label)}</span>`;
    inner.appendChild(div);
  });
  nav.innerHTML = "";
  nav.appendChild(inner);

  if (ui.runMeritValue && !state._runMeritAnimating && !state._chapterRemainMeritAnimating) {
    ui.runMeritValue.textContent = String(state.runMeritScore ?? 0);
  }
  if (ui.runMeritHint) {
    ui.runMeritHint.innerHTML = buildRunMeritTooltipHtml(state);
  }
}

const BASE_TIPS = [
  "【资源解释】",
  "- HP/伤害/治疗/减伤：数值为「基础×10」的整数（如 60 HP=基础 6×10）。失衡与失衡上限：小整数，不×10。",
  "- 失衡：0～阈值。受击/交互会累积；叠满进入「破绽」。",
  "- 破绽：持续约一回合；回合结束强制解除（失衡清零）。破绽中不能快攻/重击/处决，但可以调息、防御或盾反（防御/盾反仍可能失败）。",
  "",
  "【关键交互】",
  "- 处决：只对破绽敌人；按钮会出现在该敌人卡片上。处决为「追加收束」：本段只有你出手，其余敌人不行动；**不计入回合**（回合数、限回合与调息/侦察倒计时均不因处决推进）。",
  "- 调息：HP+20、失衡-1（破绽中也可用）；使用后进入 3 回合冷却；本回合若被快攻/重击，30% 完全闪避（免伤）。技法「听风卸势」可将该概率提升至 70%。之后敌人照常行动。",
  `- 打断：快攻对重击有 ${Math.round(INTERRUPT_QUICK_VS_HEAVY * 100)}% 概率打断。任一方被打断时，本回合对该目标的出手改按「快攻」结算伤害与失衡（通用规则）；敌方快攻仍会照常打到你。`,
  "",
  "【成长】",
  "- 成长：通过战斗后的成长节点获取招式与属性提升。",
];

/** 意图机制说明：药丸悬浮层；快攻/重击由 intentPillTooltipText 按 strikeBase 动态生成（含具体 HP 与失衡） */
const INTENT_RULES = {
  defend: `防御意图：本回合先守不攻；被你打到时固定伤−${ns(1)}、被上失衡−1（无单独「防御力」面板；若本回合未受伤：回合末失衡+1）。`,
  block: `盾反意图：本回合不按快攻/重击线出手；专候你重击以反制（无单独「盾反值」；若未受伤，盾反成功会让自己失衡+1，可叠加）。`,
  adjust: `调整：回血与自减失衡，非进攻意图。`,
};

const INTENT_TEXT = {
  // 甲
  a_heavy: `守卫刀兵甲高举战刀，肩背发力，显然要劈下一记狠的。`,
  a_defend: `守卫刀兵甲收紧步伐，刀身护在身前，准备稳稳接下你的来势。`,
  a_block: `守卫刀兵甲刀锋上挑，试图盾反你的重击。`,
  // 乙
  b_quick: `守卫刀兵乙沉肩扑上，刀锋贴身而来，动作极快。`,
  b_heavy: `守卫刀兵乙忽然换握发力，刀锋带着沉重的惯性压下来。`,
  b_defend: `守卫刀兵乙收紧步伐，刀身护在身前，准备稳稳接下你的来势。`,
  b_block: `守卫刀兵乙横刀立势，显然想盾反你的重击。`,
  // 通用旁白（产品化短句；无角色专属键时回退；机制见 INTENT_RULES）
  quick: `刀路抢前，欲抢先命中；来势偏快。`,
  heavy: `蓄力劈落，压迫更重；这一击不好硬接。`,
  defend: `收势固守，以刀与身法护住正面，预备硬接你的攻势。`,
  block: `横刀立势，专候你的重击，伺机反制。`,
  adjust: `暂缓抢攻，挪步调息，压下失衡再图反打。`,
  /** 打击基伤高一档（ns(3)）时的快攻/重击旁白，与「快攻·疾」「重击·沉」对应，凡同档基伤共用 */
  tierHigh_quick: `这一路数更重：刀路紧、势更狠。`,
  tierHigh_heavy: `蓄势更深，劈落时压迫感更强。`,
  broken: `敌人架势大乱，露出破绽。`,
};

function intentDisplayText(enemyId, intent, enemyObj) {
  const key = `${String(enemyId || "").toLowerCase()}_${intent}`;
  if (INTENT_TEXT[key]) return INTENT_TEXT[key];

  const base = enemyObj?.fighter?.strikeBase ?? ns(2);
  if (base >= ENEMY_STRIKE_BASE_HIGH_TIER && (intent === "quick" || intent === "heavy")) {
    const th = `tierHigh_${intent}`;
    if (INTENT_TEXT[th]) return INTENT_TEXT[th];
  }
  return INTENT_TEXT[intent] || "—";
}

/** 意图药丸悬浮：机制说明（与旁白 INTENT_TEXT 分离）；快攻/重击写明 HP 伤害（×10 体系下的点数）与失衡 */
function intentPillTooltipText(intent, enemyObj) {
  const lines = [];
  const strikeBase = enemyObj?.fighter?.strikeBase ?? ns(2);
  const highTier = strikeBase >= ENEMY_STRIKE_BASE_HIGH_TIER;

  if (intent === "quick") {
    const label = highTier ? "快攻·疾" : "快攻";
    lines.push(
      `${label}：命中造成 ${strikeBase} 点 HP 伤害；对你失衡 +${ENEMY_STRIKE_QUICK_STAGGER_TO_PLAYER}。`,
    );
    if (highTier) lines.push("高打击基伤档：刀路更紧、来势更狠。");
  } else if (intent === "heavy") {
    const dmg = strikeBase + ENEMY_STRIKE_HEAVY_EXTRA_DAMAGE;
    const label = highTier ? "重击·沉" : "重击";
    lines.push(
      `${label}：命中造成 ${dmg} 点 HP 伤害（打击基伤 ${strikeBase} + 重击增幅 ${ENEMY_STRIKE_HEAVY_EXTRA_DAMAGE}）；对你失衡 +${ENEMY_STRIKE_HEAVY_STAGGER_TO_PLAYER}。`,
    );
    if (highTier) lines.push("高打击基伤档：蓄势更深、劈落压迫更强。");
  } else {
    const rule = INTENT_RULES[intent];
    if (rule) lines.push(rule);
  }
  return lines.join("\n");
}

/** 带悬浮说明的意图标签 HTML（勿用于已破绽等无药丸态） */
function htmlIntentPillWithHint(eo) {
  const intent = eo.intent;
  const tip = intentPillTooltipText(intent, eo);
  const hintHtml = tip
    ? `<span class="intent-pill-hint" aria-hidden="true">${escapeHtml(tip).replaceAll("\n", "<br>")}</span>`
    : "";
  return `<span class="intent-pill-wrap">${hintHtml}<span class="intent-pill ${intentCategoryClass(intent)}">${escapeHtml(intentNameForEnemy(eo, intent))}</span></span>`;
}

function computeEnemyIntentFromAi(ai) {
  const w = ai || { quick: 35, heavy: 25, defend: 20, block: 0, adjust: 20 };
  return rngPickWeighted(
    [
      { k: "quick", w: w.quick ?? 0 },
      { k: "heavy", w: w.heavy ?? 0 },
      { k: "defend", w: w.defend ?? 0 },
      { k: "block", w: w.block ?? 0 },
      { k: "adjust", w: w.adjust ?? 0 },
    ],
    nowR01(),
  );
}

function applyDamage(target, amount) {
  const dmg = Math.max(0, amount);
  target.hp = clamp(target.hp - dmg, 0, target.hpMax);
  return dmg;
}

function applyHeal(target, amount) {
  const heal = Math.max(0, amount);
  target.hp = clamp(target.hp + heal, 0, target.hpMax);
  return heal;
}

/** @param {number} amount 失衡增量（不×10，与条上数字一致）
 * @param {any} [meritState] 传入 state 时统计玩家进入破绽次数（战功） */
function addStagger(target, amount, meritState) {
  const inc = Math.max(0, amount);
  const wasBrokenBefore = !!target.broken;
  target.stagger = clamp(target.stagger + inc, 0, target.staggerThreshold);
  if (target.stagger >= target.staggerThreshold) {
    target.broken = true;
    if (!wasBrokenBefore) {
      target.brokenTurnsLeft = 2; // 进入破绽后持续 1 回合（到下回合结束清零）
      if (meritState?._meritSession && target === meritState.player) {
        meritState._meritSession.breakCount += 1;
      }
    }
  }
  return inc;
}

/** @param {number} delta 失衡变化量（不×10） */
function changeStagger(target, delta) {
  target.stagger = clamp(target.stagger + delta, 0, target.staggerThreshold);
}

/**
 * 根据快照与当前状态生成飘字后，将快照推进到当前值，便于下一段只显示「本段」增减（多敌连击不再合并成一条大额）。
 */
function pushMeterFloatsAndAdvanceSnap(state, ui, snap) {
  if (!snap || !ui) return;
  pushBattleMeterFloats(state, ui, snap);
  snap.playerHp = state.player.hp;
  snap.playerStg = state.player.stagger;
  for (const eo of state.enemies) {
    const id = eo.id;
    if (eo.waitingToEnter || snap.enemyWaitingAtStart[id]) continue;
    if (typeof snap.enemyHp[id] !== "number") continue;
    snap.enemyHp[id] = eo.fighter.hp;
    snap.enemyStg[id] = eo.fighter.stagger;
  }
}

/** 调息提前结算前：用于飘字与回合末对比的条上快照（与 onPlayerAction 开头一致） */
function captureBattleTurnMeterSnapshot(state) {
  return {
    playerHp: state.player.hp,
    playerStg: state.player.stagger,
    enemyHp: Object.fromEntries(state.enemies.map((eo) => [eo.id, eo.fighter.hp])),
    enemyStg: Object.fromEntries(state.enemies.map((eo) => [eo.id, eo.fighter.stagger])),
    enemyWaitingAtStart: Object.fromEntries(state.enemies.map((eo) => [eo.id, !!eo.waitingToEnter])),
  };
}

/**
 * 在指定条容器上追加一条飘字（淡入、上飘，animationend 后移除）。
 * @param {HTMLElement | null} barWrap
 * @param {string} text
 * @param {string} variant CSS 修饰类，如 meter-float--hp-up
 */
function spawnMeterFloat(barWrap, text, variant) {
  if (!barWrap || !text) return;
  const el = document.createElement("span");
  el.className = `meter-float ${variant}`;
  el.setAttribute("aria-hidden", "true");
  el.textContent = text;
  barWrap.appendChild(el);
  const done = () => {
    el.removeEventListener("animationend", done);
    el.remove();
  };
  el.addEventListener("animationend", done);
}

/**
 * 相对快照 `start` 的 HP/失衡差，在条旁生成飘字。若每段数值结算后调用 {@link pushMeterFloatsAndAdvanceSnap} 更新快照，可多次飘字（多敌连击不再合并成一条总差）。
 * @param {ReturnType<typeof dom>} ui
 * @param {{
 *   playerHp: number,
 *   playerStg: number,
 *   enemyHp: Record<string, number>,
 *   enemyStg: Record<string, number>,
 *   enemyWaitingAtStart: Record<string, boolean>,
 * }} start
 */
function pushBattleMeterFloats(state, ui, start) {
  const p = state.player;
  const dHpP = Math.round(p.hp - start.playerHp);
  const dStgP = Math.round(p.stagger - start.playerStg);

  if (dHpP !== 0) {
    const text = dHpP > 0 ? `HP+${dHpP}` : `HP${dHpP}`;
    spawnMeterFloat(ui.pHpBarWrap, text, dHpP > 0 ? "meter-float--hp-up" : "meter-float--hp-down");
  }
  if (dStgP !== 0) {
    const text = dStgP > 0 ? `失衡+${dStgP}` : `失衡${dStgP}`;
    const variant =
      dStgP > 0 ? "meter-float--stg-up-player" : "meter-float--stg-down-player";
    spawnMeterFloat(ui.pStaggerBarWrap, text, variant);
  }

  const wraps = {
    A: { hp: ui.eAHpBarWrap, st: ui.eAStaggerBarWrap },
    B: { hp: ui.eBHpBarWrap, st: ui.eBStaggerBarWrap },
    C: { hp: ui.eCHpBarWrap, st: ui.eCStaggerBarWrap },
  };

  for (const eo of state.enemies) {
    const id = eo.id;
    if (eo.waitingToEnter || start.enemyWaitingAtStart[id]) continue;
    const e = eo.fighter;
    const w = wraps[id];
    if (!w?.hp || !w.st) continue;
    const hp0 = start.enemyHp[id];
    const st0 = start.enemyStg[id];
    if (typeof hp0 !== "number" || typeof st0 !== "number") continue;

    const dHp = Math.round(e.hp - hp0);
    const dStg = Math.round(e.stagger - st0);

    if (dHp !== 0) {
      const text = dHp > 0 ? `HP+${dHp}` : `HP${dHp}`;
      spawnMeterFloat(w.hp, text, dHp > 0 ? "meter-float--hp-up" : "meter-float--hp-down");
    }
    if (dStg !== 0) {
      const text = dStg > 0 ? `失衡+${dStg}` : `失衡${dStg}`;
      const variant =
        dStg > 0 ? "meter-float--stg-up-enemy" : "meter-float--stg-down-enemy";
      spawnMeterFloat(w.st, text, variant);
    }
  }
}

function meritMarkBossExecutePlayer(state) {
  if (state._meritSession) state._meritSession.bossExecutePlayer = 1;
}

function findBossExecutePlayerExecutor(state) {
  return state.enemies.find(
    (eo) => !eo.waitingToEnter && eo.fighter.hp > 0 && eo.canExecutePlayer,
  );
}

function hideBossExecPlayerDramaTextOverlay(ui) {
  if (!ui) return;
  const ov = ui.bossExecPlayerDramaOverlay;
  if (ov) {
    ov.hidden = true;
    ov.setAttribute("aria-hidden", "true");
  }
  for (const id of ["bossExecPlayerDramaLine1", "bossExecPlayerDramaLine2"]) {
    const el = ui[id];
    if (el && "classList" in el) {
      el.classList.remove("is-visible");
      el.textContent = "";
    }
  }
}

function stripBossExecutePlayerDramaFx(ui) {
  hideBossExecPlayerDramaTextOverlay(ui);
  ui.playerCard?.classList.remove("boss-exec-drama--stagger", "boss-exec-drama--broken", "boss-exec-drama--menace");
  for (const el of [ui.enemyCardA, ui.enemyCardB, ui.enemyCardC]) {
    el?.classList.remove("boss-exec-drama--executor");
  }
}

function clearBossExecutePlayerDramaTimers(state) {
  if (Array.isArray(state._bossExecPlayerDramaTimers)) {
    for (const t of state._bossExecPlayerDramaTimers) clearTimeout(t);
  }
  state._bossExecPlayerDramaTimers = [];
}

/**
 * 无论谁先打满失衡：只要本回合敌方阶段结束时你仍为破绽且场上有可处决玩家的头目，则由头目处决（全屏两行预告 → 卡面动效 → 处决）。
 * @param {{ action: string, targetId: EnemyId|null, intents: Record<string, any>, details: string[], playerHpAtEnemyPhaseStartForDeathAnim: number }} payload
 */
function runBossExecutePlayerDrama(state, ui, payload) {
  const { action, targetId, intents, details, playerHpAtEnemyPhaseStartForDeathAnim } = payload;
  const executor = findBossExecutePlayerExecutor(state);
  if (!executor) return;

  clearBossExecutePlayerDramaTimers(state);
  stripBossExecutePlayerDramaFx(ui);
  state._bossExecPlayerDramaGen = (state._bossExecPlayerDramaGen || 0) + 1;
  const myGen = state._bossExecPlayerDramaGen;
  const exName = executor.fighter.name;
  const exId = executor.id;

  const prefaceLine1 = "你的失衡条顶至极限，虎口发麻。";
  const prefaceLine2 = "边寨渠帅的目光锁住你的空门——这一刀躲不掉了。";

  state.phase = BOSS_EXEC_PLAYER_DRAMA_PHASE;
  state.battleLog.push(formatLineForTurn(state, action, targetId, intents, details));
  render(state, ui);

  const arm = (delayMs, fn) => {
    const t = window.setTimeout(() => {
      if (myGen !== state._bossExecPlayerDramaGen || state.phase !== BOSS_EXEC_PLAYER_DRAMA_PHASE) return;
      fn();
    }, delayMs);
    state._bossExecPlayerDramaTimers.push(t);
  };

  arm(0, () => {
    const ov = ui.bossExecPlayerDramaOverlay;
    const l1 = ui.bossExecPlayerDramaLine1;
    const l2 = ui.bossExecPlayerDramaLine2;
    if (ov) {
      ov.hidden = false;
      ov.setAttribute("aria-hidden", "false");
    }
    if (l1) {
      l1.textContent = prefaceLine1;
      l1.classList.add("is-visible");
    }
    if (l2) {
      l2.textContent = prefaceLine2;
      l2.classList.remove("is-visible");
    }
    state.battleLog.push(`{r}${prefaceLine1}{/r}`);
    render(state, ui);
  });
  arm(BOSS_EXEC_PLAYER_PREFACE_LINE2_MS, () => {
    ui.bossExecPlayerDramaLine2?.classList.add("is-visible");
    state.battleLog.push(`{r}${prefaceLine2}{/r}`);
    render(state, ui);
  });
  arm(BOSS_EXEC_PLAYER_PREFACE_TOTAL_MS, () => {
    hideBossExecPlayerDramaTextOverlay(ui);
    render(state, ui);
  });

  let acc = BOSS_EXEC_PLAYER_PREFACE_TOTAL_MS;
  arm(acc, () => {
    ui.playerCard?.classList.add("boss-exec-drama--stagger");
    render(state, ui);
  });
  acc += BOSS_EXEC_PLAYER_DRAMA_BEAT_MS;
  arm(acc, () => {
    ui.playerCard?.classList.remove("boss-exec-drama--stagger");
    ui.playerCard?.classList.add("boss-exec-drama--broken");
    state.battleLog.push("{r}你失衡过高，{o}破绽{/o}已现！{/r}");
    render(state, ui);
  });
  acc += BOSS_EXEC_PLAYER_DRAMA_BEAT_MS;
  arm(acc, () => {
    ui.playerCard?.classList.add("boss-exec-drama--menace");
    const exCard = exId === "A" ? ui.enemyCardA : exId === "B" ? ui.enemyCardB : ui.enemyCardC;
    exCard?.classList.add("boss-exec-drama--executor");
    render(state, ui);
  });
  acc += BOSS_EXEC_PLAYER_DRAMA_BEAT_MS;
  arm(acc, () => {
    clearBossExecutePlayerDramaTimers(state);
    stripBossExecutePlayerDramaFx(ui);
    state.battleLog.push(`{r}${exName}上前一步，将你处决！{/r}`);
    meritMarkBossExecutePlayer(state);
    // 即时战功：本回合被 Boss 处决（用于 turn 结算扣分与连势清零）
    state._meritBossExecuteTakenThisTurn = true;
    const hpBeforeBossExecute = state.player.hp;
    const stBeforeBossExecute = state.player.stagger;
    applyDamage(state.player, ns(999));
    const over2 = isBattleOver(state);
    if (over2 === "lose" && !state.endingLoseArmed) {
      state.endingLoseArmed = true;
      state._deathByExecute = true;
      state.phase = "endingLose";
      state.player.broken = false;
      state.player.brokenTurnsLeft = 0;
      document.body.classList.add("ending-slowmo");
      triggerDeathBlowFx(ui);
      state._endingDeathAnimating = true;
      render(state, ui);
      runEndingDeathMeterAnim(state, ui, hpBeforeBossExecute, () => {
        if (state.phase !== "endingLose") return;
        state.endingLoseArmed = false;
        finish(state, ui, "lose");
        render(state, ui);
      }, { staggerStart: stBeforeBossExecute });
    } else {
      state.phase = "fight";
      render(state, ui);
    }
  });
}

function endOfTurnForceClearBroken(fighter) {
  // 新规则：进入破绽状态后，持续 1 回合；到回合结束强制清零（不受当回合失衡增减影响）
  if (!fighter.broken) return false;
  if (fighter.brokenTurnsLeft > 0) fighter.brokenTurnsLeft -= 1;
  if (fighter.brokenTurnsLeft > 0) return false;
  fighter.stagger = 0;
  fighter.broken = false;
  fighter.brokenTurnsLeft = 0;
  return true;
}

function applyPlayerToEnemy(state, enemyObj, playerAction, targetId) {
  const e = enemyObj.fighter;
  const intent = enemyObj.intent;
  /** @type {{eDmg:number,eStg:number, notes:string[], hit:boolean, vsIntent:EnemyIntent|null, flags?:Record<string, boolean>}} */
  const out = {
    eDmg: 0,
    eStg: 0,
    notes: [],
    hit: false,
    vsIntent: intent || null,
    flags: {},
  };
  if (enemyObj.waitingToEnter) return out;
  if (e.hp <= 0) return out;
  if (targetId !== enemyObj.id) return out;
  const hpBefore = e.hp;

  if (playerAction === "attack") {
    let dmg = ns(2) + (state.player.atkBonus || 0);
    let stg = 1;
    // T13：对失衡未破绽目标快攻额外 +1 失衡（破绽目标应处决，不再叠伤害）
    if (state.perks?.includes("perk_attack_vs_broken") && e.stagger > 0 && !e.broken) {
      stg += 1;
      out.notes.push("乘隙追命：对失衡未破绽目标快攻额外失衡 +1。");
    }
    // T06：快攻命中失衡值不为 0 的目标时，额外 +1 伤害
    if (state.perks?.includes("perk_staggerstrike") && (e.broken || e.stagger > 0)) {
      dmg += ns(1);
      out.notes.push(`夺命追击：快攻命中失衡值不为 0 的目标，伤害 +${ns(1)}。`);
    }
    // T11：快攻命中未处于防御意图的目标时，额外 +1 失衡
    if (state.perks?.includes("perk_follow_attack") && intent !== "defend") {
      stg += 1;
      out.notes.push("追身快斩：快攻命中非防御意图目标，失衡 +1。");
    }
    if (intent === "defend") {
      // v0.3：敌方防御意图固定效果：本回合受到伤害 -1、受到失衡 -1
      dmg = Math.max(0, dmg - ns(1));
      stg = Math.max(0, stg - 1);
      out.notes.push(`${e.name}防御：受到伤害 -${ns(1)}，受到失衡 -1。`);
      // T31：快攻命中防御目标额外伤害
      if (state.perks?.includes("perk_quick_vs_defend_dmg")) {
        dmg += ns(1);
        out.notes.push(`破门疾袭：快攻压防，伤害 +${ns(1)}。`);
      }
    } else if (intent === "block") {
      out.notes.push(`${e.name}盾反落空：对快攻无法反制。`);
    }
    // T08：敌人调整时，攻击额外 +1 失衡
    if (state.perks?.includes("perk_attackvsadjust") && intent === "adjust") {
      stg += 1;
      out.notes.push("乘势压攻：敌人调整，本次攻击额外失衡 +1。");
    }
    // T15：快攻成功打断重击时，额外 +1 失衡（由 resolveEnemyAgainstPlayer 标记本回合被打断的目标）
    if (state.perks?.includes("perk_interrupt_bonus") && state._attackInterruptedHeavyTargetId === enemyObj.id) {
      stg += 1;
      out.notes.push("截锋断势：打断重击，本次额外失衡 +1。");
    }
    // T28：盾反成功后，下回合首次攻击额外 +1 失衡
    if (state._blockNextAttackStaggerPending) {
      stg += 1;
      state._blockNextAttackStaggerPending = false;
      out.notes.push("借锋还势：盾反余势，本次攻击额外失衡 +1。");
    }
    // T32：连续两回合快攻，第二次快攻额外 +1 失衡
    if (state.perks?.includes("perk_quick_double_stagger") && state._lastPlayerActionWasAttack) {
      stg += 1;
      out.notes.push("疾锋连压：连番快攻，额外失衡 +1。");
    }
    // T09：本场战斗首次快攻 +1 伤害基数（仅消费一次；见 startBattleFromNode 初始化）
    if (state.firstQuickAttackBonusPending) {
      dmg += ns(1);
      state.firstQuickAttackBonusPending = false;
      out.notes.push(`夺势突进：战斗开始后首次快攻伤害 +${ns(1)}。`);
    }
    // T16：重击命中防御目标后，下回合第一次快攻额外 +1 伤害
    if (state._breakDefenseFollowupPending) {
      dmg += ns(1);
      state._breakDefenseFollowupPending = false;
      out.notes.push(`逼守抢口：下回合首次快攻伤害 +${ns(1)}。`);
    }
    // T22：本回合未受伤，则下回合第一次快攻额外 +1 伤害
    if (state._noDamageNextAttackPending) {
      dmg += ns(1);
      state._noDamageNextAttackPending = false;
      out.notes.push(`以守待变：下回合首次快攻伤害 +${ns(1)}。`);
    }
    // T30：快攻打断后，下回合首次快攻额外伤害
    if (state._interruptNextQuickBonusPending) {
      dmg += ns(1);
      state._interruptNextQuickBonusPending = false;
      out.notes.push(`乱节追身：打断余势，本次快攻伤害 +${ns(1)}。`);
    }
    out.eDmg = applyDamage(e, dmg);
    out.eStg = addStagger(e, stg);
    out.hit = out.eDmg > 0 || out.eStg > 0;
    if (out.hit && intent === "adjust") out.flags.punish_adjust = true;

    // T14：击杀敌人后自己失衡 -1
    if (state.perks?.includes("perk_kill_reduce_stagger") && hpBefore > 0 && e.hp <= 0) {
      const before = state.player.stagger;
      changeStagger(state.player, -1);
      const reduced = before - state.player.stagger;
      if (reduced > 0) out.notes.push("斩阵夺势：击杀敌人，你的失衡 -1。");
    }
  } else if (playerAction === "heavy") {
    if (intent === "block") {
      out.notes.push(`${e.name}成功盾反你的重击：你失衡 +2。`);
      addStagger(state.player, 2, state);
      out.eDmg = 0;
      out.eStg = 0;
      out.hit = false;
      return out;
    }
    let dmg = ns(3) + (state.player.atkBonus || 0);
    let stg = 2;
    // T13：对失衡未破绽目标重击额外 +1 失衡（破绽目标应处决，不再叠伤害）
    if (state.perks?.includes("perk_attack_vs_broken") && e.stagger > 0 && !e.broken) {
      stg += 1;
      out.notes.push("乘隙追命：对失衡未破绽目标重击额外失衡 +1。");
    }
    // T12：重击命中失衡值不为 0 的目标时，额外 +1 伤害
    if (state.perks?.includes("perk_heavy_vs_staggered") && (e.broken || e.stagger > 0)) {
      dmg += ns(1);
      out.notes.push(`断脉沉击：重击命中失衡值不为 0 的目标，伤害 +${ns(1)}。`);
    }
    // T25/T27/T29：蓄势重击额外伤害
    if (state._restNextHeavyBonusPending) {
      dmg += ns(1);
      state._restNextHeavyBonusPending = false;
      out.notes.push(`养锋待发：调息蓄势，本次重击伤害 +${ns(1)}。`);
    }
    if (state._blockNextHeavyBonusPending) {
      dmg += ns(1);
      state._blockNextHeavyBonusPending = false;
      out.notes.push(`守中藏杀：盾反余势，本次重击伤害 +${ns(1)}。`);
    }
    if (state._heavyChainNextHeavyPending) {
      dmg += ns(1);
      state._heavyChainNextHeavyPending = false;
      out.notes.push(`重势追断：连势重击，本次伤害 +${ns(1)}。`);
    }
    // T01：重击额外 +1 失衡（可叠加）
    if (state.perks?.includes("perk_armorbreak")) stg += 1;
    // 装备 / 橙卡：重击额外失衡（可叠加）
    stg += state.player.heavyStgBonus || 0;
    if (state.battleBuffs?.breaklineReady) {
      dmg += ns(1);
      stg += 1;
      state.battleBuffs.breaklineReady = false;
      out.notes.push(`军略破阵：本战第一次重击更凶（伤害+${ns(1)}，失衡+1）。`);
    }
    if (intent === "defend") {
      // v0.3：敌方防御意图固定效果：本回合受到伤害 -1、受到失衡 -1
      dmg = Math.max(0, dmg - ns(1));
      stg = Math.max(0, stg - 1);
      stg += 1;
      out.notes.push("重击压制防御：额外失衡 +1。");
      out.notes.push(`${e.name}防御：受到伤害 -${ns(1)}，受到失衡 -1。`);
      // T04：对防御中敌人重击额外 +1 伤害
      if (state.perks?.includes("perk_heavybreakdef")) {
        dmg += ns(1);
        out.notes.push(`断势重斩：对防御目标重击伤害 +${ns(1)}。`);
      }
    }
    out.eDmg = applyDamage(e, dmg);
    out.eStg = addStagger(e, stg);
    out.hit = out.eDmg > 0 || out.eStg > 0;
    if (out.hit && intent === "defend") out.flags.break_defense = true;
    if (out.hit && intent === "adjust") out.flags.punish_adjust = true;
    if (out.hit && state.perks?.includes("perk_heavy_chain_heavy")) state._heavyChainNextHeavyPending = true;

    // T16：本回合用重击命中防御中的敌人后，下回合首次快攻额外 +1 伤害
    if (state.perks?.includes("perk_break_defense_followup") && out.hit && intent === "defend") {
      state._breakDefenseFollowupPending = true;
      out.notes.push(`逼守抢口：下回合首次快攻伤害 +${ns(1)}。`);
    }
    // T14：击杀敌人后自己失衡 -1
    if (state.perks?.includes("perk_kill_reduce_stagger") && hpBefore > 0 && e.hp <= 0) {
      const before = state.player.stagger;
      changeStagger(state.player, -1);
      const reduced = before - state.player.stagger;
      if (reduced > 0) out.notes.push("斩阵夺势：击杀敌人，你的失衡 -1。");
    }
  }
  return out;
}

/**
 * 技法「借力反震」：本回合盾反对重击成功几次，则尝试将自身失衡减几次（受上限与已为 0 限制）。
 * 须在敌方阶段全部 resolve 结束、且已结算「未受伤则盾反成功→自身失衡 +N」之后调用，与 N 相抵为净 0（先加后减，避免低位失衡先减无效再被 +N）。
 */
function applyBlockReliefPerkAfterEnemyPhase(state, details, blockSuccessCount, ui, meterFloatSnap) {
  if (!blockSuccessCount || !state.perks?.includes("perk_blockrelief")) return;
  const before = state.player.stagger;
  changeStagger(state.player, -blockSuccessCount);
  const reduced = before - state.player.stagger;
  if (reduced > 0) {
    details.push(
      blockSuccessCount === 1
        ? `→ 借力反震：盾反成功 1 次，你的失衡 -${reduced}。`
        : `→ 借力反震：盾反成功 ${blockSuccessCount} 次，你的失衡 -${reduced}。`,
    );
  }
  if (ui && meterFloatSnap) pushMeterFloatsAndAdvanceSnap(state, ui, meterFloatSnap);
}

function resolveEnemyAgainstPlayer(
  state,
  enemyObj,
  playerAction,
  targetId,
  defendFailedThisTurn,
  blockFailedThisTurn,
  playerHpAtEnemyPhaseStart,
  resolutionRng,
  playerBrokenAtEnemyPhaseStart,
) {
  const p = state.player;
  const e = enemyObj.fighter;
  const intent = enemyObj.intent;

  /** @type {{pDmg:number,pStg:number, notes:string[], blockSuccess?:boolean, restEvade?:boolean, effectiveIntent?:EnemyIntent|null, gotHit?:boolean, meritMitigatedHp?:number}} */
  const out = { pDmg: 0, pStg: 0, notes: [], blockSuccess: false, effectiveIntent: null, gotHit: false, meritMitigatedHp: 0 };
  // 敌方同回合同步结算：以敌方阶段开始时玩家是否存活为准，
  // 不因先结算的另一名敌人把玩家打到 0 而跳过本敌人的本回合行动。
  if (playerHpAtEnemyPhaseStart <= 0) return out;
  // 玩家本回合开始时已在破绽：任一敌人将你血条清空后，后续敌人不再出手（不等全员结算完）。
  if (playerBrokenAtEnemyPhaseStart && p.hp <= 0) return out;
  if (e.hp <= 0) return out;
  if (enemyObj.waitingToEnter) return out;
  /* 破绽中敌人本回合不对玩家出手（与敌方阶段 actingEnemies 过滤一致） */
  if (e.broken) return out;

  // 可处决玩家的头目：本段不另出手；回合末统一由头目处决演出（无论谁先打满失衡）
  if (enemyObj.canExecutePlayer && p.broken && playerHpAtEnemyPhaseStart > 0) {
    return out;
  }

  /** @type {EnemyIntent} */
  let effectiveIntent = intent;

  // 快攻打断重击：仅针对被选为目标且本回合为重击的敌人
  if (playerAction === "attack" && targetId === enemyObj.id && intent === "heavy") {
    const interrupt =
      resolutionRng && typeof resolutionRng.attackVsHeavyTargetInterrupt === "boolean"
        ? resolutionRng.attackVsHeavyTargetInterrupt
        : Math.random() < INTERRUPT_QUICK_VS_HEAVY;
    if (interrupt) {
      effectiveIntent = "quick";
      state._attackInterruptedHeavyTargetId = enemyObj.id;
      out.notes.push(`你的快攻打断了${e.name}的重击：其本回合按快攻结算。`);
      if (state.perks?.includes("perk_interrupt_next_quick")) state._interruptNextQuickBonusPending = true;
    }
  }
  out.effectiveIntent = effectiveIntent;

  // 调整：回血并降低失衡（不进攻）
  if (effectiveIntent === "adjust") {
    const healed = applyHeal(e, ns(1));
    const stgBefore = e.stagger;
    changeStagger(e, -1);
    const stgReduced = stgBefore - e.stagger;
    if (healed > 0 || stgReduced > 0) {
      out.notes.push(
        `调整：${e.name}${healed > 0 ? ` {g}HP+${healed}{/g}` : ""}${stgReduced > 0 ? ` {g}失衡-${stgReduced}{/g}` : ""}。`,
      );
    } else {
      out.notes.push(`调整：${e.name}稳住呼吸与步伐。`);
    }
    return out;
  }
  // 敌方盾反：本回合不进攻（用于反制我方重击）
  if (effectiveIntent === "block") {
    if (playerAction === "block" && !blockFailedThisTurn) {
      out.notes.push(`你对${e.name}盾反挥空（对方以待重击反制，本段无来袭）。`);
    } else {
      out.notes.push(`盾反：${e.name}试图反制你的重击。`);
    }
    return out;
  }

  // 防御：本回合基础减伤 1、失衡减免 1（对每次来袭都生效）；无 DEF 常驻面板
  const defending = playerAction === "defend" && !defendFailedThisTurn;

  // 盾反：不选目标，视为尝试拦截两次来袭（分别判定成败）
  const blockingThisEnemy = playerAction === "block" && !blockFailedThisTurn;

  if (blockingThisEnemy) {
    if (effectiveIntent === "heavy") {
      out.pDmg = 0;
      out.pStg = 0;
      out.meritMitigatedHp = (e.strikeBase || ns(2)) + ENEMY_STRIKE_HEAVY_EXTRA_DAMAGE;
      addStagger(e, 2);
      if (state.perks?.includes("perk_guardshock")) {
        addStagger(e, 1);
        out.notes.push("稳守反震：盾反成功时敌方额外失衡 +1。");
      }
      // T05 借力反震：在敌方阶段结束后按 blockSuccessCount 统一结算（见 applyBlockReliefPerkAfterEnemyPhase）
      out.blockSuccess = true;
      out.notes.push(
        `你成功盾反${e.name}的重击：其失衡 +2。`,
      );
      return out;
    }
    if (effectiveIntent === "quick") {
      out.notes.push(`你对${e.name}盾反被破（对快攻）：被抢先命中。`);
      const base = e.strikeBase || ns(2);
      let dmg = base;
      let stg = ENEMY_STRIKE_QUICK_STAGGER_TO_PLAYER + ENEMY_BLOCK_FAIL_EXTRA_STAGGER;
      let defendStaggerReduced = 0;
      if (defending) {
        const beforeStg = stg;
        const extraMit = state.player?.defendMitigationBonus || 0;
    dmg = Math.max(0, dmg - ns(1 + extraMit));
    if ((state._restDefendBonusCharges || 0) > 0) {
      dmg = Math.max(0, dmg - ns(1));
      state._restDefendBonusCharges = 0;
      out.notes.push(`凝神守气：调息余韵仍在，本次承伤额外 -${ns(1)}。`);
    }
    // T21：破绽状态下使用防御时，额外减伤 +1（仅减伤害，不减失衡）
    if (state.perks?.includes("perk_broken_defend_bonus") && p.broken && dmg > 0) {
      dmg = Math.max(0, dmg - ns(1));
      out.notes.push(`破绽强守：破绽中防御额外减伤 -${ns(1)}。`);
    }
        stg = Math.max(0, stg - 1);
        defendStaggerReduced = beforeStg - stg;
        out.notes.push(`防御：本回合受到伤害 -${ns(1 + extraMit)}，受到失衡 -1。`);
      }
      // 护势已取消：不再触发“护势为 0 额外失衡”
      out.pDmg = applyDamage(p, dmg);
      out.pStg = addStagger(p, stg, state);
      out.gotHit = out.pDmg > 0 || out.pStg > 0;
      out.effectiveIntent = effectiveIntent;
      return out;
    }
    out.notes.push(`你对${e.name}盾反挥空（对方非重击）。`);
    return out;
  }

  // 敌人攻击结算
  if (effectiveIntent === "quick" || effectiveIntent === "heavy") {
    // 调息回合：受快攻/重击时概率完全闪避（免伤、免失衡）；技法「听风卸势」提高概率
    if (playerAction === "rest") {
      const evadeP = state.perks?.includes("perk_rest_evade") ? 0.7 : 0.3;
      const preset = resolutionRng?.restEvadeByEnemyId && Object.prototype.hasOwnProperty.call(resolutionRng.restEvadeByEnemyId, enemyObj.id);
      const evadeOk = preset ? resolutionRng.restEvadeByEnemyId[enemyObj.id] : Math.random() < evadeP;
      if (evadeOk) {
        out.restEvade = true;
        if (state.battleBuffs) state.battleBuffs.restEvadeActive = true;
        {
          const base0 = e.strikeBase || ns(2);
          const wouldDmg = effectiveIntent === "quick" ? base0 : base0 + ENEMY_STRIKE_HEAVY_EXTRA_DAMAGE;
          out.meritMitigatedHp = (out.meritMitigatedHp || 0) + wouldDmg;
        }
        out.notes.push(
          state.perks?.includes("perk_rest_evade")
            ? `{g}听风卸势：调息中完全闪避${e.name}的来招（免伤）。{/g}`
            : `{g}调息闪避：你闪开${e.name}的来招（免伤）。{/g}`,
        );
        return out;
      }
    }

    const base = e.strikeBase || ns(2);
    let dmg = effectiveIntent === "quick" ? base : base + ENEMY_STRIKE_HEAVY_EXTRA_DAMAGE;
    let stg =
      effectiveIntent === "quick" ? ENEMY_STRIKE_QUICK_STAGGER_TO_PLAYER : ENEMY_STRIKE_HEAVY_STAGGER_TO_PLAYER;

    // 护势已取消：防御不再有“被压护势”的额外判定

    let defendStaggerReduced = 0;
    if (defending) {
      const beforeStg = stg;
      const extraMit = state.player?.defendMitigationBonus || 0;
      const beforeDmg = dmg;
      dmg = Math.max(0, dmg - ns(1 + extraMit));
      if ((state._restDefendBonusCharges || 0) > 0) {
        dmg = Math.max(0, dmg - ns(1));
        state._restDefendBonusCharges = 0;
        out.notes.push(`凝神守气：调息余韵仍在，本次承伤额外 -${ns(1)}。`);
      }
      out.meritMitigatedHp += Math.max(0, beforeDmg - dmg);
      stg = Math.max(0, stg - 1);
      defendStaggerReduced = beforeStg - stg;
      out.notes.push(`防御：本回合受到伤害 -${ns(1 + extraMit)}，受到失衡 -1。`);
    }

    // 护势已取消：不再触发“护势为 0 额外失衡”

    // v0.3：无 DEF 常驻面板；只有“防御时额外减伤”在 defending 内生效
    // T07：进入破绽后，首次受到的伤害 -1（仅减伤害，不减失衡）
    if (state.perks?.includes("perk_brokenfirstshield") && p.broken && state.brokenFirstShieldCharges > 0 && dmg > 0) {
      const beforeBr = dmg;
      dmg = Math.max(0, dmg - ns(1));
      out.meritMitigatedHp += Math.max(0, beforeBr - dmg);
      state.brokenFirstShieldCharges = 0;
      out.notes.push(`硬撑架势：破绽后首次受击伤害 -${ns(1)}。`);
    }
    out.pDmg = applyDamage(p, dmg);
    out.pStg = addStagger(p, stg, state);
    out.gotHit = out.pDmg > 0 || out.pStg > 0;
    out.effectiveIntent = effectiveIntent;

    // v0.1：不再有“防御到 0 伤害反震”的技法卡
  }

  return out;
}

/** 战报/提示用回合号（历史存档或旧局可能仍有半回合小数，仍做展示兼容） */
function formatBattleTurnNumber(gt) {
  const n = typeof gt === "number" && !Number.isNaN(gt) ? gt : Number(gt) || 1;
  if (Number.isInteger(n)) return String(n);
  const h = Math.round(n * 2) / 2;
  return Number.isInteger(h) ? String(h) : h.toFixed(1).replace(/\.0$/, "");
}

/** 玩家行动结束后推进回合钟：处决为追加收束，不计入回合，也不推进调息/侦察倒计时 */
function advanceBattleTurnAfterPlayerAction(state, action, opts = {}) {
  if (opts.skipTurnClockAdvance) return;
  if (action === "execute") return;
  state.globalTurn += 1;
  if ((state.player.restCooldownLeft || 0) > 0) state.player.restCooldownLeft -= 1;
  if (action === "rest") state.player.restCooldownLeft = REST_COOLDOWN_TURNS;
  if (state.battleBuffs?.scoutTurnsLeft > 0) state.battleBuffs.scoutTurnsLeft -= 1;
}

function formatLineForTurn(state, playerAction, targetId, intents, details) {
  const parts = [];
  const aMap = {
    attack: "快攻",
    heavy: "重击",
    defend: "防御",
    block: "盾反",
    execute: "处决",
    rest: "调息",
  };
  const tMap = { A: "甲", B: "乙", C: "丙" };
  const targetLabel = targetId ? tMap[targetId] : "—";
  const intentLabel = (eo, raw) => {
    if (!eo) return "—";
    if (eo.waitingToEnter) return "未上场";
    if (eo.fighter.hp <= 0) return "—";
    if (eo.fighter.broken) return "破绽";
    return intentNameForEnemy(eo, raw);
  };
  const intentBits = state.enemies
    .map((eo) => `${tMap[eo.id] || eo.id}=${intentLabel(eo, intents[eo.id])}`)
    .join(" ");
  parts.push(
    `回合 ${formatBattleTurnNumber(state.globalTurn)}｜你：${aMap[playerAction]}${targetId ? `（目标：${targetLabel}）` : ""}｜意图：${intentBits}`,
  );

  const d = [];
  if (details) {
    for (const line of details) d.push(line);
  }
  if (d.length) parts.push(d.join(" "));
  return parts.join("\n");
}

/**
 * 各行动键下方的数值说明（与 applyPlayerToEnemy / resolveEnemyAgainstPlayer / 调息 等逻辑对齐）
 * 含 HTML：多条加成时首条金色、其后橙色（.action-effect-bonus / .action-effect-bonus--t2）
 * @returns {{ attack: string, heavy: string, defend: string, block: string, rest: string }}
 */
function buildActionButtonEffectHints(state) {
  const p = state.perks || [];
  const br = !!state.battleBuffs?.breaklineReady;
  const pct = Math.round(INTERRUPT_QUICK_VS_HEAVY * 100);
  const broken = !!state.player?.broken;
  const atkB = state.player?.atkBonus || 0;
  const defB = state.player?.defendMitigationBonus || 0;
  const heavyStgB = state.player?.heavyStgBonus || 0;
  const execHeal = state.player?.executeHealBonus || 0;

  const attackLines = [
    `对目标：${hintShangWithAtkHighlight(2, atkB)}｜敌失衡+1`,
    `敌若防御意图：伤−${ns(2)}、失衡−1`,
    `目标是重击时${pct}%打断，该敌本回按快攻结算`,
  ];
  if (broken) attackLines.push("破绽中：快攻不可用");
  let aHi = 0;
  if (state._breakDefenseFollowupPending) {
    attackLines.push(hintBonusTier(`逼守抢口：下回合首次快攻额外伤害 +${ns(1)}`, aHi++));
  }
  if (state._noDamageNextAttackPending) {
    attackLines.push(hintBonusTier(`以守待变：下回合首次快攻额外伤害 +${ns(1)}`, aHi++));
  }
  if (p.includes("perk_staggerstrike"))
    attackLines.push(hintBonusTier(`夺命追击：快攻命中失衡值不为 0 的目标时伤害 +${ns(1)}`, aHi++));
  if (p.includes("perk_attackvsadjust")) attackLines.push(hintBonusTier("乘势压攻：敌调整时攻击失衡 +1", aHi++));
  if (p.includes("perk_kill_next_attack"))
    attackLines.push(hintBonusTier(`夺势突进：战斗开始后首次快攻伤害 +${ns(1)}`, aHi++));
  if (p.includes("perk_follow_attack")) attackLines.push(hintBonusTier("追身快斩：快攻命中非防御意图目标，失衡 +1", aHi++));
  if (p.includes("perk_interrupt_bonus")) attackLines.push(hintBonusTier("截锋断势：快攻打断重击成功，失衡 +1", aHi++));
  if (p.includes("perk_attack_vs_broken"))
    attackLines.push(hintBonusTier("乘隙追命：对失衡未破绽目标快攻额外失衡 +1", aHi++));
  if (p.includes("perk_kill_reduce_stagger")) attackLines.push(hintBonusTier("斩阵夺势：击杀敌人后，自身失衡 -1", aHi++));
  const wrapLead = (html) => {
    const i = html.indexOf("<br>");
    if (i === -1) return `<span class="action-effect-lead">${html}</span>`;
    const head = html.slice(0, i);
    const tail = html.slice(i);
    return `<span class="action-effect-lead">${head}</span>${tail}`;
  };
  const attack = wrapLead(attackLines.join("<br>"));

  let heavyHi = 0;
  let heavyLine0 = `对目标：${hintShangWithAtkHighlight(3, atkB)}｜敌失衡+${2 + (p.includes("perk_armorbreak") ? 1 : 0) + heavyStgB}`;
  const heavyLines = [heavyLine0, `敌防御：伤−${ns(2)}｜失衡先−1再+压制1`];
  if (p.includes("perk_armorbreak")) heavyLines.push(hintBonusTier("破甲发力：重击额外 +1 失衡", heavyHi++));
  if (p.includes("perk_heavybreakdef")) heavyLines.push(hintBonusTier(`断势重斩：对防御目标重击伤害 +${ns(1)}`, heavyHi++));
  if (p.includes("perk_heavy_vs_staggered"))
    heavyLines.push(hintBonusTier(`断脉沉击：重击命中失衡目标伤害 +${ns(1)}`, heavyHi++));
  if (p.includes("perk_attack_vs_broken"))
    heavyLines.push(hintBonusTier("乘隙追命：对失衡未破绽目标重击额外失衡 +1", heavyHi++));
  if (br) heavyLines.push(hintBonusTier(`破阵：下一次重击额外+伤${ns(1)}、+失衡1`, heavyHi++));
  heavyLines.push(`场上有敌快攻意图时，你出重击也可能${pct}%被打断并改快攻结算`);
  if (broken) heavyLines.push("破绽中：重击不可用");
  if (p.includes("perk_kill_reduce_stagger")) heavyLines.push(hintBonusTier("斩阵夺势：击杀敌人后，自身失衡 -1", heavyHi++));
  const heavy = wrapLead(heavyLines.join("<br>"));

  const defendLines = [`被攻击：受伤-${ns(1)}，失衡-1`];
  defendLines.push("若本回合未受伤：回合末失衡+1");
  if (defB > 0) defendLines.push(hintBonusTier(`防御成长：防御时额外减伤 +${ns(defB)}`, 0));
  if (p.includes("perk_brokenfirstshield")) defendLines.push(hintBonusTier(`硬撑架势：破绽后首次受击伤害 -${ns(1)}`, 0));
  if (p.includes("perk_broken_defend_bonus"))
    defendLines.push(hintBonusTier(`破绽强守：破绽中防御额外减伤 -${ns(1)}`, 0));
  let dHi = 0;
  if (p.includes("perk_defend_relief")) defendLines.push(hintBonusTier("定步卸力：防御成功承伤后，自身失衡 -1", dHi++));
  if (p.includes("perk_lowhp_defend_heal"))
    defendLines.push(hintBonusTier(`危桥守命：低血且防御成功时 HP+${ns(1)}`, dHi++));
  const defend = wrapLead(defendLines.join("<br>"));

  let blockFirst = "对重击成功：敌失衡+2";
  if (p.includes("perk_guardshock")) {
    blockFirst = `对重击成功：${hintBonusTier("敌失衡+3（稳守反震较基础+1）", 0)}`;
  }
  const blockLines = [
    blockFirst,
    `对快攻：盾反失败，约伤${ns(2)}｜失衡+2`,
    "敌非重击（防御/盾反/调息）：盾反挥空",
  ];
  if (p.includes("perk_blockrelief")) blockLines.push(hintBonusTier("借力反震：盾反成功几次，失衡减几次", 0));
  if (p.includes("perk_block_heal")) blockLines.push(hintBonusTier(`盾后回气：盾反成功后 HP+${ns(1)}`, 0));
  blockLines.push("若未受伤，盾反成功会让自己失衡+1（可叠加）");
  const block = wrapLead(blockLines.join("<br>"));

  const restCd = state.player?.restCooldownLeft || 0;
  let rest;
  if (restCd > 0) {
    rest = wrapLead(`冷却中：${restCd} 回合后可再次调息`);
  } else {
    const evPct = p.includes("perk_rest_evade") ? 70 : 30;
    const restCore = [
      `HP+20｜失衡−1`,
      `使用后 ${REST_COOLDOWN_TURNS} 回合冷却`,
      `本回合受快攻/重击：${evPct === 70 ? `<span class="action-effect-bonus">${evPct}%</span>` : `${evPct}%`} 完全闪避（免伤）`,
    ].join("<br>");
    /** 三条均为默认机制，整段用 lead 白字；勿用 wrapLead 拆行，否则后续行会落回 .action-effect 的 muted 色 */
    const extras = [];
    let rHi = 0;
    if (p.includes("perk_rest_extra_stagger_down")) {
      extras.push(hintBonusTier("静息归元：调息成功（本回合未受伤），额外失衡 -1", rHi++));
    }
    if (execHeal > 0) {
      extras.push(hintBonusTier(`处决回血：+${execHeal}`, rHi++));
    }
    rest =
      extras.length > 0
        ? `<span class="action-effect-lead">${restCore}</span><br>${extras.join("<br>")}`
        : `<span class="action-effect-lead">${restCore}</span>`;
  }

  return { attack, heavy, defend, block, rest };
}

/** 与 index.html 卡面处决按钮文案一致 */
const LABEL_EXECUTE_ON_CARD = "失衡已满！上前处决！";

/**
 * 各按键的强化来源列表（用于 +1/+2… 后缀与悬浮说明；同键多条来源即叠层）
 * @returns {{ attack: string[], heavy: string[], defend: string[], block: string[], rest: string[], execute: string[] }}
 */
function getActionEnhancementSources(state) {
  const p = state.perks || [];
  const br = !!state.battleBuffs?.breaklineReady;
  /** @param {string[]} arr @param {string} key */
  const add = (arr, key) => {
    if (!arr.includes(key)) arr.push(key);
  };
  const attack = [];
  if (p.includes("perk_staggerstrike")) add(attack, "staggerstrike");
  if (p.includes("perk_attackvsadjust")) add(attack, "attackvsadjust");
  if (p.includes("perk_kill_next_attack")) add(attack, "kill_next_attack");
  if (p.includes("perk_follow_attack")) add(attack, "follow_attack");
  if (p.includes("perk_interrupt_bonus")) add(attack, "interrupt_bonus");
  if (p.includes("perk_attack_vs_broken")) add(attack, "attack_vs_broken");
  if (p.includes("perk_kill_reduce_stagger")) add(attack, "kill_reduce_stagger");
  if (state._breakDefenseFollowupPending) add(attack, "break_defense_followup_pending");
  if (state._noDamageNextAttackPending) add(attack, "no_damage_next_attack_pending");
  const heavy = [];
  if (p.includes("perk_armorbreak")) add(heavy, "armorbreak");
  if (p.includes("perk_heavybreakdef")) add(heavy, "heavybreakdef");
  if (br) add(heavy, "breakline");
  if ((state.player?.heavyStgBonus || 0) > 0) add(heavy, "equip_heavystg");
  if ((state.player?.atkBonus || 0) > 0) {
    add(attack, "atkstat");
    add(heavy, "atkstat");
  }
  if (p.includes("perk_heavy_vs_staggered")) add(heavy, "heavy_vs_staggered");
  if (p.includes("perk_attack_vs_broken")) add(heavy, "attack_vs_broken");
  if (p.includes("perk_kill_reduce_stagger")) add(heavy, "kill_reduce_stagger");
  const defend = [];
  if (p.includes("perk_brokenfirstshield")) add(defend, "brokenfirstshield");
  if ((state.player?.defendMitigationBonus || 0) > 0) add(defend, "defstat");
  if (p.includes("perk_broken_defend_bonus")) add(defend, "broken_defend_bonus");
  if (p.includes("perk_defend_relief")) add(defend, "defend_relief");
  if (p.includes("perk_lowhp_defend_heal")) add(defend, "lowhp_defend_heal");
  const block = [];
  if (p.includes("perk_guardshock")) add(block, "guardshock");
  if (p.includes("perk_blockrelief")) add(block, "blockrelief");
  if (p.includes("perk_block_heal")) add(block, "block_heal");
  const rest = [];
  if ((state.player?.executeHealBonus || 0) > 0) add(rest, "executeheal");
  if (p.includes("perk_rest_evade")) add(rest, "rest_evade");
  if (p.includes("perk_rest_extra_stagger_down")) add(rest, "rest_extra_stagger_down");
  const execute = [];
  if ((state.player?.executeHealBonus || 0) > 0) add(execute, "executeheal");
  return { attack, heavy, defend, block, rest, execute };
}

function intentCategoryClass(intent) {
  if (intent === "quick") return "intent-quick";
  if (intent === "heavy") return "intent-heavy";
  if (intent === "defend") return "intent-defend";
  if (intent === "block") return "intent-block";
  if (intent === "adjust") return "intent-rest";
  return "";
}

/** 对拼层：破绽敌人不展示原意图；若我方同时破绽（dual_broken），敌方显示「击溃」而非「破绽」 */
function resolutionEnemyCapsuleText(state, enemyRow) {
  if (!enemyRow) return "";
  const eo = state.enemies.find((e) => e.id === enemyRow.id);
  if (eo?.fighter?.broken) {
    if (state.player?.broken) return "击溃";
    return "破绽";
  }
  return intentNameForEnemy({ intent: enemyRow.intent }, enemyRow.intent);
}

function resolutionEnemyCapsuleClass(state, enemyRow) {
  if (!enemyRow) return "";
  const eo = state.enemies.find((e) => e.id === enemyRow.id);
  if (eo?.fighter?.broken) {
    if (state.player?.broken) return "intent-rout";
    return "intent-broken";
  }
  return intentCategoryClass(enemyRow.intent);
}

const ACTION_CLASH_LABELS = {
  attack: "快攻",
  heavy: "重击",
  defend: "防御",
  block: "盾反",
  rest: "调息",
  execute: "处决",
};

function playerClashChipClass(action) {
  if (action === "attack") return "battle-clash-chip--quick";
  if (action === "heavy") return "battle-clash-chip--heavy";
  if (action === "defend") return "battle-clash-chip--defend";
  if (action === "block") return "battle-clash-chip--block";
  if (action === "rest") return "battle-clash-chip--rest";
  return "battle-clash-chip--execute";
}

/** 多段对拼里「我」用中性样式，与具体招式胶囊区分 */
function resolutionPlayerChipClass(playerChipKey) {
  /** 调息回合对撞：本段无「出手意图」，仅占位（与敌意图对撞） */
  if (playerChipKey === "none") return "battle-clash-chip--none";
  if (playerChipKey === "neutral") return "battle-clash-chip--neutral-intent";
  if (playerChipKey === "me") return "battle-clash-chip--me";
  if (playerChipKey === "broken") return "intent-broken";
  return playerClashChipClass(playerChipKey);
}

/**
 * 对撞层我方胶囊：破绽分档——仅我方破绽且该敌未破绽为状态2；双方均破绽（dual_broken）为状态3。
 * brokenTier 仅用于对撞样式，不改变战报等其他「破绽」文案。
 */
function resolutionPlayerCapsuleForSegment(state, pa, outcomeType, enemyRow) {
  if (outcomeType === "dual_broken") {
    return { playerText: "破绽", playerChipKey: "broken", brokenTier: 3 };
  }
  if (pa === "rest") {
    return { playerText: "", playerChipKey: "neutral" };
  }
  const eo = enemyRow && state.enemies.find((e) => e.id === enemyRow.id);
  if (state.player?.broken && eo && !eo.fighter?.broken) {
    return { playerText: "破绽", playerChipKey: "broken", brokenTier: 2 };
  }
  return { playerText: ACTION_CLASH_LABELS[pa] || "动作", playerChipKey: pa };
}

/** 第一段：双方胶囊飞入 + 碰撞爆点（ms） */
const RESOLUTION_CLASH_PHASE_MS = 580;
/** 第二段：结果大字弹出 + 停留（ms） */
const RESOLUTION_RESULT_PHASE_MS = 520;
/**
 * 多段结算大字阶梯：第 n 档比第 n-1 档字更大、弹跳更长（.resolution-label--step-1/2/3）。
 * 用于：互换→先手！→击杀！、互换→崩了！、命中/打断等→击杀！等所有「多段切字」。
 */
const RESOLUTION_LABEL_STEP1_GAP_MS = 420;
const RESOLUTION_LABEL_STEP2_GAP_MS = 560;
/** 两段式：第二段字出现后再保留（含弹跳），再进卡片 FX */
const RESOLUTION_LABEL_TAIL_AFTER_2STEP_MS = 980;
/** 三段式：第三段字出现后再保留，再进卡片 FX */
const RESOLUTION_LABEL_TAIL_AFTER_3STEP_MS = 1080;
const RESOLUTION_LABEL_PHASE_2STEP_MS =
  RESOLUTION_LABEL_STEP1_GAP_MS + RESOLUTION_LABEL_TAIL_AFTER_2STEP_MS;
const RESOLUTION_LABEL_PHASE_3STEP_MS =
  RESOLUTION_LABEL_STEP1_GAP_MS + RESOLUTION_LABEL_STEP2_GAP_MS + RESOLUTION_LABEL_TAIL_AFTER_3STEP_MS;
/** 第三段：卡片结果动画（每段总时长下限，与单卡多特效串行叠加） */
const CARD_FX_PHASE_MS = 420;
/** 调息：绿光同帧已结算 HP/失衡；本延迟用于与对撞层错开（约 ≥ 绿光主段以免抢镜） */
const REST_RESOLUTION_LEAD_MS = 1040;
/** 单条卡片特效清理前等待（ms） */
const CARD_FX_EVENT_MS = 360;

let resolutionAnimTimer = null;
let resolutionPhase2Timer = null;
let resolutionFirstStrikeTimer = null;
let resolutionAnimResolve = null;

const OUTCOME_LABEL = {
  hit: "命中",
  trade: "互换",
  /** 你本回合主攻他人，该敌人仍快攻/重击打到你——单方侧袭，非互换 */
  flanked: "侧袭",
  /** 快攻/重击对攻且双方本回合均产生 HP 伤害 */
  blood_trade: "换血",
  /** 我方重击因场上快攻被压招，本段改按快攻结算；与多段动画里「对打断者」段共用「被打断」文案 */
  beat_interrupted: "被打断",
  blocked: "防住",
  /** 我方防御时仍被扣 HP（防守方视角） */
  mitigated: "承伤",
  /** 我方进攻时对方防御/减伤仍被打穿血量（玩家视角，非「承伤」） */
  press_defense: "压制",
  counter_block: "反制",
  /** 盾反对快攻：被抢先命中（有伤或失衡），非「挥空」 */
  block_punished: "被破",
  /** 本段双方都处破绽：意图不交锋，回合末各自解除破绽 */
  dual_broken: "各自休整",
  interrupted: "打断",
  /** 盾反对防御/盾反/调息等非重击来袭：未反制、未掉血 */
  whiff: "挥空",
  rest_safe: "调息",
  execute: "处决",
  none: "",
};

/** 对撞层第二段大字：与 bundle 内 label 分离；dual_broken 在此仅用「我方破绽」表述 */
function resolutionPrimaryOutcomeLabel(outcome) {
  if (outcome === "dual_broken") return "我方破绽·敌溃";
  return OUTCOME_LABEL[outcome] || "";
}

function outcomeCssClass(outcomeType) {
  if (outcomeType === "counter_block") return "counter";
  if (outcomeType === "rest_safe") return "rest";
  if (outcomeType === "beat_interrupted") return "interrupted";
  if (outcomeType === "block_punished") return "flanked";
  if (outcomeType === "dual_broken") return "dual_broken";
  return outcomeType || "none";
}

function sleepMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * slashKind：仅 fx==="slash" 或 rest_break 带刀光时有效
 * — quick / quick_def：🗡；heavy / heavy_def：🔨；*_def 为穿透防御仍造成伤害（断裂表现）
 * @typedef {{ target: "player"|"A"|"B"|"C", fx: string, hpDelta: number, staggerDelta: number, strong: boolean, slashKind?: "quick"|"quick_def"|"heavy"|"heavy_def" }} CardFxEvent
 */

const CARD_FX_PRIORITY = {
  execute: 100,
  parry: 95,
  break: 90,
  /** 调息完全闪避：与结算共用 RNG，优先于同段侧袭受击 */
  rest_evade: 58,
  rest_break: 55,
  slash: 50,
  shield_full: 50,
  shield_chip: 50,
  rest: 45,
  stagger_up: 25,
  whiff: 10,
};

function sortCardFxEvents(events) {
  return events.slice().sort((a, b) => (CARD_FX_PRIORITY[b.fx] || 0) - (CARD_FX_PRIORITY[a.fx] || 0));
}

function filterCardFxConflicts(events) {
  const out = [];
  for (const e of events) {
    if (e.fx === "slash" && events.some((x) => x.target === e.target && x.fx === "execute")) continue;
    if (e.fx === "shield_full" && events.some((x) => x.target === e.target && x.fx === "parry")) continue;
    if (e.fx === "whiff" && events.some((x) => x.target === e.target && x.fx === "break")) continue;
    out.push(e);
  }
  return out;
}

function getCardFxEls(ui, target) {
  if (target === "player")
    return { card: ui.playerCard, layer: ui.playerCardFxLayer, token: ui.playerCardFxToken };
  const map = {
    A: { card: ui.enemyCardA, layer: ui.enemyCardFxLayerA, token: ui.enemyCardFxTokenA },
    B: { card: ui.enemyCardB, layer: ui.enemyCardFxLayerB, token: ui.enemyCardFxTokenB },
    C: { card: ui.enemyCardC, layer: ui.enemyCardFxLayerC, token: ui.enemyCardFxTokenC },
  };
  return map[target] || null;
}

/** 穿透防御仍伤：同一 emoji 裁左右两半并错位，形成明显断口（非单层模糊线） */
function brokenSlashTokenHtml(emoji) {
  return `<span class="slash-token-split" aria-hidden="true"><span class="slash-token-split__half slash-token-split__half--a">${emoji}</span><span class="slash-token-split__half slash-token-split__half--b">${emoji}</span></span>`;
}

function applySlashTokenFromEvent(layer, token, card, ev) {
  const sk = ev.slashKind || "quick";
  layer.classList.add("card-fx--slash");
  if (ev.target === "player") layer.classList.add("card-fx--player-hit");
  if (token) {
    const emoji = sk === "heavy" || sk === "heavy_def" ? "🔨" : "🗡";
    const isBroken = sk === "quick_def" || sk === "heavy_def";
    if (isBroken) {
      token.innerHTML = brokenSlashTokenHtml(emoji);
    } else {
      token.textContent = emoji;
    }
    let cls = "card-fx-token card-fx--slash-token";
    if (sk === "heavy" || sk === "heavy_def") cls += " card-fx--slash-token--heavy";
    if (sk === "heavy_def") cls += " card-fx--slash-token--heavy-broken";
    if (sk === "quick_def") cls += " card-fx--slash-token--quick-broken";
    token.className = cls;
  }
  card?.classList.add(ev.strong ? "card-fx-shake-strong" : "card-fx-shake-only");
}

function clearCardFxElements(ui, target) {
  const els = getCardFxEls(ui, target);
  if (!els?.layer) return;
  els.layer.className = "card-fx-layer";
  els.token.className = "card-fx-token";
  if (els.token) els.token.textContent = "";
  els.card?.classList.remove(
    "hit-shake",
    "card-fx-shake-only",
    "card-fx-shake-strong",
    "card-fx-active",
    "rest-evade-fx-sway",
  );
}

/**
 * 卡片结果动画：仅挂 class，不改 HP/失衡（真实变化仍在 commit 后）。
 * @param {any} ui
 * @param {CardFxEvent} ev
 */
function applyCardFxEvent(ui, ev) {
  const els = getCardFxEls(ui, ev.target);
  if (!els?.layer) return;
  const { card, layer, token } = els;
  clearCardFxElements(ui, ev.target);
  void card?.offsetWidth;
  layer.classList.add("card-fx-active");
  if (ev.strong) layer.classList.add("card-fx--strong");

  const fx = ev.fx;
  if (fx === "slash") {
    applySlashTokenFromEvent(layer, token, card, ev);
    /* 仅一层刀光在 .card-fx-layer；卡片本体只做位移动画，勿用 .hit-shake（其 ::after 会再画一道） */
  } else if (fx === "shield_full") {
    layer.classList.add("card-fx--shield-full");
  } else if (fx === "shield_chip") {
    layer.classList.add("card-fx--shield-chip");
  } else if (fx === "parry") {
    layer.classList.add("card-fx--parry");
  } else if (fx === "rest_evade") {
    layer.classList.add("card-fx--rest-evade");
    if (token) {
      token.classList.add("card-fx--rest-evade-token");
      token.textContent = "闪";
    }
    card?.classList.add("rest-evade-fx-sway");
  } else if (fx === "rest") {
    layer.classList.add("card-fx--rest");
    if (token) {
      token.classList.add("card-fx--rest-token");
      token.textContent = "气";
    }
    ui.restFxOverlay?.classList.add("rest-fx-overlay--animate");
    ui.playerCard?.classList.add("rest-fx-play");
  } else if (fx === "rest_break") {
    layer.classList.add("card-fx--rest-break");
    if (ev.hpDelta > 0) {
      applySlashTokenFromEvent(layer, token, card, {
        target: "player",
        fx: "slash",
        hpDelta: ev.hpDelta,
        staggerDelta: 0,
        strong: false,
        slashKind: ev.slashKind || "quick",
      });
    }
  } else if (fx === "stagger_up") {
    layer.classList.add("card-fx--stagger-up");
    card?.classList.add("card-fx-shake-only");
  } else if (fx === "break") {
    layer.classList.add("card-fx--break");
    card?.classList.add("card-fx-shake-only");
  } else if (fx === "whiff") {
    if (token) {
      token.classList.add("card-fx--whiff-token");
      token.textContent = "×";
    }
    card?.classList.add("card-fx-shake-only");
  } else if (fx === "execute") {
    layer.classList.add("card-fx--execute");
    card?.classList.add("card-fx-shake-strong");
  }
}

function applyCardFxEventCleanup(ui, ev) {
  clearCardFxElements(ui, ev.target);
  if (ev.fx === "rest") {
    ui.restFxOverlay?.classList.remove("rest-fx-overlay--animate");
    ui.playerCard?.classList.remove("rest-fx-play");
  }
}

function applyCardFxEventPromise(ui, ev) {
  applyCardFxEvent(ui, ev);
  return sleepMs(CARD_FX_EVENT_MS).then(() => applyCardFxEventCleanup(ui, ev));
}

async function playCardFxSequence(ui, fxPlan, opts) {
  if (!fxPlan?.length) return;
  const forceFullFx = !!opts?.forceFullFx;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  /** 减少动效时原样跳过全部卡面；调息闪避单独补播，否则 70%/30% 完全无反馈 */
  if (reduce && !forceFullFx) {
    const evadeOnly = fxPlan.filter((e) => e.fx === "rest_evade");
    if (evadeOnly.length) {
      const sortedEv = filterCardFxConflicts(sortCardFxEvents(evadeOnly));
      for (const ev of sortedEv) {
        await applyCardFxEventPromise(ui, ev);
      }
    }
    return;
  }
  const sorted = filterCardFxConflicts(sortCardFxEvents(fxPlan));
  /** @type {Record<string, CardFxEvent[]>} */
  const by = {};
  for (const e of sorted) {
    by[e.target] = by[e.target] || [];
    by[e.target].push(e);
  }
  const t0 = performance.now();
  await Promise.all(
    Object.entries(by).map(([, chain]) =>
      chain.reduce((p, ev) => p.then(() => applyCardFxEventPromise(ui, ev)), Promise.resolve()),
    ),
  );
  const dt = performance.now() - t0;
  if (dt < CARD_FX_PHASE_MS) await sleepMs(CARD_FX_PHASE_MS - dt);
}

function wouldBreakAfterStaggerGain(f, add) {
  if (!f || add <= 0) return false;
  const next = clamp(f.stagger + add, 0, f.staggerThreshold);
  return !f.broken && next >= f.staggerThreshold;
}

/**
 * 本段对拼中，玩家对 segment 对应敌人造成的 HP 伤害预览（与 buildCardFxPlayerVsEnemySegment 一致）。
 * 仅主攻目标受快攻/重击直伤；非目标敌人段恒为 0。
 */
function previewPlayerDealHpToEnemyForSegment(state, bundle, segment) {
  const rng = state._turnRng;
  const pa = bundle.playerAction;
  const tid = bundle.targetId;
  const o = segment.outcome;
  const eo = segment.enemyRow ? state.enemies.find((x) => x.id === segment.enemyRow.id) : null;
  if (!eo || eo.waitingToEnter || eo.fighter.hp <= 0) return 0;
  if (!tid || eo.id !== tid) return 0;
  if (o === "interrupted") {
    return previewRawEnemyHpDamageFromPlayer(state, eo, "attack", tid, rng);
  }
  if (o === "hit" || o === "blood_trade" || o === "press_defense") {
    return previewRawEnemyHpDamageFromPlayer(state, eo, pa, tid, rng);
  }
  return 0;
}

/** 本段是否会把当前目标敌人 HP 清零（决胜一击，用于强制播卡片特效） */
function isSegmentEnemyKillingBlow(state, bundle, segment) {
  const eo = segment.enemyRow ? state.enemies.find((x) => x.id === segment.enemyRow.id) : null;
  if (!eo) return false;
  const dmg = previewPlayerDealHpToEnemyForSegment(state, bundle, segment);
  return dmg > 0 && dmg >= eo.fighter.hp;
}

/**
 * 系统「减少动效」时跳过整段对撞层，但决胜一击仍应播完卡片刀光/处决式反馈。
 */
async function playLethalSlashFxIfSkippedResolution(state, bundle, ui) {
  const segments = buildResolutionSegments(state, bundle);
  if (!segments.length) return;
  const last = segments[segments.length - 1];
  if (!isSegmentEnemyKillingBlow(state, bundle, last)) return;
  const plan = buildCardFxPlanFromSegment(state, bundle, last);
  await playCardFxSequence(ui, plan, { forceFullFx: true });
}

/**
 * 该段敌人已在破绽时，不应出现「敌袭我」的受击刀光/受击失衡（与 resolveEnemyAgainstPlayer 跳过破绽敌一致）。
 * 作为最终过滤，避免遗漏分支或 bundle 构建瞬间与播片时状态不一致。
 * @param {any} eo
 * @param {CardFxEvent[]} events
 */
function stripPlayerIncomingHitFxWhenEnemyBroken(eo, events) {
  if (!eo?.fighter?.broken || !events?.length) return events;
  return events.filter((ev) => {
    if (ev.target !== "player") return true;
    if (ev.fx === "slash" || ev.fx === "rest_break") return false;
    if (ev.fx === "stagger_up" || ev.fx === "break") return false;
    return true;
  });
}

/**
 * 由对拼 segment 生成卡片特效计划（不改状态）。
 * @returns {CardFxEvent[]}
 */
function buildCardFxPlanFromSegment(state, bundle, segment) {
  if (segment.soloIntro) return [];
  const o = segment.outcome;
  if (o === "none" || !segment.enemyRow) return [];
  if (o === "dual_broken") return [];
  const rng = bundle.resolutionRng || state._turnRng;
  const eo = state.enemies.find((x) => x.id === segment.enemyRow.id);
  if (!eo || eo.waitingToEnter || eo.fighter.hp <= 0) return [];

  const raw =
    segment.playerChipKey === "me" || segment.playerChipKey === "neutral"
      ? buildCardFxEnemyVsPlayerSegment(state, bundle, eo, o, rng)
      : buildCardFxPlayerVsEnemySegment(state, bundle, segment, eo, o, rng);
  return stripPlayerIncomingHitFxWhenEnemyBroken(eo, raw);
}

/**
 * 「我」侧胶囊：该敌人本回合对玩家的交锋结果。
 * @returns {CardFxEvent[]}
 */
function buildCardFxEnemyVsPlayerSegment(state, bundle, eo, o, rng) {
  const pa = bundle.playerAction;
  const tid = bundle.targetId;
  const e = eo.fighter;
  const p = state.player;
  /** @type {CardFxEvent[]} */
  const ev = [];

  if (o === "flanked" || o === "trade") {
    /* 破绽敌本段不来袭：避免仅预览仍带失衡/刀光 */
    if (e.broken) {
      ev.push({ target: "player", fx: "whiff", hpDelta: 0, staggerDelta: 0, strong: false });
      return ev;
    }
    if (pa === "rest" && o === "flanked") {
      const evaded = rng?.restEvadeByEnemyId?.[eo.id];
      if (evaded === true) {
        ev.push({ target: "player", fx: "rest_evade", hpDelta: 0, staggerDelta: 0, strong: false });
        return ev;
      }
      const raw = previewRawDamageToPlayerFromEnemyWhenAttacking(state, eo, "rest", tid, rng);
      if (raw > 0) {
        ev.push({
          target: "player",
          fx: "rest_break",
          hpDelta: raw,
          staggerDelta: 0,
          strong: false,
          slashKind: eo.intent === "heavy" ? "heavy" : "quick",
        });
      } else {
        ev.push({ target: "player", fx: "rest", hpDelta: 0, staggerDelta: 0, strong: false });
      }
      return ev;
    }

    const raw =
      pa === "defend"
        ? previewRawDamageToPlayerWhenDefending(state, eo, rng?.defendFailed)
        : previewRawDamageToPlayerFromEnemyWhenAttacking(state, eo, pa, tid, rng);
    const stgBase =
      eo.intent === "heavy" ? ENEMY_STRIKE_HEAVY_STAGGER_TO_PLAYER : ENEMY_STRIKE_QUICK_STAGGER_TO_PLAYER;
    let stg = stgBase;
    if (pa === "defend" && !rng?.defendFailed) {
      stg = Math.max(0, stg - 1);
    }
    if (raw > 0) {
      const sk = eo.intent === "heavy" ? "heavy" : "quick";
      ev.push({ target: "player", fx: "slash", hpDelta: raw, staggerDelta: 0, strong: sk === "heavy", slashKind: sk });
    }
    if (stg > 0) {
      const br = wouldBreakAfterStaggerGain(p, stg);
      ev.push({
        target: "player",
        fx: "stagger_up",
        hpDelta: 0,
        staggerDelta: stg,
        strong: stg >= 2,
      });
      if (br) ev.push({ target: "player", fx: "break", hpDelta: 0, staggerDelta: 0, strong: true });
    }
    if (o === "trade" && (e.strikeBase || 0) > 0) {
      const ed = previewRawEnemyHpDamageFromPlayer(state, eo, pa, tid, rng);
      if (ed > 0) {
        const sk = pa === "heavy" ? "heavy" : "quick";
        ev.push({
          target: eo.id,
          fx: "slash",
          hpDelta: ed,
          staggerDelta: 0,
          strong: sk === "heavy",
          slashKind: sk,
        });
      }
    }
    return ev;
  }

  if (o === "blocked" && pa === "defend") {
    ev.push({ target: "player", fx: "shield_full", hpDelta: 0, staggerDelta: 0, strong: false });
    return ev;
  }

  if (o === "mitigated") {
    const raw = previewRawDamageToPlayerWhenDefending(state, eo, rng?.defendFailed);
    ev.push({ target: "player", fx: "shield_chip", hpDelta: raw, staggerDelta: 0, strong: false });
    if (raw > 0) {
      const sk = eo.intent === "heavy" ? "heavy_def" : "quick_def";
      ev.push({
        target: "player",
        fx: "slash",
        hpDelta: raw,
        staggerDelta: 0,
        strong: sk === "heavy_def",
        slashKind: sk,
      });
    }
    return ev;
  }

  if (o === "rest_safe") {
    /* 调息绿光已在进入 resolving 前播过，此处不再叠卡片「调息」层 */
    return ev;
  }

  if (o === "whiff") {
    ev.push({ target: "player", fx: "whiff", hpDelta: 0, staggerDelta: 0, strong: false });
    return ev;
  }

  return ev;
}

/**
 * 玩家招式胶囊对当前 enemyRow 的交锋结果。
 * @returns {CardFxEvent[]}
 */
function buildCardFxPlayerVsEnemySegment(state, bundle, segment, eo, o, rng) {
  const pa = bundle.playerAction;
  const tid = bundle.targetId;
  const e = eo.fighter;
  /** @type {CardFxEvent[]} */
  const ev = [];

  if (o === "beat_interrupted") {
    ev.push({ target: "player", fx: "whiff", hpDelta: 0, staggerDelta: 0, strong: false });
    return ev;
  }

  if (o === "hit" || o === "blood_trade") {
    const ed = previewRawEnemyHpDamageFromPlayer(state, eo, pa, tid, rng);
    let stgAdd = pa === "heavy" ? 2 : 1;
    if (state.perks?.includes("perk_armorbreak") && pa === "heavy") stgAdd += 1;
    stgAdd += state.player.heavyStgBonus || 0;
    if (pa === "attack" && state.perks?.includes("perk_staggerstrike") && (e.broken || e.stagger > 0)) {
      /* 仅伤害在 preview 里体现，失衡 +1 略 */
    }
    if (ed > 0) {
      const sk = pa === "heavy" ? "heavy" : "quick";
      ev.push({
        target: eo.id,
        fx: "slash",
        hpDelta: ed,
        staggerDelta: 0,
        strong: sk === "heavy",
        slashKind: sk,
      });
    }
    if (stgAdd > 0) {
      ev.push({ target: eo.id, fx: "stagger_up", hpDelta: 0, staggerDelta: stgAdd, strong: stgAdd >= 2 });
      if (wouldBreakAfterStaggerGain(e, stgAdd))
        ev.push({ target: eo.id, fx: "break", hpDelta: 0, staggerDelta: 0, strong: true });
    }
    /* 先手击杀 / 先手打破绽：对方已倒下或刚进入破绽，本段不对我方结算伤害/失衡；卡片层也不播受击（与真实结算一致） */
    if (o === "blood_trade" && !segment.firstStrikeKill && !segment.tradeEnemyBreak) {
      const pd = previewRawDamageToPlayerFromEnemyWhenAttacking(state, eo, pa, tid, rng);
      /* 仅当预览确有敌方反击伤害时才播我方受击（破绽/未出手时 pd=0，避免误播刀光；且须 bundle.resolutionRng 与 refine 一致） */
      if (pd > 0) {
        const psk = eo.intent === "heavy" ? "heavy" : "quick";
        ev.push({
          target: "player",
          fx: "slash",
          hpDelta: pd,
          staggerDelta: 0,
          strong: psk === "heavy",
          slashKind: psk,
        });
        const pstg =
          eo.intent === "heavy" ? ENEMY_STRIKE_HEAVY_STAGGER_TO_PLAYER : ENEMY_STRIKE_QUICK_STAGGER_TO_PLAYER;
        if (pstg > 0) {
          ev.push({ target: "player", fx: "stagger_up", hpDelta: 0, staggerDelta: pstg, strong: pstg >= 2 });
          if (wouldBreakAfterStaggerGain(state.player, pstg))
            ev.push({ target: "player", fx: "break", hpDelta: 0, staggerDelta: 0, strong: true });
        }
      }
    }
    return ev;
  }

  if (o === "blocked") {
    const isPlayerDefense = pa === "defend" || pa === "block";
    if (isPlayerDefense) {
      ev.push({ target: "player", fx: "shield_full", hpDelta: 0, staggerDelta: 0, strong: false });
    } else {
      ev.push({ target: eo.id, fx: "shield_full", hpDelta: 0, staggerDelta: 0, strong: false });
      ev.push({ target: "player", fx: "whiff", hpDelta: 0, staggerDelta: 0, strong: false });
    }
    return ev;
  }

  if (o === "mitigated") {
    const raw = previewRawDamageToPlayerWhenDefending(state, eo, rng?.defendFailed);
    ev.push({ target: "player", fx: "shield_chip", hpDelta: raw, staggerDelta: 0, strong: false });
    if (raw > 0) {
      const sk = eo.intent === "heavy" ? "heavy_def" : "quick_def";
      ev.push({
        target: "player",
        fx: "slash",
        hpDelta: raw,
        staggerDelta: 0,
        strong: sk === "heavy_def",
        slashKind: sk,
      });
    }
    return ev;
  }

  if (o === "press_defense") {
    const ed = previewRawEnemyHpDamageFromPlayer(state, eo, pa, tid, rng);
    ev.push({ target: eo.id, fx: "shield_chip", hpDelta: ed, staggerDelta: 0, strong: false });
    if (ed > 0) {
      const sk = pa === "heavy" ? "heavy_def" : "quick_def";
      ev.push({
        target: eo.id,
        fx: "slash",
        hpDelta: ed,
        staggerDelta: 0,
        strong: sk === "heavy_def",
        slashKind: sk,
      });
    }
    let stgAdd = pa === "heavy" ? 2 : 1;
    if (state.perks?.includes("perk_armorbreak") && pa === "heavy") stgAdd += 1;
    stgAdd += pa === "heavy" ? state.player.heavyStgBonus || 0 : 0;
    if (eo.intent === "defend") stgAdd = Math.max(1, stgAdd);
    if (stgAdd > 0)
      ev.push({ target: eo.id, fx: "stagger_up", hpDelta: 0, staggerDelta: stgAdd, strong: stgAdd >= 2 });
    return ev;
  }

  if (o === "counter_block") {
    ev.push({ target: "player", fx: "parry", hpDelta: 0, staggerDelta: 0, strong: eo.intent === "heavy" });
    if (eo.intent === "heavy") {
      let stgAdd = 2;
      if (state.perks?.includes("perk_guardshock")) stgAdd += 1;
      ev.push({ target: eo.id, fx: "stagger_up", hpDelta: 0, staggerDelta: stgAdd, strong: stgAdd >= 2 });
      if (wouldBreakAfterStaggerGain(eo.fighter, stgAdd))
        ev.push({ target: eo.id, fx: "break", hpDelta: 0, staggerDelta: 0, strong: true });
    } else {
      ev.push({ target: eo.id, fx: "whiff", hpDelta: 0, staggerDelta: 0, strong: false });
    }
    return ev;
  }

  if (o === "interrupted") {
    ev.push({ target: eo.id, fx: "whiff", hpDelta: 0, staggerDelta: 0, strong: false });
    const ed = previewRawEnemyHpDamageFromPlayer(state, eo, "attack", tid, rng);
    if (ed > 0)
      ev.push({
        target: eo.id,
        fx: "slash",
        hpDelta: ed,
        staggerDelta: 0,
        strong: false,
        slashKind: "quick",
      });
    return ev;
  }

  if (o === "block_punished") {
    if (e.broken) {
      ev.push({ target: "player", fx: "whiff", hpDelta: 0, staggerDelta: 0, strong: false });
      return ev;
    }
    const p = state.player;
    const { raw, stg } = previewRawBlockVsQuickPunishment(state, eo);
    if (raw > 0)
      ev.push({
        target: "player",
        fx: "slash",
        hpDelta: raw,
        staggerDelta: 0,
        strong: false,
        slashKind: "quick",
      });
    if (stg > 0) {
      const br = wouldBreakAfterStaggerGain(p, stg);
      ev.push({
        target: "player",
        fx: "stagger_up",
        hpDelta: 0,
        staggerDelta: stg,
        strong: stg >= 2,
      });
      if (br) ev.push({ target: "player", fx: "break", hpDelta: 0, staggerDelta: 0, strong: true });
    }
    return ev;
  }

  if (o === "whiff") {
    ev.push({ target: "player", fx: "whiff", hpDelta: 0, staggerDelta: 0, strong: false });
    return ev;
  }

  return ev;
}

/**
 * 与结算共用同一组随机数，保证对拼动画与真实结算一致。
 * @returns {{ defendFailed: boolean, blockFailed: boolean, heavyQuickInterruptSuccess: boolean, attackVsHeavyTargetInterrupt: boolean, restEvadeByEnemyId?: Record<string, boolean> }}
 * defendFailed / blockFailed 恒为 false：破绽中防御与盾反不再掷失败率，与结算一致。
 */
function rollTurnResolutionRng(state, action) {
  const evadeP = state.perks?.includes("perk_rest_evade") ? 0.7 : 0.3;
  /** @type {Record<string, boolean> | undefined} */
  let restEvadeByEnemyId;
  if (action === "rest") {
    restEvadeByEnemyId = {};
    for (const eo of state.enemies) {
      if (eo.waitingToEnter || eo.fighter.hp <= 0 || eo.fighter.broken) continue;
      const it = eo.intent;
      if (it === "quick" || it === "heavy") {
        restEvadeByEnemyId[eo.id] = Math.random() < evadeP;
      }
    }
  }
  return {
    defendFailed: false,
    blockFailed: false,
    heavyQuickInterruptSuccess:
      action === "heavy" && enemyQuickThreatensPlayerHeavy(state) && Math.random() < INTERRUPT_QUICK_VS_HEAVY,
    /** 你对目标快攻时，是否打断其重击（与 resolveEnemyAgainstPlayer 内判定一致） */
    attackVsHeavyTargetInterrupt: Math.random() < INTERRUPT_QUICK_VS_HEAVY,
    restEvadeByEnemyId,
  };
}

/** 玩家防御时，自敌方快攻/重击结算的原始伤害（与 resolveEnemyAgainstPlayer 数值一致，不写入状态） */
function previewRawDamageToPlayerWhenDefending(state, enemyObj, defendFailed) {
  const p = state.player;
  const e = enemyObj.fighter;
  const intent = enemyObj.intent;
  if (enemyObj.waitingToEnter || e.hp <= 0 || p.hp <= 0) return 0;
  if (e.broken) return 0;
  if (intent !== "quick" && intent !== "heavy") return 0;

  const defending = !defendFailed;
  const base = e.strikeBase || ns(2);
  let dmg =
    intent === "quick" ? base : base + ENEMY_STRIKE_HEAVY_EXTRA_DAMAGE;

  if (defending) {
    const extraMit = state.player?.defendMitigationBonus || 0;
    dmg = Math.max(0, dmg - ns(1 + extraMit));
    if ((state._restDefendBonusCharges || 0) > 0) dmg = Math.max(0, dmg - ns(1));
  }
  if (state.perks?.includes("perk_brokenfirstshield") && p.broken && (state.brokenFirstShieldCharges || 0) > 0 && dmg > 0) {
    dmg = Math.max(0, dmg - ns(1));
  }
  return dmg;
}

/** 盾反对快攻被破时，对玩家 HP/失衡 的预览（与 resolveEnemyAgainstPlayer 盾反分支一致，不写入状态） */
function previewRawBlockVsQuickPunishment(state, enemyObj) {
  const p = state.player;
  const e = enemyObj.fighter;
  if (enemyObj.waitingToEnter || e.hp <= 0 || p.hp <= 0) return { raw: 0, stg: 0 };
  if (e.broken) return { raw: 0, stg: 0 };
  const base = e.strikeBase || ns(2);
  const dmg = base;
  const stg = ENEMY_STRIKE_QUICK_STAGGER_TO_PLAYER + ENEMY_BLOCK_FAIL_EXTRA_STAGGER;
  return { raw: dmg, stg };
}

/**
 * 玩家快攻/重击打「防御意图」敌人时，在 applyDamage 前的原始伤害（与 applyPlayerToEnemy 一致，不写入状态）
 */
function previewRawDamageToEnemyVsDefend(state, tgt, action, targetId, rng) {
  const e = tgt.fighter;
  const intent = tgt.intent;
  if (tgt.waitingToEnter || e.hp <= 0) return 0;
  if (targetId !== tgt.id) return 0;
  if (intent !== "defend") return 0;

  let effectiveAction = action;
  if (action === "heavy" && rng.heavyQuickInterruptSuccess && enemyQuickThreatensPlayerHeavy(state)) {
    effectiveAction = "attack";
  }
  if (effectiveAction === "attack") {
    let dmg = ns(2) + (state.player.atkBonus || 0);
    if (state.perks?.includes("perk_staggerstrike") && (e.broken || e.stagger > 0)) {
      dmg += ns(1);
    }
    dmg = Math.max(0, dmg - ns(1));
    if (state.perks?.includes("perk_quick_vs_defend_dmg")) dmg += ns(1);
    if (state.firstQuickAttackBonusPending) dmg += ns(1);
    return dmg;
  }
  if (effectiveAction === "heavy") {
    let dmg = ns(3) + (state.player.atkBonus || 0);
    let stg = 2;
    if (state.perks?.includes("perk_armorbreak")) stg += 1;
    stg += state.player.heavyStgBonus || 0;
    if (state.battleBuffs?.breaklineReady) {
      dmg += ns(1);
      stg += 1;
    }
    if (intent === "defend") {
      dmg = Math.max(0, dmg - ns(1));
      stg = Math.max(0, stg - 1);
      stg += 1;
      if (state.perks?.includes("perk_heavybreakdef")) dmg += ns(1);
    }
    return dmg;
  }
  return 0;
}

/**
 * 「防住」仅当该次交锋防御方未掉 HP。
 * — 我方防御仍挨打 →「承伤」；我方进攻对方防御仍打出伤害 →「压制」（玩家视角，不与「承伤」混用）。
 */
function refineDefenseOutcomeLabels(state, bundle, rng) {
  const pa = bundle.playerAction;
  const tid = bundle.targetId;
  for (const row of bundle.enemyOutcomes) {
    if (row.outcomeType !== "blocked") continue;

    if (pa === "defend") {
      const it = row.intent;
      if (it === "quick" || it === "heavy") {
        const eo = state.enemies.find((x) => x.id === row.id);
        if (!eo) continue;
        const raw = previewRawDamageToPlayerWhenDefending(state, eo, rng.defendFailed);
        if (raw > 0) row.outcomeType = "mitigated";
      }
    } else if (pa === "attack" || pa === "heavy") {
      if (!tid || row.id !== tid || row.intent !== "defend") continue;
      const tgt = state.enemies.find((x) => x.id === tid);
      if (!tgt) continue;
      const raw = previewRawDamageToEnemyVsDefend(state, tgt, pa, tid, rng);
      if (raw > 0) row.outcomeType = "press_defense";
    }
  }
}

/** 玩家快攻/重击打在目标上，结算前对敌方 HP 的伤害量（与 applyPlayerToEnemy 一致，不写入状态） */
function previewRawEnemyHpDamageFromPlayer(state, tgt, action, targetId, rng) {
  const e = tgt.fighter;
  const intent = tgt.intent;
  if (tgt.waitingToEnter || e.hp <= 0) return 0;
  if (targetId !== tgt.id) return 0;

  let effectiveAction = action;
  if (action === "heavy" && rng.heavyQuickInterruptSuccess && enemyQuickThreatensPlayerHeavy(state)) {
    effectiveAction = "attack";
  }

  if (effectiveAction === "attack") {
    let dmg = ns(2) + (state.player.atkBonus || 0);
    if (state.perks?.includes("perk_staggerstrike") && (e.broken || e.stagger > 0)) dmg += ns(1);
    if (intent === "defend") {
      dmg = Math.max(0, dmg - ns(1));
      if (state.perks?.includes("perk_quick_vs_defend_dmg")) dmg += ns(1);
    }
    if (state.firstQuickAttackBonusPending) dmg += ns(1);
    if (state._breakDefenseFollowupPending) dmg += ns(1);
    if (state._noDamageNextAttackPending) dmg += ns(1);
    if (state._interruptNextQuickBonusPending) dmg += ns(1);
    return dmg;
  }
  if (effectiveAction === "heavy") {
    if (intent === "block") return 0;
    let dmg = ns(3) + (state.player.atkBonus || 0);
    let stg = 2;
    if (state.perks?.includes("perk_armorbreak")) stg += 1;
    stg += state.player.heavyStgBonus || 0;
    if (state.battleBuffs?.breaklineReady) dmg += ns(1);
    if (intent === "defend") {
      dmg = Math.max(0, dmg - ns(1));
      if (state.perks?.includes("perk_heavybreakdef")) dmg += ns(1);
    }
    if (state._restNextHeavyBonusPending) dmg += ns(1);
    if (state._blockNextHeavyBonusPending) dmg += ns(1);
    if (state._heavyChainNextHeavyPending) dmg += ns(1);
    return dmg;
  }
  return 0;
}

/**
 * 与 applyPlayerToEnemy 中传入 addStagger 的增量一致（不写状态；重击被快攻打断时按快攻失衡计）。
 */
function previewStaggerIncFromPlayerToEnemy(state, eo, playerAction, targetId, rng) {
  const e = eo.fighter;
  const intent = eo.intent;
  if (eo.waitingToEnter || e.hp <= 0) return 0;
  if (targetId !== eo.id) return 0;

  let effectiveAction = playerAction;
  if (playerAction === "heavy" && rng?.heavyQuickInterruptSuccess && enemyQuickThreatensPlayerHeavy(state)) {
    effectiveAction = "attack";
  }

  if (effectiveAction === "attack") {
    let stg = 1;
    if (intent === "defend") stg = Math.max(0, stg - 1);
    if (state.perks?.includes("perk_attackvsadjust") && intent === "adjust") stg += 1;
    if (state._blockNextAttackStaggerPending) stg += 1;
    if (state.perks?.includes("perk_quick_double_stagger") && state._lastPlayerActionWasAttack) stg += 1;
    return stg;
  }
  if (effectiveAction === "heavy") {
    if (intent === "block") return 0;
    let stg = 2;
    if (state.perks?.includes("perk_armorbreak")) stg += 1;
    stg += state.player.heavyStgBonus || 0;
    if (state.battleBuffs?.breaklineReady) stg += 1;
    if (intent === "defend") {
      stg = Math.max(0, stg - 1);
      stg += 1;
    }
    return stg;
  }
  return 0;
}

/** 本次失衡增量是否使目标由非破绽进入破绽（与 addStagger 满条规则一致） */
function previewEnemyNewlyBrokenFromPlayerStagger(eo, staggerInc) {
  const e = eo.fighter;
  if (!e || e.broken || e.hp <= 0) return false;
  if (staggerInc <= 0) return false;
  const after = Math.min(e.stagger + staggerInc, e.staggerThreshold);
  return after >= e.staggerThreshold;
}

/**
 * 玩家出快攻/重击（非防御/盾反）时，该敌方快攻/重击对玩家造成的伤害量（与 resolveEnemyAgainstPlayer 一致，不写入状态）
 */
function previewRawDamageToPlayerFromEnemyWhenAttacking(state, enemyObj, playerAction, targetId, rng) {
  const p = state.player;
  const e = enemyObj.fighter;
  const intent = enemyObj.intent;
  if (enemyObj.waitingToEnter || e.hp <= 0 || p.hp <= 0) return 0;
  /* 破绽中敌人本回合不出手，与 actingEnemies 过滤一致；否则「换血」预览会误带我方受击 */
  if (e.broken) return 0;
  if (playerAction !== "attack" && playerAction !== "heavy") return 0;
  if (enemyObj.canExecutePlayer && p.broken) return 0;

  let effectiveIntent = intent;
  if (playerAction === "attack" && targetId === enemyObj.id && intent === "heavy") {
    if (rng?.attackVsHeavyTargetInterrupt) effectiveIntent = "quick";
  }

  if (effectiveIntent === "adjust" || effectiveIntent === "block") return 0;
  if (effectiveIntent !== "quick" && effectiveIntent !== "heavy") return 0;

  const base = e.strikeBase || ns(2);
  let dmg =
    effectiveIntent === "quick" ? base : base + ENEMY_STRIKE_HEAVY_EXTRA_DAMAGE;

  if (
    state.perks?.includes("perk_brokenfirstshield") &&
    p.broken &&
    (state.brokenFirstShieldCharges || 0) > 0 &&
    dmg > 0
  ) {
    dmg = Math.max(0, dmg - ns(1));
  }
  return dmg;
}

/**
 * 重击被快攻打断且目标为防御、仍打出伤害时：主交锋行保留「压制」，动画仍先播「被打断」再播「压制」（见 buildResolutionSegments）。
 */
function shouldSplitHeavyInterruptThenPressDefense(state, bundle, rng) {
  if (bundle.playerAction !== "heavy" || !rng?.heavyQuickInterruptSuccess) return false;
  const tid = bundle.targetId;
  if (!tid) return false;
  const tgt = state.enemies.find((x) => x.id === tid);
  if (!tgt || tgt.intent !== "defend") return false;
  const raw = previewRawDamageToEnemyVsDefend(state, tgt, "heavy", tid, rng);
  return raw > 0;
}

/**
 * 重击被快攻打断：主攻行标签与对拼分段由 {@link buildResolutionSegments} 配合 {@link pickHeavyInterruptEnemyId}。
 * — 1v1 或打断者即主攻目标：主攻行标「被打断」；
 * — 多目标且打断者为他人：主攻行保持改按快攻后的实质（命中/压制/换血等）。
 */
function refineHeavyInterruptOutcome(state, bundle, rng) {
  if (bundle.playerAction !== "heavy" || !rng?.heavyQuickInterruptSuccess) return;
  const tid = bundle.targetId;
  if (!tid) return;

  const interruptId = pickHeavyInterruptEnemyId(state, tid);
  bundle.heavyInterruptEnemyId = interruptId;

  const row = bundle.enemyOutcomes.find((x) => x.role === "primary" && x.id === tid);
  if (!row) return;

  if (shouldSplitHeavyInterruptThenPressDefense(state, bundle, rng)) return;

  const multi = bundle.globalFlags?.multiEnemy;

  if (!multi) {
    row.outcomeType = "beat_interrupted";
    return;
  }
  if (interruptId === tid) {
    row.outcomeType = "beat_interrupted";
    return;
  }
}

/**
 * 本段预览将击杀主攻目标时，对撞层在首段结算字后再切「击杀！」（与换血后先手/破绽同类）。
 * 须在 refineHeavyInterruptOutcome 之后调用，以使用最终 outcomeType。
 */
function refineResolutionLethalKill(state, bundle, rng) {
  const pa = bundle.playerAction;
  if (pa !== "attack" && pa !== "heavy") return;
  const tid = bundle.targetId;
  if (!tid) return;
  for (const row of bundle.enemyOutcomes) {
    if (row.id !== tid || row.role !== "primary") continue;
    const ot = row.outcomeType;
    const eo = state.enemies.find((x) => x.id === row.id);
    if (!eo || eo.waitingToEnter || eo.fighter.hp <= 0) continue;
    let dmg = 0;
    if (ot === "interrupted" || ot === "beat_interrupted") {
      dmg = previewRawEnemyHpDamageFromPlayer(state, eo, "attack", tid, rng);
    } else if (ot === "hit" || ot === "blood_trade" || ot === "press_defense") {
      dmg = previewRawEnemyHpDamageFromPlayer(state, eo, pa, tid, rng);
    } else continue;
    if (dmg > 0 && eo.fighter.hp <= dmg) row.resolutionLethalKill = true;
  }
}

/** 「命中」且本回合双方均会掉 HP 时，改为「换血」 */
function refineHitToBloodTrade(state, bundle, rng) {
  const pa = bundle.playerAction;
  if (pa !== "attack" && pa !== "heavy") return;
  const tid = bundle.targetId;
  for (const row of bundle.enemyOutcomes) {
    if (row.outcomeType !== "hit") continue;
    if (row.role !== "primary") continue;
    const eo = state.enemies.find((x) => x.id === row.id);
    if (!eo) continue;
    if (eo.fighter.broken) continue;
    const edmg = previewRawEnemyHpDamageFromPlayer(state, eo, pa, tid, rng);
    const pdmg = previewRawDamageToPlayerFromEnemyWhenAttacking(state, eo, pa, tid, rng);
    if (edmg > 0 && pdmg > 0) row.outcomeType = "blood_trade";
  }
}

/**
 * 「换血」预览下双方都会受伤，但若我方先手伤害已足以击杀该敌，对拼动画先「互换」再「先手！」再「击杀！」（实际结算仍为先击杀，敌本段不反击）。
 */
function refineBloodTradeFirstStrikeKill(state, bundle, rng) {
  const pa = bundle.playerAction;
  if (pa !== "attack" && pa !== "heavy") return;
  const tid = bundle.targetId;
  if (!tid) return;
  for (const row of bundle.enemyOutcomes) {
    if (row.outcomeType !== "blood_trade") continue;
    if (row.role !== "primary") continue;
    const eo = state.enemies.find((x) => x.id === row.id);
    if (!eo || eo.waitingToEnter || eo.fighter.hp <= 0) continue;
    const edmg = previewRawEnemyHpDamageFromPlayer(state, eo, pa, tid, rng);
    const pdmg = previewRawDamageToPlayerFromEnemyWhenAttacking(state, eo, pa, tid, rng);
    if (!(edmg > 0 && pdmg > 0)) continue;
    if (eo.fighter.hp <= edmg) row.resolutionFirstStrikeKill = true;
  }
}

/**
 * 「换血」且非先手击杀时，若我方出手将敌方打入破绽，对拼先「互换」再切「崩了！」（与先手击杀同理）。
 */
function refineBloodTradeEnemyBreak(state, bundle, rng) {
  const pa = bundle.playerAction;
  if (pa !== "attack" && pa !== "heavy") return;
  const tid = bundle.targetId;
  if (!tid) return;
  for (const row of bundle.enemyOutcomes) {
    if (row.outcomeType !== "blood_trade") continue;
    if (row.role !== "primary") continue;
    if (row.resolutionFirstStrikeKill) continue;
    const eo = state.enemies.find((x) => x.id === row.id);
    if (!eo || eo.waitingToEnter || eo.fighter.hp <= 0) continue;
    const inc = previewStaggerIncFromPlayerToEnemy(state, eo, pa, tid, rng);
    if (inc > 0 && wouldBreakAfterStaggerGain(eo.fighter, inc)) row.resolutionTradeEnemyBreak = true;
  }
}

/**
 * 盾反对重击成功且本段失衡将敌打入破绽时，对撞先「反制」再切「崩了！」（与换血打入破绽同类）。
 * 须与 resolveEnemyAgainstPlayer 盾反重击分支一致：基础 +2，技法「稳守反震」再 +1。
 */
function refineCounterBlockEnemyBreak(state, bundle, rng) {
  void rng;
  if (bundle.playerAction !== "block") return;
  for (const row of bundle.enemyOutcomes) {
    if (row.outcomeType !== "counter_block") continue;
    const eo = state.enemies.find((x) => x.id === row.id);
    if (!eo || eo.waitingToEnter || eo.fighter.hp <= 0) continue;
    if (eo.intent !== "heavy") continue;
    let inc = 2;
    if (state.perks?.includes("perk_guardshock")) inc += 1;
    if (wouldBreakAfterStaggerGain(eo.fighter, inc)) row.resolutionCounterEnemyBreak = true;
  }
}

/**
 * 快攻/重击在非换血路径下将目标打入破绽：对撞先播本段结算字（命中/打断/压制等）再切「崩了！」。
 * 换血路径由 refineBloodTradeEnemyBreak；盾反由 refineCounterBlockEnemyBreak。
 */
function effectiveStrikeTargetIdForRow(row, bundle) {
  const pa = bundle.playerAction;
  const tid = bundle.targetId;
  if (pa === "heavy" && bundle.heavyInterruptEnemyId && row.outcomeType === "beat_interrupted") {
    if (row.id === bundle.heavyInterruptEnemyId) return row.id;
  }
  return tid || null;
}

function refineStrikeEnemyBreak(state, bundle, rng) {
  void rng;
  const pa = bundle.playerAction;
  if (pa !== "attack" && pa !== "heavy") return;
  const need = ["hit", "interrupted", "beat_interrupted", "press_defense"];
  for (const row of bundle.enemyOutcomes) {
    if (!need.includes(row.outcomeType)) continue;
    if (row.resolutionLethalKill) continue;
    const eo = state.enemies.find((x) => x.id === row.id);
    if (!eo || eo.waitingToEnter || eo.fighter.hp <= 0) continue;
    const effTid = effectiveStrikeTargetIdForRow(row, bundle);
    if (!effTid || eo.id !== effTid) continue;
    const inc = previewStaggerIncFromPlayerToEnemy(state, eo, pa, effTid, rng);
    if (inc <= 0) continue;
    if (wouldBreakAfterStaggerGain(eo.fighter, inc)) row.resolutionStrikeEnemyBreak = true;
  }
}

function cancelResolutionAnimation(ui) {
  if (resolutionAnimTimer) {
    clearTimeout(resolutionAnimTimer);
    resolutionAnimTimer = null;
  }
  if (resolutionPhase2Timer) {
    clearTimeout(resolutionPhase2Timer);
    resolutionPhase2Timer = null;
  }
  if (resolutionFirstStrikeTimer) {
    clearTimeout(resolutionFirstStrikeTimer);
    resolutionFirstStrikeTimer = null;
  }
  if (resolutionAnimResolve) {
    const done = resolutionAnimResolve;
    resolutionAnimResolve = null;
    done();
  }
  if (!ui?.resolutionLayer) {
    clearBattleMeritFx(ui);
    return;
  }
  ui.battleInfoPanel?.classList.remove("is-resolving");
  ui.resolutionLayer.classList.remove(
    "is-active",
    "is-execute",
    "resolution-layer--clash",
    "resolution-layer--result",
    "resolution-layer--solo-intro",
  );
  ui.resolutionLayer.hidden = true;
  ui.resolutionLayer.setAttribute("aria-hidden", "true");
  if (ui.resolutionPrimary) ui.resolutionPrimary.className = "resolution-primary";
  if (ui.playerActionCapsule) {
    ui.playerActionCapsule.textContent = "";
    ui.playerActionCapsule.classList.remove("resolution-player-broken--lv2", "resolution-player-broken--lv3");
  }
  if (ui.enemyActionCapsule) ui.enemyActionCapsule.textContent = "";
  if (ui.resolutionLabel) {
    ui.resolutionLabel.textContent = "";
    ui.resolutionLabel.classList.remove(
      "resolution-label--pop",
      "resolution-label--first-strike",
      "resolution-label--enemy-break",
      "resolution-label--lethal-kill",
      "resolution-label--step-1",
      "resolution-label--step-2",
      "resolution-label--step-3",
    );
  }
  if (ui.resolutionSecondary) ui.resolutionSecondary.innerHTML = "";
  clearBattleMeritFx(ui);
}

/**
 * 是否与 onPlayerAction 入口条件一致（用于是否播放对拼、避免无效点击播动画）
 */
function canQueueBattleClash(state, action) {
  if (state.phase === BOSS_EXEC_PLAYER_DRAMA_PHASE) return false;
  if (state.phase !== "fight") return false;
  if (state.endingArmed) return false;
  if (state.player.hp <= 0) return false;
  if (!state.enemies.some((x) => !x.waitingToEnter && x.fighter.hp > 0)) return false;
  if (action === "rest" && (state.player.restCooldownLeft || 0) > 0) return false;
  if (state._battleClashAnimating) return false;
  if (state._pendingMultiEnemyResolution) return false;
  return true;
}

function pickPrimaryEnemyId(state, action, targetId) {
  const alive = state.enemies.filter((eo) => !eo.waitingToEnter && eo.fighter.hp > 0);
  if (!alive.length) return null;
  if (
    (action === "attack" ||
      action === "heavy" ||
      action === "execute" ||
      action === "defend" ||
      action === "block") &&
    targetId
  ) {
    if (alive.some((eo) => eo.id === targetId)) return targetId;
  }
  const heavy = alive.find((eo) => eo.intent === "heavy");
  if (heavy) return heavy.id;
  const quick = alive.find((eo) => eo.intent === "quick");
  if (quick) return quick.id;
  return alive[0]?.id || null;
}

function inferOutcomeType(state, action, eo, primaryEnemyId, targetId) {
  if (state.player?.broken && eo.fighter?.broken && eo.fighter.hp > 0) {
    return "dual_broken";
  }
  const it = eo.intent;
  if (eo.id !== primaryEnemyId) {
    if (action === "execute") return "none";
    /* 调息时敌方来攻：非「互换」，按单方施压计，与侧袭同列 */
    if (action === "rest") return it === "quick" || it === "heavy" ? "flanked" : "rest_safe";
    if (action === "defend") {
      return it === "quick" || it === "heavy" ? "blocked" : "none";
    }
    if (action === "block") {
      if (eo.fighter?.broken) return "whiff";
      if (it === "heavy") return "counter_block";
      if (it === "quick") return "block_punished";
      return "whiff";
    }
    if (action === "attack" || action === "heavy") {
      if (it === "adjust") return "none";
      if (it === "quick" || it === "heavy") return "flanked";
      return "none";
    }
    return "none";
  }

  if (action === "execute") return "execute";
  if (action === "rest") return it === "quick" || it === "heavy" ? "flanked" : "rest_safe";
  if (action === "defend") return it === "quick" || it === "heavy" ? "blocked" : "none";
  if (action === "block") {
    if (eo.fighter?.broken) return "whiff";
    if (it === "heavy") return "counter_block";
    if (it === "quick") return "block_punished";
    return "whiff";
  }
  if (action === "attack") {
    if (it === "heavy") return "interrupted";
    if (it === "defend") return "blocked";
    return "hit";
  }
  if (action === "heavy") {
    if (it === "block") return "counter_block";
    if (it === "defend") return "blocked";
    return "hit";
  }
  return "none";
}

function buildTurnResolutionBundle(state, playerAction, targetId) {
  const primaryEnemyId = pickPrimaryEnemyId(state, playerAction, targetId);
  const outcomes = [];
  for (const eo of state.enemies) {
    if (eo.waitingToEnter || eo.fighter.hp <= 0) continue;
    const role = eo.id === primaryEnemyId ? "primary" : "secondary";
    const outcomeType = inferOutcomeType(state, playerAction, eo, primaryEnemyId, targetId);
    outcomes.push({
      id: eo.id,
      intent: eo.intent,
      role,
      outcomeType,
      label: OUTCOME_LABEL[outcomeType] || "",
      hpDeltaToEnemy: 0,
      hpDeltaToPlayer: 0,
      staggerDeltaToEnemy: 0,
      staggerDeltaToPlayer: 0,
      isBrokenAfter: false,
      isDeadAfter: false,
    });
  }
  const bundle = {
    battleId: state.battle?.battleNodeId || state.nodeId || "",
    turnIndex: state.globalTurn || 1,
    playerAction,
    targetId: targetId || null,
    primaryEnemyId,
    enemyOutcomes: outcomes,
    globalFlags: {
      playerBrokenAfterTurn: false,
      bossExecutePlayer: false,
      executeTargetId: playerAction === "execute" ? targetId || null : null,
      multiEnemy: outcomes.length > 1,
    },
    logPreview: [],
    meritPreview: { positiveEvents: [], negativeEvents: [] },
    /** 与 refine 共用；播片时 state._turnRng 可能已被清空，卡片特效须用此快照 */
    resolutionRng: state._turnRng || null,
  };
  if (state._turnRng) {
    refineDefenseOutcomeLabels(state, bundle, state._turnRng);
    refineHitToBloodTrade(state, bundle, state._turnRng);
    refineBloodTradeFirstStrikeKill(state, bundle, state._turnRng);
    refineBloodTradeEnemyBreak(state, bundle, state._turnRng);
    refineCounterBlockEnemyBreak(state, bundle, state._turnRng);
    refineHeavyInterruptOutcome(state, bundle, state._turnRng);
    refineResolutionLethalKill(state, bundle, state._turnRng);
    refineStrikeEnemyBreak(state, bundle, state._turnRng);
    for (const o of bundle.enemyOutcomes) {
      o.label = OUTCOME_LABEL[o.outcomeType] || "";
    }
  }
  return bundle;
}

/**
 * 多敌人时拆成多段对拼动画；单敌人仍是一段。
 * — 快攻/重击：先与主攻目标完整播一次（重击被他人快攻打断时见下），再对其余敌人分别播，玩家侧用「我」。
 * — **重击被快攻打断**：1v1 只播一段「被打断」；多目标时先与**打断者**播「被打断」，再与主攻目标播改按快攻后的结果，最后其余敌人。
 * — 防御：多敌时按槽位甲→乙→丙 每位在场敌人一段。盾反：多敌时**敌方重击槽对撞段优先**，其余槽位仍甲→乙→丙（与 onPlayerAction 逐敌结算一致，含调整等 none 段）；首段「实质交锋」为防御/盾反胶囊，后续非 dual_broken 用「我」（dual_broken 仍用破绽胶囊）。
 * — 调息：进入 resolving 前先播玩家卡调息光效（不参与对撞）；对撞段玩家侧为**空意图占位**（neutral），仅敌意图与之对撞；卡面特效仍按敌袭我结算。
 */
/** 对拼段：换血且预览为先手击杀时，播「互换」→「先手！」 */
function resolutionSegmentFirstStrikeKill(enemyRow, outcome) {
  return !!(enemyRow?.resolutionFirstStrikeKill && outcome === "blood_trade");
}

/** 对拼段：换血且我方出手将敌打入破绽时，播「互换」→「崩了！」 */
function resolutionSegmentTradeEnemyBreak(enemyRow, outcome) {
  return !!(enemyRow?.resolutionTradeEnemyBreak && outcome === "blood_trade");
}

/** 对拼段：盾反对重击将敌打入破绽时，播「反制」→「崩了！」 */
function resolutionSegmentCounterEnemyBreak(enemyRow, outcome) {
  return !!(enemyRow?.resolutionCounterEnemyBreak && outcome === "counter_block");
}

/** 对拼段：快攻/重击命中类将敌打入破绽时，播本段结算字→「崩了！」（非换血、非盾反） */
function resolutionSegmentStrikeEnemyBreak(enemyRow, outcome) {
  if (!enemyRow?.resolutionStrikeEnemyBreak) return false;
  return ["hit", "interrupted", "beat_interrupted", "press_defense"].includes(outcome);
}

/** 对拼段：本段将击杀主攻目标时，首段结算字后再切「击杀！」 */
function resolutionSegmentLethalKill(enemyRow, outcome) {
  if (!enemyRow?.resolutionLethalKill) return false;
  return ["hit", "blood_trade", "interrupted", "beat_interrupted", "press_defense"].includes(outcome);
}

/** 多敌盾反：对撞段序与敌方阶段结算一致——敌方重击槽优先，其余按甲→乙→丙 */
function sortEnemyShellsForBlockClashOrder(enemies) {
  const slotOrder = { A: 0, B: 1, C: 2 };
  return enemies.slice().sort((a, b) => {
    const ha = a.intent === "heavy" ? 0 : 1;
    const hb = b.intent === "heavy" ? 0 : 1;
    const d = ha - hb;
    if (d !== 0) return d;
    return (slotOrder[a.id] ?? 9) - (slotOrder[b.id] ?? 9);
  });
}

/** 同上，用于 enemyOutcomes 行（意图读自 state.enemies） */
function sortEnemyOutcomeRowsForBlockClashOrder(state, rows) {
  const slotOrder = { A: 0, B: 1, C: 2 };
  return rows.slice().sort((a, b) => {
    const ea = state.enemies.find((e) => e.id === a.id);
    const eb = state.enemies.find((e) => e.id === b.id);
    const ha = ea?.intent === "heavy" ? 0 : 1;
    const hb = eb?.intent === "heavy" ? 0 : 1;
    const d = ha - hb;
    if (d !== 0) return d;
    return (slotOrder[a.id] ?? 9) - (slotOrder[b.id] ?? 9);
  });
}

function buildResolutionSegments(state, bundle) {
  const outcomes = bundle.enemyOutcomes || [];
  const multi = outcomes.length > 1;
  const pa = bundle.playerAction;
  const primary = outcomes.find((x) => x.role === "primary") || outcomes[0] || null;
  if (!primary) return [];

  const rng = state._turnRng;
  const fsk = resolutionSegmentFirstStrikeKill;
  const fteb = resolutionSegmentTradeEnemyBreak;
  const fceb = resolutionSegmentCounterEnemyBreak;
  const fseb = resolutionSegmentStrikeEnemyBreak;
  const flk = resolutionSegmentLethalKill;

  if (!multi) {
    if (pa === "attack" || pa === "heavy") {
      if (pa === "heavy" && rng?.heavyQuickInterruptSuccess && bundle.heavyInterruptEnemyId) {
        return [
          {
            playerText: ACTION_CLASH_LABELS.heavy,
            playerChipKey: "heavy",
            enemyRow: primary,
            outcome: "beat_interrupted",
            soloIntro: false,
            firstStrikeKill: false,
            tradeEnemyBreak: false,
            counterEnemyBreak: false,
            strikeEnemyBreak: fseb(primary, "beat_interrupted"),
            lethalKill: flk(primary, "beat_interrupted"),
          },
        ];
      }
      return [
        {
          ...resolutionPlayerCapsuleForSegment(state, pa, primary.outcomeType, primary),
          enemyRow: primary,
          outcome: primary.outcomeType,
          soloIntro: false,
          firstStrikeKill: fsk(primary, primary.outcomeType),
          tradeEnemyBreak: fteb(primary, primary.outcomeType),
          counterEnemyBreak: false,
          strikeEnemyBreak: fseb(primary, primary.outcomeType),
          lethalKill: flk(primary, primary.outcomeType),
        },
      ];
    }
    if (pa === "rest") {
      return [
        {
          ...resolutionPlayerCapsuleForSegment(state, pa, primary.outcomeType, primary),
          enemyRow: primary,
          outcome: primary.outcomeType,
          soloIntro: false,
          firstStrikeKill: false,
          tradeEnemyBreak: false,
          counterEnemyBreak: false,
          strikeEnemyBreak: false,
          lethalKill: false,
        },
      ];
    }
    if (pa === "defend" || pa === "block") {
      return [
        {
          ...resolutionPlayerCapsuleForSegment(state, pa, primary.outcomeType, primary),
          enemyRow: primary,
          outcome: primary.outcomeType,
          soloIntro: false,
          firstStrikeKill: false,
          tradeEnemyBreak: false,
          counterEnemyBreak: fceb(primary, primary.outcomeType),
          strikeEnemyBreak: false,
          lethalKill: false,
        },
      ];
    }
    return [
      {
        ...resolutionPlayerCapsuleForSegment(state, pa, primary.outcomeType, primary),
        enemyRow: primary,
        outcome: primary.outcomeType,
        soloIntro: false,
        firstStrikeKill: fsk(primary, primary.outcomeType),
        tradeEnemyBreak: fteb(primary, primary.outcomeType),
        counterEnemyBreak: false,
        strikeEnemyBreak: fseb(primary, primary.outcomeType),
        lethalKill: flk(primary, primary.outcomeType),
      },
    ];
  }

  if (pa === "defend" || pa === "block") {
    let actingRows = outcomes.filter((r) => {
      const eo = state.enemies.find((e) => e.id === r.id);
      return eo && !eo.waitingToEnter && eo.fighter.hp > 0 && !eo.fighter.broken;
    });
    if (pa === "block") {
      actingRows = sortEnemyOutcomeRowsForBlockClashOrder(state, actingRows);
    }
    const segments = [];
    for (const row of actingRows) {
      segments.push({
        ...resolutionPlayerCapsuleForSegment(state, pa, row.outcomeType, row),
        enemyRow: row,
        outcome: row.outcomeType,
        soloIntro: false,
        firstStrikeKill: false,
        tradeEnemyBreak: false,
        counterEnemyBreak: fceb(row, row.outcomeType),
        strikeEnemyBreak: false,
        lethalKill: false,
      });
    }
    return segments;
  }

  if (pa === "attack" || pa === "heavy") {
    // 进攻多敌：默认顺序为「先主攻目标，再其余在场敌人」（与 onPlayerAction 先对 targetId 出手再逐敌反击一致）。
    // 唯一例外：重击被快攻打断且打断者不是主攻目标时，先播「被打断」段（侧翼快攻），再播主攻上的改按快攻结算；与 pickHeavyInterruptEnemyId 一致。
    // 该例外下动画顺序与逐段提交数值不一致，故 shouldCommitBattlePerResolutionSegment 会退回播完再整回合结算。
    if (pa === "heavy" && rng?.heavyQuickInterruptSuccess && bundle.heavyInterruptEnemyId) {
      const iid = bundle.heavyInterruptEnemyId;
      const interRow = outcomes.find((o) => o.id === iid);
      const segments = [];
      if (interRow) {
        if (iid !== primary.id) {
          segments.push({
            playerText: ACTION_CLASH_LABELS.heavy,
            playerChipKey: "heavy",
            enemyRow: interRow,
            outcome: "beat_interrupted",
            soloIntro: false,
            firstStrikeKill: false,
            tradeEnemyBreak: false,
            counterEnemyBreak: false,
            strikeEnemyBreak: fseb(interRow, "beat_interrupted"),
            lethalKill: flk(interRow, "beat_interrupted"),
          });
        } else {
          segments.push({
            playerText: ACTION_CLASH_LABELS.heavy,
            playerChipKey: "heavy",
            enemyRow: primary,
            outcome: "beat_interrupted",
            soloIntro: false,
            firstStrikeKill: false,
            tradeEnemyBreak: false,
            counterEnemyBreak: false,
            strikeEnemyBreak: fseb(primary, "beat_interrupted"),
            lethalKill: flk(primary, "beat_interrupted"),
          });
        }
      }
      if (iid !== primary.id) {
        segments.push({
          playerText: ACTION_CLASH_LABELS.attack,
          playerChipKey: "attack",
          enemyRow: primary,
          outcome: primary.outcomeType,
          soloIntro: false,
          firstStrikeKill: fsk(primary, primary.outcomeType),
          tradeEnemyBreak: fteb(primary, primary.outcomeType),
          counterEnemyBreak: false,
          strikeEnemyBreak: fseb(primary, primary.outcomeType),
          lethalKill: flk(primary, primary.outcomeType),
        });
      }
      for (const row of outcomes) {
        if (row.role !== "secondary") continue;
        if (row.outcomeType === "none") continue;
        if (row.id === iid) continue;
        segments.push({
          playerText: "我",
          playerChipKey: "me",
          enemyRow: row,
          outcome: row.outcomeType,
          soloIntro: false,
          firstStrikeKill: fsk(row, row.outcomeType),
          tradeEnemyBreak: fteb(row, row.outcomeType),
          counterEnemyBreak: false,
          strikeEnemyBreak: fseb(row, row.outcomeType),
          lethalKill: flk(row, row.outcomeType),
        });
      }
      return segments;
    }

    const secondaries = outcomes.filter((x) => x.role === "secondary");
    // 非「重击被他人快攻打断」的进攻：首段即主攻目标交锋。
    const segments = [
      {
        ...resolutionPlayerCapsuleForSegment(state, pa, primary.outcomeType, primary),
        enemyRow: primary,
        outcome: primary.outcomeType,
        soloIntro: false,
        firstStrikeKill: fsk(primary, primary.outcomeType),
        tradeEnemyBreak: fteb(primary, primary.outcomeType),
        counterEnemyBreak: false,
        strikeEnemyBreak: fseb(primary, primary.outcomeType),
        lethalKill: flk(primary, primary.outcomeType),
      },
    ];
    for (const row of secondaries) {
      if (row.outcomeType === "none") continue;
      const secCaps = resolutionPlayerCapsuleForSegment(state, pa, row.outcomeType, row);
      segments.push({
        ...(row.outcomeType === "dual_broken" ? secCaps : { playerText: "我", playerChipKey: "me" }),
        enemyRow: row,
        outcome: row.outcomeType,
        soloIntro: false,
        firstStrikeKill: fsk(row, row.outcomeType),
        tradeEnemyBreak: fteb(row, row.outcomeType),
        counterEnemyBreak: false,
        strikeEnemyBreak: fseb(row, row.outcomeType),
        lethalKill: flk(row, row.outcomeType),
      });
    }
    return segments;
  }

  if (pa === "rest") {
    const segments = [];
    for (const row of outcomes) {
      if (row.outcomeType === "none") continue;
      segments.push({
        ...resolutionPlayerCapsuleForSegment(state, pa, row.outcomeType, row),
        enemyRow: row,
        outcome: row.outcomeType,
        soloIntro: false,
        firstStrikeKill: false,
        tradeEnemyBreak: false,
        counterEnemyBreak: false,
        strikeEnemyBreak: false,
        lethalKill: false,
      });
    }
    return segments;
  }

  return [
    {
      ...resolutionPlayerCapsuleForSegment(state, pa, primary.outcomeType, primary),
      enemyRow: primary,
      outcome: primary.outcomeType,
      soloIntro: false,
      firstStrikeKill: fsk(primary, primary.outcomeType),
      tradeEnemyBreak: fteb(primary, primary.outcomeType),
      counterEnemyBreak: false,
      strikeEnemyBreak: fseb(primary, primary.outcomeType),
      lethalKill: flk(primary, primary.outcomeType),
    },
  ];
}

function prepareNextResolutionSegment(ui) {
  if (!ui?.resolutionLayer) return;
  ui.resolutionLayer.classList.remove("resolution-layer--clash", "resolution-layer--result", "resolution-layer--solo-intro");
  if (ui.resolutionLabel) {
    ui.resolutionLabel.textContent = "";
    ui.resolutionLabel.classList.remove(
      "resolution-label--pop",
      "resolution-label--first-strike",
      "resolution-label--enemy-break",
      "resolution-label--lethal-kill",
      "resolution-label--step-1",
      "resolution-label--step-2",
      "resolution-label--step-3",
    );
  }
  if (ui.resolutionSecondary) ui.resolutionSecondary.innerHTML = "";
  void ui.resolutionLayer.offsetWidth;
}

function playOneResolutionSegment(state, bundle, ui, segment, isLast) {
  return new Promise((resolve) => {
    resolutionAnimResolve = resolve;
    if (resolutionFirstStrikeTimer) {
      clearTimeout(resolutionFirstStrikeTimer);
      resolutionFirstStrikeTimer = null;
    }
    const {
      playerText,
      playerChipKey,
      enemyRow,
      outcome,
      soloIntro,
      firstStrikeKill,
      tradeEnemyBreak,
      counterEnemyBreak = false,
      strikeEnemyBreak = false,
      lethalKill,
      brokenTier,
    } = segment;

    ui.resolutionLayer.classList.toggle("is-execute", outcome === "execute");
    if (ui.resolutionPrimary) {
      ui.resolutionPrimary.className = `resolution-primary resolution-outcome-${outcomeCssClass(outcome)}`;
    }
    if (ui.playerActionCapsule) {
      ui.playerActionCapsule.className = `resolution-capsule resolution-capsule--player ${resolutionPlayerChipClass(playerChipKey)}`;
      ui.playerActionCapsule.classList.remove("resolution-player-broken--lv2", "resolution-player-broken--lv3");
      if (brokenTier === 2) ui.playerActionCapsule.classList.add("resolution-player-broken--lv2");
      if (brokenTier === 3) ui.playerActionCapsule.classList.add("resolution-player-broken--lv3");
      ui.playerActionCapsule.textContent = playerText;
    }
    if (ui.enemyActionCapsule) {
      if (enemyRow && !soloIntro) {
        const ic = resolutionEnemyCapsuleClass(state, enemyRow);
        ui.enemyActionCapsule.className = `resolution-capsule resolution-capsule--enemy ${ic}`.trim();
        ui.enemyActionCapsule.textContent = resolutionEnemyCapsuleText(state, enemyRow);
      } else {
        ui.enemyActionCapsule.className = "resolution-capsule resolution-capsule--enemy";
        ui.enemyActionCapsule.textContent = "";
      }
    }
    if (ui.resolutionLabel) {
      ui.resolutionLabel.textContent = "";
      ui.resolutionLabel.classList.remove(
        "resolution-label--pop",
        "resolution-label--first-strike",
        "resolution-label--enemy-break",
        "resolution-label--lethal-kill",
        "resolution-label--step-1",
        "resolution-label--step-2",
        "resolution-label--step-3",
      );
    }
    if (ui.resolutionSecondary) ui.resolutionSecondary.innerHTML = "";

    void ui.resolutionLayer.offsetWidth;
    ui.resolutionLayer.classList.add("is-active");
    if (soloIntro) ui.resolutionLayer.classList.add("resolution-layer--solo-intro");
    ui.resolutionLayer.classList.add("resolution-layer--clash");

    const resultText = resolutionPrimaryOutcomeLabel(outcome);
    /** 换血且先手击杀：互换 →「先手！」→「击杀！」 */
    const showTradeThenFirstStrike = !!firstStrikeKill && outcome === "blood_trade";
    const showTradeThenEnemyBreak = !!tradeEnemyBreak && outcome === "blood_trade" && !firstStrikeKill;
    const showCounterThenEnemyBreak = !!counterEnemyBreak && outcome === "counter_block";
    const showStrikeThenEnemyBreak =
      !!strikeEnemyBreak &&
      (outcome === "hit" ||
        outcome === "interrupted" ||
        outcome === "beat_interrupted" ||
        outcome === "press_defense");
    /** 本段击杀但非「换血·先手击杀」路径：命中/打断/压制等 →「击杀！」 */
    const showResultThenLethalKill =
      !!lethalKill &&
      !(outcome === "blood_trade" && firstStrikeKill) &&
      (outcome === "hit" ||
        outcome === "interrupted" ||
        outcome === "beat_interrupted" ||
        outcome === "press_defense");
    const showTradeFlip = showTradeThenFirstStrike || showTradeThenEnemyBreak;
    /** 多段切字：三段用 PHASE_3STEP，两段（互换→崩了 / 反制→崩了 / 命中类→崩了 / 结算→击杀）用 PHASE_2STEP */
    const resultPhaseMs = showTradeThenFirstStrike
      ? Math.max(RESOLUTION_RESULT_PHASE_MS, RESOLUTION_LABEL_PHASE_3STEP_MS)
      : showTradeThenEnemyBreak ||
          showCounterThenEnemyBreak ||
          showStrikeThenEnemyBreak ||
          showResultThenLethalKill
        ? Math.max(RESOLUTION_RESULT_PHASE_MS, RESOLUTION_LABEL_PHASE_2STEP_MS)
        : RESOLUTION_RESULT_PHASE_MS;

    resolutionAnimTimer = window.setTimeout(() => {
      resolutionAnimTimer = null;
      ui.resolutionLayer.classList.remove("resolution-layer--clash", "resolution-layer--solo-intro");
      ui.resolutionLayer.classList.add("resolution-layer--result");
      if (
        ui.resolutionLabel &&
        (showTradeFlip ||
          showCounterThenEnemyBreak ||
          showStrikeThenEnemyBreak ||
          showResultThenLethalKill ||
          resultText)
      ) {
        if (showTradeThenFirstStrike) {
          ui.resolutionLabel.textContent = OUTCOME_LABEL.trade;
          void ui.resolutionLabel.offsetWidth;
          ui.resolutionLabel.classList.add("resolution-label--pop", "resolution-label--step-1");
          resolutionFirstStrikeTimer = window.setTimeout(() => {
            if (!ui?.resolutionLabel) return;
            ui.resolutionLabel.textContent = "先手！";
            ui.resolutionLabel.classList.remove(
              "resolution-label--pop",
              "resolution-label--step-1",
              "resolution-label--lethal-kill",
            );
            void ui.resolutionLabel.offsetWidth;
            ui.resolutionLabel.classList.add("resolution-label--pop", "resolution-label--first-strike", "resolution-label--step-2");
            resolutionFirstStrikeTimer = window.setTimeout(() => {
              resolutionFirstStrikeTimer = null;
              if (!ui?.resolutionLabel) return;
              ui.resolutionLabel.textContent = "击杀！";
              ui.resolutionLabel.classList.remove("resolution-label--pop", "resolution-label--first-strike", "resolution-label--step-2");
              void ui.resolutionLabel.offsetWidth;
              ui.resolutionLabel.classList.add("resolution-label--pop", "resolution-label--lethal-kill", "resolution-label--step-3");
            }, RESOLUTION_LABEL_STEP2_GAP_MS);
          }, RESOLUTION_LABEL_STEP1_GAP_MS);
        } else if (showTradeThenEnemyBreak) {
          ui.resolutionLabel.textContent = OUTCOME_LABEL.trade;
          void ui.resolutionLabel.offsetWidth;
          ui.resolutionLabel.classList.add("resolution-label--pop", "resolution-label--step-1");
          resolutionFirstStrikeTimer = window.setTimeout(() => {
            resolutionFirstStrikeTimer = null;
            if (!ui?.resolutionLabel) return;
            ui.resolutionLabel.textContent = "他崩了！";
            ui.resolutionLabel.classList.remove("resolution-label--pop", "resolution-label--step-1");
            void ui.resolutionLabel.offsetWidth;
            ui.resolutionLabel.classList.add("resolution-label--pop", "resolution-label--enemy-break", "resolution-label--step-2");
          }, RESOLUTION_LABEL_STEP1_GAP_MS);
        } else if (showCounterThenEnemyBreak) {
          ui.resolutionLabel.textContent = OUTCOME_LABEL.counter_block;
          void ui.resolutionLabel.offsetWidth;
          ui.resolutionLabel.classList.add("resolution-label--pop", "resolution-label--step-1");
          resolutionFirstStrikeTimer = window.setTimeout(() => {
            resolutionFirstStrikeTimer = null;
            if (!ui?.resolutionLabel) return;
            ui.resolutionLabel.textContent = "他崩了！";
            ui.resolutionLabel.classList.remove("resolution-label--pop", "resolution-label--step-1");
            void ui.resolutionLabel.offsetWidth;
            ui.resolutionLabel.classList.add("resolution-label--pop", "resolution-label--enemy-break", "resolution-label--step-2");
          }, RESOLUTION_LABEL_STEP1_GAP_MS);
        } else if (showStrikeThenEnemyBreak && resultText) {
          ui.resolutionLabel.textContent = resultText;
          void ui.resolutionLabel.offsetWidth;
          ui.resolutionLabel.classList.add("resolution-label--pop", "resolution-label--step-1");
          resolutionFirstStrikeTimer = window.setTimeout(() => {
            resolutionFirstStrikeTimer = null;
            if (!ui?.resolutionLabel) return;
            ui.resolutionLabel.textContent = "他崩了！";
            ui.resolutionLabel.classList.remove("resolution-label--pop", "resolution-label--step-1");
            void ui.resolutionLabel.offsetWidth;
            ui.resolutionLabel.classList.add("resolution-label--pop", "resolution-label--enemy-break", "resolution-label--step-2");
          }, RESOLUTION_LABEL_STEP1_GAP_MS);
        } else if (showResultThenLethalKill && resultText) {
          ui.resolutionLabel.textContent = resultText;
          void ui.resolutionLabel.offsetWidth;
          ui.resolutionLabel.classList.add("resolution-label--pop", "resolution-label--step-1");
          resolutionFirstStrikeTimer = window.setTimeout(() => {
            resolutionFirstStrikeTimer = null;
            if (!ui?.resolutionLabel) return;
            ui.resolutionLabel.textContent = "击杀！";
            ui.resolutionLabel.classList.remove("resolution-label--pop", "resolution-label--step-1");
            void ui.resolutionLabel.offsetWidth;
            ui.resolutionLabel.classList.add("resolution-label--pop", "resolution-label--lethal-kill", "resolution-label--step-2");
          }, RESOLUTION_LABEL_STEP1_GAP_MS);
        } else {
          ui.resolutionLabel.textContent = resultText;
          void ui.resolutionLabel.offsetWidth;
          ui.resolutionLabel.classList.add("resolution-label--pop", "resolution-label--step-1");
        }
      }

      resolutionPhase2Timer = window.setTimeout(() => {
        resolutionPhase2Timer = null;
        (async () => {
          try {
            const plan = buildCardFxPlanFromSegment(state, bundle, segment);
            const forceFullFx = isLast && isSegmentEnemyKillingBlow(state, bundle, segment);
            await playCardFxSequence(ui, plan, { forceFullFx });
          } catch (_) {
            /* ignore */
          }
          resolutionAnimResolve = null;
          if (isLast) {
            cancelResolutionAnimation(ui);
          } else {
            prepareNextResolutionSegment(ui);
          }
          resolve();
        })();
      }, resultPhaseMs);
    }, RESOLUTION_CLASH_PHASE_MS);
  });
}

async function playResolutionAnimation(state, bundle, ui) {
  if (!ui?.resolutionLayer) return Promise.resolve();
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    await playLethalSlashFxIfSkippedResolution(state, bundle, ui);
    return Promise.resolve();
  }

  const segments = buildResolutionSegments(state, bundle);
  if (!segments.length) return Promise.resolve();

  setupBattleResolutionLayer(state, ui, segments);

  for (let i = 0; i < segments.length; i++) {
    await playOneResolutionSegment(state, bundle, ui, segments[i], i === segments.length - 1);
  }
}

function commitTurnResolutionBundle(state, bundle, ui) {
  if (bundle?.targetId) state.targetId = bundle.targetId;
  onPlayerAction(state, ui, bundle.playerAction, { bundle });
  delete bundle._restEarlyHeal;
  delete bundle._playedResolutionClashAnim;
}

/**
 * 本回合需要敌方行动的存活未破绽敌人，须与对拼段一一对应；否则存在「无动画但仍需结算」的意图（如调整），只能播完后统一结算。
 * 防御：与 onPlayerAction 一致按槽位甲→乙→丙。盾反：重击槽优先，其余甲→乙→丙；每位在场敌人一段（含 outcome none，如调整）；段序与 id 须与 segments 一致。
 */
function resolutionSegmentsCoverAllActingEnemies(state, segments, bundle) {
  const outcomes = bundle?.enemyOutcomes || [];
  const pa = bundle?.playerAction;
  if (pa === "defend" || pa === "block") {
    let actingRows = outcomes.filter((r) => {
      const eo = state.enemies.find((e) => e.id === r.id);
      return eo && !eo.waitingToEnter && eo.fighter.hp > 0 && !eo.fighter.broken;
    });
    if (pa === "block") {
      actingRows = sortEnemyOutcomeRowsForBlockClashOrder(state, actingRows);
    }
    if (actingRows.length !== segments?.length) return false;
    for (let i = 0; i < actingRows.length; i++) {
      if (actingRows[i].id !== segments[i]?.enemyRow?.id) return false;
    }
    return actingRows.length > 0;
  }
  const acting = state.enemies.filter(
    (eo) => !eo.waitingToEnter && eo.fighter.hp > 0 && !eo.fighter.broken,
  );
  if (acting.length !== segments.length) return false;
  const ids = new Set(segments.map((s) => s.enemyRow?.id).filter(Boolean));
  return acting.every((eo) => ids.has(eo.id));
}

/**
 * 调息且场上存活敌均意图为「调整」：无快攻/重击交锋，不播对撞层；仅保留 queue 里已触发的玩家卡调息光效。
 */
function shouldSkipBattleClashForRestWhenAllEnemiesAdjust(state, bundle) {
  if (bundle.playerAction !== "rest") return false;
  const alive = state.enemies.filter((eo) => !eo.waitingToEnter && eo.fighter.hp > 0);
  if (!alive.length) return false;
  return alive.every((eo) => eo.intent === "adjust");
}

/**
 * 多段对拼是否与「每段动画后提交数值」兼容。
 * 重击被快攻打断时动画顺序与「先攻目标再全场」的数值顺序不一致，仍保持播完再一次性结算。
 */
function shouldCommitBattlePerResolutionSegment(bundle, segmentCount, state, segments) {
  if (!segmentCount || segmentCount <= 1) return false;
  if (!segments || !resolutionSegmentsCoverAllActingEnemies(state, segments, bundle)) return false;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) return false;
  const pa = bundle.playerAction;
  const rng = state._turnRng;
  if (pa === "heavy" && rng?.heavyQuickInterruptSuccess && bundle.heavyInterruptEnemyId) return false;
  return true;
}

/**
 * 进入对拼层：与 playResolutionAnimation 共用（锚点、遮罩）。
 */
function setupBattleResolutionLayer(state, ui, segments) {
  if (!ui?.resolutionLayer || !segments?.length) return;
  cancelResolutionAnimation(ui);
  syncBattleResolutionAnchor(ui);
  ui.battleInfoPanel?.classList.add("is-resolving");
  ui.resolutionLayer.hidden = false;
  ui.resolutionLayer.setAttribute("aria-hidden", "false");
}

/**
 * 多段对拼中：本段已把某敌打入破绽且可处决，且还有待播段 → 暂停对撞，先回战斗让玩家处决该敌。
 */
function shouldPauseMultiEnemyResolutionForExecute(state, segments, segmentIndex) {
  if (segmentIndex >= segments.length - 1) return false;
  if (state.player.broken || state.player.hp <= 0) return false;
  const id = segments[segmentIndex]?.enemyRow?.id;
  if (!id) return false;
  const eo = state.enemies.find((x) => x.id === id);
  if (!eo || eo.waitingToEnter || eo.fighter.hp <= 0) return false;
  if (!eo.fighter.broken || eo.canExecutePlayer) return false;
  return true;
}

/**
 * 处决成功后继续播完多段对撞剩余段并收尾本回合（与 commitTurnResolutionBundlePerSegment _finalize 一致）。
 */
async function resumePendingMultiEnemyResolution(state, ui) {
  const p = state._pendingMultiEnemyResolution;
  if (!p) return;
  const { bundle, segments, turnCtx, nextIndex } = p;
  state._pendingMultiEnemyResolution = null;

  if (!state.enemies.some((x) => !x.waitingToEnter && x.fighter.hp > 0)) {
    refreshIntents(state);
    refreshTips(state);
    return;
  }
  if (nextIndex >= segments.length) {
    refreshIntents(state);
    refreshTips(state);
    return;
  }

  state._battleClashAnimating = true;
  state.phase = "resolving";
  for (const k of ["actAttack", "actHeavy", "actDefend", "actBlock", "actRest"]) {
    if (ui[k]) ui[k].disabled = true;
  }
  if (ui.actExecuteA) ui.actExecuteA.disabled = true;
  if (ui.actExecuteB) ui.actExecuteB.disabled = true;
  if (ui.actExecuteC) ui.actExecuteC.disabled = true;
  render(state, ui);

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    for (let i = nextIndex; i < segments.length; i++) {
      applyBattleTurnResolutionSegment(state, ui, turnCtx, bundle, segments, i);
      pushMeterFloatsAndAdvanceSnap(state, ui, turnCtx.meterFloatSnap);
      render(state, ui);
      if (turnCtx.playerBrokenAtEnemyPhaseStart && (state.player.hp | 0) <= 0) break;
    }
    finalizeBattleTurnAfterResolutionSegments(state, ui, bundle, turnCtx, {
      skipTurnClockAdvance: true,
    });
  } else {
    setupBattleResolutionLayer(state, ui, segments);
    for (let i = nextIndex; i < segments.length; i++) {
      await playOneResolutionSegment(state, bundle, ui, segments[i], i === segments.length - 1);
      applyBattleTurnResolutionSegment(state, ui, turnCtx, bundle, segments, i);
      pushMeterFloatsAndAdvanceSnap(state, ui, turnCtx.meterFloatSnap);
      render(state, ui);
      if (turnCtx.playerBrokenAtEnemyPhaseStart && (state.player.hp | 0) <= 0) {
        cancelResolutionAnimation(ui);
        break;
      }
    }
    finalizeBattleTurnAfterResolutionSegments(state, ui, bundle, turnCtx, {
      skipTurnClockAdvance: true,
    });
  }

  // finalize 因 skip 未推进原行动整回合；中途插入的处决不计入回合钟；此处补本回合主行动结束时的 +1，勿再调 advance（避免调息扣两次）
  state.globalTurn += 1;

  refreshTips(state);

  state._battleClashAnimating = false;
  if (state.phase === "resolving") state.phase = "fight";
  render(state, ui);
}

/**
 * 多段对拼：每段动画结束后立刻提交对应数值，再播下一段。
 * @returns {Promise<{ paused?: boolean, nextIndex?: number, pauseEnemyId?: string }|void>}
 */
async function playResolutionAnimationPerSegmentCommit(state, bundle, ui, turnCtx, segments, onCommittedSegment) {
  if (!ui?.resolutionLayer || !segments?.length) return { paused: false };
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) {
    await playLethalSlashFxIfSkippedResolution(state, bundle, ui);
    return { paused: false };
  }
  setupBattleResolutionLayer(state, ui, segments);
  for (let i = 0; i < segments.length; i++) {
    await playOneResolutionSegment(state, bundle, ui, segments[i], i === segments.length - 1);
    onCommittedSegment(i, segments);
    if (shouldPauseMultiEnemyResolutionForExecute(state, segments, i)) {
      return {
        paused: true,
        nextIndex: i + 1,
        pauseEnemyId: segments[i].enemyRow.id,
      };
    }
    if (turnCtx.playerBrokenAtEnemyPhaseStart && (state.player.hp | 0) <= 0) {
      cancelResolutionAnimation(ui);
      break;
    }
  }
  return { paused: false };
}

/**
 * 敌方阶段开始快照：与 onPlayerAction 中「玩家行动之后、敌出手之前」一致。
 */
function ensurePlayerHpAtEnemyPhaseStartSnapshot(turnCtx, state) {
  if (turnCtx.playerHpAtEnemyPhaseStart != null) return;
  turnCtx.playerHpAtEnemyPhaseStart = state.player.hp;
  turnCtx.playerHpAtEnemyPhaseStartForDeathAnim = state.player.hp;
  turnCtx.playerBrokenAtEnemyPhaseStart = !!state.player.broken;
}

/**
 * 提交单段对拼对应的数值（与 buildResolutionSegments 顺序一致；快攻/重击首段含我方出手 + 该敌反击）。
 */
function applyBattleTurnResolutionSegment(state, ui, turnCtx, bundle, segments, segmentIndex) {
  const action = bundle.playerAction;
  const rolled = turnCtx.rolled;
  const { meritTurn, details, targetId } = turnCtx;
  // 每回合重置“快攻打断重击”标记（T15）
  if (segmentIndex === 0) state._attackInterruptedHeavyTargetId = null;
  const seg = segments[segmentIndex];
  const enemyRow = seg?.enemyRow;
  if (!enemyRow?.id) return;
  const eo = state.enemies.find((x) => x.id === enemyRow.id);
  if (!eo || eo.waitingToEnter || eo.fighter.hp <= 0) return;

  if (action === "rest" && segmentIndex === 0) {
    if (bundle._restEarlyHeal) {
      meritTurn.healDoneTotal = (meritTurn.healDoneTotal || 0) + (bundle._restEarlyHeal.healed || 0);
      details.push(`→ 你调息：{g}HP+${bundle._restEarlyHeal.healed}{/g} {g}失衡-1{/g}`);
    } else {
      const healed = applyHeal(state.player, ns(2));
      meritTurn.healDoneTotal = (meritTurn.healDoneTotal || 0) + healed;
      changeStagger(state.player, -1);
      details.push(`→ 你调息：{g}HP+${healed}{/g} {g}失衡-1{/g}`);
    }
  }

  if (action === "attack" || action === "heavy") {
    if (segmentIndex === 0) {
      const tgt = state.enemies.find((x) => x.id === targetId);
      if (tgt && tgt.fighter.hp > 0) {
        const heavyQuickInterruptSuccess = turnCtx.heavyQuickInterruptSuccess;
        if (action === "heavy" && heavyQuickInterruptSuccess) {
          const st0 = tgt.fighter.stagger | 0;
          const br0 = !!tgt.fighter.broken;
          const r = applyPlayerToEnemy(state, tgt, "attack", targetId);
          meritAccPlayerToEnemyHit(meritTurn, r, st0, br0);
          meritTurn.hadPlayerHit = meritTurn.hadPlayerHit || !!r.hit;
          meritTurn.enemyStaggerGainedTotal += r.eStg || 0;
          if (r.flags?.punish_adjust) meritTurn._punishAdjust = true;
          details.push(
            `→ 对${tgt.fighter.name}：重击被敌方快攻打断，{o}改按快攻结算{/o}：伤害-{g}${r.eDmg}{/g} 失衡+{g}${r.eStg}{/g}${r.notes.length ? `【${r.notes.join("；")}】` : ""}`,
          );
          meritTurn.heavyInterrupted = true;
        } else {
          const st0 = tgt.fighter.stagger | 0;
          const br0 = !!tgt.fighter.broken;
          const r = applyPlayerToEnemy(state, tgt, action, targetId);
          meritAccPlayerToEnemyHit(meritTurn, r, st0, br0);
          meritTurn.hadPlayerHit = meritTurn.hadPlayerHit || !!r.hit;
          meritTurn.enemyStaggerGainedTotal += r.eStg || 0;
          if (r.flags?.break_defense) meritTurn._breakDefense = true;
          if (r.flags?.punish_adjust) meritTurn._punishAdjust = true;
          if (r.eDmg || r.eStg || r.notes.length) {
            details.push(
              `→ 对${tgt.fighter.name}：伤害-{g}${r.eDmg}{/g} 失衡+{g}${r.eStg}{/g}${r.notes.length ? `【${r.notes.join("；")}】` : ""}`,
            );
          }
          if ((tgt.intent === "defend" || tgt.intent === "block") && r.eDmg === 0) {
            addStagger(tgt.fighter, 1);
            details.push(`→ ${tgt.fighter.name}稳住架势且未受伤：失衡 +1。`);
          }
        }
      } else {
        details.push("→ 进攻失败：目标已倒下。");
      }
    }
  }

  ensurePlayerHpAtEnemyPhaseStartSnapshot(turnCtx, state);

  const defendFailedThisTurn = turnCtx.defendFailedThisTurn;
  const blockFailedThisTurn = turnCtx.blockFailedThisTurn;
  /** 多段对拼可能跨「处决插入」后再结算后续敌；须用 bundle 内本回合意图快照，勿用 refresh 后的意图 */
  const intentHeld = eo.intent;
  if (enemyRow.intent != null) eo.intent = enemyRow.intent;
  const hpBeforeEnemyHit = state.player.hp;
  const stBeforeEnemyHit = state.player.stagger;
  let r;
  try {
    r = resolveEnemyAgainstPlayer(
      state,
      eo,
      action,
      targetId,
      defendFailedThisTurn,
      blockFailedThisTurn,
      turnCtx.playerHpAtEnemyPhaseStart,
      rolled,
      !!turnCtx.playerBrokenAtEnemyPhaseStart,
    );
  } finally {
    eo.intent = intentHeld;
  }
  if (hpBeforeEnemyHit > 0 && state.player.hp <= 0) {
    turnCtx.playerHpBeforeLethalForDeathAnim = hpBeforeEnemyHit;
    turnCtx.playerStaggerBeforeLethalForDeathAnim = stBeforeEnemyHit;
  }
  turnCtx.damageTakenThisTurn += r.pDmg || 0;
  meritTurn.damageMitigatedTotal = (meritTurn.damageMitigatedTotal || 0) + (r.meritMitigatedHp || 0);
  if (r.blockSuccess) {
    turnCtx.anyBlockSuccess = true;
    turnCtx.blockSuccessCount += 1;
  }
  if (r.gotHit && r.effectiveIntent === "quick") meritTurn.gotHitQuick = true;
  if (r.gotHit && r.effectiveIntent === "heavy") meritTurn.gotHitHeavy = true;
  if (
    action === "attack" &&
    eo.id === targetId &&
    (enemyRow.intent ?? intentHeld) === "heavy" &&
    r.effectiveIntent === "quick"
  ) {
    meritTurn.interruptHeavy = true;
  }
  if (r.restEvade && r.notes.length) {
    details.push(`→ ${eo.fighter.name}对你：${r.notes.join("；")}`);
  } else if (r.pDmg || r.pStg || r.notes.length) {
    details.push(
      `→ ${eo.fighter.name}对你：伤害-{r}${r.pDmg}{/r} 失衡+{r}${r.pStg}{/r}${r.notes.length ? `【${r.notes.join("；")}】` : ""}`,
    );
  }
  if ((enemyRow.intent ?? intentHeld) === "adjust") {
    triggerEnemyAdjustRestFxOnCard(ui, eo.id);
  }
}

/**
 * 多段对拼收尾：敌方阶段后的共通逻辑 + 回合末（战功、胜负、推进）。
 * @param {{ skipTurnClockAdvance?: boolean }} [opts] 为 true 时不推进回合钟（分段提交时由续播收尾等处统一 +1；处决本身不计入回合）。
 */
function finalizeBattleTurnAfterResolutionSegments(state, ui, bundle, turnCtx, opts = {}) {
  const action = bundle.playerAction;
  const {
    rolled,
    meritTurn,
    details,
    targetId,
    intents,
    enemyHpAtActionStart,
    playerBrokenAtActionStart,
    heavyQuickInterruptSuccess,
    enemyStgAtActionStart,
    enemyBrokenAtActionStart,
    emitBattleMeterFloats,
  } = turnCtx;
  let damageTakenThisTurn = turnCtx.damageTakenThisTurn;
  const anyBlockSuccess = turnCtx.anyBlockSuccess;
  const blockSuccessCount = turnCtx.blockSuccessCount || 0;
  let playerHpAtEnemyPhaseStartForDeathAnim = turnCtx.playerHpAtEnemyPhaseStartForDeathAnim;

  if (action !== "execute") {
    if (damageTakenThisTurn === 0) {
      if (action === "defend") {
        addStagger(state.player, 1, state);
        details.push("→ 你稳稳守住且未受伤：失衡 +1。");
      } else if (action === "block" && blockSuccessCount > 0) {
        addStagger(state.player, blockSuccessCount, state);
        details.push(
          blockSuccessCount === 1
            ? "→ 若未受伤，盾反成功：自己失衡 +1。"
            : `→ 若未受伤，盾反成功：自己失衡 +${blockSuccessCount}（可叠加）。`,
        );
      }
    }
    applyBlockReliefPerkAfterEnemyPhase(state, details, blockSuccessCount, ui, turnCtx.meterFloatSnap);

    // ===== 第二批技法卡：敌方阶段后触发（T17-T22） =====
    // T17：防御成功承受攻击后，自己失衡 -1
    if (state.perks?.includes("perk_defend_relief")) {
      if (action === "defend" && !meritTurn.defendFailedThisTurn && damageTakenThisTurn > 0) {
        const before = state.player.stagger;
        changeStagger(state.player, -1);
        const reduced = before - state.player.stagger;
        if (reduced > 0) details.push("→ 定步卸力：防御成功承受攻击后，你的失衡 -1。");
      }
    }
    // T18：盾反成功后恢复生命
    if (state.perks?.includes("perk_block_heal")) {
      if (action === "block" && anyBlockSuccess) {
        const healed = applyHeal(state.player, ns(1));
        if (healed > 0) details.push(`→ 盾后回气：盾反成功，{g}HP+${healed}{/g}。`);
      }
    }
    // T19：调息成功（未受伤）额外失衡 -1
    if (state.perks?.includes("perk_rest_extra_stagger_down")) {
      if (action === "rest" && damageTakenThisTurn === 0) {
        const before = state.player.stagger;
        changeStagger(state.player, -1);
        const reduced = before - state.player.stagger;
        if (reduced > 0) details.push("→ 静息归元：调息成功，额外失衡 -1。");
      }
    }
    // T20：HP<30% 且防御成功后恢复生命
    if (state.perks?.includes("perk_lowhp_defend_heal")) {
      const hpAtEnemyPhaseStart = turnCtx.playerHpAtEnemyPhaseStart ?? state.player.hp;
      const lowHp = hpAtEnemyPhaseStart > 0 && state.player.hpMax > 0 && hpAtEnemyPhaseStart / state.player.hpMax < 0.3;
      if (lowHp && action === "defend" && damageTakenThisTurn === 0 && !meritTurn.defendFailedThisTurn) {
        const healed = applyHeal(state.player, ns(1));
        if (healed > 0) details.push(`→ 危桥守命：低血防御成功，{g}HP+${healed}{/g}。`);
      }
    }
    // T22：本回合未受伤 → 下回合第一次快攻额外伤害
    if (state.perks?.includes("perk_no_damage_next_attack")) {
      if (damageTakenThisTurn === 0) {
        state._noDamageNextAttackPending = true;
      }
    }
    if (state.perks?.includes("perk_rest_next_heavy") && action === "rest" && damageTakenThisTurn === 0) {
      state._restNextHeavyBonusPending = true;
    }
    if (state.perks?.includes("perk_rest_next_defend") && action === "rest" && damageTakenThisTurn === 0) {
      state._restDefendBonusCharges = 1;
    }
    if (state.perks?.includes("perk_block_next_heavy") && action === "block" && anyBlockSuccess) {
      state._blockNextHeavyBonusPending = true;
    }
    if (state.perks?.includes("perk_block_next_attack_stagger") && action === "block" && anyBlockSuccess) {
      state._blockNextAttackStaggerPending = true;
    }
    if (state.perks?.includes("perk_peaceful_heart")) {
      if (damageTakenThisTurn === 0) {
        state._peacefulHeartNoDamageTurns = (state._peacefulHeartNoDamageTurns || 0) + 1;
        if (state._peacefulHeartNoDamageTurns >= 2) {
          state._peacefulHeartNoDamageTurns = 0;
          const healed = applyHeal(state.player, ns(1));
          if (healed > 0) {
            details.push(`→ 守静归心：连续两回合未受伤，{g}HP+${healed}{/g}。`);
            pushMeterFloatsAndAdvanceSnap(state, ui, turnCtx.meterFloatSnap);
          }
        }
      } else {
        state._peacefulHeartNoDamageTurns = 0;
      }
    }

    const execBoss = findBossExecutePlayerExecutor(state);
    if (state.player.broken && state.player.hp > 0 && execBoss) {
      runBossExecutePlayerDrama(state, ui, {
        action,
        targetId,
        intents,
        details,
        playerHpAtEnemyPhaseStartForDeathAnim,
      });
      return;
    }
  }

  if (action === "block") {
    const anyHeavyIntent = state.enemies.some((eo) => intents[eo.id] === "heavy");
    const anyQuickIntent = state.enemies.some((eo) => intents[eo.id] === "quick");
    if (anyHeavyIntent && anyBlockSuccess) {
      tutorialOnce(state, "B1_block_vs_heavy_trigger", "教学：盾反成功只针对重击——这就是反制窗口。");
    }
    if (anyQuickIntent) {
      tutorialOnce(state, "B1_block_vs_quick_trigger", "教学：对快攻盾反会失败——快攻回合优先防御或快攻抢节奏。");
    }
  }

  const anyEnemyBroken = state.enemies.some(
    (eo) => !eo.waitingToEnter && eo.fighter.hp > 0 && eo.fighter.broken,
  );
  if (anyEnemyBroken) {
    tutorialOnce(state, "B1_broken_execute_trigger", "教学：敌人进入破绽后，卡片上会出现“处决”按钮用于收束。");
  }

  if (state.player.broken) {
    details.push("→ {r}你失衡过高，进入破绽（将于回合结束强制清零）。{/r}");
    if (state.perks?.includes("perk_brokenfirstshield") && state.brokenFirstShieldCharges <= 0) {
      state.brokenFirstShieldCharges = 1;
    }
  }

  const executed = turnCtx.executed;
  for (const eo of state.enemies) {
    if (executed[eo.id]) continue;
    if (endOfTurnForceClearBroken(eo.fighter)) {
      details.push(`→ {g}${eo.fighter.name}破绽消失（失衡清零）。{/g}`);
    }
  }
  if (endOfTurnForceClearBroken(state.player)) {
    details.push("→ {g}你的破绽消失（失衡清零）。{/g}");
  }
  meritTurn.damageTakenThisTurn = damageTakenThisTurn;
  meritTurn.anyBlockSuccess = anyBlockSuccess;
  meritTurn.selfBrokenThisTurn = !playerBrokenAtActionStart && !!state.player.broken;
  meritTurn.justRecoveredFromBrokenNext = playerBrokenAtActionStart && !state.player.broken;
  // 清理本回合“快攻打断重击”的标记（用于 T15）
  state._attackInterruptedHeavyTargetId = null;

  if (state.battle && Array.isArray(state.battle.reserve) && state.battle.reserve.length) {
    const slotReserveLabel = { A: "甲位", B: "乙位", C: "丙位" };
    for (const slot of state.enemies) {
      if (slot.waitingToEnter) continue;
      if (slot.fighter.hp > 0) continue;
      const next = state.battle.reserve.shift();
      if (!next) break;
      const replaced = mkEnemyFromDef(next, slot.id);
      slot.fighter = replaced.fighter;
      slot.ai = replaced.ai;
      slot.archetype = replaced.archetype;
      slot.intent = /** @type {EnemyIntent} */ ("adjust");
      details.push(
        `→ {o}后备敌人加入：${slotReserveLabel[slot.id] || String(slot.id)}替换为${slot.fighter.name}。{/o}`,
      );
    }
  }

  deploySequentialSecondIfNeeded(state, details);

  {
    const ctx = state._meritTurnContext;
    const battleId = state.battle?.battleNodeId || ctx?.battleId || null;
    const isMeritBattle =
      battleId === "B1" || battleId === "B2" || battleId === "E1" || battleId === "B3" || battleId === "BOSS";
    if (ctx && isMeritBattle) {
      const aliveEnemies = state.enemies.filter((eo) => !eo.waitingToEnter && eo.fighter.hp > 0);
      const aliveEnemyCountEnd = aliveEnemies.length;

      let enemyStaggerGainedTotal = 0;
      for (const eo of state.enemies) {
        const before = enemyStgAtActionStart?.[eo.id] ?? eo.fighter.stagger;
        const after = eo.fighter.stagger ?? before;
        enemyStaggerGainedTotal += Math.max(0, after - before);
      }

      let anyEnemyBrokenNew = false;
      for (const eo of state.enemies) {
        const b0 = !!enemyBrokenAtActionStart?.[eo.id];
        const b1 = !!eo.fighter.broken;
        if (!b0 && b1 && eo.fighter.hp > 0) anyEnemyBrokenNew = true;
      }

      const justRecoveredFromBrokenNext = playerBrokenAtActionStart && !state.player.broken;

      const anyHeavyIntent = state.enemies.some((eo) => intents?.[eo.id] === "heavy");
      const anyQuickIntent = state.enemies.some((eo) => intents?.[eo.id] === "quick");

      const pressureChain =
        !!meritTurn.hadPlayerHit &&
        !!targetId &&
        ctx.lastTurnHadHit &&
        ctx.lastTargetId &&
        ctx.lastTargetId === targetId;
      if (targetId && meritTurn.hadPlayerHit) ctx.lastTargetId = targetId;

      let executeKind = null;
      let executeFinishBonus = false;

      applyTurnMeritResult(state, ui, ctx, {
        action,
        targetId,
        targetIntent: targetId ? intents?.[targetId] : null,
        hadPlayerHit: !!meritTurn.hadPlayerHit,
        damageTakenThisTurn,
        defendFailedThisTurn: meritTurn.defendFailedThisTurn,
        blockFailedThisTurn: meritTurn.blockFailedThisTurn,
        anyBlockSuccess,
        anyHeavyIntent,
        anyQuickIntent,
        heavyInterrupted: !!meritTurn.heavyInterrupted || !!heavyQuickInterruptSuccess,
        interruptHeavy: meritTurn.interruptHeavy,
        enemyStaggerGainedTotal: meritTurn.enemyStaggerGainedTotal || enemyStaggerGainedTotal,
        anyEnemyBrokenNew,
        executeKind: meritTurn.executeKind || executeKind,
        executeFinishBonus: meritTurn.executeFinishBonus || executeFinishBonus,
        pressureChain,
        counterHeavy: action === "block" && anyBlockSuccess && anyHeavyIntent,
        counterQuickDefend:
          action === "defend" && damageTakenThisTurn === 0 && !meritTurn.defendFailedThisTurn && anyQuickIntent,
        breakDefense: !!meritTurn._breakDefense,
        punishAdjust: !!meritTurn._punishAdjust,
        blockFailVsQuick: action === "block" && meritTurn.blockFailedThisTurn && anyQuickIntent,
        blockWhiff: action === "block" && !anyHeavyIntent,
        playerHpEnd: state.player.hp,
        playerHpMax: state.player.hpMax,
        aliveEnemyCountEnd,
        justRecoveredFromBroken: !!ctx.justRecoveredFromBroken,
        justRecoveredFromBrokenNext,
        gotHitQuick: meritTurn.gotHitQuick,
        gotHitHeavy: meritTurn.gotHitHeavy,
        selfBrokenThisTurn: meritTurn.selfBrokenThisTurn,
        bossExecuteTaken: !!state._meritBossExecuteTakenThisTurn,
        damageDealtTotal: meritTurn.damageDealtTotal || 0,
        damageMitigatedTotal: meritTurn.damageMitigatedTotal || 0,
        healDoneTotal: meritTurn.healDoneTotal || 0,
        hitsOnStaggeredEnemy: meritTurn.hitsOnStaggeredEnemy || 0,
      });

      state._meritBossExecuteTakenThisTurn = false;
    }
  }

  const over = isBattleOver(state);
  if (over) {
    state.battleLog.push(formatLineForTurn(state, action, targetId, intents, details));
    if (over === "win" && !state.endingArmed) {
      state.endingArmed = true;
      const killedIds = state.enemies
        .filter(
          (eo) =>
            !eo.waitingToEnter && enemyHpAtActionStart[eo.id] > 0 && eo.fighter.hp <= 0,
        )
        .map((eo) => eo.id);

      const beginWinEnding = () => {
        state.phase = "ending";
        state.player.broken = false;
        state.player.brokenTurnsLeft = 0;
        render(state, ui);
        runEndingHealMeterAnim(state, ui, () => {
          if (state.phase !== "ending") return;
          state.endingArmed = false;
          finish(state, ui, "win");
          render(state, ui);
        });
      };

      if (!killedIds.length) {
        emitBattleMeterFloats();
        beginWinEnding();
        return;
      }

      if (state._winKillRevealTimer) {
        clearTimeout(state._winKillRevealTimer);
        state._winKillRevealTimer = null;
      }
      state._winKillRevealGen += 1;
      const revealGen = state._winKillRevealGen;
      state._winKillRevealEnemyIds = killedIds;
      const revealMs = action === "execute" ? WIN_KILL_REVEAL_MS_EXEC : WIN_KILL_REVEAL_MS_HIT;
      emitBattleMeterFloats();
      render(state, ui);
      state._winKillRevealTimer = window.setTimeout(() => {
        state._winKillRevealTimer = null;
        if (revealGen !== state._winKillRevealGen) return;
        state._winKillRevealEnemyIds = null;
        beginWinEnding();
      }, revealMs);
      return;
    }
    if (over === "lose" && !state.endingLoseArmed) {
      state.endingLoseArmed = true;
      state.phase = "endingLose";
      state.player.broken = false;
      state.player.brokenTurnsLeft = 0;
      document.body.classList.add("ending-slowmo");
      triggerDeathBlowFx(ui);
      emitBattleMeterFloats();
      const hpDeath =
        turnCtx.playerHpBeforeLethalForDeathAnim != null
          ? turnCtx.playerHpBeforeLethalForDeathAnim
          : playerHpAtEnemyPhaseStartForDeathAnim;
      const stDeath =
        turnCtx.playerStaggerBeforeLethalForDeathAnim != null
          ? turnCtx.playerStaggerBeforeLethalForDeathAnim
          : state.player.stagger;
      state._endingDeathAnimating = true;
      render(state, ui);
      runEndingDeathMeterAnim(
        state,
        ui,
        hpDeath,
        () => {
          if (state.phase !== "endingLose") return;
          state.endingLoseArmed = false;
          finish(state, ui, "lose");
          render(state, ui);
        },
        { staggerStart: stDeath },
      );
      return;
    }
    emitBattleMeterFloats();
    finish(state, ui, over);
    render(state, ui);
    return;
  }

  const cur = state.enemies.find((x) => x.id === state.targetId);
  if (!cur || cur.waitingToEnter || cur.fighter.hp <= 0) {
    const next = state.enemies.find((x) => !x.waitingToEnter && x.fighter.hp > 0);
    if (next) state.targetId = next.id;
  }

  state.battleLog.push(formatLineForTurn(state, action, targetId, intents, details));

  state._noDamageLastTurn = damageTakenThisTurn === 0;
  state._lastPlayerActionWasAttack = action === "attack";

  if (!opts.skipTurnClockAdvance) {
    advanceBattleTurnAfterPlayerAction(state, action, opts);
  }
  refreshIntents(state);
  refreshTips(state);
  emitBattleMeterFloats();
  render(state, ui);
}

/**
 * 多段对拼：初始化与 onPlayerAction 相同的上下文（已消耗 state._turnRng）。
 */
function initBattleTurnContextForResolving(state, ui, action, bundle = null) {
  clearB1HintTimer();
  clearB1ActionHintHighlight(ui);
  if (state.phase === BOSS_EXEC_PLAYER_DRAMA_PHASE) return null;
  if (state.phase !== "fight" && state.phase !== "resolving") return null;
  if (state.endingArmed) return null;
  if (state.player.hp <= 0) return null;
  if (!state.enemies.some((x) => !x.waitingToEnter && x.fighter.hp > 0)) return null;
  if (action === "rest" && (state.player.restCooldownLeft || 0) > 0) return null;

  const rolled = state._turnRng;
  state._turnRng = null;

  const restEarly = action === "rest" && bundle?._restEarlyHeal;

  const enemyHpAtActionStart = Object.fromEntries(state.enemies.map((eo) => [eo.id, eo.fighter.hp]));
  const enemyStgAtActionStart = Object.fromEntries(state.enemies.map((eo) => [eo.id, eo.fighter.stagger]));
  const enemyBrokenAtActionStart = Object.fromEntries(state.enemies.map((eo) => [eo.id, !!eo.fighter.broken]));
  const enemyWaitingAtStart = Object.fromEntries(state.enemies.map((eo) => [eo.id, !!eo.waitingToEnter]));
  const playerHpAtActionStart = restEarly ? restEarly.snapshot.playerHp : state.player.hp;
  const playerStaggerAtActionStart = restEarly ? restEarly.snapshot.playerStg : state.player.stagger;
  const playerBrokenAtActionStart = !!state.player.broken;

  const meterFloatSnap = {
    playerHp: restEarly ? state.player.hp : playerHpAtActionStart,
    playerStg: restEarly ? state.player.stagger : playerStaggerAtActionStart,
    enemyHp: enemyHpAtActionStart,
    enemyStg: enemyStgAtActionStart,
    enemyWaitingAtStart,
  };
  const emitBattleMeterFloats = () => pushBattleMeterFloats(state, ui, meterFloatSnap);

  const intents = Object.fromEntries(state.enemies.map((eo) => [eo.id, eo.intent]));
  const executed = {};
  for (const eo of state.enemies) executed[eo.id] = false;

  const details = [];
  const meritTurn = {
    action,
    targetId: null,
    targetIntent: null,
    hadPlayerHit: false,
    enemyStaggerGainedTotal: 0,
    anyEnemyBrokenNew: false,
    executeKind: null,
    executeFinishBonus: false,
    interruptHeavy: false,
    anyHeavyIntent: false,
    anyQuickIntent: false,
    anyBlockSuccess: false,
    blockFailedThisTurn: false,
    defendFailedThisTurn: false,
    heavyInterrupted: false,
    damageTakenThisTurn: 0,
    gotHitQuick: false,
    gotHitHeavy: false,
    selfBrokenThisTurn: false,
    bossExecuteTaken: false,
    pressureChain: false,
    aliveEnemyCountEnd: 0,
    playerHpEnd: 0,
    playerHpMax: 0,
    justRecoveredFromBrokenNext: false,
    damageDealtTotal: 0,
    damageMitigatedTotal: 0,
    healDoneTotal: 0,
    hitsOnStaggeredEnemy: 0,
  };

  const tgtObj = state.enemies.find((x) => x.id === state.targetId);
  const fallbackEnemyName = { A: "敌人甲", B: "敌人乙", C: "敌人丙" };
  const targetName = tgtObj?.fighter?.name || fallbackEnemyName[state.targetId] || "敌人";
  const actionFlavor = {
    attack: `你踏前半步，刀光一闪，直取${targetName}的破绽。`,
    heavy: `你沉肩蓄力，横刀猛压，试图击溃${targetName}的架势。`,
    defend: "你收刀护身，稳住下盘，准备接下对方的来势。",
    block: "你抬刀立势，试图用盾反打乱对方重击的节奏。",
    execute: `你逼近一步，寻找能一刀了结${targetName}的机会。`,
    rest: "你深吸一口气，调匀呼吸与步伐，重新稳住架势。",
  };
  state.actionDesc = actionFlavor[action] || "—";
  state.battleLog.push(state.actionDesc);

  if (state.player.broken && (action === "attack" || action === "heavy" || action === "execute")) {
    details.push("→ 你已失衡，无法快攻、重击或处决：可调息、防御与盾反。");
    state.battleLog.push(formatLineForTurn(state, action, null, intents, details));
    render(state, ui);
    return null;
  }

  const targetId = action === "attack" || action === "heavy" || action === "execute" ? state.targetId : null;
  meritTurn.targetId = targetId;
  meritTurn.targetIntent = targetId ? intents?.[targetId] || null : null;

  const heavyQuickInterruptSuccess =
    rolled?.heavyQuickInterruptSuccess ??
    (action === "heavy" && enemyQuickThreatensPlayerHeavy(state) && Math.random() < INTERRUPT_QUICK_VS_HEAVY);

  const defendFailedThisTurn = false;
  const blockFailedThisTurn = false;
  if (action !== "execute") {
    meritTurn.defendFailedThisTurn = false;
    meritTurn.blockFailedThisTurn = false;
  }

  return {
    rolled,
    action,
    enemyHpAtActionStart,
    enemyStgAtActionStart,
    enemyBrokenAtActionStart,
    enemyWaitingAtStart,
    playerHpAtActionStart,
    playerStaggerAtActionStart,
    playerBrokenAtActionStart,
    meterFloatSnap,
    emitBattleMeterFloats,
    intents,
    executed,
    details,
    meritTurn,
    targetId,
    heavyQuickInterruptSuccess,
    defendFailedThisTurn,
    blockFailedThisTurn,
    damageTakenThisTurn: 0,
    anyBlockSuccess: false,
    /** 本回合盾反成功次数（多敌各判一次，用于未受伤时自身失衡 +N 叠乘） */
    blockSuccessCount: 0,
    playerHpAtEnemyPhaseStart: null,
    playerHpAtEnemyPhaseStartForDeathAnim: state.player.hp,
  };
}

function previewActionDescText(state, action) {
  const tgtObj = state.enemies.find((x) => x.id === state.targetId);
  const fallbackEnemyName = { A: "敌人甲", B: "敌人乙", C: "敌人丙" };
  const targetName = tgtObj?.fighter?.name || fallbackEnemyName[state.targetId] || "敌人";
  const actionFlavor = {
    attack: `你踏前半步，刀光一闪，直取${targetName}的破绽。`,
    heavy: `你沉肩蓄力，横刀猛压，试图击溃${targetName}的架势。`,
    defend: "你收刀护身，稳住下盘，准备接下对方的来势。",
    block: "你抬刀立势，试图用盾反打乱对方重击的节奏。",
    execute: `你逼近一步，寻找能一刀了结${targetName}的机会。`,
    rest: "你深吸一口气，调匀呼吸与步伐，重新稳住架势。",
  };
  return actionFlavor[action] || "—";
}

function syncPlayerCardFlavor(ui, state) {
  if (!ui?.playerCardFlavor) return;
  ui.playerCardFlavor.innerHTML = toRichHtml(state?._skillHoverFlavor || state?.actionDesc || "—");
}

const SKILL_HOVER_TOOLTIP_DELAY_MS = 500;
/** @type {ReturnType<typeof setTimeout>|null} */
let skillHoverTooltipTimer = null;
/** @type {HTMLElement|null} */
let skillHoverTooltipEl = null;
/** @type {HTMLElement|null} */
let skillHoverTooltipAnchor = null;
/** @type {string|null} */
let lastSkillTipUiPhase = null;

function ensureSkillHoverTooltipEl() {
  if (skillHoverTooltipEl && document.body.contains(skillHoverTooltipEl)) return skillHoverTooltipEl;
  const el = document.createElement("div");
  el.className = "skill-hover-tooltip";
  el.setAttribute("role", "tooltip");
  el.hidden = true;
  document.body.appendChild(el);
  skillHoverTooltipEl = el;
  return el;
}

function hideSkillHoverTooltip(state = null, ui = null) {
  if (skillHoverTooltipTimer) {
    window.clearTimeout(skillHoverTooltipTimer);
    skillHoverTooltipTimer = null;
  }
  if (state) state._skillHoverFlavor = null;
  if (state && ui) syncPlayerCardFlavor(ui, state);
  if (!skillHoverTooltipEl) return;
  skillHoverTooltipEl.classList.remove("is-visible");
  skillHoverTooltipEl.hidden = true;
  skillHoverTooltipAnchor = null;
}

function positionSkillHoverTooltip(anchor, tip) {
  const pad = 10;
  const gap = 10;
  const rect = anchor.getBoundingClientRect();
  tip.style.left = "0px";
  tip.style.top = "0px";
  tip.hidden = false;
  const tw = tip.offsetWidth;
  const th = tip.offsetHeight;

  let x = rect.left + rect.width / 2 - tw / 2;
  let y = rect.top - th - gap;

  // flip below if not enough room above
  if (y < pad) y = rect.bottom + gap;

  x = Math.max(pad, Math.min(x, window.innerWidth - tw - pad));
  y = Math.max(pad, Math.min(y, window.innerHeight - th - pad));

  tip.style.left = `${Math.round(x)}px`;
  tip.style.top = `${Math.round(y)}px`;
}

function showSkillHoverTooltipNow(state, ui, anchor, action) {
  const tip = ensureSkillHoverTooltipEl();
  skillHoverTooltipAnchor = anchor;

  const flavor = previewActionDescText(state, action);
  state._skillHoverFlavor = flavor;
  syncPlayerCardFlavor(ui, state);
  const hints = buildActionButtonEffectHints(state);
  const mech =
    action === "attack"
      ? hints.attack
      : action === "heavy"
        ? hints.heavy
        : action === "defend"
          ? hints.defend
          : action === "block"
            ? hints.block
            : action === "rest"
              ? hints.rest
              : "";

  tip.innerHTML = `
    <div class="skill-hover-tooltip__mech">${mech || escapeHtml("—")}</div>
  `;

  // measure + place
  requestAnimationFrame(() => {
    if (skillHoverTooltipAnchor !== anchor) return;
    positionSkillHoverTooltip(anchor, tip);
    tip.classList.add("is-visible");
  });
}

function armSkillHoverTooltip(state, ui, anchor, action) {
  hideSkillHoverTooltip(state, ui);
  skillHoverTooltipTimer = window.setTimeout(() => {
    skillHoverTooltipTimer = null;
    showSkillHoverTooltipNow(state, ui, anchor, action);
  }, SKILL_HOVER_TOOLTIP_DELAY_MS);
}

function commitTurnResolutionBundlePerSegment(state, bundle, ui) {
  if (bundle?.targetId) state.targetId = bundle.targetId;
  const segments = buildResolutionSegments(state, bundle);
  if (!segments.length) {
    onPlayerAction(state, ui, bundle.playerAction, { bundle });
    return;
  }
  if (!shouldCommitBattlePerResolutionSegment(bundle, segments.length, state, segments)) {
    onPlayerAction(state, ui, bundle.playerAction, { bundle });
    return;
  }
  const turnCtx = initBattleTurnContextForResolving(state, ui, bundle.playerAction, bundle);
  if (!turnCtx) {
    state._battleClashAnimating = false;
    if (state.phase === "resolving") state.phase = "fight";
    render(state, ui);
    return;
  }

  playResolutionAnimationPerSegmentCommit(state, bundle, ui, turnCtx, segments, (segmentIndex) => {
    applyBattleTurnResolutionSegment(state, ui, turnCtx, bundle, segments, segmentIndex);
    pushMeterFloatsAndAdvanceSnap(state, ui, turnCtx.meterFloatSnap);
    render(state, ui);
  })
    .then((result) => {
      if (result?.paused) {
        state._pendingMultiEnemyResolution = {
          bundle,
          segments,
          turnCtx,
          nextIndex: result.nextIndex,
          pauseEnemyId: result.pauseEnemyId,
        };
        cancelResolutionAnimation(ui);
        return;
      }
      finalizeBattleTurnAfterResolutionSegments(state, ui, bundle, turnCtx);
    })
    .finally(() => {
      delete bundle._restEarlyHeal;
      state._battleClashAnimating = false;
      if (state.phase === "resolving") state.phase = "fight";
      refreshTips(state);
      render(state, ui);
    });
}

function queuePlayerAction(state, ui, action) {
  if (state.battleBuffs) state.battleBuffs.restEvadeActive = false;
  // 处决保持旧逻辑：不走 resolving 预结算动画层
  if (action === "execute") {
    onPlayerAction(state, ui, action);
    return;
  }
  if (!canQueueBattleClash(state, action)) {
    onPlayerAction(state, ui, action);
    return;
  }
  const effectiveTargetId = action === "attack" || action === "heavy" || action === "execute" ? state.targetId : null;
  state._turnRng = rollTurnResolutionRng(state, action);
  const bundle = buildTurnResolutionBundle(state, action, effectiveTargetId);
  state._battleClashAnimating = true;
  state.phase = "resolving";
  for (const k of ["actAttack", "actHeavy", "actDefend", "actBlock", "actRest"]) {
    if (ui[k]) ui[k].disabled = true;
  }
  if (ui.actExecuteA) ui.actExecuteA.disabled = true;
  if (ui.actExecuteB) ui.actExecuteB.disabled = true;
  if (ui.actExecuteC) ui.actExecuteC.disabled = true;
  render(state, ui);

  const finishResolving = () => {
    const segments = buildResolutionSegments(state, bundle);
    if (shouldSkipBattleClashForRestWhenAllEnemiesAdjust(state, bundle)) {
      state._battleClashAnimating = false;
      if (state.phase === "resolving") state.phase = "fight";
      commitTurnResolutionBundle(state, bundle, ui);
      return;
    }
    if (shouldCommitBattlePerResolutionSegment(bundle, segments.length, state, segments)) {
      commitTurnResolutionBundlePerSegment(state, bundle, ui);
      return;
    }
    playResolutionAnimation(state, bundle, ui).then(() => {
      state._battleClashAnimating = false;
      if (state.phase !== "resolving") return;
      state.phase = "fight";
      /** 对撞层已播过卡面 FX（含调息 rest_evade）；onPlayerAction 内勿再 triggerRestEvadeFx */
      bundle._playedResolutionClashAnim = true;
      commitTurnResolutionBundle(state, bundle, ui);
    });
  };

  if (action === "rest") {
    triggerRestFx(ui);
    // 与绿光同帧：先完成调息 HP/失衡与飘字（含多敌分段对撞），对撞层延后（finishResolving）再结算敌方出手
    const snapEarly = captureBattleTurnMeterSnapshot(state);
    const healed = applyHeal(state.player, ns(2));
    changeStagger(state.player, -1);
    bundle._restEarlyHeal = { snapshot: snapEarly, healed };
    const meterFloatSnap = {
      playerHp: snapEarly.playerHp,
      playerStg: snapEarly.playerStg,
      enemyHp: { ...snapEarly.enemyHp },
      enemyStg: { ...snapEarly.enemyStg },
      enemyWaitingAtStart: { ...snapEarly.enemyWaitingAtStart },
    };
    pushMeterFloatsAndAdvanceSnap(state, ui, meterFloatSnap);
    render(state, ui);
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
    if (reduced) {
      finishResolving();
    } else {
      window.setTimeout(finishResolving, REST_RESOLUTION_LEAD_MS);
    }
  } else {
    finishResolving();
  }
}

function intentDeltaHtml(state, enemyObj) {
  // 战斗界面不展示任何数值（数值仅在「卡片仓库」展示）
  return "";
}

function mkInitialState() {
  const player = mkFighter({ name: "我", hp: ns(6), stagger: 0, staggerThreshold: 4, level: 1 });
  player.atkBonus = 0;
  player.defendMitigationBonus = 0;
  player.heavyStgBonus = 0; // 装备/橙卡：重击额外失衡（可叠加）
  player.executeHealBonus = 0; // 处决回血（来自 T03 血战余生等）
  player.restCooldownLeft = 0; // 调息剩余冷却（玩家回合数，每回合结束递减）
  const enemyA = mkFighter({ name: "—", hp: ns(1), stagger: 0, staggerThreshold: 3, level: 1 });
  const enemyB = mkFighter({ name: "—", hp: ns(1), stagger: 0, staggerThreshold: 3, level: 1 });

  const prof = typeof localStorage !== "undefined" ? loadPlayerProfile() : null;
  return {
    phase: "node", // node | ready | fight | resolving | ending | endingLose | win | lose
    pendingBattleNodeId: null,
    chapterId: "chapter1",
    nodeId: "N0",
    perks: /** @type {string[]} */ ([]),
    skillDeckAll: SKILL_CARDS.map((c) => c.perk),
    skillDeckRemaining: [...new Set(SKILL_CARDS.map((c) => c.perk))],
    draftOffers: /** @type {Record<string, string[]>} */ ({}),
    /** 本章已选过的属性卡 id（A_ATK 等），避免 R2/R4 再次出现同一张属性卡 */
    _pickedAttrCardIds: /** @type {Record<string, boolean>} */ ({}),
    support: /** @type {string|null} */ (null),
    supportUses: /** @type {Record<string, number>} */ ({}),
    merit: 0,
    /** 顶部「累计战功」：每场战功关胜利时加上本战小计（与结算日志一致） */
    runMeritScore: 0,
    _runMeritSyncedToFinal: false,
    /** 当前战斗内逐回合战功记录 */
    turnMeritLog: /** @type {any[]} */ ([]),
    /** 第一章全局逐回合战功记录 */
    chapterMeritLog: /** @type {any[]} */ ([]),
    chapterHeroProfile: createEmptyChapterHeroProfile(),
    _leaderboardSavedForThisRun: false,
    _leaderboardEarlyCampSaved: false,
    _playerName: prof?.name || "",
    _playerFaction: prof?.faction || "qun",
    _playerProvince: prof?.province || "",
    _playerCity: prof?.city || "",
    _playerCountry: prof?.country || "",
    _chapter1Cleared: !!prof?.chapter1Cleared,
    /** 与存档同步：最近通关主行为（最多 5 条） */
    _mainBehaviorHistory: Array.isArray(prof?.mainBehaviorHistory)
      ? prof.mainBehaviorHistory.filter((x) => typeof x === "string").slice(-5)
      : [],
    _behaviorPhaseLockSnapshot: /** @type {{ sig: string, winner: string, phaseLock: object } | null} */ (null),
    _geoFetched: !!(prof && (prof.province || prof.country)),
    _geoFetching: false,
    _nameDialogMode: /** @type {"intro"|"postBoss"|"chapterSettleRename"|null} */ (null),
    /** 本局写入英雄榜时的本地时间戳，用于结算后改名对齐条目 */
    _chapterSettleLbEntryAt: /** @type {number|null} */ (null),
    /** 战后榜展示用：在线榜行按战功指纹覆盖为当前档案昵称 */
    _chapter1LbRowDisplayPatch: /** @type {{ finalMerit: number, runSum: number, retries: number, heroName: string, origName: string } | null} */ (
      null
    ),
    battleMeritFxQueue: /** @type {any[]} */ ([]),
    battleMeritFxPlaying: false,
    visibleCombo: 0,
    _runMeritAnimating: false,
    _runMeritAnimGen: 0,
    /** 战功关阵亡后尚未从军功簿扣除的惩罚累计（每场 +DEATH_MERIT_PENALTY，再战/回营时结算） */
    _deathMeritPenaltyPending: 0,
    _deathPenaltyRetryBusy: false,
    /** 本地榜实时预览：上一帧名次，用于名次上升动画 */
    _liveMeritRankPrev: /** @type {number|null} */ (null),
    /** 本局行上一帧评价档位（meritGradeTierOrderIndex），用于升档检测 */
    _liveMeritGradeTierPrev: /** @type {number|null} */ (null),
    /** 进入战斗后首帧：英雄榜滚动居中到本局行 */
    _anchorSettleRankToLive: false,
    _meritGradeBannerTimer: /** @type {number|null} */ (null),
    _liveRankRiseTimer: /** @type {number|null} */ (null),
    /** 本地榜滚动跟随：上次渲染时的战功与名次，用于判断平滑滚动 */
    _settleLbLastMerit: /** @type {number|null} */ (null),
    _settleLbLastRank: /** @type {number|null} */ (null),
    _leaderboardPrimed: false,
    /** B1 战前 intro：天下英雄榜是否已做过首帧（在线时避免每帧先刷本地再异步覆盖） */
    _introHeroLbDone: false,
    /** 第一章战功档案：{ retries: Record<id,count>, records: Record<id, object> } */
    meritChapter: /** @type {{ retries: Record<string, number>, records: Record<string, any>, battleRemainGranted?: Record<string, number> }} */ ({
      retries: {},
      records: {},
      battleRemainGranted: {},
    }),
    /** @type {{ battleNodeId: string, maxHpAtStart: number, breakCount: number, executeLog: string[], bossExecutePlayer: number } | null} */
    _meritSession: null,
    /** 即时战功：逐回合上下文（战斗开始时创建） */
    _meritTurnContext: null,
    /** 线路图：已离开并完成的节点 id（战斗胜利领取、成长确认、剧情选项前进时写入） */
    chapterRoadmapCleared: /** @type {Record<string, boolean>} */ ({}),
    tutorialSeen: /** @type {Record<string, boolean>} */ ({}),
    tipsHighlightDismissed: false,
    /** 开场说明：仅首次开局的战前显示；点击「开始战斗」后隐藏 */
    introDismissed: false,
    /** 主界面左侧英雄榜：用于取消过期的异步填充 */
    _introLeftHeroSession: 0,
    _introLeftHeroLoading: false,
    player,
    enemies: [
      {
        id: /** @type {EnemyId} */ ("A"),
        fighter: enemyA,
        intent: /** @type {EnemyIntent} */ ("adjust"),
        ai: { quick: 35, heavy: 25, defend: 20, adjust: 20 },
        archetype: "none",
      },
      {
        id: /** @type {EnemyId} */ ("B"),
        fighter: enemyB,
        intent: /** @type {EnemyIntent} */ ("adjust"),
        ai: { quick: 45, heavy: 20, defend: 15, adjust: 20 },
        archetype: "none",
      },
    ],
    targetId: /** @type {EnemyId} */ ("A"),
    globalTurn: 1,
    battleLog: [],
    settleLog: [],
    tips: [],
    actionHint: /** @type {{ bar: PlayerAction[], executeOn: EnemyId|null }} */ ({ bar: [], executeOn: null }),
    actionDesc: "—",
    nodeMeta: { type: /** @type {NodeType} */ ("N"), title: "", subtitle: "" },
    battle: /** @type {{waveIndex:number, waves:any[], reserve:any[], battleNodeId:string|null}|null} */ (null),
    battleBuffs: { scoutTurnsLeft: 0, breaklineReady: false, restEvadeActive: false },
    lootR3: null,
    orangeLoot: null,
    _noDamageLastTurn: false,
    _meritBossExecuteTakenThisTurn: false,
    /** 出招对拼动画播放中，避免重复结算 */
    _battleClashAnimating: false,
    brokenFirstShieldCharges: 0,
    /** 夺势突进：本场战斗尚未打出过快攻时可为 true，在 startBattleFromNode 按 perk 初始化 */
    firstQuickAttackBonusPending: false,
    /** 逼守抢口：重击命中防御目标后，下回合首次快攻额外伤害 */
    _breakDefenseFollowupPending: false,
    /** 以守待变：本回合未受伤，则下回合首次快攻额外伤害 */
    _noDamageNextAttackPending: false,
    /** T25 养锋待发：调息成功后下回合首次重击 */
    _restNextHeavyBonusPending: false,
    /** T26 凝神守气：调息成功后下回合首次防御额外减伤（次数） */
    _restDefendBonusCharges: 0,
    /** T27 守中藏杀：盾反成功后下回合首次重击 */
    _blockNextHeavyBonusPending: false,
    /** T28 借锋还势：盾反成功后下回合首次攻击额外失衡 */
    _blockNextAttackStaggerPending: false,
    /** T29 重势追断：本回合重击命中后下回合首次重击 */
    _heavyChainNextHeavyPending: false,
    /** T30 乱节追身：快攻打断后下回合首次快攻 */
    _interruptNextQuickBonusPending: false,
    /** T24 守静归心：连续未受伤回合计数 */
    _peacefulHeartNoDamageTurns: 0,
    /** T32 疾锋连压：上一玩家回合是否打出过快攻 */
    _lastPlayerActionWasAttack: false,
    /** 截锋断势：本回合我方快攻打断重击的目标 id（用于本回合对其额外失衡） */
    _attackInterruptedHeavyTargetId: /** @type {EnemyId|null} */ (null),
    /** 战斗失败后可重试：与 battleSnapshot.nodeId 一致时恢复玩家状态 */
    pendingRetryBattleNodeId: /** @type {string|null} */ (null),
    endingArmed: false,
    endingLoseArmed: false,
    /** 因战功回合上限判负（非 HP/处决） */
    _loseByMeritTurns: false,
    _endingHealAnimating: false,
    _endingHealGen: 0,
    _endingDeathAnimating: false,
    _endingDeathGen: 0,
    _endingDeathDone: false,
    /** @type {{ nodeId: string, player: Record<string, unknown> } | null} */
    battleSnapshot: null,
    /** B1：点击「开始战斗」后播放一次敌我卡片上场动画 */
    battleEntranceB1Pending: false,
    /** @type {ReturnType<typeof setTimeout>|null} */
    _battleEntranceB1Timer: null,
    /** 本场最后一击击杀且即将胜利：延后灰调/已倒下，等刀光与血条归零动画 */
    _winKillRevealEnemyIds: /** @type {EnemyId[]|null} */ (null),
    /** @type {ReturnType<typeof setTimeout>|null} */
    _winKillRevealTimer: null,
    _winKillRevealGen: 0,
    /** 本场开战起一段时间内 / 上场动画未结束前：不触发受击抖动（避免误判与入场 transform 冲突） */
    _battleNoHitShakeUntilMs: 0,
    /** 开战首帧清掉卡片上残留的 hit-shake */
    _clearHitShakeOnNextFightRender: false,
    /** 战斗胜利后同屏嵌入成长翻牌（phase 仍为 win） */
    winGrowthEmbed: false,
    winGrowthEmbedNodeId: /** @type {string|null} */ (null),
    /** 胜利内嵌成长选毕：待点击「进入下一关」再推进（R4→N4 除外，直接进 Boss 战前简报） */
    winGrowthPendingAdvance: /** @type {{ chapterId: string, fromNodeId: string, nextId: string, label: string } | null} */ (
      null
    ),
  };
}

/** 进入本场战斗时的玩家状态（用于失败后「重试」同一场） */
function snapshotPlayerForRetry(p) {
  return {
    hp: p.hp,
    hpMax: p.hpMax,
    stagger: p.stagger,
    staggerThreshold: p.staggerThreshold,
    broken: p.broken,
    brokenTurnsLeft: p.brokenTurnsLeft,
    level: p.level,
    atkBonus: p.atkBonus || 0,
    defendMitigationBonus: p.defendMitigationBonus || 0,
    heavyStgBonus: p.heavyStgBonus || 0,
    executeHealBonus: p.executeHealBonus || 0,
    restCooldownLeft: p.restCooldownLeft || 0,
  };
}

function applyPlayerSnapshot(p, s) {
  p.hp = s.hp;
  p.hpMax = s.hpMax;
  p.stagger = s.stagger;
  p.staggerThreshold = s.staggerThreshold;
  p.broken = s.broken;
  p.brokenTurnsLeft = s.brokenTurnsLeft;
  p.level = s.level;
  p.atkBonus = s.atkBonus || 0;
  p.defendMitigationBonus = s.defendMitigationBonus || 0;
  p.heavyStgBonus = s.heavyStgBonus || 0;
  p.executeHealBonus = s.executeHealBonus || 0;
  p.restCooldownLeft = s.restCooldownLeft ?? 0;
}

/** 每场战斗胜利后：按当前上限回满 HP，清零失衡与破绽（等级与经验不变） */
function restorePlayerAfterBattleWin(state) {
  const p = state.player;
  p.hp = p.hpMax;
  p.stagger = 0;
  p.broken = false;
  p.brokenTurnsLeft = 0;
  p.restCooldownLeft = 0;
  state.brokenFirstShieldCharges = 0;
}

/**
 * 胜利结算动画期间发放的「战后整备」战功：与待回满 HP、待平复失衡挂钩（战功战且本场有功绩会话时生效）。
 * 原始点上限与回合事件同量级，再 × MERIT_SCORE_SCALE。
 */
function computeVictoryRestorationMeritDelta(state) {
  const bid = state.battle?.battleNodeId;
  if (!bid || !MERIT_BATTLES[bid] || !state._meritSession) return 0;
  const p = state.player;
  const hpHeal = Math.max(0, (p.hpMax || 1) - (p.hp || 0));
  const stClear = Math.max(0, p.stagger || 0);
  const raw = Math.min(42, Math.floor(hpHeal * 1.4 + stClear * 5.5));
  if (raw <= 0) return 0;
  return Math.round(raw * MERIT_SCORE_SCALE);
}

function recordVictoryRestorationMerit(state, ui, delta, hpHeal, stClear, meritBefore, meritAfter) {
  if (delta <= 0) return;
  const rec = {
    battleId: state.battle?.battleNodeId || null,
    turnIndex: state.globalTurn,
    turnMeritDelta: delta,
    positiveEvents: [{ code: "victory_restoration", value: delta }],
    negativeEvents: [],
    meritBefore,
    meritAfter,
    clutchMultiplier: 1,
    momentumMultiplier: 1,
    mistakeMultiplier: 1,
    positiveFinal: delta,
    negativeFinal: 0,
    positiveBase: delta,
    negativeBase: 0,
    breakdown: { woundScore: 0, pressureScore: 0, tacticScore: 0, styleScore: 0, executeScore: 0, mistakeScore: 0 },
    breakdownScaled: { woundScore: 0, pressureScore: 0, tacticScore: 0, styleScore: 0, executeScore: 0, mistakeScore: 0 },
    meta: { victoryRestoration: true, hpHeal, stClear },
  };
  state.turnMeritLog = state.turnMeritLog || [];
  state.chapterMeritLog = state.chapterMeritLog || [];
  state.turnMeritLog.push(rec);
  state.chapterMeritLog.push(rec);
  state.settleLog = state.settleLog || [];
  state.settleLog.push(
    `{g}战后整备：阵线稳固回气，战功 +${delta}（待回生命 ${hpHeal}｜战末失衡 ${stClear}）{/g}`,
  );
  if (ui?.runMeritHint) ui.runMeritHint.innerHTML = buildRunMeritTooltipHtml(state);
}

/** 将「战后整备」战功按待回 HP / 战末失衡比例拆成两段，用于 ending 飞点与读数对应 */
function splitVictoryRestorationMeritParts(hpHeal, stClear, deltaScaled) {
  if (deltaScaled <= 0) return { hpPart: 0, stPart: 0 };
  const raw = Math.min(42, Math.floor(hpHeal * 1.4 + stClear * 5.5));
  if (raw <= 0) return { hpPart: 0, stPart: 0 };
  const rH = hpHeal * 1.4;
  const rS = stClear * 5.5;
  const sum = rH + rS;
  if (sum <= 1e-6) return { hpPart: deltaScaled, stPart: 0 };
  const hpPart = Math.round(deltaScaled * (rH / sum));
  return { hpPart, stPart: deltaScaled - hpPart };
}

/** 胜利 ending 当场发放的「回合节余」战功（与章节末聚合同一公式；已发部分在 computeChapterMerit 中扣减，避免重复） */
function computeBattleRemainTurnMeritDelta(state) {
  if (!state._meritSession) return 0;
  const bid = state.battle?.battleNodeId;
  if (!bid || !MERIT_BATTLES[bid]) return 0;
  const lim = meritBattleTurnLimit(bid);
  if (lim == null) return 0;
  const ctx = state._meritTurnContext;
  const used = ctx ? Math.max(0, (ctx.turnIndex || 1) - 1) : 0;
  const remainSlots = Math.max(0, lim - used);
  return Math.round(remainSlots * MERIT_REMAINING_TURN_RAW_PER * MERIT_SCORE_SCALE);
}

/**
 * 胜利整备：HP/失衡条 → 军功簿。
 * 颗数 = MERIT_FLY_PARTICLE_BURST×MERIT_FLY_PARTICLE_BURST（与节余「每档×3」对齐再乘一档），
 * 总时长按倍率拉长；起点用条形容器中心，避免跟随时变数字文字跳动。
 */
function spawnVictoryMeritFlyFromMeterBar(barWrapEl, targetEl) {
  if (!barWrapEl || !targetEl) return;
  const a = barWrapEl.getBoundingClientRect();
  const b = targetEl.getBoundingClientRect();
  const n = MERIT_FLY_PARTICLE_BURST * MERIT_FLY_PARTICLE_BURST;
  const span = CHAPTER_REMAIN_MERIT_FLY_MS * MERIT_FLY_PARTICLE_BURST;
  spawnMeritFlyParticlesEvenSpread(
    a.left + a.width / 2,
    a.top + a.height / 2,
    b.left + b.width / 2,
    b.top + b.height / 2,
    n,
    span,
    { fixedStart: true },
  );
}

function recordBattleRemainTurnMerit(state, ui, delta, remainSlots, meritBefore, meritAfter) {
  if (delta <= 0) return;
  const rec = {
    battleId: state.battle?.battleNodeId || null,
    turnIndex: state.globalTurn,
    turnMeritDelta: delta,
    positiveEvents: [{ code: "remaining_turn_merit", value: delta }],
    negativeEvents: [],
    meritBefore,
    meritAfter,
    clutchMultiplier: 1,
    momentumMultiplier: 1,
    mistakeMultiplier: 1,
    positiveFinal: delta,
    negativeFinal: 0,
    positiveBase: delta,
    negativeBase: 0,
    breakdown: { woundScore: 0, pressureScore: 0, tacticScore: 0, styleScore: 0, executeScore: 0, mistakeScore: 0 },
    breakdownScaled: { woundScore: 0, pressureScore: 0, tacticScore: 0, styleScore: 0, executeScore: 0, mistakeScore: 0 },
    meta: { battleRemainTurnBonus: true, remainSlots },
  };
  state.turnMeritLog = state.turnMeritLog || [];
  state.chapterMeritLog = state.chapterMeritLog || [];
  state.turnMeritLog.push(rec);
  state.chapterMeritLog.push(rec);
  state.settleLog = state.settleLog || [];
  state.settleLog.push(`{g}回合节余：本战额度未用尽 ${remainSlots} 档，战功 +${delta}{/g}`);
  if (ui?.runMeritHint) ui.runMeritHint.innerHTML = buildRunMeritTooltipHtml(state);
}

function isBattleOver(state) {
  if (state.player.hp <= 0) return "lose";
  const anyFightAlive = state.enemies.some((x) => !x.waitingToEnter && x.fighter.hp > 0);
  if (anyFightAlive) return null;
  const waitingNext = state.enemies.some((x) => x.waitingToEnter);
  if (waitingNext && state.battle?.sequentialTwoSlots) return null;
  const reserveLeft = state.battle && Array.isArray(state.battle.reserve) ? state.battle.reserve.length : 0;
  if (reserveLeft > 0) return null;
  return "win";
}

/** 若该敌人当场 HP 归零且补位/后备耗尽，本回合将直接胜利（用于处决前开启慢镜等） */
function isClinchWinKill(state, deadEnemyId) {
  const othersAlive = state.enemies.some(
    (eo) => !eo.waitingToEnter && eo.id !== deadEnemyId && eo.fighter.hp > 0,
  );
  if (othersAlive) return false;
  if ((state.battle?.reserve || []).length > 0) return false;
  const waitingNext = state.enemies.some((x) => x.waitingToEnter);
  if (waitingNext && state.battle?.sequentialTwoSlots) return false;
  return true;
}

/** 决胜一击后延后进入胜利 ending 的等待（与刀光等特效对齐） */
const WIN_KILL_REVEAL_MS_HIT = 1360;
const WIN_KILL_REVEAL_MS_EXEC = 1400;

/** 胜利/失败 ending：HP/失衡条线性动画固定总时长（快慢随插值自适应，与 ending-slowmo 无关） */
const ENDING_PHASE_METER_MS = 2000;
/** 头目处决玩家：卡面动效每段间隔（失衡满 → 破绽 → 杀意 → 处决） */
const BOSS_EXEC_PLAYER_DRAMA_BEAT_MS = 820;
/** 全屏第二行相对第一行出现时刻；收起全屏层后再进入卡面动效 */
const BOSS_EXEC_PLAYER_PREFACE_LINE2_MS = 1800;
const BOSS_EXEC_PLAYER_PREFACE_AFTER_LINE2_MS = 1400;
const BOSS_EXEC_PLAYER_PREFACE_TOTAL_MS = BOSS_EXEC_PLAYER_PREFACE_LINE2_MS + BOSS_EXEC_PLAYER_PREFACE_AFTER_LINE2_MS;
const BOSS_EXEC_PLAYER_DRAMA_PHASE = "bossExecuteDrama";

const CH1_MERIT_LEADERBOARD_KEY = "mud_ch1_merit_leaderboard_v1";
const CH1_PLAYER_PROFILE_KEY = "mud_ch1_player_profile_v1";

function loadPlayerProfile() {
  try {
    const raw = localStorage.getItem(CH1_PLAYER_PROFILE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return null;
    const nameRaw = String(obj.name || "").trim();
    if (!nameRaw) return null;
    const name = clampPlayerNameValue(nameRaw);
    if (!name) return null;
    return {
      name,
      faction: normalizeFactionKey(obj.faction || "qun"),
      province: String(obj.province || "").trim(),
      city: String(obj.city || "").trim(),
      country: String(obj.country || "").trim(),
      chapter1Cleared: !!obj.chapter1Cleared,
      /** 最近至多 5 次通关章节的主行为（用于主行为定相反重复） */
      mainBehaviorHistory: Array.isArray(obj.mainBehaviorHistory)
        ? obj.mainBehaviorHistory.filter((x) => typeof x === "string").slice(-5)
        : [],
    };
  } catch {
    return null;
  }
}

/**
 * 章节进度重置后恢复本机玩家档案（昵称、势力、地区等）。
 * 「再战一局」会清空 state，但必须与 localStorage 里已保存的改名结果一致。
 * 不恢复 _mainBehaviorHistory：新一局仍从空开始累计。
 */
function applyStoredPlayerProfileToState(state) {
  const prof = loadPlayerProfile();
  if (prof) {
    state._playerName = prof.name;
    state._playerFaction = prof.faction;
    state._playerProvince = prof.province;
    state._playerCity = prof.city;
    state._playerCountry = prof.country;
    state._chapter1Cleared = !!prof.chapter1Cleared;
  } else {
    state._playerName = "";
    state._playerFaction = "qun";
    state._playerProvince = "";
    state._playerCity = "";
    state._playerCountry = "";
    state._chapter1Cleared = false;
  }
}

/** 主行为定相：每局至多由排行榜写入路径调用一次，记入最近 5 局主行为 */
function appendMainBehaviorHistory(state, behaviorName) {
  const b = behaviorName != null ? String(behaviorName).trim() : "";
  if (!b) return;
  const h = Array.isArray(state._mainBehaviorHistory) ? state._mainBehaviorHistory.slice() : [];
  h.push(b);
  while (h.length > 5) h.shift();
  state._mainBehaviorHistory = h;
  if (state._playerName) savePlayerProfile(state);
}

function savePlayerProfile(state) {
  try {
    const payload = {
      name: clampPlayerNameValue(String(state?._playerName || "").trim()),
      faction: normalizeFactionKey(state?._playerFaction || "qun"),
      province: String(state?._playerProvince || "").trim(),
      city: String(state?._playerCity || "").trim(),
      country: String(state?._playerCountry || "").trim(),
      chapter1Cleared: !!state?._chapter1Cleared,
      mainBehaviorHistory: Array.isArray(state?._mainBehaviorHistory)
        ? state._mainBehaviorHistory.filter((x) => typeof x === "string").slice(-5)
        : [],
      at: Date.now(),
    };
    if (!payload.name) return;
    state._playerName = payload.name;
    localStorage.setItem(CH1_PLAYER_PROFILE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

function clearPlayerProfile(state) {
  try {
    localStorage.removeItem(CH1_PLAYER_PROFILE_KEY);
  } catch {
    // ignore
  }
  if (state) {
    state._playerName = "";
    state._playerFaction = "qun";
    state._playerProvince = "";
    state._playerCity = "";
    state._playerCountry = "";
    state._chapter1Cleared = false;
    state._geoFetched = false;
    state._geoFetching = false;
    state._mainBehaviorHistory = [];
    state._behaviorPhaseLockSnapshot = null;
  }
}

function factionLabel(faction) {
  const k = String(faction || "").toLowerCase();
  if (k === "wei") return "魏";
  if (k === "shu") return "蜀";
  if (k === "wu") return "吴";
  return "群雄";
}

function normalizeFactionKey(faction) {
  const k = String(faction || "").toLowerCase();
  if (k === "wei" || k === "shu" || k === "wu" || k === "qun") return k;
  return "qun";
}

/**
 * 武魂武将所属阵营（与 105 表映射一致；天命之魂 15 人为 tianming；其余非表内默认群雄）。
 * @param {string} [heroName]
 * @returns {"wei"|"shu"|"wu"|"qun"|"tianming"}
 */
function soulHeroFactionKey(heroName) {
  const Lu = window.GeneralSoul105Lookup;
  if (Lu && typeof Lu.soulHeroFactionKey === "function") {
    return Lu.soulHeroFactionKey(heroName);
  }
  return "qun";
}

/**
 * @param {string} [heroName]
 */
function soulHeroFactionClass(heroName) {
  return `soul-name-faction--${soulHeroFactionKey(heroName)}`;
}

/**
 * 与 computeChapterMerit / MERIT_GRADE_RULES_DESC 划档一致（总战功已含 MERIT_SCORE_SCALE）。
 * 天下英雄榜展示请始终用本函数按 `finalMerit` 重算，勿直接显示存档或在线接口里的旧 `grade`。
 */
function meritGradeLabelFromFinalScore(finalMeritScore) {
  return meritGradeFromChapterScore(finalMeritScore, MERIT_SCORE_SCALE).grade;
}

/** 战将=1 … 神将=7，天命=8：用于比较本局评价是否升档 */
function meritGradeTierOrderIndex(gradeLabel) {
  const g = normalizeMeritGradeLabel(gradeLabel);
  if (g === "天命") return 8;
  const order = ["战将", "勇将", "健将", "骁将", "名将", "飞将", "神将"];
  const i = order.indexOf(g);
  return i >= 0 ? i + 1 : 0;
}

/** 战功评级：天命 + 7 档 CSS（.grade-tianming / .grade-shenjiang …），与 style.css 变量体系一致 */
function meritGradeTierClass(grade) {
  const key = normalizeMeritGradeLabel(grade);
  if (!key || key === "—") return "";
  if (key === "天命") return "grade-tianming";
  if (key === "神将") return "grade-shenjiang";
  if (key === "飞将") return "grade-feijiang";
  if (key === "名将") return "grade-mingjiang";
  if (key === "骁将") return "grade-xiaojiang";
  if (key === "健将") return "grade-jianjiang";
  if (key === "勇将") return "grade-yongjiang";
  if (key === "战将") return "grade-zhanjiang";
  return "";
}

/** 带等级配色的评级 HTML（结算页、排行榜、开场前三等共用） */
function meritGradeSpanHtml(grade) {
  const raw = grade != null && String(grade).trim() !== "" ? String(grade) : "—";
  if (raw === "—") {
    return `<span class="merit-grade merit-grade--unknown">—</span>`;
  }
  const display = normalizeMeritGradeLabel(raw);
  const safe = escapeHtml(display);
  const tier = meritGradeTierClass(raw);
  if (!tier) {
    return `<span class="merit-grade merit-grade--unknown">${safe}</span>`;
  }
  const inner =
    tier === "grade-tianming" ? `<span class="merit-grade-rainbow-text">${safe}</span>` : safe;
  return `<span class="merit-grade soul-grade-badge ${tier}">${inner}</span>`;
}

/** 右侧 intro 前十榜：武魂名将名，配色与该行战功评价档一致（无档名则弱化） */
function introTop3SoulNameHtml(finalMeritScore, heroNameRaw) {
  const n = String(heroNameRaw || "").trim();
  if (!n) return "";
  const gLabel = meritGradeLabelFromFinalScore(Number(finalMeritScore) || 0);
  const tier = meritGradeTierClass(gLabel);
  const safe = escapeHtml(n);
  const fac = soulHeroFactionClass(n);
  if (!tier) {
    return `<span class="intro-top3-soul-name merit-grade merit-grade--unknown ${fac}">${safe}</span>`;
  }
  return `<span class="intro-top3-soul-name merit-grade soul-grade-badge ${tier} ${fac}">${safe}</span>`;
}

const RUN_MERIT_ANIM_MS = 620;

/** 是否存在可能打断重击的敌方快攻（存活且未破绽）。 */
function enemyQuickThreatensPlayerHeavy(state) {
  return state.enemies.some(
    (eo) => !eo.waitingToEnter && eo.fighter.hp > 0 && !eo.fighter.broken && eo.intent === "quick",
  );
}

/**
 * 本回合若重击被快攻打断，视为哪位敌人打断你（与对拼动画顺序一致）。
 * 有非主攻目标的快攻时优先取该敌人；否则为场上唯一/第一个可威胁的快攻。
 */
function pickHeavyInterruptEnemyId(state, targetId) {
  const alive = state.enemies.filter(
    (eo) => !eo.waitingToEnter && eo.fighter.hp > 0 && !eo.fighter.broken && eo.intent === "quick",
  );
  if (!alive.length) return null;
  if (targetId) {
    const nonTarget = alive.find((eo) => eo.id !== targetId);
    if (nonTarget) return nonTarget.id;
  }
  return alive[0].id;
}

function refreshIntents(state) {
  const isB1 = state.battle?.battleNodeId === "B1";
  const b1Pick = (eo) => {
    // B1 固定/半固定意图（仅 B1）：
    // - 刀兵甲（A）：重击、快攻交替循环
    // - 刀兵乙（B）：首次固定重击；之后按 AI 权重随机
    const idx = typeof eo._fixedIntentIdx === "number" ? eo._fixedIntentIdx : 0;
    const seqA = /** @type {EnemyIntent[]} */ (["heavy", "quick"]);
    if (eo.id === "A") {
      const intent = seqA[idx % seqA.length];
      eo._fixedIntentIdx = idx + 1;
      return intent;
    }
    if (eo.id === "B") {
      if (idx <= 0) {
        eo._fixedIntentIdx = 1;
        return "heavy";
      }
      eo._fixedIntentIdx = idx + 1;
      return computeEnemyIntentFromAi(eo.ai);
    }
    return computeEnemyIntentFromAi(eo.ai);
  };

  for (const eo of state.enemies) {
    if (eo.waitingToEnter) {
      eo.intent = /** @type {EnemyIntent} */ ("adjust");
      continue;
    }
    if (eo.fighter.hp <= 0) {
      eo.intent = /** @type {EnemyIntent} */ ("adjust");
      continue;
    }
    eo.intent = isB1 ? b1Pick(eo) : computeEnemyIntentFromAi(eo.ai);
  }
}

/** @returns {{ lines: string[], hintBar: PlayerAction[], hintExecuteOn: EnemyId|null }} */
function buildAdviceAndHint(state) {
  const p = state.player;
  const alive = state.enemies.filter((eo) => !eo.waitingToEnter && eo.fighter.hp > 0);
  const acting = alive.filter((eo) => !eo.fighter.broken);
  const brokenTargets = alive.filter((eo) => eo.fighter.broken);

  const hasQuick = acting.some((eo) => eo.intent === "quick");
  const hasHeavy = acting.some((eo) => eo.intent === "heavy");
  const allDefOrAdj = acting.length > 0 && acting.every((eo) => eo.intent === "defend" || eo.intent === "block" || eo.intent === "adjust");

  /** @type {string[]} */
  const lines = [];
  lines.push(`这回合怎么打（回合 ${formatBattleTurnNumber(state.globalTurn)}）`);

  /** @type {PlayerAction[]} */
  let hintBar = [];
  /** @type {EnemyId|null} */
  let hintExecuteOn = null;

  const heavyEnemies = acting.filter((eo) => eo.intent === "heavy");
  const labelOf = (id) => ({ A: "甲", B: "乙", C: "丙" }[id] || id);
  const stgLeftOf = (eo) => Math.max(0, eo.fighter.staggerThreshold - eo.fighter.stagger);
  const sortByCloserToBroken = (a, b) => stgLeftOf(a) - stgLeftOf(b);

  if (p.broken) {
    lines.push("- 你现在自己在破绽，先别上头；{o}调息{/o}最赚，{o}防御{/o}/{o}盾反{/o}也都能保命。");
    if (brokenTargets.length) {
      lines.push("- 对面就算也露破绽了，你现在也收不了头，先把自己救回来再说。");
    }
    if (p.hp <= 2) lines.push("- 你这血量再贪基本就是白给，能{o}调息{/o}就{o}调息{/o}。");
    hintBar = ["rest", "defend", "block"];
    return { lines, hintBar, hintExecuteOn };
  }

  if (brokenTargets.length) {
    const tgt = brokenTargets.find((eo) => eo.id === state.targetId) || brokenTargets[0];
    const label = labelOf(tgt.id);
    lines.push(`- ${label}已经露破绽了，别墨迹，直接处决；你一出手，其他敌人这回合也插不上。`);
    if (p.hp <= 2) lines.push("- 但你现在也快没了；要是手一抖收不掉，那就先{o}调息{/o}，别把自己送走。");
    hintExecuteOn = tgt.id;
    if (p.hp <= 2) hintBar = ["rest"];
    return { lines, hintBar, hintExecuteOn };
  }

  if (p.hp <= 2) {
    lines.push("- 你这血量已经在鬼门关门口了，这回合先保命，{o}调息{/o}或{o}防御{/o}都比硬打值。");
  }

  /** @type {EnemyId|null} */
  let suggestedTargetId = null;
  /** @type {"none"|"focus"|"interruptHeavy"} */
  let targetMode = "focus";

  if (hasHeavy && !hasQuick) {
    lines.push("- 对面出重击？那就上{o}盾反{/o}。{o}盾反{/o}就是专门拿来吃重击的，这回合别想太多。");
    targetMode = "none";
  } else if (hasQuick && hasHeavy) {
    const tgt = [...heavyEnemies].sort(sortByCloserToBroken)[0];
    if (tgt) {
      suggestedTargetId = tgt.id;
      lines.push(`- 这回合是混合压制局：怕翻车就{o}防御{/o}；想抢主动，就拿{o}快攻{/o}去点${labelOf(tgt.id)}，专打它的重击前摇。`);
      targetMode = "interruptHeavy";
    } else {
      lines.push("- 这回合又有快攻又有重击：求稳就{o}防御{/o}；想抢节奏，就{o}快攻{/o}去断那个重击。");
      targetMode = "none";
    }
  } else if (hasQuick) {
    lines.push("- 对面这回合快攻为主，{o}防御{/o}就是标准答案；你状态够硬的话，也能用{o}快攻{/o}硬压失衡。");
    hintBar = ["defend", "attack"];
  } else if (allDefOrAdj) {
    lines.push("- 对面这回合在装孙子，别陪他演，直接选一个人狠狠干，{o}重击{/o}和{o}快攻{/o}都行。");
    hintBar = ["heavy", "attack"];
  } else {
    lines.push("- 没把握就老老实实{o}防御{/o}，别为了逞一时之勇把节奏送出去。");
    hintBar = ["defend"];
  }

  if (targetMode === "interruptHeavy" && suggestedTargetId) {
    lines.push(`- 要是你这回合打算{o}快攻{/o}，就盯着${labelOf(suggestedTargetId)}砍；别打错人，断重击才有意义。`);
    return { lines, hintBar: ["defend", "attack"], hintExecuteOn };
  }

  if (targetMode === "none") {
    lines.push("- 这回合动作不吃目标选择，重点就一句话：先把命和节奏保住。");
    const hb = hasHeavy && !hasQuick ? /** @type {PlayerAction[]} */ (["block"]) : ["defend", "attack"];
    return { lines, hintBar: hb, hintExecuteOn };
  }

  // 集火逻辑：优先“离破绽更近”的那个；否则沿用当前目标，减少来回切换
  const best = [...alive].sort(sortByCloserToBroken)[0] || null;
  const cur = state.enemies.find((x) => x.id === state.targetId);
  const prefer = best && cur && cur.fighter.hp > 0 && stgLeftOf(cur) <= stgLeftOf(best) ? cur : best || cur;
  if (prefer && prefer.fighter.hp > 0) {
    const label = labelOf(prefer.id);
    const stgLeft = stgLeftOf(prefer);
    if (stgLeft <= 1) lines.push(`- 目标建议：就狠狠干${label}，它离破绽只差一脚。`);
    else lines.push(`- 目标建议：这回合继续盯着${label}打，别东一刀西一刀把失衡全打散。`);
  }

  if (hintBar.length === 0) hintBar = ["defend"];
  return { lines, hintBar, hintExecuteOn };
}

/** 本地存储：新手模式（按键闲置高亮）；缺省为开启 */
const BEGINNER_MODE_LS_KEY = "game_beginnerMode";
/** 新手模式：无操作后延迟再高亮建议键（仅按键，不含新手提示框） */
const BEGINNER_HINT_IDLE_MS = 1500;

/** 新手模式：闲置后高亮建议键（与 buildAdviceAndHint 一致） */
let b1HintTimerId = /** @type {ReturnType<typeof setTimeout>|null} */ (null);

function readBeginnerModeFromStorage() {
  const v = localStorage.getItem(BEGINNER_MODE_LS_KEY);
  if (v === null) return true;
  return v === "1";
}

function isBeginnerModeEnabled(ui) {
  if (ui?.beginnerModeToggle) return !!ui.beginnerModeToggle.checked;
  return readBeginnerModeFromStorage();
}

function clearB1HintTimer() {
  if (b1HintTimerId !== null) {
    clearTimeout(b1HintTimerId);
    b1HintTimerId = null;
  }
}

function clearB1ActionHintHighlight(ui) {
  if (!ui) return;
  for (const el of [
    ui.actAttack,
    ui.actHeavy,
    ui.actDefend,
    ui.actBlock,
    ui.actRest,
    ui.actExecuteA,
    ui.actExecuteB,
    ui.actExecuteC,
  ]) {
    if (el) el.classList.remove("btn-hint-blink");
  }
  if (ui.tipsPanel) ui.tipsPanel.classList.remove("panel-hint-blink");
}

/** 应用「闲置后」的建议键闪光（不闪新手提示框；点过提示区则本局不再闪键） */
function applyBeginnerIdleHighlights(state, ui) {
  if (state.tipsHighlightDismissed) return;
  const hint = state.actionHint || { bar: [], executeOn: null };
  const map = {
    attack: ui.actAttack,
    heavy: ui.actHeavy,
    defend: ui.actDefend,
    block: ui.actBlock,
    rest: ui.actRest,
  };
  for (const a of hint.bar || []) {
    const el = map[a];
    if (el && !el.disabled) el.classList.add("btn-hint-blink");
  }
  if (hint.executeOn === "A" && ui.actExecuteA && !ui.actExecuteA.disabled) {
    ui.actExecuteA.classList.add("btn-hint-blink");
  }
  if (hint.executeOn === "B" && ui.actExecuteB && !ui.actExecuteB.disabled) {
    ui.actExecuteB.classList.add("btn-hint-blink");
  }
  if (hint.executeOn === "C" && ui.actExecuteC && !ui.actExecuteC.disabled) {
    ui.actExecuteC.classList.add("btn-hint-blink");
  }
}

function scheduleB1ActionHint(state, ui) {
  clearB1HintTimer();
  clearB1ActionHintHighlight(ui);
  if (state.phase !== "fight") return;
  if (!isBeginnerModeEnabled(ui)) return;
  const anyEnemyAlive = state.enemies.some((x) => !x.waitingToEnter && x.fighter.hp > 0);
  if (!anyEnemyAlive || state.player.hp <= 0) return;

  b1HintTimerId = window.setTimeout(() => {
    b1HintTimerId = null;
    if (state.phase !== "fight") return;
    applyBeginnerIdleHighlights(state, ui);
  }, BEGINNER_HINT_IDLE_MS);
}

function refreshTips(state) {
  const pack = buildAdviceAndHint(state);
  state.tips = pack.lines;
  state.actionHint = { bar: pack.hintBar, executeOn: pack.hintExecuteOn };
  if (state.battleBuffs?.scoutTurnsLeft > 0 && state.phase === "fight") {
    state.tips.splice(
      1,
      0,
      `【侦察】快攻打断重击：你与敌方均为 ${Math.round(INTERRUPT_QUICK_VS_HEAVY * 100)}%。场上有快攻时，慎出重击。`,
    );
  }
  if (
    state.battleBuffs?.restEvadeActive &&
    (state.phase === "fight" || state.phase === "resolving")
  ) {
    state.tips.splice(1, 0, "【闪避】本回合调息中已完全闪避敌方快攻/重击（免伤、免失衡）。");
  }
}

// 旧版顺序上场遗留：当前未使用

/** 与 `.battle-combat-stage--no-enemy-row` 同步：战前 `--ready` 用 CSS 藏卡但未必设 `hidden`，须看 ready 类否则敌区仍占 220px 易挤压 VS/我方行 */
function syncBattleCombatStageEnemySlotClass(ui) {
  const stage = ui.battleCombatStage;
  if (!stage || !ui.battleInfoPanel || !ui.enemyRowWrap) return;
  const ready = ui.battleInfoPanel.classList.contains("battle-info-panel--ready");
  const compact = ready || !!ui.enemyRowWrap.hidden;
  stage.classList.toggle("battle-combat-stage--no-enemy-row", compact);
}

/** 仅敌我角色卡（HP/失衡 红框区域）；战前 ready 隐藏此项，保留按键与说明 */
function setFighterSlotsVisibility(ui, visible) {
  const hide = !visible;
  if (ui.enemyRowWrap) ui.enemyRowWrap.hidden = hide;
  if (ui.dividerAfterEnemies) ui.dividerAfterEnemies.hidden = hide;
  if (ui.playerRowWrap) ui.playerRowWrap.hidden = hide;
  syncBattleCombatStageEnemySlotClass(ui);
}

/** 战斗信息面板内：完整战斗区（非战斗节点整段隐藏） */
function setCombatBodyVisibility(ui, visible) {
  const hide = !visible;
  setFighterSlotsVisibility(ui, visible);
  if (ui.actionDesc) ui.actionDesc.hidden = hide;
  if (ui.actionsWrap) ui.actionsWrap.hidden = hide;
  if (ui.dividerBeforeBelowActions) ui.dividerBeforeBelowActions.hidden = hide;
  if (ui.belowActionsWrap) ui.belowActionsWrap.hidden = hide;
}

function dom() {
  const $ = (id) => document.getElementById(id);
  return {
    leftCol: $("leftCol"),
    settlePanelSection: $("settlePanelSection"),
    pageTitle: $("pageTitle"),
    battleLogPanelTitle: $("battleLogPanelTitle"),
    battleLogPanelSubtitle: $("battleLogPanelSubtitle"),
    btnIntroHeroLocate: $("btnIntroHeroLocate"),
    introHeroLocateMsg: $("introHeroLocateMsg"),
    settleLogPanelTitle: $("settleLogPanelTitle"),
    settleLogPanelSubtitle: $("settleLogPanelSubtitle"),
    chapterRoadmap: $("chapterRoadmap"),
    runMeritWidget: $("runMeritWidget"),
    runMeritValue: $("runMeritValue"),
    runMeritHint: $("runMeritHint"),
    turnInfo: $("turnInfo"),
    endingMeritTicker: $("endingMeritTicker"),
    endingMeritFlyAnchor: $("endingMeritFlyAnchor"),
    endingMeritBattleTurn: $("endingMeritBattleTurn"),
    battleMeritFlyAnchor: $("battleMeritFlyAnchor"),
    battleInfoPanel: $("battleInfoPanel"),
    meritGradeUpgradeBanner: $("meritGradeUpgradeBanner"),
    chapterSettleStack: $("chapterSettleStack"),
    chapterSettleVictory: $("chapterSettleVictory"),
    chapterSettleBody: $("chapterSettleBody"),
    chapterSettleScoreRow: $("chapterSettleScoreRow"),
    chapterSettleMeritFlyAnchor: $("chapterSettleMeritFlyAnchor"),
    chapterSettleScoreVal: $("chapterSettleScoreVal"),
    chapterSettleScoreHintWrap: $("chapterSettleScoreHintWrap"),
    chapterSettleScoreHintPrimary: $("chapterSettleScoreHintPrimary"),
    chapterSettleScoreHintBonus: $("chapterSettleScoreHintBonus"),
    chapterSettleMeritHero: $("chapterSettleMeritHero"),
    chapterSettleHeroBlock: $("chapterSettleHeroBlock"),
    btnChapterSettleReplay: $("btnChapterSettleReplay"),
    btnChapterSettleRename: $("btnChapterSettleRename"),
    resolutionLayer: $("resolutionLayer"),
    resolutionPrimary: $("resolutionPrimary"),
    playerActionCapsule: $("playerActionCapsule"),
    enemyActionCapsule: $("enemyActionCapsule"),
    resolutionBurst: $("resolutionBurst"),
    resolutionLabel: $("resolutionLabel"),
    resolutionSecondary: $("resolutionSecondary"),
    battleMeritFxLayer: $("battleMeritFxLayer"),
    battleMeritJudgement: $("battleMeritJudgement"),
    battleMeritDelta: $("battleMeritDelta"),
    battleMeritBreakdown: $("battleMeritBreakdown"),
    battleMeritCombo: $("battleMeritCombo"),
    battleMeritBurst: $("battleMeritBurst"),
    bossExecPlayerDramaOverlay: $("bossExecPlayerDramaOverlay"),
    bossExecPlayerDramaLine1: $("bossExecPlayerDramaLine1"),
    bossExecPlayerDramaLine2: $("bossExecPlayerDramaLine2"),
    introOverlay: $("introOverlay"),
    introTop3: $("introTop3"),
    btnIntroLbRefresh: $("btnIntroLbRefresh"),
    btnIntroDare: $("btnIntroDare"),
    btnIntroContinue: $("btnIntroContinue"),
    btnIntroNew: $("btnIntroNew"),
    battleWinInline: $("battleWinInline"),
    battleWinInlineVictory: $("battleWinInlineVictory"),
    winGrowthEmbed: $("winGrowthEmbed"),
    battleWinInlineAdvance: $("battleWinInlineAdvance"),
    btnWinGrowthNextBattle: $("btnWinGrowthNextBattle"),
    winGrowthNextSubtitle: $("winGrowthNextSubtitle"),
    winGrowthTitle: $("winGrowthTitle"),
    winGrowthSubtitle: $("winGrowthSubtitle"),
    winGrowthOptions: $("winGrowthOptions"),
    btnWinContinue: $("btnWinContinue"),
    btnWinClaim: $("btnWinClaim"),
    nameDialog: $("nameDialog"),
    nameDialogTitle: $("nameDialogTitle"),
    nameDialogSub: $("nameDialogSub"),
    nameDialogInput: $("nameDialogInput"),
    nameDialogOk: $("nameDialogOk"),
    nameDialogClose: $("nameDialogClose"),
    btnStartBattle: $("btnStartBattle"),
    btnRetryBattle: $("btnRetryBattle"),
    btnLoseBackToMain: $("btnLoseBackToMain"),
    preFightStartWrap: $("preFightStartWrap"),
    battleCombatStage: $("battleCombatStage"),
    enemyRowWrap: $("enemyRowWrap"),
    dividerAfterEnemies: $("dividerAfterEnemies"),
    battleVsTurnLabel: $("battleVsTurnLabel"),
    playerRowWrap: $("playerRowWrap"),
    actionsWrap: $("actionsWrap"),
    dividerBeforeBelowActions: $("dividerBeforeBelowActions"),
    belowActionsWrap: $("belowActionsWrap"),
    growthOverlay: $("growthOverlay"),
    growthContinueBar: $("growthContinueBar"),
    btnGrowthNextBattle: $("btnGrowthNextBattle"),
    nodeTitle: $("nodeTitle"),
    nodeSubtitle: $("nodeSubtitle"),
    nodeOptions: $("nodeOptions"),
    playerCard: $("playerCard"),
    playerCardFxLayer: $("playerCardFxLayer"),
    playerCardFxToken: $("playerCardFxToken"),
    restFxOverlay: $("restFxOverlay"),
    playerBrokenBanner: $("playerBrokenBanner"),
    playerDeadBanner: $("playerDeadBanner"),
    playerMeritTurnWarn: $("playerMeritTurnWarn"),
    playerName: $("playerName"),
    playerLevel: $("playerLevel"),
    playerCardFlavor: $("playerCardFlavor"),
    pHpBarWrap: $("pHpBarWrap"),
    pStaggerBarWrap: $("pStaggerBarWrap"),
    battleLog: $("battleLog"),
    settleLog: $("settleLog"),
    settleRank: $("settleRank"),
    tips: $("tips"),
    tipsPanel: $("tipsPanel"),
    beginnerModeToggle: $("beginnerModeToggle"),
    playerSummary: $("playerSummary"),
    warehouseCards: $("warehouseCards"),
    actionDesc: $("actionDesc"),
    enemyCardA: $("enemyCardA"),
    enemyRestFxOverlayA: $("enemyRestFxOverlayA"),
    enemyCardFxLayerA: $("enemyCardFxLayerA"),
    enemyCardFxTokenA: $("enemyCardFxTokenA"),
    enemyCardB: $("enemyCardB"),
    enemyRestFxOverlayB: $("enemyRestFxOverlayB"),
    enemyCardFxLayerB: $("enemyCardFxLayerB"),
    enemyCardFxTokenB: $("enemyCardFxTokenB"),
    enemyCardC: $("enemyCardC"),
    enemyRestFxOverlayC: $("enemyRestFxOverlayC"),
    enemyCardFxLayerC: $("enemyCardFxLayerC"),
    enemyCardFxTokenC: $("enemyCardFxTokenC"),
    eAHpBarWrap: $("eAHpBarWrap"),
    eAStaggerBarWrap: $("eAStaggerBarWrap"),
    eBHpBarWrap: $("eBHpBarWrap"),
    eBStaggerBarWrap: $("eBStaggerBarWrap"),
    eCHpBarWrap: $("eCHpBarWrap"),
    eCStaggerBarWrap: $("eCStaggerBarWrap"),
    enemyFieldBadgeA: $("enemyFieldBadgeA"),
    enemyFieldBadgeB: $("enemyFieldBadgeB"),
    enemyFieldBadgeC: $("enemyFieldBadgeC"),
    enemyExecuteWrapA: $("enemyExecuteWrapA"),
    enemyExecuteWrapB: $("enemyExecuteWrapB"),
    enemyWaitingOverlayB: $("enemyWaitingOverlayB"),
    enemyExecuteWrapC: $("enemyExecuteWrapC"),
    actExecuteA: $("actExecuteA"),
    actExecuteB: $("actExecuteB"),
    actExecuteC: $("actExecuteC"),
    intentAInCard: $("intentAInCard"),
    intentBInCard: $("intentBInCard"),
    intentCInCard: $("intentCInCard"),
    pHpBar: $("pHpBar"),
    pHpText: $("pHpText"),
    pStaggerBar: $("pStaggerBar"),
    pStaggerText: $("pStaggerText"),
    pFlags: $("pFlags"),
    enemyAName: $("enemyAName"),
    eAHpBar: $("eAHpBar"),
    eAHpText: $("eAHpText"),
    eAStaggerBar: $("eAStaggerBar"),
    eAStaggerText: $("eAStaggerText"),
    eAFlags: $("eAFlags"),
    enemyBName: $("enemyBName"),
    eBHpBar: $("eBHpBar"),
    eBHpText: $("eBHpText"),
    eBStaggerBar: $("eBStaggerBar"),
    eBStaggerText: $("eBStaggerText"),
    eBFlags: $("eBFlags"),
    enemyCName: $("enemyCName"),
    eCHpBar: $("eCHpBar"),
    eCHpText: $("eCHpText"),
    eCStaggerBar: $("eCStaggerBar"),
    eCStaggerText: $("eCStaggerText"),
    eCFlags: $("eCFlags"),
    btnRestart: $("btnRestart"),
    actAttack: $("actAttack"),
    actHeavy: $("actHeavy"),
    actDefend: $("actDefend"),
    actBlock: $("actBlock"),
    actRest: $("actRest"),
    actHintAttack: $("actHintAttack"),
    actHintHeavy: $("actHintHeavy"),
    actHintDefend: $("actHintDefend"),
    actHintBlock: $("actHintBlock"),
    actHintRest: $("actHintRest"),
  };
}

function renderWarehouseSummaryTable(state) {
  const p = state.player;
  // 汇总里 Max HP/失衡上限只展示“卡片额外部分”，不包含初始基础值
  const baseHpMax = ns(6);
  const baseStg = 4;
  const extraHpMax = Math.max(0, (p.hpMax || 0) - baseHpMax);
  const extraStg = Math.max(0, (p.staggerThreshold || 0) - baseStg);
  const rows = [
    ["ATK 加成", p.atkBonus || 0],
    ["防御额外减伤", p.defendMitigationBonus || 0],
    ["Max HP（额外）", extraHpMax],
    ["失衡上限（额外）", extraStg],
    ["重击额外失衡", p.heavyStgBonus || 0],
    ["处决回血", p.executeHealBonus || 0],
  ];
  const trs = rows.map(([k, v]) => `<tr><td>${escapeHtml(k)}</td><td>${escapeHtml(v)}</td></tr>`).join("");
  return `<table><tbody>${trs}</tbody></table>`;
}

function renderWarehouseCardHtml(tag, title, desc, cls = "", extrasLine = "") {
  const c = cls ? ` wh-card--${escapeHtml(String(cls))}` : "";
  const ex = extrasLine ? `<div class="wh-card-extras">${escapeHtml(extrasLine)}</div>` : "";
  return `<div class="wh-card${c}">${ex}<div class="wh-card-title">${escapeHtml(title)}</div><div class="wh-card-desc">${escapeHtml(desc)}</div></div>`;
}

function renderWarehouseCards(state) {
  const cards = [];
  const tech = (state.perks || []).map((perk) => perkCardById(perk));

  for (const c of tech) {
    const p = c?.primary || "tech";
    const tagText = techPrimaryLabel(p);
    cards.push(renderWarehouseCardHtml(tagText, c.title, c.desc, techTagCssForPerk(c.perk), techExtraTagsLine(c)));
  }
  if (state.orangeLoot) {
    cards.push(renderWarehouseCardHtml("橙卡", state.orangeLoot.name, state.orangeLoot.desc, "orange"));
  }
  if (state.lootR3?.drops?.length) {
    const taken = (state.lootR3.drops || []).filter((d) => state.lootR3.taken?.[d.id]);
    for (const d of taken) {
      cards.push(renderWarehouseCardHtml("装备", d.title, d.desc, "equip"));
    }
  }
  // 属性成长卡
  const attrGrowths = state._attrGrowthLog || [];
  for (const g of attrGrowths) {
    cards.push(renderWarehouseCardHtml("属性", g.title, g.desc, "attr"));
  }
  if (!cards.length) {
    return `<div class="wh-empty">暂无卡片</div>`;
  }
  return `<div class="wh-grid">${cards.join("")}</div>`;
}

function renderFlags(targetEl, fighter, isPlayer, opts = {}) {
  targetEl.innerHTML = "";
  const flags = [];
  if (fighter.broken) flags.push({ text: "破绽", cls: "warn" });
  if (isPlayer && opts.restEvadeActive) flags.push({ text: "闪避", cls: "good" });
  if (isPlayer && fighter.hp <= 0) flags.push({ text: "死亡", cls: "danger" });
  if (isPlayer && fighter.hp > 0 && fighter.hp <= ns(2)) flags.push({ text: "濒死", cls: "danger" });
  for (const f of flags) {
    const el = document.createElement("span");
    el.className = `flag ${f.cls || ""}`.trim();
    el.textContent = f.text;
    targetEl.appendChild(el);
  }
  if (!flags.length) {
    const el = document.createElement("span");
    el.className = "flag";
    el.textContent = "—";
    targetEl.appendChild(el);
  }
}

function render(state, ui) {
  if (lastSkillTipUiPhase === "fight" && state.phase !== "fight") hideSkillHoverTooltip(state, ui);
  lastSkillTipUiPhase = state.phase;
  syncMeritGradeUpgradeBannerVisibility(ui, state);

  const chapter = CHAPTERS[state.chapterId] || CHAPTERS.chapter1;
  const node = chapter.nodes[state.nodeId] || chapter.nodes[chapter.startNodeId];
  /** 第一章通关结算页：阵前形势下内嵌胜利条 + 结算区（不再用 growth 浮层战功榜） */
  const chapter1S1Inline = state.chapterId === "chapter1" && node.id === "S1";
  /** 须尽早同步：render 后部存在 early return，否则会沿用上一帧的 hidden=false，把通关块叠在首页 intro 上 */
  if (ui.chapterSettleStack) {
    const showDock = chapter1S1Inline;
    ui.chapterSettleStack.hidden = !showDock;
    ui.chapterSettleStack.setAttribute("aria-hidden", showDock ? "false" : "true");
    if (showDock) populateChapterSettleInline(state, ui);
  }
  ui.battleInfoPanel?.classList.toggle("battle-info-panel--chapter1-s1-settle", !!chapter1S1Inline);
  state.nodeMeta = { type: node.type, title: node.title || "", subtitle: node.subtitle || "" };
  // 容错：若停留在战斗节点却处于 node 相位，会导致“没有开始战斗按钮/卡片空白”的假死界面
  if ((node.type === "B" || node.type === "E") && state.phase === "node") {
    state.phase = "ready";
    state.pendingBattleNodeId = node.id;
  }
  if (ui.pageTitle) {
    ui.pageTitle.textContent = `${chapter.title}｜${node.title || "—"}`;
  }
  renderChapterRoadmap(state, ui);

  if (state.phase !== BOSS_EXEC_PLAYER_DRAMA_PHASE) {
    stripBossExecutePlayerDramaFx(ui);
  }

  // 血条/失衡条：仅在战斗中、且“首帧渲染完成后”才开启线性过渡
  // 目的：避免进入 fight 的那一刻出现“从 0% 加满再回落”的动画。
  const inFightPhase =
    state.phase === "fight" ||
    state.phase === "resolving" ||
    state.phase === BOSS_EXEC_PLAYER_DRAMA_PHASE ||
    state.phase === "ending" ||
    state.phase === "endingLose";
  if (inFightPhase && !state._metersPrimed) {
    // 首帧先渲染到正确数值（不带 transition），然后下一帧再开启 transition
    if (!state._metersPrimeReq) {
      state._metersPrimeReq = true;
      requestAnimationFrame(() => {
        state._metersPrimed = true;
        state._metersPrimeReq = false;
        render(state, ui);
      });
    }
  } else if (!inFightPhase) {
    state._metersPrimed = false;
    state._metersPrimeReq = false;
  }
  document.body.classList.toggle("anim-meters", inFightPhase && !!state._metersPrimed);
  document.body.classList.toggle(
    "ending-slowmo",
    state.phase === "ending" ||
      state.phase === "endingLose" ||
      (!!state._winKillRevealEnemyIds && state._winKillRevealEnemyIds.length > 0),
  );
  // 战斗胜利后：若下一节点是成长(R)，直接弹出三选一奖励，不再点「领取奖励」
  if (state.phase === "win" && state.winReady && !state.winGrowthEmbed && state.pendingWinNextNodeId) {
    const nextNode = chapter.nodes[state.pendingWinNextNodeId];
    if (nextNode && nextNode.type === "R") {
      markRoadmapNodeDone(state, state.nodeId);
      state.winReady = true;
      state.winGrowthEmbed = true;
      state.winGrowthEmbedNodeId = state.pendingWinNextNodeId;
      state.pendingWinNextNodeId = null;
    }
  }
  const showWinOverlayPanel =
    state.phase === "win" &&
    (state.winReady || state.winGrowthEmbed || state.winGrowthPendingAdvance);
  if (ui.battleWinInline) {
    const isBattle = node.type === "B" || node.type === "E";
    const show = isBattle && showWinOverlayPanel;
    ui.battleWinInline.hidden = !show;
    ui.battleWinInline.setAttribute("aria-hidden", show ? "false" : "true");
    if (ui.battleWinInlineVictory) {
      ui.battleWinInlineVictory.hidden =
        !show ||
        (!state.winReady && !state.winGrowthEmbed);
    }
    if (ui.battleWinInlineAdvance) {
      const p = state.winGrowthPendingAdvance;
      // 内嵌三选一：底部「进入下一关」槽位先占位，选卡后再显示按钮，避免版面跳动
      const reserveAdvanceRow = show && (!!state.winGrowthEmbed || !!p);
      ui.battleWinInlineAdvance.hidden = !reserveAdvanceRow;
      ui.battleWinInlineAdvance.classList.toggle("battle-win-inline-advance--waiting", reserveAdvanceRow && !p);
      ui.battleWinInlineAdvance.classList.toggle("battle-win-inline-advance--ready", !!p);
      if (ui.btnWinGrowthNextBattle) ui.btnWinGrowthNextBattle.disabled = !p;
      if (ui.winGrowthNextSubtitle) ui.winGrowthNextSubtitle.textContent = (p && p.label) || "";
    }
  }
  const showIntro = state.chapterId === "chapter1" && node.id === "B1" && state.phase === "ready" && !state.introDismissed;
  const introNeedsName = showIntro && !String(state._playerName || "").trim();
  /** 主界面左侧：天下英雄榜（在线前 1000；离线则本机至多 30 条） */
  const introHeroLbLimit = 1000;
  if (showIntro) {
    if (ui.leftCol) ui.leftCol.classList.add("left-col--intro-hero");
    if (ui.settlePanelSection) ui.settlePanelSection.hidden = true;
    if (ui.battleLogPanelTitle) ui.battleLogPanelTitle.textContent = "天下英雄榜";
    const onlineOk = typeof OnlineLeaderboard !== "undefined" && OnlineLeaderboard.isConfigured();
    if (ui.battleLogPanelSubtitle) {
      ui.battleLogPanelSubtitle.textContent = onlineOk ? `前${introHeroLbLimit}名 · 在线排行` : "本机记录（至多30条）";
    }
    if (ui.battleLog) {
      ui.battleLog.classList.add("settle-rank-list", "hero-intro-ranks");
      const hasList = !!ui.battleLog.querySelector(".hero-intro-list");
      const sess = state._introLeftHeroSession || 0;
      if (!state._introLeftHeroLoading && !hasList) {
        state._introLeftHeroLoading = true;
        ui.battleLog.innerHTML = '<div class="hero-intro-loading" role="status">榜单加载中…</div>';
        const paintRows = (arr) => {
          const rows = arr.map((e, i) =>
            buildHeroRankRowHtml(
              { kind: "saved", name: e.name, finalMerit: e.finalMerit, heroName: e.heroName },
              i + 1,
              { markIntroRow: true },
            ),
          ).join("");
          ui.battleLog.innerHTML = `<div class="hero-intro-list">${rows}</div>`;
          // 异步拉榜后须再 render，否则「刷新排行榜」等依赖 DOM 的显隐不会更新
          render(state, ui);
        };
        if (onlineOk) {
          OnlineLeaderboard.fetchLeaderboard(introHeroLbLimit)
            .then((data) => {
              if (sess !== (state._introLeftHeroSession || 0)) {
                state._introLeftHeroLoading = false;
                return;
              }
              state._introLeftHeroLoading = false;
              const arr =
                Array.isArray(data) && data.length
                  ? enrichOnlineLbRowsWithLocalNames(data)
                  : loadChapter1MeritLeaderboard();
              paintRows(arr);
            })
            .catch(() => {
              if (sess !== (state._introLeftHeroSession || 0)) {
                state._introLeftHeroLoading = false;
                return;
              }
              state._introLeftHeroLoading = false;
              paintRows(loadChapter1MeritLeaderboard());
            });
        } else {
          state._introLeftHeroLoading = false;
          paintRows(loadChapter1MeritLeaderboard());
        }
      }
    }
    if (ui.dividerBeforeBelowActions) ui.dividerBeforeBelowActions.hidden = true;
    if (ui.belowActionsWrap) ui.belowActionsWrap.hidden = true;
    const listReady = !!ui.battleLog?.querySelector(".hero-intro-list");
    if (ui.btnIntroHeroLocate) {
      // 开场即显示（含「榜单加载中」），不依赖列表是否已插入，避免在线榜异步返回后仍隐藏
      ui.btnIntroHeroLocate.hidden = false;
      ui.btnIntroHeroLocate.disabled = false;
    }
    if (ui.introHeroLocateMsg && !listReady) ui.introHeroLocateMsg.textContent = "";
  } else {
    if (ui.leftCol?.classList.contains("left-col--intro-hero")) {
      state._introLeftHeroSession = (state._introLeftHeroSession || 0) + 1;
    }
    if (ui.leftCol) ui.leftCol.classList.remove("left-col--intro-hero");
    if (ui.settlePanelSection) ui.settlePanelSection.hidden = false;
    if (ui.battleLog) ui.battleLog.classList.remove("settle-rank-list", "hero-intro-ranks");
    state._introLeftHeroLoading = false;
    if (ui.btnIntroHeroLocate) ui.btnIntroHeroLocate.hidden = true;
    if (ui.introHeroLocateMsg) ui.introHeroLocateMsg.textContent = "";
    if (ui.battleLogPanelTitle) ui.battleLogPanelTitle.textContent = "阵前纪事";
    if (ui.battleLogPanelSubtitle) ui.battleLogPanelSubtitle.textContent = "刀兵往来，瞬息可变";
    if (ui.settleLogPanelTitle) ui.settleLogPanelTitle.textContent = "战后军报";
    if (ui.settleLogPanelSubtitle) ui.settleLogPanelSubtitle.textContent = "功过赏罚";
  }
  if (chapter1S1Inline && ui.settlePanelSection) ui.settlePanelSection.hidden = true;
  if (ui.introOverlay) {
    // 仅开局 B1 的战前（ready）显示；点击「开始战斗」后隐藏
    ui.introOverlay.hidden = !showIntro;
    if (!showIntro) {
      state._introHeroLbDone = false;
    }
    if (showIntro && ui.introTop3) {
      if (!state._introHeroLbDone) {
        state._introHeroLbDone = true;
        const olOk = typeof OnlineLeaderboard !== "undefined" && OnlineLeaderboard.isConfigured();
        if (olOk) {
          ui.introTop3.innerHTML =
            '<div class="intro-top3-empty intro-top3-loading" role="status">榜单加载中…</div>';
          OnlineLeaderboard.fetchLeaderboard(10)
            .then((online) => {
              if (!ui.introTop3) return;
              if (Array.isArray(online) && online.length) {
                const merged = enrichOnlineLbRowsWithLocalNames(online);
                ui.introTop3.innerHTML = buildIntroTop10HtmlFromList(merged);
              } else {
                ui.introTop3.innerHTML = buildIntroTop3Html();
              }
            })
            .catch(() => {
              if (ui.introTop3) ui.introTop3.innerHTML = buildIntroTop3Html();
            });
        } else {
          ui.introTop3.innerHTML = buildIntroTop3Html();
        }
      }
    }
  }
  const hasProfileName = !!String(state._playerName || "").trim();
  const canShowProfileButtons = !!(hasProfileName && state._chapter1Cleared);
  // intro 下只允许出现「我敢！」或「继续/新角色」，不显示“开始战斗”
  if (ui.btnIntroDare) ui.btnIntroDare.hidden = !(showIntro && !canShowProfileButtons);
  if (ui.btnIntroContinue) {
    const show = showIntro && canShowProfileButtons;
    ui.btnIntroContinue.hidden = !show;
    if (show) ui.btnIntroContinue.textContent = "仍以旧名出战";
  }
  if (ui.btnIntroNew) {
    ui.btnIntroNew.hidden = !(showIntro && canShowProfileButtons);
  }
  if (ui.btnWinContinue) {
    const isBattle = node.type === "B" || node.type === "E";
    const showWinBtn = isBattle && state.phase === "win" && state.winReady && !state.winGrowthEmbed;
    ui.btnWinContinue.hidden = !showWinBtn;
    ui.btnWinContinue.textContent = showWinBtn && node.id === "BOSS" ? "通关结算" : "领赏";
  }
  // 「恭喜进入战功名人堂」不应在每场胜利弹层出现：改到 Boss 通关后的 S1 积分结算页展示
  if (ui.btnWinClaim) ui.btnWinClaim.hidden = true;
  const isBattleNode = node.type === "B" || node.type === "E";
  const inReady = isBattleNode && state.phase === "ready";
  /** 仅进入战斗后（含进行中/结算动画/胜败）才显示 HP/失衡与行动区；战前与非战斗节点一律不显示 */
  const isWinScreen = showWinOverlayPanel;
  const showCombatBody = isBattleNode && state.phase !== "ready" && !isWinScreen;
  if (ui.tipsPanel) ui.tipsPanel.hidden = false;
  const beginnerOn = isBeginnerModeEnabled(ui);
  ui.belowActionsWrap?.classList.toggle("below-actions--tips-collapsed", !beginnerOn);
  ui.tipsPanel?.classList.toggle("tips-panel--collapsed", !beginnerOn);
  // 「开始战斗」槽位：战中用不可见占位保持与战前相同文档流高度，使按键/相克/新手绝对位置一致
  if (ui.preFightStartWrap) {
    const winScreen = isWinScreen;
    if (!isBattleNode || winScreen || showIntro) {
      ui.preFightStartWrap.hidden = true;
      ui.preFightStartWrap.classList.remove("pre-fight-start--placeholder");
    } else {
      ui.preFightStartWrap.hidden = false;
      ui.preFightStartWrap.classList.toggle(
        "pre-fight-start--placeholder",
        !inReady && state.phase !== "lose",
      );
    }
  }
  if (ui.btnStartBattle) ui.btnStartBattle.hidden = !(isBattleNode && state.phase === "ready" && !showIntro);
  if (ui.btnRetryBattle) ui.btnRetryBattle.hidden = !(isBattleNode && state.phase === "lose");
  if (ui.btnLoseBackToMain) ui.btnLoseBackToMain.hidden = !(isBattleNode && state.phase === "lose");
  if (ui.battleInfoPanel) ui.battleInfoPanel.classList.toggle("battle-info-panel--ready", inReady);
  if (ui.battleInfoPanel) ui.battleInfoPanel.classList.toggle("battle-info-panel--intro-title", !!showIntro);
  if (ui.battleInfoPanel) ui.battleInfoPanel.classList.toggle("battle-info-panel--combat-fixed", isBattleNode && !showIntro);
  syncBattleCombatStageEnemySlotClass(ui);
  // B1：乙位未上场时缩小其卡片
  if (ui.battleInfoPanel) {
    const eoBHere = state.enemies.find((x) => x.id === "B");
    const b1Waiting =
      state.battle?.battleNodeId === "B1" &&
      !!eoBHere?.waitingToEnter &&
      (state.phase === "fight" || state.phase === "resolving");
    ui.battleInfoPanel.classList.toggle("b1-waiting-card-small", b1Waiting);
  }
  if (ui.enemyRowWrap) {
    if (inReady) ui.enemyRowWrap.setAttribute("inert", "");
    else ui.enemyRowWrap.removeAttribute("inert");
  }
  if (ui.playerRowWrap) {
    if (inReady) ui.playerRowWrap.setAttribute("inert", "");
    else ui.playerRowWrap.removeAttribute("inert");
  }
  const showGrowth = state.phase === "node" && (node.type === "R" || node.type === "S" || node.type === "N");
  const showGrowthOverlay = showGrowth && !chapter1S1Inline;
  // 必须在可能 early-return 的成长分支之前同步，否则非战斗/成长界面仍会露出占位血条
  if (!inReady) {
    setCombatBodyVisibility(ui, showCombatBody);
    // 成长 / 胜利内嵌选卡：保留下方卡片仓库与新手提示（选卡飞入仓库动画目标）
    if (showGrowthOverlay || isWinScreen) {
      if (ui.actionsWrap) ui.actionsWrap.hidden = false;
      if (ui.dividerBeforeBelowActions) ui.dividerBeforeBelowActions.hidden = false;
      if (ui.belowActionsWrap) ui.belowActionsWrap.hidden = false;
    }
    // 第一章 S1 内嵌通关页：不显示战法卷与军前提要，仅保留结算区
    if (chapter1S1Inline) {
      if (ui.actionsWrap) ui.actionsWrap.hidden = true;
      if (ui.actionDesc) ui.actionDesc.hidden = true;
      if (ui.dividerBeforeBelowActions) ui.dividerBeforeBelowActions.hidden = true;
      if (ui.belowActionsWrap) ui.belowActionsWrap.hidden = true;
    }
  }

  if (ui.growthContinueBar) ui.growthContinueBar.hidden = true;
  ui.battleInfoPanel?.classList.remove("growth-r3-continue");
  // resolving 时 VS 条由 .is-resolving 样式隐藏（visibility 占位，见 style.css），此处勿设 hidden

  // 领取奖励后：下一节点为 R 时在战斗区内嵌层直接展示成长翻牌（不切全屏 growth）
  if (
    state.phase === "win" &&
    state.winGrowthEmbed &&
    ui.winGrowthEmbed &&
    ui.winGrowthTitle &&
    ui.winGrowthSubtitle &&
    ui.winGrowthOptions
  ) {
    if (ui.growthOverlay) ui.growthOverlay.hidden = true;
    const gNode = chapter.nodes[state.winGrowthEmbedNodeId];
    ui.winGrowthEmbed.hidden = !gNode;
    if (gNode && gNode.type === "R") {
      ui.winGrowthTitle.textContent = gNode.title || "成长";
      ui.winGrowthSubtitle.textContent = gNode.subtitle || "";
      ui.winGrowthOptions.innerHTML = "";
      const rPick = buildRGrowthPickOptions(state, gNode);
      renderGrowthAsCards(state, ui, chapter, gNode, rPick || [], ui.winGrowthOptions, {
        winInlinePick: true,
      });
      return;
    }
    state.winGrowthEmbed = false;
    state.winGrowthEmbedNodeId = null;
  } else if (ui.winGrowthEmbed) {
    ui.winGrowthEmbed.hidden = true;
  }

  // 成长面板：用战斗信息内展示（替代标题栏下方模块）
  if (ui.growthOverlay) ui.growthOverlay.hidden = !showGrowthOverlay;
  ui.growthOverlay?.classList.remove("growth-overlay--boss-alert");
  if (ui.nodeOptions && chapter1S1Inline) ui.nodeOptions.innerHTML = "";
  if (showGrowthOverlay && ui.nodeTitle && ui.nodeSubtitle && ui.nodeOptions) {
    ui.nodeTitle.textContent = node.title || "成长";
    ui.nodeSubtitle.textContent = node.subtitle || "";
    ui.nodeOptions.innerHTML = "";
    let opts = (node.options || []).slice();
    const rPick = buildRGrowthPickOptions(state, node);
    if (rPick) opts = rPick;
    else if (node.id === "N4") {
      ui.nodeTitle.textContent = "";
      ui.nodeSubtitle.textContent = "";
      ui.nodeOptions.innerHTML = "";
      ui.growthOverlay?.classList.add("growth-overlay--boss-alert");
      const bossNode = chapter.nodes["BOSS"];
      const bossName = bossNode?.battle?.waves?.[0]?.slots?.[0]?.name || "边寨渠帅";
      const alert = document.createElement("div");
      alert.className = "boss-alert";
      alert.innerHTML = [
        `<div class="boss-alert__accent"></div>`,
        `<div class="boss-alert__icon">⚔</div>`,
        `<div class="boss-alert__warn">WARNING</div>`,
        `<div class="boss-alert__title">${escapeHtml(bossName)}来袭</div>`,
        `<div class="boss-alert__flavor">${bossAlertFlavorHighlightHtml(bossNode?.body || "")}</div>`,
        `<div class="boss-alert__divider"></div>`,
      ].join("");
      const engageBtn = document.createElement("button");
      engageBtn.type = "button";
      engageBtn.className = "btn btn-danger boss-alert__btn";
      engageBtn.textContent = "迎击Boss";
      engageBtn.addEventListener("click", () => {
        applyGrowthOption(state, ui, chapter, node, {
          id: "boss",
          title: "迎击Boss",
          desc: "",
          next: "BOSS",
        });
      });
      alert.appendChild(engageBtn);
      ui.nodeOptions.appendChild(alert);
      opts = [];
    }

    // 成长节点统一用卡片交互（盖住→翻开→点选→显示确认按钮→确认生效）
    if (node.type === "R") {
      renderGrowthAsCards(state, ui, chapter, node, opts);
      return;
    }

    for (const opt of opts) {
      const btn = document.createElement("button");
      btn.type = "button";
      const isS1Replay = node.id === "S1" && opt.id === "hook";
      btn.className = isS1Replay ? "btn btn-offense merit-replay-cta" : "btn btn-secondary";
      btn.innerHTML = isS1Replay
        ? [
            `<span class="merit-replay-cta__badge">再次出征</span>`,
            `<span class="merit-replay-cta__title">${escapeHtml(opt.title || "再玩一局")}</span>`,
            `<span class="merit-replay-cta__desc">从边寨外哨重新开局，刷新你的战功与评级。</span>`,
          ].join("")
        : [
            `<span class="option-kicker">选择</span>`,
            `<span class="option-title">${escapeHtml(opt.title || "继续")}</span>`,
            `<span class="option-desc">${escapeHtml(opt.desc || "")}</span>`,
          ].join("");
      btn.addEventListener("click", () => {
        applyGrowthOption(state, ui, chapter, node, opt);
      });
      ui.nodeOptions.appendChild(btn);
    }
  }

  // 剧情/目标已取消

  if (ui.btnRestart) {
    const battleNode = node.type === "B" || node.type === "E";
    ui.btnRestart.textContent =
      battleNode &&
      (state.phase === "fight" ||
        state.phase === BOSS_EXEC_PLAYER_DRAMA_PHASE ||
        state.phase === "endingLose" ||
        state.phase === "lose")
        ? "重试"
        : "回到标题";
  }

  const eoAFight = state.enemies.find((x) => x.id === "A");
  const eoBFight = state.enemies.find((x) => x.id === "B");
  const eoCFight = state.enemies.find((x) => x.id === "C");
  const hasThird = !!eoCFight;
  if (ui.enemyCardC) ui.enemyCardC.hidden = !hasThird;
  /** 边寨头目战：头目卡占敌区两格宽度，亲兵占第三格 */
  if (ui.enemyRowWrap) {
    ui.enemyRowWrap.classList.toggle(
      "enemy-row--boss-wide",
      !!(eoAFight && eoBFight && !eoCFight && eoAFight.archetype === "boss"),
    );
  }

  // pre-fight：不显示敌我 HP/失衡 卡；保留「开始战斗」、招式键、键下说明、相克速查与新手提示
  if (inReady) {
    clearBattleEntranceB1(state, ui);
    if (ui.endingMeritTicker) {
      ui.endingMeritTicker.hidden = true;
      ui.endingMeritTicker.setAttribute("aria-hidden", "true");
    }
    if (ui.turnInfo) ui.turnInfo.textContent = "—";
    if (showIntro) {
      if (ui.actionDesc) ui.actionDesc.hidden = true;
      if (ui.actionsWrap) ui.actionsWrap.hidden = true;
      if (ui.dividerBeforeBelowActions) ui.dividerBeforeBelowActions.hidden = true;
      if (ui.belowActionsWrap) ui.belowActionsWrap.hidden = true;
    } else {
      if (ui.actionDesc) {
        ui.actionDesc.innerHTML = toRichHtml("—");
        ui.actionDesc.hidden = false;
      }
      if (ui.actionsWrap) ui.actionsWrap.hidden = false;
      if (ui.dividerBeforeBelowActions) ui.dividerBeforeBelowActions.hidden = false;
      if (ui.belowActionsWrap) ui.belowActionsWrap.hidden = false;
    }
    setFighterSlotsVisibility(ui, true);
    // 键下说明不再显示（包含数值）
    if (ui.actHintAttack) ui.actHintAttack.innerHTML = "";
    if (ui.actHintHeavy) ui.actHintHeavy.innerHTML = "";
    if (ui.actHintDefend) ui.actHintDefend.innerHTML = "";
    if (ui.actHintBlock) ui.actHintBlock.innerHTML = "";
    if (ui.actHintRest) ui.actHintRest.innerHTML = "";
    // disable actions
    ui.actAttack.disabled = true;
    ui.actHeavy.disabled = true;
    ui.actDefend.disabled = true;
    ui.actBlock.disabled = true;
    ui.actRest.disabled = true;
    ui.actExecuteA.disabled = true;
    ui.actExecuteB.disabled = true;
    if (ui.actExecuteC) ui.actExecuteC.disabled = true;
    // 战前也同步仓库（否则「再玩一局」等重置 state 后仍会残留上一屏的卡片 DOM）
    if (ui.warehouseCards) ui.warehouseCards.innerHTML = renderWarehouseCards(state);
    // stop here (avoid rendering meters on placeholder enemies)
    return;
  }

  if (ui.enemyCardC) ui.enemyCardC.hidden = !hasThird;

  // B1：开始战斗后仅首次渲染触发——我方先入场，再甲、乙（丙若在场）依次自左展开
  if (state.phase === "fight" && state.battle?.battleNodeId === "B1" && state.battleEntranceB1Pending && ui.battleInfoPanel) {
    state.battleEntranceB1Pending = false;
    ui.battleInfoPanel.classList.add("battle-entrance-b1");
    if (state._battleEntranceB1Timer) clearTimeout(state._battleEntranceB1Timer);
    // 与 CSS 一致：丙位 delay 1.08s + 动画 0.44s ≈ 1.52s，提前卸类会掐断动画导致偶发抖动/跳变
    state._battleEntranceB1Timer = setTimeout(() => {
      if (ui.battleInfoPanel) ui.battleInfoPanel.classList.remove("battle-entrance-b1");
      state._battleEntranceB1Timer = null;
    }, 1680);
  }

  const showBattleMeritTurnStrip =
    !!state._meritSession &&
    (state.phase === "fight" ||
      state.phase === "resolving" ||
      state.phase === BOSS_EXEC_PLAYER_DRAMA_PHASE ||
      state.phase === "ending" ||
      state.phase === "endingLose" ||
      state.phase === "lose");

  // 标题副行：战功关的回合数由下方固定条展示，此处留空以免与条重复
  if (chapter1S1Inline && ui.turnInfo && state.phase !== "ending") {
    ui.turnInfo.textContent = state.meritChapter?.records?.BOSS ? "边寨已定 · 战罢" : "提前结算 · 回营封卷";
  } else if (ui.turnInfo && state.phase !== "ending") {
    ui.turnInfo.textContent = showBattleMeritTurnStrip ? "" : "—";
  }

  if (ui.endingMeritTicker) {
    ui.endingMeritTicker.hidden = !showBattleMeritTurnStrip;
    ui.endingMeritTicker.setAttribute("aria-hidden", showBattleMeritTurnStrip ? "false" : "true");
    const lockTurnDisplayForEndingAnim = state.phase === "ending" && state._endingHealAnimating;
    if (showBattleMeritTurnStrip && !lockTurnDisplayForEndingAnim) {
      const bid = state.battle?.battleNodeId;
      const limUi = meritBattleTurnLimit(bid);
      const ctxUi = state._meritTurnContext;
      const usedUi = ctxUi ? Math.max(0, (ctxUi.turnIndex || 1) - 1) : 0;
      if (ui.endingMeritBattleTurn) {
        ui.endingMeritBattleTurn.textContent = limUi != null ? `${usedUi}/${limUi}` : "—";
      }
    }
  }

  // 敌我之间原「VS」：战功关为「第X回合」（与 turnIndex 一致）；自倒数第三回合起红字放大
  if (ui.battleVsTurnLabel && ui.dividerAfterEnemies && !ui.dividerAfterEnemies.hidden && isBattleNode) {
    const bidVs = state.battle?.battleNodeId;
    const limVs = meritBattleTurnLimit(bidVs);
    const ctxVs = state._meritTurnContext;
    let vsText = "VS";
    let vsUrgent = false;
    if (limVs != null && ctxVs) {
      const ti = ctxVs.turnIndex || 1;
      vsText = `第${ti}回合`;
      vsUrgent = ti >= Math.max(1, limVs - 2);
    } else {
      vsText = `第${formatBattleTurnNumber(state.globalTurn)}回合`;
    }
    ui.battleVsTurnLabel.textContent = vsText;
    ui.battleVsTurnLabel.classList.toggle("battle-vs-divider__vs--urgent", vsUrgent);
    if (ui.dividerAfterEnemies) ui.dividerAfterEnemies.setAttribute("aria-label", vsText === "VS" ? "对阵" : vsText);
  }

  // meters
  const p = state.player;
  const eA = eoAFight.fighter;
  const eB = eoBFight.fighter;

  // 计量条外框长度统一固定：仅用 fill 比例表达当前状态

  // 受击抖动：仅在战斗中、且至少过了开场首回合，且 HP 下降时触发
  // 开场冷却 / B1 上场动画未结束前：只同步血量快照、不触发抖动（避免入场 transform 与 hit-shake 叠层、以及掐断动画后的跳变）
  if (state.phase === "fight" && state.globalTurn > 1) {
    const now = typeof performance !== "undefined" ? performance.now() : 0;
    const entranceOn = !!ui.battleInfoPanel?.classList.contains("battle-entrance-b1");
    const inOpenGuard = entranceOn || now < (state._battleNoHitShakeUntilMs || 0);
    const last = state._lastHp || {};
    const hit = (el) => {
      if (!el) return;
      el.classList.remove("hit-shake");
      // 触发重启动画
      void el.offsetWidth;
      el.classList.add("hit-shake");
    };
    if (!inOpenGuard) {
      if (typeof last.p === "number" && p.hp < last.p) hit(ui.playerCard);
      if (typeof last.A === "number" && eA.hp < last.A) hit(ui.enemyCardA);
      if (!eoBFight.waitingToEnter && typeof last.B === "number" && eB.hp < last.B) hit(ui.enemyCardB);
      if (eoCFight && !eoCFight.waitingToEnter) {
        const eC = eoCFight.fighter;
        if (typeof last.C === "number" && eC.hp < last.C) hit(ui.enemyCardC);
      }
    }
    // 更新缓存（只记本回合实际在场的）
    state._lastHp = {
      p: p.hp,
      A: eA.hp,
      B: eoBFight.waitingToEnter ? undefined : eB.hp,
      C: eoCFight && !eoCFight.waitingToEnter ? eoCFight.fighter.hp : undefined,
    };
  } else {
    state._lastHp = null;
  }

  if (state.phase === "fight" && state._clearHitShakeOnNextFightRender) {
    state._clearHitShakeOnNextFightRender = false;
    for (const el of [ui.playerCard, ui.enemyCardA, ui.enemyCardB, ui.enemyCardC]) {
      el?.classList.remove("hit-shake");
    }
  }

  if (ui.playerName) {
    const nick = String(state._playerName || "").trim();
    ui.playerName.textContent = nick ? `${p.name}（${nick}）` : p.name;
  }
  if (ui.playerLevel) ui.playerLevel.textContent = "";
  // 濒死：卡片框红光呼吸
  ui.playerCard?.classList.toggle("player-critical", p.hp > 0 && p.hp <= ns(2));
  // 破绽：卡片内红字大提示
  if (ui.playerBrokenBanner) ui.playerBrokenBanner.hidden = !p.broken;
  if (ui.playerDeadBanner) {
    const showDeadBanner =
      state.phase === "lose" || (state.phase === "endingLose" && state._endingDeathDone);
    ui.playerDeadBanner.hidden = !showDeadBanner;
    if (showDeadBanner && !ui.playerDeadBanner.querySelector(".player-dead-stamp")) {
      fillPlayerDeadBannerStamp(ui, !!state._deathByExecute, !!state._loseByMeritTurns);
      if (state.phase === "lose" && !state._endingDeathAnimating) {
        ui.playerDeadBanner.classList.remove("stamp-in");
        void ui.playerDeadBanner.offsetWidth;
        ui.playerDeadBanner.classList.add("stamp-in");
      }
    }
  }
  if (ui.playerMeritTurnWarn) {
    const bidW = state.battle?.battleNodeId;
    const limW = meritBattleTurnLimit(bidW);
    if (state.phase === "fight" && limW != null && state._meritTurnContext) {
      const ti = state._meritTurnContext.turnIndex || 1;
      const usedW = Math.max(0, ti - 1);
      const remW = limW - usedW;
      if (remW <= 3 && remW > 0) {
        const warnLines = {
          3: "本战尚余三回合——逾时未胜即判负。",
          2: "尚余两回合，请抓紧破局。",
          1: "最后一回合！",
        };
        ui.playerMeritTurnWarn.textContent = warnLines[remW] || "";
        ui.playerMeritTurnWarn.hidden = false;
        ui.playerCard?.classList.add("player-card--merit-warn");
      } else {
        ui.playerMeritTurnWarn.hidden = true;
        ui.playerMeritTurnWarn.textContent = "";
        ui.playerCard?.classList.remove("player-card--merit-warn");
      }
    } else {
      ui.playerMeritTurnWarn.hidden = true;
      ui.playerMeritTurnWarn.textContent = "";
      ui.playerCard?.classList.remove("player-card--merit-warn");
    }
  }
  if (!state._endingHealAnimating && !state._endingDeathAnimating) {
    ui.pHpText.textContent = `${p.hp}/${p.hpMax}`;
    ui.pHpBar.style.width = percent(p.hp / Math.max(1, p.hpMax));
    ui.pStaggerText.textContent = `${p.stagger}/${p.staggerThreshold}`;
    ui.pStaggerBar.style.width = percent(clamp(p.stagger / Math.max(1, p.staggerThreshold || 1), 0, 1));
  }
  // ending 动画时的数值由 runEndingHealMeterAnim 驱动

  const revealA = state._winKillRevealEnemyIds?.includes("A");
  ui.enemyAName.textContent = `${eA.name}${
    eA.hp <= 0 && !revealA ? "（已倒下）" : eA.broken ? "（破绽）" : ""
  }`;
  ui.eAHpText.textContent = eA.hpMax > 0 ? `${eA.hp}/${eA.hpMax}` : "—";
  ui.eAHpBar.style.width = percent(eA.hpMax > 0 ? eA.hp / eA.hpMax : 0);
  ui.eAStaggerText.textContent = `${eA.stagger}/${eA.staggerThreshold}`;
  ui.eAStaggerBar.style.width = percent(clamp(eA.stagger / Math.max(1, eA.staggerThreshold || 1), 0, 1));

  if (eoBFight.waitingToEnter) {
    ui.enemyBName.textContent = `${eB.name}`;
    ui.eBHpText.textContent = "—";
    ui.eBHpBar.style.width = "0%";
    ui.eBStaggerText.textContent = "—";
    ui.eBStaggerBar.style.width = "0%";
  } else {
    const revealB = state._winKillRevealEnemyIds?.includes("B");
    ui.enemyBName.textContent = `${eB.name}${
      eB.hp <= 0 && !revealB ? "（已倒下）" : eB.broken ? "（破绽）" : ""
    }`;
    ui.eBHpText.textContent = eB.hpMax > 0 ? `${eB.hp}/${eB.hpMax}` : "—";
    ui.eBHpBar.style.width = percent(eB.hpMax > 0 ? eB.hp / eB.hpMax : 0);
    ui.eBStaggerText.textContent = `${eB.stagger}/${eB.staggerThreshold}`;
    ui.eBStaggerBar.style.width = percent(clamp(eB.stagger / Math.max(1, eB.staggerThreshold || 1), 0, 1));
  }

  if (eoCFight) {
    const eC = eoCFight.fighter;
    const revealC = state._winKillRevealEnemyIds?.includes("C");
    if (ui.enemyCName)
      ui.enemyCName.textContent = `${eC.name}${
        eC.hp <= 0 && !revealC ? "（已倒下）" : eC.broken ? "（破绽）" : ""
      }`;
    if (ui.eCHpText) ui.eCHpText.textContent = eC.hpMax > 0 ? `${eC.hp}/${eC.hpMax}` : "—";
    if (ui.eCHpBar) ui.eCHpBar.style.width = percent(eC.hpMax > 0 ? eC.hp / eC.hpMax : 0);
    if (ui.eCStaggerText) ui.eCStaggerText.textContent = `${eC.stagger}/${eC.staggerThreshold}`;
    if (ui.eCStaggerBar)
      ui.eCStaggerBar.style.width = percent(clamp(eC.stagger / Math.max(1, eC.staggerThreshold || 1), 0, 1));
  }

  function setFieldBadge(el, eo) {
    if (!el) return;
    el.classList.remove("is-on", "is-wait", "is-down");
    if (eo.waitingToEnter) {
      el.textContent = "未上场";
      el.classList.add("is-wait");
      return;
    }
    if (eo.fighter.hp <= 0) {
      if (state._winKillRevealEnemyIds?.includes(eo.id)) {
        el.textContent = "已上场";
        el.classList.add("is-on");
        return;
      }
      el.textContent = "已倒下";
      el.classList.add("is-down");
      return;
    }
    el.textContent = "已上场";
    el.classList.add("is-on");
  }
  setFieldBadge(ui.enemyFieldBadgeA, eoAFight);
  setFieldBadge(ui.enemyFieldBadgeB, eoBFight);
  if (eoCFight) setFieldBadge(ui.enemyFieldBadgeC, eoCFight);

  renderFlags(ui.pFlags, p, true, { restEvadeActive: !!state.battleBuffs?.restEvadeActive });
  renderFlags(ui.eAFlags, eA, false);
  renderFlags(ui.eBFlags, eB, false);
  if (eoCFight && ui.eCFlags) renderFlags(ui.eCFlags, eoCFight.fighter, false);

  // enemy card selection highlight
  ui.enemyCardA.classList.toggle("selected", state.targetId === "A");
  ui.enemyCardB.classList.toggle("selected", state.targetId === "B");
  ui.enemyCardA.classList.toggle("dead", eA.hp <= 0 && !revealA);
  ui.enemyCardB.classList.toggle("dead", !eoBFight.waitingToEnter && eB.hp <= 0 && !state._winKillRevealEnemyIds?.includes("B"));
  ui.enemyCardB.classList.toggle("waiting", !!eoBFight.waitingToEnter);
  if (ui.enemyWaitingOverlayB) {
    ui.enemyWaitingOverlayB.setAttribute("aria-hidden", eoBFight.waitingToEnter ? "false" : "true");
  }
  ui.enemyCardB.tabIndex = eoBFight.waitingToEnter ? -1 : 0;
  ui.enemyCardA.classList.toggle("waiting", false);
  ui.enemyCardA.classList.toggle("is-boss", eoAFight?.archetype === "boss");
  ui.enemyCardB.classList.toggle("is-boss", !eoBFight.waitingToEnter && eoBFight?.archetype === "boss");
  if (ui.enemyCardC) ui.enemyCardC.classList.toggle("is-boss", !!eoCFight && !eoCFight.waitingToEnter && eoCFight?.archetype === "boss");
  if (ui.enemyCardC && eoCFight) {
    const eC = eoCFight.fighter;
    ui.enemyCardC.classList.toggle("selected", state.targetId === "C");
    ui.enemyCardC.classList.toggle("dead", eC.hp <= 0 && !state._winKillRevealEnemyIds?.includes("C"));
    ui.enemyCardC.classList.toggle("waiting", false);
  }

  // enemy intent in card
  ui.intentAInCard.innerHTML =
    eoAFight.fighter.hp <= 0 && !revealA
      ? "意图：甲已倒下"
      : `意图：${
          eoAFight.fighter.broken
            ? "破绽"
            : htmlIntentPillWithHint(eoAFight)
        }${intentDeltaHtml(state, eoAFight)}`;
  ui.intentBInCard.innerHTML = eoBFight.waitingToEnter
    ? "意图：未上场"
    : eoBFight.fighter.hp <= 0 && !state._winKillRevealEnemyIds?.includes("B")
      ? "意图：乙已倒下"
      : `意图：${
          eoBFight.fighter.broken
            ? "破绽"
            : htmlIntentPillWithHint(eoBFight)
        }${intentDeltaHtml(state, eoBFight)}`;
  if (ui.intentCInCard && eoCFight) {
    const eC = eoCFight.fighter;
    ui.intentCInCard.innerHTML =
      eC.hp <= 0 && !state._winKillRevealEnemyIds?.includes("C")
        ? "意图：丙已倒下"
        : `意图：${
            eC.broken
              ? "破绽"
              : htmlIntentPillWithHint(eoCFight)
          }${intentDeltaHtml(state, eoCFight)}`;
  }

  // 总加成汇总 UI 已移除：改为技能图标面板
  // 卡片仓库：只放已获得卡片
  if (ui.warehouseCards) {
    ui.warehouseCards.innerHTML = renderWarehouseCards(state);
    if (state._warehouseNewCard) {
      delete state._warehouseNewCard;
      const lastCard = ui.warehouseCards.querySelector(".wh-grid .wh-card:last-child");
      if (lastCard) lastCard.classList.add("wh-card--enter");
    }
  }

  // action description (rich tokens: {g}/{r}/{o})
  ui.actionDesc.innerHTML = toRichHtml(state.actionDesc || "—");
  syncPlayerCardFlavor(ui, state);

  // tips
  ui.tips.innerHTML = toRichHtml((state.tips || []).join("\n") || "—");

  // battle log
  ui.battleLog.innerHTML = "";
  for (const t of (state.battleLog || []).slice(-200)) {
    const pEl = document.createElement("p");
    pEl.className = "line";
    pEl.innerHTML = toRichHtml(t);
    ui.battleLog.appendChild(pEl);
  }
  ui.battleLog.scrollTop = ui.battleLog.scrollHeight;

  // settle log
  ui.settleLog.innerHTML = "";
  for (const t of (state.settleLog || []).slice(-200)) {
    const pEl = document.createElement("p");
    pEl.className = "line";
    pEl.innerHTML = toRichHtml(t);
    ui.settleLog.appendChild(pEl);
  }
  ui.settleLog.scrollTop = ui.settleLog.scrollHeight;
  renderLocalLeaderboardToSettlePanel(ui, state);

  // actions enabled
  const inFight = state.phase === "fight" || state.phase === "ending";
  const anyEnemyAlive = state.enemies.some((x) => !x.waitingToEnter && x.fighter.hp > 0);
  const canAct = state.phase === "fight" && state.player.hp > 0 && anyEnemyAlive;
  const playerBroken = state.player.broken;
  const pendExec = state._pendingMultiEnemyResolution;
  const execOnlyPend = !!(pendExec && state.phase === "fight");
  const pendExecId = pendExec?.pauseEnemyId;
  const baseDefendLabel = "防御";
  const baseBlockLabel = "盾反";
  const enhSources = getActionEnhancementSources(state);
  /** @param {HTMLButtonElement|null} btn @param {string} base @param {string[]} sources */
  function applyCombatBtnEnhance(btn, base, sources) {
    if (!btn) return;
    const n = sources.length;
    const on = inFight && n > 0;
    if (on) {
      btn.innerHTML = `${escapeHtml(base)}<span class="combat-btn-bonus-suffix">+${n}</span>`;
    } else {
      btn.textContent = base;
    }
  }
  applyCombatBtnEnhance(ui.actAttack, "快攻", enhSources.attack);
  applyCombatBtnEnhance(ui.actHeavy, "重击", enhSources.heavy);
  applyCombatBtnEnhance(ui.actDefend, baseDefendLabel, enhSources.defend);
  applyCombatBtnEnhance(ui.actBlock, baseBlockLabel, enhSources.block);
  const restCd = state.player.restCooldownLeft || 0;
  const restBtnLabel = restCd > 0 ? `调息（${restCd}）` : "调息";
  applyCombatBtnEnhance(ui.actRest, restBtnLabel, enhSources.rest);
  applyCombatBtnEnhance(ui.actExecuteA, LABEL_EXECUTE_ON_CARD, enhSources.execute);
  applyCombatBtnEnhance(ui.actExecuteB, LABEL_EXECUTE_ON_CARD, enhSources.execute);
  applyCombatBtnEnhance(ui.actExecuteC, LABEL_EXECUTE_ON_CARD, enhSources.execute);
  ui.actAttack.disabled = !canAct || playerBroken || execOnlyPend;
  ui.actHeavy.disabled = !canAct || playerBroken || execOnlyPend;
  ui.actDefend.disabled = !canAct || execOnlyPend;
  ui.actBlock.disabled = !canAct || execOnlyPend;
  let canExecuteOnA = inFight && state.player.hp > 0 && eA.hp > 0 && eA.broken && !playerBroken;
  let canExecuteOnB =
    inFight &&
    state.player.hp > 0 &&
    !eoBFight.waitingToEnter &&
    eB.hp > 0 &&
    eB.broken &&
    !playerBroken;
  const eC = eoCFight?.fighter;
  let canExecuteOnC =
    !!eoCFight &&
    inFight &&
    state.player.hp > 0 &&
    !!eC &&
    eC.hp > 0 &&
    eC.broken &&
    !playerBroken;
  if (execOnlyPend) {
    canExecuteOnA = canExecuteOnA && pendExecId === "A";
    canExecuteOnB = canExecuteOnB && pendExecId === "B";
    canExecuteOnC = canExecuteOnC && pendExecId === "C";
  }
  ui.enemyExecuteWrapA.hidden = !canExecuteOnA;
  ui.enemyExecuteWrapB.hidden = !canExecuteOnB;
  if (ui.enemyExecuteWrapC) ui.enemyExecuteWrapC.hidden = !canExecuteOnC;

  ui.enemyCardA.classList.toggle("is-executable", !!canExecuteOnA);
  ui.enemyCardB.classList.toggle("is-executable", !!canExecuteOnB);
  if (ui.enemyCardC) ui.enemyCardC.classList.toggle("is-executable", !!canExecuteOnC);

  ui.actExecuteA.disabled = !canExecuteOnA;
  ui.actExecuteB.disabled = !canExecuteOnB;
  if (ui.actExecuteC) ui.actExecuteC.disabled = !canExecuteOnC;
  ui.actRest.disabled = !canAct || restCd > 0 || execOnlyPend;

  if (inFight) {
    const hints = buildActionButtonEffectHints(state);
    if (ui.actHintAttack) ui.actHintAttack.innerHTML = hints.attack;
    if (ui.actHintHeavy) ui.actHintHeavy.innerHTML = hints.heavy;
    if (ui.actHintDefend) ui.actHintDefend.innerHTML = hints.defend;
    if (ui.actHintBlock) ui.actHintBlock.innerHTML = hints.block;
    if (ui.actHintRest) ui.actHintRest.innerHTML = hints.rest;
  } else {
    if (ui.actHintAttack) ui.actHintAttack.innerHTML = "";
    if (ui.actHintHeavy) ui.actHintHeavy.innerHTML = "";
    if (ui.actHintDefend) ui.actHintDefend.innerHTML = "";
    if (ui.actHintBlock) ui.actHintBlock.innerHTML = "";
    if (ui.actHintRest) ui.actHintRest.innerHTML = "";
  }

  // 若当前目标已倒下，自动切换到仍存活的目标（渲染兜底）
  const cur = state.enemies.find((x) => x.id === state.targetId);
  if (!cur || cur.fighter.hp <= 0 || cur.waitingToEnter) {
    const next = state.enemies.find((x) => !x.waitingToEnter && x.fighter.hp > 0);
    if (next) state.targetId = next.id;
  }

  scheduleB1ActionHint(state, ui);
}

function gotoNode(state, ui, chapterId, nodeId) {
  state.winGrowthEmbed = false;
  state.winGrowthEmbedNodeId = null;
  state.winGrowthPendingAdvance = null;
  state.battleMeritFxQueue = [];
  state.battleMeritFxPlaying = false;
  state.visibleCombo = 0;
  clearBossExecutePlayerDramaTimers(state);
  cancelResolutionAnimation(ui);
  state._pendingMultiEnemyResolution = null;
  state._battleClashAnimating = false;
  const chapter = CHAPTERS[chapterId] || CHAPTERS.chapter1;
  const node = chapter.nodes[nodeId] || chapter.nodes[chapter.startNodeId];
  state.chapterId = chapter.id;
  state.nodeId = node.id;
  state.actionDesc = "—";

  // switch phase by node type
  if (node.type === "B" || node.type === "E") {
    state.phase = "ready";
    state.pendingBattleNodeId = node.id;
    render(state, ui);
    return;
  }

  state.phase = "node";
  state.tips = [];
  render(state, ui);
}

function tutorialOnce(state, key, line) {
  if (!state.tutorialSeen) state.tutorialSeen = {};
  if (state.tutorialSeen[key]) return false;
  state.tutorialSeen[key] = true;
  state.tips = state.tips || [];
  state.tips.unshift(line);
  return true;
}

function mkEnemyFromDef(def, slotId) {
  const f = mkFighter({
    name: def.name || "敌人",
    hp: def.hp ?? 4,
    stagger: 0,
    staggerThreshold: def.staggerThreshold ?? 3,
    level: def.level ?? 1,
  });
  f.strikeBase = def.atk != null ? def.atk : ns(2);
  return {
    id: /** @type {EnemyId} */ (slotId),
    fighter: f,
    intent: /** @type {EnemyIntent} */ ("adjust"),
    ai: def.ai || { quick: 35, heavy: 25, defend: 20, adjust: 20 },
    archetype: def.archetype || "mob",
    canExecutePlayer: !!def.canExecutePlayer,
    canBlockHeavy: !!def.canBlockHeavy,
    waitingToEnter: false,
  };
}

/** 右侧卡片占位：显示「未上场」，甲倒下后再按 def 实装为正式敌人 */
function mkWaitingEnemyEO(def, slotId) {
  const f = mkFighter({
    name: def.name || "敌人",
    hp: 0,
    stagger: 0,
    staggerThreshold: def.staggerThreshold ?? 3,
    level: def.level ?? 1,
  });
  f.hpMax = def.hp ?? 4;
  f.strikeBase = def.atk != null ? def.atk : ns(2);
  return {
    id: /** @type {EnemyId} */ (slotId),
    fighter: f,
    intent: /** @type {EnemyIntent} */ ("adjust"),
    ai: def.ai || { quick: 35, heavy: 25, defend: 20, adjust: 20 },
    archetype: def.archetype || "mob",
    canExecutePlayer: !!def.canExecutePlayer,
    canBlockHeavy: !!def.canBlockHeavy,
    waitingToEnter: true,
    pendingDef: def,
  };
}

function deploySequentialSecondIfNeeded(state, details) {
  if (!state.battle?.sequentialTwoSlots) return;
  const eoA = state.enemies.find((x) => x.id === "A");
  const eoB = state.enemies.find((x) => x.id === "B");
  if (!eoA || !eoB || !eoB.waitingToEnter || !eoB.pendingDef) return;
  if (eoA.fighter.hp > 0) return;
  const d = eoB.pendingDef;
  const real = mkEnemyFromDef(d, "B");
  eoB.fighter = real.fighter;
  eoB.intent = real.intent;
  eoB.ai = real.ai;
  eoB.archetype = real.archetype;
  eoB.canExecutePlayer = real.canExecutePlayer;
  eoB.canBlockHeavy = real.canBlockHeavy;
  eoB.waitingToEnter = false;
  delete eoB.pendingDef;
  if (details) {
    details.push(`→ {o}${eoB.fighter.name}上前接战，堵住你的侧翼！{/o}`);
  }
  state.battleLog.push(`{o}${eoB.fighter.name}已上场。{/o}`);
  refreshIntents(state);
}

function startBattleFromNode(state, node) {
  state.winGrowthEmbed = false;
  state.winGrowthEmbedNodeId = null;
  state.winGrowthPendingAdvance = null;
  state.battleMeritFxQueue = [];
  state.battleMeritFxPlaying = false;
  state.visibleCombo = 0;
  clearBossExecutePlayerDramaTimers(state);
  if (state._winKillRevealTimer) {
    clearTimeout(state._winKillRevealTimer);
    state._winKillRevealTimer = null;
  }
  state._winKillRevealEnemyIds = null;
  state._winKillRevealGen += 1;
  state._endingDeathGen += 1;
  state._endingDeathAnimating = false;
  state._endingDeathDone = false;

  const battle = node.battle;
  if (!battle || !battle.waves || !battle.waves.length) {
    state.phase = "node";
    state.settleLog.push("{r}错误：战斗节点缺少 battle 配置。{/r}");
    return;
  }

  const isRetry = state.pendingRetryBattleNodeId === node.id;
  if (isRetry) {
    if (state.battleSnapshot && state.battleSnapshot.nodeId === node.id) {
      applyPlayerSnapshot(state.player, state.battleSnapshot.player);
    } else {
      const p = state.player;
      p.hp = p.hpMax;
      p.stagger = 0;
      p.broken = false;
      p.brokenTurnsLeft = 0;
      p.restCooldownLeft = 0;
    }
    state.pendingRetryBattleNodeId = null;
    state.settleLog.push("重来：本战从头开始。");
  } else {
    state.battleSnapshot = null;
    state.pendingRetryBattleNodeId = null;
    state.player.restCooldownLeft = 0;
  }

  const wave0 = battle.waves[0];
  state.battle = {
    waveIndex: 0,
    waves: battle.waves,
    reserve: (wave0.reserve || []).slice(),
    battleNodeId: node.id,
    sequentialTwoSlots: !!wave0.sequentialTwoSlots,
  };
  state.phase = "fight";
  state._anchorSettleRankToLive = true;
  state.endingLoseArmed = false;
  state._endingDeathDone = false;
  state._deathByExecute = false;
  state._loseByMeritTurns = false;
  state.globalTurn = 1;
  // 即时战功：进入战斗时初始化逐回合上下文与本战回合日志
  state.turnMeritLog = [];
  state._meritTurnContext = {
    battleId: node.id,
    turnIndex: 1,
    momentum: 0,
    mistakeChain: 0,
    lastTurnNoDamage: false,
    lastTurnHadHit: false,
    justRecoveredFromBroken: false,
    lastTargetId: null,
    _varietyStreak: 0,
    _prevPositiveAction: null,
    _sameTargetPressureStreak: 0,
  };
  // 开场首帧/上场动画不应触发“受击抖动”
  state._lastHp = null;
  state._clearHitShakeOnNextFightRender = true;
  {
    const t = typeof performance !== "undefined" ? performance.now() : 0;
    state._battleNoHitShakeUntilMs = t + (node.id === "B1" ? 1750 : 450);
  }
  state.battleLog.length = 0;
  state.tips.length = 0;
  state.actionDesc = "—";
  state.battleBuffs = { scoutTurnsLeft: 0, breaklineReady: false, restEvadeActive: false };
  state.firstQuickAttackBonusPending = !!state.perks?.includes("perk_kill_next_attack");
  state._breakDefenseFollowupPending = false;
  state._noDamageNextAttackPending = false;
  state._restNextHeavyBonusPending = false;
  state._restDefendBonusCharges = 0;
  state._blockNextHeavyBonusPending = false;
  state._blockNextAttackStaggerPending = false;
  state._heavyChainNextHeavyPending = false;
  state._interruptNextQuickBonusPending = false;
  state._peacefulHeartNoDamageTurns = 0;
  state._lastPlayerActionWasAttack = false;

  state.battleLog.push(`{g}战斗开始{/g}：${node.title || "本场战斗"}。`);

  // apply supports (one-shot, only at battle start)
  if (state.support === "support_supply") {
    const healed = applyHeal(state.player, ns(2));
    state.battleLog.push(`军略【补给】生效：{g}HP+${healed}{/g}。`);
    state.support = null;
  }
  if (state.support === "support_breakline") {
    state.battleBuffs.breaklineReady = true;
    state.battleLog.push("军略【破阵】生效：你本战第一次重击更凶。");
    state.support = null;
  }
  if (state.support === "support_scout") {
    state.battleBuffs.scoutTurnsLeft = 2;
    state.battleLog.push(
      `军略【侦察】生效：本战前 2 回合额外战场提示（快攻打断重击双方均为 ${Math.round(INTERRUPT_QUICK_VS_HEAVY * 100)}%）。`,
    );
    state.support = null;
  }

  // spawn enemies into A/B slots（B1：甲先上场，乙右侧「未上场」待命）
  const sA = wave0.slots[0] || { name: "敌人A" };
  const sB = wave0.slots[1] || { name: "敌人B" };
  if (wave0.sequentialTwoSlots && wave0.slots.length >= 2) {
    state.enemies = [mkEnemyFromDef(sA, "A"), mkWaitingEnemyEO(sB, "B")];
  } else if (wave0.slots.length >= 3) {
    state.battle.sequentialTwoSlots = false;
    const sC = wave0.slots[2] || { name: "敌人丙" };
    state.enemies = [mkEnemyFromDef(sA, "A"), mkEnemyFromDef(sB, "B"), mkEnemyFromDef(sC, "C")];
  } else {
    state.battle.sequentialTwoSlots = false;
    state.enemies = [mkEnemyFromDef(sA, "A"), mkEnemyFromDef(sB, "B")];
  }
  state.targetId = "A";

  // tutorials (node-scoped, one-time)
  if (node.battle?.tutorial?.includes("B1_turn1_intent")) {
    tutorialOnce(state, "B1_turn1_intent", "教学：敌人本回合意图是可读的——先看“意图”，再选招。");
  }
  if (node.battle?.tutorial?.includes("B1_block_vs_heavy")) {
    tutorialOnce(state, "B1_block_vs_heavy", "教学：盾反只克制重击——看到重击意图时再用盾反。");
  }
  if (node.battle?.tutorial?.includes("B1_block_vs_quick")) {
    tutorialOnce(state, "B1_block_vs_quick", "教学：盾反对快攻无效——看到快攻时勿用盾反。");
  }
  if (node.battle?.tutorial?.includes("B1_broken_execute")) {
    tutorialOnce(state, "B1_broken_execute", "教学：打满失衡会进入破绽——破绽目标可以处决收束。");
  }
  if (node.battle?.tutorial?.includes("B2_feel_growth")) {
    tutorialOnce(state, "B2_feel_growth", "提示：你刚获得的成长，会直接改变这场战斗的手感——试试重击/盾反的变化。");
  }
  if (node.battle?.tutorial?.includes("B3_mixed_problem")) {
    tutorialOnce(state, "B3_mixed_problem", "提示：这是一道混合题——盾兵不能磨，但只会重击也会被后排惩罚。");
  }
  if (node.battle?.tutorial?.includes("E1_exam")) {
    tutorialOnce(state, "E1_exam", "考试：防御中的敌人要用重击；重击中的敌人要用盾反；打出破绽就果断处决。");
  }
  if (node.battle?.tutorial?.includes("BOSS_full_loop")) {
    tutorialOnce(state, "BOSS_full_loop", "警告：渠帅会盾反你的重击，也会在你破绽时处决你——必须读招控节奏。");
  }

  state.battleSnapshot = { nodeId: node.id, player: snapshotPlayerForRetry(state.player) };

  state.meritChapter = state.meritChapter || { retries: {}, records: {}, battleRemainGranted: {} };
  if (MERIT_BATTLES[node.id]) {
    state._meritSession = {
      battleNodeId: node.id,
      maxHpAtStart: state.player.hpMax,
      breakCount: 0,
      executeLog: [],
      bossExecutePlayer: 0,
    };
    state._runMeritAtBattleEnter = state.runMeritScore ?? 0;
    state._chapterMeritLogLenAtBattleEnter = (state.chapterMeritLog || []).length;
  } else {
    state._meritSession = null;
    state._runMeritAtBattleEnter = null;
    state._chapterMeritLogLenAtBattleEnter = null;
  }

  refreshIntents(state);
  refreshTips(state);
  state.tipsHighlightDismissed = false;

  if (node.id === "B1") {
    state.battleEntranceB1Pending = true;
  }
}

// startFight(): 旧版剧情入口已取消

function clearBattleEntranceB1(state, ui) {
  if (state._battleEntranceB1Timer) {
    clearTimeout(state._battleEntranceB1Timer);
    state._battleEntranceB1Timer = null;
  }
  state.battleEntranceB1Pending = false;
  if (ui?.battleInfoPanel) ui.battleInfoPanel.classList.remove("battle-entrance-b1");
}

/** 胜利 ending：先播回血/回失衡条 + 战后整备战功与光点，再逐档播回合节余光点（有几档飞几个）；最后回调结算 */
function runEndingHealMeterAnim(state, ui, onComplete) {
  const p = state.player;
  const hp0 = p.hp;
  const hp1 = p.hpMax;
  const st0 = p.stagger;
  const stMax = Math.max(1, p.staggerThreshold || 1);
  const hpHealPreview = Math.max(0, hp1 - hp0);
  const stClearPreview = Math.max(0, st0);
  const vicDelta = computeVictoryRestorationMeritDelta(state);
  const remainDelta = computeBattleRemainTurnMeritDelta(state);
  const totalMeritDelta = vicDelta + remainDelta;
  const { hpPart, stPart } = splitVictoryRestorationMeritParts(hpHealPreview, stClearPreview, vicDelta);
  const meritFrom = state.runMeritScore ?? 0;
  const meritTo = meritFrom + totalMeritDelta;
  const bid = state.battle?.battleNodeId || null;
  const lim = meritBattleTurnLimit(bid);
  const ctx = state._meritTurnContext;
  const used = ctx ? Math.max(0, (ctx.turnIndex || 1) - 1) : 0;
  const remainSlots = lim != null ? Math.max(0, lim - used) : 0;
  const flyTarget = ui.runMeritWidget || ui.runMeritValue;

  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function applyVictoryGrantOnly() {
    restorePlayerAfterBattleWin(state);
    if (vicDelta > 0) {
      const mer = meritFrom + vicDelta;
      state.runMeritScore = mer;
      recordVictoryRestorationMerit(state, ui, vicDelta, hpHealPreview, stClearPreview, meritFrom, mer);
    }
  }

  function applyRemainGrantOnly() {
    if (remainDelta <= 0 || !bid) return;
    const before = state.runMeritScore;
    state.runMeritScore = before + remainDelta;
    recordBattleRemainTurnMerit(state, ui, remainDelta, remainSlots, before, state.runMeritScore);
    state.meritChapter = state.meritChapter || { retries: {}, records: {}, battleRemainGranted: {} };
    state.meritChapter.battleRemainGranted = state.meritChapter.battleRemainGranted || {};
    state.meritChapter.battleRemainGranted[bid] = remainDelta;
  }

  function finishEndingCleanup() {
    state._endingHealAnimating = false;
    if (totalMeritDelta > 0) {
      state._runMeritAnimating = false;
      ui.runMeritValue?.classList.add("run-merit-value--pulse");
      window.setTimeout(() => ui.runMeritValue?.classList.remove("run-merit-value--pulse"), 380);
    }
    ui.playerCard?.classList.remove("win-border-heal-pulse", "player-card--victory-restoration");
    ui.runMeritWidget?.classList.remove("run-merit--victory-rise");
  }

  if (reduceMotion) {
    if (ui.pHpBar) {
      ui.pHpBar.style.transition = "none";
      ui.pHpBar.style.width = percent(1);
    }
    if (ui.pStaggerBar) {
      ui.pStaggerBar.style.transition = "none";
      ui.pStaggerBar.style.width = percent(0);
    }
    if (ui.pHpText) ui.pHpText.textContent = `${hp1}/${hp1}`;
    if (ui.pStaggerText) ui.pStaggerText.textContent = `0/${stMax}`;
    if (ui.endingMeritBattleTurn && lim != null) ui.endingMeritBattleTurn.textContent = `${lim}/${lim}`;
    else if (ui.endingMeritBattleTurn) ui.endingMeritBattleTurn.textContent = "—";
    if (totalMeritDelta > 0 && ui.runMeritValue) {
      ui.runMeritValue.textContent = String(meritTo);
      renderLocalLeaderboardToSettlePanel(ui, state);
    }
    applyVictoryGrantOnly();
    applyRemainGrantOnly();
    state._endingHealAnimating = false;
    if (totalMeritDelta > 0) {
      state._runMeritAnimating = false;
      ui.runMeritValue?.classList.add("run-merit-value--pulse");
      window.setTimeout(() => ui.runMeritValue?.classList.remove("run-merit-value--pulse"), 380);
    }
    ui.playerCard?.classList.remove("win-border-heal-pulse", "player-card--victory-restoration");
    ui.runMeritWidget?.classList.remove("run-merit--victory-rise");
    onComplete();
    return;
  }

  const gen = ++state._endingHealGen;
  state._endingHealAnimating = true;
  const healMs = ENDING_PHASE_METER_MS;
  const t0 = performance.now();

  let firedHpFly = false;
  let firedStFly = false;

  if (totalMeritDelta > 0) {
    state._runMeritAnimating = true;
    state._runMeritAnimGen = (state._runMeritAnimGen || 0) + 1;
  }

  if (ui.playerCard) {
    ui.playerCard.classList.remove("win-border-heal-pulse", "player-card--victory-restoration");
    void ui.playerCard.offsetWidth;
    ui.playerCard.classList.add("win-border-heal-pulse");
    if (totalMeritDelta > 0) ui.playerCard.classList.add("player-card--victory-restoration");
  }
  if (totalMeritDelta > 0 && ui.runMeritWidget) ui.runMeritWidget.classList.add("run-merit--victory-rise");

  function runRemainFlyChain() {
    const chunks = splitMeritIntChunks(remainDelta, remainSlots);
    let idx = 0;
    let meritAcc = meritFrom + vicDelta;

    const endingFlyFrom = ui.endingMeritFlyAnchor || ui.endingMeritBattleTurn;
    if (remainSlots > 0 && endingFlyFrom && flyTarget) {
      const a = endingFlyFrom.getBoundingClientRect();
      const b = flyTarget.getBoundingClientRect();
      const totalParticles = remainSlots * MERIT_FLY_PARTICLE_BURST;
      const totalMs = meritFlyChainWallClockMs(remainSlots);
      spawnMeritFlyParticlesEvenSpread(
        a.left + a.width / 2,
        a.top + a.height / 2,
        b.left + b.width / 2,
        b.top + b.height / 2,
        totalParticles,
        totalMs,
        { fixedStart: true },
      );
    }

    function tickMeritWidgetPulse() {
      ui.runMeritWidget?.classList.add("run-merit-widget--tick");
      window.setTimeout(() => ui.runMeritWidget?.classList.remove("run-merit-widget--tick"), 420);
    }

    function stepRemain() {
      if (gen !== state._endingHealGen || state.phase !== "ending") {
        state._endingHealAnimating = false;
        if (totalMeritDelta > 0) state._runMeritAnimating = false;
        ui.playerCard?.classList.remove("win-border-heal-pulse", "player-card--victory-restoration");
        ui.runMeritWidget?.classList.remove("run-merit--victory-rise");
        return;
      }
      if (idx >= remainSlots) {
        applyRemainGrantOnly();
        if (ui.runMeritValue) ui.runMeritValue.textContent = String(meritTo);
        renderLocalLeaderboardToSettlePanel(ui, state);
        if (ui.endingMeritBattleTurn && lim != null) ui.endingMeritBattleTurn.textContent = `${lim}/${lim}`;
        finishEndingCleanup();
        onComplete();
        return;
      }
      const chunkR = chunks[idx] ?? 0;
      const meritBefore = meritAcc;
      const meritAfter = meritAcc + chunkR;
      runMeritDisplayLinearRamp(ui, state, meritBefore, meritAfter, CHAPTER_REMAIN_MERIT_FLY_MS, () => {
        if (gen !== state._endingHealGen || state.phase !== "ending") return;
        meritAcc = meritAfter;
        idx++;
        if (ui.runMeritValue) ui.runMeritValue.textContent = String(Math.round(meritAcc));
        if (ui.endingMeritBattleTurn && lim != null) {
          ui.endingMeritBattleTurn.textContent = `${Math.min(lim, used + idx)}/${lim}`;
        }
        renderLocalLeaderboardToSettlePanel(ui, state);
        tickMeritWidgetPulse();
        window.setTimeout(stepRemain, CHAPTER_REMAIN_MERIT_STEP_GAP_MS);
      });
    }

    stepRemain();
  }

  function stepHeal(now) {
    if (gen !== state._endingHealGen || state.phase !== "ending") {
      state._endingHealAnimating = false;
      if (ui.pHpBar) ui.pHpBar.style.transition = "";
      if (ui.pStaggerBar) ui.pStaggerBar.style.transition = "";
      ui.playerCard?.classList.remove("win-border-heal-pulse", "player-card--victory-restoration");
      ui.runMeritWidget?.classList.remove("run-merit--victory-rise");
      if (totalMeritDelta > 0) state._runMeritAnimating = false;
      return;
    }
    const u = Math.min(1, (now - t0) / healMs);
    const hp = hp0 + (hp1 - hp0) * u;
    const st = st0 * (1 - u);
    if (ui.pHpBar) {
      ui.pHpBar.style.transition = "none";
      ui.pHpBar.style.width = percent(hp / hp1);
    }
    if (ui.pStaggerBar) {
      ui.pStaggerBar.style.transition = "none";
      ui.pStaggerBar.style.width = percent(clamp(st / stMax, 0, 1));
    }
    if (ui.pHpText) ui.pHpText.textContent = `${Math.round(hp)}/${hp1}`;
    if (ui.pStaggerText) ui.pStaggerText.textContent = `${Math.round(st)}/${stMax}`;

    if (lim != null && ui.endingMeritBattleTurn) {
      ui.endingMeritBattleTurn.textContent = `${used}/${lim}`;
    }

    if (vicDelta > 0 && ui.runMeritValue) {
      ui.runMeritValue.textContent = String(Math.round(meritFrom + vicDelta * u));
      renderLocalLeaderboardToSettlePanel(ui, state);
    }

    if (!firedHpFly && hpPart > 0 && u >= 0.38) {
      firedHpFly = true;
      spawnVictoryMeritFlyFromMeterBar(ui.pHpBarWrap, flyTarget);
      ui.runMeritWidget?.classList.add("run-merit-widget--tick");
      window.setTimeout(() => ui.runMeritWidget?.classList.remove("run-merit-widget--tick"), 420);
    }
    if (!firedStFly && stPart > 0 && u >= 0.78) {
      firedStFly = true;
      spawnVictoryMeritFlyFromMeterBar(ui.pStaggerBarWrap, flyTarget);
      ui.runMeritWidget?.classList.add("run-merit-widget--tick");
      window.setTimeout(() => ui.runMeritWidget?.classList.remove("run-merit-widget--tick"), 420);
    }

    if (u < 1) {
      requestAnimationFrame(stepHeal);
      return;
    }

    applyVictoryGrantOnly();
    if (ui.pHpBar) {
      ui.pHpBar.style.width = percent(p.hp / Math.max(1, p.hpMax));
      ui.pHpBar.style.transition = "";
    }
    if (ui.pStaggerBar) {
      ui.pStaggerBar.style.width = percent(0);
      ui.pStaggerBar.style.transition = "";
    }
    if (ui.pHpText) ui.pHpText.textContent = `${p.hp}/${p.hpMax}`;
    if (ui.pStaggerText) ui.pStaggerText.textContent = `${p.stagger}/${p.staggerThreshold}`;
    if (ui.endingMeritBattleTurn && lim != null) ui.endingMeritBattleTurn.textContent = `${used}/${lim}`;
    if (vicDelta > 0 && ui.runMeritValue) ui.runMeritValue.textContent = String(meritFrom + vicDelta);

    if (remainSlots > 0 && remainDelta > 0 && ui.endingMeritBattleTurn && lim != null) {
      runRemainFlyChain();
      return;
    }

    applyRemainGrantOnly();
    if (totalMeritDelta > 0 && ui.runMeritValue) ui.runMeritValue.textContent = String(meritTo);
    if (ui.endingMeritBattleTurn && lim != null) ui.endingMeritBattleTurn.textContent = `${lim}/${lim}`;
    renderLocalLeaderboardToSettlePanel(ui, state);
    finishEndingCleanup();
    onComplete();
  }
  requestAnimationFrame(stepHeal);
}

/** 死亡 / 处决 / 回合耗尽：玩家卡印章（与 .player-dead-stamp 样式配套） */
function fillPlayerDeadBannerStamp(ui, deathByExecute, loseByMeritTurns) {
  if (!ui.playerDeadBanner) return;
  if (loseByMeritTurns) {
    ui.playerDeadBanner.innerHTML =
      '<span class="player-dead-stamp player-dead-stamp--wide player-dead-stamp--turn-limit">回合耗尽</span>';
    ui.playerDeadBanner.setAttribute("aria-label", "回合耗尽");
    return;
  }
  const label = deathByExecute ? "处决" : "死";
  const wide = deathByExecute ? " player-dead-stamp--wide" : "";
  ui.playerDeadBanner.innerHTML = `<span class="player-dead-stamp${wide}">${label}</span>`;
  ui.playerDeadBanner.setAttribute("aria-label", deathByExecute ? "处决" : "死亡");
}

/**
 * 失败 ending：线性扣到 0；总时长与胜利条动画一致；HP 归零后再进入失败态。
 * @param {{ staggerStart?: number }} [opts] staggerStart：致死前失衡（与 hpStart 同为「最后一击前」快照，避免条先被画成终态再被拉高）
 */
function runEndingDeathMeterAnim(state, ui, hpStart, onComplete, opts = {}) {
  const p = state.player;
  const hp0 = clamp(hpStart, 0, p.hpMax || 1);
  const st0 =
    opts.staggerStart != null
      ? clamp(opts.staggerStart, 0, p.staggerThreshold || 1)
      : clamp(p.stagger || 0, 0, p.staggerThreshold || 1);
  const gen = ++state._endingDeathGen;
  state._endingDeathAnimating = true;
  state._endingDeathDone = false;
  const ms = ENDING_PHASE_METER_MS;
  const t0 = performance.now();

  function step(now) {
    if (gen !== state._endingDeathGen || state.phase !== "endingLose") {
      state._endingDeathAnimating = false;
      if (ui.pHpBar) ui.pHpBar.style.transition = "";
      if (ui.pStaggerBar) ui.pStaggerBar.style.transition = "";
      return;
    }
    const elapsed = now - t0;
    const u = Math.min(1, elapsed / ms);
    const hp = hp0 * (1 - u);
    const st = st0 * (1 - u);
    if (ui.pHpBar) {
      ui.pHpBar.style.transition = "none";
      ui.pHpBar.style.width = percent(clamp(hp / Math.max(1, p.hpMax), 0, 1));
    }
    if (ui.pHpText) ui.pHpText.textContent = `${Math.round(hp)}/${p.hpMax}`;
    if (ui.pStaggerBar) {
      ui.pStaggerBar.style.transition = "none";
      ui.pStaggerBar.style.width = percent(clamp(st / Math.max(1, p.staggerThreshold || 1), 0, 1));
    }
    if (ui.pStaggerText) ui.pStaggerText.textContent = `${Math.round(st)}/${p.staggerThreshold}`;

    // 「死」字提前 1 秒出现（但不影响条继续归零）；盖章结构见 fillPlayerDeadBannerStamp
    if (!state._endingDeathDone && ms - elapsed <= 1000) {
      state._endingDeathDone = true;
      if (ui.playerDeadBanner) {
        fillPlayerDeadBannerStamp(ui, !!state._deathByExecute, false);
        ui.playerDeadBanner.hidden = false;
        ui.playerDeadBanner.classList.remove("stamp-in");
        void ui.playerDeadBanner.offsetWidth;
        ui.playerDeadBanner.classList.add("stamp-in");
      }
    }

    if (u < 1) {
      requestAnimationFrame(step);
      return;
    }
    p.hp = 0;
    p.stagger = 0;
    if (ui.pHpBar) {
      ui.pHpBar.style.width = percent(0);
      ui.pHpBar.style.transition = "";
    }
    if (ui.pHpText) ui.pHpText.textContent = `0/${p.hpMax}`;
    if (ui.pStaggerBar) {
      ui.pStaggerBar.style.width = percent(0);
      ui.pStaggerBar.style.transition = "";
    }
    if (ui.pStaggerText) ui.pStaggerText.textContent = `0/${p.staggerThreshold}`;
    state._endingDeathAnimating = false;
    state._endingDeathDone = true;
    onComplete();
  }
  requestAnimationFrame(step);
}

function finish(state, ui, outcome) {
  const chapter = CHAPTERS[state.chapterId] || CHAPTERS.chapter1;
  const node = chapter.nodes[state.nodeId] || chapter.nodes[chapter.startNodeId];
  const battle = node.battle;

  if (outcome === "win") {
    const winHp = state.player.hp;
    if (MERIT_BATTLES[node.id]) {
      recordMeritBattleWin(state, node.id, winHp);
    }

    const meritGain = battle?.reward?.merit ?? 0;
    if (meritGain) state.merit += meritGain * MERIT_SCORE_SCALE;

    restorePlayerAfterBattleWin(state);
    state.settleLog.push("战后休整：{g}体力已回满，失衡与破绽已清除。{/g}");

    // 第一章通关标记：用于回到主界面显示“继续战斗/新角色”两按钮
    if (state.chapterId === "chapter1" && node.id === "BOSS") {
      state._chapter1Cleared = true;
      savePlayerProfile(state);
    }

    // Boss 战不再掉落橙卡；通关后与常战相同弹出「战斗胜利」，点击「通关结算」进入 S1。

    // 胜利后：先停留在战斗信息页，等特效结束后再弹出“战斗胜利”
    state.phase = "win";
    state.winReady = false;
    state.pendingRetryBattleNodeId = null;
    state.battleSnapshot = null;
    state.pendingWinNextNodeId = battle?.onWinNext || null;

    if (!state._winTimerArmed) {
      state._winTimerArmed = true;
      window.setTimeout(() => {
        state.winReady = true;
        state._winTimerArmed = false;
        render(state, ui);
      }, 1000);
    }

    state.settleLog.push("{g}结算：此战得胜{/g}");
    return;
  }

  state.phase = "lose";
  state.pendingRetryBattleNodeId = node.id;
  const bid = state.battle?.battleNodeId || node.id;
  if (MERIT_BATTLES[bid]) {
    state.meritChapter = state.meritChapter || { retries: {}, records: {}, battleRemainGranted: {} };
    state.meritChapter.retries[bid] = (state.meritChapter.retries[bid] || 0) + 1;
    applyMeritBattleDeathRollback(state, ui);
  }
  if (!state._loseByMeritTurns) {
    state.battleLog.push("{r}你倒下了。{/r}");
  }
  state.settleLog.push("{r}结算：战斗失败{/r}");
  if (MERIT_BATTLES[bid]) {
    state.settleLog.push(
      `军功簿：本战即时战功已撤销；阵亡另扣 ${DEATH_MERIT_PENALTY}（已计入上方累计战功，不低于 0）。`,
    );
  }
  state.settleLog.push("奖励：无。");
  state.settleLog.push("可点击「再战此阵」立即再战，或「结算回营」提前封卷（战功入榜、评级与将魂照常结算）。");
}

/** 与 style 中调息动画时长一致 */
const REST_FX_DURATION_MS = 1000;

/**
 * 调息同款：指定卡片 + 绿光层（玩家调息或敌方「调整」结算时）。
 * @param {HTMLElement | null} card
 * @param {HTMLElement | null | undefined} overlay
 */
function triggerRestFxOnCard(card, overlay) {
  if (!card) return;
  card.classList.remove("rest-fx-play");
  overlay?.classList.remove("rest-fx-overlay--animate");
  void card.offsetWidth;
  void overlay?.offsetWidth;
  card.classList.add("rest-fx-play");
  overlay?.classList.add("rest-fx-overlay--animate");
  window.setTimeout(() => {
    card.classList.remove("rest-fx-play");
    overlay?.classList.remove("rest-fx-overlay--animate");
  }, REST_FX_DURATION_MS);
}

/** 调息：玩家卡绿色边框闪烁 + 卡面自下而上绿光铺满 */
function triggerRestFx(ui) {
  triggerRestFxOnCard(ui.playerCard, ui.restFxOverlay);
}

/** 调息完全闪避（30%/70%）：与对撞层 `rest_evade` 卡面段同款，供仅走 onPlayerAction 的路径补播 */
function triggerRestEvadeFx(ui) {
  applyCardFxEvent(ui, { target: "player", fx: "rest_evade", hpDelta: 0, staggerDelta: 0, strong: false });
  window.setTimeout(() => {
    applyCardFxEventCleanup(ui, { target: "player", fx: "rest_evade" });
  }, CARD_FX_EVENT_MS);
}

/** 敌方本回合意图为「调整」且结算生效时，对应敌卡播放与调息相同的光效 */
function triggerEnemyAdjustRestFxOnCard(ui, enemyId) {
  const card =
    enemyId === "A" ? ui.enemyCardA : enemyId === "B" ? ui.enemyCardB : ui.enemyCardC;
  const overlay =
    enemyId === "A"
      ? ui.enemyRestFxOverlayA
      : enemyId === "B"
        ? ui.enemyRestFxOverlayB
        : ui.enemyRestFxOverlayC;
  triggerRestFxOnCard(card, overlay);
}

function triggerExecuteFx(ui, targetId) {
  const targetCard =
    targetId === "A"
      ? ui.enemyCardA
      : targetId === "B"
        ? ui.enemyCardB
        : ui.enemyCardC;
  if (targetCard) {
    targetCard.classList.remove("exec-burst");
    void targetCard.offsetWidth;
    targetCard.classList.add("exec-burst");
    // 兜底：若立刻切屏，确保动画 class 会被清掉（慢镜下 burst 更长）
    const execBurstCleanupMs = document.body.classList.contains("ending-slowmo") ? 1250 : 520;
    window.setTimeout(() => targetCard.classList.remove("exec-burst"), execBurstCleanupMs);
  }
  if (ui.battleInfoPanel && targetCard) {
    const panelRect = ui.battleInfoPanel.getBoundingClientRect();
    const tgtRect = targetCard.getBoundingClientRect();
    const fromX = panelRect.left + panelRect.width / 2;
    const fromY = panelRect.top + 96;
    const toX = tgtRect.left + tgtRect.width / 2;
    const toY = tgtRect.top + Math.min(56, tgtRect.height * 0.35);

    const el = document.createElement("div");
    el.className = "exec-fly";
    el.textContent = "处决！";
    document.body.appendChild(el);

    // 让元素以自身中心对齐坐标点
    const place = (x, y) => {
      el.style.transform = `translate3d(${Math.round(x)}px, ${Math.round(y)}px, 0) translate(-50%, -50%)`;
    };
    place(fromX, fromY);

    const anim = el.animate(
      [
        { transform: `${el.style.transform} scale(.98)`, opacity: 0 },
        { transform: `translate3d(${Math.round(fromX)}px, ${Math.round(fromY)}px, 0) translate(-50%, -50%) scale(1)`, opacity: 1, offset: 0.2 },
        { transform: `translate3d(${Math.round(toX)}px, ${Math.round(toY)}px, 0) translate(-50%, -50%) scale(1.06)`, opacity: 0 },
      ],
      { duration: 760, easing: "cubic-bezier(.2,.9,.2,1)" },
    );
    anim.addEventListener("finish", () => el.remove());
    window.setTimeout(() => el.remove(), 1200);
  }
}

function triggerDeathBlowFx(ui) {
  const card = ui.playerCard;
  if (!card) return;
  // 避免上一帧残留的 hit-shake 白光叠上来
  card.classList.remove("hit-shake");
  card.classList.remove("death-blow");
  void card.offsetWidth;
  card.classList.add("death-blow");
  // 最后一击：death-blow::before 为受击刀光 +20%，不叠 hit-shake::after；class 保留到血条动画结束
  window.setTimeout(() => card.classList.remove("death-blow"), ENDING_PHASE_METER_MS + 120);
}

/** 成长选项：仅写入奖励（技法/属性/战利品），不含换图导航。重复领取装备时返回 "abort"。 */
function applyGrowthRewards(state, node, opt) {
  if (opt.perk) {
    if (!state.perks.includes(opt.perk)) state.perks.push(opt.perk);
    state.settleLog.push(`成长：获得【${opt.title}】。`);
    if (opt.perk === "perk_executeheal") {
      state.player.executeHealBonus = (state.player.executeHealBonus || 0) + ns(20);
      state.settleLog.push("血战余生生效：处决回血 +20。");
    }
    const offer = state.draftOffers?.[node.id];
    if (Array.isArray(offer) && offer.length) state.skillDeckRemaining = removeMany(state.skillDeckRemaining, offer);
    else state.skillDeckRemaining = removeMany(state.skillDeckRemaining, [opt.perk]);
  }
  if (opt._stat) {
    applyStatGrowth(state, opt._stat);
    state.settleLog.push(`成长：${opt.title}。`);
    state._attrGrowthLog = state._attrGrowthLog || [];
    const ac = ATTR_CARDS.find((x) => x._stat === opt._stat);
    if (ac) {
      state._attrGrowthLog.push({ title: ac.title, desc: ac.desc });
      state._pickedAttrCardIds = state._pickedAttrCardIds || {};
      state._pickedAttrCardIds[ac.id] = true;
    }
  }
  if (opt._equipAll) {
    const loot = ensureR3Loot(state);
    for (const d of opt._equipAll) {
      if (loot.taken?.[d.id]) continue;
      loot.taken[d.id] = true;
      if (d.eff?.atk) state.player.atkBonus = (state.player.atkBonus || 0) + d.eff.atk;
      if (d.eff?.defendMit) state.player.defendMitigationBonus = (state.player.defendMitigationBonus || 0) + d.eff.defendMit;
      if (d.eff?.hp) {
        state.player.hpMax += d.eff.hp;
        state.player.hp = Math.min(state.player.hp + d.eff.hp, state.player.hpMax);
      }
      if (d.eff?.stg) state.player.staggerThreshold += d.eff.stg;
      if (d.eff?.heavyStg) state.player.heavyStgBonus = (state.player.heavyStgBonus || 0) + d.eff.heavyStg;
      state.settleLog.push(`{o}战利品：获得【${d.title}】（${d.desc}）。{/o}`);
    }
  }
  if (opt._equip) {
    const loot = ensureR3Loot(state);
    const d = opt._equip;
    if (loot.taken?.[d.id]) return "abort";
    loot.taken[d.id] = true;
    if (d.eff?.atk) state.player.atkBonus = (state.player.atkBonus || 0) + d.eff.atk;
    if (d.eff?.defendMit) state.player.defendMitigationBonus = (state.player.defendMitigationBonus || 0) + d.eff.defendMit;
    if (d.eff?.hp) {
      state.player.hpMax += d.eff.hp;
      state.player.hp = Math.min(state.player.hp + d.eff.hp, state.player.hpMax);
    }
    if (d.eff?.stg) state.player.staggerThreshold += d.eff.stg;
    if (d.eff?.heavyStg) state.player.heavyStgBonus = (state.player.heavyStgBonus || 0) + d.eff.heavyStg;
    state.settleLog.push(`{o}战利品：获得【${d.title}】（${d.desc}）。{/o}`);
  }
  return undefined;
}

function applyGrowthOption(state, ui, chapter, node, opt, advOpts) {
  const deferNav = !!(advOpts && advOpts.deferNavigation);
  const skipRewards = !!(advOpts && advOpts.skipRewards);
  if (node.id === "HOOK" && opt.id === "restart") {
    resetChapter1NewGame(state);
    gotoNode(state, ui, chapter.id, opt.next || "N0");
    render(state, ui);
    return;
  }

  /** 章节结算页「再玩一局」：直接回到第一章外哨战前（玩法简介 + 开始战斗），不经 HOOK 结束页 */
  if (node.id === "S1" && opt.id === "hook") {
    resetChapter1NewGame(state);
    markRoadmapNodeDone(state, "N0");
    markRoadmapNodeDone(state, "N1");
    gotoNode(state, ui, chapter.id, chapter.startNodeId || "B1");
    render(state, ui);
    return;
  }

  if (!skipRewards) {
    if (applyGrowthRewards(state, node, opt) === "abort") {
      render(state, ui);
      return;
    }
  }
  if (opt._equip || opt._equipAll) {
    const loot = ensureR3Loot(state);
    const allTaken = loot.drops.every((d) => !!loot.taken[d.id]);
    if (!allTaken) {
      render(state, ui);
      return;
    }
    const flow = CHAPTER_STORY_ORDER[state.chapterId] || CHAPTER_STORY_ORDER.chapter1;
    const idx = flow.indexOf(node.id);
    const nextId = idx >= 0 && idx < flow.length - 1 ? flow[idx + 1] : null;
    if (nextId) {
      if (deferNav) {
        armWinGrowthPendingAdvance(state, chapter, node, nextId);
        render(state, ui);
        return;
      }
      markRoadmapNodeDone(state, node.id);
      const nextNode = chapter.nodes[nextId];
      if (nextNode && (nextNode.type === "B" || nextNode.type === "E")) {
        state.chapterId = chapter.id;
        state.nodeId = nextNode.id;
        startBattleFromNode(state, nextNode);
        render(state, ui);
        return;
      }
      gotoNode(state, ui, chapter.id, nextId);
      render(state, ui);
      return;
    }
    render(state, ui);
    return;
  }

  if (opt.next) {
    if (deferNav) {
      armWinGrowthPendingAdvance(state, chapter, node, opt.next);
      render(state, ui);
      return;
    }
    markRoadmapNodeDone(state, node.id);
  }

  // 成长选项：若下一节点为战斗，则直接开战（跳过“开始战斗”按钮）
  const nextNode = chapter.nodes[opt.next] || chapter.nodes[chapter.startNodeId];
  if (nextNode && (nextNode.type === "B" || nextNode.type === "E")) {
    state.chapterId = chapter.id;
    state.nodeId = nextNode.id;
    startBattleFromNode(state, nextNode);
    render(state, ui);
    return;
  }
  gotoNode(state, ui, chapter.id, opt.next);
}

/** R1–R4：成长翻牌选项（与 growth 面板共用） */
function buildRGrowthPickOptions(state, node) {
  if (node.id === "R1_DRAFT") {
    const offer = ensureR1TechOffer(state);
    return offer.map((perk) => {
      const c = perkCardById(perk);
      return {
        id: perk,
        title: c.title,
        desc: c.desc,
        perk,
        tagLine: techExtraTagsLine(c),
        cardClass: `pick-card--${techTagCssForPerk(perk)}`,
        next: "B2",
      };
    });
  }
  if (node.id === "R2_STAT") {
    const offer = ensureDraftOffer(state, "R2_STAT", attrDraftPool(state), 3);
    return offer
      .map((id) => ATTR_CARDS.find((x) => x.id === id))
      .filter(Boolean)
      .map((c) => ({
        id: `attr_${c.id}`,
        title: `属性：${c.title}`,
        desc: c.desc,
        _stat: c._stat,
        next: "E1",
      }));
  }
  if (node.id === "R3_LOOT") {
    const offer = ensureR3TechOffer(state);
    return offer.map((perk) => {
      const c = perkCardById(perk);
      return {
        id: perk,
        title: c.title,
        desc: c.desc,
        perk,
        tagLine: techExtraTagsLine(c),
        cardClass: `pick-card--${techTagCssForPerk(perk)}`,
        next: "B3",
      };
    });
  }
  if (node.id === "R4_DRAFT") {
    const techOffer = ensureDraftOffer(state, "R4_TECH", skillDraftPool(state), 2);
    const attrOffer = ensureDraftOffer(state, "R4_ATTR", attrDraftPool(state), 1);
    const merged = [...techOffer, ...attrOffer];
    return merged
      .map((k) => {
        const a = ATTR_CARDS.find((x) => x.id === k);
        if (a)
          return {
            kind: "attr",
            id: `attr_${a.id}`,
            title: `属性：${a.title}`,
            desc: a.desc,
            _stat: a._stat,
            next: "N4",
          };
        const t = perkCardById(k);
        if (t && t.perk)
          return {
            kind: "tech",
            id: t.perk,
            title: t.title,
            desc: t.desc,
            perk: t.perk,
            tagLine: techExtraTagsLine(t),
            cardClass: `pick-card--${techTagCssForPerk(t.perk)}`,
            next: "N4",
          };
        return null;
      })
      .filter(Boolean);
  }
  return null;
}

/** 战法卷立即刷新并给末卡入场动效（成长点选时可能尚未跑完整 render） */
function paintWarehouseWithEnterFx(ui, state) {
  if (!ui.warehouseCards) return;
  ui.warehouseCards.innerHTML = renderWarehouseCards(state);
  const last = ui.warehouseCards.querySelector(".wh-grid .wh-card:last-child");
  if (!last) return;
  last.classList.remove("wh-card--enter");
  void last.offsetWidth;
  last.classList.add("wh-card--enter");
}

/** 三选一已定时：灰显并禁用其余卡（不依赖整页 render） */
function dimPickGridExceptWrap(gridEl, keepWrap) {
  gridEl?.querySelectorAll(".pick-card-wrap").forEach((w) => {
    if (w === keepWrap) return;
    w.classList.add("pick-card-wrap--not-picked");
    const c = w.querySelector(".pick-card");
    if (c) {
      c.disabled = true;
      c.classList.add("is-pick-locked");
    }
  });
}

function renderGrowthAsCards(state, ui, chapter, node, opts, optionsMount, pickOpts) {
  const mount = optionsMount || ui.nodeOptions;
  if (!mount) return;
  const winInlinePick = !!(pickOpts && pickOpts.winInlinePick);
  const grid = document.createElement("div");
  grid.className = "pick-grid";
  if (winInlinePick) grid.classList.add("pick-grid--win-inline");
  grid.dataset.nodeId = node.id;
  mount.appendChild(grid);

  state.growthRevealed = state.growthRevealed || {};
  state.growthPickId = state.growthPickId || {};
  const revealed = !!state.growthRevealed[node.id];
  const selectedId = state.growthPickId[node.id] || null;
  /** 已点选后必须保持正面与锁定态；不能依赖 revealed（翻牌动画未完成时 revealed 仍为 false） */
  const faceUp = revealed || !!selectedId;

  for (const opt of opts) {
    const wrap = document.createElement("div");
    wrap.className = "pick-card-wrap";

    const card = document.createElement("button");
    card.type = "button";
    const tagCls = opt?.cardClass ? String(opt.cardClass) : "";
    card.className = faceUp ? `pick-card ${tagCls}`.trim() : `pick-card ${tagCls} is-facedown`.trim();
    if (selectedId === opt.id) card.classList.add("is-selected");
    if (selectedId && opt.id !== selectedId) {
      wrap.classList.add("pick-card-wrap--not-picked");
      card.disabled = true;
      card.classList.add("is-pick-locked");
    }
    card.dataset.pickId = opt.id;
    const tagLine = opt.tagLine ? `<div class="pick-card-tags">${escapeHtml(String(opt.tagLine))}</div>` : "";
    const kickerRaw = opt.kicker != null ? String(opt.kicker).trim() : "";
    const kickerHtml = kickerRaw ? `<div class="pick-card-kicker">${escapeHtml(kickerRaw)}</div>` : "";
    card.innerHTML = `
      <div class="pick-card-inner">
        <div class="pick-card-face pick-card-back">
          <div class="pick-card-back-title">未揭示</div>
        </div>
        <div class="pick-card-face pick-card-front">
          ${kickerHtml}
          ${tagLine}
          <div class="pick-card-title">${escapeHtml(opt.title || "成长")}</div>
          <div class="pick-card-desc">${escapeHtml(opt.desc || "")}</div>
        </div>
      </div>
    `;
    card.addEventListener("click", () => {
      if (winInlinePick) {
        if (wrap.dataset.flyBusy === "1") return;
        if (state.growthPickId?.[node.id]) return;
        if (selectedId && selectedId !== opt.id) return;
        if (selectedId === opt.id) return;
        state.growthRevealed[node.id] = true;
        wrap.dataset.flyBusy = "1";
        state.growthPickId[node.id] = opt.id;
        const bad = applyGrowthRewards(state, node, opt);
        if (bad === "abort") {
          wrap.dataset.flyBusy = "0";
          delete state.growthPickId[node.id];
          delete state.growthRevealed[node.id];
          render(state, ui);
          return;
        }
        paintWarehouseWithEnterFx(ui, state);
        dimPickGridExceptWrap(grid, wrap);
        card.disabled = true;
        card.classList.add("is-pick-locked");
        animateCardToWarehouse(card, ui, () => {
          // 勿清空 growthPickId：否则下一帧 render 会重建未锁定三卡，玩家可连点三次拿齐三技
          applyGrowthOption(state, ui, chapter, node, opt, { deferNavigation: true, skipRewards: true });
        });
        return;
      }
      if (selectedId && selectedId !== opt.id) return;
      if (selectedId === opt.id) return;
      state.growthRevealed[node.id] = true;
      state.growthPickId[node.id] = opt.id;
      render(state, ui);
    });

    if (!winInlinePick) {
      const confirmBtn = document.createElement("button");
      confirmBtn.type = "button";
      confirmBtn.className = "btn btn-offense pick-card-confirm";
      confirmBtn.textContent = "确认选择";
      confirmBtn.addEventListener("click", (ev) => {
        ev.stopPropagation();
        ev.preventDefault();
        if (state.growthPickId[node.id] !== opt.id) return;
        confirmBtn.disabled = true;
        const bad = applyGrowthRewards(state, node, opt);
        if (bad === "abort") {
          confirmBtn.disabled = false;
          render(state, ui);
          return;
        }
        paintWarehouseWithEnterFx(ui, state);
        animateCardToWarehouse(card, ui, () => {
          state.growthPickId[node.id] = null;
          applyGrowthOption(state, ui, chapter, node, opt, { skipRewards: true });
        });
      });
      wrap.appendChild(card);
      wrap.appendChild(confirmBtn);
    } else {
      wrap.appendChild(card);
    }
    grid.appendChild(wrap);
  }

  // 翻牌动画：进入成长节点时依次揭示；之后重渲染不再回到背面
  if (state._lastGrowthNodeId !== node.id) {
    state._lastGrowthNodeId = node.id;
    state.growthRevealed[node.id] = false;
  }
  const cards = Array.from(grid.querySelectorAll(".pick-card"));
  const needsFlip = cards.some((c) => c.classList.contains("is-facedown"));
  if (needsFlip) {
    state._growthCardFlipSeq = (state._growthCardFlipSeq || 0) + 1;
    const seq = state._growthCardFlipSeq;
    requestAnimationFrame(() => {
      if (state._growthCardFlipSeq !== seq) return;
      cards.forEach((el, i) => {
        window.setTimeout(() => {
          if (state._growthCardFlipSeq !== seq) return;
          if (!el.isConnected) return;
          el.classList.remove("is-facedown");
          if (i === cards.length - 1) state.growthRevealed[node.id] = true;
        }, 180 * i);
      });
    });
  }
}

function animateCardToWarehouse(cardEl, ui, onDone) {
  const warehouseEl = ui.warehouseCards;
  if (!cardEl || !warehouseEl) { onDone(); return; }
  let done = false;
  function finish() {
    if (done) return;
    done = true;
    ghost.remove();
    onDone();
  }
  const srcRect = cardEl.getBoundingClientRect();
  const whRect = warehouseEl.getBoundingClientRect();
  const destX = whRect.left + whRect.width / 2;
  const destY = whRect.top + 20;
  const ghost = cardEl.cloneNode(true);
  ghost.className = "pick-card-ghost";
  ghost.style.cssText = `
    position:fixed; z-index:999999; pointer-events:none;
    left:${srcRect.left}px; top:${srcRect.top}px;
    width:${srcRect.width}px; height:${srcRect.height}px;
    border-radius:16px; overflow:hidden;
    transition: all .45s cubic-bezier(.4,.0,.2,1);
    opacity:1; transform:scale(1);
  `;
  document.body.appendChild(ghost);
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      ghost.style.left = `${destX - 40}px`;
      ghost.style.top = `${destY}px`;
      ghost.style.width = "80px";
      ghost.style.height = "50px";
      ghost.style.opacity = "0.3";
      ghost.style.transform = "scale(.5)";
    });
  });
  ghost.addEventListener("transitionend", finish, { once: true });
  setTimeout(finish, 600);
}

function onPlayerAction(state, ui, action, opts = {}) {
  clearB1HintTimer();
  clearB1ActionHintHighlight(ui);
  if (state.phase === BOSS_EXEC_PLAYER_DRAMA_PHASE) return;
  if (state.phase !== "fight") return;
  if (state.endingArmed) return;
  if (state.player.hp <= 0) return;
  if (!state.enemies.some((x) => !x.waitingToEnter && x.fighter.hp > 0)) return;
  if (action === "rest" && (state.player.restCooldownLeft || 0) > 0) return;

  const meritLim = meritBattleTurnLimit(state.battle?.battleNodeId);
  if (meritLim != null && state._meritTurnContext && state._meritTurnContext.turnIndex > meritLim) {
    state.battleLog.push(`{r}回合耗尽（本战限 ${meritLim} 回合仍未取胜），阵型溃散。{/r}`);
    state.settleLog.push(`{r}战斗失败：超过 ${meritLim} 回合限制。{/r}`);
    state._loseByMeritTurns = true;
    finish(state, ui, "lose");
    render(state, ui);
    return;
  }

  // 每回合重置“快攻打断重击”标记（T15）
  state._attackInterruptedHeavyTargetId = null;

  const bundle = opts.bundle;
  const restEarly = action === "rest" && bundle?._restEarlyHeal;
  const restHealPreApplied = !!restEarly;

  /** 与对拼 bundle 共用，未经过 queue 时回退为当场掷骰 */
  const rolled = state._turnRng;
  state._turnRng = null;

  const enemyHpAtActionStart = Object.fromEntries(state.enemies.map((eo) => [eo.id, eo.fighter.hp]));
  const enemyStgAtActionStart = Object.fromEntries(state.enemies.map((eo) => [eo.id, eo.fighter.stagger]));
  const enemyBrokenAtActionStart = Object.fromEntries(state.enemies.map((eo) => [eo.id, !!eo.fighter.broken]));
  const enemyWaitingAtStart = Object.fromEntries(state.enemies.map((eo) => [eo.id, !!eo.waitingToEnter]));
  const playerHpAtActionStart = restHealPreApplied ? restEarly.snapshot.playerHp : state.player.hp;
  const playerStaggerAtActionStart = restHealPreApplied ? restEarly.snapshot.playerStg : state.player.stagger;
  const playerBrokenAtActionStart = !!state.player.broken;

  const meterFloatSnap = {
    playerHp: restHealPreApplied ? state.player.hp : playerHpAtActionStart,
    playerStg: restHealPreApplied ? state.player.stagger : playerStaggerAtActionStart,
    enemyHp: enemyHpAtActionStart,
    enemyStg: enemyStgAtActionStart,
    enemyWaitingAtStart,
  };
  const emitBattleMeterFloats = () => pushBattleMeterFloats(state, ui, meterFloatSnap);

  const intents = Object.fromEntries(state.enemies.map((eo) => [eo.id, eo.intent]));
  /** @type {Record<string, boolean>} */
  const executed = {};
  for (const eo of state.enemies) executed[eo.id] = false;

  /** @type {string[]} */
  const details = [];
  /** 即时战功：本回合结构化结果（用于精准 eventCode） */
  const meritTurn = {
    action,
    targetId: null,
    targetIntent: null,
    hadPlayerHit: false,
    enemyStaggerGainedTotal: 0,
    anyEnemyBrokenNew: false,
    executeKind: null,
    executeFinishBonus: false,
    interruptHeavy: false,
    anyHeavyIntent: false,
    anyQuickIntent: false,
    anyBlockSuccess: false,
    blockFailedThisTurn: false,
    defendFailedThisTurn: false,
    heavyInterrupted: false,
    damageTakenThisTurn: 0,
    gotHitQuick: false,
    gotHitHeavy: false,
    selfBrokenThisTurn: false,
    bossExecuteTaken: false,
    pressureChain: false,
    aliveEnemyCountEnd: 0,
    playerHpEnd: 0,
    playerHpMax: 0,
    justRecoveredFromBrokenNext: false,
    damageDealtTotal: 0,
    damageMitigatedTotal: 0,
    healDoneTotal: 0,
    hitsOnStaggeredEnemy: 0,
  };

  // 一句“游戏化”行动描述
  const tgtObj = state.enemies.find((x) => x.id === state.targetId);
  const fallbackEnemyName = { A: "敌人甲", B: "敌人乙", C: "敌人丙" };
  const targetName = tgtObj?.fighter?.name || fallbackEnemyName[state.targetId] || "敌人";
  const actionFlavor = {
    attack: `你踏前半步，刀光一闪，直取${targetName}的破绽。`,
    heavy: `你沉肩蓄力，横刀猛压，试图击溃${targetName}的架势。`,
    defend: "你收刀护身，稳住下盘，准备接下对方的来势。",
    block: "你抬刀立势，试图用盾反打乱对方重击的节奏。",
    execute: `你逼近一步，寻找能一刀了结${targetName}的机会。`,
    rest: "你深吸一口气，调匀呼吸与步伐，重新稳住架势。",
  };
  state.actionDesc = actionFlavor[action] || "—";
  state.battleLog.push(state.actionDesc);

  // 新规则：玩家失衡（满条）时，进攻/处决不可用
  if (state.player.broken && (action === "attack" || action === "heavy" || action === "execute")) {
    details.push("→ 你已失衡，无法快攻、重击或处决：可调息、防御与盾反。");
    state.battleLog.push(formatLineForTurn(state, action, null, intents, details));
    render(state, ui);
    return;
  }

  // 进攻/处决需要选目标；防御/盾反/调息不需要
  /** @type {EnemyId|null} */
  const targetId = action === "attack" || action === "heavy" || action === "execute" ? state.targetId : null;
  meritTurn.targetId = targetId;
  meritTurn.targetIntent = targetId ? intents?.[targetId] || null : null;

  /** 本回合是否存在敌方快攻且判定打断重击成功（与己方快攻打断敌方重击同概率）。非重击时恒为 false。 */
  const heavyQuickInterruptSuccess =
    rolled?.heavyQuickInterruptSuccess ??
    (action === "heavy" && enemyQuickThreatensPlayerHeavy(state) && Math.random() < INTERRUPT_QUICK_VS_HEAVY);

  // 调息：HP+20、失衡-1；本回合受快攻/重击时概率完全闪避（在 resolveEnemyAgainstPlayer 中判定）
  // 调息光效与数值：走 queue 时已在绿光同帧结算（bundle._restEarlyHeal），此处只写战报、不再重复加减
  // 调息光效已在 queuePlayerAction 中预播，此处不再 triggerRestFx
  if (action === "rest") {
    if (!restHealPreApplied) {
      const healed = applyHeal(state.player, ns(2));
      meritTurn.healDoneTotal = (meritTurn.healDoneTotal || 0) + healed;
      changeStagger(state.player, -1);
      details.push(`→ 你调息：{g}HP+${healed}{/g} {g}失衡-1{/g}`);
    } else {
      meritTurn.healDoneTotal = (meritTurn.healDoneTotal || 0) + (restEarly.healed || 0);
      details.push(`→ 你调息：{g}HP+${restEarly.healed}{/g} {g}失衡-1{/g}`);
    }
  }

  // 处决（需要目标破绽）
  if (action === "execute") {
    const tgt = state.enemies.find((x) => x.id === targetId);
    if (!tgt || tgt.fighter.hp <= 0) {
      details.push("→ 处决失败：目标已倒下。");
    } else if (!tgt.fighter.broken) {
      details.push("→ 处决失败：目标未露出破绽。");
    } else {
      const clinchKill = isClinchWinKill(state, targetId);
      if (clinchKill) document.body.classList.add("ending-slowmo");
      // 处决特效：更强的视觉反馈（决胜处决时先开慢镜，与 ending 刀光同速）
      triggerExecuteFx(ui, targetId);
      void playCardFxSequence(ui, [
        { target: targetId, fx: "execute", hpDelta: 0, staggerDelta: 0, strong: true },
      ]);
      meritTurn.damageDealtTotal = (meritTurn.damageDealtTotal || 0) + Math.max(0, tgt.fighter.hp | 0);
      tgt.fighter.hp = 0;
      meritLogPlayerExecute(state, tgt, clinchKill);
      executed[targetId] = true;
      details.push(`→ {o}你处决了${tgt.fighter.name}（直接击杀）。{/o}`);
      // T14：击杀敌人后自己失衡 -1（处决也算击杀）
      if (state.perks?.includes("perk_kill_reduce_stagger")) {
        const before = state.player.stagger;
        changeStagger(state.player, -1);
        const reduced = before - state.player.stagger;
        if (reduced > 0) details.push("→ 斩阵夺势：击杀敌人，你的失衡 -1。");
      }
      // 即时战功：处决类型（按战斗 id 判定精英）
      if (tgt.archetype === "boss") meritTurn.executeKind = "execute_boss";
      else if ((state.battle?.battleNodeId || state.nodeId) === "E1") meritTurn.executeKind = "execute_elite";
      else meritTurn.executeKind = "execute_normal";
      meritTurn.executeFinishBonus = !!clinchKill;
      meritTurn.hadPlayerHit = true;
      const execHeal = state.player.executeHealBonus || 0;
      if (execHeal > 0) {
        const healed = applyHeal(state.player, execHeal);
        meritTurn.healDoneTotal = (meritTurn.healDoneTotal || 0) + healed;
        details.push(`→ 处决回血：{g}HP+${healed}{/g}。`);
      }
      // T23：处决后其余在场敌人失衡 +1
      if (state.perks?.includes("perk_execute_other_stagger")) {
        for (const eo of state.enemies) {
          if (eo.id === targetId) continue;
          if (eo.waitingToEnter || eo.fighter.hp <= 0 || eo.fighter.broken) continue;
          const before = eo.fighter.stagger | 0;
          addStagger(eo.fighter, 1, state);
          if ((eo.fighter.stagger | 0) > before) {
            details.push(`→ 断势行刑：${eo.fighter.name}失衡 +1。`);
          }
        }
      }
    }
  }

  // 玩家 → 敌人（仅对目标生效）
  if (action === "attack" || action === "heavy") {
    const tgt = state.enemies.find((x) => x.id === targetId);
    if (!tgt || tgt.fighter.hp <= 0) {
      details.push("→ 进攻失败：目标已倒下。");
    } else if (action === "heavy" && heavyQuickInterruptSuccess) {
      const st0 = tgt.fighter.stagger | 0;
      const br0 = !!tgt.fighter.broken;
      const r = applyPlayerToEnemy(state, tgt, "attack", targetId);
      meritAccPlayerToEnemyHit(meritTurn, r, st0, br0);
      meritTurn.hadPlayerHit = meritTurn.hadPlayerHit || !!r.hit;
      meritTurn.enemyStaggerGainedTotal += r.eStg || 0;
      if (r.flags?.punish_adjust) meritTurn._punishAdjust = true;
      details.push(
        `→ 对${tgt.fighter.name}：重击被敌方快攻打断，{o}改按快攻结算{/o}：伤害-{g}${r.eDmg}{/g} 失衡+{g}${r.eStg}{/g}${r.notes.length ? `【${r.notes.join("；")}】` : ""}`,
      );
      meritTurn.heavyInterrupted = true;
    } else {
      const st0 = tgt.fighter.stagger | 0;
      const br0 = !!tgt.fighter.broken;
      const r = applyPlayerToEnemy(state, tgt, action, targetId);
      meritAccPlayerToEnemyHit(meritTurn, r, st0, br0);
      meritTurn.hadPlayerHit = meritTurn.hadPlayerHit || !!r.hit;
      meritTurn.enemyStaggerGainedTotal += r.eStg || 0;
      if (r.flags?.break_defense) meritTurn._breakDefense = true;
      if (r.flags?.punish_adjust) meritTurn._punishAdjust = true;
      if (r.eDmg || r.eStg || r.notes.length) {
        details.push(
          `→ 对${tgt.fighter.name}：伤害-{g}${r.eDmg}{/g} 失衡+{g}${r.eStg}{/g}${r.notes.length ? `【${r.notes.join("；")}】` : ""}`,
        );
      }
      // 敌方防御/盾反：若本回合未受伤，则回合末其失衡 +1（与玩家规则一致）
      if ((tgt.intent === "defend" || tgt.intent === "block") && r.eDmg === 0) {
        addStagger(tgt.fighter, 1);
        details.push(`→ ${tgt.fighter.name}稳住架势且未受伤：失衡 +1。`);
      }
    }
  }

  pushMeterFloatsAndAdvanceSnap(state, ui, meterFloatSnap);

  // 敌人行动：甲乙同步（处决为追加收束：本回合其余敌人不行动）
  let damageTakenThisTurn = 0;
    let anyBlockSuccess = false;
    let blockSuccessCount = 0;
  /** 致死一击前快照（与 finalize 多段对撞 turnCtx 同语义）；无则退回敌方阶段开始 HP */
  let playerHpBeforeLethalForDeathAnim = null;
  let playerStaggerBeforeLethalForDeathAnim = null;
  let playerHpAtEnemyPhaseStartForDeathAnim = state.player.hp;
  if (action === "execute") {
    details.push("→ 处决回合：其余敌人本回合未介入。");
  } else {
    const defendFailedThisTurn = false;
    const blockFailedThisTurn = false;
    meritTurn.defendFailedThisTurn = false;
    meritTurn.blockFailedThisTurn = false;
    // 同步结算：先锁定本回合会出手的敌人集合，再逐个结算并叠加结果
    const playerHpAtEnemyPhaseStart = state.player.hp;
    playerHpAtEnemyPhaseStartForDeathAnim = playerHpAtEnemyPhaseStart;
    const playerBrokenAtEnemyPhaseStart = !!state.player.broken;
    let actingEnemies = state.enemies.filter(
      (eo) => !eo.waitingToEnter && eo.fighter.hp > 0 && !eo.fighter.broken,
    );
    if (action === "block") {
      actingEnemies = sortEnemyShellsForBlockClashOrder(actingEnemies);
    }
    for (const eo of actingEnemies) {
      const hpBeforeEnemyHit = state.player.hp;
      const stBeforeEnemyHit = state.player.stagger;
      const r = resolveEnemyAgainstPlayer(
        state,
        eo,
        action,
        targetId,
        defendFailedThisTurn,
        blockFailedThisTurn,
        playerHpAtEnemyPhaseStart,
        rolled,
        playerBrokenAtEnemyPhaseStart,
      );
      if (hpBeforeEnemyHit > 0 && state.player.hp <= 0) {
        playerHpBeforeLethalForDeathAnim = hpBeforeEnemyHit;
        playerStaggerBeforeLethalForDeathAnim = stBeforeEnemyHit;
      }
      damageTakenThisTurn += r.pDmg || 0;
      meritTurn.damageMitigatedTotal = (meritTurn.damageMitigatedTotal || 0) + (r.meritMitigatedHp || 0);
      if (r.blockSuccess) {
        anyBlockSuccess = true;
        blockSuccessCount += 1;
      }
      // 即时战功：敌方命中类型（基于 effectiveIntent）
      if (r.gotHit && r.effectiveIntent === "quick") meritTurn.gotHitQuick = true;
      if (r.gotHit && r.effectiveIntent === "heavy") meritTurn.gotHitHeavy = true;
      // 即时战功：我方快攻打断敌重击（enemy raw intent=heavy，effectiveIntent=quick）
      if (action === "attack" && eo.id === targetId && eo.intent === "heavy" && r.effectiveIntent === "quick") {
        meritTurn.interruptHeavy = true;
      }
      if (r.restEvade && r.notes.length) {
        details.push(`→ ${eo.fighter.name}对你：${r.notes.join("；")}`);
        if (!opts.bundle?._playedResolutionClashAnim) {
          triggerRestEvadeFx(ui);
        }
      } else if (r.pDmg || r.pStg || r.notes.length) {
        details.push(
          `→ ${eo.fighter.name}对你：伤害-{r}${r.pDmg}{/r} 失衡+{r}${r.pStg}{/r}${r.notes.length ? `【${r.notes.join("；")}】` : ""}`,
        );
      }
      if (eo.intent === "adjust") {
        triggerEnemyAdjustRestFxOnCard(ui, eo.id);
      }
      pushMeterFloatsAndAdvanceSnap(state, ui, meterFloatSnap);
      if (playerBrokenAtEnemyPhaseStart && (state.player.hp | 0) <= 0) break;
    }
    // 先结算「未受伤则防御/盾反」的架势增减，再结算技法「借力反震」（须与 blockSuccessCount 同阶相抵，避免先减后加时 0 失衡仍被 +1）
    // 须先于头目处决判定：盾反/防御成功且本回合未受伤会 +1 失衡，可能在本段才把玩家推入破绽
    if (damageTakenThisTurn === 0) {
      if (action === "defend") {
        addStagger(state.player, 1, state);
        details.push("→ 你稳稳守住且未受伤：失衡 +1。");
        pushMeterFloatsAndAdvanceSnap(state, ui, meterFloatSnap);
      } else if (action === "block" && blockSuccessCount > 0) {
        addStagger(state.player, blockSuccessCount, state);
        details.push(
          blockSuccessCount === 1
            ? "→ 若未受伤，盾反成功：自己失衡 +1。"
            : `→ 若未受伤，盾反成功：自己失衡 +${blockSuccessCount}（可叠加）。`,
        );
        pushMeterFloatsAndAdvanceSnap(state, ui, meterFloatSnap);
      }
    }
    applyBlockReliefPerkAfterEnemyPhase(state, details, blockSuccessCount, ui, meterFloatSnap);

    // ===== 第二批技法卡：敌方阶段后触发（T17-T22） =====
    // T17：防御成功承受攻击后，自己失衡 -1
    if (state.perks?.includes("perk_defend_relief")) {
      if (action === "defend" && !meritTurn.defendFailedThisTurn && damageTakenThisTurn > 0) {
        const before = state.player.stagger;
        changeStagger(state.player, -1);
        const reduced = before - state.player.stagger;
        if (reduced > 0) details.push("→ 定步卸力：防御成功承受攻击后，你的失衡 -1。");
        pushMeterFloatsAndAdvanceSnap(state, ui, meterFloatSnap);
      }
    }
    // T18：盾反成功后恢复生命
    if (state.perks?.includes("perk_block_heal")) {
      if (action === "block" && anyBlockSuccess) {
        const healed = applyHeal(state.player, ns(1));
        if (healed > 0) {
          meritTurn.healDoneTotal = (meritTurn.healDoneTotal || 0) + healed;
          details.push(`→ 盾后回气：盾反成功，{g}HP+${healed}{/g}。`);
          pushMeterFloatsAndAdvanceSnap(state, ui, meterFloatSnap);
        }
      }
    }
    // T19：调息成功（未受伤）额外失衡 -1
    if (state.perks?.includes("perk_rest_extra_stagger_down")) {
      if (action === "rest" && damageTakenThisTurn === 0) {
        const before = state.player.stagger;
        changeStagger(state.player, -1);
        const reduced = before - state.player.stagger;
        if (reduced > 0) {
          details.push("→ 静息归元：调息成功，额外失衡 -1。");
          pushMeterFloatsAndAdvanceSnap(state, ui, meterFloatSnap);
        }
      }
    }
    // T20：HP<30% 且防御成功后恢复生命
    if (state.perks?.includes("perk_lowhp_defend_heal")) {
      const lowHp =
        playerHpAtEnemyPhaseStart > 0 && state.player.hpMax > 0 && playerHpAtEnemyPhaseStart / state.player.hpMax < 0.3;
      if (lowHp && action === "defend" && damageTakenThisTurn === 0 && !meritTurn.defendFailedThisTurn) {
        const healed = applyHeal(state.player, ns(1));
        if (healed > 0) {
          meritTurn.healDoneTotal = (meritTurn.healDoneTotal || 0) + healed;
          details.push(`→ 危桥守命：低血防御成功，{g}HP+${healed}{/g}。`);
          pushMeterFloatsAndAdvanceSnap(state, ui, meterFloatSnap);
        }
      }
    }
    // T22：本回合未受伤 → 下回合第一次快攻额外伤害
    if (state.perks?.includes("perk_no_damage_next_attack")) {
      if (damageTakenThisTurn === 0) state._noDamageNextAttackPending = true;
    }
    if (state.perks?.includes("perk_rest_next_heavy") && action === "rest" && damageTakenThisTurn === 0) {
      state._restNextHeavyBonusPending = true;
    }
    if (state.perks?.includes("perk_rest_next_defend") && action === "rest" && damageTakenThisTurn === 0) {
      state._restDefendBonusCharges = 1;
    }
    if (state.perks?.includes("perk_block_next_heavy") && action === "block" && anyBlockSuccess) {
      state._blockNextHeavyBonusPending = true;
    }
    if (state.perks?.includes("perk_block_next_attack_stagger") && action === "block" && anyBlockSuccess) {
      state._blockNextAttackStaggerPending = true;
    }
    if (state.perks?.includes("perk_peaceful_heart")) {
      if (damageTakenThisTurn === 0) {
        state._peacefulHeartNoDamageTurns = (state._peacefulHeartNoDamageTurns || 0) + 1;
        if (state._peacefulHeartNoDamageTurns >= 2) {
          state._peacefulHeartNoDamageTurns = 0;
          const healed = applyHeal(state.player, ns(1));
          if (healed > 0) {
            meritTurn.healDoneTotal = (meritTurn.healDoneTotal || 0) + healed;
            details.push(`→ 守静归心：连续两回合未受伤，{g}HP+${healed}{/g}。`);
            pushMeterFloatsAndAdvanceSnap(state, ui, meterFloatSnap);
          }
        }
      } else {
        state._peacefulHeartNoDamageTurns = 0;
      }
    }

    // 头目处决玩家：本回合敌方阶段结束时仍为破绽且场上有 canExecutePlayer 的头目 → 分四段延时演出后处决
    const execBoss = findBossExecutePlayerExecutor(state);
    if (state.player.broken && state.player.hp > 0 && execBoss) {
      runBossExecutePlayerDrama(state, ui, {
        action,
        targetId,
        intents,
        details,
        playerHpAtEnemyPhaseStartForDeathAnim,
      });
      return;
    }
  }

  // 教学触发：盾反与意图
  if (action === "block") {
    const anyHeavyIntent = state.enemies.some((eo) => intents[eo.id] === "heavy");
    const anyQuickIntent = state.enemies.some((eo) => intents[eo.id] === "quick");
    if (anyHeavyIntent && anyBlockSuccess) {
      tutorialOnce(state, "B1_block_vs_heavy_trigger", "教学：盾反成功只针对重击——这就是反制窗口。");
    }
    if (anyQuickIntent) {
      tutorialOnce(state, "B1_block_vs_quick_trigger", "教学：对快攻盾反会失败——快攻回合优先防御或快攻抢节奏。");
    }
  }

  // 教学触发：失衡与处决
  const anyEnemyBroken = state.enemies.some(
    (eo) => !eo.waitingToEnter && eo.fighter.hp > 0 && eo.fighter.broken,
  );
  if (anyEnemyBroken) {
    tutorialOnce(state, "B1_broken_execute_trigger", "教学：敌人进入破绽后，卡片上会出现“处决”按钮用于收束。");
  }

  // 玩家破绽触发：在敌人行动后可能进入破绽（由 addStagger 设置）
  if (state.player.broken) {
    details.push("→ {r}你失衡过高，进入破绽（将于回合结束强制清零）。{/r}");
    // T07：进入破绽后，首次受击减伤（在 resolveEnemyAgainstPlayer 中消费）
    if (state.perks?.includes("perk_brokenfirstshield") && state.brokenFirstShieldCharges <= 0) {
      state.brokenFirstShieldCharges = 1;
    }
  }

  // 回合结束：破绽强制清零（敌人与玩家）
  for (const eo of state.enemies) {
    if (executed[eo.id]) continue;
    if (endOfTurnForceClearBroken(eo.fighter)) {
      details.push(`→ {g}${eo.fighter.name}破绽消失（失衡清零）。{/g}`);
    }
  }
  if (endOfTurnForceClearBroken(state.player)) {
    details.push("→ {g}你的破绽消失（失衡清零）。{/g}");
  }
  meritTurn.damageTakenThisTurn = damageTakenThisTurn;
  meritTurn.anyBlockSuccess = anyBlockSuccess;
  meritTurn.selfBrokenThisTurn = !playerBrokenAtActionStart && !!state.player.broken;
  meritTurn.justRecoveredFromBrokenNext = playerBrokenAtActionStart && !state.player.broken;
  // 清理本回合“快攻打断重击”的标记（用于 T15）
  state._attackInterruptedHeavyTargetId = null;

  // 补位：若有后备敌人，填充倒下的槽位（用于“守点战”）
  if (state.battle && Array.isArray(state.battle.reserve) && state.battle.reserve.length) {
    const slotReserveLabel = { A: "甲位", B: "乙位", C: "丙位" };
    for (const slot of state.enemies) {
      if (slot.waitingToEnter) continue;
      if (slot.fighter.hp > 0) continue;
      const next = state.battle.reserve.shift();
      if (!next) break;
      const replaced = mkEnemyFromDef(next, slot.id);
      slot.fighter = replaced.fighter;
      slot.ai = replaced.ai;
      slot.archetype = replaced.archetype;
      slot.intent = /** @type {EnemyIntent} */ ("adjust");
      details.push(
        `→ {o}后备敌人加入：${slotReserveLabel[slot.id] || String(slot.id)}替换为${slot.fighter.name}。{/o}`,
      );
    }
  }

  deploySequentialSecondIfNeeded(state, details);

  // === 即时战功（逐回合结算）===
  // 结算点：本回合战斗结果已全部生效（敌我行动/补位/破绽清除）之后、进入下一回合之前
  {
    const ctx = state._meritTurnContext;
    const battleId = state.battle?.battleNodeId || ctx?.battleId || null;
    const isMeritBattle =
      battleId === "B1" || battleId === "B2" || battleId === "E1" || battleId === "B3" || battleId === "BOSS";
    if (ctx && isMeritBattle) {
      const aliveEnemies = state.enemies.filter((eo) => !eo.waitingToEnter && eo.fighter.hp > 0);
      const aliveEnemyCountEnd = aliveEnemies.length;

      let enemyStaggerGainedTotal = 0;
      for (const eo of state.enemies) {
        const before = enemyStgAtActionStart?.[eo.id] ?? eo.fighter.stagger;
        const after = eo.fighter.stagger ?? before;
        enemyStaggerGainedTotal += Math.max(0, after - before);
      }

      let anyEnemyBrokenNew = false;
      for (const eo of state.enemies) {
        const b0 = !!enemyBrokenAtActionStart?.[eo.id];
        const b1 = !!eo.fighter.broken;
        if (!b0 && b1 && eo.fighter.hp > 0) anyEnemyBrokenNew = true;
      }

      // 刚脱离破绽：本回合结束时若触发强制清除，下一回合视为刚恢复
      const justRecoveredFromBrokenNext = playerBrokenAtActionStart && !state.player.broken;

      const anyHeavyIntent = state.enemies.some((eo) => intents?.[eo.id] === "heavy");
      const anyQuickIntent = state.enemies.some((eo) => intents?.[eo.id] === "quick");

      const tgtObj2 = targetId ? state.enemies.find((x) => x.id === targetId) : null;
      const targetIntent = targetId ? intents?.[targetId] : null;

      // 连续压制同一目标：连续两回合对同一目标造成有效命中
      const pressureChain =
        !!meritTurn.hadPlayerHit && !!targetId && ctx.lastTurnHadHit && ctx.lastTargetId && ctx.lastTargetId === targetId;
      if (targetId && meritTurn.hadPlayerHit) ctx.lastTargetId = targetId;

      // 处决事件（由上方结构化采集；这里仅保留兼容变量占位）
      let executeKind = null;
      let executeFinishBonus = false;

      applyTurnMeritResult(state, ui, ctx, {
        action,
        targetId,
        targetIntent,
        hadPlayerHit: !!meritTurn.hadPlayerHit,
        damageTakenThisTurn,
        defendFailedThisTurn: meritTurn.defendFailedThisTurn,
        blockFailedThisTurn: meritTurn.blockFailedThisTurn,
        anyBlockSuccess,
        anyHeavyIntent,
        anyQuickIntent,
        heavyInterrupted: !!heavyQuickInterruptSuccess,
        interruptHeavy: meritTurn.interruptHeavy,
        enemyStaggerGainedTotal: meritTurn.enemyStaggerGainedTotal || enemyStaggerGainedTotal,
        anyEnemyBrokenNew,
        executeKind: meritTurn.executeKind || executeKind,
        executeFinishBonus: meritTurn.executeFinishBonus || executeFinishBonus,
        pressureChain,
        // 结构化事件：完全不依赖文本/推断
        counterHeavy: action === "block" && anyBlockSuccess && anyHeavyIntent,
        counterQuickDefend: action === "defend" && damageTakenThisTurn === 0 && !meritTurn.defendFailedThisTurn && anyQuickIntent,
        breakDefense: !!meritTurn._breakDefense,
        punishAdjust: !!meritTurn._punishAdjust,
        blockFailVsQuick: action === "block" && meritTurn.blockFailedThisTurn && anyQuickIntent,
        blockWhiff: action === "block" && !anyHeavyIntent,
        playerHpEnd: state.player.hp,
        playerHpMax: state.player.hpMax,
        aliveEnemyCountEnd,
        justRecoveredFromBroken: !!ctx.justRecoveredFromBroken,
        justRecoveredFromBrokenNext,
        gotHitQuick: meritTurn.gotHitQuick,
        gotHitHeavy: meritTurn.gotHitHeavy,
        selfBrokenThisTurn: meritTurn.selfBrokenThisTurn,
        bossExecuteTaken: !!state._meritBossExecuteTakenThisTurn,
        damageDealtTotal: meritTurn.damageDealtTotal || 0,
        damageMitigatedTotal: meritTurn.damageMitigatedTotal || 0,
        healDoneTotal: meritTurn.healDoneTotal || 0,
        hitsOnStaggeredEnemy: meritTurn.hitsOnStaggeredEnemy || 0,
      });

      // 本回合 boss 处决标志仅作用一次
      state._meritBossExecuteTakenThisTurn = false;
    }
  }

  // 胜负判定
  const over = isBattleOver(state);
  if (over) {
    state.battleLog.push(formatLineForTurn(state, action, targetId, intents, details));
    if (over === "win" && !state.endingArmed) {
      state.endingArmed = true;
      const killedIds = state.enemies
        .filter(
          (eo) =>
            !eo.waitingToEnter && enemyHpAtActionStart[eo.id] > 0 && eo.fighter.hp <= 0,
        )
        .map((eo) => eo.id);

      const beginWinEnding = () => {
        state.phase = "ending";
        state.player.broken = false;
        state.player.brokenTurnsLeft = 0;
        render(state, ui);
        runEndingHealMeterAnim(state, ui, () => {
          if (state.phase !== "ending") return;
          state.endingArmed = false;
          finish(state, ui, "win");
          render(state, ui);
        });
      };

      if (!killedIds.length) {
        emitBattleMeterFloats();
        beginWinEnding();
        return;
      }

      if (state._winKillRevealTimer) {
        clearTimeout(state._winKillRevealTimer);
        state._winKillRevealTimer = null;
      }
      state._winKillRevealGen += 1;
      const revealGen = state._winKillRevealGen;
      state._winKillRevealEnemyIds = killedIds;
      const revealMs = action === "execute" ? WIN_KILL_REVEAL_MS_EXEC : WIN_KILL_REVEAL_MS_HIT;
      emitBattleMeterFloats();
      render(state, ui);
      state._winKillRevealTimer = window.setTimeout(() => {
        state._winKillRevealTimer = null;
        if (revealGen !== state._winKillRevealGen) return;
        state._winKillRevealEnemyIds = null;
        beginWinEnding();
      }, revealMs);
      return;
    }
    if (over === "lose" && !state.endingLoseArmed) {
      state.endingLoseArmed = true;
      state.phase = "endingLose";
      // 死亡结算开始：破绽立刻消失
      state.player.broken = false;
      state.player.brokenTurnsLeft = 0;
      // 最后一击：受击刀光 +20%（death-blow）；慢镜主要为血条
      document.body.classList.add("ending-slowmo");
      triggerDeathBlowFx(ui);
      emitBattleMeterFloats();
      const hpDeath =
        playerHpBeforeLethalForDeathAnim != null ? playerHpBeforeLethalForDeathAnim : playerHpAtEnemyPhaseStartForDeathAnim;
      const stDeath =
        playerStaggerBeforeLethalForDeathAnim != null ? playerStaggerBeforeLethalForDeathAnim : state.player.stagger;
      state._endingDeathAnimating = true;
      render(state, ui);
      runEndingDeathMeterAnim(
        state,
        ui,
        hpDeath,
        () => {
          if (state.phase !== "endingLose") return;
          state.endingLoseArmed = false;
          finish(state, ui, "lose");
          render(state, ui);
        },
        { staggerStart: stDeath },
      );
      return;
    }
    emitBattleMeterFloats();
    finish(state, ui, over);
    render(state, ui);
    return;
  }

  // 若当前目标倒下，自动切换到另一名仍存活的敌人
  const cur = state.enemies.find((x) => x.id === state.targetId);
  if (!cur || cur.waitingToEnter || cur.fighter.hp <= 0) {
    const next = state.enemies.find((x) => !x.waitingToEnter && x.fighter.hp > 0);
    if (next) state.targetId = next.id;
  }

  // 回合推进（只有在战斗还继续时）
  state.battleLog.push(formatLineForTurn(state, action, targetId, intents, details));

  // 供「稳势回斩」使用：记录本回合是否未受伤
  state._noDamageLastTurn = damageTakenThisTurn === 0;
  state._lastPlayerActionWasAttack = action === "attack";

  /** 多段对撞中途暂停去处决：续播前勿 refreshIntents，甲/乙仍保持本回合意图，与剩余盾反段碰撞；处决不计入回合钟 */
  const willResumePendingAfterExecute =
    action === "execute" &&
    state._pendingMultiEnemyResolution &&
    targetId &&
    state._pendingMultiEnemyResolution.pauseEnemyId === targetId &&
    executed[targetId] &&
    !isBattleOver(state);

  advanceBattleTurnAfterPlayerAction(state, action);
  if (!willResumePendingAfterExecute) {
    refreshIntents(state);
    refreshTips(state);
  }

  emitBattleMeterFloats();

  if (
    action === "execute" &&
    state._pendingMultiEnemyResolution &&
    targetId &&
    state._pendingMultiEnemyResolution.pauseEnemyId === targetId &&
    executed[targetId]
  ) {
    const pend = state._pendingMultiEnemyResolution;
    if (pend.turnCtx?.executed) pend.turnCtx.executed[targetId] = true;
    if (!isBattleOver(state)) {
      void resumePendingMultiEnemyResolution(state, ui);
      return;
    }
    state._pendingMultiEnemyResolution = null;
  }

  render(state, ui);
}

function boot() {
  const ui = dom();
  let state = mkInitialState();
  // 英雄榜：即使尚未进入战斗也要先展示当前数据
  renderLocalLeaderboardToSettlePanel(ui, state);

  if (ui.beginnerModeToggle) {
    ui.beginnerModeToggle.checked = readBeginnerModeFromStorage();
    ui.beginnerModeToggle.addEventListener("change", () => {
      localStorage.setItem(BEGINNER_MODE_LS_KEY, ui.beginnerModeToggle.checked ? "1" : "0");
      render(state, ui);
    });
  }

  function hardRestart() {
    cancelResolutionAnimation(ui);
    resetOnlineLeaderboardCache();
    if (state._winKillRevealTimer) {
      clearTimeout(state._winKillRevealTimer);
      state._winKillRevealTimer = null;
    }
    state._winKillRevealEnemyIds = null;
    state._endingHealGen += 1;
    state._endingDeathGen += 1;
    state._winKillRevealGen += 1;
    clearBattleEntranceB1(state, ui);
    state = mkInitialState();
    gotoNode(state, ui, state.chapterId, CHAPTERS[state.chapterId]?.startNodeId || "B1");
    // 开局从外哨直接接战：序章节点视为已跳过
    markRoadmapNodeDone(state, "N0");
    markRoadmapNodeDone(state, "N1");
    render(state, ui);
  }

  if (ui.btnRestart) {
    ui.btnRestart.addEventListener("click", () => {
      const chapter = CHAPTERS[state.chapterId] || CHAPTERS.chapter1;
      const node = chapter.nodes[state.nodeId] || chapter.nodes[chapter.startNodeId];
      const isBattle = node.type === "B" || node.type === "E";
      if (
        isBattle &&
        (state.phase === "fight" ||
          state.phase === BOSS_EXEC_PLAYER_DRAMA_PHASE ||
          state.phase === "endingLose" ||
          state.phase === "lose")
      ) {
        gotoNode(state, ui, chapter.id, node.id);
        return;
      }
      state.chapterRoadmapCleared = {};
      markRoadmapNodeDone(state, "N0");
      markRoadmapNodeDone(state, "N1");
      gotoNode(state, ui, chapter.id, chapter.startNodeId);
    });
  }
  if (ui.btnWinContinue) {
    ui.btnWinContinue.addEventListener("click", () => {
      const chapter = CHAPTERS[state.chapterId] || CHAPTERS.chapter1;
      const nextId = state.pendingWinNextNodeId;
      state.pendingWinNextNodeId = null;
      const nextNode = nextId ? chapter.nodes[nextId] : null;
      if (nextNode && nextNode.type === "R") {
        markRoadmapNodeDone(state, state.nodeId);
        state.winReady = false;
        state.winGrowthEmbed = true;
        state.winGrowthEmbedNodeId = nextId;
        render(state, ui);
        return;
      }
      state.winReady = false;
      state.winGrowthEmbed = false;
      state.winGrowthEmbedNodeId = null;
      state.phase = "node";
      if (nextId) {
        markRoadmapNodeDone(state, state.nodeId);
        gotoNode(state, ui, chapter.id, nextId);
      } else {
        render(state, ui);
      }
    });
  }
  if (ui.btnChapterSettleReplay) {
    ui.btnChapterSettleReplay.addEventListener("click", () => {
      const chapter = CHAPTERS[state.chapterId] || CHAPTERS.chapter1;
      const node = chapter.nodes[state.nodeId] || chapter.nodes[chapter.startNodeId];
      if (!node || node.id !== "S1") return;
      applyGrowthOption(state, ui, chapter, node, {
        id: "hook",
        title: "再玩一局",
        desc: "从头再来。",
        next: "HOOK",
      });
    });
  }
  if (ui.btnChapterSettleRename) {
    ui.btnChapterSettleRename.addEventListener("click", () => {
      openNameDialog("chapterSettleRename");
    });
  }
  /** 关闭起名弹窗且不保存（intro：可再次点「我敢」；postBoss：回到胜利层） */
  function closeNameDialogWithoutSave() {
    if (!ui.nameDialog || ui.nameDialog.hidden) return;
    const mode = state._nameDialogMode;
    ui.nameDialog.hidden = true;
    state._nameDialogMode = null;
    if (mode === "postBoss" && ui.battleWinInline) ui.battleWinInline.hidden = false;
    render(state, ui);
  }

  function openNameDialog(mode) {
    if (!ui.nameDialog) return;
    state._nameDialogMode = mode;
    if (mode === "chapterSettleRename") {
      if (ui.nameDialogTitle) ui.nameDialogTitle.textContent = "更改名号";
      if (ui.nameDialogSub) ui.nameDialogSub.textContent = "天下英雄榜与本机记录将使用该名号。";
      if (ui.nameDialogOk) ui.nameDialogOk.textContent = "确定";
      if (ui.nameDialogInput) {
        ui.nameDialogInput.value = String(state._playerName || "").trim();
        ui.nameDialogInput.placeholder = "汉字至多 6 字，字母至多 12 个";
      }
    } else {
      if (ui.nameDialogTitle) {
        ui.nameDialogTitle.textContent = mode === "intro" ? "请留名号" : "恭喜录入英雄榜！";
      }
      if (ui.nameDialogSub) {
        ui.nameDialogSub.textContent = "敢问壮士尊号？";
      }
      if (ui.nameDialogOk) {
        ui.nameDialogOk.textContent = mode === "intro" ? "定名出战" : "定名";
      }
      if (ui.nameDialogInput) {
        ui.nameDialogInput.value = "";
        ui.nameDialogInput.placeholder = "汉字至多 6 字，字母至多 12 个";
      }
    }
    ui.nameDialog.hidden = false;
    ui.nameDialogInput?.focus();
  }

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (!ui.nameDialog || ui.nameDialog.hidden) return;
    e.preventDefault();
    closeNameDialogWithoutSave();
  });

  if (ui.nameDialogClose) {
    ui.nameDialogClose.addEventListener("click", () => closeNameDialogWithoutSave());
  }

  if (ui.btnIntroDare) {
    ui.btnIntroDare.addEventListener("click", () => {
      openNameDialog("intro");
    });
  }
  const assignBattleGameHome = () => window.location.assign(BATTLE_GAME_HOME_URL);
  if (ui.btnIntroHeroLocate) {
    ui.btnIntroHeroLocate.addEventListener("click", assignBattleGameHome);
  }
  if (ui.btnIntroLbRefresh) {
    ui.btnIntroLbRefresh.addEventListener("click", assignBattleGameHome);
  }
  if (ui.btnIntroContinue) {
    ui.btnIntroContinue.addEventListener("click", () => {
      // 继续战斗：使用已保存的玩家信息，不再弹出输入框
      const chapter = CHAPTERS[state.chapterId] || CHAPTERS.chapter1;
      const nodeId = state.nodeId;
      const node = chapter.nodes[nodeId] || chapter.nodes[chapter.startNodeId];
      const isBattle = node.type === "B" || node.type === "E";
      state.introDismissed = true;
      if (isBattle) {
        try {
          startBattleFromNode(state, node);
        } catch (e) {
          const msg = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
          state.settleLog.push(`{r}开阵失败：${msg}{/r}`);
        }
      }
      render(state, ui);
    });
  }
  if (ui.btnIntroNew) {
    ui.btnIntroNew.addEventListener("click", () => {
      // 新角色：清空档案并重新输入
      clearPlayerProfile(state);
      render(state, ui);
      openNameDialog("intro");
    });
  }
  if (ui.btnWinClaim) {
    ui.btnWinClaim.addEventListener("click", () => {
      // 隐藏胜利弹层，弹出昵称输入框
      if (ui.battleWinInline) ui.battleWinInline.hidden = true;
      openNameDialog("postBoss");
    });
  }
  if (ui.nameDialogOk) {
    function proceedAfterName() {
      const chapter = CHAPTERS[state.chapterId] || CHAPTERS.chapter1;
      const nextId = state.pendingWinNextNodeId;
      state.winReady = false;
      state.pendingWinNextNodeId = null;
      state.phase = "node";
      // Boss 结算页输入昵称后：写入排行榜，并刷新展示
      if (state.chapterId === "chapter1" && state.nodeId === "S1" && state.meritChapter?.records?.BOSS) {
        ensureChapter1LeaderboardRecord(state);
      }
      if (nextId) {
        markRoadmapNodeDone(state, state.nodeId);
        gotoNode(state, ui, chapter.id, nextId);
      } else {
        render(state, ui);
      }
    }
    ui.nameDialogOk.addEventListener("click", () => {
      const rawName = (ui.nameDialogInput?.value || "").trim();
      const name = clampPlayerNameValue(rawName) || "无名侠客";
      const mode = state._nameDialogMode || "postBoss";
      state._playerName = name;
      if (mode !== "chapterSettleRename") {
        state._playerFaction = normalizeFactionKey("qun");
      }
      savePlayerProfile(state);
      if (ui.nameDialog) ui.nameDialog.hidden = true;
      state._nameDialogMode = null;
      if (mode === "chapterSettleRename") {
        patchChapterSettleLeaderboardLocalRowName(state, name);
        render(state, ui);
        return;
      }
      if (mode === "intro") {
        const chapter = CHAPTERS[state.chapterId] || CHAPTERS.chapter1;
        const nodeId = state.nodeId;
        const node = chapter.nodes[nodeId] || chapter.nodes[chapter.startNodeId];
        const isBattle = node.type === "B" || node.type === "E";
        state.introDismissed = true;
        if (isBattle) {
          try {
            startBattleFromNode(state, node);
          } catch (e) {
            const msg = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
            state.settleLog.push(`{r}开阵失败：${msg}{/r}`);
          }
        }
        render(state, ui);
        return;
      }
      proceedAfterName();
    });
    ui.nameDialogInput?.addEventListener("keydown", (e) => {
      if (e.key === "Enter") ui.nameDialogOk.click();
    });
    // 取名规则：汉字 ≤6、字母 ≤12（须避开中文 IME 组字过程）
    if (ui.nameDialogInput) {
      const el = ui.nameDialogInput;
      let imeComposing = false;
      const clampNameInput = () => {
        const raw = String(el.value || "");
        const limited = clampPlayerNameValue(raw);
        if (limited !== raw) el.value = limited;
      };
      el.addEventListener("compositionstart", () => {
        imeComposing = true;
      });
      el.addEventListener("compositionend", () => {
        imeComposing = false;
        clampNameInput();
      });
      el.addEventListener("input", () => {
        if (imeComposing) return;
        clampNameInput();
      });
    }
  }
  if (ui.btnRetryBattle) {
    ui.btnRetryBattle.addEventListener("click", () => {
      const chapter = CHAPTERS[state.chapterId] || CHAPTERS.chapter1;
      const node = chapter.nodes[state.nodeId] || chapter.nodes[chapter.startNodeId];
      const isBattle = node.type === "B" || node.type === "E";
      if (!isBattle || state.phase !== "lose") return;
      if (state._deathPenaltyRetryBusy) return;

      const bid = state.battle?.battleNodeId || node.id;
      const pen = state._deathMeritPenaltyPending | 0;
      const needsDeathPenaltyAnim = pen > 0 && !!MERIT_BATTLES[bid];

      const startBattleFlow = () => {
        state.introDismissed = true;
        gotoNode(state, ui, chapter.id, node.id);
        try {
          startBattleFromNode(state, node);
        } catch (e) {
          const msg = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
          state.settleLog.push(`{r}开阵失败：${msg}{/r}`);
        }
        render(state, ui);
        state._deathPenaltyRetryBusy = false;
      };

      if (!needsDeathPenaltyAnim) {
        startBattleFlow();
        return;
      }

      const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
      if (reduced) {
        const from = state.runMeritScore ?? 0;
        const to = Math.max(0, from - pen);
        state._deathMeritPenaltyPending = 0;
        state.runMeritScore = to;
        if (ui.runMeritValue) ui.runMeritValue.textContent = String(to);
        startBattleFlow();
        return;
      }

      state._deathPenaltyRetryBusy = true;
      const w = ui.runMeritWidget;
      const from = state.runMeritScore ?? 0;
      const to = Math.max(0, from - pen);

      if (w) {
        w.setAttribute("data-penalty-delta", `−${pen}`);
        w.classList.add("run-merit-widget--death-penalty-flash");
      }

      window.setTimeout(() => {
        if (w) {
          w.removeAttribute("data-penalty-delta");
          w.classList.remove("run-merit-widget--death-penalty-flash");
        }
        state._deathMeritPenaltyPending = 0;
        state.runMeritScore = to;
        if (ui.runMeritValue) {
          ui.runMeritValue.textContent = String(from);
          state._runMeritAnimating = true;
          requestAnimationFrame(() =>
            animateRunMeritValue(ui, state, from, to, startBattleFlow, RUN_MERIT_DEATH_PENALTY_ANIM_MS),
          );
        } else {
          startBattleFlow();
        }
      }, 420);
    });
  }
  if (ui.btnLoseBackToMain) {
    ui.btnLoseBackToMain.addEventListener("click", () => {
      const chapter = CHAPTERS[state.chapterId] || CHAPTERS.chapter1;
      if (state.phase !== "lose") return;
      cancelResolutionAnimation(ui);
      state.pendingRetryBattleNodeId = null;
      state.battleSnapshot = null;
      if (state.chapterId === "chapter1") {
        state.settleLog = state.settleLog || [];
        state.settleLog.push("{g}结算回营：提前封卷，本章战功已记入英雄榜，战功评级与三国将魂已给出。{/g}");
        const pen = state._deathMeritPenaltyPending | 0;
        if (pen > 0) {
          const cur = state.runMeritScore ?? 0;
          state.runMeritScore = Math.max(0, cur - pen);
          state._deathMeritPenaltyPending = 0;
          if (ui.runMeritValue && !state._runMeritAnimating && !state._chapterRemainMeritAnimating) {
            ui.runMeritValue.textContent = String(state.runMeritScore ?? 0);
          }
        }
        syncRunMeritToChapterFinal(state, ui);
        ensureChapter1EarlyCampLeaderboardRecord(state);
        state.introDismissed = true;
        gotoNode(state, ui, chapter.id, "S1");
      } else {
        state.introDismissed = false;
        gotoNode(state, ui, chapter.id, chapter.startNodeId);
      }
    });
  }
  if (ui.btnWinGrowthNextBattle) {
    ui.btnWinGrowthNextBattle.addEventListener("click", () => {
      const p = state.winGrowthPendingAdvance;
      if (!p || state.phase !== "win") return;
      if (state.growthPickId && p.fromNodeId) {
        delete state.growthPickId[p.fromNodeId];
        if (state.growthRevealed) delete state.growthRevealed[p.fromNodeId];
      }
      state.winGrowthPendingAdvance = null;
      const chapter = CHAPTERS[p.chapterId] || CHAPTERS.chapter1;
      const nextNode = chapter.nodes[p.nextId] || chapter.nodes[chapter.startNodeId];
      markRoadmapNodeDone(state, p.fromNodeId);
      if (nextNode && (nextNode.type === "B" || nextNode.type === "E")) {
        state.chapterId = chapter.id;
        state.nodeId = nextNode.id;
        startBattleFromNode(state, nextNode);
      } else if (p.nextId) {
        gotoNode(state, ui, chapter.id, p.nextId);
      }
      render(state, ui);
    });
  }
  if (ui.btnStartBattle) {
    ui.btnStartBattle.addEventListener("click", () => {
      const chapter = CHAPTERS[state.chapterId] || CHAPTERS.chapter1;
      // 「开始战斗」只应以当前节点为准；pendingBattleNodeId 可能为空/滞后导致误判为非战斗节点
      const nodeId = state.nodeId;
      const node = chapter.nodes[nodeId] || chapter.nodes[chapter.startNodeId];
      const isBattle = node.type === "B" || node.type === "E";
      if (!isBattle) return;
      state.introDismissed = true;
      try {
        startBattleFromNode(state, node);
      } catch (e) {
        const msg = e && typeof e === "object" && "message" in e ? String(e.message) : String(e);
        state.settleLog.push(`{r}开阵失败：${msg}{/r}`);
      }
      render(state, ui);
    });
  }
  if (ui.tipsPanel) {
    ui.tipsPanel.addEventListener("click", (e) => {
      const t = e.target;
      if (t instanceof Element && t.closest(".beginner-mode-toggle")) return;
      // 点击新手提示区域即停止建议键闪烁（本局内）；不响应「新手模式」开关
      state.tipsHighlightDismissed = true;
      render(state, ui);
    });
  }
  ui.actAttack.addEventListener("click", () => queuePlayerAction(state, ui, "attack"));
  ui.actHeavy.addEventListener("click", () => queuePlayerAction(state, ui, "heavy"));
  ui.actDefend.addEventListener("click", () => queuePlayerAction(state, ui, "defend"));
  ui.actBlock.addEventListener("click", () => queuePlayerAction(state, ui, "block"));
  ui.actRest.addEventListener("click", () => queuePlayerAction(state, ui, "rest"));
  // 悬浮说明：延迟 0.5s 显示独立 tooltip（不占用顶部 actionDesc）
  const skillHoverBinds = [
    [ui.actAttack, "attack"],
    [ui.actHeavy, "heavy"],
    [ui.actDefend, "defend"],
    [ui.actBlock, "block"],
    [ui.actRest, "rest"],
  ];
  for (const [btn, action] of skillHoverBinds) {
    if (!btn) continue;
    btn.addEventListener("mouseenter", () => armSkillHoverTooltip(state, ui, btn, action));
    btn.addEventListener("focus", () => armSkillHoverTooltip(state, ui, btn, action));
    btn.addEventListener("mouseleave", () => hideSkillHoverTooltip(state, ui));
    btn.addEventListener("blur", () => hideSkillHoverTooltip(state, ui));
  }

  // 滚动/缩放/点击别处时收起 tooltip（避免“粘”在屏幕上）
  window.addEventListener(
    "scroll",
    () => {
      hideSkillHoverTooltip(state, ui);
    },
    true,
  );
  window.addEventListener("resize", () => hideSkillHoverTooltip(state, ui), { passive: true });
  document.addEventListener("pointerdown", (e) => {
    const t = e.target;
    if (!(t instanceof Element)) return;
    if (t.closest(".skill-hover-tooltip")) return;
    if (t.closest(".skill-icon")) return;
    hideSkillHoverTooltip(state, ui);
  });
  function bindExecuteOnCard(btn, id) {
    btn.addEventListener("click", (ev) => {
      ev.stopPropagation();
      ev.preventDefault();
      const eo = state.enemies.find((x) => x.id === id);
      if (!eo || eo.waitingToEnter || eo.fighter.hp <= 0 || !eo.fighter.broken || state.player.broken) return;
      state.targetId = id;
      queuePlayerAction(state, ui, "execute");
    });
  }
  bindExecuteOnCard(ui.actExecuteA, "A");
  bindExecuteOnCard(ui.actExecuteB, "B");
  if (ui.actExecuteC) bindExecuteOnCard(ui.actExecuteC, "C");
  ui.enemyCardA.addEventListener("click", () => {
    if (state.enemies.find((x) => x.id === "A").fighter.hp > 0) state.targetId = "A";
    render(state, ui);
  });
  ui.enemyCardB.addEventListener("click", () => {
    const eo = state.enemies.find((x) => x.id === "B");
    if (eo && !eo.waitingToEnter && eo.fighter.hp > 0) state.targetId = "B";
    render(state, ui);
  });
  if (ui.enemyCardC) {
    ui.enemyCardC.addEventListener("click", () => {
      const eo = state.enemies.find((x) => x.id === "C");
      if (eo && !eo.waitingToEnter && eo.fighter.hp > 0) state.targetId = "C";
      render(state, ui);
    });
  }

  // 初始进入章节
  hardRestart();
}

boot();

