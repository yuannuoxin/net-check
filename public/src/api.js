// 第三方公开接口封装（纯前端直连，无后端转发）
// 所有端点均已实测返回 Access-Control-Allow-Origin: *

export const ENDPOINTS = {
  ipwho: 'https://ipwho.is/',
  trace: 'https://1.1.1.1/cdn-cgi/trace',
  lookup: (ip) => `https://ip.net.coffee/api/ip/lookup/${encodeURIComponent(ip)}`,
  edns: (label) => `https://${label}.edns.ip-api.com/json`,
};

// 分栈出口探测：v4 / v6 强制走对应协议栈，default 取浏览器默认优先栈
export const ECHO = {
  v4: 'https://ipv4.icanhazip.com/',
  v6: 'https://ipv6.icanhazip.com/',
  default: 'https://api64.ipify.org?format=json',
};

async function fetchJson(url, { timeout = 5000, headers } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal, headers });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, { timeout = 5000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const r = await fetch(url, { signal: ctrl.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 获取当前访客出口 IP 与基础归属。
 * 优先 ipwho.is（一步自探测），失败回退 Cloudflare trace 端点。
 */
export async function getExitInfo() {
  // 主：ipwho.is
  try {
    const j = await fetchJson(ENDPOINTS.ipwho);
    if (j && j.success !== false && j.ip) {
      return {
        ip: j.ip,
        type: j.type || (j.ip.includes(':') ? 'IPv6' : 'IPv4'),
        country: j.country || '',
        countryCode: j.country_code || '',
        city: j.city || '',
        isp: j.connection?.isp || '',
        asn: j.connection?.asn ?? null,
        org: j.connection?.org || '',
        source: 'ipwho.is',
      };
    }
  } catch { /* 落到备用 */ }

  // 备：1.1.1.1 trace，仅能拿到 IP
  const txt = await fetchText(ENDPOINTS.trace);
  const m = txt.match(/ip=([^\n]+)/);
  if (!m) throw new Error('无法获取出口 IP');
  const ip = m[1].trim();
  return {
    ip,
    type: ip.includes(':') ? 'IPv6' : 'IPv4',
    country: '', countryCode: '', city: '',
    isp: '', asn: null, org: '',
    source: 'cloudflare-trace',
  };
}

/**
 * 查询 IP 归属 / ASN / 风险画像（lookup 型，必须先有 IP）。
 * 私有/保留 IP 标记 bogon，不返回 ASN。
 */
export async function lookupProfile(ip) {
  const j = await fetchJson(ENDPOINTS.lookup(ip));
  if (j.is_bogon) {
    return { ip, bogon: true, reason: j.bogon_reason || j.bogon_rfc || 'Private' };
  }
  return {
    ip: j.ip || ip,
    country: j.country || '',
    countryCode: (j.countryCode || '').toLowerCase(),
    city: j.city || '',
    registeredCountry: j.registered_country || '',
    asn: j.asn ?? null,
    asname: j.asname || '',
    asOrganization: j.asOrganization || '',
    companyName: j.company_name || '',
    companyType: j.company_type || '',
    datacenter: !!j.is_datacenter,
    residential: !!j.isResidential,
    mobile: !!j.is_mobile,
    crawler: !!j.is_crawler,
    vpn: !!j.is_vpn,
    proxy: !!j.is_proxy,
    tor: !!j.is_tor,
    abuser: !!j.is_abuser,
    abuserLevel: j.intelligence?.abuser_level || '',
    rpkiStatus: j.rpki_status || '',
    trustScore: j.trustScore ?? j.trust_score ?? null,
    verdict: j.ai_verdict?.label || '',
    isp: j.isp || '',
  };
}

/** 强制探测指定协议栈出口 IP；不通/超时返回 null */
export async function getStackIP(stack) {
  try {
    const txt = await fetchText(ECHO[stack], { timeout: 4000 });
    const ip = txt.trim();
    return ip || null;
  } catch {
    return null;
  }
}

/** 浏览器默认优先栈出口 IP（Happy Eyeballs 实际选用的栈） */
export async function getDefaultIP() {
  try {
    const j = await fetchJson(ECHO.default);
    return j.ip || null;
  } catch {
    return null;
  }
}
