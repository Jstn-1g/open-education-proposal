# Learning Lab: assets and reuse

These are unvalidated design examples for adult review. Source, calculations and interface code were developed with AI assistance. Jstn-1g is the accountable maintainer; generated material is not evidence of specialist review or learning effectiveness.

## Project material

Project `.mjs` scripts and CSS use Apache-2.0. HTML, explanatory content and the two original generated backdrops use CC BY 4.0, to the extent copyright applies. Credit **Open Education proposal — Jstn-1g and contributors**, retain notices, link to the source and identify changes. See [complete coverage](https://github.com/Jstn-1g/open-education-proposal/blob/main/LICENSES.md) and the [website's licenses and attribution](https://jstn-1g.github.io/open-education-proposal/open-source.html#licenses).

The backdrops were generated with OpenAI's image tool, one request per setting: a storybook garden canyon and an indigo/brass discovery room. Neither contains the functional fraction or pendulum geometry; the program draws that independently. No third-party stock assets, textbook figures, photographs or fonts were copied. Generated art does not establish exclusivity, trademark clearance or guaranteed copyright protection.

## Third-party engine

Phaser 3.90.0 is bundled unmodified under its own **MIT license**, not the project's Apache license. Preserve [the full Phaser notice](vendor/PHASER-LICENSE.txt). The reference is the [official v3.90.0 release](https://github.com/phaserjs/phaser/releases/tag/v3.90.0), commit `a9965625f49cf366584f454556b039e06e8adad6`.

- `vendor/phaser-3.90.0.min.js`: 1,196,122 bytes; SHA-256 `e92ddef111ba42e92d316979c732311757093688ea1810591cb7aa2858eba7a7`.
- `vendor/PHASER-LICENSE.txt`: SHA-256 `c3123cd25de4eccf1fd5a5a0a6fc872299116d1dbbb48b00f2554a4c35220a65`.

The engine renders only. Native controls and calculations do not depend on it. Initial Simple view avoids downloading the engine and artwork; missing graphics fall back to the same native interaction. There are no CDN assets, audio, accounts, network submissions, analytics or persistent progress. GitHub Pages still processes hosting requests; see the website's privacy disclosure.

The two PNGs total 4.32 MB uncompressed transfer bytes; the engine adds 1.20 MB. Only the active backdrop loads. This is an explicit initial demonstrator budget, not a claim of low-bandwidth optimization or physical-device performance. Simple view is the lightweight alternative.
