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

The build writes only a dedicated output directory, refuses unrelated existing files, and records SHA-256 digests in `manifest.json`. It does not delete files. Outputs exclude source documents and tools.

For a project website, specify the actual project path at build time:

```sh
python -I -B build.py --base /open-education-proposal/
```

Serve that output at the matching path. This example does not select a repository name or publish anything. Navigation and the 404 page use the same base.

## Browser review

If Playwright and its Chromium browser are already installed, run:

```sh
node tests/browser.mjs http://127.0.0.1:8768/
```

The optional `PLAYWRIGHT_MODULE_PATH` environment variable may point to an existing Playwright `index.mjs`; `PLAYWRIGHT_CHANNEL=msedge` selects an existing Microsoft Edge installation. No browser testing dependency is included in the site or installed by this script. The optional second argument writes screenshots to a local review directory.

The browser check covers six pages at three widths with site JavaScript disabled, keyboard skip links, first-party-only requests, text enlargement/spacing with forced colors, and basic print-media layout. It also checks main landmarks, level-one headings, and nonempty link names in Chromium's accessibility tree. Static checks cover links, headings, output limits, and reproducible bytes. These checks do not establish full accessibility conformance. A screen-reader review and evaluation by people with access needs remain valuable.

## Release limits

The builder deliberately renders the candidate state. It has no switch that enables publishing, contributions, or license grants. Finalize those facts in the source and review the resulting files before public release. `noindex` is a search-engine request, not access control; local-only hosting keeps this candidate private.

`python -I -B release_check.py` reports the missing publication prerequisites and exits with status 1 on the current candidate. This is expected, not a failing development build. See [publishing instructions](docs/PUBLISHING.md) for the release configuration and separate manual Pages workflow.
