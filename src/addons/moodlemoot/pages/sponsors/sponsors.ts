// (C) Copyright 2026 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0

import { Component, OnInit } from '@angular/core';

import { CoreSharedModule } from '@/core/shared.module';
import { CoreMainMenuUserButtonComponent } from '@features/mainmenu/components/user-menu-button/user-menu-button';
import { CoreQRScan } from '@services/qrscan';
import { CoreAlerts } from '@services/overlays/alerts';
import { CoreToasts, ToastDuration } from '@services/overlays/toasts';
import { CoreLoadings } from '@services/overlays/loadings';
import { CoreUrl } from '@singletons/url';
import { Translate } from '@singletons';
import { AddonMoodleMoot, AddonMoodleMootSponsor } from '@addons/moodlemoot/services/moodlemoot';

@Component({
    selector: 'addon-moodlemoot-sponsors',
    templateUrl: 'sponsors.html',
    styleUrl: 'sponsors.scss',
    imports: [CoreSharedModule, CoreMainMenuUserButtonComponent],
})
export default class AddonMoodleMootSponsorsPage implements OnInit {

    sponsors: AddonMoodleMootSponsor[] = [];
    loaded = false;
    scanning = false;

    async ngOnInit(): Promise<void> {
        await this.loadSponsors();
    }

    async loadSponsors(forceNetwork = false): Promise<void> {
        try {
            this.sponsors = await AddonMoodleMoot.getSponsors(forceNetwork);
        } catch (error) {
            CoreAlerts.showError(error);
        } finally {
            this.loaded = true;
        }
    }

    async refreshSponsors(event?: { target: { complete: () => void } }): Promise<void> {
        await AddonMoodleMoot.invalidateSponsors();
        await this.loadSponsors(true);
        event?.target.complete();
    }

    async scanSponsorQR(): Promise<void> {
        if (!CoreQRScan.canScanQR()) {
            CoreAlerts.showError(Translate.instant('core.qrnotsupported'));

            return;
        }

        let text: string | undefined;
        try {
            text = await CoreQRScan.scanQR('Escanear QR de sponsor');
        } catch {
            return;
        }

        if (!text) {
            return;
        }

        const params = CoreUrl.extractUrlParams(text);
        const code = params['ui'];

        if (!code || !code.startsWith('sponsor')) {
            CoreAlerts.showError('El código escaneado no corresponde a un sponsor válido.');

            return;
        }

        const loading = await CoreLoadings.show('core.loading', true);
        try {
            const result = await AddonMoodleMoot.registerSponsorVisit(code);

            // Update local state immediately (optimistic).
            const sponsor = this.sponsors.find(s => s.code === code);
            if (sponsor) {
                sponsor.isvisited = true;
            }

            if (result.alreadyvisited) {
                CoreToasts.show({
                    message: `Ya estás suscrito a ${result.sponsorname}.`,
                    duration: ToastDuration.LONG,
                });
            } else {
                CoreToasts.show({
                    message: `¡Te suscribiste a ${result.sponsorname}!`,
                    duration: ToastDuration.LONG,
                });
            }

            // Invalidate cache so next load reflects the visit.
            await AddonMoodleMoot.invalidateSponsors();
        } catch (error) {
            CoreAlerts.showError(error);
        } finally {
            loading.dismiss();
        }
    }

}
