/**
 * 在线排行榜模块 — 基于 Supabase REST API
 * 依赖 supabase-config.js 中的 SUPABASE_URL 和 SUPABASE_ANON_KEY
 */

const OnlineLeaderboard = (() => {
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

  /** 构造请求头（新版 publishable key 只用 apikey header，不放 Authorization） */
  function headers(extra) {
    return {
      apikey: SUPABASE_ANON_KEY,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
      ...extra,
    };
  }

  /**
   * 拉取在线排行榜（前 limit 条，按 final_merit 降序）
   * @param {number} limit 默认 30
   * @returns {Promise<Array|null>} 成功返回数组，失败返回 null
   */
  async function fetchLeaderboard(limit = 30) {
    if (!isConfigured()) return null;
    try {
      const url = `${SUPABASE_URL}/rest/v1/leaderboard?select=name,final_merit,grade,run_sum,retries,created_at&order=final_merit.desc&limit=${limit}`;
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
        name: (record.name || "无名侠客").slice(0, 12),
        final_merit: record.finalMerit || 0,
        grade: record.grade || "",
        run_sum: record.runSum || 0,
        retries: record.retries || 0,
      };
      const res = await fetch(url, {
        method: "POST",
        headers: headers(),
        body: JSON.stringify(body),
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  return { isConfigured, fetchLeaderboard, submitScore };
})();
