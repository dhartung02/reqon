// Metro config for the Reqon app inside the monorepo. The app lives in app/ but imports the
// shared logic from the repo-root core/ — so Metro must watch one level up and be told how to
// resolve the @reqon/core alias to that single source of truth (see core/crm-core.js).
const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, '..');

const config = getDefaultConfig(projectRoot);

// 1. Watch the monorepo root so Metro can bundle files outside app/ (i.e. core/).
config.watchFolders = [monorepoRoot];

// 2. Resolve modules from the app first, then the repo root.
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, 'node_modules'),
  path.resolve(monorepoRoot, 'node_modules'),
];

// 3. The shared core — imported verbatim, never re-ported (mirrors jest moduleNameMapper +
//    the @reqon/core ambient types in types/reqon-core.d.ts).
config.resolver.extraNodeModules = {
  '@reqon/core': path.resolve(monorepoRoot, 'core', 'crm-core.js'),
};

module.exports = config;
