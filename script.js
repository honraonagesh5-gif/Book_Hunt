(() => {
'use strict';
const API = 'https://openlibrary.org/search.json';
const FIELDS = 'key,title,author_name,first_publish_year,cover_i,subject,edition_count,number_of_pages_median,language,ratings_average,ratings_count,publisher';
const LIMIT = 20, MAX_PAGES = 50;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
};
const ICON = {
  heart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 20.5s-7.5-4.6-9.2-9.4C1.6 7.700 3.700 4.500 7 4.500c2 0 3.600 1.100 5 3 1.400-1.900 3-3 5-3 3.300 0 5.400 3.200 4.200 6.600-1.700 4.800-9.200 9.400-9.200 9.400z"/></svg>',
  mark: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M6 3.500h12v17l-6-4.200-6 4.200z"/></svg>',
  cmp: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h6v16H4zM14 8h6v12h-6z"/></svg>',
  x: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg>',
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.500A2.500 2.500 0 0 1 6.500 3H20v15H6.500A2.500 2.500 0 0 0 4 20.500z"/><path d="M4 20.500A2.500 2.500 0 0 0 6.500 23H20M9 8h6"/></svg>'
};

/* ---------- state ---------- */
const known = new Map();                       // key -> normalized book
let fav = store.get('bh.fav', {});             // key -> book
let list = store.get('bh.list', {});           // key -> {book,status}
let cmp = [];                                  // up to 2 keys
const S = { mode: 'title', q: '', from: '', to: '', sort: 'rel', page: 1, total: 0, view: 'discover', listFilter: 'all', ctrl: null, last: null };
Object.values(fav).forEach(b => known.set(b.key, b));
Object.values(list).forEach(e => known.set(e.book.key, e.book));

const STATUS = { want: 'Want to read', reading: 'Reading now', done: 'Finished' };
const LANG = { eng:'English', fre:'French', ger:'German', spa:'Spanish', ita:'Italian', rus:'Russian', por:'Portuguese', jpn:'Japanese', chi:'Chinese', dut:'Dutch', lat:'Latin', swe:'Swedish', pol:'Polish', hin:'Hindi', ara:'Arabic', gre:'Greek', heb:'Hebrew', tur:'Turkish', kor:'Korean' };

const norm = d => ({
  key: d.key, title: d.title || 'Untitled', authors: d.author_name || [], year: d.first_publish_year || null,
  cover: d.cover_i || null, subjects: (d.subject || []).slice(0, 30), editions: d.edition_count || 0,
  pages: d.number_of_pages_median || null, langs: (d.language || []).slice(0, 40),
  rating: d.ratings_average || null, ratingsCount: d.ratings_count || 0, publishers: (d.publisher || []).slice(0, 4)
});
const authorLine = b => b.authors.length ? b.authors.slice(0, 2).join(', ') + (b.authors.length > 2 ? ' +' + (b.authors.length - 2) : '') : 'Unknown author';
const hue = s => { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };

/* ---------- cover with graceful fallback ---------- */
function coverHTML(b, size = 'M') {
  const ph = `<div class="ph" style="--h:${hue(b.title)}"><span>${esc(b.title)}</span><small>${esc(b.authors[0] || '')}</small></div>`;
  const img = b.cover ? `<img src="https://covers.openlibrary.org/b/id/${b.cover}-${size}.jpg?default=false" alt="Cover of ${esc(b.title)}" loading="lazy" decoding="async">` : '';
  return ph + img;
}
document.addEventListener('error', e => {
  if (e.target.tagName === 'IMG' && e.target.closest('.cover')) e.target.remove();
}, true);
document.addEventListener('load', e => {  // Open Library can return a tiny 1px image for unknown covers
  const t = e.target; if (t.tagName === 'IMG' && t.closest('.cover') && t.naturalWidth <= 2) t.remove();
}, true);

/* ---------- cards ---------- */
function card(b, i, ctx) {
  const isFav = !!fav[b.key], inList = !!list[b.key], inCmp = cmp.includes(b.key);
  const extra = ctx === 'list'
    ? `<select data-change="status" aria-label="Reading status for ${esc(b.title)}">${Object.entries(STATUS).map(([k, v]) => `<option value="${k}"${list[b.key].status === k ? ' selected' : ''}>${v}</option>`).join('')}</select>` : '';
  return `<li class="card" style="--i:${Math.min(i, 14)}" data-key="${esc(b.key)}">
    <div class="cover" data-act="open">${coverHTML(b)}</div>
    <h3><button type="button" data-act="open">${esc(b.title)}</button></h3>
    <p class="by">${esc(authorLine(b))}</p>
    <div class="meta">
      <span class="year" title="First published">${b.year ?? 'n/a'}</span>
      <div class="acts">
        <button class="act" data-act="fav" aria-pressed="${isFav}" aria-label="${isFav ? 'Remove from' : 'Add to'} favourites" title="Favourite">${ICON.heart}</button>
        <button class="act" data-act="list" aria-pressed="${inList}" aria-label="${inList ? 'Remove from' : 'Add to'} reading list" title="Reading list">${ICON.mark}</button>
        <button class="act" data-act="cmp" aria-pressed="${inCmp}" aria-label="${inCmp ? 'Remove from' : 'Add to'} compare" title="Compare">${ICON.cmp}</button>
      </div>
    </div>${extra}
  </li>`;
}
function renderGrid(el, books, ctx) {
  el.innerHTML = books.map((b, i) => card(b, i, ctx)).join('');
}
const skeletons = () => Array.from({ length: 10 }, () => `<li><div class="sk"></div><div class="sk-line"></div><div class="sk-line" style="width:50%"></div></li>`).join('');

/* ---------- search ---------- */
function buildURL() {
  const p = new URLSearchParams();
  const range = (S.from || S.to) ? `first_publish_year:[${S.from || '*'} TO ${S.to || '*'}]` : '';
  if (S.mode === 'title') { p.set('title', S.q); if (range) p.set('q', range); }
  else if (S.mode === 'author') { p.set('author', S.q); if (range) p.set('q', range); }
  else p.set('q', range ? `(${S.q}) AND ${range}` : S.q);
  if (S.sort !== 'rel') p.set('sort', S.sort);
  p.set('limit', LIMIT); p.set('page', S.page); p.set('fields', FIELDS);
  return `${API}?${p}`;
}
function setStatus(html) { $('#status').innerHTML = html; }

async function runSearch({ page = 1, scroll = false } = {}) {
  S.page = page;
  if (S.ctrl) S.ctrl.abort();
  const ctrl = S.ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort('timeout'), 15000);
  $('#grid').innerHTML = skeletons();
  $('#pager').innerHTML = '';
  setStatus(`<h2>Searching…</h2><span class="count">Fetching from Open Library</span>`);
  if (scroll) $('#status').scrollIntoView({ behavior: 'smooth', block: 'start' });
  try {
    if (navigator.onLine === false) throw new Error('offline');
    const res = await fetch(buildURL(), { signal: ctrl.signal });
    if (!res.ok) throw new Error('http ' + res.status);
    const data = await res.json();
    if (ctrl !== S.ctrl) return;
    let books = (data.docs || []).map(norm);
    books.forEach(b => known.set(b.key, b));
    // safety net: the year filter and sort are also applied on this page of results
    const f = +S.from || 0, t = +S.to || 9999;
    if (S.from || S.to) books = books.filter(b => b.year && b.year >= f && b.year <= t);
    if (S.sort === 'new') books.sort((a, b) => (b.year || 0) - (a.year || 0));
    if (S.sort === 'old') books.sort((a, b) => (a.year || 9999) - (b.year || 9999));
    S.total = data.numFound || 0;
    S.last = books;
    renderResults(books);
  } catch (err) {
    if (ctrl !== S.ctrl && err.name === 'AbortError' && ctrl.signal.reason !== 'timeout') return;
    const timeout = ctrl.signal.reason === 'timeout';
    const offline = navigator.onLine === false;
    $('#grid').innerHTML = `<li class="empty">${ICON.book}<h3>${offline ? 'You appear to be offline' : timeout ? 'That took too long' : 'We could not reach Open Library'}</h3>
      <p>${offline ? 'Check your connection and try again.' : 'The service may be busy. Your search is safe, try it again in a moment.'}</p>
      <button class="btn" type="button" data-act="retry">Try again</button></li>`;
    setStatus(`<h2>Something went wrong</h2>`);
  } finally { clearTimeout(timer); }
}

