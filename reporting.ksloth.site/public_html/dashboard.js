const content = document.getElementById('content');
const sidebar = document.getElementById('sidebar');

// ── Auth ──────────────────────────────────────────────────────────
// Cookie-session based. GET /api/me returns the current user or 401.

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

// ── Section heading ─────────────────────────────────────────────

function renderSectionHeading(container, text) {
  const h2 = document.createElement('h2');
  h2.className = 'section-heading';
  h2.textContent = text;
  container.appendChild(h2);
}

// ── Stat card (single value, e.g. "Total Errors: 142") ───────────

function renderStatCard(container, label, value) {
  const wrapper = document.createElement('div');
  wrapper.className = 'summary-cards';

  const card = document.createElement('div');
  card.className = 'metric-card';
  const l = document.createElement('div');
  l.className = 'metric-label';
  l.textContent = label;
  const v = document.createElement('div');
  v.className = 'metric-value';
  v.textContent = value;
  card.append(l, v);

  wrapper.appendChild(card);
  container.appendChild(wrapper);
}

// ── Line chart (vanilla canvas) ──────────────────────────────────
// series: [{ day: '2026-08-01', count: 42 }, ...]

function renderLineChart(container, title, series) {
  const wrapper = document.createElement('div');
  wrapper.className = 'chart-container';
  const heading = document.createElement('h3');
  heading.textContent = title;
  wrapper.appendChild(heading);

  const canvas = document.createElement('canvas');
  wrapper.appendChild(canvas);
  container.appendChild(wrapper);

  const cssWidth = canvas.clientWidth || 600;
  const cssHeight = 260;
  canvas.width = cssWidth;
  canvas.height = cssHeight;

  const ctx = canvas.getContext('2d');
  const padding = { top: 20, right: 20, bottom: 30, left: 50 };
  const plotW = cssWidth - padding.left - padding.right;
  const plotH = cssHeight - padding.top - padding.bottom;

  if (!series || series.length === 0) {
    ctx.fillStyle = '#888';
    ctx.fillText('No data for this range', padding.left, cssHeight / 2);
    return;
  }

  const values = series.map((d) => Number(d.count));
  const maxVal = Math.max(...values, 1);

  ctx.strokeStyle = '#ccc';
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, cssHeight - padding.bottom);
  ctx.lineTo(cssWidth - padding.right, cssHeight - padding.bottom);
  ctx.stroke();

  ctx.strokeStyle = '#2c3e50';
  ctx.lineWidth = 2;
  ctx.beginPath();
  series.forEach((point, i) => {
    const x = padding.left + (series.length === 1 ? 0 : (i / (series.length - 1)) * plotW);
    const y = cssHeight - padding.bottom - (Number(point.count) / maxVal) * plotH;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.stroke();

  ctx.fillStyle = '#666';
  ctx.font = '11px sans-serif';
  ctx.fillText(String(maxVal), 4, padding.top + 4);
  ctx.fillText('0', 4, cssHeight - padding.bottom);

  const labelIdx = [0, Math.floor((series.length - 1) / 2), series.length - 1];
  [...new Set(labelIdx)].forEach((i) => {
    const x = padding.left + (series.length === 1 ? 0 : (i / (series.length - 1)) * plotW);
    ctx.fillText(series[i].day, Math.max(padding.left, x - 25), cssHeight - 8);
  });
}

// ── Grouped bar chart (vanilla canvas) ───────────────────────────
// categories: ['/checkout', '/products/42', ...]
// series: [{ name: 'Avg Load Time', values: [...] }, ...] (1+ series)

function renderBarChart(container, title, categories, series, unit) {
  const wrapper = document.createElement('div');
  wrapper.className = 'chart-container';
  const heading = document.createElement('h3');
  heading.textContent = title;
  wrapper.appendChild(heading);

  const canvas = document.createElement('canvas');
  wrapper.appendChild(canvas);

  const colors = ['#2c3e50', '#e67e22', '#27ae60', '#8e44ad'];
  if (series.length > 1) {
    const legend = document.createElement('div');
    legend.className = 'chart-legend';
    series.forEach((s, i) => {
      const item = document.createElement('span');
      item.className = 'legend-item';
      const swatch = document.createElement('span');
      swatch.className = 'legend-swatch';
      swatch.style.background = colors[i % colors.length];
      item.appendChild(swatch);
      item.appendChild(document.createTextNode(s.name));
      legend.appendChild(item);
    });
    wrapper.appendChild(legend);
  }
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

  ctx.strokeStyle = '#ccc';
  ctx.beginPath();
  ctx.moveTo(padding.left, padding.top);
  ctx.lineTo(padding.left, cssHeight - padding.bottom);
  ctx.lineTo(cssWidth - padding.right, cssHeight - padding.bottom);
  ctx.stroke();

  const groupWidth = plotW / categories.length;
  const barPadding = groupWidth * 0.15;
  const barWidth = (groupWidth - barPadding * 2) / series.length;

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

    ctx.fillStyle = '#666';
    ctx.font = '10px sans-serif';
    ctx.save();
    const labelX = groupX + groupWidth / 2;
    const labelY = cssHeight - padding.bottom + 14;
    ctx.translate(labelX, labelY);
    ctx.rotate(-Math.PI / 6);
    const label = String(cat).length > 20 ? String(cat).slice(0, 18) + '…' : String(cat);
    ctx.textAlign = 'right';
    ctx.fillText(label, 0, 0);
    ctx.restore();
  });

  ctx.fillStyle = '#666';
  ctx.font = '11px sans-serif';
  ctx.textAlign = 'right';
  ctx.fillText(`${maxVal}${unit || ''}`, padding.left - 6, padding.top + 4);
  ctx.fillText('0', padding.left - 6, cssHeight - padding.bottom);
  ctx.textAlign = 'left';
}

