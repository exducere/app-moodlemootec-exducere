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

import { Component, OnDestroy, OnInit } from '@angular/core';

import { CoreSites } from '@services/sites';
import { CorePromiseUtils } from '@singletons/promise-utils';
import { CoreEventObserver, CoreEvents } from '@singletons/events';
import {
    CoreUser,
    CoreUserProfile,
} from '@features/user/services/user';
import { CoreNavigator } from '@services/navigator';
import { CoreIonLoadingElement } from '@classes/ion-loading';
import { CoreSite } from '@classes/sites/site';
import { CoreFileUploaderHelper } from '@features/fileuploader/services/fileuploader-helper';
import { CoreMimetype } from '@singletons/mimetype';
import { Translate } from '@singletons';
import { CoreUrl } from '@singletons/url';
import { CoreLoadings } from '@services/overlays/loadings';
import { CoreTime } from '@singletons/time';
import { CoreAlerts } from '@services/overlays/alerts';
import { CoreSharedModule } from '@/core/shared.module';
import { CoreUserProfileFieldComponent } from '../../components/user-profile-field/user-profile-field';
import {
    CORE_USER_PROFILE_REFRESHED,
    CORE_USER_PROFILE_PICTURE_UPDATED,
    CORE_USER_PROFILE_SERVER_TIMEZONE,
} from '@features/user/constants';
import { CoreModals } from '@services/overlays/modals';
import { CoreFile } from '@services/file';
import { CoreFileUtils } from '@singletons/file-utils';
import { CoreQRScan } from '@services/qrscan';
import { CoreToasts } from '@services/overlays/toasts';
import { CoreCourseHelper } from '@features/course/services/course-helper';
import { AddonMoodleMoot, AddonMoodleMootTaller } from '@addons/moodlemoot/services/moodlemoot';
import QRCode from 'qrcode';

/**
 * Page that displays info about a user.
 */
@Component({
    selector: 'page-core-user-about',
    templateUrl: 'about.html',
    styleUrl: 'about.scss',
    imports: [
        CoreSharedModule,
        CoreUserProfileFieldComponent,
    ],
})
export default class CoreUserAboutPage implements OnInit, OnDestroy {

    courseId!: number;
    userLoaded = false;
    hasContact = false;
    hasDetails = false;
    user?: CoreUserProfile;
    title?: string;
    canChangeProfilePicture = false;
    interests?: string[];
    displayTimezone = false;
    canShowDepartment = false;
    showQRModal = false;
    qrDataUrl?: string;
    qrPayload?: string;
    showScannedUserModal = false;
    scannedUser?: CoreUserProfile;
    requestSending = false;
    requestSent = false;
    enrolledWorkshops: AddonMoodleMootTaller[] = [];
    enrolledLoaded = false;
    isCurrentUser = false;

    protected userId!: number;
    protected site!: CoreSite;
    protected obsProfileRefreshed?: CoreEventObserver;

    constructor() {
        try {
            this.site = CoreSites.getRequiredCurrentSite();
        } catch (error) {
            CoreAlerts.showError(error);
            CoreNavigator.back();

            return;
        }

        this.obsProfileRefreshed = CoreEvents.on(CORE_USER_PROFILE_REFRESHED, (data) => {
            if (!this.user || !data.user) {
                return;
            }

            this.user.email = data.user.email;
        }, CoreSites.getCurrentSiteId());
    }

    /**
     * @inheritdoc
     */
    async ngOnInit(): Promise<void> {
        this.userId = CoreNavigator.getRouteNumberParam('userId') || this.site.getUserId() || 0;
        this.courseId = CoreNavigator.getRouteNumberParam('courseId') || 0;
        this.canShowDepartment = this.userId != this.site.getUserId();
        this.isCurrentUser = this.userId === this.site.getUserId();

        // Allow to change the profile image only in the app profile page.
        this.canChangeProfilePicture =
            !this.courseId &&
            this.userId == this.site.getUserId() &&
            this.site.canUploadFiles() &&
            !CoreUser.isUpdatePictureDisabledInSite(this.site);

        this.fetchUser().finally(() => {
            this.userLoaded = true;
        });

        if (this.isCurrentUser) {
            this.fetchEnrolledWorkshops();
        }
    }

    /**
     * Fetch the list of MoodleMoot workshops the current user is enrolled in.
     */
    async fetchEnrolledWorkshops(refresh = false): Promise<void> {
        try {
            if (refresh) {
                await AddonMoodleMoot.invalidateAgenda();
            }

            const agenda = await AddonMoodleMoot.getAgenda(refresh);
            this.enrolledWorkshops = agenda
                .filter(t => t.isenrolled)
                .sort((a, b) => a.moot_start - b.moot_start);
        } catch {
            this.enrolledWorkshops = [];
        } finally {
            this.enrolledLoaded = true;
        }
    }

    /**
     * Open the course for an enrolled workshop.
     */
    async openEnrolledWorkshop(workshop: AddonMoodleMootTaller): Promise<void> {
        await CoreCourseHelper.openCourse({ id: workshop.id });
    }

