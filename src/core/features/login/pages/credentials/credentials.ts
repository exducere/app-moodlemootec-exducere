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

import { Component, OnInit, OnDestroy, ElementRef, inject, viewChild } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';

import { CoreSSO } from '@singletons/sso';
import { CoreNetwork } from '@services/network';
import { CoreSiteCheckResponse, CoreSites } from '@services/sites';
import { CoreLoginHelper } from '@features/login/services/login-helper';
import { CoreWS } from '@services/ws';
import { Translate } from '@singletons';
import { CoreSitePublicConfigResponse, CoreUnauthenticatedSite } from '@classes/sites/unauthenticated-site';
import { CoreEventObserver, CoreEvents } from '@singletons/events';
import { CoreNavigator } from '@services/navigator';
import { CoreForms } from '@singletons/form';
import { CoreUserSupport } from '@features/user/services/support';
import { CoreUserSupportConfig } from '@features/user/classes/support/support-config';
import { CoreUserGuestSupportConfig } from '@features/user/classes/support/guest-support-config';
import { SafeHtml } from '@angular/platform-browser';
import { CorePlatform } from '@services/platform';
import { CoreSitesFactory } from '@services/sites-factory';
import {
    ALWAYS_SHOW_LOGIN_FORM_CHANGED,
    EMAIL_SIGNUP_FEATURE_NAME,
    FORGOTTEN_PASSWORD_FEATURE_NAME,
} from '@features/login/constants';
import { CoreCustomURLSchemes } from '@services/urlschemes';
import { CoreSiteError } from '@classes/errors/siteerror';
import { CoreKeyboard } from '@singletons/keyboard';
import { CoreLoadings } from '@services/overlays/loadings';
import { CoreAlerts } from '@services/overlays/alerts';
import { CoreLoginMethodsComponent } from '../../components/login-methods/login-methods';
import { CoreLoginExceededAttemptsComponent } from '../../components/exceeded-attempts/exceeded-attempts';
import { CoreSiteLogoComponent } from '../../../../components/site-logo/site-logo';
import { CoreSharedModule } from '@/core/shared.module';
import { CoreBiometricAuthService } from '@features/login/services/biometric-auth';

/**
 * Page to enter the user credentials.
 */
@Component({
    selector: 'page-core-login-credentials',
    templateUrl: 'credentials.html',
    styleUrl: '../../login.scss',
    imports: [
        CoreSharedModule,
        CoreLoginMethodsComponent,
    ],
})
export default class CoreLoginCredentialsPage implements OnInit, OnDestroy {

    readonly formElement = viewChild<ElementRef<HTMLFormElement>>('credentialsForm');

    credForm!: FormGroup;
    site!: CoreUnauthenticatedSite;
    authInstructions?: string;
    canSignup?: boolean;
    pageLoaded = false;
    isBrowserSSO = false;
    showForgottenPassword = true;
    loginAttempts = 0;
    supportConfig?: CoreUserSupportConfig;
    exceededAttemptsHTML?: SafeHtml | string | null;
    siteConfig?: CoreSitePublicConfigResponse;
    siteCheckError = '';
    displaySiteUrl = false;
    showLoginForm = true;

    // OTP flow states
    showOTPPhoneInput = false;
    showOTPLoading = false;
    showOTPSuccess = false;
    showOTPCodeInput = false;
    otpPhoneNumber = '';
    otpCode = ['', '', '', '', '', ''];
    otpSessionId = '';

    protected siteCheck?: CoreSiteCheckResponse;
    protected eventThrown = false;
    protected viewLeft = false;
    protected siteId?: string;
    protected urlToOpen?: string;
    protected valueChangeSubscription?: Subscription;
    protected alwaysShowLoginFormObserver?: CoreEventObserver;
    protected loginObserver?: CoreEventObserver;
    protected fb = inject(FormBuilder);
    protected biometricAuth = inject(CoreBiometricAuthService);

    constructor() {
        // Listen to LOGIN event to determine if login was successful, since the login can be done using QR, SSO, etc.
        this.loginObserver = CoreEvents.on(CoreEvents.LOGIN, ({ siteId }) => {
            this.siteId = siteId;
        });
    }

