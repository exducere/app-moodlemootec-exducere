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

import { Component, OnInit, viewChild } from '@angular/core';
import { IonContent } from '@ionic/angular';
import { Subscription } from 'rxjs';

import { CoreSites } from '@services/sites';
import { CoreEventObserver } from '@singletons/events';
import { CoreTabsOutletComponent, CoreTabsOutletTab } from '@components/tabs-outlet/tabs-outlet';
import { CoreMainMenuHomeDelegate, CoreMainMenuHomeHandlerToDisplay } from '../../services/home-delegate';
import { CoreArray } from '@singletons/array';
import { CoreSharedModule } from '@/core/shared.module';
import { CoreSiteLogoComponent } from '../../../../components/site-logo/site-logo';
import { CoreMainMenuUserButtonComponent } from '../../components/user-menu-button/user-menu-button';
import { MAIN_MENU_HOME_PAGE_NAME } from '@features/mainmenu/constants';
import { CoreLoadings } from '@services/overlays/loadings';
import { CoreAlerts } from '@services/overlays/alerts';
import { AddonCalendar, AddonCalendarCalendarEvent } from '@addons/calendar/services/calendar';
import { CoreNavigator } from '@services/navigator';
import {
    AddonMoodleMoot,
    AddonMoodleMootTaller,
    AddonMoodleMootTeacher,
} from '@addons/moodlemoot/services/moodlemoot';

interface AgendaWorkshop {
    id: number;
    fullname: string;
    summary: string;
    courseimage?: string;
    startdate: number;       // unix seconds (maps moot_start)
    enddate: number;         // unix seconds (maps moot_end)
    startHour: number;       // 0-23 with decimals (e.g. 9.5 = 9:30)
    durationHours: number;
    location?: string;
    color: string;
    enrolled: boolean;
    maxEnrolled: number;     // 0 = unlimited
    currentEnrolled: number;
    isfull: boolean;
    canselfenrol: boolean;
    requireskey: boolean;
    teachers: AddonMoodleMootTeacher[];
}

interface AgendaCalendarItem {
    id: number;
    name: string;
    description: string;
    location?: string;
    startdate: number;
    enddate: number;
    startHour: number;
    durationHours: number;
    eventType: string;
    color: string;
}

interface TimelineItemBase {
    key: string;
    startHour: number;
    durationHours: number;
    column: number;
    columns: number;
}

type TimelineItem =
    | (TimelineItemBase & { kind: 'workshop'; workshop: AgendaWorkshop })
    | (TimelineItemBase & { kind: 'calendar'; event: AgendaCalendarItem });

// Moodle Moot Ecuador palette — solid, white-text-friendly.
const COLOR_PALETTE = ['#194866', '#f98012', '#65a1b3', '#282828', '#194866', '#f98012'];
const CALENDAR_EVENT_COLOR = '#65a1b3';
const ROW_HEIGHT_PX = 80;

// Moodle Moot Ecuador 2026 event window.
const EVENT_FIRST_DAY = { year: 2026, month: 6, day: 10 };
const EVENT_LAST_DAY = { year: 2026, month: 6, day: 12 };

@Component({
    selector: 'page-core-mainmenu-home',
    templateUrl: 'home.html',
    styleUrl: 'home.scss',
    imports: [
        CoreSharedModule,
    ],
})
export default class CoreMainMenuHomePage implements OnInit {

    readonly tabsComponent = viewChild(CoreTabsOutletComponent);
    readonly agendaContent = viewChild(IonContent);

    siteName = '';
    tabs: CoreTabsOutletTab[] = [];
    loaded = false;

    // Agenda state.
    workshopsLoaded = false;
    viewMode: 'timeline' | 'list' = 'timeline';
    selectedDate: Date = new Date();
    availableDates: Date[] = [];
    workshopsByDay: Record<string, AgendaWorkshop[]> = {};
    calendarEventsByDay: Record<string, AgendaCalendarItem[]> = {};
    fetchedCalendarDays = new Set<string>();
    dayEventsLoading = false;
    timelineHours: number[] = Array.from({ length: 24 }, (_, i) => i);
    selectedWorkshop?: AgendaWorkshop;
    showDetailModal = false;
    enrolling = false;

    protected subscription?: Subscription;
    protected updateSiteObserver?: CoreEventObserver;

    async ngOnInit(): Promise<void> {
        this.subscription = CoreMainMenuHomeDelegate.getHandlersObservable().subscribe((handlers) => {
            handlers && this.initHandlers(handlers);
        });

        await this.loadWorkshops();
    }