function renderResults(books) {
  const pages = Math.min(Math.ceil(S.total / LIMIT), MAX_PAGES);
  if (!books.length) {
    const filtered = S.from || S.to;
    $('#grid').innerHTML = `<li class="empty">${ICON.book}<h3>No books found for “${esc(S.q)}”</h3>
      <p>${filtered ? 'Try widening the year range, or check the spelling.' : 'Check the spelling, try fewer words, or search by author instead.'}</p>
      <div class="chips">${filtered ? '<button class="chip" data-act="clearF">Reset year filter</button>' : ''}<button class="chip" data-act="suggest" data-m="title" data-v="Dune">Try “Dune”</button><button class="chip" data-act="suggest" data-m="author" data-v="Jane Austen">Try Jane Austen</button></div></li>`;
    setStatus(`<h2>No results</h2>`); return;
  }
  const label = { title: 'title', author: 'author', q: 'keyword' }[S.mode];
  setStatus(`<h2>Results for “${esc(S.q)}”</h2><span class="count">${S.total.toLocaleString()} books by ${label} · page ${S.page} of ${Math.max(pages, 1)}</span>`);
  renderGrid($('#grid'), books, 'discover');
  renderPager(pages);
}
function renderPager(pages) {
  if (pages <= 1) { $('#pager').innerHTML = ''; return; }
  const p = S.page, set = new Set([1, pages, p - 1, p, p + 1].filter(n => n >= 1 && n <= pages));
  const nums = [...set].sort((a, b) => a - b);
  let h = `<button class="pg" data-act="page" data-p="${p - 1}" ${p === 1 ? 'disabled' : ''} aria-label="Previous page">←</button>`;
  nums.forEach((n, i) => {
    if (i && n - nums[i - 1] > 1) h += '<span class="gap">…</span>';
    h += `<button class="pg" data-act="page" data-p="${n}" ${n === p ? 'aria-current="page"' : ''} aria-label="Page ${n}">${n}</button>`;
  });
  h += `<button class="pg" data-act="page" data-p="${p + 1}" ${p === pages ? 'disabled' : ''} aria-label="Next page">→</button>`;
  $('#pager').innerHTML = h;
}

