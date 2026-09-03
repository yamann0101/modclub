import { spawn, spawnSync } from 'node:child_process';
import { existsSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const MIN_NODE = 20;
const ENV_PATH = '.env';
const ENV_EXAMPLE = `# MOD CLUB yerel ortam
PORT=5000
NODE_ENV=development
`;

function heading(title) {
  console.log('');
  console.log('========================================');
  console.log(`  ${title}`);
  console.log('========================================');
  console.log('');
}

function ok(message) {
  console.log(`  [OK]  ${message}`);
}

function fail(message) {
  console.error(`  [HATA] ${message}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    stdio: 'inherit',
    shell: true,
    ...options,
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} başarısız oldu`);
  }
}

function commandExists(command) {
  const probe = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(probe, [command], {
    stdio: 'ignore',
    shell: true,
  });
  return result.status === 0;
}

async function ask(question, fallback) {
  if (!process.stdin.isTTY) {
    return fallback;
  }

  const rl = createInterface({ input, output });
  try {
    const answer = (await rl.question(`${question} [${fallback}] `)).trim();
    return answer || fallback;
  } finally {
    rl.close();
  }
}

async function main() {
  heading('MOD CLUB Kurulum Sihirbazı');
  console.log('İndir, kur, kullan. Ek bir platform gerekmez.');
  console.log('Railway daha sonra GitHub deposundan çekebilir.');

  const nodeMajor = Number(process.versions.node.split('.')[0]);
  if (Number.isNaN(nodeMajor) || nodeMajor < MIN_NODE) {
    fail(`Node.js ${MIN_NODE}+ gerekli. Şu an: ${process.version}`);
    console.log('https://nodejs.org adresinden LTS sürümünü kur.');
    process.exit(1);
  }
  ok(`Node.js ${process.version}`);

  if (!commandExists('pnpm')) {
    console.log('pnpm bulunamadı, kuruluyor...');
    if (commandExists('corepack')) {
      run('corepack', ['enable']);
      run('corepack', ['prepare', 'pnpm@9.15.0', '--activate']);
    } else {
      run('npm', ['install', '-g', 'pnpm']);
    }
  }
  ok('pnpm hazır');

  heading('1 / 3  Paketler yükleniyor');
  run('pnpm', ['install']);
  ok('Bağımlılıklar kuruldu');

  heading('2 / 3  Ortam dosyası');
  if (!existsSync(ENV_PATH)) {
    writeFileSync(ENV_PATH, ENV_EXAMPLE, 'utf8');
    ok('.env oluşturuldu');
  } else {
    ok('.env zaten var, dokunulmadı');
  }

  heading('3 / 3  Yerel sunucu');
  const shouldStart = (await ask('Uygulamayı şimdi başlatayım mı? (e/h)', 'e'))
    .toLocaleLowerCase('tr-TR')
    .startsWith('e');

  if (!shouldStart) {
    console.log('');
    console.log('Kurulum tamam. Daha sonra şu komut yeterli:');
    console.log('  pnpm dev');
    console.log('');
    console.log('Tarayıcı: http://localhost:5173');
    console.log('İlk açılışta kurulum sihirbazı gelir.');
    return;
  }

  console.log('');
  console.log('MOD CLUB açılıyor: http://localhost:5173');
  console.log('İlk ziyarette kurulum sihirbazını tamamla.');
  console.log('Durdurmak için Ctrl+C');
  console.log('');

  const child = spawn('pnpm', ['dev'], {
    stdio: 'inherit',
    shell: true,
  });

  child.on('exit', (code) => {
    process.exit(code ?? 0);
  });
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
