import {mkdir,copyFile,cp,rm} from 'node:fs/promises';
await rm('dist',{recursive:true,force:true});
await mkdir('dist',{recursive:true});
for(const file of ['index.html','manifest.webmanifest','sw.js']) await copyFile(file,'dist/'+file);
await cp('src','dist/src',{recursive:true});
await cp('public','dist/public',{recursive:true});
console.log('Build pronto em dist/');
