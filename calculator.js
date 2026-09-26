/**
 * Hassan Calculator
 * Fully functional premium calculator – basic + scientific + history
 */
(function () {
  'use strict';

  // ─── State ───────────────────────────────────────────────
  const state = {
    // Live input buffer (what user is typing)
    input: '0',
    // Expression string for evaluation (uses * / + - ^ etc.)
    expr: '',
    // Display expression (pretty symbols)
    displayExpr: '',
    // Last evaluated result
    lastResult: null,
    // Flags
    justEvaluated: false,
    openParens: 0,
    mode: 'basic',
    historyOpen: false,
    history: [],
  };

  // ─── DOM ─────────────────────────────────────────────────
  const el = {
    expression: document.getElementById('expression'),
    result: document.getElementById('result'),
    historyPreview: document.getElementById('historyPreview'),
    historyPanel: document.getElementById('historyPanel'),
    historyList: document.getElementById('historyList'),
    historyToggle: document.getElementById('historyToggle'),
    clearHistory: document.getElementById('clearHistoryBtn'),
    basicKeypad: document.getElementById('basicKeypad'),
    sciKeypad: document.getElementById('scientificKeypad'),
    basicBtn: document.getElementById('basicModeBtn'),
    sciBtn: document.getElementById('scientificModeBtn'),
  };

  const HISTORY_KEY = 'hassan_calc_history_v2';
  const MAX_HISTORY = 50;
  const MAX_INPUT = 18;

  // ─── Formatting ──────────────────────────────────────────
  function formatNumber(n) {
    if (n === null || n === undefined || Number.isNaN(n)) return 'Error';
    if (!Number.isFinite(n)) return 'Error';

    const abs = Math.abs(n);
    if (abs !== 0 && (abs < 1e-10 || abs >= 1e15)) {
      return n.toExponential(8)
        .replace(/\.?0+e/, 'e')
        .replace(/e\+/, 'e');
    }

    let s;
    if (Number.isInteger(n) || Math.abs(n - Math.round(n)) < 1e-11) {
      s = String(Math.round(n));
    } else {
      s = String(parseFloat(n.toPrecision(12)));
    }

    // thousand separators
    if (!/[eE]/.test(s)) {
      const [i, d] = s.split('.');
      const withSep = i.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
      s = d !== undefined ? withSep + '.' + d : withSep;
    }
    return s;
  }

  function pretty(expr) {
    return expr
      .replace(/\*/g, '×')
      .replace(/\//g, '÷')
      .replace(/-/g, '−')
      .replace(/\bpi\b/g, 'π')
      .replace(/\*\*/g, '^');
  }

  // ─── UI update ───────────────────────────────────────────
  function updateDisplay() {
    el.expression.textContent = state.displayExpr;
    el.result.textContent = state.input;
    el.result.classList.remove('error', 'small', 'smaller');

    if (state.input === 'Error') {
      el.result.classList.add('error');
    } else {
      const len = state.input.replace(/,/g, '').length;
      if (len > 12) el.result.classList.add('smaller');
      else if (len > 9) el.result.classList.add('small');
    }
  }

  function clearActiveOps() {
    document.querySelectorAll('.key-op.active-op').forEach((b) => b.classList.remove('active-op'));
  }

  // ─── Safe expression evaluator (shunting-yard) ───────────
  function evaluate(exprStr) {
    if (!exprStr || !String(exprStr).trim()) return 0;

    let s = String(exprStr)
      .replace(/×/g, '*')
      .replace(/÷/g, '/')
      .replace(/−/g, '-')
      .replace(/π/g, '(' + Math.PI + ')')
      .replace(/\be\b/g, '(' + Math.E + ')')
      .replace(/\^/g, '**')
      .replace(/%/g, '/100');

    // Tokenize
    const tokens = [];
    let i = 0;
    while (i < s.length) {
      const c = s[i];
      if (c === ' ') { i++; continue; }

      // number
      if (/[0-9.]/.test(c) || (c === '-' && (tokens.length === 0 || ['(', '+', '-', '*', '/', '**'].includes(tokens[tokens.length - 1])))) {
        let num = '';
        if (c === '-') { num = '-'; i++; }
        while (i < s.length && /[0-9.]/.test(s[i])) {
          num += s[i++];
        }
        if (num === '-' || num === '.' || num === '-.') throw new Error('bad number');
        tokens.push(parseFloat(num));
        continue;
      }

      // multi-char operators / functions
      if (s.startsWith('**', i)) {
        tokens.push('**');
        i += 2;
        continue;
      }

      // functions
      const funcs = ['sin', 'cos', 'tan', 'log', 'ln', 'sqrt', 'fact'];
      let matched = false;
      for (const f of funcs) {
        if (s.startsWith(f, i) && (s[i + f.length] === '(' || /[0-9.(]/.test(s[i + f.length] || ''))) {
          tokens.push(f);
          i += f.length;
          matched = true;
          break;
        }
      }
      if (matched) continue;

      if ('+-*/()'.includes(c)) {
        tokens.push(c);
        i++;
        continue;
      }

      // unknown char – skip
      i++;
    }

    // Shunting-yard → RPN
    const output = [];
    const stack = [];
    const prec = { '+': 1, '-': 1, '*': 2, '/': 2, '**': 3 };
    const rightAssoc = { '**': true };
    const isFunc = (t) => typeof t === 'string' && ['sin', 'cos', 'tan', 'log', 'ln', 'sqrt', 'fact'].includes(t);

    for (const t of tokens) {
      if (typeof t === 'number') {
        output.push(t);
      } else if (isFunc(t)) {
        stack.push(t);
      } else if (t === '(') {
        stack.push(t);
      } else if (t === ')') {
        while (stack.length && stack[stack.length - 1] !== '(') {
          output.push(stack.pop());
        }
        if (!stack.length) throw new Error('parens');
        stack.pop();
        if (stack.length && isFunc(stack[stack.length - 1])) {
          output.push(stack.pop());
        }
      } else {
        // operator
        while (
          stack.length &&
          stack[stack.length - 1] !== '(' &&
          (isFunc(stack[stack.length - 1]) ||
            (prec[stack[stack.length - 1]] > prec[t]) ||
            (prec[stack[stack.length - 1]] === prec[t] && !rightAssoc[t]))
        ) {
          output.push(stack.pop());
        }
        stack.push(t);
      }
    }
    while (stack.length) {
      const op = stack.pop();
      if (op === '(' || op === ')') throw new Error('parens');
      output.push(op);
    }

    // Evaluate RPN
    const st = [];
    for (const t of output) {
      if (typeof t === 'number') {
        st.push(t);
      } else if (isFunc(t)) {
        if (st.length < 1) throw new Error('arity');
        const a = st.pop();
        st.push(applyFunc(t, a));
      } else {
        if (st.length < 2) throw new Error('arity');
        const b = st.pop();
        const a = st.pop();
        st.push(applyOp(t, a, b));
      }
    }
    if (st.length !== 1) throw new Error('expr');
    const result = st[0];
    if (!Number.isFinite(result)) throw new Error('math');
    return result;
  }

  function applyOp(op, a, b) {
    switch (op) {
      case '+': return a + b;
      case '-': return a - b;
      case '*': return a * b;
      case '/':
        if (b === 0) throw new Error('div0');
        return a / b;
      case '**': return Math.pow(a, b);
      default: throw new Error('op');
    }
  }

  function applyFunc(name, x) {
    switch (name) {
      case 'sin': {
        const r = Math.sin((x * Math.PI) / 180);
        return Math.abs(r) < 1e-12 ? 0 : r;
      }
      case 'cos': {
        const r = Math.cos((x * Math.PI) / 180);
        return Math.abs(r) < 1e-12 ? 0 : r;
      }
      case 'tan': {
        const rad = (x * Math.PI) / 180;
        if (Math.abs(Math.cos(rad)) < 1e-12) throw new Error('undef');
        const r = Math.tan(rad);
        return Math.abs(r) < 1e-12 ? 0 : r;
      }
      case 'log':
        if (x <= 0) throw new Error('domain');
        return Math.log10(x);
      case 'ln':
        if (x <= 0) throw new Error('domain');
        return Math.log(x);
      case 'sqrt':
        if (x < 0) throw new Error('domain');
        return Math.sqrt(x);
      case 'fact': {
        if (x < 0 || !Number.isInteger(x) || x > 170) throw new Error('domain');
        let f = 1;
        for (let i = 2; i <= x; i++) f *= i;
        return f;
      }
      default: throw new Error('fn');
    }
  }

  // ─── Input helpers ───────────────────────────────────────
  function endsWithOperator(str) {
    return /([+\-*/^×÷−]|\*\*)$/.test(str.trim());
  }

  function appendToExpr(chunk) {
    state.expr += chunk;
    state.displayExpr = pretty(state.expr);
  }

  function resetInput() {
    state.input = '0';
    state.expr = '';
    state.displayExpr = '';
    state.justEvaluated = false;
    state.openParens = 0;
    state.lastResult = null;
    el.historyPreview.textContent = '';
    clearActiveOps();
    updateDisplay();
  }

  // ─── Button actions ──────────────────────────────────────
  function onDigit(d) {
    if (state.justEvaluated) {
      state.expr = '';
      state.displayExpr = '';
      state.input = d;
      state.justEvaluated = false;
      appendToExpr(d);
      updateDisplay();
      return;
    }

    if (state.input === '0' && d !== '.') {
      state.input = d;
    } else if (state.input === 'Error') {
      state.input = d;
      state.expr = '';
    } else {
      const raw = state.input.replace(/,/g, '').replace(/^-/, '');
      if (raw.replace('.', '').length >= MAX_INPUT) return;
      state.input += d;
    }

    // keep expr in sync: replace trailing number or append
    if (endsWithOperator(state.expr) || state.expr === '' || state.expr.endsWith('(')) {
      state.expr += d;
    } else {
      state.expr = state.expr.replace(/[\d.]+$/, '') + state.input.replace(/,/g, '');
    }
    state.displayExpr = pretty(state.expr);
    updateDisplay();
  }

  function onDecimal() {
    if (state.justEvaluated) {
      state.expr = '0.';
      state.displayExpr = '0.';
      state.input = '0.';
      state.justEvaluated = false;
      updateDisplay();
      return;
    }
    if (state.input === 'Error') {
      state.input = '0.';
      state.expr = '0.';
      state.displayExpr = '0.';
      updateDisplay();
      return;
    }
    if (state.input.includes('.')) return;

    state.input += '.';
    if (endsWithOperator(state.expr) || state.expr === '' || state.expr.endsWith('(')) {
      state.expr += state.input.replace(/,/g, '');
    } else {
      state.expr = state.expr.replace(/[\d.]+$/, state.input.replace(/,/g, ''));
    }
    state.displayExpr = pretty(state.expr);
    updateDisplay();
  }

  function onOperator(op) {
    // map display op to internal
    const map = { '×': '*', '÷': '/', '−': '-', '+': '+', '^': '**' };
    const internal = map[op] || op;

    if (state.input === 'Error') {
      resetInput();
      return;
    }

    if (state.justEvaluated) {
      // continue from result
      state.expr = state.input.replace(/,/g, '');
      state.justEvaluated = false;
    }

    // replace trailing operator
    if (endsWithOperator(state.expr)) {
      state.expr = state.expr.replace(/[+\-*/^×÷−**]+$/, '') + internal;
    } else if (state.expr === '') {
      state.expr = state.input.replace(/,/g, '') + internal;
    } else {
      // ensure current input is reflected
      const raw = state.input.replace(/,/g, '');
      if (!state.expr.endsWith(raw) && !state.expr.endsWith(')')) {
        // already synced usually
      }
      state.expr += internal;
    }

    state.displayExpr = pretty(state.expr);
    state.input = state.input; // keep showing last number until new digit
    // visual: highlight
    clearActiveOps();
    document.querySelectorAll(`.key-op[data-value="${op}"]`).forEach((b) => b.classList.add('active-op'));
    updateDisplay();
  }

  function onEquals() {
    if (state.input === 'Error') {
      resetInput();
      return;
    }

    let toEval = state.expr;

    // if ends with operator, drop it
    if (endsWithOperator(toEval)) {
      toEval = toEval.replace(/[+\-*/**]+$/, '');
    }

    // close open parentheses
    while (state.openParens > 0) {
      toEval += ')';
      state.openParens--;
    }

    if (!toEval || !toEval.trim()) return;

    try {
      const result = evaluate(toEval);
      const formatted = formatNumber(result);
      const prettyExpr = pretty(toEval);

      addHistory(prettyExpr, formatted);

      state.displayExpr = prettyExpr + ' =';
      el.historyPreview.textContent = prettyExpr + ' =';
      state.input = formatted;
      state.expr = String(result); // allow chaining
      state.lastResult = result;
      state.justEvaluated = true;
      clearActiveOps();
      updateDisplay();
    } catch (err) {
      state.input = 'Error';
      state.displayExpr = pretty(toEval);
      state.justEvaluated = true;
      state.expr = '';
      clearActiveOps();
      updateDisplay();
    }
  }

  function onClear() {
    resetInput();
  }

  function onBackspace() {
    if (state.justEvaluated || state.input === 'Error') {
      resetInput();
      return;
    }

    if (state.input.length <= 1 || (state.input.length === 2 && state.input.startsWith('-'))) {
      state.input = '0';
    } else {
      state.input = state.input.slice(0, -1);
    }

    // sync expr
    if (endsWithOperator(state.expr)) {
      // leave operator, just update would-be number
    } else {
      state.expr = state.expr.replace(/[\d.]+$/, '') + (state.input === '0' ? '' : state.input.replace(/,/g, ''));
      if (state.expr === '' && state.input === '0') {
        // ok
      }
    }
    state.displayExpr = pretty(state.expr);
    updateDisplay();
  }

  function onToggleSign() {
    if (state.input === '0' || state.input === 'Error') return;
    if (state.input.startsWith('-')) {
      state.input = state.input.slice(1);
    } else {
      state.input = '-' + state.input;
    }
    // update trailing number in expr
    if (!endsWithOperator(state.expr) && state.expr !== '') {
      state.expr = state.expr.replace(/-?[\d.]+$/, state.input.replace(/,/g, ''));
      state.displayExpr = pretty(state.expr);
    }
    updateDisplay();
  }

  function onPercent() {
    if (state.input === 'Error') return;
    const val = parseFloat(state.input.replace(/,/g, ''));
    if (Number.isNaN(val)) return;
    const result = val / 100;
    state.input = formatNumber(result);
    if (!endsWithOperator(state.expr) && state.expr !== '') {
      state.expr = state.expr.replace(/[\d.]+$/, String(result));
      state.displayExpr = pretty(state.expr);
    } else {
      state.expr = String(result);
      state.displayExpr = pretty(state.expr);
    }
    updateDisplay();
  }

  function onFunc(name) {
    if (state.input === 'Error') resetInput();

    const val = parseFloat(state.input.replace(/,/g, ''));
    if (Number.isNaN(val) && name !== 'sqrt') return;

    // Build expression like sin(45) or apply immediately for unary
    try {
      let result;
      let label;

      if (name === 'square') {
        result = val * val;
        label = `(${formatNumber(val)})²`;
      } else if (name === 'fact') {
        result = applyFunc('fact', val);
        label = `${formatNumber(val)}!`;
      } else if (name === 'sqrt') {
        result = applyFunc('sqrt', val);
        label = `√(${formatNumber(val)})`;
      } else {
        result = applyFunc(name, val);
        label = `${name}(${formatNumber(val)})`;
      }

      const formatted = formatNumber(result);
      addHistory(label, formatted);

      state.displayExpr = label + ' =';
      el.historyPreview.textContent = label + ' =';
      state.input = formatted;
      state.expr = String(result);
      state.justEvaluated = true;
      clearActiveOps();
      updateDisplay();
    } catch {
      state.input = 'Error';
      state.justEvaluated = true;
      updateDisplay();
    }
  }

  function onConst(c) {
    const val = c === 'π' ? Math.PI : Math.E;
    const internal = c === 'π' ? '(' + Math.PI + ')' : '(' + Math.E + ')';
    const displaySym = c === 'π' ? 'π' : 'e';

    if (state.justEvaluated) {
      state.expr = '';
      state.displayExpr = '';
      state.justEvaluated = false;
    }

    state.input = formatNumber(val);

    if (endsWithOperator(state.expr) || state.expr === '' || state.expr.endsWith('(')) {
      state.expr += internal;
      state.displayExpr = (state.displayExpr || '') + displaySym;
    } else {
      // replace current number with constant
      state.expr = internal;
      state.displayExpr = displaySym;
    }
    // keep displayExpr pretty
    state.displayExpr = pretty(state.displayExpr);
    updateDisplay();
  }

  function onParen(p) {
    if (state.justEvaluated) {
      state.expr = '';
      state.displayExpr = '';
      state.justEvaluated = false;
    }

    if (p === '(') {
      if (!endsWithOperator(state.expr) && state.expr !== '' && !state.expr.endsWith('(')) {
        // implicit multiply
        state.expr += '*';
      }
      state.expr += '(';
      state.openParens++;
    } else {
      if (state.openParens > 0) {
        state.expr += ')';
        state.openParens--;
      }
    }
    state.displayExpr = pretty(state.expr);
    updateDisplay();
  }

  // ─── History ─────────────────────────────────────────────
  function loadHistory() {
    try {
      const raw = localStorage.getItem(HISTORY_KEY);
      state.history = raw ? JSON.parse(raw) : [];
    } catch {
      state.history = [];
    }
    renderHistory();
  }

  function saveHistory() {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(state.history.slice(0, MAX_HISTORY)));
    } catch { /* quota */ }
  }

  function addHistory(expression, result) {
    state.history.unshift({ expression, result, ts: Date.now() });
    if (state.history.length > MAX_HISTORY) state.history.length = MAX_HISTORY;
    saveHistory();
    renderHistory();
  }

  function clearHistory() {
    state.history = [];
    saveHistory();
    renderHistory();
  }

  function renderHistory() {
    if (!state.history.length) {
      el.historyList.innerHTML = '<p class="history-empty">No calculations yet</p>';
      return;
    }
    el.historyList.innerHTML = state.history
      .map(
        (item, i) =>
          `<div class="history-item" data-i="${i}" role="button" tabindex="0">
            <span class="hist-expr">${esc(item.expression)}</span>
            <span class="hist-result">${esc(item.result)}</span>
          </div>`
      )
      .join('');

    el.historyList.querySelectorAll('.history-item').forEach((node) => {
      node.addEventListener('click', () => {
        const item = state.history[+node.dataset.i];
        if (!item) return;
        state.input = item.result;
        state.displayExpr = item.expression + ' =';
        state.expr = item.result.replace(/,/g, '');
        state.justEvaluated = true;
        clearActiveOps();
        updateDisplay();
      });
    });
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ─── Mode ────────────────────────────────────────────────
  function setMode(m) {
    state.mode = m;
    const basic = m === 'basic';
    el.basicKeypad.classList.toggle('hidden', !basic);
    el.sciKeypad.classList.toggle('hidden', basic);
    el.basicBtn.classList.toggle('active', basic);
    el.sciBtn.classList.toggle('active', !basic);
  }

  // ─── Event wiring ────────────────────────────────────────
  function handleAction(action, value) {
    switch (action) {
      case 'number': onDigit(value); break;
      case 'decimal': onDecimal(); break;
      case 'operator': onOperator(value); break;
      case 'equals': onEquals(); break;
      case 'clear': onClear(); break;
      case 'backspace': onBackspace(); break;
      case 'toggle-sign': onToggleSign(); break;
      case 'percent': onPercent(); break;
      case 'func': onFunc(value); break;
      case 'const': onConst(value); break;
      case 'paren': onParen(value); break;
    }
  }

  document.querySelectorAll('.key').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      handleAction(btn.dataset.action, btn.dataset.value);
    });
  });

  el.basicBtn.addEventListener('click', () => setMode('basic'));
  el.sciBtn.addEventListener('click', () => setMode('scientific'));

  el.historyToggle.addEventListener('click', () => {
    state.historyOpen = !state.historyOpen;
    el.historyPanel.classList.toggle('open', state.historyOpen);
    el.historyToggle.classList.toggle('active', state.historyOpen);
  });

  el.clearHistory.addEventListener('click', clearHistory);

  // Keyboard
  document.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea')) return;
    const k = e.key;

    if (/^[0-9]$/.test(k)) {
      e.preventDefault();
      onDigit(k);
      return;
    }

    const actions = {
      '.': () => onDecimal(),
      ',': () => onDecimal(),
      '+': () => onOperator('+'),
      '-': () => onOperator('−'),
      '*': () => onOperator('×'),
      x: () => onOperator('×'),
      X: () => onOperator('×'),
      '/': () => onOperator('÷'),
      Enter: () => onEquals(),
      '=': () => onEquals(),
      Backspace: () => onBackspace(),
      Escape: () => onClear(),
      Delete: () => onClear(),
      '%': () => onPercent(),
      '^': () => onOperator('^'),
      '(': () => onParen('('),
      ')': () => onParen(')'),
    };

    if (actions[k]) {
      e.preventDefault();
      actions[k]();
    }
  });

  // ─── Init ────────────────────────────────────────────────
  loadHistory();
  updateDisplay();
})();
