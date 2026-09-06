const fs=require('fs');
let out='';
for(const f of ['server.chunk1.txt','server.chunk2.txt','server.chunk3.txt','server.chunk4.txt','server.chunk5.txt','server.chunk6.txt']) out+=fs.readFileSync(f,'utf8');
fs.writeFileSync('server.js',out);
let teacher='';
for(const f of ['teacher.chunk1.txt','teacher.chunk2.txt']) teacher+=fs.readFileSync(f,'utf8');
fs.mkdirSync('public',{recursive:true});
fs.writeFileSync('public/teacher.js',teacher);
