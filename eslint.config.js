import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'coverage', 'playwright-report', 'terraform'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
    },
  },
  {
    // Guardrail for the rule that matters most: features must not reach past
    // the repository layer to Firebase. See docs/AGENTS.md.
    files: ['src/features/**', 'src/ui/**', 'src/domain/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['firebase', 'firebase/*'],
              message:
                'Import Firebase only in src/repositories or src/lib. Features depend on repository interfaces.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/domain/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['react', 'react-dom', 'firebase', 'firebase/*', 'zustand'],
              message: 'src/domain must stay pure TypeScript — no framework imports.',
            },
          ],
        },
      ],
    },
  },
);
