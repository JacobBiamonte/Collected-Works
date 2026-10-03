import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPublicData, PROHIBITED_PUBLIC_PATTERNS, validatePublicData } from '../scripts/validate.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const errors = [];

const expected = [
  'index.html',
  '404.html',
  'assets/site.css',
  'assets/site.js',
  'works/index.html',
  'results/index.html',
  'volumes/index.html',
  'certification/index.html',
  'downloads/index.html',
  'downloads/collected-works.bib',
  'about/index.html',
  'sitemap.xml',
  'robots.txt',
  '.nojekyll'
];

for (const relativePath of expected) {
  if (!fs.existsSync(path.join(DIST, relativePath))) errors.push(`Missing ${relativePath}`);
}

function collect(directory) {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collect(fullPath));
    else files.push(fullPath);
  }
  return files;
}

if (fs.existsSync(DIST)) {
  for (const file of collect(DIST)) {
    if (!/\.(html|css|js|json|xml|txt|bib)$/.test(file) && path.basename(file) !== '.nojekyll') continue;
    const text = fs.readFileSync(file, 'utf8');
    if (text.includes('{{')) errors.push(`Unresolved template token in ${path.relative(DIST, file)}`);
    for (const pattern of PROHIBITED_PUBLIC_PATTERNS) {
      if (pattern.test(text)) errors.push(`Prohibited public text in ${path.relative(DIST, file)} matching ${pattern}`);
    }
  }
}

const homepage = fs.existsSync(path.join(DIST, 'index.html')) ? fs.readFileSync(path.join(DIST, 'index.html'), 'utf8') : '';
if (!homepage.includes('Built for proof and discovery.')) errors.push('Homepage proof-and-discovery mission is missing.');
const data = loadPublicData();
const publicWorkCount = data.works.works.filter((work) => work.publish).length;
const publicResultCount = data.results.results.filter((result) => result.publish).length;
if (!homepage.includes(`${publicWorkCount} source works · ${publicResultCount} result records`)) errors.push('Homepage/footer public counts are incorrect.');
for (const volume of data.volumes.volumes) {
  if (!homepage.includes(volume.title)) errors.push(`Homepage is missing volume title ${volume.title}.`);
  for (const result of volume.featured_results) {
    if (!homepage.includes(result.name)) errors.push(`Homepage is missing featured result ${result.name}.`);
  }
}
if (!homepage.includes('topic-tag')) errors.push('Homepage topic tags are missing.');
if (homepage.includes('wordmark-mark')) errors.push('Removed wordmark logo is still present.');
if (homepage.includes('hero-figure') || homepage.includes('collection-map-title')) errors.push('Removed hero figure is still present.');
if (!homepage.includes('editorial reading map; certification records remain separate')) errors.push('Homepage editorial/certification distinction is missing.');
if (!homepage.includes('certify every formalizable mathematical result in Lean')) errors.push('Homepage Lean-certification objective is missing.');
if (!homepage.includes('A Lean-certified mathematical record, result by result.')) errors.push('Homepage formal objective heading is missing.');
if (!homepage.includes('frontier-model-assisted searches')) errors.push('Homepage result-discovery objective is missing.');
if (homepage.includes('honest while empty')) errors.push('Defensive empty-state headline is still present.');

const certificationPage = fs.existsSync(path.join(DIST, 'certification/index.html')) ? fs.readFileSync(path.join(DIST, 'certification/index.html'), 'utf8') : '';
if (!certificationPage.includes('formally checked counterpart for every formalizable mathematical result')) errors.push('Certification page Lean objective is missing.');
if (!certificationPage.includes('no <code>sorry</code> or unproved new axioms')) errors.push('Certification page proof-obligation language is missing.');

const resultsPage = fs.existsSync(path.join(DIST, 'results/index.html')) ? fs.readFileSync(path.join(DIST, 'results/index.html'), 'utf8') : '';
if (!resultsPage.includes('Result database') || !resultsPage.includes('frontier models')) errors.push('Result database mission is missing.');

const downloadsPage = fs.existsSync(path.join(DIST, 'downloads/index.html')) ? fs.readFileSync(path.join(DIST, 'downloads/index.html'), 'utf8') : '';
if (!downloadsPage.includes('data/results.json') || !downloadsPage.includes('Machine-readable corpus')) errors.push('Machine-readable corpus download is missing.');

const siteScript = fs.existsSync(path.join(DIST, 'assets/site.js')) ? fs.readFileSync(path.join(DIST, 'assets/site.js'), 'utf8') : '';
if (!siteScript.includes("document.documentElement.classList.add('js')")) errors.push('Progressive-enhancement navigation hook is missing.');

