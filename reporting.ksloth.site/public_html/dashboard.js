const content = document.getElementById('content');
const sidebar = document.getElementById('sidebar');

// ── Auth ──────────────────────────────────────────────────────────
// Cookie-session based (not JWT/localStorage, despite what some
// reference examples show) — matches the login flow already built.
// GET /api/me returns the current user or 401.

async function checkAuth() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (res.status === 401) {
      window.location.href = '/login.html';
      return null;
    }
    const { data } = await res.json();
    return data; // { id, email, displayName, role }
  } catch (err) {
    window.location.href = '/login.html';
    return null;
  }
}

document.getElementById('logout-btn').addEventListener('click', async () => {
  await fetch('/api/logout', { method: 'POST', credentials: 'include' });
  window.location.href = '/logged-out.html';
});

// ── Date range ────────────────────────────────────────────────────

function getDateRange() {
  const end = document.getElementById('date-end')?.value
    || new Date().toISOString().slice(0, 10);
  const start = document.getElementById('date-start')?.value
    || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  return { start, end };
}

function setDefaultDates() {
  const { start, end } = getDateRange();
  document.getElementById('date-start').value = start;
  document.getElementById('date-end').value = end;
}

document.addEventListener('change', (e) => {
  if (e.target.id === 'date-start' || e.target.id === 'date-end') {
    route();
  }
});

// ── API helper ────────────────────────────────────────────────────

async function apiFetch(path) {
  const { start, end } = getDateRange();
  const url = `${path}${path.includes('?') ? '&' : '?'}start=${start}&end=${end}`;
  const res = await fetch(url, { credentials: 'include' });

  if (res.status === 401) {
    window.location.href = '/login.html';
    return null;
  }
  if (!res.ok) {
    throw new Error(`API error: ${res.status}`);
  }
  return res.json();
}

// ── Loading / error states ───────────────────────────────────────

function showLoading() {
  content.innerHTML = '<div class="loading">Loading…</div>';
}

function showError(message) {
  content.innerHTML = '';
  const div = document.createElement('div');
  div.className = 'error-message';
  div.textContent = `Something went wrong: ${message}`;
  const retry = document.createElement('button');
  retry.textContent = 'Retry';
  retry.addEventListener('click', route);
  div.appendChild(document.createElement('br'));
  div.appendChild(retry);
  content.appendChild(div);
}

// ── Cards ─────────────────────────────────────────────────────────

function renderCards(container, data) {
  const cardsDiv = document.createElement('div');
  cardsDiv.className = 'summary-cards';

  const metrics = [
    { label: 'Total Pageviews', value: (data.total_pageviews || 0).toLocaleString() },
    { label: 'Total Sessions',  value: (data.total_sessions || 0).toLocaleString() },
    { label: 'Avg Load Time',   value: (data.avg_load_time_ms || 0) + ' ms' },
    { label: 'Total Errors',    value: (data.total_errors || 0).toLocaleString() },
  ];

  metrics.forEach((m) => {
    const card = document.createElement('div');
    card.className = 'metric-card';

    const label = document.createElement('div');
    label.className = 'metric-label';
    label.textContent = m.label;

    const value = document.createElement('div');
    value.className = 'metric-value';
    value.textContent = m.value;

    card.appendChild(label);
    card.appendChild(value);
    cardsDiv.appendChild(card);
  });

  container.appendChild(cardsDiv);
}

// ── Line chart (vanilla canvas) ──────────────────────────────────
// byDay: [{ day: '2026-08-01', count: 42 }, ...]  (from /api/pageviews)

