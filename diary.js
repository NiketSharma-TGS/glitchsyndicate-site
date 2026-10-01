document.getElementById('year').textContent = new Date().getFullYear();

const listEl = document.getElementById('diary-list');

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

// Stable anchor for an entry, e.g. "entry-2026-09-13-sites-up".
// Must match entryId() in script.js (the homepage links to these).
function entryId(entry) {
  const slug = String(entry.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return 'entry-' + entry.date + (slug ? '-' + slug : '');
}

// "body" in entries.json can be:
//   - a string (a blank line, i.e. "\n\n", starts a new paragraph), or
//   - an array of strings, one per paragraph
function renderBody(body) {
  const parts = Array.isArray(body) ? body : String(body).split(/\n\s*\n/);
  return parts
    .filter(p => String(p).trim() !== '')
    .map(p => `<p>${escapeHtml(p)}</p>`)
    .join('');
}

// Entries render after the page loads, so the browser's own #anchor jump
// misses them. Scroll to the targeted entry once it exists and flash it.
function scrollToHashEntry() {
  const id = decodeURIComponent(location.hash.slice(1));
  if (!id) return;
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ block: 'start' });
  target.classList.add('entry-highlight');
  setTimeout(() => target.classList.remove('entry-highlight'), 2000);
}

async function loadEntries() {
  try {
    const res = await fetch('diary/entries.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('fetch failed');
    const entries = await res.json();

    if (!Array.isArray(entries) || entries.length === 0) {
      listEl.innerHTML = '<p class="diary-empty">No entries yet — check back soon.</p>';
      return;
    }

    // Newest first
    entries.sort((a, b) => (a.date < b.date ? 1 : -1));

    // If two entries share the same date+title, suffix the later ones so ids stay unique
    const seen = {};
    listEl.innerHTML = entries.map(entry => {
      let id = entryId(entry);
      seen[id] = (seen[id] || 0) + 1;
      if (seen[id] > 1) id += '-' + seen[id];
      return `
      <article class="diary-entry" id="${escapeHtml(id)}">
        <time class="diary-date" datetime="${escapeHtml(entry.date)}">${escapeHtml(formatDate(entry.date))}</time>
        <h2>${escapeHtml(entry.title)}</h2>
        ${renderBody(entry.body)}
      </article>
    `;
    }).join('');

    scrollToHashEntry();
  } catch (err) {
    listEl.innerHTML = '<p class="diary-empty">Couldn\'t load entries right now.</p>';
  }
}

loadEntries();
