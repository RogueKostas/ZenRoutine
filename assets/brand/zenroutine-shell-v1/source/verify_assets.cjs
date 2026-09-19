const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const sharp=require(process.env.SHARP_MODULE || 'C:/Users/kzari/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.cjs');
const root=path.resolve(__dirname,'..');
async function main(){
  let svgCount=0,pngCount=0;
  for(const dir of ['marks','logos','icons','splash','social','preview']){
    for(const name of fs.readdirSync(path.join(root,dir))){
      const file=path.join(root,dir,name);
      if(name.endsWith('.svg')){const s=fs.readFileSync(file,'utf8');assert(!/<(?:text|image)\b/i.test(s),name);assert(!/href\s*=/.test(s),name);svgCount++;}
      if(name.endsWith('.png')){const m=await sharp(file).metadata();assert(m.width>0&&m.height>0);pngCount++;}
    }
  }
  for(const name of ['app-icon','app-icon-dark']){const m=await sharp(path.join(root,`icons/${name}.png`)).metadata();assert.equal(m.width,1024);assert.equal(m.height,1024);assert.equal(m.hasAlpha,false);}
  const social=await sharp(path.join(root,'social/social-1200x630.png')).metadata();assert.equal(social.width,1200);assert.equal(social.height,630);assert.equal(social.hasAlpha,false);
  for(const n of [16,32,48,60,180,192,512]){const m=await sharp(path.join(root,`icons/icon-${n}.png`)).metadata();assert.equal(m.width,n);assert.equal(m.height,n);}
  for(const style of ['Regular','Medium','SemiBold','Bold']){const b=fs.readFileSync(path.join(root,`fonts/DMSans-${style}.ttf`));const count=b.readUInt16BE(4);const tags=Array.from({length:count},(_,i)=>b.toString('ascii',12+i*16,16+i*16));assert(!tags.includes('fvar'),style);assert(tags.includes('name'),style);}
  assert(fs.statSync(path.join(root,'fonts/OFL.txt')).size>1000);
  const html=fs.readFileSync(path.join(root,'preview/index.html'),'utf8');for(const m of html.matchAll(/(?:src|href)="([^"#]+)"/g))assert(fs.existsSync(path.resolve(root,'preview',m[1])),m[1]);
  const checks=JSON.parse(fs.readFileSync(path.join(root,'contrast-report.json'),'utf8'));assert(checks.every(c=>c.pass));
  console.log(JSON.stringify({svgCount,pngCount,contrastPairs:checks.length,checks:'passed',appIntegration:'not performed'},null,2));
}
main().catch(e=>{console.error(e);process.exitCode=1;});