function submitSearch(scroll) {
  const q = $('#q').value.trim().replace(/\s+/g, ' ');
  const err = $('#err');
  if (!q) { err.textContent = 'Enter a title, author or keyword to search.'; $('#q').focus(); return; }
  if (q.length < 2) { err.textContent = 'Type at least 2 characters.'; return; }
  if (!/[\p{L}\p{N}]/u.test(q)) { err.textContent = 'Use letters or numbers in your search.'; return; }
  const f = $('#yFrom').value, t = $('#yTo').value;
  if (f && t && +f > +t) { err.textContent = 'The “from” year must be before the “to” year.'; return; }
  err.textContent = '';
  Object.assign(S, { q, mode: document.querySelector('input[name=mode]:checked').value, from: f, to: t, sort: $('#sort').value });
  runSearch({ page: 1, scroll });
}

/* ---------- saved views ---------- */
function persist() {
  store.set('bh.fav', fav); store.set('bh.list', list);
  const n = libraryItems().length;
  $('#nLib').textContent = n; $('#nLib').dataset.z = n ? '' : '1';
}
function libraryItems() {
  const map = new Map();
  Object.values(fav).forEach(b => map.set(b.key, { book: b, fav: true, status: null }));
  Object.values(list).forEach(e => { const o = map.get(e.book.key) || { book: e.book, fav: false }; o.status = e.status; map.set(e.book.key, o); });
  return [...map.values()];
}
function renderSaved() {
  const grid = $('#savedGrid'), items = libraryItems(), f = S.listFilter;
  const cnt = k => k === 'all' ? items.length : k === 'fav' ? items.filter(i => i.fav).length : items.filter(i => i.status === k).length;
  $('#libStats').innerHTML = [['Saved books', cnt('all')], ['Favourites', cnt('fav')], ['Want to read', cnt('want')], ['Reading now', cnt('reading')], ['Finished', cnt('done')]]
    .map(([l, n]) => `<div class="stat"><b>${n}</b><span>${l}</span></div>`).join('');
  $('#savedFilter').innerHTML = [['all', 'All'], ['fav', 'Favourites'], ...Object.entries(STATUS)].map(([k, v]) =>
    `<button class="chip" data-act="lf" data-v="${k}" aria-pressed="${f === k}">${v} · ${cnt(k)}</button>`).join('');
  const shown = items.filter(i => f === 'all' || (f === 'fav' ? i.fav : i.status === f));
  if (!shown.length) {
    const none = !items.length;
    grid.innerHTML = `<li class="empty">${ICON.book}<h3>${none ? 'Your library is empty' : 'Nothing on this shelf yet'}</h3>
      <p>${none ? 'Tap the heart to favourite a book or the bookmark to add it to your reading list. Everything you save shows up here.' : 'Try another filter, or save more books from Discover.'}</p>
      <button class="btn" data-act="tab" data-v="discover">Find books</button></li>`;
    return;
  }
  grid.innerHTML = shown.map((i, n) => card(i.book, n, i.status ? 'list' : 'fav')).join('');
}
function setView(v) {
  S.view = v;
  document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', t.dataset.v === v));
  $('#v-discover').hidden = v !== 'discover'; $('#v-saved').hidden = v === 'discover';
  if (v !== 'discover') renderSaved();
  window.scrollTo({ top: 0 });
}

