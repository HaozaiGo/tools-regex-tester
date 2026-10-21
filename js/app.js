/* === Regex Tester - App Logic === */

const regexWorkerURL = new URL('regex-worker.js', document.currentScript.src);
let activeWorker;
let workerTimer;
let lastReplacement = null;
function uiText(en, zh) {
  return document.documentElement.lang.startsWith('zh') ? zh : en;
}

function cancelTest() {
  clearTimeout(workerTimer);
  if (activeWorker) activeWorker.terminate();
  activeWorker = null;
}

document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initFlags();
  initPresets();
  initAutoTest();
  initKeybindings();
  updateResults();
});

/* ---- State ---- */
let currentMode = 'test';

/* ---- Tab/Mode Switching ---- */
function initTabs() {
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchMode(tab.dataset.mode));
  });
}

function switchMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.tab').forEach(t => {
    t.classList.toggle('active', t.dataset.mode === mode);
    t.setAttribute('aria-selected', t.dataset.mode === mode ? 'true' : 'false');
    t.tabIndex = t.dataset.mode === mode ? 0 : -1;
  });
  
  document.getElementById('replace-row').style.display = mode === 'replace' ? 'block' : 'none';
  document.getElementById('replace-card').style.display = mode === 'replace' ? 'block' : 'none';
  
  updateResults();
}

/* ---- Flags ---- */
function initFlags() {
  document.querySelectorAll('.flag-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.classList.toggle('active');
      syncFlagsFromButtons();
      updateResults();
    });
  });
}

function syncFlagsFromButtons() {
  const flags = [];
  document.querySelectorAll('.flag-btn.active').forEach(btn => flags.push(btn.dataset.flag));
  document.getElementById('regex-flags').value = flags.join('');
}

function syncFlagsFromInput() {
  const flagsStr = document.getElementById('regex-flags').value;
  const flags = flagsStr.split('');
  document.querySelectorAll('.flag-btn').forEach(btn => {
    btn.classList.toggle('active', flags.includes(btn.dataset.flag));
  });
}

/* ---- Presets ---- */
function initPresets() {
  document.querySelectorAll('.preset-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('regex-pattern').value = btn.dataset.pattern;
      document.getElementById('regex-flags').value = btn.dataset.flags || '';
      syncFlagsFromInput();
      updateResults();
    });
  });
}

/* ---- Auto Test on Input ---- */
function initAutoTest() {
  ['regex-pattern', 'regex-flags', 'test-string', 'replace-with'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateResults);
  });
  document.getElementById('regex-flags').addEventListener('change', () => {
    syncFlagsFromInput();
    updateResults();
  });
}

/* ---- Keybindings ---- */
function initKeybindings() {
  document.getElementById('test-string').addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      updateResults();
    }
  });
}