const canonicalMatch = homepage.match(/<link rel="canonical" href="([^"]+)">/);
if (!canonicalMatch) {
  errors.push('Homepage canonical URL is missing.');
} else {
  const canonical = new URL(canonicalMatch[1]);
  const basePath = canonical.pathname.endsWith('/') ? canonical.pathname : `${canonical.pathname}/`;
  if (!homepage.includes(`href="${basePath}assets/site.css"`)) errors.push('Homepage stylesheet does not use the configured base path.');
  if (!homepage.includes(`src="${basePath}assets/site.js"`)) errors.push('Homepage script does not use the configured base path.');
  for (const route of ['volumes/', 'works/', 'results/', 'certification/', 'downloads/', 'about/']) {
    if (!homepage.includes(`href="${basePath}${route}"`)) errors.push(`Homepage route ${route} does not use the configured base path.`);
  }

  const sitemap = fs.existsSync(path.join(DIST, 'sitemap.xml')) ? fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8') : '';
  const locations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  if (!locations.length) errors.push('Sitemap contains no locations.');
  for (const location of locations) {
    const url = new URL(location);
    if (url.origin !== canonical.origin || !url.pathname.startsWith(basePath)) {
      errors.push(`Sitemap location is outside the configured site: ${location}`);
      continue;
    }
    const relative = decodeURIComponent(url.pathname.slice(basePath.length));
    const generatedPath = relative === '' ? 'index.html' : relative.endsWith('/') ? `${relative}index.html` : relative;
    if (!fs.existsSync(path.join(DIST, generatedPath))) errors.push(`Sitemap location has no generated file: ${location}`);
  }
}

for (const volume of data.volumes.volumes) {
  const canonicalVolume = path.join(DIST, 'volumes', volume.slug, 'index.html');
  if (!fs.existsSync(canonicalVolume)) errors.push(`Missing canonical volume page for ${volume.slug}.`);
  for (const chapter of volume.chapters) {
    const chapterSlug = chapter.id.toLowerCase().split('.').join('-');
    if (!fs.existsSync(path.join(DIST, 'volumes', volume.slug, chapterSlug, 'index.html'))) {
      errors.push(`Missing canonical chapter page for ${volume.slug}/${chapterSlug}.`);
    }
  }
  for (const alias of volume.aliases) {
    const aliasVolume = path.join(DIST, 'volumes', alias, 'index.html');
    if (!fs.existsSync(aliasVolume)) errors.push(`Missing volume redirect for ${alias}.`);
    else if (!fs.readFileSync(aliasVolume, 'utf8').includes(`/volumes/${volume.slug}/`)) errors.push(`Volume redirect ${alias} has the wrong target.`);
    for (const chapter of volume.chapters) {
      const chapterSlug = chapter.id.toLowerCase().split('.').join('-');
      const aliasChapter = path.join(DIST, 'volumes', alias, chapterSlug, 'index.html');
      if (!fs.existsSync(aliasChapter)) errors.push(`Missing chapter redirect for ${alias}/${chapterSlug}.`);
      else if (!fs.readFileSync(aliasChapter, 'utf8').includes(`/volumes/${volume.slug}/${chapterSlug}/`)) errors.push(`Chapter redirect ${alias}/${chapterSlug} has the wrong target.`);
    }
  }

  const volumePage = fs.existsSync(canonicalVolume) ? fs.readFileSync(canonicalVolume, 'utf8') : '';
  if (!volumePage.includes('Formal public evidence records will appear separately after review.')) {
    errors.push(`Volume ${volume.id} is missing the editorial/certification disclaimer.`);
  }
}

const badChapterData = structuredClone(data);
badChapterData.volumes.volumes[0].featured_results[0].chapter_id = 'II.1';
if (!validatePublicData(badChapterData).errors.some((error) => error.includes('references unknown chapter'))) {
  errors.push('Validator did not reject a featured result assigned outside its volume.');
}

const duplicateRouteData = structuredClone(data);
duplicateRouteData.volumes.volumes[1].aliases = [duplicateRouteData.volumes.volumes[0].slug];
if (!validatePublicData(duplicateRouteData).errors.some((error) => error.includes('Duplicate volume route or alias'))) {
  errors.push('Validator did not reject a colliding legacy route.');
}

const unknownTagData = structuredClone(data);
unknownTagData.volumes.volumes[2].featured_results[0].tags = ['Unknown topic'];
if (!validatePublicData(unknownTagData).errors.some((error) => error.includes('references unknown topic tag'))) {
  errors.push('Validator did not reject an unknown featured-result topic tag.');
}

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log(`Smoke tests passed across ${collect(DIST).length} generated files.`);
