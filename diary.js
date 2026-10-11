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

// Stable anchor for an entry, e.g. "entry-2026-10-12-we-are-in-business".
// Must match entryId() in script.js (the homepage links to these).
function entryId(entry) {
  const slug = String(entry.title).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return 'entry-' + entry.date + (slug ? '-' + slug : '');
}

// Only allow simple relative paths like "diary/posts/my-post.md"
function isSafePostPath(p) {
  return typeof p === 'string' && /^[\w./-]+$/.test(p) && !p.startsWith('/') && !p.includes('..');
}

// Inline "body" in entries.json can be:
//   - a string (a blank line, i.e. "\n\n", starts a new paragraph), or
//   - an array of strings, one per paragraph
function renderBody(body) {
  const parts = Array.isArray(body) ? body : String(body || '').split(/\n\s*\n/);
  return parts
    .filter(p => String(p).trim() !== '')
    .map(p => `<p>${escapeHtml(p)}</p>`)
    .join('');
}

// An entry's content is either a markdown file ("file") or an inline "body"
async function loadContent(entry) {
  if (entry.file) {
    if (!isSafePostPath(entry.file)) return '<p class="diary-empty">Invalid post path.</p>';
    try {
      const res = await fetch(entry.file, { cache: 'no-store' });
      if (!res.ok) throw new Error('fetch failed');
      return mdToHtml(await res.text());
    } catch (err) {
      return '<p class="diary-empty">Couldn\'t load this post right now.</p>';
    }
  }
  return renderBody(entry.body);
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

    // Fetch all post files in parallel
    const contents = await Promise.all(entries.map(loadContent));

    // If two entries share the same date+title, suffix the later ones so ids stay unique
    const seen = {};
    listEl.innerHTML = entries.map((entry, i) => {
      let id = entryId(entry);
      seen[id] = (seen[id] || 0) + 1;
      if (seen[id] > 1) id += '-' + seen[id];
      return `
      <article class="diary-entry" id="${escapeHtml(id)}">
        <time class="diary-date" datetime="${escapeHtml(entry.date)}">${escapeHtml(formatDate(entry.date))}</time>
        <h2>${escapeHtml(entry.title)}</h2>
        ${contents[i]}
      </article>
    `;
    }).join('');

    scrollToHashEntry();
  } catch (err) {
    listEl.innerHTML = '<p class="diary-empty">Couldn\'t load entries right now.</p>';
  }
}

loadEntries();
