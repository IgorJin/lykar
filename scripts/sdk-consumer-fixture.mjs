import {execFile} from 'node:child_process';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {promisify} from 'node:util';

const run = promisify(execFile);

export async function installSdkConsumer(repositoryDirectory, destination) {
  const packDirectory = join(destination, 'packs');
  const cacheDirectory = join(destination, 'npm-cache');
  await mkdir(packDirectory, {recursive: true});
  const environment = {
    ...process.env,
    npm_config_cache: cacheDirectory,
  };

  const packages = ['@lykar/sdk', '@lykar/runtime', '@lykar/protocol'];
  const packed = await Promise.all(packages.map(async workspace => {
    const result = await run(
      'npm',
      ['pack', '--workspace', workspace, '--pack-destination', packDirectory],
      {cwd: repositoryDirectory, env: environment},
    );
    const filename = result.stdout.trim().split('\n').at(-1);
    if (!filename) throw new Error('npm pack did not return a tarball for ' + workspace);
    return join(packDirectory, filename);
  }));

  await writeFile(join(destination, 'package.json'), JSON.stringify({
    name: 'lykar-sdk-consumer-fixture',
    private: true,
    type: 'module',
    dependencies: {
      '@lykar/sdk': 'file:' + packed[0],
      '@lykar/runtime': 'file:' + packed[1],
      '@lykar/protocol': 'file:' + packed[2],
    },
  }, null, 2));

  await run(
    'npm',
    ['install', '--offline', '--ignore-scripts', '--no-audit', '--no-fund'],
    {cwd: destination, env: environment},
  );

  return {
    directory: destination,
    sdkDirectory: join(destination, 'node_modules', '@lykar', 'sdk'),
    sdkDistDirectory: join(destination, 'node_modules', '@lykar', 'sdk', 'dist'),
  };
}