/* ---- Main Update ---- */
function updateResults() {
  cancelTest();
  const patternStr = document.getElementById('regex-pattern').value;
  const flags = document.getElementById('regex-flags').value;
  const testStr = document.getElementById('test-string').value;
  const replaceStr = document.getElementById('replace-with')?.value || '';

  // Update char count
  document.getElementById('char-count').textContent = formatCharCount(testStr.length);

  // Clear error state
  document.querySelector('.regex-field')?.classList.remove('regex-error');

  if (!patternStr) {
    resetResults();
    return;
  }

  if (testStr.length > 1000000 || patternStr.length > 10000 || replaceStr.length > 100000) {
    showError(uiText('Input too large. Use a smaller pattern or text.', '输入过大，请缩短表达式或文本。'));
    return;
  }
  resetResults();
  document.getElementById('match-time').textContent = uiText('Testing...', '测试中...');
  try {
    const worker = new Worker(regexWorkerURL);
    activeWorker = worker;
    const fail = message => {
      if (activeWorker !== worker) return;
      cancelTest();
      document.querySelector('.regex-field')?.classList.add('regex-error');
      showError(message);
    };
    workerTimer = setTimeout(() => fail(uiText('Pattern timed out after 1 second. Simplify it and try again.', '表达式运行超过 1 秒，已停止。请简化后重试。')), 1000);
    worker.onerror = () => fail(uiText('Regex worker failed. Please try again.', '正则测试进程失败，请重试。'));
    worker.onmessage = ({ data }) => {
      if (activeWorker !== worker) return;
      if (data.error) {
        const messages = {
          TOO_MANY_REPLACEMENTS: uiText('More than 10,000 replacements. Narrow the pattern or shorten the text.', '替换次数超过 10,000，请缩小匹配范围或缩短文本。'),
          REPLACEMENT_TOO_LARGE: uiText('Replacement may exceed 1,000,000 characters. Shorten the text or replacement.', '替换结果可能超过 1,000,000 字符，请缩短文本或替换内容。')
        };
        fail(messages[data.errorCode] || data.error);
        return;
      }
      cancelTest();
      updateHighlight(testStr, data.matches);
      updateDetails(data.matches);
      const count = data.matches.length + (data.truncated ? '+' : '');
      document.getElementById('match-count').textContent = count + (currentMode === 'replace' ? uiText(' replacements', ' 处替换') : uiText(' matches', ' 个匹配'));
      document.getElementById('match-time').textContent = `${data.elapsed}ms`;
      if (currentMode === 'replace') {
        lastReplacement = data.result;
        document.getElementById('replace-result').textContent = data.result;
      }
      updateExplanation(patternStr, flags);
    };
    worker.postMessage({ pattern: patternStr, flags, text: testStr, replacement: replaceStr, mode: currentMode });
  } catch (error) {
    cancelTest();
    showError(error.message);
  }
}

/* ---- Highlight Preview ---- */
function updateHighlight(text, matches) {
  const preview = document.getElementById('highlight-preview');
  if (!text) {
    preview.textContent = uiText('Enter test text to highlight matches', '输入测试文本后将显示匹配高亮');
    return;
  }
  if (matches.length === 0) {
    preview.innerHTML = escapeHtml(text);
    return;
  }

  let result = '';
  let lastIndex = 0;

  for (let i = 0; i < matches.length; i++) {
    const m = matches[i];
    // Text before match
    if (m.index > lastIndex) {
      result += escapeHtml(text.substring(lastIndex, m.index));
    }
    // The match itself
    const altClass = i % 2 === 1 ? 'match-highlight-alt' : '';
    result += `<span class="match-highlight ${altClass}" title="Match ${i+1} at position ${m.index}">${escapeHtml(m.text)}</span>`;
    lastIndex = m.index + m.text.length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    result += escapeHtml(text.substring(lastIndex));
  }

  preview.innerHTML = result;
}

/* ---- Match Details ---- */
function updateDetails(matches) {
  const container = document.getElementById('match-details');
  
  if (matches.length === 0) {
    container.textContent = uiText('No matches', '暂无匹配结果');
    return;
  }

  // Show first 100 matches max
  const showCount = Math.min(matches.length, 100);
  let html = '';
  for (let i = 0; i < showCount; i++) {
    const m = matches[i];
    html += `<div class="match-item">`;
    html += `<span class="match-num">#${i + 1}</span>`;
    html += `<span class="match-text">${escapeHtml(truncate(m.text, 80))}</span>`;
    html += `<span class="match-pos">[${m.index}-${m.index + m.text.length}]</span>`;

    // Groups
    const hasGroups = m.groups.some(g => g !== undefined);
    const hasNamed = Object.keys(m.namedGroups).length > 0;
    
    if (hasGroups || hasNamed) {
      html += `<div class="match-groups">`;
      if (hasGroups) {
        m.groups.forEach((g, idx) => {
          if (g !== undefined) {
            html += `<div class="match-group-item">$${idx + 1} → ${escapeHtml(truncate(g, 60))}</div>`;
          }
        });
      }
      if (hasNamed) {
        for (const [name, val] of Object.entries(m.namedGroups)) {
          html += `<div class="match-group-item">$&lt;${name}&gt; → ${escapeHtml(truncate(val, 60))}</div>`;
        }
      }
      html += `</div>`;
    }
    html += `</div>`;
  }

  if (matches.length > 100) {
    html += `<div class="match-item">${uiText(`${matches.length - 100} more matches`, `还有 ${matches.length - 100} 个匹配未显示`)}</div>`;
  }

  container.innerHTML = html;
}

