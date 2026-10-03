import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPublicData, validatePublicData } from './validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');

function option(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

function normalizeBase(value) {
  const withLeading = value.startsWith('/') ? value : `/${value}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

const BASE = normalizeBase(option('--base', '/'));
const SITE_URL = option('--url', 'http://localhost:8000').replace(/\/$/, '');
const BUILD_DATE = new Date().toISOString().slice(0, 10);
const data = loadPublicData();
const validation = validatePublicData(data);

if (validation.errors.length) {
  for (const error of validation.errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

const publishedWorks = data.works.works.filter((work) => work.publish);
const publishedResults = data.results.results.filter((result) => result.publish);
const chapterCount = data.volumes.volumes.reduce((sum, volume) => sum + volume.chapters.length, 0);
const layout = fs.readFileSync(path.join(ROOT, 'site-src/layout.html'), 'utf8');

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function routeUrl(route) {
  if (!route) return `${SITE_URL}${BASE}`;
  return `${SITE_URL}${BASE}${route.replace(/^\//, '')}`;
}

function replaceTokens(text, tokens) {
  let output = text;
  for (const [key, value] of Object.entries(tokens)) {
    output = output.split(`{{${key}}}`).join(String(value));
  }
  return output;
}

function write(relativePath, contents) {
  const destination = path.join(DIST, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, contents);
}

function renderPage({ route = '', title, description, pageId, content }) {
  const common = {
    BASE,
    TITLE: escapeHtml(title),
    DESCRIPTION: escapeHtml(description),
    CANONICAL_URL: routeUrl(route),
    PAGE_ID: pageId,
    CONTENT: content,
    WORK_COUNT: publishedWorks.length,
    RESULT_COUNT: publishedResults.length,
    CHAPTER_COUNT: chapterCount,
    VOLUME_COUNT: data.volumes.volumes.length,
    BUILD_DATE
  };
  return replaceTokens(layout, common);
}

function pageSource(name) {
  return fs.readFileSync(path.join(ROOT, `site-src/pages/${name}.html`), 'utf8');
}

function volumeCards(headingLevel = 3) {
  return data.volumes.volumes.map((volume) => `
    <article class="volume-card">
      <div class="volume-number">${escapeHtml(volume.id)}</div>
      <h${headingLevel}>${escapeHtml(volume.title)}</h${headingLevel}>
      <p>${escapeHtml(volume.arc)}</p>
      <a class="text-link" href="${BASE}volumes/${escapeHtml(volume.slug)}/">Read the map <span aria-hidden="true">→</span></a>
    </article>`).join('');
}

function workCards() {
  return publishedWorks.map((work) => `
    <article class="index-card" data-filter-item data-search="${escapeHtml([work.work_id, work.title, ...work.authors, work.public_summary].join(' '))}" data-volume="${escapeHtml(work.volume)}" data-status="${escapeHtml(work.evidence_status)}">
      <div class="index-card-meta">${escapeHtml(work.work_id)}<br>${escapeHtml(work.year)}</div>
      <div><h2>${escapeHtml(work.title)}</h2><p>${escapeHtml(work.authors.join(', '))}</p></div>
      <a class="text-link" href="${BASE}works/${work.work_id.toLowerCase()}/">Open <span aria-hidden="true">→</span></a>
    </article>`).join('');
}

function resultCards() {
  return publishedResults.map((result) => `
    <article class="index-card" data-filter-item data-search="${escapeHtml([result.result_id, result.title, result.work_id, result.chapter_id, result.public_summary].join(' '))}" data-volume="${escapeHtml(result.chapter_id.split('.')[0])}" data-status="${escapeHtml(result.evidence_status)}">
      <div class="index-card-meta">${escapeHtml(result.result_id)}<br>${escapeHtml(result.chapter_id)}</div>
      <div><h2>${escapeHtml(result.title)}</h2><p>${escapeHtml(result.public_summary)}</p></div>
      <a class="text-link" href="${BASE}results/${result.result_id.toLowerCase()}/">Open <span aria-hidden="true">→</span></a>
    </article>`).join('');
}

function emptyState(kind, hidden = false) {
  return `<div class="empty-state" data-empty-state${hidden ? ' hidden' : ''}>
    <div class="empty-state-inner">
      <span class="empty-state-index">0</span>
      <h2>No ${kind} are public yet.</h2>
      <p>The index is functioning and ready for reviewed records. Nothing is inferred from the empty state.</p>
    </div>
  </div>`;
}

function downloadCard(kicker, title, url, description) {
  const action = url
    ? `<a class="button button-dark" href="${escapeHtml(url)}">Download PDF</a>`
    : '<span class="disabled-action">Not yet released</span>';
  return `<article class="download-card ${url ? 'available' : 'unavailable'}">
    <p class="download-kicker">${escapeHtml(kicker)}</p>
    <h2>${escapeHtml(title)}</h2>
    <p>${escapeHtml(description)}</p>
    ${action}
  </article>`;
}

function downloadCards() {
  const cards = [downloadCard(
    'Complete edition',
    'Collected Works PDF',
    data.releases.complete_pdf,
    data.releases.complete_pdf ? 'Read the collection as a single edition.' : 'The single-volume reader edition has not yet been released.'
  )];
  for (const volume of data.volumes.volumes) {
    const url = data.releases.volume_pdfs[volume.id];
    cards.push(downloadCard(
      `Volume ${volume.id}`,
      volume.title,
      url,
      url ? `Read Volume ${volume.id} as a standalone edition.` : 'The volume PDF has not yet been released.'
    ));
  }
  return cards.join('');
}

function renderStaticPage(name, settings, extra = {}) {
  const source = replaceTokens(pageSource(name), {
    BASE,
    WORK_COUNT: publishedWorks.length,
    RESULT_COUNT: publishedResults.length,
    CHAPTER_COUNT: chapterCount,
    VOLUME_COUNT: data.volumes.volumes.length,
    VOLUME_CARDS: volumeCards(),
    WORK_CARDS: workCards(),
    RESULT_CARDS: resultCards(),
    WORK_EMPTY_STATE: emptyState('works', publishedWorks.length > 0),
    RESULT_EMPTY_STATE: emptyState('results', publishedResults.length > 0),
    DOWNLOAD_CARDS: downloadCards(),
    ...extra
  });
  write(settings.output, renderPage({ ...settings, content: source }));
}

fs.rmSync(DIST, { recursive: true, force: true });
fs.mkdirSync(DIST, { recursive: true });
fs.cpSync(path.join(ROOT, 'site-src/assets'), path.join(DIST, 'assets'), { recursive: true });
fs.mkdirSync(path.join(DIST, 'downloads'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'bibliography/collected-works.bib'), path.join(DIST, 'downloads/collected-works.bib'));
fs.mkdirSync(path.join(DIST, 'data'), { recursive: true });
for (const file of ['volumes.json', 'works.json', 'results.json', 'releases.json']) {
  fs.copyFileSync(path.join(ROOT, 'data', file), path.join(DIST, 'data', file));
}

renderStaticPage('home', {
  output: 'index.html',
  route: '',
  title: 'Biamonte Collected Works',
  description: 'A coherent, evidence-aware scholarly edition spanning mathematical structures, quantum dynamics and statistical inference.',
  pageId: 'home'
});

renderStaticPage('works', {
  output: 'works/index.html',
  route: 'works/',
  title: 'Works — Biamonte Collected Works',
  description: 'Version-aware index of the works included in the Biamonte Collected Works.',
  pageId: 'works'
});

renderStaticPage('results', {
  output: 'results/index.html',
  route: 'results/',
  title: 'Results — Biamonte Collected Works',
  description: 'Result-level evidence and formalization index for the Biamonte Collected Works.',
  pageId: 'results'
});

renderStaticPage('certification', {
  output: 'certification/index.html',
  route: 'certification/',
  title: 'Certification — Biamonte Collected Works',
  description: 'How source identity, analytic review, reproduction and Lean formalization are reported.',
  pageId: 'certification'
});

renderStaticPage('downloads', {
  output: 'downloads/index.html',
  route: 'downloads/',
  title: 'Downloads — Biamonte Collected Works',
  description: 'Bibliography, complete edition and volume downloads for the Biamonte Collected Works.',
  pageId: 'downloads'
});

renderStaticPage('about', {
  output: 'about/index.html',
  route: 'about/',
  title: 'About — Biamonte Collected Works',
  description: 'Purpose and editorial principles of the Biamonte Collected Works.',
  pageId: 'about'
});

const volumeIndex = `
  <section class="page-intro shell">
    <p class="eyebrow">Reading map</p>
    <h1>Volumes</h1>
    <p class="lede">Three linked volumes follow the conceptual movement from representations, through dynamics, to algorithms and inference.</p>
  </section>
  <section class="shell section-block"><div class="volume-grid">${volumeCards(2)}</div></section>`;

write('volumes/index.html', renderPage({
  route: 'volumes/',
  title: 'Volumes — Biamonte Collected Works',
  description: 'The three-volume reading architecture of the Biamonte Collected Works.',
  pageId: 'volumes',
  content: volumeIndex
}));

for (const volume of data.volumes.volumes) {
  const chapterRows = volume.chapters.map((chapter) => {
    const chapterSlug = chapter.id.toLowerCase().replace('.', '-');
    return `<article class="chapter-row" id="chapter-${escapeHtml(chapterSlug)}">
      <div class="chapter-id">${escapeHtml(chapter.id)}</div>
      <div>
        <h2>${escapeHtml(chapter.title)}</h2>
        <p>${escapeHtml(chapter.summary)}</p>
        <span class="chapter-state">Structure live · reader text not yet public</span><br>
        <a class="text-link" href="${BASE}volumes/${volume.slug}/${chapterSlug}/">Open chapter page <span aria-hidden="true">→</span></a>
      </div>
    </article>`;
  }).join('');

  const content = `<section class="page-intro shell">
      <p class="eyebrow">Volume ${escapeHtml(volume.id)}</p>
      <h1>${escapeHtml(volume.title)}</h1>
      <p class="lede">${escapeHtml(volume.arc)}</p>
    </section>
    <section class="shell volume-page-grid">
      <aside class="volume-aside">
        <p class="eyebrow">Public beta</p>
        <p>All ${volume.chapters.length} chapter routes are active. Reader text and result records will appear after review.</p>
        <a class="text-link" href="${BASE}downloads/">Edition downloads <span aria-hidden="true">→</span></a>
      </aside>
      <div class="chapter-list">${chapterRows}</div>
    </section>`;

  write(`volumes/${volume.slug}/index.html`, renderPage({
    route: `volumes/${volume.slug}/`,
    title: `${volume.title} — Biamonte Collected Works`,
    description: volume.arc,
    pageId: 'volumes',
    content
  }));

  for (const chapter of volume.chapters) {
    const chapterSlug = chapter.id.toLowerCase().replace('.', '-');
    const chapterWorks = publishedWorks.filter((work) => work.chapters.includes(chapter.id));
    const chapterResults = publishedResults.filter((result) => result.chapter_id === chapter.id);
    const chapterContent = `<section class="page-intro shell">
        <p class="eyebrow">Volume ${escapeHtml(volume.id)} · Chapter ${escapeHtml(chapter.id)}</p>
        <h1>${escapeHtml(chapter.title)}</h1>
        <p class="lede">${escapeHtml(chapter.summary)}</p>
      </section>
      <section class="shell section-block">
        <div class="metric-grid">
          <div class="metric"><strong>${chapterWorks.length}</strong><span>Public works</span></div>
          <div class="metric"><strong>${chapterResults.length}</strong><span>Public results</span></div>
          <div class="metric"><strong>${chapterResults.filter((result) => result.evidence_status === 'formally-verified').length}</strong><span>Lean certificates</span></div>
          <div class="metric"><strong>Beta</strong><span>Chapter state</span></div>
        </div>
      </section>
      <section class="shell note-panel">
        <h2>Reader text not yet public</h2>
        <p>This permanent chapter route is ready. It will receive reviewed exposition, source notes and result links without changing the surrounding site architecture.</p>
      </section>`;
    write(`volumes/${volume.slug}/${chapterSlug}/index.html`, renderPage({
      route: `volumes/${volume.slug}/${chapterSlug}/`,
      title: `${chapter.id} ${chapter.title} — Biamonte Collected Works`,
      description: chapter.summary,
      pageId: 'volumes',
      content: chapterContent
    }));
  }
}

for (const work of publishedWorks) {
  const relatedResults = publishedResults.filter((result) => result.work_id === work.work_id);
  const content = `<section class="page-intro shell">
      <p class="eyebrow">${escapeHtml(work.work_id)} · ${escapeHtml(work.year)}</p>
      <h1>${escapeHtml(work.title)}</h1>
      <p class="lede">${escapeHtml(work.authors.join(', '))}</p>
    </section>
    <section class="shell prose-grid section-block">
      <div><h2>Role in the collection</h2><p>${escapeHtml(work.public_summary)}</p></div>
      <div><h2>Public evidence state</h2><p>${escapeHtml(work.evidence_status.replaceAll('-', ' '))}. ${relatedResults.length} public result records.</p></div>
    </section>`;
  write(`works/${work.work_id.toLowerCase()}/index.html`, renderPage({
    route: `works/${work.work_id.toLowerCase()}/`,
    title: `${work.title} — Biamonte Collected Works`,
    description: work.public_summary,
    pageId: 'works',
    content
  }));
}

for (const result of publishedResults) {
  const work = publishedWorks.find((entry) => entry.work_id === result.work_id);
  const content = `<section class="page-intro shell">
      <p class="eyebrow">${escapeHtml(result.result_id)} · ${escapeHtml(result.chapter_id)}</p>
      <h1>${escapeHtml(result.title)}</h1>
      <p class="lede">${escapeHtml(result.public_summary)}</p>
    </section>
    <section class="shell prose-grid section-block">
      <div><h2>Source work</h2><p><a href="${BASE}works/${work.work_id.toLowerCase()}/">${escapeHtml(work.title)}</a></p></div>
      <div><h2>Evidence state</h2><p>${escapeHtml(result.evidence_status.replaceAll('-', ' '))}</p></div>
    </section>`;
  write(`results/${result.result_id.toLowerCase()}/index.html`, renderPage({
    route: `results/${result.result_id.toLowerCase()}/`,
    title: `${result.title} — Biamonte Collected Works`,
    description: result.public_summary,
    pageId: 'results',
    content
  }));
}

const notFoundContent = `<section class="page-intro shell">
  <p class="eyebrow">404</p>
  <h1>This route has not been populated.</h1>
  <p class="lede">The public beta is live, but the requested work, result or chapter may not yet be available.</p>
  <a class="button button-dark" href="${BASE}">Return home</a>
</section>`;

write('404.html', renderPage({
  route: '404.html',
  title: 'Not found — Biamonte Collected Works',
  description: 'The requested page is not available in the public beta.',
  pageId: '404',
  content: notFoundContent
}));

const sitemapRoutes = [
  '', 'volumes/', 'works/', 'results/', 'certification/', 'downloads/', 'about/',
  ...data.volumes.volumes.flatMap((volume) => [
    `volumes/${volume.slug}/`,
    ...volume.chapters.map((chapter) => `volumes/${volume.slug}/${chapter.id.toLowerCase().replace('.', '-')}/`)
  ]),
  ...publishedWorks.map((work) => `works/${work.work_id.toLowerCase()}/`),
  ...publishedResults.map((result) => `results/${result.result_id.toLowerCase()}/`)
];

write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapRoutes.map((route) => `  <url><loc>${routeUrl(route)}</loc></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${routeUrl('sitemap.xml')}\n`);
write('.nojekyll', '');

console.log(`Built ${sitemapRoutes.length} public routes in ${DIST}.`);
