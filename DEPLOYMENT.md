# Deployment status

## Verified on 2026-10-30

- Public game: https://good-dog-dash.vercel.app/
- Private GitHub repository: https://github.com/aadarsh1212/good-dog-dash
- Vercel dashboard: https://vercel.com/orion-d52a/good-dog-dash
- Vercel team: Orion (`orion-d52a`), Hobby plan.
- Production deployment: `dpl_HRbBqwwV2Hi1XKr8xde1nPWwt43V`, READY.
- Initial release was uploaded using the authenticated Vercel CLI, not a GitHub webhook.
- Public production domains are accessible without Vercel sign-in; preview/deployment URLs retain Vercel Authentication.
- [Public browser test results](artifacts/ui/vercel-test-results.json) verify HTTP 200, customization, start/pause, reload persistence, and no JavaScript exceptions.

## Remaining: connect private GitHub repository

Vercel's project currently has no Git connection. The CLI connection attempt failed because the private repository is not yet accessible to Vercel. GitHub CLI authentication and Vercel CLI authentication are both complete; GitHub App repository access is separate.

While signed in to GitHub as `aadarsh1212`:

1. Open https://github.com/apps/vercel and choose **Install** or **Configure**.
2. Choose the `aadarsh1212` account.
3. Choose **Only select repositories**, then select **good-dog-dash**.
4. Save or install the app. Enter any password/2FA prompt on GitHub, never in chat.
5. If Vercel is already installed, find it under https://github.com/settings/installations, choose **Configure**, and add the repository.

After access is approved, reconnect from this game directory:

```sh
vercel git connect https://github.com/aadarsh1212/good-dog-dash.git --yes --scope orion-d52a
```

Then verify the project Git link and a subsequent Git-push deployment before claiming automatic deployment is working. The live site does not depend on completing this integration.

## Build and deployment

[vercel.json](vercel.json) sets the framework to Other, runs [build.cjs](build.cjs), and serves the generated static `dist` directory. The build copies only the HTML, CSS, and browser JavaScript. Tests, screenshots, server scripts, credentials, and local configuration are not part of the public site. No runtime dependencies or environment variables are required.

Local verification: `npm run build`. Direct production update while Git access remains unconfigured:

```sh
vercel deploy --prod --yes --scope orion-d52a
```

Do not commit `.vercel`, `.env.local`, access tokens, or login logs. They are ignored. Scores and unlocks remain browser-local and origin-specific; localhost progress does not automatically transfer to the public domain.

## Vercel agent onboarding

Followed https://vercel.com/get-started.md:

- CLI: Vercel 65.8.0, installed in the user's local prefix and authenticated as `aadarsh1212`.
- Guidance: all nine standalone Vercel skills installed in the user-scoped Universal skill directory. Designer is not a supported agent target; these files are available as guidance, not automatically linked IDE commands.
- Plugin: Designer has no exposed compatible plugin setup command; used the standalone guidance fallback.
- MCP: blocked. `vercel mcp --clients Designer` explicitly rejects Designer. The current IDE exposes no MCP configuration or refresh commands; no unrelated client's configuration was changed.
- Intended shared endpoint: https://mcp.vercel.com. No MCP connection or authenticated `list_teams` tool verification is claimed.
- Reload: not needed for CLI deployment. MCP mutation confirmations were not disabled.
