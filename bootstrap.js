require('./server.js');

if (process.env.RUN_SMOKE_TEST === '1') {
  setTimeout(() => {
    require('./smoke.js').runSmokeTest().catch(err => {
      console.error('SMOKE_TEST_FAIL', err && (err.stack || err.message || err));
    });
  }, 5000);
}
