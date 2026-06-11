// ═══════════════════════════════════════════════════════════
// SERVICE WORKER - HOME PEA v3.5.0
// Cache offline + démarrage rapide + notifications background
// ═══════════════════════════════════════════════════════════

const SW_VERSION = '3.5.1';
const CACHE_NAME = 'monpea-v' + SW_VERSION;

const PRECACHE_URLS = [
  './',
  './index.html',
  './fonts.css',
  './chart.umd.js',
  './manifest.json',
  './icon-192.png',
  './icon-512.png',
  './favicon-32.png',
  './apple-touch-icon.png',
  './inter-400.woff2',
  './inter-600.woff2',
  './inter-700.woff2',
  './inter-800.woff2',
  './inter-900.woff2',
  './jetbrains-mono-500.woff2',
  './jetbrains-mono-700.woff2'
];

// ── INSTALL : pré-cache les fichiers critiques ──
self.addEventListener('install', function(event) {
  console.log('[SW] Installation v' + SW_VERSION);
  event.waitUntil(
    caches.open(CACHE_NAME).then(function(cache) {
      return cache.addAll(PRECACHE_URLS).catch(function(err) {
        console.warn('[SW] Some resources failed to cache', err);
      });
    }).then(function() {
      return self.skipWaiting(); // Active immédiatement la nouvelle version
    })
  );
});

// ── ACTIVATE : nettoie les vieux caches ──
self.addEventListener('activate', function(event) {
  console.log('[SW] Activation');
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(key) {
        if (key !== CACHE_NAME) {
          console.log('[SW] Deleting old cache', key);
          return caches.delete(key);
        }
      }));
    }).then(function() {
      return self.clients.claim(); // Prend le contrôle des onglets ouverts
    })
  );
});

// ── FETCH : stratégie network-first avec fallback cache ──
self.addEventListener('fetch', function(event) {
  const url = event.request.url;

  // API Yahoo Finance et proxys CORS = TOUJOURS network (jamais de cache pour les prix)
  if (url.indexOf('yahoo.com') > -1 || 
      url.indexOf('corsproxy.io') > -1 || 
      url.indexOf('allorigins') > -1) {
    event.respondWith(fetch(event.request).catch(function() {
      return new Response(JSON.stringify({error: 'offline'}), {
        headers: {'Content-Type': 'application/json'}
      });
    }));
    return;
  }

  // Tout le reste : network-first, fallback cache
  event.respondWith(
    fetch(event.request)
      .then(function(response) {
        // Cache la réponse pour usage offline
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(event.request, clone);
          });
        }
        return response;
      })
      .catch(function() {
        // Si network fail → cache
        return caches.match(event.request).then(function(cached) {
          if (cached) return cached;
          // Si rien en cache et c'est l'index → offline page basique
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
      })
  );
});

// ── PUSH : reception de notification push (futur backend) ──
self.addEventListener('push', function(event) {
  let data = {title: 'Mon PEA', body: 'Notification'};
  try {
    if (event.data) data = event.data.json();
  } catch(e) {}
  
  event.waitUntil(
    self.registration.showNotification(data.title || 'Mon PEA', {
      body: data.body || '',
      icon: data.icon || './icon-192.png',
      badge: './icon-192.png',
      tag: data.tag || 'monpea-notif',
      requireInteraction: data.requireInteraction || false,
      data: data
    })
  );
});

// ── NOTIFICATION CLICK : focus l'appli si déjà ouverte ──
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({type: 'window', includeUncontrolled: true}).then(function(clients) {
      // Si une fenêtre est déjà ouverte, on focus
      for (let i = 0; i < clients.length; i++) {
        if (clients[i].url.indexOf(self.registration.scope) > -1) {
          return clients[i].focus();
        }
      }
      // Sinon on ouvre une nouvelle fenêtre
      if (self.clients.openWindow) {
        return self.clients.openWindow('./');
      }
    })
  );
});

// ── PERIODIC SYNC : check mensuel automatique (Chrome only, expérimental) ──
self.addEventListener('periodicsync', function(event) {
  if (event.tag === 'monthly-dca-check') {
    event.waitUntil(checkMonthlyDCA());
  }
});

// ── MESSAGE : communication avec l'app (déclenche check manuellement) ──
self.addEventListener('message', function(event) {
  if (event.data && event.data.action === 'check-dca-now') {
    checkMonthlyDCA();
  }
  if (event.data && event.data.action === 'check-price-alerts') {
    checkPriceAlerts(event.data.alerts || []);
  }
});

// ── Vérifie s'il faut envoyer le rappel DCA mensuel ──
async function checkMonthlyDCA() {
  try {
    // Récupère la date du dernier rappel envoyé depuis le cache
    const today = new Date();
    const day = today.getDate();
    
    // Seulement entre le 1 et le 5 du mois
    if (day < 1 || day > 5) return;
    
    // Notification de rappel
    await self.registration.showNotification('💰 C\'est l\'heure de ton DCA !', {
      body: 'N\'oublie pas ton versement mensuel et ton achat. Ouvre l\'appli pour voir les détails.',
      icon: './icon-192.png',
      badge: './icon-192.png',
      tag: 'dca-reminder-' + today.getFullYear() + '-' + today.getMonth(),
      requireInteraction: true
    });
  } catch(e) {
    console.error('[SW] DCA check error', e);
  }
}

// ── Vérifie les alertes de prix ──
async function checkPriceAlerts(alerts) {
  for (const alert of alerts) {
    if (alert.triggered) {
      await self.registration.showNotification('🔔 Alerte prix ' + alert.ticker, {
        body: alert.message,
        icon: './icon-192.png',
        badge: './icon-192.png',
        tag: 'price-alert-' + alert.ticker,
        requireInteraction: true
      });
    }
  }
}

console.log('[SW] Service Worker Mon PEA v3.4.2 chargé');
