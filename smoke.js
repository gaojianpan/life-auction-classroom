const { io } = require('socket.io-client');
const { pool } = require('./db');

function connect(url) {
  return new Promise((resolve, reject) => {
    const s = io(url, { transports: ['websocket', 'polling'], reconnection: false, timeout: 6000 });
    const timer = setTimeout(() => reject(new Error('socket connect timeout')), 7000);
    s.once('connect', () => { clearTimeout(timer); resolve(s); });
    s.once('connect_error', err => { clearTimeout(timer); reject(err); });
  });
}

function emitAck(socket, event, payload = {}, timeout = 8000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${event} ack timeout`)), timeout);
    socket.emit(event, payload, result => {
      clearTimeout(timer);
      if (!result || result.ok !== true) return reject(new Error(`${event} failed: ${result?.error || 'unknown'}`));
      resolve(result);
    });
  });
}

async function waitFor(fn, timeout = 8000, step = 100) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const value = fn();
    if (value) return value;
    await new Promise(r => setTimeout(r, step));
  }
  throw new Error('waitFor timeout');
}

async function runSmokeTest() {
  const port = process.env.PORT || 10000;
  const url = `http://127.0.0.1:${port}`;
  const adminPin = process.env.ADMIN_PIN;
  if (!adminPin) throw new Error('ADMIN_PIN missing');

  let teacher, seller, buyer, code;
  let sellerState = null;
  let buyerState = null;
  try {
    teacher = await connect(url);
    seller = await connect(url);
    buyer = await connect(url);
    seller.on('roomState', s => { sellerState = s; });
    buyer.on('roomState', s => { buyerState = s; });

    const created = await emitAck(teacher, 'createClassroom', {
      adminPin,
      title: `__SMOKE_TEST__ ${Date.now()}`,
      teacherPin: 'smoke-teacher-pin'
    });
    code = created.code;

    await emitAck(seller, 'joinClassroom', { code, name: 'smoke-seller', clientKey: `smoke-seller-${Date.now()}` });
    await emitAck(buyer, 'joinClassroom', { code, name: 'smoke-buyer', clientKey: `smoke-buyer-${Date.now()}` });

    await emitAck(teacher, 'startItem', { index: 0, seconds: 30 });
    await emitAck(seller, 'bid', { amount: 100, customText: '' });
    await emitAck(teacher, 'closeAuction', {});

    const sellerItem = await waitFor(() => {
      const me = sellerState?.students?.find(x => x.name === 'smoke-seller');
      return me?.inventory?.[0] || null;
    });

    await emitAck(teacher, 'startExchange', { seconds: 120 });
    await emitAck(seller, 'listItem', { copyId: sellerItem.copyId, price: 50 });
    const listing = await waitFor(() => sellerState?.listings?.find(x => x.copyId === sellerItem.copyId));
    await emitAck(buyer, 'buyListing', { listingId: listing.listingId });

    await waitFor(() => {
      const me = buyerState?.students?.find(x => x.name === 'smoke-buyer');
      return me?.inventory?.some(x => x.copyId === sellerItem.copyId);
    });

    await emitAck(teacher, 'startReflection', {});
    await emitAck(teacher, 'endClassroom', {});

    const check = await pool.query('SELECT state FROM classrooms WHERE code=$1', [code]);
    if (!check.rowCount || check.rows[0].state?.mode !== 'ended') {
      throw new Error('archive persistence verification failed');
    }

    await pool.query('DELETE FROM classrooms WHERE code=$1', [code]);
    console.log(`SMOKE_TEST_PASS code=${code} create/join/bid/settle/exchange/archive/delete`);
  } catch (err) {
    if (code) {
      try { await pool.query('DELETE FROM classrooms WHERE code=$1', [code]); } catch (_) {}
    }
    throw err;
  } finally {
    teacher?.disconnect();
    seller?.disconnect();
    buyer?.disconnect();
  }
}

module.exports = { runSmokeTest };
