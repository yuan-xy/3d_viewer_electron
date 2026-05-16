export * from "./gen/types.gen.js";
import { createClient } from "./gen/client/client.gen.js";
import { FicadClient } from "./gen/sdk.gen.js";
export { FicadClient };
export function createFicadClient(config) {
    if (!config?.fetch) {
        const customFetch = (req) => {
            // @ts-ignore
            req.timeout = false;
            return fetch(req);
        };
        config = { ...config, fetch: customFetch };
    }
    const client = createClient(config);
    return new FicadClient({ client });
}
