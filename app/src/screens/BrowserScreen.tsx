import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Linking, Modal, ScrollView, TextInput } from 'react-native';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import { alpha, fonts, useThemedStyles, type Palette } from '../theme';
import { getProfile, profileHasData, type Profile, type SavedAnswer } from '../sync/profile';
import { bestAnswerMatch, filterAnswers } from '../answers';

// Tracks the last-focused text field in the page so a manually-picked answer fills the right one.
const FOCUS_TRACKER_JS = `(function(){if(window.__reqonFocus)return;window.__reqonFocus=1;
  document.addEventListener('focusin',function(e){var t=e.target;if(t&&(t.tagName==='TEXTAREA'||t.tagName==='INPUT'))window.__reqonLastField=t;},true);})();true;`;

// Insert one answer into the last-focused field (manual pick). Highlights; never submits.
const buildInsertJs = (text: string) => `(function(){try{
  var v=${JSON.stringify(text)};var el=window.__reqonLastField;
  if(!el||(el.tagName!=='TEXTAREA'&&el.tagName!=='INPUT')){window.ReactNativeWebView.postMessage(JSON.stringify({type:'insert',ok:false}));return;}
  var proto=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
  var d=Object.getOwnPropertyDescriptor(proto,'value');(d&&d.set?d.set:function(x){this.value=x;}).call(el,v);
  el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
  el.style.outline='2px solid #00E5A3';el.style.outlineOffset='1px';
  window.ReactNativeWebView.postMessage(JSON.stringify({type:'insert',ok:true}));
}catch(e){window.ReactNativeWebView.postMessage(JSON.stringify({type:'insert',ok:false,error:String(e)}));}})();true;`;

// Scan the page for empty free-text question fields, tag each, and report its label/signature so RN
// can keyword-match it to a saved answer.
const SCAN_QUESTIONS_JS = `(function(){try{
  var els=document.querySelectorAll('textarea, input[type=text], input:not([type])');var out=[];var i=0;
  els.forEach(function(el){var t=(el.type||'').toLowerCase();
    if(['password','email','tel','url','number','search'].indexOf(t)>=0)return;
    if(el.value&&el.value.trim())return;
    var sig=[el.name,el.id,el.placeholder,el.getAttribute('aria-label')];
    try{if(el.labels&&el.labels[0])sig.push(el.labels[0].textContent);}catch(e){}
    var s=sig.filter(Boolean).join(' ').trim();
    var isQ=el.tagName==='TEXTAREA'||/\\?|why|describe|tell us|cover|experience|interest|motivat/i.test(s);
    if(!isQ||!s)return;
    el.setAttribute('data-reqon-q',String(i));out.push({i:i,sig:s});i++;});
  window.ReactNativeWebView.postMessage(JSON.stringify({type:'scan',fields:out}));
}catch(e){window.ReactNativeWebView.postMessage(JSON.stringify({type:'scan',fields:[],error:String(e)}));}})();true;`;

// Fill the scanned fields RN matched (by tagged index). Highlights; never submits.
const buildAutoFillJs = (matches: { i: number; value: string }[]) => `(function(){try{
  var M=${JSON.stringify(matches)};var n=0;
  M.forEach(function(m){var el=document.querySelector('[data-reqon-q="'+m.i+'"]');if(!el)return;
    var proto=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
    var d=Object.getOwnPropertyDescriptor(proto,'value');(d&&d.set?d.set:function(x){this.value=x;}).call(el,m.value);
    el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));
    el.style.outline='2px solid #00E5A3';el.style.outlineOffset='1px';n++;});
  window.ReactNativeWebView.postMessage(JSON.stringify({type:'autofill',filled:n}));
}catch(e){window.ReactNativeWebView.postMessage(JSON.stringify({type:'autofill',filled:0,error:String(e)}));}})();true;`;

