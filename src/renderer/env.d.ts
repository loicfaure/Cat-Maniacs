import type { AnimalAppApi } from "../shared/types";

declare global {
  interface Window {
    catApp: AnimalAppApi;
  }
}
