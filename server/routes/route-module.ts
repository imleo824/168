import type { Express } from 'express';

export type RouteModuleDeps = Record<string, unknown>;

export type RouteModule<TDeps extends RouteModuleDeps = RouteModuleDeps> = {
  /** Stable module name for logs and architecture audits. */
  name: string;
  /** Register all HTTP routes owned by this module. */
  register(app: Express, deps: TDeps): void;
};
