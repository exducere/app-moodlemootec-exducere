// (C) Copyright 2026 Moodle Pty Ltd.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0

import { Injectable } from '@angular/core';

import { CoreCacheUpdateFrequency } from '@/core/constants';
import { CoreSites } from '@services/sites';
import { CoreSiteWSPreSets } from '@classes/sites/authenticated-site';
import { makeSingleton } from '@singletons';

export interface AddonMoodleMootTeacher {
    id: number;
    fullname: string;
    pictureurl: string;
}

export interface AddonMoodleMootTaller {
    id: number;
    fullname: string;
    shortname: string;
    summary: string;
    courseimage: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    moot_start: number;          // unix seconds
    // eslint-disable-next-line @typescript-eslint/naming-convention
    moot_end: number;            // unix seconds
    // eslint-disable-next-line @typescript-eslint/naming-convention
    moot_room: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    moot_capacity: number;       // 0 = unlimited
    currentenrolled: number;
    isfull: boolean;
    isenrolled: boolean;
    canselfenrol: boolean;
    requireskey: boolean;
    teachers: AddonMoodleMootTeacher[];
}

export interface AddonMoodleMootEnrolResult {
    status: boolean;
    courseid: number;
    enrolled: number;
    capacity: number;
}

const WS_GET_AGENDA = 'local_moodlemoot_get_agenda';
const WS_GET_TALLER = 'local_moodlemoot_get_taller';
const WS_ENROL_TALLER = 'local_moodlemoot_enrol_taller';

const CACHE_KEY_AGENDA = 'local_moodlemoot:agenda';
const CACHE_KEY_TALLER_PREFIX = 'local_moodlemoot:taller:';

@Injectable({ providedIn: 'root' })
export class AddonMoodleMootProvider {

    /**
     * Full agenda (talleres) for the MoodleMoot event.
     */
    async getAgenda(forceNetwork = false): Promise<AddonMoodleMootTaller[]> {
        const site = await CoreSites.getCurrentSite();
        if (!site) {
            return [];
        }

        const preSets: CoreSiteWSPreSets = {
            cacheKey: CACHE_KEY_AGENDA,
            updateFrequency: CoreCacheUpdateFrequency.OFTEN,
            getFromCache: !forceNetwork,
        };

        return site.read<AddonMoodleMootTaller[]>(WS_GET_AGENDA, {}, preSets);
    }

    /**
     * Detail for a single taller.
     */
    async getTaller(courseid: number): Promise<AddonMoodleMootTaller> {
        const site = await CoreSites.getRequiredCurrentSite();

        const preSets: CoreSiteWSPreSets = {
            cacheKey: CACHE_KEY_TALLER_PREFIX + courseid,
            updateFrequency: CoreCacheUpdateFrequency.SOMETIMES,
        };

        return site.read<AddonMoodleMootTaller>(WS_GET_TALLER, { courseid }, preSets);
    }

    /**
     * Self-enrol current user in a taller. Honors capacity server-side.
     */
    async enrolTaller(courseid: number): Promise<AddonMoodleMootEnrolResult> {
        const site = await CoreSites.getRequiredCurrentSite();

        return site.write<AddonMoodleMootEnrolResult>(WS_ENROL_TALLER, { courseid });
    }

    /**
     * Drop the cached agenda so the next fetch hits the network.
     */
    async invalidateAgenda(): Promise<void> {
        const site = await CoreSites.getCurrentSite();
        if (!site) {
            return;
        }

        await site.invalidateWsCacheForKey(CACHE_KEY_AGENDA);
    }

    /**
     * Drop cached detail for a single taller (after enrolling, etc.).
     */
    async invalidateTaller(courseid: number): Promise<void> {
        const site = await CoreSites.getCurrentSite();
        if (!site) {
            return;
        }

        await site.invalidateWsCacheForKey(CACHE_KEY_TALLER_PREFIX + courseid);
    }

}

export const AddonMoodleMoot = makeSingleton(AddonMoodleMootProvider);
