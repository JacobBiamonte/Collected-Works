import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const PROHIBITED_PUBLIC_PATTERNS = [
  /\/Users\//,
  /app\.notion\.com/i,
  /worker_queue/i,
  /native receipt/i,
  /chatgpt pro/i,
  /paid balance/i
];

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), 'utf8'));
}

function fail(message, errors) {
  errors.push(message);
}

function collectFiles(directory) {
  const absolute = path.join(ROOT, directory);
  const files = [];
  if (!fs.existsSync(absolute)) return files;
  for (const entry of fs.readdirSync(absolute, { withFileTypes: true })) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...collectFiles(relative));
    else files.push(relative);
  }
  return files;
}

export function loadPublicData() {
  return {
    volumes: readJson('data/volumes.json'),
    works: readJson('data/works.json'),
    results: readJson('data/results.json'),
    releases: readJson('data/releases.json'),
    bibliography: fs.readFileSync(path.join(ROOT, 'bibliography/collected-works.bib'), 'utf8')
  };
}

export function validatePublicData(data = loadPublicData()) {
  const errors = [];
  const volumeIds = new Set();
  const chapterIds = new Set();
  const workIds = new Set();
  const resultIds = new Set();
  const evidenceStates = new Set([
    'source-aligned',
    'analytically-checked',
    'reproduced',
    'formally-verified'
  ]);
  const volumeSlugs = new Set();

  if (data.volumes.schema_version !== 1) fail('data/volumes.json must use schema_version 1.', errors);
  if (!Array.isArray(data.volumes.volumes) || data.volumes.volumes.length !== 3) {
    fail('Exactly three volumes are required.', errors);
  }

  for (const volume of data.volumes.volumes || []) {
    if (!['I', 'II', 'III'].includes(volume.id)) fail(`Unexpected volume id: ${volume.id}`, errors);
    if (volumeIds.has(volume.id)) fail(`Duplicate volume id: ${volume.id}`, errors);
    volumeIds.add(volume.id);
    if (!/^[a-z0-9-]+$/.test(volume.slug || '')) fail(`Volume ${volume.id} has an invalid slug.`, errors);
    if (volumeSlugs.has(volume.slug)) fail(`Duplicate volume slug: ${volume.slug}`, errors);
    volumeSlugs.add(volume.slug);
    if (!volume.title || !volume.arc) fail(`Volume ${volume.id} is missing required metadata.`, errors);
    if (!Array.isArray(volume.chapters) || volume.chapters.length !== 4) {
      fail(`Volume ${volume.id} must contain four chapters.`, errors);
    }
    for (const chapter of volume.chapters || []) {
      if (chapterIds.has(chapter.id)) fail(`Duplicate chapter id: ${chapter.id}`, errors);
      chapterIds.add(chapter.id);
      if (!chapter.id.startsWith(`${volume.id}.`)) fail(`Chapter ${chapter.id} does not belong to Volume ${volume.id}.`, errors);
      if (!chapter.title || !chapter.summary) fail(`Chapter ${chapter.id} is missing title or summary.`, errors);
    }
  }

  if (chapterIds.size !== 12) fail(`Expected 12 unique chapters; found ${chapterIds.size}.`, errors);

  if (data.works.schema_version !== 1 || !Array.isArray(data.works.works)) {
    fail('data/works.json must contain a schema_version 1 works array.', errors);
  }

  const bibEntryKeys = [];
  const bibEntryPattern = /@(?!comment\b|string\b|preamble\b)[a-z]+\s*\{\s*([^,\s}]+)/gi;
  for (const match of data.bibliography.matchAll(bibEntryPattern)) bibEntryKeys.push(match[1]);
  const bibKeySet = new Set(bibEntryKeys);
  if (bibKeySet.size !== bibEntryKeys.length) fail('collected-works.bib contains duplicate citation keys.', errors);

  for (const work of data.works.works || []) {
    if (!/^WORK-\d{4}$/.test(work.work_id || '')) fail(`Invalid work id: ${work.work_id}`, errors);
    if (workIds.has(work.work_id)) fail(`Duplicate work id: ${work.work_id}`, errors);
    workIds.add(work.work_id);
    for (const key of ['title', 'year', 'citation_key', 'public_summary', 'evidence_status']) {
      if (work[key] === undefined || work[key] === '') fail(`${work.work_id || 'Work'} is missing ${key}.`, errors);
    }
    if (!Array.isArray(work.authors) || work.authors.length === 0) fail(`${work.work_id} must have authors.`, errors);
    if (!Array.isArray(work.chapters) || work.chapters.length === 0) fail(`${work.work_id} must have at least one chapter.`, errors);
    for (const chapterId of work.chapters || []) {
      if (!chapterIds.has(chapterId)) fail(`${work.work_id} references unknown chapter ${chapterId}.`, errors);
      if (!chapterId.startsWith(`${work.volume}.`)) fail(`${work.work_id} assigns ${chapterId} outside Volume ${work.volume}.`, errors);
    }
    if (!volumeIds.has(work.volume)) fail(`${work.work_id} references unknown volume ${work.volume}.`, errors);
    if (!evidenceStates.has(work.evidence_status)) fail(`${work.work_id} has unsupported evidence status ${work.evidence_status}.`, errors);
    if (work.publish !== true) fail(`${work.work_id} is in the public dataset but publish is not true.`, errors);
    if (!bibKeySet.has(work.citation_key)) {
      fail(`${work.work_id} citation key ${work.citation_key} is absent from collected-works.bib.`, errors);
    }
  }

  const workCitationKeys = new Set((data.works.works || []).map((work) => work.citation_key));
  for (const key of bibKeySet) {
    if (!workCitationKeys.has(key)) fail(`BibTeX key ${key} has no matching public work record.`, errors);
  }

  if (data.results.schema_version !== 1 || !Array.isArray(data.results.results)) {
    fail('data/results.json must contain a schema_version 1 results array.', errors);
  }

  for (const result of data.results.results || []) {
    if (!/^RESULT-[A-Z0-9-]+$/.test(result.result_id || '')) fail(`Invalid result id: ${result.result_id}`, errors);
    if (resultIds.has(result.result_id)) fail(`Duplicate result id: ${result.result_id}`, errors);
    resultIds.add(result.result_id);
    if (!workIds.has(result.work_id)) fail(`${result.result_id} references unknown public work ${result.work_id}.`, errors);
    if (!chapterIds.has(result.chapter_id)) fail(`${result.result_id} references unknown chapter ${result.chapter_id}.`, errors);
    if (!result.title || !result.public_summary || !result.evidence_status) fail(`${result.result_id} is missing public content.`, errors);
    if (!evidenceStates.has(result.evidence_status)) fail(`${result.result_id} has unsupported evidence status ${result.evidence_status}.`, errors);
    if (result.publish !== true) fail(`${result.result_id} is in the public dataset but publish is not true.`, errors);
  }

  if (data.releases.schema_version !== 1) fail('data/releases.json must use schema_version 1.', errors);
  if (data.releases.complete_pdf !== null && typeof data.releases.complete_pdf !== 'string') {
    fail('complete_pdf must be null or a public URL.', errors);
  }
  for (const volumeId of volumeIds) {
    const release = data.releases.volume_pdfs?.[volumeId];
    if (release !== null && typeof release !== 'string') fail(`Volume ${volumeId} PDF must be null or a public URL.`, errors);
  }

  const publicFiles = [
    ...collectFiles('site-src'),
    ...collectFiles('data'),
    ...collectFiles('bibliography')
  ];
  for (const relativePath of publicFiles) {
    const text = fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
    for (const pattern of PROHIBITED_PUBLIC_PATTERNS) {
      if (pattern.test(text)) fail(`${relativePath} contains prohibited public text matching ${pattern}.`, errors);
    }
  }

  return {
    errors,
    counts: {
      volumes: volumeIds.size,
      chapters: chapterIds.size,
      works: workIds.size,
      results: resultIds.size
    }
  };
}

function main() {
  const report = validatePublicData();
  if (report.errors.length) {
    for (const error of report.errors) console.error(`ERROR: ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Validated ${report.counts.volumes} volumes, ${report.counts.chapters} chapters, ${report.counts.works} works and ${report.counts.results} results.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
