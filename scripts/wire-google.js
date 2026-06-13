#!/usr/bin/env node
// ===========================================================================
// wire-google.js — one-shot setup for native iOS Google sign-in.
//
// Once you've added Firebase's GoogleService-Info.plist to the project, run:
//     node scripts/wire-google.js     (or: npm run wire-google)
//
// It reads CLIENT_ID + REVERSED_CLIENT_ID from that file and:
//   • sets CONFIG.googleIOSClientId in www/js/config.js
//   • sets the reversed-client-id URL scheme in ios/App/App/Info.plist
//   • adds GIDClientID to Info.plist (so the Google SDK can find it too)
// Then `npx cap sync ios` and rebuild in Xcode.
// ===========================================================================
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');

function findPlist(dir) {
  for (const name of fs.readdirSync(dir)) {
    if (name === 'node_modules' || name === '.git' || name === 'build') continue;
    const full = path.join(dir, name);
    let stat;
    try { stat = fs.statSync(full); } catch { continue; }
    if (stat.isDirectory()) { const f = findPlist(full); if (f) return f; }
    else if (name === 'GoogleService-Info.plist') return full;
  }
  return null;
}

const plist = findPlist(ROOT);
if (!plist) {
  console.error('\n❌ GoogleService-Info.plist not found in the project.\n');
  console.error('   1. Firebase console → Project settings → your iOS app');
  console.error('      (Add app → iOS, bundle id: com.flowstate31415.arduinotest, if you haven\'t).');
  console.error('   2. Download GoogleService-Info.plist and drop it into ios/App/App/.');
  console.error('   3. Re-run:  npm run wire-google\n');
  process.exit(1);
}
console.log('• Found:', path.relative(ROOT, plist));

let data;
try { data = JSON.parse(execSync(`plutil -convert json -o - "${plist}"`).toString()); }
catch (e) { console.error('Could not read the plist:', e.message); process.exit(1); }

const CLIENT_ID = data.CLIENT_ID;
const REVERSED = data.REVERSED_CLIENT_ID;
if (!CLIENT_ID || !REVERSED) { console.error('CLIENT_ID / REVERSED_CLIENT_ID missing from the plist.'); process.exit(1); }
console.log('• CLIENT_ID         =', CLIENT_ID);
console.log('• REVERSED_CLIENT_ID=', REVERSED);

// 1) config.js
const cfgPath = path.join(ROOT, 'www/js/config.js');
let cfg = fs.readFileSync(cfgPath, 'utf8');
cfg = cfg.replace(/googleIOSClientId:\s*'[^']*'/, `googleIOSClientId: '${CLIENT_ID}'`);
fs.writeFileSync(cfgPath, cfg);
console.log('✓ config.js  → googleIOSClientId set');

// 2) Info.plist — URL scheme (replace placeholder OR a previously-set reversed id)
const infoPath = path.join(ROOT, 'ios/App/App/Info.plist');
let info = fs.readFileSync(infoPath, 'utf8');
info = info.replace(/<string>com\.googleusercontent\.apps\.[A-Za-z0-9._-]+<\/string>/, `<string>${REVERSED}</string>`);
// add GIDClientID if not present
if (!/GIDClientID/.test(info)) {
  info = info.replace(/<key>UILaunchStoryboardName<\/key>/, `<key>GIDClientID</key>\n\t<string>${CLIENT_ID}</string>\n\t<key>UILaunchStoryboardName</key>`);
} else {
  info = info.replace(/(<key>GIDClientID<\/key>\s*<string>)[^<]*(<\/string>)/, `$1${CLIENT_ID}$2`);
}
fs.writeFileSync(infoPath, info);
console.log('✓ Info.plist → URL scheme + GIDClientID set');

console.log('\n✅ Done. Now run:  npx cap sync ios   then rebuild ▶ in Xcode.\n');
