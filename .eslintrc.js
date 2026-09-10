module.exports = {
  env: {
    browser: true,
    es2021: true,
  },
  extends: [
    '@antfu/eslint-config-vue',
    'plugin:vue/vue3-recommended',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'plugin:promise/recommended',
    'plugin:sonarjs/recommended',
    'plugin:@typescript-eslint/recommended',

    // 'plugin:unicorn/recommended',
  ],
  parser: 'vue-eslint-parser',
  parserOptions: {
    ecmaVersion: 13,
    parser: '@typescript-eslint/parser',
    sourceType: 'module',
  },
  plugins: [
    'vue',
    '@typescript-eslint',
    'regex',
  ],
  // Framework internals retain their upstream conventions; lint the app code.
  ignorePatterns: ['src/@core/**', 'src/@layouts/**', 'src/@iconify/**', 'node_modules', 'dist', '*.d.ts'],
  rules: {
    'no-console': process.env.NODE_ENV === 'production' ? 'warn' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'warn' : 'off',

    // indentation (Already present in TypeScript)
    'comma-spacing': ['error', { before: false, after: true }],
    'key-spacing': ['error', { afterColon: true }],

    'vue/first-attribute-linebreak': ['error', {
      singleline: 'beside',
      multiline: 'below',
    }],

    'antfu/top-level-function': 'off',

    // indentation (Already present in TypeScript)
    'indent': ['error', 2, { SwitchCase: 1 }],

    // typescript-eslint/indent disagrees with eslint/indent on array-in-ternary edge cases.
    // Disable the TS one; the base rule covers TS files too.
    '@typescript-eslint/indent': 'off',

    // not all returns benefit from a leading blank line (especially short-circuit early returns)
    'newline-before-return': 'off',

    // confirm()/prompt() are intentional in delete dialogs — tracked for replacement
    // with VDialog confirmations as a UX polish pass, but not a CI gate.
    'no-alert': 'off',

    // Enforce trailing comma (Already present in TypeScript)
    'comma-dangle': ['error', 'always-multiline'],

    // Enforce consistent spacing inside braces of object (Already present in TypeScript)
    'object-curly-spacing': ['error', 'always'],

    // Disable max-len
    'max-len': 'off',

    // we don't want it
    'semi': ['error', 'never'],

    // add parens ony when required in arrow function
    'arrow-parens': ['error', 'as-needed'],

    // newline-before-return is set above as 'off'

    // add new line above comment
    'lines-around-comment': [
      'error',
      {
        beforeBlockComment: true,
        beforeLineComment: true,
        allowBlockStart: true,
        allowClassStart: true,
        allowObjectStart: true,
        allowArrayStart: true,
      },
    ],

    // Ignore _ as unused variable
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_+$', varsIgnorePattern: '^_+$' }],

    // Some API responses still lack types while backend contracts are migrated.
    '@typescript-eslint/no-explicit-any': 'off',

    // Compact handler patterns like `() => { loadA(); loadB() }` are idiomatic here.
    'max-statements-per-line': ['error', { max: 4 }],

    // Vue 3.3+ macros may register identifiers that aren't visible to the linter.
    'no-undef': 'off',

    'array-element-newline': ['error', 'consistent'],
    'array-bracket-newline': ['error', 'consistent'],

    'vue/multi-word-component-names': 'off',

    'padding-line-between-statements': [
      'error',
      { blankLine: 'always', prev: 'expression', next: 'const' },
      { blankLine: 'always', prev: 'const', next: 'expression' },
      { blankLine: 'always', prev: 'multiline-const', next: '*' },
      { blankLine: 'always', prev: '*', next: 'multiline-const' },
    ],

    // Plugin: eslint-plugin-import
    'import/prefer-default-export': 'off',
    'import/newline-after-import': ['error', { count: 1 }],
    'no-restricted-imports': ['error', 'vuetify/components'],

    // For omitting extension for ts files
    'import/extensions': [
      'error',
      'ignorePackages',
      {
        js: 'never',
        jsx: 'never',
        ts: 'never',
        tsx: 'never',
      },
    ],

    // ignore virtual files
    'import/no-unresolved': [2, {
      ignore: [
        '~pages$',
        'virtual:generated-layouts',

        // Ignore vite's ?raw imports
        '.*\?raw',
      ],
    }],

    // Thanks: https://stackoverflow.com/a/63961972/10796681
    'no-shadow': 'off',
    '@typescript-eslint/no-shadow': ['error'],

    '@typescript-eslint/consistent-type-imports': 'error',

    // Plugin: eslint-plugin-promise
    'promise/always-return': 'off',
    'promise/catch-or-return': 'off',

    // ESLint plugin vue
    'vue/block-tag-newline': 'error',
    'vue/component-api-style': 'error',
    'vue/component-name-in-template-casing': ['error', 'PascalCase', { registeredComponentsOnly: false }],
    'vue/custom-event-name-casing': ['error', 'camelCase', {
      ignores: [
        '/^(click):[a-z]+((\d)|([A-Z0-9][a-z0-9]+))*([A-Z])?/',
      ],
    }],
    'vue/define-macros-order': 'error',
    'vue/html-comment-content-newline': 'error',
    'vue/html-comment-content-spacing': 'error',
    'vue/html-comment-indent': 'error',
    'vue/match-component-file-name': 'error',
    'vue/no-child-content': 'error',
    'vue/require-default-prop': 'off',

    // NOTE this rule only supported in SFC,  Users of the unplugin-vue-define-options should disable that rule: https://github.com/vuejs/eslint-plugin-vue/issues/1886
    // 'vue/no-duplicate-attr-inheritance': 'error',
    'vue/no-empty-component-block': 'error',
    'vue/no-multiple-objects-in-class': 'error',
    'vue/no-reserved-component-names': 'error',
    'vue/no-template-target-blank': 'error',
    'vue/no-useless-mustaches': 'error',
    'vue/no-useless-v-bind': 'error',
    'vue/padding-line-between-blocks': 'error',
    'vue/prefer-separate-static-class': 'error',
    'vue/prefer-true-attribute-shorthand': 'error',
    'vue/v-on-function-call': 'error',
    'vue/no-restricted-class': ['error', '/^(p|m)(l|r)-/'],
    'vue/valid-v-slot': ['error', {
      allowModifiers: true,
    }],

    // -- Extension Rules
    'vue/no-irregular-whitespace': 'error',
    'vue/template-curly-spacing': 'error',

    // -- Sonarlint
    'sonarjs/no-duplicate-string': 'off',
    'sonarjs/no-nested-template-literals': 'off',

    // -- Unicorn
    // 'unicorn/filename-case': 'off',
    // 'unicorn/prevent-abbreviations': ['error', {
    //   replacements: {
    //     props: false,
    //   },
    // }],

    // https://github.com/gmullerb/eslint-plugin-regex
    'regex/invalid': [
      'error',
      [
        {
          regex: '@/assets/images',
          replacement: '@images',
          message: 'Use \'@images\' path alias for image imports',
        },
        {
          regex: '@/styles',
          replacement: '@styles',
          message: 'Use \'@styles\' path alias for importing styles from \'src/styles\'',
        },

        // {
        //   id: 'Disallow icon of icon library',
        //   regex: 'tabler-\\w',
        //   message: 'Only \'mdi\' icons are allowed',
        // },

        {
          regex: '@core/\\w',
          message: 'You can\'t use @core when you are in @layouts module',
          files: {
            inspect: '@layouts/.*',
          },
        },
        {
          regex: 'useLayouts\\(',
          message: '`useLayouts` composable is only allowed in @layouts & @core directory. Please use `useThemeConfig` composable instead.',
          files: {
            inspect: '^(?!.*(@core|@layouts)).*',
          },
        },
        {
          regex: 'import axios from \'axios\'',
          replacement: 'import axios from \'@/plugins/axios\'',
          message: 'Use the configured axios instance from \'@/plugins/axios\' instead of the bare npm package',
          files: {
            // Skip this file itself — pattern is OS-agnostic (matches `/` or `\`).
            ignore: 'plugins[\\\\/]axios\\.ts',
          },
        },
      ],

      // Ignore files
      '\.eslintrc\.js',
    ],
  },
  settings: {
    'import/resolver': {
      node: {
        extensions: ['.ts', '.js', '.tsx', '.jsx', '.mjs', '.png', '.jpg'],
      },
      typescript: {},
    },
  },
}
