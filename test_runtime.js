// ===== Runtime behavior simulation with mocked browser env =====
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const src = html.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/)[1];

const elements = {};
function makeEl(id) {
  const listeners = {};
  const el = {
    id, value: '', textContent: '', innerHTML: '', style: {}, options: [],
    disabled: false, checked: false, className: '', selectedOptions: [],
    classList: { add(){}, remove(){}, toggle(){}, contains(){ return false; } },
    addEventListener(ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); },
    onclick: null, onchange: null,
    appendChild() {}, querySelector() { return makeEl(id + '-child'); },
    setAttribute() {}, getContext() { return ctx2dMock; },
    captureStream() { return { getVideoTracks: () => [{}] }; },
    scrollHeight: 0, scrollTop: 0, focus() {}, click() {},
    _fire(ev, arg) { (listeners[ev] || []).forEach(fn => fn(arg)); if (ev === 'change' && this.onchange) this.onchange(arg); },
    _listeners: listeners,
  };
  return el;
}
const ctx2dMock = new Proxy({}, {
  get: (t, p) => {
    if (p === 'measureText') return () => ({ width: 10 });
    if (p === 'createLinearGradient') return () => ({ addColorStop() {} });
    return typeof p === 'string' ? (() => {}) : undefined;
  },
  set: () => true,
});
const voices = [
  { name: 'Microsoft Kangkang', lang: 'zh-CN' },
  { name: 'Microsoft Huihui', lang: 'zh-CN' },
  { name: 'Google US English', lang: 'en-US' },
];
global.document = {
  hidden: false,
  getElementById: id => elements[id] || (elements[id] = makeEl(id)),
  createElement: tag => makeEl(tag),
  addEventListener() {}, removeEventListener() {},
  querySelectorAll() { return []; },
  documentElement: { style: { setProperty() {} }, setAttribute() {}, getAttribute() { return null; } },
};
global.window = global;   // 'speechSynthesis in window' checks
global.localStorage = { _s: {}, getItem(k) { return this._s[k] || null; }, setItem(k, v) { this._s[k] = v; }, removeItem(k) { delete this._s[k]; } };
global.speechSynthesis = {
  getVoices: () => voices, speaking: false, pending: false, paused: false,
  speak(u) { this._last = u; }, cancel() {}, pause() {}, resume() {},
  onvoiceschanged: null,
};
global.SpeechSynthesisUtterance = class { constructor(t) { this.text = t; this.pitch = 1; } };
global.Audio = class { constructor() { this.duration = 3.5; this.currentTime = 0; this.paused = true; this.playbackRate = 1; }
  play() { this.paused = false; return Promise.resolve(); } pause() { this.paused = true; } };
global.AudioContext = class { resume() { return Promise.resolve(); }
  createMediaStreamDestination() { return { stream: { getAudioTracks: () => [{}] } }; }
  createMediaElementSource() { return { connect() {} }; }
  createOscillator() { return { connect() { return { connect() {} } }, start() {} }; }
  createGain() { return { gain: { value: 1 }, connect() { return { connect() {} } } }; } };
global.fetch = () => Promise.resolve({ ok: true, blob: () => Promise.resolve(new global.Blob()) });
global.Blob = class { constructor() { this.size = 1000; } };
global.URL = { createObjectURL: () => 'blob:x', revokeObjectURL() {} };
global.MediaRecorder = { isTypeSupported: () => true };
global.confirm = () => true;
global.alert = () => {};
global.Image = class { constructor() { this.complete = false; } };
global.navigator = { userAgent: 'Chrome/126' };
global.location = { protocol: 'file:' };

let pass = 0, fail = 0;
const t = (name, cond) => { console.log(cond ? 'PASS' : 'FAIL', name); cond ? pass++ : fail++; };

try {
  new Function(src)();
  t('页面脚本在 mock 环境加载执行无异常', true);
} catch (e) {
  t('页面脚本在 mock 环境加载执行无异常', false, e.message);
  process.exit(1);
}

setTimeout(() => {
  try {
    // 1. Voice dropdown populated by renderVoicePicker
    const sel = elements['himVoiceSel'];
    t('音色下拉已渲染选项', sel && sel.innerHTML.includes('Microsoft Kangkang'), sel ? sel.innerHTML.slice(0, 80) : 'no el');

    // 2. Simulate selecting a voice
    sel.value = 'Microsoft Huihui';
    sel.options = [{ value: 'auto' }, { value: 'Microsoft Kangkang' }, { value: 'Microsoft Huihui' }];
    sel.selectedOptions = [{ textContent: 'Microsoft Huihui · zh-CN' }];
    sel.onchange();
    const saved = JSON.parse(global.localStorage.getItem('ds.tts') || '{}');
    t('选择音色后 LS 保存了 himVoice', saved.himVoice === 'Microsoft Huihui', '实际=' + saved.himVoice);
    const spoke = global.speechSynthesis._last;
    t('选择后立即试听且用了该音色', spoke && spoke.voice && spoke.voice.name === 'Microsoft Huihui',
      spoke ? ('voice=' + (spoke.voice ? spoke.voice.name : 'unset')) : '未发声');

    // 3. Press play -> playLine speaks first line with the manual voice
    if (elements['play'].onclick) elements['play'].onclick();
    setTimeout(() => {
      const last = global.speechSynthesis._last;
      t('播放时手动音色生效（早于自动分配）', last && last.voice && last.voice.name === 'Microsoft Huihui',
        last && last.voice ? last.voice.name : 'voice 未设置');

      // 4. roleMode -> solo changes labels
      const rm = elements['roleMode'];
      rm.value = 'solo';
      (rm._listeners['input'] || []).forEach(fn => fn());
      (rm._listeners['change'] || []).forEach(fn => fn());
      const savedSettings = JSON.parse(global.localStorage.getItem('ds.settings') || '{}');
      t('roleMode=solo 已保存', savedSettings.roleMode === 'solo', '实际=' + savedSettings.roleMode);
      t('soloHint 已显示', elements['soloHint'].style.display === '', 'display=' + elements['soloHint'].style.display);

      // 5. theme toggle
      const tb = elements['themeBtn'];
      if (tb.onclick) tb.onclick();
      t('主题切换后 LS 持久化', global.localStorage.getItem('ds.theme') === 'light', '实际=' + global.localStorage.getItem('ds.theme'));
      t('主题按钮文案更新', tb.textContent.includes('亮色'), tb.textContent);

      console.log('====================');
      console.log('动态模拟结果: 通过', pass, '/', pass + fail);
      process.exit(fail ? 1 : 0);
    }, 300);
  } catch (e) {
    console.log('FAIL 模拟过程异常:', e.message, e.stack.split('\n')[1]);
    process.exit(1);
  }
}, 500);
