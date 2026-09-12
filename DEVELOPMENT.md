# Work on the community website

The site is statically hosted HTML, CSS and JavaScript. Python 3.11 or newer assembles reading pages and copies an exact allowlist of interactive assets. The local site build needs no third-party packages or installation step; the separate browser-check workflow installs its declared test tooling. The optional Phaser 3.90.0 renderer is vendored under MIT; project calculations and controls also work in Simple view without it.

From this directory:

```sh
python -I -B -m unittest discover -s tests -v
python -I -B build.py
python -I -B -m http.server 8768 --bind 127.0.0.1 --directory .build
```

Open `http://127.0.0.1:8768/` locally. Keep the server running and use a second terminal in this directory for the browser checks below. Stop the preview with Ctrl+C. The development server is not a production server.

## Editing and building

Edit the page fragments in `content/`, shared CSS in `styles.css`, or the shared frame in `build.py`. Rebuild to see a change. Keep the proposal and website wording consistent.

The discussion page presents C1/C2 from `docs/REVIEW-CASES.md` using native HTML disclosures. It collects no answers and runs without scripts. Preserve provisional wording, visible draft/review status, and necessary-support safeguards. Each case has a screen disclosure and an equivalent print-only reasoning block, because closed disclosures do not print reliably across browsers. Tests require both copies to match the source interpretation and uncertainty; keep all three together when making an approved content change. The print copy is excluded from screen display and the screen accessibility tree.

The build writes only a dedicated output directory, refuses unrelated existing files, and records SHA-256 digests in `manifest.json`. It does not delete files. Outputs exclude source documents and tools except for three public license/attribution notices and the explicitly selected `docs/REVIEW-CASES.md`, copied byte-for-byte as `help-and-access-draft.md`. Edit that source file, not the generated download; its status, sources, and attribution must travel with the offline copy.

For a project-path preview, build into a dedicated directory named for the project, then serve its parent. Resolve the output to an absolute path first: the builder's source-directory check rejects a relative `../...` output when invoked from the repository root.

In PowerShell, from the repository root:

```powershell
$educationPreviewRoot = python -I -B -c "from pathlib import Path; print(Path('../open-education-project-preview').resolve())"
python -I -B build.py --base /open-education-proposal/ --output "$educationPreviewRoot/open-education-proposal"
python -I -B -m http.server 8769 --bind 127.0.0.1 --directory "$educationPreviewRoot"
```

In a POSIX shell, from the repository root:

```sh
education_preview_root="$(python -I -B -c 'from pathlib import Path; print(Path("../open-education-project-preview").resolve())')"
python -I -B build.py --base /open-education-proposal/ --output "$education_preview_root/open-education-proposal"
python -I -B -m http.server 8769 --bind 127.0.0.1 --directory "$education_preview_root"
```

Open `http://127.0.0.1:8769/open-education-proposal/`. Serving the parent makes the generated project directory reachable at the same prefix used by its links; changing `--base` alone does not mount that URL path. The output directory is outside the source repository and must be absent or contain an unmodified build recognized by this builder. Existing unrelated or edited output is preserved. Building does not publish anything. Navigation and the 404 page use the same base.

## Browser review

With Node 22 and an existing Playwright/Chromium installation, run these from the repository root in a second terminal while the root preview on port 8768 is running:

```sh
node tests/browser.mjs http://127.0.0.1:8768/ ../open-education-review/root-reading
node tests/learning-lab-browser.mjs http://127.0.0.1:8768/ ../open-education-review/root-learning-lab
node tests/activity-studio-browser.mjs http://127.0.0.1:8768/ ../open-education-review/root-studio
```

For the project-path server on port 8769, use its full base URL, including the trailing slash:

```sh
node tests/browser.mjs http://127.0.0.1:8769/open-education-proposal/ ../open-education-review/project-reading
node tests/learning-lab-browser.mjs http://127.0.0.1:8769/open-education-proposal/ ../open-education-review/project-learning-lab
node tests/activity-studio-browser.mjs http://127.0.0.1:8769/open-education-proposal/ ../open-education-review/project-studio
```

