/** 将 general_soul_system_105_dual_levels.csv 写回 general_soul_lookup.js 内嵌表 */
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const csv = fs.readFileSync(path.join(ROOT, "general_soul_system_105_dual_levels.csv"), "utf8");
let js = fs.readFileSync(path.join(ROOT, "general_soul_lookup.js"), "utf8");
const start = js.indexOf("const GENERAL_SOUL_CSV_TEXT = ");
if (start < 0) throw new Error("GENERAL_SOUL_CSV_TEXT not found");
const tick = js.indexOf("`", start);
if (tick < 0) throw new Error("backtick not found");
const endStmt = js.indexOf("`;", tick);
if (endStmt < 0) throw new Error("`; not found");
const replacement = "const GENERAL_SOUL_CSV_TEXT = " + JSON.stringify(csv) + ";";
js = js.slice(0, start) + replacement + js.slice(endStmt + 2);
fs.writeFileSync(path.join(ROOT, "general_soul_lookup.js"), js, "utf8");
console.log("patched general_soul_lookup.js");
