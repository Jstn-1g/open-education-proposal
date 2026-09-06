# Publish the community edition

The workflows are prepared for this directory to become a standalone repository root. They have not run on GitHub, and this document does not claim that a repository or website is public. The current candidate must fail the publication check.

## Repository first, hosting separately

Repository creation, source visibility, community intake, and website hosting are distinct choices. Review the exact source files and intentional public attribution before uploading them. Include only this community edition's reviewed files; never include local caches, build outputs, credentials, private records, or unrelated Git history.

Before a public release, finalize the actual owner and destination; rights and license grants; contribution terms; maintainer capacity; and reachable correction, conduct, and private security-reporting routes. Update the [license plan](../LICENSE-PLAN.md), [contribution guide](../CONTRIBUTING.md), [governance](../GOVERNANCE.md), [security instructions](../SECURITY.md), and visible website copy consistently. Do not substitute invented accounts or addresses.

Publishing source does not by itself enable a website or open submissions. Keep those settings aligned with the announced state. Public copies may persist even if access is later removed.

## What the workflows do

### Publication configuration

`release.json` holds five explicit facts: `status` (`candidate` or `ready`), the confirmed HTTPS `repository` URL, the accountable `maintainer` GitHub login, a monitored `conduct_contact` mailto address, and a tested `security_contact` (mailto or that repository's enabled private vulnerability-reporting URL). Blank values are intentional until confirmed; changing them is not proof of authority or operation.

Before setting `status` to `ready`, add the approved full `LICENSE` and `LICENSE-CONTENT` texts and notices, publish the actual contacts in the policies, and replace candidate-only wording in the public documents and site frame/fragments. Review the candidate `noindex` meta tag and `robots.txt` policy for the public launch. The guard checks presence, basic consistency, obvious candidate wording, generated noindex tags, and the repository identity in Actions. It does not contact the routes, validate the complete legal texts, or certify the remaining prose. Review those facts directly.

GitHub private vulnerability reporting must be enabled separately; adding a link or a `SECURITY.md` file does not enable it. The repository owner must verify the feature and recipient notifications using GitHub's [private reporting configuration](https://docs.github.com/en/code-security/how-tos/report-and-fix-vulnerabilities/configure-vulnerability-reporting/configure-for-a-repository). A monitored conduct address remains a separate route.

### Automated checks and manual hosting

`Website checks` runs on pull requests to `main`, pushes to `main`, or manual dispatch. It runs the standard-library tests and static build on Python 3.11 and 3.13. Its token has read-only repository access, checkout credentials are not retained, and it does not deploy or upload artifacts. There is no custom package-install step. Hosted runners and official Actions still use GitHub's infrastructure; this is not an offline CI claim.

`Publish website manually` runs only when an authorized maintainer dispatches it from `main`. It calls `python -I -B release_check.py` before Pages configuration, build, or artifact upload. A missing guard, a failing guard, or a failed test stops the job. The current incomplete launch facts must produce a nonzero guard result; do not remove the check to make a candidate deploy.

After the check passes, the workflow reads the already configured Pages destination and derives the build prefix from its `base_path`. It uploads only `.build`, with one-day artifact retention. The separate deployment job can write Pages deployments and request the required identity token; it does not check out or execute site source. These permissions follow GitHub's [custom Pages workflow](https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages) and [deployment action](https://github.com/actions/deploy-pages) contracts.

## First hosting run

1. Complete the public release facts and inspect the locally built pages, links, accessibility findings, notices, and privacy disclosures. Run `python -I -B -m unittest discover -s tests -v` and `python -I -B release_check.py` from the repository root. A passing guard checks recorded facts; it does not prove legal rights, staffing, or human approval.
2. Have the repository owner select GitHub Actions as the Pages source. The workflow deliberately does not enable Pages automatically. Review the actual host's processing and any custom domain before publication.
3. Configure the `github-pages` environment before dispatch: restrict deployments to `main` and apply reviewer protection suited to the actual maintainers and available plan. Merely naming an environment in YAML does not configure protection; GitHub may create an unprotected environment if it does not exist. See [managing environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).
4. Dispatch `Publish website manually` from the reviewed `main` commit. Inspect the build result and deployment environment before approving any configured environment review.
5. Verify the actual published URL, root or project-path navigation, 404 page, licenses, contact routes, and announced contribution state before sharing the launch. Record the published commit and date. Correct or unpublish a faulty site; removing access cannot recall existing copies.

Neither workflow requests repository secrets, uses `pull_request_target`, or deploys pull-request previews. Changes to workflows, the publication guard, and licensing deserve maintainer review before they reach `main`.

## Pinned Actions

The following official release commits were verified on 6 September 2026. Version comments aid review; the workflows execute the full commit pins. Recheck upstream release notes and the exact commit before updating a pin.

| Action | Release | Pinned commit |
| --- | --- | --- |
| `actions/checkout` | [v7.0.1](https://github.com/actions/checkout/releases/tag/v7.0.1) | [`3d3c42e5aac5ba805825da76410c181273ba90b1`](https://github.com/actions/checkout/commit/3d3c42e5aac5ba805825da76410c181273ba90b1) |
| `actions/setup-python` | [v7.0.0](https://github.com/actions/setup-python/releases/tag/v7.0.0) | [`5fda3b95a4ea91299a34e894583c3862153e4b97`](https://github.com/actions/setup-python/commit/5fda3b95a4ea91299a34e894583c3862153e4b97) |
| `actions/configure-pages` | [v6.0.0](https://github.com/actions/configure-pages/releases/tag/v6.0.0) | [`45bfe0192ca1faeb007ade9deae92b16b8254a0d`](https://github.com/actions/configure-pages/commit/45bfe0192ca1faeb007ade9deae92b16b8254a0d) |
| `actions/upload-pages-artifact` | [v5.0.0](https://github.com/actions/upload-pages-artifact/releases/tag/v5.0.0) | [`fc324d3547104276b827a68afc52ff2a11cc49c9`](https://github.com/actions/upload-pages-artifact/commit/fc324d3547104276b827a68afc52ff2a11cc49c9) |
| `actions/deploy-pages` | [v5.0.1](https://github.com/actions/deploy-pages/releases/tag/v5.0.1) | [`368f82528645a54fb793d4d04e342629a3f51346`](https://github.com/actions/deploy-pages/commit/368f82528645a54fb793d4d04e342629a3f51346) |

The artifact action also pins its internal `actions/upload-artifact` dependency. This is a dependency choice for hosting automation, not a dependency shipped to readers of the website.
