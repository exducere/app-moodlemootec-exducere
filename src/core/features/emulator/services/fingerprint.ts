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
// limitations under the License.

import { Injectable } from '@angular/core';
import { FingerprintAIO, FingerprintOptions, FingerprintAvailableOptions, BIOMETRIC_TYPE } from '@awesome-cordova-plugins/fingerprint-aio/ngx';

/**
 * Emulates the Cordova FingerprintAIO plugin in browser.
 */
@Injectable()
export class FingerprintAIOMock extends FingerprintAIO {

    /**
     * Check if fingerprint/biometric authentication is available on the device.
     *
     * @param options Options for checking availability
     * @returns Promise resolved with biometric type ('face' for testing), rejected if not available.
     */
    isAvailable(options: FingerprintAvailableOptions): Promise<BIOMETRIC_TYPE> {
        // eslint-disable-next-line no-console
        console.log('[FingerprintAIO Mock] Checking availability with options:', options);
        // eslint-disable-next-line no-console
        console.log('[FingerprintAIO Mock] Returning "face" for browser testing');

        return Promise.resolve('face'); // Simulate Face ID available in browser
    }

    /**
     * Show biometric authentication prompt.
     *
     * @param options Fingerprint options with title, description, etc.
     * @returns Promise resolved if authentication successful, rejected if cancelled/failed.
     */
    show(options: FingerprintOptions): Promise<void> {
        // eslint-disable-next-line no-console
        console.log('[FingerprintAIO Mock] Authentication prompt:', options);

        return new Promise((resolve, reject) => {
            // Simulate browser authentication dialog
            const message = `${options.title || 'Biometric Authentication'}\n\n${options.description || ''}\n\nThis is a BROWSER SIMULATION.\nClick OK to simulate successful authentication.`;

            setTimeout(() => {
                // eslint-disable-next-line no-alert
                const confirmed = confirm(message);

                if (confirmed) {
                    // eslint-disable-next-line no-console
                    console.log('[FingerprintAIO Mock] Authentication SUCCESS');
                    resolve();
                } else {
                    // eslint-disable-next-line no-console
                    console.log('[FingerprintAIO Mock] Authentication CANCELLED by user');
                    reject({ code: -108, message: 'User cancelled authentication' });
                }
            }, 300); // Small delay to simulate real authentication
        });
    }

}