/* ---------- toggles ---------- */
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), 2200);
}
function toggleFav(key) {
  const b = known.get(key); if (!b) return;
  if (fav[key]) { delete fav[key]; toast('Removed from favourites'); } else { fav[key] = b; toast('Added to favourites'); }
  persist(); refresh(key, 'fav');
}
function toggleList(key) {
  const b = known.get(key); if (!b) return;
  if (list[key]) { delete list[key]; toast('Removed from reading list'); } else { list[key] = { book: b, status: 'want', added: Date.now() }; toast('Added to reading list'); }
  persist(); refresh(key, 'list');
}
function toggleCmp(key) {
  if (cmp.includes(key)) cmp = cmp.filter(k => k !== key);
  else { if (cmp.length === 2) { cmp.shift(); toast('Replaced the first book in compare'); } cmp.push(key); }
  renderTray(); refresh(key, 'cmp'); cmp.forEach(k => refresh(k, 'cmp'));
}
function refresh(key, what) {
  if (S.view !== 'discover' && (what === 'fav' || what === 'list')) { renderSaved(); }
  document.querySelectorAll(`[data-key="${CSS.escape(key)}"] [data-act="${what}"]`).forEach(btn => {
    const on = what === 'fav' ? !!fav[key] : what === 'list' ? !!list[key] : cmp.includes(key);
    btn.setAttribute('aria-pressed', on);
    btn.classList.remove('pop'); void btn.offsetWidth; btn.classList.add('pop');
  });
  if ($('#dlg').open && $('#dlg').dataset.key === key) syncDetailButtons(key);
}
function renderTray() {
  const t = $('#tray');
  if (!cmp.length) { t.classList.remove('show'); return; }
  const slots = cmp.map(k => `<span class="slot">${esc(known.get(k).title)}</span>`).join('');
  t.innerHTML = `${slots}${cmp.length < 2 ? '<span class="slot" style="opacity:.55">Pick one more</span>' : ''}
    <button class="btn" data-act="doCmp" ${cmp.length < 2 ? 'disabled style="opacity:.5"' : ''}>Compare</button>
    <button class="x" data-act="clearCmp" aria-label="Clear compare">×</button>`;
  t.classList.add('show');
}

