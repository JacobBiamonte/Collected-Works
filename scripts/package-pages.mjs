import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(ROOT, 'dist');
const OUTPUT = path.join(ROOT, 'pages-dist');
const PREFIX = 'Biamonte-Collected-Works';
const LEGACY_PREFIXES = ['Collected-Works', 'Biamonte-Collected-Works-site'];
const homepage = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const canonical = new URL(homepage.match(/<link rel="canonical" href="([^"]+)">/)[1]);
if (canonical.pathname !== `/${PREFIX}/`) {
  throw new Error(`Build with --base /${PREFIX}/ before packaging GitHub Pages.`);
}

function files(directory, relative = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const next = path.join(relative, entry.name);
    return entry.isDirectory() ? files(path.join(directory, entry.name), next) : [next];
  });
}

function write(relative, content) {
  const destination = path.join(OUTPUT, relative);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.writeFileSync(destination, content);
}

function redirect(target) {
  const escaped = target.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;');
  const scriptTarget = JSON.stringify(target).replaceAll('<', '\\u003c');
  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Biamonte Collected Works</title>
<link rel="canonical" href="${escaped}">
<meta http-equiv="refresh" content="0; url=${escaped}">
<script>const target = new URL(${scriptTarget}); target.search = location.search; target.hash = location.hash; location.replace(target.href);</script>
</head><body><p>Continue to <a href="${escaped}">Biamonte Collected Works</a>.</p></body></html>\n`;
}

// Only this generated artifact directory is replaced; source and dist remain intact.
fs.rmSync(OUTPUT, { recursive: true, force: true });
fs.mkdirSync(OUTPUT, { recursive: true });
fs.cpSync(DIST, path.join(OUTPUT, PREFIX), { recursive: true });
write('index.html', redirect(canonical.href));
write('.nojekyll', '');
write('robots.txt', `User-agent: *\nAllow: /\nSitemap: ${canonical.href}sitemap.xml\n`);
write('sitemap.xml', fs.readFileSync(path.join(DIST, 'sitemap.xml'), 'utf8'));
write('404.html', fs.readFileSync(path.join(DIST, '404.html'), 'utf8').replace('</head>', '<meta name="robots" content="noindex">\n</head>'));

for (const prefix of LEGACY_PREFIXES) {
  for (const file of files(DIST)) {
    if (file.endsWith('.html')) {
      if (file === '404.html') continue;
      const source = fs.readFileSync(path.join(DIST, file), 'utf8');
      const target = source.match(/<link rel="canonical" href="([^"]+)">/)[1];
      write(path.join(prefix, file), redirect(target));
    } else {
      // Preserve existing direct links to data, bibliography and static assets.
      const destination = path.join(OUTPUT, prefix, file);
      fs.mkdirSync(path.dirname(destination), { recursive: true });
      fs.copyFileSync(path.join(DIST, file), destination);
    }
  }
}

console.log(`Packaged ${canonical.href} with matching redirects from both previous paths.`);
