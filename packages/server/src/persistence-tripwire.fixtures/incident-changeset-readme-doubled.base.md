# Changesets

Hello, and thanks for opening this PR! We use [changesets](https://github.com/changesets/changesets) to track changes to this repository.

## Adding a changeset

Run `bun changeset` from the repo root, follow the prompts, and commit the generated file in `.changeset/`.

## What goes in a changeset

Use a present-tense imperative bullet like `Fix render of nested lists`. Internal-only refactors should still get a `patch`-level changeset so the changelog reflects the work.

## Releasing

The `release` workflow runs `changeset version` to consume pending changesets, bump versions, and update changelogs. A maintainer reviews the bump PR and merges it to publish.
