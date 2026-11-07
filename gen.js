// 天気図よみ：架空の天気図（高気圧・低気圧・前線・等圧線）を種から作り、読み取りの問題を出す。
// 気圧は「ふだんの気圧 + 高気圧・低気圧の山と谷」の和。風は等圧線に沿う向きから、低気圧の側へ30度かたむける（地面のまさつ）。
(function (root) {
  "use strict";
  const M = typeof module !== "undefined" ? require("./japan.js") : root.TK_MAP;
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function seedOf(str) { let h = 2166136261; for (const ch of str) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
  const CITY = M.P.map((p) => [p[0].replace(/(都|府|県)$/, ""), p[2], p[3]]);
  const city = (n) => CITY.find((c) => c[0] === n);
  // 冬に雪が多い日本海側と、晴れが多い太平洋側（気象庁「冬の天気」の説明による代表）
  const SEA_J = ["新潟", "富山", "石川", "福井", "秋田", "山形", "鳥取"];
  const SEA_P = ["東京", "静岡", "愛知", "宮城", "千葉", "高知", "宮崎"];
  const DIR8 = ["北", "北東", "東", "南東", "南", "南西", "西", "北西"];
  const SEASON = ["冬", "夏", "梅雨", "春・秋"];
  // ---- 天気図 ----
  // centers：{ k:"H"|"L", x, y, a（hPa の差）, s（広がり） }、fronts：[{ k:"cold"|"warm"|"stay", pts:[[x,y]...] }]
  function pressure(m, x, y) { let p = 1012; for (const c of m.centers) p += c.a * Math.exp(-((x - c.x) ** 2 + (y - c.y) ** 2) / (2 * c.s * c.s)); return p; }
  function grad(m, x, y) { const e = 2; return [(pressure(m, x + e, y) - pressure(m, x - e, y)) / (2 * e), (pressure(m, x, y + e) - pressure(m, x, y - e)) / (2 * e)]; }
  // 風の吹いてくる向き（北が上の画面の座標。y は下が正）。北半球：高気圧から時計回りに吹き出し、低気圧へ反時計回りに吹き込む
  function wind(m, x, y) {
    const [gx, gy] = grad(m, x, y), gyN = -gy, g = Math.hypot(gx, gyN);
    if (g < 1e-9) return { from: null, speed: 0 };
    const ux = gx / g, uy = gyN / g; // 高い方へ向く（北が正）
    const vx = -uy * 0.866 - ux * 0.5, vy = ux * 0.866 - uy * 0.5; // 等圧線に沿う向き（高い方を右に）を低い方へ30度
    const deg = (Math.atan2(-vx, -vy) * 180 / Math.PI + 360) % 360; // 吹いてくる方角（北=0・東=90）
    return { from: DIR8[Math.round(deg / 45) % 8], deg, speed: g };
  }
  const segDist = (px, py, [ax, ay], [bx, by]) => { const dx = bx - ax, dy = by - ay, t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy || 1))); return Math.hypot(px - ax - t * dx, py - ay - t * dy); };
  const frontDist = (m, x, y, k) => Math.min(1e9, ...m.fronts.filter((f) => !k || f.k === k).flatMap((f) => f.pts.slice(1).map((p, i) => segDist(x, y, f.pts[i], p))));
  function makeMap(R, season) {
    const j = (a) => (R() - 0.5) * 2 * a, m = { season, centers: [], fronts: [] };
    if (season === "冬") { // 西高東低：大陸に高気圧、東の海に発達した低気圧。等圧線は南北にこむ
      m.centers.push({ k: "H", x: -120 + j(40), y: 260 + j(80), a: 30 + j(6), s: 260 }, { k: "L", x: 640 + j(50), y: 140 + j(80), a: -30 + j(6), s: 200 });
    } else if (season === "夏") { // 南高北低：太平洋高気圧が日本の南東から張り出す
      m.centers.push({ k: "H", x: 640 + j(60), y: 680 + j(40), a: 14 + j(3), s: 300 }, { k: "L", x: -40 + j(40), y: 60 + j(60), a: -8 + j(2), s: 200 });
    } else if (season === "梅雨") { // 北と南の高気圧のあいだに停滞前線
      const fy = 450 + j(40);
      m.centers.push({ k: "H", x: 560 + j(60), y: 30 + j(30), a: 10 + j(2), s: 220 }, { k: "H", x: 520 + j(80), y: 780 + j(30), a: 10 + j(2), s: 240 });
      const pts = []; for (let x = -40; x <= 700; x += 74) pts.push([x, fy + (x - 330) * 0.35 + j(12)]);
      m.fronts.push({ k: "stay", pts });
    } else { // 春・秋：移動性高気圧と、温暖前線・寒冷前線をのばした低気圧が交互に通る
      const hx = 340 + j(140), hy = 330 + j(120), lx = hx < 300 ? hx + 300 + j(40) : hx - 300 + j(40), ly = 200 + j(120);
      m.centers.push({ k: "H", x: hx, y: hy, a: 12 + j(3), s: 150 }, { k: "L", x: lx, y: ly, a: -16 + j(4), s: 110 });
      const w = [], c = []; for (let t = 0; t <= 4; t++) { w.push([lx + t * 30, ly + t * 14 + j(4)]); c.push([lx - t * 22, ly + t * 34 + j(4)]); }
      m.fronts.push({ k: "warm", pts: w }, { k: "cold", pts: c });
    }
    m.centers.forEach((c) => (c.p = Math.round(pressure(m, c.x, c.y))));
    return m;
  }
  // 台風の天気図（今日の5問・上級には出さない。練習・とことんだけ。過去の日の問題は変わらない）
  // 台風は等圧線が丸くこみ合った低気圧。進む向き（tr）を持つ。東に太平洋高気圧
  function makeTyphoon(R, x, y, hx, hy) {
    const j = (a) => (R() - 0.5) * 2 * a, m = { season: "台風", centers: [], fronts: [] };
    m.centers.push({ k: "H", x: 760 + j(60), y: 420 + j(120), a: 12 + j(3), s: 260 }, { k: "T", x, y, a: -48 + j(8), s: 70 });
    m.tr = { dx: hx, dy: hy };
    m.centers.forEach((c) => (c.p = Math.round(pressure(m, c.x, c.y))));
    return m;
  }
  // 台風が進むときの風：台風をまわる風（wind）に、台風の進む速さを足す。進む向きの右側は2つが重なって強い（気象庁「台風に伴う風の特性」）
  const TSPD = 0.05;
  function windT(m, x, y) {
    const w = wind(m, x, y); if (!m.tr || !w.from) return w.speed;
    const r = w.deg * Math.PI / 180, vx = -Math.sin(r) * w.speed + m.tr.dx * TSPD, vy = Math.cos(r) * w.speed + m.tr.dy * TSPD; // 吹いていく向き（画面の座標）
    return Math.hypot(vx, vy);
  }
  const rightOf = (m, c, px, py) => m.tr.dx * (py - c.y) - m.tr.dy * (px - c.x) > 0; // 進む向きの右側か（画面は y が下向き）
  // 地点の天気（はっきり言える所だけ。言えなければ null）
  function weather(m, n) {
    const [, x, y] = city(n), near = (k, r) => m.centers.some((c) => c.k === k && Math.hypot(c.x - x, c.y - y) < r);
    if (m.season === "冬") return SEA_J.includes(n) ? "雪" : SEA_P.includes(n) ? "晴れ" : null;
    if (m.season === "梅雨") { const d = frontDist(m, x, y); return d < 40 ? "雨" : null; }
    if (m.season === "夏") return pressure(m, x, y) > 1016 && y > 300 ? "晴れ" : null;
    const L = m.centers.find((c) => c.k === "L"), dL = Math.hypot(L.x - x, L.y - y), dF = frontDist(m, x, y);
    if (dL < 60 || frontDist(m, x, y, "cold") < 22) return "雨";
    if (near("H", 90) && dL > 200 && dF > 140) return "晴れ";
    return null;
  }
  // ---- 問題 ----
  // q：{ t:種類, map, ask, choices, ans, why, pts:[地点] }
  const pick = (R, a) => a[Math.floor(R() * a.length)];
  const shuffle = (R, a) => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const k = Math.floor(R() * (i + 1)); [a[i], a[k]] = [a[k], a[i]]; } return a; };
  function makeQ(seed, t, hard) {
    if (t === "typhoon") return makeTQ(seed);
    const R = rng(seed);
    for (let tries = 0; tries < 400; tries++) {
      const season = t === "season" ? pick(R, SEASON) : t === "weather" ? pick(R, ["冬", "梅雨", "梅雨", "春・秋", "春・秋", "夏"]) : pick(R, ["冬", "春・秋", "春・秋", "夏"]);
      const m = makeMap(R, season);
      if (t === "season") return { t, map: m, ask: "この天気図は、どの季節によく見られる？", choices: SEASON.slice(), ans: season, why: { 冬: "西に高気圧・東に低気圧の「西高東低」。等圧線が南北にこんで、北西の冷たい風が強い冬の形です。", 夏: "南東の太平洋高気圧が日本をおおう「南高北低」。蒸し暑い晴れが続く夏の形です。", 梅雨: "北と南の高気圧のあいだに前線が東西に長くとどまる（停滞前線）。雨が続く梅雨の形です。", "春・秋": "高気圧と、前線をのばした低気圧が西から東へ交互に通る形。天気が数日おきに変わる春や秋に多い形です。" }[season], pts: [] };
      if (t === "strong") {
        const cs = shuffle(R, CITY).slice(0, 8), sp = cs.map((c) => wind(m, c[1], c[2]).speed);
        for (let a = 0; a < cs.length; a++) for (let b = a + 1; b < cs.length; b++) {
          const hi = sp[a] > sp[b] ? a : b, lo = hi === a ? b : a;
          if (sp[hi] > sp[lo] * 2 && sp[hi] > 0.035 && Math.hypot(cs[a][1] - cs[b][1], cs[a][2] - cs[b][2]) > 120) {
            const ch = shuffle(R, [cs[a][0], cs[b][0]]);
            return { t, map: m, ask: `風が強いのは、${ch[0]}と${ch[1]}のどちら？`, choices: ch, ans: cs[hi][0], why: "等圧線の間がせまい所ほど、気圧の差が大きく、風が強く吹きます。", pts: ch };
          }
        }
        continue;
      }
      if (t === "wind") {
        const c = pick(R, CITY), w = wind(m, c[1], c[2]);
        if (w.speed < 0.03 || Math.abs(((w.deg + 22.5) % 45) - 22.5) > 15) continue; // 向きがはっきりしない所は出さない
        const k = DIR8.indexOf(w.from), others = hard ? DIR8.filter((d) => d !== w.from) : [2, 4, 6].map((o) => DIR8[(k + o) % 8]);
        const choices = hard ? DIR8.slice() : shuffle(R, [w.from, ...others]);
        return { t, map: m, ask: `${c[0]}では、どの方角から風が吹いてくる？`, choices, ans: w.from, why: "風は高気圧から時計回りに吹き出し、低気圧へ反時計回りに吹き込みます（等圧線に沿う向きから、少し低気圧の側へ）。", pts: [c[0]] };
      }
      if (t === "weather") {
        const all = shuffle(R, CITY).map((c) => [c, weather(m, c[0])]).filter((x) => x[1]), kinds = [...new Set(all.map((x) => x[1]))].sort();
        if (!all.length) continue;
        const want = pick(R, kinds), [c, ans] = all.find((x) => x[1] === want); // 晴れ・雨・雪がかたよらないよう、先に答えの種類を選ぶ
        const choices = season === "冬" ? ["晴れ", "雨", "雪"] : ["晴れ", "雨"];
        const why = season === "冬" ? (ans === "雪" ? "冬型では、北西の季節風が日本海で水分をふくみ、山にぶつかって日本海側に雪を降らせます。" : "冬型では、山をこえて乾いた風が吹きおりる太平洋側は、晴れが続きます。") : ans === "雨" ? "低気圧や前線の近くでは、空気がのぼって雲ができ、雨になりやすい。" : "高気圧の中では、空気がおりてきて雲ができにくく、晴れやすい。";
        return { t, map: m, ask: `${c[0]}の天気は？`, choices, ans, why, pts: [c[0]] };
      }
    }
    return null;
  }
  // 台風の問題：進む向きの右と左で風の強さを比べる（7割）か、台風のそばの風向き（3割）
  function makeTQ(seed) {
    const R = rng(seed + 7919);
    for (let tries = 0; tries < 600; tries++) {
      const [a, b] = shuffle(R, CITY).slice(0, 2), d = Math.hypot(a[1] - b[1], a[2] - b[2]);
      if (d < 110 || d > 260) continue;
      const mx = (a[1] + b[1]) / 2, my = (a[2] + b[2]) / 2;
      let nx = -(b[2] - a[2]) / d, ny = (b[1] - a[1]) / d; if (ny < 0) { nx = -nx; ny = -ny; } // 2地点を結ぶ線に直角で、南（画面の下）向き
      const off = 60 + R() * 70, x = mx + nx * off, y = my + ny * off, hx = -nx, hy = -ny; // 台風は南から2地点のあいだへ向かって進む
      if (hy > -0.5 || x < -30 || x > 680 || y < 20 || y > 610) continue; // 北西〜北東へ進むものだけ・地図の中
      const m = makeTyphoon(R, x, y, hx, hy), T = m.centers[1];
      if (R() < 0.7) {
        const sa = windT(m, a[1], a[2]), sb = windT(m, b[1], b[2]);
        if (Math.min(sa, sb) < 0.04 || Math.max(sa, sb) < Math.min(sa, sb) * 1.3) continue; // 差がはっきりしない所は出さない
        const hi = sa > sb ? a : b;
        if (!rightOf(m, T, hi[1], hi[2])) continue; // 計算どおり右側が強いものだけ（説明と合わせる）
        const ch = shuffle(R, [a[0], b[0]]);
        return { t: "typhoon", map: m, ask: `台風が矢印の向きに進む。風がより強くなりやすいのは、${ch[0]}と${ch[1]}のどちら？`, choices: ch, ans: hi[0], why: "台風の進む向きに向かって右側は、台風に吹き込む風と台風の進む速さが重なり、風が強くなります。", pts: ch, src: "jma-typhoon" };
      }
      const c = pick(R, CITY), w = wind(m, c[1], c[2]), dT = Math.hypot(c[1] - T.x, c[2] - T.y);
      if (dT > 180 || dT < 40 || w.speed < 0.05 || Math.abs(((w.deg + 22.5) % 45) - 22.5) > 15) continue; // 台風のそばで、向きがはっきりする所だけ
      const k = DIR8.indexOf(w.from), choices = shuffle(R, [w.from, ...[2, 4, 6].map((o) => DIR8[(k + o) % 8])]);
      return { t: "typhoon", map: m, ask: `台風のそばの${c[0]}では、どの方角から風が吹いてくる？`, choices, ans: w.from, why: "台風のまわりでは、上から見て反時計回りに、中心へ向かって強い風が吹き込みます。", pts: [c[0]], src: "jma-typhoon" };
    }
    return null;
  }
  const B = { rng, seedOf, M, CITY, city, SEA_J, SEA_P, DIR8, SEASON, pressure, grad, wind, weather, frontDist, makeMap, makeQ, makeTyphoon, windT, rightOf, TSPD };
  if (typeof module !== "undefined") module.exports = B; else root.TKG = B;
})(this);
