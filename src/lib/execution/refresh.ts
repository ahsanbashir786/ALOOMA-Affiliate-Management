import "server-only";

/** Writes the Execution Plan from the newest numbers. Called after every data sync, so opening the screen is a plain read. Never throws. */
export async function refreshPlanAfterSync(): Promise<void> {
  try {
    const { syncPlan } = await import("./plan");
    await syncPlan();
  } catch (e) {
    console.error("The Execution Plan could not be refreshed after the sync", e);
  }
}
