# Maintain a small, useful project

**Human owner and initial maintainer: Jstn-1g. Development assistance: GPT-6.** This routine covers v0.1.0 of [Jstn-1g/open-education-proposal](https://github.com/Jstn-1g/open-education-proposal).

Maintain the proposal, source notes, static website, and contribution guidance. GPT-6 can help draft changes, tests, explanations, and triage summaries. It is not a legal co-maintainer, an independent specialist, or a substitute for human judgment. It does not provide continuous monitoring or guaranteed correctness.

## A routine for each change

1. Identify one concrete problem and a small useful change. Keep the scope understandable in a short issue or pull-request description.
2. Draft the change, using GPT-6 if helpful. Check cited sources and any copied material directly. Disclose material AI assistance in the change description.
3. Run the standard-library checks in [DEVELOPMENT.md](DEVELOPMENT.md). Inspect affected pages and links; test keyboard access and narrow screens for layout changes. A wording correction needs an appropriate review, not a new test suite.
4. Have Jstn-1g or a delegated human maintainer review the diff, results, limitations, and rights before merging. Use pull requests and passing CI. A sole maintainer's review is not independent review; disclose that limitation where it matters.
5. Record reasons for substantive changes and credit the contributors. Publishing the website remains a deliberate release action after the publication check passes.

## Security review follows the change

Review code, dependency, and workflow changes for the risks they introduce before merging. Inspect file reads and writes, output boundaries, external requests, credentials, permissions, and third-party execution as relevant. For Action or dependency updates, verify the exact upstream version, release notes, pin, and applicable advisories. The website currently has no third-party build packages; adding one needs a clear reason and review.

Run focused tests for changed behavior and the existing affected checks. The [CodeQL workflow and first public result](docs/SECURITY-CHECKS.md) cover public main-branch changes and pull requests. Investigate actionable findings and record the reviewed version, scope, results, and remaining limits. A completed scan is evidence for its stated scope, not certification. A separately attempted deep security scan could not start because its tool required a managed filesystem permission profile; no completed deep-scan result is claimed for this edition.

## When expertise is needed

Ask a qualified person to review substantive changes to learning claims, assessment, safeguarding, or accessibility conclusions. Check what the evidence actually covers. When expert review is unavailable, record the open question or narrow the claim; do not fill the gap with an AI-generated endorsement.

The community edition remains adult proposal and website work. It does not authorize child studies, learner records, robot tutors, or simulated companions.

## Keeping up with the work

At each maintenance session, review recent reports, failing checks, stale links, and the most useful next task. Check upstream notices before changing pinned GitHub Actions. Batch small related fixes, keep the release notes concise, and close or defer work with a reason. No daily, weekly, or round-the-clock response service is promised.

Send private conduct and security concerns to [jstn0513@gmail.com](mailto:jstn0513@gmail.com). Jstn-1g handles the email directly; there is no automatic inbox processing or AI access to the mailbox. Never paste private reports, credentials, child information, or identifiable case material into AI tools or public discussions. GPT-6 may help with a sanitized technical description after the responsible human decides what can be shared.

If workload exceeds capacity, pause new intake or a risky change and make the limitation visible. If the maintainer leaves, arrange a consenting successor or pause affected work. Governance, correction, and conflict-handling responsibilities are recorded in [GOVERNANCE.md](GOVERNANCE.md).
