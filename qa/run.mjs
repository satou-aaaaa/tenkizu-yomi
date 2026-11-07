// 天気図よみの検査。風と気圧の決まり（北半球の向き）・問題の作り方（何千問、答えを計算し直す）・5問の組み方・答える・続きから・上級・記録・スマホ幅・PWA。
// 使い方: node qa/run.mjs   失敗があれば終了コード 1。結果は qa-report/report.md。
import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import path from "node:path";
import { checkTransfer } from "./transfer-check.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const url = pathToFileURL(path.join(root, "index.html")).href;
const results = [];
const check = (name, ok, detail = "") => results.push({ name, ok: !!ok, detail });
const T = createRequire(import.meta.url)(path.join(root, "gen.js"));
const G = T;

// 1. 風と気圧の決まり（気象庁などの説明と同じ向きになるか）
{
  const H = { centers: [{ k: "H", x: 300, y: 300, a: 20, s: 150 }], fronts: [] }, L = { centers: [{ k: "L", x: 300, y: 300, a: -20, s: 150 }], fronts: [] };
  const w = (m, x, y) => G.wind(m, x, y).from;
  check("高気圧のまわりは時計回りに吹き出す（東側で北西の風・北側で南西・西側で南東・南側で北東）", w(H, 400, 300) === "北西" && w(H, 300, 200) === "南西" && w(H, 200, 300) === "南東" && w(H, 300, 400) === "北東");
  check("低気圧のまわりは反時計回りに吹き込む（東側で南東の風・北側で北東・西側で北西・南側で南西）", w(L, 400, 300) === "南東" && w(L, 300, 200) === "北東" && w(L, 200, 300) === "北西" && w(L, 300, 400) === "南西");
  { const m = G.makeMap(G.rng(1), "冬"), t = G.city("東京"), n = G.city("新潟"); check("冬型（西高東低）では北寄り・西寄りの風（東京・新潟）", ["北", "北西", "西"].includes(G.wind(m, t[1], t[2]).from) && ["北", "北西", "西"].includes(G.wind(m, n[1], n[2]).from)); }
  { const m = { centers: [{ k: "L", x: 300, y: 300, a: -20, s: 100 }], fronts: [] }; check("等圧線がこんでいる所（中心に近い所）ほど風が強い", G.wind(m, 380, 300).speed > G.wind(m, 600, 300).speed * 2); }
  check("冬の日本海側と太平洋側の地点は、地図にある県", [...G.SEA_J, ...G.SEA_P].every((n) => G.city(n)));
}
// 2. 問題の作り方（ブラウザを使わない）
{
  const bad = [], same = [], cnt = {};
  for (let d = 0; d < 1500; d++) for (const [t, h] of [["season", 0], ["strong", 0], ["wind", 0], ["wind", 1], ["weather", 0]]) {
    const seed = G.seedOf(`qa${d}:${t}`), q = G.makeQ(seed, t, !!h), q2 = G.makeQ(seed, t, !!h);
    if (!q) { bad.push(`${d}:${t} 作れない`); continue; }
    if (JSON.stringify(q) !== JSON.stringify(q2)) same.push(`${d}:${t}`);
    if (!q.choices.includes(q.ans) || new Set(q.choices).size !== q.choices.length) bad.push(`${d}:${t} 選択肢`);
    const n = { season: 4, strong: 2, wind: h ? 8 : 4, weather: q.map.season === "冬" ? 3 : 2 }[t]; if (q.choices.length !== n) bad.push(`${d}:${t} 数`);
    if (t === "season" && q.ans !== q.map.season) bad.push(`${d}:${t} 季節`);
    if (t === "strong") { const sp = q.choices.map((c) => { const x = G.city(c); return G.wind(q.map, x[1], x[2]).speed; }), hi = q.choices[sp[0] > sp[1] ? 0 : 1]; if (hi !== q.ans || Math.max(...sp) < Math.min(...sp) * 2) bad.push(`${d}:${t} 強さ`); }
    if (t === "wind") { const x = G.city(q.pts[0]), wd = G.wind(q.map, x[1], x[2]); if (wd.from !== q.ans || wd.speed < 0.03) bad.push(`${d}:${t} 向き`); if (!h) { const k = G.DIR8.indexOf(q.ans); if (q.choices.some((c) => c !== q.ans && [1, 7].includes((G.DIR8.indexOf(c) - k + 8) % 8))) bad.push(`${d}:${t} となりの方角が選択肢`); } }
    if (t === "weather") { if (G.weather(q.map, q.pts[0]) !== q.ans) bad.push(`${d}:${t} 天気`); if (q.map.season === "冬" && (q.ans === "雪") !== G.SEA_J.includes(q.pts[0])) bad.push(`${d}:${t} 冬`); }
    if (q.pts.some((p) => !G.city(p))) bad.push(`${d}:${t} 地点`);
    cnt[t + q.ans] = (cnt[t + q.ans] || 0) + 1;
  }
  check("どの問題も答えが選択肢にあり、答えを天気図から計算し直すと同じ（5種類×1500問）", bad.length === 0, bad.slice(0, 3).join(","));
  check("同じ種からは同じ問題ができる（だれでも同じ問題）", same.length === 0, same.slice(0, 3).join(","));
  check("答えがかたよらない（季節4つ・天気の晴れと雨がどれも15%以上）", ["season冬", "season夏", "season梅雨", "season春・秋"].every((k) => cnt[k] > 225) && cnt["weather晴れ"] > 225 && cnt["weather雨"] > 225, JSON.stringify(cnt));
  check("4択の風向きは、正しい向きのとなりの方角を選択肢に入れない（45度ちがいで迷わせない）", !bad.some((x) => x.includes("となり")));
}

