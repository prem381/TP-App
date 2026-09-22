const licenseForm = document.querySelector('#license-form');
const licenseInput = document.querySelector('#license-key');
const licenseMessage = document.querySelector('#license-message');
const licenseScreen = document.querySelector('#license-screen');
const prompterScreen = document.querySelector('#prompter-screen');
const scriptInput = document.querySelector('#script-input');
const content = document.querySelector('#prompter-content');
const stage = document.querySelector('#stage');
const playButton = document.querySelector('#play-button');
const speedControl = document.querySelector('#speed-control');
const sizeControl = document.querySelector('#size-control');
const progressLabel = document.querySelector('#progress-label');
const clock = document.querySelector('#clock');
const scriptFile = document.querySelector('#script-file');
const importStatus = document.querySelector('#import-status');
const mirrorToggle = document.querySelector('#mirror-toggle');
const mirrorStatus = document.querySelector('#mirror-status');
const mirrorDisplay = document.querySelector('#mirror-display');
const isMirrorWindow = new URLSearchParams(window.location.search).get('mirror') === '1';

const validKeys = Array.from({ length: 100 }, (_, index) => `RELAY-${String(index + 1).padStart(4, '0')}-2026`);
const demoKey = validKeys[0];
const consumedKeysStorage = 'relay-consumed-license-keys';
let isPlaying = false;
let elapsed = 0;
let lastFrame = 0;
let scrollPosition = 0;
let animationFrame;
let mirrorWindow;
let mirrorNativeWindow;
let mirrorChannel;
let mirrorEnabled = false;
let availableMonitors = [];
let selectedMonitor = 'primary';

function showPrompter() {
  licenseScreen.classList.add('hidden');
  prompterScreen.classList.remove('hidden');
  scriptInput.focus();
}

function hasActiveLicense() {
  const activatedAt = Number(localStorage.getItem('relay-activated-at'));
  return activatedAt && Date.now() - activatedAt < 365 * 24 * 60 * 60 * 1000;
}

function getConsumedKeys() {
  return JSON.parse(localStorage.getItem(consumedKeysStorage) || '[]');
}

if (isMirrorWindow) setupMirrorWindow();
else {
  selectedMonitor = localStorage.getItem('relay-mirror-display') || 'primary';
  populateMirrorDisplays();
  if (hasActiveLicense()) showPrompter();
}

document.querySelector('#demo-key').addEventListener('click', () => {
  licenseInput.value = demoKey;
  licenseInput.focus();
});

licenseForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const key = licenseInput.value.trim().toUpperCase();
  if (!validKeys.includes(key)) {
    licenseMessage.textContent = 'That key is not on the invitation list.';
    licenseInput.focus();
    return;
  }
  if (getConsumedKeys().includes(key)) {
    licenseMessage.textContent = 'That license has already been used.';
    licenseInput.focus();
    return;
  }
  const consumedKeys = getConsumedKeys();
  if (!consumedKeys.includes(key)) {
    consumedKeys.push(key);
    localStorage.setItem(consumedKeysStorage, JSON.stringify(consumedKeys));
  }
  localStorage.setItem('relay-license-key', key);
  localStorage.setItem('relay-activated-at', String(Date.now()));
  licenseMessage.textContent = '';
  showPrompter();
});

function updateScript() {
  const text = scriptInput.value.trim();
  const words = text ? text.split(/\s+/).length : 0;
  document.querySelector('#word-count').textContent = `${words} WORD${words === 1 ? '' : 'S'}`;
  if (!text) {
    content.innerHTML = '<p class="empty-state">Your script will appear here.<br><small>Paste text in the session panel to begin.</small></p>';
    syncMirrorWindow();
    return;
  }
  content.innerHTML = `<p>${text.replace(/[&<>]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[character])).replace(/\n/g, '<br>')}</p>`;
  syncMirrorWindow();
}

scriptInput.addEventListener('input', updateScript);

async function populateMirrorDisplays() {
  mirrorDisplay.value = selectedMonitor;
  const invoke = window.__TAURI__?.core?.invoke || window.__TAURI__?.invoke;
  if (!invoke) return;
  try {
    availableMonitors = await invoke('available_monitors');
    mirrorDisplay.replaceChildren(new Option('Primary screen', 'primary'));
    availableMonitors.forEach((monitor, index) => {
      if (monitor.current) return;
      const label = monitor.name || `External screen ${index + 1}`;
      mirrorDisplay.add(new Option(`${label} (${monitor.width}x${monitor.height})`, String(index)));
    });
    if (![...mirrorDisplay.options].some((option) => option.value === selectedMonitor)) {
      selectedMonitor = 'primary';
      mirrorDisplay.value = selectedMonitor;
    }
  } catch (error) {
    mirrorStatus.textContent = `Display detection unavailable: ${error.message}`;
  }
}

