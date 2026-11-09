// 出口 IP / 归属 / ASN / 风险画像卡片（IPv4 / IPv6 双栈并列，标注当前优先栈）
import { getStackIP, getDefaultIP, lookupProfile } from './api.js';
import { tag, esc } from './ui.js';

async function safeLookup(ip) {
  if (!ip) return null;
  try { return await lookupProfile(ip); } catch { return null; }
}

function flagImg(cc) {
  if (!cc || !/^[a-z]{2}$/i.test(cc)) return '';
  return `<img class="flag" src="https://cdn.ipwhois.io/flags/${esc(cc.toLowerCase())}.svg" alt="" onerror="this.remove()">`;
}

function scoreTier(s) {
  const n = Number(s);
  if (s == null || Number.isNaN(n)) return null;
  if (n < 25) return { cls: 'bad', label: '高危', score: n };
  if (n < 75) return { cls: 'warn', label: '中性', score: n };
  return { cls: 'good', label: '可信', score: n };
}

function locationLine(p) {
  if (!p) return '—';
  const flag = flagImg(p.countryCode);
  const loc = [p.country, p.city].filter(Boolean).map(esc).join(' / ');
  return `${flag ? flag + ' ' : ''}${loc || '—'}`;
}

function asnLine(p) {
  if (!p || p.asn == null) return '—';
  const org = p.asname || p.asOrganization || p.companyName || '';
  return `AS${esc(p.asn)}${org ? ` · ${esc(org)}` : ''}`;
}

function lineType(p) {
  if (!p) return '—';
  if (p.residential) return '住宅宽带';
  if (p.mobile) return '移动网络';
  if (p.datacenter) return '机房 / IDC';
  return p.companyType ? esc(p.companyType) : '—';
}

function typeTags(p) {
  const out = [];
  if (!p) return out;
  if (p.datacenter) out.push(tag('info', '机房'));
  if (p.residential) out.push(tag('good', '住宅'));
  if (p.mobile) out.push(tag('info', '移动'));
  if (p.companyType && !p.datacenter) out.push(tag('neutral', p.companyType));
  if (p.verdict && !(p.datacenter && p.verdict === 'IDC')) out.push(tag('neutral', p.verdict));
  return out;
}

function riskTags(p) {
  const out = [];
  if (!p) return out;
  if (p.vpn) out.push(tag('warn', 'VPN'));
  if (p.proxy) out.push(tag('warn', '代理'));
  if (p.tor) out.push(tag('bad', 'Tor'));
  if (p.crawler) out.push(tag('warn', '爬虫'));
  if (p.abuser) out.push(tag('bad', '滥用记录'));
  return out;
}

function scoreBlock(prof) {
  const tier = scoreTier(prof?.trustScore);
  if (!tier) return '';
  return `
    <div class="exit-score">
      <div class="score-badge ${tier.cls}">
        <span class="score-num">${tier.score}</span>
        <span class="score-label">${tier.label}</span>
      </div>
      <div class="score-bar"><i class="${tier.cls}" style="left:${tier.score}%"></i></div>
      <div class="score-scale"><span>0 高危</span><span>100 可信</span></div>
    </div>`;
}

function stackCard(label, stack, ip, p, preferred) {
  if (!ip) {
    return `<div class="exit-stack">
      <div class="exit-stack-head"><span class="tag neutral">${label}</span></div>
      <div class="muted">不可用 / 无出口地址</div>
    </div>`;
  }
  const pref = preferred === stack ? '<span class="tag good">当前优先</span>' : '';
  const rows = [
    { k: '归属地', v: locationLine(p) },
    { k: 'ASN', v: asnLine(p) },
    { k: 'ISP / 运营商', v: esc(p?.isp || '—') },
    { k: '线路类型', v: lineType(p) },
  ];
  if (p?.registeredCountry) rows.push({ k: '注册地', v: esc(p.registeredCountry) });
  if (p?.rpkiStatus) {
    const cls = p.rpkiStatus === 'valid' ? 'good' : 'bad';
    rows.push({ k: 'RPKI', v: esc(p.rpkiStatus), cls });
  }
  if (p?.abuserLevel) rows.push({ k: '滥用等级', v: esc(p.abuserLevel) });
  const rowsHtml = rows.map((r) =>
    `<div class="exit-row"><dt>${r.k}</dt><dd${r.cls ? ` class="txt-${r.cls}"` : ''}>${r.v}</dd></div>`
  ).join('');
  const tags = [...typeTags(p), ...riskTags(p)].join(' ');
  return `<div class="exit-stack${preferred === stack ? ' preferred' : ''}">
    <div class="exit-stack-head"><span class="tag info">${label}</span>${pref}</div>
    <div class="exit-ip-sm">${esc(ip)}</div>
    <dl class="exit-rows">${rowsHtml}</dl>
    ${tags ? `<div class="tags">${tags}</div>` : ''}
  </div>`;
}

export async function renderExit(container) {
  container.innerHTML = '<div class="loading">正在获取出口 IP…</div>';

  const [v4, v6, def] = await Promise.all([
    getStackIP('v4'),
    getStackIP('v6'),
    getDefaultIP(),
  ]);

  if (!v4 && !v6) {
    container.innerHTML = '<div class="verdict danger">出口 IP 获取失败：当前网络不可达。</div>';
    return;
  }

  const [p4, p6] = await Promise.all([safeLookup(v4), safeLookup(v6)]);

  // 优先栈：默认端点返回的 IP 命中哪个栈，哪个即优先；兜底按可用栈推断
  let preferred;
  if (def && v4 && def === v4) preferred = 'v4';
  else if (def && v6 && def === v6) preferred = 'v6';
  else preferred = v6 ? 'v6' : 'v4';

  const prof = preferred === 'v4' ? p4 : p6;
  const prefIP = preferred === 'v4' ? v4 : v6;
  const stackLabel = preferred === 'v4' ? 'IPv4' : 'IPv6';

  const subLoc = locationLine(prof);
  const subIsp = prof?.isp ? esc(prof.isp) : '';

  container.innerHTML = `
    <div class="exit-hero">
      <div class="exit-hero-main">
        <div class="exit-badges">
          <span class="tag info">${stackLabel}</span>
          <span class="tag good">默认优先</span>
        </div>
        <div class="exit-ip">${esc(prefIP || '—')}</div>
        <div class="exit-sub">${subLoc}${subIsp ? ` · ${subIsp}` : ''}</div>
        ${riskTags(prof).length ? `<div class="tags">${riskTags(prof).join(' ')}</div>` : ''}
      </div>
      ${scoreBlock(prof)}
    </div>
    <div class="exit-stacks">
      ${stackCard('IPv4', 'v4', v4, p4, preferred)}
      ${stackCard('IPv6', 'v6', v6, p6, preferred)}
    </div>
  `;
}
