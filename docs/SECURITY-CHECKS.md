# Security checks in the maintenance process

Automated checks help us find problems. A completed run is evidence about a particular commit and set of checks, not a security certificate.

## What runs

[Code security checks](../.github/workflows/security.yml) uses GitHub CodeQL's default queries for Python build and validation tools, the JavaScript browser test, and GitHub Actions workflows. It runs on pushes to `main`, pull requests targeting `main`, and manual dispatch. There is no timed or continuous monitoring service. [GitHub documents these supported languages and triggers](https://docs.github.com/en/code-security/reference/code-scanning/workflow-configuration-options).

The workflow uses full-commit action pins, GitHub-hosted runners, and no project build or dependency-install commands. Its token can read source and upload security findings; it cannot publish the site or modify repository contents. Checkout does not persist credentials. It uses `pull_request`, never `pull_request_target`, so fork contributions do not receive elevated repository access. Do not enable write tokens or secret access for fork pull requests to make a failed scan pass. [GitHub's guidance explains pull-request result uploads](https://docs.github.com/en/code-security/reference/code-scanning/troubleshoot-analysis-errors/resource-not-accessible).

The website remains plain HTML and CSS. CodeQL does not add JavaScript, an AI service, or a dependency to the published site. Scan results are uploaded to GitHub; the workflow disables separate CodeQL database uploads.

## First run and ongoing review

This workflow is prepared for public release; its first public execution is still pending. Private staging runs intentionally skip analysis. A skipped, canceled, or failed run is not a passing scan. [GitHub documents code scanning availability and first-run verification](https://docs.github.com/en/code-security/how-tos/find-and-fix-code-vulnerabilities/configure-code-scanning/configuring-advanced-setup-for-code-scanning).

After the repository becomes public, before community merges, dispatch **Code security checks** on `main`. Confirm all three language jobs completed, results were processed, and no configuration error left files unexamined. Review the repository's [code scanning results](https://github.com/Jstn-1g/open-education-proposal/security/code-scanning) and record the commit, run URL, findings, and unresolved limits. Do not enable GitHub's separate default CodeQL setup alongside this workflow.

For each relevant change, the human maintainer reviews new alerts and test results before merging. GitHub may require approval before a new contributor's workflow runs; review the submitted changes before approving execution. A suspected vulnerability goes through [the private reporting process](../SECURITY.md). Reproduce it safely, record the decision, and verify any fix. Do not dismiss an alert merely to make a check green. During maintenance, review upstream notices before updating pins; the initial CodeQL pin resolves to [v4.37.9](https://github.com/github/codeql-action/releases/tag/v4.37.9), verified on 2026-09-06.

## What this does not establish

CodeQL does not test the deployed host, prove complete vulnerability coverage, or replace review of changed permissions, data handling, dependencies, and publication outputs. A successful workflow execution does not itself mean all alerts are resolved or that branch protection is configured.

It does not validate educational claims, safeguarding, accessibility conformance, or contribution rights. Continue the checks in [DEVELOPMENT.md](../DEVELOPMENT.md) and human review in [MAINTENANCE.md](../MAINTENANCE.md).

This is code scanning, not inbox scanning. No Gmail access, automated report ingestion, or round-the-clock response is configured. Keep private reports and identifiable child information out of AI tools and public logs. Any separately requested AI-assisted security review must have its own recorded scope and actual results; this workflow does not establish that such a review ran.