function setImportedScript(text, filename) {
  scriptInput.value = text.trim();
  updateScript();
  importStatus.textContent = `${filename} imported`;
}

async function readPdf(file) {
  const pdfjs = await import('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.min.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.4.168/pdf.worker.min.mjs';
  const documentProxy = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise;
  const pages = [];
  for (let pageNumber = 1; pageNumber <= documentProxy.numPages; pageNumber += 1) {
    const page = await documentProxy.getPage(pageNumber);
    const textContent = await page.getTextContent();
    pages.push(textContent.items.map((item) => item.str).join(' '));
  }
  return pages.join('\n\n');
}

scriptFile.addEventListener('change', async () => {
  const file = scriptFile.files[0];
  if (!file) return;
  importStatus.textContent = 'Reading file...';
  try {
    let text;
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      text = await readPdf(file);
    } else if (file.name.toLowerCase().endsWith('.docx')) {
      if (!window.mammoth) throw new Error('DOCX reader unavailable');
      const result = await window.mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      text = result.value;
    } else if (/\.(txt|md|markdown)$/i.test(file.name) || ['text/plain', 'text/markdown'].includes(file.type)) {
      text = await file.text();
    } else {
      throw new Error('Use a TXT, Markdown, DOCX, or PDF file');
    }
    setImportedScript(text, file.name);
  } catch (error) {
    importStatus.textContent = error.message || 'Could not import that file.';
  } finally {
    scriptFile.value = '';
  }
});

speedControl.addEventListener('input', () => { document.querySelector('#speed-value').textContent = Number(speedControl.value).toFixed(1); });
sizeControl.addEventListener('input', () => { document.querySelector('#size-value').textContent = `${sizeControl.value}px`; content.style.setProperty('--script-size', `${sizeControl.value}px`); content.querySelector('p').style.fontSize = `${sizeControl.value}px`; syncMirrorWindow(); });

document.querySelector('#mirror-toggle').addEventListener('click', (event) => {
  toggleExternalMirror(event.currentTarget);
});
mirrorDisplay.addEventListener('change', () => {
  selectedMonitor = mirrorDisplay.value;
  localStorage.setItem('relay-mirror-display', selectedMonitor);
  if (mirrorEnabled) {
    disableExternalMirror();
    toggleExternalMirror(mirrorToggle);
  }
});
document.querySelector('#awake-toggle').addEventListener('click', (event) => {
  const pressed = event.currentTarget.getAttribute('aria-pressed') === 'true';
  event.currentTarget.setAttribute('aria-pressed', String(!pressed));
  event.currentTarget.classList.toggle('active', !pressed);
});

async function toggleFullscreen() {
  const tauriWindow = window.__TAURI__?.window?.getCurrentWindow?.();
  if (tauriWindow) {
    const isFullscreen = await tauriWindow.isFullscreen();
    await tauriWindow.setFullscreen(!isFullscreen);
    return;
  }
  if (document.fullscreenElement) {
    await document.exitFullscreen?.();
  } else {
    await document.documentElement.requestFullscreen?.();
  }
}

document.querySelector('#fullscreen-button').addEventListener('click', () => {
  toggleFullscreen().catch((error) => {
    console.error('Unable to toggle fullscreen:', error);
  });
});
document.querySelector('#reset-script').addEventListener('click', () => { scriptInput.value = ''; scrollPosition = 0; content.style.transform = ''; updateScript(); });
document.querySelector('#rewind-button').addEventListener('click', () => { scrollPosition = Math.max(0, scrollPosition - 120); content.style.transform = `translateY(-${scrollPosition}px)`; syncMirrorWindow(); });
document.querySelector('#forward-button').addEventListener('click', () => { scrollPosition += 120; content.style.transform = `translateY(-${scrollPosition}px)`; syncMirrorWindow(); });

function getExternalScreen(screenDetails) {
  return screenDetails.screens.find((candidate) => candidate !== screenDetails.currentScreen && (candidate.left !== screen.screenX || candidate.top !== screen.screenY));
}