    /**
     * @inheritdoc
     */
    async ngOnInit(): Promise<void> {
        try {
            this.siteCheck = CoreNavigator.getRouteParam<CoreSiteCheckResponse>('siteCheck');

            const siteUrl = this.siteCheck?.siteUrl || CoreNavigator.getRequiredRouteParam<string>('siteUrl');
            if (this.siteCheck?.config) {
                this.siteConfig = this.siteCheck.config;
            }

            this.site = CoreSitesFactory.makeUnauthenticatedSite(siteUrl, this.siteConfig);
            this.urlToOpen = CoreNavigator.getRouteParam('urlToOpen');
            this.supportConfig = this.siteConfig && new CoreUserGuestSupportConfig(this.site, this.siteConfig);
            this.displaySiteUrl = this.site.shouldDisplayInformativeLinks();
        } catch (error) {
            CoreAlerts.showError(error);

            return CoreNavigator.back();
        }

        this.credForm = this.fb.group({
            username: [CoreNavigator.getRouteParam<string>('username') || '', Validators.required],
            password: ['', Validators.required],
        });

        await this.checkSite();

        if (this.isBrowserSSO && CoreLoginHelper.shouldSkipCredentialsScreenOnSSO()) {
            const launchedWithTokenURL = await CoreCustomURLSchemes.appLaunchedWithTokenURL();
            if (!launchedWithTokenURL) {
                this.openBrowserSSO();
            }
        }

        if (CorePlatform.isIOS() && !this.isBrowserSSO) {
            // Make iOS auto-fill work. The field that isn't focused doesn't get updated, do it manually.
            // Debounce it to prevent triggering this function too often when the user is typing.
            this.valueChangeSubscription = this.credForm.valueChanges.pipe(debounceTime(1000)).subscribe((changes) => {
                const formElement = this.formElement();
                if (!formElement || !formElement.nativeElement) {
                    return;
                }

                const usernameInput = formElement.nativeElement.querySelector<HTMLInputElement>('input[name="username"]');
                const passwordInput = formElement.nativeElement.querySelector<HTMLInputElement>('input[name="password"]');
                const usernameValue = usernameInput?.value;
                const passwordValue = passwordInput?.value;

                if (usernameValue !== undefined && usernameValue !== changes.username) {
                    this.credForm.get('username')?.setValue(usernameValue);
                }
                if (passwordValue !== undefined && passwordValue !== changes.password) {
                    this.credForm.get('password')?.setValue(passwordValue);
                }
            });
        }

        this.alwaysShowLoginFormObserver = CoreEvents.on(ALWAYS_SHOW_LOGIN_FORM_CHANGED, async () => {
            this.showLoginForm = await CoreLoginHelper.shouldShowLoginForm(this.siteConfig);
        });
    }

    /**
     * Show help modal.
     */
    showHelp(): void {
        CoreUserSupport.showHelp(
            Translate.instant('core.login.credentialshelp'),
            Translate.instant('core.login.credentialssupportsubject'),
            this.supportConfig,
        );
    }

    /**
     * Get site config and check if it requires SSO login.
     * This should be used only if a fixed URL is set, otherwise this check is already performed in CoreLoginSitePage.
     *
     * @returns Promise resolved when done.
     */
    async checkSite(): Promise<void> {
        this.pageLoaded = false;

        // If the site is configured with http:// protocol we force that one, otherwise we use default mode.
        const protocol = this.site.siteUrl.indexOf('http://') === 0 ? 'http://' : undefined;

        try {
            if (!this.siteCheck) {
                this.siteCheck = await CoreSites.checkSite(this.site.siteUrl, protocol, 'Credentials page');
                this.siteCheck.config && this.site.setPublicConfig(this.siteCheck.config);
            }

            this.site.setURL(this.siteCheck.siteUrl);
            this.siteConfig = this.siteCheck.config;
            this.supportConfig = this.siteConfig && new CoreUserGuestSupportConfig(this.site, this.siteConfig);

            await this.treatSiteConfig();

            this.siteCheckError = '';

            // Check if user needs to authenticate in a browser.
            this.isBrowserSSO = CoreLoginHelper.isSSOLoginNeeded(this.siteCheck.code);
        } catch (error) {
            const alert = await CoreAlerts.showError(error);

            this.siteCheckError =
                (typeof alert?.message === 'object' ? alert.message.value : alert?.message) || 'Error loading site';
        } finally {
            this.pageLoaded = true;
        }
    }

    /**
     * Treat the site configuration (if it exists).
     */
    protected async treatSiteConfig(): Promise<void> {
        this.showLoginForm = await CoreLoginHelper.shouldShowLoginForm(this.siteConfig);

        if (!this.siteConfig) {
            this.authInstructions = undefined;
            this.canSignup = false;

            return;
        }

        this.canSignup = this.siteConfig.registerauth == 'email' && !this.site.isFeatureDisabled(EMAIL_SIGNUP_FEATURE_NAME);
        this.showForgottenPassword = !this.site.isFeatureDisabled(FORGOTTEN_PASSWORD_FEATURE_NAME);
        this.exceededAttemptsHTML = CoreLoginHelper.buildExceededAttemptsHTML(
            !!this.supportConfig?.canContactSupport(),
            this.showForgottenPassword,
        );
        this.authInstructions = this.siteConfig.authinstructions ||
            (this.canSignup ? Translate.instant('core.login.loginsteps') : '');

        if (!this.eventThrown && !this.viewLeft) {
            this.eventThrown = true;
            CoreEvents.trigger(CoreEvents.LOGIN_SITE_CHECKED, { config: this.siteConfig });
        }
    }