const html = readFileSync(path.join(root, "index.html"), "utf8");
check("終えた回を消すのは同じ回のときだけ・0時を過ぎたホームの「今日」のボタンは描き直す（2026-11-04 CodeRabbit）", /c\.date === run\.date && c\.id === run\.id\) s2\.runs\[MODE\] = null/.test(html) && /\$\("go-d"\)\.onclick = \(\) => \(k !== todayKey\(\) \? home\(\)/.test(html));
check("別のタブで今日の分を終えたあと、古い画面から今日・上級をもう一度始めない（2026-11-04 CodeRabbit）", /\(mode === "d" && s\.days\[k\]\) \|\| \(mode === "h" && s\.hdays\[k\]\)\) return;/.test(html));
check("README の URL のすぐ後ろに全角の字を続けない（Link check が URL の一部と読む。2026-11-04）", !/https?:\/\/[\x21-\x7e]*[^\x00-\x7f]/.test(readFileSync(new URL("../README.md", import.meta.url), "utf8").replace(/\]\(https?:\/\/[^)\s]+\)/g, "").replace(/<https?:\/\/[^>\s]+>/g, "")));
const ext = [...html.matchAll(/(src|href)="(https?:[^"]+)"/g)].filter((m) => !(m[1] === "href" && /^https:\/\/www\.jma\.go\.jp\/jma\/kishou\/know\//.test(m[2]))).map((m) => m[2]).filter((u) => !/^https:\/\/fonts\.googleapis\.com(\/|$)|^https:\/\/ko-fi\.com\/satouaaaaa$/.test(u)); // 気象庁の説明へのただのリンク（手引きの出どころ）は読みこまないので許す
check("外から読むのは文字（Google Fonts）だけ。スクリプト・広告・解析を入れない", ext.length === 0, ext.join(","));
check("CSP で通信先を自分だけにしている", /connect-src 'self'/.test(html) && !/connect-src[^;"]*https/.test(html));
check("Math.random は練習・とことんの問題の種だけ（今日の5問・上級は日付の種）", (html.match(/Math\.random/g) || []).length === 4 && !/Math\.random/.test(readFileSync(path.join(root, "gen.js"), "utf8")));
check("画面にお笑いの言葉を入れない（本物っぽく）", !/お笑い|ギャグ|ボケ|ツッコミ|なんでやねん|（うそ）/.test(html));
{ const og = (k) => (html.match(new RegExp(`<meta (?:property|name)="${k}" content="([^"]+)"`)) || [])[1] || "";
  const png = readFileSync(path.join(root, "og.png"));
  check("SNS で貼ると絵と題が出る（OGP・1200×630・絶対URL）", og("og:title") && og("og:description") && og("og:image") === "https://satou-aaaaa.github.io/tenkizu-yomi/og.png" && og("twitter:card") === "summary_large_image" && png.readUInt32BE(16) === 1200 && png.readUInt32BE(20) === 630); }
{ const fy = readFileSync(path.join(root, ".github/ISSUE_TEMPLATE/feedback.yml"), "utf8");
  check("感想フォームは名前・メールを聞かない（楽しさ・よかった所・直してほしい所だけ）", /id: fun/.test(fy) && /id: good/.test(fy) && /id: fix/.test(fy) && !/id: (name|email|mail)/.test(fy)); }
{ const sw = readFileSync(path.join(root, "sw.js"), "utf8"), mf = JSON.parse(readFileSync(path.join(root, "manifest.webmanifest"), "utf8"));
  const shell = JSON.parse(sw.match(/SHELL = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
  const need = ["./index.html", "./transfer.js", "./gen.js", "./japan.js", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"];
  check("PWA：ネットの返事の保存は、イベントの中で waitUntil に預ける（遅れて届いた新しい版も保存できる）", /e\.waitUntil\(Promise\.race\(\[net\.then[^\n]*wait\(15000\)[^\n]*wait\(60000\)\]\)\)/.test(sw));
  check("PWA：sw.js は画面のファイルを全部保存し、外へ何も送らない", need.every((f) => shell.includes(f)) && !/https?:\/\//.test(sw.replace(/^\/\/.*$/gm, "")));
  check("PWA：manifest にアイコン2つと名前がある", mf.name === "天気図よみ" && mf.icons.length >= 2 && mf.start_url === "./"); }
{ const src = html + readFileSync(path.join(root, "gen.js"), "utf8");
  const bad = src.match(/\.sort\(\s*\([^)]*\)\s*=>[^\n;]*\b(R|rng|rand|Math\.random)\s*\(/g) || [];
  check("並べ替えの比較の中で乱数を引いていない（同じ日に人によって問題が変わらない）", bad.length === 0, bad.join(" | ")); }

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const isNoise = (t) => /fonts\.(googleapis|gstatic)\.com|ERR_NAME_NOT_RESOLVED|ERR_INTERNET_DISCONNECTED|net::ERR_/.test(t);
const errors = [];
async function newPage(w = 390, h = 844) {
  const page = await browser.newPage({ viewport: { width: w, height: h } });
  page.on("pageerror", (e) => errors.push(e.stack));
  page.on("console", (m) => { if (m.type() === "error" && !isNoise(m.text())) errors.push(m.text()); });
  await page.goto(url);
  await page.evaluate(() => localStorage.clear()); await page.reload();
  return page;
}
const curK = (page) => page.evaluate(() => { const c = window.__tk.cur(); return { i: c.i, q: { ans: c.q.ans, choices: c.q.choices, t: c.it.t, ask: c.q.ask, pts: c.q.pts }, done: c.done }; });
const ansNow = async (page, right = true) => { const c = await curK(page); const pick = right ? c.q.ans : c.q.choices.find((x) => x !== c.q.ans); await page.click(`#ch button[data-c="${pick}"]`); };
const KEY = "tenkizu-v1";
try {
  const page = await newPage();
  // 3. 5問の組み方（日付の種）
  const sel = await page.evaluate(() => {
    const g = window.__tk, out = { bad: [], same: 0 };
    let prev = null;
    for (let n = 0; n < 365; n++) {
      const k = new Date(Date.parse("2026-11-04") + n * 864e5).toISOString().slice(0, 10);
      const d = g.dailyList(k).map(g.qOf), h = g.hardList(k).map(g.qOf);
      if (d.some((q) => !q) || h.some((q) => !q) || g.dailyList(k).map((x) => x.t).join() !== "season,strong,wind,weather,weather") out.bad.push(k);
      const sig = JSON.stringify(d.map((q) => q.ask)); if (sig === prev) out.same++; prev = sig;
    }
    out.d1201 = JSON.stringify(g.dailyList("2026-12-01").map(g.qOf).map((q) => [q.ask, q.ans]));
    return out;
  });
  check("今日の5問は毎日「季節・風の強さ・風向き・天気・天気」、上級も5問（1年分）", sel.bad.length === 0, sel.bad.slice(0, 3).join(","));
  check("前の日と同じ問題にならない（1年分）", sel.same === 0);
  { const ctx = await browser.newContext(); const p2 = await ctx.newPage(); await p2.goto(url);
    const d2 = await p2.evaluate(() => { const g = window.__tk; return JSON.stringify(g.dailyList("2026-12-01").map(g.qOf).map((q) => [q.ask, q.ans])); });
    await ctx.close();
    check("同じ日は別のブラウザで開いても同じ5問", sel.d1201 === d2); }

  // 4. 通しで遊ぶ
  check("初めて開くと遊び方が出る", await page.locator("#howto[open]").count() === 1);
  check("ホームに見本の天気図（等圧線と高・低）が出る", (await page.locator(".map svg path").count()) > 40 && (await page.textContent(".map")).includes("高"));
  await page.click("#howto-ok");
  await page.click("#go-d");
  let c = await curK(page);
  check("答える前は、天気図に風の矢印を出さない（答えを言わない）", (await page.locator("#wl").count()) === 0 && await page.locator("#wleg").isHidden());
  check("1問目は季節：天気図・問題・4つの答えが出る", c.q.t === "season" && (await page.locator("#ch button").count()) === 4 && (await page.locator("#mp svg").count()) === 1);
  await ansNow(page, false);
  check("答えたあと、天気図に風の矢印を重ねる（流れが見える）", (await page.locator("#wl path").count()) >= 1 && (await page.getAttribute("#wl path", "d")).split("M").length > 20 && await page.locator("#wleg").isVisible());
  check("まちがえると答えに色が付き、説明が出る", (await page.locator("#ch button.ng").count()) === 1 && (await page.locator("#ch button.ok").count()) === 1 && (await page.locator(".why").count()) === 1);
  check("正解・まちがいは色だけでなく ✓・✕ と読み上げの名前（正解・まちがい）でも分かる（WCAG 1.4.1）", await page.evaluate(() => { const ok = document.querySelector("#ch button.ok"), ng = document.querySelector("#ch button.ng"); return !!ok && !!ng && ok.querySelector(".mk").textContent === "✓" && ng.querySelector(".mk").textContent === "✕" && /（正解）/.test(ok.getAttribute("aria-label")) && /まちがい・えらんだ答え/.test(ng.getAttribute("aria-label")) && getComputedStyle(ng).borderStyle === "dashed"; }));
  check("天気図に読み上げの名前（高気圧・低気圧の数）があり、問題文と答え合わせが読み上げの対象", await page.evaluate(() => /^天気図：高気圧\d+つ・低気圧\d+つ/.test(document.querySelector("#mp svg").getAttribute("aria-label")) && !!document.querySelector(".q[data-a11y-say]") && !!document.querySelector(".verdict[role=status]")));
  await page.click("#next");
  c = await curK(page);
  check("進み具合の点は、まちがえた問題を中が空の枠（形）で出し、名前に正解・まちがいの数", await page.evaluate(() => { const d = document.querySelector(".dots"), i = [...d.querySelectorAll("i")]; return i[0].classList.contains("miss") && getComputedStyle(i[0]).backgroundColor === "rgba(0, 0, 0, 0)" && i[1].classList.contains("on") && /まちがい1/.test(d.getAttribute("aria-label")); }));
  await page.evaluate(() => document.documentElement.classList.add("a11y-cvd"));
  check("色の見分けを助ける設定では、前線・高低の色をカラーユニバーサルデザインの組（青 #0072B2・朱 #D55E00）に替える", await page.evaluate(() => { const want = { cH: "rgb(0, 114, 178)", cL: "rgb(213, 94, 0)", fc: "rgb(0, 114, 178)", fw: "rgb(213, 94, 0)" }, els = [...document.querySelectorAll("#mp .cH, #mp .cL, #mp .fc, #mp .fw")]; return els.length > 0 && els.every((e) => getComputedStyle(e).fill === want[e.getAttribute("class")]); }));
  await page.evaluate(() => document.documentElement.classList.remove("a11y-cvd"));
  check("2問目は風の強さ：2つの地点が地図に出る", c.q.t === "strong" && (await page.locator("#mp svg circle").count()) === 2 && (await page.locator("#ch button").count()) === 2);
  await page.reload(); await page.click("#go-d");
  check("途中で閉じても、答えた問題の次から（続きから）", (await curK(page)).i === 1 && (await page.evaluate(() => window.__tk.load().runs.d.res.length)) === 1);
  await page.click("#back"); await page.click("#go-p"); await page.locator(".lv button").first().click(); await page.click("#back"); await page.click("#go-d");
  check("練習を始めても、今日の途中経過は消えない", (await curK(page)).i === 1 && (await page.evaluate(() => window.__tk.mode())) === "d");
  await ansNow(page); await page.click("#next");
  // 別のタブで先に進んでいたら、古い画面の答えは足さない
  await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.runs.d.res.push(1); localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await ansNow(page);
  check("別のタブで先に進んでいたら、古い画面の答えは足さず今の問題を出し直す", (await page.evaluate(() => window.__tk.load().runs.d.res.length)) === 3 && (await page.textContent("header")).includes("4/5"));
  await page.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.runs.d.res.pop(); localStorage.setItem(k, JSON.stringify(s)); }, KEY);
  await page.reload(); await page.click("#go-d");
  for (let j = 0; j < 3; j++) { await ansNow(page); await page.click("#next"); }
  const share = await page.textContent(".share");
  const asks = await page.evaluate(() => { const g = window.__tk; return g.dailyList(g.todayKey()).map(g.qOf).flatMap((q) => q.pts); });
  check("5問で結果・シェアの文は番号と色と点だけ（地名を出さない）", /天気図よみ #\d+/.test(share) && /🟥🟩🟩🟩🟩 4\/5/.test(share) && !asks.some((p) => share.includes(p)));
  check("X・LINE は押したときに開くリンクだけ", /^https:\/\/twitter\.com\/intent\/tweet\?text=/.test(await page.getAttribute("#toX", "href")) && /^https:\/\/line\.me\/R\/share\?text=/.test(await page.getAttribute("#toLine", "href")));
  check("結果に5問の答えが出る", (await page.locator(".res div").count()) === 5);
  check("今日の5問を初めて終えると、結果に「🏅 実績：はじめの1枚」が小さく出る", ((await page.locator("#achnew").textContent().catch(() => "")) || "").includes("🏅 実績：はじめの1枚"));
  check("結果に「あと少しの実績」を1つだけ出す：まだの実績のうち目標にいちばん近いもの（取った・0のものは選ばない。研究の要点 12）", await page.evaluate(() => { const g = window.__tk, s = g.load(), t = g.tally(s), nx = g.nextAch(s), el = document.querySelectorAll("#achnext"); if (!nx) return el.length === 0; const cand = g.ACH.filter((a) => t[a[4]] > 0 && t[a[4]] < a[5]); return el.length === 1 && el[0].textContent.includes(nx.name) && el[0].textContent.includes("あと" + nx.left) && cand.every((a) => t[a[4]] / a[5] <= nx.r + 1e-12) && !g.achGot(s).includes(nx.id); }) && await page.evaluate(() => window.__tk.nextAch(window.__tk.load()) !== null));
  check("全問正解でない日は Ko-fi のひとことを出さない", (await page.locator(".kofi").count()) === 0);
  await page.click("#back");
  check("ホームで連続1日・今日の結果を見るに変わる・正解4", (await page.textContent(".stats")).includes("1連続の日") && (await page.textContent(".stats")).includes("4正解") && (await page.textContent("#go-d")).includes("結果"));
  // 上級
  await page.click("#go-h");
  check("上級の風向きは8方位から選ぶ", (await page.locator("#ch button").count()) === 8);
  await ansNow(page);
  check("上級は答えても説明を出さない（結果でまとめて出す）", (await page.locator(".why").count()) === 0);
  await page.click("#next");
  for (let j = 0; j < 4; j++) { await ansNow(page); await page.click("#next"); }
  check("上級を全問正解で初めて終えると、結果に Ko-fi のひとことが1行・説明がまとめて出る", (await page.locator(".kofi").count()) === 1 && (await page.textContent(".big")).includes("全問正解") && (await page.textContent(".res")).includes("風は"));
  await page.click("#back"); await page.click("#go-h");
  check("2回目に結果を開いても Ko-fi のひとことは出ない", (await page.locator(".kofi").count()) === 0);
  await page.click("#back");
  await page.click("#go-p"); await page.locator(".lv button").nth(2).click();
  for (let j = 0; j < 5; j++) { await ansNow(page); await page.click("#next"); }
  const after = await page.evaluate(() => { const s = window.__tk.load(); return { days: Object.keys(s.days).length, ok: s.ok, wind: s.got.wind }; });
  check("練習は今日の記録を増やさず、正解の数には入る（風向き5問）", after.days === 1 && after.ok === 14 && after.wind >= 5 && (await page.locator(".share").count()) === 0);
  await page.click("#go-dex");
  check("読めた数に種類ごとの正解が出る", (await page.locator(".res div").count()) === 4);
  await page.close();


  // 6. 答えたあとの風の矢印：答えと同じ計算から描く（何百問で、太い矢印の向き＝答えの方角）
  { const pw = await newPage();
    const r = await pw.evaluate(() => {
      const g = window.__tk, D8 = g.G.DIR8, bad = []; let n = 0, wx = 0, wxBad = 0;
      for (let d = 0; d < 300; d++) {
        const k = new Date(Date.parse("2026-11-04") + d * 864e5).toISOString().slice(0, 10);
        for (const it of [...g.dailyList(k), ...g.hardList(k)]) {
          const q = g.qOf(it), html = g.windLayer(q);
          if (q.t === "wind") {
            const m = html.match(/class="wb" d="M([-\d.]+),([-\d.]+)L([-\d.]+),([-\d.]+)/); if (!m) { bad.push(k + " 矢印なし"); continue; }
            const [x0, y0, x1, y1] = m.slice(1).map(Number), deg = (Math.atan2(x0 - x1, -(y0 - y1)) * 180 / Math.PI + 360) % 360; // 矢印の根もと＝吹いてくる側
            if (D8[Math.round(deg / 45) % 8] !== q.ans) bad.push(`${k} ${q.ans}→${D8[Math.round(deg / 45) % 8]}`); n++;
          }
          if (q.t === "weather") { wx++; if (!html.includes({ 晴れ: "☀", 雨: "☂", 雪: "❄" }[q.ans])) wxBad++; }
          if (q.t === "strong") { const m = html.match(/class="wb" d="([^"]+)"/); if (!m || m[1].split("M").length !== 5) bad.push(k + " 強さの矢印"); }
        }
      }
      return { bad, n, wx, wxBad };
    });
    check(`答えたあとの太い矢印の向きは答えの方角と同じ・風の強さは2地点に矢印・天気は答えの印（${r.n}問）`, r.bad.length === 0 && r.n > 300 && r.wxBad === 0 && r.wx > 500, r.bad.slice(0, 3).join(","));
    await pw.close(); }

  // 7. 実績：いまの記録から数える
  { const pa = await newPage();
    const r = await pa.evaluate(() => {
      const g = window.__tk, five = (x) => ({ r: x });
      const s = { v: 1, days: { "2026-11-05": five([1, 1, 1, 1, 1]), "2026-11-06": five([1, 0, 1, 1, 1]) }, hdays: { "2026-11-05": five([1, 1, 1, 1, 1]) }, adays: { "2026-11-04": five([0, 0, 1, 1, 1]) }, got: { season: 10, strong: 10, wind: 30, weather: 12 }, ok: 62, runs: {}, kofi: {} };
      const empty = g.achGot({ v: 1, days: {}, hdays: {}, adays: {}, got: {}, ok: 0, runs: {} });
      return { n: g.ACH.length, ids: new Set(g.ACH.map((a) => a[0])).size, kinds: [0, 1, 2].map((k) => g.ACH.filter((a) => a[3] === k).length), got: g.achGot(s).sort().join(","), empty: empty.length, keys: g.ACH.every((a) => a[4] in g.tally(s)) };
    });
    check("実績は14個で、腕前・集める・続けるがどれも3つ以上・数え方が記録にある（実績を足したらこの数も直す）", r.n === 14 && r.ids === r.n && r.kinds.every((x) => x >= 3) && r.keys, JSON.stringify(r.kinds));
    check("実績の数え方：記録から取れた実績が正しい（何も無い記録では0）", r.got === "every10,first,hard1,hardP,late1,perfect1,wind30" && r.empty === 0, r.got);
    await pa.evaluate((k) => { const g = window.__tk; localStorage.setItem(k, JSON.stringify({ v: 1, tut: true, days: {}, hdays: {}, adays: {}, got: { wind: 12 }, ok: 12, runs: {}, kofi: {} })); }, KEY);
    await pa.reload(); await pa.click("#go-ach");
    check("実績の画面：まだの実績は条件と進み具合（12/30）を出す", (await pa.locator(".ach").count()) === r.n && (await pa.textContent(".ach[data-id=wind30]")).includes("12/30") && (await pa.locator(".ach[data-id=wind30] .bar").count()) === 1);
    await pa.close(); }

  { // とことん：次々に出る・やさしい→ふつう→むずかしい・まちがえても続く・使い切ったら足す・降りると自己ベスト（2026-11-06 satou さん「好きなだけ遊んでほしい」）（2026-11-05 satou さん「一日で遊べる量が少なすぎる」）
    const pe = await newPage(); await pe.click("#howto-ok");
    const ramp = await pe.evaluate(() => { const g = window.__tk, bad = []; let made = 0; for (let n = 0; n < 300; n++) { const L = g.endlessList(); if (L.length !== 100 || new Set(L.map((x) => x.seed)).size !== 100) { bad.push(n + " 数・重なり"); continue; } L.forEach((x, i) => { const lv = i < 5 ? 0 : i < 20 ? 1 : 2, ts = g.ERAMP[lv][0]; if (x.lv !== lv || x.h !== g.ERAMP[lv][1] || !ts.includes(x.t)) bad.push(`${n}:${i}`); }); if (n < 20) for (const x of L) { if (!g.qOf(x)) bad.push(`${n} 作れない`); made++; } } return { bad, made }; });
    check("とことんの並び（300回）：やさしい5→ふつう15→むずかしい80（8方位）、同じ種は出ず、どれも問題になる", ramp.bad.length === 0 && ramp.made === 2000, ramp.bad.slice(0, 3).join(","));
    check("ホームに「とことん」の大きなボタン", (await pe.locator("#go-e.main").count()) === 1);
    check("保存に失敗したら1回だけ知らせ、記録は開いているあいだ残る（2026-11-06 CodeRabbit）", await pe.evaluate(() => { const g = window.__tk, o = Storage.prototype.setItem; let n = 0; Storage.prototype.setItem = () => { throw new Error("full"); }; try { g.save((s) => { s.qaSave = 1; }); g.save((s) => { s.qaSave = 2; }); n = [...document.querySelectorAll(".toast")].filter((d) => d.textContent.includes("保存できませんでした")).length; } finally { Storage.prototype.setItem = o; } const kept = g.load().qaSave === 2; g.save((s) => { delete s.qaSave; }); return n === 1 && kept && !("qaSave" in JSON.parse(localStorage.getItem("tenkizu-v1") || "{}")); }));
    await pe.click("#go-e");
    for (let j = 0; j < 3; j++) { await ansNow(pe); await pe.click("#next"); }
    check("とことんは何問目かを出し、降りるボタンがある（🎫は無い）", (await pe.textContent("header")).includes("4問目") && (await pe.textContent("#quit")).includes("3問で終える") && !(await pe.content()).includes("🎫") && (await pe.evaluate(() => window.__tk.load().runs.e.life)) === undefined);
    await ansNow(pe, false);
    check("とことんはまちがえても終わらず、短く知らせて次へ進む", (await pe.textContent("#etk")).includes("続きます") && (await pe.textContent("#next")).includes("次の問題") && (await pe.evaluate(() => { const r = window.__tk.load().runs.e; return !!r && !r.over && r.res.length === 4; })));
    await pe.click("#next"); await pe.click("#back");
    check("ホームのボタンは「とことんの続きから」", (await pe.textContent("#go-e")).includes("続きから（5問目）"));
    await pe.click("#go-e");
    check("とことんは途中で閉じても続きから（5問目）", (await pe.textContent("header")).includes("5問目"));
    for (let j = 0; j < 4; j++) { await ansNow(pe, false); await pe.click("#next"); }
    check("とことんは5回続けてまちがえても終わらない（9問目へ）", (await pe.textContent("header")).includes("9問目") && (await pe.locator("#quit").count()) === 1);
    await pe.click("#quit");
    check("降りると正解の数・まちがいの回数と自己ベスト更新が出て、記録に残る（今日の記録・連続には入らない・シェアは出さない）", (await pe.textContent("#eres")).includes("3問") && (await pe.textContent("main, body")).includes("まちがい5回") && (await pe.textContent("#ebest")).includes("自己ベスト更新") && (await pe.locator("#share").count()) === 0 && (await pe.evaluate(() => { const s = window.__tk.load(); return s.ebest === 3 && !s.runs.e && Object.keys(s.days).length === 0 && s.ok === 3; })));
    await pe.click("#go-e"); await pe.click("#quit");
    check("ベストに届かないと、ベストと「あと何問で更新」を出し、ベストは下げない", (await pe.textContent("#ebest")).includes("あと4問で更新") && (await pe.evaluate(() => window.__tk.load().ebest)) === 3);
    // 並びの終わりまで来ても終わらない：残り少しの回を作って答えると、後ろに問題が足される（同じ種は出さない）
    await pe.click("#go-e");
    await pe.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)), r = s.runs.e; r.res = r.list.slice(0, r.list.length - 1).map(() => 0); r.life = 0; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
    await pe.click("#back"); await pe.click("#go-e");
    await ansNow(pe, false);
    const grown = await pe.evaluate(() => { const r = window.__tk.load().runs.e; return { n: r.list.length, res: r.res.length, uniq: new Set(r.list.map((x) => x.seed)).size, over: !!r.over }; });
    check("とことんは並び（100問）を使い切っても、前の版の life:0 が残っていても終わらず、問題を足して続く", grown.n > 100 && grown.res === 100 && grown.uniq === grown.n && !grown.over && (await pe.textContent("#next")).includes("次の問題"), JSON.stringify(grown));
    await pe.click("#next");
    check("足した問題も遊べる（101問目・むずかしい）", (await pe.textContent("header")).includes("101問目") && (await pe.textContent("header")).includes("むずかしい"));
    const more = await pe.evaluate(() => { const g = window.__tk, bad = []; for (let n = 0; n < 300; n++) { let L = g.endlessList(); for (let k = 0; k < 5; k++) L = L.concat(g.moreList(L)); if (L.length !== 300 || new Set(L.map((x) => x.seed)).size !== 300 || L.slice(100).some((x) => x.lv !== 2 || x.h !== 1 || !g.ERAMP[2][0].includes(x.t))) bad.push(n); } return bad; });
    check("とことんの足し方（300回・300問ずつ）：1回の中で同じ種は出ず、足すのはむずかしい問題", more.length === 0, more.slice(0, 3).join(","));
    await pe.click("#quit");
    await pe.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.runs.e = { mode: "e", date: "2000-01-01", list: window.__tk.endlessList(), res: [1, 1, 0], life: 0, over: true, id: "x" }; localStorage.setItem(k, JSON.stringify(s)); }, KEY);
    await pe.reload();
    check("前の版で🎫が尽きて終わった回（over）は、開き直すと終わりの画面へ進み、ベストを下げない", (await pe.textContent("#eres")).includes("2問") && (await pe.evaluate(() => { const s = window.__tk.load(); return !s.runs.e && s.ebest === 3; })));
    check("保存に失敗したあとの統合でも、自己ベストは大きいほうを残す", await pe.evaluate((K) => { const g = window.__tk, s0 = g.load(); mem = JSON.stringify(Object.assign({}, s0, { t: 9, ebest: 2 })); localStorage.setItem(K, JSON.stringify(Object.assign({}, s0, { t: 5, ebest: 7 }))); const r = g.load().ebest; mem = null; return r === 7; }, KEY));
    await pe.close(); }
  { // 好きなだけ遊べる：🎫・回数制限・「…すると開く」を入れない。上級ははじめて開いた日から（2026-11-06 satou さん。寄付で成り立たせるため）
    const pf = await newPage();
    const html = await pf.content(), src = readFileSync(path.join(root, "index.html"), "utf8");
    check("ページに🎫・チケット・「…すると開く」が無い", !/🎫|チケット|すると開く|で開く|🔒/.test(src) && !/🎫|すると開く/.test(html));
    check("はじめて開いた日（今日の5問の前）でも、ホームから上級を始められる", (await pf.locator("#go-h").count()) === 1);
    await pf.click("#howto-ok"); await pf.click("#go-h");
    check("上級は今日の5問の前でも始まる（8方位）", (await pf.evaluate(() => window.__tk.mode())) === "h" && (await pf.textContent("header")).includes("上級"));
    await pf.click("#back");
    const kofiOut = [];
    for (const id of ["#go-p", "#go-cal", "#go-ach", "#go-dex"]) { await pf.click(id); if (await pf.locator(".kofi").count()) kofiOut.push(id); await pf.click("#back"); }
    await pf.click("#go-e"); if (await pf.locator(".kofi").count()) kofiOut.push("e"); await pf.click("#quit"); if (await pf.locator(".kofi").count()) kofiOut.push("e-end");
    check("Ko-fi のひとことは結果の画面だけ（ホーム・練習・カレンダー・実績・とことんには出ない。足もとのリンクは別）", kofiOut.length === 0 && (await pf.locator(".kofi").count()) === 0, kofiOut.join(","));
    await pf.close(); }
  { // 今日の5問の結果に「続けて遊ぶ：とことん」
    const pr = await newPage(); await pr.click("#howto-ok"); await pr.click("#go-d");
    for (let j = 0; j < 5; j++) { await ansNow(pr); await pr.click("#next"); }
    check("今日の5問の結果に「続けて遊ぶ：とことん」の大きなボタン", (await pr.locator("#go-e.main").count()) === 1 && (await pr.textContent("#go-e")).includes("とことん"));
    await pr.click("#go-e");
    check("結果の画面からとことんを始められる", (await pr.evaluate(() => window.__tk.mode())) === "e" && (await pr.textContent("header")).includes("1問目"));
    await pr.close(); }
  for (const w of [320, 390]) { // とことんの遊ぶ画面・終わりの画面もスマホ幅で崩れない
    const pv = await newPage(w, 700); await pv.click("#howto-ok");
    const look = () => pv.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth, small: [...document.querySelectorAll("button, a")].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44).map((e) => e.id || e.textContent.trim().slice(0, 6)), hd: document.querySelector("header") ? document.querySelector("header").getBoundingClientRect().height : 0 }));
    const h0 = await look(); await pv.click("#go-e"); const a = await look(); await ansNow(pv, false); const b = await look();
    await pv.evaluate((k) => { const s = JSON.parse(localStorage.getItem(k)); s.runs.e.list = s.runs.e.list.map((x) => ({ ...x, t: "wind", h: 1, lv: 2 })); localStorage.setItem(k, JSON.stringify(s)); }, KEY); await pv.click("#next"); const c = await look();
    await pv.click("#quit"); const d = await look();
    check(`幅${w}px：ホーム・とことんの遊ぶ画面（8方位も）・終わりの画面は横にはみ出さず、押せる所は高さ44px以上`, [h0, a, b, c, d].every((x) => !x.over && x.small.length === 0) && c.hd < 70, [h0, a, b, c, d].flatMap((x) => x.small).join(",") + ` 見出し${c.hd}px`);
    await pv.close(); }
  // 8. カレンダーと、取りこぼした日をあとから遊ぶ（日付を5日先にして確かめる）
  { const OFF = Number(process.env.QA_DAY_OFFSET || 5); // 月をまたぐ日は QA_DAY_OFFSET=28 で確かめる
    const pl = await browser.newPage({ viewport: { width: 390, height: 844 } });
    pl.on("pageerror", (e) => errors.push(e.stack));
    pl.on("console", (m) => { if (m.type() === "error" && !isNoise(m.text())) errors.push(m.text()); });
    await pl.addInitScript((off) => { const RD = Date, o = off * 864e5; window.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(RD.now() + o); } static now() { return RD.now() + o; } }; }, OFF);
    await pl.goto(url);
    const today = await pl.evaluate(() => window.__tk.todayKey()), dk = (n) => new Date(Date.parse(today) - n * 864e5).toISOString().slice(0, 10);
    // 1日前は全問正解・2日前は3問・3日前はあとから済み。4日前より前（始めた日まで）は取りこぼし
    await pl.evaluate(([k, a, b, c]) => { localStorage.setItem(k, JSON.stringify({ v: 1, tut: true, days: { [a]: { r: [1, 1, 1, 1, 1] }, [b]: { r: [1, 1, 0, 1, 0] } }, hdays: { [a]: { r: [1, 1, 1, 1, 1] } }, adays: { [c]: { r: [1, 1, 1, 1, 1] } }, got: {}, ok: 0, runs: {}, kofi: {} })); }, [KEY, dk(1), dk(2), dk(3)]);
    await pl.reload();
    const late = await pl.evaluate(() => window.__tk.lateDays(window.__tk.load()));
    const want = []; for (let n = 4; n <= 7; n++) if (dk(n) >= "2026-11-04") want.push(dk(n));
    check("取りこぼした日は過去7日のうち遊んでいない日だけ（始めた日より前は無い・新しい順）", JSON.stringify(late) === JSON.stringify(want), late.join(","));
    check("ホームのカレンダーに、あとから遊べる日の数が出る", (await pl.textContent("#go-cal")).includes(want.length ? `▶${want.length}` : "カレンダー"));
    await pl.click("#go-cal");
    // その日の月まで戻って読み、今の月に戻す（月をまたぐ日でも同じに読む）
    const cell = async (k) => { let back = 0; while (back < 2 && !(await pl.locator(`.cal [data-k="${k}"]`).count())) { await pl.click("#prev"); back++; } const v = await pl.evaluate((k) => { const e = document.querySelector(`.cal [data-k="${k}"]`); return e ? e.className + "|" + e.textContent : ""; }, k); for (; back > 0; back--) await pl.click("#next"); return v; };
    check("カレンダー：全問正解の日は濃い色に★3と上級の印・3問の日は★2・あとからの日は ↺", (await cell(dk(1))).includes("p3") && (await cell(dk(1))).includes("★★★") && (await cell(dk(1))).includes("上") && (await cell(dk(2))).includes("p2") && (await cell(dk(3))).includes("late") && (await cell(dk(3))).includes("↺"));
    check("カレンダーの色の見本にも★の数を書く（色だけで分けない）", /★★★ 全問正解/.test(await pl.textContent(".calleg")) && /★★ 3〜4問/.test(await pl.textContent(".calleg")));
    check("カレンダー：連続の日は1以上のときだけ小さく出し、休んだ日を責める言葉は無い", (await pl.textContent("header")).includes("連続 2日") && !/さぼ|休んだ|途切れ|残念/.test(await pl.textContent("#app")));
    check("カレンダー：前の月へ戻るボタン（始めた月より前には行かない）", (await pl.locator("#prev").count()) === 1 && (today.slice(0, 7) > "2026-11" ? !(await pl.locator("#prev").isDisabled()) : await pl.locator("#prev").isDisabled()));
    if (want.length >= 2) {
      const A = want[0], B = want[1];
      // 月をまたぐ日でも、その日の月までカレンダーを戻してから押す（2026-11-04 CodeRabbit の指摘）
      const showMonth = async (k) => { for (let i = 0; i < 2 && !(await pl.locator(`.cal [data-k="${k}"]`).count()); i++) await pl.click("#prev"); };
      const openDay = async (k) => { await showMonth(k); await pl.click(`.cal .miss[data-k="${k}"]`); };
      await openDay(A);
      const listA = await pl.evaluate(() => { const g = window.__tk, s = g.load(), m = g.mode(); return JSON.stringify(s.runs[m].list); });
      check("あとから遊ぶ問題は、その日の今日の5問と同じ（日付の種）", listA === await pl.evaluate((A) => JSON.stringify(window.__tk.dailyList(A)), A) && (await pl.evaluate(() => window.__tk.mode())) === "a:" + A);
      await ansNow(pl); await pl.click("#next"); await ansNow(pl); await pl.click("#next");
      await pl.click("#back"); await pl.click("#go-cal"); await showMonth(A);
      check("途中の日はカレンダーに「続き」と出る", (await cell(A)).includes("続き"));
      await pl.click("#back"); await pl.click("#go-cal"); await openDay(B); await ansNow(pl); await pl.click("#next");
      await pl.click("#back"); await pl.click("#go-cal"); await openDay(A);
      check("A日を途中まで→B日を始める→A日に戻ると続きから（途中経過は日付ごと・runs.d と混ぜない）", (await curK(pl)).i === 2 && await pl.evaluate(([A, B]) => { const s = window.__tk.load(); return s.runs["a:" + A].res.length === 2 && s.runs["a:" + B].res.length === 1 && !s.runs.d; }, [A, B]));
      const before = await pl.evaluate(() => { const g = window.__tk, s = g.load(); return { days: Object.keys(s.days).length, ok: s.ok, st: g.streak(s.days) }; });
      for (let j = 0; j < 3; j++) { await ansNow(pl); await pl.click("#next"); }
      const after = await pl.evaluate((A) => { const g = window.__tk, s = g.load(); return { days: Object.keys(s.days).length, a: !!s.adays[A], ok: s.ok, st: g.streak(s.days), run: s.runs["a:" + A], kofi: Object.keys(s.kofi).length }; }, A);
      check("あとから遊んだ日は adays に残り、今日の記録・連続の日・Ko-fi に数えない（読めた数には入る）", after.a && after.days === before.days && after.st === before.st && after.ok === before.ok + 3 && !after.run && after.kofi === 0);
      check("あとからの結果にはシェアと Ko-fi を出さず、カレンダーへ戻れる", (await pl.locator("#share").count()) === 0 && (await pl.locator(".kofi").count()) === 0 && (await pl.locator("#go-cal").count()) === 1 && (await pl.textContent("header")).includes("あとから"));
      await pl.click("#go-cal");
      check("あとから遊んだ日はカレンダーに ↺ で残る", (await cell(A)).includes("late"));
    } else check("あとから遊ぶ日が2日以上ある（検査の前提）", false, want.join(","));
    await pl.close(); }
  { // 取りこぼした日の決め方と問題を、何百日分も作って確かめる
    const pz = await newPage();
    const r = await pz.evaluate(() => {
      const g = window.__tk, bad = [];
      for (let n = 0; n < 400; n++) {
        const k = new Date(Date.parse("2026-11-04") + n * 864e5).toISOString().slice(0, 10), days = {};
        for (let j = 1; j <= 7; j++) if ((n * 7 + j) % 3 === 0) days[new Date(Date.parse(k) - j * 864e5).toISOString().slice(0, 10)] = { r: [1] };
        const L = g.lateDays({ days, adays: {} }, k);
        if (L.length > 7 || L.some((d) => d >= k || d < "2026-11-04" || days[d] || Date.parse(k) - Date.parse(d) > 7 * 864e5)) bad.push(k);
        for (const d of L) if (g.dailyList(d).map(g.qOf).some((q) => !q) || JSON.stringify(g.dailyList(d)) !== JSON.stringify(g.dailyList(d))) bad.push(d);
      }
      return bad;
    });
    check("取りこぼした日の選び方とその日の問題（400日分）：過去7日・遊んだ日を除く・どの日も5問できる", r.length === 0, r.slice(0, 3).join(","));
    check("保存に失敗したあとの統合で、片方にしか無い adays を失わない（先に fresh() で補う）", await pz.evaluate((K) => { const g = window.__tk, s0 = g.load(); const x = Object.assign({}, s0, { t: 9 }); delete x.adays; mem = JSON.stringify(x); localStorage.setItem(K, JSON.stringify(Object.assign({}, s0, { t: 5, adays: { "2000-01-01": { r: [1] } } }))); const r = g.load(); mem = null; return !!r.adays["2000-01-01"]; }, KEY));
    check("同じ日に今日の5問とあとからの記録があれば、統合で今日の5問を残す（二重に数えない）", await pz.evaluate((K) => { const g = window.__tk, s0 = g.load(); localStorage.setItem(K, JSON.stringify(Object.assign({}, s0, { t: 5, days: { "2000-01-02": { r: [1] } }, adays: { "2000-01-02": { r: [1] }, "2000-01-03": { r: [1] } } }))); const r = g.load(); return !!r.days["2000-01-02"] && !r.adays["2000-01-02"] && !!r.adays["2000-01-03"]; }, KEY));
    const dupView = await pz.evaluate((K) => { const g = window.__tk, D = "2000-01-04", s0 = g.load(); localStorage.setItem(K, JSON.stringify(Object.assign({}, s0, { t: 6, days: { [D]: { r: [1, 1, 1, 1, 1] } }, adays: {}, runs: { ["a:" + D]: { mode: "a", date: D, list: g.dailyList(D), res: [1, 0, 1, 1, 1], id: "dup", a0: [] } } }))); g.play("a:" + D); const s = g.load(); return { text: document.querySelector("#app").textContent, saved: !!s.adays[D], run: !!s.runs["a:" + D] }; }, KEY);
    check("あとからの回が記録されなかったとき（同じ日の今日の5問が先）も結果を見せ、記録はしない", dupView.text.includes("5問中 4問") && dupView.text.includes("記録には残しません") && !dupView.saved && !dupView.run, JSON.stringify({ ...dupView, text: dupView.text.slice(0, 60) }));
    await pz.close(); }
  // 5. スマホ幅：はみ出さない・押せる所は44px以上・地図の字が読める
  for (const w of [320, 390]) {
    const p3 = await newPage(w, 700); const fb2 = await p3.evaluate(() => { const a = document.querySelector("#howto #fb2"); return a ? a.getBoundingClientRect().height : 0; }); check(`幅${w}px：遊び方の「感想を送る」も高さ44px以上`, fb2 >= 44, `${fb2}px`); await p3.click("#howto-ok");
    const homeOk = await p3.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
    await p3.click("#go-d"); await ansNow(p3); await p3.click("#next");
    const r = await p3.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth, small: [...document.querySelectorAll("button, a")].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44).map((e) => e.id || e.textContent.trim().slice(0, 6)), fs: Math.min(...[...document.querySelectorAll("#mp text")].map((t) => t.getBoundingClientRect().height)) }));
    check(`幅${w}px：横にはみ出さず、押せる所は高さ44px以上・地図の字は9px以上`, homeOk && !r.over && r.small.length === 0 && r.fs >= 9, `${r.small.join(",")} 字${r.fs.toFixed(1)}px`);
    await p3.close();
  }
  for (const w of [320, 390]) { // 実績・カレンダーの画面もスマホ幅で崩れない
    const pv = await newPage(w, 700); await pv.click("#howto-ok");
    const look = () => pv.evaluate(() => ({ over: document.documentElement.scrollWidth > innerWidth, small: [...document.querySelectorAll("button, a")].filter((e) => e.offsetParent && e.getBoundingClientRect().height < 44).map((e) => e.id || e.textContent.trim().slice(0, 6)), out: [...document.querySelectorAll(".ach, .cal .c")].filter((e) => e.getBoundingClientRect().right > innerWidth + 0.5).length }));
    await pv.click("#go-ach"); const a = await look();
    await pv.click("#back"); await pv.click("#go-cal"); const c = await look();
    check(`幅${w}px：実績とカレンダーの画面は横にはみ出さず、押せる所は高さ44px以上`, !a.over && !c.over && a.small.length + c.small.length === 0 && a.out + c.out === 0, [...a.small, ...c.small].join(","));
    await pv.close();
  }
  { // 上級の8方位も幅320pxで押せる
    const p8 = await newPage(320, 700); await p8.click("#howto-ok");
    await p8.evaluate(() => { const g = window.__tk, d = g.todayKey(); localStorage.setItem("tenkizu-v1", JSON.stringify({ v: 1, tut: true, days: { [d]: { r: [1, 1, 1, 1, 1] } }, hdays: {}, got: {}, ok: 0, kofi: {}, runs: {} })); });
    await p8.reload(); await p8.click("#go-h");
    const r8 = await p8.evaluate(() => [...document.querySelectorAll("#ch button")].map((b) => [b.getBoundingClientRect().height, b.scrollWidth <= b.clientWidth + 1]));
    check("幅320pxでも上級の8方位のボタンは44px以上で、字がはみ出さない", r8.length === 8 && r8.every(([h, f]) => h >= 44 && f));
    await p8.close(); }
  { // 保存できないブラウザでも遊べる
    const pb = await browser.newPage({ viewport: { width: 390, height: 844 } });
    pb.on("pageerror", (e) => errors.push(e.message));
    await pb.addInitScript(() => { Storage.prototype.setItem = () => { throw new Error("blocked"); }; });
    await pb.goto(url); await pb.click("#howto-ok"); await pb.click("#go-d");
    await ansNow(pb);
    check("保存できないブラウザでも、今日の1問目に答えられる", (await pb.textContent("header")).includes("1/5") && (await curK(pb)).done);
    await pb.click("#back");
    check("保存できないブラウザでも、遊び方が何度も開かない", !(await pb.locator("#howto[open]").count()));
    await pb.close(); }
  { // 前の記録が残っていて、書き込みだけ失敗するとき
    const pq = await browser.newPage({ viewport: { width: 390, height: 844 } });
    pq.on("pageerror", (e) => errors.push(e.message));
    await pq.addInitScript(() => { const orig = Storage.prototype.setItem; orig.call(localStorage, "tenkizu-v1", JSON.stringify({ v: 1, tut: true, days: {}, hdays: {}, got: {}, ok: 0, kofi: {}, runs: {} })); Storage.prototype.setItem = () => { throw new Error("full"); }; });
    await pq.goto(url); await pq.click("#go-d");
    check("前の記録があり書き込みだけ失敗しても、今日の1問目が始まる", (await pq.textContent("header")).includes("1/5"));
    await pq.close(); }
  { const pc = await newPage();
    await pc.evaluate((k) => { const g = window.__tk, d = g.todayKey(); localStorage.setItem(k, JSON.stringify({ v: 1, tut: true, days: {}, hdays: {}, got: {}, ok: 0, kofi: {}, runs: { d: { mode: "d", date: d, list: g.dailyList(d), res: [1, 1, 1, 1, 1], id: "a" } } })); }, KEY);
    await pc.reload();
    check("最後の1問のあと閉じても、開き直すと結果へ進み今日の記録がつく", await pc.evaluate(() => { const g = window.__tk; return !!g.load().days[g.todayKey()] && !g.load().runs.d; }));
    await pc.close(); }
  { const pm = await newPage();
    await pm.evaluate((k) => { const g = window.__tk, d = g.todayKey(); localStorage.setItem(k, JSON.stringify({ v: 1, tut: true, days: {}, hdays: {}, got: {}, ok: 0, kofi: {}, runs: { d: { mode: "d", date: d, list: g.dailyList(d), res: [1, 1, 1, 1, 1], id: "a" } } })); }, KEY);
    await pm.reload();
    const had = await pm.locator("#go-h").count();
    await pm.evaluate(() => { const RD = Date, off = 864e5; window.Date = class extends RD { constructor(...a) { if (a.length) super(...a); else super(RD.now() + off); } static now() { return RD.now() + off; } }; });
    if (had) await pm.click("#go-h");
    check("結果を開いたまま日付が変わったら、上級のボタンを押しても翌日の上級は始まらない", had > 0 && (await pm.evaluate(() => window.__tk.mode())) !== "h");
    await pm.close(); }
  { const pn = await newPage();
    await pn.evaluate((k) => { const g = window.__tk, d = new Date(Date.parse(g.todayKey()) - 864e5).toISOString().slice(0, 10); localStorage.setItem(k, JSON.stringify({ v: 1, tut: true, days: {}, hdays: {}, got: {}, ok: 0, kofi: {}, runs: { d: { mode: "d", date: d, list: g.dailyList(d), res: [1, 1, 1, 1, 1], id: "a" } } })); }, KEY);
    await pn.reload();
    check("前の日に終えて閉じても、翌日に開くとその日の記録がつく", await pn.evaluate(() => { const g = window.__tk; return !!g.load().days[new Date(Date.parse(g.todayKey()) - 864e5).toISOString().slice(0, 10)] && !g.load().runs.d; }));
    check("前の日の結果の画面からは、今日の上級を始められない（今日の分を先に）", !(await pn.locator("#go-h").count()));
    check("保存に失敗したあと別のタブが新しく保存していたら、古いメモリで上書きせずそちらを読む", await pn.evaluate((K) => { const g = window.__tk, s0 = g.load(); mem = JSON.stringify(Object.assign({}, s0, { t: 1, tagA: 1 })); localStorage.setItem(K, JSON.stringify(Object.assign({}, s0, { t: 2, tagB: 1 }))); const r = g.load(); mem = null; return !!r.tagB && !r.tagA; }, KEY));
    check("保存に失敗したあと別のタブが保存しても、両方の記録（日ごとの結果）を残し、正解の数は多いほう", await pn.evaluate((K) => { const g = window.__tk, s0 = g.load(); mem = JSON.stringify(Object.assign({}, s0, { t: 5, days: { "2000-01-01": 1 }, got: { wind: 9 } })); localStorage.setItem(K, JSON.stringify(Object.assign({}, s0, { t: 9, days: { "2000-01-02": 1 }, got: { wind: 2 } }))); const r = g.load(); mem = null; return !!r.days["2000-01-01"] && !!r.days["2000-01-02"] && r.got["wind"] === 9; }, KEY));
    check("保存に失敗したタブの時刻が進んでいても、別のタブで先に進んだ途中経過を古いメモリで戻さない", await pn.evaluate((K) => { const g = window.__tk, s0 = g.load(), base = { mode: "d", date: "2000-01-01", list: [{ seed: 1, t: "wind", h: 0 }], id: "x", res: [] }; mem = JSON.stringify(Object.assign({}, s0, { t: 99, runs: { d: Object.assign({}, base) } })); localStorage.setItem(K, JSON.stringify(Object.assign({}, s0, { t: 1, runs: { d: Object.assign({}, base, { res: [1] }) } }))); const r = g.load(); mem = null; return r.runs.d.res.length === 1; }, KEY));
    check("保存に失敗したタブにだけある途中経過は、別のタブが保存しても消さない（その日を終えた記録があれば null を使う・終えた回は日ごとの結果に残す）", await pn.evaluate((K) => { const g = window.__tk, s0 = g.load(); const base = { mode: "d", date: "2000-01-01", list: [1, 2, 3], tags: [1, 2, 3], id: "x", res: [], i: 0, hints: [0, 0, 0] }, done = Object.assign({}, base, { res: [0, 1, 2].map(() => ({ m: 0, g: 1, h: 0, f: 0, p: 90, n: 1 })), i: 3 }); const put = (a, b, dd) => { mem = JSON.stringify(Object.assign({}, s0, { t: 5, runs: a })); localStorage.setItem(K, JSON.stringify(Object.assign({}, s0, { t: 9, runs: b }, dd ? { days: Object.assign({}, s0.days, dd) } : {}))); const r = g.load(); mem = null; return r; }; const r1 = put({ d: base }, {}), r2 = put({ d: base }, { d: null }, { "2000-01-01": 1 }), r3 = put({ d: base }, { d: null }), r4 = put({ d: done }, { d: null }); return !!r1.runs.d && r1.runs.d.date === "2000-01-01" && r2.runs.d === null && !!r3.runs.d && r3.runs.d.date === "2000-01-01" && r4.runs.d === null && !!r4.days["2000-01-01"]; }, KEY));
    check("同じ進み具合なら、新しく保存したほうの途中経過を使う", await pn.evaluate((K) => { const g = window.__tk, s0 = g.load(); const base = { mode: "d", date: "2000-01-01", list: [1, 2, 3], tags: [1, 2, 3], id: "x", res: [], i: 0, hints: [0, 0, 0] }, done = Object.assign({}, base, { res: [0, 1, 2].map(() => ({ m: 0, g: 1, h: 0, f: 0, p: 90, n: 1 })), i: 3 }); const put = (ta, tb) => { mem = JSON.stringify(Object.assign({}, s0, { t: ta, runs: { d: Object.assign({}, base, { zz: "a" }) } })); localStorage.setItem(K, JSON.stringify(Object.assign({}, s0, { t: tb, runs: { d: Object.assign({}, base, { zz: "b" }) } }))); const r = g.load(); mem = null; return r.runs.d.zz; }; return put(9, 5) === "a" && put(5, 9) === "b"; }, KEY));
    check("結果を見る前に別のタブが次の日を保存しても、終えた日の記録を残す", await pn.evaluate((K) => { const g = window.__tk, s0 = g.load(); const base = { mode: "d", date: "2000-01-01", list: [1, 2, 3], tags: [1, 2, 3], id: "x", res: [], i: 0, hints: [0, 0, 0] }, done = Object.assign({}, base, { res: [0, 1, 2].map(() => ({ m: 0, g: 1, h: 0, f: 0, p: 90, n: 1 })), i: 3 }); mem = JSON.stringify(Object.assign({}, s0, { t: 5, runs: { d: done } })); localStorage.setItem(K, JSON.stringify(Object.assign({}, s0, { t: 9, runs: { d: Object.assign({}, base, { date: "2000-01-02" }) } }))); const r = g.load(); mem = null; return !!r.days["2000-01-01"] && r.runs.d.date === "2000-01-02"; }, KEY));
    check("同じ問題の練習をやり直したら、前の回（終えたもの）と取り違えず新しい回を使う", await pn.evaluate((K) => { const g = window.__tk, s0 = g.load(), base = { mode: "p", date: "2000-01-01", list: [1], tags: [1], res: [], i: 0, hints: [] }; mem = JSON.stringify(Object.assign({}, s0, { t: 9, runs: { p: Object.assign({}, base, { id: "new" }) } })); localStorage.setItem(K, JSON.stringify(Object.assign({}, s0, { t: 5, runs: { p: Object.assign({}, base, { id: "old", res: [{}], i: 1 }) } }))); const r = g.load(); mem = null; return r.runs.p.id === "new"; }, KEY));
    check("時計が戻っても、保存の時刻 t は前より大きくなる", await pn.evaluate((K) => { const s0 = JSON.parse(localStorage.getItem(K)); const far = Date.now() + 1e9; localStorage.setItem(K, JSON.stringify(Object.assign({}, s0, { t: far }))); save(() => {}); return JSON.parse(localStorage.getItem(K)).t > far; }, KEY));
    await pn.close(); }
} catch (e) {
  check("QA の操作が最後まで完了する", false, e.message.split("\n")[0]);
} finally {
  try { // キーボードで選んだボタンに枠が出る（all:unset のカレンダーのます目でも消えない。2026-11-04 CodeRabbit の指摘）。止まっても失敗として記録し、レポートまで進む
    const pf = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await pf.goto(url); await pf.evaluate(() => localStorage.clear()); await pf.reload();
    await pf.click("#howto-ok").catch(() => {});
    const bad = [];
    for (const open of [null, "#go-cal"]) {
      if (open) await pf.click(open);
      await pf.keyboard.press("Shift");
      bad.push(...await pf.evaluate(() => {
        const cal = document.querySelector(".cal");
        if (cal) { const b = document.createElement("button"); b.className = (cal.querySelector("button") || cal.lastElementChild).className + " miss"; b.textContent = "1"; cal.append(b); }
        return [...document.querySelectorAll("button:not([disabled]),a[href]")].filter((b) => b.checkVisibility()).filter((b) => { b.focus(); const cs = getComputedStyle(b); return !b.matches(":focus-visible") || cs.outlineStyle === "none" || parseFloat(cs.outlineWidth) < 2; }).map((b) => b.className || b.id || b.tagName);
      }));
    }
    check("キーボードで選んだボタン（カレンダーのあとから遊ぶ日も）に枠が出る", bad.length === 0, bad.join(","));
    await pf.close();
  } catch (e) { check("キーボードで選んだボタン（カレンダーのあとから遊ぶ日も）に枠が出る", false, e.message.split("\n")[0]); }
  try { // 復習：まちがえた問題を次の日から解き直す（間をあけてくり返す。shared-workflows game-dev.md 18）
    const pr = await newPage(); await pr.click("#howto-ok");
    await pr.click("#go-d");
    for (let i = 0; i < 5; i++) { await ansNow(pr, i >= 2); await pr.click("#next"); }
    const m0 = await pr.evaluate(() => { const g = window.__tk, s = g.load(); return { n: g.missOf(s).length, due: g.dueMiss(s).length, today: g.missOf(s).every((x) => x.d === g.todayKey()) }; });
    check("まちがえた問題は復習に入る（その日はまだ出ない）・結果に「あしたから復習で読み直せます」", m0.n === 2 && m0.due === 0 && m0.today && (await pr.textContent("#rvnote")).includes("2問"), JSON.stringify(m0));
    await pr.click("#back");
    check("復習できる問題が無い日は、ホームに復習のボタンを出さない", (await pr.locator("#go-r").count()) === 0);
    await pr.evaluate((K) => { const s = JSON.parse(localStorage.getItem(K)), y = new Date(Date.parse(window.__tk.todayKey()) - 864e5).toISOString().slice(0, 10); for (const k in s.miss) s.miss[k].d = y; localStorage.setItem(K, JSON.stringify(s)); }, KEY);
    await pr.reload();
    check("次の日になると、ホームに「復習 2問」が出る", (await pr.textContent("#go-r")).includes("2問"));
    const before = await pr.evaluate(() => { const s = window.__tk.load(); return JSON.stringify([s.days, s.hdays, s.kofi]); });
    await pr.click("#go-r");
    check("復習は、まちがえた問題を古い順に出す（見出しに「復習」）", (await pr.textContent("header")).includes("復習") && (await pr.evaluate(() => window.__tk.load().runs.r.list.length)) === 2);
    await ansNow(pr, true); await pr.click("#next");
    await pr.reload();
    check("復習も途中で閉じたら続きから", (await pr.textContent("#go-r")).includes("続きから（2問目）"));
    await pr.click("#go-r"); await ansNow(pr, false); await pr.click("#next");
    const m1 = await pr.evaluate(() => { const g = window.__tk, s = g.load(); return { n: g.missOf(s).length, due: g.dueMiss(s).length, rv: s.rv, days: JSON.stringify([s.days, s.hdays, s.kofi]) }; });
    check("復習で正解した問題は消え、まちがえた問題は次の日にもう一度出る", m1.n === 1 && m1.due === 0 && m1.rv === 1, JSON.stringify(m1));
    check("復習は今日の記録・Ko-fi を増やさず、シェアも出さない", m1.days === before && (await pr.locator("#share").count()) === 0 && (await pr.locator(".kofi").count()) === 0 && (await pr.textContent("#rvnote")).includes("あしたもう一度"));
    await pr.click("#back");
    check("復習を終えたら、その日はもうボタンを出さない", (await pr.locator("#go-r").count()) === 0);
    // 30問より多くまちがえたら、古いものから消す
    await pr.evaluate((K) => { const s = JSON.parse(localStorage.getItem(K)); s.miss = {}; for (let i = 0; i < 35; i++) s.miss[i + ":wind:0"] = { it: { seed: i, t: "wind", h: 0 }, d: "2026-01-" + String(1 + (i % 28)).padStart(2, "0") }; localStorage.setItem(K, JSON.stringify(s)); }, KEY);
    await pr.reload(); await pr.click("#go-p"); await pr.locator(".lv button").first().click(); await ansNow(pr, false);
    const m2 = await pr.evaluate(() => { const g = window.__tk, s = g.load(), L = g.missOf(s); return { n: L.length, max: g.MISSMAX, mine: L.some((x) => x.d === g.todayKey()) }; });
    check("まちがえた問題は30問まで（古いものから消し、今日の分は残す）", m2.n === m2.max && m2.mine, JSON.stringify(m2));
    await pr.close();
  } catch (e) { check("復習", false, e.message.split("\n")[0]); }
  try { // スマホで初めて遊ぶ人の使いやすさ（2026-11-07 UI/UX の見直し）
    for (const [w, h] of [[390, 844], [320, 640]]) {
      const pu = await newPage(w, h); await pu.click("#howto-ok");
      // ボタンの中の字（文字の節ごと）が何行に並んだかを、Range の行の上端の数で数える（高さで見ると、字が大きいだけでも折れたと見誤る）
      const oneLine = (sel) => pu.evaluate((sel) => [...document.querySelectorAll(sel)].filter((b) => { const tw = document.createTreeWalker(b, NodeFilter.SHOW_TEXT); let n; while ((n = tw.nextNode())) { if (!n.textContent.trim()) continue; const rg = document.createRange(); rg.selectNodeContents(n); if (new Set([...rg.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size > 1) return true; } return false; }).map((b) => b.textContent.trim()), sel);
      const home0 = await pu.evaluate(() => { const r = document.querySelector("#go-d").getBoundingClientRect(); return { inView: r.top >= 0 && r.bottom <= innerHeight, stats: !!document.querySelector(".stats"), ovf: document.documentElement.scrollWidth - innerWidth }; });
      check(`${w}px：はじめて開いたホームは「今日の5問」が1画面目に収まり、0 ばかりの記録を出さない・横にはみ出さない`, home0.inView && !home0.stats && home0.ovf <= 0, JSON.stringify(home0));
      const wrapH = await oneLine("button.main");
      check(`${w}px：ホームの大きなボタンの字が2行に折れない`, wrapH.length === 0, wrapH.join(" / "));
      check(`${w}px：ホームの説明は言葉の途中で折れない（句ごとに折り返す）`, await pu.evaluate(() => { const nw = [...document.querySelectorAll(".lead .nw")]; return nw.length > 0 && nw.every((e) => { const rg = document.createRange(); rg.selectNodeContents(e); return new Set([...rg.getClientRects()].filter((x) => x.width > 0).map((x) => Math.round(x.top))).size === 1; }); }));
      await pu.click("#go-d");
      await ansNow(pu, false);
      check(`${w}px：まちがえると、答え合わせの枠が朱の破線と ✕ になる`, await pu.evaluate(() => { const v = document.querySelector(".verdict"); return v.classList.contains("ng") && v.querySelector(".vm").textContent === "✕" && getComputedStyle(v).borderTopStyle === "dashed"; }));
      check(`${w}px：答えたあと「次の問題へ」が画面の中に見える`, await pu.waitForFunction(() => { const r = document.querySelector("#next").getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }, null, { timeout: 3000 }).then(() => true, () => false));
      await pu.click("#next"); await ansNow(pu, true);
      check(`${w}px：正解すると、答え合わせの枠が緑の縁と ✓ になる`, await pu.evaluate(() => { const v = document.querySelector(".verdict"); return v.classList.contains("ok") && v.querySelector(".vm").textContent === "✓"; }));
      for (let j = 0; j < 3; j++) { await pu.click("#next"); await ansNow(pu, true); }
      await pu.click("#next");
      const rs = await pu.evaluate(() => { const e = document.querySelector("#go-e"), r = document.querySelector(".res"); return { before: !!(e && r && (e.compareDocumentPosition(r) & Node.DOCUMENT_POSITION_FOLLOWING)), marks: [...document.querySelectorAll(".res .rm")].map((m) => m.getAttribute("aria-label") + m.textContent).join(","), ngRow: document.querySelectorAll(".res div.ng").length, ovf: document.documentElement.scrollWidth - innerWidth }; });
      check(`${w}px：結果は「続けて遊ぶ：とことん」をふりかえりの前に置き、ふりかえりは ✓・✕ の印（読み上げの名前つき）`, rs.before && rs.marks === "まちがい✕,正解✓,正解✓,正解✓,正解✓" && rs.ngRow === 1 && rs.ovf <= 0, JSON.stringify(rs));
      const wrapR = await oneLine("button.main");
      check(`${w}px：結果の大きなボタンの字が2行に折れない`, wrapR.length === 0, wrapR.join(" / "));
      await pu.click("#go-e"); await ansNow(pu, false);
      check(`${w}px：とことんで答えたあとは、同じ知らせを2回出さない（下の「まちがえても続けられます」を隠す）`, await pu.locator("#enote").isHidden() && await pu.locator("#etk").isVisible());
      await pu.close();
    }
  } catch (e) { check("スマホで初めて遊ぶ人の使いやすさ", false, e.message.split("\n")[0]); }
  try { // 読み方の手引き（気象庁の説明から。知らなくても遊べるように）
    const pg = await newPage(); await pg.click("#howto-ok");
    await pg.click("#go-p"); await pg.click("#go-guide");
    const g = await pg.evaluate(() => ({ n: document.querySelectorAll(".gd").length, src: [...document.querySelectorAll("a[href*='jma.go.jp']")].length, btn: [...document.querySelectorAll(".gd button")].map((b) => b.dataset.t), ovf: document.documentElement.scrollWidth - innerWidth }));
    check("練習から「読み方の手引き」を開ける（5つの要点・気象庁の出どころ・横にはみ出さない）", g.n === 5 && g.src >= 1 && g.ovf <= 0, JSON.stringify(g));
    check("手引きの要点は、等圧線・高気圧と低気圧・風向き・前線・季節の形", await pg.evaluate(() => ["等圧線", "高気圧と低気圧", "風向き", "前線", "季節の形"].every((t, i) => document.querySelectorAll(".gd h2")[i].textContent === t)));
    check("手引きの風向きは北半球の向き（高気圧は時計回りに吹き出し、低気圧へ反時計回りに吹き込む）", (await pg.textContent("#gd-wind")).includes("高気圧から時計回りに吹き出し、低気圧へ反時計回りに吹き込む"));
    const rec0 = await pg.evaluate(() => JSON.stringify(window.__tk.load().days));
    await pg.click("#gd-wind button");
    check("手引きから、その種類の練習を始められる（今日の記録は増えない）", (await pg.textContent("header")).includes("練習") && (await pg.evaluate(() => window.__tk.load().runs.p.list.every((it) => it.t === "wind"))) && (await pg.evaluate(() => JSON.stringify(window.__tk.load().days))) === rec0);
    await pg.click("#back"); await pg.click("#go-dex"); await pg.click("#go-guide"); await pg.click("#back");
    check("読めた数からも手引きを開け、もどると読めた数に帰る", (await pg.textContent("header")).includes("読めた数"));
    await pg.close();
    const pe = await newPage();
    await pe.keyboard.press("Escape");
    check("遊び方を Esc で閉じても、次に開いたときは遊び方を出さない", await pe.evaluate(() => window.__tk.load().tut === true));
    await pe.reload();
    check("（続き）開き直しても遊び方は閉じたまま", !(await pe.evaluate(() => document.getElementById("howto").open)));
    await pe.click("#f-how"); await pe.click("#howto-guide");
    check("遊び方の中のリンクから手引きを開ける", (await pe.locator(".gd").count()) === 5 && !(await pe.evaluate(() => document.getElementById("howto").open)));
    await pe.close();
  } catch (e) { check("読み方の手引き", false, e.message.split("\n")[0]); }
  try { // 引き継ぎコード（別の端末へ記録を移す。shared-workflows template/qa/transfer-check.mjs）
    await checkTransfer({ browser, url, game: "tenkizu-yomi", sample: { "tenkizu-v1": JSON.stringify({ v: 1, tut: true }) }, check, open: async (p) => { await p.click("#howto-ok", { timeout: 1500 }).catch(() => {}); } });
  } catch (e) { check("引き継ぎコード", false, e.message.split("\n")[0]); }
  try { // 動きを減らす設定では振動しない（WCAG 2.3.3・game-dev.md A8）
    const cc = await browser.newContext(); await cc.addInitScript(() => { localStorage.setItem("a11y-v1", JSON.stringify({ calm: true })); window.__vib = 0; Object.defineProperty(navigator, "vibrate", { value: () => { window.__vib++; return true; }, configurable: true }); });
    const pc = await cc.newPage(); await pc.goto(url); await pc.click("#howto-ok"); await pc.click("#go-p"); await pc.locator(".lv button").first().click(); await pc.locator("#ch button").first().click();
    check("動きを減らす設定では、答えたときに振動しない", (await pc.evaluate(() => window.__vib)) === 0 && (await pc.locator(".verdict").count()) === 1);
    await cc.close();
  } catch (e) { check("動きを減らす設定では、答えたときに振動しない", false, e.message.split("\n")[0]); }
  await browser.close();
}
check("画面のエラーが無い", errors.length === 0, errors.slice(0, 3).join(" | "));

{ // 見やすさ・読みやすさ・偏り（shared-workflows template/qa/a11y.mjs の写し。routines/game-dev.md「だれでも遊べるように」）
  const { spawnSync } = await import("node:child_process");
  const a = spawnSync(process.execPath, [path.join(root, "qa", "a11y.mjs")], { encoding: "utf8", env: process.env });
  check("見やすさ・読みやすさの検査（qa/a11y.mjs。中身は qa-report/a11y.md）", a.status === 0, (a.stdout.match(/^- ❌.*$/gm) || []).join(" / ") || (a.status ? a.stderr.slice(-300) : ""));
}

const ng = results.filter((r) => !r.ok);
const md = `# 天気図よみ QA\n\n${results.map((r) => `- ${r.ok ? "✅" : "❌"} ${r.name}${r.detail ? `（${r.detail}）` : ""}`).join("\n")}\n\n${ng.length ? `❌ ${ng.length}件` : `✅ ${results.length}項目すべて通過`}\n`;
mkdirSync(path.join(root, "qa-report"), { recursive: true });
writeFileSync(path.join(root, "qa-report/report.md"), md);
console.log(md);
process.exit(ng.length ? 1 : 0);
