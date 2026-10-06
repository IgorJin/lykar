# End-to-end tests

The S0 end-to-end layer has two independent commands. Both allocate local ports,
create a temporary PostgreSQL cluster, apply migrations, seed `Northstar E2E`,
and remove the cluster when the run finishes.

## HTTP and PostgreSQL

```sh
npm run test:e2e:http
```

This runs all 31 API tests with `LYKAR_TEST_DATABASE_URL`, so the database
integration cases do not skip. It then runs the HTTP smoke workflow: local login,
editor capability, operation save, immutable Release, protected version access,
A/B links and analytics, share exchange, and native fallback. The older
`npm run test:e2e` name is an alias for this command.

## Chromium browser

```sh
npx playwright install chromium   # once after npm ci
npm run test:e2e:browser
```

`playwright.config.ts` uses one worker and no retries. `global-setup.ts` starts
`scripts/e2e-stack.mjs --browser`, waits for its readiness JSON, publishes only
the temporary service URLs to tests, and always shuts the stand down.

The six current cases cover:

1. popup blocking after transient user activation expires;
2. infrastructure readiness and a visible editor panel;
3. local owner login, session reload, and editor popup from a real Admin click;
4. development auth disabled, one-use magic link, and failed reuse;
5. recovery button with a clickable Admin address when capability is absent;
6. edit → preview → save → reload → reopen → Release → share, plus clean visitor
   and page isolation contexts.

Owner, share visitor, and native visitor use separate browser contexts. Failed
requests and page errors fail the scenarios. On failure, Playwright stores the
screenshot, trace, video, and `error-context.md` in `test-results/`; the HTML
report is in `playwright-report/`. These paths are intentionally gitignored.

## Local stand for manual verification

```sh
npm run dev:e2e
```

Open the Admin URL printed by the process, use **Войти как локальный
владелец**, select Home, create/open a Draft, edit an element and press
**Применить**. Reload the editor, publish a version, create Share, and open it
in a separate private context. Stop everything with `Ctrl+C`.


## SERVICE-V1 deployment delivery

`deployment-flow.spec.ts` runs with Chromium, Firefox and WebKit. The playground
and SPA fixtures opt in with `?lykar_delivery=deployment`; ordinary fixture URLs
retain their existing links-only behavior. This query is a fixture switch, not a
new public SDK selector or API contract.

Coverage uses the real temporary API/PostgreSQL for Publish/Deploy/Disable/Rollback,
script/ESM delivery, pinned preview and native A. React/Vue CSR/SSR scenarios check
host handlers, root remount, navigation and cleanup. Separate injected transports
cover request/body deadlines, rejected requests, HTTP failure and late results;
invalid asset metadata and deployment payloads leave the original page visible.
No deployment UI is assumed; Admin controls are SERVICE-V1-05.

## SERVICE-V1 Admin publication and repair

`deployment-admin.spec.ts` checks explicit Deploy/Disable/Rollback, history and
actor/reason, desktop/390px layout and keyboard, genuine preview popup reports,
real concurrent revision conflict, and idempotent retry after the server committed
but its response was replaced by a marked 503. Only that marked POST fault and
actual deployment conflict are allowed by the browser error fixture.

`deployment-repair.spec.ts` checks missing-target diagnostics, manual ChangeTree
repair in a Draft based on an immutable Release, save/reload, new Release, preview,
explicit deployment and a separate visitor. It checks the old manifest and hash
remain unchanged. Both files run in Chromium, Firefox and WebKit. WebKit/macOS
uses Option+Tab for full keyboard navigation; other browsers use Tab.

Each new scenario uses a fresh real Page under the existing pricing fixture alias.
Persistence recovery cases also use isolated Pages so earlier Releases cannot
change their native baseline. Run whole stacks sequentially.

### SERVICE-V1-09 onboarding

`npx playwright test tests/e2e/onboarding.spec.ts` runs Chromium, Firefox and WebKit.
Each case uses an independent signup account; it does not pollute the seeded owner.
Desktop/mobile cases copy the actual installation snippet into an isolated HTML
file served by the playground's test-only installed-site route, then check the
connection, save/reload a text edit, freeze Release and open preview. Installing
the file simulates the customer's one-time access to their own site. The test
never substitutes SDK/API/assets; external DNS and live email remain separate gates.
The sitemap UI case substitutes its preview response but uses real origin/import
endpoints; API tests cover malformed XML, SSRF/redirects, bounds and isolation.
