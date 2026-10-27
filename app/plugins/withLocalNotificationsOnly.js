// expo-notifications also pulls in Firebase push (FCM) pieces and launcher-badge permissions. Pantry Chef only uses LOCAL timer
// notifications, so remove everything push/badge related from the merged manifest (tools:node="remove").
// v0.0.4: also removes the inert FirebaseInitProvider and the dead BOOT_COMPLETED/REBOOT/QUICKBOOT intent-filter actions on NotificationsService
// (the receiver stays: it delivers scheduled local notifications; NOTIFICATION_EVENT and MY_PACKAGE_REPLACED actions are kept).
// v0.0.5: also removes the inert Firebase Messaging registrars from Firebase's ComponentDiscoveryService (nothing uses FCM).
// Kept: POST_NOTIFICATIONS, VIBRATE, WAKE_LOCK (local notifications still work). Not requested: SCHEDULE_EXACT_ALARM.
const { withAndroidManifest } = require('expo/config-plugins');

const PERMISSIONS = [
  'android.permission.RECEIVE_BOOT_COMPLETED', 'com.google.android.c2dm.permission.RECEIVE', 'android.permission.READ_APP_BADGE',
  'com.sec.android.provider.badge.permission.READ', 'com.sec.android.provider.badge.permission.WRITE',
  'com.htc.launcher.permission.READ_SETTINGS', 'com.htc.launcher.permission.UPDATE_SHORTCUT',
  'com.sonyericsson.home.permission.BROADCAST_BADGE', 'com.sonymobile.home.permission.PROVIDER_INSERT_BADGE',
  'com.anddoes.launcher.permission.UPDATE_COUNT', 'com.majeur.launcher.permission.UPDATE_BADGE',
  'com.huawei.android.launcher.permission.CHANGE_BADGE', 'com.huawei.android.launcher.permission.READ_SETTINGS', 'com.huawei.android.launcher.permission.WRITE_SETTINGS',
  'com.oppo.launcher.permission.READ_SETTINGS', 'com.oppo.launcher.permission.WRITE_SETTINGS',
  'me.everything.badger.permission.BADGE_COUNT_READ', 'me.everything.badger.permission.BADGE_COUNT_WRITE',
];
const SERVICES = ['expo.modules.notifications.service.ExpoFirebaseMessagingService', 'com.google.firebase.messaging.FirebaseMessagingService'];
const RECEIVERS = ['com.google.firebase.iid.FirebaseInstanceIdReceiver'];
const PROVIDERS = ['com.google.firebase.provider.FirebaseInitProvider'];
const DISCOVERY = 'com.google.firebase.components.ComponentDiscoveryService';
const REGISTRARS = ['com.google.firebase.messaging.FirebaseMessagingKtxRegistrar', 'com.google.firebase.messaging.FirebaseMessagingRegistrar'];
const NOTIF_RECEIVER = 'expo.modules.notifications.service.NotificationsService';

module.exports = function withLocalNotificationsOnly(config) {
  return withAndroidManifest(config, cfg => {
    const m = cfg.modResults.manifest;
    m.$['xmlns:tools'] = 'http://schemas.android.com/tools';
    const perms = (m['uses-permission'] = m['uses-permission'] || []);
    for (const name of PERMISSIONS) {
      const ex = perms.find(p => p.$['android:name'] === name);
      if (ex) ex.$['tools:node'] = 'remove'; else perms.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    }
    const app = m.application[0];
    app.service = app.service || []; app.receiver = app.receiver || [];
    for (const name of SERVICES) if (!app.service.find(x => x.$['android:name'] === name)) app.service.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    for (const name of RECEIVERS) if (!app.receiver.find(x => x.$['android:name'] === name)) app.receiver.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    // drop only the Messaging registrar meta-data from the merged discovery service (merge, then remove those children)
    let disc = app.service.find(x => x.$['android:name'] === DISCOVERY);
    if (!disc) { disc = { $: { 'android:name': DISCOVERY, 'tools:node': 'merge' } }; app.service.push(disc); }
    disc['meta-data'] = (disc['meta-data'] || []).filter(x => !REGISTRARS.some(r => x.$['android:name'] === 'com.google.firebase.components:' + r));
    for (const r of REGISTRARS) disc['meta-data'].push({ $: { 'android:name': 'com.google.firebase.components:' + r, 'tools:node': 'remove' } });
    app.provider = app.provider || [];
    for (const name of PROVIDERS) if (!app.provider.find(x => x.$['android:name'] === name)) app.provider.push({ $: { 'android:name': name, 'tools:node': 'remove' } });
    // replace the library's receiver declaration with one that has no boot actions
    app.receiver = app.receiver.filter(x => x.$['android:name'] !== NOTIF_RECEIVER);
    app.receiver.push({
      $: { 'android:name': NOTIF_RECEIVER, 'android:enabled': 'true', 'android:exported': 'false', 'tools:node': 'replace' },
      'intent-filter': [{ $: { 'android:priority': '-1' }, action: [{ $: { 'android:name': 'expo.modules.notifications.NOTIFICATION_EVENT' } }, { $: { 'android:name': 'android.intent.action.MY_PACKAGE_REPLACED' } }] }],
    });
    return cfg;
  });
};
