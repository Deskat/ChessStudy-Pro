const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const out = path.join(__dirname, 'app-content');

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const item of fs.readdirSync(from, { withFileTypes: true })) {
    const source = path.join(from, item.name);
    const target = path.join(to, item.name);
    if (item.isDirectory()) copyTree(source, target);
    else if (item.isFile()) fs.copyFileSync(source, target);
  }
}

function replaceExactly(source, oldValue, newValue, label) {
  const count = source.split(oldValue).length - 1;
  if (count !== 1) throw new Error(label + ': expected one match, found ' + count);
  return source.replace(oldValue, newValue);
}

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });
for (const folder of ['pieces', 'recognition', 'icons']) {
  copyTree(path.join(root, folder), path.join(out, folder));
}
fs.copyFileSync(path.join(root, 'manifest.webmanifest'), path.join(out, 'manifest.webmanifest'));

let html = fs.readFileSync(path.join(root, 'pc.html'), 'utf8');

html = replaceExactly(html,
  '<div><label class="label" for="threadsSelect">Потоки CPU</label><select class="select" id="threadsSelect" style="width:100%" disabled><option value="1" selected>1 поток (веб-сборка)</option></select></div>',
  '<div><label class="label" for="threadsSelect">Потоки CPU</label><select class="select" id="threadsSelect" style="width:100%"><option value="6" selected>6 потоков</option></select></div>',
  'CPU thread selector');

html = replaceExactly(html,
  'setStatus(\'Загружаю \'+engineLabel+\' на ПК. \'+(variant===\'lite\'?\'Загрузка около 1,7 МБ.\':\'Загрузка около 94 МБ; на медленном интернете это может занять время.\'),\'loading\');',
  'setStatus(\'Запускаю нативный \'+engineLabel+\' на процессоре компьютера…\',\'loading\');',
  'native engine loading status');

html = replaceExactly(html,
  '    const workerUrl=new URL(engineFile,engineBase);\n    engine=new Worker(workerUrl.href);',
  '    if(window.chessStudyProDesktop){\n     engine=window.chessStudyProDesktop.createWorker();\n     await engine.ready;\n    }else{\n     const workerUrl=new URL(engineFile,engineBase);\n     engine=new Worker(workerUrl.href);\n    }',
  'native engine worker bridge');

html = replaceExactly(html,
  '       setStatus(engineLabel+\' готов. Работает локально в браузере, в 1 поток.\',\'ok\');',
  '       setStatus(engineLabel+\' готов. Работает локально на CPU, потоков: \'+$(\'threadsSelect\').value,\'ok\');',
  'native engine ready status');

html = replaceExactly(html,
  'engine.onerror=e=>fail(new Error(\'Не удалось запустить Stockfish в браузере. Попробуй Lite или перезагрузи страницу.\'));',
  'engine.onerror=e=>fail(new Error(\'Ошибка Stockfish: \'+(e.message||\'не удалось запустить нативный движок.\')));',
  'native engine error status');

html = replaceExactly(html,
  'engine.postMessage(\'setoption name Threads value 1\');',
  'engine.postMessage(\'setoption name Threads value \'+$(\'threadsSelect\').value);',
  'native CPU thread setting');

html = replaceExactly(html,
  "$('engineDepth').textContent=engineLabel+' · 1 поток';",
  "$('engineDepth').textContent=engineLabel+' · '+$('threadsSelect').value+' поток(ов)';",
  'native engine initial depth label');

html = replaceExactly(html,
  "const d=line.match(/\\bdepth (\\d+)/);if(d)$('engineDepth').textContent='Stockfish 19 · глубина '+d[1]+' · 1 поток';",
  "const d=line.match(/\\bdepth (\\d+)/);if(d)$('engineDepth').textContent='Stockfish 19 · глубина '+d[1]+' · '+$('threadsSelect').value+' поток(ов)';",
  'native engine depth label');

html = replaceExactly(html,
  "$('engineDepth').textContent='Comeback · максимальная сила · 1 поток';",
  "$('engineDepth').textContent='Comeback · максимальная сила · '+$('threadsSelect').value+' поток(ов)';",
  'native Comeback label');

