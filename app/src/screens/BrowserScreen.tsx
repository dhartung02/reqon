import { useRef, useState } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, Linking } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors, alpha, fonts } from '../theme';
import { getProfile, profileHasData, type Profile } from '../sync/profile';

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
  const ref = useRef<WebView>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string | null>(null);

  const fill = async () => {
    const p = await getProfile();
    if (!profileHasData(p)) {
      setMsg('Add your profile in Settings → Profile first.');
      return;
    }
    ref.current?.injectJavaScript(buildFillJs(p));
  };

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
          <Pressable onPress={() => Linking.openURL(url)} hitSlop={8}>
            <Text style={styles.ext}>Safari ↗</Text>
          </Pressable>
        </View>
      </View>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}
      <WebView
        ref={ref}
        source={{ uri: url }}
        onLoadEnd={() => setLoading(false)}
        onMessage={(e) => {
          try {
            const d = JSON.parse(e.nativeEvent.data);
            setMsg(d.error ? 'Fill error' : `Filled ${d.filled} of ${d.total} fields — review everything, then submit yourself.`);
          } catch {
            /* ignore */
          }
        }}
        style={styles.web}
      />
      {loading ? (
        <View style={styles.loader} pointerEvents="none">
          <ActivityIndicator color={colors.emerald} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: colors.canvas },
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.element,
  },
  back: { fontFamily: fonts.sans, fontSize: 15, fontWeight: '500', color: colors.emerald },
  barActions: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  fillBtn: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: alpha(colors.emerald, 0.1),
    borderWidth: 1,
    borderColor: alpha(colors.emerald, 0.4),
  },
  fillText: { fontFamily: fonts.sans, fontSize: 13, fontWeight: '600', color: colors.emerald },
  ext: { fontFamily: fonts.sans, fontSize: 13, color: colors.muted },
  msg: { fontFamily: fonts.sans, fontSize: 12, color: colors.textBase, paddingHorizontal: 16, paddingVertical: 8 },
  web: { flex: 1, backgroundColor: '#fff' },
  loader: { position: 'absolute', top: 80, left: 0, right: 0, alignItems: 'center' },
});
