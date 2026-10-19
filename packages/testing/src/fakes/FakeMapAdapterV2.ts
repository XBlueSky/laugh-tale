import type { Coordinates, ProviderUnavailableResult } from "@laugh-tale-island/core";
import type {
  CameraIntent,
  CameraSnapshot,
  MapAdapterV2,
  MapMountConfig,
  MapPresentationV2,
  MarkerContentHandle,
  MarkerDescriptor,
  UserLocationContentHandle,
  UserLocationDescriptor,
} from "@laugh-tale-island/core/browser";
import { cloneTestValue } from "./FakeRouteAdapterV2.js";

export interface FakeMapAdapterV2Options {
  cameraSnapshot?: CameraSnapshot | null;
}

export interface FakeMapMountCall {
  readonly element: HTMLElement;
  readonly config: MapMountConfig;
}

interface MarkerRecord {
  handle: MarkerContentHandle;
  disposed: boolean;
}

interface UserLocationRecord {
  handle: UserLocationContentHandle;
  disposed: boolean;
}

function snapshotConfig(config: MapMountConfig): MapMountConfig {
  const routeStyle = config.visualProfile.routeStyle.bind(config.visualProfile);
  return {
    events: { ...config.events },
    visualProfile: {
      id: config.visualProfile.id,
      basemap: cloneTestValue(config.visualProfile.basemap),
      routeStyle: (route) => routeStyle(route),
    },
    createMarkerContent: config.createMarkerContent,
    createUserLocationContent: config.createUserLocationContent,
  };
}

function failureDiagnostic(error: unknown): string {
  try {
    if (error instanceof Error && typeof error.message === "string" && error.message.trim()) return error.message.trim();
  } catch {
    // A hostile thrown value falls through to a stable diagnostic.
  }
  return "Synthetic presentation factory failed";
}

function cleanupFailure(error: unknown): Error {
  try {
    if (error instanceof Error) return error;
  } catch {
    // A hostile thrown value is normalized below.
  }
  return new Error("Synthetic map cleanup failed", { cause: error });
}

export class FakeMapAdapterV2 implements MapAdapterV2 {
  readonly testOnly = true as const;
  readonly mountCalls: FakeMapMountCall[] = [];
  readonly renderCalls: MapPresentationV2[] = [];
  readonly cameraIntentCalls: CameraIntent[] = [];
  readonly userLocationCalls: Array<Coordinates | null> = [];
  readonly markerFactoryCalls: MarkerDescriptor[] = [];
  readonly markerElements: HTMLElement[] = [];
  readonly markerPositionCalls: Coordinates[] = [];
  readonly userLocationFactoryCalls: UserLocationDescriptor[] = [];
  readonly userLocationElements: HTMLElement[] = [];
  readonly userLocationPositionCalls: Coordinates[] = [];
  destroyCount = 0;
  cameraSnapshotReadCount = 0;
  markerDisposalCount = 0;
  userLocationDisposalCount = 0;
  private cameraSnapshot: CameraSnapshot | null;
  private config: MapMountConfig | null = null;
  private mounted = false;
  private pendingPresentation: MapPresentationV2 | null = null;
  private userLocation: Coordinates | null = null;
  private readonly markers = new Map<string, MarkerRecord>();
  private userRecord: UserLocationRecord | null = null;
  private lifecycleGeneration = 0;
  private renderOperation = 0;
  private userLocationOperation = 0;

  constructor(options: FakeMapAdapterV2Options = {}) {
    this.cameraSnapshot = options.cameraSnapshot === undefined
      ? null
      : options.cameraSnapshot === null
        ? null
        : cloneTestValue(options.cameraSnapshot);
  }