// After load, probe the page: if the body is effectively empty (no text, almost no elements) the
// posting refused to render in the embedded WebView (frame-busting, UA sniffing, dead link). Delayed
// so JS-rendered (SPA) pages get a chance to paint before we call it blank.
const BLANK_PROBE_JS = `(function(){try{
  setTimeout(function(){try{
    var b=document.body;
    var txt=b?((b.innerText||b.textContent||'').trim()):'';
    var els=b?b.querySelectorAll('*').length:0;
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'probe',len:txt.length,els:els}));
  }catch(e){}},800);
}catch(e){}})();true;`;

// Stock desktop Safari UA — a real, current Safari string with NO app identifier appended (we don't
// announce ourselves the way `applicationNameForUserAgent` would). Some portals serve a stripped or
// blank page to in-app/mobile UAs, so presenting as desktop Safari renders the real form reliably.
// Note: this is a desktop UA on a tablet, which is itself a minor inconsistency — chasing perfect
// fingerprint consistency is an arms race we deliberately don't pursue; this is just for rendering.
const DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Safari/605.1.15';

// In-app browser + apply-assist. Opens a posting in a WKWebView; "Fill" injects JS that fuzzy-
// matches form fields to the saved profile and fills the factual ones — highlighting its work and
// NEVER submitting. The candidate reviews + completes (résumé upload, EEO, consent, submit).

// Built per BRAND/roadmap guardrails: factual fields only; never password/EEO/consent; never submit.
const buildFillJs = (p: Profile) => {
  const a = p.applicant;
  const name = (a.name ?? '').trim();
  const parts = name.split(/\s+/).filter(Boolean);
  // Factual fields only — EEO/demographics in p.eeo are deliberately NOT included (never auto-filled).
  const profile = JSON.stringify({
    firstName: parts[0] ?? '',
    lastName: parts.length > 1 ? parts.slice(1).join(' ') : '',
    fullName: name,
    email: a.email ?? '',
    phone: a.phone ?? '',
    linkedin: a.linkedin ?? '',
    github: a.github ?? '',
    location: a.location ?? '',
    website: a.website ?? '',
  });
  return `(function(){try{
    var P=${profile};
    var FIELDS=[
      {keys:['given-name','first name','firstname','fname','first_name'],val:P.firstName},
      {keys:['family-name','last name','lastname','lname','last_name','surname'],val:P.lastName},
      {keys:['full name','your name','full_name','legal name'],val:P.fullName},
      {keys:['email','e-mail'],val:P.email,type:'email'},
      {keys:['phone','tel','mobile','telephone'],val:P.phone,type:'tel'},
      {keys:['linkedin','linked in'],val:P.linkedin},
      {keys:['github','git hub'],val:P.github},
      {keys:['location','city','where are you','current location'],val:P.location},
      {keys:['website','portfolio','personal site','personal website'],val:P.website}
    ];
    function sig(el){var p=[el.name,el.id,el.placeholder,el.getAttribute('aria-label'),el.getAttribute('autocomplete')];
      try{if(el.labels&&el.labels[0])p.push(el.labels[0].textContent);}catch(e){}
      return p.filter(Boolean).join(' ').toLowerCase();}
    function setVal(el,v){var proto=el.tagName==='TEXTAREA'?window.HTMLTextAreaElement.prototype:window.HTMLInputElement.prototype;
      var d=Object.getOwnPropertyDescriptor(proto,'value');(d&&d.set?d.set:function(x){this.value=x;}).call(el,v);
      el.dispatchEvent(new Event('input',{bubbles:true}));el.dispatchEvent(new Event('change',{bubbles:true}));}
    var els=document.querySelectorAll('input, textarea');var filled=0;
    els.forEach(function(el){
      var t=(el.type||'').toLowerCase();
      if(['password','file','hidden','submit','button','checkbox','radio','range','color'].indexOf(t)>=0)return;
      if(el.value&&el.value.trim())return;
      var s=sig(el);
      for(var i=0;i<FIELDS.length;i++){var f=FIELDS[i];if(!f.val)continue;
        if((f.type&&t===f.type)||f.keys.some(function(k){return s.indexOf(k)>=0;})){
          setVal(el,f.val);el.style.outline='2px solid #00E5A3';el.style.outlineOffset='1px';filled++;break;}}
    });
    window.ReactNativeWebView.postMessage(JSON.stringify({filled:filled,total:els.length}));
  }catch(e){window.ReactNativeWebView.postMessage(JSON.stringify({error:String(e)}));}})();true;`;
};

