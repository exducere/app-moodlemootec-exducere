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

/**
 * Handler to expose the current user profile (`user/about`) as a main menu tab.
 */
@Injectable({ providedIn: 'root' })
export class CoreUserMainMenuHandlerService implements CoreMainMenuHandler {

    name = 'CoreUserProfile';
    priority = 999; // Sits right after Home (1000).

    /**
     * @inheritdoc
     */
    async isEnabled(): Promise<boolean> {
        return !!CoreSites.getCurrentSite();
    }

    /**
     * @inheritdoc
     */
    getDisplayData(): CoreMainMenuHandlerData {
        const userId = CoreSites.getCurrentSite()?.getUserId();

        return {
            icon: 'due-user-graduate-duotone',
            title: 'core.user.profile',
            page: 'myprofile',
            pageParams: userId ? { userId } : undefined,
            class: 'core-user-profile-handler',
        };
    }

}

export const CoreUserMainMenuHandler = makeSingleton(CoreUserMainMenuHandlerService);
