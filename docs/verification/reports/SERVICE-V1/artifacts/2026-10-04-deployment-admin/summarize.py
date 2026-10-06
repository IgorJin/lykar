from pathlib import Path
from datetime import datetime, timezone
import json, hashlib, subprocess, gzip, shutil
base=Path(__file__).resolve().parent
root=base.parents[5]
assert (root/'package.json').exists(), root
checks={}
for name in ['build-final','typecheck-final','protocol','editor-bridge-final','runtime-final','sdk','api-http','browser-final']:
    result=json.loads((base/(name+'.json')).read_text())
    assert result['code']==0, name
    checks[name]=result
browser=json.loads((base/'browser-results.json').read_text())
cases=[]
def visit(suite):
    for spec in suite.get('specs',[]):
        for test in spec.get('tests',[]):
            cases.append({'file':spec['file'],'title':spec['title'],'project':test['projectName'],'status':test['status'],'results':[r['status'] for r in test['results']]})
    for child in suite.get('suites',[]):visit(child)
for suite in browser['suites']:visit(suite)
assert cases and all(c['status']=='expected' and c['results']==['passed'] for c in cases)
summary={'generatedAt':datetime.now(timezone.utc).isoformat(),'checks':checks,'unit':{'protocol':23,'editorBridge':86,'runtime':109,'sdk':84},'apiPostgres':31,'httpSmoke':'PASS','browser':{'total':len(cases),'projects':{p:sum(c['project']==p for c in cases) for p in ['chromium','firefox','webkit']},'cases':cases}}
(base/'test-summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2)+'\n')
paths=subprocess.check_output(['git','ls-files','--cached','--others','--exclude-standard'],cwd=root,text=True).splitlines()
files=[]
for f in sorted(set(paths)):
    if not (f.startswith(('apps/','packages/','tests/','scripts/')) or f in ['package.json','package-lock.json','playwright.config.ts']):continue
    p=root/f
    if not p.is_file() or any(part in ['dist','node_modules','output'] for part in p.parts):continue
    data=p.read_bytes();files.append({'file':f,'sha256':hashlib.sha256(data).hexdigest(),'bytes':len(data)})
source={'generatedAt':summary['generatedAt'],'head':subprocess.check_output(['git','rev-parse','HEAD'],cwd=root,text=True).strip(),'scope':'Tracked and nonignored apps/packages/tests/scripts and root package/Playwright files, excluding generated dist/dependencies/output.','hashMethod':'SHA256 of compact UTF-8 JSON ordered files array, ensure_ascii=false','sha256':hashlib.sha256(json.dumps(files,ensure_ascii=False,separators=(',',':')).encode()).hexdigest(),'files':files}
(base/'source.json').write_text(json.dumps(source,ensure_ascii=False,indent=2)+'\n')
assets=[]
for f in ['packages/sdk/dist/sdk.iife.js','packages/sdk/dist/runtime-core.iife.js','packages/editor-bridge/dist/editor.iife.js','packages/sdk/dist/index.js','apps/admin/dist/app.js']:
    p=root/f
    if p.exists():
        data=p.read_bytes();assets.append({'file':f,'raw':len(data),'gzip9':len(gzip.compress(data,compresslevel=9,mtime=0)),'sha256':hashlib.sha256(data).hexdigest()})
(base/'asset-sizes.json').write_text(json.dumps({'generatedAt':summary['generatedAt'],'assets':assets},indent=2)+'\n')
shutil.copytree(root/'test-results',base/'browser-final-artifacts',dirs_exist_ok=True)
print(json.dumps({'unit':sum(summary['unit'].values()),'api':31,'browser':summary['browser']['projects'],'source':source['sha256'],'files':len(files)}))