/* ---- Pattern Explanation ---- */
function updateExplanation(pattern, flags) {
  const container = document.getElementById('pattern-explanation');
  
  if (!pattern) {
    container.textContent = uiText('Enter a pattern to analyze', '输入正则表达式后将自动分析');
    return;
  }

  let html = '';
  const parts = parsePattern(pattern);
  
  if (parts.length === 0) {
    html = `<div class="explain-row"><span class="explain-desc">${uiText('Unable to explain this pattern', '无法解析此模式的结构')}</span></div>`;
  } else {
    for (const p of parts) {
      html += `<div class="explain-row"><span class="explain-token">${escapeHtml(p.token)}</span><span class="explain-sep"> → </span><span class="explain-desc">${escapeHtml(p.desc)}</span></div>`;
    }
  }

  // Flags explanation
  if (flags) {
    const flagDescs = {
      g: uiText('Global (all matches)', '全局匹配（查找所有匹配项）'),
      i: uiText('Ignore case', '忽略大小写'),
      m: uiText('Multiline anchors', '多行模式（^/$ 匹配每行首尾）'),
      s: uiText('Dot matches newlines', '点号通配模式（. 匹配换行符）'),
      u: uiText('Unicode', 'Unicode 模式'),
      v: uiText('Unicode sets', 'Unicode 字符集'),
      d: uiText('Match indices', '匹配索引'),
      y: uiText('Sticky (match at lastIndex)', '粘连模式（从 lastIndex 开始匹配）')
    };
    html += `<div class="explain-row" style="margin-top: 8px; padding-top: 8px; border-top: 1px solid var(--border);">`;
    html += `<span class="explain-desc"><strong>${uiText('Flags', '标志位')}:</strong> `;
    for (const f of flags) {
      html += `/${f} ${flagDescs[f] || uiText('Unknown', '未知')}; `;
    }
    html += `</span></div>`;
  }

  container.innerHTML = html;
}

