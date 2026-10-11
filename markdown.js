// Tiny, safe markdown renderer for journal posts (no libraries).
// Supports: # headings, > quotes, - / * lists, --- rules,
//           **bold**, *italic*, `code`, [text](url).
// Every non-empty line becomes its own paragraph (so you can write one
// paragraph per line, no blank lines needed).
// All text is HTML-escaped first, so raw HTML in a post is shown as text.

function mdEscape(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function mdInline(text) {
  return mdEscape(text)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, '$1<em>$2</em>')
    // links: only http(s), mailto, and relative/anchor URLs are allowed
    .replace(/\[([^\]]+)\]\(((?:https?:\/\/|mailto:|\/|#|\.\.?\/)[^\s)]*)\)/g, (m, label, url) =>
      /^https?:/.test(url)
        ? `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`
        : `<a href="${url}">${label}</a>`);
}

function mdToHtml(src) {
  const lines = String(src).replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let list = [];
  let quote = [];

  const flushList = () => {
    if (list.length) out.push('<ul>' + list.map(i => `<li>${mdInline(i)}</li>`).join('') + '</ul>');
    list = [];
  };
  const flushQuote = () => {
    if (quote.length) out.push('<blockquote>' + quote.map(q => `<p>${mdInline(q)}</p>`).join('') + '</blockquote>');
    quote = [];
  };
  const flushAll = () => { flushList(); flushQuote(); };

  for (const raw of lines) {
    const line = raw.trim();
    let m;
    if (!line) { flushAll(); continue; }

    if ((m = line.match(/^(#{1,6})\s+(.*)$/))) {
      flushAll();
      // Post title is the page's <h2>, so section headings start at <h3>
      const level = Math.max(3, m[1].length);
      out.push(`<h${level}>${mdInline(m[2])}</h${level}>`);
    } else if ((m = line.match(/^>\s?(.*)$/))) {
      flushList();
      quote.push(m[1]);
    } else if ((m = line.match(/^[-*]\s+(.*)$/))) {
      flushQuote();
      list.push(m[1]);
    } else if (/^(-{3,}|\*{3,})$/.test(line)) {
      flushAll();
      out.push('<hr>');
    } else {
      flushAll();
      out.push(`<p>${mdInline(line)}</p>`);
    }
  }
  flushAll();
  return out.join('');
}

// Plain-text first paragraph (skips headings, quotes, lists) for previews
function mdFirstParagraph(src) {
  for (const raw of String(src).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^(#|>|[-*]\s|-{3,}$|\*{3,}$)/.test(line)) continue;
    return line.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*`]/g, '');
  }
  return '';
}
