// npm install sharp, or set SHARP_MODULE to an installed sharp module.
const fs = require('node:fs');
const path = require('node:path');
const sharp = require(process.env.SHARP_MODULE || 'C:/Users/kzari/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/sharp/dist/index.cjs');
const root = path.resolve(__dirname, '..');
async function main() {
  for (const dir of ['marks','logos','icons','splash','social','preview']) {
    for (const name of fs.readdirSync(path.join(root,dir)).filter(n=>n.endsWith('.svg'))) {
      const src=path.join(root,dir,name);
      let job=sharp(src);
      if (name.startsWith('app-icon') || name.startsWith('concept-') || dir==='social' || dir==='preview') job=job.removeAlpha();
      await job.png().toFile(src.replace(/\.svg$/,'.png'));
    }
  }
  for (const size of [16,32,48,60,180,192,512]) {
    await sharp(path.join(root,size<=48?'icons/favicon.svg':'icons/app-icon.svg')).resize(size,size).removeAlpha().png().toFile(path.join(root,`icons/icon-${size}.png`));
  }
  const frames=await Promise.all([16,32,48].map(s=>fs.promises.readFile(path.join(root,`icons/icon-${s}.png`))));
  const header=Buffer.alloc(6+16*3); header.writeUInt16LE(1,2); header.writeUInt16LE(3,4);
  let offset=header.length;
  frames.forEach((buf,i)=>{ const p=6+i*16;header[p]=header[p+1]=[16,32,48][i];header.writeUInt16LE(1,p+4);header.writeUInt16LE(32,p+6);header.writeUInt32LE(buf.length,p+8);header.writeUInt32LE(offset,p+12);offset+=buf.length; });
  fs.writeFileSync(path.join(root,'icons/favicon.ico'),Buffer.concat([header,...frames]));
  console.log('Rendered PNG exports and favicon.ico');
}
main().catch(e=>{console.error(e);process.exitCode=1;});
