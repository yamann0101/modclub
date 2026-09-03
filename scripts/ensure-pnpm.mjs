const userAgent = process.env.npm_config_user_agent ?? '';

if (!userAgent.includes('pnpm')) {
  console.error('MOD CLUB pnpm ile kurulur.');
  console.error('Hızlı kurulum:  node setup.mjs');
  console.error('Elle kurulum:   npm i -g pnpm  &&  pnpm install');
  process.exit(1);
}
