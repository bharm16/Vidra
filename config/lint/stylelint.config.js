/**
 * Stylelint Configuration
 *
 * Lints CSS files to detect hardcoded spacing and formatting values that should use design tokens instead.
 */

export default {
  extends: ["stylelint-config-standard"],
  rules: {
    // Disable formatting/style rules - focus only on hardcoded values
    "declaration-block-single-line-max-declarations": null,
    "at-rule-empty-line-before": null,
    "rule-empty-line-before": null,
    "comment-empty-line-before": null,
    "declaration-empty-line-before": null,
    "selector-pseudo-element-colon-notation": null,
    "keyframe-selector-notation": null,
    "selector-attribute-quotes": null,
    "no-descending-specificity": null,
    "property-no-vendor-prefix": null,
    "selector-no-vendor-prefix": null,
    "media-feature-range-notation": null,
    "font-family-name-quotes": null,
    "declaration-block-no-duplicate-custom-properties": null,
    "declaration-block-no-shorthand-property-overrides": null,
    "property-no-deprecated": null,
    "declaration-property-value-keyword-no-deprecated": null,
    "length-zero-no-unit": null,
    "number-max-precision": null,
    "value-keyword-case": null,
    "no-duplicate-selectors": null,

    // Allow Tailwind directives
    "at-rule-no-unknown": [
      true,
      {
        ignoreAtRules: [
          "tailwind",
          "apply",
          "variants",
          "responsive",
          "screen",
          "layer",
        ],
      },
    ],

    // Allow @import after other statements (needed for Tailwind)
    "no-invalid-position-at-import-rule": null,

    // Disallow hardcoded pixel values in spacing and formatting properties
    "declaration-property-value-disallowed-list": {
      "/^(padding|margin|gap)$/": [
        /^(?![012]px$)(?![0-9]{4,}px$)\d+px$/,
        /^(?![012]px$)(?![0-9]{4,}px$)\d+\.\d+px$/,
      ],
      "/^(padding|margin)-(top|bottom|left|right)$/": [
        /^(?![012]px$)(?![0-9]{4,}px$)\d+px$/,
        /^(?![012]px$)(?![0-9]{4,}px$)\d+\.\d+px$/,
      ],
      "/^border-radius$/": [
        /^(?![012]px$)(?![0-9]{4,}px$)\d+px$/,
        /^(?![012]px$)(?![0-9]{4,}px$)\d+\.\d+px$/,
      ],
    },

    // Allow Tailwind arbitrary values in selectors
    "selector-class-pattern": null,

    // Relax some rules for Tailwind compatibility
    "property-no-unknown": [
      true,
      {
        ignoreProperties: ["ring", "ring-offset", "ring-color", "ring-width"],
      },
    ],
    "declaration-block-no-redundant-longhand-properties": null,
    "declaration-block-no-duplicate-properties": null,
    "import-notation": null,

    // Allow CSS custom properties
    "custom-property-pattern": null,

    // Keep color formatting out of scope for this lint profile
    "color-function-notation": null,
    "color-function-alias-notation": null,
    "alpha-value-notation": null,
    "color-hex-length": null,
    "color-named": null,

    // Keep calc spacing operators explicit
    "function-calc-no-unspaced-operator": true,
  },
  ignoreFiles: ["**/node_modules/**", "**/dist/**", "**/build/**"],
};