    initHandlers(handlers: CoreMainMenuHomeHandlerToDisplay[]): void {
        const loaded = CoreMainMenuHomeDelegate.areHandlersLoaded();
        const handlersMap = CoreArray.toObject(handlers, 'title');
        const newTabs = handlers.map((handler): CoreTabsOutletTab => {
            const tab = this.tabs.find(tab => tab.title == handler.title);
            if (tab) {
                return tab;
            }

            return {
                page: `/main/${MAIN_MENU_HOME_PAGE_NAME}/${handler.page}`,
                pageParams: handler.pageParams,
                title: handler.title,
                class: handler.class,
                icon: handler.icon,
                badge: handler.badge,
                enabled: handler.enabled ?? true,
            };
        });

        newTabs.sort((a, b) => (handlersMap[b.title].priority || 0) - (handlersMap[a.title].priority || 0));
        this.tabs = newTabs;

        setTimeout(() => {
            this.loaded = loaded;
        }, 50);
    }

    /**
     * Fetch the MoodleMoot agenda from the custom plugin WS and shape the
     * response into AgendaWorkshop grouped by day.
     */
    async loadWorkshops(refresh = false): Promise<void> {
        try {
            this.workshopsLoaded = false;

            if (refresh) {
                await AddonMoodleMoot.invalidateAgenda();
            }

            const talleres = await AddonMoodleMoot.getAgenda(refresh);

            const workshops = talleres
                .filter(t => t.moot_start > 0)
                .map((t, idx) => this.buildWorkshop(t, idx));

            const byDay: Record<string, AgendaWorkshop[]> = {};
            for (const w of workshops) {
                const key = this.dayKey(new Date(w.startdate * 1000));
                (byDay[key] ??= []).push(w);
            }
            for (const key of Object.keys(byDay)) {
                byDay[key].sort((a, b) => a.startdate - b.startdate);
            }

            this.workshopsByDay = byDay;
            this.availableDates = Object.keys(byDay)
                .sort()
                .map(k => this.dateFromKey(k));

            this.selectedDate = this.pickDefaultDate();
            await this.ensureCalendarEventsLoaded(this.selectedDate);
        } catch (error) {
            CoreAlerts.showError(error);
        } finally {
            this.workshopsLoaded = true;
            this.scheduleScrollToCurrentHour();
        }
    }

    protected buildWorkshop(taller: AddonMoodleMootTaller, idx: number): AgendaWorkshop {
        const start = taller.moot_start;
        const end = taller.moot_end > start ? taller.moot_end : start + 3600;
        const startDate = new Date(start * 1000);

        return {
            id: taller.id,
            fullname: taller.fullname,
            summary: taller.summary || '',
            courseimage: taller.courseimage || undefined,
            startdate: start,
            enddate: end,
            startHour: startDate.getHours() + startDate.getMinutes() / 60,
            durationHours: Math.max(0.5, (end - start) / 3600),
            location: taller.moot_room || undefined,
            color: COLOR_PALETTE[idx % COLOR_PALETTE.length],
            enrolled: taller.isenrolled,
            maxEnrolled: taller.moot_capacity,
            currentEnrolled: taller.currentenrolled,
            isfull: taller.isfull,
            canselfenrol: taller.canselfenrol,
            requireskey: taller.requireskey,
            teachers: taller.teachers ?? [],
        };
    }

    workshopsForSelectedDay(): AgendaWorkshop[] {
        return this.workshopsByDay[this.dayKey(this.selectedDate)] ?? [];
    }

    /**
     * Unified list (workshops + calendar events) for the list view, sorted by start time.
     * Unlike timelineItemsForSelectedDay() this skips overlap-column assignment.
     */
    listItemsForSelectedDay(): TimelineItem[] {
        const workshops = this.workshopsForSelectedDay();
        const events = this.calendarEventsForSelectedDay();

        const items: TimelineItem[] = [
            ...workshops.map<TimelineItem>(w => ({
                kind: 'workshop',
                key: `w-${w.id}`,
                startHour: w.startHour,
                durationHours: w.durationHours,
                column: 0,
                columns: 1,
                workshop: w,
            })),
            ...events.map<TimelineItem>(e => ({
                kind: 'calendar',
                key: `c-${e.id}`,
                startHour: e.startHour,
                durationHours: e.durationHours,
                column: 0,
                columns: 1,
                event: e,
            })),
        ];

        items.sort((a, b) => a.startHour - b.startHour || a.durationHours - b.durationHours);

        return items;
    }

