// デプロイのたびに中身が変わるようバージョンを上げてください（例: v1 → v2）
// これにより新しいsw.js自体がブラウザに新バージョンとして認識されます
const CACHE_NAME = 'heavens-v2';

self.addEventListener('install', (event) => {
  // 新しいService Workerを即座に有効化候補にする
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      // 現在のCACHE_NAME以外の古いキャッシュを全て削除
      const cacheNames = await caches.keys();
      await Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      );
      // 既存タブも含めてすぐに新しいService Workerを使わせる
      await self.clients.claim();
    })()
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Supabaseへのリクエストはキャッシュ対象外（常にネットワーク）
  if (request.url.includes('supabase.co')) return;

  // ページ本体（index.html）はネットワーク優先。
  // これが無いと、再デプロイ後もハッシュ付きJSを参照する古いindex.htmlが
  // キャッシュから返り続け、「更新したのに古いまま」になる主原因になる。
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  // JS/CSS/画像等の静的アセットは
  // 「まずキャッシュを返しつつ、裏でネットワーク取得してキャッシュを更新」する
  // stale-while-revalidate方式。次回アクセス時には最新版が反映される。
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(request).then((cached) => {
        const fetchPromise = fetch(request)
          .then((networkResponse) => {
            cache.put(request, networkResponse.clone());
            return networkResponse;
          })
          .catch(() => cached);
        return cached || fetchPromise;
      })
    )
  );
});