    /**
     * Format the date range of a workshop for the card (e.g. "24 abr · 10:00").
     */
    formatWorkshopDate(workshop: AddonMoodleMootTaller): string {
        if (!workshop.moot_start) {
            return '';
        }

        const start = new Date(workshop.moot_start * 1000);
        const day = start.toLocaleDateString('es-EC', { day: '2-digit', month: 'short' });
        const time = start.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false });

        return `${day} · ${time}`;
    }

    /**
     * Fetches the user data.
     *
     * @returns Promise resolved when done.
     */
    async fetchUser(): Promise<void> {
        try {
            const user = await CoreUser.getProfile(this.userId, this.courseId);

            this.interests = user.interests ?
                user.interests.split(',').map(interest => interest.trim()) :
                undefined;

            this.hasContact = !!(user.email || user.phone1 || user.phone2 || user.city || user.country || user.address);
            this.hasDetails = !!(user.interests || (user.customfields && user.customfields.length > 0));

            this.user = user;
            this.title = user.fullname;

            this.fillTimezone();

            await this.checkUserImageUpdated();
        } catch (error) {
            CoreAlerts.showError(error, { default: Translate.instant('core.user.errorloaduser') });
        }
    }

    /**
     * Check if current user image has changed.
     *
     * @returns Promise resolved when done.
     */
    protected async checkUserImageUpdated(): Promise<void> {
        if (!this.site || !this.site.getInfo() || !this.user) {
            return;
        }

        if (this.userId != this.site.getUserId() || !this.isUserAvatarDirty()) {
            // Not current user or hasn't changed.
            return;
        }

        // The current user image received is different than the one stored in site info. Assume the image was updated.
        // Update the site info to get the right avatar in there.
        try {
            await CoreSites.updateSiteInfo(this.site.getId());
        } catch {
            // Cannot update site info. Assume the profile image is the right one.
            CoreEvents.trigger(CORE_USER_PROFILE_PICTURE_UPDATED, {
                userId: this.userId,
                picture: this.user.profileimageurl,
            }, this.site.getId());
        }

        if (this.isUserAvatarDirty()) {
            // The image is still different, this means that the good one is the one in site info.
            await this.refreshUser();
        } else {
            // Now they're the same, send event to use the right avatar in the rest of the app.
            CoreEvents.trigger(CORE_USER_PROFILE_PICTURE_UPDATED, {
                userId: this.userId,
                picture: this.user.profileimageurl,
            }, this.site.getId());
        }
    }

    /**
     * Opens dialog to change profile picture.
     */
    async changeProfilePicture(): Promise<void> {
        const maxSize = -1;
        const title = Translate.instant('core.user.newpicture');
        const mimetypes = CoreMimetype.getGroupMimeInfo('image', 'mimetypes');
        let modal: CoreIonLoadingElement | undefined;

        try {
            let fileEntry = await CoreFileUploaderHelper.selectFile(maxSize, false, title, mimetypes);
            const fileObject = await CoreFile.getFileObjectFromFileEntry(fileEntry);
            const image = await CoreFileUtils.filetoBlob(fileObject);

            const { CoreViewerImageEditComponent } = await import('@features/viewer/components/image-edit/image-edit');

            const editedImageBlob = await CoreModals.openModal<Blob>({
                component: CoreViewerImageEditComponent,
                cssClass: 'core-modal-fullscreen',
                componentProps: {
                    image,
                },
            });

            if (editedImageBlob) {
                // Override the file entry with the edited image.
                fileEntry = await CoreFile.writeFile(fileEntry.fullPath, editedImageBlob);
            } else {
                return;
            }

            const result =
                await CoreFileUploaderHelper.uploadFileEntry(fileEntry, true, maxSize, true, false);

            modal = await CoreLoadings.show('core.sending', true);

            const profileImageURL = await CoreUser.changeProfilePicture(result.itemid, this.userId, this.site.getId());

            CoreEvents.trigger(CORE_USER_PROFILE_PICTURE_UPDATED, {
                userId: this.userId,
                picture: profileImageURL,
            }, this.site.getId());

            CoreSites.updateSiteInfo(this.site.getId());

            this.refreshUser();
        } catch (error) {
            CoreAlerts.showError(error);
        } finally {
            modal?.dismiss();
        }
    }

    /**
     * Refresh the user data.
     *
     * @param event Event.
     * @returns Promise resolved when done.
     */
    async refreshUser(event?: HTMLIonRefresherElement): Promise<void> {
        await CorePromiseUtils.ignoreErrors(CoreUser.invalidateUserCache(this.userId));

        await this.fetchUser();

        if (this.isCurrentUser) {
            await this.fetchEnrolledWorkshops(true);
        }

        event?.complete();

        if (this.user) {
            CoreEvents.trigger(CORE_USER_PROFILE_REFRESHED, {
                courseId: this.courseId,
                userId: this.userId,
                user: this.user,
            }, this.site.getId());
        }
    }

    /**
     * Check whether the user avatar is not up to date with site info.
     *
     * @returns Whether the user avatar differs from site info cache.
     */
    protected isUserAvatarDirty(): boolean {
        if (!this.user || !this.site) {
            return false;
        }

        const courseAvatarUrl = this.normalizeAvatarUrl(this.user.profileimageurl);
        const siteAvatarUrl = this.normalizeAvatarUrl(this.site.getInfo()?.userpictureurl);

        return courseAvatarUrl !== siteAvatarUrl;
    }

    /**
     * Normalize an avatar url regardless of theme.
     *
     * Given that the default image is the only one that can be changed per theme, any other url will stay the same. Note that
     * the values returned by this function may not be valid urls, given that they are intended for string comparison.
     *
     * @param avatarUrl Avatar url.
     * @returns Normalized avatar string (may not be a valid url).
     */
    protected normalizeAvatarUrl(avatarUrl?: string): string {
        if (!avatarUrl) {
            return 'undefined';
        }

        if (CoreUrl.isThemeImageUrl(avatarUrl, this.site?.siteUrl)) {
            return 'default';
        }

        return avatarUrl;
    }

    /**
     * Fill user timezone depending on the server and fix the legacy timezones.
     */
    protected fillTimezone(): void {
        if (!this.user) {
            return;
        }

        const serverTimezone = CoreSites.getRequiredCurrentSite().getStoredConfig('timezone');
        this.displayTimezone = !!serverTimezone;

        if (!this.displayTimezone) {
            return;
        }

        if (this.user.timezone === CORE_USER_PROFILE_SERVER_TIMEZONE) {
            this.user.timezone = serverTimezone;
        }

        if (this.user.timezone) {
            this.user.timezone = CoreTime.translateLegacyTimezone(this.user.timezone);
        }
    }

    /**
     * Open the QR modal, generating the payload for the current user profile.
     */
    async openProfileQR(): Promise<void> {
        if (!this.user) {
            return;
        }

        const siteUrl = this.site.siteUrl.replace(/\/$/, '');
        this.qrPayload = `${siteUrl}/user/profile.php?id=${this.userId}`;

        try {
            this.qrDataUrl = await QRCode.toDataURL(this.qrPayload, {
                errorCorrectionLevel: 'M',
                margin: 1,
                width: 320,
                color: {
                    dark: '#194866',
                    light: '#ffffff',
                },
            });
            this.showQRModal = true;
        } catch (error) {
            CoreAlerts.showError(error);
        }
    }

    /**
     * Close the QR modal.
     */
    closeProfileQR(): void {
        this.showQRModal = false;
    }

    /**
     * Scan another user's QR code, fetch their profile and show it in a modal.
     */
    async scanUserQR(): Promise<void> {
        if (!CoreQRScan.canScanQR()) {
            CoreAlerts.showError(Translate.instant('core.qrnotsupported'));

            return;
        }

        let text: string | undefined;
        try {
            text = await CoreQRScan.scanQR('Escanear QR de usuario');
        } catch (error) {
            CoreAlerts.showError(error);

            return;
        }

        if (!text) {
            return;
        }

        const params = CoreUrl.extractUrlParams(text);
        const scannedId = params.id ? parseInt(params.id, 10) : NaN;

        if (!scannedId) {
            CoreAlerts.showError('El código escaneado no corresponde a un perfil de usuario válido.');

            return;
        }

        const loading = await CoreLoadings.show('core.loading', true);

        try {
            this.scannedUser = await CoreUser.getProfile(scannedId);
            this.requestSent = false;
            this.requestSending = false;
            this.showScannedUserModal = true;
        } catch (error) {
            CoreAlerts.showError(error, { default: Translate.instant('core.user.errorloaduser') });
        } finally {
            loading.dismiss();
        }
    }

    /**
     * Close the scanned-user modal.
     */
    closeScannedUser(): void {
        this.showScannedUserModal = false;
        this.scannedUser = undefined;
        this.requestSending = false;
        this.requestSent = false;
    }

    /**
     * Send a connection request to the scanned user. Placeholder until the
     * MoodleMoot plugin exposes the corresponding webservice.
     */
    async sendConnectionRequest(): Promise<void> {
        if (!this.scannedUser || this.requestSending || this.requestSent) {
            return;
        }

        this.requestSending = true;

        try {
            await new Promise(resolve => setTimeout(resolve, 600));
            this.requestSent = true;

            await CoreToasts.show({
                message: `Solicitud enviada a ${this.scannedUser.fullname}.`,
                duration: 2500,
                position: 'bottom',
            });
        } finally {
            this.requestSending = false;
        }
    }

    /**
     * Entry point for the "Iniciar sesión Moodle Flow" flow. Not yet implemented.
     */
    async startMoodleFlowLogin(): Promise<void> {
        await CoreToasts.show({
            message: 'Moodle Flow estará disponible próximamente.',
            duration: 2500,
            position: 'bottom',
        });
    }

    /**
     * Open a user interest.
     *
     * @param interest Interest name.
     */
    openInterest(interest: string): void {
        CoreNavigator.navigateToSitePath('/tag/index', { params: {
            tagName: interest,
        } });
    }

    /**
     * @inheritdoc
     */
    ngOnDestroy(): void {
        this.obsProfileRefreshed?.off();
    }

}
