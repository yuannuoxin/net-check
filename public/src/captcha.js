// 人机验证展示：对齐 mtd-tt 项目，接入 Cloudflare Turnstile 与 Google reCAPTCHA
// 边界：前端只持公开 sitekey 渲染 widget；响应 token 的 secret 校验必须由后端 siteverify 完成，前端不存放任何 secret。

// 公开站点密钥（sitekey），取自 mtd-tt 项目 sys_config；secret_key 仅后端持有，不下发前端
// 注意：Turnstile 的 widget 模式（Managed / Non-Interactive / Invisible）在 CF 后台创建 widget 时绑定到 sitekey，
// 前端 appearance 改不了模式；三种模式各用一把独立 sitekey，不可混用。
const SITEKEYS = {
  turnstile: {
    managed: '0x4AAAAAAAKGdrgGg91QkV9_',
    invisible: '0x4AAAAAAFELOyv_JKfz3wI9',
    nonInteractive: '0x4AAAAAAFELLzU156gOM_ky',
  },
  recaptcha: {
    v3: '6LfPpJssAAAAAJaUUw12WXLSwGYkc1I8w1ZZWfKo',
    v2: '6LcAqJssAAAAADHJi94-dHoNeOBGcjT-spZyrJ8X',
    v2Invisible: '6LdjqZssAAAAAIpfZsjkRFi878_Zp7_zMt9RwLKN',
  },
};

const TURNSTILE_SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
const RECAPTCHA_SCRIPT = 'https://www.recaptcha.net/recaptcha/api.js';

// 校验通过后的结果解读文案（标题 + 说明）
const VERDICTS = {
  managedPassive: { title: '智能无感通过！', text: 'Managed 模式表现极佳，Cloudflare 自动判定安全，免除了用户点击，体验完美。' },
  managedInteractive: { title: '需要点击验证（良好）', text: '托管模式要求你点了一次确认才通过：浏览器环境整体正常，但存在少量可疑特征，Cloudflare 未完全信任当前环境。' },
  non: { title: '智能无感通过！', text: '无需任何用户交互，后台静默校验成功。' },
  invisible: { title: '智能无感通过！', text: '隐形模式在后台静默完成校验，访客全程无感知。' },
  rcV3: { title: '无感打分完成', text: '后台静默返回令牌；风险评分需后端 siteverify 取得。' },
  rcV2: { title: '验证通过', text: '复选框校验通过，令牌已返回。' },
  rcV2Inv: { title: '智能无感通过！', text: '隐形挑战在后台静默完成，访客无感知。' },
};

const loaded = new Map();
function loadScript(src) {
  if (loaded.has(src)) return loaded.get(src);
  const p = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('SDK 加载失败'));
    document.head.appendChild(s);
  });
  loaded.set(src, p);
  return p;
}

function boxFail(box, msg) {
  if (!box) return;
  if (box.querySelector('iframe')) return; // 控件已渲染，避免 innerHTML 覆盖销毁 widget
  box.innerHTML = `<div class="captcha-fail">${msg}</div>`;
}

// ---- 卡片状态行更新 ----
function setState(stateId, cls, text) {
  const el = document.getElementById(stateId);
  if (el) { el.className = `cc-state ${cls}`; el.textContent = text; }
}

function setToken(tokenId, token) {
  const el = document.getElementById(tokenId);
  if (el) el.textContent = token ? `${String(token).slice(0, 12)}…` : '—';
}

// 校验通过：状态徽章转绿、写入令牌摘要；清掉盒内残留的失败提示（不覆盖已渲染的 widget）
function setSuccess(stateId, tokenId, token, boxId) {
  setState(stateId, 'good', '校验通过');
  setToken(tokenId, token);
  if (boxId) {
    const box = document.getElementById(boxId);
    if (!box) return;
    const fail = box.querySelector('.captcha-fail');
    if (fail) fail.remove();
    if (!box.querySelector('iframe') && !box.querySelector('.cc-hint') && box.dataset.hint) {
      box.innerHTML = `<div class="cc-hint">${box.dataset.hint}</div>`;
    }
  }
}

// 响应耗时：ms 数值写入行式列表；null/undefined 显示 —
function setCost(costId, ms) {
  const el = document.getElementById(costId);
  if (!el) return;
  el.textContent = ms == null ? '—' : `${ms} ms`;
}

