// DNS 泄露检测页入口
import { setupDns } from './dns.js';

setupDns({
  btn: document.getElementById('dnsBtn'),
  verdict: document.getElementById('dnsVerdict'),
  status: document.getElementById('dnsStatus'),
  table: document.getElementById('dnsTable'),
  body: document.getElementById('dnsBody'),
});
