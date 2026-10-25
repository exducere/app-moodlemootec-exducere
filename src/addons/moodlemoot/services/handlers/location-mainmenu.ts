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
export class AddonMoodleMootLocationMainMenuHandlerService implements CoreMainMenuHandler {

    name = 'AddonMoodleMootLocation';
    priority = 850;

    async isEnabled(): Promise<boolean> {
        return !!CoreSites.getCurrentSite();
    }

    getDisplayData(): CoreMainMenuHandlerData {
        return {
            icon: 'due-map-location',
            title: 'Ubicación',
            page: 'location',
            class: 'addon-moodlemoot-location-handler',
        };
    }

}

export const AddonMoodleMootLocationMainMenuHandler = makeSingleton(AddonMoodleMootLocationMainMenuHandlerService);
