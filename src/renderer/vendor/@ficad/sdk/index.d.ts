export * from "./gen/types.gen.js";
import { type Config } from "./gen/client/types.gen.js";
import { FicadClient } from "./gen/sdk.gen.js";
export { type Config as FicadClientConfig, FicadClient };
export declare function createFicadClient(config?: Config): FicadClient;
