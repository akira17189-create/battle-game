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

  const GENERAL_SOUL_CSV_TEXT = "行为,序列等级,综合等级,武将,统,武,智,政,魅,综,特技,槍,戟,弩,騎,兵,水\n疾袭先登,Lv7,Lv6,赵云,91,96,76,65,81,409,洞察,S,B,S,S,C,B\n疾袭先登,Lv6,Lv6,张辽,93,92,78,58,78,399,威風,S,S,B,S,B,C\n疾袭先登,Lv5,Lv3,孙策,92,92,69,70,92,415,勇將,S,A,B,S,A,S\n疾袭先登,Lv4,Lv2,甘宁,86,94,76,18,58,332,威風,S,A,A,A,S,S\n疾袭先登,Lv3,Lv2,马超,88,97,44,26,82,337,騎神,A,B,C,S,B,C\n疾袭先登,Lv2,Lv2,夏侯渊,89,91,55,46,74,355,急襲,S,B,B,S,B,C\n疾袭先登,Lv1,Lv1,公孙瓒,84,87,58,42,73,344,白馬,S,B,C,S,B,C\n破军重斩,Lv7,Lv7,关羽,95,97,75,62,93,422,神將,S,S,B,A,C,A\n破军重斩,Lv6,Lv5,吕布,95,100,26,13,65,299,飛将,S,S,A,S,C,C\n破军重斩,Lv5,Lv3,典韦,57,95,35,29,58,274,猛者,B,S,C,C,S,C\n破军重斩,Lv4,Lv3,许褚,84,96,36,26,65,307,護衛,S,S,C,C,S,C\n破军重斩,Lv3,Lv2,徐晃,88,90,74,48,71,371,沉著,A,S,B,A,B,C\n破军重斩,Lv2,Lv1,颜良,83,95,45,30,65,318,勇将,S,S,C,B,B,C\n破军重斩,Lv1,Lv1,文丑,81,93,42,28,62,306,勇将,S,S,C,B,B,C\n铁壁守御,Lv7,Lv6,曹仁,90,87,58,46,78,359,堅牢,A,S,B,B,S,C\n铁壁守御,Lv6,Lv5,高顺,85,86,55,46,69,341,攻城,A,B,C,S,S,C\n铁壁守御,Lv5,Lv3,郝昭,89,79,78,62,72,380,不屈,B,S,B,A,S,C\n铁壁守御,Lv4,Lv3,徐盛,85,82,62,51,72,352,水将,A,B,B,C,S,S\n铁壁守御,Lv2,Lv2,程普,84,79,79,74,85,401,名聲,A,A,A,B,B,S\n铁壁守御,Lv3,Lv2,王平,83,79,76,58,51,347,沉著,A,A,S,B,C,C\n铁壁守御,Lv1,Lv2,皇甫嵩,87,61,73,51,72,344,火攻,S,B,A,C,S,C\n反锋夺势,Lv7,Lv7,司马懿,98,63,96,93,87,437,深謀,S,A,A,S,A,C\n反锋夺势,Lv6,Lv6,贾诩,86,48,97,85,57,373,反計,S,B,A,B,A,C\n反锋夺势,Lv5,Lv3,郭嘉,79,48,98,73,81,379,鬼謀,C,B,B,C,B,C\n反锋夺势,Lv4,Lv2,法正,87,73,95,77,71,403,待伏,A,B,B,C,B,B\n反锋夺势,Lv3,Lv2,陈宫,78,51,88,79,68,364,言論,B,C,B,C,A,C\n反锋夺势,Lv2,Lv1,王异,76,62,82,68,73,361,貞義,B,B,B,C,B,C\n反锋夺势,Lv1,Lv1,李典,76,78,70,75,64,363,沈着,A,B,B,C,B,B\n养气持久,Lv7,Lv6,鲁肃,80,56,92,90,89,407,富豪,A,A,A,C,A,A\n养气持久,Lv6,Lv6,廖化,73,76,64,49,66,328,血路,A,A,C,B,C,C\n养气持久,Lv5,Lv3,孟获,76,87,42,45,80,330,亂戰,B,S,C,C,C,C\n养气持久,Lv4,Lv2,祝融夫人,72,85,45,34,70,306,亂戦,B,S,C,C,C,B\n养气持久,Lv3,Lv2,木鹿大王,70,78,45,35,60,288,象兵,B,B,C,C,B,C\n养气持久,Lv2,Lv1,兀突骨,70,88,35,28,52,273,藤甲,B,S,C,C,C,C\n养气持久,Lv1,Lv1,蔡文姬,50,35,82,88,95,350,歌姬,C,C,C,C,C,C\n乘隙收命,Lv7,Lv7,吕蒙,91,81,89,78,82,421,攻心,S,A,B,B,S,S\n乘隙收命,Lv6,Lv5,丁奉,81,80,71,55,56,343,突襲,S,A,B,A,B,S\n乘隙收命,Lv5,Lv4,曹休,74,75,58,56,67,330,射手,B,C,S,A,C,B\n乘隙收命,Lv4,Lv2,黄忠,87,93,60,52,75,367,弓神,S,B,S,B,B,C\n乘隙收命,Lv3,Lv2,马岱,76,82,63,52,68,341,騎将,A,B,B,S,B,C\n乘隙收命,Lv2,Lv1,关平,77,82,68,60,76,363,輔佐,S,A,B,A,C,B\n乘隙收命,Lv1,Lv1,朱然,85,78,71,75,86,395,水将,A,B,B,C,S,S\n连锋成势,Lv7,Lv7,张飞,85,98,36,22,45,286,斗将,S,S,C,B,B,C\n连锋成势,Lv6,Lv5,姜维,90,89,90,67,80,416,反計,S,B,A,S,C,C\n连锋成势,Lv5,Lv3,凌统,77,89,55,40,71,332,掃蕩,B,S,C,A,C,S\n连锋成势,Lv4,Lv2,乐进,80,84,52,51,65,332,攻城,S,B,B,A,S,C\n连锋成势,Lv3,Lv2,曹彰,82,90,40,35,76,323,疾馳,A,B,C,S,B,C\n连锋成势,Lv2,Lv1,魏延,81,92,69,49,45,336,連擊,A,S,B,A,C,C\n连锋成势,Lv1,Lv1,蒋钦,78,84,51,42,74,329,弓將,B,A,S,B,C,S\n死地回天,Lv7,Lv7,夏侯惇,89,90,58,70,81,388,騎將,A,B,C,S,B,C\n死地回天,Lv6,Lv5,黄盖,83,88,66,55,75,367,水将,A,S,B,C,S,S\n死地回天,Lv5,Lv3,周泰,84,91,50,42,72,339,護主,A,S,C,C,S,S\n死地回天,Lv4,Lv3,刘封,75,79,44,50,76,324,槍將,A,C,C,A,A,B\n死地回天,Lv3,Lv2,马腾,82,80,51,59,89,361,繁殖,B,A,C,S,C,C\n死地回天,Lv2,Lv1,韩遂,78,82,52,48,65,325,西凉,A,B,B,S,B,C\n死地回天,Lv1,Lv1,关兴,76,83,58,48,70,335,弓将,A,B,B,B,B,C\n乱阵周旋,Lv7,Lv7,太史慈,82,93,66,58,79,378,戟神,A,S,C,S,C,B\n乱阵周旋,Lv6,Lv5,韩当,76,85,56,51,68,336,水將,A,B,B,A,C,S\n乱阵周旋,Lv5,Lv3,朱桓,82,85,65,60,71,363,築城,A,S,B,C,B,S\n乱阵周旋,Lv4,Lv2,严颜,80,86,65,48,62,341,老将,A,S,B,C,B,C\n乱阵周旋,Lv3,Lv2,张苞,75,87,48,46,68,324,掃蕩,S,A,B,A,C,C\n乱阵周旋,Lv2,Lv1,张绣,77,90,45,42,68,322,猛将,A,S,C,S,B,C\n乱阵周旋,Lv1,Lv1,文聘,84,82,65,55,70,356,堅守,A,B,B,B,B,S\n血战压命,Lv7,Lv7,孙坚,93,90,74,73,91,421,驅逐,S,S,C,A,C,S\n血战压命,Lv6,Lv4,庞德,82,94,45,35,70,326,死斗,A,S,B,S,B,C\n血战压命,Lv5,Lv3,华雄,79,92,42,32,62,307,猛将,A,S,C,B,B,C\n血战压命,Lv4,Lv3,董卓,82,86,55,40,58,321,暴君,A,S,C,B,B,C\n血战压命,Lv3,Lv2,曹洪,84,84,52,48,70,338,援護,A,S,C,B,B,C\n血战压命,Lv2,Lv1,何进,55,45,38,62,72,272,外戚,B,C,C,C,B,C\n血战压命,Lv1,Lv1,张梁,72,85,52,40,58,307,黄巾,A,S,C,C,B,C\n不伤而胜,Lv7,Lv7,诸葛亮,92,38,100,95,92,417,神算,B,B,S,C,S,A\n不伤而胜,Lv6,Lv6,周瑜,97,71,96,86,93,443,火神,A,A,S,C,C,S\n不伤而胜,Lv5,Lv3,陆逊,96,69,95,87,90,437,鬼謀,A,S,S,C,A,S\n不伤而胜,Lv4,Lv3,徐庶,86,62,93,81,90,412,沈黙,A,B,B,C,B,C\n不伤而胜,Lv3,Lv2,黄月英,65,45,90,88,85,373,工神,C,B,S,C,B,B\n不伤而胜,Lv2,Lv1,甄姬,45,25,75,70,90,305,傾国,C,C,B,C,C,C\n不伤而胜,Lv1,Lv1,满宠,84,64,82,84,80,394,輔佐,C,S,A,C,A,C\n持局定军,Lv7,Lv7,曹操,96,72,91,94,96,449,虛實,S,S,A,A,B,C\n持局定军,Lv6,Lv5,孙权,76,67,80,89,95,407,指導,B,A,C,C,C,A\n持局定军,Lv5,Lv3,曹真,87,74,68,72,88,389,精妙,A,B,B,S,C,C\n持局定军,Lv4,Lv2,陆抗,92,86,90,88,89,445,規律,A,S,B,C,S,S\n持局定军,Lv3,Lv2,刘备,75,73,74,78,99,399,遁走,A,B,A,B,C,C\n持局定军,Lv2,Lv1,袁绍,81,69,70,73,90,383,名聲,A,C,A,C,S,C\n持局定军,Lv1,Lv1,袁术,62,70,68,72,75,347,名門,B,B,B,C,B,C\n奇兵诡势,Lv7,Lv7,庞统,78,35,97,80,62,352,連環,B,B,S,C,B,C\n奇兵诡势,Lv6,Lv5,左慈,22,35,94,86,93,330,妖術,C,C,C,C,C,C\n奇兵诡势,Lv5,Lv3,于吉,18,25,92,78,95,308,幻術,C,C,C,C,C,C\n奇兵诡势,Lv4,Lv2,张角,25,25,86,80,98,314,太平,C,C,B,C,B,C\n奇兵诡势,Lv3,Lv2,张宝,35,45,75,70,72,297,妖術,B,B,B,C,B,C\n奇兵诡势,Lv2,Lv1,貂蝉,55,25,80,75,95,330,傾国,C,C,B,C,C,C\n奇兵诡势,Lv1,Lv1,王允,58,25,87,92,78,340,言論,C,C,B,C,B,C\n厚积骤发,Lv7,Lv7,邓艾,94,87,89,81,70,421,強行,S,A,A,A,S,C\n厚积骤发,Lv6,Lv6,钟会,90,75,90,82,70,407,野心,A,B,B,B,A,C\n厚积骤发,Lv5,Lv3,司马师,80,64,88,82,78,392,規律,A,B,B,B,C,C\n厚积骤发,Lv4,Lv2,司马昭,90,71,89,86,83,419,規律,A,B,B,B,A,C\n厚积骤发,Lv3,Lv2,诸葛瞻,71,60,70,72,75,348,待伏,B,B,A,B,A,B\n厚积骤发,Lv2,Lv1,马谡,76,56,92,68,75,367,待伏,B,B,B,C,B,B\n厚积骤发,Lv1,Lv1,曹植,25,22,85,90,90,312,詩想,C,C,C,C,C,C\n中军主宰,Lv7,Lv6,曹丕,82,65,85,86,88,406,詩想,A,B,B,C,B,C\n中军主宰,Lv6,Lv5,司马炎,82,68,92,90,88,420,晋武,A,B,B,B,A,C\n中军主宰,Lv5,Lv3,荀彧,97,15,95,98,94,399,王佐,C,C,B,C,B,C\n中军主宰,Lv4,Lv2,程昱,70,49,90,79,58,346,掎角,A,C,C,C,A,C\n中军主宰,Lv3,Lv2,刘禅,35,38,42,78,90,283,強運,C,C,C,C,C,C\n中军主宰,Lv2,Lv1,于禁,84,76,58,52,65,335,規律,A,B,B,B,S,C\n中军主宰,Lv1,Lv1,张郃,90,89,69,57,71,376,昂揚,A,B,C,S,A,C\n";

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

  /**
   * 武魂展示用：武将名 → wei | shu | wu | qun（与常见三国题材阵营一致；非表内或跨时代名将默认 qun）。
   * @type {Record<string, "wei"|"shu"|"wu"|"qun">}
   */
  const HERO_SOUL_FACTION = {
    赵云: "shu",
    张辽: "wei",
    孙策: "wu",
    甘宁: "wu",
    马超: "shu",
    夏侯渊: "wei",
    公孙瓒: "qun",
    关羽: "shu",
    吕布: "qun",
    典韦: "wei",
    许褚: "wei",
    徐晃: "wei",
    颜良: "qun",
    文丑: "qun",
    曹仁: "wei",
    高顺: "qun",
    郝昭: "wei",
    徐盛: "wu",
    程普: "wu",
    王平: "shu",
    皇甫嵩: "qun",
    司马懿: "wei",
    贾诩: "wei",
    郭嘉: "wei",
    法正: "shu",
    陈宫: "qun",
    王异: "wei",
    李典: "wei",
    鲁肃: "wu",
    廖化: "shu",
    孟获: "shu",
    祝融夫人: "shu",
    木鹿大王: "qun",
    兀突骨: "qun",
    蔡文姬: "wei",
    吕蒙: "wu",
    丁奉: "wu",
    曹休: "wei",
    黄忠: "shu",
    马岱: "shu",
    关平: "shu",
    朱然: "wu",
    张飞: "shu",
    姜维: "shu",
    凌统: "wu",
    乐进: "wei",
    曹彰: "wei",
    魏延: "shu",
    蒋钦: "wu",
    夏侯惇: "wei",
    黄盖: "wu",
    周泰: "wu",
    刘封: "shu",
    马腾: "qun",
    韩遂: "qun",
    关兴: "shu",
    太史慈: "wu",
    韩当: "wu",
    朱桓: "wu",
    严颜: "shu",
    张苞: "shu",
    张绣: "qun",
    文聘: "wei",
    孙坚: "wu",
    庞德: "wei",
    华雄: "qun",
    董卓: "qun",
    曹洪: "wei",
    何进: "qun",
    张梁: "qun",
    诸葛亮: "shu",
    周瑜: "wu",
    陆逊: "wu",
    徐庶: "shu",
    黄月英: "shu",
    甄姬: "wei",
    满宠: "wei",
    曹操: "wei",
    孙权: "wu",
    曹真: "wei",
    陆抗: "wu",
    刘备: "shu",
    袁绍: "qun",
    袁术: "qun",
    庞统: "shu",
    左慈: "qun",
    于吉: "qun",
    张角: "qun",
    张宝: "qun",
    貂蝉: "qun",
    王允: "qun",
    邓艾: "wei",
    钟会: "wei",
    司马师: "wei",
    司马昭: "wei",
    诸葛瞻: "shu",
    马谡: "shu",
    曹植: "wei",
    曹丕: "wei",
    司马炎: "wei",
    荀彧: "wei",
    程昱: "wei",
    刘禅: "shu",
    于禁: "wei",
    张郃: "wei",
  };

  /** 天命之魂 15 人（与 general_soul_scoring.js BEHAVIOR_TO_DESTINY_SOUL 一致），展示用红色 */
  const TIANMING_SOUL_NAMES = new Set([
    "霍去病",
    "项羽",
    "岳飞",
    "孙膑",
    "勾践",
    "白起",
    "卫青",
    "韩信",
    "李靖",
    "吴起",
    "孙武",
    "姜子牙",
    "张良",
    "刘邦",
    "李世民",
  ]);

  /**
   * @param {string} [heroName]
   * @returns {"wei"|"shu"|"wu"|"qun"|"tianming"}
   */
  function soulHeroFactionKey(heroName) {
    const n = heroName != null ? String(heroName).trim() : "";
    if (!n) return "qun";
    if (TIANMING_SOUL_NAMES.has(n)) return "tianming";
    return HERO_SOUL_FACTION[n] || "qun";
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
    HERO_SOUL_FACTION,
    soulHeroFactionKey,
  };
})();
