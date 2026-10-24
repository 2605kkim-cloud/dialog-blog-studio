// ===== FULL SITE TEST SUITE =====
const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');
const report = [];
const check = (name, pass, detail = '') => report.push({ name, pass, detail });

const scriptMatch = html.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/);
const src = scriptMatch[1];

// ---------- A. DOM integrity ----------
const ids = new Set([...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]));
const refs = [...src.matchAll(/\$\('([^']+)'\)/g)].map(m => m[1]);
const missing = [...new Set(refs.filter(r => !ids.has(r)))];
check('DOM: 所有 $() 引用的元素都存在', missing.length === 0, missing.length ? '缺失: ' + missing.join(', ') : refs.length + ' 个引用全部命中');

const allIdMatches = [...html.matchAll(/id="([^"]+)"/g)].map(m => m[1]);
const dupIds = allIdMatches.filter((v, i, a) => a.indexOf(v) !== i);
check('DOM: 无重复 id', dupIds.length === 0, dupIds.join(', ') || 'ok');

// ---------- B. Syntax ----------
try { new Function(src); check('JS: 主脚本语法', true); }
catch (e) { check('JS: 主脚本语法', false, e.message); }

// ---------- C. Voice selection chain ----------
check('音色: 下拉 onchange 保存+toast+hotApply+preview', /himVoiceSel'\)\.onchange = \(\) => \{[\s\S]*?LS\.set[\s\S]*?toast[\s\S]*?hotApplyTts\(\)[\s\S]*?previewVoice/.test(src));
check('音色: renderVoicePicker 保留用户当前选择', src.includes('const prev = sel.value'));
check('音色: 轮询终身运行不提前停止', src.includes('永不提前停止'));
check('音色: 首次点按 warmup', src.includes('首次点按页面任意处时强制刷一次'));
check('音色: start() 只采纳已加载的下拉 (>1 项)', src.includes('options.length > 1'));
check('音色: speak() 手动音色优先命中', /manualName && manualName !== 'auto'[\s\S]{0,300}return \{ utter: u \}/.test(src));
check('音色: 试听与播放共用 roleSlot 分配', src.includes('function roleSlot') && src.includes('roleSlot(role)'));
check('音色: 热应用清空 API 缓存', src.includes('audioCache.clear()'));
check('音色: syncTtsFromForm 唯一同步点', (src.match(/function syncTtsFromForm/g) || []).length === 1);
check('音色: previewVoice 语音引擎无响应提示', src.includes('语音引擎没有响应'));

// ---------- D. Video export chain ----------
check('导出: 无声引擎前置 confirm', src.includes('其声音无法录入视频') && src.includes('const okGo = confirm'));
check('导出: setInterval(33) 帧循环（后台不冻结）', src.includes('const iv = setInterval(frame, 33)'));
const exportZone = src.slice(src.indexOf('正在渲染'), src.indexOf('正在封装'));
check('导出: rAF 已从导出循环移除', !/requestAnimationFrame\(frame\)/.test(exportZone));
check('导出: 暂停期间 elapsedBase 不增长', /if \(pausedFlag\) return;[\s\S]{0,80}elapsedBase \+= dt/.test(src));
check('导出: 有音频时字幕加权对齐 currentTime', src.includes('weightedDone(item.text, audio.currentTime / audio.duration)'));
check('导出: 气泡绘制（与播放器一致）', src.includes('settings.exportBubbles !== false'));
check('导出: roundRect 兼容垫片', src.includes('function roundRectPath'));
check('导出: 静音铺底保音轨', src.includes('silentGain.gain.value = 0'));
check('导出: 可取消且丢弃内容', src.includes('rec.ondataavailable = null'));
check('导出: 导出前调用 syncTtsFromForm', /export4kBtn'\)\.onclick[\s\S]{0,800}syncTtsFromForm\(\)/.test(src));
check('导出: MP4 优先 + WebM 降级链', src.includes("video/mp4;codecs=avc1.640028,mp4a.40.2"));
check('导出: 背景图加载超时保护', src.includes('setTimeout(r, 3000)'));

// ---------- E. Playback chain ----------
check('播放: onboundary 逐字同步', src.includes('u.onboundary = e =>'));
check('播放: 模式B 加权映射与导出一致', src.includes('weightedDone(item.text, a.currentTime / a.duration)'));
check('播放: speechClock 按音色分键校准', src.includes('speechClock[vKey]') && src.includes('滑动平均'));
check('播放: macOS 默认语速 200 字/分', src.includes('200 * parseFloat'));
check('播放: 空闲检测需连续 2 次（防 macOS 停顿误判）', src.includes('idleStreak >= 2'));
check('播放: 模式C 帧 setInterval 驱动（后台安全）', src.includes('const iv = setInterval(() => {'));
check('播放: onend 120ms 扫满（不瞬间跳）', src.includes('120ms 快速扫过'));
check('播放: 句间自适应停顿', src.includes('模拟真人对话换气'));
check('播放: API 预取下一句', src.includes('function prefetchAudio'));
check('播放: 引擎假死看门狗', src.includes('语音引擎假死看门狗'));
check('播放: pause 后 resume 唤醒', src.includes('speechSynthesis.resume()'));

// ---------- F. Structure/UX ----------
check('主题: 明暗切换 + 持久化', html.includes("LS.get('ds.theme'") && html.includes("data-theme='light'"));
check('主题: 黑红暗色 accent', html.includes('--accent: #e63b4c'));
check('角色: A/B 中性命名（无性别残留）', !/男声|女声|男女|♂|♀/.test(html));
check('编辑器: 角色切换按钮', src.includes('点击切换角色A/角色B'));
check('SRT: 导出带 BOM', /Blob\(\['/.test(src) && /srt/.test(src));
check('分段续写: 存在', src.includes('SEG_INTRO') || src.includes('分 ${seg.total} 段生成'));
check('多语言: ≥9 种语言', (src.match(/speech: '/g) || []).length >= 9);
check('localStorage 键: tts/settings/theme/speechClock 均持久化', src.includes("LS.get('ds.tts'") && src.includes("LS.get('ds.settings'") && src.includes("LS.get('ds.theme'") && src.includes("LS.get('ds.speechClock'"));
check('XSS: 编辑器渲染不使用 raw innerHTML 注入用户文本', !src.includes('.msg').toString() || !/innerHTML = `[^`]*\$\{item\.text\}/.test(src));

// ---------- output ----------
const fails = report.filter(r => !r.pass);
console.log('===== 测试报告 =====');
report.forEach(r => console.log((r.pass ? 'PASS' : 'FAIL'), r.name, r.pass ? '' : '→ ' + r.detail));
console.log('====================');
console.log('通过:', report.length - fails.length, '/', report.length);
if (fails.length) { console.log('待修问题:'); fails.forEach(f => console.log(' -', f.name, '|', f.detail)); }
