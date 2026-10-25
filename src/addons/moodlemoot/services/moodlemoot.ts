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
    // eslint-disable-next-line @typescript-eslint/naming-convention
    moot_level: string;
    // eslint-disable-next-line @typescript-eslint/naming-convention
    moot_audience: string;
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

export interface AddonMoodleMootUnenrolResult {
    status: boolean;
    courseid: number;
}

export interface AddonMootecQRUser {
    id: number;
    fullname: string;
    email: string;
    city: string;
    country: string;
    profileimageurl: string;
}

export interface AddonMootecUserStatus {
    ui: string;
    is_assigned: boolean;
    user?: AddonMootecQRUser;
    events: { id: number; name: string; status: number }[];
}

export interface AddonMoodleMootSponsor {
    id: number;
    name: string;
    category: string;
    code: string;
    imageurl: string;
    sortorder: number;
    isvisited: boolean;
}

export interface AddonMoodleMootSponsorVisitResult {
    status: boolean;
    alreadyvisited: boolean;
    sponsorid: number;
    sponsorname: string;
}

const WS_GET_AGENDA = 'local_moodlemootecuador_get_agenda';
const WS_GET_TALLER = 'local_moodlemootecuador_get_taller';
const WS_ENROL_TALLER = 'local_moodlemootecuador_enrol_taller';
const WS_UNENROL_TALLER = 'local_moodlemootecuador_unenrol_taller';
const WS_GET_USER_STATUS = 'local_moodlemootecuador_get_user_status';
const WS_GET_SPONSORS = 'local_moodlemootecuador_get_sponsors';
const WS_REGISTER_SPONSOR_VISIT = 'local_moodlemootecuador_register_sponsor_visit';

const CACHE_KEY_AGENDA = 'local_moodlemoot:agenda';
const CACHE_KEY_SPONSORS = 'local_moodlemoot:sponsors';
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
     * Self-unenrol current user from a taller.
     */
    async unenrolTaller(courseid: number): Promise<AddonMoodleMootUnenrolResult> {
        const site = await CoreSites.getRequiredCurrentSite();

        return site.write<AddonMoodleMootUnenrolResult>(WS_UNENROL_TALLER, { courseid });
    }

    /**
     * Resolve a mootec QR token (the `ui` param from the QR URL) to user data.
     * Calls local_mootec_get_user_status — no cache, always hits the network.
     */
    async getUserByToken(ui: string): Promise<AddonMootecUserStatus> {
        const site = await CoreSites.getRequiredCurrentSite();

        return site.read<AddonMootecUserStatus>(WS_GET_USER_STATUS, { ui });
    }

    /**
     * List of sponsors with image URL and current-user visit status.
     */
    async getSponsors(forceNetwork = false): Promise<AddonMoodleMootSponsor[]> {
        const site = await CoreSites.getCurrentSite();
        if (!site) {
            return [];
        }

        const preSets: CoreSiteWSPreSets = {
            cacheKey: CACHE_KEY_SPONSORS,
            updateFrequency: CoreCacheUpdateFrequency.OFTEN,
            getFromCache: !forceNetwork,
        };

        return site.read<AddonMoodleMootSponsor[]>(WS_GET_SPONSORS, {}, preSets);
    }

    /**
     * Register a sponsor visit via its QR code value (e.g. "sponsor001").
     */
    async registerSponsorVisit(code: string): Promise<AddonMoodleMootSponsorVisitResult> {
        const site = await CoreSites.getRequiredCurrentSite();

        return site.write<AddonMoodleMootSponsorVisitResult>(WS_REGISTER_SPONSOR_VISIT, { code });
    }

    /**
     * Invalidate cached sponsors list.
     */
    async invalidateSponsors(): Promise<void> {
        const site = await CoreSites.getCurrentSite();
        if (!site) {
            return;
        }

        await site.invalidateWsCacheForKey(CACHE_KEY_SPONSORS);
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
