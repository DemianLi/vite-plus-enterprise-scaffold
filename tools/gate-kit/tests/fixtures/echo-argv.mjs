// runCli 的探針：回報子行程看到的 cwd 與 argv。
process.stdout.write(JSON.stringify({ cwd: process.cwd(), argv: process.argv.slice(2) }));