function parsePattern(pattern) {
  const parts = [];
  let i = 0;
  
  while (i < pattern.length) {
    if (pattern[i] === '\\' && i + 1 < pattern.length) {
      const next = pattern[i + 1];
      const token = '\\' + next;
      const desc = getEscapeDesc(next);
      parts.push({ token, desc });
      i += 2;
      continue;
    }

    if (pattern[i] === '[') {
      let j = i + 1;
      let depth = 1;
      while (j < pattern.length && depth > 0) {
        if (pattern[j] === '[') depth++;
        if (pattern[j] === ']') depth--;
        if (pattern[j] === '\\') j++;
        j++;
      }
      const token = pattern.substring(i, j);
      const inner = token.slice(1, -1);
      const uniqueChars = [...new Set(inner.replace(/\\[a-z]/gi, ''))].filter(c => c !== '-');
      parts.push({ token, desc: uiText('Character set', '字符集') + ` [${inner.length > 15 ? inner.substring(0, 12) + '...' : inner}]` });
      i = j;
      continue;
    }

    if (pattern[i] === '(') {
      let j = i + 1;
      let depth = 1;
      const isNamed = pattern.substring(i, i + 3) === '(?<' || pattern.substring(i, i + 4) === '(?P<';
      const isNonCap = pattern.substring(i, i + 3) === '(?:' || pattern.substring(i, i + 3) === '(?=' || pattern.substring(i, i + 3) === '(?!' || pattern.substring(i, i + 3) === '(?<=' || pattern.substring(i, i + 3) === '(?<!';
      
      while (j < pattern.length && depth > 0) {
        if (pattern[j] === '\\') { j += 2; continue; }
        if (pattern[j] === '(') depth++;
        if (pattern[j] === ')') depth--;
        j++;
      }
      const token = pattern.substring(i, j);
      let desc = uiText('Group', '分组');
      if (isNonCap) desc = uiText('Non-capturing group or assertion', '非捕获分组或断言');
      else if (isNamed) desc = uiText('Named group', '命名分组');
      else desc = uiText('Capturing group', '捕获分组') + ` #${parts.filter(p => p.token.startsWith('(') && !p.token.startsWith('(?:')).length + 1}`;
      parts.push({ token: token.length > 20 ? token.substring(0, 17) + '...' : token, desc });
      i = j;
      continue;
    }

    // Quantifier
    if (pattern[i] === '*' || pattern[i] === '+' || pattern[i] === '?') {
      const desc = { '*': uiText('Zero or more', '零次或多次'), '+': uiText('One or more', '一次或多次'), '?': uiText('Zero or one', '零次或一次') }[pattern[i]];
      parts.push({ token: pattern[i], desc });
      // Check for lazy
      if (i + 1 < pattern.length && pattern[i + 1] === '?') {
        parts[parts.length - 1].desc += uiText(' (lazy)', '（非贪婪）');
        i++;
      }
      i++;
      continue;
    }

    if (pattern[i] === '{') {
      let j = i + 1;
      while (j < pattern.length && pattern[j] !== '}') j++;
      const token = pattern.substring(i, j + 1);
      parts.push({ token, desc: uiText(`Repeat ${token.slice(1, -1)} times`, `重复 ${token.slice(1, -1)} 次`) });
      i = j + 1;
      continue;
    }

    // Anchors
    if (pattern[i] === '^') { parts.push({ token: '^', desc: uiText('Start anchor', '字符串开头') }); i++; continue; }
    if (pattern[i] === '$') { parts.push({ token: '$', desc: uiText('End anchor', '字符串结尾') }); i++; continue; }
    if (pattern[i] === '.') { parts.push({ token: '.', desc: uiText('Any character (newline depends on s flag)', '任意字符（换行取决于 s 标志）') }); i++; continue; }
    if (pattern[i] === '|') { parts.push({ token: '|', desc: uiText('Alternation', '或（交替匹配）') }); i++; continue; }

    // Default - literal character
    const ch = pattern[i];
    const desc = uiText(`Literal character '${ch}'`, `字面字符 '${ch}'`);
    parts.push({ token: ch, desc });
    i++;
  }

  return parts;
}

function getEscapeDesc(ch) {
  if (!document.documentElement.lang.startsWith('zh')) {
    const english = {d:'Digit [0-9]', D:'Non-digit', w:'Word character [a-zA-Z0-9_]', W:'Non-word character', s:'Whitespace', S:'Non-whitespace', b:'Word boundary', B:'Non-word boundary', n:'Newline', r:'Carriage return', t:'Tab', '0':'Null character'};
    return english[ch] || `Escaped character '\\${ch}'`;
  }
  const map = {
    'd': '数字 [0-9]', 'D': '非数字',
    'w': '单词字符 [a-zA-Z0-9_]', 'W': '非单词字符',
    's': '空白字符', 'S': '非空白字符',
    'b': '单词边界', 'B': '非单词边界',
    'n': '换行符', 'r': '回车符', 't': '制表符',
    '0': '空字符',
    '.': '字面点号', '(': '字面左括号', ')': '字面右括号',
    '[': '字面左方括号', ']': '字面右方括号',
    '{': '字面左花括号', '}': '字面右花括号',
    '\\': '反斜杠本身',
    '^': '字面脱字符', '$': '字面美元符',
    '+': '字面加号', '*': '字面星号', '?': '字面问号',
    '|': '字面竖线'
  };
  return map[ch] || `转义字符 '\\${ch}'`;
}

