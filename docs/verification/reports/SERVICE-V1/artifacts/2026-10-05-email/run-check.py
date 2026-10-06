from pathlib import Path
import subprocess, sys, os, re, json, datetime, time
base=Path(__file__).resolve().parent
root=base.parents[5]
assert (root/'package.json').exists()
name=sys.argv[1]; command=sys.argv[2:]
started=datetime.datetime.now(datetime.timezone.utc).isoformat(); start=time.monotonic()
env=os.environ.copy()
if name=='browser': env['PLAYWRIGHT_JSON_OUTPUT_FILE']=str(base/'browser-results.json')
result=subprocess.run(command,cwd=root,env=env,stdout=subprocess.PIPE,stderr=subprocess.STDOUT,text=True)
# Only safe evidence is retained. Provider test files/cookies/tokens are never copied.
output=re.sub(r'([?&](?:token|code)=)[^&\s"\\]+',r'\1[REDACTED]',result.stdout)
output=re.sub(r'/share/[A-Za-z0-9_-]{20,}', '/share/[REDACTED]',output)
(base/(name+'.log')).write_text(output)
metadata={'command':command,'startedAt':started,'durationSeconds':round(time.monotonic()-start,2),'exitCode':result.returncode}
(base/(name+'.json')).write_text(json.dumps(metadata,indent=2)+'\n')
print(json.dumps(metadata))
sys.exit(result.returncode)