function createBrowserMirrorWindow(targetScreen) {
  const features = `popup=yes,left=${targetScreen.availLeft},top=${targetScreen.availTop},width=${targetScreen.availWidth},height=${targetScreen.availHeight}`;
  mirrorWindow = window.open('', 'relay-external-mirror', features);
  if (!mirrorWindow) throw new Error('Allow pop-ups to open the external mirror.');
  mirrorWindow.document.write(`<!doctype html><html><head><title>Relay External Mirror</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#262a27;color:#f3f1e9;font-family:Manrope,Arial,sans-serif;cursor:none}.mirror-stage{position:relative;width:100%;height:100%;overflow:hidden}.mirror-line{position:absolute;top:36%;width:100%;border-top:1px solid rgba(200,232,107,.65);z-index:2}.mirror-content{position:absolute;top:36%;width:100%;padding:30px 8%;transform-origin:center center}.mirror-content p{margin:0;font-size:48px;line-height:1.35;letter-spacing:-.04em;font-weight:600;max-width:900px}.empty-state{color:rgba(243,241,233,.4);text-align:center;font-size:24px!important;font-weight:400!important}.empty-state small{font:11px monospace}</style></head><body><div class="mirror-stage"><div class="mirror-line"></div><div id="mirror-content" class="mirror-content"></div></div></body></html>`);
  mirrorWindow.document.close();
  mirrorWindow.moveTo(targetScreen.availLeft, targetScreen.availTop);
  mirrorWindow.resizeTo(targetScreen.availWidth, targetScreen.availHeight);
  requestMirrorFullscreen(targetScreen);
  mirrorWindow.addEventListener('beforeunload', () => { mirrorWindow = null; disableExternalMirror('External mirror closed.'); });
  syncMirrorWindow();
}

async function createNativeMirrorWindow(selectedMonitorInfo) {
  const WebviewWindow = window.__TAURI__?.webviewWindow?.WebviewWindow;
  if (!WebviewWindow) return false;
  const targetMonitor = selectedMonitorInfo || availableMonitors.find((monitor) => !monitor.current);
  if (!targetMonitor) throw new Error('No external display detected.');
  const position = { x: targetMonitor.x, y: targetMonitor.y };
  const size = { width: targetMonitor.width, height: targetMonitor.height };
  const mirrorUrl = new URL('index.html?mirror=1', window.location.href).href;
  mirrorNativeWindow = new WebviewWindow('relay-external-mirror', {
    url: mirrorUrl,
    title: 'Relay Teleprompter Mirror',
    x: position.x,
    y: position.y,
    width: size.width,
    height: size.height,
    decorations: false,
    resizable: false,
    fullscreen: true,
    focus: false
  });
  mirrorChannel = new BroadcastChannel('relay-mirror');
  mirrorChannel.addEventListener('message', (event) => {
    if (event.data?.type === 'ready') syncMirrorWindow();
  });
  mirrorNativeWindow.once('tauri://destroyed', () => {
    mirrorChannel?.close();
    mirrorChannel = null;
    mirrorNativeWindow = null;
    mirrorEnabled = false;
    mirrorToggle.setAttribute('aria-pressed', 'false');
    mirrorToggle.classList.remove('active');
  });
  return true;
}

function requestMirrorFullscreen(targetScreen) {
  if (!mirrorWindow || mirrorWindow.closed) return;
  const fullscreenRequest = mirrorWindow.document.documentElement.requestFullscreen?.();
  if (fullscreenRequest) {
    fullscreenRequest.catch(() => fillMirrorDisplay(targetScreen));
  } else {
    fillMirrorDisplay(targetScreen);
  }
}

function fillMirrorDisplay(targetScreen) {
  if (!mirrorWindow || mirrorWindow.closed) return;
  mirrorWindow.moveTo(targetScreen.availLeft, targetScreen.availTop);
  mirrorWindow.resizeTo(targetScreen.availWidth, targetScreen.availHeight);
  mirrorStatus.textContent = 'External mirror active (display-sized)';
}

function syncMirrorWindow() {
  if (!mirrorEnabled) return;
  const primaryTransform = selectedMonitor === 'primary' ? `translateY(-${scrollPosition}px) scaleX(-1)` : `translateY(-${scrollPosition}px)`;
  content.style.transform = primaryTransform;
  if (mirrorNativeWindow && mirrorChannel) {
    mirrorChannel.postMessage({
      html: content.innerHTML,
      fontSize: `${sizeControl.value}px`,
      scrollPosition,
      isPlaying,
      mirrorPrimary: selectedMonitor === 'primary'
    });
    return;
  }
  if (!mirrorWindow || mirrorWindow.closed) return;
  const mirrorContent = mirrorWindow.document.querySelector('#mirror-content');
  if (!mirrorContent) return;
  mirrorContent.innerHTML = content.innerHTML;
  const sourceText = content.querySelector('p');
  const targetText = mirrorContent.querySelector('p');
  if (sourceText && targetText) targetText.style.fontSize = `${sizeControl.value}px`;
  mirrorContent.style.transform = `translateY(-${scrollPosition}px) scaleX(-1)`;
}

