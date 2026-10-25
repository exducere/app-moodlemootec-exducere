// (C) Copyright 2026 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0

import { Component } from '@angular/core';

import { CoreSharedModule } from '@/core/shared.module';
import { CoreMainMenuUserButtonComponent } from '@features/mainmenu/components/user-menu-button/user-menu-button';
import { CoreOpener } from '@singletons/opener';

// ── Venue configuration ────────────────────────────────────────────────────

const VENUE_NAME = 'Pontificia Universidad Católica del Ecuador';
const VENUE_TAGLINE = 'Sede oficial del MoodleMoot Ecuador 2026';
const VENUE_ADDRESS = 'Av. 12 de Octubre y Vicente Ramón Roca 1076, Quito, Ecuador';
const VENUE_DESCRIPTION =
    'La Pontificia Universidad Católica del Ecuador es la primera universidad privada del Ecuador. ' +
    'Fue fundada en 1946 por la Compañía de Jesús y el entonces arzobispo de Quito, ' +
    'cardenal Carlos María de la Torre.';

// Decimal coordinates (latitude, longitude).
const VENUE_LAT = -0.2101847664953756;
const VENUE_LNG = -78.49229467931634;

// Floor-plan / croquis image (local asset).
const VENUE_CROQUIS_URL = 'assets/img/moodlemoot/croquis-puce.png';

// ──────────────────────────────────────────────────────────────────────────

@Component({
    selector: 'addon-moodlemoot-location',
    templateUrl: 'location.html',
    styleUrl: 'location.scss',
    imports: [CoreSharedModule, CoreMainMenuUserButtonComponent],
})
export default class AddonMoodleMootLocationPage {

    readonly venueName = VENUE_NAME;
    readonly venueTagline = VENUE_TAGLINE;
    readonly venueAddress = VENUE_ADDRESS;
    readonly venueDescription = VENUE_DESCRIPTION;
    readonly croquisUrl = VENUE_CROQUIS_URL;

    readonly mapsOpenUrl = `https://www.google.com/maps?q=${VENUE_LAT},${VENUE_LNG}`;

    croquisFullscreen = false;

    async openInMaps(): Promise<void> {
        await CoreOpener.openInBrowser(this.mapsOpenUrl);
    }

    openCroquis(): void {
        if (this.croquisUrl) {
            this.croquisFullscreen = true;
        }
    }

    closeCroquis(): void {
        this.croquisFullscreen = false;
    }

}
