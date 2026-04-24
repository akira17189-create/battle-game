# -*- coding: utf-8 -*-
"""20 次第一章通关战功模拟（与 main.js computeChapterMerit 数值口径一致）。"""
from __future__ import annotations

import random

MERIT_SCORE_SCALE = 10

MERIT_GRADE_RULES_DESC = [
    (90000, "神将"),
    (80000, "飞将"),
    (70000, "名将"),
    (55000, "骁将"),
    (45000, "健将"),
    (40001, "勇将"),
]


def merit_grade(final_score: int) -> str:
    if final_score >= 100000:
        return "天命"
    if final_score <= 40000:
        return "战将"
    for min_score, name in MERIT_GRADE_RULES_DESC:
        if final_score >= min_score:
            return name
    return "战将"


def merit_sum_floor0(logs: list) -> int:
    v = 0
    for r in logs:
        v = max(0, v + int(r.get("turnMeritDelta") or 0))
    return v


def compute_chapter(logs: list, state: dict) -> dict:
    turn_merit_sum = merit_sum_floor0(logs)
    chapter_bonus = 0
    total_turn_count = sum(
        1 for r in logs if r.get("battleId") and not (r.get("meta") or {}).get("victoryRestoration")
    )
    S = MERIT_SCORE_SCALE
    if 0 < total_turn_count <= 35:
        chapter_bonus += 80 * S

    retries = (state.get("meritChapter") or {}).get("retries") or {}
    if sum(retries.values()) == 0:
        chapter_bonus += 100 * S

    boss_turns = [r for r in logs if r.get("battleId") == "BOSS"]
    if boss_turns:
        boss_had_broken = any(
            any(e.get("code") == "self_broken" for e in (r.get("negativeEvents") or []))
            for r in boss_turns
        )
        boss_had_exec = any(
            any(e.get("code") == "boss_execute_taken" for e in (r.get("negativeEvents") or []))
            for r in boss_turns
        )
        rec = (state.get("meritChapter") or {}).get("records", {}).get("BOSS") or {}
        max_hp = int(rec.get("max_hp") or 0)
        win_hp = int(rec.get("win_hp") or 0)
        boss_win_ok = max_hp > 0 and win_hp >= max_hp // 2
        if boss_win_ok and not boss_had_broken and not boss_had_exec:
            chapter_bonus += 120 * S

    exec_count = 0
    for r in logs:
        for e in r.get("positiveEvents") or []:
            if e.get("code") in ("execute_normal", "execute_elite", "execute_boss"):
                exec_count += 1
    if exec_count >= 5:
        chapter_bonus += 60 * S

    prof = state.get("chapterHeroProfile") or {}
    act = prof.get("actions") or {}
    if all((act.get(k) or 0) >= 1 for k in ("attack", "heavy", "defend", "block", "rest")):
        chapter_bonus += 80 * S

    max_mom = 0
    for r in logs:
        if (r.get("meta") or {}).get("victoryRestoration"):
            continue
        m = r.get("momentumAfter")
        if isinstance(m, (int, float)) and not isinstance(m, bool):
            max_mom = max(max_mom, int(m))
    if max_mom >= 4:
        chapter_bonus += 120 * S

    final_merit_score = turn_merit_sum + chapter_bonus
    return {
        "final_merit_score": final_merit_score,
        "turn_merit_sum": turn_merit_sum,
        "chapterBonus": chapter_bonus,
        "grade": merit_grade(final_merit_score),
        "total_turn_count": total_turn_count,
    }


BATTLES = [
    ("B1", 10),
    ("B2", 10),
    ("E1", 10),
    ("B3", 10),
    ("BOSS", 15),
]


def sample_turn_delta(rng: random.Random) -> int:
    u = rng.random()
    base = 180 + int(rng.random() * 3200)
    spike = int(rng.random() * 4000) if u > 0.92 else 0
    return base + spike


def generate_run(rng: random.Random) -> dict:
    logs = []
    exec_tagged = 0
    for bid, limit in BATTLES:
        min_t = 3
        turns = min_t + int(rng.random() * (limit - min_t + 1))
        for _ in range(turns):
            pos = []
            if exec_tagged < 8 and rng.random() > 0.55:
                kinds = (
                    ["execute_boss", "execute_elite", "execute_normal"]
                    if bid == "BOSS"
                    else ["execute_normal"]
                )
                pos.append({"code": kinds[int(rng.random() * len(kinds))], "value": 1})
                exec_tagged += 1
            neg = []
            if bid == "BOSS" and rng.random() < 0.08:
                neg.append({"code": "self_broken", "value": 1})
            if bid == "BOSS" and rng.random() < 0.03:
                neg.append({"code": "boss_execute_taken", "value": 1})
            mom = (
                min(5, 2 + int(rng.random() * 4))
                if rng.random() < 0.35
                else int(rng.random() * 3)
            )
            actions = ["attack", "heavy", "defend", "block", "rest"]
            logs.append(
                {
                    "battleId": bid,
                    "turnMeritDelta": sample_turn_delta(rng),
                    "positiveEvents": pos,
                    "negativeEvents": neg,
                    "momentumAfter": mom,
                    "meta": {"action": actions[int(rng.random() * len(actions))]},
                }
            )
        logs.append(
            {
                "battleId": bid,
                "turnMeritDelta": round(rng.random() * 420),
                "positiveEvents": [],
                "negativeEvents": [],
                "meta": {"victoryRestoration": True},
            }
        )

    state = {
        "chapterMeritLog": logs,
        "meritChapter": {
            "retries": {"B1": 0, "B2": 0, "E1": 0, "B3": 0, "BOSS": 0},
            "records": {
                "BOSS": {"max_hp": 100, "win_hp": 30 if rng.random() < 0.15 else 60}
            },
        },
        "chapterHeroProfile": {
            "actions": (
                {"attack": 1, "heavy": 1, "defend": 1, "block": 1, "rest": 1, "execute": 1}
                if rng.random() < 0.88
                else {"attack": 1, "heavy": 1, "defend": 1, "block": 0, "rest": 1, "execute": 1}
            )
        },
    }
    return compute_chapter(logs, state)


def main():
    seed = 20260418
    rng = random.Random(seed)
    rows = []
    for i in range(1, 21):
        r = generate_run(rng)
        rows.append({"run": i, **r})

    print(f"模拟：第一章通关 × 20（随机种子 {seed}；非真实对战，仅数值口径演示）\n")
    print("| # | 总战功 | 逐回合累计 | 章节加成 | 交手回合 | 档位 |")
    print("|---:|---:|---:|---:|---:|---|")
    for r in rows:
        print(
            f"| {r['run']} | {r['final_merit_score']} | {r['turn_merit_sum']} | "
            f"{r['chapterBonus']} | {r['total_turn_count']} | {r['grade']} |"
        )
    scores = [r["final_merit_score"] for r in rows]
    print()
    print(f"平均 {sum(scores)/len(scores):.1f}｜最低 {min(scores)}｜最高 {max(scores)}")


if __name__ == "__main__":
    main()
