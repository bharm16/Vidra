// Fail fast with a clear message if a stale Node (pre-17) is on PATH. ESLint
// 9 and @eslint/config-array rely on `structuredClone` (global in Node 17+);
// without this check, an external pre-push hook that resolves to an old
// /usr/local/bin/node hits a cryptic "structuredClone is not defined" deep
// inside the config merger instead of a pointer to the real problem.
const [nodeMajor] = process.versions.node.split('.').map(Number);
if (nodeMajor < 20) {
  throw new Error(
    `ESLint config requires Node >=20; found ${process.versions.node} at ` +
      `${process.execPath}. Check which node resolves in your shell — an old ` +
      `/usr/local/bin/node (Intel Homebrew) may be ahead of /opt/homebrew/bin ` +
      `on PATH. See .nvmrc.`
  );
}

import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import security from 'eslint-plugin-security';
import noSecrets from 'eslint-plugin-no-secrets';
import tsParser from '@typescript-eslint/parser';
import tsEslint from '@typescript-eslint/eslint-plugin';
import noHardcodedCss from './eslint-plugin-no-hardcoded-css.js';

// Shared no-restricted-syntax entry. The design-system guardrail block below
// re-declares no-restricted-syntax for active client surfaces (flat config
// replaces the whole rule entry, so the base restriction must ride along).
const hookWholeObjectDependencyRestriction = {
  selector:
    "ArrayExpression[parent.type='CallExpression'][parent.callee.name=/^use(?:Effect|LayoutEffect|Memo|Callback)$/] > Identifier[name=/^(params|options|props|promptOptimizer|promptHistory|workspaceDomain|versioning)$/]",
  message:
    'Do not use whole-object dependencies in hook arrays. Depend on specific stable members/functions instead.',
};

// Design-system guardrails (ADR-0008 / issue #58) — shared exclusions.
// Frozen stacks (ADR-0002) get mechanical swaps only, never redesigns, so
// they are exempt from the raw-<button> and raw-palette bans.
const designGuardrailFrozenAndTestIgnores = [
  // Frozen stacks (ADR-0002)
  'client/src/features/convergence/**',
  'client/src/features/continuity/**',
  'client/src/features/generations/**',
  'client/src/features/sequence-editor/**',
  'client/src/features/billing/**',
  'client/src/components/modals/FaceSwapPreviewModal.tsx',
  'client/src/components/modals/InsufficientCreditsModal.tsx',
  // Tests
  'client/src/**/__tests__/**',
  'client/src/**/*.test.{js,jsx,ts,tsx}',
  'client/src/**/*.spec.{js,jsx,ts,tsx}',
];

