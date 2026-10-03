# Biamonte Collected Works — public site

This repository is the public, reader-facing shell for the Biamonte Collected Works. It is intentionally separate from the private validation repository.

The site is functional before the corpus is populated: it provides the three-volume reading map, stable routes, evidence and Lean-status definitions, bibliography download, search and filter controls, explicit empty states, and a GitHub Pages deployment pipeline.

## Current public scope

- Three volumes and twelve planned chapters.
- Zero published works and zero published results.
- No private source manuscripts, publisher PDFs, audit receipts, worker logs, or unresolved correction dossiers.
- `bibliography/collected-works.bib` is a deliberately empty public-beta bibliography until reviewed records are exported.

## Local build

```sh
npm run validate
npm run build
npm test
python3 -m http.server 8000 --directory dist
```

Open `http://localhost:8000/`.

For the GitHub project-site base path:

```sh
node scripts/build.mjs \
  --base /Biamonte-Collected-Works-site/ \
  --url https://jacobbiamonte.github.io
```

## Population workflow

1. Add a reviewed public record to `data/works.json`.
2. Add associated result records to `data/results.json` when appropriate.
3. Add the matching BibTeX entry to `bibliography/collected-works.bib`.
4. Run validation, build and smoke tests.
5. Review the exact `dist/` artifact before publication.

The public status model is result-level. A bounded check does not certify a whole paper, and Lean status applies only to the exact encoded statement named by a record.
