import type { ChomyApi } from "@chomy/contracts";
declare global {
  interface Window {
    readonly chomy: ChomyApi;
  }
}
