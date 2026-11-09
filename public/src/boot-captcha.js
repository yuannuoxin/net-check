// 人机验证展示页入口：进入本页才加载 Turnstile / reCAPTCHA SDK
import { setupCaptcha } from './captcha.js';

setupCaptcha(document.getElementById('captchaRoot'));
