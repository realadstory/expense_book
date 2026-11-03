(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  const won = (n) => `${Number(n).toLocaleString('ko-KR')}원`;

  function localDate(d = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  const state = {
    editingId: null,
    filter: {}, // { from, to }
  };

  /* ---------- API ---------- */

  async function api(path, options = {}) {
    const res = await fetch(path, {
      credentials: 'same-origin',
      headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
      ...options,
      body: options.body ? JSON.stringify(options.body) : undefined,
    });
    if (res.status === 401 && path !== '/api/login') {
      showLogin();
      throw new Error('로그인이 필요합니다.');
    }
    if (res.status === 204) return null;
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || '요청에 실패했습니다.');
    return data;
  }

  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toast.timer);
    toast.timer = setTimeout(() => el.classList.add('hidden'), 2200);
  }

  /* ---------- 화면 전환 ---------- */

  function showLogin() {
    $('app-view').classList.add('hidden');
    $('login-view').classList.remove('hidden');
    $('password').value = '';
    $('password').focus();
  }

  async function showApp() {
    $('login-view').classList.add('hidden');
    $('app-view').classList.remove('hidden');
    await loadCategories();
    resetForm();
    await refreshAll();
  }

  /* ---------- 로그인 ---------- */

  $('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.submitter;
    btn.disabled = true;
    $('login-error').textContent = '';
    try {
      await api('/api/login', { method: 'POST', body: { password: $('password').value } });
      await showApp();
    } catch (err) {
      $('login-error').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  $('logout-btn').addEventListener('click', async () => {
    await api('/api/logout', { method: 'POST' }).catch(() => {});
    showLogin();
  });

  /* ---------- 카테고리 ---------- */

  async function loadCategories() {
    const categories = await api('/api/categories');
    const select = $('f-category');
    select.replaceChildren(
      ...categories.map((c) => new Option(c, c))
    );
  }

  /* ---------- 입력/수정 폼 ---------- */

  function resetForm() {
    state.editingId = null;
    $('expense-form').reset();
    $('f-date').value = localDate();
    $('form-title').textContent = '지출 추가';
    $('submit-btn').textContent = '추가';
    $('cancel-edit').classList.add('hidden');
    $('form-error').textContent = '';
    document.querySelectorAll('tr.editing').forEach((tr) => tr.classList.remove('editing'));
  }

  function startEdit(exp) {
    state.editingId = exp.id;
    $('f-date').value = exp.date;
    $('f-item').value = exp.item;
    $('f-category').value = exp.category;
    $('f-amount').value = exp.amount;
    $('form-title').textContent = '지출 수정';
    $('submit-btn').textContent = '저장';
    $('cancel-edit').classList.remove('hidden');
    $('form-error').textContent = '';
    document.querySelectorAll('tr.editing').forEach((tr) => tr.classList.remove('editing'));
    const row = document.querySelector(`tr[data-id="${exp.id}"]`);
    if (row) row.classList.add('editing');
    $('expense-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
    $('f-item').focus();
  }

  $('cancel-edit').addEventListener('click', resetForm);

  $('expense-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = $('submit-btn');
    btn.disabled = true;
    $('form-error').textContent = '';
    const body = {
      date: $('f-date').value,
      item: $('f-item').value.trim(),
      category: $('f-category').value,
      amount: Number($('f-amount').value),
    };
    try {
      if (state.editingId) {
        await api(`/api/expenses/${state.editingId}`, { method: 'PUT', body });
        toast('수정되었습니다.');
      } else {
        await api('/api/expenses', { method: 'POST', body });
        toast('추가되었습니다.');
      }
      const keepDate = body.date;
      resetForm();
      $('f-date').value = keepDate; // 연속 입력 편의
      await refreshAll();
    } catch (err) {
      $('form-error').textContent = err.message;
    } finally {
      btn.disabled = false;
    }
  });

  /* ---------- 목록 + 검색 ---------- */

  async function loadExpenses() {
    const params = new URLSearchParams();
    const { from, to } = state.filter;
    if (from && (!to || from === to)) {
      params.set('date', from);
    } else {
      if (from) params.set('from', from);
      if (to) params.set('to', to);
    }
    const qs = params.toString();
    const rows = await api(`/api/expenses${qs ? `?${qs}` : ''}`);
    renderExpenses(rows);
  }

  function renderExpenses(rows) {
    const tbody = $('expense-rows');
    tbody.replaceChildren();

    for (const exp of rows) {
      const tr = document.createElement('tr');
      tr.dataset.id = exp.id;
      if (exp.id === state.editingId) tr.classList.add('editing');

      const tdDate = document.createElement('td');
      tdDate.textContent = exp.date;

      const tdItem = document.createElement('td');
      tdItem.textContent = exp.item;

      const tdCat = document.createElement('td');
      const tag = document.createElement('span');
      tag.className = 'tag';
      tag.textContent = exp.category;
      tdCat.append(tag);

      const tdAmount = document.createElement('td');
      tdAmount.className = 'num';
      tdAmount.textContent = won(exp.amount);

      const tdActions = document.createElement('td');
      tdActions.className = 'actions';
      const editBtn = document.createElement('button');
      editBtn.className = 'btn ghost sm';
      editBtn.textContent = '수정';
      editBtn.addEventListener('click', () => startEdit(exp));
      const delBtn = document.createElement('button');
      delBtn.className = 'btn ghost sm danger';
      delBtn.textContent = '삭제';
      delBtn.addEventListener('click', () => removeExpense(exp));
      tdActions.append(editBtn, ' ', delBtn);

      tr.append(tdDate, tdItem, tdCat, tdAmount, tdActions);
      tbody.append(tr);
    }

    $('list-empty').classList.toggle('hidden', rows.length > 0);

    const total = rows.reduce((s, r) => s + r.amount, 0);
    const { from, to } = state.filter;
    let label = '전체 기간';
    if (from && (!to || from === to)) label = from;
    else if (from || to) label = `${from || '처음'} ~ ${to || '현재'}`;
    $('list-summary').textContent = `${label} · ${rows.length}건 · 합계 ${won(total)}`;
  }

  async function removeExpense(exp) {
    if (!confirm(`'${exp.item}' (${won(exp.amount)}) 내역을 삭제할까요?`)) return;
    try {
      await api(`/api/expenses/${exp.id}`, { method: 'DELETE' });
      if (state.editingId === exp.id) resetForm();
      toast('삭제되었습니다.');
      await refreshAll();
    } catch (err) {
      toast(err.message);
    }
  }

  $('search-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const from = $('s-from').value;
    const to = $('s-to').value;
    if (from && to && from > to) {
      toast('시작일이 종료일보다 늦습니다.');
      return;
    }
    state.filter = { from, to };
    loadExpenses().catch((err) => toast(err.message));
  });

  $('s-today').addEventListener('click', () => {
    const today = localDate();
    $('s-from').value = today;
    $('s-to').value = today;
    state.filter = { from: today, to: today };
    loadExpenses().catch((err) => toast(err.message));
  });

  $('s-reset').addEventListener('click', () => {
    $('s-from').value = '';
    $('s-to').value = '';
    state.filter = {};
    loadExpenses().catch((err) => toast(err.message));
  });

  /* ---------- 월별 합계 ---------- */

  function initYearSelect() {
    const select = $('year-select');
    const thisYear = new Date().getFullYear();
    for (let y = thisYear + 1; y >= thisYear - 5; y--) {
      select.append(new Option(`${y}년`, String(y), false, y === thisYear));
    }
    select.addEventListener('change', () => loadMonthly().catch((err) => toast(err.message)));
  }

  async function loadMonthly() {
    const year = $('year-select').value;
    const data = await api(`/api/summary/monthly?year=${year}`);
    $('year-total').textContent = `${data.year}년 총 ${won(data.total)}`;

    const tbody = $('monthly-rows');
    tbody.replaceChildren();
    for (const m of data.months) {
      const tr = document.createElement('tr');
      if (m.total === 0) tr.classList.add('zero');
      const tdMonth = document.createElement('td');
      tdMonth.textContent = `${Number(m.month.slice(5))}월`;
      const tdCount = document.createElement('td');
      tdCount.className = 'num';
      tdCount.textContent = `${m.count}건`;
      const tdTotal = document.createElement('td');
      tdTotal.className = 'num';
      tdTotal.textContent = won(m.total);
      tr.append(tdMonth, tdCount, tdTotal);
      tbody.append(tr);
    }
  }

  /* ---------- 카테고리별 합계 + 막대그래프 ---------- */

  async function loadCategorySummary() {
    const month = $('cat-month').value;
    const data = await api(`/api/summary/category${month ? `?month=${month}` : ''}`);
    $('cat-total').textContent = `${month ? `${Number(month.slice(5))}월` : '전체'} 총 ${won(data.total)}`;

    const chart = $('cat-chart');
    chart.replaceChildren();
    const max = Math.max(...data.categories.map((c) => c.total), 1);

    for (const c of data.categories) {
      const row = document.createElement('div');
      row.className = 'bar-row';

      const label = document.createElement('span');
      label.className = 'bar-label';
      label.textContent = c.category;
      label.title = `${c.category} · ${c.count}건`;

      const track = document.createElement('div');
      track.className = 'bar-track';
      const fill = document.createElement('div');
      fill.className = 'bar-fill';
      fill.style.width = '0%';
      const value = document.createElement('span');
      value.className = 'bar-value';
      const pct = data.total ? Math.round((c.total / data.total) * 100) : 0;
      value.textContent = `${won(c.total)} (${pct}%)`;
      track.append(fill, value);

      row.append(label, track);
      chart.append(row);
      requestAnimationFrame(() => { fill.style.width = `${(c.total / max) * 100}%`; });
    }

    $('cat-empty').classList.toggle('hidden', data.categories.length > 0);
  }

  $('cat-month').addEventListener('change', () => loadCategorySummary().catch((err) => toast(err.message)));

  /* ---------- 초기화 ---------- */

  async function refreshAll() {
    try {
      await Promise.all([loadExpenses(), loadMonthly(), loadCategorySummary()]);
    } catch (err) {
      toast(err.message);
    }
  }

  async function init() {
    initYearSelect();
    $('cat-month').value = localDate().slice(0, 7);
    try {
      const { authenticated } = await api('/api/session');
      if (authenticated) await showApp();
      else showLogin();
    } catch {
      showLogin();
    }
  }

  init();
})();
