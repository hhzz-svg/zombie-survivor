import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Lint rules chosen for what this codebase actually is: a deterministic simulation with a
 * rendering layer bolted on. The type-aware rules are the ones that pay for themselves — most
 * of what could break here is a floating promise or a silently-any value, not formatting.
 *
 * Two project-specific rules carry real weight:
 *  - `no-restricted-globals` on Math.random and Date.now inside src/: the whole headless
 *    harness, the seed-sharing feature and the daily challenge rest on the simulation being a
 *    pure function of its seed. One stray Math.random in a system breaks all three at once,
 *    silently, and only shows up as a flaky test much later.
 *  - `no-restricted-imports` on localStorage access outside save.ts, for the same reason the
 *    save layer was consolidated: persistence with nine entry points has no version story.
 */
export default tseslint.config(
  // The asset-prep scripts are one-off .mjs utilities that never ship; they are not worth typing.
  { ignores: ['dist/**', 'node_modules/**', 'tools/**/*.mjs', 'eslint.config.js'] },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Both projects: the browser one (src + tests) and the node one (tools + build config).
        // Keeping them apart is what stops game code from quietly reaching for node APIs.
        project: ['./tsconfig.json', './tsconfig.tools.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Unused code is either a mistake or a leftover; both are worth seeing.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // The codebase leans on `!` in hot paths where the invariant is local and obvious.
      '@typescript-eslint/no-non-null-assertion': 'off',
      // Template literals over numbers are everywhere in the HUD and read fine.
      '@typescript-eslint/restrict-template-expressions': 'off',
      'eqeqeq': ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // The simulation must stay a pure function of its seed. The exemptions are the layers
    // that are allowed to be wall-clock driven because nothing reads them back: the two
    // presentation layers, and seed.ts, whose whole job is to mint a seed in the first place.
    // src/game.ts came off this list once world rendering moved to src/render/worldRenderer.ts.
    files: ['src/**/*.ts'],
    ignores: ['src/render/**', 'src/fx/**', 'src/seed.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        {
          object: 'Math',
          property: 'random',
          message: 'Simulation code must draw from ctx.rng — Math.random breaks seed sharing, the daily challenge and every headless measurement.',
        },
        {
          object: 'Date',
          property: 'now',
          message: 'Simulation code must read ctx.time.elapsed — wall-clock time is not reproducible.',
        },
        {
          object: 'performance',
          property: 'now',
          message: 'Simulation code must read ctx.time.elapsed — wall-clock time is not reproducible.',
        },
      ],
    },
  },
  {
    // Persistence has exactly one owner.
    files: ['src/**/*.ts'],
    ignores: ['src/save.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'localStorage', message: 'Go through save.ts — persistence needs one version story, not nine.' },
      ],
    },
  },
  {
    // Measurement scripts and tests print on purpose and construct deliberately odd data.
    files: ['tools/**/*.ts', 'tests/**/*.ts'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      '@typescript-eslint/no-unsafe-argument': 'off',
      '@typescript-eslint/no-unsafe-call': 'off',
    },
  },
);
