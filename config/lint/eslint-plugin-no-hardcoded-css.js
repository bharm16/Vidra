/**
 * ESLint Plugin: No Hardcoded CSS Values
 *
 * Detects hardcoded spacing and formatting values in inline styles (style={{ ... }}) that should
 * use design tokens instead.
 *
 * Focus: Spacing and formatting properties
 * Detects:
 * - Hardcoded pixel values in spacing properties (padding, margin, gap, etc.)
 * - Hardcoded pixel values in sizing properties (width, height, etc.)
 * - Hardcoded pixel values in positioning properties (top, bottom, left, right, etc.)
 */

export default {
  rules: {
    /**
     * no-arbitrary-color: Flags Tailwind arbitrary color values like bg-[#hex],
     * text-[#hex], border-[#hex] in className strings. These should use design
     * tokens from the Tailwind config instead.
     *
     * Allows: bg-[linear-gradient(...)], bg-[length:...], bg-[url(...)],
     * and non-color arbitrary values like w-[200px], h-[30px], text-[13px].
     */
    'no-arbitrary-color': {
      meta: {
        type: 'suggestion',
        docs: {
          description:
            'Disallow arbitrary hex colors in Tailwind className strings',
          category: 'Best Practices',
          recommended: true,
        },
        messages: {
          noArbitraryColor:
            'Arbitrary color "{{value}}" found. Use a design token class instead. See docs/DESIGN_TOKENS.md for the mapping.',
        },
        schema: [],
      },
      create(context) {
        // Matches Tailwind color utility patterns with [#hex]
        // e.g. bg-[#22252C], text-[#E2E6EF], border-[#1A1C22]/50
        const HEX_PATTERN =
          /(?:bg|text|border|ring|divide|decoration|from|to|via|caret|shadow|placeholder|outline|fill|stroke|accent)-\[#[0-9a-fA-F]{3,8}\]/g;

        function checkString(node, value) {
          if (typeof value !== 'string') return;
          // Allow linear-gradient which legitimately uses hex
          if (value.includes('linear-gradient')) return;

          let match;
          HEX_PATTERN.lastIndex = 0;
          while ((match = HEX_PATTERN.exec(value)) !== null) {
            context.report({
              node,
              messageId: 'noArbitraryColor',
              data: { value: match[0] },
            });
          }
        }

        return {
          Literal(node) {
            if (typeof node.value === 'string') {
              checkString(node, node.value);
            }
          },
          TemplateLiteral(node) {
            node.quasis.forEach((quasi) => {
              if (quasi.value?.raw) {
                checkString(quasi, quasi.value.raw);
              }
            });
          },
        };
      },
    },
    /**
     * no-raw-palette: Flags classic Tailwind palette classes (bg-red-500,
     * text-violet-600, border-amber-400/20, …) in className strings. The
     * design language is monochrome with semantic tokens (ADR-0008) — status
     * colors go through danger/success/warning tokens or the --badge-*
     * variables, chrome through surface/border/foreground tokens.
     *
     * Families the @promptstudio/system preset redefines as token-backed
     * (neutral, success, warning, error, info, primary, secondary, accent)
     * are NOT flagged — those resolve to CSS variables, not the raw palette.
     */
    'no-raw-palette': {
      meta: {
        type: 'suggestion',
        docs: {
          description:
            'Disallow raw Tailwind palette classes in favor of semantic design tokens (ADR-0008)',
          category: 'Best Practices',
          recommended: true,
        },
        messages: {
          noRawPalette:
            'Raw Tailwind palette class "{{value}}" found. Use semantic tokens instead (ADR-0008): danger/success/warning or --badge-* for status, surface/border/foreground tokens for chrome.',
        },
        schema: [],
      },
      create(context) {
        // Matches color-utility + classic palette family + numeric shade,
        // e.g. bg-red-500, hover:text-violet-600, border-amber-400/20.
        const PALETTE_PATTERN =
          /(?:bg|text|border|ring|divide|decoration|from|to|via|caret|shadow|placeholder|outline|fill|stroke|accent)-(?:red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|stone)-\d{2,3}\b/g;

        function checkString(node, value) {
          if (typeof value !== 'string') return;

          let match;
          PALETTE_PATTERN.lastIndex = 0;
          while ((match = PALETTE_PATTERN.exec(value)) !== null) {
            context.report({
              node,
              messageId: 'noRawPalette',
              data: { value: match[0] },
            });
          }
        }

        return {
          Literal(node) {
            if (typeof node.value === 'string') {
              checkString(node, node.value);
            }
          },
          TemplateLiteral(node) {
            node.quasis.forEach((quasi) => {
              if (quasi.value?.raw) {
                checkString(quasi, quasi.value.raw);
              }
            });
          },
        };
      },
    },
    /**
     * no-arbitrary-scale-value: Flags Tailwind arbitrary pixel values for the
     * two properties that have a complete token scale — font size and border
     * radius (e.g. text-[13.5px], rounded-[11px]).
     *
     * These accumulated to 16 distinct radii and 12 distinct font sizes on one
     * codebase because `no-arbitrary-color` only ever matched hex and
     * `no-hardcoded-css` only inspects style={{ }} objects — nothing looked at
     * className strings for sizes. Both are now at zero, so this rule holds the
     * line rather than reporting a backlog.
     *
     * Scope is deliberately narrow: h-/w-/px-/py- arbitrary values are often
     * legitimate artwork or layout dimensions with no token equivalent, so they
     * are not flagged.
     *
     * Matching is literal string inspection (startsWith/endsWith over
     * whitespace-split class tokens), not pattern matching.
     */
    'no-arbitrary-scale-value': {
      meta: {
        type: 'suggestion',
        docs: {
          description:
            'Disallow arbitrary px font-size/border-radius in Tailwind className strings',
          category: 'Best Practices',
          recommended: true,
        },
        messages: {
          noArbitraryType:
            'Arbitrary font size "{{value}}" found. Use the type scale: text-meta (12), text-ui (14), text-body (16), text-body-lg (18), text-subhead (20), text-heading (24).',
          noArbitraryRadius:
            'Arbitrary radius "{{value}}" found. Use the radius scale: rounded-xs (4), rounded-sm (6), rounded-md (10), rounded-lg (16), rounded-xl (24), rounded-full.',
        },
        schema: [],
      },
      create(context) {
        /** Split on whitespace without a pattern: normalize, then split. */
        function classTokens(value) {
          let normalized = value;
          for (const ws of ['\n', '\r', '\t']) {
            normalized = normalized.split(ws).join(' ');
          }
          return normalized.split(' ').filter(Boolean);
        }

        /** Strip variant prefixes (hover:, md:, dark:) and the ! modifier. */
        function bareClass(token) {
          const afterVariants = token.slice(token.lastIndexOf(':') + 1);
          return afterVariants.startsWith('!')
            ? afterVariants.slice(1)
            : afterVariants;
        }

        function checkString(node, value) {
          if (typeof value !== 'string') return;

          for (const token of classTokens(value)) {
            const cls = bareClass(token);
            // Only arbitrary values carrying a px unit; text-[color:...] and
            // similar non-px arbitrary values are left alone.
            if (!cls.endsWith('px]')) continue;

            if (cls.startsWith('text-[')) {
              context.report({
                node,
                messageId: 'noArbitraryType',
                data: { value: cls },
              });
            } else if (cls.startsWith('rounded') && cls.includes('-[')) {
              context.report({
                node,
                messageId: 'noArbitraryRadius',
                data: { value: cls },
              });
            }
          }
        }

        return {
          Literal(node) {
            if (typeof node.value === 'string') {
              checkString(node, node.value);
            }
          },
          TemplateLiteral(node) {
            node.quasis.forEach((quasi) => {
              if (quasi.value?.raw) {
                checkString(quasi, quasi.value.raw);
              }
            });
          },
        };
      },
    },
    'no-hardcoded-css': {
      meta: {
        type: 'problem',
        docs: {
          description: 'Disallow hardcoded CSS values in inline styles',
          category: 'Best Practices',
          recommended: true,
        },
        messages: {
          hardcodedSpacingValue:
            'Hardcoded spacing value "{{value}}" in {{property}} detected. Use spacing tokens from client/src/styles/tokens.ts (e.g., spacing.md, spacing.lg) or CSS variables instead.',
          hardcodedSizingValue:
            'Hardcoded sizing value "{{value}}" in {{property}} detected. Consider using design tokens or relative units (rem, em, %) instead.',
          hardcodedPositionValue:
            'Hardcoded position value "{{value}}" in {{property}} detected. Consider using spacing tokens or CSS variables instead.',
        },
        schema: [
          {
            type: 'object',
            properties: {
              allowPixelValues: {
                type: 'boolean',
                default: false,
              },
              allowedProperties: {
                type: 'array',
                items: {
                  type: 'string',
                },
                default: [],
              },
              // Properties that commonly need hardcoded values
              allowSmallValues: {
                type: 'boolean',
                default: true, // Allow 0px, 1px, 2px for borders, etc.
              },
            },
            additionalProperties: false,
          },
        ],
      },
      create(context) {
        const options = context.options[0] || {};
        const {
          allowPixelValues = false,
          allowedProperties = [],
          allowSmallValues = true,
        } = options;

        // Spacing properties that should use spacing tokens
        const spacingProperties = [
          'padding',
          'paddingTop',
          'paddingBottom',
          'paddingLeft',
          'paddingRight',
          'margin',
          'marginTop',
          'marginBottom',
          'marginLeft',
          'marginRight',
          'gap',
          'rowGap',
          'columnGap',
        ];

        // Sizing properties
        const sizingProperties = [
          'width',
          'height',
          'minWidth',
          'minHeight',
          'maxWidth',
          'maxHeight',
        ];

        // Position properties
        const positionProperties = ['top', 'bottom', 'left', 'right', 'inset'];

        /**
         * Check if a string value contains hardcoded spacing/formatting values
         */
        function checkStringValue(value, node, propertyName) {
          if (typeof value !== 'string') return;

          // Skip if property is in allowed list
          if (allowedProperties.includes(propertyName)) return;

          // Skip CSS variables and calc()
          if (/^var\(|^calc\(/.test(value.trim())) return;

          // Check for pixel values
          const pxMatch = value.trim().match(/^(\d+(?:\.\d+)?)px$/);
          if (!pxMatch) return; // Not a pixel value, skip

          const pixelValue = parseFloat(pxMatch[1]);

          // Allow small values if configured (0px, 1px, 2px for borders, etc.)
          if (allowSmallValues && pixelValue <= 2) return;

          // Skip if pixel values are allowed globally
          if (allowPixelValues) return;

          // Check spacing properties
          if (spacingProperties.includes(propertyName)) {
            context.report({
              node,
              messageId: 'hardcodedSpacingValue',
              data: { value: value.trim(), property: propertyName },
            });
            return;
          }

          // Check sizing properties
          if (sizingProperties.includes(propertyName)) {
            context.report({
              node,
              messageId: 'hardcodedSizingValue',
              data: { value: value.trim(), property: propertyName },
            });
            return;
          }

          // Check position properties
          if (positionProperties.includes(propertyName)) {
            context.report({
              node,
              messageId: 'hardcodedPositionValue',
              data: { value: value.trim(), property: propertyName },
            });
            return;
          }
        }

        /**
         * Traverse object expression (style={{ ... }})
         */
        function checkStyleObject(node) {
          if (!node.properties) return;

          node.properties.forEach((prop) => {
            if (prop.type === 'Property' || prop.type === 'ObjectProperty') {
              const key = prop.key;
              const value = prop.value;

              const propertyName = key.name || key.value;

              // Check string literal values
              if (value.type === 'Literal' && typeof value.value === 'string') {
                checkStringValue(value.value, value, propertyName);
              }

              // Check template literals
              if (value.type === 'TemplateLiteral') {
                // Check if template literal contains hardcoded values
                value.quasis.forEach((quasi) => {
                  if (quasi.value && quasi.value.raw) {
                    checkStringValue(quasi.value.raw, quasi, propertyName);
                  }
                });
              }
            }
          });
        }

        return {
          JSXAttribute(node) {
            // Check style={{ ... }} attributes
            if (
              node.name.name === 'style' &&
              node.value &&
              node.value.expression
            ) {
              const expression = node.value.expression;

              // Handle style={{ ... }}
              if (expression.type === 'ObjectExpression') {
                checkStyleObject(expression);
              }

              // Handle style={someVariable} where variable is an object
              // Note: This is harder to detect statically, so we focus on inline objects
            }
          },
        };
      },
    },
  },
};
