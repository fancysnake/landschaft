import type { ViewStore } from "../pacts/db";
import type { Audience, NavData, Snapshot } from "../pacts/types";
import type { Syncer } from "./sync";

import {
  type Config,
  type Dashboard,
  type DashboardType,
  findDashboard,
  type UnmatchedQuery,
  type ViewQuery,
} from "../pacts/schema";
import { InvalidError, NotFoundError, type ViewService } from "../pacts/services";
import { parseIssueKey } from "../pacts/types";
import { buildBoard, buildInbox, scopedRepos, unmatchedItems } from "./board";

export interface ViewDeps {
  config: () => Config;
  store: ViewStore;
  syncer: Pick<Syncer, "status" | "viewer">;
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

  /**
   * The cached issues and jobs of the configured repos and who views them; `viewer` is null when
   * it cannot be fetched.
   */
  private async audience({
    repos,
    users,
  }: Pick<Config, "repos" | "users">): Promise<Audience & { snapshot: Snapshot }> {
    const { store, syncer } = this.deps;
    return {
      snapshot: store.snapshot(repos),
      users,
      viewer: await syncer.viewer().catch(() => null),
    };
  }

  async nav(): Promise<NavData> {
    const config = this.deps.config();
    const { snapshot, ...audience } = await this.audience(config);
    return {
      dashboards: config.dashboards.map(({ id, name, filter }) => ({
        id,
        name,
        repos: [...scopedRepos(snapshot, { filter }, audience)],
      })),
      repos: config.repos,
    };
  }

  async board(id: string, query: ViewQuery) {
    const config = this.deps.config();
    const dashboard = dashboardOf(config, id, "board");
    const { snapshot, ...audience } = await this.audience(config);
    const starred = this.deps.store.starredEpics(dashboard.id);
    const board = buildBoard(snapshot, dashboard, { ...audience, query, starred });
    return { dashboard, board, status: this.deps.syncer.status() };
  }

  async inbox(id: string, query: ViewQuery) {
    const config = this.deps.config();
    const dashboard = dashboardOf(config, id, "inbox");
    const { snapshot, ...audience } = await this.audience(config);
    const inbox = buildInbox(snapshot, dashboard, { ...audience, query });
    return { dashboard, inbox, status: this.deps.syncer.status() };
  }

  async unmatched(query: UnmatchedQuery) {
    const config = this.deps.config();
    const { snapshot, ...audience } = await this.audience(config);
    const { items, offer } = unmatchedItems(snapshot, config.dashboards, { ...audience, query });
    return { items, offer, status: this.deps.syncer.status() };
  }

  labels(repos: string[]) {
    return this.deps.store.listLabels(repos);
  }

  starEpic(id: string, epic: string, starred: boolean): string[] {
    const config = this.deps.config();
    const dashboard = findDashboard(config, id);
    if (!dashboard) throw new NotFoundError("dashboard not found");
    if (starred && !config.repos.includes(parseIssueKey(epic)?.repo ?? "")) {
      throw new InvalidError("epic is not in a configured repository");
    }
    const { store } = this.deps;
    store.setEpicStarred(dashboard.id, epic, starred);
    return [...store.starredEpics(dashboard.id)];
  }
}
