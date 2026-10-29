// @ts-check
import { defineConfig } from 'astro/config';

// Served by GitHub Pages as a project site: https://rensoanthonycasalme.github.io/ePortfolio_Casalme/
export default defineConfig({
  site: 'https://rensoanthonycasalme.github.io',
  base: '/ePortfolio_Casalme',
  security: {
    // Content-Security-Policy as a <meta> tag (GitHub Pages cannot send headers).
    // Astro hashes every script and <style> it emits, so nothing else can run.
    csp: {
      directives: [
        "default-src 'self'",
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self' https://cloudflare-dns.com", // the terminal's `dig` uses DNS-over-HTTPS
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'none'",
        'upgrade-insecure-requests',
      ],
      styleDirective: {
        resources: [
          "'self'",
          // inline style="" attributes only (markup and a few features use them); <style> blocks stay hashed
          { resource: "'unsafe-inline'", kind: 'attribute' },
        ],
      },
    },
  },
});