/* ---- Error Display ---- */
function showError(msg) {
  lastReplacement = null;
  document.getElementById('replace-result').textContent = '';
  document.getElementById('match-time').textContent = '';
  const preview = document.getElementById('highlight-preview');
  preview.innerHTML = `<span class="error-text">❌ ${escapeHtml(msg)}</span>`;
  document.getElementById('match-details').textContent = uiText('Pattern could not be evaluated', '无法计算表达式');
  document.getElementById('match-count').textContent = uiText('0 matches', '0 个匹配');
  const explain = document.getElementById('pattern-explanation');
  explain.innerHTML = `<span class="error-text">❌ ${escapeHtml(msg)}</span>`;
}

/* ---- Reset ---- */
function resetResults() {
  lastReplacement = null;
  document.getElementById('highlight-preview').textContent = uiText('Enter a pattern and test text', '输入正则和测试文本，匹配将高亮显示在这里');
  document.getElementById('match-details').textContent = uiText('No matches', '暂无匹配结果');
  document.getElementById('match-count').textContent = uiText('0 matches', '0 个匹配');
  document.getElementById('match-time').textContent = '';
  const explain = document.getElementById('pattern-explanation');
  explain.textContent = uiText('Enter a pattern to analyze', '输入正则表达式后将自动分析');
  document.getElementById('replace-result').textContent = uiText('Replacement result', '替换结果将显示在这里');
}

/* ---- Sample Data ---- */
function loadSample() {
  const textarea = document.getElementById('test-string');
  textarea.value = `欢迎来到 Regex Tester!

这里有一些测试数据供你练习：

📧 Email 地址:
  alice@example.com
  bob.smith@gmail.com
  contact@company.co.uk

🔗 URL 链接:
  https://www.example.com
  https://github.com/dudu/tools
  http://localhost:3000/api/users

📱 电话号码:
  13800138000
  15912345678
  +86 10 8888 8888

📅 日期格式:
  2026-05-19
  2024/12/25
  2026-1-15

📝 其他文本:
  Hello World! hello world
  The quick brown fox jumps over the lazy dog
  abc123 ABC 123 _test_
  <title>Regex Tester Online</title>
  
你可以在上面输入 \d+ 试试匹配所有数字，或者输入 [a-zA-Z]+ 匹配所有英文单词！`;

  textarea.dispatchEvent(new Event('input'));
  // Give the browser a tick to update
  requestAnimationFrame(updateResults);
}

function clearTest() {
  document.getElementById('test-string').value = '';
  updateResults();
}

/* ---- Copy Replace Result ---- */
function copyReplaceResult() {
  if (lastReplacement === null) {
    showToast(uiText('No replacement result to copy', '没有替换结果可以复制'));
    return;
  }
  navigator.clipboard.writeText(lastReplacement).then(() => showToast(uiText('Copied', '已复制'))).catch(() => showToast(uiText('Copy failed', '复制失败')));
}

/* ---- Helpers ---- */
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function truncate(str, len) {
  return str.length > len ? str.substring(0, len) + '…' : str;
}

function formatCharCount(n) {
  if (n < 1000) return `${n} chars`;
  if (n < 1000000) return `${(n / 1000).toFixed(1)}K chars`;
  return `${(n / 1000000).toFixed(1)}M chars`;
}

function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity 0.3s'; setTimeout(() => t.remove(), 300); }, 2000);
}

/* ---- Debounced update on input ---- */
let updateTimer;
const originalUpdate = updateResults;
updateResults = function() {
  cancelTest();
  lastReplacement = null;
  clearTimeout(updateTimer);
  updateTimer = setTimeout(originalUpdate, 150);
};