  mount(element: HTMLElement, config: MapMountConfig): Promise<void> {
    const generation = ++this.lifecycleGeneration;
    const cleanupError = this.releaseMount();
    if (this.lifecycleGeneration !== generation) {
      return cleanupError === undefined ? Promise.resolve() : Promise.reject(cleanupFailure(cleanupError));
    }
    const snapshot = snapshotConfig(config);
    this.mountCalls.push({ element, config: snapshot });
    this.config = snapshot;
    this.mounted = true;
    if (this.pendingPresentation !== null) {
      const operation = ++this.renderOperation;
      this.renderCurrent(this.pendingPresentation, generation, operation);
    }
    if (this.userLocation !== null) {
      const operation = ++this.userLocationOperation;
      this.createUserLocation(this.userLocation, generation, operation);
    }
    return cleanupError === undefined ? Promise.resolve() : Promise.reject(cleanupFailure(cleanupError));
  }

  render(presentation: MapPresentationV2): void {
    const snapshot = cloneTestValue(presentation);
    this.renderCalls.push(cloneTestValue(snapshot));
    this.pendingPresentation = snapshot;
    const operation = ++this.renderOperation;
    if (this.mounted) this.renderCurrent(snapshot, this.lifecycleGeneration, operation);
  }

  applyCameraIntent(intent: CameraIntent): void {
    this.cameraIntentCalls.push(cloneTestValue(intent));
  }

  getCameraSnapshot(): CameraSnapshot | null {
    this.cameraSnapshotReadCount += 1;
    return this.cameraSnapshot === null ? null : cloneTestValue(this.cameraSnapshot);
  }

  setCameraSnapshot(snapshot: CameraSnapshot | null): void {
    this.cameraSnapshot = snapshot === null ? null : cloneTestValue(snapshot);
  }

  setUserLocation(location: Coordinates | null): void {
    const snapshot = location === null ? null : cloneTestValue(location);
    this.userLocationCalls.push(snapshot === null ? null : cloneTestValue(snapshot));
    this.userLocation = snapshot;
    const operation = ++this.userLocationOperation;
    if (snapshot === null) {
      this.releaseUserLocation();
      return;
    }
    if (!this.mounted || this.config === null) return;
    if (this.userRecord === null) {
      this.createUserLocation(snapshot, this.lifecycleGeneration, operation);
      return;
    }
    const descriptor = { coordinates: cloneTestValue(snapshot) };
    const record = this.userRecord;
    record.handle.update(cloneTestValue(descriptor));
    if (!this.ownsUserLocation(this.lifecycleGeneration, operation, record)) return;
    this.userLocationPositionCalls.push(cloneTestValue(snapshot));
  }

  destroy(): void {
    this.destroyCount += 1;
    this.lifecycleGeneration += 1;
    this.renderOperation += 1;
    this.userLocationOperation += 1;
    this.pendingPresentation = null;
    this.userLocation = null;
    const cleanupError = this.releaseMount();
    if (cleanupError !== undefined) throw cleanupFailure(cleanupError);
  }

  emitMarkerSelect(ownerId: string): void {
    if (this.mounted) this.config?.events.onMarkerSelect(`${ownerId}`);
  }

  emitRouteSelect(routeId: string): void {
    if (this.mounted) this.config?.events.onRouteSelect(`${routeId}`);
  }

  emitUnavailable(result: ProviderUnavailableResult): void {
    if (this.mounted) this.config?.events.onUnavailable(cloneTestValue(result));
  }

  private reportFailure(error: unknown): void {
    this.emitUnavailable({ status: "unavailable", reason: "network", retryable: true, diagnostic: failureDiagnostic(error) });
  }

  private ownsRender(config: MapMountConfig, generation: number, operation: number): boolean {
    return this.mounted && this.config === config && this.lifecycleGeneration === generation && this.renderOperation === operation;
  }

  private ownsUserLocation(generation: number, operation: number, record?: UserLocationRecord): boolean {
    return this.mounted
      && this.lifecycleGeneration === generation
      && this.userLocationOperation === operation
      && (record === undefined || this.userRecord === record);
  }

