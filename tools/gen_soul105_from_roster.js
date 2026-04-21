/**
 * 根据「按行为分组」名册重算 general_soul_system_105*.csv
 * 运行: node tools/gen_soul105_from_roster.js
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");

const ROSTER = {
  疾袭先登: ["赵云", "张辽", "孙策", "甘宁", "马超", "夏侯渊", "公孙瓒"],
  破军重斩: ["关羽", "吕布", "典韦", "许褚", "徐晃", "颜良", "文丑"],
  铁壁守御: ["曹仁", "高顺", "郝昭", "徐盛", "王平", "程普", "皇甫嵩"],
  反锋夺势: ["司马懿", "贾诩", "郭嘉", "法正", "陈宫", "王异", "李典"],
  养气持久: ["鲁肃", "廖化", "孟获", "祝融夫人", "木鹿大王", "兀突骨", "蔡文姬"],
  乘隙收命: ["吕蒙", "丁奉", "曹休", "黄忠", "马岱", "关平", "朱然"],
  连锋成势: ["张飞", "姜维", "凌统", "乐进", "曹彰", "魏延", "蒋钦"],
  死地回天: ["夏侯惇", "黄盖", "周泰", "刘封", "马腾", "韩遂", "关兴"],
  乱阵周旋: ["太史慈", "韩当", "朱桓", "严颜", "张苞", "张绣", "文聘"],
  血战压命: ["孙坚", "庞德", "华雄", "董卓", "曹洪", "何进", "张梁"],
  不伤而胜: ["诸葛亮", "周瑜", "陆逊", "徐庶", "黄月英", "甄姬", "满宠"],
  持局定军: ["曹操", "孙权", "曹真", "陆抗", "刘备", "袁绍", "袁术"],
  奇兵诡势: ["庞统", "左慈", "于吉", "张角", "张宝", "貂蝉", "王允"],
  厚积骤发: ["邓艾", "钟会", "司马师", "司马昭", "诸葛瞻", "马谡", "曹植"],
  中军主宰: ["曹丕", "司马炎", "荀彧", "程昱", "刘禅", "于禁", "张郃"],
};

/** 旧表无此人时：五维+特技+兵科（综=五维之和，与旧表口径一致） */
const EXTRA = {
  夏侯渊: [89, 91, 55, 46, 74, "急襲", "S", "B", "B", "S", "B", "C"],
  公孙瓒: [84, 87, 58, 42, 73, "白馬", "S", "B", "C", "S", "B", "C"],
  吕布: [95, 100, 26, 13, 65, "飛将", "S", "S", "A", "S", "C", "C"],
  典韦: [57, 95, 35, 29, 58, "猛者", "B", "S", "C", "C", "S", "C"],
  许褚: [84, 96, 36, 26, 65, "護衛", "S", "S", "C", "C", "S", "C"],
  颜良: [83, 95, 45, 30, 65, "勇将", "S", "S", "C", "B", "B", "C"],
  文丑: [81, 93, 42, 28, 62, "勇将", "S", "S", "C", "B", "B", "C"],
  曹仁: [90, 87, 58, 46, 78, "堅牢", "A", "S", "B", "B", "S", "C"],
  徐盛: [85, 82, 62, 51, 72, "水将", "A", "B", "B", "C", "S", "S"],
  皇甫嵩: [87, 61, 73, 51, 72, "火攻", "S", "B", "A", "C", "S", "C"],
  郭嘉: [79, 48, 98, 73, 81, "鬼謀", "C", "B", "B", "C", "B", "C"],
  法正: [87, 73, 95, 77, 71, "待伏", "A", "B", "B", "C", "B", "B"],
  陈宫: [78, 51, 88, 79, 68, "言論", "B", "C", "B", "C", "A", "C"],
  王异: [76, 62, 82, 68, 73, "貞義", "B", "B", "B", "C", "B", "C"],
  李典: [76, 78, 70, 75, 64, "沈着", "A", "B", "B", "C", "B", "B"],
  祝融夫人: [72, 85, 45, 34, 70, "亂戦", "B", "S", "C", "C", "C", "B"],
  木鹿大王: [70, 78, 45, 35, 60, "象兵", "B", "B", "C", "C", "B", "C"],
  兀突骨: [70, 88, 35, 28, 52, "藤甲", "B", "S", "C", "C", "C", "C"],
  蔡文姬: [50, 35, 82, 88, 95, "歌姬", "C", "C", "C", "C", "C", "C"],
  黄忠: [87, 93, 60, 52, 75, "弓神", "S", "B", "S", "B", "B", "C"],
  马岱: [76, 82, 63, 52, 68, "騎将", "A", "B", "B", "S", "B", "C"],
  朱然: [85, 78, 71, 75, 86, "水将", "A", "B", "B", "C", "S", "S"],
  张飞: [85, 98, 36, 22, 45, "斗将", "S", "S", "C", "B", "B", "C"],
  黄盖: [83, 88, 66, 55, 75, "水将", "A", "S", "B", "C", "S", "S"],
  周泰: [84, 91, 50, 42, 72, "護主", "A", "S", "C", "C", "S", "S"],
  韩遂: [78, 82, 52, 48, 65, "西凉", "A", "B", "B", "S", "B", "C"],
  关兴: [76, 83, 58, 48, 70, "弓将", "A", "B", "B", "B", "B", "C"],
  朱桓: [82, 85, 65, 60, 71, "築城", "A", "S", "B", "C", "B", "S"],
  严颜: [80, 86, 65, 48, 62, "老将", "A", "S", "B", "C", "B", "C"],
  张绣: [77, 90, 45, 42, 68, "猛将", "A", "S", "C", "S", "B", "C"],
  文聘: [84, 82, 65, 55, 70, "堅守", "A", "B", "B", "B", "B", "S"],
  庞德: [82, 94, 45, 35, 70, "死斗", "A", "S", "B", "S", "B", "C"],
  华雄: [79, 92, 42, 32, 62, "猛将", "A", "S", "C", "B", "B", "C"],
  董卓: [82, 86, 55, 40, 58, "暴君", "A", "S", "C", "B", "B", "C"],
  何进: [55, 45, 38, 62, 72, "外戚", "B", "C", "C", "C", "B", "C"],
  张梁: [72, 85, 52, 40, 58, "黄巾", "A", "S", "C", "C", "B", "C"],
  陆逊: [96, 69, 95, 87, 90, "鬼謀", "A", "S", "S", "C", "A", "S"],
  徐庶: [86, 62, 93, 81, 90, "沈黙", "A", "B", "B", "C", "B", "C"],
  黄月英: [65, 45, 90, 88, 85, "工神", "C", "B", "S", "C", "B", "B"],
  甄姬: [45, 25, 75, 70, 90, "傾国", "C", "C", "B", "C", "C", "C"],
  陆抗: [92, 86, 90, 88, 89, "規律", "A", "S", "B", "C", "S", "S"],
  袁术: [62, 70, 68, 72, 75, "名門", "B", "B", "B", "C", "B", "C"],
  庞统: [78, 35, 97, 80, 62, "連環", "B", "B", "S", "C", "B", "C"],
  左慈: [22, 35, 94, 86, 93, "妖術", "C", "C", "C", "C", "C", "C"],
  于吉: [18, 25, 92, 78, 95, "幻術", "C", "C", "C", "C", "C", "C"],
  张角: [25, 25, 86, 80, 98, "太平", "C", "C", "B", "C", "B", "C"],
  张宝: [35, 45, 75, 70, 72, "妖術", "B", "B", "B", "C", "B", "C"],
  貂蝉: [55, 25, 80, 75, 95, "傾国", "C", "C", "B", "C", "C", "C"],
  王允: [58, 25, 87, 92, 78, "言論", "C", "C", "B", "C", "B", "C"],
  钟会: [90, 75, 90, 82, 70, "野心", "A", "B", "B", "B", "A", "C"],
  司马昭: [90, 71, 89, 86, 83, "規律", "A", "B", "B", "B", "A", "C"],
  马谡: [76, 56, 92, 68, 75, "待伏", "B", "B", "B", "C", "B", "B"],
  曹植: [25, 22, 85, 90, 90, "詩想", "C", "C", "C", "C", "C", "C"],
  曹丕: [82, 65, 85, 86, 88, "詩想", "A", "B", "B", "C", "B", "C"],
  司马炎: [82, 68, 92, 90, 88, "晋武", "A", "B", "B", "B", "A", "C"],
  荀彧: [97, 15, 95, 98, 94, "王佐", "C", "C", "B", "C", "B", "C"],
  刘禅: [35, 38, 42, 78, 90, "強運", "C", "C", "C", "C", "C", "C"],
  曹洪: [84, 84, 52, 48, 70, "援護", "A", "S", "C", "B", "B", "C"],
  于禁: [84, 76, 58, 52, 65, "規律", "A", "B", "B", "B", "S", "C"],
};

