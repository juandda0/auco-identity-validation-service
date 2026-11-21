import js from '@eslint/js';
import tseslint from 'typescript-eslint';

const FRAMEWORKS = ['fastify', 'fastify-*', '@fastify/*', 'mongodb', '@aws-sdk/*'];

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules'] },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ['eslint.config.js'] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/restrict-template-expressions': ['error', { allowNumber: true }],
      // Fastify plugins and hooks are async by convention even when they do not await.
      '@typescript-eslint/require-await': 'off',
    },
  },
  // Layered architecture: dependencies only point inwards.
  //   presentation -> application -> domain
  //   infrastructure -> application (ports, errors) + domain
  // Only the composition root (src/container.ts) and the entry points know every layer.
  layer('src/domain/**', 'Domain is pure: no other layer, framework or database.', [
    ...forbid('application', 'infrastructure', 'presentation'),
    ...FRAMEWORKS,
    'zod',
  ]),
  layer('src/application/**', 'Application depends only on the domain and its own ports.', [
    ...forbid('infrastructure', 'presentation'),
    ...FRAMEWORKS,
    'zod',
  ]),
  layer('src/presentation/**', 'Presentation talks to application services, never to adapters.', [
    ...forbid('infrastructure'),
    'mongodb',
    '@aws-sdk/*',
  ]),
  layer('src/infrastructure/**', 'Infrastructure implements ports; it never knows about HTTP.', [
    ...forbid('presentation'),
    'fastify',
    'fastify-*',
    '@fastify/*',
  ]),
  {
    files: ['eslint.config.js'],
    ...tseslint.configs.disableTypeChecked,
  },
);

function forbid(...layers) {
  return layers.map((name) => `**/${name}/**`);
}

function layer(files, message, group) {
  return {
    files: [files],
    rules: { 'no-restricted-imports': ['error', { patterns: [{ group, message }] }] },
  };
}
