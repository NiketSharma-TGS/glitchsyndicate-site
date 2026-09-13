document.getElementById('year').textContent = new Date().getFullYear();

const listEl = document.getElementById('diary-list');

function formatDate(iso) {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
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

    listEl.innerHTML = entries.map(entry => `
      <article class="diary-entry">
        <time class="diary-date" datetime="${entry.date}">${formatDate(entry.date)}</time>
        <h2>${entry.title}</h2>
        <p>${entry.body}</p>
      </article>
    `).join('');
  } catch (err) {
    listEl.innerHTML = '<p class="diary-empty">Couldn\'t load entries right now.</p>';
  }
}

loadEntries();
