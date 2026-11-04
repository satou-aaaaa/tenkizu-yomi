// アプリのアイコン（icon-192.png・icon-512.png）と SNS 用の絵（og.png 1200×630）を作る。画面と同じ描き方の冬型の天気図（今日の問題は入れない）。
// 使い方: node tools/make-icons.cjs（qa/ の playwright を使う）
const path = require("path");
const { chromium } = require(path.join(__dirname, "..", "qa", "node_modules", "playwright"));
(async () => {
  const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
  const url = "file://" + path.join(__dirname, "..", "index.html");
  const svgOf = async (season, seed) => { const p = await b.newPage(); await p.goto(url); const s = await p.evaluate(([se, sd]) => mapHtml({ map: G.makeMap(G.rng(sd), se), pts: [] }), [season, seed]); await p.close(); return s; };
  const winter = await svgOf("冬", 7);
  // アイコン：等圧線にかこまれた「高」と「低」
  const rings = (x, y, n) => Array.from({ length: n }, (_, i) => `<circle cx="${x}" cy="${y}" r="${12 + i * 11}" fill="none" stroke="#5b6f80" stroke-width="2.4"/>`).join("");
  for (const s of [192, 512]) {
    const p = await b.newPage({ viewport: { width: s, height: s } });
    await p.setContent(`<body style="margin:0"><svg width="${s}" height="${s}" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" style="font-family:'Noto Sans CJK JP',sans-serif">
      <rect width="100" height="100" fill="#dce9f3"/>${rings(28, 34, 3)}${rings(72, 68, 3)}
      <text x="28" y="43" font-size="26" font-weight="900" fill="#2f6fd0" text-anchor="middle">高</text><text x="72" y="77" font-size="26" font-weight="900" fill="#d2492f" text-anchor="middle">低</text></svg></body>`);
    await p.screenshot({ path: path.join(__dirname, "..", `icon-${s}.png`), clip: { x: 0, y: 0, width: s, height: s } });
    await p.close();
  }
  const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
  await p.setContent(`<body style="margin:0;font-family:'Noto Sans CJK JP','IPAPGothic',sans-serif">
  <div style="width:1200px;height:630px;box-sizing:border-box;padding:70px 80px;background:#e3ecf3;color:#26323a;position:relative;overflow:hidden">
    <div style="position:absolute;left:560px;top:0;width:640px;height:630px">${winter.replace("<svg ", '<svg width="640" height="630" preserveAspectRatio="xMidYMid meet" ')}</div>
    <div style="position:relative;width:520px">
    <div style="font-size:34px;color:#2f6fd0;letter-spacing:.1em">だれでも同じ 1日5問</div>
    <div style="font-size:100px;font-weight:900;margin-top:16px;letter-spacing:.04em">天気図よみ</div>
    <div style="font-size:40px;margin-top:18px;line-height:1.5">等圧線と前線から、<br>風と天気を読める？</div></div>
  </div></body>`);
  await p.screenshot({ path: path.join(__dirname, "..", "og.png") });
  await b.close();
})();