export function BrowserScreen({ url, onBack }: { url: string; onBack: () => void }) {
  const { c, styles } = useThemedStyles(makeStyles);
  const ref = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);
  const [answers, setAnswers] = useState<SavedAnswer[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [query, setQuery] = useState('');
  // Why the WebView body is blank, if it is — drives the fallback overlay. null = page is fine.
  const [failure, setFailure] = useState<{ title: string; detail: string } | null>(null);
  // Tracks the main-frame URL so HTTP errors from sub-resources don't trip the error state.
  const mainUrl = useRef(url);
  // Bump to force-remount the WebView on retry (clears stuck internal state).
  const [reloadKey, setReloadKey] = useState(0);
  // Browser-chrome state: history availability, the page being shown, load progress, and the
  // editable address bar. `uri` is the WebView source; typing a new address updates it.
  const [uri, setUri] = useState(url);
  const [canBack, setCanBack] = useState(false);
  const [canFwd, setCanFwd] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentUrl, setCurrentUrl] = useState(url);
  const [addr, setAddr] = useState(url);
  const addrFocused = useRef(false);
  // The apply-assist scripts are NOT injected at page load — the page runs untouched while you just
  // browse. The focus-tracker is installed only the first time you invoke a fill/answer action, and
  // is reset on every navigation (a new document wipes injected state anyway).
  const trackerInstalled = useRef(false);

  useEffect(() => {
    getProfile().then((p) => setAnswers(p.answers || []));
  }, []);

  const ensureTracker = () => {
    if (trackerInstalled.current) return;
    ref.current?.injectJavaScript(FOCUS_TRACKER_JS);
    trackerInstalled.current = true;
  };

  // Open in an in-app Safari view (SFSafariViewController): real Safari, shares its cookies/logins,
  // looks like Safari to the site — far higher compat than the embedded WebView for sites that block
  // it. Apply-assist can't run there (it's a sealed view), so this is the fallback path only. Always
  // acts on where the user actually is, not just the seed URL. Falls back to the system browser if
  // the in-app view can't open for any reason.
  const openExternal = async () => {
    const target = currentUrl || url;
    try {
      await WebBrowser.openBrowserAsync(target, { showInRecents: true });
    } catch {
      Linking.openURL(target);
    }
  };

  const retry = () => {
    setFailure(null);
    setMsg(null);
    setLoading(true);
    setReloadKey((k) => k + 1);
  };

  const goBack = () => canBack && ref.current?.goBack();
  const goForward = () => canFwd && ref.current?.goForward();
  const reloadOrStop = () => {
    if (loading) ref.current?.stopLoading();
    else { setFailure(null); ref.current?.reload(); }
  };

  // Turn whatever the user typed into a navigable URL: keep explicit schemes, https-prefix bare
  // domains, and fall back to a web search for free text — i.e. behave like a normal address bar.
  const submitAddress = () => {
    addrFocused.current = false;
    const raw = addr.trim();
    if (!raw) return;
    let next: string;
    if (/^https?:\/\//i.test(raw)) next = raw;
    else if (/^[^\s.]+\.[^\s]+$/.test(raw) && !raw.includes(' ')) next = 'https://' + raw;
    else next = 'https://www.google.com/search?q=' + encodeURIComponent(raw);
    setFailure(null);
    setLoading(true);
    setUri(next);
    setCurrentUrl(next);
  };

  const fill = async () => {
    const p = await getProfile();
    if (!profileHasData(p)) {
      setMsg('Add your profile in Settings → Profile first.');
      return;
    }
    ensureTracker();
    ref.current?.injectJavaScript(buildFillJs(p));
  };

  // Auto-match: scan the page; matching happens back in onMessage (keeps the tested matcher in TS).
  const autoMatch = () => {
    if (!answers.length) { setMsg('No saved answers yet — add some in Settings → Saved answers.'); return; }
    setPickerOpen(false);
    ref.current?.injectJavaScript(SCAN_QUESTIONS_JS);
  };

  const insert = (a: SavedAnswer) => {
    setPickerOpen(false);
    ref.current?.injectJavaScript(buildInsertJs(a.a));
  };

  const onMessage = (raw: string) => {
    let d: Record<string, unknown>;
    try { d = JSON.parse(raw); } catch { return; }
    const type = d.type as string | undefined;
    if (type === 'scan') {
      const fields = (d.fields as { i: number; sig: string }[]) || [];
      const matches = fields
        .map((f) => { const a = bestAnswerMatch(f.sig, answers); return a ? { i: f.i, value: a.a } : null; })
        .filter(Boolean) as { i: number; value: string }[];
      if (!matches.length) { setMsg('No confident answer matches — tap a field, then “Insert answer” to choose one.'); return; }
      ref.current?.injectJavaScript(buildAutoFillJs(matches));
    } else if (type === 'probe') {
      // Empty body after load = the posting refused to render embedded. Offer the external browser.
      const len = (d.len as number) ?? 0;
      const els = (d.els as number) ?? 0;
      if (!failure && len < 2 && els < 4) {
        setFailure({
          title: 'This page didn’t render here',
          detail:
            'The posting wouldn’t load inside the app — some application sites block embedded browsers. Open it in your browser to apply.',
        });
      }
    } else if (type === 'autofill') {
      setMsg(`Auto-filled ${d.filled} answer field(s) — review every one before submitting.`);
    } else if (type === 'insert') {
      setMsg(d.ok ? 'Inserted into the focused field — review it.' : 'Tap a form field first, then pick an answer.');
    } else {
      setMsg(d.error ? 'Fill error' : `Filled ${d.filled} of ${d.total} fields — review everything, then submit yourself.`);
    }
  };

  const shown = filterAnswers(answers, query, []);

  return (
    <View style={styles.wrap}>
      <View style={styles.bar}>
        <Pressable onPress={onBack} hitSlop={8}>
          <Text style={styles.back}>‹ Back</Text>
        </Pressable>
        <View style={styles.barActions}>
          <Pressable onPress={fill} style={styles.fillBtn}>
            <Text style={styles.fillText}>Fill form</Text>
          </Pressable>
          <Pressable onPress={() => { ensureTracker(); setQuery(''); setPickerOpen(true); }} style={styles.fillBtn}>
            <Text style={styles.fillText}>Answers</Text>
          </Pressable>
          <Pressable onPress={openExternal} hitSlop={8}>
            <Text style={styles.ext}>↗</Text>
          </Pressable>
        </View>
      </View>
      <View style={styles.navBar}>
        <Pressable onPress={goBack} disabled={!canBack} hitSlop={6} style={styles.navBtn}>
          <Text style={[styles.navIcon, !canBack && styles.navIconOff]}>‹</Text>
        </Pressable>
        <Pressable onPress={goForward} disabled={!canFwd} hitSlop={6} style={styles.navBtn}>
          <Text style={[styles.navIcon, !canFwd && styles.navIconOff]}>›</Text>
        </Pressable>
        <TextInput
          value={addr}
          onChangeText={setAddr}
          onFocus={() => { addrFocused.current = true; }}
          onBlur={() => { addrFocused.current = false; setAddr(currentUrl); }}
          onSubmitEditing={submitAddress}
          placeholder="Search or enter address"
          placeholderTextColor={c.muted}
          style={styles.addr}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          selectTextOnFocus
          numberOfLines={1}
        />
        <Pressable onPress={reloadOrStop} hitSlop={6} style={styles.navBtn}>
          <Text style={styles.navIcon}>{loading ? '✕' : '⟳'}</Text>
        </Pressable>
      </View>
      <View style={styles.progressTrack}>
        {loading && progress < 1 ? (
          <View style={[styles.progressBar, { width: `${Math.max(4, progress * 100)}%` }]} />
        ) : null}
      </View>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}
      <View style={styles.webWrap}>
        <WebView
          key={reloadKey}
          ref={ref}
          source={{ uri }}
          // No scripts injected at load — the page runs untouched until you tap Fill/Answers.
          userAgent={DESKTOP_UA}
          // Persistent, shared cookie jar so a login survives across pages and app launches.
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          domStorageEnabled
          cacheEnabled
          incognito={false}
          javaScriptEnabled
          originWhitelist={['*']}
          // Apply pages that open the form in a new window would otherwise blank the view.
          setSupportMultipleWindows={false}
          allowsBackForwardNavigationGestures
          startInLoadingState
          onLoadStart={(e) => {
            mainUrl.current = e.nativeEvent.url;
            trackerInstalled.current = false; // new document — assist state is gone, re-arm on demand
            setFailure(null);
            setLoading(true);
            setProgress(0);
          }}
          onLoadProgress={(e) => setProgress(e.nativeEvent.progress)}
          onNavigationStateChange={(nav) => {
            setCanBack(nav.canGoBack);
            setCanFwd(nav.canGoForward);
            setCurrentUrl(nav.url);
            if (!addrFocused.current) setAddr(nav.url);
          }}
          onLoadEnd={() => {
            setLoading(false);
            setProgress(1);
            ref.current?.injectJavaScript(BLANK_PROBE_JS);
          }}
          onError={(e) => {
            const { description } = e.nativeEvent;
            setLoading(false);
            setFailure({
              title: 'Couldn’t load this page',
              detail: (description || 'The page failed to load.') + ' Check your connection or open it in your browser.',
            });
          }}
          onHttpError={(e) => {
            const { statusCode, url: failedUrl } = e.nativeEvent;
            // Only main-document failures — ignore sub-resource 4xx/5xx noise.
            if (statusCode < 400 || (failedUrl && failedUrl !== mainUrl.current)) return;
            setLoading(false);
            setFailure({
              title: `This posting returned ${statusCode}`,
              detail:
                statusCode === 404
                  ? 'The job link looks dead (404) — the req may have been filled or pulled. Open it in your browser to confirm.'
                  : 'The site returned an error. Open it in your browser to apply.',
            });
          }}
          onMessage={(e) => onMessage(e.nativeEvent.data)}
          style={styles.web}
        />
        {loading && !failure ? (
          <View style={styles.loader} pointerEvents="none">
            <ActivityIndicator color={c.emerald} />
          </View>
        ) : null}
        {failure ? (
          <View style={styles.errorOverlay}>
            <Text style={styles.errorTitle}>{failure.title}</Text>
            <Text style={styles.errorDetail}>{failure.detail}</Text>
            <Pressable style={styles.primaryBtn} onPress={openExternal}>
              <Text style={styles.primaryBtnText}>Open in browser ↗</Text>
            </Pressable>
            <Pressable style={styles.secondaryBtn} onPress={retry}>
              <Text style={styles.secondaryBtnText}>Try again</Text>
            </Pressable>
          </View>
        ) : null}
      </View>

      <Modal visible={pickerOpen} animationType="slide" transparent onRequestClose={() => setPickerOpen(false)}>
        <View style={styles.backdrop}>
          <View style={styles.sheet}>
            <View style={styles.sheetHead}>
              <Text style={styles.sheetTitle}>Insert a saved answer</Text>
              <Pressable onPress={() => setPickerOpen(false)} hitSlop={8}>
                <Text style={styles.fillText}>Done</Text>
              </Pressable>
            </View>
            <Pressable style={styles.autoBtn} onPress={autoMatch}>
              <Text style={styles.autoText}>Auto-match this form</Text>
            </Pressable>
            <Text style={styles.autoNote}>Or tap a field in the form, then pick an answer to insert there.</Text>
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search answers…"
              placeholderTextColor={c.muted}
              style={styles.search}
              autoCorrect={false}
            />
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {answers.length === 0 ? (
                <Text style={styles.empty}>No saved answers yet — add some in Settings → Saved answers.</Text>
              ) : shown.length === 0 ? (
                <Text style={styles.empty}>No answers match.</Text>
              ) : (
                shown.map((a) => (
                  <Pressable key={a.id} style={styles.ansRow} onPress={() => insert(a)}>
                    <Text style={styles.ansQ} numberOfLines={1}>{a.q || '(untitled)'}</Text>
                    <Text style={styles.ansA} numberOfLines={2}>{a.a}</Text>
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const makeStyles = (c: Palette) => StyleSheet.create({
  wrap: { flex: 1, backgroundColor: c.canvas },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: c.element,
  },
  back: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '500', color: c.emerald },
  barActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  fillBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: alpha(c.emerald, 0.1),
    borderWidth: 1,
    borderColor: alpha(c.emerald, 0.4),
  },
  fillText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: c.emerald },
  ext: { fontFamily: fonts.sans, fontSize: 13, color: c.muted },
  navBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: c.element,
  },
  navBtn: { width: 30, height: 30, alignItems: 'center', justifyContent: 'center', borderRadius: 8 },
  navIcon: { fontFamily: fonts.sans, fontSize: 22, lineHeight: 24, color: c.emerald },
  navIconOff: { color: alpha(c.muted, 0.4) },
  addr: {
    flex: 1,
    backgroundColor: c.element,
    borderRadius: 9,
    paddingHorizontal: 12,
    paddingVertical: 7,
    color: c.textHigh,
    fontFamily: fonts.sans,
    fontSize: 13,
  },
  progressTrack: { height: 2, backgroundColor: 'transparent' },
  progressBar: { height: 2, backgroundColor: c.emerald },
  msg: { fontFamily: fonts.sans, fontSize: 12, color: c.textBase, paddingHorizontal: 16, paddingVertical: 8 },
  webWrap: { flex: 1, position: 'relative' },
  web: { flex: 1, backgroundColor: '#fff' },
  loader: { position: 'absolute', top: 80, left: 0, right: 0, alignItems: 'center' },
  errorOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: c.canvas,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 14,
  },
  errorTitle: { fontFamily: fonts.serif, fontSize: 20, fontWeight: '600', color: c.textHigh, textAlign: 'center' },
  errorDetail: { fontFamily: fonts.sans, fontSize: 14, color: c.textBase, textAlign: 'center', lineHeight: 20 },
  primaryBtn: {
    marginTop: 6,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: alpha(c.emerald, 0.12),
    borderWidth: 1,
    borderColor: alpha(c.emerald, 0.5),
  },
  primaryBtnText: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '700', color: c.emerald },
  secondaryBtn: { paddingHorizontal: 16, paddingVertical: 8 },
  secondaryBtnText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: c.muted },
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: c.canvas,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 28,
    maxHeight: '80%',
    gap: 12,
  },
  sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sheetTitle: { fontFamily: fonts.serif, fontSize: 20, fontWeight: '600', color: c.textHigh },
  autoBtn: { backgroundColor: alpha(c.emerald, 0.1), borderWidth: 1, borderColor: alpha(c.emerald, 0.4), borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  autoText: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: c.emerald },
  autoNote: { fontFamily: fonts.sans, fontSize: 12, color: c.muted, lineHeight: 17 },
  search: { backgroundColor: c.element, borderRadius: 10, paddingHorizontal: 13, paddingVertical: 10, color: c.textHigh, fontFamily: fonts.sans, fontSize: 14 },
  list: { maxHeight: 360 },
  empty: { fontFamily: fonts.sans, fontSize: 13, color: c.muted, paddingVertical: 12 },
  ansRow: { paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: alpha(c.muted, 0.18) },
  ansQ: { fontFamily: fonts.sans, fontSize: 14, fontWeight: '600', color: c.textHigh },
  ansA: { fontFamily: fonts.sans, fontSize: 13, color: c.textBase, marginTop: 2, lineHeight: 18 },
});
