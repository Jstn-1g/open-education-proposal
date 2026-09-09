# Work on the community website

The site is plain HTML and CSS. Python 3.11 or newer assembles shared navigation and produces six static pages. There are no third-party build packages, client scripts, or package-install steps.

From this directory:

```sh
python -I -B -m unittest discover -s tests -v
python -I -B build.py
python -I -B -m http.server 8768 --bind 127.0.0.1 --directory .build
```

Open `http://127.0.0.1:8768/` locally. Stop the preview with Ctrl+C. The development server is not a production server.

## Editing and building

Edit the page fragments in `content/`, shared CSS in `styles.css`, or the shared frame in `build.py`. Rebuild to see a change. Keep the proposal and website wording consistent.

The homepage demo presents C1/C2 from `docs/REVIEW-CASES.md` using native HTML disclosures. It collects no answers and runs without scripts. Preserve provisional wording, visible draft/review status, and necessary-support safeguards. Each case has a screen disclosure and an equivalent print-only reasoning block, because closed disclosures do not print reliably across browsers. Tests require both copies to match the source interpretation and uncertainty; keep all three together when making an approved content change. The print copy is excluded from screen display and the screen accessibility tree.

The build writes only a dedicated output directory, refuses unrelated existing files, and records SHA-256 digests in `manifest.json`. It does not delete files. Outputs exclude source documents and tools except for three public license/attribution notices and the explicitly selected `docs/REVIEW-CASES.md`, copied byte-for-byte as `help-and-access-draft.md`. Edit that source file, not the generated download; its status, sources, and attribution must travel with the offline copy.

For a project website, specify the actual project path at build time:

```sh
python -I -B build.py --base /open-education-proposal/
```

Serve that output at the matching path. Building does not publish anything. Navigation and the 404 page use the same base.

## Browser review

If Playwright and its Chromium browser are already installed, run:

```sh
node tests/browser.mjs http://127.0.0.1:8768/
```

The optional `PLAYWRIGHT_MODULE_PATH` environment variable may point to an existing Playwright `index.mjs`; `PLAYWRIGHT_CHANNEL=msedge` selects an existing Microsoft Edge installation. No browser testing dependency is included in the site or installed by this script. The optional second argument writes screenshots to a local review directory.

At each width, the check activates the editable-draft download from both the demo and open-source page, verifies its suggested filename, and matches its bytes to the build manifest. Source-byte identity is checked separately by the static suite. It also opens and closes both demo cases by keyboard and pointer, checks contextual names and native expanded states in the accessibility tree, and checks that printed reasoning remains visible even if a case was never opened. These are scripted browser checks, not testing with a screen-reader user.

The browser check covers six pages at three widths with site JavaScript disabled, keyboard skip links, first-party-only requests, text enlargement/spacing with forced colors, and basic print-media layout. Print assertions check heading keep rules and the block footer used to avoid a known fragmentation problem; actual Letter/A4 page boundaries still need visual review after layout or substantial content changes. It also checks main landmarks, level-one headings, and nonempty link names in Chromium's accessibility tree. Static checks cover links, headings, output limits, and reproducible bytes. These checks do not establish full accessibility conformance. A screen-reader review and evaluation by people with access needs remain valuable.

## Release limits

The builder reads the release state from `release.json`. Candidate builds use an unreleased banner and request no indexing. Ready builds identify v0.1.0 and allow indexing of normal pages; the 404 page remains non-indexable. Neither state enables hosting, contributions, or license grants. `noindex` is a search-engine request, not access control; bind previews to loopback.

`python -I -B release_check.py` checks publication consistency. A candidate or incomplete release must exit with status 1; do not bypass that guard. A passing check does not prove live hosting or inbox delivery. See [publishing instructions](docs/PUBLISHING.md) for configuration and the separate manual Pages workflow.
