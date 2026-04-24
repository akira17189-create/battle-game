/**
 * 在线排行榜模块 — 基于 Supabase REST API
 * 依赖 supabase-config.js 中的 SUPABASE_URL 和 SUPABASE_ANON_KEY
 */

const OnlineLeaderboard = (() => {
  /** 缓存玩家地区信息 */
  let _geoCache = null;
  let _geoFetching = false;

  /** 英文省份→中文映射 */
  const PROVINCE_ZH = {
    "Beijing":"北京","Shanghai":"上海","Tianjin":"天津","Chongqing":"重庆",
    "Guangdong":"广东","Zhejiang":"浙江","Jiangsu":"江苏","Shandong":"山东",
    "Henan":"河南","Hebei":"河北","Sichuan":"四川","Hunan":"湖南","Hubei":"湖北",
    "Fujian":"福建","Anhui":"安徽","Jiangxi":"江西","Shanxi":"山西","Shaanxi":"陕西",
    "Liaoning":"辽宁","Jilin":"吉林","Heilongjiang":"黑龙江","Yunnan":"云南",
    "Guizhou":"贵州","Gansu":"甘肃","Qinghai":"青海","Hainan":"海南",
    "Guangxi":"广西","Inner Mongolia":"内蒙古","Tibet":"西藏","Xinjiang":"新疆",
    "Ningxia":"宁夏","Hong Kong":"香港","Macau":"澳门","Taiwan":"台湾",
  };
  /** 英文城市→中文映射（主要城市） */
  const CITY_ZH = {
    "Beijing":"北京","Shanghai":"上海","Guangzhou":"广州","Shenzhen":"深圳",
    "Chengdu":"成都","Hangzhou":"杭州","Wuhan":"武汉","Chongqing":"重庆",
    "Nanjing":"南京","Tianjin":"天津","Suzhou":"苏州","Xi'an":"西安",
    "Zhengzhou":"郑州","Changsha":"长沙","Dongguan":"东莞","Qingdao":"青岛",
    "Shenyang":"沈阳","Ningbo":"宁波","Kunming":"昆明","Dalian":"大连",
    "Xiamen":"厦门","Fuzhou":"福州","Hefei":"合肥","Jinan":"济南",
    "Wenzhou":"温州","Foshan":"佛山","Nanning":"南宁","Changchun":"长春",
    "Harbin":"哈尔滨","Shijiazhuang":"石家庄","Guiyang":"贵阳","Nanchang":"南昌",
    "Lanzhou":"兰州","Wuxi":"无锡","Zhuhai":"珠海","Huizhou":"惠州",
    "Zhongshan":"中山","Taiyuan":"太原","Urumqi":"乌鲁木齐","Hohhot":"呼和浩特",
    "Lhasa":"拉萨","Xining":"西宁","Yinchuan":"银川","Haikou":"海口",
    "Hong Kong":"香港","Macau":"澳门","Taipei":"台北",
  };
  function toZh(eng, map) { return map[eng] || eng; }

  /** 检查 Supabase 是否已配置 */
  function isConfigured() {
    return (
      typeof SUPABASE_URL === "string" &&
      SUPABASE_URL !== "YOUR_SUPABASE_URL" &&
      SUPABASE_URL.startsWith("http") &&
      typeof SUPABASE_ANON_KEY === "string" &&
      SUPABASE_ANON_KEY !== "YOUR_SUPABASE_ANON_KEY"
    );
  }

  /** 构造请求头 */
  function headers(extra) {
    return {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      "Content-Type": "application/json",
      ...extra,
    };
  }

  /**
   * 获取玩家地区信息（省份+城市），结果缓存
   * @returns {Promise<{province: string, city: string}>}
   */
  async function fetchGeo() {
    if (_geoCache) return _geoCache;
    if (_geoFetching) return { province: "", city: "" };
    _geoFetching = true;
    try {
      // 优先用 HTTPS 兼容的 API（GitHub Pages 等 HTTPS 站点需要）
      const res = await fetch("https://ipwho.is/?lang=zh-CN");
      if (res.ok) {
        const data = await res.json();
        if (data.success !== false) {
          _geoCache = {
            province: toZh(data.region || "", PROVINCE_ZH),
            city: toZh(data.city || "", CITY_ZH),
          };
          return _geoCache;
        }
      }
    } catch {
      /* 网络异常忽略 */
    } finally {
      _geoFetching = false;
    }
    return { province: "", city: "" };
  }

  /**
   * 拉取在线排行榜（前 limit 条，按 final_merit 降序）
   * @param {number} limit 默认 30
   * @returns {Promise<Array|null>} 成功返回数组，失败返回 null
   */
  async function fetchLeaderboard(limit = 30) {
    if (!isConfigured()) return null;
    try {
      const url = `${SUPABASE_URL}/rest/v1/leaderboard?select=name,final_merit,grade,run_sum,retries,province,city,hero_name,created_at&order=final_merit.desc,created_at.asc&limit=${limit}`;
      const res = await fetch(url, { headers: headers() });
      if (!res.ok) return null;
      const data = await res.json();
      // 转为与本地排行榜一致的格式
      return data.map((row) => ({
        name: row.name || "无名侠客",
        at: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
        finalMerit: row.final_merit,
        grade: row.grade,
        runSum: row.run_sum,
        retries: row.retries,
        province: row.province || "",
        city: row.city || "",
        heroName: row.hero_name || "",
      }));
    } catch {
      return null;
    }
  }

  /**
   * 提交一条成绩到在线排行榜
   * @param {object} record { name, finalMerit, grade, runSum, retries }
   * @returns {Promise<boolean>} 是否成功
   */
  async function submitScore(record) {
    if (!isConfigured()) return false;
    try {
      const url = `${SUPABASE_URL}/rest/v1/leaderboard`;
      const body = {
        name: String(record.name || "无名侠客").slice(0, 24),
        final_merit: record.finalMerit || 0,
        grade: record.grade || "",
        run_sum: record.runSum || 0,
        retries: record.retries || 0,
        province: "",
        city: "",
        hero_name: String(record.heroName || "").trim().slice(0, 24),
      };
      const res = await fetch(url, {
        method: "POST",
        headers: headers({ Prefer: "return=minimal" }),
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  /**
   * 导出在线排行榜为 JSON 并下载
   * @returns {Promise<boolean>} 是否成功
   */
  async function backupLeaderboard() {
    if (!isConfigured()) return false;
    try {
      const url = `${SUPABASE_URL}/rest/v1/leaderboard?select=*&order=final_merit.desc,created_at.asc`;
      const res = await fetch(url, { headers: headers() });
      if (!res.ok) return false;
      const data = await res.json();
      const now = new Date();
      const ts = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}_${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `leaderboard_backup_${ts}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 清空在线排行榜所有记录
   * @returns {Promise<boolean>} 是否成功
   */
  async function clearLeaderboard() {
    if (!isConfigured()) return false;
    try {
      // 删除所有 id > 0 的记录（即全部）
      const url = `${SUPABASE_URL}/rest/v1/leaderboard?id=gt.0`;
      const res = await fetch(url, {
        method: "DELETE",
        headers: headers(),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  return { isConfigured, fetchLeaderboard, submitScore, fetchGeo, backupLeaderboard, clearLeaderboard };
})();