function disableExternalMirror(message = '') {
  mirrorEnabled = false;
  content.style.transform = `translateY(-${scrollPosition}px)`;
  mirrorToggle.setAttribute('aria-pressed', 'false');
  mirrorToggle.classList.remove('active');
  if (mirrorWindow && !mirrorWindow.closed) mirrorWindow.close();
  if (mirrorNativeWindow) mirrorNativeWindow.close();
  mirrorChannel?.close();
  mirrorChannel = null;
  mirrorNativeWindow = null;
  mirrorWindow = null;
  mirrorStatus.textContent = message;
}

async function toggleExternalMirror(button) {
  if (mirrorEnabled) {
    disableExternalMirror();
    return;
  }
  try {
    if (selectedMonitor === 'primary') {
      mirrorEnabled = true;
      button.setAttribute('aria-pressed', 'true');
      button.classList.add('active');
      mirrorStatus.textContent = 'Mirroring on primary screen';
      syncMirrorWindow();
      return;
    }
    if (window.__TAURI__?.webviewWindow?.WebviewWindow) {
      await createNativeMirrorWindow(availableMonitors[Number(selectedMonitor)]);
      mirrorEnabled = true;
      button.setAttribute('aria-pressed', 'true');
      button.classList.add('active');
      syncMirrorWindow();
      mirrorStatus.textContent = 'External mirror active';
      return;
    }
    let screenDetails;
    if (typeof window.getScreenDetails === 'function') {
      screenDetails = await window.getScreenDetails();
    } else {
      throw new Error('Connect a second display in a browser with multi-screen support.');
    }
    const targetScreen = getExternalScreen(screenDetails);
    if (!targetScreen) throw new Error('No external display detected.');
    createBrowserMirrorWindow(targetScreen);
    mirrorEnabled = true;
    button.setAttribute('aria-pressed', 'true');
    button.classList.add('active');
    syncMirrorWindow();
    mirrorStatus.textContent = 'External mirror active';
  } catch (error) {
    disableExternalMirror(error.message);
  }
}

function setupMirrorWindow() {
  document.body.classList.add('mirror-only');
  licenseScreen.classList.add('hidden');
  prompterScreen.classList.remove('hidden');
  mirrorChannel = new BroadcastChannel('relay-mirror');
  mirrorChannel.addEventListener('message', (event) => {
    const state = event.data;
    if (state?.type === 'ready') {
      mirrorChannel.postMessage({ type: 'ready' });
      return;
    }
    content.innerHTML = state.html;
    const targetText = content.querySelector('p');
    if (targetText) targetText.style.fontSize = state.fontSize;
    content.style.transform = `translateY(-${state.scrollPosition}px) scaleX(-1)`;
  });
  mirrorChannel.postMessage({ type: 'ready' });
}

function togglePlayback() {
  isPlaying = !isPlaying;
  playButton.textContent = isPlaying ? 'Ⅱ' : '▶';
  if (isPlaying) { lastFrame = performance.now(); animationFrame = requestAnimationFrame(tick); }
}
function tick(now) {
  if (!isPlaying) return;
  const delta = now - lastFrame;
  lastFrame = now;
  scrollPosition += Number(speedControl.value) * delta / 70;
  content.style.transform = `translateY(-${scrollPosition}px)`;
  syncMirrorWindow();
  elapsed += delta;
  clock.textContent = new Date(elapsed).toISOString().slice(14, 19);
  const maxScroll = Math.max(1, content.offsetHeight - stage.offsetHeight * .55);
  progressLabel.textContent = `${Math.min(100, Math.round(scrollPosition / maxScroll * 100))}%`;
  animationFrame = requestAnimationFrame(tick);
}
playButton.addEventListener('click', togglePlayback);
document.addEventListener('keydown', (event) => {
  if (event.code === 'Space' && document.activeElement !== scriptInput) { event.preventDefault(); togglePlayback(); }
  if (event.key === 'ArrowUp') speedControl.value = Math.min(8, Number(speedControl.value) + .5);
  if (event.key === 'ArrowDown') speedControl.value = Math.max(.5, Number(speedControl.value) - .5);
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'l') { event.preventDefault(); document.querySelector('#lock-button').classList.toggle('locked'); }
});
