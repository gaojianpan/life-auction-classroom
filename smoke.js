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
    const studentPage = await assertHttp(url, '/', '你会如何配置自己的一生？');
    if (!studentPage.includes('人生总工程师')) throw new Error('homepage subtitle not updated');
    if (!studentPage.includes('id="studentNo"')) throw new Error('student page missing student number input');
    const studentJs = await assertHttp(url, '/student.js', 'lifeAuctionJoinCode');
    if (!studentJs.includes('"123456"') || !studentJs.includes('"张三"') || !studentJs.includes('"0123456789"')) {
      throw new Error('student join defaults missing');
    }
    const teacherPage = await assertHttp(url, '/teacher.html', '教师中心');
    if (!teacherPage.includes('id="studentRoster"')) throw new Error('teacher page missing student roster');
    const teacherJs = await assertHttp(url, '/teacher.js', 'priceDrafts');
    if (!teacherJs.includes('basePrice:priceFor(index)') || !teacherJs.includes('留空默认100')) {
      throw new Error('teacher custom starting price UI missing');
    }
    if (!teacherJs.includes('deleteReport') || !teacherJs.includes('deleteClassroom')) {
      throw new Error('teacher report delete control missing');
    }

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

    await emitAck(teacher, 'startItem', { index: 2, seconds: 30, basePrice: 275 });
    await waitFor(() => sellerState?.currentAuction?.item?.base === 275);
    await emitAck(seller, 'bid', { amount: 350, customText: '' });
    await emitAck(buyer, 'bid', { amount: 350, customText: '' });
    await waitFor(() => sellerState?.currentAuction?.cutoff === 350 && sellerState.currentAuction.bids.filter(x => x.winning).length === 2);
    await emitAck(teacher, 'closeAuction', {});

    const sellerItem = await waitFor(() => {
      const me = sellerState?.students?.find(x => x.studentNo === 'TEST20260001');
      return me?.inventory?.find(x => x.itemId === 3 && x.paid === 350) || null;
    });
    await waitFor(() => {
      const me = buyerState?.students?.find(x => x.studentNo === 'TEST20260002');
      return me?.inventory?.some(x => x.itemId === 3 && x.paid === 350) && me.coins === 650;
    });
    const sellerAfter = sellerState.students.find(x => x.studentNo === 'TEST20260001');
    if (sellerAfter.coins !== 650) throw new Error('uniform clearing price not charged to seller');

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
    if (!check.rowCount || check.rows[0].state?.mode !== 'ended') throw new Error('archive persistence verification failed');
    const round = check.rows[0].state?.history?.find(x => x.itemId === 3);
    if (!round || round.clearingPrice !== 350 || round.winners?.length !== 2) throw new Error('uniform-price history persistence failed');

    await emitAck(teacher, 'adminAuth', { pin: adminPin });
    await emitAck(teacher, 'deleteClassroom', { code });
    const deleted = await pool.query('SELECT 1 FROM classrooms WHERE code=$1', [code]);
    if (deleted.rowCount) throw new Error('admin report deletion did not remove classroom');
    code = null;
    console.log('SMOKE_TEST_PASS defaults/localStorage/customBase275/uniform350/roster/exchange/archive/adminDelete');
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
