// WebRTC 泄露检测页入口
import { setupWebRTC } from './webrtc.js';

setupWebRTC({
  btn: document.getElementById('rtcBtn'),
  verdict: document.getElementById('rtcVerdict'),
  status: document.getElementById('rtcStatus'),
  table: document.getElementById('rtcTable'),
  body: document.getElementById('rtcBody'),
  exitLabel: document.getElementById('rtcExit'),
});