function parse105Master(text) {
  const lines = text.trim().split(/\r?\n/);
  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const cols = line.split(",");
    const name = cols[2];
    map.set(name, cols.slice(3).join(","));
  }
  return map;
}

function tailForName(name, baseMap) {
  if (baseMap.has(name)) return baseMap.get(name);
  const ex = EXTRA[name];
  if (!ex) throw new Error(`No stats for 「${name}」 — add to EXTRA`);
  const [t, w, z, zh, m, skill, ...apt] = ex;
  const sum = t + w + z + zh + m;
  return `${t},${w},${z},${zh},${m},${sum},${skill},${apt.join(",")}`;
}

function main() {
  const masterPath = path.join(ROOT, "general_soul_system_105.csv");
  const namedPath = path.join(ROOT, "general_soul_system_105_named_levels.csv");
  const oldMaster = fs.readFileSync(masterPath, "utf8");
  const baseMap = parse105Master(oldMaster);

  const out105 = ["行为,Lv,武将,统,武,智,政,魅,综,特技,槍,戟,弩,騎,兵,水"];
  for (const [behavior, names] of Object.entries(ROSTER)) {
    names.forEach((name, i) => {
      const lv = 7 - i;
      const Lv = `Lv${lv}`;
      const tail = tailForName(name, baseMap);
      out105.push(`${behavior},${Lv},${name},${tail}`);
    });
  }
  fs.writeFileSync(masterPath, out105.join("\n") + "\n", "utf8");

  const namedLines = fs.readFileSync(namedPath, "utf8").trim().split(/\r?\n/);
  const hdr = namedLines[0];
  const outNamed = [hdr];
  const outDual = ["行为,序列等级,综合等级,武将,统,武,智,政,魅,综,特技,槍,戟,弩,騎,兵,水"];

  for (let i = 1; i < namedLines.length; i++) {
    const line = namedLines[i];
    if (!line.trim()) continue;
    const cols = line.split(",");
    const behavior = cols[0];
    const seq = cols[1];
    const jie = cols[2];
    const zongLv = cols[3];
    const lvNum = parseInt(seq.replace("Lv", ""), 10);
    const names = ROSTER[behavior];
    if (!names) {
      outNamed.push(line);
      continue;
    }
    const idx = 7 - lvNum;
    const name = names[idx];
    const tail = tailForName(name, baseMap);
    outNamed.push([behavior, seq, jie, zongLv, name, tail.split(",").join(",")].join(","));
    outDual.push([behavior, seq, zongLv, name, tail.split(",").join(",")].join(","));
  }
  fs.writeFileSync(namedPath, outNamed.join("\n") + "\n", "utf8");
  fs.writeFileSync(path.join(ROOT, "general_soul_system_105_dual_levels.csv"), outDual.join("\n") + "\n", "utf8");

  console.log("OK: wrote general_soul_system_105.csv, _named_levels, _dual_levels");
}

main();