// ── Generic grid/table ────────────────────────────────────────────
// columns: [{ label: 'URL', key: 'url', format: v => v }]
// rows: array of objects

function renderGenericTable(container, title, columns, rows) {
  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrapper';
  const heading = document.createElement('h3');
  heading.textContent = title;
  wrapper.appendChild(heading);

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  columns.forEach((col) => {
    const th = document.createElement('th');
    th.textContent = col.label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  (rows || []).forEach((row) => {
    const tr = document.createElement('tr');
    columns.forEach((col) => {
      const td = document.createElement('td');
      const raw = row[col.key];
      td.textContent = col.format ? col.format(raw, row) : raw; // textContent — never innerHTML with API data
      tr.appendChild(td);
    });
    tbody.appendChild(tr);
  });
  table.appendChild(tbody);
  wrapper.appendChild(table);
  container.appendChild(wrapper);
}

// ── Analysis ──

function renderAnalysisSection(container, title, htmlContent) {
  const wrapper = document.createElement('div');
  wrapper.className = 'analysis-section';
  const heading = document.createElement('h3');
  heading.textContent = title;
  wrapper.appendChild(heading);
  const body = document.createElement('div');
  body.innerHTML = htmlContent; // safe: hardcoded string below, not API data
  wrapper.appendChild(body);
  container.appendChild(wrapper);
}

// ── Dashboard view ───

async function dashboardView() {
  showLoading();
  try {
    const [activity, errors, performance] = await Promise.all([
      apiFetch('/api/activity'),
      apiFetch('/api/errors'),
      apiFetch('/api/performance'),
    ]);
    if (!activity || !errors || !performance) return; // already redirected on 401

    content.innerHTML = '';

    // ── Activity ──
    renderSectionHeading(content, 'Activity');
    renderBarChart(
      content, 'Views per Page',
      activity.topPages.map((p) => p.url),
      [{ name: 'Views', values: activity.topPages.map((p) => p.views) }]
    );
    renderBarChart(
      content, 'Referrer Breakdown',
      activity.referrers.map((r) => r.referrer),
      [{ name: 'Sessions', values: activity.referrers.map((r) => r.sessions) }]
    );
    renderStatCard(content, 'JS-Allowed %', activity.jsAllowedPct + '%');

    // ── Errors ──
    renderSectionHeading(content, 'Errors');
    renderStatCard(content, 'Total Errors', errors.total.toLocaleString());
    renderBarChart(
      content, 'Error Type Breakdown',
      errors.byType.map((t) => t.error_type),
      [{ name: 'Count', values: errors.byType.map((t) => t.count) }]
    );
    const histLabels = ['0', '1', '2', '3+'];
    renderBarChart(
      content, 'Errors per Session',
      histLabels,
      [{ name: 'Sessions', values: histLabels.map((k) => errors.perSessionHistogram[k] || 0) }]
    );
    renderLineChart(content, 'Errors Over Time', errors.trend);

    // ── Performance ──
    renderSectionHeading(content, 'Performance');
    const pages = performance.pages || [];
    const pageUrls = pages.map((p) => p.url);
    renderBarChart(content, 'Average Load Time by Page', pageUrls,
      [{ name: 'Avg Load Time (ms)', values: pages.map((p) => p.avg_load_time) }], 'ms');
    renderBarChart(content, 'TTFB by Page', pageUrls,
      [{ name: 'Avg TTFB (ms)', values: pages.map((p) => p.avg_ttfb) }], 'ms');
    renderBarChart(content, 'DOM Complete Time by Page', pageUrls,
      [{ name: 'Avg DOM Complete (ms)', values: pages.map((p) => p.avg_dom_complete) }], 'ms');
  } catch (err) {
    showError(err.message);
  }
}

// ── Performance Report view ───────────────────────────────────────

async function reportView() {
  showLoading();
  try {
    const report = await apiFetch('/api/bounce-report');
    if (!report) return;

    content.innerHTML = '';

    renderSectionHeading(content, 'Does Load Time Affect Bounce Rate?');

    const buckets = report.loadTimeBuckets || [];
    renderBarChart(
      content, 'Bounce Rate by Load Time Bucket',
      buckets.map((b) => b.bucket),
      [{ name: 'Bounce Rate (%)', values: buckets.map((b) => b.bounce_rate_pct) }], '%'
    );
    const bucketNote = document.createElement('p');
    bucketNote.className = 'chart-note';
    bucketNote.textContent = `Sessions per bucket: ${buckets.map((b) => `${b.bucket}: ${b.sessions}`).join(', ')}`;
    content.appendChild(bucketNote);

    // Load time by page x browser — pivot the flat rows into series per browser.
    const byPageBrowser = report.byPageBrowser || [];
    const pageUrls = [...new Set(byPageBrowser.map((r) => r.url))];
    const browsers = [...new Set(byPageBrowser.map((r) => r.browser))];
    const browserSeries = browsers.map((browser) => ({
      name: browser,
      values: pageUrls.map((url) => {
        const match = byPageBrowser.find((r) => r.url === url && r.browser === browser);
        return match ? match.avg_load_time : 0;
      }),
    }));
    renderBarChart(content, 'Load Time by Page and Browser', pageUrls, browserSeries, 'ms');

    renderGenericTable(
      content, 'Average Load Time by Region',
      [
        { label: 'Region', key: 'region' },
        { label: 'Avg Load Time (ms)', key: 'avg_load_time' },
        { label: 'Sessions', key: 'sessions' },
      ],
      report.ipRegions
    );

    renderAnalysisSection(content, 'Key Findings & Recommendations', `
      <p>Finding:Bounce rate rises from roughly X% in the
      &lt;1s bucket to Y% in the 3s+ bucket — sessions with slower average
      load times are meaningfully more likely to leave after a single page.</p>
      <p><strong>Finding:</strong> [Page] on [Browser] is the slowest
      page/browser combination, averaging Xms — cross-reference against the
      Dashboard's "Views per Page" chart to see whether this is also a
      high-traffic page (worth fixing first) or a low-traffic one (lower
      priority).</p>
      <p><strong>Finding:</strong> [Region] averages Xms vs. Yms for
      [fastest region] — check whether this region represents a meaningful
      share of total sessions before treating it as a priority.</p>
      <p><strong>Recommended actions:</strong></p>
      <ul>
        <li>Prioritize performance work on [specific page], since it is both
        slow and high-traffic.</li>
        <li>[If regional gap is large and traffic share is meaningful]
        Consider a CDN or edge caching to address network-distance latency,
        since this gap is geographic rather than app-side.</li>
        <li>[Any other action specific to your actual numbers]</li>
      </ul>
    `);
  } catch (err) {
    showError(err.message);
  }
}

// ── Admin view (unchanged from before) ────────────────────────────

function fmtDate(str) {
  return str ? new Date(str).toLocaleString() : '—';
}

async function adminView() {
  showLoading();
  try {
    const res = await fetch('/api/users', { credentials: 'include' });
    if (res.status === 401) {
      window.location.href = '/login.html';
      return;
    }
    if (res.status === 403) {
      content.innerHTML = '';
      const denied = document.createElement('div');
      denied.className = 'error-message';
      denied.textContent = 'Access denied — admin or owner role required.';
      content.appendChild(denied);
      return;
    }
    if (!res.ok) throw new Error(`API error: ${res.status}`);

    const users = await res.json();
    content.innerHTML = '';
    renderUsersTable(content, users);
    renderAddUserForm(content);
  } catch (err) {
    showError(err.message);
  }
}

function renderUsersTable(container, users) {
  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrapper';
  const heading = document.createElement('h3');
  heading.textContent = 'Manage Users';
  wrapper.appendChild(heading);

  const table = document.createElement('table');
  const thead = document.createElement('thead');
  const headRow = document.createElement('tr');
  ['Email', 'Display Name', 'Role', 'Created', 'Last Login', 'Actions'].forEach((label) => {
    const th = document.createElement('th');
    th.textContent = label;
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement('tbody');
  users.forEach((user) => tbody.appendChild(buildUserRow(user)));
  table.appendChild(tbody);

  wrapper.appendChild(table);
  container.appendChild(wrapper);
}

function buildUserRow(user) {
  const tr = document.createElement('tr');
  tr.dataset.id = user.id;

  const tdEmail = document.createElement('td');
  tdEmail.textContent = user.email;

  const tdName = document.createElement('td');
  tdName.className = 'display-name';
  tdName.textContent = user.display_name || '';

  const tdRole = document.createElement('td');
  tdRole.className = 'role';
  tdRole.textContent = user.role;

  const tdCreated = document.createElement('td');
  tdCreated.textContent = fmtDate(user.created_at);

  const tdLogin = document.createElement('td');
  tdLogin.textContent = fmtDate(user.last_login);

  const tdActions = document.createElement('td');
  tdActions.className = 'actions';

  const editBtn = document.createElement('button');
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => enterEditMode(tr, user));

  const resetBtn = document.createElement('button');
  resetBtn.textContent = 'Reset Password';
  resetBtn.addEventListener('click', () => resetPassword(user.id));

  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = 'Delete';
  deleteBtn.className = 'danger';
  deleteBtn.addEventListener('click', () => deleteUserRow(user.id, tr));

  tdActions.append(editBtn, resetBtn, deleteBtn);
  tr.append(tdEmail, tdName, tdRole, tdCreated, tdLogin, tdActions);

  return tr;
}

function enterEditMode(tr, user) {
  const nameCell = tr.querySelector('.display-name');
  const roleCell = tr.querySelector('.role');
  const actionsCell = tr.querySelector('.actions');

  nameCell.innerHTML = '';
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = user.display_name || '';
  nameCell.appendChild(nameInput);

  roleCell.innerHTML = '';
  const roleSelect = document.createElement('select');
  ['viewer', 'admin', 'owner'].forEach((r) => {
    const opt = document.createElement('option');
    opt.value = r;
    opt.textContent = r;
    opt.selected = r === user.role;
    roleSelect.appendChild(opt);
  });
  roleCell.appendChild(roleSelect);

  actionsCell.innerHTML = '';
  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';

  saveBtn.addEventListener('click', async () => {
    const res = await fetch(`/api/users/${user.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ displayName: nameInput.value, role: roleSelect.value }),
    });
    if (res.ok) {
      route();
    } else {
      const data = await res.json();
      alert(data.error || 'Failed to update user');
    }
  });
  cancelBtn.addEventListener('click', () => route());

  actionsCell.append(saveBtn, cancelBtn);
}

async function resetPassword(id) {
  const newPassword = prompt('Enter a new password (min 8 characters):');
  if (!newPassword) return;
  if (newPassword.length < 8) {
    alert('Password must be at least 8 characters.');
    return;
  }

  const res = await fetch(`/api/users/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ password: newPassword }),
  });
  if (res.ok) {
    alert('Password updated.');
  } else {
    const data = await res.json();
    alert(data.error || 'Failed to update password');
  }
}

async function deleteUserRow(id, tr) {
  if (!confirm('Delete this user? This cannot be undone.')) return;

  const res = await fetch(`/api/users/${id}`, { method: 'DELETE', credentials: 'include' });
  if (res.ok) {
    tr.remove();
  } else {
    const data = await res.json();
    alert(data.error || 'Failed to delete user');
  }
}

function renderAddUserForm(container) {
  const wrapper = document.createElement('div');
  wrapper.className = 'table-wrapper';
  const heading = document.createElement('h3');
  heading.textContent = 'Add New User';
  wrapper.appendChild(heading);

  const form = document.createElement('form');
  form.className = 'add-user-form';

  const emailInput = document.createElement('input');
  emailInput.type = 'email';
  emailInput.placeholder = 'Email';
  emailInput.required = true;

  const passwordInput = document.createElement('input');
  passwordInput.type = 'password';
  passwordInput.placeholder = 'Password (min 8 chars)';
  passwordInput.required = true;
  passwordInput.minLength = 8;

  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.placeholder = 'Display name';

  const roleSelect = document.createElement('select');
  ['viewer', 'admin', 'owner'].forEach((r) => {
    const opt = document.createElement('option');
    opt.value = r;
    opt.textContent = r;
    roleSelect.appendChild(opt);
  });

  const submitBtn = document.createElement('button');
  submitBtn.type = 'submit';
  submitBtn.textContent = 'Add User';

  const errorDiv = document.createElement('div');
  errorDiv.className = 'error-message';
  errorDiv.style.padding = '0.5rem 0';

  form.append(emailInput, passwordInput, nameInput, roleSelect, submitBtn);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.textContent = '';

    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({
        email: emailInput.value,
        password: passwordInput.value,
        displayName: nameInput.value,
        role: roleSelect.value,
      }),
    });
    const data = await res.json();

    if (res.ok) {
      route();
    } else {
      errorDiv.textContent = data.error || 'Failed to add user';
    }
  });

  wrapper.append(form, errorDiv);
  container.appendChild(wrapper);
}

// ── Router ────────────────────────────────────────────────────────

let currentUser = null;

function updateActiveNav() {
  const hash = window.location.hash || '#/dashboard';
  document.querySelectorAll('.dashboard-sidebar a').forEach((a) => {
    a.classList.toggle('active', a.getAttribute('href') === hash.split('?')[0]);
  });
}

function route() {
  updateActiveNav();
  const hash = (window.location.hash || '#/dashboard').split('?')[0];

  switch (hash) {
    case '#/dashboard':
      dashboardView();
      break;
    case '#/report':
      reportView();
      break;
    case '#/admin':
      // Role check — UX only. The API enforces this for real (403 handled inside adminView).
      if (currentUser && currentUser.role !== 'owner' && currentUser.role !== 'admin') {
        window.location.hash = '#/dashboard';
        return;
      }
      adminView();
      break;
    default:
      window.location.hash = '#/dashboard';
  }
}

// ── Init ──────────────────────────────────────────────────────────

async function init() {
  currentUser = await checkAuth();
  if (!currentUser) return;

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
