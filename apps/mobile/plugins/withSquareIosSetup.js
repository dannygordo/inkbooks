const { withXcodeProject, withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

// Square's Mobile Payments SDK ships SquareReader/LCRCore/CorePaymentCard as private frameworks
// NESTED inside SquareMobilePaymentsSDK.framework's own Frameworks/ subfolder. MockReaderUI.framework
// is a separate, sibling top-level framework that also needs SquareReader.framework at runtime, but
// its own @rpath only searches the app's top-level Frameworks/ folder - so without help, launch
// fails immediately with "Library not loaded: @rpath/SquareReader.framework/SquareReader"
// (confirmed on a real EAS build + iOS Simulator run, 2026-09-13).
//
// SquareMobilePaymentsSDK.framework ships a `setup` script (confirmed by reading its real content
// off a built .app) whose entire job is exactly this: move each nested *.framework out of
// SquareMobilePaymentsSDK.framework/Frameworks/ into the app's top-level Frameworks/ dir. The fix
// is real - every failed attempt below was purely about WHEN/HOW it gets invoked.
//
// ATTEMPT 1: Run Script phase added via withXcodeProject during `expo prebuild`. BROKEN - runs
// before `pod install`, so before CocoaPods' own "[CP] Embed Pods Frameworks" phase exists.
//
// ATTEMPT 2: reorder that phase to last from a Podfile `post_install` hook. BROKEN - confirmed via
// CocoaPods 1.16.2 source that `post_install` fires from inside `generate_pods_project`, which
// runs BEFORE `integrate_user_project` (the step that adds "[CP] Embed Pods Frameworks" to the app
// target). Failed loudly with an intentional `raise` confirming the phase didn't exist yet.
//
// ATTEMPT 3: switch to `post_integrate`, which CocoaPods' own docs say runs "after the project is
// written to disk" - confirmed via source to fire from within `integrate_user_project`, after
// `UserProjectIntegrator.integrate!` completes. Right idea, wrong API: assumed the block argument
// was a `Pod::Installer::PostIntegrateHooksContext` (per rubydoc, exposing `.umbrella_targets`),
// but empirically, in this actual CocoaPods version, `post_integrate do |installer_context|`
// receives the SAME raw `Pod::Installer` object post_install gets - failed with `undefined method
// 'umbrella_targets' for #<Pod::Installer...>`. Confirms the docs describe a different invocation
// path (the HooksManager plugin system) than what the Podfile DSL actually passes.
//
// ACTUAL FIX: post_integrate (for timing) + `.aggregate_targets` / `.user_project.native_targets`
// (the real Pod::Installer API, same accessors attempt 2 already proved work syntactically).
const EMBED_PHASE_NAME = '[CP] Embed Pods Frameworks';
const MARKER = '# @generated square-payments-ios-setup';

const POST_INTEGRATE_BLOCK =
  '\n' + MARKER + ' - see plugins/withSquareIosSetup.js\n' +
  'post_integrate do |installer_context|\n' +
  '  installer_context.aggregate_targets.each do |aggregate_target|\n' +
  '    aggregate_target.user_project.native_targets.each do |target|\n' +
  "      next unless target.product_type == 'com.apple.product-type.application'\n" +
  '\n' +
  "      embed_phase = target.shell_script_build_phases.find { |p| p.name == '" + EMBED_PHASE_NAME + "' }\n" +
  '      if embed_phase.nil?\n' +
  '        raise "withSquareIosSetup: could not find the \'' + EMBED_PHASE_NAME + '\' build phase on ' +
  "target #{target.name} even in post_integrate - CocoaPods must have renamed it; update " +
  'plugins/withSquareIosSetup.js"\n' +
  '      end\n' +
  '\n' +
  "      unless embed_phase.shell_script.to_s.include?('" + MARKER + "')\n" +
  '        embed_phase.shell_script = embed_phase.shell_script.to_s +\n' +
  "          \"\\n" + MARKER + "\\n\" +\n" +
  '          \'SQUARE_FRAMEWORKS="${BUILT_PRODUCTS_DIR}/${FRAMEWORKS_FOLDER_PATH}"\' + "\\n" +\n' +
  '          \'if [ -f "${SQUARE_FRAMEWORKS}/SquareMobilePaymentsSDK.framework/setup" ]; then\' + "\\n" +\n' +
  '          \'  "${SQUARE_FRAMEWORKS}/SquareMobilePaymentsSDK.framework/setup"\' + "\\n" +\n' +
  '          \'fi\' + "\\n"\n' +
  '      end\n' +
  '\n' +
  '      target.build_configurations.each do |build_config|\n' +
  "        build_config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'\n" +
  '      end\n' +
  '    end\n' +
  '    aggregate_target.user_project.save\n' +
  '  end\n' +
  'end\n' +
  '# @generated end square-payments-ios-setup\n';

module.exports = function withSquareIosSetup(config) {
  config = withXcodeProject(config, (config) => {
    const project = config.modResults;
    project.updateBuildProperty('ENABLE_USER_SCRIPT_SANDBOXING', 'NO');
    return config;
  });

  config = withDangerousMod(config, [
    'ios',
    (config) => {
      const podfilePath = path.join(config.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfilePath, 'utf8');
      if (!contents.includes(MARKER)) {
        contents += POST_INTEGRATE_BLOCK;
        fs.writeFileSync(podfilePath, contents);
      }
      return config;
    },
  ]);

  return config;
};
