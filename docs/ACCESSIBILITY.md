# Accessibility review

Accessibility is part of the work, not a certification badge. WCAG 2.2 AA is our target. We have not established conformance, and these checks do not replace evaluation by disabled people.

## Implemented

- Semantic pages with one main heading, meaningful heading order, navigation landmarks, current-page indication, and a keyboard skip link.
- Visible focus, underlined text links, flexible layouts and system fonts. Proposal/discussion pages and static explanations can be read without JavaScript; interactive demos need it.
- No submitted forms, tracking widgets or remote fonts. Demo inputs stay in page memory. Pendulum motion is time-limited, pausable and starts paused for reduced motion; manual steps and interactive Simple view are available.
- Print styles that remove navigation and keep the reading content visible.

## Recorded checks

The newer interactive demonstrator has a separate [scope and verification record](LEARNING-LAB.md). Historical checks below concern the earlier reading website and do not certify the new Canvas experience. Native controls and text expose quantities alongside Canvas annotations; that does not establish complete screen-reader or dyslexic-user usability.

The reproducible checks are in `tests/test_site.py` and `tests/browser.mjs`; see [development instructions](../DEVELOPMENT.md). On 4 September 2026, checks passed in installed Microsoft Edge through Playwright for all six pages at 320, 768, and 1440 CSS pixels, keyboard access to main content, and reflow with enlarged text and spacing overrides in forced-color mode. Root and project-subpath navigation were exercised. Print-media checks passed for visible headings, hidden navigation, and horizontal fit; paginated paper output was not evaluated. Passing these checks demonstrates only the assertions they make.

The seven reviewed text/background color combinations have calculated contrast ratios from 6.15:1 to 14.59:1. This palette check is not an audit of every state or of non-text contrast.

On 6 September 2026, the browser checks passed again at the root path. The browser's accessibility tree also exposed exactly one main landmark and one level-one heading on each of the six pages, with nonempty accessible names on all exposed links. These checks inspect what the browser exposes to assistive technology; they do not exercise a screen reader or establish that every link name is understandable in context.

The initial enlarged-text review found horizontal overflow. Flexible child sizing and button wrapping were corrected, and the browser checks subsequently passed. A small-screen layout is not, by itself, proof that every zoom or assistive-technology combination works.

On 7 September 2026, the browser checks passed at both root and project subpath after contribution wording and print-layout changes. A separate review of actual headless Edge 152 PDF output covered all six routes on Letter and A4, with half-inch margins and browser-generated headers/footers off. A stranded rule heading and fragmented footer were corrected; all 22 rendered pages were visually inspected, with no blank or footer-only page observed. Body text remains 11 points on paper. This is evidence for those settings, not every printer, margin choice, or PDF reader. The automated browser test checks the intended keep rules and block-footer layout; it does not inspect PDF pagination.

## Still to evaluate

- Screen-reader navigation, reading order, landmark names, and link purpose with a named browser/reader combination.
- Real browser zoom and operating-system text settings, beyond the automated text-size simulation.
- Usability with low vision, motor, cognitive, and other access needs; whether the language is understandable.
- The final hosted site, including the GitHub contribution routes and email reporting links.

## Report a barrier

Use the [accessibility issue template](https://github.com/Jstn-1g/open-education-proposal/issues/new?template=accessibility-barrier.md) for non-sensitive barriers. Include the page, task, observed behavior, browser and assistive technology if relevant, and the expected result. Do not include learner records or private health information. A reproducible example is helpful but is not a condition for being heard. For sensitive conduct or security concerns, email [jstn0513@gmail.com](mailto:jstn0513@gmail.com); responses are best effort.
