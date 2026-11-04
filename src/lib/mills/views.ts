import type { ViewStore } from "../pacts/db";
import type { Snapshot } from "../pacts/issues";
import type { SyncStatus } from "../pacts/sync";
import type { Audience, NavData } from "../pacts/views";

import { type Config, type Dashboard, type DashboardType, findDashboard } from "../pacts/config";
import { NotFoundError, type SyncService, type ViewService } from "../pacts/services";
import { type Filters, type UnmatchedQuery } from "../pacts/views";
import { buildBoard, buildInbox, scopedRepos, unmatchedItems } from "./board";

export interface ViewDeps {
  config: () => Config;
  store: ViewStore;
  syncer: Pick<SyncService, "status">;
  /** Login behind the token; null when it cannot be fetched. */
  viewer: () => Promise<string | null>;
}

interface Context {
  config: Config;
  snapshot: Snapshot;
  audience: Audience;
  status: SyncStatus;
}

function dashboardOf<T extends DashboardType>(config: Config, id: string, type: T) {
  const dashboard = findDashboard(config, id);
  const isType = (d: Dashboard | undefined): d is Extract<Dashboard, { type: T }> =>
    d?.type === type;
  if (!isType(dashboard)) throw new NotFoundError(`${type} not found`);
  return dashboard;
}

export class Views implements ViewService {
  constructor(private readonly deps: ViewDeps) {}

  /** The config, the cached issues and jobs of its repos, who views them and the sync status. */
  private async context(): Promise<Context> {
    const { config: load, store, syncer, viewer } = this.deps;
    const config = load();
    return {
      config,
      snapshot: store.snapshot(config.repos),
      audience: { users: config.users, viewer: await viewer(), hidden: config.hiddenRepos },
      status: syncer.status(),
    };
  }

  async nav(): Promise<NavData> {
    const { config, snapshot, audience } = await this.context();
    return {
      dashboards: config.dashboards.map(({ id, name, filter }) => ({
        id,
        name,
        repos: [...scopedRepos(snapshot, { filter }, audience)],
      })),
      repos: config.repos,
      hidden: config.hiddenRepos,
    };
  }

  async board(id: string, filters: Filters) {
    const { config, snapshot, audience, status } = await this.context();
    const dashboard = dashboardOf(config, id, "board");
    const board = buildBoard(snapshot, dashboard, { ...audience, query: filters });
    return { dashboard, board, status };
  }

  async inbox(id: string, filters: Filters) {
    const { config, snapshot, audience, status } = await this.context();
    const dashboard = dashboardOf(config, id, "inbox");
    const inbox = buildInbox(snapshot, dashboard, { ...audience, query: filters });
    return { dashboard, inbox, status };
  }

  async unmatched(query: UnmatchedQuery) {
    const { config, snapshot, audience, status } = await this.context();
    const { items, offer } = unmatchedItems(snapshot, config.dashboards, { ...audience, query });
    return { items, offer, status };
  }

  labels(repos: string[]) {
    return this.deps.store.listLabels(repos);
  }
}
