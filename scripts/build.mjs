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

function chapterRouteSlug(chapterId) {
  return chapterId.toLowerCase().replaceAll('.', '-');
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

function topicTags(volume, labels = volume.tags.map((tag) => tag.label)) {
  const tones = new Map(volume.tags.map((tag) => [tag.label, tag.tone]));
  return `<div class="tag-list">${labels.map((label) => `<span class="topic-tag tone-${escapeHtml(tones.get(label))}">${escapeHtml(label)}</span>`).join('')}</div>`;
}

function featuredResultNames(volume) {
  return `<ul class="featured-list">${volume.featured_results.map((result) => `<li>${escapeHtml(result.name)}</li>`).join('')}</ul>`;
}

function featuredResultCards(volume) {
  return volume.featured_results.map((result) => `<article class="featured-result-card">
    ${topicTags(volume, result.tags)}
    <p class="result-chapter">Chapter ${escapeHtml(result.chapter_id)}</p>
    <h3>${escapeHtml(result.name)}</h3>
    <p>${escapeHtml(result.summary)}</p>
  </article>`).join('');
}

function volumeCards(headingLevel = 3) {
  return data.volumes.volumes.map((volume) => `
    <article class="volume-card">
      <div class="volume-number">${escapeHtml(volume.id)}</div>
      <h${headingLevel}>${escapeHtml(volume.title)}</h${headingLevel}>
      ${topicTags(volume)}
      <p>${escapeHtml(volume.arc)}</p>
      <p class="result-map-label">Selected result lines</p>
      ${featuredResultNames(volume)}
      <a class="text-link" href="${BASE}volumes/${escapeHtml(volume.slug)}/" aria-label="Read the map for ${escapeHtml(volume.title)}">Read the map <span aria-hidden="true">→</span></a>
    </article>`).join('');
}

function workCards() {
  return publishedWorks.map((work) => `
    <article class="index-card" data-filter-item data-search="${escapeHtml([work.work_id, work.title, ...work.authors, work.public_summary].join(' '))}" data-volume="${escapeHtml(work.volume)}" data-status="${escapeHtml(work.evidence_status)}">
      <div class="index-card-meta">${escapeHtml(work.work_id)}<br>${escapeHtml(work.year)}</div>
      <div><h2>${escapeHtml(work.title)}</h2><p>${escapeHtml(work.authors.join(', '))}</p></div>
      <a class="text-link" href="${BASE}works/${work.work_id.toLowerCase()}/" aria-label="Open ${escapeHtml(work.title)}">Open <span aria-hidden="true">→</span></a>
    </article>`).join('');
}

function resultCards() {
  return publishedResults.map((result) => `
    <article class="index-card" data-filter-item data-search="${escapeHtml([result.result_id, result.title, result.work_id, result.chapter_id, result.public_summary].join(' '))}" data-volume="${escapeHtml(result.chapter_id.split('.')[0])}" data-status="${escapeHtml(result.evidence_status)}">
      <div class="index-card-meta">${escapeHtml(result.result_id)}<br>${escapeHtml(result.chapter_id)}</div>
      <div><h2>${escapeHtml(result.title)}</h2><p>${escapeHtml(result.public_summary)}</p></div>
      <a class="text-link" href="${BASE}results/${result.result_id.toLowerCase()}/" aria-label="Open ${escapeHtml(result.title)}">Open <span aria-hidden="true">→</span></a>
    </article>`).join('');
}

function emptyState(kind, hidden = false) {
  return `<div class="empty-state" data-empty-state${hidden ? ' hidden' : ''}>
    <div class="empty-state-inner">
      <span class="empty-state-index">0</span>
      <h2>The first reviewed ${kind} are in preparation.</h2>
      <p>The database and filters are ready. Public records will appear after source alignment and review.</p>
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

function writeRedirect(aliasRoute, targetRoute) {
  const target = `${BASE}${targetRoute}`;
  write(`${aliasRoute}index.html`, `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="robots" content="noindex">
  <meta http-equiv="refresh" content="0; url=${escapeHtml(target)}">
  <link rel="canonical" href="${routeUrl(targetRoute)}">
  <title>Moved — Biamonte Collected Works</title>
</head>
<body><p>This page has moved to <a href="${escapeHtml(target)}">${escapeHtml(target)}</a>.</p></body>
</html>`);
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
  description: 'A Lean-certification program and structured result database for proof, connection and discovery across mathematical disciplines.',
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
  description: 'A structured database of source-mapped results, Lean status, dependencies, connections and research extensions.',
  pageId: 'results'
});

renderStaticPage('certification', {
  output: 'certification/index.html',
  route: 'certification/',
  title: 'Certification — Biamonte Collected Works',
  description: 'How the Biamonte Collected Works certifies formalizable mathematical results in Lean.',
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
  description: 'The proof-and-discovery mission of the Biamonte Collected Works.',
  pageId: 'about'
});

const volumeIndex = `
  <section class="page-intro shell">
    <p class="eyebrow">Reading map</p>
    <h1>Volumes</h1>
    <p class="lede">Three linked volumes move from Hamiltonian logic and tensor structure, through quantum and stochastic dynamics, to algorithms and inference.</p>
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
    const chapterSlug = chapterRouteSlug(chapter.id);
    return `<article class="chapter-row" id="chapter-${escapeHtml(chapterSlug)}">
      <div class="chapter-id">${escapeHtml(chapter.id)}</div>
      <div>
        <h2>${escapeHtml(chapter.title)}</h2>
        <p>${escapeHtml(chapter.summary)}</p>
        <span class="chapter-state">Mapped · exposition in preparation</span><br>
        <a class="text-link" href="${BASE}volumes/${volume.slug}/${chapterSlug}/" aria-label="Open chapter ${escapeHtml(chapter.id)}: ${escapeHtml(chapter.title)}">Open chapter page <span aria-hidden="true">→</span></a>
      </div>
    </article>`;
  }).join('');

  const content = `<section class="page-intro shell">
      <p class="eyebrow">Volume ${escapeHtml(volume.id)}</p>
      <h1>${escapeHtml(volume.title)}</h1>
      <p class="lede">${escapeHtml(volume.arc)}</p>
      ${topicTags(volume)}
    </section>
    <section class="shell result-map-section" id="selected-results">
      <div class="section-heading narrow-heading">
        <p class="eyebrow">Selected result lines</p>
        <h2>What defines this volume.</h2>
        <p>These names form the editorial reading map. Formal public evidence records will appear separately after review.</p>
      </div>
      <div class="featured-result-grid">${featuredResultCards(volume)}</div>
    </section>
    <section class="shell volume-page-grid">
      <aside class="volume-aside">
        <p class="eyebrow">Edition status</p>
        <p>This volume's ${volume.chapters.length} chapters and selected result map are public. Source-linked result records and reader text are in preparation.</p>
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

  for (const alias of volume.aliases) {
    writeRedirect(`volumes/${alias}/`, `volumes/${volume.slug}/`);
  }

  for (const chapter of volume.chapters) {
    const chapterSlug = chapterRouteSlug(chapter.id);
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
          <div class="metric"><strong>Mapped</strong><span>Chapter state</span></div>
        </div>
      </section>
      <section class="shell note-panel">
        <h2>Chapter record in preparation</h2>
        <p>This page will connect reviewed exposition, source works, exact result statements, dependencies, Lean certificates and related research questions.</p>
      </section>`;
    write(`volumes/${volume.slug}/${chapterSlug}/index.html`, renderPage({
      route: `volumes/${volume.slug}/${chapterSlug}/`,
      title: `${chapter.id} ${chapter.title} — Biamonte Collected Works`,
      description: chapter.summary,
      pageId: 'volumes',
      content: chapterContent
    }));
    for (const alias of volume.aliases) {
      writeRedirect(`volumes/${alias}/${chapterSlug}/`, `volumes/${volume.slug}/${chapterSlug}/`);
    }
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
  <h1>This page is not in the current edition.</h1>
  <p class="lede">The address may be outdated, or the requested work, result or chapter has not yet been published.</p>
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
    ...volume.chapters.map((chapter) => `volumes/${volume.slug}/${chapterRouteSlug(chapter.id)}/`)
  ]),
  ...publishedWorks.map((work) => `works/${work.work_id.toLowerCase()}/`),
  ...publishedResults.map((result) => `results/${result.result_id.toLowerCase()}/`)
];

write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapRoutes.map((route) => `  <url><loc>${routeUrl(route)}</loc></url>`).join('\n')}\n</urlset>\n`);
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${routeUrl('sitemap.xml')}\n`);
write('.nojekyll', '');

console.log(`Built ${sitemapRoutes.length} public routes in ${DIST}.`);
