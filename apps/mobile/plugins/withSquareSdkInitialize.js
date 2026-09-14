const { withAppDelegate, withMainApplication } = require('@expo/config-plugins');

// Square's Mobile Payments SDK requires a ONE-TIME native initialization call, separate from and
// before authorize() (which just logs a specific seller in). Per Square's own docs:
// developer.squareup.com/docs/mobile-payments-sdk/ios: "Before taking a payment or attempting any
// other operation with the Mobile Payments SDK, you must initialize it" via
// MobilePaymentsSDK.initialize(applicationLaunchOptions:squareApplicationID:) in AppDelegate's
// didFinishLaunchingWithOptions.
// developer.squareup.com/docs/mobile-payments-sdk/android: same requirement, via
// MobilePaymentsSdk.initialize(applicationId, context) in Application.onCreate() - this SDK does
// NOT self-initialize via a ContentProvider/manifest the way some Android SDKs do.
//
// mobile-payments-sdk-react-native (confirmed by reading its native source directly) never does
// this for you on either platform. On iOS this is fatal, not just a "calls fail" situation: the
// module's Swift class has `private let mobilePaymentsSDK = MobilePaymentsSDK.shared` as a STORED
// PROPERTY, which runs the instant the native module is instantiated (i.e. at app launch, the
// moment any JS file imports this package) - accessing `.shared` before initialize() crashes with
// a Swift assertionFailure inside SquareMobilePaymentsSDK itself. Confirmed via a real crash log,
// 2026-09-13, AFTER the framework-nesting dyld crash (see withSquareIosSetup.js) was fixed.
//
// This app has no committed native AppDelegate/MainApplication (fully Expo-managed, prebuild-
// generated), so this has to be injected via config plugins, same as the other Square fixes.
//
// The Square Application ID below is NOT a secret - Square's own docs describe it as meant for
// embedding directly in client/mobile code (unlike the OAuth access token authorize() uses, or
// SQUARE_APPLICATION_SECRET, both of which stay server-only). Value matches
// SQUARE_SANDBOX_APPLICATION_ID / SQUARE_APPLICATION_ID in server/.env.development as of
// 2026-09-13 - swap for a production app ID (via a real config mechanism, not this hardcode) once
// this moves past sandbox testing. See DECISIONS.md.
const SQUARE_APPLICATION_ID = 'sandbox-sq0idb-Dw4uMOksvZFaDFfsM3wDYQ';

const IOS_IMPORT_MARKER = 'import SquareMobilePaymentsSDK';
// Anchor on the plain `import React` line rather than matching at string position 0 -
// the generated file's actual first line is `internal import Expo`, which a bare
// /^import / (or /^import .+\n/ without the m flag) will never match, silently no-opping.
const IOS_IMPORT_ANCHOR = 'import React\n';
const IOS_RETURN_ANCHOR = 'return super.application(application, didFinishLaunchingWithOptions: launchOptions)';
const IOS_INIT_SNIPPET =
  '    MobilePaymentsSDK.initialize(applicationLaunchOptions: launchOptions, squareApplicationID: "' +
  SQUARE_APPLICATION_ID + '")\n\n    ';

const ANDROID_IMPORT_MARKER = 'import com.squareup.sdk.mobilepayments.MobilePaymentsSdk';
const ANDROID_ONCREATE_ANCHOR = 'super.onCreate()';
const ANDROID_INIT_SNIPPET =
  '\n    MobilePaymentsSdk.initialize("' + SQUARE_APPLICATION_ID + '", this)';

module.exports = function withSquareSdkInitialize(config) {
  config = withAppDelegate(config, (config) => {
    let contents = config.modResults.contents;

    if (config.modResults.language !== 'swift') {
      throw new Error(
        'withSquareSdkInitialize: AppDelegate is not Swift (found: ' + config.modResults.language +
        ') - this plugin only knows how to patch the Swift template; update plugins/withSquareSdkInitialize.js'
      );
    }

    if (!contents.includes(IOS_IMPORT_MARKER)) {
      if (!contents.includes(IOS_IMPORT_ANCHOR)) {
        throw new Error(
          'withSquareSdkInitialize: could not find `import React` in the generated ' +
          'AppDelegate.swift - Expo\'s template must have changed; update ' +
          'plugins/withSquareSdkInitialize.js with the new anchor.'
        );
      }
      contents = contents.replace(IOS_IMPORT_ANCHOR, IOS_IMPORT_ANCHOR + IOS_IMPORT_MARKER + '\n');
    }

    if (!contents.includes('MobilePaymentsSDK.initialize(')) {
      if (!contents.includes(IOS_RETURN_ANCHOR)) {
        throw new Error(
          'withSquareSdkInitialize: could not find the expected `' + IOS_RETURN_ANCHOR + '` line in ' +
          'the generated AppDelegate.swift - Expo\'s template must have changed; update ' +
          'plugins/withSquareSdkInitialize.js with the new anchor.'
        );
      }
      contents = contents.replace(IOS_RETURN_ANCHOR, IOS_INIT_SNIPPET + IOS_RETURN_ANCHOR);
    }

    config.modResults.contents = contents;
    return config;
  });

  config = withMainApplication(config, (config) => {
    let contents = config.modResults.contents;

    if (config.modResults.language !== 'kt') {
      throw new Error(
        'withSquareSdkInitialize: MainApplication is not Kotlin (found: ' + config.modResults.language +
        ') - this plugin only knows how to patch the Kotlin template; update plugins/withSquareSdkInitialize.js'
      );
    }

    if (!contents.includes(ANDROID_IMPORT_MARKER)) {
      contents = contents.replace(/^(package .+\n)/, '$1\n' + ANDROID_IMPORT_MARKER + '\n');
    }

    if (!contents.includes('MobilePaymentsSdk.initialize(')) {
      if (!contents.includes(ANDROID_ONCREATE_ANCHOR)) {
        throw new Error(
          'withSquareSdkInitialize: could not find `' + ANDROID_ONCREATE_ANCHOR + '` in the generated ' +
          'MainApplication.kt - Expo\'s template must have changed; update plugins/withSquareSdkInitialize.js'
        );
      }
      contents = contents.replace(ANDROID_ONCREATE_ANCHOR, ANDROID_ONCREATE_ANCHOR + ANDROID_INIT_SNIPPET);
    }

    config.modResults.contents = contents;
    return config;
  });

  return config;
};
