/**
 * Generate onboarding .rq for VSIX packaging — see reqlan rq/development/build.rq onboarding_rq_build
 */
import { generateOnboardingRq } from './onboarding-rq-build.ts';

const outputPath = generateOnboardingRq();
console.log(`[onboarding] wrote ${outputPath}`);
