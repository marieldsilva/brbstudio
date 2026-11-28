import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'application-route-fallback',
      configureServer(server) {
        server.middlewares.use((request, response, next) => {
          if (!request.url) {
            next();
            return;
          }

          const [pathname, search] = request.url.split('?');
          if (
            request.headers.accept?.includes('text/html')
            && pathname === '/'
          ) {
            response.writeHead(302, { Location: '/customer/html/home.html' });
            response.end();
            return;
          }

          if (
            request.headers.accept?.includes('text/html')
            && (
              pathname.startsWith('/customer/html/')
              || [
                '/admin/html/dashboard.html',
                '/admin/html/payments.html',
                '/admin/html/bookings.html',
                '/admin/html/calendar.html',
                '/admin/html/clients.html',
                '/admin/html/new-booking.html',
                '/admin/html/reports.html',
                '/admin/html/reschedule-requests.html',
                '/admin/html/services.html',
                '/admin/html/vouchers.html',
              ].includes(pathname)
            )
          ) {
            request.url = `/index.html${search ? `?${search}` : ''}`;
          }

          next();
        });
      },
    },
  ],
  publicDir: 'public',
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': 'http://localhost:3000',
      '/uploads': 'http://localhost:3000',
    },
    watch: {
      ignored: ['**/node_modules/**', '**/.git/**', '**/dist/**'],
      usePolling: false,
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
});