    /**
     * Tries to authenticate the user using the browser.
     *
     * @param e Event.
     * @returns Promise resolved when done.
     */
    async openBrowserSSO(e?: Event): Promise<void> {
        e?.preventDefault();
        e?.stopPropagation();

        // Check that there's no SSO authentication ongoing and the view hasn't changed.
        if (CoreSSO.isSSOAuthenticationOngoing() || this.viewLeft || !this.siteCheck) {
            return;
        }

        CoreLoginHelper.openBrowserForSSOLogin(
            this.siteCheck.siteUrl,
            this.siteCheck.code,
            this.siteCheck.service,
            this.siteCheck.config?.launchurl,
        );
    }

    /**
     * Opens OTP (One-Time Password) login flow.
     *
     * @param e Event.
     */
    openOTPLogin(e?: Event): void {
        e?.preventDefault();
        e?.stopPropagation();

        // Show phone input
        this.showOTPPhoneInput = true;
    }

    /**
     * Submits the phone number and starts OTP validation process.
     */
    async submitOTPPhone(): Promise<void> {
        if (!this.otpPhoneNumber || this.otpPhoneNumber.trim() === '') {
            CoreAlerts.showError('Please enter a phone number');
            return;
        }

        // Hide phone input, show loading
        this.showOTPPhoneInput = false;
        this.showOTPLoading = true;

        try {
            // Call web service to request OTP (no authentication required)
            const result = await CoreWS.callAjax<{
                success: boolean;
                session_id: string;
                message: string;
                error: string;
            }>('auth_otpmobile_request_otp', {
                phone: this.otpPhoneNumber,
            }, {
                siteUrl: this.site.getURL(),
            });

            if (!result.success) {
                // Show error
                this.showOTPLoading = false;
                this.showOTPPhoneInput = true;
                CoreAlerts.showError(result.error || 'Failed to send OTP code');
                return;
            }

            // Store session ID
            this.otpSessionId = result.session_id;

            // Show success
            this.showOTPLoading = false;
            this.showOTPSuccess = true;

            // After 2 seconds, hide success and show code input
            setTimeout(() => {
                this.showOTPSuccess = false;
                this.showOTPCodeInput = true;
            }, 2000);
        } catch (error) {
            this.showOTPLoading = false;
            this.showOTPPhoneInput = true;
            CoreAlerts.showError('Error requesting OTP: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }
    }

    /**
     * Handles OTP code input and auto-focus to next input.
     */
    onOTPInput(event: Event, index: number): void {
        const input = event.target as HTMLInputElement;
        const value = input.value;

        if (value.length === 1 && index < 5) {
            // Move to next input
            const nextInput = document.querySelector<HTMLInputElement>(`.otp-input-${index + 1}`);
            nextInput?.focus();
        }

        this.otpCode[index] = value;
    }

    /**
     * Handles backspace on OTP input to move to previous field.
     */
    onOTPKeyDown(event: KeyboardEvent, index: number): void {
        if (event.key === 'Backspace' && !this.otpCode[index] && index > 0) {
            const prevInput = document.querySelector<HTMLInputElement>(`.otp-input-${index - 1}`);
            prevInput?.focus();
        }
    }

    /**
     * Submits OTP code for verification.
     */
    async submitOTPCode(): Promise<void> {
        const code = this.otpCode.join('');
        if (code.length !== 6) {
            CoreAlerts.showError('Please enter the complete 6-digit code');
            return;
        }

        if (!this.otpSessionId) {
            CoreAlerts.showError('Invalid session. Please request a new code.');
            this.cancelOTPFlow();
            return;
        }

        const modal = await CoreLoadings.show();

        try {
            // Call web service to verify OTP (no authentication required)
            const result = await CoreWS.callAjax<{
                success: boolean;
                token: string;
                privatetoken: string;
                username: string;
                error: string;
            }>('auth_otpmobile_verify_otp', {
                phone: this.otpPhoneNumber,
                code: code,
                session_id: this.otpSessionId,
            }, {
                siteUrl: this.site.getURL(),
            });

            if (!result.success) {
                // Show error
                modal.dismiss();
                CoreAlerts.showError(result.error || 'Invalid OTP code');
                return;
            }

            // Authentication successful - create site with token
            const siteUrl = this.site.getURL();
            await CoreSites.newSite(siteUrl, result.token, result.privatetoken);

            // Reset OTP fields
            this.cancelOTPFlow();

            modal.dismiss();

            // Navigate to site home
            await CoreNavigator.navigateToSiteHome({ params: { urlToOpen: this.urlToOpen } });
        } catch (error) {
            modal.dismiss();
            CoreAlerts.showError('Error verifying OTP: ' + (error instanceof Error ? error.message : 'Unknown error'));
        }
    }

    /**
     * Cancels OTP flow and returns to main login.
     */
    cancelOTPFlow(): void {
        this.showOTPPhoneInput = false;
        this.showOTPLoading = false;
        this.showOTPSuccess = false;
        this.showOTPCodeInput = false;
        this.otpPhoneNumber = '';
        this.otpCode = ['', '', '', '', '', ''];
        this.otpSessionId = '';
    }

    /**
     * Tries to authenticate the user.
     *
     * @param e Event.
     * @returns Promise resolved when done.
     */
    async login(e?: Event): Promise<void> {
        e?.preventDefault();
        e?.stopPropagation();

        CoreKeyboard.close();

        // Get input data.
        const siteUrl = this.site.getURL();
        const username = this.credForm.value.username;
        const password = this.credForm.value.password;

        if (!username) {
            CoreAlerts.showError(Translate.instant('core.login.usernamerequired'));

            return;
        }
        if (!password) {
            CoreAlerts.showError(Translate.instant('core.login.passwordrequired'));

            return;
        }

        if (!CoreNetwork.isOnline()) {
            CoreAlerts.showError(Translate.instant('core.networkerrormsg'));

            return;
        }

        const modal = await CoreLoadings.show();

        // Start the authentication process.
        try {
            const data = await CoreSites.getUserToken(siteUrl, username, password);

            const siteId = await CoreSites.newSite(data.siteUrl, data.token, data.privateToken);

            // Offer biometric enrollment after first successful login
            if (siteId) {
                const site = await CoreSites.getSite(siteId);
                const siteName = await site.getSiteName();
                // await this.offerBiometricEnrollment(siteId, siteName);
            }

            // Reset fields so the data is not in the view anymore.
            this.credForm.controls['username'].reset();
            this.credForm.controls['password'].reset();

            await CoreNavigator.navigateToSiteHome({ params: { urlToOpen: this.urlToOpen } });
        } catch (error) {
            if (error instanceof CoreSiteError && CoreLoginHelper.isAppUnsupportedError(error)) {
                await CoreLoginHelper.showAppUnsupportedModal(siteUrl, this.site, error.debug);
            } else {
                CoreLoginHelper.treatUserTokenError(siteUrl, error, username, password);
            }

            if (error.loggedout) {
                CoreNavigator.navigate('/login/sites', { reset: true });
            } else if (error.errorcode == 'forcepasswordchangenotice') {
                // Reset password field.
                this.credForm.controls.password.reset();
            } else if (error.errorcode === 'invalidlogin') {
                this.loginAttempts++;
            }
        } finally {
            modal.dismiss();

            CoreForms.triggerFormSubmittedEvent(this.formElement(), true);
        }
    }

    /**
     * Exceeded attempts message clicked.
     *
     * @param event Click event.
     */
    exceededAttemptsClicked(event: Event): void {
        event.preventDefault();

        if (!(event.target instanceof HTMLAnchorElement)) {
            return;
        }

        this.forgottenPassword();
    }

    /**
     * Forgotten password button clicked.
     */
    forgottenPassword(): void {
        CoreLoginHelper.forgottenPasswordClicked(this.site.getURL(), this.credForm.value.username, this.siteConfig);
    }

    /**
     * Open email signup page.
     */
    openEmailSignup(): void {
        CoreNavigator.navigate('/login/emailsignup', { params: { siteUrl: this.site.getURL() } });
    }

    /**
     * Open settings page.
     */
    openSettings(): void {
        CoreNavigator.navigate('/settings');
    }

    /**
     * Offer biometric enrollment to user after successful login.
     *
     * @param siteId The site ID.
     * @param siteName The site name.
     */
    protected async offerBiometricEnrollment(siteId: string, siteName: string): Promise<void> {
        try {
            // Show enrollment prompt (will handle all checks internally)
            await this.biometricAuth.showEnrollmentPrompt(siteId, siteName);
        } catch {
            // Silently fail - don't disrupt login flow
        }
    }

    /**
     * @inheritdoc
     */
    ngOnDestroy(): void {
        this.viewLeft = true;
        CoreEvents.trigger(
            CoreEvents.LOGIN_SITE_UNCHECKED,
            {
                config: this.siteConfig,
                loginSuccessful: !!this.siteId,
            },
            this.siteId,
        );
        this.valueChangeSubscription?.unsubscribe();
        this.alwaysShowLoginFormObserver?.off();
        this.loginObserver?.off();
    }

}