function renderLineChart(container, byDay) {
  const wrapper = document.createElement('div');
  wrapper.className = 'chart-container';
  const heading = document.createElement('h3');
  heading.textContent = 'Pageviews Over Time';
  wrapper.appendChild(heading);

  const canvas = document.createElement('canvas');
  wrapper.appendChild(canvas);
  container.appendChild(wrapper);

  // Size the canvas to match its rendered CSS size so pixels aren't stretched.
  const cssWidth = canvas.clientWidth || 600;
  const cssHeight = 260;
  canvas.width = cssWidth;
  canvas.height = cssHeight;

  const ctx = canvas.getContext('2d');
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const plotW = cssWidth - padding.left - padding.right;
  const plotH = cssHeight - padding.top - padding.bottom;

  if (!byDay || byDay.length === 0) {
    ctx.fillStyle = '#888';
    ctx.fillText('No data for this range', padding.left, cssHeight / 2);
    return;
  }

  const values = byDay.map((d) => Number(d.count));
  const maxVal = Math.max(...values, 1);

  // Axes
  ctx.strokeStyle = '#ccc';
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, cssHeight - padding.bottom);
  ctx.lineTo(cssWidth - padding.right, cssHeight - padding.bottom);
  ctx.stroke();

  // Line path
  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 2;
  ctx.beginPath();
  byDay.forEach((point, i) => {
    const x = padding.left + (byDay.length === 1 ? 0 : (i / (byDay.length - 1)) * plotW);
    const y = cssHeight - padding.bottom - (Number(point.count) / maxVal) * plotH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Y-axis labels: max and zero
  ctx.fillStyle = '#666';
  ctx.font = '11px sans-serif';
  ctx.fillText(String(maxVal), 4, padding.top + 4);
  ctx.fillText('0', 4, cssHeight - padding.bottom);

  // X-axis labels: first, middle, last date
  const labelIdx = [0, Math.floor((byDay.length - 1) / 2), byDay.length - 1];
  [...new Set(labelIdx)].forEach((i) => {
    const x = padding.left + (byDay.length === 1 ? 0 : (i / (byDay.length - 1)) * plotW);
    ctx.fillText(byDay[i].day, Math.max(padding.left, x - 25), cssHeight - 8);
  });
}

// ── Grouped bar chart (vanilla canvas) ───────────────────────────
// categories: ['/checkout', '/products/42', ...]
// series: [{ name: 'Avg Load Time', values: [...] }, { name: 'Avg TTFB', values: [...] }]

function renderBarChart(container, title, categories, series, unit) {
  const wrapper = document.createElement('div');
  wrapper.className = 'chart-container';
  const heading = document.createElement('h3');
  heading.textContent = title;
  wrapper.appendChild(heading);

  const canvas = document.createElement('canvas');
  wrapper.appendChild(canvas);

  // Legend
  const legend = document.createElement('div');
  legend.className = 'chart-legend';
  const colors = ['#2c3e50', '#e67e22'];
  series.forEach((s, i) => {
    const item = document.createElement('span');
    item.className = 'legend-item';
    item.innerHTML = ''; // build with DOM, not innerHTML, even for our own static markup
    const swatch = document.createElement('span');
    swatch.className = 'legend-swatch';
    swatch.style.background = colors[i % colors.length];
    item.appendChild(swatch);
    item.appendChild(document.createTextNode(s.name));
    legend.appendChild(item);
  });
  wrapper.appendChild(legend);
  container.appendChild(wrapper);

  if (!categories || categories.length === 0) {
    const empty = document.createElement('p');
    empty.textContent = 'No data for this range';
    wrapper.appendChild(empty);
    return;
  }

  const cssWidth = canvas.clientWidth || 600;
  const cssHeight = 280;
  canvas.width = cssWidth;
  canvas.height = cssHeight;

  const ctx = canvas.getContext('2d');
  const padding = { top: 20, right: 20, bottom: 60, left: 60 };
  const plotW = cssWidth - padding.left - padding.right;
  const plotH = cssHeight - padding.top - padding.bottom;

  const allValues = series.flatMap((s) => s.values.map((v) => Number(v) || 0));
  const maxVal = Math.max(...allValues, 1);

  // Axes
  ctx.strokeStyle = '#ccc';
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, cssHeight - padding.bottom);
  ctx.lineTo(cssWidth - padding.right, cssHeight - padding.bottom);
  ctx.stroke();

  // Bars: each category gets a group, each series gets a bar within the group
  const groupWidth = plotW / categories.length;
  const barPadding = groupWidth * 0.15;
  const barsInGroup = series.length;
  const barWidth = (groupWidth - barPadding * 2) / barsInGroup;

  categories.forEach((cat, i) => {
    const groupX = padding.left + i * groupWidth;

    series.forEach((s, si) => {
      const val = Number(s.values[i]) || 0;
      const barH = (val / maxVal) * plotH;
      const x = groupX + barPadding + si * barWidth;
      const y = cssHeight - padding.bottom - barH;

      ctx.fillStyle = colors[si % colors.length];
      ctx.fillRect(x, y, barWidth - 2, barH);
    });

    // X-axis label — truncate long URLs so they don't overlap
    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.save();
    const labelX = groupX + groupWidth / 2;
    const labelY = cssHeight - padding.bottom + 14;
    ctx.translate(labelX, labelY);
    ctx.rotate(-Math.PI / 6);
    const label = cat.length > 20 ? cat.slice(0, 18) + '…' : cat;
    ctx.textAlign = 'right';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  });

  // Y-axis labels: max and zero
  ctx.fillStyle = '#666';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${maxVal}${unit || ''}`, padding.left - 6, padding.top + 4);
  ctx.fillText('0', padding.left - 6, cssHeight - padding.bottom);
  ctx.textAlign = 'left';
}



function renderTable(container, pages) {
  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrapper';
  const heading = document.createElement('h3');
  heading.textContent = 'Top Pages';
  wrapper.appendChild(heading);

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['URL', 'Views'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  (pages || []).forEach((p) => {
    const tr = document.createElement('tr');

    const tdUrl = document.createElement('td');
    tdUrl.textContent = p.url; // textContent — never innerHTML with API data

    const tdViews = document.createElement('td');
    tdViews.textContent = Number(p.views).toLocaleString();

    tr.appendChild(tdUrl);
    tr.appendChild(tdViews);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrapper.appendChild(table);
  container.appendChild(wrapper);
}

// ── Error frequency grid ──────────────────────────────────────────

function renderErrorTable(container, frequency) {
  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrapper';
  const heading = document.createElement('h3');
  heading.textContent = 'Most Frequent Errors';
  wrapper.appendChild(heading);

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Error Message', 'Occurrences', 'Last Seen'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  (frequency || []).forEach((e) => {
    const tr = document.createElement('tr');

    const tdMsg = document.createElement('td');
    tdMsg.textContent = e.error_message || '(no message)';

    const tdCount = document.createElement('td');
    tdCount.textContent = Number(e.occurrences).toLocaleString();

    const tdSeen = document.createElement('td');
    tdSeen.textContent = e.last_seen ? new Date(e.last_seen).toLocaleString() : '—';

    tr.appendChild(tdMsg);
    tr.appendChild(tdCount);
    tr.appendChild(tdSeen);
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrapper.appendChild(table);
  container.appendChild(wrapper);
}

// ── Views ─────────────────────────────────────────────────────────

async function overviewView() {
  showLoading();
  try {
    const [overview, pageviews] = await Promise.all([
      apiFetch('/api/overview'),
      apiFetch('/api/pageviews'),
    ]);
    if (!overview || !pageviews) return; // already redirected on 401

    content.innerHTML = '';
    renderCards(content, overview);
    renderLineChart(content, pageviews.byDay);
    renderTable(content, pageviews.topPages);
  } catch (err) {
    showError(err.message);
  }
}

async function performanceView() {
  showLoading();
  try {
    const perf = await apiFetch('/api/performance');
    if (!perf) return;

    content.innerHTML = '';

    if (!perf.pages || perf.pages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'loading';
      empty.textContent = 'No performance data for this range.';
      content.appendChild(empty);
      return;
    }

    const categories = perf.pages.map((p) => p.url);
    const series = [
      { name: 'Avg Load Time (ms)', values: perf.pages.map((p) => p.avg_load_time) },
      { name: 'Avg TTFB (ms)',      values: perf.pages.map((p) => p.avg_ttfb) },
    ];
    renderBarChart(content, 'Load Time vs. TTFB by Page (slowest first)', categories, series, 'ms');

    // Sample counts as a confidence note — an average from 2 samples
    // means something very different than one from 500.
    const note = document.createElement('p');
    note.className = 'chart-note';
    const min = Math.min(...perf.pages.map((p) => p.samples));
    const max = Math.max(...perf.pages.map((p) => p.samples));
    note.textContent = `Based on ${min === max ? min : `${min}–${max}`} sample(s) per page in this range.`;
    content.appendChild(note);
  } catch (err) {
    showError(err.message);
  }
}

async function errorsView() {
  showLoading();
  try {
    const errors = await apiFetch('/api/errors');
    if (!errors) return;

    content.innerHTML = '';
    renderLineChart(content, errors.trend);
    renderErrorTable(content, errors.frequency);
  } catch (err) {
    showError(err.message);
  }
}

function placeholderView(name) {
  content.innerHTML = '';
  const p = document.createElement('div');
  p.className = 'loading';
  p.textContent = `${name} — coming in the next module.`;
  content.appendChild(p);
}

// ── Router ────────────────────────────────────────────────────────

let currentUser = null;

function updateActiveNav() {
  const hash = window.location.hash || '#/overview';
  document.querySelectorAll('.dashboard-sidebar a').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('href') === hash.split('?')[0]);
  });
}

function route() {
  updateActiveNav();
  const hash = (window.location.hash || '#/overview').split('?')[0];

  switch (hash) {
    case '#/overview':
      overviewView();
      break;
    case '#/performance':
      performanceView();
      break;
    case '#/errors':
      errorsView();
      break;
    case '#/admin':
      // Role check — UX only. The API enforces this for real.
      if (currentUser && currentUser.role !== 'owner' && currentUser.role !== 'admin') {
        window.location.hash = '#/overview';
        return;
      }
      placeholderView('Admin Panel');
      break;
    default:
      window.location.hash = '#/overview';
  }
}

// ── Init ──────────────────────────────────────────────────────────

async function init() {
  currentUser = await checkAuth();
  if (!currentUser) return; // checkAuth already redirected

  document.getElementById('user-name').textContent = currentUser.displayName || currentUser.email;

  if (currentUser.role !== 'owner' && currentUser.role !== 'admin') {
    document.getElementById('admin-link').style.display = 'none';
  }

  setDefaultDates();

  document.getElementById('hamburger').addEventListener('click', () => {
    sidebar.classList.toggle('open');
  });

  window.addEventListener('hashchange', route);
  route();
}

init();