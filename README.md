# Biamonte Collected Works — public site

This repository is the public, reader-facing home of the Biamonte Collected Works. The project has two connected aims:

- produce a source-mapped Lean-certified counterpart for every formalizable mathematical result in the corpus;
- build a structured result database that supports human and frontier-model-assisted exploration of connections, conjectures and extensions.

The public repository is intentionally separate from the private validation record. The site is functional before the corpus is populated: it provides the three-volume reading map, stable result and source routes, certification definitions, machine-readable data, bibliography download, search and filter controls, and a GitHub Pages deployment pipeline.

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

The public status model is result-level. A bounded check does not certify a whole paper, and Lean status applies only to the exact encoded statement named by a record. Connections and extensions proposed with frontier models remain research candidates until they pass source review, mathematical checking and the appropriate certification or reproduction track.