// 结果解读块：标题 + 说明文案
function setVerdict(verdictId, title, text) {
  const el = document.getElementById(verdictId);
  if (!el) return;
  el.hidden = false;
  el.innerHTML = `<div class="cc-verdict-title">${title}</div><div class="cc-verdict-text">${text}</div>`;
}

function clearVerdict(verdictId) {
  const el = document.getElementById(verdictId);
  if (el) { el.hidden = true; el.innerHTML = ''; }
}

// 校验失败：状态徽章转红
function setFail(stateId, msg) {
  setState(stateId, 'bad', msg || '校验失败');
}

// 重新触发前：状态回到等待、清空令牌（不改动 widget 容器，避免干扰 SDK）
function resetState(stateId, tokenId) {
  setState(stateId, 'neutral', '等待校验');
  setToken(tokenId, '');
}

// 校验进行中：带旋转指示器的 loading 徽章
function setLoading(stateId, text) {
  const el = document.getElementById(stateId);
  if (el) { el.className = 'cc-state loading'; el.innerHTML = `<span class="cc-spin"></span>${text}`; }
}

// 脚本 onload 后，全局对象可能仍在异步初始化；轮询等待就绪，超时再判失败
function waitGlobal(prop, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      if (window[prop]) { clearInterval(iv); resolve(); }
      else if (Date.now() - t0 > timeout) { clearInterval(iv); reject(new Error(`${prop} 未就绪`)); }
    }, 100);
  });
}

// reCAPTCHA：占位对象可能先挂上 window，但 render/execute 方法后挂载；等方法函数真正可用
function waitRecaptchaReady(timeout = 8000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const iv = setInterval(() => {
      const g = window.grecaptcha;
      if (g && typeof g.render === 'function' && typeof g.execute === 'function') {
        clearInterval(iv); resolve(g);
      } else if (Date.now() - t0 > timeout) {
        clearInterval(iv); reject(new Error('grecaptcha 未就绪'));
      }
    }, 100);
  });
}

// 单张验证卡片结构：头部徽章 + 标题 + 右侧按钮 → 虚线 widget 盒 → 行式状态列表
function card(cfg) {
  const { vendor, vendorCls, title, mode, desc, boxId, stateId, tokenId, costId, verdictId, btnId, btnText, extraRows = [], boxHint = '' } = cfg;
  const extra = extraRows
    .map((r) => `<div class="cc-row"><dt>${r.k}</dt><dd${r.cls ? ` class="${r.cls}"` : ''}>${r.v}</dd></div>`)
    .join('');
  const hint = boxHint ? `<div class="cc-hint">${boxHint}</div>` : '';
  return `<div class="captcha-card">
    <div class="cc-head">
      <div class="cc-title">
        <span class="tag ${vendorCls}">${vendor}</span>
        <h3>${title}</h3>
      </div>
      <button class="btn secondary cc-btn" id="${btnId}">${btnText}</button>
    </div>
    <div class="desc">${desc}</div>
    <div class="captcha-box" id="${boxId}" data-hint="${boxHint}">${hint}</div>
    <dl class="cc-rows">
      <div class="cc-row"><dt>当前状态</dt><dd><span class="cc-state neutral" id="${stateId}">等待校验</span></dd></div>
      <div class="cc-row"><dt>令牌</dt><dd class="cc-token" id="${tokenId}">—</dd></div>
      <div class="cc-row"><dt>模式</dt><dd>${mode}</dd></div>
      <div class="cc-row"><dt>响应耗时</dt><dd class="cc-cost" id="${costId}">—</dd></div>
      ${extra}
    </dl>
    <div class="cc-verdict" id="${verdictId}" hidden></div>
  </div>`;
}

