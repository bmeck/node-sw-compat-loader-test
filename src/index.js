const MIMEType = require('whatwg-mimetype');
const instrument = require('./instrument-data-hook.js');

// be a jerk and always claim clients
// this is a source of bugs, but no better fix for first load
// could also do some stuff in the install event but I'm not
// 100% sure it would fix things
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    await clients.claim()
    // remove any caches that aren't from a client that we control
    const ids = new Set([...(await clients.matchAll())].map(c => c.id));
    for (const key of await caches.keys()) {
      if (!ids.has(key)) {
        caches.delete(key);
      }
    }
  })());
});

self.addEventListener('fetch', (event) => {
  event.respondWith((async () => {
    let res = await fetch(event.request);
    const contentType = res.headers.get('content-type');
    let incoming = new URL(event.request.url);
    // if intercept is true we want to intercept the request and
    // instrument it
    let intercept = false;
    // if this code was rewritten by our service worker already
    // it is "virtual" since it is only used for redirection
    let virtual = false;
    let referrer;
    let specifier = event.request.url;
    // bad idea since it can have false positives, but PoC
    if (incoming.searchParams.has('referrer')) {
      virtual = true;
      intercept = true;
      referrer = incoming.searchParams.get('referrer');
      specifier = incoming.searchParams.get('specifier');
    } else if (new MIMEType(contentType).isJS({allowParameters: true})) {
      intercept = true;
      // guess it to be the window url
      referrer = event.clientId ? (await clients.get(event.clientId)).url : null;
    }
    if (!intercept) {
      return res;
    }
    let resolved;
    // TODO: refactor out all this to delegate to loader class instead of hard coded
    try {
      // absolute
      resolved = new URL(specifier);
    } catch (e) {
      // relative
      if (/^\.{0,2}\//.test(specifier)) {
        resolved = new URL(specifier, referrer);
      // bare
      } else {
        resolved = new URL(`./node_modules/${specifier}/index.js`, referrer);
      }
    }
    // END TODO
    const final = resolved.href;
    const cache = await caches.open(event.clientId);
    const cached = await cache.match(final);
    if (typeof cached !== 'undefined') {
      return cached;
    }
    if (!virtual) {
      const code = instrument(await res.text(), {
        referrer: final
      }).code;
      const ret = new Response(code, {
        status: res.status,
        statusText: res.statusText,
        headers: res.headers,
      });
      await cache.put(event.request.url, ret);
      return cache.match(event.request.url);
    }
    const dest = JSON.stringify(final);
    if (incoming.searchParams.has('namespace')) {
      // indirection through a module creates a new ===
      // Module Namespace Object, we have a different kind
      // of indirection explicitly for getting namespaces
      return new Response(`
        import * as _ from ${dest};
        export {_ as default};
        export function then(f) {f(import(${dest}))};
      `, {
        status: 200,
        headers: {
          'content-type': 'text/javascript'
        }
      })
    }
    let inspecting = await cache.match(final);
    if (typeof inspecting === 'undefined') {
      inspecting = await fetch(final);
      if (!inspecting.ok) {
        return inspecting;
      }
      await cache.put(final, inspecting);
      inspecting = await cache.match(final);
    }
    const hasDefault = instrument(await inspecting.text(), {referrer:''}).meta.hasDefault;
    // export * from is not reliable when default exports exist so we have to
    // parse the destination and see if one exists
    const ret = new Response(`
      export * from ${dest};
      ${hasDefault ? `export {default} from ${dest}` : ''}
    `, {
      status: 200,
      headers: {
        'content-type': 'text/javascript'
      }
    });
    await cache.put(event.request.url, ret);
    return cache.match(event.request.url);
  })());
});
