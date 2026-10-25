// (C) Copyright 2026 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0

import { Injector, NgModule } from '@angular/core';
import { Routes, ROUTES } from '@angular/router';

import { buildTabMainRoutes } from '@features/mainmenu/mainmenu-tab-routing.module';

export const MAIN_MENU_LOCATION_PAGE_NAME = 'location';

function buildRoutes(injector: Injector): Routes {
    return buildTabMainRoutes(injector, {
        loadComponent: () => import('@addons/moodlemoot/pages/location/location'),
        data: {
            mainMenuTabRoot: MAIN_MENU_LOCATION_PAGE_NAME,
        },
    });
}

@NgModule({
    providers: [
        { provide: ROUTES, multi: true, deps: [Injector], useFactory: buildRoutes },
    ],
})
export default class AddonMoodleMootLocationLazyModule {}
