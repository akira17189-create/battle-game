/**
 * 105 将魂查表：嵌入数据与 general_soul_system_105_dual_levels.csv 一致（file:// 可用）。
 * 行为阶名与 general_soul_system_105_named_levels.csv / 任务书 v6 一致，供展示层使用。
 * 查表键：(行为, 将魂序列等级 Lv1～Lv7，由战评档决定)。「综合等级」仅展示，不参与匹配。
 * 暴露：window.GeneralSoul105Lookup
 */
(function () {
  /** @type {Record<string, Record<string, string>>} 与 named_levels CSV「行为阶名」列一致 */
  const BEHAVIOR_LEVEL_NAMES = {
    疾袭先登: { Lv1: "潜锋", Lv2: "掠影", Lv3: "夺步", Lv4: "奔袭", Lv5: "穿营", Lv6: "裂阵", Lv7: "龙骧" },
    破军重斩: { Lv1: "试刃", Lv2: "震甲", Lv3: "断戈", Lv4: "摧垒", Lv5: "斩旆", Lv6: "开岳", Lv7: "天诛" },
    铁壁守御: { Lv1: "持盾", Lv2: "镇关", Lv3: "固垒", Lv4: "铁城", Lv5: "岳峙", Lv6: "玄壁", Lv7: "金汤" },
    反锋夺势: { Lv1: "候隙", Lv2: "引锋", Lv3: "借势", Lv4: "回刃", Lv5: "折芒", Lv6: "夺魄", Lv7: "天返" },
    养气持久: { Lv1: "调息", Lv2: "养元", Lv3: "归脉", Lv4: "守真", Lv5: "藏锋", Lv6: "长青", Lv7: "无竭" },
    乘隙收命: { Lv1: "觅隙", Lv2: "扣喉", Lv3: "逐命", Lv4: "封喉", Lv5: "绝息", Lv6: "断魂", Lv7: "灭烬" },
    连锋成势: { Lv1: "初炽", Lv2: "叠芒", Lv3: "成澜", Lv4: "奔洪", Lv5: "卷云", Lv6: "倾潮", Lv7: "无当" },
    死地回天: { Lv1: "残燃", Lv2: "绝脉", Lv3: "危岚", Lv4: "逆火", Lv5: "回光", Lv6: "翻岳", Lv7: "改命" },
    乱阵周旋: { Lv1: "游锋", Lv2: "转斗", Lv3: "穿缝", Lv4: "踏乱", Lv5: "回旋", Lv6: "乱舞", Lv7: "千军" },
    血战压命: { Lv1: "试血", Lv2: "裂胆", Lv3: "搏命", Lv4: "浴锋", Lv5: "断生", Lv6: "裂魄", Lv7: "修罗" },
    不伤而胜: { Lv1: "慎行", Lv2: "轻裁", Lv3: "无尘", Lv4: "静断", Lv5: "白虹", Lv6: "清锋", Lv7: "完璧" },
    持局定军: { Lv1: "布子", Lv2: "安阵", Lv3: "持衡", Lv4: "定盘", Lv5: "控野", Lv6: "镇局", Lv7: "军魁" },
    奇兵诡势: { Lv1: "伏机", Lv2: "偏锋", Lv3: "移影", Lv4: "欺阵", Lv5: "惑军", Lv6: "鬼谋", Lv7: "天机" },
    厚积骤发: { Lv1: "蓄锋", Lv2: "敛势", Lv3: "深藏", Lv4: "沉雷", Lv5: "崩川", Lv6: "裂穹", Lv7: "惊世" },
    中军主宰: { Lv1: "领旗", Lv2: "督战", Lv3: "持钺", Lv4: "节帅", Lv5: "掌纛", Lv6: "军魂", Lv7: "元戎" },
  };

  const GENERAL_SOUL_CSV_TEXT = `行为,序列等级,综合等级,武将,统,武,智,政,魅,综,特技,槍,戟,弩,騎,兵,水
疾袭先登,Lv7,Lv6,赵云,91,96,76,65,81,409,洞察,S,B,S,S,C,B
疾袭先登,Lv6,Lv6,张辽,93,92,78,58,78,399,威風,S,S,B,S,B,C
疾袭先登,Lv5,Lv3,丁奉,81,80,71,55,56,343,突襲,S,A,B,A,B,S
疾袭先登,Lv4,Lv2,甘宁,86,94,76,18,58,332,威風,S,A,A,A,S,S
疾袭先登,Lv3,Lv2,凌统,77,89,55,40,71,332,掃蕩,B,S,C,A,C,S
疾袭先登,Lv2,Lv2,蒋钦,78,84,51,42,74,329,弓將,B,A,S,B,C,S
疾袭先登,Lv1,Lv1,公孙越,74,72,47,54,67,314,白馬,B,C,C,S,B,C
破军重斩,Lv7,Lv7,关羽,95,97,75,62,93,422,神將,S,S,B,A,C,A
破军重斩,Lv6,Lv5,徐晃,88,90,74,48,71,371,沉著,A,S,B,A,B,C
破军重斩,Lv5,Lv3,李通,73,81,57,63,73,347,槍將,A,C,C,A,B,B
破军重斩,Lv4,Lv3,马超,88,97,44,26,82,337,騎神,A,B,C,S,B,C
破军重斩,Lv3,Lv2,曹彰,82,90,40,35,76,323,疾馳,A,B,C,S,B,C
破军重斩,Lv2,Lv1,夏侯威,71,73,49,57,67,317,—,B,C,B,A,C,C
破军重斩,Lv1,Lv1,陈武,74,87,43,40,62,306,戟將,A,S,C,C,C,S
铁壁守御,Lv7,Lv6,程普,84,79,79,74,85,401,名聲,A,A,A,B,B,S
铁壁守御,Lv6,Lv5,郝昭,89,79,78,62,72,380,不屈,B,S,B,A,S,C
铁壁守御,Lv5,Lv3,高顺,85,86,55,46,69,341,攻城,A,B,C,S,S,C
铁壁守御,Lv4,Lv3,韩当,76,85,56,51,68,336,水將,A,B,B,A,C,S
铁壁守御,Lv2,Lv2,董和,57,34,74,87,76,328,親蠻,C,B,A,C,C,C
铁壁守御,Lv3,Lv2,孟获,76,87,42,45,80,330,亂戰,B,S,C,C,C,C
铁壁守御,Lv1,Lv2,廖化,73,76,64,49,66,328,血路,A,A,C,B,C,C
反锋夺势,Lv7,Lv7,司马懿,98,63,96,93,87,437,深謀,S,A,A,S,A,C
反锋夺势,Lv6,Lv6,满宠,84,64,82,84,80,394,輔佐,C,S,A,C,A,C
反锋夺势,Lv5,Lv3,程昱,70,49,90,79,58,346,掎角,A,C,C,C,A,C
反锋夺势,Lv4,Lv2,王甫,62,41,79,78,73,333,—,C,C,B,C,A,B
反锋夺势,Lv3,Lv2,杨肇,70,65,68,62,58,323,—,A,B,A,B,B,C
反锋夺势,Lv2,Lv1,傅嘏,44,35,81,82,70,312,—,C,C,B,C,B,C
反锋夺势,Lv1,Lv1,夏侯恩,63,72,52,45,71,303,—,B,C,C,B,C,C
养气持久,Lv7,Lv6,鲁肃,80,56,92,90,89,407,富豪,A,A,A,C,A,A
养气持久,Lv6,Lv6,刘备,75,73,74,78,99,399,遁走,A,B,A,B,C,C
养气持久,Lv5,Lv3,孙登,62,37,79,80,87,345,仁政,B,B,A,C,A,A
养气持久,Lv4,Lv2,马良,46,23,85,90,86,330,能吏,C,C,B,C,B,B
养气持久,Lv3,Lv2,留平,70,71,68,57,63,329,築城,B,B,C,C,A,A
养气持久,Lv2,Lv1,孙乾,34,33,78,84,84,313,論客,C,C,C,C,B,C
养气持久,Lv1,Lv1,糜竺,33,29,77,83,85,307,富豪,C,C,B,C,C,C
乘隙收命,Lv7,Lv7,吕蒙,91,81,89,78,82,421,攻心,S,A,B,B,S,S
乘隙收命,Lv6,Lv5,马忠,78,72,68,78,79,375,踐踏,B,A,A,C,A,C
乘隙收命,Lv5,Lv4,关平,77,82,68,60,76,363,輔佐,S,A,B,A,C,B
乘隙收命,Lv4,Lv2,曹休,74,75,58,56,67,330,射手,B,C,S,A,C,B
乘隙收命,Lv3,Lv2,张苞,75,87,48,46,68,324,掃蕩,S,A,B,A,C,C
乘隙收命,Lv2,Lv1,吴班,74,71,56,45,66,312,—,A,B,B,B,C,B
乘隙收命,Lv1,Lv1,朱灵,71,73,67,53,42,306,—,B,C,C,A,C,C
连锋成势,Lv7,Lv7,孙策,92,92,69,70,92,415,勇將,S,A,B,S,A,S
连锋成势,Lv6,Lv5,张郃,90,89,69,57,71,376,昂揚,A,B,C,S,A,C
连锋成势,Lv5,Lv3,全琮,78,72,71,61,67,349,強襲,A,B,A,C,A,S
连锋成势,Lv4,Lv2,乐进,80,84,52,51,65,332,攻城,S,B,B,A,S,C
连锋成势,Lv3,Lv2,文鸯,76,91,60,32,63,322,突襲,B,C,A,S,C,C
连锋成势,Lv2,Lv1,孙异,69,71,55,62,61,318,—,B,B,A,C,B,A
连锋成势,Lv1,Lv1,孙观,72,78,51,39,66,306,威壓,A,B,C,A,C,C
死地回天,Lv7,Lv7,姜维,90,89,90,67,80,416,反計,S,B,A,S,C,C
死地回天,Lv6,Lv5,夏侯惇,89,90,58,70,81,388,騎將,A,B,C,S,B,C
死地回天,Lv5,Lv3,刘谌,60,62,69,73,82,346,怒髮,B,A,B,C,C,C
死地回天,Lv4,Lv3,魏延,81,92,69,49,45,336,連擊,A,S,B,A,C,C
死地回天,Lv3,Lv2,鲍三娘,72,83,56,36,75,322,連擊,B,B,B,A,C,A
死地回天,Lv2,Lv1,董承,56,53,65,63,75,312,—,C,C,C,B,B,C
死地回天,Lv1,Lv1,王威,60,70,59,52,66,307,—,B,C,B,C,C,A
乱阵周旋,Lv7,Lv7,孙坚,93,90,74,73,91,421,驅逐,S,S,C,A,C,S
乱阵周旋,Lv6,Lv5,太史慈,82,93,66,58,79,378,戟神,A,S,C,S,C,B
乱阵周旋,Lv5,Lv3,皇甫嵩,87,61,73,51,72,344,火攻,S,B,A,C,S,C
乱阵周旋,Lv4,Lv2,陈到,76,71,63,53,69,332,—,A,C,B,A,B,C
乱阵周旋,Lv3,Lv2,侯成,74,75,63,56,60,328,—,B,B,B,A,C,C
乱阵周旋,Lv2,Lv1,田楷,68,65,56,61,63,313,—,C,C,B,A,B,C
乱阵周旋,Lv1,Lv1,盛曼,61,68,66,50,57,302,—,C,B,A,C,B,A
血战压命,Lv7,Lv7,邓艾,94,87,89,81,70,421,強行,S,A,A,A,S,C
血战压命,Lv6,Lv4,马腾,82,80,51,59,89,361,繁殖,B,A,C,S,C,C
血战压命,Lv5,Lv3,马云騄,78,88,53,46,77,342,騎將,A,C,B,S,C,B
血战压命,Lv4,Lv3,傅僉,73,85,72,46,62,338,猛者,B,A,C,A,B,C
血战压命,Lv3,Lv2,刘封,75,79,44,50,76,324,槍將,A,C,C,A,A,B
血战压命,Lv2,Lv1,杨怀,62,68,68,62,53,313,—,C,A,B,C,C,C
血战压命,Lv1,Lv1,胡奋,71,76,50,52,55,304,攻城,C,B,C,A,S,C
不伤而胜,Lv7,Lv7,周瑜,97,71,96,86,93,443,火神,A,A,S,C,C,S
不伤而胜,Lv6,Lv6,郭淮,87,78,81,75,77,398,不屈,A,S,C,A,B,C
不伤而胜,Lv5,Lv3,王平,83,79,76,58,51,347,沉著,A,A,S,B,C,C
不伤而胜,Lv4,Lv3,杜畿,66,32,74,87,76,335,搬運,C,C,B,C,A,B
不伤而胜,Lv3,Lv2,董允,47,28,78,91,79,323,指導,C,C,B,C,B,C
不伤而胜,Lv2,Lv1,陈矫,61,27,76,83,64,311,—,C,B,A,C,B,C
不伤而胜,Lv1,Lv1,唐彬,67,74,59,53,58,311,—,B,C,B,B,A,A
持局定军,Lv7,Lv7,曹操,96,72,91,94,96,449,虛實,S,S,A,A,B,C
持局定军,Lv6,Lv5,曹真,87,74,68,72,88,389,精妙,A,B,B,S,C,C
持局定军,Lv5,Lv3,田丰,72,29,93,87,64,345,—,A,B,B,C,A,C
持局定军,Lv4,Lv2,温恢,62,36,73,86,76,333,能吏,B,A,B,B,A,B
持局定军,Lv3,Lv2,高柔,57,43,71,79,74,324,—,C,B,B,C,B,C
持局定军,Lv2,Lv1,全纪,49,69,61,70,63,312,—,B,C,B,C,C,B
持局定军,Lv1,Lv1,石苞,69,71,56,53,60,309,風水,A,B,B,B,B,C
奇兵诡势,Lv7,Lv7,诸葛亮,92,38,100,95,92,417,神算,B,B,S,C,S,A
奇兵诡势,Lv6,Lv5,贾诩,86,48,97,85,57,373,反計,S,B,A,B,A,C
奇兵诡势,Lv5,Lv3,诸葛恪,72,47,90,80,60,349,百出,B,C,A,C,C,B
奇兵诡势,Lv4,Lv2,阚泽,43,49,83,86,73,334,論客,C,C,B,C,B,B
奇兵诡势,Lv3,Lv2,诸葛靓,58,63,66,65,68,320,—,B,B,B,C,B,B
奇兵诡势,Lv2,Lv1,蒯越,47,27,82,88,73,317,能吏,B,C,B,C,C,B
奇兵诡势,Lv1,Lv1,刘晔,36,32,92,73,69,302,射程,C,C,C,C,S,C
厚积骤发,Lv7,Lv7,陆逊,96,69,95,87,90,437,鬼謀,A,S,S,C,A,S
厚积骤发,Lv6,Lv6,司马师,80,64,88,82,78,392,規律,A,B,B,B,C,C
厚积骤发,Lv5,Lv3,诸葛瞻,71,60,70,72,75,348,待伏,B,B,A,B,A,B
厚积骤发,Lv4,Lv2,黄崇,67,63,72,69,62,333,—,C,B,A,C,B,B
厚积骤发,Lv3,Lv2,步阐,71,60,71,64,62,328,—,C,A,B,C,C,A
厚积骤发,Lv2,Lv1,诸葛乔,62,27,75,70,77,311,—,C,C,A,C,A,B
厚积骤发,Lv1,Lv1,司马伷,61,52,61,66,62,302,—,C,C,B,C,C,A
中军主宰,Lv7,Lv6,孙权,76,67,80,89,95,407,指導,B,A,C,C,C,A
中军主宰,Lv6,Lv5,袁绍,81,69,70,73,90,383,名聲,A,C,A,C,S,C
中军主宰,Lv5,Lv3,司马孚,70,37,76,79,85,347,—,B,B,B,C,B,C
中军主宰,Lv4,Lv2,孙静,66,53,72,71,72,334,—,C,C,B,C,B,A
中军主宰,Lv3,Lv2,州泰,71,64,71,64,59,329,—,A,B,B,B,B,C
中军主宰,Lv2,Lv1,毌丘俭,78,74,52,56,54,314,—,A,B,B,A,A,C
中军主宰,Lv1,Lv1,张紘,24,22,86,95,82,309,築城,C,C,C,C,A,B`;

  function parseSoulCsv(text) {
    const lines = text.trim().split(/\r?\n/);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim()) continue;
      const cols = line.split(",");
      if (cols.length < 17) continue;
      const behavior = cols[0];
      const seq = cols[1];
      const titleFromMap = BEHAVIOR_LEVEL_NAMES[behavior]?.[seq] || "";
      rows.push({
        行为: behavior,
        序列等级: seq,
        行为阶名: titleFromMap || "—",
        综合等级: cols[2],
        武将: cols[3],
        统: Number(cols[4]) || 0,
        武: Number(cols[5]) || 0,
        智: Number(cols[6]) || 0,
        政: Number(cols[7]) || 0,
        魅: Number(cols[8]) || 0,
        综: Number(cols[9]) || 0,
        特技: cols[10] || "—",
        槍: cols[11] || "—",
        戟: cols[12] || "—",
        弩: cols[13] || "—",
        騎: cols[14] || "—",
        兵: cols[15] || "—",
        水: cols[16] || "—",
      });
    }
    return rows;
  }

  function buildSoulLookupMap(rows) {
    const map = new Map();
    for (const r of rows) {
      map.set(`${r.行为}|${r.序列等级}`, r);
    }
    return map;
  }

  function fallbackRow(behavior) {
    return {
      行为: behavior,
      序列等级: "Lv1",
      行为阶名: BEHAVIOR_LEVEL_NAMES[behavior]?.Lv1 || "—",
      综合等级: "—",
      武将: "无名校尉",
      统: 0,
      武: 0,
      智: 0,
      政: 0,
      魅: 0,
      综: 0,
      特技: "—",
      槍: "—",
      戟: "—",
      弩: "—",
      騎: "—",
      兵: "—",
      水: "—",
      _fallback: true,
    };
  }

  /**
   * @param {Map<string, any>} map
   * @param {string} behavior
   * @param {number} lvNum 1..7 序列等级
   */
  function lookupSoulRow(map, behavior, lvNum) {
    const m = map || soulMap;
    let L = Math.max(1, Math.min(7, lvNum | 0));
    const start = L;
    while (L >= 1) {
      const key = `${behavior}|Lv${L}`;
      const row = m.get(key);
      if (row) {
        return {
          row,
          resolvedLv: L,
          lookupFailed: L !== start,
          key: [behavior, `Lv${L}`],
        };
      }
      L -= 1;
    }
    return {
      row: fallbackRow(behavior),
      resolvedLv: 1,
      lookupFailed: true,
      key: [behavior, "Lv1"],
    };
  }

  const parsed = parseSoulCsv(GENERAL_SOUL_CSV_TEXT);
  const soulMap = buildSoulLookupMap(parsed);

  window.GeneralSoul105Lookup = {
    parseSoulCsv,
    buildSoulLookupMap,
    lookupSoulRow,
    fallbackRow,
    soulMap,
    rows: parsed,
    BEHAVIOR_LEVEL_NAMES,
  };
})();
