const fs=require('fs');let out='';for(const f of ['server.part1.txt','server.part2.txt','server.part3.txt'])out+=fs.readFileSync(f,'utf8');fs.writeFileSync('server.js',out);
