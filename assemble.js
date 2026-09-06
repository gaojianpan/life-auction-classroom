const fs=require('fs');

let out='';
for(const f of ['server.chunk1.txt','server.chunk2.txt','server.chunk3.txt','server.chunk4.txt','server.chunk5.txt','server.chunk6.txt']) out+=fs.readFileSync(f,'utf8');
fs.writeFileSync('server.js',out);

let teacher='';
for(const f of ['teacher.chunk1.txt','teacher.chunk2.txt']) teacher+=fs.readFileSync(f,'utf8');
fs.mkdirSync('public',{recursive:true});
fs.writeFileSync('public/teacher.js',teacher);

function applyBranding(path){
  if(!fs.existsSync(path)) return;
  let s=fs.readFileSync(path,'utf8');
  s=s.replace(/\s*<span>名校支援 · 名师担纲 · 名企合作<\/span>/g,'');
  s=s.replaceAll('梦想从学习开始 · 事业靠本领成就','广安理工学院');
  s=s.replace(/\s*<span class="gait-value">立德树人<\/span>/g,'');
  s=s.replaceAll(' · 立德树人','');
  s=s.replaceAll('立德树人','');
  s=s.replace(/<span class="gait-value">小而精 · 高起点<\/span>\s*<span class="gait-value">应用型 · 理工类<\/span>/g,'<span class="gait-value">求真致理，鼎新砺工</span>');
  s=s.replaceAll('小而精 · 高起点 · 应用型 · 理工类','求真致理，鼎新砺工');
  s=s.replaceAll('模拟人生拍卖器','人生模拟拍卖平台');
  s=s.replaceAll('数字化思政教育平台','春风思政');
  s=s.replaceAll('广安理工学院春风思政','广安理工学院 · 春风思政');
  fs.writeFileSync(path,s);
}

applyBranding('public/index.html');
applyBranding('public/teacher.html');

const logoCssPath='public/gait-logo.css';
const logoWebpPath='public/gait-logo.webp';
if(fs.existsSync(logoCssPath)){
  const source=fs.readFileSync(logoCssPath,'utf8');
  const match=source.match(/data:image\/webp;base64,([^"')]+)/);
  if(match){
    fs.writeFileSync(logoWebpPath,Buffer.from(match[1],'base64'));
  }
  if(!fs.existsSync(logoWebpPath)) throw new Error('Unable to materialize Guang\'an school logo');
  fs.writeFileSync(logoCssPath,':root{--gait-logo:url("/gait-logo.webp")}\n.gait-logo{background-image:url("/gait-logo.webp")!important;background-size:contain!important;background-position:center!important;background-repeat:no-repeat!important}\n#join::after{background-image:url("/gait-logo.webp")!important}\n');
}

if(fs.existsSync('smoke.js')){
  let smoke=fs.readFileSync('smoke.js','utf8');
  smoke=smoke.replaceAll("'数字化思政教育平台'","'春风思政'");
  smoke=smoke.replaceAll("'模拟人生拍卖器'","'人生模拟拍卖平台'");
  smoke=smoke.replaceAll("'梦想从学习开始 · 事业靠本领成就'","'广安理工学院'");
  smoke=smoke.replaceAll("'名校支援 · 名师担纲 · 名企合作',\n      ",'');
  smoke=smoke.replaceAll("'立德树人', ",'');
  smoke=smoke.replaceAll("'立德树人',",'');
  smoke=smoke.replace("'小而精 · 高起点', '应用型 · 理工类',","'求真致理，鼎新砺工',");
  smoke=smoke.replace("const logoCss = await assertHttp(url, '/gait-logo.css', 'data:image/webp;base64');","const logoCss = await assertHttp(url, '/gait-logo.css', '/gait-logo.webp');\n    const logoRes = await fetch(url + '/gait-logo.webp');\n    if (!logoRes.ok || (await logoRes.arrayBuffer()).byteLength < 10000) throw new Error('school logo asset missing');");
  fs.writeFileSync('smoke.js',smoke);
}
