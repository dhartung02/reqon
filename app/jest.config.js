// jest-expo runs the test suite through the same Babel/RN toolchain the app ships with.
// The @reqon/core alias is mapped to the repo-root shared module (the SAME file the server and
// extension use) so the vector suite proves app == server, not a copy.
const path = require('path');

module.exports = {
  preset: 'jest-expo',
  rootDir: __dirname,
  moduleNameMapper: {
    '^@reqon/core$': path.resolve(__dirname, '..', 'core', 'crm-core.js'),
  },
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
};
