export { assertUsersCanInteract, isUserBlockedEitherDirection } from "../../clients/relationship-client.js";

export async function initializeBlockModels(): Promise<void> {
  // Relationship state is owned by Relationship Server. Kept as a no-op compatibility export.
}
