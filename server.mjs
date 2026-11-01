import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
const root = path.resolve(process.argv.includes('--dist') ? 'dist' : '.');
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.webmanifest':'application/manifest+json','.svg':'image/svg+xml'};
http.createServer(async (req,res)=>{
  try {
    const pathname = decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if (!['/', '/index.html', '/sw.js', '/manifest.webmanifest'].includes(pathname) && !pathname.startsWith('/src/') && !pathname.startsWith('/public/')) {res.writeHead(404).end('Não encontrado');return;}
    if (pathname.split('/').some(part=>part.startsWith('.'))) {res.writeHead(404).end('Não encontrado');return;}
    const target = path.resolve(root, '.' + (pathname==='/'?'/index.html':pathname));
    if (!target.startsWith(root+path.sep)) {res.writeHead(403).end();return;}
    const body=await readFile(target);
    res.writeHead(200,{'Content-Type':mime[path.extname(target)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'}).end(body);
  } catch {res.writeHead(404).end('Não encontrado');}
}).listen(Number(process.env.PORT)||5173,'0.0.0.0',()=>console.log('HabitKit iniciado na porta '+(process.env.PORT||5173)));
