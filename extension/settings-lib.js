const CLOUD_ORIGIN_FALLBACK = 'https://cloud.reqon.app';

function resolveBoardOrigin({ preset, draftOrigin, savedOrigin, cloudOrigin }) {
  const cloud = (cloudOrigin || CLOUD_ORIGIN_FALLBACK).replace(/\/$/, '');
  if (preset === 'cloud') return cloud;
  const draft = String(draftOrigin || '').trim().replace(/\/$/, '');
  if (draft) return draft;
  const saved = String(savedOrigin || '').trim().replace(/\/$/, '');
  return saved || cloud;
}

function buildLocalPrefsPatch({ overlayEnabled, notifyEnabled }) {
  const patch = {};
  if (typeof overlayEnabled === 'boolean') patch.overlayEnabled = overlayEnabled;
  if (typeof notifyEnabled === 'boolean') patch.notifyEnabled = notifyEnabled;
  return patch;
}

if (typeof module !== 'undefined') module.exports = { resolveBoardOrigin, buildLocalPrefsPatch };