html = replaceExactly(html,
  "if(location.protocol==='https:') setStatus('Интерфейс запущен. Кнопки, ввод ходов и доска активны. Движок загрузится при первом анализе.','ok');\nelse setStatus('Интерфейс запущен, но для Stockfish открой страницу по HTTPS в браузере.','error');",
  "if(window.chessStudyProDesktop || location.protocol==='https:') setStatus('ChessStudy Pro для Windows запущен. Stockfish 19 готов к анализу.','ok');\nelse setStatus('Интерфейс запущен. Для запуска Stockfish открой опубликованную HTTPS-страницу.','error');",
  'desktop startup status');

html = html.replace(
  'Движок запускается прямо в браузере ПК. Сейчас в проекте установлена однопоточная WASM-сборка, поэтому дополнительные потоки пока недоступны. Для полного Stockfish загружается около 94 МБ; для обычной работы оставь Hash 256 МБ.',
  'В настольной версии используется нативный Stockfish 19 для Windows. Он работает на процессоре и поддерживает несколько потоков. Число потоков и память Hash можно менять перед анализом.');

html = html.replace('Текущая веб-сборка работает в 1 поток.', 'В настольной версии используется нативный Stockfish 19 с поддержкой нескольких потоков.');
html = html.replace('В этой веб-сборке оба варианта работают в 1 поток.', 'Настольная версия использует нативный Stockfish 19.');

const bridge = [
  '(() => {',
  '  const tauri = window.__TAURI__;',
  '  if (!tauri || !tauri.core || !tauri.event) return;',
  '  const invoke = tauri.core.invoke;',
  '  const listen = tauri.event.listen;',
  '  function createWorker() {',
  '    let onmessage = null;',
  '    let onerror = null;',
  '    let unlistenMessage = null;',
  '    let unlistenError = null;',
  '    const ready = (async () => {',
  '      unlistenMessage = await listen("engine-message", event => { if (typeof onmessage === "function") onmessage({ data: event.payload }); });',
  '      unlistenError = await listen("engine-error", event => { if (typeof onerror === "function") onerror({ message: String(event.payload) }); });',
  '      await invoke("start_engine");',
  '    })();',
  '    return {',
  '      ready,',
  '      get onmessage() { return onmessage; },',
  '      set onmessage(callback) { onmessage = callback; },',
  '      get onerror() { return onerror; },',
  '      set onerror(callback) { onerror = callback; },',
  '      postMessage(command) { invoke("send_engine_command", { command: String(command) }).catch(error => { if (typeof onerror === "function") onerror({ message: String(error) }); }); },',
  '      terminate() {',
  '        invoke("stop_engine").catch(() => {});',
  '        if (unlistenMessage) unlistenMessage();',
  '        if (unlistenError) unlistenError();',
  '      }',
  '    };',
  '  }',
  '  window.chessStudyProDesktop = { createWorker };',
  '  function configureCpuThreads() {',
  '    const select = document.getElementById("threadsSelect");',
  '    if (!select) return;',
  '    const maximum = Math.max(1, Math.min(32, Number(navigator.hardwareConcurrency) || 4));',
  '    const values = [...new Set([1, 2, 3, 4, 6, 8, 10, 12, 16, 24, maximum].filter(value => value <= maximum))].sort((a, b) => a - b);',
  '    select.innerHTML = "";',
  '    for (const value of values) {',
  '      const option = document.createElement("option");',
  '      option.value = String(value);',
  '      option.textContent = value + (value === 1 ? " поток" : " потоков");',
  '      select.appendChild(option);',
  '    }',
  '    select.value = String(Math.min(6, maximum));',
  '    select.disabled = false;',
  '    const variant = document.getElementById("engineVariant");',
  '    if (variant) { variant.value = "full"; variant.disabled = true; if (variant.parentElement) variant.parentElement.style.display = "none"; }',
  '  }',
  '  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", configureCpuThreads, { once: true });',
  '  else configureCpuThreads();',
  '})();'
].join('\n');

html = html.replace('</body>', '<script src="./desktop-bridge.js"></script>\n</body>');
fs.writeFileSync(path.join(out, 'desktop-bridge.js'), bridge, 'utf8');
fs.writeFileSync(path.join(out, 'pc.html'), html, 'utf8');
fs.writeFileSync(path.join(out, 'index.html'), html, 'utf8');

for (const check of ['window.chessStudyProDesktop.createWorker()', 'setoption name Threads value', 'desktop-bridge.js', 'recognition/fenshot.bundle.js']) {
  if (!html.includes(check)) throw new Error('Desktop patch verification failed: ' + check);
}
console.log('Prepared ChessStudy Pro desktop frontend at ' + out);
