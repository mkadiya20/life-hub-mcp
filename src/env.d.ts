// Secrets (set via `wrangler secret put` / .dev.vars). Not emitted by `wrangler types`,
// so declared here. Augments both the global `Env` and `Cloudflare.Env` (the latter is
// what `import { env } from "cloudflare:workers"` resolves to).
interface SecretBindings {
	GITHUB_CLIENT_ID: string;
	GITHUB_CLIENT_SECRET: string;
	COOKIE_ENCRYPTION_KEY: string;
}

interface Env extends SecretBindings {}

declare namespace Cloudflare {
	interface Env extends SecretBindings {}
}
