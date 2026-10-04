const { readdirSync } = require('node:fs');
const { join } = require('node:path');
const { execFileSync } = require('node:child_process');
function check(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (['node_modules', 'dist'].includes(entry.name)) continue;
    const file = join(directory, entry.name);
    if (entry.isDirectory()) check(file);
    else if (entry.name.endsWith('.js'))
      execFileSync(process.execPath, ['--check', file], { stdio: 'inherit', windowsHide: true });
  }
}
check(join(__dirname, '..'));
