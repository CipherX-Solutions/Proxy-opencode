// app.js - CommonJS Bridge for Hostinger Phusion Passenger
import('./server.mjs').catch((err) => {
  console.error('Failed to start server.mjs:', err);
});