    calendarEventsForSelectedDay(): AgendaCalendarItem[] {
        return this.calendarEventsByDay[this.dayKey(this.selectedDate)] ?? [];
    }

    /**
     * Merge workshops + calendar events into a single list with overlap columns assigned.
     */
    timelineItemsForSelectedDay(): TimelineItem[] {
        const workshops = this.workshopsForSelectedDay();
        const events = this.calendarEventsForSelectedDay();

        const items: TimelineItem[] = [
            ...workshops.map<TimelineItem>(w => ({
                kind: 'workshop',
                key: `w-${w.id}`,
                startHour: w.startHour,
                durationHours: w.durationHours,
                column: 0,
                columns: 1,
                workshop: w,
            })),
            ...events.map<TimelineItem>(e => ({
                kind: 'calendar',
                key: `c-${e.id}`,
                startHour: e.startHour,
                durationHours: e.durationHours,
                column: 0,
                columns: 1,
                event: e,
            })),
        ];

        this.assignOverlapColumns(items);

        return items;
    }

    /**
     * Greedy column assignment: events clustered by overlap get side-by-side slots.
     */
    protected assignOverlapColumns(items: TimelineItem[]): void {
        if (!items.length) {return;}

        items.sort((a, b) => a.startHour - b.startHour || a.durationHours - b.durationHours);

        let cluster: TimelineItem[] = [];
        let clusterEnd = -Infinity;

        const flush = (): void => {
            if (!cluster.length) {return;}
            const columnsLastEnd: number[] = [];
            for (const it of cluster) {
                const end = it.startHour + it.durationHours;
                let placed = false;
                for (let i = 0; i < columnsLastEnd.length; i++) {
                    if (columnsLastEnd[i] <= it.startHour + 0.0001) {
                        it.column = i;
                        columnsLastEnd[i] = end;
                        placed = true;
                        break;
                    }
                }
                if (!placed) {
                    it.column = columnsLastEnd.length;
                    columnsLastEnd.push(end);
                }
            }
            const total = columnsLastEnd.length;
            for (const it of cluster) {
                it.columns = total;
            }
        };

        for (const it of items) {
            if (it.startHour >= clusterEnd - 0.0001) {
                flush();
                cluster = [];
                clusterEnd = -Infinity;
            }
            cluster.push(it);
            clusterEnd = Math.max(clusterEnd, it.startHour + it.durationHours);
        }
        flush();
    }

    blockStyle(item: TimelineItem): Record<string, string> {
        const baseHour = this.timelineHours[0] ?? 0;
        const top = (item.startHour - baseHour) * ROW_HEIGHT_PX;
        const height = Math.max(28, item.durationHours * ROW_HEIGHT_PX - 4);
        const widthPct = 100 / item.columns;
        const leftPct = item.column * widthPct;
        const gapPx = item.columns > 1 ? 6 : 0;

        return {
            top: `${top}px`,
            height: `${height}px`,
            left: `${leftPct}%`,
            width: `calc(${widthPct}% - ${gapPx}px)`,
            background: this.itemColor(item),
        };
    }

    itemColor(item: TimelineItem): string {
        return item.kind === 'workshop' ? item.workshop.color : item.event.color;
    }

    itemTitle(item: TimelineItem): string {
        return item.kind === 'workshop' ? item.workshop.fullname : item.event.name;
    }

    itemSummary(item: TimelineItem): string {
        return item.kind === 'workshop' ? item.workshop.summary : item.event.description;
    }

    itemStart(item: TimelineItem): number {
        return item.kind === 'workshop' ? item.workshop.startdate : item.event.startdate;
    }

    itemDurationHours(item: TimelineItem): number {
        return item.durationHours;
    }

    formatHour(h: number): string {
        const period = h < 12 ? 'am' : 'pm';
        const display = h === 0 ? 12 : h > 12 ? h - 12 : h;

        return `${display} ${period}`;
    }

    formatTime(timestamp: number): string {
        const d = new Date(timestamp * 1000);
        const hours = d.getHours();
        const mins = d.getMinutes().toString().padStart(2, '0');
        const period = hours < 12 ? 'am' : 'pm';
        const display = hours === 0 ? 12 : hours > 12 ? hours - 12 : hours;

        return `${display}:${mins} ${period}`;
    }

