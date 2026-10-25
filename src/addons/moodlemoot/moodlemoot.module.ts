// (C) Copyright 2026 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0

import { NgModule, provideAppInitializer } from '@angular/core';
import { Routes } from '@angular/router';

import { CoreMainMenuRoutingModule } from '@features/mainmenu/mainmenu-routing.module';
import { CoreMainMenuDelegate } from '@features/mainmenu/services/mainmenu-delegate';
import { AddonMoodleMootSponsorsMainMenuHandler } from './services/handlers/sponsors-mainmenu';
import { AddonMoodleMootLocationMainMenuHandler } from './services/handlers/location-mainmenu';

const mainMenuRoutes: Routes = [
    {
        path: 'sponsors',
        loadChildren: () => import('@addons/moodlemoot/mainmenu-sponsors-lazy.module'),
    },
    {
        path: 'location',
        loadChildren: () => import('@addons/moodlemoot/mainmenu-location-lazy.module'),
    },
];

@NgModule({
    imports: [
        CoreMainMenuRoutingModule.forChild({ children: mainMenuRoutes }),
    ],
    providers: [
        provideAppInitializer(() => {
            CoreMainMenuDelegate.registerHandler(AddonMoodleMootSponsorsMainMenuHandler.instance);
            CoreMainMenuDelegate.registerHandler(AddonMoodleMootLocationMainMenuHandler.instance);
        }),
    ],
})
export class AddonMoodleMootModule {}
