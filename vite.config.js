import { spawn } from "node:child_process";
import { defineConfig, lazyPlugins } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function phpDevServer() {
  return {
    name: "php-dev-server",
    configureServer(server) {
      const host = process.env.PHP_DEV_HOST || "127.0.0.1";
      const port = process.env.PHP_DEV_PORT || "3001";
      const frontendPort = server.config.server.port || 5199;
      const php = spawn(process.env.PHP_BIN || "php", ["-S", `${host}:${port}`, "php/router.php"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          PDF_APP_URL: `http://127.0.0.1:${frontendPort}`,
          PDF_RUNTIME_BIN: process.execPath,
          PHP_CLI_SERVER_WORKERS: process.env.PHP_CLI_SERVER_WORKERS || "4",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      const forward = (chunk) => process.stdout.write(`[php] ${chunk}`);
      php.stdout.on("data", forward);
      php.stderr.on("data", forward);
      php.on("error", (error) => server.config.logger.error(`PHP não iniciou: ${error.message}`));

      server.httpServer?.once("close", () => {
        if (!php.killed) php.kill("SIGTERM");
      });
    },
  };
}

// https://vite.dev/config/
export default defineConfig({
  fmt: {},
  lint: {
    plugins: ["react", "oxc"],
    rules: {
      "react/rules-of-hooks": "error",
      "react/only-export-components": [
        "warn",
        {
          allowConstantExport: true,
        },
      ],
      "vite-plus/prefer-vite-plus-imports": "error",
    },
    options: {
      typeAware: true,
      typeCheck: true,
    },
    jsPlugins: [
      {
        name: "vite-plus",
        specifier: "vite-plus/oxlint-plugin",
      },
    ],
  },
  plugins: lazyPlugins(() => [phpDevServer(), react(), tailwindcss()]),
  server: {
    proxy: {
      "/api": "http://localhost:3001",
      "/uploads": "http://localhost:3001",
    },
  },
});
