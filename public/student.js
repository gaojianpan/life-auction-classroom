const socket = io();
let S=null, myStudentId=null;
const $=id=>document.getElementById(id);

function browserKey(){
  let k=localStorage.getItem("lifeAuctionBrowserKey");
  if(!k){k=(crypto.randomUUID?crypto.randomUUID():Math.random().toString(36)+Date.now());localStorage.setItem("lifeAuctionBrowserKey",k)}
  return k;
}
const params=new URLSearchParams(location.search);
const savedCode=localStorage.getItem("lifeAuctionJoinCode");
const savedName=localStorage.getItem("lifeAuctionJoinName");
const savedStudentNo=localStorage.getItem("lifeAuctionJoinStudentNo");
$("code").value=params.get("code")||savedCode||"123456";
$("name").value=savedName||"张三";
$("studentNo").value=savedStudentNo||"0123456789";

socket.on("roomState",s=>{S=s;render()});

function join(){
  const code=$("code").value.trim(),name=$("name").value.trim(),studentNo=$("studentNo").value.trim();
  if(!code)return alert("请输入6位课堂码");
  if(!name)return alert("请输入课堂昵称 / 姓名");
  if(!studentNo)return alert("请输入学号");
  socket.emit("joinClassroom",{code,name,studentNo,clientKey:browserKey()},r=>{
    if(!r.ok)return alert(r.error);
    localStorage.setItem("lifeAuctionJoinCode",r.code||code);
    localStorage.setItem("lifeAuctionJoinName",name);
    localStorage.setItem("lifeAuctionJoinStudentNo",studentNo);
    myStudentId=r.studentId;
    $("join").classList.add("hidden");$("app").classList.remove("hidden");
    $("classTitle").textContent=r.title;$("classCode").textContent=r.code;
    $("studentIdentity").textContent=`${name} · 学号 ${studentNo}`;
  })
}
function me(){return S?.students?.find(x=>x.id===myStudentId)}
function show(id,yes){$(id).classList.toggle("hidden",!yes)}
function modeText(m){return ({lobby:"待机",auction:"拍卖",exchange:"交换",reflection:"讨论",ended:"归档"})[m]||m}
function secLeft(end){return Math.max(0,Math.ceil((end-Date.now())/1000))}
function esc(s){return String(s||"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function personLabel(name,studentNo){return `${esc(name)}${studentNo?` <span class="muted small">· ${esc(studentNo)}</span>`:""}`}

function render(){
  if(!S||!myStudentId)return;
  const m=me();if(!m)return;
  $("classTitle").textContent=S.title;$("classCode").textContent=S.code;
  $("studentIdentity").textContent=`${m.name}${m.studentNo?` · 学号 ${m.studentNo}`:""}`;
  $("coins").textContent=m.coins;$("invCount").textContent=m.inventory.length;$("modeName").textContent=modeText(S.mode);

  show("lobby",S.mode==="lobby");
  show("auction",S.mode==="auction"&&!!S.currentAuction);
  show("between",S.mode==="auction"&&!S.currentAuction);
  show("exchange",S.mode==="exchange");
  show("reflection",S.mode==="reflection");
  show("ended",S.mode==="ended");

  if(S.mode==="auction"&&S.currentAuction){
    const a=S.currentAuction,it=a.item;
    $("lotNo").textContent=it.id;$("icon").textContent=it.icon;$("title").textContent=it.title;
    $("desc").textContent=it.desc;$("hook").textContent=it.hook;
    $("cutoff").textContent=Math.max(it.base,a.cutoff||it.base);
    $("myBid").textContent=a.bids.find(x=>x.studentId===myStudentId)?.amount||0;
    show("customBox",!!it.custom);
    $("bidList").innerHTML=a.bids.length?a.bids.map(b=>`
      <div class="bidrow ${b.winning?'win':''}">
        <div><b>#${b.rank}</b></div><div>${personLabel(b.name,b.studentNo)} ${b.studentId===myStudentId?'（我）':''}</div>
        <div class="${b.winning?'green':''}"><b>${b.amount}</b></div>
      </div>`).join(""):`<p class="muted">还没有人出价</p>`;
  }
  if(S.mode==="exchange"){renderInventory(m);renderMarket()}
  if(S.mode==="reflection"){$("finalInventory").innerHTML=invHtml(m.inventory)}
  if(S.mode==="ended")$("endedInventory").innerHTML=invHtml(m.inventory);
}
function invHtml(arr){
  return arr.length?arr.map(i=>`<div class="chip">${i.icon} ${esc(i.customText||i.title)} <span class="muted">（${i.paid}）</span></div>`).join("")
    :`<span class="muted">你没有留下任何模块——这本身也是一个值得讨论的结果。</span>`;
}
function targetBid(step){
  const a=S.currentAuction,m=me();if(!a||!m)return 0;
  const mine=a.bids.find(x=>x.studentId===myStudentId)?.amount||0;
  const current=Math.max(a.item.base,a.cutoff||a.item.base);
  return Math.max(mine+step,current+step);
}
function matchPrice(){
  const a=S?.currentAuction;if(!a)return;
  submitBid(Math.max(a.item.base,a.cutoff||a.item.base));
}
function quickBid(step){submitBid(targetBid(step))}
function manualBid(){submitBid(Number($("bidAmount").value))}
function submitBid(amount){socket.emit("bid",{amount,customText:$("customText")?.value||""},r=>{if(!r.ok)alert(r.error)})}
function renderInventory(m){
  $("myInventory").innerHTML=m.inventory.length?m.inventory.map(i=>{
    const listed=S.listings.find(x=>x.copyId===i.copyId);
    if(listed)return `<div class="listing"><div>${i.icon} <b>${esc(i.customText||i.title)}</b><div class="muted">已挂牌 ${listed.price}</div></div><button class="secondary" onclick="cancelListing(${listed.listingId})">撤销</button></div>`;
    return `<div class="listing"><div>${i.icon} <b>${esc(i.customText||i.title)}</b><div class="muted">原拍价 ${i.paid}</div></div><input id="p_${i.copyId}" value="${i.paid}" inputmode="numeric" style="width:110px"><button onclick="listItem('${i.copyId}')">挂牌</button></div>`
  }).join(""):`<p class="muted">你暂时没有可挂牌模块。</p>`;
}
function renderMarket(){
  const rows=S.listings.filter(x=>x.sellerId!==myStudentId);
  $("market").innerHTML=rows.length?rows.map(l=>`<div class="listing"><div>${l.item.icon} <b>${esc(l.item.customText||l.item.title)}</b><div class="muted">卖家：${esc(l.sellerName)}${l.sellerStudentNo?` · ${esc(l.sellerStudentNo)}`:""}</div></div><div class="amber"><b>${l.price}</b></div><button onclick="buy(${l.listingId})">购买</button></div>`).join(""):`<p class="muted">暂时没有同学挂牌。</p>`;
}
function listItem(copyId){socket.emit("listItem",{copyId,price:Number($("p_"+copyId).value)},r=>{if(!r.ok)alert(r.error)})}
function cancelListing(listingId){socket.emit("cancelListing",{listingId},r=>{if(!r.ok)alert(r.error)})}
function buy(listingId){socket.emit("buyListing",{listingId},r=>{if(!r.ok)alert(r.error)})}
setInterval(()=>{
  if(S?.mode==="auction"&&S.timerEnd&&S.currentAuction)$("timer").textContent=secLeft(S.timerEnd)+"s";
  if(S?.mode==="exchange"&&S.exchangeEnd)$("exchangeTimer").textContent=secLeft(S.exchangeEnd)+"s";
},200);
