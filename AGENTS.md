<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

<!-- BEGIN:user-release-automation-rules -->

# Mandatory release synchronization

At the end of every task that creates or updates tracked project files:

1. Run `graphify update .`.
2. Verify the production build before release.
3. Commit all intended project and Graphify updates.
4. Push the current branch to GitHub.
5. Deploy the linked Vercel project to production.

Run independent release operations concurrently when safe. Never commit secrets, environment files, credentials, or local-only tokens.

<!-- END:user-release-automation-rules -->
