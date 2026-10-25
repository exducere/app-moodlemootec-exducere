// (C) Copyright 2026 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0

import { Injectable } from '@angular/core';
import { makeSingleton } from '@singletons';

import { CoreSites } from '@services/sites';
import { CoreMainMenuHandler, CoreMainMenuHandlerData } from '@features/mainmenu/services/mainmenu-delegate';

@Injectable({ providedIn: 'root' })
export class AddonMoodleMootSponsorsMainMenuHandlerService implements CoreMainMenuHandler {

    name = 'AddonMoodleMootSponsors';
    priority = 900; // After profile (999), visible as 3rd tab.

    async isEnabled(): Promise<boolean> {
        return !!CoreSites.getCurrentSite();
    }

    getDisplayData(): CoreMainMenuHandlerData {
        return {
            icon: 'due-rectangle-ad',
            title: 'Sponsors',
            page: 'sponsors',
            class: 'addon-moodlemoot-sponsors-handler',
        };
    }

}

export const AddonMoodleMootSponsorsMainMenuHandler = makeSingleton(AddonMoodleMootSponsorsMainMenuHandlerService);
