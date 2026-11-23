import { defineConfig, type ProxyOptions } from 'vite';
import react from '@vitejs/plugin-react';
import { Agent } from 'node:https';
import { TLSSocket } from 'node:tls';
import { fileURLToPath, URL } from 'node:url';
import { API_ORIGINS, devApiPrefix, type ApiService } from './src/core/config/api-services';

const upstreamOptions = { keepAlive: true, proxyEnv: process.env };
const upstreamAgent = new Agent(upstreamOptions);
const apiProxy: Record<string, ProxyOptions> = {};

for (const service of Object.keys(API_ORIGINS) as ApiService[]) {
  const prefix = devApiPrefix(service);
  apiProxy[`^${prefix}/api/`] = {
    target: API_ORIGINS[service],
    agent: upstreamAgent,
    changeOrigin: true,
    secure: true,
    rewrite: (path) => path.slice(prefix.length),
    bypass: (request) => {
      const scheme = request.socket instanceof TLSSocket && request.socket.encrypted ? 'https' : 'http';
      const origin = request.headers.origin;
      const site = request.headers['sec-fetch-site'];
      if (origin && origin !== `${scheme}://${request.headers.host}`) return false;
      if (site && site !== 'same-origin' && site !== 'none') return false;
      // API clients use bearer tokens and did not send cookies cross-origin.
      delete request.headers.cookie;
    },
    configure: (proxy) => {
      proxy.on('proxyRes', (response) => {
        delete response.headers['set-cookie'];
        response.headers['cache-control'] = 'no-store';
      });
    },
  };
}

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 4200,
    proxy: apiProxy,
  },
});
