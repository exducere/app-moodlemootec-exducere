// (C) Copyright 2015 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { Injectable } from '@angular/core';
import { FingerprintAIO } from '@awesome-cordova-plugins/fingerprint-aio/ngx';
import { CoreConfig } from '@services/config';
import { CoreConstants } from '@/core/constants';
import { CorePlatform } from '@services/platform';
import { Translate } from '@singletons';
import { CoreLogger } from '@singletons/logger';

/**
 * Service to handle biometric authentication (Face ID, Touch ID, Fingerprint).
 */
@Injectable({ providedIn: 'root' })
export class CoreBiometricAuthService {

    protected logger = CoreLogger.getInstance('CoreBiometricAuthService');

    constructor(
        protected fingerprintAIO: FingerprintAIO,
    ) {}

    /**
     * Check if biometric authentication is available on the device.
     *
     * @returns Promise resolved with biometric type if available ('face', 'finger', 'biometric'), rejected otherwise.
     */
    async isAvailable(): Promise<string> {
        if (!CorePlatform.isMobile()) {
            throw new Error('Biometric not available on browser');
        }

        try {
            const type = await this.fingerprintAIO.isAvailable({ requireStrongBiometrics: false });

            return type;
        } catch (error) {
            this.logger.error('Biometric not available:', error);
            throw error;
        }
    }

    /**
     * Authenticate user with biometric (Face ID, Touch ID, or Fingerprint).
     *
     * @param siteId The site ID for which to authenticate.
     * @param message Optional custom message to display.
     * @returns Promise resolved if authentication successful, rejected otherwise.
     */
    async authenticate(siteId: string, message?: string): Promise<void> {
        try {
            const biometricType = await this.isAvailable();

            // Determine the title based on biometric type
            let title = Translate.instant('core.login.biometric.title');
            if (biometricType === 'face') {
                title = 'Face ID';
            } else if (biometricType === 'finger' || biometricType === 'touch') {
                title = 'Touch ID';
            } else if (biometricType === 'biometric') {
                title = Translate.instant('core.login.biometric.title');
            }

            await this.fingerprintAIO.show({
                title,
                description: message || Translate.instant('core.login.biometric.description'),
                cancelButtonTitle: Translate.instant('core.cancel'),
                fallbackButtonTitle: Translate.instant('core.login.password'),
                disableBackup: true, // Don't allow fallback to device password
            });

            this.logger.debug('Biometric authentication successful for site:', siteId);
        } catch (error) {
            this.logger.error('Biometric authentication failed:', error);
            throw error;
        }
    }

    /**
     * Check if biometric is enabled for a specific site.
     *
     * @param siteId The site ID.
     * @returns Promise resolved with true if enabled, false otherwise.
     */
    async isBiometricEnabled(siteId: string): Promise<boolean> {
        try {
            const enabled = await CoreConfig.get<boolean>(`${CoreConstants.SETTINGS_BIOMETRIC_ENABLED}_${siteId}`, false);

            return enabled;
        } catch {
            return false;
        }
    }

    /**
     * Enable or disable biometric authentication for a specific site.
     *
     * @param siteId The site ID.
     * @param enabled True to enable, false to disable.
     * @returns Promise resolved when setting is saved.
     */
    async setBiometricEnabled(siteId: string, enabled: boolean): Promise<void> {
        try {
            if (enabled) {
                // Test biometric before enabling
                await this.authenticate(siteId, Translate.instant('core.login.biometric.testauth'));

                // Save biometric type
                const biometricType = await this.isAvailable();
                await CoreConfig.set(`${CoreConstants.SETTINGS_BIOMETRIC_TYPE}_${siteId}`, biometricType);
            }

            await CoreConfig.set(`${CoreConstants.SETTINGS_BIOMETRIC_ENABLED}_${siteId}`, enabled ? 1 : 0);

            this.logger.debug(`Biometric ${enabled ? 'enabled' : 'disabled'} for site:`, siteId);
        } catch (error) {
            this.logger.error('Error setting biometric enabled:', error);
            throw error;
        }
    }