/* ---------- details dialog ---------- */
const workCache = new Map();
const stars = r => r ? `<span class="stars" aria-hidden="true">★</span> ${r.toFixed(1)}` : 'n/a';
const langs = b => b.langs.length ? [...new Set(b.langs)].slice(0, 5).map(c => LANG[c] || c.toUpperCase()).join(', ') + (new Set(b.langs).size > 5 ? '…' : '') : 'n/a';

function openDetails(key) {
  const b = known.get(key); if (!b) return;
  const d = $('#dlg'); d.dataset.key = key;
  d.innerHTML = `<div class="dlg">
    <button class="icon-btn close" data-act="closeDlg" aria-label="Close details">${ICON.x}</button>
    <div class="detail">
      <div class="cover">${coverHTML(b, 'L')}</div>
      <div>
        <h2>${esc(b.title)}</h2>
        <span class="by">by ${esc(b.authors.join(', ') || 'Unknown author')}</span>
        <div class="facts">
          <div class="fact"><b>First published</b><span>${b.year ?? 'n/a'}</span></div>
          <div class="fact"><b>Editions</b><span>${b.editions || 'n/a'}</span></div>
          <div class="fact"><b>Pages (median)</b><span>${b.pages ?? 'n/a'}</span></div>
          <div class="fact"><b>Rating</b><span>${stars(b.rating)}${b.ratingsCount ? ` <small>(${b.ratingsCount.toLocaleString()})</small>` : ''}</span></div>
          <div class="fact"><b>Languages</b><span>${esc(langs(b))}</span></div>
          ${b.publishers.length ? `<div class="fact"><b>Publishers</b><span>${esc(b.publishers.slice(0, 2).join(', '))}</span></div>` : ''}
        </div>
        <p class="desc dim" id="desc">Loading description…</p>
        <div class="chips" id="subj">${b.subjects.slice(0, 10).map(s => `<span class="chip">${esc(s)}</span>`).join('')}</div>
        <div class="actions">
          <button class="btn" data-act="fav" id="dFav"></button>
          <button class="btn" data-act="list" id="dList"></button>
          <button class="btn ghost" data-act="cmp" id="dCmp"></button>
        </div>
        <div class="callno">Catalogue no. ${esc(key.replace('/works/', ''))} · <a href="https://openlibrary.org${esc(key)}" target="_blank" rel="noopener">View on Open Library ↗</a></div>
      </div>
    </div></div>`;
  d.querySelectorAll('.dlg [data-act]').forEach(el => el.closest('.card') || (el.dataset.key = key));
  syncDetailButtons(key);
  if (!d.open) d.showModal();
  loadWork(key);
}
function syncDetailButtons(key) {
  const f = !!fav[key], l = !!list[key], c = cmp.includes(key);
  const set = (id, on, txt, ico) => { const el = $(id); if (!el) return; el.classList.toggle('on', on); el.innerHTML = ico + txt; el.dataset.key = key; };
  set('#dFav', f, f ? ' Favourited' : ' Favourite', ICON.heart);
  set('#dList', l, l ? ' In reading list' : ' Reading list', ICON.mark);
  set('#dCmp', c, c ? ' Selected to compare' : ' Compare', ICON.cmp);
  const d = $('#dlg'); d.querySelectorAll('.actions svg').forEach(s => s.style.cssText = 'width:18px;height:18px;' + (s.parentElement.classList.contains('on') ? 'fill:currentColor' : ''));
}
async function loadWork(key) {
  const set = (txt, dim) => { if ($('#dlg').dataset.key !== key) return; const el = $('#desc'); if (el) { el.textContent = txt; el.classList.toggle('dim', !!dim); } };
  try {
    let w = workCache.get(key);
    if (!w) {
      const res = await fetch(`https://openlibrary.org${key}.json`);
      if (!res.ok) throw 0;
      w = await res.json(); workCache.set(key, w);
    }
    let desc = typeof w.description === 'string' ? w.description : w.description?.value;
    desc = (desc || '').replace(/\r/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').split(/\n-{3,}|\n\s*\(?\[?Source/)[0].trim();
    if (desc.length > 900) desc = desc.slice(0, 900).replace(/\s+\S*$/, '') + '…';
    set(desc || 'No description is available for this book yet.', !desc);
    if (!known.get(key).subjects.length && w.subjects?.length && $('#dlg').dataset.key === key)
      $('#subj').innerHTML = w.subjects.slice(0, 10).map(s => `<span class="chip">${esc(s)}</span>`).join('');
  } catch { set('Description could not be loaded right now.', true); }
}

/* ---------- compare dialog ---------- */
function openCompare() {
  if (cmp.length < 2) return;
  const [a, b] = cmp.map(k => known.get(k));
  const win = (x, y, hi = true) => (x == null || y == null || x === y) ? ['', ''] : ((hi ? x > y : x < y) ? ['win', ''] : ['', 'win']);
  const row = (label, va, vb, w = ['', '']) => `<tr><th scope="row">${label}</th><td class="${w[0]}">${va}</td><td class="${w[1]}">${vb}</td></tr>`;
  const sA = new Set(a.subjects.map(s => s.toLowerCase())), shared = b.subjects.filter(s => sA.has(s.toLowerCase())).slice(0, 4);
  $('#cdlg').innerHTML = `<div class="dlg"><button class="icon-btn close" data-act="closeCmp" aria-label="Close comparison">${ICON.x}</button>
    <h2 class="t">Compare books</h2>
    <div class="scroll-x"><table class="cmp"><thead><tr><th></th>${[a, b].map(x => `<td><div class="cover">${coverHTML(x)}</div></td>`).join('')}</tr></thead><tbody>
    ${row('Title', `<b>${esc(a.title)}</b>`, `<b>${esc(b.title)}</b>`)}
    ${row('Author', esc(authorLine(a)), esc(authorLine(b)))}
    ${row('First published', a.year ?? 'n/a', b.year ?? 'n/a', win(a.year, b.year, false))}
    ${row('Editions', a.editions || 'n/a', b.editions || 'n/a', win(a.editions, b.editions))}
    ${row('Pages', a.pages ?? 'n/a', b.pages ?? 'n/a', win(a.pages, b.pages))}
    ${row('Rating', stars(a.rating), stars(b.rating), win(a.rating, b.rating))}
    ${row('Ratings count', a.ratingsCount.toLocaleString(), b.ratingsCount.toLocaleString(), win(a.ratingsCount, b.ratingsCount))}
    ${row('Languages', esc(langs(a)), esc(langs(b)))}
    ${row('Subjects', esc(a.subjects.slice(0, 4).join(', ') || 'n/a'), esc(b.subjects.slice(0, 4).join(', ') || 'n/a'))}
    </tbody></table></div>
    <p class="count" style="margin:14px 0 0">A ✓ marks the higher value (earlier year for “First published”). ${shared.length ? `Shared subjects: ${esc(shared.join(', '))}.` : 'No shared subjects found.'}</p></div>`;
  $('#cdlg').showModal();
}

/* ---------- Book of the Day ---------- */
const PICKS = [
  ['The Hobbit', 'J.R.R. Tolkien'], ['Pride and Prejudice', 'Jane Austen'], ['Dune', 'Frank Herbert'], ['1984', 'George Orwell'],
  ['To Kill a Mockingbird', 'Harper Lee'], ['The Great Gatsby', 'F. Scott Fitzgerald'], ['Frankenstein', 'Mary Shelley'],
  ['One Hundred Years of Solitude', 'Gabriel García Márquez'], ['Brave New World', 'Aldous Huxley'], ['The Left Hand of Darkness', 'Ursula K. Le Guin'],
  ['Beloved', 'Toni Morrison'], ['The Name of the Rose', 'Umberto Eco'], ['Things Fall Apart', 'Chinua Achebe'], ['Slaughterhouse-Five', 'Kurt Vonnegut'],
  ['Jane Eyre', 'Charlotte Brontë'], ['The Handmaid\'s Tale', 'Margaret Atwood'], ['Norwegian Wood', 'Haruki Murakami'], ['Neuromancer', 'William Gibson'],
  ['The Alchemist', 'Paulo Coelho'], ['Sapiens', 'Yuval Noah Harari'], ['A Brief History of Time', 'Stephen Hawking'], ['The God of Small Things', 'Arundhati Roy'],
  ['Midnight\'s Children', 'Salman Rushdie'], ['Wuthering Heights', 'Emily Brontë'], ['Crime and Punishment', 'Fyodor Dostoevsky'], ['The Catcher in the Rye', 'J.D. Salinger'],
  ['Good Omens', 'Terry Pratchett'], ['The Road', 'Cormac McCarthy'], ['Persepolis', 'Marjane Satrapi'], ['Life of Pi', 'Yann Martel'], ['Rebecca', 'Daphne du Maurier']
];
function dayKey() { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; }
async function loadBotd() {
  const d = new Date(), idx = (Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 864e5)) % PICKS.length;
  const [title, author] = PICKS[idx];
  const el = $('#botd');
  const cached = store.get('bh.botd', null);
  let b = cached && cached.day === dayKey() ? cached.book : null;
  const show = (b, fallback) => {
    el.innerHTML = `<div class="cover">${coverHTML(b, 'L')}</div>
      <div><p class="kicker">Book of the Day · ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' })}</p>
      <h2>${esc(b.title)}</h2><p>${esc(authorLine(b))}${b.year ? ' · first published ' + b.year : ''}</p>
      <div class="row">${fallback ? `<button class="btn" data-act="botdSearch">Search for it</button>` : `<button class="btn" data-act="open" data-key="${esc(b.key)}">See details</button>`}
      ${fallback ? '' : `<button class="btn ghost" style="color:inherit;border-color:currentColor" data-act="fav" data-key="${esc(b.key)}">Favourite</button>`}</div></div>`;
  };
  if (b) { known.set(b.key, b); show(b); return; }
  show({ title, authors: [author], year: null, cover: null, key: '' }, true);
  try {
    const p = new URLSearchParams({ title, author, limit: 1, fields: FIELDS });
    const res = await fetch(`${API}?${p}`); if (!res.ok) throw 0;
    const doc = (await res.json()).docs?.[0]; if (!doc) throw 0;
    b = norm(doc); known.set(b.key, b); store.set('bh.botd', { day: dayKey(), book: b }); show(b);
  } catch { /* keep text-only fallback */ }
}

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]'); if (!el) return;
  const key = el.dataset.key || el.closest('[data-key]')?.dataset.key;
  switch (el.dataset.act) {
    case 'open': if (key) openDetails(key); break;
    case 'fav': toggleFav(key); break;
    case 'list': toggleList(key); break;
    case 'cmp': toggleCmp(key); break;
    case 'tab': setView(el.dataset.v); break;
    case 'page': { const p = +el.dataset.p; if (p >= 1) runSearch({ page: p, scroll: true }); break; }
    case 'retry': S.q ? runSearch({ page: S.page }) : submitSearch(); break;
    case 'closeDlg': $('#dlg').close(); break;
    case 'closeCmp': $('#cdlg').close(); break;
    case 'doCmp': openCompare(); break;
    case 'clearCmp': { const old = cmp; cmp = []; renderTray(); old.forEach(k => refresh(k, 'cmp')); break; }
    case 'lf': S.listFilter = el.dataset.v; renderSaved(); break;
    case 'clearF': resetFilters(true); break;
    case 'botdSearch': { const [t, a] = el.closest('.botd').querySelector('h2').textContent ? [el.closest('.botd').querySelector('h2').textContent] : []; $('#q').value = t; setMode('title'); submitSearch(true); break; }
    case 'suggest': setMode(el.dataset.m); $('#q').value = el.dataset.v; submitSearch(true); break;
  }
});
document.addEventListener('change', e => {
  if (e.target.dataset.change === 'status') {
    const key = e.target.closest('[data-key]').dataset.key;
    if (list[key]) { list[key].status = e.target.value; persist(); toast('Status: ' + STATUS[e.target.value]); renderSaved(); }
  }
});
['dlg', 'cdlg'].forEach(id => $('#' + id).addEventListener('click', e => { if (e.target.id === id) e.target.close(); }));
$('#form').addEventListener('submit', e => { e.preventDefault(); submitSearch(false); });
$('#q').addEventListener('input', () => { $('#err').textContent = ''; });
$('#applyF').addEventListener('click', () => { if ($('#q').value.trim() || S.q) { if (!$('#q').value.trim()) $('#q').value = S.q; submitSearch(false); } else { $('#err').textContent = 'Search for something first, then narrow it with filters.'; $('#q').focus(); } });
$('#clearF').addEventListener('click', () => resetFilters(false));
$('#sort').addEventListener('change', () => { if (S.q) submitSearch(false); });
function resetFilters(rerun) { $('#yFrom').value = ''; $('#yTo').value = ''; $('#sort').value = 'rel'; if (rerun && S.q) submitSearch(false); }
function setMode(m) { const r = document.querySelector(`input[name=mode][value="${m}"]`); if (r) r.checked = true; }
document.addEventListener('keydown', e => {
  if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); if (S.view !== 'discover') setView('discover'); $('#q').focus(); }
});
/* gentle 3D tilt on covers (pointer devices only) */
if (matchMedia('(hover:hover)').matches && !matchMedia('(prefers-reduced-motion:reduce)').matches) {
  document.addEventListener('pointermove', e => {
    const c = e.target.closest?.('.card .cover'); if (!c) return;
    const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
    c.style.setProperty('--ry', (x * 14).toFixed(1) + 'deg'); c.style.setProperty('--rx', (-y * 14).toFixed(1) + 'deg');
  });
  document.addEventListener('pointerout', e => { const c = e.target.closest?.('.card .cover'); if (c) { c.style.setProperty('--rx', '0deg'); c.style.setProperty('--ry', '0deg'); } });
}
/* theme */
const root = document.documentElement;
const savedTheme = store.get('bh.theme', null); if (savedTheme) root.dataset.theme = savedTheme;
$('#theme').addEventListener('click', () => {
  const dark = root.dataset.theme ? root.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme:dark)').matches;
  root.dataset.theme = dark ? 'light' : 'dark'; store.set('bh.theme', root.dataset.theme);
});

/* ---------- init ---------- */
(function init() {
  const colors = ['#0e6b5b', '#c98a06', '#2d4a7a', '#8a3b3b', '#4a6b2d', '#5b3a7a', '#b8581f'];
  $('#spines').innerHTML = Array.from({ length: 16 }, (_, i) =>
    `<i style="--c:${colors[i % colors.length]};--h:${40 + ((i * 37) % 60)}%;--d:${(i * -0.6).toFixed(1)}s"></i>`).join('');
  const sug = $('#suggest');
  [['title', 'Dune'], ['author', 'Jane Austen'], ['title', 'Sapiens'], ['author', 'Haruki Murakami'], ['q', 'space opera']].forEach(([m, v]) =>
    sug.insertAdjacentHTML('beforeend', `<button type="button" class="chip" data-act="suggest" data-m="${m}" data-v="${v}">${v}</button>`));
  persist(); loadBotd();
  $('#q').value = 'the hobbit'; S.q = 'the hobbit';   // starter search so the page opens with results
  runSearch({ page: 1 });
})();
})();
