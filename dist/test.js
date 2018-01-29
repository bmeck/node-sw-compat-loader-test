import x from 'test';
import * as f from 'foo';
console.log('default from x', x);
console.log('x from foo', f.x);
;(async () => {
  console.log('===', await import('./node_modules/foo/index.js') === f)
})();