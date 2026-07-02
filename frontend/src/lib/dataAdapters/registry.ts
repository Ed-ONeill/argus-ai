/**
 * lib/dataAdapters/registry.ts - the provider registry.
 *
 * A single in-memory registry so any part of the system can discover which providers
 * are available and read their health, without knowing the concrete adapters. Nothing
 * registers automatically: registration is explicit (see providers/index.ts), so the
 * production bundle stays inert until a provider is deliberately wired in. Pure library,
 * no UI, no em/en dashes.
 */

import type { DataAdapter, ProviderHealth, ProviderId, ProviderMetadata } from "./types";

export class ProviderRegistry {
  private providers = new Map<ProviderId, DataAdapter>();

  registerProvider(adapter: DataAdapter): void {
    this.providers.set(adapter.id, adapter);
  }

  unregisterProvider(id: ProviderId): boolean {
    return this.providers.delete(id);
  }

  getProvider(id: ProviderId): DataAdapter | undefined {
    return this.providers.get(id);
  }

  listProviders(): DataAdapter[] {
    return [...this.providers.values()];
  }

  has(id: ProviderId): boolean {
    return this.providers.has(id);
  }

  /** Live health snapshot across every registered provider. */
  healthReport(): ProviderHealth[] {
    return this.listProviders().map(p => p.health());
  }

  /** Static capability report across every registered provider. */
  metadataReport(): ProviderMetadata[] {
    return this.listProviders().map(p => p.metadata());
  }

  clear(): void {
    this.providers.clear();
  }
}

/** The shared registry instance. */
export const providerRegistry = new ProviderRegistry();
