(function () {
  "use strict";

  const DATA = window.CANON_DATA || { meta: {}, kobun: { pool: {}, sections: [], tables: {}, cards: {} }, kanbun: { pool: {}, sections: [], tables: {}, cards: {} } };
  const RELEASES = window.CANON_RELEASES || [];

  const STORE_LOCAL = "canon-local-v1";
  const STORE_THEME = "canon-theme";
  const STORE_SEEN = "canon:seenRelease";

  const TABS = [
    { id: "kobun", label: "古文", kbd: "Alt+1", icon: "book" },
    { id: "kanbun", label: "漢文", kbd: "Alt+2", icon: "file" },
    { id: "quiz", label: "クイズ", kbd: "Alt+3", icon: "quiz" },
    { id: "stats", label: "グラフ", kbd: "Alt+4", icon: "chart" }
  ];

  const ICONS = {
    book: (fill) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="${fill ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>`,
    file: (fill) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="${fill ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>`,
    quiz: (fill) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="${fill ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" stroke="${fill ? "var(--accent-fg)" : "currentColor"}"/><line x1="12" y1="17" x2="12.01" y2="17" stroke="${fill ? "var(--accent-fg)" : "currentColor"}"/></svg>`,
    chart: (fill) => `<svg width="20" height="20" viewBox="0 0 24 24" fill="${fill ? "currentColor" : "none"}" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="12" width="4" height="9" rx="1"/><rect x="10" y="7" width="4" height="14" rx="1"/><rect x="17" y="3" width="4" height="18" rx="1"/></svg>`
  };

  const PRESETS = [
    { id: "kyote", label: "共テ古文(10問)", subject: "kobun", fmts: ["wayaku", "keigo", "shiki"], range: 0, lv: 0, n: 10 },
    { id: "hito", label: "一橋二次・近代文語文(5問)", subject: "kobun", fmts: ["wajiko"], range: 8, lv: 0, n: 5 },
    { id: "adv", label: "古文和訳・発展(5問)", subject: "kobun", fmts: ["wayaku", "wajiko", "keigo"], range: 0, lv: 2, n: 5 },
    { id: "kanbun", label: "漢文句法・総合(10問)", subject: "kanbun", fmts: null, range: 0, lv: 0, n: 10 },
    { id: "basic", label: "古文基礎固め(10問)", subject: "kobun", fmts: ["imi", "setsu", "ana", "doushi"], range: 0, lv: 0, n: 10 }
  ];

  // App state
  const state = {
    tab: "quiz",
    kobunSec: "all",
    kobunQuery: "",
    kanbunSec: "all",
    kanbunQuery: "",
    cleared: {},
    weak: {},
    stats: null,
    statsStatus: "idle", // idle | loading | ok | error
    buildInfo: "",
    syncState: "ok", // ok | busy | err
    quiz: {
      phase: "setup", // setup | play | result
      subject: "kobun",
      fmts: { kobun: ["wayaku", "wajiko", "keigo", "shiki"], kanbun: Object.keys(DATA.kanbun.pool || {}) },
      range: 0,
      lv: 0,
      n: 5,
      list: [],
      i: 0,
      mode: "normal",
      tipKey: ""
    }
  };

  // Helpers
  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${day}`;
  }
  function formatAppInfoDate(iso) {
    if (!iso) return "ローカル実行";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    let h = d.getHours();
    const ap = h >= 12 ? "pm" : "am";
    h = h % 12 || 12;
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy}, ${h}:${min} ${ap}`;
  }
  function shuffle(a) {
    const out = a.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }
  function showToast(msg) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => { el.hidden = true; }, 2600);
  }
  function setSyncDot(st) {
    state.syncState = st;
    const el = document.getElementById("sync-status-mob");
    if (el) el.className = "sync-dot" + (st === "ok" ? "" : " " + st);
  }

  // Local + Server persistence
  function loadLocal() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORE_LOCAL) || "null");
      if (raw) {
        if (raw.cleared) state.cleared = raw.cleared;
        if (raw.weak) state.weak = raw.weak;
      }
    } catch (e) {}
  }
  function saveLocal() {
    try {
      localStorage.setItem(STORE_LOCAL, JSON.stringify({ cleared: state.cleared, weak: state.weak }));
    } catch (e) {}
  }
  async function fetchServerState() {
    setSyncDot("busy");
    try {
      const res = await fetch("/api/state");
      if (!res.ok) throw new Error("HTTP " + res.status);
      const data = await res.json();
      state.cleared = Object.assign({}, state.cleared, data.cleared || {});
      state.weak = Object.assign({}, state.weak, data.weak || {});
      saveLocal();
      setSyncDot("ok");
      if (state.tab === "quiz" && state.quiz.phase === "setup") render();
    } catch (e) {
      setSyncDot("err");
    }
  }
  async function fetchBuildInfo() {
    try {
      const res = await fetch("/api/build-info");
      if (res.ok) {
        const d = await res.json();
        state.buildInfo = d.built_at || "";
      }
    } catch (e) {}
  }
  async function fetchStats() {
    state.statsStatus = state.stats ? "ok" : "loading";
    if (state.tab === "stats") render();
    try {
      const res = await fetch("/api/stats?days=14");
      if (!res.ok) throw new Error("HTTP " + res.status);
      state.stats = await res.json();
      state.statsStatus = "ok";
    } catch (e) {
      if (!state.stats) state.statsStatus = "error";
    }
    if (state.tab === "stats") render();
  }
  async function postAttempt(entry, ok, idk) {
    if (ok) state.cleared[entry.id] = 1;
    else delete state.cleared[entry.id];
    (entry.w || []).forEach((k) => {
      const old = state.weak[k] || 0;
      const nv = ok ? Math.max(0, old - 1) : Math.min(8, old + 2);
      if (nv > 0) state.weak[k] = nv;
      else delete state.weak[k];
    });
    saveLocal();
    setSyncDot("busy");
    try {
      await fetch("/api/attempt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: entry.subject,
          fmt: entry.fmt,
          question_id: entry.id,
          correct: !!ok,
          idk: !!idk,
          lv: entry.lv || 1,
          is_kindai: !!entry.is_kindai,
          weak_keys: entry.w || [],
          local_date: todayStr()
        })
      });
      setSyncDot("ok");
    } catch (e) {
      setSyncDot("err");
    }
  }

  // Theme
  function applyTheme(mode) {
    if (mode === "light" || mode === "dark") {
      document.documentElement.setAttribute("data-theme", mode);
      localStorage.setItem(STORE_THEME, mode);
    } else {
      document.documentElement.removeAttribute("data-theme");
      localStorage.removeItem(STORE_THEME);
    }
  }
  function getTheme() {
    return localStorage.getItem(STORE_THEME) || "auto";
  }

  // Update Banner
  function renderUpdateBanner() {
    const el = document.getElementById("update-banner");
    if (!RELEASES.length) { el.hidden = true; return; }
    const latest = RELEASES[0];
    if (localStorage.getItem(STORE_SEEN) === latest.id) { el.hidden = true; return; }
    el.hidden = false;
    el.innerHTML = `
      <b>アップデート (${esc(latest.date)})</b>
      <span>${esc(latest.title)}</span>
      <div class="update-banner-actions">
        <button type="button" class="btn sm" id="ub-open">内容を見る</button>
        <button type="button" class="btn sm ghost" id="ub-close" aria-label="閉じる">閉じる</button>
      </div>
    `;
    document.getElementById("ub-open").onclick = () => {
      localStorage.setItem(STORE_SEEN, latest.id);
      el.hidden = true;
      openChangelogModal();
    };
    document.getElementById("ub-close").onclick = () => {
      localStorage.setItem(STORE_SEEN, latest.id);
      el.hidden = true;
    };
  }

  // Navigation
  function renderNav() {
    const side = document.getElementById("side-nav");
    const mob = document.getElementById("mob-nav");
    side.innerHTML = TABS.map((t) => {
      const act = state.tab === t.id;
      return `<button type="button" class="nav-item${act ? " active" : ""}" data-tab="${t.id}">
        ${ICONS[t.icon](act)}<span>${t.label}</span><span class="nav-kbd">${t.kbd}</span>
      </button>`;
    }).join("");
    mob.innerHTML = TABS.map((t) => {
      const act = state.tab === t.id;
      return `<button type="button" class="mob-tab${act ? " active" : ""}" data-tab="${t.id}">
        ${ICONS[t.icon](act)}<span>${t.label}</span>
      </button>`;
    }).join("");
    document.querySelectorAll("[data-tab]").forEach((b) => {
      b.onclick = () => switchTab(b.dataset.tab);
    });
  }
  function switchTab(id) {
    state.tab = id;
    renderNav();
    render();
    if (id === "stats") fetchStats();
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  // Reference Tab (Kobun / Kanbun)
  function renderRef(subject) {
    const src = DATA[subject];
    const secKey = subject === "kobun" ? state.kobunSec : state.kanbunSec;
    const query = (subject === "kobun" ? state.kobunQuery : state.kanbunQuery).trim().toLowerCase();
    const title = subject === "kobun" ? "古文まとめ（助動詞・助詞・敬語・和歌・近代文語文）" : "漢文まとめ（再読文字・句法・助字）";

    const chips = [{ id: "all", title: "すべて" }].concat(src.sections.map((s) => ({ id: s.id, title: s.title })));
    const visibleSecs = src.sections.filter((s) => secKey === "all" || s.id === secKey);

    let html = `
      <div class="page-head">
        <h1>${esc(title)}</h1>
        <button type="button" class="btn sm primary" id="ref-go-quiz">この科目のクイズへ</button>
      </div>
      <div class="search-bar">
        <input type="search" class="search-input" id="ref-search" value="${esc(query)}" placeholder="語・解説を検索 (/ キーで移動)" aria-label="検索">
      </div>
      <div class="chips">
        ${chips.map((c) => `<button type="button" class="chip" data-sec="${esc(c.id)}" aria-pressed="${secKey === c.id}">${esc(c.title)}</button>`).join("")}
      </div>
      <div id="ref-body">
        ${visibleSecs.map((s) => `<section class="ref-sec" data-sec-id="${esc(s.id)}">${s.html}</section>`).join("")}
      </div>
    `;
    const main = document.getElementById("main-content");
    main.innerHTML = html;

    // Hydrate dynamically populated tables from original HTML
    if (subject === "kobun") {
      const tb = main.querySelector("#tb");
      if (tb && src.tables.tb) tb.innerHTML = src.tables.tb;
      const jtb = main.querySelector("#jtb");
      if (jtb && src.tables.jtb) jtb.innerHTML = src.tables.jtb;
      // Remove original controls that conflict with Canon's top filter
      main.querySelectorAll(".controls, .legend").forEach((el) => { el.style.display = "none"; });
    } else {
      Object.entries(src.tables || {}).forEach(([id, inner]) => {
        const el = main.querySelector("#" + id);
        if (el) el.innerHTML = inner;
      });
      main.querySelectorAll(".controls, #kchips").forEach((el) => { el.style.display = "none"; });
      main.querySelectorAll(".ref-sec tbody").forEach((tbody) => {
        tbody.addEventListener("click", (ev) => {
          const btn = ev.target.closest(".exbtn");
          if (!btn) return;
          const nextRow = btn.closest("tr")?.nextElementSibling;
          if (!nextRow || !nextRow.classList.contains("ex")) return;
          const open = !nextRow.classList.contains("open");
          nextRow.classList.toggle("open", open);
          btn.setAttribute("aria-expanded", String(open));
        });
      });
    }

    // Apply search filter to rows and cards
    if (query) {
      main.querySelectorAll(".ref-sec tbody tr:not(.group), .ref-sec .card").forEach((el) => {
        const txt = (el.textContent || "").toLowerCase();
        el.hidden = !txt.includes(query);
      });
    }

    document.getElementById("ref-go-quiz").onclick = () => {
      state.quiz.subject = subject;
      state.quiz.phase = "setup";
      switchTab("quiz");
    };
    const sInput = document.getElementById("ref-search");
    sInput.oninput = (e) => {
      if (subject === "kobun") state.kobunQuery = e.target.value;
      else state.kanbunQuery = e.target.value;
      renderRef(subject);
      const ni = document.getElementById("ref-search");
      ni.focus();
      ni.setSelectionRange(ni.value.length, ni.value.length);
    };
    main.querySelectorAll("[data-sec]").forEach((b) => {
      b.onclick = () => {
        if (subject === "kobun") state.kobunSec = b.dataset.sec;
        else state.kanbunSec = b.dataset.sec;
        renderRef(subject);
      };
    });
  }

  // Quiz Engine
  function inRange(e, range) {
    if (e.subject === "kanbun") return range === 0 || (e.gi || []).includes(range - 1);
    if (range === 0) return true;
    if (range >= 1 && range <= 5) return (e.gi || []).includes(range - 1);
    if (range === 6) return (e.gi || []).includes(9);
    if (range === 7) return (e.gi || []).includes(10);
    if (range === 8) return (e.gi || []).includes(11);
    return true;
  }
  function drawEntries(subject, fmts, range, lv, n) {
    const pool = DATA[subject].pool;
    const active = fmts.filter((f) => pool[f] && pool[f].some((e) => inRange(e, range) && (lv === 0 || (e.lv || 1) === lv)));
    if (!active.length) return [];
    const per = {};
    active.forEach((f) => {
      per[f] = pool[f].filter((e) => inRange(e, range) && (lv === 0 || (e.lv || 1) === lv));
    });
    const pickPrioritized = (arr, k) => {
      const un = shuffle(arr.filter((e) => !state.cleared[e.id]));
      const dn = shuffle(arr.filter((e) => state.cleared[e.id]));
      return un.concat(dn).slice(0, k);
    };
    const b0 = Math.floor(n / active.length);
    const rem = n % active.length;
    let out = [];
    shuffle(active).forEach((f, idx) => {
      out = out.concat(pickPrioritized(per[f], b0 + (idx < rem ? 1 : 0)));
    });
    if (out.length < n) {
      const used = new Set(out.map((e) => e.id));
      const rest = [];
      active.forEach((f) => per[f].forEach((e) => { if (!used.has(e.id)) rest.push(e); }));
      out = out.concat(pickPrioritized(rest, n - out.length));
    }
    return shuffle(out);
  }
  function drawWeak(subject, n) {
    const pool = DATA[subject].pool;
    const cand = [];
    Object.values(pool).forEach((arr) => {
      arr.forEach((e) => {
        let s = 0;
        (e.w || []).forEach((k) => { s = Math.max(s, state.weak[k] || 0); });
        if (s > 0) cand.push({ e, s: s + (state.cleared[e.id] ? 0 : 0.5) + Math.random() * 0.5 });
      });
    });
    cand.sort((a, b) => b.s - a.s);
    return cand.slice(0, n).map((x) => x.e);
  }
  function makeInst(e) {
    if (e.fmt === "wajiko") {
      return { e, opts: [], ans: 0, pick: -1, rev: false, memo: "", marks: (e.pts || []).map(() => null), saved: false };
    }
    const ds = (e.d || []).filter((x) => x !== e.a);
    const opts = shuffle([e.a].concat(shuffle(ds).slice(0, Math.min(3, ds.length))));
    return { e, opts, ans: opts.indexOf(e.a), pick: -1 };
  }
  function startQuiz(entries, mode) {
    if (!entries.length) { showToast("条件に合う問題がありません"); return; }
    state.quiz.list = entries.map(makeInst);
    state.quiz.i = 0;
    state.quiz.phase = "play";
    state.quiz.mode = mode || "normal";
    state.quiz.tipKey = "";
    render();
  }

  function renderQuizSetup() {
    const qz = state.quiz;
    const subj = qz.subject;
    const pool = DATA[subj].pool;
    const fmtLabels = subj === "kobun" ? DATA.meta.kobun_fmt_label : DATA.meta.kanbun_fmt_label;
    const rangeLabels = subj === "kobun" ? DATA.meta.kobun_range_label : DATA.meta.kanbun_range_label;
    const fmtKeys = Object.keys(pool);
    const selFmts = qz.fmts[subj] || fmtKeys;
    const weakCnt = Object.keys(state.weak).filter((k) => state.weak[k] > 0).length;

    const main = document.getElementById("main-content");
    main.innerHTML = `
      <div class="page-head">
        <h1>クイズ演習</h1>
        <div class="chips" style="margin:0">
          <button type="button" class="chip" data-subj="kobun" aria-pressed="${subj === "kobun"}">古文 (${DATA.meta.kobun_total}問)</button>
          <button type="button" class="chip" data-subj="kanbun" aria-pressed="${subj === "kanbun"}">漢文 (${DATA.meta.kanbun_total}問)</button>
        </div>
      </div>

      <div class="qz-grid">
        <div class="card">
          <h3>1クリック開始プリセット</h3>
          <div class="chips" style="margin-bottom:4px">
            ${PRESETS.map((p) => `<button type="button" class="btn sm" data-preset="${p.id}">${esc(p.label)}</button>`).join("")}
            <button type="button" class="btn sm danger" id="btn-weak-start" ${weakCnt ? "" : "disabled"}>苦手だけ復習 (${weakCnt}語)</button>
          </div>

          <div class="qz-lbl">出題形式（未クリア問題を優先出題）</div>
          <div class="qz-checks">
            ${fmtKeys.map((f) => {
              const arr = pool[f] || [];
              const clr = arr.filter((e) => state.cleared[e.id]).length;
              const on = selFmts.includes(f);
              return `<label class="qz-chk${on ? " on" : ""}">
                <input type="checkbox" data-fmt="${esc(f)}" ${on ? "checked" : ""}>
                <span>${esc(fmtLabels[f] || f)}</span>
                <span class="chk-rate">${clr}/${arr.length}</span>
              </label>`;
            }).join("")}
          </div>

          <div class="qz-lbl">範囲</div>
          <div class="chips">
            ${rangeLabels.map((lbl, idx) => `<button type="button" class="chip" data-range="${idx}" aria-pressed="${qz.range === idx}">${esc(lbl)}</button>`).join("")}
          </div>

          ${subj === "kobun" ? `
            <div class="qz-lbl">難易度</div>
            <div class="chips">
              ${["すべて", "標準", "発展"].map((lbl, idx) => `<button type="button" class="chip" data-lv="${idx}" aria-pressed="${qz.lv === idx}">${lbl}</button>`).join("")}
            </div>
          ` : ""}

          <div class="qz-lbl">問題数</div>
          <div class="chips">
            ${[5, 10, 20, 30].map((n) => `<button type="button" class="chip" data-n="${n}" aria-pressed="${qz.n === n}">${n}問</button>`).join("")}
          </div>

          <div style="margin-top:16px;display:flex;gap:10px;flex-wrap:wrap">
            <button type="button" class="btn primary" id="btn-start-quiz">この条件で開始 (Enter)</button>
          </div>
        </div>

        <div class="card">
          <h3>操作のコツ</h3>
          <ul style="margin:0;padding-left:20px;font-size:.9rem;color:var(--muted);display:flex;flex-direction:column;gap:8px">
            <li>選択式はキーボード <b>1〜4</b> で回答、<b>0</b> で「わからない」（当てずっぽう正解を防止）</li>
            <li>自己採点式は自分の訳を書いてから <b>Enter</b> で訳例表示、ポイントごとに <b>O / X</b> で採点</li>
            <li>解答結果はクラウドに自動保存され、グラフタブとPC/スマホ間で同期される</li>
            <li>一橋二次対策は「一橋二次・近代文語文(5問)」プリセットからすぐ開始できる</li>
          </ul>
        </div>
      </div>
    `;

    main.querySelectorAll("[data-subj]").forEach((b) => {
      b.onclick = () => { qz.subject = b.dataset.subj; qz.range = 0; qz.lv = 0; render(); };
    });
    main.querySelectorAll("[data-preset]").forEach((b) => {
      b.onclick = () => {
        const p = PRESETS.find((x) => x.id === b.dataset.preset);
        if (!p) return;
        const fmts = p.fmts || Object.keys(DATA[p.subject].pool);
        startQuiz(drawEntries(p.subject, fmts, p.range, p.lv, p.n), "preset");
      };
    });
    document.getElementById("btn-weak-start").onclick = () => {
      startQuiz(drawWeak(subj, qz.n), "weak");
    };
    main.querySelectorAll("[data-fmt]").forEach((cb) => {
      cb.onchange = () => {
        const f = cb.dataset.fmt;
        let cur = (qz.fmts[subj] || []).slice();
        if (cb.checked && !cur.includes(f)) cur.push(f);
        if (!cb.checked) cur = cur.filter((x) => x !== f);
        qz.fmts[subj] = cur;
        render();
      };
    });
    main.querySelectorAll("[data-range]").forEach((b) => {
      b.onclick = () => { qz.range = Number(b.dataset.range); render(); };
    });
    main.querySelectorAll("[data-lv]").forEach((b) => {
      b.onclick = () => { qz.lv = Number(b.dataset.lv); render(); };
    });
    main.querySelectorAll("[data-n]").forEach((b) => {
      b.onclick = () => { qz.n = Number(b.dataset.n); render(); };
    });
    document.getElementById("btn-start-quiz").onclick = () => {
      startQuiz(drawEntries(subj, qz.fmts[subj] || [], qz.range, qz.lv, qz.n), "normal");
    };
  }

  function renderQuizPlay() {
    const qz = state.quiz;
    const item = qz.list[qz.i];
    const e = item.e;
    const pct = Math.round(((qz.i + 1) / qz.list.length) * 100);
    const fmtLabels = e.subject === "kobun" ? DATA.meta.kobun_fmt_label : DATA.meta.kanbun_fmt_label;
    const main = document.getElementById("main-content");

    if (e.fmt === "wajiko") {
      const allMarked = item.marks.every((m) => m !== null);
      main.innerHTML = `
        <div class="qz-play card">
          <div class="qz-meta">
            <span>${esc(fmtLabels[e.fmt] || e.fmt)} ${e.is_kindai ? "・近代文語文" : ""}</span>
            <span>${qz.i + 1} / ${qz.list.length} 問</span>
            <button type="button" class="btn sm ghost" id="qz-quit">終了 (Esc)</button>
          </div>
          <div class="qz-bar"><i style="width:${pct}%"></i></div>
          <div class="qz-q">${e.q}</div>
          ${!item.rev ? `
            <textarea class="qz-memo" id="qz-memo" placeholder="自分の現代語訳を入力（空のまま訳例を見ることも可）">${esc(item.memo)}</textarea>
            <button type="button" class="btn primary" id="qz-rev">訳例と採点ポイントを見る (Enter)</button>
          ` : `
            ${item.memo ? `<div class="qz-fb" style="margin-top:0;margin-bottom:10px"><b>自分の訳:</b> ${esc(item.memo)}</div>` : ""}
            <div class="qz-fb ok" style="margin-top:0;margin-bottom:12px"><b>訳例:</b> ${esc(e.tr)}</div>
            ${(e.pts || []).map((pt, idx) => `
              <div class="qz-pt">
                <div class="qz-pt-head">
                  <b>${esc(pt.h)}</b>
                  <div class="qz-mk">
                    <button type="button" data-mk="${idx}:1" class="${item.marks[idx] === true ? "on-ok" : ""}">○</button>
                    <button type="button" data-mk="${idx}:0" class="${item.marks[idx] === false ? "on-ng" : ""}">×</button>
                  </div>
                </div>
                <div style="font-size:.86rem;color:var(--muted);margin-top:6px">${esc(pt.x)}</div>
              </div>
            `).join("")}
            <div style="margin-top:14px;display:flex;gap:10px;align-items:center;flex-wrap:wrap">
              <button type="button" class="btn primary" id="qz-next" ${allMarked ? "" : "disabled"}>${qz.i + 1 < qz.list.length ? "次の問題へ (Enter)" : "結果を見る (Enter)"}</button>
              ${!allMarked ? `<span style="font-size:.82rem;color:var(--muted)">すべてのポイントに ○ / × を付けてください</span>` : ""}
            </div>
          `}
        </div>
      `;
      document.getElementById("qz-quit").onclick = () => { qz.phase = "setup"; render(); };
      if (!item.rev) {
        const memoEl = document.getElementById("qz-memo");
        memoEl.oninput = (ev) => { item.memo = ev.target.value; };
        document.getElementById("qz-rev").onclick = () => { item.rev = true; render(); };
      } else {
        main.querySelectorAll("[data-mk]").forEach((b) => {
          b.onclick = () => {
            const [idx, val] = b.dataset.mk.split(":");
            item.marks[Number(idx)] = val === "1";
            render();
          };
        });
        const nextBtn = document.getElementById("qz-next");
        if (nextBtn) {
          nextBtn.onclick = () => {
            if (!item.saved) {
              const ok = item.marks.every((m) => m === true);
              item.saved = true;
              postAttempt(e, ok, false);
            }
            if (qz.i + 1 < qz.list.length) { qz.i++; render(); }
            else { qz.phase = "result"; render(); }
          };
        }
      }
      return;
    }

    // Multiple Choice
    const answered = item.pick !== -1;
    const isOk = item.pick === item.ans;
    const isIdk = item.pick === -2;
    const cardHtml = e.g && DATA[e.subject].cards[e.g] ? DATA[e.subject].cards[e.g] : "";

    main.innerHTML = `
      <div class="qz-play card">
        <div class="qz-meta">
          <span>${esc(fmtLabels[e.fmt] || e.fmt)}</span>
          <span>${qz.i + 1} / ${qz.list.length} 問</span>
          <button type="button" class="btn sm ghost" id="qz-quit">終了 (Esc)</button>
        </div>
        <div class="qz-bar"><i style="width:${pct}%"></i></div>
        <div class="qz-q">${e.q}</div>
        ${e.x ? e.x : ""}
        <div class="qz-opts">
          ${item.opts.map((opt, idx) => {
            let cls = "qz-opt";
            if (answered) {
              if (idx === item.ans) cls += " ok";
              else if (idx === item.pick) cls += " ng";
            }
            return `<button type="button" class="${cls}" data-opt="${idx}" aria-disabled="${answered}">
              <em>${idx + 1}</em><span>${esc(opt)}</span>
            </button>`;
          }).join("")}
          <button type="button" class="qz-opt idk${isIdk ? " ng" : ""}" data-opt="-2" aria-disabled="${answered}">
            わからない（解説を見る / キー 0）
          </button>
        </div>
        ${answered ? `
          <div class="qz-fb ${isOk ? "ok" : "ng"}">
            <div style="font-weight:700;margin-bottom:6px">${isOk ? "正解" : (isIdk ? "未習得として記録（正解: " + esc(e.a) + "）" : "不正解（正解: " + esc(e.a) + "）")}</div>
            <div>${e.e}</div>
            ${e.t ? `<div style="margin-top:6px;color:var(--muted)">訳: ${esc(e.t)}</div>` : ""}
          </div>
          ${cardHtml && state.quiz.tipKey === e.g ? `<div class="card" style="margin-top:10px">${cardHtml}</div>` : ""}
          <div style="margin-top:14px;display:flex;gap:10px;flex-wrap:wrap">
            <button type="button" class="btn primary" id="qz-next">${qz.i + 1 < qz.list.length ? "次の問題へ (Enter)" : "結果を見る (Enter)"}</button>
            ${cardHtml ? `<button type="button" class="btn ghost" id="qz-tip">${state.quiz.tipKey === e.g ? "コツを閉じる" : "見分けるコツを見る"}</button>` : ""}
          </div>
        ` : ""}
      </div>
    `;

    document.getElementById("qz-quit").onclick = () => { qz.phase = "setup"; render(); };
    if (!answered) {
      main.querySelectorAll("[data-opt]").forEach((b) => {
        b.onclick = () => answerChoice(Number(b.dataset.opt));
      });
    } else {
      document.getElementById("qz-next").onclick = () => {
        state.quiz.tipKey = "";
        if (qz.i + 1 < qz.list.length) { qz.i++; render(); }
        else { qz.phase = "result"; render(); }
      };
      const tipBtn = document.getElementById("qz-tip");
      if (tipBtn) {
        tipBtn.onclick = () => {
          state.quiz.tipKey = state.quiz.tipKey === e.g ? "" : e.g;
          render();
        };
      }
    }
  }

  function answerChoice(idx) {
    const item = state.quiz.list[state.quiz.i];
    if (!item || item.pick !== -1) return;
    item.pick = idx;
    const ok = idx === item.ans;
    const idk = idx === -2;
    postAttempt(item.e, ok, idk);
    render();
  }

  function renderQuizResult() {
    const qz = state.quiz;
    let okCnt = 0, idkCnt = 0;
    qz.list.forEach((it) => {
      if (it.e.fmt === "wajiko") {
        if (it.marks.every((m) => m === true)) okCnt++;
      } else {
        if (it.pick === it.ans) okCnt++;
        if (it.pick === -2) idkCnt++;
      }
    });
    const rate = Math.round((okCnt * 100) / qz.list.length);
    const main = document.getElementById("main-content");
    main.innerHTML = `
      <div class="qz-play card">
        <h3>演習結果</h3>
        <div class="kpi-val" style="margin:8px 0">${okCnt} / ${qz.list.length} 問正解 (${rate}%)</div>
        <p style="margin:0 0 16px;color:var(--muted);font-size:.9rem">「わからない」選択: ${idkCnt}問 / 結果は自動でクラウド同期されました</p>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button type="button" class="btn primary" id="res-again">もう1セット解く</button>
          <button type="button" class="btn" id="res-stats">グラフを見る</button>
          <button type="button" class="btn ghost" id="res-setup">設定に戻る</button>
        </div>
      </div>
    `;
    document.getElementById("res-again").onclick = () => {
      const subj = qz.subject;
      startQuiz(drawEntries(subj, qz.fmts[subj] || Object.keys(DATA[subj].pool), qz.range, qz.lv, qz.n), qz.mode);
    };
    document.getElementById("res-stats").onclick = () => { qz.phase = "setup"; switchTab("stats"); };
    document.getElementById("res-setup").onclick = () => { qz.phase = "setup"; render(); };
  }

  // Stats Tab
  function renderStats() {
    const main = document.getElementById("main-content");
    if (state.statsStatus === "loading") {
      main.innerHTML = `<div class="page-head"><h1>グラフ・進捗</h1></div><div class="state-box">進捗データを読み込んでいます...</div>`;
      return;
    }
    if (state.statsStatus === "error") {
      main.innerHTML = `<div class="page-head"><h1>グラフ・進捗</h1></div><div class="state-box">進捗データの取得に失敗しました。再読み込みしてください。<div style="margin-top:12px"><button type="button" class="btn sm" id="stats-retry">再読み込み</button></div></div>`;
      document.getElementById("stats-retry").onclick = () => fetchStats();
      return;
    }

    // Build fallback local stats if server hasn't returned yet
    const s = state.stats || {
      cleared_total: Object.keys(state.cleared).length,
      attempts_total: 0,
      buckets: { kobun_wayaku: 0, kobun_wajiko_koten: 0, kobun_wajiko_kindai: 0, kobun_keigo: 0, kobun_shiki: 0, kanbun_quiz: 0 },
      recent7: { total: 0, accuracy: null, accuracy_diff: null, idk_rate: null },
      daily: [],
      weak_top: Object.entries(state.weak).sort((a, b) => b[1] - a[1]).slice(0, 10).map(([k, v]) => ({ weak_key: k, score: v }))
    };

    const grandTotal = DATA.meta.grand_total || 1;
    const clrPct = Math.round((s.cleared_total * 100) / grandTotal);
    const kindaiTotal = (DATA.kobun.pool.wajiko || []).filter((e) => e.is_kindai).length || 15;
    const kotenWajikoTotal = (DATA.kobun.pool.wajiko || []).length - kindaiTotal;
    const kindaiPct = Math.round(((s.buckets.kobun_wajiko_kindai || 0) * 100) / kindaiTotal);

    const bars = [
      { label: "古文 和訳(選択式・共テ型)", done: s.buckets.kobun_wayaku || 0, total: (DATA.kobun.pool.wayaku || []).length, cls: "" },
      { label: "古文 和訳(自己採点・古典)", done: s.buckets.kobun_wajiko_koten || 0, total: kotenWajikoTotal, cls: "" },
      { label: "一橋二次 近代文語文", done: s.buckets.kobun_wajiko_kindai || 0, total: kindaiTotal, cls: "" },
      { label: "古文 敬語・主語判定", done: s.buckets.kobun_keigo || 0, total: (DATA.kobun.pool.keigo || []).length, cls: "" },
      { label: "古文 識別(基礎＋上級)", done: s.buckets.kobun_shiki || 0, total: (DATA.kobun.pool.shiki || []).length, cls: "" },
      { label: "漢文 句法・再読文字・和訳", done: s.buckets.kanbun_quiz || 0, total: DATA.meta.kanbun_total || 1, cls: "kanbun" }
    ];

    // Daily SVG Chart
    const daily = s.daily || [];
    const maxTot = Math.max(5, ...daily.map((d) => d.total || 0));
    const svgW = 360, svgH = 150, padL = 24, padB = 22, chartW = svgW - padL - 10, chartH = svgH - padB - 14;
    const step = daily.length ? chartW / daily.length : 20;
    const barSvg = daily.map((d, idx) => {
      const h = Math.round(((d.total || 0) / maxTot) * chartH);
      const x = padL + idx * step + 3;
      const y = 14 + chartH - h;
      const fill = idx === daily.length - 1 ? "var(--accent)" : "var(--accent-soft)";
      return `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${Math.max(6, step - 6).toFixed(1)}" height="${h}" rx="2" fill="${fill}"><title>${d.date}: ${d.total}問 (正答${d.correct})</title></rect>`;
    }).join("");
    const linePts = daily.map((d, idx) => {
      if (d.accuracy == null) return null;
      const x = padL + idx * step + step / 2;
      const y = 14 + chartH - (d.accuracy / 100) * chartH;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    }).filter(Boolean).join(" ");

    main.innerHTML = `
      <div class="page-head">
        <h1>グラフ・進捗</h1>
        <button type="button" class="btn sm ghost" id="stats-refresh">更新</button>
      </div>

      <div class="kpi-grid">
        <div class="card">
          <div class="kpi-lbl">全体クリア率</div>
          <div class="kpi-val">${clrPct}%</div>
          <div class="kpi-sub">${s.cleared_total} / ${grandTotal} 問</div>
        </div>
        <div class="card">
          <div class="kpi-lbl">一橋二次・近代文語文</div>
          <div class="kpi-val">${kindaiPct}%</div>
          <div class="kpi-sub">${s.buckets.kobun_wajiko_kindai || 0} / ${kindaiTotal} 問クリア</div>
        </div>
        <div class="card">
          <div class="kpi-lbl">直近7日の正答率</div>
          <div class="kpi-val">${s.recent7.accuracy != null ? s.recent7.accuracy + "%" : "—"}</div>
          <div class="kpi-sub">${s.recent7.total}問演習${s.recent7.accuracy_diff != null ? " (前週比 " + (s.recent7.accuracy_diff >= 0 ? "+" : "") + s.recent7.accuracy_diff + "pt)" : ""}</div>
        </div>
        <div class="card">
          <div class="kpi-lbl">「わからない」率</div>
          <div class="kpi-val">${s.recent7.idk_rate != null ? s.recent7.idk_rate + "%" : "—"}</div>
          <div class="kpi-sub">当てずっぽう防止指標</div>
        </div>
      </div>

      <div class="stats-grid">
        <div class="card">
          <h3>形式別クリア率</h3>
          <div class="bar-list">
            ${bars.map((b) => {
              const p = b.total ? Math.round((b.done * 100) / b.total) : 0;
              return `<div>
                <div class="bar-head"><span>${esc(b.label)}</span><b>${b.done} / ${b.total} (${p}%)</b></div>
                <div class="bar-track"><div class="bar-fill ${b.cls}" style="width:${p}%"></div></div>
              </div>`;
            }).join("")}
          </div>
        </div>

        <div style="display:flex;flex-direction:column;gap:16px">
          <div class="card">
            <h3>日別演習数・正答率推移（直近14日）</h3>
            ${s.attempts_total === 0 ? `<div style="color:var(--muted);font-size:.88rem;padding:24px 0;text-align:center">まだ演習記録がありません。クイズを解くとここに推移が表示されます。</div>` : `
              <svg class="chart-svg" viewBox="0 0 ${svgW} ${svgH}" role="img" aria-label="日別演習数と正答率のグラフ">
                <line x1="${padL}" y1="${14 + chartH}" x2="${svgW - 10}" y2="${14 + chartH}" stroke="var(--line)" stroke-width="1"/>
                <line x1="${padL}" y1="${14 + chartH / 2}" x2="${svgW - 10}" y2="${14 + chartH / 2}" stroke="var(--surface2)" stroke-width="1"/>
                ${barSvg}
                ${linePts ? `<polyline fill="none" stroke="var(--accent)" stroke-width="2.5" points="${linePts}"/>` : ""}
              </svg>
            `}
          </div>

          <div class="card">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">
              <h3 style="margin:0">苦手トップ</h3>
              <button type="button" class="btn sm" id="stats-weak-go" ${(s.weak_top || []).length ? "" : "disabled"}>苦手を復習</button>
            </div>
            ${!(s.weak_top || []).length ? `<div style="color:var(--muted);font-size:.88rem">現在、苦手な語は登録されていません。</div>` : s.weak_top.map((w) => `
              <div class="weak-row">
                <span>${esc(w.weak_key)}</span>
                <span class="badge-ng">苦手度 ${w.score}</span>
              </div>
            `).join("")}
          </div>
        </div>
      </div>
    `;
    document.getElementById("stats-refresh").onclick = () => fetchStats();
    document.getElementById("stats-weak-go").onclick = () => {
      state.tab = "quiz";
      renderNav();
      startQuiz(drawWeak("kobun", 5), "weak");
    };
  }

  // Modals (Settings / Changelog / Shortcuts)
  function openModal(title, html) {
    document.getElementById("modal-title").textContent = title;
    document.getElementById("modal-body").innerHTML = html;
    document.getElementById("modal-backdrop").hidden = false;
  }
  function closeModal() {
    document.getElementById("modal-backdrop").hidden = true;
  }
  function openChangelogModal() {
    const html = RELEASES.map((r) => `
      <div class="card" style="padding:12px 14px">
        <div style="font-size:.8rem;color:var(--muted)">${esc(r.date)}</div>
        <div style="font-weight:700;margin:2px 0 8px">${esc(r.title)}</div>
        <ul style="margin:0;padding-left:18px;font-size:.88rem">${r.items.map((it) => `<li>${esc(it)}</li>`).join("")}</ul>
      </div>
    `).join("");
    openModal("更新履歴", html);
  }
  function openShortcutsModal() {
    const rows = [
      ["Alt + 1〜4", "古文 / 漢文 / クイズ / グラフへ切替"],
      ["/", "検索欄へフォーカス（古文・漢文タブ）"],
      [",", "設定を開く"],
      ["?", "このショートカット一覧を開く"],
      ["Esc", "モーダルを閉じる / クイズを中断"],
      ["1〜4", "選択肢を選んで回答（クイズ中）"],
      ["0", "「わからない」を選択（クイズ中）"],
      ["Enter", "次へ進む / 訳例を表示"]
    ];
    openModal("キーボードショートカット", `
      <table style="width:100%;border-collapse:collapse;font-size:.9rem">
        ${rows.map(([k, d]) => `<tr><td style="padding:8px 6px;border-bottom:1px solid var(--line);font-weight:700;white-space:nowrap">${esc(k)}</td><td style="padding:8px 6px;border-bottom:1px solid var(--line);color:var(--muted)">${esc(d)}</td></tr>`).join("")}
      </table>
    `);
  }
  function openSettingsModal() {
    const curTheme = getTheme();
    const latest = RELEASES[0] || { title: "v1.0" };
    openModal("設定", `
      <div>
        <div class="qz-lbl" style="margin-top:0">外観テーマ</div>
        <div class="chips" style="margin-bottom:0">
          ${[["auto", "システム自動"], ["light", "ライト"], ["dark", "ダーク"]].map(([val, lbl]) => `
            <button type="button" class="chip" data-set-theme="${val}" aria-pressed="${curTheme === val}">${lbl}</button>
          `).join("")}
        </div>
      </div>

      <div>
        <div class="qz-lbl" style="margin-top:0">学習データの管理</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button type="button" class="btn sm danger" id="set-reset-weak">苦手リストをリセット</button>
          <button type="button" class="btn sm danger" id="set-reset-cleared">クリア履歴をリセット</button>
        </div>
      </div>

      <div class="app-info-card">
        <div class="app-info-title">APP INFO</div>
        <div class="app-info-row"><span style="color:var(--muted)">最終更新</span><b>${esc(formatAppInfoDate(state.buildInfo))}</b></div>
        <div class="app-info-row"><span style="color:var(--muted)">最新内容</span><span>${esc(latest.title)}</span></div>
        <div style="margin-top:10px">
          <button type="button" class="btn sm" id="set-open-changelog">更新履歴を見る</button>
        </div>
      </div>
    `);

    document.querySelectorAll("[data-set-theme]").forEach((b) => {
      b.onclick = () => {
        applyTheme(b.dataset.setTheme);
        openSettingsModal();
      };
    });
    document.getElementById("set-reset-weak").onclick = async () => {
      if (!confirm("苦手リストをすべてリセットしますか？")) return;
      state.weak = {};
      saveLocal();
      try { await fetch("/api/reset-weak", { method: "POST" }); } catch (e) {}
      showToast("苦手リストをリセットしました");
      closeModal();
      render();
    };
    document.getElementById("set-reset-cleared").onclick = async () => {
      if (!confirm("クリア履歴をすべてリセットしますか？")) return;
      state.cleared = {};
      saveLocal();
      try { await fetch("/api/reset-cleared", { method: "POST" }); } catch (e) {}
      showToast("クリア履歴をリセットしました");
      closeModal();
      render();
    };
    document.getElementById("set-open-changelog").onclick = () => openChangelogModal();
  }

  // Main render dispatcher
  function render() {
    if (state.tab === "kobun") renderRef("kobun");
    else if (state.tab === "kanbun") renderRef("kanbun");
    else if (state.tab === "stats") renderStats();
    else {
      if (state.quiz.phase === "play") renderQuizPlay();
      else if (state.quiz.phase === "result") renderQuizResult();
      else renderQuizSetup();
    }
  }

  // Global Keyboard Shortcuts (4アプリ共通規約: e.code判定)
  document.addEventListener("keydown", (ev) => {
    const tag = (document.activeElement && document.activeElement.tagName) || "";
    const inInput = tag === "INPUT" || tag === "TEXTAREA";

    if (ev.key === "Escape") {
      if (!document.getElementById("modal-backdrop").hidden) { closeModal(); return; }
      if (state.tab === "quiz" && state.quiz.phase === "play") { state.quiz.phase = "setup"; render(); return; }
    }

    if (ev.altKey && !ev.ctrlKey && !ev.metaKey) {
      if (ev.code === "Digit1") { ev.preventDefault(); switchTab("kobun"); return; }
      if (ev.code === "Digit2") { ev.preventDefault(); switchTab("kanbun"); return; }
      if (ev.code === "Digit3") { ev.preventDefault(); switchTab("quiz"); return; }
      if (ev.code === "Digit4") { ev.preventDefault(); switchTab("stats"); return; }
    }

    if (inInput) return;

    if (ev.key === "?" && !ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); openShortcutsModal(); return; }
    if (ev.key === "," && !ev.ctrlKey && !ev.metaKey) { ev.preventDefault(); openSettingsModal(); return; }
    if (ev.key === "/" && !ev.ctrlKey && !ev.metaKey) {
      ev.preventDefault();
      if (state.tab !== "kobun" && state.tab !== "kanbun") switchTab("kobun");
      const si = document.getElementById("ref-search");
      if (si) si.focus();
      return;
    }

    // Quiz play shortcuts
    if (state.tab === "quiz" && state.quiz.phase === "play") {
      const item = state.quiz.list[state.quiz.i];
      if (!item) return;
      if (item.e.fmt !== "wajiko") {
        if (item.pick === -1) {
          if (ev.code === "Digit1") answerChoice(0);
          else if (ev.code === "Digit2") answerChoice(1);
          else if (ev.code === "Digit3") answerChoice(2);
          else if (ev.code === "Digit4") answerChoice(3);
          else if (ev.code === "Digit0") answerChoice(-2);
        } else if (ev.key === "Enter") {
          const nb = document.getElementById("qz-next");
          if (nb) nb.click();
        }
      } else if (ev.key === "Enter") {
        const rb = document.getElementById("qz-rev");
        const nb = document.getElementById("qz-next");
        if (rb) rb.click();
        else if (nb && !nb.disabled) nb.click();
      }
    }
  });

  // Boot
  loadLocal();
  applyTheme(getTheme());
  renderNav();
  renderUpdateBanner();
  render();
  fetchServerState();
  fetchBuildInfo();

  document.getElementById("btn-settings").onclick = openSettingsModal;
  document.getElementById("btn-settings-mob").onclick = openSettingsModal;
  document.getElementById("btn-shortcuts").onclick = openShortcutsModal;
  document.getElementById("modal-close").onclick = closeModal;
  document.getElementById("modal-backdrop").onclick = (e) => {
    if (e.target.id === "modal-backdrop") closeModal();
  };

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("/service-worker.js").catch(() => {});
  }
})();
