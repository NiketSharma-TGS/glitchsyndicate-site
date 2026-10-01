// Footer year
document.getElementById('year').textContent = new Date().getFullYear();

// "Updates" card: show the newest journal entry from diary/entries.json
const latestEl = document.getElementById('latest-entry');

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

// Must match entryId() in diary.js so the link lands on the right entry
function entryId(entry) {
  const slug = String(entry.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return 'entry-' + entry.date + (slug ? '-' + slug : '');
}

// body can be a string (blank line = new paragraph) or an array of paragraphs
function firstParagraph(body) {
  const parts = Array.isArray(body) ? body : String(body).split(/\n\s*\n/);
  const text = String(parts[0] || '');
  return text.length > 220 ? text.slice(0, 217).trimEnd() + '…' : text;
}

async function loadLatest() {
  if (!latestEl) return;
  try {
    const res = await fetch('diary/entries.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed');
    const entries = await res.json();

    if (!Array.isArray(entries) || entries.length === 0) {
      latestEl.innerHTML = '<p class="diary-empty">No updates yet — check back soon.</p>';
      return;
    }

    entries.sort((a, b) => (a.date < b.date ? 1 : -1));
    const latest = entries[0];

    latestEl.innerHTML = `
      <a class="latest-link" href="diary.html#${escapeHtml(entryId(latest))}">
        <time class="diary-date" datetime="${escapeHtml(latest.date)}">${escapeHtml(formatDate(latest.date))}</time>
        <h3 class="latest-title">${escapeHtml(latest.title)}</h3>
        <p class="latest-body">${escapeHtml(firstParagraph(latest.body))}</p>
      </a>
    `;
  } catch (err) {
    latestEl.innerHTML = '<p class="diary-empty">Couldn\'t load updates right now.</p>';
  }
}

loadLatest();