export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      '**/playwright-report/**',
      '**/test-results/**',
      '**/.vite/**',
      '**/.cache/**',
      '**/tmp/**',
    ],
  },
  {
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: {
        ...globals.browser,
        ...globals.node,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        ecmaFeatures: { jsx: true },
        sourceType: 'module',
      },
    },
    settings: { react: { version: '18.3' } },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
      security,
      'no-secrets': noSecrets,
      'no-hardcoded-css': noHardcodedCss,
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      ...react.configs['jsx-runtime'].rules,
      ...reactHooks.configs.recommended.rules,
      'react/jsx-no-target-blank': 'off',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      'react/display-name': 'warn',
      'react/no-unescaped-entities': 'warn',
      'react-hooks/rules-of-hooks': 'warn',
      'react-hooks/exhaustive-deps': 'error',
      'no-restricted-syntax': ['error', hookWholeObjectDependencyRestriction],
      // Keep baseline signal useful while this branch is being stabilized.
      'no-console': 'warn',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-useless-escape': 'warn',
      'no-prototype-builtins': 'warn',
      'no-dupe-keys': 'warn',
      'no-redeclare': 'warn',
      'no-case-declarations': 'warn',
      'no-useless-catch': 'warn',
      'no-unsafe-finally': 'warn',
      'no-constant-binary-expression': 'warn',
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@services/EnhancementService'],
              message:
                'Use canonical domain imports instead of legacy root service shims.',
            },
            {
              group: [
                '@/features/prompt-optimizer/PromptOptimizerContainer/PromptOptimizerContainer',
                '@features/prompt-optimizer/PromptOptimizerContainer/PromptOptimizerContainer',
                '**/PromptOptimizerContainer/PromptOptimizerContainer',
                '**/PromptOptimizerContainer/PromptOptimizerContainer.tsx',
              ],
              message:
                'Import from @/features/prompt-optimizer/PromptOptimizerContainer (folder entrypoint) or PromptOptimizerWorkspace directly.',
            },
          ],
        },
      ],
      'react/prop-types': 'off', // Turn off if not using prop-types
      // Security rules
      'no-secrets/no-secrets': 'warn',
      // High-noise security heuristics are disabled during stabilization.
      // These rules produce large volumes of false positives in typed code.
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-regexp': 'off',
      'security/detect-non-literal-fs-filename': 'off',
      'security/detect-eval-with-expression': 'error',
      'security/detect-no-csrf-before-method-override': 'error',
      'security/detect-buffer-noassert': 'error',
      'security/detect-child-process': 'warn',
      'security/detect-disable-mustache-escape': 'error',
      'security/detect-new-buffer': 'error',
      'security/detect-possible-timing-attacks': 'warn',
      'security/detect-pseudoRandomBytes': 'error',
      'security/detect-unsafe-regex': 'off',
      // Hardcoded hex colors in Tailwind className strings
      'no-hardcoded-css/no-arbitrary-color': 'error',
      // Hardcoded spacing/formatting values detection in inline styles
      'no-hardcoded-css/no-hardcoded-css': [
        'warn',
        {
          allowPixelValues: false,
          allowSmallValues: true, // Allow 0px, 1px, 2px for borders, etc.
          allowedProperties: ['zIndex', 'opacity', 'borderWidth'], // Properties that commonly need hardcoded values
        },
      ],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tsEslint,
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: [
      'server/src/routes/**/*.{js,ts,jsx,tsx}',
      'server/src/middleware/**/*.{js,ts,jsx,tsx}',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@services/credits/UserCreditService',
              importNames: ['userCreditService'],
              message:
                'Inject credit services through DI or route factory parameters instead of singleton imports.',
            },
            {
              name: '@services/storage/StorageService',
              importNames: ['getStorageService'],
              message:
                'Inject storage services through DI or route factory parameters instead of singleton imports.',
            },
          ],
        },
      ],
    },
  },
  // Server-side configuration
  {
    files: [
      'server.{js,ts}',
      'utils/**/*.{js,ts}',
      'src/**/*.{js,ts}',
      'migrate-*.*',
      'verify-*.*',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
  // Test files configuration
  {
    files: [
      '**/__tests__/**/*.{js,jsx,ts,tsx}',
      '**/*.{test,spec}.{js,jsx,ts,tsx}',
      'tests/**/*.{js,jsx,ts,tsx}',
      'config/test/vitest.setup.client.js',
      'config/test/vitest.setup.server.js',
      'config/test/vitest.config.js',
      'config/test/vitest.workspace.js',
      'config/test/playwright.config.js',
    ],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.browser,
        vi: 'readonly',
        describe: 'readonly',
        it: 'readonly',
        test: 'readonly',
        expect: 'readonly',
        beforeEach: 'readonly',
        afterEach: 'readonly',
        beforeAll: 'readonly',
        afterAll: 'readonly',
        global: 'readonly',
      },
    },
    rules: {
      'no-console': 'off',
      'no-secrets/no-secrets': 'off',
      'security/detect-object-injection': 'off',
      'security/detect-non-literal-regexp': 'off',
    },
  },
  // Load test files (k6)
  {
    files: ['load-tests/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        __ENV: 'readonly',
        __VU: 'readonly',
        __ITER: 'readonly',
        open: 'readonly',
        http: 'readonly',
        check: 'readonly',
        sleep: 'readonly',
        group: 'readonly',
      },
    },
    rules: {
      'no-console': 'off', // Allow console in load tests
      'no-undef': 'off', // K6 has many globals
    },
  },
  // Prompt template files - disable secrets detection for false positives
  {
    files: [
      'server/src/services/prompt-optimization/PromptOptimizationService.{js,ts}',
      'server/src/services/EnhancementService.{js,ts}',
    ],
    rules: {
      'no-secrets/no-secrets': 'off', // Templates contain high-entropy strings
    },
  },
  // Migration and utility scripts - allow console
  {
    files: ['migrate-*.*', 'verify-*.*', 'scripts/**/*.{js,ts,mjs,cjs}'],
    rules: {
      'no-console': 'off',
      'no-secrets/no-secrets': 'off',
    },
  },
  // ==========================================================================
  // Design-system guardrails (ADR-0008 / issue #58)
  //
  // Active client surfaces must use @promptstudio/system primitives and
  // semantic tokens. The system package itself (packages/**) is outside this
  // config's scope; frozen stacks and tests are excluded above.
  // ==========================================================================
  // Guardrail (a): raw <button> elements are banned in active surfaces.
  {
    files: ['client/src/**/*.{jsx,tsx}'],
    ignores: [
      ...designGuardrailFrozenAndTestIgnores,
      // Legacy raw-<button> files — migration backlog. Migrate a file to the
      // system Button, then DELETE its entry here. Never add new entries.
      'client/src/components/ToolSidebar/components/AccountPopover.tsx',
      'client/src/components/ToolSidebar/components/ToolNavButton.tsx',
      'client/src/components/ToolSidebar/components/panels/CharactersPanel.tsx',
      'client/src/components/ToolSidebar/components/panels/EndFrameControl.tsx',
      'client/src/components/ToolSidebar/components/panels/GenerationControlsPanel/components/GenerationFooter.tsx',
      'client/src/components/ToolSidebar/components/panels/GenerationControlsPanel/components/ImageSubTabSelector.tsx',
      'client/src/components/ToolSidebar/components/panels/GenerationControlsPanel/components/ImageSubTabToolbar.tsx',
      'client/src/components/ToolSidebar/components/panels/GenerationControlsPanel/components/ModelRecommendationDropdown.tsx',
      'client/src/components/ToolSidebar/components/panels/GenerationControlsPanel/components/PanelHeader.tsx',
      'client/src/components/ToolSidebar/components/panels/GenerationControlsPanel/components/ReferencesOnboardingCard.tsx',
      'client/src/components/ToolSidebar/components/panels/GenerationControlsPanel/components/VideoPromptToolbar.tsx',
      'client/src/components/ToolSidebar/components/panels/GenerationControlsPanel/components/VideoReferenceSlots.tsx',
      'client/src/components/ToolSidebar/components/panels/GenerationControlsPanel/components/VideoSettingsRow.tsx',
      'client/src/components/ToolSidebar/components/panels/GenerationControlsPanel/components/VideoTabContent.tsx',
      'client/src/components/ToolSidebar/components/panels/ImageReferenceSlotsRow.tsx',
      'client/src/components/ToolSidebar/components/panels/SessionsPanel.tsx',
      'client/src/components/ToolSidebar/components/panels/StartFrameControl.tsx',
      'client/src/components/ToolSidebar/components/panels/StylesPanel.tsx',
      'client/src/components/modals/CameraMotionModal.tsx',
      'client/src/features/assets/AssetLibrary.tsx',
      'client/src/features/assets/components/AssetCard.tsx',
      'client/src/features/assets/components/AssetTypeSelector.tsx',
      'client/src/features/assets/components/TriggerAutocomplete.tsx',
      'client/src/features/assets/components/TriggerChip.tsx',
      'client/src/features/model-intelligence/components/ModelComparison/ModelComparison.tsx',
      'client/src/features/model-intelligence/components/ModelRecommendation/ModelRecommendation.tsx',
      'client/src/features/model-intelligence/components/ModelRecommendation/ModelScoreCard.tsx',
      'client/src/features/preview/components/VisualPreview.tsx',
      'client/src/features/prompt-optimizer/PromptCanvas/components/PromptCanvasSuggestionsPanel.tsx',
      'client/src/features/prompt-optimizer/components/AssetsSidebar/AssetThumbnail.tsx',
      'client/src/features/prompt-optimizer/components/AssetsSidebar/AssetTypeSection.tsx',
      'client/src/features/prompt-optimizer/components/AssetsSidebar/AssetsSidebar.tsx',
      'client/src/features/prompt-optimizer/components/DetectedAssets/AssetChip.tsx',
      'client/src/features/prompt-optimizer/components/DetectedAssets/AssetPopover.tsx',
      'client/src/features/prompt-optimizer/components/DetectedAssets/DetectedAssets.tsx',
      'client/src/features/prompt-optimizer/components/GalleryPanel/GalleryThumbnail.tsx',
      'client/src/features/prompt-optimizer/components/GenerationPopover/PopoverDetail.tsx',
      'client/src/features/prompt-optimizer/components/GenerationPopover/PopoverPreview.tsx',
      'client/src/features/prompt-optimizer/components/GenerationPopover/PopoverThumbnailRail.tsx',
      'client/src/features/prompt-optimizer/components/MotionIdeasPanel.tsx',
      'client/src/features/prompt-optimizer/components/QuickCharacterCreate/ImageUploadGrid.tsx',
      'client/src/features/prompt-optimizer/components/QuickCharacterCreate/QuickCharacterCreate.tsx',
      'client/src/features/prompt-optimizer/components/ShotTimeline/WorkspaceShotTimeline.tsx',
      'client/src/features/prompt-optimizer/components/StyleReferenceControls/StyleReferenceControls.tsx',
      'client/src/features/prompt-optimizer/components/TriggerAutocomplete/TriggerAutocomplete.tsx',
      'client/src/features/prompt-optimizer/components/TriggerAutocomplete/TriggerSuggestion.tsx',
      'client/src/features/prompt-optimizer/components/VersionRow.tsx',
      'client/src/features/prompt-optimizer/components/VersionsPanel.tsx',
      'client/src/features/prompt-optimizer/components/coherence/CoherenceIssueCard.tsx',
      'client/src/features/prompt-optimizer/components/coherence/CoherencePanel.tsx',
      'client/src/features/reference-images/ReferenceImageLibrary.tsx',
      'client/src/features/workspace-shell/CanvasWorkspace.tsx',
      'client/src/features/workspace-shell/components/CanvasSettingsRow.tsx',
      'client/src/features/workspace-shell/components/EndFramePopover.tsx',
      'client/src/features/workspace-shell/components/FrameStage.tsx',
      'client/src/features/workspace-shell/components/GenTile.tsx',
      'client/src/features/workspace-shell/components/StartFramePopover.tsx',
      'client/src/features/workspace-shell/components/TuneDrawer.tsx',
      'client/src/features/workspace-shell/components/VideoReferencesPopover.tsx',
    ],
    rules: {
      'no-restricted-syntax': [
        'error',
        hookWholeObjectDependencyRestriction,
        {
          selector: "JSXOpeningElement[name.name='button']",
          message:
            'Raw <button> is banned in active client surfaces (ADR-0008). Use Button from @promptstudio/system/components/ui/button.',
        },
      ],
    },
  },
  // Guardrail (b): raw Tailwind palette classes are banned in active surfaces.
  {
    files: ['client/src/**/*.{js,jsx,ts,tsx}'],
    ignores: [
      ...designGuardrailFrozenAndTestIgnores,
      // Legacy raw-palette files — migration backlog. Migrate a file to
      // semantic tokens, then DELETE its entry here. Never add new entries.
      'client/src/PromptImprovementForm/PromptImprovementForm.tsx',
      'client/src/components/EmptyState.tsx',
      'client/src/components/ErrorBoundary/ErrorBoundary.tsx',
      'client/src/components/ErrorBoundary/FeatureErrorBoundary.tsx',
      'client/src/components/ToolSidebar/components/panels/GenerationControlsPanel/components/GenerationFooter.tsx',
      'client/src/components/ToolSidebar/components/panels/GenerationControlsPanel/components/VideoTabContent.tsx',
      'client/src/components/navigation/AppShell/shared/UserMenu.tsx',
      'client/src/features/model-intelligence/components/ModelRecommendation/RecommendationReasons.tsx',
      'client/src/features/model-intelligence/components/ModelRecommendation/ScoreBar.tsx',
      'client/src/features/span-highlighting/components/HighlightingErrorBoundary.tsx',
    ],
    rules: {
      'no-hardcoded-css/no-raw-palette': 'error',
    },
  },
];
