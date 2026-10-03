# Browser CI coverage

Pull requests run 23 existing provider-free Chromium cases with
`npx playwright test --config config/test/playwright.pr.config.js`: sign-in and
sign-up UI (4), workspace/public pages (6), redirects and 404 (5), Library (4),
public sharing (2), detected-asset prompt churn (1), and the unchanged original
golden-path guest sign-in gate (1). This configuration starts only Vite and uses
placeholder client configuration. The PR steps receive no provider credentials
and start no API, Redis client, or Firestore emulator.

Branches that contain `tests/e2e/cross-mode/playwright.config.ts` additionally run
its 10 controlled browser scenarios. These exercise the real application routes
and services with controlled provider/storage boundaries and an outbound guard.
The foundation branch runs 23 cases; the complete cross-mode branch runs 33.
Failures remain failures. The existing `workspace-smoke` FIXME does not count as
passing coverage. Reports are separate under `playwright-report/pr-ui` and
`playwright-report/cross-mode`, with traces under the corresponding
`test-results` directories.

Pushes to main/develop and manual E2E dispatches retain the existing native suite
and provider configuration. The separate nightly/manual live golden-path and
bounded live-provider smoke workflows retain their schedules. Accessibility
checks run independently for every existing E2E workflow trigger. PR success
proves the selected UI and controlled integration contracts; live provider
completion remains separate evidence.

To use installed Chrome locally, set `E2E_CHROME_CHANNEL=chrome`. CI uses the
bundled Chromium in its existing Playwright container.
