// Include this on every dashboard page:  <script src="/auth.js"></script>
//
// Reminder from the tutorial (worth keeping in mind): this redirect is
// a CONVENIENCE, not the security boundary. The real protection is
// /api/index.php returning 401 for any request without a valid
// session — this script just gives logged-out users a clean redirect
// instead of a broken page full of failed fetches.

async function checkAuth() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (res.status === 401) {
      window.location.href = '/login.html';
      return null;
    }
    const data = await res.json();
    return data.data; // { id, email, displayName, role }
  } catch (err) {
    window.location.href = '/login.html';
    return null;
  }
}

// Run on every page load.
checkAuth();

// Wire up a logout button if the page has one: <button id="logout-btn">
document.addEventListener('DOMContentLoaded', () => {
  const logoutBtn = document.getElementById('logout-btn');
  if (!logoutBtn) return;

  logoutBtn.addEventListener('click', async () => {
    await fetch('/api/logout', { method: 'POST', credentials: 'include' });
    window.location.href = '/login.html';
  });
});
