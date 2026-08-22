import type {
  HostBridgeLease,
  HostBridgeModule,
  HostBridgeModuleOptions,
  HostCapability,
} from "./types.js";

const requiredCapabilities: readonly HostCapability[] = ["session.read", "thread.navigate"];

export async function createHostBridgeModule(
  options: HostBridgeModuleOptions,
): Promise<HostBridgeModule> {
  const probe = await options.adapter.probe();
  if (!options.supportedFingerprints.includes(probe.fingerprint)) {
    throw new Error(`unsupported host fingerprint: ${probe.fingerprint}`);
  }

  for (const capability of requiredCapabilities) {
    if (!probe.capabilities.includes(capability)) {
      throw new Error(`host is missing required capability: ${capability}`);
    }
  }

  const connection = await options.adapter.attach();
  const clients = new Set<string>();
  let disposed = false;

  return {
    connect(client): HostBridgeLease {
      if (disposed) {
        throw new Error("HostBridgeModule is disposed");
      }
      if (clients.has(client.id)) {
        throw new Error(`host bridge client already connected: ${client.id}`);
      }
      clients.add(client.id);
      let leaseDisposed = false;

      return {
        source: connection.source,
        async openThread(threadId) {
          if (leaseDisposed || disposed) {
            throw new Error(`host bridge client is disconnected: ${client.id}`);
          }
          const receipt = await connection.openThread(threadId);
          if (
            receipt.requestedThreadId !== threadId ||
            receipt.openedThreadId !== threadId
          ) {
            throw new Error(`host opened ${receipt.openedThreadId} instead of ${threadId}`);
          }
        },
        dispose() {
          if (leaseDisposed) {
            return;
          }
          leaseDisposed = true;
          clients.delete(client.id);
        },
      };
    },
    async dispose() {
      if (disposed) {
        return;
      }
      disposed = true;
      clients.clear();
      await connection.release();
    },
  };
}
