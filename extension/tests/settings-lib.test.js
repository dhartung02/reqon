const test = require('node:test');
const assert = require('node:assert');
const {
  resolveBoardOrigin,
  buildLocalPrefsPatch,
} = require('../settings-lib.js');

test('resolveBoardOrigin prefers the current draft settings over the saved origin', () => {
  assert.strictEqual(
    resolveBoardOrigin({
      preset: 'personal',
      draftOrigin: ' https://preview.reqon.local/ ',
      savedOrigin: 'https://cloud.reqon.app',
      cloudOrigin: 'https://cloud.reqon.app',
    }),
    'https://preview.reqon.local'
  );
  assert.strictEqual(
    resolveBoardOrigin({
      preset: 'cloud',
      draftOrigin: 'https://ignored.example.com',
      savedOrigin: 'https://preview.reqon.local',
      cloudOrigin: 'https://cloud.reqon.app',
    }),
    'https://cloud.reqon.app'
  );
});

test('buildLocalPrefsPatch persists local toggles without requiring auth state', () => {
  assert.deepStrictEqual(
    buildLocalPrefsPatch({ overlayEnabled: false, notifyEnabled: true }),
    { overlayEnabled: false, notifyEnabled: true }
  );
  assert.deepStrictEqual(
    buildLocalPrefsPatch({ overlayEnabled: true }),
    { overlayEnabled: true }
  );
});
