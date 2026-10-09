
// app.js - CommonJS wrapper for Hostinger Phusion Passenger
import('./oc-api-proxy.mjs').catch((err) => {
  console.error('Failed to load oc-api-proxy.mjs:', err);
});
