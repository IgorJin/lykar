# End-to-end tests

The S0 end-to-end layer has two independent commands. Both allocate local ports,
create a temporary PostgreSQL cluster, apply migrations, seed `Northstar E2E`,
and remove the cluster when the run finishes.

## HTTP and PostgreSQL

```sh
npm run test:e2e:http
```

This runs all 21 API tests with `LYKAR_TEST_DATABASE_URL`, so the three database
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
