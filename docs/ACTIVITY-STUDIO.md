# Make, try and share an activity

The Activity Studio is an early authoring tool for adult contributors. It extends one trusted Fraction Bridge template—not a general game engine or a classroom-ready platform. The first library contains two project examples, not independently reviewed community submissions.

## A complete local workflow

1. Open the built website's **Activity Library** and try an example.
2. Choose **Make a copy**. Edit the prompt, available pieces, hints and short challenge sequence. Changing a tray shows a gentle reminder to review its prompt and hint; the studio never silently rewrites them. Open “Learning goal & credits” to describe the purpose and contributor.
3. Select **Preview this challenge** to try the challenge you are editing, or **Try from the beginning** to start the complete sequence. Editing alone does not reset play. Preview and standalone play use the same player; Replay returns to the first challenge. **Back to editing** returns you to the current prompt without changing the preview.
4. Try every challenge, including a different construction and undo. The validator checks structure and a possible route to one whole; it cannot check whether your writing teaches the right concept.
5. **Download activity file**. The suggested filename starts with `activity-` and uses a safe form of your current title, falling back to the recipe's `id` when needed. This does not change an imported recipe's `id`. Check your downloads, then select **I have the saved file**. Requesting a download alone does not remove the unsaved-work warning: the browser may cancel or block it. Further edits require a new download and confirmation. Nothing is saved automatically; browser leave warnings are best effort, not backup.
6. Reopen the JSON file in the studio to continue editing or in the player to try it. A recipe requires the compatible player; downloading JSON is not a standalone offline game export.
7. To propose inclusion in the library, use the **Activity draft or remix** issue template and paste the recipe plus your checks. This separate public action requires a GitHub account. Opening a local file never uploads it.

Local paths after building: `activity-studio/index.html`, `activity-studio/edit.html`, `activity-studio/play.html`. Add `?view=simple` to editor or player to avoid the initial illustration download. This repository's source may be ahead of the live deployment; a source change is not a publication record.

When validation finds an editable field, the studio opens its disclosure, shows the error beside it and focuses that field; your last valid preview remains playable. Copying first validates your current edits. If automatic copying is unavailable, it selects only that current validated recipe for manual copying—not an older recipe after validation fails.

## What authors can change

Title, public author/pen name, summary, goal, prerequisites, and one to five challenges. Each challenge has a short prompt, optional hint and two to twelve finite pieces: halves (4 units), quarters (2) or eighths (1). The whole is always 8 units. Spare pieces allow meaningful choice. Oversized choices stay in the tray with corrective feedback; undo and reset permit a different approach. Successful construction is not a score or mastery claim.

Inherited source credit is retained separately from author credit. Changing the author normally adds the previous author/title to that credit. For a credit trail exceeding the format's 600-character limit, an author may explicitly consolidate it in “Learning goal & credits,” preserving authors, source links and applicable attribution; the original remains visible for comparison. The editor does not silently truncate credits. Do not claim another contributor's work or erase required attribution. Reviewers must check rights and authorship; the software cannot establish them.

## Format and trust boundaries

Schema version 1 and template `fraction-bridge` version 1 use these exact fields:

- `schemaVersion`, `template`, `templateVersion`, `id`, `title`, `author`, `license`, `attribution`, `summary`, `goal`, `prerequisites`, `steps`.
- A step contains `id`, `prompt`, `pieces`, `hint`.
- Content license is `CC-BY-4.0`. Software remains under the project's Apache-2.0 license.

The canonical validator and examples are in `activity-studio/recipe.mjs` and `examples.mjs`. Files are bounded to 32 KiB; unsupported versions/fields, duplicate keys, invalid values, impossible trays and control characters are rejected. Text is displayed as plain text, never executable markup. The studio and player retain a visible unreviewed-draft notice. Format and solvability checks do not establish educator approval, legal rights or accessibility conformance. Imported files always remain unreviewed drafts regardless of their wording; file fields cannot create a trusted review badge.

No custom code, remote assets, uploaded images, arbitrary formulas, accounts, grades, analytics, student records or automatic publication. Local file access is limited to the file the visitor selects. No application network connections are used; the static hosting provider still processes ordinary page requests under its terms. Public proposal issues are separate and hosted by GitHub.

## Maintainer acceptance

Inspect the proposed difference, learning purpose, exact recipe, credit/licenses, evidence claims and limits. Try keyboard and pointer interaction, initial Simple view, narrow screens and the completed sequence. Request qualified help for specialist questions. Do not label a draft educator-reviewed unless that review actually occurred and is documented.

Approved project additions are made to `examples.mjs` through normal code review and version control, with a distinct library key. Recipe IDs identify drafts but do not enforce global uniqueness or version history; reviewers must resolve duplicates before catalogue inclusion. This first iteration deliberately uses curated publication, not instant public uploads or a searchable marketplace.

The Node tests check schema/model invariants and solvability. The browser tests exercise authoring, import/export, preview/play equivalence and representative access paths. Neither establishes educational effectiveness, screen-reader conformance or suitability for every learner. A pilot with adult educators is still needed to determine whether the studio is understandable without maintainer help.