The optional `PLAYWRIGHT_MODULE_PATH` environment variable may point to an existing Playwright `index.mjs`; `PLAYWRIGHT_CHANNEL=msedge` selects an existing Microsoft Edge installation. No browser testing dependency is included in the site or installed by these scripts. The second arguments above keep generated review files outside the source repository; the reading-page script prints its summary to the terminal.

These three browser scripts are intentionally loopback-only: use the local HTTP server, not the public GitHub Pages address. Their passes do not verify the deployed website. After publication, separately check the actual HTTPS routes, downloads and deployed commit as described in [publishing instructions](docs/PUBLISHING.md); do not remove the scripts' local-only checks to point them at the public host.

At each width, the reading-page check activates the editable-draft download from both the discussion and open-source page, verifies its suggested filename, and matches its bytes to the build manifest. Source-byte identity is checked separately by the static suite. It also opens and closes both demo cases by keyboard and pointer, checks contextual names and native expanded states in the accessibility tree, and checks that printed reasoning remains visible even if a case was never opened. These are scripted browser checks, not testing with a screen-reader user.

The browser check covers the reading pages at three widths with site JavaScript disabled, keyboard skip links, first-party-only requests, text enlargement/spacing with forced colors, and basic print-media layout. Print assertions check heading keep rules and the block footer used to avoid a known fragmentation problem; actual Letter/A4 page boundaries still need visual review after layout or substantial content changes. It also checks main landmarks, level-one headings, and nonempty link names in Chromium's accessibility tree. Static checks cover links, headings, output limits, and reproducible bytes. These checks do not establish full accessibility conformance. A screen-reader review and evaluation by people with access needs remain valuable.

## Release limits

The builder reads the release state from `release.json`. Candidate builds use an unreleased banner and request no indexing. Ready builds identify v0.1.0 and allow indexing of normal pages; the 404 page remains non-indexable. Neither state enables hosting, contributions, or license grants. `noindex` is a search-engine request, not access control; bind previews to loopback.

`python -I -B release_check.py` checks publication consistency. A candidate or incomplete release must exit with status 1; do not bypass that guard. A passing check does not prove live hosting or inbox delivery. See [publishing instructions](docs/PUBLISHING.md) for configuration and the separate manual Pages workflow.

## Interactive demonstrator

The homepage template is content/index.html; learning-lab/ holds the full playground, shared styles, modules and exact vendored assets. The builder uses an explicit nested file list and preserves unrecognized or locally modified output. Keep the homepage, playground and three Activity Studio routes' CSP in their templates; local server headers are not deployed to GitHub Pages. Only these five routes allow project scripts. Other reading pages stay script-free.

Interactive checks use tests/learning-lab-browser.mjs with the same optional Playwright installation, a base URL and evidence directory. The focused and full experiences, Simple and no-JavaScript paths, project-prefix navigation, native keyboard controls, graphics failure, reduced motion and text enlargement need fresh browser evidence. Node can run the pure calculations with node --test tests/bridge.test.mjs tests/model.test.mjs. The standard Python CI checks build/link/policy boundaries; it does not itself run browser tests or establish physical-device performance.

## Activity Studio

`activity-studio/` contains the library, editor, validated recipe format and shared player. Read [the authoring guide](docs/ACTIVITY-STUDIO.md) before changing its trust boundaries. Add new payloads to both the static build and reviewed-source export inventories. Activity JSON is data, never executable code or proof of review.

Run the Node suites with `node --test tests/bridge.test.mjs tests/model.test.mjs tests/activity-recipe.test.mjs`. Use the matching root or project-path browser commands above against an actual build. The optional Playwright module/channel settings above apply. The dedicated interactive workflow runs these checks with pinned Playwright 1.62.1; its results still need inspection and do not replace real-device or educator review.