    formatDuration(source: AgendaWorkshop | AgendaCalendarItem | TimelineItem | number): string {
        const hours = typeof source === 'number'
            ? source
            : 'durationHours' in source
                ? source.durationHours
                : 0;
        const total = Math.round(hours * 60);
        const h = Math.floor(total / 60);
        const m = total % 60;
        if (h && m) {return `${h} h ${m} min`;}
        if (h) {return `${h} h`;}

        return `${m} min`;
    }

    formatDateLong(date: Date): string {
        return date.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    }

    canGoPrev(): boolean {
        return this.selectedDate.getTime() > this.firstEventDay().getTime();
    }

    canGoNext(): boolean {
        return this.selectedDate.getTime() < this.lastEventDay().getTime();
    }

    /**
     * True when the real calendar day falls inside the event window.
     */
    isEventDayToday(): boolean {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const first = this.firstEventDay().getTime();
        const last = this.lastEventDay().getTime();

        return today.getTime() >= first && today.getTime() <= last;
    }

    async goPrev(): Promise<void> {
        if (!this.canGoPrev()) {
            return;
        }

        this.selectedDate = this.clampToEventRange(this.shiftDay(this.selectedDate, -1));
        await this.ensureCalendarEventsLoaded(this.selectedDate);
    }

    async goNext(): Promise<void> {
        if (!this.canGoNext()) {
            return;
        }

        this.selectedDate = this.clampToEventRange(this.shiftDay(this.selectedDate, 1));
        await this.ensureCalendarEventsLoaded(this.selectedDate);
    }

    /**
     * Jump to today (clamped to the event window).
     */
    async goToday(): Promise<void> {
        this.selectedDate = this.pickDefaultDate();
        await this.ensureCalendarEventsLoaded(this.selectedDate);
        this.scheduleScrollToCurrentHour();
    }

    protected firstEventDay(): Date {
        return new Date(EVENT_FIRST_DAY.year, EVENT_FIRST_DAY.month - 1, EVENT_FIRST_DAY.day);
    }

    protected lastEventDay(): Date {
        return new Date(EVENT_LAST_DAY.year, EVENT_LAST_DAY.month - 1, EVENT_LAST_DAY.day);
    }

    protected clampToEventRange(date: Date): Date {
        const d = new Date(date);
        d.setHours(0, 0, 0, 0);
        const first = this.firstEventDay().getTime();
        const last = this.lastEventDay().getTime();
        if (d.getTime() < first) {
            return this.firstEventDay();
        }
        if (d.getTime() > last) {
            return this.lastEventDay();
        }

        return d;
    }

    /**
     * Scroll the timeline so the current hour sits near the top of the viewport.
     * Only runs when the selected day is today.
     */
    protected scheduleScrollToCurrentHour(): void {
        if (!this.isToday() || this.viewMode !== 'timeline') {
            return;
        }

        // Wait a tick so the timeline grid is laid out before scrolling.
        setTimeout(() => this.scrollToCurrentHour(), 80);
    }

    protected async scrollToCurrentHour(): Promise<void> {
        const content = this.agendaContent();
        if (!content) {
            return;
        }

        const now = new Date();
        const currentHour = now.getHours() + now.getMinutes() / 60;
        // Leave ~0.4h of breathing room above the current hour.
        const y = Math.max(0, (currentHour - 0.4) * ROW_HEIGHT_PX);
        await content.scrollToPoint(0, y, 300);
    }

    isToday(): boolean {
        const today = new Date();

        return this.dayKey(today) === this.dayKey(this.selectedDate);
    }

    protected shiftDay(date: Date, delta: number): Date {
        const d = new Date(date);
        d.setDate(d.getDate() + delta);
        d.setHours(0, 0, 0, 0);

        return d;
    }

    toggleView(): void {
        this.viewMode = this.viewMode === 'timeline' ? 'list' : 'timeline';
        this.scheduleScrollToCurrentHour();
    }

    async openWorkshop(workshop: AgendaWorkshop): Promise<void> {
        this.selectedWorkshop = workshop;
        this.showDetailModal = true;
    }

    async openItem(item: TimelineItem): Promise<void> {
        if (item.kind === 'workshop') {
            await this.openWorkshop(item.workshop);

            return;
        }

        CoreNavigator.navigateToSitePath(`/calendar/event/${item.event.id}`);
    }

