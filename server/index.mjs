import { loadConfig } from "./config.mjs";
import { Store } from "./store.mjs";
import { EnableBanking } from "./provider.mjs";
import { BankingService } from "./banking.mjs";
import { createApp } from "./http.mjs";

const config = loadConfig();
if (!config.encryptionKey) {
  console.error("Banking setup required: run npm run banking:setup first.");
  process.exit(1);
}
const store = new Store(config.database, config.encryptionKey);
const provider = new EnableBanking(config);
const server = createApp(
  config,
  store,
  new BankingService(store, provider, config),
  provider,
);
server.requestTimeout = 180000;
server.listen(config.port, "127.0.0.1", () =>
  console.log(
    `Banking server listening on 127.0.0.1:${config.port} (${config.environment}). Callback: ${config.callback}`,
  ),
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () =>
    server.close(() => {
      store.close();
      process.exit(0);
    }),
  );