export function setupCaptcha(root) {
  const cards = [
    card({
      vendor: 'Turnstile', vendorCls: 'info', title: '托管（Managed / 交互）', mode: 'Managed · 交互',
      desc: 'Cloudflare Turnstile 托管模式，用户勾选后按需弹出挑战。',
      boxId: 'ts-managed', stateId: 'ts-managed-state', tokenId: 'ts-managed-token',
      costId: 'ts-managed-cost', verdictId: 'ts-managed-verdict',
      btnId: 'ts-managed-btn', btnText: '重新验证',
    }),
    card({
      vendor: 'Turnstile', vendorCls: 'info', title: '隐形（Invisible）', mode: 'Invisible · 隐形',
      desc: '不显示复选框，提交时由脚本静默 execute 触发验证。',
      boxId: 'ts-invisible', stateId: 'ts-invisible-state', tokenId: 'ts-invisible-token',
      costId: 'ts-invisible-cost', verdictId: 'ts-invisible-verdict',
      btnId: 'ts-invisible-btn', btnText: '触发隐形验证',
      boxHint: '隐形模式：无可见控件，点击右上角按钮在后台静默触发验证。',
    }),
    card({
      vendor: 'Turnstile', vendorCls: 'info', title: '非交互（NonInteractive）', mode: 'NonInteractive · 非交互',
      desc: '常驻可见非交互控件，无需点击，后台静默完成校验。',
      boxId: 'ts-non', stateId: 'ts-non-state', tokenId: 'ts-non-token',
      costId: 'ts-non-cost', verdictId: 'ts-non-verdict',
      btnId: 'ts-non-btn', btnText: '重新校验',
    }),
    card({
      vendor: 'reCAPTCHA', vendorCls: 'neutral', title: 'v3 · 无感打分', mode: 'v3 · 无感打分',
      desc: '后台静默打分（score 0.0–1.0），无可见 widget；前端 execute 仅返回令牌，score 需后端 siteverify 取得。',
      boxId: 'rc-v3', stateId: 'rc-v3-state', tokenId: 'rc-v3-token',
      costId: 'rc-v3-cost', verdictId: 'rc-v3-verdict',
      btnId: 'rc-v3-btn', btnText: '重新打分',
      extraRows: [{ k: '风险评分', v: '— 需后端校验', cls: 'muted' }],
      boxHint: 'v3 无可见 widget，后台静默打分，令牌由 execute 返回；score 需后端校验。',
    }),
    card({
      vendor: 'reCAPTCHA', vendorCls: 'neutral', title: 'v2 · 复选框', mode: 'v2 · 复选框',
      desc: 'Google reCAPTCHA v2 复选框模式，用户勾选后按需弹出图形挑战。',
      boxId: 'rc-v2', stateId: 'rc-v2-state', tokenId: 'rc-v2-token',
      costId: 'rc-v2-cost', verdictId: 'rc-v2-verdict',
      btnId: 'rc-v2-btn', btnText: '重新验证',
    }),
    card({
      vendor: 'reCAPTCHA', vendorCls: 'neutral', title: 'v2 · 隐形（Invisible）', mode: 'v2 · 隐形',
      desc: '无可见复选框，提交时显式 execute 触发挑战。',
      boxId: 'rc-v2-invisible', stateId: 'rc-v2-inv-state', tokenId: 'rc-v2-inv-token',
      costId: 'rc-v2-inv-cost', verdictId: 'rc-v2-inv-verdict',
      btnId: 'rc-v2-inv-btn', btnText: '触发隐形验证',
    }),
  ];

  root.innerHTML = `
    <div class="captcha-grid">
      ${cards.join('')}
      <div class="captcha-card cc-note">
        <h3>接入与校验说明</h3>
        <div class="desc" style="margin-bottom:0">
          1. 前端只持有公开 <code>sitekey</code> 渲染 widget 并拿到响应 <code>token</code>；<br>
          2. 提交后由后端用私有 <code>secret</code> 调用厂商 <code>siteverify</code> 接口校验（Turnstile: challenges.cloudflare.com/turnstile/v0/siteverify；reCAPTCHA: recaptcha.net/recaptcha/api/siteverify），<code>secret</code> 绝不能下发到浏览器；<br>
          3. 下列 sitekey 取自 mtd-tt 项目线上配置，在厂商后台绑定了对应域名；在其他域名（含 localhost）渲染时可能提示域名未授权，属正常限制；<br>
          4. Turnstile / reCAPTCHA 的 SDK 服务器在境外，国内网络可能加载失败，代码已做失败兜底。
        </div>
      </div>
    </div>`;

  // ---- Cloudflare Turnstile ----
  loadScript(TURNSTILE_SCRIPT)
    .then(() => waitGlobal('turnstile', 5000))
    .then(() => {
      const ts = window.turnstile;
      if (!ts) throw new Error('turnstile 未就绪');

      const boxManaged = document.getElementById('ts-managed');
      const boxInvis = document.getElementById('ts-invisible');
      const boxNon = document.getElementById('ts-non');

      const t0Managed = performance.now();
      let managedInteracted = false;
      const widManaged = ts.render(boxManaged, {
        sitekey: SITEKEYS.turnstile.managed,
        size: 'flexible',
        'interactive-callback': () => { managedInteracted = true; },
        callback: (token) => {
          const ms = Math.round(performance.now() - t0Managed);
          setSuccess('ts-managed-state', 'ts-managed-token', token, 'ts-managed');
          setCost('ts-managed-cost', ms);
          const v = managedInteracted ? VERDICTS.managedInteractive : VERDICTS.managedPassive;
          setVerdict('ts-managed-verdict', v.title, v.text);
        },
      });

      let t0Invis = 0;
      const widInvis = ts.render(boxInvis, {
        sitekey: SITEKEYS.turnstile.invisible,
        appearance: 'execute',
        callback: (token) => {
          const ms = Math.round(performance.now() - t0Invis);
          setSuccess('ts-invisible-state', 'ts-invisible-token', token, 'ts-invisible');
          setCost('ts-invisible-cost', ms);
          setVerdict('ts-invisible-verdict', VERDICTS.invisible.title, VERDICTS.invisible.text);
        },
      });

      // Non-interactive：常驻可见非交互控件（带 spinner），免点击，加载即静默校验
      const t0Non = performance.now();
      const widNon = ts.render(boxNon, {
        sitekey: SITEKEYS.turnstile.nonInteractive,
        size: 'flexible',
        callback: (token) => {
          const ms = Math.round(performance.now() - t0Non);
          setSuccess('ts-non-state', 'ts-non-token', token, 'ts-non');
          setCost('ts-non-cost', ms);
          setVerdict('ts-non-verdict', VERDICTS.non.title, VERDICTS.non.text);
        },
      });

      document.getElementById('ts-managed-btn').addEventListener('click', () => {
        resetState('ts-managed-state', 'ts-managed-token');
        setCost('ts-managed-cost', null);
        clearVerdict('ts-managed-verdict');
        ts.reset(widManaged);
      });
      document.getElementById('ts-invisible-btn').addEventListener('click', () => {
        resetState('ts-invisible-state', 'ts-invisible-token');
        setCost('ts-invisible-cost', null);
        clearVerdict('ts-invisible-verdict');
        setLoading('ts-invisible-state', '校验中…');
        t0Invis = performance.now();
        ts.reset(widInvis);
        window.setTimeout(() => {
          Promise.resolve(ts.execute(widInvis)).catch(() => setFail('ts-invisible-state', '校验失败'));
        }, 120);
      });
      document.getElementById('ts-non-btn').addEventListener('click', () => {
        resetState('ts-non-state', 'ts-non-token');
        setCost('ts-non-cost', null);
        clearVerdict('ts-non-verdict');
        setLoading('ts-non-state', '校验中…');
        ts.reset(widNon); // 非交互控件 reset 后自动重新静默校验
      });
    })
    .catch(() => {
      boxFail(document.getElementById('ts-managed'), 'Turnstile SDK 加载失败（网络可达性限制）');
      boxFail(document.getElementById('ts-invisible'), 'Turnstile SDK 加载失败');
      boxFail(document.getElementById('ts-non'), 'Turnstile SDK 加载失败');
      setState('ts-managed-state', 'bad', '加载失败');
      setState('ts-invisible-state', 'bad', '加载失败');
      setState('ts-non-state', 'bad', '加载失败');
    });

  // ---- Google reCAPTCHA（走 recaptcha.net；v3 自动渲染 + v2 explicit，三模式独立容错）----
  // v3：脚本 ?render=<v3 sitekey> 预注册，execute 传 sitekey；v2：explicit 脚本 render 拿 widgetId
  const V3_SCRIPT = `${RECAPTCHA_SCRIPT}?render=${SITEKEYS.recaptcha.v3}`;
  const EXPLICIT_SCRIPT = `${RECAPTCHA_SCRIPT}?render=explicit`;
  Promise.all([loadScript(V3_SCRIPT), loadScript(EXPLICIT_SCRIPT)])
    .then(() => waitRecaptchaReady(8000))
    .then((gc) => {
      // v3 无感打分：execute(sitekey)，无可见 widget
      const runV3 = async () => {
        resetState('rc-v3-state', 'rc-v3-token');
        setCost('rc-v3-cost', null);
        clearVerdict('rc-v3-verdict');
        setLoading('rc-v3-state', '打分中…');
        const t0 = performance.now();
        try {
          const token = await gc.execute(SITEKEYS.recaptcha.v3, { action: 'submit' });
          const ms = Math.round(performance.now() - t0);
          setSuccess('rc-v3-state', 'rc-v3-token', token, 'rc-v3');
          setCost('rc-v3-cost', ms);
          setVerdict('rc-v3-verdict', VERDICTS.rcV3.title, VERDICTS.rcV3.text);
        } catch (e) {
          console.warn('[recaptcha v3] execute 失败:', e && e.message);
          setFail('rc-v3-state', '打分失败');
          setToken('rc-v3-token', '');
        }
      };
      document.getElementById('rc-v3-btn').addEventListener('click', runV3);
      runV3();

      // v2 复选框（独立容错：失败只标本卡，不影响 v3 / v2 隐形）
      try {
        const boxV2 = document.getElementById('rc-v2');
        boxV2.innerHTML = ''; // reCAPTCHA render 要求容器为空
        const t0V2 = performance.now();
        const widV2 = gc.render(boxV2, {
          sitekey: SITEKEYS.recaptcha.v2,
          callback: (token) => {
            const ms = Math.round(performance.now() - t0V2);
            setSuccess('rc-v2-state', 'rc-v2-token', token, 'rc-v2');
            setCost('rc-v2-cost', ms);
            setVerdict('rc-v2-verdict', VERDICTS.rcV2.title, VERDICTS.rcV2.text);
          },
        });
        document.getElementById('rc-v2-btn').addEventListener('click', () => {
          resetState('rc-v2-state', 'rc-v2-token');
          setCost('rc-v2-cost', null);
          clearVerdict('rc-v2-verdict');
          if (widV2) gc.reset(widV2);
        });
      } catch (e) {
        console.warn('[recaptcha v2] render 失败:', e && e.message);
        boxFail(document.getElementById('rc-v2'), 'v2 复选框渲染失败');
        setState('rc-v2-state', 'bad', '渲染失败');
      }

      // v2 隐形（独立容错）
      try {
        const boxInv = document.getElementById('rc-v2-invisible');
        boxInv.innerHTML = ''; // reCAPTCHA render 要求容器为空
        let t0Inv = 0;
        const widInv = gc.render(boxInv, {
          sitekey: SITEKEYS.recaptcha.v2Invisible,
          size: 'invisible',
          badge: 'bottomright',
          callback: (token) => {
            const ms = Math.round(performance.now() - t0Inv);
            setSuccess('rc-v2-inv-state', 'rc-v2-inv-token', token, 'rc-v2-invisible');
            setCost('rc-v2-inv-cost', ms);
            setVerdict('rc-v2-inv-verdict', VERDICTS.rcV2Inv.title, VERDICTS.rcV2Inv.text);
          },
        });
        document.getElementById('rc-v2-inv-btn').addEventListener('click', () => {
          resetState('rc-v2-inv-state', 'rc-v2-inv-token');
          setCost('rc-v2-inv-cost', null);
          clearVerdict('rc-v2-inv-verdict');
          t0Inv = performance.now();
          if (widInv) { gc.reset(widInv); gc.execute(widInv); }
        });
      } catch (e) {
        console.warn('[recaptcha v2-invisible] render 失败:', e && e.message);
        boxFail(document.getElementById('rc-v2-invisible'), 'v2 隐形渲染失败');
        setState('rc-v2-inv-state', 'bad', '渲染失败');
      }
    })
    .catch(() => {
      // SDK 全局未就绪：境内网络阻断 anchor/bframe 子资源，三卡统一兜底
      boxFail(document.getElementById('rc-v3'), 'reCAPTCHA SDK 加载失败（境内网络限制）');
      boxFail(document.getElementById('rc-v2'), 'reCAPTCHA SDK 加载失败');
      boxFail(document.getElementById('rc-v2-invisible'), 'reCAPTCHA SDK 加载失败');
      setState('rc-v3-state', 'bad', '加载失败');
      setState('rc-v2-state', 'bad', '加载失败');
      setState('rc-v2-inv-state', 'bad', '加载失败');
    });
}
