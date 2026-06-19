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
//    the @reqon/core ambient types in types/reqon-core.d.ts). Point at the core/ DIRECTORY (it has
//    its own package.json with "main": "crm-core.js"), NOT the file — extraNodeModules entries must
//    be directories, or the production/Release bundler (expo export:embed, used by `expo run:ios
//    --configuration Release`) fails to resolve them even though the dev server tolerates a file.
config.resolver.extraNodeModules = {
  '@reqon/core': path.resolve(monorepoRoot, 'core'),
};

module.exports = config;
