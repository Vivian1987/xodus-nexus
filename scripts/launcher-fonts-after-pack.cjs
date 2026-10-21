const fs = require('node:fs/promises');
const path = require('node:path');
const { createHash } = require('node:crypto');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'linux') return;
  const root = context.appOutDir;
  if (context.packager?.executableName !== 'xodus-nexus') throw new Error('Unexpected Nexus Linux executable name.');
  const executable = path.join(root, 'xodus-nexus');
  const bootstrap = path.join(root, 'resources', 'font-bootstrap');
  for (const directory of [root, path.join(root, 'resources')]) {
    const stat = await fs.lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Nexus package directories must not be symbolic links.');
  }
  for (const file of [executable, path.join(root, 'chrome-sandbox')]) {
    const stat = await fs.lstat(file);
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) throw new Error('Sandbox package inputs must be regular, unlinked files.');
  }
  await fs.rename(executable, executable + '.bin');
  await fs.mkdir(bootstrap, { recursive: true });
  await fs.copyFile(path.join(__dirname, 'launcher-font-wrapper.sh'), executable);
  await fs.chmod(executable, 0o755);
  await fs.copyFile(path.join(__dirname, 'launcher-font-bootstrap.mjs'), path.join(bootstrap, 'bootstrap.mjs'));
  await fs.copyFile(path.join(__dirname, '..', 'dist-electron', 'main', 'launcher-fonts.js'), path.join(bootstrap, 'launcher-fonts.mjs'));
  // Record the exact native pair. Only the native DEB's fixed-path postinst
  // can grant root SUID permissions; this hook also runs for ordinary AppImages.
  const checksums = [];
  await fs.chmod(root, 0o755);
  await fs.chmod(path.join(root, 'resources'), 0o755);
  for (const name of ['xodus-nexus.bin', 'chrome-sandbox']) {
    const file = path.join(root, name);
    await fs.chmod(file, 0o755);
    checksums.push(`${createHash('sha256').update(await fs.readFile(file)).digest('hex')}  ${name}\n`);
  }
  await fs.writeFile(path.join(root, 'resources', 'xodus-nexus-sandbox.sha256'), checksums.join(''), { mode: 0o644, flag: 'wx' });
};
