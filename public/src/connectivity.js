// 连通性 / 分流测试：浏览器本地 no-cors 探测，多轮中位数降噪，分组汇总
import { TARGETS, GROUPS } from './sites.js';
import { median, esc } from './ui.js';

const ROUNDS = 8;          // 每站采样轮数
const POOL = 9;            // 并发上限
const TIMEOUT = 2500;      // 单站单次超时 ms
const MIN_INTERVAL = 90;   // 轮间最短间隔
const JITTER = 140;        // 轮间随机抖动上限

async function singlePing(url) {
  const start = performance.now();
  try {
    await fetch(url, {
      mode: 'no-cors',
      cache: 'no-store',
      signal: AbortSignal.timeout(TIMEOUT),
    });
    return Math.round(performance.now() - start);
  } catch {
    return -1;
  }
}

function dotClass(ms) {
  if (ms < 0) return 'fail';
  if (ms < 100) return 'good';
  if (ms < 400) return 'warn';
  return 'bad';
}

// 站点图标：走 favicon 聚合代理，加载失败时隐藏（退化为纯文字）
const iconFor = (t) => `https://icons.duckduckgo.com/ip3/${t.host}.ico`;

export function initConnectivity(root, btn) {
  const history = TARGETS.map(() => []);
  const rounds = TARGETS.map(() => []);
  let running = false;
  let started = false;

  const dotsEl = (i) => root.querySelector(`#dots-${i}`);
  const msEl = (i) => root.querySelector(`#ms-${i}`);
  const sumEl = (cc) => root.querySelector(`#sum-${cc}`);

  function render() {
    root.innerHTML = GROUPS.map((g) => {
      const items = TARGETS.map((t, i) => ({ t, i })).filter((x) => x.t.cc === g.cc);
      const cells = items.map(({ t, i }) => `
        <div class="conn-item">
          <img class="conn-icon" src="${iconFor(t)}" alt="" loading="lazy" onerror="this.classList.add('icon-off')">
          <div class="conn-name" title="${esc(t.name)}">${esc(t.name)}</div>
          <div class="conn-dots" id="dots-${i}">${'<div class="dot pending"></div>'.repeat(ROUNDS)}</div>
          <div class="conn-ms" id="ms-${i}">--</div>
        </div>`).join('');
      return `
        <div class="conn-group">
          <div class="conn-head">
            <h3>${esc(g.name)}</h3>
            <span class="conn-sum" id="sum-${g.cc}">准备测试…</span>
            <button class="btn secondary" data-group-refresh="${g.cc}" style="padding:5px 10px;font-size:12px">刷新</button>
          </div>
          <div class="conn-grid">${cells}</div>
        </div>`;
    }).join('');
  }

  function updateSummary(cc) {
    const items = TARGETS.map((t, i) => ({ t, i })).filter((x) => x.t.cc === cc);
    const meds = [];
    let reach = 0;
    items.forEach(({ i }) => {
      const m = median(history[i]);
      if (m !== null) { meds.push(m); reach++; }
    });
    const el = sumEl(cc);
    if (!el) return;
    if (meds.length) {
      const avg = Math.round(meds.reduce((a, b) => a + b, 0) / meds.length);
      el.innerHTML = `可达 <b>${reach}/${items.length}</b> · 平均 <b>${Math.min(avg, 999)}ms</b>`;
    } else {
      el.innerHTML = `可达 <b>0/${items.length}</b>`;
    }
  }

  function resetItems(list) {
    list.forEach(({ i }) => {
      history[i] = [];
      rounds[i] = [];
      const dots = dotsEl(i);
      if (dots) [...dots.children].forEach((d) => (d.className = 'dot pending'));
      const ms = msEl(i);
      if (ms) { ms.textContent = '--'; ms.style.color = ''; }
    });
  }

  async function probe(t, i) {
    await singlePing(t.url); // 预热一轮，不计入统计
    for (let round = 0; round < ROUNDS; round++) {
      const roundStart = performance.now();
      const ms = await singlePing(t.url);
      const dots = dotsEl(i);
      if (dots && dots.children[round]) dots.children[round].className = 'dot ' + dotClass(ms);
      if (ms >= 0) history[i].push(ms);
      rounds[i][round] = ms;
      const med = median(history[i]);
      const msNode = msEl(i);
      if (msNode) {
        if (med !== null) {
          msNode.textContent = Math.min(med, 999) + 'ms';
          msNode.style.color = med < 100 ? 'var(--good)' : med < 400 ? 'var(--warn)' : 'var(--bad)';
        } else if (ms < 0) {
          msNode.textContent = '超时';
          msNode.style.color = 'var(--bad)';
        }
      }
      updateSummary(t.cc);
      if (round < ROUNDS - 1) {
        const wait = Math.max(0, MIN_INTERVAL - (performance.now() - roundStart)) + Math.random() * JITTER;
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  }

  async function runPool(items, size) {
    let idx = 0;
    const lane = async () => {
      while (idx < items.length) {
        const { t, i } = items[idx++];
        await probe(t, i);
      }
    };
    await Promise.all(Array.from({ length: Math.min(size, items.length) }, lane));
  }

  async function run(cc) {
    if (running) return;
    running = true;
    started = true;
    const list = cc
      ? TARGETS.map((t, i) => ({ t, i })).filter((x) => x.t.cc === cc)
      : TARGETS.map((t, i) => ({ t, i }));
    resetItems(list);
    await runPool(list, POOL);
    running = false;
  }

  render();
  if (btn) btn.addEventListener('click', () => run());
  root.addEventListener('click', (e) => {
    const b = e.target.closest('[data-group-refresh]');
    if (b) run(b.dataset.groupRefresh);
  });

  return { run, hasStarted: () => started };
}
