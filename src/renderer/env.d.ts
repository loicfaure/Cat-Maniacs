import type { CatAppApi } from "../shared/types";

declare global {
  interface Window {
    catApp: CatAppApi;
  }
}

export {};
