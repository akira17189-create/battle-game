# 战斗game 在线部署指南

## 一、设置在线排行榜（Supabase）

### 1. 注册 Supabase
前往 https://supabase.com 注册账号，创建一个新项目（Region 选离你近的）。

### 2. 创建排行榜数据表
在 Supabase 控制台，点击左侧 **SQL Editor**，粘贴以下 SQL 并运行：

```sql
CREATE TABLE leaderboard (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL DEFAULT '无名侠客',
  final_merit integer NOT NULL DEFAULT 0,
  grade text,
  run_sum integer DEFAULT 0,
  retries integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- 按战功降序索引，加速排行查询
CREATE INDEX idx_leaderboard_merit ON leaderboard (final_merit DESC);

-- 开启行级安全策略
ALTER TABLE leaderboard ENABLE ROW LEVEL SECURITY;

-- 允许所有人读取排行榜
CREATE POLICY "Anyone can read leaderboard"
  ON leaderboard FOR SELECT
  USING (true);

-- 允许所有人提交成绩
CREATE POLICY "Anyone can submit score"
  ON leaderboard FOR INSERT
  WITH CHECK (true);
```

### 3. 获取 API 配置
在 Supabase 控制台：**Settings** > **API**，找到：
- **Project URL**（形如 `https://xxxxx.supabase.co`）
- **anon public key**（一长串字符）

### 4. 填入配置
打开项目中的 `supabase-config.js`，将两个值替换为你的：
```js
const SUPABASE_URL = "https://你的项目ID.supabase.co";
const SUPABASE_ANON_KEY = "你的anon_key";
```

> 注意：anon key 是公开的，设计上就是给前端用的，不是密钥。数据安全由上面的 RLS 策略保证。

---

## 二、部署到 GitHub Pages

### 1. 创建 GitHub 仓库
- 前往 https://github.com/new
- 仓库名随意，比如 `battle-game`
- 选 Public（GitHub Pages 免费版需要公开仓库）

### 2. 推送代码
在项目目录下执行：
```bash
git init
git add .
git commit -m "初始提交"
git branch -M main
git remote add origin https://github.com/你的用户名/battle-game.git
git push -u origin main
```

### 3. 开启 GitHub Pages
- 进入仓库页面 > **Settings** > **Pages**
- Source 选 **Deploy from a branch**
- Branch 选 `main`，目录选 `/ (root)`
- 点 Save

### 4. 访问你的游戏
几分钟后，你的游戏就可以通过以下网址访问了：
```
https://你的用户名.github.io/battle-game/
```

---

## 三、持续更新

每次修改代码后，只需：
```bash
git add .
git commit -m "更新说明"
git push
```
GitHub Pages 会自动重新部署，通常 1-2 分钟内生效。

---

## 四、注意事项

- 如果没有配置 Supabase（或者网络不通），游戏会自动降级为本地排行榜，不影响游戏体验
- Supabase 免费版每月有 50,000 次请求和 500MB 数据库，对于排行榜完全够用
- 如需自定义域名，GitHub Pages 支持绑定自己的域名（Settings > Pages > Custom domain）