    /**
     * Fetch calendar events for a given day if not cached yet.
     */
    protected async ensureCalendarEventsLoaded(date: Date): Promise<void> {
        const key = this.dayKey(date);
        if (this.fetchedCalendarDays.has(key)) {return;}

        this.dayEventsLoading = true;
        try {
            const day = await AddonCalendar.getDayEvents(date.getFullYear(), date.getMonth() + 1, date.getDate());
            this.calendarEventsByDay[key] = (day.events || []).map(e => this.buildCalendarItem(e));
            this.fetchedCalendarDays.add(key);
        } catch {
            // Silent: timeline still usable without calendar events.
            this.calendarEventsByDay[key] = [];
            this.fetchedCalendarDays.add(key);
        } finally {
            this.dayEventsLoading = false;
        }
    }

    protected buildCalendarItem(event: AddonCalendarCalendarEvent): AgendaCalendarItem {
        const startDate = new Date(event.timestart * 1000);
        const rawDuration = (event.timeduration || 0) / 3600;

        // Clamp start/duration to visible day so cross-day events still render.
        const clampedStart = Math.max(0, startDate.getHours() + startDate.getMinutes() / 60);
        const clampedDuration = Math.max(0.5, Math.min(24 - clampedStart, rawDuration || 0.5));

        return {
            id: event.id,
            name: event.name,
            description: (event.description || '').replace(/<[^>]+>/g, '').trim(),
            location: event.location,
            startdate: event.timestart,
            enddate: event.timestart + (event.timeduration || 0),
            startHour: clampedStart,
            durationHours: clampedDuration,
            eventType: String(event.eventtype),
            color: CALENDAR_EVENT_COLOR,
        };
    }

    closeWorkshop(): void {
        this.showDetailModal = false;
        this.selectedWorkshop = undefined;
    }

    async enrolInWorkshop(): Promise<void> {
        const w = this.selectedWorkshop;
        if (!w || w.enrolled || this.enrolling) {
            return;
        }

        const loading = await CoreLoadings.show('core.loading', true);
        this.enrolling = true;
        try {
            const result = await AddonMoodleMoot.enrolTaller(w.id);

            w.enrolled = true;
            w.currentEnrolled = result.enrolled;
            w.isfull = result.capacity > 0 && result.enrolled >= result.capacity;

            await AddonMoodleMoot.invalidateAgenda();
            await AddonMoodleMoot.invalidateTaller(w.id);

            CoreAlerts.show({ message: 'Te matriculaste correctamente en el taller.' });
        } catch (error) {
            const code = (error as { errorcode?: string } | undefined)?.errorcode;
            const messages: Record<string, string> = {
                'error:tallerfull':         'El cupo de este taller ya está lleno.',
                'error:alreadyenrolled':    'Ya estás matriculado en este taller.',
                'error:noselfenrol':        'La auto-matriculación no está habilitada para este taller.',
                'error:outsideenrolwindow': 'La ventana de matriculación está cerrada.',
                'error:tallernotfound':     'No se encontró el taller.',
            };
            const friendly = code && messages[code] ? messages[code] : undefined;

            if (friendly) {
                CoreAlerts.show({ message: friendly });
            } else {
                CoreAlerts.showError(error);
            }
        } finally {
            this.enrolling = false;
            loading.dismiss();
        }
    }

    capacityRatio(w: AgendaWorkshop): number {
        if (!w.maxEnrolled) {return 0;}

        return Math.min(1, w.currentEnrolled / w.maxEnrolled);
    }

    capacityLabel(w: AgendaWorkshop): string {
        if (!w.maxEnrolled) {return `${w.currentEnrolled} matriculados`;}

        return `${w.currentEnrolled}/${w.maxEnrolled} matriculados`;
    }

    capacityClass(w: AgendaWorkshop): string {
        const ratio = this.capacityRatio(w);
        if (ratio >= 1) {return 'full';}
        if (ratio >= 0.8) {return 'near-full';}

        return '';
    }

    /**
     * Default visible date: today if it falls in the event window, otherwise the first event day.
     */
    protected pickDefaultDate(): Date {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        return this.clampToEventRange(today);
    }

    protected dayKey(d: Date): string {
        return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}-${d.getDate().toString().padStart(2, '0')}`;
    }

    protected dateFromKey(key: string): Date {
        const [y, m, d] = key.split('-').map(Number);

        return new Date(y, m - 1, d);
    }

    tabSelected(): void {
        CoreSites.loginNavigationFinished();
    }

    ionViewDidEnter(): void {
        this.tabsComponent()?.ionViewDidEnter();
        this.scheduleScrollToCurrentHour();
    }

    ionViewDidLeave(): void {
        this.tabsComponent()?.ionViewDidLeave();
    }

}
