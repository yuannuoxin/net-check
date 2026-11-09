// 连通性测试站点清单：cc 分组，url 为轻量探测端点，host 用于派生站点图标
// 探测优先 /generate_204、/cdn-cgi/trace，其次 CDN 静态 favicon，兜底主站 favicon.ico

export const TARGETS = [
  // 中国（直连对照）
  { cc: 'cn', name: '百度',       host: 'www.baidu.com',          url: 'https://www.baidu.com/favicon.ico' },
  { cc: 'cn', name: '哔哩哔哩',   host: 'www.bilibili.com',        url: 'https://www.bilibili.com/favicon.ico' },
  { cc: 'cn', name: '京东',       host: 'www.jd.com',             url: 'https://www.jd.com/favicon.ico' },
  { cc: 'cn', name: '微博',       host: 'weibo.com',               url: 'https://weibo.com/favicon.ico' },
  { cc: 'cn', name: '抖音',       host: 'www.douyin.com',          url: 'https://www.douyin.com/favicon.ico' },
  { cc: 'cn', name: '小红书',     host: 'www.xiaohongshu.com',     url: 'https://www.xiaohongshu.com/favicon.ico' },
  { cc: 'cn', name: '腾讯',       host: 'www.qq.com',             url: 'https://www.qq.com/favicon.ico' },
  { cc: 'cn', name: '网易',       host: 'www.163.com',            url: 'https://www.163.com/favicon.ico' },

  // 日本
  { cc: 'jp', name: '任天堂',     host: 'www.nintendo.co.jp',      url: 'https://www.nintendo.co.jp/favicon.ico' },
  { cc: 'jp', name: 'Yahoo! JP', host: 'www.yahoo.co.jp',         url: 'https://www.yahoo.co.jp/favicon.ico' },
  { cc: 'jp', name: 'LINE',       host: 'line.me',                url: 'https://line.me/favicon.ico' },
  { cc: 'jp', name: 'Sony',       host: 'www.sony.jp',            url: 'https://www.sony.jp/favicon.ico' },

  // 美国
  { cc: 'us', name: 'Google',     host: 'www.google.com',          url: 'https://www.google.com/generate_204' },
  { cc: 'us', name: 'YouTube',   host: 'www.youtube.com',         url: 'https://www.youtube.com/generate_204' },
  { cc: 'us', name: 'GitHub',     host: 'github.com',              url: 'https://github.com/generate_204' },
  { cc: 'us', name: 'Cloudflare', host: 'cloudflare.com',          url: 'https://1.1.1.1/cdn-cgi/trace' },
  { cc: 'us', name: 'Apple',      host: 'www.apple.com',           url: 'https://www.apple.com/favicon.ico' },
  { cc: 'us', name: 'Bing',      host: 'www.bing.com',             url: 'https://www.bing.com/favicon.ico' },
  { cc: 'us', name: 'Steam',      host: 'store.steampowered.com',  url: 'https://store.steampowered.com/favicon.ico' },
  { cc: 'us', name: 'Amazon',     host: 'www.amazon.com',           url: 'https://www.amazon.com/favicon.ico' },

  // 全球
  { cc: 'gl', name: 'Wikipedia', host: 'wikipedia.org',            url: 'https://www.wikipedia.org/static/favicon/wikipedia.ico' },
  { cc: 'gl', name: 'TikTok',     host: 'www.tiktok.com',           url: 'https://www.tiktok.com/favicon.ico' },
  { cc: 'gl', name: 'npm',        host: 'www.npmjs.org',           url: 'https://registry.npmjs.org/' },
  { cc: 'gl', name: 'jsDelivr',   host: 'cdn.jsdelivr.net',         url: 'https://cdn.jsdelivr.net/favicon.ico' },
  { cc: 'gl', name: 'Spotify',   host: 'open.spotify.com',        url: 'https://open.spotify.com/favicon.ico' },
  { cc: 'gl', name: 'BBC',        host: 'www.bbc.com',             url: 'https://www.bbc.com/favicon.ico' },
];

export const GROUPS = [
  { cc: 'cn', name: '中国' },
  { cc: 'jp', name: '日本' },
  { cc: 'us', name: '美国' },
  { cc: 'gl', name: '全球' },
];
