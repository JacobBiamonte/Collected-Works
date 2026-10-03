import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'pages-dist');
const PREFIX = '/Biamonte-Collected-Works/';
const read = (route) => fs.readFileSync(path.join(OUTPUT, route), 'utf8');
const homepage = read(`${PREFIX}index.html`);
const canonical = new URL(homepage.match(/<link rel="canonical" href="([^"]+)">/)[1]);
assert.equal(canonical.pathname, PREFIX);
assert(homepage.includes('Jacob Biamonte'));
assert(homepage.includes('og:site_name" content="Biamonte Collected Works"'));
assert(read('robots.txt').includes(`Sitemap: ${canonical.href}sitemap.xml`));

const sitemap = read(`${PREFIX}sitemap.xml`);
for (const [, location] of sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)) {
  const url = new URL(location);
  assert.equal(url.origin, canonical.origin);
  assert(url.pathname.startsWith(PREFIX));
  const file = url.pathname.endsWith('/') ? `${url.pathname}index.html` : url.pathname;
  const page = read(file);
  assert(page.includes(`<link rel="canonical" href="${location}">`));
  for (const [, asset] of page.matchAll(/(?:href|src)="(\/[^"#?]+)"/g)) {
    const target = asset.endsWith('/') ? `${asset}index.html` : asset;
    assert(fs.existsSync(path.join(OUTPUT, target)), `Broken mounted link: ${target}`);
  }
  for (const prefix of ['Collected-Works', 'Biamonte-Collected-Works-site']) {
    const redirect = read(`/${prefix}/${file.slice(PREFIX.length)}`);
    assert(redirect.includes(`<meta http-equiv="refresh" content="0; url=${location}">`));
    assert(redirect.includes(`<link rel="canonical" href="${location}">`));
    let destination;
    vm.runInNewContext(redirect.match(/<script>([\s\S]+?)<\/script>/)[1], {
      URL,
      location: { search: '?topic=quantum', hash: '#selected-results', replace: (value) => { destination = value; } }
    });
    assert.equal(destination, `${location}?topic=quantum#selected-results`);
  }
}

assert(read('index.html').includes(`content="0; url=${canonical.href}"`));
assert(read('404.html').includes('name="robots" content="noindex"'));
for (const prefix of ['Collected-Works', 'Biamonte-Collected-Works-site']) {
  for (const file of ['data/results.json', 'downloads/collected-works.bib']) {
    assert.equal(read(`${prefix}/${file}`), read(`${PREFIX}${file}`));
  }
}
console.log('Deployment checks passed: branded URLs, assets, canonical sitemap and legacy redirects.');
