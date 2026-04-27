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
   * @returns {{ id:string, perk:string, title:string, desc:string, primary:"offense"|"defense"|"sustain"|"tempo", extraTags:string[], frontArt?: string }[]}
   */
  function buildSkillCards(ns) {
    return [
      {
        id: "T01",
        perk: "perk_armorbreak",
        title: "破甲发力",
        desc: "重击额外 +1 失衡。",
        primary: "offense",
        extraTags: ["重击", "失衡"],
        frontArt: "./cards/front/T01.png",
      },
      {
        id: "T02",
        perk: "perk_guardshock",
        title: "稳守反震",
        desc: "盾反成功后，敌人额外 +1 失衡。",
        primary: "defense",
        extraTags: ["盾反", "失衡"],
        frontArt: "./cards/front/T02.png",
      },
      {
        id: "T03",
        perk: "perk_executeheal",
        title: "血战余生",
        desc: "处决后恢复 20 点生命。",
        primary: "sustain",
        extraTags: ["处决", "回复"],
        frontArt: "./cards/front/T03.png",
      },
      {
        id: "T04",
        perk: "perk_heavybreakdef",
        title: "断势重斩",
        desc: `对防御中的敌人使用重击时，额外 +${ns(1)} 伤害。`,
        primary: "offense",
        extraTags: ["重击", "破防"],
        frontArt: "./cards/front/T04.png",
      },
      {
        id: "T06",
        perk: "perk_staggerstrike",
        title: "夺命追击",
        desc: `攻击命中失衡值不为 0 的目标时，额外 +${ns(1)} 伤害。`,
        primary: "offense",
        extraTags: ["攻击", "失衡收割"],
        frontArt: "./cards/front/T06.png",
      },
      {
        id: "T09",
        perk: "perk_kill_next_attack",
        title: "夺势突进",
        desc: `战斗开始后，首次快攻伤害 +${ns(1)}。`,
        primary: "offense",
        extraTags: ["快攻", "首击"],
        frontArt: "./cards/front/T09.png",
      },
      {
        id: "T10",
        perk: "perk_rest_evade",
        title: "听风卸势",
        desc: "调息时有 70% 概率：本回合受敌方快攻或重击时完全闪避（免伤、免失衡）。",
        primary: "defense",
        extraTags: ["调息", "闪避"],
        frontArt: "./cards/front/T10.png",
      },
      {
        id: "T14",
        perk: "perk_kill_reduce_stagger",
        title: "斩阵夺势",
        desc: "击杀敌人后，自己失衡 -1。",
        primary: "tempo",
        extraTags: ["击杀", "失衡回复"],
        frontArt: "./cards/front/T14.png",
      },
      {
        id: "T15",
        perk: "perk_interrupt_bonus",
        title: "截锋断势",
        desc: "快攻成功打断重击时，额外 +1 失衡。",
        primary: "offense",
        extraTags: ["快攻", "打断", "失衡"],
        frontArt: "./cards/front/T15.png",
      },
      {
        id: "T17",
        perk: "perk_defend_relief",
        title: "定步卸力",
        desc: "防御或盾反架势下本回合承伤后，自己失衡 -1。",
        primary: "defense",
        extraTags: ["防御", "卸势"],
        frontArt: "./cards/front/T17.png",
      },
      {
        id: "T18",
        perk: "perk_block_heal",
        title: "盾后回气",
        desc: `盾反成功后，恢复 ${ns(1)} 点生命。`,
        primary: "sustain",
        extraTags: ["盾反", "回复"],
        frontArt: "./cards/front/T18.png",
      },
      {
        id: "T19",
        perk: "perk_rest_extra_stagger_down",
        title: "静息归元",
        desc: "调息成功时，额外失衡 -1。",
        primary: "defense",
        extraTags: ["调息", "卸势"],
        frontArt: "./cards/front/T19.png",
      },
      {
        id: "T23",
        perk: "perk_execute_other_stagger",
        title: "断势行刑",
        desc: "处决后，在场其他敌人初始失衡 +1。",
        primary: "tempo",
        extraTags: ["处决", "滚雪球", "失衡"],
        frontArt: "./cards/front/T23.png",
      },
    ];
  }

  /** 第一章：4 张属性卡（R2 三选一；R4 混入 1 张） */
  const ATTR_CARDS = [
    { id: "A_ATK", title: "猛进", desc: "ATK +10", _stat: "atk", frontArt: "./cards/front/A_ATK.png" },
    { id: "A_DEF", title: "坚守", desc: "防御时额外减伤 +10", _stat: "def", frontArt: "./cards/front/A_DEF.png" },
    { id: "A_HP", title: "铁骨", desc: "Max HP +20", _stat: "hp", frontArt: "./cards/front/A_HP.png" },
    { id: "A_STG", title: "稳势", desc: "失衡上限 +1", _stat: "stg", frontArt: "./cards/front/A_STG.png" },
  ];

  global.SkillCardsConfig = {
    buildSkillCards,
    ATTR_CARDS,
  };
})(typeof window !== "undefined" ? window : globalThis);