    /**
     * Get the biometric type for a specific site.
     *
     * @param siteId The site ID.
     * @returns Promise resolved with biometric type ('face', 'finger', 'biometric') or null if not set.
     */
    async getBiometricType(siteId: string): Promise<string | undefined> {
        try {
            return await CoreConfig.get<string>(`${CoreConstants.SETTINGS_BIOMETRIC_TYPE}_${siteId}`);
        } catch {
            return undefined;
        }
    }

    /**
     * Check if biometric is available and enabled for a site.
     *
     * @param siteId The site ID.
     * @returns Promise resolved with true if both available and enabled, false otherwise.
     */
    async isAvailableAndEnabled(siteId: string): Promise<boolean> {
        try {
            const [available, enabled] = await Promise.all([
                this.isAvailable().then(() => true).catch(() => false),
                this.isBiometricEnabled(siteId),
            ]);

            return available && enabled;
        } catch {
            return false;
        }
    }

    /**
     * Show enrollment prompt to offer biometric authentication to the user.
     *
     * @param siteId The site ID.
     * @param siteName The site name to show in the prompt.
     * @returns Promise resolved with true if user accepted and biometric was enabled, false otherwise.
     */
    async showEnrollmentPrompt(siteId: string, siteName: string): Promise<boolean> {
        try {
            // Check if already enabled
            const alreadyEnabled = await this.isBiometricEnabled(siteId);
            if (alreadyEnabled) {
                return false;
            }

            // Check if biometric is available
            const biometricType = await this.isAvailable();

            let biometricName = Translate.instant('core.login.biometric.title');
            if (biometricType === 'face') {
                biometricName = 'Face ID';
            } else if (biometricType === 'finger' || biometricType === 'touch') {
                biometricName = 'Touch ID';
            }

            // Import dynamically to avoid circular dependencies
            const { CoreAlerts } = await import('@services/overlays/alerts');

            await CoreAlerts.confirm(
                Translate.instant('core.login.biometric.offer', { biometric: biometricName, site: siteName }),
                { header: Translate.instant('core.login.biometric.enable') },
            );

            // User confirmed
            const confirmed = true;

            if (confirmed) {
                await this.setBiometricEnabled(siteId, true);

                return true;
            }

            return false;
        } catch (error) {
            this.logger.error('Error showing enrollment prompt:', error);

            return false;
        }
    }

    /**
     * Handle biometric authentication errors and return user-friendly message.
     *
     * @param error The error from biometric authentication.
     * @returns User-friendly error message.
     */
    getErrorMessage(error: unknown): string {
        if (typeof error === 'object' && error !== null && 'code' in error) {
            const code = (error as { code: number }).code;

            // Common error codes from FingerprintAIO
            switch (code) {
                case -108: // User cancelled
                case -128: // User cancelled on iOS
                case 10: // User cancelled on Android
                    return ''; // Silent, user intentionally cancelled
                case -3: // Biometric not enrolled
                    return Translate.instant('core.login.biometric.notenrolled');
                case -2: // Biometric locked out
                    return Translate.instant('core.login.biometric.lockedout');
                case -1: // Biometric unavailable
                    return Translate.instant('core.login.biometric.unavailable');
                default:
                    return Translate.instant('core.login.biometric.error');
            }
        }

        if (typeof error === 'string') {
            if (error.includes('BIOMETRIC_DISMISSED') || error.includes('cancelled')) {
                return ''; // Silent, user cancelled
            }

            return error;
        }

        return Translate.instant('core.login.biometric.error');
    }

    /**
     * Check if the error is a user cancellation (should be handled silently).
     *
     * @param error The error to check.
     * @returns True if error is user cancellation, false otherwise.
     */
    isUserCancelled(error: unknown): boolean {
        if (typeof error === 'object' && error !== null && 'code' in error) {
            const code = (error as { code: number }).code;

            return code === -108 || code === -128 || code === 10;
        }

        if (typeof error === 'string') {
            return error.includes('BIOMETRIC_DISMISSED') || error.includes('cancelled');
        }

        return false;
    }

}