  private renderCurrent(presentation: MapPresentationV2, generation: number, operation: number): void {
    const config = this.config;
    if (config === null) return;
    const active = new Set<string>();
    for (const descriptor of presentation.markers) {
      if (!this.ownsRender(config, generation, operation)) return;
      if (active.has(descriptor.ownerId)) continue;
      active.add(descriptor.ownerId);
      const snapshot = cloneTestValue(descriptor);
      const current = this.markers.get(snapshot.ownerId);
      if (current !== undefined) {
        current.handle.update(cloneTestValue(snapshot));
        if (!this.ownsRender(config, generation, operation) || this.markers.get(snapshot.ownerId) !== current) return;
        this.markerPositionCalls.push(cloneTestValue(snapshot.coordinates));
        continue;
      }
      this.markerFactoryCalls.push(cloneTestValue(snapshot));
      let handle: MarkerContentHandle;
      try {
        handle = config.createMarkerContent(cloneTestValue(snapshot));
      } catch (error) {
        if (this.ownsRender(config, generation, operation)) this.reportFailure(error);
        continue;
      }
      this.markerElements.push(handle.element);
      if (!this.ownsRender(config, generation, operation) || this.markers.has(snapshot.ownerId)) {
        this.releaseMarker({ handle, disposed: false });
        return;
      }
      this.markerPositionCalls.push(cloneTestValue(snapshot.coordinates));
      this.markers.set(snapshot.ownerId, { handle, disposed: false });
    }
    if (!this.ownsRender(config, generation, operation)) return;
    const removed: MarkerRecord[] = [];
    for (const [ownerId, record] of this.markers) {
      if (active.has(ownerId)) continue;
      this.markers.delete(ownerId);
      removed.push(record);
    }
    let firstError: unknown;
    let failed = false;
    for (const record of removed) {
      try {
        this.releaseMarker(record);
      } catch (error) {
        if (!failed) firstError = error;
        failed = true;
      }
    }
    if (failed) throw cleanupFailure(firstError);
  }

  private createUserLocation(location: Coordinates, generation: number, operation: number): void {
    const config = this.config;
    if (config === null || this.userRecord !== null) return;
    const descriptor = { coordinates: cloneTestValue(location) };
    this.userLocationFactoryCalls.push(cloneTestValue(descriptor));
    let handle: UserLocationContentHandle;
    try {
      handle = config.createUserLocationContent(cloneTestValue(descriptor));
    } catch (error) {
      if (this.ownsUserLocation(generation, operation)) this.reportFailure(error);
      return;
    }
    this.userLocationElements.push(handle.element);
    if (!this.ownsUserLocation(generation, operation) || this.userRecord !== null) {
      this.releaseUserLocationRecord({ handle, disposed: false });
      return;
    }
    this.userLocationPositionCalls.push(cloneTestValue(location));
    this.userRecord = { handle, disposed: false };
  }

  private releaseMarker(record: MarkerRecord): void {
    if (record.disposed) return;
    record.disposed = true;
    this.markerDisposalCount += 1;
    record.handle.dispose();
  }

  private releaseUserLocationRecord(record: UserLocationRecord): void {
    if (record.disposed) return;
    record.disposed = true;
    this.userLocationDisposalCount += 1;
    record.handle.dispose();
  }

  private releaseUserLocation(): void {
    const record = this.userRecord;
    this.userRecord = null;
    if (record !== null) this.releaseUserLocationRecord(record);
  }

  private releaseMount(): unknown {
    this.mounted = false;
    this.config = null;
    const records = [...this.markers.values()];
    this.markers.clear();
    const userRecord = this.userRecord;
    this.userRecord = null;
    let firstError: unknown;
    let failed = false;
    for (const record of records) {
      try {
        this.releaseMarker(record);
      } catch (error) {
        if (!failed) firstError = error;
        failed = true;
      }
    }
    if (userRecord !== null) {
      try {
        this.releaseUserLocationRecord(userRecord);
      } catch (error) {
        if (!failed) firstError = error;
        failed = true;
      }
    }
    return failed ? firstError : undefined;
  }
}
