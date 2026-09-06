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

async function assertHttp(url, path, expectedText) {
  const res = await fetch(url + path);
  if (!res.ok) throw new Error(`HTTP ${path} returned ${res.status}`);
  const text = await res.text();
  if (expectedText && !text.includes(expectedText)) throw new Error(`HTTP ${path} missing expected text`);
  return text;
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
    await assertHttp(url, '/healthz', 'ok');
    const studentPage = await assertHttp(url, '/', '人生系统装配厂');
    if (!studentPage.includes('id="studentNo"')) throw new Error('student page missing student number input');
    await assertHttp(url, '/teacher.html', '教师中心');

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

    await emitAck(seller, 'joinClassroom', {
      code, name: 'smoke-seller', studentNo: 'TEST20260001', clientKey: `smoke-seller-${Date.now()}`
    });
    await emitAck(buyer, 'joinClassroom', {
      code, name: 'smoke-buyer', studentNo: 'TEST20260002', clientKey: `smoke-buyer-${Date.now()}`
    });

    await waitFor(() => sellerState?.students?.some(x => x.studentNo === 'TEST20260001'));
    await waitFor(() => buyerState?.students?.some(x => x.studentNo === 'TEST20260002'));

    await emitAck(teacher, 'startItem', { index: 0, seconds: 30 });
    await emitAck(seller, 'bid', { amount: 100, customText: '' });
    await waitFor(() => sellerState?.currentAuction?.bids?.some(x => x.studentNo === 'TEST20260001'));
    await emitAck(teacher, 'closeAuction', {});

    const sellerItem = await waitFor(() => {
      const me = sellerState?.students?.find(x => x.studentNo === 'TEST20260001');
      return me?.inventory?.[0] || null;
    });

    await emitAck(teacher, 'startExchange', { seconds: 120 });
    await emitAck(seller, 'listItem', { copyId: sellerItem.copyId, price: 50 });
    const listing = await waitFor(() => sellerState?.listings?.find(x => x.copyId === sellerItem.copyId));
    if (listing.sellerStudentNo !== 'TEST20260001') throw new Error('listing missing seller student number');
    await emitAck(buyer, 'buyListing', { listingId: listing.listingId });

    await waitFor(() => {
      const me = buyerState?.students?.find(x => x.studentNo === 'TEST20260002');
      return me?.inventory?.some(x => x.copyId === sellerItem.copyId);
    });

    await emitAck(teacher, 'startReflection', {});
    await emitAck(teacher, 'endClassroom', {});

    const check = await pool.query('SELECT state FROM classrooms WHERE code=$1', [code]);
    if (!check.rowCount || check.rows[0].state?.mode !== 'ended') {
      throw new Error('archive persistence verification failed');
    }

    await pool.query('DELETE FROM classrooms WHERE code=$1', [code]);
    console.log(`SMOKE_TEST_PASS code=${code} http/studentNo/socket/create/join/bid/settle/exchange/archive/delete`);
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
