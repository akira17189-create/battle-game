/**
 * 技法卡与属性卡数据（与战斗逻辑解耦，供 main.js 注入 ns 后生成技法池）
 * @file
 */
(function (global) {
  "use strict";

  /**
   * 第一章技法卡池
   * - primary：主分类（用于卡面主色与仓库归类）
   * - extraTags：可附加标签（展示用，不参与 perk 战斗结算逻辑）
   * 叠加规则：全部加法叠加（不做乘法联动）
   * @param {(n: number) => number} ns 与 main.js 中 NUM_SCALE 一致的缩放函数
   * @returns {{ id:string, perk:string, title:string, desc:string, primary:"offense"|"defense"|"sustain"|"tempo", extraTags:string[] }[]}
   */
  function buildSkillCards(ns) {
    return [
      { id: "T01", perk: "perk_armorbreak", title: "破甲发力", desc: "重击额外 +1 失衡。", primary: "offense", extraTags: ["重击", "失衡"] },
      { id: "T02", perk: "perk_guardshock", title: "稳守反震", desc: "盾反成功后，敌人额外 +1 失衡。", primary: "defense", extraTags: ["盾反", "失衡"] },
      { id: "T03", perk: "perk_executeheal", title: "血战余生", desc: "处决后恢复 2 点生命。", primary: "sustain", extraTags: ["处决", "回复"] },
      { id: "T04", perk: "perk_heavybreakdef", title: "断势重斩", desc: `对防御中的敌人使用重击时，额外 +${ns(1)} 伤害。`, primary: "offense", extraTags: ["重击", "破防"] },
      { id: "T05", perk: "perk_blockrelief", title: "借力反震", desc: "盾反成功几次，自己失衡减几次（对重击成功可叠加）。", primary: "defense", extraTags: ["盾反", "卸势"] },
      {
        id: "T06",
        perk: "perk_staggerstrike",
        title: "夺命追击",
        desc: `快攻命中失衡值不为 0 的目标时，额外 +${ns(1)} 伤害。`,
        primary: "offense",
        extraTags: ["快攻", "失衡收割"],
      },
      { id: "T07", perk: "perk_brokenfirstshield", title: "硬撑架势", desc: `进入破绽后，首次受到的伤害 -${ns(1)}。`, primary: "defense", extraTags: ["破绽", "减伤"] },
      { id: "T08", perk: "perk_attackvsadjust", title: "乘势压攻", desc: "敌人本回合处于调整状态时，你的攻击额外 +1 失衡。", primary: "offense", extraTags: ["调整状态", "失衡"] },
      {
        id: "T09",
        perk: "perk_kill_next_attack",
        title: "夺势突进",
        desc: `战斗开始后，首次快攻伤害 +${ns(1)}。`,
        primary: "offense",
        extraTags: ["快攻", "首击"],
      },
      {
        id: "T10",
        perk: "perk_rest_evade",
        title: "听风卸势",
        desc: "调息时有 70% 概率：本回合受敌方快攻或重击时完全闪避（免伤、免失衡）。",
        primary: "defense",
        extraTags: ["调息", "闪避"],
      },
      { id: "T11", perk: "perk_follow_attack", title: "追身快斩", desc: "快攻命中未处于防御意图的目标时，额外 +1 失衡。", primary: "offense", extraTags: ["快攻", "压制"] },
      { id: "T12", perk: "perk_heavy_vs_staggered", title: "断脉沉击", desc: `重击命中失衡值不为 0 的目标时，额外 +${ns(1)} 伤害。`, primary: "offense", extraTags: ["重击", "失衡收割"] },
      {
        id: "T13",
        perk: "perk_attack_vs_broken",
        title: "乘隙追命",
        desc: "对失衡且尚未露出破绽的目标使用快攻或重击时，额外 +1 失衡。",
        primary: "offense",
        extraTags: ["失衡", "压制"],
      },
      { id: "T14", perk: "perk_kill_reduce_stagger", title: "斩阵夺势", desc: "击杀敌人后，自己失衡 -1。", primary: "tempo", extraTags: ["击杀", "失衡回复"] },
      { id: "T15", perk: "perk_interrupt_bonus", title: "截锋断势", desc: "快攻成功打断重击时，额外 +1 失衡。", primary: "offense", extraTags: ["快攻", "打断", "失衡"] },
      { id: "T16", perk: "perk_break_defense_followup", title: "逼守抢口", desc: `本回合用重击命中防御中的敌人后，下回合第一次快攻额外 +${ns(1)} 伤害。`, primary: "tempo", extraTags: ["重击", "快攻连段"] },
      { id: "T17", perk: "perk_defend_relief", title: "定步卸力", desc: "防御成功承受攻击后，自己失衡 -1。", primary: "defense", extraTags: ["防御", "卸势"] },
      { id: "T18", perk: "perk_block_heal", title: "盾后回气", desc: `盾反成功后，恢复 ${ns(1)} 点生命。`, primary: "sustain", extraTags: ["盾反", "回复"] },
      { id: "T19", perk: "perk_rest_extra_stagger_down", title: "静息归元", desc: "调息成功时，额外失衡 -1。", primary: "defense", extraTags: ["调息", "卸势"] },
      { id: "T20", perk: "perk_lowhp_defend_heal", title: "危桥守命", desc: `自身 HP 低于 30% 时，防御成功后恢复 ${ns(1)} 点生命。`, primary: "sustain", extraTags: ["低血", "防御", "回复"] },
      { id: "T21", perk: "perk_broken_defend_bonus", title: "破绽强守", desc: `破绽状态下使用防御时，额外减伤 +${ns(1)}。`, primary: "defense", extraTags: ["破绽", "防御", "减伤"] },
      { id: "T22", perk: "perk_no_damage_next_attack", title: "以守待变", desc: `本回合未受伤，则下回合第一次快攻额外 +${ns(1)} 伤害。`, primary: "tempo", extraTags: ["无伤", "快攻连段"] },
      {
        id: "T23",
        perk: "perk_execute_other_stagger",
        title: "断势行刑",
        desc: "处决后，在场其他敌人初始失衡 +1。",
        primary: "tempo",
        extraTags: ["处决", "滚雪球", "失衡"],
      },
      {
        id: "T24",
        perk: "perk_peaceful_heart",
        title: "守静归心",
        desc: `连续两回合未受伤时，恢复 ${ns(1)} 点生命。`,
        primary: "sustain",
        extraTags: ["无伤", "回复", "守势"],
      },
      {
        id: "T25",
        perk: "perk_rest_next_heavy",
        title: "养锋待发",
        desc: `调息成功后，下回合第一次重击额外 +${ns(1)} 伤害。`,
        primary: "tempo",
        extraTags: ["调息", "重击", "蓄势"],
      },
      {
        id: "T26",
        perk: "perk_rest_next_defend",
        title: "凝神守气",
        desc: `调息成功后，下回合第一次防御额外减伤 +${ns(1)}。`,
        primary: "defense",
        extraTags: ["调息", "防御", "减伤"],
      },
      {
        id: "T27",
        perk: "perk_block_next_heavy",
        title: "守中藏杀",
        desc: `本回合盾反成功，则下回合第一次重击额外 +${ns(1)} 伤害。`,
        primary: "tempo",
        extraTags: ["盾反", "重击连段", "反击"],
      },
      {
        id: "T28",
        perk: "perk_block_next_attack_stagger",
        title: "借锋还势",
        desc: "盾反成功后，自己下回合第一次攻击额外 +1 失衡。",
        primary: "defense",
        extraTags: ["盾反", "反制", "失衡"],
      },
      {
        id: "T29",
        perk: "perk_heavy_chain_heavy",
        title: "重势追断",
        desc: `本回合重击命中后，下回合第一次重击额外 +${ns(1)} 伤害。`,
        primary: "tempo",
        extraTags: ["重击", "连段", "增伤"],
      },
      {
        id: "T30",
        perk: "perk_interrupt_next_quick",
        title: "乱节追身",
        desc: `快攻成功打断敌人后，下回合第一次快攻额外 +${ns(1)} 伤害。`,
        primary: "tempo",
        extraTags: ["快攻", "打断", "连段"],
      },
      {
        id: "T31",
        perk: "perk_quick_vs_defend_dmg",
        title: "破门疾袭",
        desc: `快攻命中防御的目标时，额外 +${ns(1)} 伤害。`,
        primary: "offense",
        extraTags: ["快攻", "压制", "增伤"],
      },
      {
        id: "T32",
        perk: "perk_quick_double_stagger",
        title: "疾锋连压",
        desc: "连续两回合都使用快攻时，第二次快攻额外 +1 失衡。",
        primary: "offense",
        extraTags: ["快攻", "连段", "失衡"],
      },
    ];
  }

  /** 第一章：4 张属性卡（R2 三选一；R4 混入 1 张） */
  const ATTR_CARDS = [
    { id: "A_ATK", title: "猛进", desc: "ATK +10", _stat: "atk" },
    { id: "A_DEF", title: "坚守", desc: "防御时额外减伤 +10", _stat: "def" },
    { id: "A_HP", title: "铁骨", desc: "Max HP +20", _stat: "hp" },
    { id: "A_STG", title: "稳势", desc: "失衡上限 +1", _stat: "stg" },
  ];

  global.SkillCardsConfig = {
    buildSkillCards,
    ATTR_CARDS,
  };
})(typeof window !== "undefined" ? window : globalThis);
