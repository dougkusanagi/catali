import { spawn } from "node:child_process";
import { defineConfig, lazyPlugins } from "vite-plus";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function laravelDevServer() {
  return {
    name: "laravel-dev-server",
    configureServer(server) {
      const host = process.env.PHP_DEV_HOST || "127.0.0.1";
      const port = process.env.PHP_DEV_PORT || "3001";
      const frontendPort = server.config.server.port || 5199;
      const laravel = spawn(process.env.PHP_BIN || "php", [
        "artisan",
        "serve",
        "--host",
        host,
        "--port",
        String(port),
        "--no-reload",
      ], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          APP_ENV: process.env.APP_ENV || "local",
          APP_KEY: process.env.APP_KEY || "base64:eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHg=",
          APP_URL: `http://${host}:${port}`,
          PDF_APP_URL: `http://127.0.0.1:${frontendPort}`,
          PDF_RUNTIME_BIN: process.execPath,
          PHP_CLI_SERVER_WORKERS: process.env.PHP_CLI_SERVER_WORKERS || "4",
        },
        stdio: ["ignore", "pipe", "pipe"],
      });

      const forward = (chunk) => process.stdout.write(`[laravel] ${chunk}`);
      laravel.stdout.on("data", forward);
      laravel.stderr.on("data", forward);
      laravel.on("error", (error) => server.config.logger.error(`Laravel não iniciou: ${error.message}`));

      server.httpServer?.once("close", () => {
        if (!laravel.killed) laravel.kill("SIGTERM");
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
  plugins: lazyPlugins(() => [laravelDevServer(), react(), tailwindcss()]),
  server: {
    // The E2E runner can isolate the Laravel process on another port so a
    // previously opened dev server never leaks data into the test database.
    proxy: {
      "/api": `http://localhost:${process.env.PHP_DEV_PORT || "3001"}`,
      "/uploads": `http://localhost:${process.env.PHP_DEV_PORT || "3001"}`,
    },
  },
});
