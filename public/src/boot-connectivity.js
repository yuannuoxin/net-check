// 连通性 / 分流测试页入口：进入本页即启动探测
import { initConnectivity } from './connectivity.js';

const conn = initConnectivity(
  document.getElementById('connRoot'),
  document.getElementById('connBtn'),
);
conn.run();
