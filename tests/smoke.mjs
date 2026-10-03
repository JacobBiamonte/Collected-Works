import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadPublicData, PROHIBITED_PUBLIC_PATTERNS } from '../scripts/validate.mjs';

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
if (!homepage.includes('architecture live')) errors.push('Homepage beta state is missing.');
const data = loadPublicData();
const publicWorkCount = data.works.works.filter((work) => work.publish).length;
const publicResultCount = data.results.results.filter((result) => result.publish).length;
if (!homepage.includes(`${publicWorkCount} works and ${publicResultCount} results published`)) errors.push('Homepage/footer public counts are incorrect.');

const canonicalMatch = homepage.match(/<link rel="canonical" href="([^"]+)">/);
if (!canonicalMatch) {
  errors.push('Homepage canonical URL is missing.');
} else {
  const canonical = new URL(canonicalMatch[1]);
  const basePath = canonical.pathname.endsWith('/') ? canonical.pathname : `${canonical.pathname}/`;
  if (!homepage.includes(`href="${basePath}assets/site.css"`)) errors.push('Homepage stylesheet does not use the configured base path.');

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

const volumePages = fs.existsSync(path.join(DIST, 'volumes'))
  ? collect(path.join(DIST, 'volumes')).filter((file) => path.basename(file) === 'index.html')
  : [];
if (volumePages.length !== 16) errors.push(`Expected 16 volume and chapter index pages; found ${volumePages.length}.`);

if (errors.length) {
  for (const error of errors) console.error(`ERROR: ${error}`);
  process.exit(1);
}

console.log(`Smoke tests passed across ${collect(DIST).length} generated files.`);
