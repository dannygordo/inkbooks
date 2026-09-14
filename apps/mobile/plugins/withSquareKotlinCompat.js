const { withProjectBuildGradle } = require('@expo/config-plugins');

// Android build compatibility fixes needed once mobile-payments-sdk-react-native (Square's
// Mobile Payments SDK) entered the dependency graph. Each fix here was found by reading a real
// EAS build failure, not guessed in advance - see the comment above each one.
//
// FIX 1 - Kotlin metadata version. Square's SDK 2.6.1 ships Kotlin binary metadata version
// 2.3.0. expo-build-properties' android.kotlinVersion override was tried first (set to
// "2.2.21", matching Square's own documented minimum) - a real build still reported compiler
// 2.1.0 afterward, and a LATER build crashed with a Kotlin Gradle Plugin internal API mismatch
// (NoSuchMethodError on KotlinJvmCompilerOptions.getJvmDefault()) that persisted across two
// different compiler-args DSLs, which only makes sense if that override was injecting a SECOND,
// conflicting kotlin-gradle-plugin version onto the buildscript classpath alongside React
// Native's own pinned one. Removed the override entirely (app.json no longer sets
// android.kotlinVersion) rather than fight that - matches long-standing expo/expo issues
// #17564 and #22464 either way. This applies the exact suppression Kotlin's own compiler
// suggests in its error output for the metadata mismatch: "Remove them from the classpath or
// use '-Xskip-metadata-version-check' to suppress error". Safe here because the mismatch is
// purely a metadata-version gate, not an actual incompatible language feature - Square
// publishes this SDK for use against React Native's Kotlin line.
//
// An earlier version of this fix used `subprojects { afterEvaluate { ... } }`, which failed with
// "Cannot run Project.afterEvaluate(Closure) when the project is already evaluated" - this
// Gradle version (9.3.1, incubating Problems API active) enforces stricter project-isolation
// timing than that pattern assumes. Rewritten to `allprojects { tasks.withType(...)
// .configureEach { ... } }`, needing no afterEvaluate.
//
// A second version of this fix used the deprecated `kotlinOptions { freeCompilerArgs += [...] }`
// DSL, which then crashed with `'org.gradle.api.provider.Property
// org.jetbrains.kotlin.gradle.dsl.KotlinJvmCompilerOptions.getJvmDefault()'` - a binary API
// mismatch from that deprecated bridge against the resolved Kotlin Gradle Plugin version.
// Rewritten again to the current `compilerOptions { freeCompilerArgs.add(...) }` API, which is
// what the Kotlin Gradle Plugin itself now expects.
//
// FIX 2 - duplicate BouncyCastle classes. Once FIX 1 got the build past compilation, packaging
// failed with "Duplicate class org.bouncycastle.x509.* found in modules
// bcprov-jdk15on-1.70.jar ... and bcprov-jdk15to18-1.81.jar" - two BouncyCastle artifacts that
// provide the identical class package under different, mutually-exclusive names (jdk15on is
// BouncyCastle's older, deprecated artifact ID; jdk15to18 is its actively-maintained
// successor, same code). Something already in the dependency graph pulls the old jdk15on;
// Square's SDK (or a transitive dependency of it, likely used for secure reader
// communication/TLS) pulls the new jdk15to18. Excluding the older artifact project-wide is the
// standard fix for this exact class of Android "duplicate class" error - jdk15to18 is a strict
// superset covering the same API, so nothing that depended on jdk15on loses anything. Confirmed
// on the next build after this fix landed: the bouncycastle error was gone.
const MARKER = '// @generated begin square-payments-android-fixes';
const SNIPPET = `
${MARKER} - see plugins/withSquareKotlinCompat.js for why each of these exists
allprojects { proj ->
  proj.tasks.withType(org.jetbrains.kotlin.gradle.tasks.KotlinCompile).configureEach {
    compilerOptions {
      freeCompilerArgs.add('-Xskip-metadata-version-check')
    }
  }
  proj.configurations.all {
    exclude group: 'org.bouncycastle', module: 'bcprov-jdk15on'
  }
}
// @generated end square-payments-android-fixes
`;

module.exports = function withSquareKotlinCompat(config) {
  return withProjectBuildGradle(config, (config) => {
    if (config.modResults.language !== 'groovy') {
      throw new Error(
        'withSquareKotlinCompat only supports the Groovy android/build.gradle template - update this plugin if the project ever switches to build.gradle.kts.'
      );
    }
    if (!config.modResults.contents.includes(MARKER)) {
      config.modResults.contents += SNIPPET;
    }
    return config;
  });
};
